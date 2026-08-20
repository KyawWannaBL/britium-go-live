-- Britium Express Wayplan V45
-- Fixed Head Office Mapbox origin -> geocoded delivery stops -> optimized/saved stop sequence -> Supervisor review -> Rider route.
-- Requires Wayplan V40, V43, V44 and a Mapbox access token in the frontend environment.

create extension if not exists pgcrypto;

create or replace function public.be_wayplan_try_numeric_v45(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then return null; end if;
  return p_value::numeric;
exception when others then
  return null;
end;
$$;

create table if not exists public.be_wayplan_route_hubs_v45 (
  hub_code text primary key,
  branch_code text not null default 'YGN',
  hub_name text not null,
  address text,
  longitude numeric not null,
  latitude numeric not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint be_wayplan_route_hubs_v45_lng check (longitude between -180 and 180),
  constraint be_wayplan_route_hubs_v45_lat check (latitude between -90 and 90)
);

insert into public.be_wayplan_route_hubs_v45(
  hub_code, branch_code, hub_name, address, longitude, latitude, is_default, active
) values (
  'HUB_EAST_DAGON', 'YGN', 'Britium Ventures Head Office', 'East Dagon, Yangon', 96.199675, 16.889554, true, true
)
on conflict (hub_code) do update set
  branch_code = excluded.branch_code,
  hub_name = excluded.hub_name,
  address = excluded.address,
  longitude = excluded.longitude,
  latitude = excluded.latitude,
  is_default = true,
  active = true,
  updated_at = now();

-- Prefer the live Dispatch service-location record when it exists.
do $$
declare
  v_row jsonb;
begin
  if to_regclass('public.be_dispatch_service_locations') is not null then
    begin
      execute $q$
        select to_jsonb(x)
        from public.be_dispatch_service_locations x
        where coalesce(to_jsonb(x) ->> 'location_code', '') = 'HUB_EAST_DAGON'
          and coalesce((to_jsonb(x) ->> 'active')::boolean, true)
        limit 1
      $q$ into v_row;
      if v_row is not null
         and public.be_wayplan_try_numeric_v45(v_row ->> 'longitude') is not null
         and public.be_wayplan_try_numeric_v45(v_row ->> 'latitude') is not null then
        update public.be_wayplan_route_hubs_v45
        set hub_name = coalesce(nullif(v_row ->> 'location_name', ''), hub_name),
            address = coalesce(nullif(v_row ->> 'address', ''), address),
            longitude = public.be_wayplan_try_numeric_v45(v_row ->> 'longitude'),
            latitude = public.be_wayplan_try_numeric_v45(v_row ->> 'latitude'),
            updated_at = now()
        where hub_code = 'HUB_EAST_DAGON';
      end if;
    exception when others then
      null;
    end;
  end if;
end;
$$;

create table if not exists public.be_wayplan_route_plans_v45 (
  wayplan_id text primary key,
  route_status text not null default 'READY',
  origin_code text not null,
  origin_name text not null,
  origin_address text,
  origin_longitude numeric not null,
  origin_latitude numeric not null,
  profile text not null default 'mapbox/driving-traffic',
  route_mode text not null,
  stop_count integer not null,
  ordered_stops jsonb not null,
  geometry jsonb not null,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 1,
  route_version integer not null default 1,
  optimized_by text,
  optimized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_wayplan_route_plans_v45_status check (route_status in ('READY','SUPERSEDED','CANCELLED')),
  constraint be_wayplan_route_plans_v45_profile check (profile in ('mapbox/driving','mapbox/driving-traffic','mapbox/cycling')),
  constraint be_wayplan_route_plans_v45_stop_count check (stop_count > 0),
  constraint be_wayplan_route_plans_v45_origin_lng check (origin_longitude between -180 and 180),
  constraint be_wayplan_route_plans_v45_origin_lat check (origin_latitude between -90 and 90)
);

create table if not exists public.be_wayplan_route_events_v45 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  event_type text not null,
  actor_email text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists be_wayplan_route_events_v45_wayplan_idx
  on public.be_wayplan_route_events_v45(wayplan_id, event_at desc);

alter table public.be_wayplan_route_hubs_v45 enable row level security;
alter table public.be_wayplan_route_plans_v45 enable row level security;
alter table public.be_wayplan_route_events_v45 enable row level security;
revoke all on public.be_wayplan_route_hubs_v45 from public, anon, authenticated;
revoke all on public.be_wayplan_route_plans_v45 from public, anon, authenticated;
revoke all on public.be_wayplan_route_events_v45 from public, anon, authenticated;

create or replace function public.be_wayplan_head_office_v45(p_branch_code text default 'YGN')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hub public.be_wayplan_route_hubs_v45;
begin
  select * into v_hub
  from public.be_wayplan_route_hubs_v45
  where active
    and branch_code = upper(coalesce(nullif(btrim(p_branch_code), ''), 'YGN'))
  order by is_default desc, updated_at desc
  limit 1;

  if v_hub.hub_code is null then
    select * into v_hub
    from public.be_wayplan_route_hubs_v45
    where active
    order by is_default desc, updated_at desc
    limit 1;
  end if;

  if v_hub.hub_code is null then raise exception 'No active Head Office route hub is configured'; end if;

  return jsonb_build_object(
    'code', v_hub.hub_code,
    'branch_code', v_hub.branch_code,
    'name', v_hub.hub_name,
    'address', v_hub.address,
    'longitude', v_hub.longitude,
    'latitude', v_hub.latitude,
    'fixed_origin', true
  );
end;
$$;

create or replace function public.be_wayplan_route_snapshot_v45(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_origin jsonb;
  v_stops jsonb;
  v_plan jsonb;
  v_count integer := 0;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if to_regclass('public.be_wayplan_membership_v40') is null then raise exception 'Wayplan V40 is required before V45'; end if;

  v_origin := public.be_wayplan_head_office_v45('YGN');

  with membership as (
    select m.*, to_jsonb(v) as warehouse_json
    from public.be_wayplan_membership_v40 m
    left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
    where m.wayplan_id = v_wayplan
      and m.membership_status not in ('CANCELLED','COMPLETED')
  ), normalized as (
    select
      m.delivery_way_id,
      m.pickup_id,
      m.route_zone,
      m.membership_status,
      coalesce(nullif(m.warehouse_json ->> 'recipient_name', ''), nullif(m.metadata ->> 'recipient_name', '')) as recipient_name,
      coalesce(nullif(m.warehouse_json ->> 'recipient_phone', ''), nullif(m.metadata ->> 'recipient_phone', '')) as recipient_phone,
      coalesce(nullif(m.warehouse_json ->> 'recipient_address', ''), nullif(m.warehouse_json ->> 'delivery_address', ''), nullif(m.metadata ->> 'recipient_address', '')) as address,
      coalesce(nullif(m.warehouse_json ->> 'township', ''), nullif(m.warehouse_json ->> 'delivery_township', ''), nullif(m.metadata ->> 'township', '')) as township,
      coalesce(
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'recipient_longitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'delivery_longitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'longitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'lng'),
        public.be_wayplan_try_numeric_v45(m.metadata #>> '{mapbox_route_v45,longitude}')
      ) as longitude,
      coalesce(
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'recipient_latitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'delivery_latitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'latitude'),
        public.be_wayplan_try_numeric_v45(m.warehouse_json ->> 'lat'),
        public.be_wayplan_try_numeric_v45(m.metadata #>> '{mapbox_route_v45,latitude}')
      ) as latitude,
      coalesce(public.be_wayplan_try_numeric_v45(m.metadata #>> '{mapbox_route_v45,sequence}')::integer, 999999) as route_sequence,
      m.metadata
    from membership m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id', n.delivery_way_id,
    'pickup_id', n.pickup_id,
    'route_zone', n.route_zone,
    'membership_status', n.membership_status,
    'recipient_name', n.recipient_name,
    'recipient_phone', n.recipient_phone,
    'address', n.address,
    'township', n.township,
    'longitude', n.longitude,
    'latitude', n.latitude,
    'route_sequence', nullif(n.route_sequence, 999999),
    'metadata', n.metadata
  ) order by n.route_sequence, n.delivery_way_id), '[]'::jsonb), count(*)::integer
  into v_stops, v_count
  from normalized n;

  select to_jsonb(p) into v_plan
  from public.be_wayplan_route_plans_v45 p
  where p.wayplan_id = v_wayplan and p.route_status = 'READY';

  return jsonb_build_object(
    'ok', true,
    'build', 'WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30',
    'wayplan_id', v_wayplan,
    'origin', v_origin,
    'stop_count', v_count,
    'stops', v_stops,
    'route_ready', v_plan is not null,
    'route_plan', v_plan,
    'workflow', 'HEAD_OFFICE -> MAPBOX_OPTIMIZED_STOPS -> SUPERVISOR_REVIEW -> DISPATCH_SCAN -> RIDER_ROUTE'
  );
end;
$$;

create or replace function public.be_wayplan_route_status_v45(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.be_wayplan_route_plans_v45;
  v_count integer;
begin
  select count(*)::integer into v_count
  from public.be_wayplan_membership_v40
  where wayplan_id = p_wayplan_id and membership_status not in ('CANCELLED','COMPLETED');

  select * into v_plan from public.be_wayplan_route_plans_v45
  where wayplan_id = p_wayplan_id and route_status = 'READY';

  return jsonb_build_object(
    'ok', v_plan.wayplan_id is not null and v_plan.stop_count = v_count,
    'wayplan_id', p_wayplan_id,
    'route_ready', v_plan.wayplan_id is not null,
    'membership_count', coalesce(v_count, 0),
    'route_stop_count', coalesce(v_plan.stop_count, 0),
    'origin_code', v_plan.origin_code,
    'route_mode', v_plan.route_mode,
    'profile', v_plan.profile,
    'distance_m', v_plan.distance_m,
    'duration_s', v_plan.duration_s,
    'optimized_at', v_plan.optimized_at
  );
end;
$$;

create or replace function public.be_wayplan_save_mapbox_route_v45(
  p_wayplan_id text,
  p_route jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_actor_v40(p_actor_email);
  v_origin jsonb := public.be_wayplan_head_office_v45('YGN');
  v_ordered jsonb := coalesce(p_route -> 'ordered_stops', '[]'::jsonb);
  v_count integer;
  v_membership_ids text[];
  v_route_ids text[];
  v_duplicates text[];
  v_route_status text;
  v_origin_lng numeric := public.be_wayplan_try_numeric_v45(p_route #>> '{origin,longitude}');
  v_origin_lat numeric := public.be_wayplan_try_numeric_v45(p_route #>> '{origin,latitude}');
  v_expected_lng numeric := public.be_wayplan_try_numeric_v45(v_origin ->> 'longitude');
  v_expected_lat numeric := public.be_wayplan_try_numeric_v45(v_origin ->> 'latitude');
  v_geometry_first_lng numeric;
  v_geometry_first_lat numeric;
  v_version integer := 1;
begin
  if auth.uid() is null and session_user <> 'postgres' then raise exception 'Authenticated Wayplan operator is required'; end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if jsonb_typeof(v_ordered) <> 'array' or jsonb_array_length(v_ordered) = 0 then raise exception 'Mapbox ordered_stops are required'; end if;

  if to_regclass('public.be_wayplan_review_v43') is not null then
    select review_status into v_route_status from public.be_wayplan_review_v43 where wayplan_id = v_wayplan;
    if v_route_status in ('PENDING_REVIEW','APPROVED','DISPATCH_READY','DISPATCHED') then
      raise exception 'Wayplan % is %; return it to correction before changing the route', v_wayplan, v_route_status;
    end if;
  end if;

  if v_origin_lng is null or v_origin_lat is null
     or abs(v_origin_lng - v_expected_lng) > 0.0005
     or abs(v_origin_lat - v_expected_lat) > 0.0005 then
    raise exception 'Route origin must be the configured Britium Head Office (% %, %)', v_origin ->> 'code', v_expected_lat, v_expected_lng;
  end if;

  v_geometry_first_lng := public.be_wayplan_try_numeric_v45(p_route #>> '{geometry,coordinates,0,0}');
  v_geometry_first_lat := public.be_wayplan_try_numeric_v45(p_route #>> '{geometry,coordinates,0,1}');
  if v_geometry_first_lng is null or v_geometry_first_lat is null
     or abs(v_geometry_first_lng - v_expected_lng) > 0.01
     or abs(v_geometry_first_lat - v_expected_lat) > 0.01 then
    raise exception 'Mapbox route geometry must start at the configured Head Office';
  end if;

  select array_agg(delivery_way_id order by delivery_way_id), count(*)::integer
  into v_membership_ids, v_count
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan and membership_status not in ('CANCELLED','COMPLETED');

  if coalesce(v_count, 0) = 0 then raise exception 'Wayplan % has no active parcel membership', v_wayplan; end if;

  select array_agg(x.delivery_way_id order by x.delivery_way_id)
  into v_route_ids
  from (
    select nullif(btrim(value ->> 'delivery_way_id'), '') as delivery_way_id
    from jsonb_array_elements(v_ordered)
  ) x
  where x.delivery_way_id is not null;

  select array_agg(delivery_way_id)
  into v_duplicates
  from (
    select value ->> 'delivery_way_id' as delivery_way_id, count(*)
    from jsonb_array_elements(v_ordered)
    group by value ->> 'delivery_way_id'
    having count(*) > 1
  ) d;

  if coalesce(cardinality(v_duplicates), 0) > 0 then raise exception 'Duplicate Way ID(s) in route: %', v_duplicates; end if;
  if coalesce(cardinality(v_route_ids), 0) <> v_count or v_route_ids is distinct from v_membership_ids then
    raise exception 'Saved route must contain every active Wayplan parcel exactly once. Membership %, route %', v_membership_ids, v_route_ids;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_ordered) value
    where public.be_wayplan_try_numeric_v45(value ->> 'longitude') is null
       or public.be_wayplan_try_numeric_v45(value ->> 'latitude') is null
       or coalesce((value ->> 'sequence')::integer, 0) <= 0
  ) then
    raise exception 'Every route stop requires sequence, latitude, and longitude';
  end if;

  select coalesce(route_version, 0) + 1 into v_version
  from public.be_wayplan_route_plans_v45 where wayplan_id = v_wayplan;
  v_version := coalesce(v_version, 1);

  insert into public.be_wayplan_route_plans_v45(
    wayplan_id, route_status, origin_code, origin_name, origin_address,
    origin_longitude, origin_latitude, profile, route_mode, stop_count,
    ordered_stops, geometry, distance_m, duration_s, request_count,
    route_version, optimized_by, optimized_at, updated_at, metadata
  ) values (
    v_wayplan, 'READY', v_origin ->> 'code', v_origin ->> 'name', v_origin ->> 'address',
    v_expected_lng, v_expected_lat,
    coalesce(nullif(p_route ->> 'profile', ''), 'mapbox/driving-traffic'),
    coalesce(nullif(p_route ->> 'route_mode', ''), 'MAPBOX_OPTIMIZATION_V1'),
    v_count, v_ordered, coalesce(p_route -> 'geometry', '{}'::jsonb),
    coalesce(public.be_wayplan_try_numeric_v45(p_route ->> 'distance_m'), 0)::bigint,
    coalesce(public.be_wayplan_try_numeric_v45(p_route ->> 'duration_s'), 0)::bigint,
    greatest(coalesce(public.be_wayplan_try_numeric_v45(p_route ->> 'request_count'), 1)::integer, 1),
    v_version, v_actor, now(), now(),
    jsonb_build_object('source', 'MAPBOX', 'fixed_head_office_origin', true, 'payload_version', coalesce(p_route ->> 'version', '45'))
  )
  on conflict (wayplan_id) do update set
    route_status = 'READY',
    origin_code = excluded.origin_code,
    origin_name = excluded.origin_name,
    origin_address = excluded.origin_address,
    origin_longitude = excluded.origin_longitude,
    origin_latitude = excluded.origin_latitude,
    profile = excluded.profile,
    route_mode = excluded.route_mode,
    stop_count = excluded.stop_count,
    ordered_stops = excluded.ordered_stops,
    geometry = excluded.geometry,
    distance_m = excluded.distance_m,
    duration_s = excluded.duration_s,
    request_count = excluded.request_count,
    route_version = excluded.route_version,
    optimized_by = excluded.optimized_by,
    optimized_at = excluded.optimized_at,
    updated_at = now(),
    metadata = public.be_wayplan_route_plans_v45.metadata || excluded.metadata;

  with ordered as (
    select
      value ->> 'delivery_way_id' as delivery_way_id,
      (value ->> 'sequence')::integer as sequence,
      public.be_wayplan_try_numeric_v45(value ->> 'longitude') as longitude,
      public.be_wayplan_try_numeric_v45(value ->> 'latitude') as latitude,
      nullif(value ->> 'place_name', '') as place_name,
      nullif(value ->> 'coordinate_source', '') as coordinate_source
    from jsonb_array_elements(v_ordered)
  )
  update public.be_wayplan_membership_v40 m
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'mapbox_route_v45', jsonb_build_object(
          'sequence', o.sequence,
          'longitude', o.longitude,
          'latitude', o.latitude,
          'place_name', o.place_name,
          'coordinate_source', o.coordinate_source,
          'origin_code', v_origin ->> 'code',
          'route_version', v_version
        )
      ),
      updated_at = now()
  from ordered o
  where m.wayplan_id = v_wayplan and m.delivery_way_id = o.delivery_way_id;

  insert into public.be_wayplan_route_events_v45(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'MAPBOX_ROUTE_SAVED_FROM_HEAD_OFFICE', v_actor,
    jsonb_build_object('route_version', v_version, 'stop_count', v_count, 'distance_m', p_route ->> 'distance_m', 'duration_s', p_route ->> 'duration_s', 'route_mode', p_route ->> 'route_mode'));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'MAPBOX_HEAD_OFFICE_ROUTE_SAVED_V45', v_actor,
    jsonb_build_object('route_version', v_version, 'stop_count', v_count, 'origin', v_origin));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'route_ready', true,
    'route_version', v_version,
    'origin', v_origin,
    'stop_count', v_count,
    'distance_m', coalesce(public.be_wayplan_try_numeric_v45(p_route ->> 'distance_m'), 0)::bigint,
    'duration_s', coalesce(public.be_wayplan_try_numeric_v45(p_route ->> 'duration_s'), 0)::bigint,
    'next_step', 'Submit the saved Head Office route for Supervisor review'
  );
end;
$$;

create or replace function public.be_wayplan_submit_review_v45(
  p_wayplan_id text,
  p_actor_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
  v_result jsonb;
begin
  v_status := public.be_wayplan_route_status_v45(p_wayplan_id);
  if not coalesce((v_status ->> 'ok')::boolean, false) then
    raise exception 'Mapbox Head Office route is required before Supervisor review. Route status: %', v_status;
  end if;
  v_result := public.be_wayplan_submit_review_v43(p_wayplan_id, p_actor_email, p_notes);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('mapbox_route_v45', v_status);
end;
$$;

create or replace function public.be_wayplan_supervisor_decide_v45(
  p_wayplan_id text,
  p_decision text,
  p_notes text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := upper(regexp_replace(btrim(coalesce(p_decision, '')), '[^A-Za-z]+', '_', 'g'));
  v_status jsonb;
  v_result jsonb;
begin
  if v_decision in ('APPROVE','APPROVED') then
    v_status := public.be_wayplan_route_status_v45(p_wayplan_id);
    if not coalesce((v_status ->> 'ok')::boolean, false) then
      raise exception 'Supervisor approval stopped: the complete Mapbox Head Office route has not been saved';
    end if;
  end if;
  v_result := public.be_wayplan_supervisor_decide_v43(p_wayplan_id, p_decision, p_notes, p_actor_email);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('mapbox_route_v45', coalesce(v_status, public.be_wayplan_route_status_v45(p_wayplan_id)));
end;
$$;

revoke all on function public.be_wayplan_try_numeric_v45(text) from public, anon;
revoke all on function public.be_wayplan_head_office_v45(text) from public, anon;
revoke all on function public.be_wayplan_route_snapshot_v45(text) from public, anon;
revoke all on function public.be_wayplan_route_status_v45(text) from public, anon;
revoke all on function public.be_wayplan_save_mapbox_route_v45(text,jsonb,text) from public, anon;
revoke all on function public.be_wayplan_submit_review_v45(text,text,text) from public, anon;
revoke all on function public.be_wayplan_supervisor_decide_v45(text,text,text,text) from public, anon;

grant execute on function public.be_wayplan_head_office_v45(text) to authenticated;
grant execute on function public.be_wayplan_route_snapshot_v45(text) to authenticated;
grant execute on function public.be_wayplan_route_status_v45(text) to authenticated;
grant execute on function public.be_wayplan_save_mapbox_route_v45(text,jsonb,text) to authenticated;
grant execute on function public.be_wayplan_submit_review_v45(text,text,text) to authenticated;
grant execute on function public.be_wayplan_supervisor_decide_v45(text,text,text,text) to authenticated;

select jsonb_build_object(
  'head_office_rpc', to_regprocedure('public.be_wayplan_head_office_v45(text)')::text,
  'route_snapshot_rpc', to_regprocedure('public.be_wayplan_route_snapshot_v45(text)')::text,
  'save_route_rpc', to_regprocedure('public.be_wayplan_save_mapbox_route_v45(text,jsonb,text)')::text,
  'route_status_rpc', to_regprocedure('public.be_wayplan_route_status_v45(text)')::text,
  'review_guard_rpc', to_regprocedure('public.be_wayplan_submit_review_v45(text,text,text)')::text,
  'approval_guard_rpc', to_regprocedure('public.be_wayplan_supervisor_decide_v45(text,text,text,text)')::text,
  'route_table', to_regclass('public.be_wayplan_route_plans_v45')::text,
  'workflow', 'Britium Head Office fixed origin -> Mapbox optimized stop order -> Supervisor review -> Dispatch scan -> Rider route'
) as wayplan_mapbox_v45;
