
-- Britium Dispatch + Way Management Production Sync
-- Purpose:
--   1) Remove demo/mock board state and route all Dispatch/Way Management screens to live Supabase data.
--   2) Keep one Dispatch Command Center and one Wayplan Command Center.
--   3) Wire Enterprise Portal + Rider App through the same views/RPCs.
--
-- Safe to rerun. Does not insert demo jobs. It only seeds operational fleet/zone master config.

rollback;
begin;

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 0) Remove duplicate legacy function overload that causes PostgREST ambiguity
-- -------------------------------------------------------------------------
drop function if exists public.be_wayplan_create_for_waybill(text,text,text,text);


-- Drop old duplicate/alias RPCs before recreating production signatures.
drop function if exists public.be_enterprise_dispatch_snapshot();
drop function if exists public.be_way_management_snapshot();
drop function if exists public.be_dispatch_snapshot();
drop function if exists public.be_dispatch_command_snapshot();
drop function if exists public.be_dispatch_center_snapshot();
drop function if exists public.be_live_dispatch_snapshot();
drop function if exists public.be_delivery_dispatch_snapshot();
drop function if exists public.be_delivery_workflow_snapshot();
drop function if exists public.be_ops_command_snapshot();
drop function if exists public.be_ops_manager_snapshot();
drop function if exists public.be_executive_ops_snapshot();
drop function if exists public.be_wayplan_management_snapshot();
drop function if exists public.be_wayplan_zone_snapshot();
drop function if exists public.be_assign_dispatch_job_to_asset(text,text,text);
drop function if exists public.be_assign_dispatch_job_to_wayplan(text,text,text);
drop function if exists public.be_publish_wayplan_to_dispatch(text,text);
drop function if exists public.be_publish_all_wayplans_to_dispatch(text);
drop function if exists public.be_driver_update_delivery_status(text,text,text,text);
drop function if exists public.be_upsert_dispatch_zone(jsonb);
drop function if exists public.be_delete_dispatch_zone(text);
drop function if exists public.be_upsert_dispatch_asset(jsonb);
drop function if exists public.be_delete_dispatch_asset(text);

-- -------------------------------------------------------------------------
-- 1) Canonical wayplan header/item compatibility columns
-- -------------------------------------------------------------------------
create table if not exists public.be_wayplans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_wayplans
  add column if not exists upload_code text,
  add column if not exists wayplan_code text,
  add column if not exists wayplan_no text,
  add column if not exists wayplan_id text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists route_code text,
  add column if not exists route_name text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists vehicle_id text,
  add column if not exists vehicle_code text,
  add column if not exists vehicle_plate text,
  add column if not exists rider_email text,
  add column if not exists driver_email text,
  add column if not exists helper_email text,
  add column if not exists parcel_count integer default 0,
  add column if not exists total_parcels integer default 0,
  add column if not exists pickup_count integer default 0,
  add column if not exists total_waybills integer default 0,
  add column if not exists total_weight_kg numeric default 0,
  add column if not exists total_cod_amount numeric default 0,
  add column if not exists total_actual_collect numeric default 0,
  add column if not exists status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists delivery_status text,
  add column if not exists dispatch_date date default current_date,
  add column if not exists assigned_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists dispatched_by_email text,
  add column if not exists created_by_email text,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_wayplan_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_wayplan_items
  add column if not exists upload_code text,
  add column if not exists wayplan_code text,
  add column if not exists wayplan_no text,
  add column if not exists wayplan_id text,
  add column if not exists tracking_no text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists delivery_way_id text,
  add column if not exists parcel_sequence integer,
  add column if not exists item_no integer,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists phone_number text,
  add column if not exists recipient_phone_2 text,
  add column if not exists recipient_address text,
  add column if not exists delivery_township text,
  add column if not exists destination_city text,
  add column if not exists remarks text,
  add column if not exists remark text,
  add column if not exists special_instruction text,
  add column if not exists special_instructions text,
  add column if not exists weight_kg numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_charges numeric default 0,
  add column if not exists total_collected_amount numeric default 0,
  add column if not exists warehouse_status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists delivery_status text,
  add column if not exists status text,
  add column if not exists driver_note text,
  add column if not exists failed_reason text,
  add column if not exists failed_attempts integer default 0,
  add column if not exists vehicle_id text,
  add column if not exists vehicle_code text,
  add column if not exists vehicle_plate text,
  add column if not exists rider_email text,
  add column if not exists driver_email text,
  add column if not exists helper_email text,
  add column if not exists published_to_rider boolean default false,
  add column if not exists published_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- Normalize current rows without creating demo data
update public.be_wayplan_items
set
  wayplan_code = coalesce(nullif(wayplan_code,''), nullif(wayplan_no,''), nullif(wayplan_id,''), upload_code),
  wayplan_no = coalesce(nullif(wayplan_no,''), nullif(wayplan_code,''), nullif(wayplan_id,''), upload_code),
  wayplan_id = coalesce(nullif(wayplan_id,''), nullif(wayplan_code,''), nullif(wayplan_no,''), upload_code),
  tracking_no = coalesce(nullif(tracking_no,''), nullif(delivery_way_id,''), nullif(waybill_no,''), id::text),
  phone_number = coalesce(nullif(phone_number,''), nullif(recipient_phone,''), nullif(recipient_phone_2,'')),
  dispatch_status = coalesce(nullif(dispatch_status,''), 'READY_FOR_DISPATCH'),
  delivery_status = coalesce(nullif(delivery_status,''), 'PENDING'),
  status = coalesce(nullif(status,''), 'assigned'),
  updated_at = now()
where true;

update public.be_wayplans
set
  wayplan_code = coalesce(nullif(wayplan_code,''), nullif(wayplan_no,''), nullif(wayplan_id,''), upload_code),
  wayplan_no = coalesce(nullif(wayplan_no,''), nullif(wayplan_code,''), nullif(wayplan_id,''), upload_code),
  wayplan_id = coalesce(nullif(wayplan_id,''), nullif(wayplan_code,''), nullif(wayplan_no,''), upload_code),
  dispatch_status = coalesce(nullif(dispatch_status,''), 'READY_FOR_DISPATCH'),
  delivery_status = coalesce(nullif(delivery_status,''), 'PENDING'),
  status = coalesce(nullif(status,''), 'assigned'),
  updated_at = now()
where true;

-- Remove empty legacy/demo wayplan shells only. This does not remove real wayplans with pickup/waybill/items.
delete from public.be_wayplans w
where coalesce(w.pickup_id,'') = ''
  and coalesce(w.waybill_no,'') = ''
  and coalesce(w.parcel_count,0) = 0
  and not exists (
    select 1 from public.be_wayplan_items i
    where coalesce(i.wayplan_code,i.wayplan_no,i.wayplan_id) = coalesce(w.wayplan_code,w.wayplan_no,w.wayplan_id)
  );

-- -------------------------------------------------------------------------
-- 2) Fleet master and zoning master tables
-- -------------------------------------------------------------------------
create table if not exists public.be_dispatch_fleet_assets (
  asset_code text primary key,
  asset_name text not null,
  asset_type text not null check (asset_type in ('delivery_van','pickup_van','bike','driver','helper','other')),
  operation_type text not null default 'delivery_only',
  assigned_zone_codes jsonb not null default '[]'::jsonb,
  driver_email text,
  rider_email text,
  helper_email text,
  vehicle_plate text,
  capacity integer default 0,
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_dispatch_zones (
  zone_code text primary key,
  zone_name text not null,
  group_no integer,
  layer_type text default 'zone_boundary',
  operation_type text not null default 'delivery_only',
  color_hex text default '#3B82F6',
  townships_included jsonb not null default '[]'::jsonb,
  geometry jsonb,
  first_stop_dropoff text,
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_dispatch_service_locations (
  location_code text primary key,
  location_name text not null,
  location_type text default 'custom',
  zone_code text,
  township text,
  address text,
  longitude numeric,
  latitude numeric,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Operational configuration seed. These are not demo jobs; they are production fleet master records.
insert into public.be_dispatch_zones (
  zone_code, zone_name, group_no, operation_type, color_hex, townships_included, geometry, first_stop_dropoff, sort_order
) values
('GROUP_1_BIKES', 'Group 1: Hub Proximity Bike Zone', 1, 'hybrid_delivery_and_pickup', '#00FF00',
 '["East Dagon","North Dagon","South Dagon","North Okkalapa","South Okkalapa","Thingangyun","Yankin","Dagon Seikkan","မြောက်ဒဂုံ","တောင်ဒဂုံ","ဒဂုံဆိပ်ကမ်း","မြောက်ဥက္ကလာပ","တောင်ဥက္ကလာပ","သင်္ဃန်းကျွန်း","ရန်ကင်း"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.162,16.942],[96.245,16.942],[96.245,16.845],[96.162,16.845],[96.162,16.942]]]]}'::jsonb,
 null, 1),
('GROUP_2_DOWNTOWN', 'Group 2: Downtown Core Delivery', 2, 'delivery_only', '#FF9900',
 '["Ahlone","Sanchaung","Kyeemyindaing","Lanmadaw","Latha","Pabedan","Kyauktada","Botahtaung","Pazundaung","အလုံ","စမ်းချောင်း","ကြည့်မြင်တိုင်","လမ်းမတော်","လသာ","ပန်းဘဲတန်း","ကျောက်တံတား","ဗိုလ်တထောင်","ပုဇွန်တောင်"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.118,16.825],[96.174,16.825],[96.174,16.765],[96.118,16.765],[96.118,16.825]]]]}'::jsonb,
 null, 2),
('GROUP_3_EAST_CENTRAL', 'Group 3: East-Central Belt Delivery', 3, 'delivery_only', '#800080',
 '["Bahan","Tamwe","Mingala Taungnyunt","Dawbon","Thaketa","ဗဟန်း","တာမွေ","မင်္ဂလာတောင်ညွန့်","ဒေါပုံ","သာကေတ"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.142,16.842],[96.205,16.842],[96.205,16.775],[96.142,16.775],[96.142,16.842]]]]}'::jsonb,
 null, 3),
('GROUP_4_WEST', 'Group 4: West Corridor Delivery', 4, 'delivery_only', '#FFB000',
 '["Kamayut","Hlaing","Mayangone","ကမာရွတ်","လှိုင်","မရမ်းကုန်း"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.095,16.895],[96.145,16.895],[96.145,16.810],[96.095,16.810],[96.095,16.895]]]]}'::jsonb,
 null, 4),
('GROUP_5_NORTH', 'Group 5: Northern Rim & Industrial Hubs', 5, 'delivery_only', '#4F46E5',
 '["Mingaladon","Shwepyitha","Insein","Hlaingtharya","မင်္ဂလာဒုံ","ရွှေပြည်သာ","အင်းစိန်","လှိုင်သာယာ"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.052,17.025],[96.210,17.025],[96.210,16.896],[96.052,16.896],[96.052,17.025]]]]}'::jsonb,
 null, 5),
('PICKUP_VAN_1_G2_G4', 'Pickup Van 1: Delta Drop & West/Downtown Pickup Loop', 24, 'pickup_only_after_delta_drop', '#FB923C',
 '["Mayangone","Hlaing","Kamayut","Kyeemyindaing","Sanchaung","Ahlone","Lanmadaw","Latha","Pabedan","Kyauktada","Botahtaung","Pazundaung","မရမ်းကုန်း","လှိုင်","ကမာရွတ်","ကြည့်မြင်တိုင်","စမ်းချောင်း","အလုံ"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.095,16.895],[96.161,16.895],[96.161,16.765],[96.095,16.765],[96.095,16.895]]]]}'::jsonb,
 'Dagon Ayar Highway Bus Station', 6),
('PICKUP_VAN_2_G3_G5', 'Pickup Van 2: Upper Country Drop & North/Central Pickup Loop', 35, 'pickup_only_after_gate_drop', '#06B6D4',
 '["Mingaladon","Shwepyitha","Insein","Hlaingtharya","Bahan","Tamwe","Mingala Taungnyunt","Dawbon","Thaketa","မင်္ဂလာဒုံ","ရွှေပြည်သာ","အင်းစိန်","လှိုင်သာယာ","ဗဟန်း","တာမွေ","မင်္ဂလာတောင်ညွန့်","ဒေါပုံ","သာကေတ"]'::jsonb,
 '{"type":"MultiPolygon","coordinates":[[[[96.052,17.025],[96.210,17.025],[96.210,16.775],[96.052,16.775],[96.052,17.025]]]]}'::jsonb,
 'Aung Mingalar Highway Bus Station', 7)
on conflict (zone_code) do update set
  zone_name = excluded.zone_name,
  group_no = excluded.group_no,
  operation_type = excluded.operation_type,
  color_hex = excluded.color_hex,
  townships_included = excluded.townships_included,
  geometry = excluded.geometry,
  first_stop_dropoff = excluded.first_stop_dropoff,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

insert into public.be_dispatch_fleet_assets (
  asset_code, asset_name, asset_type, operation_type, assigned_zone_codes, driver_email, rider_email, helper_email, vehicle_plate, capacity, sort_order
) values
('VAN_A', 'Van A: Downtown Core', 'delivery_van', 'delivery_only', '["GROUP_2_DOWNTOWN"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'VAN-A', 80, 1),
('VAN_B', 'Van B: Western Corridor', 'delivery_van', 'delivery_only', '["GROUP_4_WEST"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'VAN-B', 80, 2),
('VAN_C', 'Van C: East-Central Belt', 'delivery_van', 'delivery_only', '["GROUP_3_EAST_CENTRAL"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'VAN-C', 80, 3),
('VAN_D', 'Van D: Northern Rim', 'delivery_van', 'delivery_only', '["GROUP_5_NORTH"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'VAN-D', 80, 4),
('PICKUP_VAN_1', 'Pickup Van 1: Delta Drop + West/Downtown Pickups', 'pickup_van', 'pickup_only', '["PICKUP_VAN_1_G2_G4"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'PU-1', 60, 5),
('PICKUP_VAN_2', 'Pickup Van 2: Aung Mingalar + North/Central Pickups', 'pickup_van', 'pickup_only', '["PICKUP_VAN_2_G3_G5"]'::jsonb, 'testdriver@britiumexpress.com', null, 'testhelper@britiumexpress.com', 'PU-2', 60, 6),
('BIKE_A1', 'Bike Rider A1: East/South Dagon', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-A1', 20, 11),
('BIKE_A2', 'Bike Rider A2: East/South Dagon', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-A2', 20, 12),
('BIKE_A3', 'Bike Rider A3: East/South Dagon', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-A3', 20, 13),
('BIKE_B1', 'Bike Rider B1: North Dagon/Okkalapas', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-B1', 20, 14),
('BIKE_B2', 'Bike Rider B2: North Dagon/Okkalapas', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-B2', 20, 15),
('BIKE_B3', 'Bike Rider B3: North Dagon/Okkalapas', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-B3', 20, 16),
('BIKE_C1', 'Bike Rider C1: Thingangyun/Yankin', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-C1', 20, 17),
('BIKE_C2', 'Bike Rider C2: Thingangyun/Yankin', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-C2', 20, 18),
('BIKE_C3', 'Bike Rider C3: Thingangyun/Yankin', 'bike', 'hybrid_delivery_and_pickup', '["GROUP_1_BIKES"]'::jsonb, null, 'testrider@britiumexpress.com', null, 'BIKE-C3', 20, 19)
on conflict (asset_code) do update set
  asset_name = excluded.asset_name,
  asset_type = excluded.asset_type,
  operation_type = excluded.operation_type,
  assigned_zone_codes = excluded.assigned_zone_codes,
  capacity = excluded.capacity,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

insert into public.be_dispatch_service_locations (location_code, location_name, location_type, township, address, longitude, latitude, active)
values
('HUB_EAST_DAGON', 'Head Office / Britium Ventures Hub', 'hub', 'East Dagon', 'East Dagon, Yangon', 96.199675, 16.889554, true),
('GATE_DAGON_AYAR', 'Dagon Ayar Highway Bus Station', 'highway_gate', 'Hlaingtharya', 'Dagon Ayar Highway Bus Station', null, null, true),
('GATE_AUNG_MINGALAR', 'Aung Mingalar Highway Bus Station', 'highway_gate', 'Mingaladon', 'Aung Mingalar Highway Bus Station', null, null, true)
on conflict (location_code) do update set
  location_name = excluded.location_name,
  location_type = excluded.location_type,
  township = excluded.township,
  address = excluded.address,
  longitude = excluded.longitude,
  latitude = excluded.latitude,
  active = true,
  updated_at = now();

-- -------------------------------------------------------------------------
-- 3) Dispatch assignment overlay table
-- -------------------------------------------------------------------------
create table if not exists public.be_dispatch_job_assignments (
  tracking_no text primary key,
  wayplan_code text,
  asset_code text,
  delivery_status text default 'PENDING',
  dispatch_status text default 'READY_FOR_DISPATCH',
  failed_attempts integer default 0,
  failed_reason text,
  driver_note text,
  published_to_rider boolean default false,
  published_at timestamptz,
  assigned_by_email text,
  updated_by_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Remove demo/mock rows only, never operational D/WB/P rows.
delete from public.be_dispatch_job_assignments
where tracking_no ilike 'ORD\_%' escape '\'
   or tracking_no ilike 'DEMO%'
   or tracking_no ilike 'TEST-DEMO%';

-- -------------------------------------------------------------------------
-- 4) Helper functions
-- -------------------------------------------------------------------------
create or replace function public.be_norm_text(p_text text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_text,''), '\s+', ' ', 'g'));
$$;

create or replace function public.be_resolve_dispatch_zone(
  p_township text,
  p_operation_type text default 'DELIVERY'
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_town text := public.be_norm_text(p_township);
  v_zone text;
begin
  -- Pickup jobs are handled by pickup zones first.
  if upper(coalesce(p_operation_type,'DELIVERY')) = 'PICKUP' then
    select z.zone_code into v_zone
    from public.be_dispatch_zones z
    where z.active
      and z.operation_type like 'pickup_only%'
      and exists (
        select 1 from jsonb_array_elements_text(z.townships_included) t(name)
        where v_town like '%' || public.be_norm_text(t.name) || '%'
           or public.be_norm_text(t.name) like '%' || v_town || '%'
      )
    order by z.sort_order
    limit 1;
    if v_zone is not null then return v_zone; end if;
  end if;

  -- Group 1 bike zone has priority over vans for hub-proximity jobs.
  select z.zone_code into v_zone
  from public.be_dispatch_zones z
  where z.active
    and z.zone_code = 'GROUP_1_BIKES'
    and exists (
      select 1 from jsonb_array_elements_text(z.townships_included) t(name)
      where v_town like '%' || public.be_norm_text(t.name) || '%'
         or public.be_norm_text(t.name) like '%' || v_town || '%'
    )
  limit 1;
  if v_zone is not null then return v_zone; end if;

  select z.zone_code into v_zone
  from public.be_dispatch_zones z
  where z.active
    and z.operation_type = 'delivery_only'
    and exists (
      select 1 from jsonb_array_elements_text(z.townships_included) t(name)
      where v_town like '%' || public.be_norm_text(t.name) || '%'
         or public.be_norm_text(t.name) like '%' || v_town || '%'
    )
  order by z.sort_order
  limit 1;

  return coalesce(v_zone, 'UNASSIGNED_ZONE');
end;
$$;

create or replace function public.be_resolve_dispatch_asset(
  p_township text,
  p_operation_type text default 'DELIVERY',
  p_sequence integer default 1
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_zone text := public.be_resolve_dispatch_zone(p_township, p_operation_type);
  v_asset text;
  v_offset integer := greatest(coalesce(p_sequence,1),1) - 1;
begin
  if v_zone = 'GROUP_1_BIKES' then
    select asset_code into v_asset
    from (
      select a.asset_code, row_number() over(order by a.sort_order, a.asset_code) - 1 as rn, count(*) over() as cnt
      from public.be_dispatch_fleet_assets a
      where a.active and a.asset_type = 'bike' and a.assigned_zone_codes ? v_zone
    ) s
    where s.cnt > 0 and s.rn = (v_offset % s.cnt)
    limit 1;
  else
    select a.asset_code into v_asset
    from public.be_dispatch_fleet_assets a
    where a.active
      and a.assigned_zone_codes ? v_zone
      and (
        (upper(coalesce(p_operation_type,'DELIVERY')) = 'PICKUP' and a.asset_type = 'pickup_van')
        or (upper(coalesce(p_operation_type,'DELIVERY')) <> 'PICKUP' and a.asset_type in ('delivery_van','bike'))
      )
    order by a.sort_order, a.asset_code
    limit 1;
  end if;

  return coalesce(v_asset, 'UNASSIGNED');
end;
$$;

-- -------------------------------------------------------------------------
-- 5) Views consumed by enterprise portal and rider app
-- -------------------------------------------------------------------------
drop view if exists public.be_v_rider_dispatch_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_wayplans cascade;

create or replace view public.be_v_enterprise_dispatch_wayplans as
select
  w.id,
  coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,'')) as wayplan_code,
  coalesce(nullif(w.wayplan_no,''), nullif(w.wayplan_code,''), nullif(w.wayplan_id,'')) as wayplan_no,
  coalesce(nullif(w.wayplan_id,''), nullif(w.wayplan_code,''), nullif(w.wayplan_no,'')) as wayplan_id,
  w.waybill_no,
  w.pickup_id,
  w.merchant_code,
  w.merchant_name,
  w.route_code,
  w.route_name,
  w.branch_code,
  w.vehicle_id,
  w.vehicle_code,
  w.vehicle_plate,
  w.rider_email,
  w.driver_email,
  w.helper_email,
  greatest(coalesce(w.parcel_count,0), coalesce(w.total_parcels,0), coalesce(count(i.*),0))::integer as parcel_count,
  coalesce(w.total_cod_amount, sum(coalesce(i.cod_amount,0)), 0) as total_cod_amount,
  coalesce(w.total_actual_collect, sum(coalesce(i.total_collected_amount,0)), 0) as total_actual_collect,
  coalesce(nullif(w.status,''), 'assigned') as status,
  coalesce(nullif(w.wayplan_status,''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(w.dispatch_status,''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(w.delivery_status,''), 'PENDING') as delivery_status,
  w.dispatch_date,
  w.assigned_at,
  w.dispatched_at,
  w.completed_at,
  w.updated_at
from public.be_wayplans w
left join public.be_wayplan_items i
  on coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,'')) =
     coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,''))
where coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,'')) is not null
group by w.id;

create or replace view public.be_v_enterprise_dispatch_jobs as
select
  i.id,
  coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,''), a.wayplan_code) as wayplan_code,
  coalesce(nullif(i.wayplan_no,''), nullif(i.wayplan_code,''), nullif(i.wayplan_id,''), a.wayplan_code) as wayplan_no,
  coalesce(nullif(i.wayplan_id,''), nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), a.wayplan_code) as wayplan_id,
  coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) as tracking_no,
  i.waybill_no,
  i.pickup_id,
  i.delivery_way_id,
  coalesce(i.parcel_sequence, i.item_no, 0) as parcel_sequence,
  coalesce(i.item_no, i.parcel_sequence, 0) as item_no,
  i.recipient_name,
  coalesce(nullif(i.phone_number,''), nullif(i.recipient_phone,''), nullif(i.recipient_phone_2,'')) as phone_number,
  i.recipient_phone,
  i.recipient_phone_2,
  i.recipient_address,
  i.delivery_township,
  i.destination_city,
  coalesce(nullif(i.remarks,''), nullif(i.remark,''), nullif(i.special_instruction,''), nullif(i.special_instructions,'')) as remarks,
  coalesce(i.weight_kg,0) as weight_kg,
  coalesce(i.cod_amount,0) as cod_amount,
  coalesce(i.delivery_charges,0) as delivery_charges,
  coalesce(i.total_collected_amount,0) as total_collected_amount,
  coalesce(a.asset_code, nullif(i.vehicle_code,''), nullif(i.vehicle_id,''), public.be_resolve_dispatch_asset(i.delivery_township, 'DELIVERY', coalesce(i.parcel_sequence,i.item_no,1))) as asset_code,
  fa.asset_name,
  fa.asset_type,
  fa.vehicle_plate,
  coalesce(nullif(i.rider_email,''), fa.rider_email) as rider_email,
  coalesce(nullif(i.driver_email,''), fa.driver_email) as driver_email,
  coalesce(nullif(i.helper_email,''), fa.helper_email) as helper_email,
  coalesce(a.dispatch_status, nullif(i.dispatch_status,''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(a.delivery_status, nullif(i.delivery_status,''), 'PENDING') as delivery_status,
  coalesce(nullif(i.status,''), 'assigned') as status,
  coalesce(a.failed_attempts, i.failed_attempts, 0) as failed_attempts,
  coalesce(nullif(a.failed_reason,''), nullif(i.failed_reason,'')) as failed_reason,
  coalesce(nullif(a.driver_note,''), nullif(i.driver_note,'')) as driver_note,
  coalesce(a.published_to_rider, i.published_to_rider, false) as published_to_rider,
  coalesce(a.published_at, i.published_at) as published_at,
  i.delivered_at,
  i.failed_at,
  i.updated_at
from public.be_wayplan_items i
left join public.be_dispatch_job_assignments a
  on a.tracking_no = coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text)
left join public.be_dispatch_fleet_assets fa
  on fa.asset_code = coalesce(a.asset_code, nullif(i.vehicle_code,''), nullif(i.vehicle_id,''), public.be_resolve_dispatch_asset(i.delivery_township, 'DELIVERY', coalesce(i.parcel_sequence,i.item_no,1)))
where coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,'')) is not null
  and coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) !~* '^(ORD_|DEMO|TEST-DEMO)';

create or replace view public.be_v_rider_dispatch_jobs as
select *
from public.be_v_enterprise_dispatch_jobs
where published_to_rider = true
  and coalesce(delivery_status,'PENDING') not in ('DELIVERED','COMPLETED','RTO');

-- -------------------------------------------------------------------------
-- 6) RPC snapshots and actions
-- -------------------------------------------------------------------------
create or replace function public.be_enterprise_dispatch_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb;
  v_wayplans jsonb;
  v_assets jsonb;
  v_zones jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(j) order by j.asset_code, j.parcel_sequence, j.tracking_no), '[]'::jsonb)
  into v_jobs
  from public.be_v_enterprise_dispatch_jobs j;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc nulls last), '[]'::jsonb)
  into v_wayplans
  from public.be_v_enterprise_dispatch_wayplans w;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order, a.asset_code), '[]'::jsonb)
  into v_assets
  from public.be_dispatch_fleet_assets a
  where a.active;

  select coalesce(jsonb_agg(to_jsonb(z) order by z.sort_order, z.zone_code), '[]'::jsonb)
  into v_zones
  from public.be_dispatch_zones z
  where z.active;

  select jsonb_build_object(
    'wayplans', (select count(*) from public.be_v_enterprise_dispatch_wayplans),
    'jobs', (select count(*) from public.be_v_enterprise_dispatch_jobs),
    'rider_visible_jobs', (select count(*) from public.be_v_rider_dispatch_jobs),
    'pending', (select count(*) from public.be_v_enterprise_dispatch_jobs where delivery_status in ('PENDING','READY_FOR_DISPATCH')),
    'out_for_delivery', (select count(*) from public.be_v_enterprise_dispatch_jobs where delivery_status = 'OUT_FOR_DELIVERY'),
    'delivered', (select count(*) from public.be_v_enterprise_dispatch_jobs where delivery_status in ('DELIVERED','COMPLETED')),
    'failed', (select count(*) from public.be_v_enterprise_dispatch_jobs where delivery_status in ('FAILED','DELIVERY_FAILED','ATTEMPTED_FAILED')),
    'cod', (select coalesce(sum(total_collected_amount),0) from public.be_v_enterprise_dispatch_jobs)
  ) into v_stats;

  return jsonb_build_object(
    'ok', true,
    'stats', v_stats,
    'wayplans', v_wayplans,
    'jobs', v_jobs,
    'assets', v_assets,
    'zones', v_zones
  );
end;
$$;

create or replace function public.be_way_management_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready jsonb := '[]'::jsonb;
  v_wayplans jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_v_wayplan_queue') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(q) order by q.pickup_id, q.parcel_sequence), ''[]''::jsonb) from public.be_v_wayplan_queue q'
    into v_ready;
  end if;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc nulls last), '[]'::jsonb)
  into v_wayplans
  from public.be_v_enterprise_dispatch_wayplans w;

  select coalesce(jsonb_agg(to_jsonb(z) order by z.sort_order, z.zone_code), '[]'::jsonb)
  into v_zones
  from public.be_dispatch_zones z
  where z.active;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order, a.asset_code), '[]'::jsonb)
  into v_assets
  from public.be_dispatch_fleet_assets a
  where a.active;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.location_type, l.location_code), '[]'::jsonb)
  into v_locations
  from public.be_dispatch_service_locations l
  where l.active;

  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'ready_rows', jsonb_array_length(v_ready),
      'wayplans', jsonb_array_length(v_wayplans),
      'zones', jsonb_array_length(v_zones),
      'assets', jsonb_array_length(v_assets)
    ),
    'ready_queue', v_ready,
    'wayplans', v_wayplans,
    'zones', v_zones,
    'assets', v_assets,
    'locations', v_locations
  );
end;
$$;

-- Compatibility aliases for old pages. They all now hit the same source.
create or replace function public.be_dispatch_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_dispatch_command_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_dispatch_center_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_live_dispatch_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_delivery_dispatch_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_delivery_workflow_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_ops_command_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_ops_manager_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_executive_ops_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_wayplan_management_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_way_management_snapshot(); $$;
create or replace function public.be_wayplan_zone_snapshot() returns jsonb language sql security definer set search_path=public as $$ select public.be_way_management_snapshot(); $$;

create or replace function public.be_assign_dispatch_job_to_asset(
  p_tracking_no text,
  p_asset_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_asset text := trim(coalesce(p_asset_code,''));
  v_wayplan text;
  v_count integer := 0;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;
  if v_asset = '' then raise exception 'asset_code is required'; end if;

  select wayplan_code into v_wayplan
  from public.be_v_enterprise_dispatch_jobs
  where tracking_no = v_tracking
  limit 1;

  if v_wayplan is null then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, asset_code, delivery_status, dispatch_status, assigned_by_email, updated_by_email, created_at, updated_at
  )
  values (v_tracking, v_wayplan, v_asset, 'PENDING', 'READY_FOR_DISPATCH', p_actor_email, p_actor_email, now(), now())
  on conflict (tracking_no) do update set
    asset_code = excluded.asset_code,
    wayplan_code = excluded.wayplan_code,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  update public.be_wayplan_items i
  set
    vehicle_id = v_asset,
    vehicle_code = v_asset,
    vehicle_plate = coalesce((select vehicle_plate from public.be_dispatch_fleet_assets where asset_code = v_asset), i.vehicle_plate),
    rider_email = coalesce((select rider_email from public.be_dispatch_fleet_assets where asset_code = v_asset), i.rider_email),
    driver_email = coalesce((select driver_email from public.be_dispatch_fleet_assets where asset_code = v_asset), i.driver_email),
    helper_email = coalesce((select helper_email from public.be_dispatch_fleet_assets where asset_code = v_asset), i.helper_email),
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'tracking_no', v_tracking, 'asset_code', v_asset, 'updated_items', v_count);
end;
$$;


create or replace function public.be_assign_dispatch_job_to_wayplan(
  p_tracking_no text,
  p_wayplan_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_wayplan text := trim(coalesce(p_wayplan_code,''));
  v_count integer := 0;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;
  if v_wayplan = '' then raise exception 'wayplan_code is required'; end if;

  update public.be_wayplan_items i
  set
    wayplan_code = v_wayplan,
    wayplan_no = v_wayplan,
    wayplan_id = v_wayplan,
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  get diagnostics v_count = row_count;

  insert into public.be_dispatch_job_assignments (tracking_no, wayplan_code, updated_by_email, updated_at)
  values (v_tracking, v_wayplan, p_actor_email, now())
  on conflict (tracking_no) do update set
    wayplan_code = excluded.wayplan_code,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  return jsonb_build_object('ok', v_count > 0, 'tracking_no', v_tracking, 'wayplan_code', v_wayplan, 'updated_items', v_count);
end;
$$;

create or replace function public.be_publish_wayplan_to_dispatch(
  p_wayplan_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_wayplan_code,''));
  v_count integer := 0;
begin
  if v_code = '' then raise exception 'wayplan_code is required'; end if;

  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, asset_code, delivery_status, dispatch_status,
    published_to_rider, published_at, assigned_by_email, updated_by_email, created_at, updated_at
  )
  select
    j.tracking_no,
    j.wayplan_code,
    coalesce(nullif(j.asset_code,''), public.be_resolve_dispatch_asset(j.delivery_township, 'DELIVERY', j.parcel_sequence)),
    'PENDING',
    'OUT_FOR_DELIVERY',
    true,
    now(),
    p_actor_email,
    p_actor_email,
    now(),
    now()
  from public.be_v_enterprise_dispatch_jobs j
  where j.wayplan_code = v_code
  on conflict (tracking_no) do update set
    wayplan_code = excluded.wayplan_code,
    asset_code = coalesce(nullif(public.be_dispatch_job_assignments.asset_code,''), excluded.asset_code),
    published_to_rider = true,
    published_at = coalesce(public.be_dispatch_job_assignments.published_at, excluded.published_at),
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = case
      when public.be_dispatch_job_assignments.delivery_status in ('DELIVERED','COMPLETED','FAILED','RTO','ATTEMPTED_FAILED') then public.be_dispatch_job_assignments.delivery_status
      else 'PENDING'
    end,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  get diagnostics v_count = row_count;

  update public.be_wayplan_items i
  set
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = coalesce(nullif(i.delivery_status,''), 'PENDING'),
    published_to_rider = true,
    published_at = coalesce(i.published_at, now()),
    updated_at = now()
  where coalesce(nullif(i.wayplan_code,''), nullif(i.wayplan_no,''), nullif(i.wayplan_id,'')) = v_code;

  update public.be_wayplans w
  set
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = 'OUT_FOR_DELIVERY',
    dispatched_at = coalesce(w.dispatched_at, now()),
    dispatched_by_email = coalesce(p_actor_email, w.dispatched_by_email),
    updated_at = now()
  where coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,'')) = v_code;

  return jsonb_build_object('ok', true, 'wayplan_code', v_code, 'published_jobs', v_count);
end;
$$;

create or replace function public.be_publish_all_wayplans_to_dispatch(
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer := 0;
  v_result jsonb;
begin
  for r in select distinct wayplan_code from public.be_v_enterprise_dispatch_jobs where wayplan_code is not null loop
    select public.be_publish_wayplan_to_dispatch(r.wayplan_code, p_actor_email) into v_result;
    v_total := v_total + coalesce((v_result->>'published_jobs')::integer, 0);
  end loop;

  return jsonb_build_object('ok', true, 'published_jobs', v_total);
end;
$$;

create or replace function public.be_driver_update_delivery_status(
  p_tracking_no text,
  p_status text,
  p_actor_email text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no,''));
  v_status text := upper(trim(coalesce(p_status,'')));
  v_wayplan text;
  v_dispatch_status text;
begin
  if v_tracking = '' then raise exception 'tracking_no is required'; end if;
  if v_status = '' then raise exception 'status is required'; end if;

  if v_status in ('DONE','DELIVERED','COMPLETED') then
    v_status := 'DELIVERED';
    v_dispatch_status := 'DELIVERED';
  elsif v_status in ('FAIL','FAILED','ATTEMPTED_FAILED','FAILED ATTEMPT') then
    v_status := 'ATTEMPTED_FAILED';
    v_dispatch_status := 'OUT_FOR_DELIVERY';
  elsif v_status in ('RTO','RETURN_TO_ORIGIN') then
    v_status := 'RTO';
    v_dispatch_status := 'RTO';
  else
    v_dispatch_status := v_status;
  end if;

  select wayplan_code into v_wayplan
  from public.be_v_enterprise_dispatch_jobs
  where tracking_no = v_tracking
  limit 1;

  if v_wayplan is null then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  insert into public.be_dispatch_job_assignments (
    tracking_no, wayplan_code, delivery_status, dispatch_status, failed_attempts, failed_reason, driver_note,
    published_to_rider, updated_by_email, created_at, updated_at
  )
  values (
    v_tracking, v_wayplan, v_status, v_dispatch_status,
    case when v_status = 'ATTEMPTED_FAILED' then 1 else 0 end,
    case when v_status = 'ATTEMPTED_FAILED' then p_note else null end,
    p_note, true, p_actor_email, now(), now()
  )
  on conflict (tracking_no) do update set
    delivery_status = excluded.delivery_status,
    dispatch_status = excluded.dispatch_status,
    failed_attempts = case when excluded.delivery_status = 'ATTEMPTED_FAILED' then public.be_dispatch_job_assignments.failed_attempts + 1 else public.be_dispatch_job_assignments.failed_attempts end,
    failed_reason = coalesce(excluded.failed_reason, public.be_dispatch_job_assignments.failed_reason),
    driver_note = coalesce(excluded.driver_note, public.be_dispatch_job_assignments.driver_note),
    published_to_rider = true,
    updated_by_email = excluded.updated_by_email,
    updated_at = now();

  update public.be_wayplan_items i
  set
    delivery_status = v_status,
    dispatch_status = v_dispatch_status,
    failed_attempts = case when v_status = 'ATTEMPTED_FAILED' then coalesce(i.failed_attempts,0) + 1 else coalesce(i.failed_attempts,0) end,
    failed_reason = case when v_status = 'ATTEMPTED_FAILED' then coalesce(nullif(p_note,''), i.failed_reason) else i.failed_reason end,
    driver_note = coalesce(nullif(p_note,''), i.driver_note),
    delivered_at = case when v_status = 'DELIVERED' then now() else i.delivered_at end,
    failed_at = case when v_status in ('ATTEMPTED_FAILED','RTO') then now() else i.failed_at end,
    updated_at = now()
  where coalesce(nullif(i.tracking_no,''), nullif(i.delivery_way_id,''), i.id::text) = v_tracking;

  update public.be_wayplans w
  set
    dispatch_status = case
      when not exists (
        select 1 from public.be_v_enterprise_dispatch_jobs j
        where j.wayplan_code = v_wayplan
          and coalesce(j.delivery_status,'PENDING') not in ('DELIVERED','COMPLETED','RTO')
      ) then 'DELIVERED'
      else 'OUT_FOR_DELIVERY'
    end,
    delivery_status = case
      when not exists (
        select 1 from public.be_v_enterprise_dispatch_jobs j
        where j.wayplan_code = v_wayplan
          and coalesce(j.delivery_status,'PENDING') not in ('DELIVERED','COMPLETED','RTO')
      ) then 'DELIVERED'
      else 'OUT_FOR_DELIVERY'
    end,
    completed_at = case
      when not exists (
        select 1 from public.be_v_enterprise_dispatch_jobs j
        where j.wayplan_code = v_wayplan
          and coalesce(j.delivery_status,'PENDING') not in ('DELIVERED','COMPLETED','RTO')
      ) then now()
      else completed_at
    end,
    updated_at = now()
  where coalesce(nullif(w.wayplan_code,''), nullif(w.wayplan_no,''), nullif(w.wayplan_id,'')) = v_wayplan;

  return jsonb_build_object('ok', true, 'tracking_no', v_tracking, 'wayplan_code', v_wayplan, 'delivery_status', v_status);
end;
$$;

create or replace function public.be_upsert_dispatch_zone(p_zone jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text := trim(coalesce(p_zone->>'zone_code',''));
begin
  if v_code = '' then raise exception 'zone_code is required'; end if;

  insert into public.be_dispatch_zones (
    zone_code, zone_name, group_no, operation_type, color_hex, townships_included, geometry, first_stop_dropoff, active, sort_order, updated_at
  )
  values (
    v_code,
    coalesce(nullif(p_zone->>'zone_name',''), v_code),
    nullif(p_zone->>'group_no','')::integer,
    coalesce(nullif(p_zone->>'operation_type',''), 'delivery_only'),
    coalesce(nullif(p_zone->>'color_hex',''), '#3B82F6'),
    coalesce(p_zone->'townships_included', '[]'::jsonb),
    p_zone->'geometry',
    p_zone->>'first_stop_dropoff',
    coalesce((p_zone->>'active')::boolean, true),
    coalesce(nullif(p_zone->>'sort_order','')::integer, 0),
    now()
  )
  on conflict (zone_code) do update set
    zone_name = excluded.zone_name,
    group_no = excluded.group_no,
    operation_type = excluded.operation_type,
    color_hex = excluded.color_hex,
    townships_included = excluded.townships_included,
    geometry = excluded.geometry,
    first_stop_dropoff = excluded.first_stop_dropoff,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now();

  return jsonb_build_object('ok', true, 'zone_code', v_code);
end;
$$;

create or replace function public.be_delete_dispatch_zone(p_zone_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.be_dispatch_zones
  set active = false, updated_at = now()
  where zone_code = trim(coalesce(p_zone_code,''));
  return jsonb_build_object('ok', true, 'zone_code', p_zone_code);
end;
$$;

create or replace function public.be_upsert_dispatch_asset(p_asset jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text := trim(coalesce(p_asset->>'asset_code',''));
begin
  if v_code = '' then raise exception 'asset_code is required'; end if;

  insert into public.be_dispatch_fleet_assets (
    asset_code, asset_name, asset_type, operation_type, assigned_zone_codes,
    driver_email, rider_email, helper_email, vehicle_plate, capacity, active, sort_order, updated_at
  )
  values (
    v_code,
    coalesce(nullif(p_asset->>'asset_name',''), v_code),
    coalesce(nullif(p_asset->>'asset_type',''), 'delivery_van'),
    coalesce(nullif(p_asset->>'operation_type',''), 'delivery_only'),
    coalesce(p_asset->'assigned_zone_codes', '[]'::jsonb),
    p_asset->>'driver_email',
    p_asset->>'rider_email',
    p_asset->>'helper_email',
    p_asset->>'vehicle_plate',
    coalesce(nullif(p_asset->>'capacity','')::integer, 0),
    coalesce((p_asset->>'active')::boolean, true),
    coalesce(nullif(p_asset->>'sort_order','')::integer, 0),
    now()
  )
  on conflict (asset_code) do update set
    asset_name = excluded.asset_name,
    asset_type = excluded.asset_type,
    operation_type = excluded.operation_type,
    assigned_zone_codes = excluded.assigned_zone_codes,
    driver_email = excluded.driver_email,
    rider_email = excluded.rider_email,
    helper_email = excluded.helper_email,
    vehicle_plate = excluded.vehicle_plate,
    capacity = excluded.capacity,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now();

  return jsonb_build_object('ok', true, 'asset_code', v_code);
end;
$$;

create or replace function public.be_delete_dispatch_asset(p_asset_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.be_dispatch_fleet_assets
  set active = false, updated_at = now()
  where asset_code = trim(coalesce(p_asset_code,''));
  return jsonb_build_object('ok', true, 'asset_code', p_asset_code);
end;
$$;

-- -------------------------------------------------------------------------
-- 7) Grants
-- -------------------------------------------------------------------------
grant select on public.be_v_enterprise_dispatch_wayplans to authenticated;
grant select on public.be_v_enterprise_dispatch_jobs to authenticated;
grant select on public.be_v_rider_dispatch_jobs to authenticated;
grant select, insert, update on public.be_dispatch_fleet_assets to authenticated;
grant select, insert, update on public.be_dispatch_zones to authenticated;
grant select, insert, update on public.be_dispatch_service_locations to authenticated;
grant select, insert, update on public.be_dispatch_job_assignments to authenticated;

grant execute on function public.be_enterprise_dispatch_snapshot() to authenticated;
grant execute on function public.be_way_management_snapshot() to authenticated;
grant execute on function public.be_dispatch_snapshot() to authenticated;
grant execute on function public.be_dispatch_command_snapshot() to authenticated;
grant execute on function public.be_dispatch_center_snapshot() to authenticated;
grant execute on function public.be_live_dispatch_snapshot() to authenticated;
grant execute on function public.be_delivery_dispatch_snapshot() to authenticated;
grant execute on function public.be_delivery_workflow_snapshot() to authenticated;
grant execute on function public.be_ops_command_snapshot() to authenticated;
grant execute on function public.be_ops_manager_snapshot() to authenticated;
grant execute on function public.be_executive_ops_snapshot() to authenticated;
grant execute on function public.be_wayplan_management_snapshot() to authenticated;
grant execute on function public.be_wayplan_zone_snapshot() to authenticated;
grant execute on function public.be_assign_dispatch_job_to_asset(text,text,text) to authenticated;
grant execute on function public.be_assign_dispatch_job_to_wayplan(text,text,text) to authenticated;
grant execute on function public.be_publish_wayplan_to_dispatch(text,text) to authenticated;
grant execute on function public.be_publish_all_wayplans_to_dispatch(text) to authenticated;
grant execute on function public.be_driver_update_delivery_status(text,text,text,text) to authenticated;
grant execute on function public.be_upsert_dispatch_zone(jsonb) to authenticated;
grant execute on function public.be_delete_dispatch_zone(text) to authenticated;
grant execute on function public.be_upsert_dispatch_asset(jsonb) to authenticated;
grant execute on function public.be_delete_dispatch_asset(text) to authenticated;

commit;

notify pgrst, 'reload schema';
