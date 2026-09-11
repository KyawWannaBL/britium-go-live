-- Britium Express Rider Delivery V46
-- Dispatched Wayplan -> assigned route operator acceptance -> Head Office start geofence
-- -> sequential Mapbox stops -> delivered/failed/RTO result sync -> route completion.
-- Requires Warehouse/Dispatch V39, Wayplan V40/V43, and Mapbox Route V45.

begin;

create extension if not exists pgcrypto;

create table if not exists public.be_rider_route_settings_v46 (
  setting_key text primary key,
  numeric_value numeric,
  text_value text,
  updated_at timestamptz not null default now()
);

insert into public.be_rider_route_settings_v46(setting_key, numeric_value, text_value)
values
  ('head_office_start_radius_m', 1000, 'Maximum distance from the configured Head Office when starting a route'),
  ('delivery_arrival_radius_m', 1000, 'Distance used to mark a delivery-stop GPS arrival as verified')
on conflict (setting_key) do nothing;

create table if not exists public.be_rider_route_runs_v46 (
  wayplan_id text primary key,
  run_status text not null default 'ASSIGNED',
  route_version integer not null default 1,
  assigned_rider_code text,
  assigned_rider_name text,
  assigned_driver_code text,
  assigned_driver_name text,
  accepted_by text,
  accepted_at timestamptz,
  started_by text,
  started_at timestamptz,
  completed_at timestamptz,
  current_stop_sequence integer,
  start_latitude numeric,
  start_longitude numeric,
  start_distance_m numeric,
  last_latitude numeric,
  last_longitude numeric,
  last_gps_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_rider_route_runs_v46_status_check check (
    run_status in ('ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','COMPLETED_WITH_EXCEPTIONS','CANCELLED')
  )
);

create table if not exists public.be_rider_route_stop_state_v46 (
  wayplan_id text not null,
  delivery_way_id text not null,
  stop_sequence integer not null,
  stop_status text not null default 'PENDING',
  recipient_name text,
  recipient_phone text,
  address text,
  township text,
  longitude numeric,
  latitude numeric,
  arrived_at timestamptz,
  arrival_latitude numeric,
  arrival_longitude numeric,
  arrival_distance_m numeric,
  geo_verified boolean,
  result_at timestamptz,
  result_operation_id text,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wayplan_id, delivery_way_id),
  unique (wayplan_id, stop_sequence),
  constraint be_rider_route_stop_state_v46_status_check check (
    stop_status in ('PENDING','ARRIVED','DELIVERED','FAILED','RTO','CANCELLED')
  )
);

create table if not exists public.be_rider_route_events_v46 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  delivery_way_id text,
  event_type text not null,
  operation_id text,
  actor_key text,
  event_at timestamptz not null default now(),
  latitude numeric,
  longitude numeric,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists be_rider_route_events_v46_operation_uidx
  on public.be_rider_route_events_v46(operation_id)
  where operation_id is not null;
create index if not exists be_rider_route_events_v46_wayplan_idx
  on public.be_rider_route_events_v46(wayplan_id, event_at desc);
create index if not exists be_rider_route_stop_state_v46_status_idx
  on public.be_rider_route_stop_state_v46(wayplan_id, stop_status, stop_sequence);

alter table public.be_rider_route_settings_v46 enable row level security;
alter table public.be_rider_route_runs_v46 enable row level security;
alter table public.be_rider_route_stop_state_v46 enable row level security;
alter table public.be_rider_route_events_v46 enable row level security;
revoke all on public.be_rider_route_settings_v46 from public, anon, authenticated;
revoke all on public.be_rider_route_runs_v46 from public, anon, authenticated;
revoke all on public.be_rider_route_stop_state_v46 from public, anon, authenticated;
revoke all on public.be_rider_route_events_v46 from public, anon, authenticated;

create or replace function public.be_rider_norm_v46(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '[^a-zA-Z0-9]+', '', 'g'));
$$;

create or replace function public.be_rider_distance_m_v46(
  p_latitude_1 numeric,
  p_longitude_1 numeric,
  p_latitude_2 numeric,
  p_longitude_2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_latitude_1 is null or p_longitude_1 is null or p_latitude_2 is null or p_longitude_2 is null then null
    else 6371000 * 2 * asin(
      sqrt(
        power(sin(radians((p_latitude_2 - p_latitude_1)::double precision) / 2), 2)
        + cos(radians(p_latitude_1::double precision))
        * cos(radians(p_latitude_2::double precision))
        * power(sin(radians((p_longitude_2 - p_longitude_1)::double precision) / 2), 2)
      )
    )
  end;
$$;

create or replace function public.be_rider_route_operator_v46(
  p_wayplan_id text,
  p_rider_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := public.be_rider_norm_v46(p_rider_key);
  v_rider_code text;
  v_rider_name text;
  v_driver_code text;
  v_driver_name text;
  v_match boolean := false;
begin
  select
    min(nullif(rider_code, '')),
    min(nullif(rider_name, '')),
    min(nullif(driver_code, '')),
    min(nullif(driver_name, ''))
  into v_rider_code, v_rider_name, v_driver_code, v_driver_name
  from public.be_wayplan_membership_v40
  where wayplan_id = btrim(p_wayplan_id)
    and membership_status <> 'CANCELLED';

  if v_key <> '' then
    v_match := v_key in (
      public.be_rider_norm_v46(v_rider_code),
      public.be_rider_norm_v46(v_rider_name),
      public.be_rider_norm_v46(v_driver_code),
      public.be_rider_norm_v46(v_driver_name)
    );
  end if;

  return jsonb_build_object(
    'ok', v_match,
    'operator_key', p_rider_key,
    'rider_code', v_rider_code,
    'rider_name', v_rider_name,
    'driver_code', v_driver_code,
    'driver_name', v_driver_name
  );
end;
$$;

create or replace function public.be_rider_initialize_route_v46(
  p_wayplan_id text,
  p_rider_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_operator jsonb;
  v_review_status text;
  v_plan public.be_wayplan_route_plans_v45;
  v_current integer;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated route operator is required';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if to_regclass('public.be_wayplan_membership_v40') is null
     or to_regclass('public.be_wayplan_route_plans_v45') is null then
    raise exception 'Wayplan V40 and Mapbox V45 are required before Rider V46';
  end if;

  v_operator := public.be_rider_route_operator_v46(v_wayplan, p_rider_key);
  if not coalesce((v_operator ->> 'ok')::boolean, false) then
    raise exception 'Route % is not assigned to operator %', v_wayplan, coalesce(p_rider_key, '');
  end if;

  if to_regclass('public.be_wayplan_review_v43') is not null then
    select review_status into v_review_status
    from public.be_wayplan_review_v43
    where wayplan_id = v_wayplan;
  end if;

  if coalesce(v_review_status, '') <> 'DISPATCHED'
     and exists (
       select 1 from public.be_wayplan_membership_v40
       where wayplan_id = v_wayplan and membership_status <> 'DISPATCHED'
         and membership_status not in ('COMPLETED','RTO','CANCELLED')
     ) then
    raise exception 'Route % is not published by Dispatch', v_wayplan;
  end if;

  select * into v_plan
  from public.be_wayplan_route_plans_v45
  where wayplan_id = v_wayplan and route_status = 'READY';
  if v_plan.wayplan_id is null then raise exception 'Route % has no saved Mapbox V45 plan', v_wayplan; end if;

  insert into public.be_rider_route_runs_v46(
    wayplan_id, run_status, route_version,
    assigned_rider_code, assigned_rider_name,
    assigned_driver_code, assigned_driver_name,
    metadata
  ) values (
    v_wayplan, 'ASSIGNED', v_plan.route_version,
    v_operator ->> 'rider_code', v_operator ->> 'rider_name',
    v_operator ->> 'driver_code', v_operator ->> 'driver_name',
    jsonb_build_object('origin_code', v_plan.origin_code, 'build', 'RIDER_V46_HEAD_OFFICE_ROUTE_EXECUTION_2026-07-30')
  ) on conflict (wayplan_id) do update set
    route_version = excluded.route_version,
    assigned_rider_code = excluded.assigned_rider_code,
    assigned_rider_name = excluded.assigned_rider_name,
    assigned_driver_code = excluded.assigned_driver_code,
    assigned_driver_name = excluded.assigned_driver_name,
    updated_at = now();

  insert into public.be_rider_route_stop_state_v46(
    wayplan_id, delivery_way_id, stop_sequence, stop_status,
    recipient_name, recipient_phone, address, township,
    longitude, latitude
  )
  select
    v_wayplan,
    stop ->> 'delivery_way_id',
    (stop ->> 'sequence')::integer,
    case
      when coalesce(a.last_status, '') = 'DELIVERED' or m.membership_status = 'COMPLETED' then 'DELIVERED'
      when coalesce(a.last_status, '') = 'RTO' or m.membership_status = 'RTO' then 'RTO'
      else 'PENDING'
    end,
    coalesce(nullif(stop ->> 'recipient_name', ''), v.recipient_name),
    coalesce(nullif(stop ->> 'recipient_phone', ''), v.recipient_phone),
    coalesce(nullif(stop ->> 'address', ''), v.recipient_address),
    coalesce(nullif(stop ->> 'township', ''), v.township),
    public.be_wayplan_try_numeric_v45(stop ->> 'longitude'),
    public.be_wayplan_try_numeric_v45(stop ->> 'latitude')
  from jsonb_array_elements(v_plan.ordered_stops) stop
  join public.be_wayplan_membership_v40 m
    on m.wayplan_id = v_wayplan and m.delivery_way_id = (stop ->> 'delivery_way_id')
  left join public.be_v_warehouse_receipt_v39 v
    on v.delivery_way_id = m.delivery_way_id
  left join public.be_delivery_attempt_state_v39 a
    on a.delivery_way_id = m.delivery_way_id
  on conflict (wayplan_id, delivery_way_id) do update set
    stop_sequence = excluded.stop_sequence,
    recipient_name = excluded.recipient_name,
    recipient_phone = excluded.recipient_phone,
    address = excluded.address,
    township = excluded.township,
    longitude = excluded.longitude,
    latitude = excluded.latitude,
    stop_status = case
      when public.be_rider_route_stop_state_v46.stop_status in ('DELIVERED','FAILED','RTO')
        then public.be_rider_route_stop_state_v46.stop_status
      else excluded.stop_status
    end,
    updated_at = now();

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and stop_status in ('PENDING','ARRIVED');

  update public.be_rider_route_runs_v46
  set current_stop_sequence = v_current, updated_at = now()
  where wayplan_id = v_wayplan;

  return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'operator', v_operator, 'current_stop_sequence', v_current);
end;
$$;

create or replace function public.be_rider_route_snapshot_v46(
  p_wayplan_id text,
  p_rider_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_run jsonb;
  v_current jsonb;
  v_stops jsonb;
  v_counts jsonb;
  v_origin jsonb;
begin
  perform public.be_rider_initialize_route_v46(v_wayplan, p_rider_key);

  select to_jsonb(r) into v_run
  from public.be_rider_route_runs_v46 r where r.wayplan_id = v_wayplan;

  select to_jsonb(s) into v_current
  from public.be_rider_route_stop_state_v46 s
  where s.wayplan_id = v_wayplan and s.stop_status in ('PENDING','ARRIVED')
  order by s.stop_sequence limit 1;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.stop_sequence), '[]'::jsonb)
  into v_stops
  from public.be_rider_route_stop_state_v46 s where s.wayplan_id = v_wayplan;

  select jsonb_build_object(
    'total', count(*)::integer,
    'pending', count(*) filter (where stop_status = 'PENDING')::integer,
    'arrived', count(*) filter (where stop_status = 'ARRIVED')::integer,
    'delivered', count(*) filter (where stop_status = 'DELIVERED')::integer,
    'failed', count(*) filter (where stop_status = 'FAILED')::integer,
    'rto', count(*) filter (where stop_status = 'RTO')::integer,
    'remaining', count(*) filter (where stop_status in ('PENDING','ARRIVED'))::integer
  ) into v_counts
  from public.be_rider_route_stop_state_v46 where wayplan_id = v_wayplan;

  v_origin := public.be_wayplan_head_office_v45('YGN');

  return jsonb_build_object(
    'ok', true,
    'build', 'RIDER_V46_HEAD_OFFICE_ROUTE_EXECUTION_2026-07-30',
    'wayplan_id', v_wayplan,
    'run', v_run,
    'origin', v_origin,
    'current_stop', v_current,
    'stops', v_stops,
    'counts', v_counts,
    'workflow', 'DISPATCHED -> ACCEPTED -> START_AT_HEAD_OFFICE -> SEQUENTIAL_STOPS -> DELIVERED/FAILED/RTO'
  );
end;
$$;

create or replace function public.be_rider_accept_route_v46(
  p_wayplan_id text,
  p_rider_key text,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := btrim(p_wayplan_id);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(v_wayplan || '|' || coalesce(p_rider_key, '') || '|ACCEPT', 'sha256'), 'hex'));
  v_status text;
begin
  perform public.be_rider_initialize_route_v46(v_wayplan, p_rider_key);

  if exists (select 1 from public.be_rider_route_events_v46 where operation_id = v_operation) then
    return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key) || jsonb_build_object('duplicate_operation', true);
  end if;

  select run_status into v_status from public.be_rider_route_runs_v46 where wayplan_id = v_wayplan for update;
  if v_status = 'ASSIGNED' then
    update public.be_rider_route_runs_v46
    set run_status = 'ACCEPTED', accepted_by = p_rider_key, accepted_at = now(), updated_at = now()
    where wayplan_id = v_wayplan;
  elsif v_status not in ('ACCEPTED','IN_PROGRESS','COMPLETED','COMPLETED_WITH_EXCEPTIONS') then
    raise exception 'Route % cannot be accepted from status %', v_wayplan, v_status;
  end if;

  insert into public.be_rider_route_events_v46(wayplan_id, event_type, operation_id, actor_key, payload)
  values (v_wayplan, 'ROUTE_ACCEPTED', v_operation, p_rider_key, jsonb_build_object('previous_status', v_status));

  return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key);
end;
$$;

create or replace function public.be_rider_start_route_v46(
  p_wayplan_id text,
  p_rider_key text,
  p_latitude numeric,
  p_longitude numeric,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := btrim(p_wayplan_id);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(v_wayplan || '|' || coalesce(p_rider_key, '') || '|START', 'sha256'), 'hex'));
  v_status text;
  v_origin jsonb;
  v_distance numeric;
  v_radius numeric := 1000;
  v_current integer;
begin
  perform public.be_rider_initialize_route_v46(v_wayplan, p_rider_key);

  if p_latitude is null or p_longitude is null then raise exception 'GPS latitude and longitude are required'; end if;
  if exists (select 1 from public.be_rider_route_events_v46 where operation_id = v_operation) then
    return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key) || jsonb_build_object('duplicate_operation', true);
  end if;

  select coalesce(numeric_value, 1000) into v_radius
  from public.be_rider_route_settings_v46 where setting_key = 'head_office_start_radius_m';
  v_origin := public.be_wayplan_head_office_v45('YGN');
  v_distance := public.be_rider_distance_m_v46(
    p_latitude, p_longitude,
    (v_origin ->> 'latitude')::numeric,
    (v_origin ->> 'longitude')::numeric
  );

  if v_distance is null or v_distance > v_radius then
    raise exception 'Route must start at Britium Head Office. Current GPS is % metres away; permitted radius is % metres', round(coalesce(v_distance, 0)), round(v_radius);
  end if;

  select run_status into v_status from public.be_rider_route_runs_v46 where wayplan_id = v_wayplan for update;
  if v_status = 'ASSIGNED' then
    update public.be_rider_route_runs_v46
    set run_status = 'ACCEPTED', accepted_by = p_rider_key, accepted_at = now(), updated_at = now()
    where wayplan_id = v_wayplan;
    v_status := 'ACCEPTED';
  end if;
  if v_status = 'ACCEPTED' then
    select min(stop_sequence) into v_current
    from public.be_rider_route_stop_state_v46
    where wayplan_id = v_wayplan and stop_status in ('PENDING','ARRIVED');

    update public.be_rider_route_runs_v46
    set run_status = 'IN_PROGRESS', started_by = p_rider_key, started_at = now(),
        current_stop_sequence = v_current,
        start_latitude = p_latitude, start_longitude = p_longitude, start_distance_m = v_distance,
        last_latitude = p_latitude, last_longitude = p_longitude, last_gps_at = now(), updated_at = now()
    where wayplan_id = v_wayplan;
  elsif v_status not in ('IN_PROGRESS','COMPLETED','COMPLETED_WITH_EXCEPTIONS') then
    raise exception 'Route % cannot start from status %', v_wayplan, v_status;
  end if;

  insert into public.be_rider_route_events_v46(wayplan_id, event_type, operation_id, actor_key, latitude, longitude, payload)
  values (v_wayplan, 'ROUTE_STARTED_AT_HEAD_OFFICE', v_operation, p_rider_key, p_latitude, p_longitude,
    jsonb_build_object('distance_m', v_distance, 'permitted_radius_m', v_radius, 'origin', v_origin));

  return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key)
    || jsonb_build_object('start_distance_m', v_distance, 'head_office_verified', true);
end;
$$;

create or replace function public.be_rider_arrive_stop_v46(
  p_wayplan_id text,
  p_delivery_way_id text,
  p_rider_key text,
  p_latitude numeric,
  p_longitude numeric,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := btrim(p_wayplan_id);
  v_way_id text := btrim(p_delivery_way_id);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(v_wayplan || '|' || v_way_id || '|ARRIVE', 'sha256'), 'hex'));
  v_run_status text;
  v_current integer;
  v_sequence integer;
  v_stop_lat numeric;
  v_stop_lng numeric;
  v_stop_status text;
  v_distance numeric;
  v_radius numeric := 1000;
  v_verified boolean;
begin
  perform public.be_rider_initialize_route_v46(v_wayplan, p_rider_key);
  if p_latitude is null or p_longitude is null then raise exception 'GPS latitude and longitude are required'; end if;

  if exists (select 1 from public.be_rider_route_events_v46 where operation_id = v_operation) then
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'wayplan_id', v_wayplan, 'delivery_way_id', v_way_id);
  end if;

  select run_status into v_run_status from public.be_rider_route_runs_v46 where wayplan_id = v_wayplan;
  if v_run_status <> 'IN_PROGRESS' then raise exception 'Route % must be IN_PROGRESS before recording stop arrival', v_wayplan; end if;

  select stop_sequence, latitude, longitude, stop_status
  into v_sequence, v_stop_lat, v_stop_lng, v_stop_status
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and delivery_way_id = v_way_id
  for update;
  if v_sequence is null then raise exception 'Way ID % is not part of route %', v_way_id, v_wayplan; end if;

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and stop_status in ('PENDING','ARRIVED');
  if v_sequence <> v_current then
    raise exception 'Stop order enforced. Complete or fail stop % before stop %', v_current, v_sequence;
  end if;

  select coalesce(numeric_value, 1000) into v_radius
  from public.be_rider_route_settings_v46 where setting_key = 'delivery_arrival_radius_m';
  v_distance := public.be_rider_distance_m_v46(p_latitude, p_longitude, v_stop_lat, v_stop_lng);
  v_verified := v_distance is not null and v_distance <= v_radius;

  update public.be_rider_route_stop_state_v46
  set stop_status = case when stop_status = 'PENDING' then 'ARRIVED' else stop_status end,
      arrived_at = coalesce(arrived_at, now()),
      arrival_latitude = p_latitude,
      arrival_longitude = p_longitude,
      arrival_distance_m = v_distance,
      geo_verified = v_verified,
      updated_at = now()
  where wayplan_id = v_wayplan and delivery_way_id = v_way_id;

  update public.be_rider_route_runs_v46
  set current_stop_sequence = v_sequence,
      last_latitude = p_latitude, last_longitude = p_longitude, last_gps_at = now(), updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_rider_route_events_v46(wayplan_id, delivery_way_id, event_type, operation_id, actor_key, latitude, longitude, payload)
  values (v_wayplan, v_way_id, 'DELIVERY_STOP_ARRIVED', v_operation, p_rider_key, p_latitude, p_longitude,
    jsonb_build_object('stop_sequence', v_sequence, 'distance_m', v_distance, 'geo_verified', v_verified, 'verification_radius_m', v_radius));

  return jsonb_build_object(
    'ok', true, 'wayplan_id', v_wayplan, 'delivery_way_id', v_way_id,
    'stop_sequence', v_sequence, 'stop_status', 'ARRIVED',
    'distance_m', v_distance, 'geo_verified', v_verified, 'verification_radius_m', v_radius
  );
end;
$$;

create or replace function public.be_rider_record_stop_result_v46(
  p_wayplan_id text,
  p_delivery_way_id text,
  p_rider_key text,
  p_result text,
  p_operation_id text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := btrim(p_wayplan_id);
  v_way_id text := btrim(p_delivery_way_id);
  v_result text := upper(regexp_replace(btrim(coalesce(p_result, '')), '[^A-Za-z]+', '_', 'g'));
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(v_wayplan || '|' || v_way_id || '|' || v_result, 'sha256'), 'hex'));
  v_sequence integer;
  v_current integer;
  v_status text;
  v_next integer;
  v_failed integer;
  v_rto integer;
  v_remaining integer;
  v_run_status text;
  v_lat numeric := public.be_wayplan_try_numeric_v45(p_payload ->> 'gps_latitude');
  v_lng numeric := public.be_wayplan_try_numeric_v45(p_payload ->> 'gps_longitude');
begin
  perform public.be_rider_initialize_route_v46(v_wayplan, p_rider_key);
  if v_result not in ('DELIVERED','FAILED','RTO') then raise exception 'Stop result must be DELIVERED, FAILED, or RTO'; end if;

  if exists (select 1 from public.be_rider_route_events_v46 where operation_id = v_operation) then
    return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key) || jsonb_build_object('duplicate_operation', true);
  end if;

  select stop_sequence, stop_status into v_sequence, v_status
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and delivery_way_id = v_way_id
  for update;
  if v_sequence is null then raise exception 'Way ID % is not part of route %', v_way_id, v_wayplan; end if;

  if v_status in ('DELIVERED','FAILED','RTO') then
    return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key)
      || jsonb_build_object('already_final', true, 'delivery_way_id', v_way_id, 'stop_status', v_status);
  end if;

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and stop_status in ('PENDING','ARRIVED');
  if v_sequence <> v_current then
    raise exception 'Stop order enforced. Current stop is %, submitted stop is %', v_current, v_sequence;
  end if;

  update public.be_rider_route_stop_state_v46
  set stop_status = v_result,
      arrived_at = coalesce(arrived_at, now()),
      arrival_latitude = coalesce(arrival_latitude, v_lat),
      arrival_longitude = coalesce(arrival_longitude, v_lng),
      result_at = now(),
      result_operation_id = v_operation,
      result_payload = coalesce(result_payload, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb),
      updated_at = now()
  where wayplan_id = v_wayplan and delivery_way_id = v_way_id;

  if v_result = 'DELIVERED' then
    update public.be_wayplan_membership_v40
    set membership_status = 'COMPLETED', updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('rider_v46_result', 'DELIVERED', 'rider_v46_result_at', now())
    where wayplan_id = v_wayplan and delivery_way_id = v_way_id;
  elsif v_result = 'RTO' then
    update public.be_wayplan_membership_v40
    set membership_status = 'RTO', updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('rider_v46_result', 'RTO', 'rider_v46_result_at', now())
    where wayplan_id = v_wayplan and delivery_way_id = v_way_id;
  end if;

  select min(stop_sequence) filter (where stop_status in ('PENDING','ARRIVED')),
         count(*) filter (where stop_status = 'FAILED')::integer,
         count(*) filter (where stop_status = 'RTO')::integer,
         count(*) filter (where stop_status in ('PENDING','ARRIVED'))::integer
  into v_next, v_failed, v_rto, v_remaining
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan;

  if coalesce(v_remaining, 0) = 0 then
    v_run_status := case when coalesce(v_failed, 0) + coalesce(v_rto, 0) > 0 then 'COMPLETED_WITH_EXCEPTIONS' else 'COMPLETED' end;
  else
    v_run_status := 'IN_PROGRESS';
  end if;

  update public.be_rider_route_runs_v46
  set run_status = v_run_status,
      current_stop_sequence = case when v_remaining = 0 then null else v_next end,
      completed_at = case when v_remaining = 0 then coalesce(completed_at, now()) else null end,
      last_latitude = coalesce(v_lat, last_latitude),
      last_longitude = coalesce(v_lng, last_longitude),
      last_gps_at = case when v_lat is not null and v_lng is not null then now() else last_gps_at end,
      updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_rider_route_events_v46(wayplan_id, delivery_way_id, event_type, operation_id, actor_key, latitude, longitude, payload)
  values (v_wayplan, v_way_id, 'DELIVERY_STOP_' || v_result, v_operation, p_rider_key, v_lat, v_lng,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('stop_sequence', v_sequence, 'run_status', v_run_status));

  insert into public.be_wayplan_events_v40(wayplan_id, delivery_way_id, event_type, actor_email, payload)
  values (v_wayplan, v_way_id, 'RIDER_V46_STOP_' || v_result, p_rider_key,
    jsonb_build_object('operation_id', v_operation, 'stop_sequence', v_sequence, 'run_status', v_run_status));

  return public.be_rider_route_snapshot_v46(v_wayplan, p_rider_key)
    || jsonb_build_object('result', v_result, 'delivery_way_id', v_way_id, 'operation_id', v_operation);
end;
$$;

create or replace function public.be_rider_route_status_v46(p_wayplan_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'wayplan_id', p_wayplan_id,
    'run_status', coalesce(r.run_status, 'NOT_INITIALIZED'),
    'assigned_rider_code', r.assigned_rider_code,
    'assigned_driver_code', r.assigned_driver_code,
    'accepted_at', r.accepted_at,
    'started_at', r.started_at,
    'completed_at', r.completed_at,
    'current_stop_sequence', r.current_stop_sequence,
    'start_distance_m', r.start_distance_m,
    'total', count(s.delivery_way_id)::integer,
    'delivered', count(s.delivery_way_id) filter (where s.stop_status = 'DELIVERED')::integer,
    'failed', count(s.delivery_way_id) filter (where s.stop_status = 'FAILED')::integer,
    'rto', count(s.delivery_way_id) filter (where s.stop_status = 'RTO')::integer,
    'remaining', count(s.delivery_way_id) filter (where s.stop_status in ('PENDING','ARRIVED'))::integer
  )
  from public.be_rider_route_runs_v46 r
  left join public.be_rider_route_stop_state_v46 s on s.wayplan_id = r.wayplan_id
  where r.wayplan_id = p_wayplan_id
  group by r.wayplan_id, r.run_status, r.assigned_rider_code, r.assigned_driver_code,
           r.accepted_at, r.started_at, r.completed_at, r.current_stop_sequence, r.start_distance_m;
$$;

revoke all on function public.be_rider_norm_v46(text) from public, anon;
revoke all on function public.be_rider_distance_m_v46(numeric,numeric,numeric,numeric) from public, anon;
revoke all on function public.be_rider_route_operator_v46(text,text) from public, anon;
revoke all on function public.be_rider_initialize_route_v46(text,text) from public, anon;
revoke all on function public.be_rider_route_snapshot_v46(text,text) from public, anon;
revoke all on function public.be_rider_accept_route_v46(text,text,text) from public, anon;
revoke all on function public.be_rider_start_route_v46(text,text,numeric,numeric,text) from public, anon;
revoke all on function public.be_rider_arrive_stop_v46(text,text,text,numeric,numeric,text) from public, anon;
revoke all on function public.be_rider_record_stop_result_v46(text,text,text,text,text,jsonb) from public, anon;
revoke all on function public.be_rider_route_status_v46(text) from public, anon;

grant execute on function public.be_rider_route_snapshot_v46(text,text) to authenticated;
grant execute on function public.be_rider_accept_route_v46(text,text,text) to authenticated;
grant execute on function public.be_rider_start_route_v46(text,text,numeric,numeric,text) to authenticated;
grant execute on function public.be_rider_arrive_stop_v46(text,text,text,numeric,numeric,text) to authenticated;
grant execute on function public.be_rider_record_stop_result_v46(text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.be_rider_route_status_v46(text) to authenticated;

commit;

select jsonb_build_object(
  'route_snapshot_rpc', to_regprocedure('public.be_rider_route_snapshot_v46(text,text)')::text,
  'accept_route_rpc', to_regprocedure('public.be_rider_accept_route_v46(text,text,text)')::text,
  'head_office_start_rpc', to_regprocedure('public.be_rider_start_route_v46(text,text,numeric,numeric,text)')::text,
  'arrive_stop_rpc', to_regprocedure('public.be_rider_arrive_stop_v46(text,text,text,numeric,numeric,text)')::text,
  'record_stop_result_rpc', to_regprocedure('public.be_rider_record_stop_result_v46(text,text,text,text,text,jsonb)')::text,
  'route_status_rpc', to_regprocedure('public.be_rider_route_status_v46(text)')::text,
  'route_run_table', to_regclass('public.be_rider_route_runs_v46')::text,
  'route_stop_table', to_regclass('public.be_rider_route_stop_state_v46')::text,
  'workflow', 'DISPATCHED -> route acceptance -> start inside Head Office geofence -> sequential Mapbox stops -> delivery proof/failure/RTO -> route completion'
) as rider_delivery_v46;
