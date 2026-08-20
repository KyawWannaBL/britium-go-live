-- Britium Express Wayplan V40
-- Warehouse-ready selection -> Wayplan creation -> mandatory Dispatch scan handoff.
-- Requires Warehouse / Dispatch V39 and the existing be_generate_wayplan(jsonb) RPC.

create extension if not exists pgcrypto;

create table if not exists public.be_wayplan_membership_v40 (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text not null,
  delivery_way_id text not null,
  pickup_id text,
  route_zone text,
  membership_status text not null default 'PLANNED',
  vehicle_type text,
  vehicle_code text,
  vehicle_name text,
  rider_code text,
  rider_name text,
  driver_code text,
  driver_name text,
  helper_code text,
  helper_name text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_wayplan_membership_v40_status_check check (
    membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED','RTO')
  ),
  constraint be_wayplan_membership_v40_vehicle_type_check check (
    vehicle_type is null or vehicle_type in ('van','delivery_van','bike','bicycle')
  ),
  unique (wayplan_id, delivery_way_id)
);

create unique index if not exists be_wayplan_membership_v40_active_way_idx
  on public.be_wayplan_membership_v40(delivery_way_id)
  where membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED');

create index if not exists be_wayplan_membership_v40_wayplan_idx
  on public.be_wayplan_membership_v40(wayplan_id, membership_status);

create index if not exists be_wayplan_membership_v40_pickup_idx
  on public.be_wayplan_membership_v40(pickup_id, route_zone);

create table if not exists public.be_wayplan_events_v40 (
  id bigint generated always as identity primary key,
  wayplan_id text,
  delivery_way_id text,
  event_type text not null,
  actor_email text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists be_wayplan_events_v40_wayplan_idx
  on public.be_wayplan_events_v40(wayplan_id, event_at desc);

alter table public.be_wayplan_membership_v40 enable row level security;
alter table public.be_wayplan_events_v40 enable row level security;
revoke all on public.be_wayplan_membership_v40 from public, anon, authenticated;
revoke all on public.be_wayplan_events_v40 from public, anon, authenticated;

create or replace function public.be_wayplan_actor_v40(p_actor_email text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_actor_email), ''),
    nullif(auth.jwt() ->> 'email', ''),
    'wayplan@britiumexpress.com'
  );
$$;

create or replace function public.be_wayplan_route_zone_v40(p_township text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(btrim(coalesce(p_township, '')), '[[:space:][:punct:]]+', ' ', 'g'));
begin
  if v = '' then return 'UNASSIGNED'; end if;

  -- Check outer-west/north names before the generic Hlaing match.
  if v like '%hlaing thar yar%' or v like '%hlaingtharyar%' or v like '%hlaingtharya%'
     or v like '%လှိုင်သာယာ%' or v like '%insein%' or v like '%အင်းစိန်%'
     or v like '%shwe pyi thar%' or v like '%shwepyitha%' or v like '%ရွှေပြည်သာ%'
     or v like '%mingaladon%' or v like '%မင်္ဂလာဒုံ%' then
    return 'GROUP_5_NORTH';
  end if;

  if v like '%east dagon%' or v like '%south dagon%' or v like '%north dagon%'
     or v like '%အရှေ့ဒဂုံ%' or v like '%တောင်ဒဂုံ%' or v like '%မြောက်ဒဂုံ%'
     or v like '%okkalapa%' or v like '%ဥက္ကလာ%'
     or v like '%thingangyun%' or v like '%သင်္ဃန်းကျွန်း%'
     or v like '%yankin%' or v like '%ရန်ကင်း%' then
    return 'GROUP_1_BIKES';
  end if;

  if v like '%ahlone%' or v like '%အလုံ%' or v like '%sanchaung%' or v like '%စမ်းချောင်း%'
     or v like '%kyeemyindaing%' or v like '%kyimyindaing%' or v like '%ကြည့်မြင်တိုင်%'
     or v like '%lanmadaw%' or v like '%လမ်းမတော်%' or v like '%latha%' or v like '%လသာ%'
     or v like '%pabedan%' or v like '%ပန်းဘဲတန်း%' or v like '%kyauktada%' or v like '%ကျောက်တံတား%'
     or v like '%botahtaung%' or v like '%botataung%' or v like '%ဗိုလ်တထောင်%'
     or v like '%pazundaung%' or v like '%ပုဇွန်တောင်%' then
    return 'GROUP_2_DOWNTOWN';
  end if;

  if v like '%kamayut%' or v like '%ကမာရွတ်%' or v like '%mayangone%' or v like '%mayangon%'
     or v like '%မရမ်းကုန်း%' or v = 'hlaing' or v like '% လှိုင် %' or v = 'လှိုင်' then
    return 'GROUP_4_WEST';
  end if;

  if v like '%bahan%' or v like '%ဗဟန်း%' or v like '%tamwe%' or v like '%တာမွေ%'
     or v like '%mingala taungnyunt%' or v like '%မင်္ဂလာတောင်ညွန့်%'
     or v like '%dawbon%' or v like '%ဒေါပုံ%' or v like '%thaketa%' or v like '%သာကေတ%' then
    return 'GROUP_3_EAST_CENTRAL';
  end if;

  if v like '%mandalay%' or v like '%မန္တလေး%' or v like '%naypyitaw%' or v like '%နေပြည်တော်%' then
    return 'INTERCITY_HUB';
  end if;

  return 'UNASSIGNED';
end;
$$;

create or replace function public.be_wayplan_warehouse_ready_snapshot_v40(
  p_pickup_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_stats jsonb;
  v_pickups jsonb;
  v_routes jsonb;
begin
  if to_regclass('public.be_v_warehouse_receipt_v39') is null then
    raise exception 'Warehouse / Dispatch V39 is required before Wayplan V40';
  end if;

  with candidates as (
    select
      v.pickup_id,
      v.batch_waybill_no,
      v.parcel_sequence,
      v.delivery_way_id,
      v.merchant_name,
      v.recipient_name,
      v.recipient_phone,
      v.township,
      v.recipient_address,
      v.actual_collect as cod_amount,
      v.declared_weight_kg as weight_kg,
      v.warehouse_status,
      v.discrepancy_code,
      v.dispatch_scanned,
      v.delivery_attempt_status,
      v.consecutive_delivery_failures,
      public.be_wayplan_route_zone_v40(v.township) as route_zone,
      m.wayplan_id,
      m.membership_status,
      (m.id is not null) as already_planned
    from public.be_v_warehouse_receipt_v39 v
    left join lateral (
      select x.*
      from public.be_wayplan_membership_v40 x
      where x.delivery_way_id = v.delivery_way_id
        and x.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      order by x.created_at desc
      limit 1
    ) m on true
    where v.warehouse_status = 'WAREHOUSE_READY'
      and coalesce(v.delivery_attempt_status, '') <> 'RTO'
      and (p_pickup_id is null or btrim(p_pickup_id) = '' or v.pickup_id = btrim(p_pickup_id))
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.route_zone, c.township, c.parcel_sequence, c.delivery_way_id), '[]'::jsonb)
  into v_rows
  from candidates c;

  with candidates as (
    select
      v.pickup_id,
      v.delivery_way_id,
      v.dispatch_scanned,
      public.be_wayplan_route_zone_v40(v.township) as route_zone,
      exists (
        select 1 from public.be_wayplan_membership_v40 x
        where x.delivery_way_id = v.delivery_way_id
          and x.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      ) as already_planned
    from public.be_v_warehouse_receipt_v39 v
    where v.warehouse_status = 'WAREHOUSE_READY'
      and coalesce(v.delivery_attempt_status, '') <> 'RTO'
      and (p_pickup_id is null or btrim(p_pickup_id) = '' or v.pickup_id = btrim(p_pickup_id))
  )
  select jsonb_build_object(
    'warehouse_ready', count(*)::integer,
    'unplanned', count(*) filter (where not already_planned)::integer,
    'already_planned', count(*) filter (where already_planned)::integer,
    'dispatch_scanned', count(*) filter (where dispatch_scanned)::integer,
    'pickup_count', count(distinct pickup_id)::integer,
    'route_group_count', count(distinct route_zone)::integer,
    'unassigned_route', count(*) filter (where route_zone = 'UNASSIGNED')::integer
  )
  into v_stats
  from candidates;

  select coalesce(jsonb_agg(x.pickup_id order by x.pickup_id), '[]'::jsonb)
  into v_pickups
  from (
    select distinct v.pickup_id
    from public.be_v_warehouse_receipt_v39 v
    where v.warehouse_status = 'WAREHOUSE_READY'
      and coalesce(v.delivery_attempt_status, '') <> 'RTO'
  ) x;

  select coalesce(jsonb_agg(x.route_zone order by x.route_zone), '[]'::jsonb)
  into v_routes
  from (
    select distinct public.be_wayplan_route_zone_v40(v.township) as route_zone
    from public.be_v_warehouse_receipt_v39 v
    where v.warehouse_status = 'WAREHOUSE_READY'
      and coalesce(v.delivery_attempt_status, '') <> 'RTO'
      and (p_pickup_id is null or btrim(p_pickup_id) = '' or v.pickup_id = btrim(p_pickup_id))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'build', 'WAYPLAN_V40_WAREHOUSE_READY_TO_DISPATCH_SCAN_2026-07-30',
    'stats', coalesce(v_stats, '{}'::jsonb),
    'pickups', v_pickups,
    'route_groups', v_routes,
    'rows', v_rows,
    'workflow', 'WAREHOUSE_READY -> WAYPLAN_PLANNED -> READY_FOR_DISPATCH -> mandatory Dispatch scan -> Publish'
  );
end;
$$;

create or replace function public.be_generate_wayplan_from_warehouse_v40(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_wayplan_actor_v40(p_payload ->> 'actor');
  v_ids text[];
  v_invalid text[];
  v_duplicate text[];
  v_routes text[];
  v_result jsonb;
  v_wayplan_id text;
  v_vehicle_type text := lower(nullif(btrim(coalesce(p_payload ->> 'vehicle_type', '')), ''));
  v_count integer;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Authenticated Wayplan operator is required';
  end if;

  select coalesce(array_agg(distinct btrim(value)), array[]::text[])
  into v_ids
  from jsonb_array_elements_text(coalesce(p_payload -> 'delivery_way_ids', '[]'::jsonb));

  v_ids := array_remove(v_ids, '');
  v_count := coalesce(cardinality(v_ids), 0);

  if v_count = 0 then
    raise exception 'Select at least one Warehouse Ready parcel';
  end if;
  if v_count > 500 then
    raise exception 'A single Wayplan may not contain more than 500 parcels';
  end if;

  if v_vehicle_type is not null and v_vehicle_type not in ('van','delivery_van','bike','bicycle') then
    raise exception 'Vehicle type % is not permitted. Use van/delivery_van or bike/bicycle.', v_vehicle_type;
  end if;

  select array_agg(q.way_id order by q.way_id)
  into v_invalid
  from unnest(v_ids) q(way_id)
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = q.way_id
  where v.delivery_way_id is null
     or v.warehouse_status <> 'WAREHOUSE_READY'
     or coalesce(v.delivery_attempt_status, '') = 'RTO'
     or coalesce(v.discrepancy_code, '') <> '';

  if coalesce(cardinality(v_invalid), 0) > 0 then
    raise exception 'Wayplan stopped. These parcels are not eligible Warehouse Ready rows: %', array_to_string(v_invalid[1:20], ', ');
  end if;

  select array_agg(m.delivery_way_id order by m.delivery_way_id)
  into v_duplicate
  from public.be_wayplan_membership_v40 m
  where m.delivery_way_id = any(v_ids)
    and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED');

  if coalesce(cardinality(v_duplicate), 0) > 0 then
    raise exception 'Wayplan stopped. These parcels already belong to an active Wayplan: %', array_to_string(v_duplicate[1:20], ', ');
  end if;

  select array_agg(distinct public.be_wayplan_route_zone_v40(v.township) order by public.be_wayplan_route_zone_v40(v.township))
  into v_routes
  from public.be_v_warehouse_receipt_v39 v
  where v.delivery_way_id = any(v_ids);

  if coalesce(cardinality(v_routes), 0) <> 1 then
    raise exception 'Create one route group per Wayplan. Selected groups: %', array_to_string(v_routes, ', ');
  end if;
  if v_routes[1] = 'UNASSIGNED' then
    raise exception 'Selected parcels have no active Wayplan route mapping. Correct recipient township or route mapping first.';
  end if;

  if coalesce(nullif(btrim(p_payload ->> 'rider_code'), ''), nullif(btrim(p_payload ->> 'rider_name'), '')) is null then
    raise exception 'Assign an authorized Rider before creating the Wayplan';
  end if;
  if coalesce(nullif(btrim(p_payload ->> 'vehicle_code'), ''), nullif(btrim(p_payload ->> 'vehicle_name'), '')) is null then
    raise exception 'Assign a permitted vehicle before creating the Wayplan';
  end if;

  if to_regprocedure('public.be_generate_wayplan(jsonb)') is null then
    raise exception 'Legacy Wayplan generator be_generate_wayplan(jsonb) is not installed';
  end if;

  p_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'actor', v_actor,
    'source', 'WAYPLAN_V40_WAREHOUSE_READY',
    'route_zone', v_routes[1],
    'delivery_way_ids', to_jsonb(v_ids)
  );

  execute 'select to_jsonb(public.be_generate_wayplan($1))'
  into v_result
  using p_payload;

  v_wayplan_id := coalesce(
    nullif(v_result ->> 'wayplan_id', ''),
    nullif(v_result ->> 'wayplan_code', ''),
    nullif(v_result ->> 'route_no', ''),
    nullif(v_result #>> '{data,wayplan_id}', ''),
    nullif(v_result #>> '{wayplan,wayplan_id}', '')
  );

  if v_wayplan_id is null then
    raise exception 'Legacy Wayplan generator did not return a Wayplan ID. Result: %', v_result;
  end if;

  insert into public.be_wayplan_membership_v40(
    wayplan_id, delivery_way_id, pickup_id, route_zone, membership_status,
    vehicle_type, vehicle_code, vehicle_name,
    rider_code, rider_name, driver_code, driver_name, helper_code, helper_name,
    created_by, metadata
  )
  select
    v_wayplan_id,
    v.delivery_way_id,
    v.pickup_id,
    public.be_wayplan_route_zone_v40(v.township),
    'PLANNED',
    v_vehicle_type,
    nullif(btrim(p_payload ->> 'vehicle_code'), ''),
    nullif(btrim(p_payload ->> 'vehicle_name'), ''),
    nullif(btrim(p_payload ->> 'rider_code'), ''),
    nullif(btrim(p_payload ->> 'rider_name'), ''),
    nullif(btrim(p_payload ->> 'driver_code'), ''),
    nullif(btrim(p_payload ->> 'driver_name'), ''),
    nullif(btrim(p_payload ->> 'helper_code'), ''),
    nullif(btrim(p_payload ->> 'helper_name'), ''),
    v_actor,
    jsonb_build_object(
      'batch_waybill_no', v.batch_waybill_no,
      'parcel_sequence', v.parcel_sequence,
      'township', v.township,
      'legacy_result', v_result
    )
  from public.be_v_warehouse_receipt_v39 v
  where v.delivery_way_id = any(v_ids)
  on conflict (wayplan_id, delivery_way_id) do update
  set updated_at = now(), metadata = public.be_wayplan_membership_v40.metadata || excluded.metadata;

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (
    v_wayplan_id,
    'WAYPLAN_CREATED_FROM_WAREHOUSE_READY',
    v_actor,
    jsonb_build_object('parcel_count', v_count, 'route_zone', v_routes[1], 'payload', p_payload)
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan_id,
    'v40_validated', true,
    'parcel_count', v_count,
    'route_zone', v_routes[1],
    'next_step', 'Open Dispatch Command and scan every parcel before Publish'
  );
end;
$$;

create or replace function public.be_wayplan_prepare_dispatch_v40(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_wayplan_actor_v40(p_actor_email);
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer;
  v_invalid text[];
  v_way_ids text[];
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  select count(*)::integer,
         array_agg(delivery_way_id order by delivery_way_id)
  into v_count, v_way_ids
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and membership_status in ('PLANNED','ON_HOLD','READY_FOR_DISPATCH');

  if coalesce(v_count, 0) = 0 then
    raise exception 'Wayplan % has no active V40 parcel membership', v_wayplan;
  end if;

  if exists (
    select 1
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id = v_wayplan
      and coalesce(m.rider_code, m.rider_name, '') = ''
  ) then raise exception 'Wayplan % is missing Rider assignment', v_wayplan; end if;

  if exists (
    select 1
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id = v_wayplan
      and coalesce(m.vehicle_code, m.vehicle_name, '') = ''
  ) then raise exception 'Wayplan % is missing vehicle assignment', v_wayplan; end if;

  select array_agg(q.way_id order by q.way_id)
  into v_invalid
  from unnest(v_way_ids) q(way_id)
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = q.way_id
  where v.delivery_way_id is null
     or v.warehouse_status <> 'WAREHOUSE_READY'
     or coalesce(v.delivery_attempt_status, '') = 'RTO'
     or coalesce(v.discrepancy_code, '') <> '';

  if coalesce(cardinality(v_invalid), 0) > 0 then
    raise exception 'Wayplan handoff stopped. Ineligible parcel(s): %', array_to_string(v_invalid[1:20], ', ');
  end if;

  update public.be_wayplan_membership_v40
  set membership_status = 'READY_FOR_DISPATCH', updated_at = now()
  where wayplan_id = v_wayplan
    and membership_status in ('PLANNED','ON_HOLD','READY_FOR_DISPATCH');

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (
    v_wayplan,
    'WAYPLAN_READY_FOR_MANDATORY_DISPATCH_SCAN',
    v_actor,
    jsonb_build_object('parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids))
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'parcel_count', v_count,
    'way_ids', to_jsonb(v_way_ids),
    'membership_status', 'READY_FOR_DISPATCH',
    'dispatch_scan_required', true,
    'message', format('%s is ready for mandatory Dispatch scanning. No route is released yet.', v_wayplan)
  );
end;
$$;

create or replace function public.be_wayplan_v40_status(p_wayplan_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'wayplan_id', p_wayplan_id,
    'parcel_count', count(*)::integer,
    'planned', count(*) filter (where membership_status = 'PLANNED')::integer,
    'ready_for_dispatch', count(*) filter (where membership_status = 'READY_FOR_DISPATCH')::integer,
    'dispatched', count(*) filter (where membership_status = 'DISPATCHED')::integer,
    'completed', count(*) filter (where membership_status = 'COMPLETED')::integer,
    'on_hold', count(*) filter (where membership_status = 'ON_HOLD')::integer,
    'route_groups', coalesce(jsonb_agg(distinct route_zone) filter (where route_zone is not null), '[]'::jsonb),
    'way_ids', coalesce(jsonb_agg(delivery_way_id order by delivery_way_id), '[]'::jsonb)
  )
  from public.be_wayplan_membership_v40
  where wayplan_id = p_wayplan_id;
$$;

revoke all on function public.be_wayplan_actor_v40(text) from public, anon;
revoke all on function public.be_wayplan_route_zone_v40(text) from public, anon;
revoke all on function public.be_wayplan_warehouse_ready_snapshot_v40(text) from public, anon;
revoke all on function public.be_generate_wayplan_from_warehouse_v40(jsonb) from public, anon;
revoke all on function public.be_wayplan_prepare_dispatch_v40(text,text) from public, anon;
revoke all on function public.be_wayplan_v40_status(text) from public, anon;

grant execute on function public.be_wayplan_route_zone_v40(text) to authenticated;
grant execute on function public.be_wayplan_warehouse_ready_snapshot_v40(text) to authenticated;
grant execute on function public.be_generate_wayplan_from_warehouse_v40(jsonb) to authenticated;
grant execute on function public.be_wayplan_prepare_dispatch_v40(text,text) to authenticated;
grant execute on function public.be_wayplan_v40_status(text) to authenticated;

select
  to_regprocedure('public.be_wayplan_warehouse_ready_snapshot_v40(text)')::text as warehouse_ready_snapshot_rpc,
  to_regprocedure('public.be_generate_wayplan_from_warehouse_v40(jsonb)')::text as guarded_wayplan_create_rpc,
  to_regprocedure('public.be_wayplan_prepare_dispatch_v40(text,text)')::text as dispatch_handoff_rpc,
  to_regprocedure('public.be_wayplan_v40_status(text)')::text as wayplan_status_rpc,
  to_regclass('public.be_wayplan_membership_v40')::text as membership_table,
  'WAREHOUSE_READY -> create one route-group Wayplan -> assign Rider/vehicle -> mandatory Dispatch scan -> Publish'::text as workflow;
