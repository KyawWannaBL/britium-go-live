-- Non-destructive wallet reconciliation: void orphaned pending commission
-- liabilities left by old rebuilds. Settled rows remain untouched; prior
-- amounts are retained in metadata for finance audit.
begin;
CREATE OR REPLACE FUNCTION public.be_refresh_party_wallets_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rows integer:=0;
begin
  -- Workforce + marketing accounts from commission events.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select distinct
    case when role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else role_code end,
    lower(assignee_email),
    max(assignee_name) over(partition by role_code,lower(assignee_email)),
    jsonb_build_object('source','be_commission_events'),now()
  from public.be_commission_events
  where nullif(assignee_email,'') is not null
    and role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,updated_at=now();

  -- Merchant accounts.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select 'MERCHANT',coalesce(nullif(merchant_code,''),id::text),
         coalesce(nullif(merchant_name,''),nullif(name,''),nullif(business_name,''),merchant_code),
         jsonb_build_object('source','merchants'),now()
  from public.merchants
  where coalesce(is_active,true)
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,updated_at=now();

  -- Provider/allied-company accounts from service provider master.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select
    case
      when provider_code='DK DELIVERY' then 'DK'
      when provider_code='ROYAL EXPRESS' then 'ROYAL'
      when provider_code='NPT BRANCH' then 'NPT'
      when provider_type='OUTSOURCE' then 'ALLIED_COMPANY'
      else 'SERVICE_PROVIDER'
    end,
    provider_code,display_name,
    jsonb_build_object('provider_type',provider_type,'source','be_data_entry_service_providers'),now()
  from public.be_data_entry_service_providers
  where is_active
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,metadata=excluded.metadata,updated_at=now();

  -- Commission liabilities: Britium owes the worker/marketing supporter.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'COMMISSION',e.id::text,e.work_date,'BRITIUM_OWES_PARTY',e.commission_mmk,
    case when upper(coalesce(e.event_status,'')) in ('PAID','SETTLED') then 'SETTLED' else 'PENDING' end,
    e.operation_type||' commission',
    jsonb_build_object(
      'role_code',e.role_code,'operation_type',e.operation_type,'unit_count',e.unit_count,
      'rate_mmk',e.rate_mmk,'tracking_no',e.tracking_no,'pickup_id',e.pickup_id,
      'merchant_id',e.merchant_id,'policy_version','COMMISSION_2026_09_30'
    ),now()
  from public.be_commission_events e
  join public.be_party_wallet_accounts w
    on w.party_type=(case when e.role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else e.role_code end)
   and w.party_key=lower(e.assignee_email)
  where e.role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
    and e.commission_mmk>=0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  -- A legacy commission event rebuild can replace a READY event with a
  -- fresh UUID, leaving its old pending wallet liability behind. Preserve
  -- the audit record but remove its duplicated outstanding amount.
  update public.be_party_wallet_ledger l
    set metadata=coalesce(l.metadata,'{}'::jsonb)
                   || jsonb_build_object(
                        'void_reason','ORPHANED_COMMISSION_EVENT',
                        'original_amount_mmk',l.amount,
                        'voided_at',now()
                      ),
        status='VOID',amount=0,updated_at=now()
  where l.source_type='COMMISSION'
    and upper(coalesce(l.status,'')) not in ('SETTLED','VOID')
    and not exists (
      select 1 from public.be_commission_events e
      where e.id::text=l.source_key
    );

  -- Merchant settlement positions from the finance settlement queue.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'MERCHANT_SETTLEMENT',q.parcel_id::text,q.created_at::date,
    case when coalesce(q.merchant_final_settlement_amount,0)>=0 then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
    abs(coalesce(q.merchant_final_settlement_amount,0)),
    case when q.financial_settled_at is not null then 'SETTLED' else upper(coalesce(q.settlement_state,'PENDING')) end,
    'Merchant parcel settlement '||q.delivery_way_id,
    to_jsonb(q),now()
  from public.be_v_finance_merchant_settlement_queue_v2 q
  join public.be_party_wallet_accounts w
    on w.party_type='MERCHANT' and w.party_key=q.merchant_id
  left join public.be_finance_settlement_batch_items_v3 i on i.parcel_id=q.parcel_id and i.active
  left join public.be_finance_settlement_batches_v3 b on b.id=i.batch_id
  where upper(coalesce(q.status,''))='DELIVERED' and q.validation_status='OK'
    and not exists(select 1 from public.be_finance_settlement_batch_items_v3 active_item where active_item.parcel_id=q.parcel_id and active_item.active)
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  -- Remove pending positions that do not represent delivered/validated parcels.
  -- Retain their audit snapshots rather than deleting rows.
  update public.be_party_wallet_ledger l set status='VOID',amount=0,updated_at=now()
  where l.source_type='MERCHANT_SETTLEMENT' and upper(l.status)<>'SETTLED'
    and not exists(select 1 from public.be_v_finance_merchant_settlement_queue_v2 q
      where q.parcel_id::text=l.source_key and upper(q.status)='DELIVERED' and q.validation_status='OK'
        and not exists(select 1 from public.be_finance_settlement_batch_items_v3 i where i.parcel_id=q.parcel_id and i.active));

  -- One batch position uses the adjusted net amount, including mixed collection types.
  insert into public.be_party_wallet_ledger(wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at)
  select w.id,'MERCHANT_SETTLEMENT','BATCH:'||b.id,b.created_at::date,
    case when b.batch_net_payable>=0 then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
    case when b.status in ('PAID','CANCELLED','REJECTED') then 0
      when b.batch_net_payable>=0 then greatest(b.outstanding_amount,0) else abs(b.batch_net_payable) end,
    case when b.status='PAID' then 'SETTLED' when b.status in ('CANCELLED','REJECTED') then 'VOID' else 'PENDING' end,
    'Merchant settlement batch '||b.batch_number,to_jsonb(b),now()
  from public.be_finance_settlement_batches_v3 b join public.be_party_wallet_accounts w
    on w.party_type='MERCHANT' and w.party_key=b.merchant_id
  on conflict(wallet_id,source_type,source_key,direction) do update
    set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  update public.be_party_wallet_ledger set amount=0,status='VOID',updated_at=now()
  where source_type='MERCHANT_SETTLEMENT_LIVE';

  -- Explicit partner payable where the financial quote exposes a partner share.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'SERVICE_PROVIDER_PAYABLE',d.delivery_way_id,
    coalesce(d.saved_at,d.created_at)::date,'BRITIUM_OWES_PARTY',
    greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    ),
    'PENDING',
    'Provider payable for '||d.delivery_way_id,
    jsonb_build_object(
      'service_provider_code',d.financial_quote->>'service_provider_code',
      'calculation_version',d.financial_quote->>'calculation_version',
      'financial_quote',d.financial_quote
    ),now()
  from public.be_data_entry_parcel_details d
  join public.be_party_wallet_accounts w
    on w.party_key=(d.financial_quote->>'service_provider_code')
   and w.party_type in ('DK','ROYAL','NPT','ALLIED_COMPANY','SERVICE_PROVIDER')
  where nullif(d.financial_quote->>'service_provider_code','') is not null
    and (d.financial_quote->>'service_provider_code')<>'BRITIUM'
    and greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    )>0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  update public.be_party_wallet_accounts a
  set britium_owes=coalesce(x.britium_owes,0),
      owes_britium=coalesce(x.owes_britium,0),
      net_position=coalesce(x.britium_owes,0)-coalesce(x.owes_britium,0),
      updated_at=now()
  from (
    select wallet_id,
      sum(amount) filter(where direction='BRITIUM_OWES_PARTY' and upper(status)<>'SETTLED') britium_owes,
      sum(amount) filter(where direction='PARTY_OWES_BRITIUM' and upper(status)<>'SETTLED') owes_britium
    from public.be_party_wallet_ledger
    group by wallet_id
  ) x
  where x.wallet_id=a.id;

  update public.be_party_wallet_accounts a
  set britium_owes=0,owes_britium=0,net_position=0,updated_at=now()
  where not exists(select 1 from public.be_party_wallet_ledger l where l.wallet_id=a.id);

  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'accounts_refreshed',(select count(*) from public.be_party_wallet_accounts),
    'ledger_rows',(select count(*) from public.be_party_wallet_ledger),'policy_version','COMMISSION_2026_09_30');
end;
$function$;

select public.be_refresh_party_wallets_v1();
commit;
