-- Production catalog-verified legacy dispatch scanner. Disposable CI baseline only.
CREATE OR REPLACE FUNCTION public.be_dispatch_scan_parcel_v39_legacy_20260823(p_way_id text, p_wayplan_code text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_pickup_id text;
  v_sequence integer;
  v_status text;
  v_exception text;
  v_updated integer := 0;
begin
  if v_way_id is null then
    raise exception 'Parcel Way ID is required for dispatch scan';
  end if;

  select d.pickup_id, d.parcel_sequence
  into v_pickup_id, v_sequence
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then
    raise exception 'Way ID % was not found in canonical Data Entry rows', v_way_id;
  end if;

  select r.warehouse_status, r.discrepancy_code
  into v_status, v_exception
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id = v_pickup_id
    and r.parcel_sequence = v_sequence;

  if coalesce(v_status, 'PENDING') <> 'WAREHOUSE_READY' then
    raise exception 'Way ID % is not WAREHOUSE_READY. Complete or policy-skip receiving first.', v_way_id;
  end if;
  if v_exception is not null then
    raise exception 'Way ID % remains on warehouse hold: %', v_way_id, v_exception;
  end if;
  if exists (
    select 1 from public.be_delivery_attempt_state_v39 a
    where a.delivery_way_id = v_way_id and a.last_status = 'RTO'
  ) then
    raise exception 'Way ID % is RTO and cannot be released to dispatch', v_way_id;
  end if;

  update public.be_dispatch_scans_v39
  set pickup_id = v_pickup_id,
      parcel_sequence = v_sequence,
      wayplan_code = nullif(btrim(coalesce(p_wayplan_code, '')), ''),
      scan_status = 'SCANNED',
      scanned_at = now(),
      scanned_by = v_actor,
      updated_at = now()
  where delivery_way_id = v_way_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.be_dispatch_scans_v39(
      delivery_way_id, pickup_id, parcel_sequence, wayplan_code,
      scan_status, scanned_at, scanned_by, created_at, updated_at
    ) values (
      v_way_id, v_pickup_id, v_sequence, nullif(btrim(coalesce(p_wayplan_code, '')), ''),
      'SCANNED', now(), v_actor, now(), now()
    );
  end if;

  insert into public.be_dispatch_scan_events_v39(
    delivery_way_id, pickup_id, parcel_sequence, wayplan_code, action, actor_email
  ) values (
    v_way_id, v_pickup_id, v_sequence, nullif(btrim(coalesce(p_wayplan_code, '')), ''), 'DISPATCH_SCAN', v_actor
  );

  update public.be_operational_alerts_v39
  set alert_status = 'RESOLVED', resolved_at = now(), last_detected_at = now()
  where alert_key = 'WAREHOUSE_DWELL:' || v_way_id
    and alert_status <> 'RESOLVED';

  return jsonb_build_object(
    'ok', true,
    'way_id', v_way_id,
    'pickup_id', v_pickup_id,
    'parcel_sequence', v_sequence,
    'wayplan_code', nullif(btrim(coalesce(p_wayplan_code, '')), ''),
    'dispatch_scanned', true,
    'scanned_at', now(),
    'scanned_by', v_actor
  );
end;
$function$
;
