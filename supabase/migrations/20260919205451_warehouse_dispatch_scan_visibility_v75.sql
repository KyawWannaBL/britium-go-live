-- V75: Warehouse dispatch-scan visibility and hard workflow gate.
-- Warehouse staff must be able to see exactly which received parcels require
-- Dispatch Scan, and draft Wayplans must not be scannable before Supervisor release.

create or replace function public.be_warehouse_dispatch_scan_state_v75(p_way_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_input text:=nullif(upper(btrim(coalesce(p_way_id,''))),'');
  v_way text;
  v_plan record;
  v_scan record;
  v_reschedule record;
  v_return_at timestamptz;
  v_return_count integer:=0;
  v_inbound_at timestamptz;
  v_wh_status text;
  v_rto boolean:=false;
  v_stage text;
  v_instruction text;
  v_required boolean:=false;
  v_allowed boolean:=false;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authentication required';
  end if;
  if v_input is null then raise exception 'Way ID is required'; end if;

  v_way:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_way is null then return jsonb_build_object('ok',false,'error','WAY_NOT_FOUND','input_way_id',v_input); end if;

  select
    m.wayplan_id,m.membership_status,m.updated_at as membership_updated_at,
    w.wayplan_status,w.vehicle_code,w.vehicle_name,
    coalesce(r.review_status,'DRAFT') review_status,
    r.dispatch_ready_at
  into v_plan
  from public.be_wayplan_membership_v40 m
  join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
  left join public.be_wayplan_review_v43 r on r.wayplan_id=m.wayplan_id
  where m.delivery_way_id=v_way
    and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
    and upper(coalesce(w.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
  order by
    case m.membership_status when 'READY_FOR_DISPATCH' then 1 when 'PLANNED' then 2 else 3 end,
    m.updated_at desc nulls last
  limit 1;

  select ds.scan_status,ds.scanned_at,ds.scanned_by,ds.wayplan_code
  into v_scan
  from public.be_dispatch_scans_v39 ds
  where ds.delivery_way_id=v_way
  order by ds.updated_at desc nulls last
  limit 1;

  select r.requested_delivery_date,r.reason_code,r.status
  into v_reschedule
  from public.be_delivery_reschedules_v71 r
  where r.delivery_way_id=v_way and r.status='ACTIVE'
  limit 1;

  select max(h.scanned_at),count(*)::integer
    into v_return_at,v_return_count
  from public.be_warehouse_return_scans_v39 h
  where h.delivery_way_id=v_way;

  select
    coalesce(wr.warehouse_entered_at,wr.updated_at),
    upper(coalesce(wr.warehouse_status,'')),
    (
      upper(coalesce(a.last_status,''))='RTO'
      or upper(coalesce(d.parcel_status,''))='RTO'
    )
  into v_inbound_at,v_wh_status,v_rto
  from public.be_data_entry_parcel_details d
  left join public.be_warehouse_receipts_v36 wr
    on wr.pickup_id=d.pickup_id and wr.parcel_sequence=d.parcel_sequence
  left join public.be_delivery_attempt_state_v39 a on a.delivery_way_id=d.delivery_way_id
  where d.delivery_way_id=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  if v_rto then
    v_stage:='RTO';
    v_instruction:='RTO parcel — do not Dispatch Scan.';
  elsif v_reschedule.requested_delivery_date is not null
     and v_reschedule.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date then
    v_stage:='SCHEDULED_HOLD';
    v_instruction:=format('Customer delivery date is %s. Hold until that date.',v_reschedule.requested_delivery_date);
  elsif v_return_count>0
     and v_return_at is not null
     and (v_plan.wayplan_id is null or coalesce(v_plan.membership_updated_at,'epoch'::timestamptz)<=v_return_at) then
    v_stage:='RETURNED_WAITING_REPLAN';
    v_instruction:='Returned parcel — wait for a new Wayplan before Dispatch Scan.';
  elsif upper(coalesce(v_scan.scan_status,''))='SCANNED'
     and v_plan.wayplan_id is not null
     and v_scan.wayplan_code=v_plan.wayplan_id then
    v_stage:='DISPATCH_SCANNED';
    v_instruction:='Dispatch Scan completed for the active Wayplan.';
  elsif v_plan.wayplan_id is not null
     and upper(coalesce(v_plan.membership_status,''))='READY_FOR_DISPATCH'
     and upper(coalesce(v_plan.review_status,''))='DISPATCH_READY' then
    v_stage:='DISPATCH_SCAN_REQUIRED';
    v_instruction:='Supervisor released this Wayplan. Dispatch Scan this parcel now.';
    v_required:=true;
    v_allowed:=true;
  elsif v_plan.wayplan_id is not null
     and upper(coalesce(v_plan.review_status,''))='APPROVED' then
    v_stage:='SUPERVISOR_APPROVED_AWAITING_RELEASE';
    v_instruction:='Supervisor approved; wait for DISPATCH_READY release before scanning.';
  elsif v_plan.wayplan_id is not null then
    v_stage:='IN_WAYPLAN_AWAITING_SUPERVISOR';
    v_instruction:='Parcel is in a Wayplan but is not yet released by Supervisor.';
  elsif v_inbound_at is not null or v_wh_status in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY','READY_FOR_DELIVERY') then
    v_stage:='READY_FOR_WAYPLAN';
    v_instruction:='Received and staged; waiting to be included in a Wayplan.';
  else
    v_stage:='NOT_RECEIVED';
    v_instruction:='Inbound receiving must be completed first.';
  end if;

  return jsonb_build_object(
    'ok',true,
    'delivery_way_id',v_way,
    'operational_way_id',public.be_operational_way_id_v70(v_way),
    'dispatch_workflow_stage',v_stage,
    'dispatch_scan_required',v_required,
    'dispatch_scan_allowed',v_allowed,
    'dispatch_scan_instruction',v_instruction,
    'active_wayplan_id',v_plan.wayplan_id,
    'membership_status',v_plan.membership_status,
    'wayplan_status',v_plan.wayplan_status,
    'supervisor_review_status',v_plan.review_status,
    'dispatch_ready_at',v_plan.dispatch_ready_at,
    'vehicle_code',v_plan.vehicle_code,
    'vehicle_name',v_plan.vehicle_name,
    'dispatch_scan_status',v_scan.scan_status,
    'dispatch_scan_at',case when upper(coalesce(v_scan.scan_status,''))='SCANNED' then v_scan.scanned_at else null end,
    'dispatch_scan_by',case when upper(coalesce(v_scan.scan_status,''))='SCANNED' then v_scan.scanned_by else null end,
    'last_dispatch_scan_at',v_scan.scanned_at,
    'last_return_scan_at',v_return_at,
    'return_attempt_count',v_return_count,
    'rescheduled_delivery_date',v_reschedule.requested_delivery_date,
    'build','WAREHOUSE_DISPATCH_STATE_V75'
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan_state_v75(text) to authenticated;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_raw jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_raw:=public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();

  select coalesce(jsonb_agg(
    (
      t.e
      || jsonb_build_object(
        'canonical_delivery_way_id',t.e->>'delivery_way_id',
        'source_waybill_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'display_way_id',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'tracking_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'waybill_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'return_scan_1_at',ret.return_scan_1_at,
        'return_reason_1',ret.return_reason_1,
        'return_reason_1_name',ret.return_reason_1_name,
        'return_scan_2_at',ret.return_scan_2_at,
        'return_reason_2',ret.return_reason_2,
        'return_reason_2_name',ret.return_reason_2_name,
        'return_scan_3_at',ret.return_scan_3_at,
        'return_reason_3',ret.return_reason_3,
        'return_reason_3_name',ret.return_reason_3_name,
        'return_attempt_count',coalesce(ret.return_count,0),

        'active_wayplan_id',plan.wayplan_id,
        'wayplan_membership_status',plan.membership_status,
        'active_wayplan_status',plan.wayplan_status,
        'supervisor_review_status',plan.review_status,
        'dispatch_ready_at',plan.dispatch_ready_at,
        'assigned_vehicle_code',plan.vehicle_code,
        'assigned_vehicle_name',plan.vehicle_name,
        'rescheduled_delivery_date',rs.requested_delivery_date,

        'dispatch_scan_status',coalesce(ds.scan_status,''),
        'last_dispatch_scan_at',ds.scanned_at,
        'dispatch_scan_at',case when upper(coalesce(ds.scan_status,''))='SCANNED' then ds.scanned_at else null end,
        'dispatch_scan_by',case when upper(coalesce(ds.scan_status,''))='SCANNED' then ds.scanned_by else null end,

        'dispatch_workflow_stage',
          case
            when nullif(t.e->>'rto_at','') is not null
              or upper(coalesce(t.e->>'delivery_status',''))='RTO' then 'RTO'
            when rs.requested_delivery_date is not null
              and rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date then 'SCHEDULED_HOLD'
            when coalesce(ret.return_count,0)>0
              and ret.last_return_at is not null
              and (plan.wayplan_id is null or coalesce(plan.membership_updated_at,'epoch'::timestamptz)<=ret.last_return_at)
              then 'RETURNED_WAITING_REPLAN'
            when upper(coalesce(ds.scan_status,''))='SCANNED'
              and plan.wayplan_id is not null
              and ds.wayplan_code=plan.wayplan_id then 'DISPATCH_SCANNED'
            when plan.wayplan_id is not null
              and upper(coalesce(plan.membership_status,''))='READY_FOR_DISPATCH'
              and upper(coalesce(plan.review_status,''))='DISPATCH_READY'
              then 'DISPATCH_SCAN_REQUIRED'
            when plan.wayplan_id is not null
              and upper(coalesce(plan.review_status,''))='APPROVED'
              then 'SUPERVISOR_APPROVED_AWAITING_RELEASE'
            when plan.wayplan_id is not null
              then 'IN_WAYPLAN_AWAITING_SUPERVISOR'
            when nullif(t.e->>'inbound_scan_at','') is not null
              or upper(coalesce(t.e->>'warehouse_status',t.e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY','READY_FOR_DELIVERY')
              then 'READY_FOR_WAYPLAN'
            else 'NOT_RECEIVED'
          end,

        'dispatch_scan_required',
          (
            plan.wayplan_id is not null
            and upper(coalesce(plan.membership_status,''))='READY_FOR_DISPATCH'
            and upper(coalesce(plan.review_status,''))='DISPATCH_READY'
            and upper(coalesce(ds.scan_status,''))<>'SCANNED'
            and not (
              rs.requested_delivery_date is not null
              and rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
            )
            and not (
              coalesce(ret.return_count,0)>0
              and ret.last_return_at is not null
              and coalesce(plan.membership_updated_at,'epoch'::timestamptz)<=ret.last_return_at
            )
          ),

        'dispatch_scan_allowed',
          (
            plan.wayplan_id is not null
            and upper(coalesce(plan.membership_status,''))='READY_FOR_DISPATCH'
            and upper(coalesce(plan.review_status,''))='DISPATCH_READY'
            and upper(coalesce(ds.scan_status,''))<>'SCANNED'
            and not (
              rs.requested_delivery_date is not null
              and rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
            )
            and not (
              coalesce(ret.return_count,0)>0
              and ret.last_return_at is not null
              and coalesce(plan.membership_updated_at,'epoch'::timestamptz)<=ret.last_return_at
            )
          ),

        'dispatch_scan_instruction',
          case
            when nullif(t.e->>'rto_at','') is not null
              or upper(coalesce(t.e->>'delivery_status',''))='RTO'
              then 'RTO parcel — do not Dispatch Scan.'
            when rs.requested_delivery_date is not null
              and rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
              then format('Customer delivery date is %s. Hold until that date.',rs.requested_delivery_date)
            when coalesce(ret.return_count,0)>0
              and ret.last_return_at is not null
              and (plan.wayplan_id is null or coalesce(plan.membership_updated_at,'epoch'::timestamptz)<=ret.last_return_at)
              then 'Returned parcel — wait for a new Wayplan before Dispatch Scan.'
            when upper(coalesce(ds.scan_status,''))='SCANNED'
              and plan.wayplan_id is not null
              and ds.wayplan_code=plan.wayplan_id
              then 'Dispatch Scan completed for the active Wayplan.'
            when plan.wayplan_id is not null
              and upper(coalesce(plan.membership_status,''))='READY_FOR_DISPATCH'
              and upper(coalesce(plan.review_status,''))='DISPATCH_READY'
              then 'Supervisor released this Wayplan. Dispatch Scan this parcel now.'
            when plan.wayplan_id is not null
              and upper(coalesce(plan.review_status,''))='APPROVED'
              then 'Supervisor approved; wait for DISPATCH_READY release before scanning.'
            when plan.wayplan_id is not null
              then 'Parcel is in a Wayplan but is not yet released by Supervisor.'
            when nullif(t.e->>'inbound_scan_at','') is not null
              or upper(coalesce(t.e->>'warehouse_status',t.e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY','READY_FOR_DELIVERY')
              then 'Received and staged; waiting to be included in a Wayplan.'
            else 'Inbound receiving must be completed first.'
          end,

        'warehouse_scan_status',
          case
            when nullif(t.e->>'rto_at','') is not null
              or upper(coalesce(t.e->>'delivery_status',''))='RTO' then 'RTO'
            when coalesce(ret.return_count,0)>0
              and ret.last_return_at is not null
              and (plan.wayplan_id is null or coalesce(plan.membership_updated_at,'epoch'::timestamptz)<=ret.last_return_at)
              then 'RETURN_SCANNED'
            when upper(coalesce(ds.scan_status,''))='SCANNED' then 'DISPATCH_SCANNED'
            when nullif(t.e->>'inbound_scan_at','') is not null then 'RECEIVED'
            else coalesce(t.e->>'warehouse_scan_status','PENDING')
          end
      )
    ) order by t.ord
  ),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) with ordinality as t(e,ord)
  left join lateral (
    select nullif(d.financial_quote->>'source_waybill_no','') source_waybill_no
    from public.be_data_entry_parcel_details d
    where d.delivery_way_id=t.e->>'delivery_way_id'
    order by d.updated_at desc nulls last,d.saved_at desc nulls last
    limit 1
  ) src on true
  left join lateral (
    select
      max(h.scanned_at) filter(where h.attempt_number=1) return_scan_1_at,
      max(h.reason_code) filter(where h.attempt_number=1) return_reason_1,
      max(h.reason_name) filter(where h.attempt_number=1) return_reason_1_name,
      max(h.scanned_at) filter(where h.attempt_number=2) return_scan_2_at,
      max(h.reason_code) filter(where h.attempt_number=2) return_reason_2,
      max(h.reason_name) filter(where h.attempt_number=2) return_reason_2_name,
      max(h.scanned_at) filter(where h.attempt_number=3) return_scan_3_at,
      max(h.reason_code) filter(where h.attempt_number=3) return_reason_3,
      max(h.reason_name) filter(where h.attempt_number=3) return_reason_3_name,
      max(h.scanned_at) last_return_at,
      count(*)::integer return_count
    from public.be_warehouse_return_scans_v39 h
    where h.delivery_way_id=t.e->>'delivery_way_id'
  ) ret on true
  left join lateral (
    select
      m.wayplan_id,m.membership_status,m.updated_at membership_updated_at,
      w.wayplan_status,w.vehicle_code,w.vehicle_name,
      coalesce(r.review_status,'DRAFT') review_status,r.dispatch_ready_at
    from public.be_wayplan_membership_v40 m
    join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
    left join public.be_wayplan_review_v43 r on r.wayplan_id=m.wayplan_id
    where m.delivery_way_id=t.e->>'delivery_way_id'
      and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      and upper(coalesce(w.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
    order by
      case m.membership_status when 'READY_FOR_DISPATCH' then 1 when 'PLANNED' then 2 else 3 end,
      m.updated_at desc nulls last
    limit 1
  ) plan on true
  left join lateral (
    select ds.scan_status,ds.scanned_at,ds.scanned_by,ds.wayplan_code
    from public.be_dispatch_scans_v39 ds
    where ds.delivery_way_id=t.e->>'delivery_way_id'
    order by ds.updated_at desc nulls last
    limit 1
  ) ds on true
  left join lateral (
    select r.requested_delivery_date,r.reason_code
    from public.be_delivery_reschedules_v71 r
    where r.delivery_way_id=t.e->>'delivery_way_id' and r.status='ACTIVE'
    limit 1
  ) rs on true
  where not public.be_is_pre_golive_uat_key_v1(t.e->>'delivery_way_id');

  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null
      or upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY','READY_FOR_DELIVERY')),
    'ready_for_wayplan',count(*) filter(where e->>'dispatch_workflow_stage'='READY_FOR_WAYPLAN'),
    'waiting_supervisor',count(*) filter(where e->>'dispatch_workflow_stage' in ('IN_WAYPLAN_AWAITING_SUPERVISOR','SUPERVISOR_APPROVED_AWAITING_RELEASE')),
    'dispatch_scan_required',count(*) filter(where coalesce((e->>'dispatch_scan_required')::boolean,false)),
    'dispatch_scanned',count(*) filter(where e->>'dispatch_workflow_stage'='DISPATCH_SCANNED'),
    'scheduled_hold',count(*) filter(where e->>'dispatch_workflow_stage'='SCHEDULED_HOLD'),
    'returned_waiting_replan',count(*) filter(where e->>'dispatch_workflow_stage'='RETURNED_WAITING_REPLAN'),
    'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
    'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
    'rto',count(*) filter(where e->>'dispatch_workflow_stage'='RTO')
  )
  into v_stats
  from jsonb_array_elements(v_rows) e;

  return v_raw||jsonb_build_object(
    'rows',v_rows,
    'stats',v_stats,
    'active_scope','POST_GOLIVE_ONLY',
    'pre_golive_uat_isolated',true,
    'way_id_display','SOURCE_WAYBILL',
    'return_source','be_warehouse_return_scans_v39',
    'dispatch_scan_rule','SUPERVISOR_DISPATCH_READY_ONLY',
    'build','WAREHOUSE_DISPATCH_VISIBILITY_V75'
  );
end;
$function$;

grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;

create or replace function public.be_warehouse_dispatch_scan_queue_v75()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_snapshot jsonb;
  v_rows jsonb;
  v_wayplans jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  v_snapshot:=public.be_warehouse_scan_lifecycle_snapshot();

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

grant execute on function public.be_warehouse_dispatch_scan_queue_v75() to authenticated;

-- Hard gate: Dispatch Scan is allowed only after Supervisor release to DISPATCH_READY.
create or replace function public.be_warehouse_dispatch_scan(
  p_tracking_no text,
  p_actor_email text default null,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text;
  v_actor text;
  v_way text:=nullif(btrim(coalesce(p_tracking_no,'')),'');
  v_wayplan text;
  v_review_status text;
  v_membership_status text;
  v_stage jsonb;
  v_result jsonb;
begin
  v_role:=public.be_warehouse_assert_internal();
  v_actor:=public.be_warehouse_actor_email();
  if v_way is null then raise exception 'Delivery Way ID is required'; end if;

  v_stage:=public.be_warehouse_dispatch_scan_state_v75(v_way);
  if coalesce((v_stage->>'dispatch_scan_allowed')::boolean,false) is not true then
    raise exception '%',
      coalesce(
        nullif(v_stage->>'dispatch_scan_instruction',''),
        'This parcel is not currently released for Dispatch Scan.'
      )
      using errcode='22023';
  end if;

  v_wayplan:=v_stage->>'active_wayplan_id';
  v_review_status:=v_stage->>'supervisor_review_status';
  v_membership_status:=v_stage->>'membership_status';

  if v_wayplan is null
     or upper(coalesce(v_review_status,''))<>'DISPATCH_READY'
     or upper(coalesce(v_membership_status,''))<>'READY_FOR_DISPATCH' then
    raise exception 'Dispatch Scan blocked. Supervisor DISPATCH_READY release is required.' using errcode='22023';
  end if;

  v_result:=public.be_dispatch_scan_parcel_v39(v_way,v_wayplan,v_actor);

  update public.be_wayplan_items
     set dispatch_scan_at=now(),
         dispatch_scan_by=v_actor,
         dispatch_scan_code=coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
         warehouse_scan_status='DISPATCH_SCANNED',
         updated_at=now()
   where tracking_no=v_way or delivery_way_id=v_way;

  update public.be_dispatch_job_assignments
     set dispatch_scan_at=now(),
         updated_by_email=v_actor,
         updated_at=now()
   where tracking_no in (v_way,public.be_operational_way_id_v70(v_way));

  return v_result||jsonb_build_object(
    'ok',true,
    'tracking_no',v_way,
    'operational_way_id',public.be_operational_way_id_v70(v_way),
    'wayplan_code',v_wayplan,
    'dispatch_scan_at',now(),
    'dispatch_workflow_stage','DISPATCH_SCANNED',
    'actor_email',v_actor,
    'authorized_role',v_role,
    'build','WAREHOUSE_DISPATCH_GATE_V75'
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan(text,text,text) to authenticated;

-- Fast scanner: resolve only parcels that are actually released for Dispatch Scan.
create or replace function public.be_warehouse_dispatch_scan_fast_v64(
  p_scan text,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_raw text:=btrim(coalesce(p_scan,''));
  v_actor text;
  v_role text;
  v_way text;
  v_waybill text;
  v_pickup text;
  v_candidate_count integer:=0;
  v_any_way text;
  v_state jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=public.be_warehouse_assert_internal();
  v_actor:=public.be_warehouse_actor_email();

  if v_raw !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return jsonb_build_object('ok',false,'error','INVALID_SCAN','message','Invalid Way ID / Waybill code.');
  end if;

  with candidates as (
    select
      d.delivery_way_id canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) waybill_no,
      row_number() over(
        order by m.updated_at desc nulls last,d.updated_at desc nulls last,d.delivery_way_id
      ) rn,
      count(*) over()::integer candidate_count
    from public.be_wayplan_membership_v40 m
    join public.be_data_entry_parcel_details d on d.delivery_way_id=m.delivery_way_id
    join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
    join public.be_wayplan_review_v43 r on r.wayplan_id=m.wayplan_id
    where m.membership_status='READY_FOR_DISPATCH'
      and upper(coalesce(r.review_status,''))='DISPATCH_READY'
      and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
      and coalesce(d.parcel_status,'')<>'duplicate_archived'
      and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_raw)
  )
  select canonical_id,pickup_id,waybill_no,candidate_count
    into v_way,v_pickup,v_waybill,v_candidate_count
  from candidates where rn=1;

  if v_way is null then
    select d.delivery_way_id
      into v_any_way
    from public.be_data_entry_parcel_details d
    where coalesce(d.parcel_status,'')<>'duplicate_archived'
      and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_raw)
    order by
      case when upper(d.delivery_way_id)=upper(v_raw) then 0 else 1 end,
      d.updated_at desc nulls last
    limit 1;

    if v_any_way is not null then
      v_state:=public.be_warehouse_dispatch_scan_state_v75(v_any_way);
      return jsonb_build_object(
        'ok',false,
        'error','DISPATCH_SCAN_NOT_REQUIRED',
        'message',coalesce(v_state->>'dispatch_scan_instruction','This parcel is not currently released for Dispatch Scan.'),
        'input_scan',v_raw,
        'display_id',public.be_operational_way_id_v70(v_any_way),
        'dispatch_workflow_stage',v_state->>'dispatch_workflow_stage',
        'active_wayplan_id',v_state->>'active_wayplan_id',
        'supervisor_review_status',v_state->>'supervisor_review_status'
      );
    end if;

    if exists(
      select 1 from public.be_data_entry_parcel_details d
      where upper(coalesce(d.pickup_id,''))=upper(v_raw)
    ) then
      return jsonb_build_object(
        'ok',false,
        'error','PICKUP_CODE_NOT_ALLOWED',
        'message','Scan the Way ID / Waybill shown in the Warehouse Dispatch Scan Queue, not the Pickup code.',
        'input_scan',v_raw
      );
    end if;

    return jsonb_build_object(
      'ok',false,'error','WAYBILL_NOT_FOUND',
      'message','Way ID / Waybill not found: '||v_raw,
      'input_scan',v_raw
    );
  end if;

  v_result:=public.be_warehouse_dispatch_scan(
    v_way,v_actor,coalesce(nullif(p_warehouse_code,''),'YGN-MAIN')
  );

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_DISPATCH_OPERATIONAL_WAY_V75',
    'canonical_id',v_way,
    'pickup_id',v_pickup,
    'waybill_no',v_waybill,
    'display_id',v_waybill,
    'input_scan',v_raw,
    'resolved_candidate_count',v_candidate_count,
    'duplicate_auto_resolved',v_candidate_count>1,
    'actor_email',v_actor,
    'authorized_role',v_role
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan_fast_v64(text,text) to authenticated;
