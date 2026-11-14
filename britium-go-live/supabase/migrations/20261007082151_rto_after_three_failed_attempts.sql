-- RTO requires three failed delivery cycles. Warehouse returns are retryable before then.
-- Preserve existing function privileges and authenticated role checks.

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

  -- Business policy: exactly three distinct failed delivery cycles.
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

  v_attempt := coalesce(v_attempt, 0) + 1;
  v_status := case when v_attempt >= 3 then 'RTO' else 'ATTEMPTED_FAILED' end;

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
    'status', v_status,
    'rto', v_status = 'RTO',
    'return_scan_required', true,
    'legacy_status_updated', v_legacy_ok,
    'legacy_message', v_legacy_message
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_sync_rider_delivery_compat_v77()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text:=upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_public_status text;
begin
  v_public_status:=case
    when v_status in ('DELIVERED','COMPLETED') then 'DELIVERED'
    when v_status='ARRIVED_AT_CUSTOMER' then 'ARRIVED_AT_CUSTOMER'
    when v_status='OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
    when v_status in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED') then 'ATTEMPTED_FAILED'
    when v_status='RTO' then 'RTO'
    when v_status='RETURN_TO_WAREHOUSE' then
      case when exists(
        select 1 from public.be_delivery_attempt_state_v39 a
        where upper(a.delivery_way_id)=upper(new.delivery_way_id)
          and a.consecutive_failures >= 3 and a.last_status='RTO'
      ) then 'RTO'
      when upper(coalesce(new.dispatch_status,''))='RETURN_SCANNED' then 'RETURN_SCANNED'
      else 'ATTEMPTED_FAILED' end
    else v_status
  end;

  update public.be_dispatch_job_assignments
  set delivery_status=v_public_status,
      dispatch_status=v_public_status,
      failed_reason=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,failed_reason)
        else failed_reason
      end,
      exception_status=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then v_public_status
        when v_public_status='DELIVERED' then null
        else exception_status
      end,
      last_exception_reason=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,last_exception_reason)
        else last_exception_reason
      end,
      updated_at=now()
  where (upper(tracking_no)=upper(new.delivery_way_id))
     or (wayplan_code=new.wayplan_id and upper(tracking_no)=upper(coalesce(new.tracking_no,new.delivery_way_id)));

  update public.be_wayplan_items
  set delivery_status=v_public_status,
      dispatch_status=v_public_status,
      item_status=v_public_status,
      delivered_at=case when v_public_status='DELIVERED' then coalesce(delivered_at,new.delivered_at,now()) else delivered_at end,
      failed_reason=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,failed_reason) else failed_reason end,
      exception_status=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then v_public_status when v_public_status='DELIVERED' then null else exception_status end,
      last_exception_reason=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,last_exception_reason) else last_exception_reason end,
      proof_photo_url=coalesce(new.proof_url,new.rider_proof_url,proof_photo_url),
      delivery_proof_photo_url=coalesce(new.rider_proof_url,new.proof_url,delivery_proof_photo_url),
      receiver_name=coalesce(new.receiver_name,receiver_name),
      receiver_phone=coalesce(new.receiver_phone,receiver_phone),
      updated_at=now()
  where (upper(coalesce(delivery_way_id,''))=upper(new.delivery_way_id))
     or (new.wayplan_id=coalesce(wayplan_id,wayplan_code)
         and upper(coalesce(tracking_no,''))=upper(coalesce(new.tracking_no,new.delivery_way_id)));

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_rider_prepare_route_v77(p_wayplan_id text, p_worker_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_worker text:=upper(btrim(coalesce(p_worker_key,'')));
  v_operator jsonb;
  v_version integer;
  v_current integer;
  v_existing_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_wayplan is null then raise exception 'WAYPLAN_REQUIRED' using errcode='22023'; end if;

  v_operator:=public.be_rider_route_operator_v46(v_wayplan,v_worker);
  if not coalesce((v_operator->>'ok')::boolean,false) then
    raise exception 'ROUTE_NOT_ASSIGNED_TO_SIGNED_IN_WORKER: %',v_worker using errcode='42501';
  end if;

  if not exists(
    select 1 from public.be_wayplan_membership_v40 m
    where m.wayplan_id=v_wayplan and m.membership_status in ('DISPATCHED','COMPLETED','RTO')
  ) and not exists(
    select 1 from public.be_wayplan_dispatches w
    where w.wayplan_id=v_wayplan
      and upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY')
  ) then
    raise exception 'WAYPLAN_NOT_DISPATCHED_TO_FIELD: %',v_wayplan using errcode='22023';
  end if;

  select max(route_version) into v_version
  from public.be_wayplan_route_version_stops_v1
  where wayplan_id=v_wayplan;

  if v_version is null then
    raise exception 'WAYPLAN_STOP_COORDINATES_REQUIRED: no versioned stops for %',v_wayplan using errcode='22023';
  end if;

  select run_status into v_existing_status
  from public.be_rider_route_runs_v46
  where wayplan_id=v_wayplan;

  insert into public.be_rider_route_runs_v46(
    wayplan_id,run_status,route_version,
    assigned_rider_code,assigned_rider_name,
    assigned_driver_code,assigned_driver_name,metadata
  )
  values(
    v_wayplan,coalesce(v_existing_status,'ASSIGNED'),v_version,
    v_operator->>'rider_code',v_operator->>'rider_name',
    v_operator->>'driver_code',v_operator->>'driver_name',
    jsonb_build_object('source','be_wayplan_route_version_stops_v1','build','RIDER_ROUTE_PREPARE_V77_1')
  )
  on conflict(wayplan_id) do update set
    route_version=excluded.route_version,
    assigned_rider_code=excluded.assigned_rider_code,
    assigned_rider_name=excluded.assigned_rider_name,
    assigned_driver_code=excluded.assigned_driver_code,
    assigned_driver_name=excluded.assigned_driver_name,
    metadata=coalesce(public.be_rider_route_runs_v46.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  insert into public.be_rider_route_stop_state_v46(
    wayplan_id,delivery_way_id,stop_sequence,stop_status,
    recipient_name,recipient_phone,address,township,longitude,latitude
  )
  select
    rv.wayplan_id,rv.delivery_way_id,rv.stop_sequence,
    case
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='RTO' then 'RTO'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='RETURN_TO_WAREHOUSE' then
        case when exists(
          select 1 from public.be_delivery_attempt_state_v39 a
          where upper(a.delivery_way_id)=upper(s.delivery_way_id)
            and a.consecutive_failures >= 3 and a.last_status='RTO'
        ) then 'RTO' else 'FAILED' end
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED') then 'FAILED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER' then 'ARRIVED'
      else 'PENDING'
    end,
    coalesce(s.recipient_name,d.recipient_name),
    coalesce(s.recipient_phone,d.contact_no_1),
    coalesce(s.address,d.recipient_address,loc.address_original),
    coalesce(s.township,d.township,loc.township),
    coalesce(rv.longitude,loc.longitude),
    coalesce(rv.latitude,loc.latitude)
  from public.be_wayplan_route_version_stops_v1 rv
  join public.be_wayplan_dispatch_stops s
    on s.wayplan_id=rv.wayplan_id and s.delivery_way_id=rv.delivery_way_id
  left join lateral(
    select dd.* from public.be_data_entry_parcel_details dd
    where dd.delivery_way_id=rv.delivery_way_id
    order by dd.updated_at desc nulls last,dd.saved_at desc nulls last limit 1
  ) d on true
  left join public.be_delivery_location_registry loc on loc.delivery_way_id=rv.delivery_way_id
  where rv.wayplan_id=v_wayplan and rv.route_version=v_version
  on conflict(wayplan_id,delivery_way_id) do update set
    stop_sequence=excluded.stop_sequence,
    recipient_name=excluded.recipient_name,
    recipient_phone=excluded.recipient_phone,
    address=excluded.address,
    township=excluded.township,
    longitude=coalesce(excluded.longitude,public.be_rider_route_stop_state_v46.longitude),
    latitude=coalesce(excluded.latitude,public.be_rider_route_stop_state_v46.latitude),
    stop_status=case
      when public.be_rider_route_stop_state_v46.stop_status in ('DELIVERED','FAILED','RTO','ARRIVED')
        then public.be_rider_route_stop_state_v46.stop_status
      else excluded.stop_status
    end,
    updated_at=now();

  -- V174: do not block the entire dispatched Wayplan just because another
  -- pending stop is still missing destination coordinates. Each stop is
  -- validated when the rider reaches that stop; stops with valid coordinates
  -- may continue normally. Missing stops can be corrected with the existing
  -- authenticated drop-off pin workflow.

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id=v_wayplan and stop_status in ('PENDING','ARRIVED');

  update public.be_rider_route_runs_v46
  set current_stop_sequence=v_current,updated_at=now()
  where wayplan_id=v_wayplan;

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan,'route_version',v_version,
    'current_stop_sequence',v_current,'operator',v_operator,
    'source','be_wayplan_route_version_stops_v1','build','RIDER_ROUTE_PREPARE_V77_1'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_warehouse_return_scan(p_tracking_no text, p_reason_code text, p_actor_email text DEFAULT NULL::text, p_remark text DEFAULT NULL::text, p_warehouse_code text DEFAULT 'YGN-MAIN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text;
  v_actor text;
  v_way text := nullif(upper(btrim(coalesce(p_tracking_no,''))),'');
  v_failure_count integer := 0;
  v_physical_attempt integer := 0;
  v_status text;
  v_failure_reason text;
  v_reason_code text;
  v_reason_name text;
  v_pickup text;
  v_scan_at timestamptz := now();
  v_result jsonb;
  v_rto boolean := false;
begin
  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_way is null then
    raise exception 'Delivery Way ID is required';
  end if;

  select d.pickup_id into v_pickup
  from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  if v_pickup is null then
    raise exception 'Delivery Way ID % was not found',v_way;
  end if;

  select coalesce(s.consecutive_failures,0),
         upper(coalesce(s.last_status,'')),
         nullif(btrim(coalesce(s.last_failure_reason,'')),'')
    into v_failure_count,v_status,v_failure_reason
  from public.be_delivery_attempt_state_v39 s
  where upper(s.delivery_way_id)=v_way
  for update;

  if coalesce(v_status,'') not in ('ATTEMPTED_FAILED','RTO') or v_failure_count < 1 then
    raise exception 'Delivery failure must be recorded before Warehouse return scan for %',v_way;
  end if;

  select coalesce(max(r.attempt_number),0)+1
    into v_physical_attempt
  from public.be_warehouse_return_scans_v39 r
  where upper(r.delivery_way_id)=v_way;

  -- A repeated physical scan cannot create a new failed delivery attempt.
  if v_physical_attempt > v_failure_count then
    return jsonb_build_object(
      'ok',true,'tracking_no',v_way,'duplicate_return_scan',true,
      'attempt_count',v_physical_attempt-1,
      'physical_return_scan_number',v_physical_attempt-1,
      'delivery_failure_count',v_failure_count,
      'delivery_attempt_status',v_status,'rto',v_status='RTO'
    );
  end if;
  if v_physical_attempt > 3 then
    raise exception 'All three Warehouse return scans are already recorded for %',v_way;
  end if;

  v_rto := v_failure_count >= 3;

  select upper(r.exception_code),
         coalesce(nullif(r.exception_name_mm,''),nullif(r.exception_name_en,''),r.exception_code)
    into v_reason_code,v_reason_name
  from public.be_exception_rules r
  where upper(coalesce(r.exception_code,''))=upper(coalesce(v_failure_reason,''))
    and coalesce(r.active,true)
    and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE')
  order by case when upper(coalesce(r.process_type,''))='DELIVERY' then 0 else 1 end
  limit 1;

  if v_reason_code is null then
    v_reason_code := coalesce(nullif(upper(btrim(coalesce(p_reason_code,''))),''),'OTHER_MANUAL');
    v_reason_name := coalesce(v_failure_reason,'Delivery attempt failed');
  end if;

  update public.be_delivery_attempt_state_v39
  set last_status = case when v_rto then 'RTO' else 'ATTEMPTED_FAILED' end,
      rto_at = case when v_rto then coalesce(rto_at,v_scan_at) else null end,
      updated_at = now()
  where upper(delivery_way_id)=v_way;

  if v_rto then
    perform public.be_sync_field_failure_departments_v91(
      v_way,v_pickup,v_physical_attempt,'RTO',v_reason_code,v_actor
    );
  end if;

  v_result := public.be_warehouse_return_scan_v39_legacy_20260823(
    v_way,
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
    case when v_rto then 'RTO' else 'FAILED_RETURN' end
  );

  insert into public.be_warehouse_return_scans_v39(
    delivery_way_id,pickup_id,attempt_number,reason_code,reason_name,
    remark,actor_email,warehouse_code,scanned_at,created_at,updated_at
  ) values (
    v_way,v_pickup,v_physical_attempt,
    v_reason_code,
    v_reason_name,
    coalesce(nullif(btrim(coalesce(p_remark,'')),''),
             format('Physical Warehouse Return Scan %s of 3 after failed delivery',v_physical_attempt)),
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
    v_scan_at,now(),now()
  );

  update public.be_wayplan_items i
     set return_scan_1_at = case when v_physical_attempt=1 then coalesce(i.return_scan_1_at,v_scan_at) else i.return_scan_1_at end,
         return_scan_1_by = case when v_physical_attempt=1 then v_actor else i.return_scan_1_by end,
         return_reason_1 = case when v_physical_attempt=1 then v_reason_code else i.return_reason_1 end,
         return_scan_2_at = case when v_physical_attempt=2 then coalesce(i.return_scan_2_at,v_scan_at) else i.return_scan_2_at end,
         return_scan_2_by = case when v_physical_attempt=2 then v_actor else i.return_scan_2_by end,
         return_reason_2 = case when v_physical_attempt=2 then v_reason_code else i.return_reason_2 end,
         return_scan_3_at = case when v_physical_attempt=3 then coalesce(i.return_scan_3_at,v_scan_at) else i.return_scan_3_at end,
         return_scan_3_by = case when v_physical_attempt=3 then v_actor else i.return_scan_3_by end,
         return_reason_3 = case when v_physical_attempt=3 then v_reason_code else i.return_reason_3 end,
         return_attempt_count = v_physical_attempt,
         next_attempt_priority = not v_rto,
         rto_at = case when v_rto then coalesce(i.rto_at,v_scan_at) else null end,
         rto_reason = case when v_rto then coalesce(v_reason_name,i.rto_reason) else null end,
         warehouse_scan_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason_code,
         last_exception_reason=v_reason_name,
         updated_at=now()
   where upper(coalesce(i.tracking_no,i.delivery_way_id,''))=v_way;

  update public.be_dispatch_job_assignments a
     set return_attempt_count=v_physical_attempt,
         next_attempt_priority=not v_rto,
         rto_at=case when v_rto then coalesce(a.rto_at,v_scan_at) else null end,
         exception_status=case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason_code,
         last_exception_reason=v_reason_name,
         updated_by_email=v_actor,
         updated_at=now()
   where upper(a.tracking_no)=v_way;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'tracking_no',v_way,
    'attempt_count',v_physical_attempt,
    'physical_return_scan_number',v_physical_attempt,
    'delivery_failure_count',v_failure_count,
    'delivery_attempt_status',case when v_rto then 'RTO' else 'ATTEMPTED_FAILED' end,
    'reason_code',v_reason_code,
    'reason_name',v_reason_name,
    'reason_source','DELIVERY_ATTEMPT_STATE',
    'return_scan_at',v_scan_at,
    'receipt_method','RETURN_SCAN',
    'next_attempt_priority',not v_rto,
    'rto',v_rto,
    'actor_email',v_actor,
    'authorized_role',v_role,
    'build','WAREHOUSE_RETURN_PHYSICAL_SCAN_RTO_ON_THIRD_V167'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.be_sync_return_scan_retry_v168()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rto boolean := exists(
    select 1 from public.be_delivery_attempt_state_v39 a
    where upper(a.delivery_way_id)=upper(new.delivery_way_id)
      and a.consecutive_failures >= 3
  );
begin
  update public.be_data_entry_parcel_details
  set return_scanned_at = coalesce(return_scanned_at,new.scanned_at),
      warehouse_status = case when v_rto then 'RTO' else 'WAREHOUSE_READY' end,
      way_management_status = case when v_rto then 'RTO' else 'READY_FOR_WAYPLAN' end,
      parcel_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
      updated_at = now()
  where upper(delivery_way_id)=upper(new.delivery_way_id);

  update public.be_warehouse_receipts_v36
  set warehouse_status = case when v_rto then 'WAREHOUSE_EXCEPTION' else 'WAREHOUSE_READY' end,
      staging_zone = case when v_rto then 'RTO' else 'READY_FOR_DISPATCH' end,
      ready_at = case when v_rto then ready_at else coalesce(ready_at,now()) end,
      updated_at = now()
  where upper(delivery_way_id)=upper(new.delivery_way_id);

  update public.be_wayplan_membership_v40
  set membership_status = case when v_rto then 'RTO' else 'COMPLETED' end,
      updated_at = now(),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'return_scan_number',new.attempt_number,
        'return_scanned_at',new.scanned_at,
        'retry_released',not v_rto,
        'rto_after_third_return_scan',v_rto,
        'build','RETURN_RETRY_V168'
      )
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED');

  update public.be_wayplan_dispatch_stops
  set stop_status = case when v_rto then 'RETURN_TO_WAREHOUSE' else 'RETURN_TO_WAREHOUSE' end,
      rider_status = case when v_rto then 'RTO' else 'RETURN_TO_WAREHOUSE' end,
      dispatch_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
      warehouse_status = case when v_rto then 'RTO' else 'WAREHOUSE_READY' end,
      warehouse_action = case when v_rto then 'RTO_COMPLETE' else 'READY_FOR_REATTEMPT' end,
      warehouse_exception_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
      updated_at = now(),
      warehouse_metadata = coalesce(warehouse_metadata,'{}'::jsonb) || jsonb_build_object(
        'return_scan_number',new.attempt_number,
        'return_scanned_at',new.scanned_at,
        'ready_for_reattempt',not v_rto,
        'rto',v_rto,
        'build','RETURN_RETRY_V168'
      )
  where upper(delivery_way_id)=upper(new.delivery_way_id);

  update public.be_waybill_ledger
  set dispatch_status = case when v_rto then 'RTO' else 'READY_FOR_DISPATCH' end,
      wayplan_status = case when v_rto then 'RTO' else 'READY_FOR_WAYPLAN' end,
      rider_status = case when v_rto then 'RTO' else 'RETURN_TO_WAREHOUSE' end,
      warehouse_status = case when v_rto then 'RTO' else 'WAREHOUSE_READY' end,
      updated_at = now(),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'return_scan_number',new.attempt_number,
        'return_scanned_at',new.scanned_at,
        'ready_for_reattempt',not v_rto,
        'rto',v_rto,
        'build','RETURN_RETRY_V168'
      )
  where upper(coalesce(delivery_way_id,tracking_no,''))=upper(new.delivery_way_id);

  update public.be_warehouse_exceptions
  set exception_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
      priority = case when v_rto then 'HIGH' else 'MEDIUM' end,
      updated_at = now(),
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'return_scan_number',new.attempt_number,
        'return_scanned_at',new.scanned_at,
        'is_rto',v_rto,
        'ready_for_reattempt',not v_rto,
        'build','RETURN_RETRY_V168'
      )
  where upper(delivery_way_id)=upper(new.delivery_way_id)
    and upper(coalesce(exception_status,'')) not in ('RESOLVED','CLOSED');

  return new;
end
$function$;

-- Repair only the proven compatibility-mapping error: a failed parcel with
-- fewer than three failures, returned to Warehouse, but a compatibility row
-- marked RTO. Preserve the prior status in dispatch-stop audit metadata.
create temporary table be_rto_retry_repair_v199 on commit drop as
select distinct s.delivery_way_id
from public.be_wayplan_dispatch_stops s
join public.be_delivery_attempt_state_v39 a using(delivery_way_id)
where s.stop_status='RETURN_TO_WAREHOUSE'
  and a.consecutive_failures between 1 and 2
  and a.last_status='ATTEMPTED_FAILED'
  and (select count(*) from public.be_warehouse_return_scans_v39 r
       where r.delivery_way_id=s.delivery_way_id) < 3
  and (exists(select 1 from public.be_dispatch_job_assignments j
              where j.tracking_no=s.delivery_way_id and j.delivery_status='RTO')
       or exists(select 1 from public.be_wayplan_items i
                 where coalesce(i.delivery_way_id,i.tracking_no)=s.delivery_way_id
                   and i.delivery_status='RTO'));

update public.be_wayplan_dispatch_stops s
set stop_status=s.stop_status, -- fire the UPDATE OF compatibility trigger
    metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
      'rto_retry_repair_v199',jsonb_build_object(
        'reason','RETURN_TO_WAREHOUSE_INCORRECTLY_MAPPED_TO_RTO',
        'previous_compatibility_status','RTO','repaired_at',now()
      )),
    updated_at=now()
where s.delivery_way_id in(select delivery_way_id from be_rto_retry_repair_v199)
  and s.stop_status='RETURN_TO_WAREHOUSE';

update public.be_dispatch_job_assignments
set rto_at=null,updated_at=now()
where tracking_no in(select delivery_way_id from be_rto_retry_repair_v199);

update public.be_wayplan_items
set rto_at=null,rto_reason=null,next_attempt_priority=true,updated_at=now()
where coalesce(delivery_way_id,tracking_no) in(select delivery_way_id from be_rto_retry_repair_v199);

update public.be_rider_route_stop_state_v46
set stop_status='FAILED',updated_at=now(),
    result_payload=coalesce(result_payload,'{}'::jsonb)||jsonb_build_object(
      'rto_retry_repair_v199',true,'repaired_at',now()
    )
where delivery_way_id in(select delivery_way_id from be_rto_retry_repair_v199)
  and stop_status='RTO';
