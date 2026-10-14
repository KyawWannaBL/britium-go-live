-- Release candidate only: review all call paths and test before migration to production.
CREATE OR REPLACE FUNCTION public.be_record_delivery_failure_v39(p_way_id text, p_reason text, p_actor_email text DEFAULT NULL::text, p_operation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Delivery attempt failed');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_operation text;
  v_pickup_id text;
  v_attempt integer := 0;
  v_limit integer := 3;
  v_status text;
  v_legacy_ok boolean := false;
  v_legacy_message text := null;
  v_updated integer := 0;
  v_category text := 'INVALID_REASON';
begin
  if v_way_id is null then
    raise exception 'Way ID is required';
  end if;

  select d.pickup_id
  into v_pickup_id
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then
    raise exception 'Way ID % was not found', v_way_id;
  end if;

  select failure_category into v_category from public.be_delivery_failure_reasons
  where reason_code = upper(v_reason) limit 1;
  v_category := coalesce(v_category, case
    when upper(v_reason) in ('PHONE_UNREACHABLE','CUSTOMER_NOT_AVAILABLE') then 'VALID_REASON'
    else 'INVALID_REASON' end);
  -- Direct RTO cannot use the legacy failed-delivery writer without evidence.
  if v_category = 'DIRECT_RTO' then
    raise exception 'DIRECT_RTO_REQUIRES_EVIDENCE_REVIEW';
  end if;
  -- Three valid, distinct delivery cycles are required for normal RTO.
  v_limit := 3;

  v_operation := coalesce(
    nullif(btrim(coalesce(p_operation_id, '')), ''),
    encode(digest(v_way_id || '|' || v_actor || '|' || v_reason || '|' || date_trunc('minute', now())::text, 'sha256'), 'hex')
  );

  if exists (
    select 1 from public.be_delivery_attempt_events_v39 e
    where e.operation_id = v_operation
  ) then
    select consecutive_failures, last_status
    into v_attempt, v_status
    from public.be_delivery_attempt_state_v39
    where delivery_way_id = v_way_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate_operation', true,
      'operation_id', v_operation,
      'way_id', v_way_id,
      'attempt_count', coalesce(v_attempt, 0),
      'status', coalesce(v_status, 'ATTEMPTED_FAILED'),
      'rto', coalesce(v_status, '') = 'RTO'
    );
  end if;

  insert into public.be_delivery_attempt_state_v39(
    delivery_way_id, pickup_id, consecutive_failures, last_status,
    last_failure_reason, last_failure_at, updated_at
  ) values (
    v_way_id, v_pickup_id, 0, 'PENDING', v_reason, now(), now()
  ) on conflict (delivery_way_id) do nothing;

  select consecutive_failures, last_status
  into v_attempt, v_status
  from public.be_delivery_attempt_state_v39
  where delivery_way_id = v_way_id
  for update;

  -- Recheck after the row lock: concurrent/double submissions must not count
  -- as another attempt. A fresh dispatch scan opens the next delivery cycle.
  if exists(select 1 from public.be_delivery_attempt_events_v39 e where e.operation_id=v_operation)
     or v_status='RTO'
     or (v_status='ATTEMPTED_FAILED' and exists(
       select 1 from public.be_dispatch_scans_v39 s
       where s.delivery_way_id=v_way_id and s.scan_status='REVERSED'
     )) then
    return jsonb_build_object(
      'ok',true,'duplicate_operation',true,'operation_id',v_operation,
      'way_id',v_way_id,'attempt_count',coalesce(v_attempt,0),
      'attempt_limit',3,'status',v_status,'rto',v_status='RTO',
      'return_scan_required',true
    );
  end if;

  v_attempt := coalesce(v_attempt, 0) + case when v_category = 'VALID_REASON' then 1 else 0 end;
  v_status := case when v_attempt >= 3 then 'RTO' when v_category = 'INVALID_REASON' then 'INVALID_FAILED' else 'ATTEMPTED_FAILED' end;

  update public.be_delivery_attempt_state_v39
  set pickup_id = v_pickup_id,
      consecutive_failures = v_attempt,
      last_status = v_status,
      last_failure_reason = v_reason,
      last_failure_at = now(),
      rto_at = case when v_status='RTO' then coalesce(rto_at,now()) else null end,
      updated_at = now()
  where delivery_way_id = v_way_id;

  insert into public.be_delivery_attempt_events_v39(
    operation_id, delivery_way_id, pickup_id, attempt_number,
    result_status, reason, actor_email
  ) values (
    v_operation, v_way_id, v_pickup_id, v_attempt,
    v_status, v_reason, v_actor
  );


  -- The legacy driver-status wrapper now routes back into the canonical V39
  -- status writer. Calling it here would record the same failure twice.
  v_legacy_ok := false;
  v_legacy_message := 'Legacy status callback intentionally bypassed; canonical V39 lifecycle is authoritative';

  if to_regclass('public.be_portal_pickup_request_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'waybill_no'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'item_status'
     ) then
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'delivery_attempts'
      ) then
        execute 'update public.be_portal_pickup_request_items set item_status = $1, delivery_attempts = $2 where waybill_no = $3'
        using case when v_status = 'RTO' then 'RETURN_TO_SENDER' else 'DELIVERY_FAILED' end, v_attempt, v_way_id;
      else
        execute 'update public.be_portal_pickup_request_items set item_status = $1 where waybill_no = $2'
        using case when v_status = 'RTO' then 'RETURN_TO_SENDER' else 'DELIVERY_FAILED' end, v_way_id;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Every failed delivery returns to a controlled warehouse state. A fresh
  -- dispatch scan is therefore mandatory before any later delivery attempt.
  update public.be_dispatch_scans_v39
  set scan_status = 'REVERSED', updated_at = now()
  where delivery_way_id = v_way_id;

  insert into public.be_dispatch_scan_events_v39(
    delivery_way_id, pickup_id, wayplan_code, action, actor_email
  ) values (
    v_way_id, v_pickup_id, null, 'DELIVERY_FAILURE_REQUIRES_RESCAN', v_actor
  );

  if v_status = 'RTO' then
    insert into public.be_operational_alerts_v39(
      alert_key, alert_type, severity, pickup_id, delivery_way_id,
      title, message, target_role, alert_status, metadata
    ) values (
      'DELIVERY_RTO:' || v_way_id,
      'DELIVERY_RTO',
      'HIGH',
      v_pickup_id,
      v_way_id,
      'Parcel moved to RTO',
      format('Parcel %s reached %s consecutive failed delivery attempts and is now RTO.', v_way_id, v_attempt),
      'operation_supervisor',
      'OPEN',
      jsonb_build_object('way_id', v_way_id, 'pickup_id', v_pickup_id, 'attempt_count', v_attempt, 'reason', v_reason)
    ) on conflict (alert_key) do update
    set alert_status = 'OPEN',
        message = excluded.message,
        last_detected_at = now(),
        resolved_at = null,
        metadata = excluded.metadata;

    perform public.be_emit_notification_v39(
      'DELIVERY_RTO:' || v_way_id,
      'delivery_rto',
      'operation_supervisor',
      v_pickup_id,
      'Parcel moved to RTO',
      format('Parcel %s reached %s consecutive failed delivery attempts and is now RTO.', v_way_id, v_attempt),
      jsonb_build_object('way_id', v_way_id, 'pickup_id', v_pickup_id, 'attempt_count', v_attempt, 'reason', v_reason)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation,
    'way_id', v_way_id,
    'pickup_id', v_pickup_id,
    'attempt_count', v_attempt,
    'attempt_limit', v_limit,
    'failure_category', v_category,
    'status', v_status,
    'rto', v_status = 'RTO',
    'return_scan_required', true,
    'legacy_status_updated', v_legacy_ok,
    'legacy_message', v_legacy_message
  );
end;
$function$

