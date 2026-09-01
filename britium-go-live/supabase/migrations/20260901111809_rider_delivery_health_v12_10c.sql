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
), scanned as (
  select c.* from registered c where exists(select 1 from public.be_dispatch_scans_v39 ds where ds.delivery_way_id=c.delivery_way_id and ds.scan_status='SCANNED')
), assignment_codes as (
  select distinct upper(code) as code,role_source from (
    select rider_code as code,'RIDER'::text as role_source from active_dispatches
    union all select driver_code,'DRIVER' from active_dispatches
    union all select helper_code,'HELPER' from active_dispatches
  ) z where coalesce(code,'')<>''
), assignment_health as (
  select a.code,a.role_source,m.worker_code,m.role as mapped_role,m.auth_user_id,m.is_active,
         case when m.auth_user_id is null then 'UNMAPPED'
              when not coalesce(m.is_active,false) then 'INACTIVE'
              when upper(coalesce(m.role,''))<>a.role_source then 'ROLE_MISMATCH'
              else 'READY' end as status
  from assignment_codes a left join public.be_mobile_workforce_accounts m on upper(coalesce(m.worker_code,''))=a.code
)
select jsonb_build_object(
  'ok',true,'build','RIDER_DELIVERY_MOBILE_V12_10_20260901',
  'active_wayplans',(select count(*) from active_dispatches),
  'active_stops',(select count(*) from active_stops),
  'canonical_delivery_stops',(select count(*) from canonical),
  'registered_delivery_stops',(select count(*) from registered),
  'scanned_delivery_stops',(select count(*) from scanned),
  'scan_pending_stops',(select count(*) from registered)-(select count(*) from scanned),
  'orphan_delivery_stops',(select count(*) from canonical c where not exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=c.delivery_way_id)),
  'noncanonical_active_stops',(select count(*) from active_stops s where coalesce(s.delivery_way_id,'') !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'),
  'assignment_issues',coalesce((select jsonb_agg(to_jsonb(a) order by a.code) from assignment_health a where a.status<>'READY'),'[]'::jsonb),
  'ready',not exists(select 1 from assignment_health where status<>'READY') and not exists(select 1 from canonical c where not exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=c.delivery_way_id)) and (select count(*) from scanned)>0,
  'proof_bucket_ready',exists(select 1 from storage.buckets b where b.id='rider-proofs' and b.file_size_limit>=15728640)
);
$$;
revoke all on function public.be_rider_delivery_process_health_v12_10() from public;
revoke all on function public.be_rider_delivery_process_health_v12_10() from anon;
grant execute on function public.be_rider_delivery_process_health_v12_10() to authenticated;;
