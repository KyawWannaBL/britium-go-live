create or replace function public.be_sync_return_scan_retry_v168()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_rto boolean := new.attempt_number >= 3;
begin
  update public.be_data_entry_parcel_details
  set return_scanned_at = coalesce(return_scanned_at,new.scanned_at),
      warehouse_status = case when v_rto then 'RTO' else 'WAREHOUSE_READY' end,
      way_management_status = case when v_rto then 'RTO' else 'READY_FOR_WAYPLAN' end,
      parcel_status = case when v_rto then 'RTO' else 'RETURN_SCANNED' end,
      updated_at = now()
  where upper(delivery_way_id)=upper(new.delivery_way_id);

  update public.be_warehouse_receipts_v36
  set warehouse_status = case when v_rto then 'RTO' else 'WAREHOUSE_READY' end,
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

drop trigger if exists trg_be_sync_return_scan_retry_v168 on public.be_warehouse_return_scans_v39;
create trigger trg_be_sync_return_scan_retry_v168
after insert on public.be_warehouse_return_scans_v39
for each row execute function public.be_sync_return_scan_retry_v168();

revoke all on function public.be_sync_return_scan_retry_v168() from public, anon, authenticated;
grant execute on function public.be_sync_return_scan_retry_v168() to service_role;

create or replace function public.be_rider_delivery_wayplan_jobs(
  p_rider_code text default null::text,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(v_identity->>'worker_code');
  v_role text := lower(v_identity->>'role');
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.wayplan_created_at desc, x.stop_sequence asc),'[]'::jsonb)
  into v_rows
  from (
    select j.*
    from public.be_v_rider_delivery_wayplan_jobs j
    where case v_role
      when 'driver' then upper(coalesce(j.driver_code,'')) = v_code
      when 'helper' then upper(coalesce(j.helper_code,'')) = v_code
      else upper(coalesce(j.rider_code,'')) = v_code
    end
      and (
        upper(coalesce(j.stop_status,''))='DELIVERED'
        or (
          upper(coalesce(j.wayplan_status,'')) <> 'COMPLETED'
          and exists (
            select 1
            from public.be_dispatch_scans_v39 ds
            where upper(ds.delivery_way_id)=upper(j.delivery_way_id)
              and ds.scan_status='SCANNED'
              and ds.scanned_at > coalesce((
                select max(rs.scanned_at)
                from public.be_warehouse_return_scans_v39 rs
                where upper(rs.delivery_way_id)=upper(j.delivery_way_id)
              ),'-infinity'::timestamptz)
          )
        )
      )
    order by j.wayplan_created_at desc, j.stop_sequence asc
    limit least(greatest(coalesce(p_limit,100),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,
    'source','be_rider_delivery_wayplan_jobs_auth_v168',
    'identity',v_identity,
    'count',jsonb_array_length(v_rows),
    'jobs',v_rows
  );
end
$function$;

revoke all on function public.be_rider_delivery_wayplan_jobs(text,integer) from public,anon;
grant execute on function public.be_rider_delivery_wayplan_jobs(text,integer) to authenticated,service_role;