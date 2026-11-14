create table if not exists public.be_rider_geofence_overrides_v50 (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text not null,
  delivery_way_id text not null,
  reason text not null,
  approved_by text not null,
  approved_role text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  used_at timestamptz,
  used_by text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.be_rider_geofence_overrides_v50 enable row level security;

create index if not exists be_rider_geofence_overrides_v50_lookup_idx
  on public.be_rider_geofence_overrides_v50 (wayplan_id, delivery_way_id, expires_at desc)
  where used_at is null;

update public.be_rider_route_settings_v46
set numeric_value = 100,
    text_value = 'Delivery arrival hard geofence radius in meters; outside radius requires supervisor override',
    updated_at = now()
where setting_key = 'delivery_arrival_radius_m';

insert into public.be_rider_route_settings_v46(setting_key, numeric_value, text_value, updated_at)
select 'delivery_arrival_radius_m', 100,
       'Delivery arrival hard geofence radius in meters; outside radius requires supervisor override', now()
where not exists (
  select 1 from public.be_rider_route_settings_v46 where setting_key = 'delivery_arrival_radius_m'
);

create or replace function public.be_supervisor_approve_geofence_override_v50(
  p_wayplan_id text,
  p_delivery_way_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_profile_role text := lower(coalesce(public.be_current_role(), ''));
  v_registry_role text := lower(coalesce(public.be_current_user_role(), ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text, 'unknown');
  v_row public.be_rider_geofence_overrides_v50%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_profile_role not in ('superadmin','admin','supervisor','operations_manager','operations','ops')
     and v_registry_role not in ('superadmin','admin','supervisor','operations_manager','operations','ops') then
    raise exception 'SUPERVISOR_ROLE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_wayplan_id, '')), '') is null
     or nullif(btrim(coalesce(p_delivery_way_id, '')), '') is null then
    raise exception 'WAYPLAN_AND_DELIVERY_WAY_REQUIRED';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'OVERRIDE_REASON_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.be_rider_route_stop_state_v46
    where wayplan_id = btrim(p_wayplan_id)
      and delivery_way_id = btrim(p_delivery_way_id)
  ) then
    raise exception 'DELIVERY_STOP_NOT_FOUND';
  end if;

  insert into public.be_rider_geofence_overrides_v50(
    wayplan_id, delivery_way_id, reason, approved_by, approved_role, expires_at, metadata
  ) values (
    btrim(p_wayplan_id), btrim(p_delivery_way_id), v_reason, v_actor,
    coalesce(nullif(v_profile_role, ''), nullif(v_registry_role, ''), 'supervisor'),
    now() + interval '30 minutes',
    jsonb_build_object('source', 'supervisor_live_tracking_v50')
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'override_id', v_row.id,
    'wayplan_id', v_row.wayplan_id,
    'delivery_way_id', v_row.delivery_way_id,
    'approved_by', v_row.approved_by,
    'expires_at', v_row.expires_at
  );
end;
$function$;

create or replace function public.be_rider_arrive_stop_v50(
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
as $function$
declare
  v_wayplan text := btrim(coalesce(p_wayplan_id, ''));
  v_way_id text := btrim(coalesce(p_delivery_way_id, ''));
  v_rider_key text := btrim(coalesce(p_rider_key, ''));
  v_stop_lat numeric;
  v_stop_lng numeric;
  v_distance numeric;
  v_radius numeric := 100;
  v_override_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_wayplan = '' or v_way_id = '' then
    raise exception 'WAYPLAN_AND_DELIVERY_WAY_REQUIRED';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'GPS_REQUIRED';
  end if;

  perform public.be_rider_initialize_route_v46(v_wayplan, v_rider_key);

  select latitude, longitude
  into v_stop_lat, v_stop_lng
  from public.be_rider_route_stop_state_v46
  where wayplan_id = v_wayplan and delivery_way_id = v_way_id
  for update;

  if not found then
    raise exception 'DELIVERY_STOP_NOT_FOUND';
  end if;

  select coalesce(numeric_value, 100)
  into v_radius
  from public.be_rider_route_settings_v46
  where setting_key = 'delivery_arrival_radius_m';
  v_radius := coalesce(v_radius, 100);

  v_distance := public.be_rider_distance_m_v46(
    p_latitude, p_longitude, v_stop_lat, v_stop_lng
  );

  if v_distance is null then
    raise exception 'DESTINATION_COORDINATES_REQUIRED';
  end if;

  if v_distance > v_radius then
    select id
    into v_override_id
    from public.be_rider_geofence_overrides_v50
    where wayplan_id = v_wayplan
      and delivery_way_id = v_way_id
      and used_at is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update skip locked;

    if v_override_id is null then
      raise exception 'GEOFENCE_OUTSIDE_RADIUS|distance_m=%|radius_m=%|supervisor_override_required=true',
        round(v_distance), round(v_radius);
    end if;
  end if;

  v_result := public.be_rider_arrive_stop_v46(
    v_wayplan,
    v_way_id,
    v_rider_key,
    p_latitude,
    p_longitude,
    p_operation_id
  );

  if v_override_id is not null then
    update public.be_rider_geofence_overrides_v50
    set used_at = now(),
        used_by = coalesce(nullif(auth.jwt() ->> 'email', ''), v_rider_key, auth.uid()::text)
    where id = v_override_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'geofence_radius_m', v_radius,
    'distance_m', v_distance,
    'inside_geofence', v_distance <= v_radius,
    'override_used', v_override_id is not null,
    'override_id', v_override_id
  );
end;
$function$;

grant execute on function public.be_supervisor_approve_geofence_override_v50(text,text,text) to authenticated;
grant execute on function public.be_rider_arrive_stop_v50(text,text,text,numeric,numeric,text) to authenticated;