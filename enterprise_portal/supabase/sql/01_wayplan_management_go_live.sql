
-- Final Wayplan Go-Live Patch
-- Source of truth:
--   be_portal_pickup_requests
--   be_portal_cargo_events
--   be_mobile_workforce_accounts
--   be_app_notifications
--
-- Operational IDs:
--   Pickup Way ID   = P0518-MEL-015
--   Delivery Way ID = D0518-MEL-013 / 014 / 015

create extension if not exists pgcrypto;

-- 1) Make cargo rows wayplan-ready.
alter table public.be_portal_cargo_events
  add column if not exists wayplan_route_id uuid,
  add column if not exists wayplan_zone_code text,
  add column if not exists wayplan_route_name text,
  add column if not exists wayplan_sequence integer,
  add column if not exists wayplan_status text default 'pending_wayplan',
  add column if not exists is_highway_dropoff boolean default false,
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists field_pickup_checked boolean default false,
  add column if not exists pickup_verification_status text default 'pending',
  add column if not exists data_entry_registration_checked boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

-- 2) Wayplan master/stop tables.
create table if not exists public.be_wayplan_township_aliases (
  alias text primary key,
  normalized_alias text not null unique,
  zone_code text not null,
  route_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_wayplan_routes (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  route_code text not null,
  route_name text not null,
  status text not null default 'draft',
  assigned_rider_code text,
  assigned_rider_name text,
  assigned_driver_code text,
  assigned_driver_name text,
  assigned_helper_code text,
  assigned_helper_name text,
  assigned_vehicle_plate text,
  stop_count integer not null default 0,
  total_cod numeric not null default 0,
  total_weight numeric not null default 0,
  manifest_payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  assigned_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pickup_id, route_code)
);

create table if not exists public.be_wayplan_stops (
  id uuid primary key default gen_random_uuid(),
  wayplan_route_id uuid not null references public.be_wayplan_routes(id) on delete cascade,
  pickup_id text not null,
  cargo_event_id uuid not null,
  deliver_way_id text not null,
  stop_sequence integer not null,
  township text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  cod_amount numeric not null default 0,
  weight_kg numeric not null default 0,
  status text not null default 'planned',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cargo_event_id)
);

-- 3) Seed alias mapping from the uploaded legacy Python wayplan engine.
create or replace function public.be_wayplan_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
$$;

insert into public.be_wayplan_township_aliases(alias, normalized_alias, zone_code, route_name)
values
      ('ahlon', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ahlone', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('botahtaung', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('botataung', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('kyauktada', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('kyauktadar', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('kyeemyindaing', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('kyimyindaing', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('lanmadaw', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('latha', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('pabedan', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('pazundaung', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('sanchaung', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ကျောက်တံတား', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ကြည့်မြင်တိုင်', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('စမ်းချောင်း', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ပန်းဘဲတန်း', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ပုဇွန်တောင်', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('ဗိုလ်တထောင်', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('လမ်းမတော်', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('လသာ', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('အလုံ', 'AHLONE', 'Ahlone Branch Bicycle Rider'),
      ('eastdagon', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('edagon', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('ndagon', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('northdagon', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('sokkalapa', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('southokkalapa', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('thingangyun', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('တောင်ဥက္ကလာပ', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('မြောက်ဒဂုံ', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('သင်္ဃန်းကျွန်း', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('အရှေ့ဒဂုံ', 'HQRIDERS', 'HQ Bicycle Rider Pool'),
      ('bahan', 'VAN1', 'Van 1 (Central-East)'),
      ('dagon', 'VAN1', 'Van 1 (Central-East)'),
      ('kamaryut', 'VAN1', 'Van 1 (Central-East)'),
      ('kamayut', 'VAN1', 'Van 1 (Central-East)'),
      ('mingalartaungnyunt', 'VAN1', 'Van 1 (Central-East)'),
      ('mingalataungnyunt', 'VAN1', 'Van 1 (Central-East)'),
      ('tamwe', 'VAN1', 'Van 1 (Central-East)'),
      ('tarmwe', 'VAN1', 'Van 1 (Central-East)'),
      ('ကမာရွတ်', 'VAN1', 'Van 1 (Central-East)'),
      ('တာမွေ', 'VAN1', 'Van 1 (Central-East)'),
      ('ဒဂုံ', 'VAN1', 'Van 1 (Central-East)'),
      ('ဗဟန်း', 'VAN1', 'Van 1 (Central-East)'),
      ('မင်္ဂလာတောင်ညွန့်', 'VAN1', 'Van 1 (Central-East)'),
      ('hlaing', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('hlaingtharyar', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('hlaingthaya', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('insein', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('mayangon', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('mayangone', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('mingaladon', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('mingalardon', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('shwepyitha', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('shwepyithar', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('မင်္ဂလာဒုံ', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('မရမ်းကုန်း', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('ရွှေပြည်သာ', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('လှိုင်', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('လှိုင်သာယာ', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('အင်းစိန်', 'VAN2', 'Van 2 (North-West & Highway Drop)'),
      ('dagonseikan', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('dagonseikkan', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('dawbon', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('nokkalapa', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('northokkalapa', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('sdagon', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('southdagon', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('thaketa', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('yankin', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('တောင်ဒဂုံ', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('ဒဂုံဆိပ်ကမ်း', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('ဒေါပုံ', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('မြောက်ဥက္ကလာပ', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('ရန်ကင်း', 'VAN3', 'Van 3 (East & Highway Drop)'),
      ('သာကေတ', 'VAN3', 'Van 3 (East & Highway Drop)')
on conflict (alias)
do update set
  normalized_alias = excluded.normalized_alias,
  zone_code = excluded.zone_code,
  route_name = excluded.route_name,
  is_active = true,
  updated_at = now();

-- 4) Route resolver copied from legacy_wayplan_final_engine.py.
create or replace function public.be_wayplan_resolve_route(
  p_township text,
  p_address text default ''
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_town text := public.be_wayplan_normalize_text(p_township);
  v_addr text := public.be_wayplan_normalize_text(p_address);
  v_alias public.be_wayplan_township_aliases;
  v_zone text := 'OUT_OF_SERVICE';
  v_route text := 'OUT_OF_SERVICE';
  v_highway boolean := false;
begin
  v_highway :=
    v_town like '%ဒဂုံဧရာ%' or v_addr like '%ဒဂုံဧရာ%' or
    v_town like '%လှိုင်သာယာအဝေးပြေး%' or v_addr like '%လှိုင်သာယာအဝေးပြေး%' or
    v_town like '%အောင်မင်္ဂလာ%' or v_addr like '%အောင်မင်္ဂလာ%' or
    v_town like '%မြောက်ဥက္ကလာအဝေးပြေး%' or v_addr like '%မြောက်ဥက္ကလာအဝေးပြေး%' or
    v_town like '%aungmingalar%' or v_addr like '%aungmingalar%' or
    v_town like '%dagonayar%' or v_addr like '%dagonayar%' or
    v_town like '%highway%' or v_addr like '%highway%';

  if v_highway then
    if v_town like '%ဒဂုံဧရာ%' or v_addr like '%ဒဂုံဧရာ%'
       or v_town like '%လှိုင်သာယာအဝေးပြေး%' or v_addr like '%လှိုင်သာယာအဝေးပြေး%'
       or v_town like '%dagonayar%' or v_addr like '%dagonayar%' then
      return jsonb_build_object(
        'zone_code', 'VAN2',
        'route_name', 'Van 2 (North-West & Highway Drop)',
        'is_highway_dropoff', true
      );
    end if;

    return jsonb_build_object(
      'zone_code', 'VAN3',
      'route_name', 'Van 3 (East & Highway Drop)',
      'is_highway_dropoff', true
    );
  end if;

  select *
  into v_alias
  from public.be_wayplan_township_aliases a
  where a.is_active = true
    and a.normalized_alias = v_town
  limit 1;

  if v_alias.alias is not null then
    return jsonb_build_object(
      'zone_code', v_alias.zone_code,
      'route_name', v_alias.route_name,
      'is_highway_dropoff', false
    );
  end if;

  -- Legacy fallback matching.
  if v_town like '%hlaingtharyar%' or v_town like '%hlaingthaya%'
     or v_town like '%shwepyitha%' or v_town like '%shwepyithar%'
     or v_town like '%insein%' then
    v_zone := 'VAN2'; v_route := 'Van 2 (North-West & Highway Drop)';
  elsif v_town like '%yankin%' or v_town like '%thaketa%' or v_town like '%dawbon%' then
    v_zone := 'VAN3'; v_route := 'Van 3 (East & Highway Drop)';
  elsif v_town like '%thingangyun%' or v_town like '%northdagon%' or v_town like '%eastdagon%' then
    v_zone := 'HQRIDERS'; v_route := 'HQ Bicycle Rider Pool';
  elsif v_town like '%southdagon%' or v_town like '%dagonseikkan%' or v_town like '%dagonseikan%' then
    v_zone := 'VAN3'; v_route := 'Van 3 (East & Highway Drop)';
  end if;

  return jsonb_build_object(
    'zone_code', v_zone,
    'route_name', v_route,
    'is_highway_dropoff', false
  );
end;
$$;

-- 5) Generate/update wayplan routes and stop sequence for a pickup.
create or replace function public.be_generate_wayplan_for_pickup(
  p_pickup_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(p_pickup_id);
  v_row record;
  v_res jsonb;
  v_zone text;
  v_route text;
  v_highway boolean;
  v_hq_counter integer := 0;
  v_route_id uuid;
  v_route_count integer;
  v_stop_count integer;
begin
  if v_pickup_id is null or v_pickup_id = '' then
    raise exception 'pickup_id is required';
  end if;

  if not exists (
    select 1 from public.be_portal_pickup_requests where pickup_id = v_pickup_id
  ) then
    raise exception 'Pickup % not found', v_pickup_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('wayplan:' || v_pickup_id));

  -- Clean existing stop rows for regenerated wayplan. Keep route rows but refresh their counts.
  delete from public.be_wayplan_stops
  where pickup_id = v_pickup_id;

  for v_row in
    select
      e.*,
      coalesce(e.recipient_town, e.delivery_township, e.pickup_township) as route_township
    from public.be_portal_cargo_events e
    where e.pickup_id = v_pickup_id
      and e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
    order by
      coalesce(e.recipient_town, e.delivery_township, e.pickup_township),
      e.receiver_phone,
      e.receiver_name,
      e.line_no
  loop
    v_res := public.be_wayplan_resolve_route(v_row.route_township, v_row.delivery_address);
    v_zone := v_res->>'zone_code';
    v_route := v_res->>'route_name';
    v_highway := coalesce((v_res->>'is_highway_dropoff')::boolean, false);

    -- Legacy HQ pool distribution into six rider pools.
    if v_zone = 'HQRIDERS' then
      v_hq_counter := v_hq_counter + 1;
      v_route := 'HQ Bicycle Rider ' || (((v_hq_counter - 1) % 6) + 1)::text;
      v_zone := 'HQRIDER' || (((v_hq_counter - 1) % 6) + 1)::text;
    end if;

    insert into public.be_wayplan_routes (
      pickup_id,
      route_code,
      route_name,
      status,
      generated_at,
      updated_at
    )
    values (
      v_pickup_id,
      v_zone,
      v_route,
      'draft',
      now(),
      now()
    )
    on conflict (pickup_id, route_code)
    do update set
      route_name = excluded.route_name,
      generated_at = now(),
      updated_at = now()
    returning id into v_route_id;

    insert into public.be_wayplan_stops (
      wayplan_route_id,
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
      status,
      payload,
      updated_at
    )
    values (
      v_route_id,
      v_pickup_id,
      v_row.id,
      coalesce(v_row.deliver_way_id, v_row.tracking_no),
      0,
      v_row.route_township,
      v_row.receiver_name,
      v_row.receiver_phone,
      v_row.delivery_address,
      coalesce(v_row.final_cod, v_row.cod_amount, 0),
      coalesce(v_row.field_pickup_weight_kg, v_row.weight_kg, 1),
      'planned',
      jsonb_build_object(
        'is_highway_dropoff', v_highway,
        'zone_code', v_zone,
        'route_name', v_route
      ),
      now()
    )
    on conflict (cargo_event_id)
    do update set
      wayplan_route_id = excluded.wayplan_route_id,
      deliver_way_id = excluded.deliver_way_id,
      township = excluded.township,
      recipient_name = excluded.recipient_name,
      recipient_phone = excluded.recipient_phone,
      delivery_address = excluded.delivery_address,
      cod_amount = excluded.cod_amount,
      weight_kg = excluded.weight_kg,
      payload = excluded.payload,
      updated_at = now();

    update public.be_portal_cargo_events
    set
      wayplan_route_id = v_route_id,
      wayplan_zone_code = v_zone,
      wayplan_route_name = v_route,
      wayplan_status = 'planned',
      is_highway_dropoff = v_highway,
      updated_at = now()
    where id = v_row.id;
  end loop;

  -- Re-number stops by route with the legacy sorting hierarchy.
  with numbered as (
    select
      s.id,
      row_number() over (
        partition by s.wayplan_route_id
        order by s.township nulls last, s.recipient_phone nulls last, s.recipient_name nulls last, s.deliver_way_id
      ) as rn
    from public.be_wayplan_stops s
    where s.pickup_id = v_pickup_id
  )
  update public.be_wayplan_stops s
  set stop_sequence = n.rn,
      updated_at = now()
  from numbered n
  where s.id = n.id;

  update public.be_portal_cargo_events e
  set
    wayplan_sequence = s.stop_sequence,
    updated_at = now()
  from public.be_wayplan_stops s
  where e.id = s.cargo_event_id
    and s.pickup_id = v_pickup_id;

  -- Refresh route totals.
  update public.be_wayplan_routes r
  set
    stop_count = coalesce(x.stop_count, 0),
    total_cod = coalesce(x.total_cod, 0),
    total_weight = coalesce(x.total_weight, 0),
    status = case when coalesce(x.stop_count, 0) = 0 then 'empty' else r.status end,
    updated_at = now()
  from (
    select
      wayplan_route_id,
      count(*) as stop_count,
      sum(cod_amount) as total_cod,
      sum(weight_kg) as total_weight
    from public.be_wayplan_stops
    where pickup_id = v_pickup_id
    group by wayplan_route_id
  ) x
  where r.id = x.wayplan_route_id;

  select count(*) into v_route_count
  from public.be_wayplan_routes
  where pickup_id = v_pickup_id
    and stop_count > 0;

  select count(*) into v_stop_count
  from public.be_wayplan_stops
  where pickup_id = v_pickup_id;

  update public.be_portal_pickup_requests
  set
    status = case when status in ('pending_assignment', 'data_entry_in_progress', 'data_entry_completed') then 'wayplan_generated' else status end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'wayplan_generated_at', now(),
      'wayplan_route_count', v_route_count,
      'wayplan_stop_count', v_stop_count
    ),
    updated_at = now()
  where pickup_id = v_pickup_id;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'route_count', v_route_count,
    'stop_count', v_stop_count,
    'routes', public.be_wayplan_list(v_pickup_id, 100)
  );
end;
$$;

-- 6) Wayplan listing for portal UI and print/manifest.
create or replace function public.be_wayplan_list(
  p_pickup_id text default null,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'pickup_id', r.pickup_id,
        'route_code', r.route_code,
        'route_name', r.route_name,
        'status', r.status,
        'assigned_rider_code', r.assigned_rider_code,
        'assigned_rider_name', r.assigned_rider_name,
        'assigned_driver_code', r.assigned_driver_code,
        'assigned_driver_name', r.assigned_driver_name,
        'assigned_helper_code', r.assigned_helper_code,
        'assigned_helper_name', r.assigned_helper_name,
        'assigned_vehicle_plate', r.assigned_vehicle_plate,
        'stop_count', r.stop_count,
        'total_cod', r.total_cod,
        'total_weight', r.total_weight,
        'generated_at', r.generated_at,
        'assigned_at', r.assigned_at,
        'stops', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'cargo_event_id', s.cargo_event_id,
              'deliver_way_id', s.deliver_way_id,
              'stop_sequence', s.stop_sequence,
              'township', s.township,
              'recipient_name', s.recipient_name,
              'recipient_phone', s.recipient_phone,
              'delivery_address', s.delivery_address,
              'cod_amount', s.cod_amount,
              'weight_kg', s.weight_kg,
              'status', s.status
            )
            order by s.stop_sequence
          )
          from public.be_wayplan_stops s
          where s.wayplan_route_id = r.id
        ), '[]'::jsonb)
      )
      order by r.route_code
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.be_wayplan_routes
    where (p_pickup_id is null or p_pickup_id = '' or pickup_id = p_pickup_id)
      and stop_count > 0
    order by generated_at desc
    limit coalesce(p_limit, 100)
  ) r;
$$;

-- 7) Assign a generated route to field team and update cargo rows.
create or replace function public.be_wayplan_assign_route(
  p_wayplan_route_id uuid,
  p_rider_code text default null,
  p_driver_code text default null,
  p_helper_code text default null,
  p_vehicle_plate text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_route public.be_wayplan_routes;
  v_rider public.be_mobile_workforce_accounts;
  v_driver public.be_mobile_workforce_accounts;
  v_helper public.be_mobile_workforce_accounts;
begin
  select * into v_route
  from public.be_wayplan_routes
  where id = p_wayplan_route_id;

  if v_route.id is null then
    raise exception 'Wayplan route not found';
  end if;

  if nullif(trim(coalesce(p_rider_code, '')), '') is not null then
    select * into v_rider
    from public.be_mobile_workforce_accounts
    where lower(workforce_type) = 'rider'
      and status = 'active'
      and lower(workforce_code) = lower(trim(p_rider_code))
    limit 1;
  end if;

  if nullif(trim(coalesce(p_driver_code, '')), '') is not null then
    select * into v_driver
    from public.be_mobile_workforce_accounts
    where lower(workforce_type) = 'driver'
      and status = 'active'
      and lower(workforce_code) = lower(trim(p_driver_code))
    limit 1;
  end if;

  if nullif(trim(coalesce(p_helper_code, '')), '') is not null then
    select * into v_helper
    from public.be_mobile_workforce_accounts
    where lower(workforce_type) = 'helper'
      and status = 'active'
      and lower(workforce_code) = lower(trim(p_helper_code))
    limit 1;
  end if;

  update public.be_wayplan_routes
  set
    status = 'assigned',
    assigned_rider_code = v_rider.workforce_code,
    assigned_rider_name = v_rider.display_name,
    assigned_driver_code = v_driver.workforce_code,
    assigned_driver_name = v_driver.display_name,
    assigned_helper_code = v_helper.workforce_code,
    assigned_helper_name = v_helper.display_name,
    assigned_vehicle_plate = nullif(trim(coalesce(p_vehicle_plate, '')), ''),
    assigned_at = now(),
    updated_at = now()
  where id = v_route.id
  returning * into v_route;

  update public.be_portal_cargo_events e
  set
    assigned_rider_code = coalesce(v_rider.workforce_code, e.assigned_rider_code),
    assigned_rider_name = coalesce(v_rider.display_name, e.assigned_rider_name),
    assigned_driver_code = coalesce(v_driver.workforce_code, e.assigned_driver_code),
    assigned_driver_name = coalesce(v_driver.display_name, e.assigned_driver_name),
    assigned_helper_code = coalesce(v_helper.workforce_code, e.assigned_helper_code),
    assigned_helper_name = coalesce(v_helper.display_name, e.assigned_helper_name),
    assigned_vehicle_plate = coalesce(nullif(trim(coalesce(p_vehicle_plate, '')), ''), e.assigned_vehicle_plate),
    wayplan_status = 'route_assigned',
    status = case when coalesce(e.status, '') in ('draft', 'pickup_verified', 'ready_for_operations') then 'assigned' else e.status end,
    updated_at = now()
  from public.be_wayplan_stops s
  where e.id = s.cargo_event_id
    and s.wayplan_route_id = v_route.id;

  return jsonb_build_object(
    'ok', true,
    'route', to_jsonb(v_route),
    'stops', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.stop_sequence), '[]'::jsonb)
      from public.be_wayplan_stops s
      where s.wayplan_route_id = v_route.id
    )
  );
end;
$$;

-- 8) Manifest/print rows from same wayplan tables.
create or replace function public.be_wayplan_manifest_rows(
  p_pickup_id text,
  p_route_code text default null
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pickup_id', s.pickup_id,
        'route_code', r.route_code,
        'route_name', r.route_name,
        'stop_sequence', s.stop_sequence,
        'deliver_way_id', s.deliver_way_id,
        'recipient_name', s.recipient_name,
        'recipient_phone', s.recipient_phone,
        'township', s.township,
        'delivery_address', s.delivery_address,
        'cod_amount', s.cod_amount,
        'weight_kg', s.weight_kg,
        'assigned_rider_name', r.assigned_rider_name,
        'assigned_driver_name', r.assigned_driver_name,
        'assigned_helper_name', r.assigned_helper_name,
        'assigned_vehicle_plate', r.assigned_vehicle_plate
      )
      order by r.route_code, s.stop_sequence
    ),
    '[]'::jsonb
  )
  from public.be_wayplan_stops s
  join public.be_wayplan_routes r on r.id = s.wayplan_route_id
  where s.pickup_id = p_pickup_id
    and (p_route_code is null or p_route_code = '' or r.route_code = p_route_code);
$$;

-- 9) QR/waybill payloads from live delivery rows.
create or replace function public.be_waybill_qr_payloads(
  p_pickup_id text
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pickup_id', e.pickup_id,
        'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
        'merchant', coalesce(p.merchant_name, p.merchant_code, e.merchant),
        'recipient_name', e.receiver_name,
        'recipient_phone', e.receiver_phone,
        'township', coalesce(e.recipient_town, e.delivery_township),
        'address', e.delivery_address,
        'cod_amount', coalesce(e.final_cod, e.cod_amount, 0),
        'route_code', e.wayplan_zone_code,
        'route_name', e.wayplan_route_name,
        'payload_version', 'britium-go-live-v1'
      )
      order by e.line_no
    ),
    '[]'::jsonb
  )
  from public.be_portal_cargo_events e
  join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.pickup_id = p_pickup_id
    and e.event_type = 'data_entry_waybill';
$$;

grant execute on function public.be_wayplan_normalize_text(text) to authenticated;
grant execute on function public.be_wayplan_resolve_route(text, text) to authenticated;
grant execute on function public.be_generate_wayplan_for_pickup(text) to authenticated;
grant execute on function public.be_wayplan_list(text, integer) to authenticated;
grant execute on function public.be_wayplan_assign_route(uuid, text, text, text, text) to authenticated;
grant execute on function public.be_wayplan_manifest_rows(text, text) to authenticated;
grant execute on function public.be_waybill_qr_payloads(text) to authenticated;

notify pgrst, 'reload schema';
