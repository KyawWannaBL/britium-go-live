-- Britium Express warehouse custody/reschedule hotfix source snapshot 2026-11-15.
-- LIVE DATABASE ALREADY UPDATED by authorized manual repair.
-- This is intentionally NOT under supabase/migrations to avoid inconsistent remote
-- migration history. Reconcile via migration tooling before re-applying.
-- Historical Way IDs and COD ledgers must never be deleted or repriced.
-- Explicitly prevent premature Wayplans, return scans with rewritten reasons,
-- and Warehouse queue stale status regressions.

BEGIN;

-- be_delivery_schedule_allows_wayplan_v71
CREATE OR REPLACE FUNCTION public.be_delivery_schedule_allows_wayplan_v71(p_delivery_way_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select not exists(
    select 1
    from public.be_delivery_reschedules_v71 r
    where r.status='ACTIVE'
      and (
        upper(r.delivery_way_id)=upper(btrim(p_delivery_way_id))
        or upper(coalesce(r.original_way_id,''))=upper(btrim(p_delivery_way_id))
      )
      and (
        r.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
        or not exists (
          select 1 from public.be_warehouse_return_scans_v39 s
          where upper(s.delivery_way_id)=upper(r.delivery_way_id)
        )
      )
  );
$function$;

-- be_reschedule_wayplan_membership_guard_v212
CREATE OR REPLACE FUNCTION public.be_reschedule_wayplan_membership_guard_v212()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if upper(coalesce(new.membership_status,'')) in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
    and not public.be_delivery_schedule_allows_wayplan_v71(new.delivery_way_id) then
    raise exception 'RESCHEDULE_HOLD: % requires physical Warehouse Return Scan and customer delivery date to become due',new.delivery_way_id using errcode='23514';
  end if;
  return new;
end;
$function$;

-- be_reschedule_dispatch_stop_guard_v212
CREATE OR REPLACE FUNCTION public.be_reschedule_dispatch_stop_guard_v212()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
      upper(coalesce(new.dispatch_status,'')) in ('READY_FOR_DISPATCH','DISPATCHED','DISPATCH_SCANNED','OUT_FOR_DELIVERY','RIDER_ACCEPTED')
      or upper(coalesce(new.stop_status,'')) in ('READY_FOR_DISPATCH','DISPATCHED','DISPATCH_SCANNED','OUT_FOR_DELIVERY','RIDER_ACCEPTED')
     )
     and not public.be_delivery_schedule_allows_wayplan_v71(new.delivery_way_id)
  then
    raise exception 'RESCHEDULE_HOLD: Way % cannot be dispatched until the physical return scan and requested delivery date',new.delivery_way_id using errcode='23514';
  end if;
  return new;
end $function$;

-- be_warehouse_return_scan_v71
CREATE OR REPLACE FUNCTION public.be_warehouse_return_scan_v71(p_tracking_no text, p_reason_code text, p_delivery_date date DEFAULT NULL::date, p_actor_email text DEFAULT NULL::text, p_remark text DEFAULT NULL::text, p_warehouse_code text DEFAULT 'YGN-MAIN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_input text:=nullif(upper(btrim(coalesce(p_tracking_no,''))),'');
  v_internal text;
  v_reason text:=upper(nullif(btrim(coalesce(p_reason_code,'')),''));
  v_saved_reason text;
  v_effective_date date;
  v_result jsonb;
  v_schedule jsonb:='{}'::jsonb;
begin
 -- BRANCH_WAREHOUSE_ENTRY_V1
 if replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then
perform public.be_branch_warehouse_require_way_v1(p_tracking_no,'RETURN');p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||'-MAIN';p_actor_email:=public.be_warehouse_actor_email();
 end if;

  if v_input is null then raise exception 'Delivery Way ID is required'; end if;
  v_internal:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_internal is null then raise exception 'Way ID % was not found',v_input; end if;

  select upper(nullif(btrim(s.last_failure_reason),'')) into v_saved_reason
  from public.be_delivery_attempt_state_v39 s
  where upper(s.delivery_way_id)=v_internal limit 1;
  -- Field-submitted reason is authoritative; Warehouse need not enter it again.
  v_reason:=coalesce(v_saved_reason,v_reason);
  v_effective_date:=p_delivery_date;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_effective_date is null then
    select requested_delivery_date into v_effective_date
    from public.be_delivery_reschedules_v71
    where delivery_way_id=v_internal and status='ACTIVE' limit 1;
  end if;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_effective_date is null then
    raise exception 'Dedicated delivery date is required for customer reschedule';
  end if;

  v_result:=public.be_warehouse_return_scan(
    v_internal,v_reason,p_actor_email,p_remark,p_warehouse_code
  );

  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' then
    v_schedule:=public.be_set_delivery_reschedule_v71(
      v_internal,v_effective_date,v_reason,p_actor_email,p_remark
    );
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'input_way_id',v_input,
    'operational_way_id',public.be_operational_way_id_v70(v_internal),
    'internal_delivery_way_id',v_internal,
    'reschedule',v_schedule,
    'build','WAREHOUSE_RETURN_RESCHEDULE_V71'
  );
end;
$function$;

-- be_warehouse_scan_lifecycle_snapshot_v211
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
    end || coalesce(current.scan_state,'{}'::jsonb) order by r.ord
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
  ) active on true
  left join lateral (
    select public.be_warehouse_dispatch_scan_state_v75(
      coalesce(nullif(r.e->>'canonical_delivery_way_id',''),nullif(r.e->>'delivery_way_id',''))
    ) as scan_state
    where coalesce((r.e->>'physical_return_scan_count')::integer,0)>0
       or exists(
         select 1 from public.be_delivery_reschedules_v71 rs
         where rs.status='ACTIVE'
           and rs.delivery_way_id=coalesce(nullif(r.e->>'canonical_delivery_way_id',''),nullif(r.e->>'delivery_way_id',''))
       )
  ) current on true;
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


DROP TRIGGER IF EXISTS be_reschedule_membership_guard_v212 ON public.be_wayplan_membership_v40;
CREATE TRIGGER be_reschedule_membership_guard_v212
BEFORE INSERT OR UPDATE OF delivery_way_id,membership_status ON public.be_wayplan_membership_v40
FOR EACH ROW EXECUTE FUNCTION public.be_reschedule_wayplan_membership_guard_v212();
DROP TRIGGER IF EXISTS be_reschedule_dispatch_stop_guard_v212 ON public.be_wayplan_dispatch_stops;
CREATE TRIGGER be_reschedule_dispatch_stop_guard_v212
BEFORE INSERT OR UPDATE OF delivery_way_id,dispatch_status,stop_status ON public.be_wayplan_dispatch_stops
FOR EACH ROW EXECUTE FUNCTION public.be_reschedule_dispatch_stop_guard_v212();
REVOKE ALL ON FUNCTION public.be_reschedule_wayplan_membership_guard_v212() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.be_reschedule_dispatch_stop_guard_v212() FROM PUBLIC, anon, authenticated;

COMMIT;
