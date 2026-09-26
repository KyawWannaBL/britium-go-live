create or replace function public.be_warehouse_snapshot(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_role text;
  v_rows jsonb := '[]'::jsonb;
begin
  -- Preserve the existing privileged read pattern, but require a real
  -- Warehouse-authorized authenticated actor before exposing canonical data.
  v_role := public.be_warehouse_assert_internal();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        -- Legacy row keys retained for frontend compatibility.
        'id', null,
        'assignment_key', v.delivery_way_id,
        'pickup_id', v.pickup_id,
        'pickup_way_id', v.pickup_id,
        'delivery_way_id', v.delivery_way_id,
        'parcel_status',
          case
            when coalesce(v.delivery_attempt_status, '') = 'RTO' then 'RETURN_TO_SENDER'
            when coalesce(v.delivery_attempt_status, '') = 'ATTEMPTED_FAILED' then 'DELIVERY_FAILED'
            when v.warehouse_status = 'WAREHOUSE_EXCEPTION' then 'WAREHOUSE_EXCEPTION'
            when v.warehouse_status = 'WAREHOUSE_READY' then 'READY_FOR_DELIVERY'
            when v.warehouse_status = 'RECEIVED' then 'WAREHOUSE_RECEIVED'
            else 'SUBMITTED'
          end,
        'warehouse_status', v.warehouse_status,
        'branch_code', coalesce(nullif(v.warehouse_code, ''), 'HQ'),
        'location_note', v.recipient_address,
        'updated_by', coalesce(v.dispatch_scanned_by, v.ready_by, v.scanned_by),
        'updated_by_name', coalesce(v.dispatch_scanned_by, v.ready_by, v.scanned_by),
        'payload', jsonb_build_object(
          'canonical_source', 'be_v_warehouse_receipt_v39',
          'batch_waybill_no', v.batch_waybill_no,
          'merchant_name', v.merchant_name,
          'recipient_name', v.recipient_name,
          'recipient_phone', v.recipient_phone,
          'township', v.township,
          'recipient_address', v.recipient_address,
          'actual_collect', v.actual_collect,
          'declared_weight_kg', v.declared_weight_kg,
          'receipt_method', v.receipt_method,
          'receiving_scan_skipped', v.receiving_scan_skipped,
          'warehouse_entered_at', v.warehouse_entered_at,
          'dwell_hours', v.dwell_hours,
          'dwell_alert', v.dwell_alert,
          'dispatch_scanned', v.dispatch_scanned,
          'dispatch_scanned_at', v.dispatch_scanned_at,
          'consecutive_delivery_failures', v.consecutive_delivery_failures,
          'delivery_attempt_status', v.delivery_attempt_status,
          'rto_at', v.rto_at
        ),
        'created_at', coalesce(v.warehouse_entered_at, v.updated_at),
        'updated_at', v.updated_at
      )
      order by v.updated_at desc nulls last, v.delivery_way_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.be_v_warehouse_receipt_v39 v;

  return jsonb_build_object(
    'ok', true,
    'warehouse_rows', v_rows,
    'pre_golive_uat_isolated', true
  );
end;
$function$;

revoke all on function public.be_warehouse_snapshot(jsonb) from public;
revoke all on function public.be_warehouse_snapshot(jsonb) from anon;
grant execute on function public.be_warehouse_snapshot(jsonb) to authenticated;
grant execute on function public.be_warehouse_snapshot(jsonb) to service_role;
