-- Avoid full-wallet rebuild in COD settlement review trigger. Scope updates to confirmed Way ID.
-- Database-tested production definition captured after deployment.
CREATE OR REPLACE FUNCTION public.be_sync_finance_cod_settled_downstream_v192()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_way text := upper(btrim(coalesce(new.delivery_way_id,'')));
  v_merchant text;
  v_merchant_name text;
  v_amount numeric := 0;
  v_provider text;
  v_wallet_id uuid;
  v_result jsonb;
begin
  if upper(coalesce(new.settlement_status,'')) <> 'SETTLED' then
    return new;
  end if;

  -- Reconciliation updates unchanged settled rows; do not recursively re-run downstream sync.
  if TG_OP='UPDATE' and OLD.settlement_status is not distinct from NEW.settlement_status
    and OLD.settled_amount is not distinct from NEW.settled_amount
    and OLD.expected_cod is not distinct from NEW.expected_cod
    and OLD.reported_collected is not distinct from NEW.reported_collected
    and OLD.settlement_reference is not distinct from NEW.settlement_reference
    and OLD.settled_at is not distinct from NEW.settled_at then return NEW; end if;
  -- Keep live Data Entry record aligned with authoritative Finance V48 settlement.
  update public.be_data_entry_parcel_details d
  set finance_status='COD_SETTLED',updated_at=now()
  where upper(d.delivery_way_id)=v_way and upper(d.parcel_status) in ('DELIVERED','COMPLETED')
    and d.finance_status is distinct from 'COD_SETTLED';

  -- Refresh wallet account masters/provider positions first.
  -- Global wallet refresh intentionally removed; scoped sync follows.

  select
    d.merchant_id,
    coalesce(p.merchant_name,d.merchant_id),
    coalesce(d.merchant_final_settlement_amount,0)::numeric,
    nullif(d.financial_quote->>'service_provider_code','')
  into
    v_merchant,v_merchant_name,v_amount,v_provider
  from public.be_data_entry_parcel_details d
  left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
  where upper(d.delivery_way_id)=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  -- Finance V213 timeout remediation: synchronize only the affected Way ID.
  -- Do not rebuild all 100+ wallets and all ledger rows inside a payment transaction.
  if v_merchant is not null then
    insert into public.be_party_wallet_accounts
      (party_type,party_key,party_name,metadata,updated_at)
    values ('MERCHANT',v_merchant,coalesce(v_merchant_name,v_merchant),
      jsonb_build_object('source','FINANCE_COD_SCOPED_V214'),now())
    on conflict (party_type,party_key) do update
      set party_name=excluded.party_name,updated_at=now();

    insert into public.be_party_wallet_ledger
      (wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at)
    select w.id,'MERCHANT_SETTLEMENT',q.parcel_id::text,q.created_at::date,
      case when coalesce(q.merchant_final_settlement_amount,0)>=0
        then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
      abs(coalesce(q.merchant_final_settlement_amount,0)),
      case when q.financial_settled_at is not null then 'SETTLED'
        else upper(coalesce(q.settlement_state,'PENDING')) end,
      'Merchant parcel settlement '||q.delivery_way_id,to_jsonb(q),now()
    from public.be_v_finance_merchant_settlement_queue_v2 q
    join public.be_party_wallet_accounts w
      on w.party_type='MERCHANT' and w.party_key=q.merchant_id
    where upper(q.delivery_way_id)=v_way
      and upper(coalesce(q.status,''))='DELIVERED'
      and q.validation_status='OK'
      and not exists (
        select 1 from public.be_finance_settlement_batch_items_v3 i
        where i.parcel_id=q.parcel_id and i.active
      )
    on conflict (wallet_id,source_type,source_key,direction) do update
      set amount=excluded.amount,status=excluded.status,
        metadata=excluded.metadata,updated_at=now()
    where public.be_party_wallet_ledger.status not in ('SETTLED','PAID');
  end if;

  -- Ensure the selected provider account and payable exist even if a master refresh
  -- has not run yet. Never mark an already-paid liability payable again.
  if v_provider is not null and upper(v_provider)<>'BRITIUM' then
    insert into public.be_party_wallet_accounts
      (party_type,party_key,party_name,metadata,updated_at)
    select case when provider_code='DK DELIVERY' then 'DK'
      when provider_code='ROYAL EXPRESS' then 'ROYAL'
      when provider_code='NPT BRANCH' then 'NPT'
      when provider_type='OUTSOURCE' then 'ALLIED_COMPANY'
      else 'SERVICE_PROVIDER' end,
      provider_code,display_name,
      jsonb_build_object('provider_type',provider_type,'source','be_data_entry_service_providers'),now()
    from public.be_data_entry_service_providers
    where provider_code=v_provider and is_active
    on conflict (party_type,party_key) do update
      set party_name=excluded.party_name,metadata=excluded.metadata,updated_at=now();

    insert into public.be_party_wallet_ledger
      (wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at)
    select w.id,'SERVICE_PROVIDER_PAYABLE',d.delivery_way_id,
      coalesce(d.saved_at,d.created_at)::date,'BRITIUM_OWES_PARTY',
      greatest(
        coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
        -coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
      ),'PENDING','Provider payable for '||d.delivery_way_id,
      jsonb_build_object('service_provider_code',v_provider,
        'calculation_version',d.financial_quote->>'calculation_version',
        'financial_quote',d.financial_quote),now()
    from public.be_data_entry_parcel_details d
    join public.be_party_wallet_accounts w on w.party_key=v_provider
      and w.party_type in ('DK','ROYAL','NPT','ALLIED_COMPANY','SERVICE_PROVIDER')
    where upper(d.delivery_way_id)=v_way
      and greatest(
        coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
        -coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
      )>0
    on conflict (wallet_id,source_type,source_key,direction) do update
      set amount=excluded.amount,metadata=excluded.metadata,updated_at=now()
    where public.be_party_wallet_ledger.status not in ('SETTLED','PAID');
  end if;

  -- The canonical queue/batch ledger owns merchant balances; retire the duplicate legacy entry.
  update public.be_party_wallet_ledger set amount=0,status='VOID',updated_at=now()
  where source_type='MERCHANT_SETTLEMENT_LIVE' and upper(source_key)=v_way;

  -- Provider payable also becomes ready for payout, never auto-paid.
  update public.be_party_wallet_ledger l
  set status='READY_FOR_PAYOUT',
      metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
        'cod_finance_settled',true,
        'cod_settlement_reference',new.settlement_reference,
        'cod_settled_at',new.settled_at,
        'policy_version','FINANCE_DOWNSTREAM_V192'
      ),
      updated_at=now()
  where l.source_type='SERVICE_PROVIDER_PAYABLE'
    and upper(l.source_key)=v_way
    and upper(coalesce(l.status,'')) not in ('SETTLED','PAID');

  -- Refresh balances for only the affected parties. The ledger remains authoritative.
  update public.be_party_wallet_accounts a
  set britium_owes=coalesce(x.britium_owes,0),
    owes_britium=coalesce(x.owes_britium,0),
    net_position=coalesce(x.britium_owes,0)-coalesce(x.owes_britium,0),
    updated_at=now()
  from (
    select w.id as wallet_id,
      sum(l.amount) filter (where l.direction='BRITIUM_OWES_PARTY'
        and upper(l.status) not in ('SETTLED','PAID','VOID')) britium_owes,
      sum(l.amount) filter (where l.direction='PARTY_OWES_BRITIUM'
        and upper(l.status) not in ('SETTLED','PAID','VOID')) owes_britium
    from public.be_party_wallet_accounts w
    left join public.be_party_wallet_ledger l on l.wallet_id=w.id
    where (w.party_type='MERCHANT' and w.party_key=v_merchant)
       or (w.party_key=v_provider and w.party_type in
          ('DK','ROYAL','NPT','ALLIED_COMPANY','SERVICE_PROVIDER'))
    group by w.id
  ) x
  where a.id=x.wallet_id;

  -- Keep reporting/notifications/CS synchronized after Finance confirmation.
  perform public.be_accounting_sync_cod_v1(
    coalesce(new.settled_at,new.updated_at,now())::date,
    coalesce(new.settled_at,new.updated_at,now())::date
  );
  -- Finance settlement synchronizes only the settled Way ID.
  -- Broad wayplan updates re-enter the historical write guard for unrelated
  -- records and have timed out, rolling back otherwise valid COD confirmation.
  perform public.be_cs_closure_sync_one_v1(new.delivery_way_id);

  -- Wallets were refreshed above before the scoped READY_FOR_PAYOUT update.
  -- Avoid the duplicate full-wallet rebuild: it resets the provider status
  -- to PENDING and causes a redundant second update.

  update public.be_app_notifications
  set status='RESOLVED',
      is_read=true,
      read_at=coalesce(read_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'finance_cod_settled',true,
        'finance_cod_settlement_reference',new.settlement_reference,
        'resolved_at',now()
      )
  where upper(coalesce(metadata->>'delivery_way_id',entity_id,source_key,''))=v_way
    and upper(coalesce(notification_type,event_type,'')) in ('COD_HANDOVER','COD_SETTLEMENT_REQUIRED');

  return new;
exception
  when others then
    update public.be_finance_cod_settlements_v48
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'downstream_sync_ok',false,
      'downstream_sync_error',sqlerrm,
      'downstream_sync_failed_at',now(),
      'downstream_sync_build','FINANCE_DOWNSTREAM_V192'
    )
    where delivery_way_id=new.delivery_way_id;
    return new;
end;
$function$
