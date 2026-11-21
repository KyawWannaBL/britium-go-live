-- Britium Express existing UAT branch only: protect legacy V36 SECURITY DEFINER RPCs.
-- Explicit auth.uid(), active staff registry, HQ Warehouse permission.
-- Branch-specific Warehouse workers must use branch-scoped RPCs; no cross-branch leak.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION private.be_uat_warehouse_require_access_v1(p_write boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_role text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'WAREHOUSE_AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.be_user_account_registry a
    WHERE a.auth_user_id=v_actor AND coalesce(a.active,true) AND coalesce(a.is_active,true)
      AND lower(coalesce(a.status,'active')) IN ('active','enabled')
  ) THEN RAISE EXCEPTION 'WAREHOUSE_ACTIVE_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
  v_role:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  IF v_role NOT IN ('superadmin','super_admin','app_owner','sys',
    'warehouse_lead','warehouse_staff','warehouse_manager',
    'operations_manager','operation_manager','ops_manager',
    'hq_warehouse','hq_operations') THEN
    RAISE EXCEPTION 'WAREHOUSE_ROLE_DENIED: %',v_role USING ERRCODE='42501';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION private.be_uat_warehouse_require_access_v1(boolean) FROM PUBLIC,anon,authenticated;
-- Harden be_warehouse_mark_scanned_ready_v36
CREATE OR REPLACE FUNCTION public.be_warehouse_mark_scanned_ready_v36(p_pickup_id text, p_staging_zone text DEFAULT 'READY_FOR_DISPATCH'::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor text := coalesce((SELECT email FROM auth.users WHERE id=auth.uid()),'authenticated-user');
  v_count integer := 0;
begin
  PERFORM private.be_uat_warehouse_require_access_v1(true);
  insert into public.be_warehouse_receipt_events_v36(
    pickup_id, parcel_sequence, delivery_way_id, action,
    previous_status, new_status, warehouse_code, staging_zone, actor_email
  )
  select
    r.pickup_id, r.parcel_sequence, r.delivery_way_id, 'BATCH_READY',
    r.warehouse_status, 'WAREHOUSE_READY', r.warehouse_code,
    coalesce(nullif(p_staging_zone, ''), r.staging_zone), v_actor
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id = p_pickup_id
    and r.warehouse_status = 'RECEIVED';

  update public.be_warehouse_receipts_v36
  set warehouse_status = 'WAREHOUSE_READY',
      parcel_condition = case when parcel_condition = 'UNINSPECTED' then 'GOOD' else parcel_condition end,
      staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'READY_FOR_DISPATCH'),
      ready_at = now(),
      ready_by = v_actor,
      updated_at = now()
  where pickup_id = p_pickup_id
    and warehouse_status = 'RECEIVED';

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'ready_count', v_count,
    'exceptions_left_on_hold', (
      select count(*)::integer from public.be_warehouse_receipts_v36
      where pickup_id = p_pickup_id and warehouse_status = 'WAREHOUSE_EXCEPTION'
    )
  );
end;
$function$
;

-- Harden be_warehouse_receipt_snapshot_v36
CREATE OR REPLACE FUNCTION public.be_warehouse_receipt_snapshot_v36(p_pickup_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pickup_id text;
  v_pickups jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_exceptions jsonb := '[]'::jsonb;
begin
  PERFORM private.be_uat_warehouse_require_access_v1(false);
  v_pickup_id := nullif(btrim(coalesce(p_pickup_id, '')), '');

  if v_pickup_id is null then
    select x.pickup_id
    into v_pickup_id
    from (
      select w.pickup_id, coalesce(w.updated_at, w.created_at) as activity_at
      from public.be_parcel_waybills w
      where exists (
        select 1 from public.be_data_entry_parcel_details d where d.pickup_id = w.pickup_id
      )
      union all
      select d.pickup_id, max(coalesce(d.updated_at, d.saved_at)) as activity_at
      from public.be_data_entry_parcel_details d
      group by d.pickup_id
    ) x
    order by x.activity_at desc nulls last
    limit 1;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.activity_at desc nulls last), '[]'::jsonb)
  into v_pickups
  from (
    select
      d.pickup_id,
      wb.waybill_no,
      count(*)::integer as expected_parcels,
      count(*) filter (where coalesce(r.warehouse_status, 'PENDING') <> 'PENDING')::integer as scanned_parcels,
      count(*) filter (where r.warehouse_status = 'WAREHOUSE_READY')::integer as ready_parcels,
      count(*) filter (where r.warehouse_status = 'WAREHOUSE_EXCEPTION')::integer as exception_parcels,
      max(coalesce(wb.updated_at, wb.created_at, d.updated_at, d.saved_at)) as activity_at,
      max(coalesce(wb.created_at, d.saved_at)) as created_at
    from public.be_data_entry_parcel_details d
    left join public.be_warehouse_receipts_v36 r
      on r.pickup_id = d.pickup_id and r.parcel_sequence = d.parcel_sequence
    left join lateral (
      select w.waybill_no, w.created_at, w.updated_at
      from public.be_parcel_waybills w
      where w.pickup_id = d.pickup_id
      order by w.updated_at desc nulls last, w.created_at desc nulls last
      limit 1
    ) wb on true
    group by d.pickup_id, wb.waybill_no
  ) p;

  if v_pickup_id is not null then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.parcel_sequence), '[]'::jsonb)
    into v_rows
    from public.be_v_warehouse_receipt_v36 v
    where v.pickup_id = v_pickup_id;

    select jsonb_build_object(
      'expected', count(*)::integer,
      'scanned', count(*) filter (where v.warehouse_status <> 'PENDING')::integer,
      'ready', count(*) filter (where v.warehouse_status = 'WAREHOUSE_READY')::integer,
      'exceptions', count(*) filter (where v.warehouse_status = 'WAREHOUSE_EXCEPTION')::integer,
      'remaining', count(*) filter (where v.warehouse_status = 'PENDING')::integer,
      'label_qa_passed', count(*) filter (where v.label_scan_passed)::integer,
      'label_qa_pending', count(*) filter (where v.warehouse_status <> 'PENDING' and not v.label_scan_passed)::integer,
      'total_collect', coalesce(sum(v.actual_collect), 0)
    )
    into v_stats
    from public.be_v_warehouse_receipt_v36 v
    where v.pickup_id = v_pickup_id;
  else
    v_stats := jsonb_build_object(
      'expected', 0, 'scanned', 0, 'ready', 0, 'exceptions', 0,
      'remaining', 0, 'label_qa_passed', 0, 'label_qa_pending', 0,
      'total_collect', 0
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', e.code,
    'label', e.label,
    'condition', e.parcel_condition
  ) order by e.code), '[]'::jsonb)
  into v_exceptions
  from public.be_warehouse_exception_codes_v36 e
  where e.active;

  return jsonb_build_object(
    'build', 'WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30',
    'selected_pickup_id', v_pickup_id,
    'pickups', v_pickups,
    'stats', coalesce(v_stats, '{}'::jsonb),
    'rows', v_rows,
    'exceptions', v_exceptions
  );
end;
$function$
;

-- Harden be_warehouse_receive_batch_v36
CREATE OR REPLACE FUNCTION public.be_warehouse_receive_batch_v36(p_pickup_id text, p_way_ids text[], p_warehouse_code text DEFAULT 'YGN-MAIN'::text, p_staging_zone text DEFAULT 'INTAKE'::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_way_id text;
  v_accepted integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  PERFORM private.be_uat_warehouse_require_access_v1(true);
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    raise exception 'At least one Way ID is required';
  end if;

  foreach v_way_id in array p_way_ids loop
    begin
      v_results := v_results || jsonb_build_array(
        public.be_warehouse_receive_scan_v36(
          p_pickup_id,
          v_way_id,
          'RECEIVE',
          'GOOD',
          null,
          null,
          null,
          p_warehouse_code,
          p_staging_zone,
          p_actor_email
        )
      );
      v_accepted := v_accepted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'way_id', v_way_id,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'accepted', v_accepted,
    'failed', v_failed,
    'results', v_results
  );
end;
$function$
;

-- Harden be_warehouse_receive_scan_v36
CREATE OR REPLACE FUNCTION public.be_warehouse_receive_scan_v36(p_pickup_id text, p_way_id text, p_action text DEFAULT 'RECEIVE'::text, p_condition text DEFAULT 'GOOD'::text, p_exception_code text DEFAULT NULL::text, p_remark text DEFAULT NULL::text, p_actual_weight_kg numeric DEFAULT NULL::numeric, p_warehouse_code text DEFAULT 'YGN-MAIN'::text, p_staging_zone text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_pickup_id, '')), '');
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_action text := upper(nullif(btrim(coalesce(p_action, '')), ''));
  v_actor text := coalesce((SELECT email FROM auth.users WHERE id=auth.uid()),'authenticated-user');
  v_sequence integer;
  v_declared numeric := 0;
  v_previous text;
  v_new text;
  v_exception text := nullif(btrim(coalesce(p_exception_code, '')), '');
  v_condition text := upper(coalesce(nullif(btrim(coalesce(p_condition, '')), ''), 'GOOD'));
  v_result jsonb;
begin
  PERFORM private.be_uat_warehouse_require_access_v1(true);
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_way_id is null then raise exception 'parcel Way ID is required'; end if;

  select d.parcel_sequence, coalesce(d.weight_kg, 0)
  into v_sequence, v_declared
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id
    and d.delivery_way_id = v_way_id
  order by d.parcel_sequence
  limit 1;

  if v_sequence is null then
    raise exception 'Way ID % does not belong to pickup %', v_way_id, v_pickup_id;
  end if;

  insert into public.be_warehouse_receipts_v36(
    pickup_id, parcel_sequence, delivery_way_id, warehouse_status,
    parcel_condition, warehouse_code, staging_zone, declared_weight_kg,
    created_at, updated_at
  ) values (
    v_pickup_id, v_sequence, v_way_id, 'PENDING',
    'UNINSPECTED', nullif(p_warehouse_code, ''), nullif(p_staging_zone, ''), v_declared,
    now(), now()
  )
  on conflict (pickup_id, parcel_sequence) do nothing;

  select warehouse_status into v_previous
  from public.be_warehouse_receipts_v36
  where pickup_id = v_pickup_id and parcel_sequence = v_sequence
  for update;

  if v_action = 'RECEIVE' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'RECEIVED',
        parcel_condition = coalesce(nullif(v_condition, ''), 'GOOD'),
        discrepancy_code = null,
        discrepancy_remark = null,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'INTAKE'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'READY' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_READY',
        parcel_condition = 'GOOD',
        discrepancy_code = null,
        discrepancy_remark = null,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'READY_FOR_DISPATCH'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        ready_at = now(),
        ready_by = v_actor,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'EXCEPTION' then
    if v_exception is null then raise exception 'exception code is required'; end if;
    if not exists (select 1 from public.be_warehouse_exception_codes_v36 where code = v_exception and active) then
      raise exception 'Unknown warehouse exception code: %', v_exception;
    end if;
    if nullif(btrim(coalesce(p_remark, '')), '') is null then
      raise exception 'Warehouse exception remark is required';
    end if;

    select parcel_condition into v_condition
    from public.be_warehouse_exception_codes_v36 where code = v_exception;

    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_EXCEPTION',
        parcel_condition = coalesce(v_condition, 'HOLD'),
        discrepancy_code = v_exception,
        discrepancy_remark = p_remark,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), 'QUARANTINE'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        ready_at = null,
        ready_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'LABEL_PASS' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = case when warehouse_status = 'PENDING' then 'RECEIVED' else warehouse_status end,
        parcel_condition = case when parcel_condition = 'UNINSPECTED' then 'GOOD' else parcel_condition end,
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        label_scan_attempts = coalesce(label_scan_attempts, 0) + 1,
        label_scan_passed = true,
        qa_approved_at = now(),
        qa_approved_by = v_actor,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'LABEL_FAIL' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_EXCEPTION',
        parcel_condition = 'UNSCANNABLE',
        discrepancy_code = 'UNSCANNABLE_LABEL',
        discrepancy_remark = coalesce(nullif(p_remark, ''), 'Physical QR / barcode scan failed'),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        label_scan_attempts = coalesce(label_scan_attempts, 0) + 1,
        label_scan_passed = false,
        qa_approved_at = null,
        qa_approved_by = null,
        staging_zone = 'QUARANTINE',
        ready_at = null,
        ready_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'RESET' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'PENDING',
        parcel_condition = 'UNINSPECTED',
        discrepancy_code = null,
        discrepancy_remark = null,
        actual_weight_kg = null,
        scanned_at = null,
        scanned_by = null,
        ready_at = null,
        ready_by = null,
        label_scan_attempts = 0,
        label_scan_passed = false,
        qa_approved_at = null,
        qa_approved_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;
  else
    raise exception 'Unsupported warehouse action: %', v_action;
  end if;

  select warehouse_status into v_new
  from public.be_warehouse_receipts_v36
  where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  insert into public.be_warehouse_receipt_events_v36(
    pickup_id, parcel_sequence, delivery_way_id, action,
    previous_status, new_status, exception_code, remark,
    warehouse_code, staging_zone, actor_email
  ) values (
    v_pickup_id, v_sequence, v_way_id, v_action,
    v_previous, v_new, v_exception, p_remark,
    p_warehouse_code, p_staging_zone, v_actor
  );

  select to_jsonb(v) into v_result
  from public.be_v_warehouse_receipt_v36 v
  where v.pickup_id = v_pickup_id and v.parcel_sequence = v_sequence;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'way_id', v_way_id,
    'status', v_new,
    'row', v_result
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_warehouse_receipt_snapshot_v36(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.be_warehouse_receive_batch_v36(text,text[],text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.be_warehouse_mark_scanned_ready_v36(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_receipt_snapshot_v36(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_receive_batch_v36(text,text[],text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_mark_scanned_ready_v36(text,text,text) TO authenticated;
DO $test$
DECLARE msg text;
BEGIN
  IF has_function_privilege('anon','public.be_warehouse_receipt_snapshot_v36(text)','EXECUTE')
    OR has_function_privilege('anon','public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'WAREHOUSE_ANON_EXECUTE_NOT_REVOKED'; END IF;
  BEGIN
    PERFORM public.be_warehouse_receipt_snapshot_v36(NULL);
    RAISE EXCEPTION 'WAREHOUSE_SNAPSHOT_UNAUTHORIZED_SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
    IF msg<>'WAREHOUSE_AUTH_REQUIRED' THEN RAISE EXCEPTION 'WAREHOUSE_SNAPSHOT_AUTH_TEST_FAILED %',msg; END IF;
  END;
  BEGIN
    PERFORM public.be_warehouse_mark_scanned_ready_v36('NO_PICKUP',NULL,NULL);
    RAISE EXCEPTION 'WAREHOUSE_READY_UNAUTHORIZED_SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
    IF msg<>'WAREHOUSE_AUTH_REQUIRED' THEN RAISE EXCEPTION 'WAREHOUSE_READY_AUTH_TEST_FAILED %',msg; END IF;
  END;
END $test$;
COMMIT;
