-- Warehouse dispatch replan scan queue reconciliation, applied 2026-11-04.
-- Preserve all physical scan evidence, return scans and audited approvals.
-- Display the currently Supervisor-released Wayplan instead of a stale failed attempt.
-- Return-scanned parcels without an active released Wayplan remain unavailable for Dispatch Scan.
-- This migration replaces read-only RPC definitions; it does not update parcel rows.

CREATE OR REPLACE FUNCTION public.be_warehouse_dispatch_scan_queue_v75()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_snapshot jsonb;
  v_rows jsonb;
  v_wayplans jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_snapshot:=public.be_warehouse_scan_lifecycle_snapshot_v211();

  select coalesce(jsonb_agg(e order by e->>'active_wayplan_id',e->>'display_way_id'),'[]'::jsonb)
    into v_rows
  from jsonb_array_elements(coalesce(v_snapshot->'rows','[]'::jsonb)) e
  where coalesce((e->>'dispatch_scan_required')::boolean,false);

  select coalesce(jsonb_agg(x order by x->>'wayplan_id'),'[]'::jsonb)
    into v_wayplans
  from (
    select jsonb_build_object(
      'wayplan_id',e->>'active_wayplan_id',
      'vehicle_code',max(e->>'assigned_vehicle_code'),
      'vehicle_name',max(e->>'assigned_vehicle_name'),
      'required_count',count(*)::integer
    ) x
    from jsonb_array_elements(coalesce(v_snapshot->'rows','[]'::jsonb)) e
    where coalesce((e->>'dispatch_scan_required')::boolean,false)
      and nullif(e->>'active_wayplan_id','') is not null
    group by e->>'active_wayplan_id'
  ) q;

  return jsonb_build_object(
    'ok',true,
    'count',jsonb_array_length(v_rows),
    'rows',v_rows,
    'wayplans',v_wayplans,
    'instruction','Scan only parcels shown in this queue. These Wayplans have been released by Supervisor.',
    'build','WAREHOUSE_DISPATCH_QUEUE_V75'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  select coalesce(jsonb_agg(
    r.e || jsonb_build_object(
      'reported_source_history',coalesce(h.history,'[]'::jsonb)
    ) ||
    case
      when coalesce((active.scan_state->>'dispatch_scan_required')::boolean,false)
        and active.scan_state->>'active_wayplan_id'=active.wayplan_id
      then jsonb_build_object(
        'active_wayplan_id',active.wayplan_id,
        'supervisor_review_status','DISPATCH_READY',
        'dispatch_workflow_stage','DISPATCH_SCAN_REQUIRED',
        'dispatch_scan_required',true,
        'dispatch_scan_allowed',true,
        'dispatch_scan_instruction','Current Wayplan is released. Scan this parcel for the current trip; previous failed attempt is historical.',
        'dispatch_status_source','CURRENT_WAYPLAN_RESCAN_RECONCILIATION_V212'
      )
      else '{}'::jsonb
    end order by r.ord
  ),'[]'::jsonb) into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality r(e,ord)
  left join reports h on h.delivery_way_id=coalesce(
    nullif(r.e->>'canonical_delivery_way_id',''),nullif(r.e->>'delivery_way_id','')
  )
  left join lateral (
    select m.wayplan_id,
      public.be_warehouse_dispatch_scan_state_v75(m.delivery_way_id) as scan_state
    from public.be_wayplan_membership_v40 m
    join public.be_wayplan_review_v43 review on review.wayplan_id=m.wayplan_id
    join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
    where m.delivery_way_id=coalesce(
      nullif(r.e->>'canonical_delivery_way_id',''),nullif(r.e->>'delivery_way_id','')
    )
      and m.membership_status='READY_FOR_DISPATCH'
      and upper(coalesce(review.review_status,''))='DISPATCH_READY'
      and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
    order by m.updated_at desc nulls last
    limit 1
  ) active on true;
  return v_base || jsonb_build_object(
    'rows',v_rows,
    'stats',coalesce(v_base->'stats','{}'::jsonb)||jsonb_build_object(
      'dispatch_scan_required',(
        select count(*)::int
        from jsonb_array_elements(v_rows) e
        where coalesce((e->>'dispatch_scan_required')::boolean,false)
      )
    ),
    'source_history_build','WAREHOUSE_REPORTED_SOURCE_HISTORY_V211',
    'dispatch_scan_reconciliation','CURRENT_WAYPLAN_RESCAN_RECONCILIATION_V212'
  );
end;
$function$;
