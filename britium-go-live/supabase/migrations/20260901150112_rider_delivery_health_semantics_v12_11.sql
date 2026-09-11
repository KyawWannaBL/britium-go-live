create or replace function public.be_rider_delivery_process_health_v12_10()
returns jsonb
language sql
security definer
set search_path=public
as $$
with active_dispatches as (
  select w.* from public.be_wayplan_dispatches w
  where upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY')
), active_stops as (
  select s.*,w.rider_code as dispatch_rider_code,w.driver_code as dispatch_driver_code,w.helper_code as dispatch_helper_code
  from public.be_wayplan_dispatch_stops s join active_dispatches w on w.wayplan_id=s.wayplan_id
), canonical as (
  select s.* from active_stops s where s.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
), registered as (
  select c.* from canonical c where exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=c.delivery_way_id)
), assignment_codes as (
  select distinct upper(code) as code,role_source from (
    select rider_code as code,'RIDER'::text as role_source from active_dispatches
    union all select driver_code,'DRIVER' from active_dispatches
    union all select helper_code,'HELPER' from active_dispatches
  ) z where coalesce(code,'')<>''
), assignment_health as (
  select a.code,a.role_source,m.worker_code,m.auth_user_id,m.role as mapped_role,m.is_active,
         case when m.auth_user_id is null then 'UNMAPPED'
              when not coalesce(m.is_active,false) then 'INACTIVE'
              when upper(coalesce(m.role,''))<>a.role_source then 'ROLE_MISMATCH'
              else 'READY' end as status
  from assignment_codes a
  left join public.be_mobile_workforce_accounts m
    on upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.rider_code,''),nullif(m.driver_code,''),nullif(m.helper_code,'')))=a.code
), metrics as (
  select
    (select count(*) from active_dispatches)::integer as active_wayplans,
    (select count(*) from active_stops)::integer as active_stops,
    (select count(*) from canonical)::integer as canonical_delivery_stops,
    (select count(*) from registered)::integer as registered_delivery_stops,
    (select count(*) from canonical c where not exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=c.delivery_way_id))::integer as orphan_delivery_stops,
    (select count(*) from active_stops s where coalesce(s.delivery_way_id,'') !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$')::integer as noncanonical_active_stops,
    (select count(*) from registered r where exists(select 1 from public.be_dispatch_scans_v39 ds where ds.delivery_way_id=r.delivery_way_id and ds.scan_status='SCANNED' and ds.wayplan_code=r.wayplan_id))::integer as scanned_delivery_stops,
    (select count(*) from registered r where not exists(select 1 from public.be_dispatch_scans_v39 ds where ds.delivery_way_id=r.delivery_way_id and ds.scan_status='SCANNED' and ds.wayplan_code=r.wayplan_id))::integer as scan_pending_stops,
    (select count(*) from public.be_v_dispatch_ready_queue)::integer as clean_ready_queue,
    exists(select 1 from storage.buckets b where b.id='rider-proofs' and b.file_size_limit>=15728640) as proof_bucket_ready,
    coalesce((select jsonb_agg(to_jsonb(a) order by a.code) from assignment_health a where a.status<>'READY'),'[]'::jsonb) as assignment_issues,
    not exists(select 1 from assignment_health where status<>'READY') as assignments_ok
)
select jsonb_build_object(
  'ok',true,
  'build','RIDER_DELIVERY_MOBILE_V12_11_20260901',
  'ready', assignments_ok and orphan_delivery_stops=0 and noncanonical_active_stops=0 and proof_bucket_ready,
  'status',case
    when not (assignments_ok and orphan_delivery_stops=0 and noncanonical_active_stops=0 and proof_bucket_ready) then 'CHECK_REQUIRED'
    when active_wayplans=0 then 'READY_NO_ACTIVE_ROUTE'
    when scan_pending_stops>0 then 'AWAITING_MANDATORY_DISPATCH_SCAN'
    else 'READY_ACTIVE_ROUTE' end,
  'active_wayplans',active_wayplans,
  'active_stops',active_stops,
  'canonical_delivery_stops',canonical_delivery_stops,
  'registered_delivery_stops',registered_delivery_stops,
  'orphan_delivery_stops',orphan_delivery_stops,
  'noncanonical_active_stops',noncanonical_active_stops,
  'scanned_delivery_stops',scanned_delivery_stops,
  'scan_pending_stops',scan_pending_stops,
  'clean_ready_queue',clean_ready_queue,
  'assignment_issues',assignment_issues,
  'proof_bucket_ready',proof_bucket_ready,
  'helper_optional',true,
  'mandatory_dispatch_scan',true,
  'data_entry_registration_required',true,
  'workforce_auth_mapping_required',true
) from metrics;
$$;

grant execute on function public.be_rider_delivery_process_health_v12_10() to authenticated;;
