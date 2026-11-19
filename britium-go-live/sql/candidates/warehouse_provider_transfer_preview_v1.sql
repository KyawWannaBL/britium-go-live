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
      upper(coalesce(nullif(d.financial_validation_status,''),'UNSET')) financial_status
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
        when destination_region='OUTSIDE_CORE'
          then 'NEEDS_PROVIDER_TRANSFER_WAYPLAN'
        when financial_status not in ('OK','VALID')
          then 'FINANCIAL_VALIDATION_PENDING'
        else 'REGIONAL_WAYPLAN_REVIEW'
      end as planning_gate
    from metadata
  )
  select coalesce(jsonb_agg(e || jsonb_build_object(
      'service_provider_code',provider_code,
      'delivery_region',destination_region,
      'delivery_route_mode',route_mode,
      'financial_validation_status',financial_status,
      'service_lane',service_lane,
      'provider_planning_gate',planning_gate
    ) order by ord),'[]'::jsonb) into v_rows
  from flagged;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'provider_transfer_preview',true,
    'build','WAREHOUSE_PROVIDER_TRANSFER_PREVIEW_V1',
    'note','Outside-core provider parcels require an approved handover-stop Wayplan. No dispatch or custody events created.'
  );
end;
$function$;

revoke all on function public.be_warehouse_provider_transfer_preview_v1() from public, anon;
grant execute on function public.be_warehouse_provider_transfer_preview_v1() to authenticated;
