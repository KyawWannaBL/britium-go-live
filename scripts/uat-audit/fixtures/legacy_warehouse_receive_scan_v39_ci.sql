-- Production-catalog historical legacy receive scan definition; disposable CI only.
CREATE OR REPLACE FUNCTION public.be_warehouse_receive_scan_v39_legacy_20260823(p_pickup_id text, p_way_id text, p_action text DEFAULT 'RECEIVE'::text, p_condition text DEFAULT 'GOOD'::text, p_exception_code text DEFAULT NULL::text, p_remark text DEFAULT NULL::text, p_actual_weight_kg numeric DEFAULT NULL::numeric, p_warehouse_code text DEFAULT 'YGN-MAIN'::text, p_staging_zone text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
 -- BRANCH_WAREHOUSE_ENTRY_V1
 if replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then
perform public.be_branch_warehouse_require_way_v1(p_way_id,case when upper(p_action)='RECEIVE' then 'INBOUND' else 'RECEIPT_EDIT' end);if not exists(select 1 from public.be_data_entry_parcel_details where delivery_way_id=upper(btrim(p_way_id)) and pickup_id=p_pickup_id) then raise exception 'PICKUP_WAY_MISMATCH';end if;p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||'-MAIN';p_actor_email:=public.be_warehouse_actor_email();
 end if;

  v_result := public.be_warehouse_receive_scan_v36(
    p_pickup_id, p_way_id, p_action, p_condition, p_exception_code,
    p_remark, p_actual_weight_kg, p_warehouse_code, p_staging_zone, p_actor_email
  );

  update public.be_warehouse_receipts_v36
  set receipt_method = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then 'SCAN'
        else receipt_method
      end,
      receiving_scan_skipped = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then false
        else receiving_scan_skipped
      end,
      receiving_scan_skipped_at = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skipped_at
      end,
      receiving_scan_skipped_by = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skipped_by
      end,
      receiving_scan_skip_reason = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skip_reason
      end,
      warehouse_entered_at = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then coalesce(warehouse_entered_at, scanned_at, now())
        else warehouse_entered_at
      end,
      updated_at = now()
  where pickup_id = p_pickup_id
    and delivery_way_id = p_way_id;

  return v_result || jsonb_build_object('receipt_method', 'SCAN', 'receiving_scan_skipped', false);
end;
$function$
;
