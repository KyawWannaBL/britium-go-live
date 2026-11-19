-- Catalog verified historical warehouse return scan; disposable CI only.
CREATE OR REPLACE FUNCTION public.be_warehouse_return_scan_v39_legacy_20260823(p_way_id text, p_actor_email text DEFAULT NULL::text, p_warehouse_code text DEFAULT 'YGN-MAIN'::text, p_staging_zone text DEFAULT 'FAILED_RETURN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_pickup_id text;
  v_attempt integer := 0;
  v_status text := null;
  v_result jsonb;
begin
 -- BRANCH_WAREHOUSE_ENTRY_V1
 if replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then
perform public.be_branch_warehouse_require_way_v1(p_way_id,'RETURN');p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||'-MAIN';p_actor_email:=public.be_warehouse_actor_email();v_actor:=public.be_warehouse_actor_email();
 end if;

  if v_way_id is null then raise exception 'Way ID is required'; end if;

  select d.pickup_id
  into v_pickup_id
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then raise exception 'Way ID % was not found', v_way_id; end if;

  select consecutive_failures, last_status
  into v_attempt, v_status
  from public.be_delivery_attempt_state_v39
  where delivery_way_id = v_way_id;

  if v_status = 'RTO' then
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'EXCEPTION', 'RTO', 'DELIVERY_RTO',
      format('Return scan recorded after %s consecutive failed attempts', coalesce(v_attempt, 3)),
      null, p_warehouse_code, 'RTO', v_actor
    );
  elsif v_status = 'ATTEMPTED_FAILED' then
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'RECEIVE', 'FAILED_RETURN', null,
      format('Failed delivery return scan. Attempt %s of 3.', coalesce(v_attempt, 1)),
      null, p_warehouse_code, coalesce(nullif(p_staging_zone, ''), 'FAILED_RETURN'), v_actor
    );
  else
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'RECEIVE', 'GOOD', null, null,
      null, p_warehouse_code, 'INTAKE', v_actor
    );
  end if;

  update public.be_warehouse_receipts_v36
  set receipt_method = case when v_status in ('ATTEMPTED_FAILED', 'RTO') then 'RETURN_SCAN' else 'SCAN' end,
      warehouse_entered_at = now(),
      updated_at = now()
  where pickup_id = v_pickup_id
    and delivery_way_id = v_way_id;

  return v_result || jsonb_build_object(
    'attempt_count', coalesce(v_attempt, 0),
    'delivery_attempt_status', v_status,
    'rto', v_status = 'RTO',
    'return_scan_recorded', v_status in ('ATTEMPTED_FAILED', 'RTO')
  );
end;
$function$
;
