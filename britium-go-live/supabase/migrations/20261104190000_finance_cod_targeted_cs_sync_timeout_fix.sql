-- Finance COD confirmation timeout remediation, 2026-11-04.
-- Preserve finance V48 settlement and wallet/accounting/CS integrations.
-- Narrow only the Customer Service sync to the settled Way ID.
-- Existing be_cs_closure_sync_v49(text) stays unchanged for batch reconciliation.
-- The global historical-data protection trigger remains installed and enforced.

CREATE OR REPLACE FUNCTION public.be_cs_closure_sync_one_v1(p_delivery_way_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text;
  v_way text := upper(nullif(btrim(coalesce(p_delivery_way_id, '')), ''));
  v_count integer := 0;
begin
  if v_way is null then raise exception 'Delivery Way ID required'; end if;
  -- Finance V48 was just settled by the caller. Do not regenerate this
  -- source or resync unrelated wayplans inside the settlement transaction.
  select f.wayplan_id into v_wayplan
    from public.be_finance_cod_settlements_v48 f
    where upper(f.delivery_way_id)=v_way;
  if v_wayplan is null then
    raise exception 'Finance settlement wayplan missing for %',v_way;
  end if;

  with source as (
    select
      s.delivery_way_id,
      s.wayplan_id,
      m.pickup_id,
      coalesce(f.recipient_name, s.recipient_name) as recipient_name,
      coalesce(f.recipient_phone, s.recipient_phone) as recipient_phone,
      coalesce(f.township, s.township) as township,
      s.stop_status as delivery_status,
      s.result_at as delivered_at,
      coalesce(f.expected_cod, 0)::numeric as expected_cod,
      coalesce(f.settlement_status,
        case when s.stop_status = 'DELIVERED' then 'NOT_SYNCED' else 'NOT_REQUIRED' end
      ) as finance_status,
      coalesce(f.proof_status,
        case
          when coalesce(s.result_payload ? 'signature', false)
            or coalesce(s.result_payload ? 'photo', false)
            or coalesce(s.result_payload ? 'otp', false)
            or nullif(s.result_payload ->> 'proof_reference', '') is not null
            or nullif(s.result_payload ->> 'proof_url', '') is not null
          then 'AVAILABLE'
          else 'MISSING'
        end
      ) as proof_status,
      s.result_payload
    from public.be_rider_route_stop_state_v46 s
    join public.be_wayplan_membership_v40 m
      on m.wayplan_id = s.wayplan_id
     and m.delivery_way_id = s.delivery_way_id
    left join public.be_finance_cod_settlements_v48 f
      on f.delivery_way_id = s.delivery_way_id
    where s.stop_status in ('DELIVERED','FAILED','RTO','CANCELLED')
      and s.wayplan_id=v_wayplan
      and upper(s.delivery_way_id)=v_way
  )
  insert into public.be_cs_closure_v49 (
    delivery_way_id, wayplan_id, pickup_id,
    recipient_name, recipient_phone, township,
    delivery_status, delivered_at, expected_cod,
    finance_status, proof_status, workflow_status,
    outcome_message, metadata, updated_at
  )
  select
    delivery_way_id, wayplan_id, pickup_id,
    recipient_name, recipient_phone, township,
    delivery_status, delivered_at, expected_cod,
    finance_status, proof_status,
    case
      when delivery_status <> 'DELIVERED' then 'READY_TO_CONTACT'
      when expected_cod <= 0 or finance_status in ('SETTLED','NOT_REQUIRED') then 'READY_TO_CONTACT'
      when finance_status = 'ON_HOLD' then 'FINANCE_HOLD'
      else 'WAITING_FINANCE'
    end,
    public.be_cs_default_outcome_message_v49(delivery_status),
    jsonb_build_object(
      'source', 'RIDER_V46_FINANCE_V48',
      'rider_result_payload', result_payload,
      'build', 'CUSTOMER_SERVICE_CLOSURE_SINGLE_WAY_V1_2026_11_04'
    ),
    now()
  from source
  on conflict (delivery_way_id) do update set
    wayplan_id = excluded.wayplan_id,
    pickup_id = coalesce(excluded.pickup_id, public.be_cs_closure_v49.pickup_id),
    recipient_name = coalesce(excluded.recipient_name, public.be_cs_closure_v49.recipient_name),
    recipient_phone = coalesce(excluded.recipient_phone, public.be_cs_closure_v49.recipient_phone),
    township = coalesce(excluded.township, public.be_cs_closure_v49.township),
    delivery_status = excluded.delivery_status,
    delivered_at = coalesce(excluded.delivered_at, public.be_cs_closure_v49.delivered_at),
    expected_cod = excluded.expected_cod,
    finance_status = excluded.finance_status,
    proof_status = excluded.proof_status,
    workflow_status = case
      when public.be_cs_closure_v49.workflow_status in ('CLOSED','ESCALATED')
        then public.be_cs_closure_v49.workflow_status
      when public.be_cs_closure_v49.contacted_at is not null
       and (
         excluded.delivery_status <> 'DELIVERED'
         or excluded.expected_cod <= 0
         or excluded.finance_status in ('SETTLED','NOT_REQUIRED')
       ) then 'CONTACTED'
      else excluded.workflow_status
    end,
    outcome_message = coalesce(public.be_cs_closure_v49.outcome_message, excluded.outcome_message),
    metadata = coalesce(public.be_cs_closure_v49.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'synced_rows', v_count,
    'workflow', 'FINAL DELIVERY OUTCOME -> FINANCE CLEARANCE -> CUSTOMER CONTACT -> CLOSE/ESCALATE',
    'build', 'CUSTOMER_SERVICE_CLOSURE_SINGLE_WAY_V1_2026_11_04'
  );
end;
$function$


revoke all on function public.be_cs_closure_sync_one_v1(text) from public,anon,authenticated;

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
  v_result := public.be_refresh_party_wallets_v1();

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
    and upper(l.source_key)=v_way;

  -- Keep reporting/notifications/CS synchronized after Finance confirmation.
  perform public.be_accounting_sync_cod_v1(
    coalesce(new.settled_at,new.updated_at,now())::date,
    coalesce(new.settled_at,new.updated_at,now())::date
  );
  -- Finance settlement synchronizes only the settled Way ID.
  -- Broad wayplan updates re-enter the historical write guard for unrelated
  -- records and have timed out, rolling back otherwise valid COD confirmation.
  perform public.be_cs_closure_sync_one_v1(new.delivery_way_id);
  perform public.be_refresh_party_wallets_v1();

  -- Re-assert READY_FOR_PAYOUT after generic wallet refresh, which currently
  -- rebuilds provider rows as PENDING.
  update public.be_party_wallet_ledger l
  set status='READY_FOR_PAYOUT',
      updated_at=now()
  where (
      (l.source_type='SERVICE_PROVIDER_PAYABLE' and upper(l.source_key)=v_way)

    );

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


-- Verify that settlement callback no longer calls broad CS synchronization.
do $verify$
declare v text;
begin
  select pg_get_functiondef(p.oid) into v
  from pg_proc p where p.oid='public.be_sync_finance_cod_settled_downstream_v192()'::regprocedure;
  if v not like '%be_cs_closure_sync_one_v1(new.delivery_way_id)%'
     or v like '%perform public.be_cs_closure_sync_v49(new.wayplan_id)%' then
    raise exception 'TARGETED_CS_SYNC_NOT_INSTALLED';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname='aaa_oct2026_guard'
      and tgrelid='public.be_cs_closure_v49'::regclass
      and not tgisinternal
  ) then
    raise exception 'HISTORICAL_GUARD_MUST_REMAIN_ENFORCED';
  end if;
end $verify$;
