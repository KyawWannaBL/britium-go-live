create or replace function public.be_wayplan_route_status_v45(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_plan public.be_wayplan_route_plans_v45%rowtype;
  v_route public.be_wayplan_route_versions_v1%rowtype;
  v_count integer := 0;
  v_route_count integer := 0;
  v_assignment_ready boolean := false;
  v_road_ready boolean := false;
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
      'assignment_ready', true,
      'route_ready', true,
      'road_route_deferred', false,
      'wayplan_id', p_wayplan_id,
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
    and upper(coalesce(route_source,'')) in (
      'GOOGLE_ROUTES',
      'MAPBOX_FALLBACK',
      'OPERATOR_EDITED',
      'DEFERRED_PROVIDER',
      'DEFERRED_LOCATION'
    )
  order by route_version desc
  limit 1;

  if v_route.wayplan_id is not null then
    v_route_count := case
      when jsonb_typeof(v_route.ordered_stops) = 'array' then jsonb_array_length(v_route.ordered_stops)
      else 0
    end;
    v_assignment_ready := v_route_count = v_count and v_count > 0;
    v_road_ready := v_assignment_ready
      and upper(coalesce(v_route.route_source,'')) in ('GOOGLE_ROUTES','MAPBOX_FALLBACK','OPERATOR_EDITED');

    return jsonb_build_object(
      'ok', v_assignment_ready,
      'assignment_ready', v_assignment_ready,
      'route_ready', v_road_ready,
      'road_route_deferred', v_assignment_ready and not v_road_ready,
      'wayplan_id', p_wayplan_id,
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
      'optimized_at', v_route.created_at,
      'warning', case
        when v_assignment_ready and not v_road_ready then
          'Road optimization is deferred, but the complete ordered Wayplan assignment is available for Supervisor review.'
        else null
      end
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'assignment_ready', false,
    'route_ready', false,
    'road_route_deferred', false,
    'wayplan_id', p_wayplan_id,
    'route_store', 'NONE',
    'membership_count', coalesce(v_count,0),
    'route_stop_count', 0
  );
end;
$function$;
