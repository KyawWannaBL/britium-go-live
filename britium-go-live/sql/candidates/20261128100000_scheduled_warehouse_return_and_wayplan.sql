-- A scheduled return records physical custody without creating a failed attempt.
-- This private view lets planning and dispatch share the same custody evidence.
create index if not exists be_warehouse_scheduled_return_events_way_idx
  on public.be_warehouse_receipt_events_v36 (delivery_way_id, created_at)
  where action = 'RESCHEDULE_RETURN_SCAN';

create index if not exists be_active_reschedule_way_alias_idx
  on public.be_delivery_reschedules_v71 (upper(original_way_id)) where status = 'ACTIVE';

create or replace view private.be_physical_warehouse_returns_v1 as
select delivery_way_id, scanned_at
from public.be_warehouse_return_scans_v39
union all
select delivery_way_id, created_at
from public.be_warehouse_receipt_events_v36
where action = 'RESCHEDULE_RETURN_SCAN';

revoke all on private.be_physical_warehouse_returns_v1 from public, anon, authenticated;

create or replace function public.be_delivery_schedule_allows_wayplan_v71(p_delivery_way_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $function$
  select not exists (
    select 1 from public.be_delivery_reschedules_v71 r
    where r.status = 'ACTIVE'
      and (r.delivery_way_id = upper(btrim(p_delivery_way_id))
        or upper(r.original_way_id) = upper(btrim(p_delivery_way_id)))
      and (
        r.requested_delivery_date > (now() at time zone 'Asia/Yangon')::date
        or not exists (
          select 1 from private.be_physical_warehouse_returns_v1 h
          where h.delivery_way_id = r.delivery_way_id
            and h.scanned_at >= r.requested_at
        )
      )
  )
  and not exists (
    select 1 from public.be_delivery_attempt_state_v39 a
    where upper(a.delivery_way_id) = upper(btrim(p_delivery_way_id))
      and (
        upper(coalesce(a.last_status,'')) = 'RTO'
        or (
          upper(coalesce(a.last_status,'')) = 'ATTEMPTED_FAILED'
          and coalesce(a.consecutive_failures,0) >
            (select count(*) from public.be_warehouse_return_scans_v39 h
             where h.delivery_way_id = a.delivery_way_id)
        )
      )
  );
$function$;

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
  v_existing_date date;
  v_parcel public.be_data_entry_parcel_details%rowtype;
  v_appointment public.be_delivery_reschedules_v71%rowtype;
  v_scan_at timestamptz;
  v_actor text;
  v_result jsonb;
  v_schedule jsonb:='{}'::jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  perform public.be_warehouse_assert_internal();
 -- BRANCH_WAREHOUSE_ENTRY_V1
 if replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then
perform public.be_branch_warehouse_require_way_v1(p_tracking_no,'RETURN');p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||'-MAIN';p_actor_email:=public.be_warehouse_actor_email();
 end if;

  if v_input is null then raise exception 'Delivery Way ID is required'; end if;
  v_internal:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_internal is null then raise exception 'Way ID % was not found',v_input; end if;

  -- Serialize against CS appointment changes for the same parcel.
  select * into v_parcel from public.be_data_entry_parcel_details
  where delivery_way_id=v_internal order by updated_at desc nulls last limit 1 for update;

  select * into v_appointment from public.be_delivery_reschedules_v71
  where delivery_way_id=v_internal and status='ACTIVE' for update;

  -- A reschedule from the field can have no failed attempt at all. Require
  -- that route's actual dispatch and stop evidence before accepting custody.
  if v_appointment.reason_code='CUSTOMER_REQUESTED_RESCHEDULE'
     and v_parcel.saved_at is not null
     and upper(coalesce(v_parcel.parcel_status,'')) not in
         ('DELIVERED','COMPLETED','RTO','RETURNED','RETURNED_TO_SENDER','CLOSED','CANCELLED','CANCELED','SETTLED','DUPLICATE_ARCHIVED')
     and not exists (
       select 1 from public.be_delivery_attempt_state_v39 a
       where a.delivery_way_id=v_internal
         and (upper(a.last_status) in ('DELIVERED','RTO','RETURN_TO_SENDER')
           or (upper(a.last_status)='ATTEMPTED_FAILED' and a.consecutive_failures >
             (select count(*) from public.be_warehouse_return_scans_v39 h
              where h.delivery_way_id=v_internal)))
     )
     and not exists (
       select 1 from public.be_wayplan_dispatch_stops s
       where s.delivery_way_id=v_internal
         and (s.delivered_at is not null or upper(s.stop_status) in ('DELIVERED','RTO')
              or upper(s.rider_status) in ('DELIVERED','RTO'))
     )
  then
    select max(h.scanned_at) into v_scan_at
    from private.be_physical_warehouse_returns_v1 h
    where h.delivery_way_id=v_internal and h.scanned_at >= v_appointment.requested_at;

    if v_scan_at is not null then
      return jsonb_build_object('ok',true,'duplicate_return_scan',true,
        'scheduled_return',true,'requested_delivery_date',v_appointment.requested_delivery_date,
        'return_scan_at',v_scan_at);
    end if;

    if exists (
      select 1 from public.be_wayplan_membership_v40 m
      join public.be_wayplan_dispatch_stops s using (wayplan_id,delivery_way_id)
      join public.be_dispatch_scans_v39 ds
        on ds.delivery_way_id=m.delivery_way_id and ds.wayplan_code=m.wayplan_id
      where m.delivery_way_id=v_internal and m.membership_status='ON_HOLD'
        and s.rider_status='DELIVERY_RESCHEDULED' and s.stop_status='RETURN_TO_WAREHOUSE'
        and ds.scan_status='SCANNED' and ds.scanned_at <= v_appointment.requested_at
    ) and not exists (
      select 1 from public.be_wayplan_membership_v40 m
      where m.delivery_way_id=v_internal and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
    ) then
      v_scan_at := clock_timestamp();
      v_actor := public.be_warehouse_actor_email();
      p_warehouse_code := coalesce(nullif(btrim(p_warehouse_code),''),'YGN-MAIN');

      with receipt as (
        update public.be_warehouse_receipts_v36
        set receipt_method='RETURN_SCAN', warehouse_code=p_warehouse_code,
            warehouse_entered_at=v_scan_at, updated_at=v_scan_at
        where pickup_id=v_parcel.pickup_id and parcel_sequence=v_parcel.parcel_sequence
          and delivery_way_id=v_internal and warehouse_status in ('RECEIVED','WAREHOUSE_READY')
        returning pickup_id,parcel_sequence,warehouse_status,staging_zone
      )
      insert into public.be_warehouse_receipt_events_v36
        (pickup_id,parcel_sequence,delivery_way_id,action,previous_status,new_status,
         exception_code,remark,warehouse_code,staging_zone,actor_email,created_at)
      select pickup_id,parcel_sequence,v_internal,'RESCHEDULE_RETURN_SCAN',warehouse_status,warehouse_status,
             v_appointment.reason_code,nullif(btrim(p_remark),''),p_warehouse_code,staging_zone,v_actor,v_scan_at
      from receipt;
      if not found then
        raise exception 'Open the verified Warehouse receipt before returning Way %.',v_input;
      end if;

      return jsonb_build_object('ok',true,'scheduled_return',true,
        'requested_delivery_date',v_appointment.requested_delivery_date,'return_scan_at',v_scan_at);
    end if;
  end if;
  select upper(nullif(btrim(s.last_failure_reason),'')) into v_saved_reason
  from public.be_delivery_attempt_state_v39 s
  where upper(s.delivery_way_id)=v_internal limit 1;
  -- Field-submitted reason is authoritative; Warehouse need not enter it again.
  v_reason:=coalesce(v_saved_reason,v_reason);
  v_effective_date:=p_delivery_date;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' then
    select requested_delivery_date into v_existing_date
    from public.be_delivery_reschedules_v71
    where delivery_way_id=v_internal and status='ACTIVE' limit 1;
    v_effective_date:=coalesce(v_existing_date,p_delivery_date);
  end if;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_effective_date is null then
    raise exception 'Dedicated delivery date is required for customer reschedule';
  end if;

  v_result:=public.be_warehouse_return_scan(
    v_internal,v_reason,p_actor_email,p_remark,p_warehouse_code
  );

  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_result->>'ok'='true' and v_existing_date is null then
    v_schedule:=public.be_set_delivery_reschedule_v71(
      v_internal,v_effective_date,v_reason,p_actor_email,p_remark
    );
  elsif v_existing_date is not null then
    v_schedule:=jsonb_build_object('requested_delivery_date',v_existing_date);
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

revoke all on function public.be_warehouse_return_scan_v71(text,text,date,text,text,text) from public, anon;

CREATE OR REPLACE FUNCTION public.be_wayplan_visible_queue_v124(p_region_code text DEFAULT 'YANGON'::text, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_route_ready integer := 0;
  v_location_pending integer := 0;
begin
  perform public.be_branch_require_region_v1(p_region_code);
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;

  with base as (
    select
      d.delivery_way_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_merchant_name',''),nullif(d.merchant_id,''),'') as merchant_name,
      nullif(d.merchant_id,'') as merchant_code,
      coalesce(d.recipient_name,'') as recipient_name,
      coalesce(d.contact_no_1,'') as recipient_phone,
      coalesce(d.township,'') as township,
      coalesce(d.recipient_address,'') as address,
      coalesce(d.cod_amount,0) as cod_amount,
      coalesce(d.delivery_fee,0) as delivery_fee,
      coalesce(d.weight_kg,0) as parcel_weight_kg,
      'READY_FOR_DISPATCH'::text as dispatch_status,
      r.warehouse_status,
      coalesce(nullif(d.way_management_status,''),'READY_FOR_WAYPLAN') as wayplan_status,
      coalesce(d.updated_at,d.saved_at,d.created_at,now()) as created_at,
      d.delivery_region,
      d.delivery_route_mode,
      d.location_required,
      coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code,
      loc.latitude,
      loc.longitude,
      loc.review_status as location_review_status,
      loc.match_level as location_match_level,
      loc.coordinate_source as location_coordinate_source,
      coalesce((
        d.delivery_route_mode='DOORSTEP_MAP'
        and coalesce(d.location_required,false)
        and loc.review_status='ACCEPTED'
        and loc.latitude between 9 and 29
        and loc.longitude between 92 and 102
        and (
          upper(coalesce(loc.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
          or upper(coalesce(loc.coordinate_source,'')) in ('MANUAL_PIN','PASTED_TOWNSHIP_VALIDATED_COORDINATE')
          or (
            upper(coalesce(loc.coordinate_source,'')) ~ '^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$'
            and loc.match_level in ('ADDRESS_EXACT','POI_EXACT')
          )
          or (
            upper(coalesce(loc.coordinate_source,'')) = 'POSTAL_WARD_DEFAULT_V136'
            and loc.match_level = 'POSTAL_DEFAULT'
          )
          or (
            upper(coalesce(loc.coordinate_source,'')) = 'TOWNSHIP_DEFAULT_V136'
            and loc.match_level = 'TOWNSHIP_DEFAULT'
          )
        )
        and loc.coordinate_source<>'QUARANTINED_BULK_COORDINATE_V30'
        and not (round(loc.latitude::numeric,5)=16.80000 and round(loc.longitude::numeric,5)=96.15000)
        and (
          upper(loc.coordinate_source) = 'MANUAL_PIN'
          or loc.match_level in ('ADDRESS_EXACT','POI_EXACT','POSTAL_DEFAULT','TOWNSHIP_DEFAULT')
          or (
            loc.match_level='MANUAL'
            and loc.coordinate_source in (
              'DATA_ENTRY_MANUAL_PIN_V30','DATA_ENTRY_MANUAL_COORDINATE',
              'PASTED_TOWNSHIP_VALIDATED_COORDINATE','MANAGEMENT_POSTAL_VALIDATED_ADDRESS'
            )
          )
        )
      ),false) as route_ready,
      public.be_delivery_schedule_allows_wayplan_v71(d.delivery_way_id) as wayplan_eligible
    from public.be_data_entry_parcel_details d
    join public.be_warehouse_receipts_v36 r
      on r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
    left join public.be_delivery_location_registry loc
      on loc.delivery_way_id=d.delivery_way_id
    where (replace(public.be_current_role(),'-','_') not in ('branch_manager','branch_office_manager') or public.be_branch_parcel_at_v1(d.delivery_way_id,public.be_branch_scope_v1(null))) and d.delivery_region=v_region
      and upper(coalesce(r.warehouse_status,''))='WAREHOUSE_READY'
      and upper(coalesce(d.financial_validation_status,'')) in ('VALID','OK')
      and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
      and not exists (
        select 1 from public.be_wayplan_membership_v40 m
        where m.delivery_way_id=d.delivery_way_id
          and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      )
  ),
  limited as (
    select * from base
    order by created_at desc, delivery_way_id
    limit greatest(coalesce(p_limit,10000),1)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'delivery_way_id',delivery_way_id,
      'waybill_no',waybill_no,
      'pickup_id',pickup_id,
      'pickup_way_id',pickup_id,
      'merchant_name',merchant_name,
      'merchant_code',merchant_code,
      'recipient_name',recipient_name,
      'recipient_phone',recipient_phone,
      'township',township,
      'address',address,
      'cod_amount',cod_amount,
      'delivery_fee',delivery_fee,
      'parcel_weight_kg',parcel_weight_kg,
      'dispatch_status',dispatch_status,
      'warehouse_status',warehouse_status,
      'wayplan_status',wayplan_status,
      'created_at',created_at,
      'delivery_region',delivery_region,
      'delivery_route_mode',delivery_route_mode,
      'location_required',location_required,
      'service_provider_code',service_provider_code,
      'latitude',case when route_ready then latitude end,
      'longitude',case when route_ready then longitude end,
      'wayplan_eligible',wayplan_eligible,
      'route_ready',route_ready,
      'route_block_reason',case
        when route_ready then null
        when delivery_route_mode is distinct from 'DOORSTEP_MAP' or not coalesce(location_required,false)
          then 'ROAD_PIN_NOT_REQUIRED'
        else 'LOCATION_PENDING'
      end,
      'location_review_status',location_review_status,
      'location_match_level',location_match_level,
      'location_coordinate_source',location_coordinate_source
    ) order by created_at desc, delivery_way_id),'[]'::jsonb),
    count(*)::integer,
    count(*) filter (where route_ready)::integer,
    count(*) filter (where not route_ready and delivery_route_mode='DOORSTEP_MAP' and location_required)::integer
  into v_rows,v_total,v_route_ready,v_location_pending
  from limited;

  return jsonb_build_object(
    'ok',true,
    'region_code',v_region,
    'queue',v_rows,
    'count',v_total,
    'route_ready_count',v_route_ready,
    'location_pending_count',v_location_pending,
    'build','WAYPLAN_VISIBLE_QUEUE_V136_GENERIC_DEFAULTS_20260924'
  );
end
$function$;

revoke all on function public.be_wayplan_visible_queue_v124(text,integer) from public, anon;

CREATE OR REPLACE FUNCTION public.be_warehouse_dispatch_scan_state_v75(p_way_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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

  select r.requested_delivery_date,r.reason_code,r.status,r.requested_at
  into v_reschedule
  from public.be_delivery_reschedules_v71 r
  where r.delivery_way_id=v_way and r.status='ACTIVE'
  limit 1;

  select max(h.scanned_at),count(*)::integer
    into v_return_at,v_return_count
  from public.be_warehouse_return_scans_v39 h
  where h.delivery_way_id=v_way;

  select greatest(v_return_at,max(h.scanned_at)) into v_return_at
  from private.be_physical_warehouse_returns_v1 h
  where h.delivery_way_id=v_way and h.scanned_at >= v_reschedule.requested_at;

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
  elsif v_reschedule.requested_delivery_date is not null
     and (v_return_at is null or v_return_at < v_reschedule.requested_at) then
    v_stage:='AWAITING_RETURN_SCAN';
    v_instruction:='Scan the rescheduled parcel when it is physically back at Warehouse.';
  elsif v_return_at is not null
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

CREATE OR REPLACE FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_base jsonb:=public.be_warehouse_scan_lifecycle_snapshot_v164();
  v_rows jsonb;
  v_stats jsonb;
BEGIN
  WITH src AS MATERIALIZED (
    SELECT r.e,r.ord,
      upper(coalesce(nullif(r.e->>'canonical_delivery_way_id',''),
                     nullif(r.e->>'delivery_way_id',''))) AS way_id
    FROM jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      WITH ORDINALITY r(e,ord)
  ),
  keys AS MATERIALIZED (SELECT DISTINCT way_id FROM src WHERE way_id IS NOT NULL),
  plans_ranked AS (
    SELECT m.delivery_way_id AS way_id,m.wayplan_id,m.membership_status,
       m.updated_at AS membership_updated_at,
       w.wayplan_status,coalesce(rv.review_status,'DRAFT') AS review_status,
       rv.dispatch_ready_at,
       row_number() OVER(PARTITION BY m.delivery_way_id ORDER BY
         CASE m.membership_status
           WHEN 'READY_FOR_DISPATCH' THEN 1
           WHEN 'PLANNED' THEN 2 ELSE 3 END,
         m.updated_at DESC NULLS LAST) AS rn
    FROM public.be_wayplan_membership_v40 m
    JOIN keys k ON k.way_id=m.delivery_way_id
    JOIN public.be_wayplan_dispatches w ON w.wayplan_id=m.wayplan_id
    LEFT JOIN public.be_wayplan_review_v43 rv ON rv.wayplan_id=m.wayplan_id
    WHERE m.membership_status IN ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
       AND upper(coalesce(w.wayplan_status,'')) NOT IN ('COMPLETED','CANCELLED')
  ),
  plans AS MATERIALIZED (SELECT * FROM plans_ranked WHERE rn=1),
  returns AS MATERIALIZED (
    SELECT h.delivery_way_id AS way_id,max(h.scanned_at) AS last_return,
           count(*)::int AS return_count
    FROM public.be_warehouse_return_scans_v39 h
    JOIN keys k ON k.way_id=h.delivery_way_id
    GROUP BY h.delivery_way_id
  ),
  reschedules AS MATERIALIZED (
    SELECT r.delivery_way_id AS way_id,r.requested_delivery_date,
           max(h.scanned_at) AS custody_return_at
    FROM public.be_delivery_reschedules_v71 r
    JOIN keys k ON k.way_id=r.delivery_way_id
    LEFT JOIN private.be_physical_warehouse_returns_v1 h
      ON h.delivery_way_id=r.delivery_way_id AND h.scanned_at>=r.requested_at
    WHERE r.status='ACTIVE'
    GROUP BY r.delivery_way_id,r.requested_delivery_date
  ),
  scans AS MATERIALIZED (
    SELECT d.delivery_way_id AS way_id,d.scan_status,d.scanned_at,
           d.wayplan_code
    FROM public.be_dispatch_scans_v39 d
    JOIN keys k ON k.way_id=d.delivery_way_id
  ),
  attempted AS MATERIALIZED (
    SELECT a.delivery_way_id AS way_id,a.last_status,a.consecutive_failures
    FROM public.be_delivery_attempt_state_v39 a
    JOIN keys k ON k.way_id=a.delivery_way_id
  ),
  source_history AS MATERIALIZED (
    SELECT s.delivery_way_id AS way_id,
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
          'verification',s.metadata->'source_attempt_evidence'->>'verification'
       )) ORDER BY p.metadata->>'work_date',p.wayplan_id) AS history
    FROM public.be_wayplan_dispatch_stops s
    JOIN keys k ON k.way_id=s.delivery_way_id
    JOIN public.be_wayplan_dispatches p ON p.wayplan_id=s.wayplan_id
    WHERE p.metadata->>'completion_basis'='MD_INSTRUCTED_ASSUMPTION'
      AND p.metadata->>'plan_type' IN ('OUTBOUND','THIRD_PARTY')
    GROUP BY s.delivery_way_id
  ),
  computed AS (
    SELECT s.e,s.ord,s.way_id, p.wayplan_id,p.membership_status,
       p.review_status,p.dispatch_ready_at,
       rs.requested_delivery_date,
       coalesce(rt.return_count,0) AS physical_returns,
       greatest(rt.last_return,rs.custody_return_at) AS last_return,
       rs.requested_delivery_date IS NOT NULL AND rs.custody_return_at IS NULL AS scheduled_return_pending,
       CASE
         WHEN upper(coalesce(at.last_status,''))='RTO'
           OR upper(coalesce(s.e->>'delivery_status',''))='RTO'
           THEN 'RTO'
         WHEN upper(coalesce(at.last_status,''))='DELIVERED'
           OR upper(coalesce(s.e->>'delivery_status',''))='DELIVERED'
           THEN 'DELIVERED'
         WHEN rs.requested_delivery_date IS NOT NULL
           AND rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
           THEN 'SCHEDULED_HOLD'
         WHEN rs.requested_delivery_date IS NOT NULL AND rs.custody_return_at IS NULL
           THEN 'AWAITING_RETURN_SCAN'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           AND coalesce(at.consecutive_failures,0)>coalesce(rt.return_count,0)
           THEN 'AWAITING_RETURN_SCAN'
         WHEN greatest(rt.last_return,rs.custody_return_at) IS NOT NULL
           AND (p.wayplan_id IS NULL
                OR coalesce(p.membership_updated_at,'epoch'::timestamptz)<=greatest(rt.last_return,rs.custody_return_at))
           THEN 'RETURNED_WAITING_REPLAN'
         WHEN ds.scan_status='SCANNED' AND p.wayplan_id IS NOT NULL
           AND ds.wayplan_code=p.wayplan_id
           THEN 'DISPATCH_SCANNED'
         WHEN p.wayplan_id IS NOT NULL
           AND p.membership_status='READY_FOR_DISPATCH'
           AND upper(p.review_status)='DISPATCH_READY'
           THEN 'DISPATCH_SCAN_REQUIRED'
         WHEN p.wayplan_id IS NOT NULL AND upper(p.review_status)='APPROVED'
           THEN 'SUPERVISOR_APPROVED_AWAITING_RELEASE'
         WHEN p.wayplan_id IS NOT NULL THEN 'IN_WAYPLAN_AWAITING_SUPERVISOR'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           THEN 'AWAITING_RETURN_SCAN'
         ELSE coalesce(nullif(s.e->>'dispatch_workflow_stage',''),'NOT_RECEIVED')
       END AS reconciled_stage,
       coalesce(h.history,'[]'::jsonb) AS history
    FROM src s
    LEFT JOIN plans p ON p.way_id=s.way_id
    LEFT JOIN returns rt ON rt.way_id=s.way_id
    LEFT JOIN reschedules rs ON rs.way_id=s.way_id
    LEFT JOIN scans ds ON ds.way_id=s.way_id
    LEFT JOIN attempted at ON at.way_id=s.way_id
    LEFT JOIN source_history h ON h.way_id=s.way_id
  ),
  current_custody AS MATERIALIZED (
    SELECT DISTINCT ON (ct.delivery_way_id)
      ct.delivery_way_id, nullif(btrim(ct.provider_code),'') AS provider_code
    FROM keys k
    JOIN public.be_provider_transfer_custody_v1 ct ON ct.delivery_way_id=k.way_id
    WHERE ct.physically_handed_over_at IS NOT NULL
      AND nullif(btrim(ct.provider_code),'') IS NOT NULL
    ORDER BY ct.delivery_way_id,ct.physically_handed_over_at DESC,ct.id DESC
  ),
  provider_routes AS MATERIALIZED (
    SELECT DISTINCT ON (d.delivery_way_id,d.pickup_id)
      d.delivery_way_id,d.pickup_id,d.delivery_route_mode,d.delivery_region,
      coalesce(ct.provider_code,nullif(btrim(cs.provider_code),'')) AS reported_provider,
      confirmation.provider_code AS confirmed_assignment
    FROM keys k
    JOIN public.be_data_entry_parcel_details d ON d.delivery_way_id=k.way_id
    LEFT JOIN current_custody ct ON ct.delivery_way_id=d.delivery_way_id
    LEFT JOIN public.be_thirdparty_cs_current_v1 cs ON cs.delivery_way_id=d.delivery_way_id
    LEFT JOIN private.be_warehouse_provider_assignment_confirmation_v1 confirmation
      ON confirmation.parcel_detail_id=d.id AND confirmation.delivery_way_id=d.delivery_way_id
    WHERE coalesce(d.parcel_status,'') <> 'duplicate_archived'
    ORDER BY d.delivery_way_id,d.pickup_id,d.updated_at DESC NULLS LAST,d.id
  ),
  provider_steps AS (
    SELECT c.*,
      CASE
        WHEN d.delivery_route_mode='ROYAL_EXPRESS' THEN 'Royal Express'
        WHEN d.delivery_route_mode='HIGHWAY_BUS_STATION' THEN 'ဂိတ်ချ · Highway station'
        WHEN d.delivery_region='NAYPYITAW' THEN 'Naypyitaw branch'
      END AS provider_route_label,
      CASE
        WHEN c.reconciled_stage IN ('RTO','DELIVERED','DISPATCH_SCANNED','DISPATCH_SCAN_REQUIRED','SCHEDULED_HOLD','AWAITING_RETURN_SCAN','RETURNED_WAITING_REPLAN')
          OR c.wayplan_id IS NOT NULL THEN NULL
        WHEN d.delivery_route_mode='ROYAL_EXPRESS' THEN
          CASE
            WHEN d.reported_provider IS NULL AND d.confirmed_assignment IS DISTINCT FROM 'ROYAL EXPRESS'
              THEN 'Verify the actual provider against the handoff manifest.'
            WHEN upper(d.reported_provider)<>coalesce(nullif(upper(btrim(d.confirmed_assignment)),''),'ROYAL EXPRESS') THEN
              format('Provider conflict: recorded provider is %s. Verify against the handoff receipt.',d.reported_provider)
          END
        WHEN d.delivery_route_mode='HIGHWAY_BUS_STATION' THEN
          CASE WHEN d.reported_provider IS NOT NULL AND upper(d.reported_provider) NOT IN ('H.TERMINAL DROP-OFF','ဂိတ်ချ')
            THEN format('Provider conflict: recorded provider is %s. Verify against the handoff receipt.',d.reported_provider) END
        WHEN d.delivery_region='NAYPYITAW' THEN
          CASE
            WHEN d.reported_provider IS NULL THEN 'Verify the branch as the actual provider against the transfer manifest.'
            WHEN upper(d.reported_provider) NOT IN ('NPT BRANCH','NAYPYITAW BRANCH') THEN
              format('Provider conflict: recorded provider is %s. Verify against the transfer manifest.',d.reported_provider)
          END
      END AS provider_next_step
    FROM computed c
    LEFT JOIN provider_routes d ON d.delivery_way_id=c.way_id AND d.pickup_id=c.e->>'pickup_id'
  ),
  final_rows AS MATERIALIZED (
    SELECT e || jsonb_build_object(
      'reported_source_history',history,
      'dispatch_workflow_stage',reconciled_stage,
      'current_lifecycle_status',reconciled_stage,
      'active_wayplan_id',wayplan_id,
      'membership_status',membership_status,
      'supervisor_review_status',review_status,
      'supervisor_dispatch_ready_at',dispatch_ready_at,
      'rescheduled_delivery_date',requested_delivery_date,
      'scheduled_return_pending',scheduled_return_pending,
      'return_attempt_count',physical_returns,
      'physical_return_scan_count',physical_returns,
      'last_return_scan_at',last_return,
      'dispatch_scan_required',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_scan_allowed',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_status_source','WAREHOUSE_SET_BASED_RECONCILIATION_V212'
    ) || CASE WHEN provider_next_step IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('provider_route_label',provider_route_label,
                              'provider_review_required',true,
                              'provider_next_step',provider_next_step,
                              'dispatch_scan_instruction',provider_route_label || ' — ' || provider_next_step)
    END AS e,ord,reconciled_stage AS stage
    FROM provider_steps
  )
  SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb),
    jsonb_build_object(
      'rows',count(*),
      'ready_for_wayplan',count(*) FILTER(WHERE stage='READY_FOR_WAYPLAN'),
      'waiting_supervisor',count(*) FILTER(WHERE stage IN
        ('IN_WAYPLAN_AWAITING_SUPERVISOR','SUPERVISOR_APPROVED_AWAITING_RELEASE')),
      'dispatch_scan_required',count(*) FILTER(WHERE stage='DISPATCH_SCAN_REQUIRED'),
      'dispatch_scanned',count(*) FILTER(WHERE stage='DISPATCH_SCANNED'),
      'awaiting_return_scan',count(*) FILTER(WHERE stage='AWAITING_RETURN_SCAN'),
      'scheduled_hold',count(*) FILTER(WHERE stage='SCHEDULED_HOLD'),
      'returned_waiting_replan',count(*) FILTER(WHERE stage='RETURNED_WAITING_REPLAN'),
      'delivered',count(*) FILTER(WHERE stage='DELIVERED'),
      'rto',count(*) FILTER(WHERE stage='RTO')
    )
  INTO v_rows,v_stats
  FROM final_rows;
  RETURN v_base || jsonb_build_object(
    'rows',v_rows,
    'stats',coalesce(v_base->'stats','{}'::jsonb)||v_stats,
    'build','WAREHOUSE_SET_BASED_RECONCILIATION_V212',
    'dispatch_scan_reconciliation','SET_BASED_NO_PER_ROW_RPC_V212'
  );
END
$function$;
