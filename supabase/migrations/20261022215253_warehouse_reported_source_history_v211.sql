-- Display reported source operations alongside actual scan history. No scan,
-- inspection, delivery, approval or financial state is created by this reader.
create or replace function public.be_warehouse_scan_lifecycle_snapshot_v211()
returns jsonb language plpgsql security definer
set search_path to public, pg_temp
as $function$
declare
  v_base jsonb := public.be_warehouse_scan_lifecycle_snapshot_v164();
  v_rows jsonb;
begin
  -- The existing snapshot enforces Warehouse/Finance read authorization first.
  with reports as materialized (
    select s.delivery_way_id,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'wayplan_id',p.wayplan_id,
        'work_date',p.metadata->>'work_date',
        'plan_type',p.metadata->>'plan_type',
        'completion_basis',p.metadata->>'completion_basis',
        'reported_outcome',s.metadata->>'md_attested_outcome',
        'source_way_id',s.metadata->>'source_way_id',
        'source_file',p.metadata->>'source_file_name',
        'driver_name',p.driver_name,'helper_name',p.helper_name,
        'rider_name',p.rider_name,'vehicle_code',p.vehicle_code,
        'reason',s.metadata->'source_attempt_evidence'->>'reason',
        'verification',s.metadata->'source_attempt_evidence'->>'verification',
        'reason_source_file',s.metadata->'source_attempt_evidence'->>'source_file'
      )) order by p.metadata->>'work_date',p.wayplan_id) history
    from public.be_wayplan_dispatch_stops s
    join public.be_wayplan_dispatches p using(wayplan_id)
    where p.metadata->>'completion_basis'='MD_INSTRUCTED_ASSUMPTION'
      and p.metadata->>'plan_type' in ('OUTBOUND','THIRD_PARTY')
    group by s.delivery_way_id
  )
  select coalesce(jsonb_agg(r.e || jsonb_build_object(
    'reported_source_history',coalesce(h.history,'[]'::jsonb)
  ) order by r.ord),'[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality r(e,ord)
  left join reports h on h.delivery_way_id=coalesce(
    nullif(r.e->>'canonical_delivery_way_id',''),nullif(r.e->>'delivery_way_id','')
  );
  return v_base || jsonb_build_object('rows',v_rows,'source_history_build','WAREHOUSE_REPORTED_SOURCE_HISTORY_V211');
end;
$function$;
revoke all on function public.be_warehouse_scan_lifecycle_snapshot_v211() from public;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v211() to authenticated,service_role;
