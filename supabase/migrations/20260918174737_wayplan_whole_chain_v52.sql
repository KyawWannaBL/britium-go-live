-- V52: align reviewed route storage with Supervisor review and multi-township Wayplans.

create or replace function public.be_wayplan_route_status_v45(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.be_wayplan_route_plans_v45%rowtype;
  v_route public.be_wayplan_route_versions_v1%rowtype;
  v_count integer := 0;
  v_route_count integer := 0;
begin
  select count(*)::integer
  into v_count
  from public.be_wayplan_membership_v40
  where wayplan_id = p_wayplan_id
    and membership_status not in ('CANCELLED','COMPLETED');

  select *
  into v_plan
  from public.be_wayplan_route_plans_v45
  where wayplan_id = p_wayplan_id
    and route_status = 'READY';

  if v_plan.wayplan_id is not null and v_plan.stop_count = v_count then
    return jsonb_build_object(
      'ok', true,
      'wayplan_id', p_wayplan_id,
      'route_ready', true,
      'route_store', 'LEGACY_V45',
      'membership_count', coalesce(v_count,0),
      'route_stop_count', coalesce(v_plan.stop_count,0),
      'origin_code', v_plan.origin_code,
      'route_mode', v_plan.route_mode,
      'route_source', coalesce(v_plan.metadata->>'route_source','LEGACY_ROUTE_PLAN_V45'),
      'profile', v_plan.profile,
      'distance_m', v_plan.distance_m,
      'duration_s', v_plan.duration_s,
      'optimized_at', v_plan.optimized_at
    );
  end if;

  select *
  into v_route
  from public.be_wayplan_route_versions_v1
  where wayplan_id = p_wayplan_id
    and version_type in ('GENERATED','OPERATOR_RECALCULATION')
    and upper(coalesce(route_source,'')) in ('GOOGLE_ROUTES','MAPBOX_FALLBACK','OPERATOR_EDITED')
  order by route_version desc
  limit 1;

  if v_route.wayplan_id is not null then
    v_route_count := case
      when jsonb_typeof(v_route.ordered_stops) = 'array' then jsonb_array_length(v_route.ordered_stops)
      else 0
    end;

    return jsonb_build_object(
      'ok', v_route_count = v_count and v_count > 0,
      'wayplan_id', p_wayplan_id,
      'route_ready', v_route_count = v_count and v_count > 0,
      'route_store', 'OPERATIONAL_ROUTE_V1',
      'route_version', v_route.route_version,
      'membership_count', coalesce(v_count,0),
      'route_stop_count', v_route_count,
      'origin_code', coalesce(v_route.origin->>'branch_code', v_route.origin->>'code'),
      'route_mode', v_route.route_mode,
      'route_source', v_route.route_source,
      'profile', 'DRIVING',
      'distance_m', v_route.distance_m,
      'duration_s', v_route.duration_s,
      'optimized_at', v_route.created_at
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'wayplan_id', p_wayplan_id,
    'route_ready', false,
    'route_store', 'NONE',
    'membership_count', coalesce(v_count,0),
    'route_stop_count', 0
  );
end;
$function$;

create or replace function public.be_wayplan_validate_review_v43(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_count integer:=0;
  v_route_count integer:=0;
  v_route text;
  v_invalid text[]:='{}'::text[];
  v_statuses text[]:='{}'::text[];
  v_missing_assignment integer:=0;
  v_assignment_modes text[]:='{}'::text[];
  v_auth_invalid integer:=0;
  v_route_status jsonb;
  v_route_group text;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  select count(*)::integer,
         count(distinct route_zone)::integer,
         min(route_zone),
         array_agg(distinct membership_status order by membership_status),
         array_agg(distinct upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED'))),
         count(*) filter(where
           case upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED'))
             when 'RIDER' then coalesce(rider_code,rider_name,'')=''
             when 'VEHICLE_CREW' then coalesce(vehicle_code,vehicle_name,'')='' or coalesce(driver_code,driver_name,'')=''
             else coalesce(rider_code,rider_name,'')='' or coalesce(vehicle_code,vehicle_name,'')='' end)::integer
  into v_count,v_route_count,v_route,v_statuses,v_assignment_modes,v_missing_assignment
  from public.be_wayplan_membership_v40
  where wayplan_id=v_wayplan and membership_status not in ('CANCELLED','COMPLETED');

  if v_count=0 then raise exception 'Wayplan % has no active parcel membership',v_wayplan; end if;
  if coalesce(cardinality(v_assignment_modes),0)<>1 then raise exception 'Wayplan % contains mixed assignment modes',v_wayplan; end if;
  if v_missing_assignment>0 then
    if v_assignment_modes[1]='RIDER' then raise exception 'Wayplan % Rider Delivery assignment is missing Rider',v_wayplan;
    elsif v_assignment_modes[1]='VEHICLE_CREW' then raise exception 'Wayplan % Vehicle Crew assignment requires Vehicle and Driver; Helper is optional',v_wayplan;
    else raise exception 'Wayplan % is missing Rider or Vehicle assignment',v_wayplan; end if;
  end if;
  if exists(select 1 from public.be_wayplan_membership_v40 where wayplan_id=v_wayplan and membership_status in ('DISPATCHED','RTO','ON_HOLD')) then
    raise exception 'Wayplan % contains dispatched, RTO, or held membership and cannot enter review',v_wayplan;
  end if;

  v_route_status := public.be_wayplan_route_status_v45(v_wayplan);
  if not coalesce((v_route_status->>'ok')::boolean,false) then
    raise exception 'Wayplan % requires one complete reviewed road route before Supervisor review',v_wayplan;
  end if;
  v_route_group := case
    when v_route_count = 1 and coalesce(v_route,'') <> '' then v_route
    else 'ROAD_ROUTE:' || v_wayplan
  end;

  select coalesce(array_agg(m.delivery_way_id order by m.delivery_way_id),'{}'::text[])
    into v_invalid
  from public.be_wayplan_membership_v40 m
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id=m.delivery_way_id
  where m.wayplan_id=v_wayplan and m.membership_status not in ('CANCELLED','COMPLETED')
    and (v.delivery_way_id is null or v.warehouse_status<>'WAREHOUSE_READY' or coalesce(v.discrepancy_code,'')<>'' or coalesce(v.delivery_attempt_status,'')='RTO'
         or not exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=m.delivery_way_id and upper(coalesce(d.financial_validation_status,'')) in ('VALID','OK')));

  select count(*)::integer into v_auth_invalid
  from (
    select distinct rider_code,driver_code,helper_code,
      upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED')) as mode
    from public.be_wayplan_membership_v40
    where wayplan_id=v_wayplan and membership_status not in ('CANCELLED','COMPLETED')
  ) x
  where (x.rider_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.rider_code) and upper(coalesce(a.role,''))='RIDER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)))
     or (x.driver_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.driver_code) and upper(coalesce(a.role,''))='DRIVER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)))
     or (x.helper_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.helper_code) and upper(coalesce(a.role,''))='HELPER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)));

  return jsonb_build_object(
    'ok',coalesce(cardinality(v_invalid),0)=0 and v_auth_invalid=0,
    'wayplan_id',v_wayplan,
    'parcel_count',v_count,
    'route_group',v_route_group,
    'route_zone_count',v_route_count,
    'route_status',v_route_status,
    'assignment_mode',v_assignment_modes[1],
    'membership_statuses',to_jsonb(v_statuses),
    'invalid_way_ids',to_jsonb(v_invalid),
    'invalid_count',coalesce(cardinality(v_invalid),0),
    'assignment_complete',v_missing_assignment=0,
    'auth_mapping_valid',v_auth_invalid=0,
    'helper_optional',true
  );
end;
$function$;

create or replace function public.be_wayplan_submit_review_v45(p_wayplan_id text, p_actor_email text default null::text, p_notes text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status jsonb;
  v_result jsonb;
begin
  v_status := public.be_wayplan_route_status_v45(p_wayplan_id);
  if not coalesce((v_status ->> 'ok')::boolean, false) then
    raise exception 'A complete reviewed road route is required before Supervisor review. Route status: %', v_status;
  end if;
  v_result := public.be_wayplan_submit_review_v43(p_wayplan_id, p_actor_email, p_notes);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('reviewed_route_v52', v_status);
end;
$function$;

create or replace function public.be_wayplan_supervisor_decide_v45(p_wayplan_id text, p_decision text, p_notes text default null::text, p_actor_email text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_decision text := upper(regexp_replace(btrim(coalesce(p_decision, '')), '[^A-Za-z]+', '_', 'g'));
  v_status jsonb;
  v_result jsonb;
begin
  if v_decision in ('APPROVE','APPROVED') then
    v_status := public.be_wayplan_route_status_v45(p_wayplan_id);
    if not coalesce((v_status ->> 'ok')::boolean, false) then
      raise exception 'Supervisor approval stopped: the complete reviewed road route has not been saved';
    end if;
  end if;
  v_result := public.be_wayplan_supervisor_decide_v43(p_wayplan_id, p_decision, p_notes, p_actor_email);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('reviewed_route_v52', coalesce(v_status, public.be_wayplan_route_status_v45(p_wayplan_id)));
end;
$function$;
