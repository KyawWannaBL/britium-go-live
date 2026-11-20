-- Candidate only. REVIEW + APPLY TO ISOLATED UAT FIRST.
-- Read-only; do not replace the authoritative Wayplan creator or Warehouse scan RPCs.
-- Canonical provider metadata attached only to already-authorized Warehouse snapshot rows.
create or replace function public.be_warehouse_provider_transfer_preview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Warehouse session required';
  end if;
  perform public.be_warehouse_assert_internal();
  v_base := public.be_warehouse_scan_lifecycle_snapshot_v211();

  with src as materialized (
    select e, ord,
      upper(coalesce(nullif(e->>'canonical_delivery_way_id',''),
                     nullif(e->>'delivery_way_id',''))) way_id
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
         with ordinality as t(e,ord)
  ), metadata as (
    select s.e, s.ord, s.way_id,
      upper(coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET')) provider_code,
      upper(coalesce(nullif(d.delivery_region,''),'UNSET')) destination_region,
      upper(coalesce(nullif(d.delivery_route_mode,''),'UNSET')) route_mode,
      upper(coalesce(nullif(d.financial_validation_status,''),'UNSET')) financial_status,
      coalesce(nullif(split_part(upper(r.warehouse_code),'-',1),''),'UNSET') origin_branch_code
    from src s
    left join lateral (
      select d.financial_quote,d.delivery_region,d.delivery_route_mode,
             d.financial_validation_status
      from public.be_data_entry_parcel_details d
      where upper(d.delivery_way_id)=s.way_id
        and upper(d.pickup_id)=upper(coalesce(s.e->>'pickup_id',''))
      order by d.updated_at desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select wr.warehouse_code
      from public.be_warehouse_receipts_v36 wr
      where upper(wr.delivery_way_id)=s.way_id
      order by wr.updated_at desc nulls last limit 1
    ) r on true
  ), sites as (
    select m.*, site.location_code as handover_location_code,
      site.location_name as handover_location_name,
      site.latitude as handover_latitude,
      site.longitude as handover_longitude
    from metadata m
    left join lateral (
      select loc.location_code,loc.location_name,loc.latitude,loc.longitude
      from public.be_provider_handover_sites_v1 approval
      join public.be_wayplan_service_locations loc
        on loc.location_code=approval.location_code
      where approval.provider_code=m.provider_code
        and approval.origin_branch_code=m.origin_branch_code
        and approval.active=true
        and approval.verified_at is not null
        and approval.verified_by is not null
        and loc.active=true
        and loc.latitude between 9 and 29
        and loc.longitude between 92 and 102
      order by approval.verified_at desc,loc.location_code
      limit 1
    ) site on true
  ), flagged as (
    select *,
      case
        when provider_code='BRITIUM' then 'BRITIUM_LAST_MILE'
        when provider_code='UNSET' then 'PROVIDER_REVIEW'
        when destination_region='OUTSIDE_CORE' then 'PROVIDER_TRANSFER_REQUIRED'
        when provider_code in ('ROYAL EXPRESS','DK DELIVERY','GRS','H.TERMINAL DROP-OFF')
          then 'PROVIDER_HANDOVER_WITHIN_CORE_REGION'
        when provider_code like '%BRANCH%' then 'BRANCH_HANDOVER_WITHIN_CORE_REGION'
        else 'PROVIDER_REVIEW'
      end as service_lane,
      case
        when nullif(e->>'active_wayplan_id','') is not null
          then 'ALREADY_ASSIGNED'
        when upper(coalesce(e->>'dispatch_workflow_stage','')) in
          ('SCHEDULED_HOLD','AWAITING_RETURN_SCAN','DISPATCH_SCAN_REQUIRED',
           'DISPATCH_SCANNED','IN_WAYPLAN_AWAITING_SUPERVISOR')
          then 'WORKFLOW_HOLD'
        when upper(coalesce(e->>'warehouse_scan_status',e->>'warehouse_status','')) not in
          ('RECEIVED','WAREHOUSE_READY','RETURN_SCANNED')
          then 'WAREHOUSE_NOT_READY'
        when provider_code='UNSET'
          then 'PROVIDER_REVIEW_REQUIRED'
        when financial_status not in ('OK','VALID')
          then 'FINANCIAL_VALIDATION_PENDING'
        when destination_region='OUTSIDE_CORE'
          then 'NEEDS_PROVIDER_TRANSFER_WAYPLAN'
        when provider_code in ('ROYAL EXPRESS','DK DELIVERY','GRS','H.TERMINAL DROP-OFF')
          then 'NEEDS_PROVIDER_TRANSFER_WAYPLAN'
        when provider_code like '%BRANCH%'
          then 'NEEDS_BRANCH_TRANSFER_WAYPLAN'
        else 'REGIONAL_WAYPLAN_REVIEW'
      end as planning_gate
    from sites
  )
  select coalesce(jsonb_agg(e || jsonb_build_object(
      'service_provider_code',provider_code,
      'delivery_region',destination_region,
      'delivery_route_mode',route_mode,
      'financial_validation_status',financial_status,
      'service_lane',service_lane,
      'provider_planning_gate',planning_gate,
      'handover_origin_branch',origin_branch_code,
      'handover_location_code',handover_location_code,
      'handover_location_name',handover_location_name,
      'handover_location_verified',handover_location_code is not null
    ) order by ord),'[]'::jsonb) into v_rows
  from flagged;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'provider_transfer_preview',true,
    'build','WAREHOUSE_PROVIDER_TRANSFER_PREVIEW_V1',
    'note','Provider transfers require an approved physical site and a dedicated transfer Wayplan. No dispatch or custody events created.'
  );
end;
$function$;

revoke all on function public.be_warehouse_provider_transfer_preview_v1() from public, anon;
grant execute on function public.be_warehouse_provider_transfer_preview_v1() to authenticated;
