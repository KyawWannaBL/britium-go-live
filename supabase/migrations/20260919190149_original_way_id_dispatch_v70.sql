-- V70: original Way ID is the operational identity after Wayplan creation.
-- Consolidated P... row IDs remain internal linkage only.

create or replace function public.be_operational_way_id_v70(p_internal_way_id text)
returns text
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce(
    (
      select nullif(d.financial_quote->>'source_waybill_no','')
      from public.be_data_entry_parcel_details d
      where d.delivery_way_id=p_internal_way_id
      order by d.updated_at desc nulls last,d.saved_at desc nulls last
      limit 1
    ),
    p_internal_way_id
  );
$function$;

grant execute on function public.be_operational_way_id_v70(text) to authenticated;

create or replace function public.be_resolve_internal_way_id_v70(p_way_id text,p_wayplan_id text default null)
returns text
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  with candidates as (
    select
      d.delivery_way_id,
      row_number() over(
        order by
          case when upper(d.delivery_way_id)=upper(p_way_id) then 0 else 1 end,
          case when p_wayplan_id is not null and exists(
            select 1 from public.be_wayplan_membership_v40 m
            where m.wayplan_id=p_wayplan_id and m.delivery_way_id=d.delivery_way_id
              and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
          ) then 0 else 1 end,
          d.updated_at desc nulls last,
          d.created_at desc nulls last
      ) rn
    from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=upper(p_way_id)
       or upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),''))=upper(p_way_id)
  )
  select delivery_way_id from candidates where rn=1;
$function$;

grant execute on function public.be_resolve_internal_way_id_v70(text,text) to authenticated;

-- Compatibility RPC used by Dispatch Command. Accept original printed D... IDs,
-- resolve to hidden internal P... rows, then execute canonical status logic.
create or replace function public.be_driver_update_delivery_status(
  p_tracking_no text,
  p_status text,
  p_actor_email text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_original text:=nullif(btrim(coalesce(p_tracking_no,'')),'');
  v_internal text;
  v_wayplan text;
  v_result jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authentication required';
  end if;
  if v_original is null then raise exception 'Way ID is required'; end if;

  select a.wayplan_code into v_wayplan
  from public.be_dispatch_job_assignments a
  where upper(a.tracking_no)=upper(v_original)
  order by a.updated_at desc nulls last limit 1;

  v_internal:=public.be_resolve_internal_way_id_v70(v_original,v_wayplan);
  if v_internal is null then raise exception 'Way ID % was not found',v_original; end if;

  v_result:=public.be_dispatch_update_delivery_status_v39(
    v_internal,p_status,p_actor_email,p_note,null
  );

  update public.be_dispatch_job_assignments
  set delivery_status=coalesce(v_result->>'status',upper(p_status)),
      dispatch_status=coalesce(v_result->>'status',upper(p_status)),
      failed_reason=case when upper(p_status) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED','RTO') then coalesce(nullif(p_note,''),failed_reason) else failed_reason end,
      driver_note=case when nullif(p_note,'') is not null then p_note else driver_note end,
      updated_by_email=coalesce(nullif(p_actor_email,''),auth.jwt()->>'email',updated_by_email),
      updated_at=now()
  where upper(tracking_no)=upper(v_original)
     or upper(tracking_no)=upper(v_internal);

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'input_way_id',v_original,
    'operational_way_id',public.be_operational_way_id_v70(v_internal),
    'internal_delivery_way_id',v_internal,
    'build','DRIVER_STATUS_ORIGINAL_WAY_ID_V70'
  );
end;
$function$;

grant execute on function public.be_driver_update_delivery_status(text,text,text,text) to authenticated;

-- Keep existing release validation/publish behavior, then normalize field-operation
-- job keys to the original printed Way ID.
create or replace function public.be_publish_wayplan_to_dispatch(
  p_wayplan_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text;
  v_actor text;
  v_result jsonb;
begin
  v_role:=public.be_dispatch_assert_internal();
  v_actor:=public.be_dispatch_actor_email();

  v_result:=public.be_publish_wayplan_to_dispatch_legacy_v47(p_wayplan_code,v_actor);

  -- Upsert original printed IDs as the operational Dispatch/Rider job identity.
  insert into public.be_dispatch_job_assignments(
    tracking_no,wayplan_code,asset_code,delivery_status,dispatch_status,
    failed_attempts,failed_reason,driver_note,published_to_rider,published_at,
    assigned_by_email,updated_by_email,created_at,updated_at,
    inbound_scan_at,dispatch_scan_at,return_attempt_count,rto_at,
    exception_status,next_attempt_priority,last_exception_code,last_exception_reason,
    rider_email,driver_email,helper_email
  )
  select
    public.be_operational_way_id_v70(m.delivery_way_id) as tracking_no,
    j.wayplan_code,j.asset_code,j.delivery_status,j.dispatch_status,
    j.failed_attempts,j.failed_reason,j.driver_note,j.published_to_rider,j.published_at,
    j.assigned_by_email,j.updated_by_email,j.created_at,now(),
    j.inbound_scan_at,j.dispatch_scan_at,j.return_attempt_count,j.rto_at,
    j.exception_status,j.next_attempt_priority,j.last_exception_code,j.last_exception_reason,
    j.rider_email,j.driver_email,j.helper_email
  from public.be_wayplan_membership_v40 m
  join public.be_dispatch_job_assignments j
    on j.wayplan_code=m.wayplan_id and j.tracking_no=m.delivery_way_id
  where m.wayplan_id=p_wayplan_code
    and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
  on conflict(tracking_no) do update set
    wayplan_code=excluded.wayplan_code,
    asset_code=excluded.asset_code,
    delivery_status=excluded.delivery_status,
    dispatch_status=excluded.dispatch_status,
    published_to_rider=excluded.published_to_rider,
    published_at=excluded.published_at,
    assigned_by_email=excluded.assigned_by_email,
    updated_by_email=excluded.updated_by_email,
    dispatch_scan_at=coalesce(excluded.dispatch_scan_at,public.be_dispatch_job_assignments.dispatch_scan_at),
    updated_at=now();

  -- Remove hidden P... aliases from the field-operation job table once
  -- an original D... operational key has been created.
  delete from public.be_dispatch_job_assignments j
  using public.be_wayplan_membership_v40 m
  where m.wayplan_id=p_wayplan_code
    and j.wayplan_code=p_wayplan_code
    and j.tracking_no=m.delivery_way_id
    and public.be_operational_way_id_v70(m.delivery_way_id)<>m.delivery_way_id
    and exists(
      select 1 from public.be_dispatch_job_assignments x
      where x.wayplan_code=p_wayplan_code
        and x.tracking_no=public.be_operational_way_id_v70(m.delivery_way_id)
    );

  -- If legacy Wayplan item rows exist, show/operate with original IDs while
  -- retaining delivery_way_id as the hidden internal relationship.
  update public.be_wayplan_items i
  set tracking_no=public.be_operational_way_id_v70(i.delivery_way_id),
      waybill_no=public.be_operational_way_id_v70(i.delivery_way_id),
      updated_at=now()
  where coalesce(nullif(i.wayplan_code,''),nullif(i.wayplan_no,''),nullif(i.wayplan_id,''))=p_wayplan_code
    and nullif(i.delivery_way_id,'') is not null;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'authorized_role',v_role,
    'actor_email',v_actor,
    'auth_enforced',true,
    'operational_way_id','ORIGINAL_SOURCE_WAYBILL',
    'internal_bulk_id_hidden',true,
    'build','DISPATCH_PUBLISH_ORIGINAL_WAY_ID_V70'
  );
end;
$function$;

grant execute on function public.be_publish_wayplan_to_dispatch(text,text) to authenticated;

-- Dispatch Command snapshot displays original Way IDs but retains an explicit hidden
-- internal ID for canonical joins and scan accounting.
create or replace function public.be_dispatch_command_snapshot_v63()
returns jsonb
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
with active_wayplans as (
  select
    d.wayplan_id,d.wayplan_id as wayplan_code,d.wayplan_status,d.total_stops,
    d.vehicle_code,d.vehicle_name,d.driver_code,d.driver_name,
    nullif(d.rider_code,'') as rider_code,nullif(d.rider_name,'') as rider_name,
    nullif(d.helper_code,'') as helper_code,nullif(d.helper_name,'') as helper_name,
    d.created_at,d.updated_at,d.dispatched_at,
    coalesce(r.review_status,'DRAFT') as review_status,r.submitted_at,r.reviewed_at,
    r.dispatch_ready_at,r.dispatched_at as review_dispatched_at
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  where upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
), plan_counts as (
  select w.*,
    coalesce(m.parcel_count,0) parcel_count,coalesce(m.planned_count,0) planned_count,
    coalesce(m.ready_count,0) ready_count,coalesce(m.dispatched_count,0) dispatched_count,
    coalesce(s.scanned_count,0) scanned_count
  from active_wayplans w
  left join lateral (
    select
      count(*) filter(where membership_status not in ('CANCELLED','COMPLETED','RTO'))::integer parcel_count,
      count(*) filter(where membership_status='PLANNED')::integer planned_count,
      count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer ready_count,
      count(*) filter(where membership_status='DISPATCHED')::integer dispatched_count
    from public.be_wayplan_membership_v40 m where m.wayplan_id=w.wayplan_id
  ) m on true
  left join lateral (
    select count(distinct ds.delivery_way_id)::integer scanned_count
    from public.be_dispatch_scans_v39 ds
    where ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
  ) s on true
), jobs as (
  select
    s.wayplan_id as wayplan_code,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as tracking_no,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as delivery_way_id,
    s.delivery_way_id as internal_delivery_way_id,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as waybill_no,
    coalesce(w.vehicle_code,m.vehicle_code,'UNASSIGNED') as asset_code,
    coalesce(w.vehicle_name,w.vehicle_code,m.vehicle_code,'UNASSIGNED') as asset_name,
    coalesce(s.recipient_name,p.recipient_name) recipient_name,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) recipient_phone,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) phone_number,
    coalesce(s.township,s.delivery_township,s.recipient_township,p.township) delivery_township,
    coalesce(s.address,s.delivery_address,p.recipient_address) recipient_address,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0) cod_amount,
    coalesce(p.delivery_charges,p.delivery_fee,0) delivery_charges,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0)+coalesce(p.delivery_charges,p.delivery_fee,0) total_collected_amount,
    coalesce(s.parcel_weight_kg,p.weight_kg,0) weight_kg,
    s.stop_sequence parcel_sequence,s.stop_sequence route_sequence,
    coalesce(s.rider_status,'PENDING') delivery_status,
    case when upper(coalesce(w.wayplan_status,''))='DISPATCHED' then 'OUT_FOR_DELIVERY'
         when w.review_status='DISPATCH_READY' then 'DISPATCH_READY'
         else w.review_status end dispatch_status,
    coalesce(s.warehouse_status,p.warehouse_status,'') warehouse_status,
    m.membership_status,coalesce(s.scan_count,0) scan_count,
    exists(select 1 from public.be_dispatch_scans_v39 ds
      where ds.wayplan_code=s.wayplan_id and ds.delivery_way_id=s.delivery_way_id and ds.scan_status='SCANNED') dispatch_scanned,
    w.review_status,w.driver_code,w.driver_name,w.rider_code,w.rider_name,w.helper_code,w.helper_name,
    p.pickup_id,p.merchant_id merchant_code,null::text merchant_name
  from public.be_wayplan_dispatch_stops s
  join plan_counts w on w.wayplan_id=s.wayplan_id
  left join public.be_wayplan_membership_v40 m on m.wayplan_id=s.wayplan_id and m.delivery_way_id=s.delivery_way_id
  left join public.be_data_entry_parcel_details p on p.delivery_way_id=s.delivery_way_id
), assets as (
  select distinct coalesce(vehicle_code,'UNASSIGNED') asset_code,
    coalesce(vehicle_name,vehicle_code,'UNASSIGNED') asset_name,
    'DELIVERY'::text operation_type,true active
  from plan_counts
), wp_json as (
  select coalesce(jsonb_agg(
    to_jsonb(p)||jsonb_build_object(
      'wayplan_no',p.wayplan_id,
      'scan_remaining',greatest(p.parcel_count-p.scanned_count,0),
      'publish_ready',p.review_status='DISPATCH_READY' and p.ready_count=p.parcel_count and p.scanned_count=p.parcel_count and p.parcel_count>0,
      'next_step',case
        when p.review_status in ('DRAFT','PENDING_REVIEW') then 'Supervisor approval required'
        when p.review_status='APPROVED' then 'Release approved Wayplan to DISPATCH_READY'
        when p.review_status='DISPATCH_READY' and p.scanned_count<p.parcel_count then format('%s parcel(s) still require mandatory Dispatch scan',p.parcel_count-p.scanned_count)
        when p.review_status='DISPATCH_READY' then 'Ready to publish'
        when p.review_status='DISPATCHED' then 'Published to field operation'
        else 'Review Wayplan status' end
    )
    order by case p.review_status when 'DISPATCH_READY' then 1 when 'APPROVED' then 2 when 'PENDING_REVIEW' then 3 when 'DRAFT' then 4 when 'DISPATCHED' then 5 else 6 end,p.updated_at desc
  ),'[]'::jsonb) value from plan_counts p
), job_json as (
  select coalesce(jsonb_agg(to_jsonb(j) order by j.wayplan_code,j.parcel_sequence,j.tracking_no),'[]'::jsonb) value from jobs j
), asset_json as (
  select coalesce(jsonb_agg(to_jsonb(a) order by a.asset_code),'[]'::jsonb) value from assets a
), stats as (
  select jsonb_build_object(
    'wayplans',(select count(*) from plan_counts),'jobs',(select count(*) from jobs),
    'pending',(select count(*) from jobs where review_status in ('DRAFT','PENDING_REVIEW','APPROVED','DISPATCH_READY')),
    'out_for_delivery',(select count(*) from jobs where upper(coalesce(dispatch_status,''))='OUT_FOR_DELIVERY'),
    'delivered',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('DELIVERED','COMPLETED','DROP_OFF')),
    'failed',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED')),
    'rto',(select count(*) from jobs where upper(coalesce(delivery_status,''))='RTO'),
    'cod',coalesce((select sum(cod_amount) from jobs),0)
  ) value
)
select jsonb_build_object(
  'ok',true,'build','DISPATCH_COMMAND_V70_ORIGINAL_WAY_ID',
  'stats',(select value from stats),'wayplans',(select value from wp_json),
  'jobs',(select value from job_json),'assets',(select value from asset_json),
  'zones','[]'::jsonb,'source','CANONICAL_WAYPLAN_V40_V43',
  'operational_way_id','ORIGINAL_SOURCE_WAYBILL'
);
$function$;

grant execute on function public.be_dispatch_command_snapshot_v63() to authenticated;
