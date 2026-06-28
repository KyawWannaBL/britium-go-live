-- Final Wayplan Management Backend Wire-Up
-- Source of truth:
--   be_portal_pickup_requests
--   be_portal_cargo_events
--   be_mobile_workforce_accounts
--   be_app_notifications
--
-- ID convention:
--   Pickup:  P0518-MEL-015
--   Delivery: D0518-MEL-013
--   Wayplan: W0518-MEL-015

create extension if not exists pgcrypto;

alter table public.be_portal_cargo_events
  add column if not exists wayplan_route_no text,
  add column if not exists wayplan_stop_sequence integer,
  add column if not exists wayplan_status text,
  add column if not exists wayplan_generated_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists payload jsonb default '{}'::jsonb;

alter table public.be_portal_pickup_requests
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists assigned_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists payload jsonb default '{}'::jsonb;

create table if not exists public.be_wayplan_routes (
  id uuid primary key default gen_random_uuid(),
  route_no text not null unique,
  pickup_id text not null,
  route_date date not null default current_date,
  route_zone text,
  route_status text not null default 'planned',
  assigned_rider_code text,
  assigned_rider_name text,
  assigned_driver_code text,
  assigned_driver_name text,
  assigned_helper_code text,
  assigned_helper_name text,
  assigned_vehicle_plate text,
  total_stops integer not null default 0,
  total_cod numeric not null default 0,
  completed_stops integer not null default 0,
  failed_stops integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.be_wayplan_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.be_wayplan_routes(id) on delete cascade,
  route_no text not null,
  pickup_id text not null,
  cargo_event_id uuid,
  deliver_way_id text not null,
  stop_sequence integer not null default 1,
  township text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  cod_amount numeric not null default 0,
  weight_kg numeric not null default 0,
  stop_status text not null default 'planned',
  scan_status text,
  scanned_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(route_no, deliver_way_id)
);

create index if not exists idx_be_wayplan_routes_pickup_id on public.be_wayplan_routes(pickup_id);
create index if not exists idx_be_wayplan_routes_status on public.be_wayplan_routes(route_status);
create index if not exists idx_be_wayplan_stops_pickup_id on public.be_wayplan_stops(pickup_id);
create index if not exists idx_be_wayplan_stops_deliver_way_id on public.be_wayplan_stops(deliver_way_id);
create index if not exists idx_be_wayplan_stops_status on public.be_wayplan_stops(stop_status);

drop function if exists public.be_wayplan_no_from_pickup_id(text);
create or replace function public.be_wayplan_no_from_pickup_id(
  p_pickup_id text
)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(trim(coalesce(p_pickup_id, '')));
begin
  if v ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$' then
    return 'W' || substring(v from 2);
  end if;
  return 'W-' || regexp_replace(v, '[^A-Z0-9]+', '-', 'g');
end;
$$;

drop function if exists public.be_wayplan_zone_for_township(text);
create or replace function public.be_wayplan_zone_for_township(
  p_township text
)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_township, '')));
begin
  if v = '' then
    return 'UNASSIGNED';
  end if;

  if v similar to '%(north dagon|east dagon|south dagon|dagon|မြောက်ဒဂုံ|အရှေ့ဒဂုံ|တောင်ဒဂုံ)%' then
    return 'YGN-DAGON';
  end if;

  if v similar to '%(shwe pyi thar|hlaing thar yar|လှိုင်သာယာ|ရွှေပြည်သာ)%' then
    return 'YGN-WEST';
  end if;

  if v similar to '%(tamwe|bahan|yankin|thingangyun|တာမွေ|ဗဟန်း|ရန်ကင်း|သင်္ဃန်းကျွန်း)%' then
    return 'YGN-CENTRAL';
  end if;

  if v similar to '%(thaketa|north okkalapa|south okkalapa|သာကေတ|မြောက်ဥက္ကလာ|တောင်ဥက္ကလာ)%' then
    return 'YGN-EAST';
  end if;

  if v similar to '%(kamayut|hlaing|sanchaung|ကြည့်မြင်တိုင်|ကမာရွတ်|လှိုင်|စမ်းချောင်း)%' then
    return 'YGN-INNER-WEST';
  end if;

  return 'YGN-GENERAL';
end;
$$;

drop function if exists public.be_wayplan_status_normalize(text);
create or replace function public.be_wayplan_status_normalize(
  p_status text
)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_status, 'planned'))
    when 'planned' then 'planned'
    when 'assigned' then 'assigned'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'in_transit' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'success' then 'delivered'
    when 'failed' then 'failed'
    when 'return' then 'return'
    when 'returned' then 'return'
    when 'hold' then 'hold'
    else lower(coalesce(p_status, 'planned'))
  end;
$$;

drop function if exists public.be_generate_wayplan_for_pickup(text, text);
create or replace function public.be_generate_wayplan_for_pickup(
  p_pickup_id text,
  p_mode text default 'auto'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup public.be_portal_pickup_requests;
  v_route_no text;
  v_route_id uuid;
  v_route_zone text;
  v_inserted integer := 0;
  v_total_stops integer := 0;
  v_total_cod numeric := 0;
begin
  select *
  into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id = upper(trim(p_pickup_id))
    and coalesce(status, '') <> 'archived_test_data'
  limit 1;

  if v_pickup.id is null then
    raise exception 'Pickup % not found or archived', p_pickup_id;
  end if;

  v_route_no := public.be_wayplan_no_from_pickup_id(v_pickup.pickup_id);

  select public.be_wayplan_zone_for_township(
    coalesce(
      (select coalesce(e.recipient_town, e.delivery_township)
       from public.be_portal_cargo_events e
       where e.pickup_id = v_pickup.pickup_id
         and e.event_type = 'data_entry_waybill'
         and coalesce(e.status, '') <> 'archived_test_data'
       order by e.line_no
       limit 1),
      v_pickup.township
    )
  )
  into v_route_zone;

  insert into public.be_wayplan_routes (
    route_no,
    pickup_id,
    route_date,
    route_zone,
    route_status,
    assigned_rider_code,
    assigned_rider_name,
    assigned_driver_code,
    assigned_driver_name,
    assigned_helper_code,
    assigned_helper_name,
    assigned_vehicle_plate,
    payload,
    updated_at
  )
  values (
    v_route_no,
    v_pickup.pickup_id,
    coalesce(v_pickup.pickup_date, current_date),
    v_route_zone,
    case when coalesce(v_pickup.assignment_status, '') = 'assigned' then 'assigned' else 'planned' end,
    v_pickup.assigned_rider_code,
    v_pickup.assigned_rider_name,
    v_pickup.assigned_driver_code,
    v_pickup.assigned_driver_name,
    v_pickup.assigned_helper_code,
    v_pickup.assigned_helper_name,
    v_pickup.assigned_vehicle_plate,
    jsonb_build_object(
      'source', 'be_generate_wayplan_for_pickup',
      'mode', coalesce(p_mode, 'auto'),
      'pickup_id', v_pickup.pickup_id,
      'generated_at', now()
    ),
    now()
  )
  on conflict (route_no)
  do update set
    pickup_id = excluded.pickup_id,
    route_date = excluded.route_date,
    route_zone = excluded.route_zone,
    route_status = case
      when public.be_wayplan_routes.route_status in ('delivered', 'closed') then public.be_wayplan_routes.route_status
      else excluded.route_status
    end,
    assigned_rider_code = excluded.assigned_rider_code,
    assigned_rider_name = excluded.assigned_rider_name,
    assigned_driver_code = excluded.assigned_driver_code,
    assigned_driver_name = excluded.assigned_driver_name,
    assigned_helper_code = excluded.assigned_helper_code,
    assigned_helper_name = excluded.assigned_helper_name,
    assigned_vehicle_plate = excluded.assigned_vehicle_plate,
    payload = coalesce(public.be_wayplan_routes.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning id into v_route_id;

  with ordered as (
    select
      e.id as cargo_event_id,
      e.pickup_id,
      coalesce(e.deliver_way_id, e.tracking_no) as deliver_way_id,
      row_number() over (
        order by
          public.be_wayplan_zone_for_township(coalesce(e.recipient_town, e.delivery_township)),
          coalesce(e.recipient_town, e.delivery_township, ''),
          coalesce(e.line_no, 999999),
          coalesce(e.deliver_way_id, e.tracking_no)
      )::int as stop_sequence,
      coalesce(e.recipient_town, e.delivery_township) as township,
      e.receiver_name as recipient_name,
      e.receiver_phone as recipient_phone,
      e.delivery_address,
      coalesce(e.final_cod, e.cod_amount, 0) as cod_amount,
      coalesce(e.field_pickup_weight_kg, e.weight_kg, 0) as weight_kg,
      coalesce(e.status, 'planned') as source_status,
      e.line_no
    from public.be_portal_cargo_events e
    where e.pickup_id = v_pickup.pickup_id
      and e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') <> 'archived_test_data'
      and coalesce(e.deliver_way_id, e.tracking_no) is not null
  ),
  upserted as (
    insert into public.be_wayplan_stops (
      route_id,
      route_no,
      pickup_id,
      cargo_event_id,
      deliver_way_id,
      stop_sequence,
      township,
      recipient_name,
      recipient_phone,
      delivery_address,
      cod_amount,
      weight_kg,
      stop_status,
      payload,
      updated_at
    )
    select
      v_route_id,
      v_route_no,
      pickup_id,
      cargo_event_id,
      deliver_way_id,
      stop_sequence,
      township,
      recipient_name,
      recipient_phone,
      delivery_address,
      cod_amount,
      weight_kg,
      case
        when source_status in ('delivered', 'failed', 'return') then source_status
        when coalesce(v_pickup.assignment_status, '') = 'assigned' then 'assigned'
        else 'planned'
      end,
      jsonb_build_object(
        'source', 'be_portal_cargo_events',
        'line_no', line_no,
        'zone', public.be_wayplan_zone_for_township(township)
      ),
      now()
    from ordered
    on conflict (route_no, deliver_way_id)
    do update set
      route_id = excluded.route_id,
      pickup_id = excluded.pickup_id,
      cargo_event_id = excluded.cargo_event_id,
      stop_sequence = excluded.stop_sequence,
      township = excluded.township,
      recipient_name = excluded.recipient_name,
      recipient_phone = excluded.recipient_phone,
      delivery_address = excluded.delivery_address,
      cod_amount = excluded.cod_amount,
      weight_kg = excluded.weight_kg,
      stop_status = case
        when public.be_wayplan_stops.stop_status in ('delivered', 'failed', 'return') then public.be_wayplan_stops.stop_status
        else excluded.stop_status
      end,
      payload = coalesce(public.be_wayplan_stops.payload, '{}'::jsonb) || excluded.payload,
      updated_at = now()
    returning 1
  )
  select count(*) into v_inserted from upserted;

  update public.be_portal_cargo_events e
  set
    wayplan_route_no = v_route_no,
    wayplan_stop_sequence = s.stop_sequence,
    wayplan_status = s.stop_status,
    wayplan_generated_at = now(),
    updated_at = now(),
    payload = coalesce(e.payload, '{}'::jsonb) || jsonb_build_object(
      'wayplan_route_no', v_route_no,
      'wayplan_stop_sequence', s.stop_sequence,
      'wayplan_status', s.stop_status
    )
  from public.be_wayplan_stops s
  where s.cargo_event_id = e.id
    and s.route_no = v_route_no;

  select
    count(*),
    coalesce(sum(cod_amount), 0)
  into v_total_stops, v_total_cod
  from public.be_wayplan_stops
  where route_no = v_route_no;

  update public.be_wayplan_routes r
  set
    total_stops = v_total_stops,
    total_cod = v_total_cod,
    completed_stops = (
      select count(*) from public.be_wayplan_stops s
      where s.route_no = v_route_no and s.stop_status = 'delivered'
    ),
    failed_stops = (
      select count(*) from public.be_wayplan_stops s
      where s.route_no = v_route_no and s.stop_status in ('failed', 'return')
    ),
    updated_at = now()
  where r.route_no = v_route_no;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup.pickup_id,
    'wayplan_route_no', v_route_no,
    'route_zone', v_route_zone,
    'inserted_or_updated_stops', v_inserted,
    'total_stops', v_total_stops,
    'total_cod', v_total_cod
  );
end;
$$;

drop function if exists public.be_wayplan_list(text, integer);
create or replace function public.be_wayplan_list(
  p_pickup_or_route text default null,
  p_limit integer default 200
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_no', r.route_no,
        'pickup_id', r.pickup_id,
        'route_date', r.route_date,
        'route_zone', r.route_zone,
        'route_status', r.route_status,
        'assigned_rider_code', r.assigned_rider_code,
        'assigned_rider_name', r.assigned_rider_name,
        'assigned_driver_code', r.assigned_driver_code,
        'assigned_driver_name', r.assigned_driver_name,
        'assigned_helper_code', r.assigned_helper_code,
        'assigned_helper_name', r.assigned_helper_name,
        'assigned_vehicle_plate', r.assigned_vehicle_plate,
        'total_stops', r.total_stops,
        'completed_stops', r.completed_stops,
        'failed_stops', r.failed_stops,
        'total_cod', r.total_cod,
        'updated_at', r.updated_at,
        'stops', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'route_no', s.route_no,
              'pickup_id', s.pickup_id,
              'deliver_way_id', s.deliver_way_id,
              'stop_sequence', s.stop_sequence,
              'township', s.township,
              'recipient_name', s.recipient_name,
              'recipient_phone', s.recipient_phone,
              'delivery_address', s.delivery_address,
              'cod_amount', s.cod_amount,
              'weight_kg', s.weight_kg,
              'stop_status', s.stop_status,
              'scan_status', s.scan_status,
              'updated_at', s.updated_at
            )
            order by s.stop_sequence
          )
          from public.be_wayplan_stops s
          where s.route_no = r.route_no
        ), '[]'::jsonb)
      )
      order by r.updated_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.be_wayplan_routes r
    where (
      coalesce(p_pickup_or_route, '') = ''
      or r.pickup_id = upper(trim(p_pickup_or_route))
      or r.route_no = upper(trim(p_pickup_or_route))
    )
    order by r.updated_at desc
    limit coalesce(p_limit, 200)
  ) r;
$$;

drop function if exists public.be_wayplan_dashboard_snapshot(text, integer);
create or replace function public.be_wayplan_dashboard_snapshot(
  p_search text default '',
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_routes jsonb;
  v_stops jsonb;
  v_kpis jsonb;
  v_search text := lower(trim(coalesce(p_search, '')));
begin
  select jsonb_build_object(
    'pending_pickups', coalesce((
      select count(*)
      from public.be_portal_pickup_requests p
      where coalesce(p.status, '') not in ('archived_test_data', 'cancelled')
        and coalesce(p.assignment_status, 'pending_assignment') <> 'assigned'
    ), 0),
    'hub_processing', coalesce((
      select count(*)
      from public.be_portal_cargo_events e
      where e.event_type = 'data_entry_waybill'
        and coalesce(e.status, '') in ('draft', 'assigned', 'pickup_verified', 'hub_received', 'sorting')
    ), 0),
    'active_dispatch', coalesce((
      select count(*)
      from public.be_wayplan_routes r
      where r.route_status in ('planned', 'assigned', 'out_for_delivery')
    ), 0),
    'success_rate', coalesce((
      select round(
        100.0 * count(*) filter (where stop_status = 'delivered')
        / nullif(count(*) filter (where stop_status in ('delivered', 'failed', 'return')), 0),
        1
      )
      from public.be_wayplan_stops
    ), 0),
    'cod_to_collect', coalesce((
      select sum(cod_amount)
      from public.be_wayplan_stops
      where stop_status not in ('delivered', 'return')
    ), 0)
  )
  into v_kpis;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.updated_at desc),
    '[]'::jsonb
  )
  into v_routes
  from (
    select
      r.route_no,
      r.pickup_id,
      r.route_date,
      r.route_zone,
      r.route_status,
      r.assigned_rider_name,
      r.assigned_driver_name,
      r.assigned_helper_name,
      r.assigned_vehicle_plate,
      r.total_stops,
      r.completed_stops,
      r.failed_stops,
      r.total_cod,
      r.updated_at
    from public.be_wayplan_routes r
    where v_search = ''
       or lower(r.route_no) like '%' || v_search || '%'
       or lower(r.pickup_id) like '%' || v_search || '%'
       or lower(coalesce(r.route_zone, '')) like '%' || v_search || '%'
       or lower(coalesce(r.assigned_rider_name, '')) like '%' || v_search || '%'
    order by r.updated_at desc
    limit coalesce(p_limit, 200)
  ) r;

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.route_no desc, s.stop_sequence),
    '[]'::jsonb
  )
  into v_stops
  from (
    select
      s.id,
      s.route_no,
      s.pickup_id,
      s.deliver_way_id,
      s.stop_sequence,
      s.township,
      s.recipient_name,
      s.recipient_phone,
      s.delivery_address,
      s.cod_amount,
      s.weight_kg,
      s.stop_status,
      s.scan_status,
      s.updated_at
    from public.be_wayplan_stops s
    where v_search = ''
       or lower(s.route_no) like '%' || v_search || '%'
       or lower(s.pickup_id) like '%' || v_search || '%'
       or lower(s.deliver_way_id) like '%' || v_search || '%'
       or lower(coalesce(s.recipient_name, '')) like '%' || v_search || '%'
       or lower(coalesce(s.recipient_phone, '')) like '%' || v_search || '%'
       or lower(coalesce(s.township, '')) like '%' || v_search || '%'
    order by s.updated_at desc
    limit coalesce(p_limit, 200)
  ) s;

  return jsonb_build_object(
    'ok', true,
    'kpis', v_kpis,
    'routes', v_routes,
    'stops', v_stops,
    'server_time', now()
  );
end;
$$;

drop function if exists public.be_wayplan_update_stop_status(text, text, text);
create or replace function public.be_wayplan_update_stop_status(
  p_deliver_way_id text,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deliver_way_id text := upper(trim(p_deliver_way_id));
  v_status text := public.be_wayplan_status_normalize(p_status);
  v_stop public.be_wayplan_stops;
begin
  update public.be_wayplan_stops
  set
    stop_status = v_status,
    scan_status = v_status,
    scanned_at = case when v_status in ('out_for_delivery', 'delivered', 'failed', 'return') then now() else scanned_at end,
    delivered_at = case when v_status = 'delivered' then now() else delivered_at end,
    failed_at = case when v_status in ('failed', 'return') then now() else failed_at end,
    failure_reason = case when v_status in ('failed', 'return') then p_note else failure_reason end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'last_status_note', p_note,
      'last_status_at', now()
    ),
    updated_at = now()
  where deliver_way_id = v_deliver_way_id
  returning * into v_stop;

  if v_stop.id is null then
    raise exception 'Wayplan stop % not found', p_deliver_way_id;
  end if;

  update public.be_portal_cargo_events e
  set
    status = v_status,
    wayplan_status = v_status,
    updated_at = now(),
    payload = coalesce(e.payload, '{}'::jsonb) || jsonb_build_object(
      'wayplan_status', v_status,
      'wayplan_status_note', p_note,
      'wayplan_status_at', now()
    )
  where e.id = v_stop.cargo_event_id
     or coalesce(e.deliver_way_id, e.tracking_no) = v_deliver_way_id;

  update public.be_wayplan_routes r
  set
    completed_stops = (
      select count(*) from public.be_wayplan_stops s
      where s.route_no = r.route_no and s.stop_status = 'delivered'
    ),
    failed_stops = (
      select count(*) from public.be_wayplan_stops s
      where s.route_no = r.route_no and s.stop_status in ('failed', 'return')
    ),
    route_status = case
      when (select count(*) from public.be_wayplan_stops s where s.route_no = r.route_no and s.stop_status not in ('delivered', 'failed', 'return')) = 0
        then 'closed'
      when (select count(*) from public.be_wayplan_stops s where s.route_no = r.route_no and s.stop_status = 'out_for_delivery') > 0
        then 'out_for_delivery'
      else r.route_status
    end,
    updated_at = now()
  where r.route_no = v_stop.route_no;

  return jsonb_build_object(
    'ok', true,
    'deliver_way_id', v_deliver_way_id,
    'status', v_status,
    'route_no', v_stop.route_no
  );
end;
$$;

drop function if exists public.be_wayplan_assign_route(text, text, text, text, text, text);
create or replace function public.be_wayplan_assign_route(
  p_pickup_id text,
  p_rider_code text default null,
  p_driver_code text default null,
  p_helper_code text default null,
  p_vehicle_plate text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := upper(trim(p_pickup_id));
  v_route_no text := public.be_wayplan_no_from_pickup_id(v_pickup_id);
  v_assignment jsonb;
begin
  if to_regprocedure('public.be_assign_pickup_field_team(text,text,text,text,text,text)') is not null then
    select public.be_assign_pickup_field_team(
      v_pickup_id,
      p_rider_code,
      p_driver_code,
      p_helper_code,
      p_vehicle_plate,
      p_note
    ) into v_assignment;
  else
    update public.be_portal_pickup_requests
    set
      assigned_rider_code = coalesce(p_rider_code, assigned_rider_code),
      assigned_driver_code = coalesce(p_driver_code, assigned_driver_code),
      assigned_helper_code = coalesce(p_helper_code, assigned_helper_code),
      assigned_vehicle_plate = coalesce(p_vehicle_plate, assigned_vehicle_plate),
      assignment_status = 'assigned',
      assigned_at = now(),
      updated_at = now()
    where pickup_id = v_pickup_id;

    v_assignment := jsonb_build_object('ok', true, 'pickup_id', v_pickup_id);
  end if;

  perform public.be_generate_wayplan_for_pickup(v_pickup_id, 'assign_route');

  update public.be_wayplan_routes r
  set
    route_status = 'assigned',
    assigned_rider_code = p.assigned_rider_code,
    assigned_rider_name = p.assigned_rider_name,
    assigned_driver_code = p.assigned_driver_code,
    assigned_driver_name = p.assigned_driver_name,
    assigned_helper_code = p.assigned_helper_code,
    assigned_helper_name = p.assigned_helper_name,
    assigned_vehicle_plate = p.assigned_vehicle_plate,
    updated_at = now()
  from public.be_portal_pickup_requests p
  where p.pickup_id = v_pickup_id
    and r.route_no = v_route_no;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'route_no', v_route_no,
    'assignment', v_assignment
  );
end;
$$;

drop function if exists public.be_wayplan_export_rows(text, integer);
create or replace function public.be_wayplan_export_rows(
  p_pickup_or_route text default null,
  p_limit integer default 1000
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'route_no', s.route_no,
        'pickup_id', s.pickup_id,
        'deliver_way_id', s.deliver_way_id,
        'stop_sequence', s.stop_sequence,
        'township', s.township,
        'recipient_name', s.recipient_name,
        'recipient_phone', s.recipient_phone,
        'delivery_address', s.delivery_address,
        'cod_amount', s.cod_amount,
        'weight_kg', s.weight_kg,
        'stop_status', s.stop_status,
        'assigned_rider_name', r.assigned_rider_name,
        'assigned_driver_name', r.assigned_driver_name,
        'vehicle_plate', r.assigned_vehicle_plate,
        'updated_at', s.updated_at
      )
      order by s.route_no, s.stop_sequence
    ),
    '[]'::jsonb
  )
  from public.be_wayplan_stops s
  join public.be_wayplan_routes r on r.route_no = s.route_no
  where coalesce(p_pickup_or_route, '') = ''
     or s.pickup_id = upper(trim(p_pickup_or_route))
     or s.route_no = upper(trim(p_pickup_or_route))
  limit coalesce(p_limit, 1000);
$$;

grant execute on function public.be_wayplan_no_from_pickup_id(text) to authenticated;
grant execute on function public.be_wayplan_zone_for_township(text) to authenticated;
grant execute on function public.be_wayplan_status_normalize(text) to authenticated;
grant execute on function public.be_generate_wayplan_for_pickup(text, text) to authenticated;
grant execute on function public.be_wayplan_list(text, integer) to authenticated;
grant execute on function public.be_wayplan_dashboard_snapshot(text, integer) to authenticated;
grant execute on function public.be_wayplan_update_stop_status(text, text, text) to authenticated;
grant execute on function public.be_wayplan_assign_route(text, text, text, text, text, text) to authenticated;
grant execute on function public.be_wayplan_export_rows(text, integer) to authenticated;

notify pgrst, 'reload schema';
