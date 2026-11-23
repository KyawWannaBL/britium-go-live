-- Applied to Britium Express Production through Supabase migration
-- 20261116154736 fix_rider_delivery_timeout_defer_finance_cod_v219.
-- Rider confirmation remains atomic for proof, GPS, COD, delivery state.
-- Synchronous Customer Service projection no longer re-runs Finance V48.
-- The existing 1-minute database scheduler performs Finance V48, accounting,
-- wallet refresh, and then reprojects CS closure from reconciled finance.
-- Preserve all current authorization, financial calculations and audit rules.
CREATE OR REPLACE FUNCTION public.be_cs_closure_sync_v49(p_wayplan_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
begin
  -- Delivery path: finance reconciles via existing pg_cron outbox worker.
  -- Do not resync the entire wayplan's finance within a rider transaction.
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
      and (v_wayplan is null or s.wayplan_id = v_wayplan)
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
      'build', 'CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30'
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
    'build', 'CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_delivery_finance_outbox_process_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_job record;
  v_done integer := 0;
  v_failed integer := 0;
  v_error text;
begin
  if auth.uid() is not null or session_user <> 'postgres' then
    raise exception 'DATABASE_SCHEDULER_ONLY' using errcode='42501';
  end if;
  for v_job in
    select delivery_way_id,wayplan_id,business_date,attempts
    from public.be_delivery_finance_outbox_v1
    where status='PENDING' and next_attempt_at<=now()
    order by next_attempt_at,queued_at
    for update skip locked limit 1
  loop
    begin
      perform public.be_finance_cod_sync_v48(v_job.wayplan_id);
      -- Once finance has been reconciled, refresh the CS closure projection.
      perform public.be_cs_closure_sync_v49(v_job.wayplan_id);
      perform public.be_accounting_sync_cod_v1(v_job.business_date,v_job.business_date);
      perform public.be_refresh_party_wallets_v1();
      update public.be_delivery_finance_outbox_v1
      set status='COMPLETE',attempts=attempts+1,processed_at=now(),
          last_error=null,updated_at=now()
      where delivery_way_id=v_job.delivery_way_id;
      v_done:=v_done+1;
    exception
      when others then
        v_error:=left(sqlerrm,900);
        update public.be_delivery_finance_outbox_v1
        set attempts=attempts+1,
            status=case when attempts+1>=3 then 'FAILED' else 'PENDING' end,
            next_attempt_at=now()+make_interval(mins=>case attempts when 0 then 2 when 1 then 10 else 30 end),
            last_error=v_error,updated_at=now()
        where delivery_way_id=v_job.delivery_way_id;
        v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('processed',v_done,'failed_attempts',v_failed);
end;
$function$;
