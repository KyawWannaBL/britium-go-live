-- Britium Wayplan Fleet Zoning / Master Allocation Patch
-- Run this once in Supabase SQL Editor, then open /wayplan-command.

create extension if not exists pgcrypto;

create table if not exists public.be_wayplan_fleet_zones (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null unique,
  zone_name text not null,
  group_no integer,
  layer_type text default 'zone_boundary',
  operation_type text not null,
  vehicle_assignment jsonb default '{}'::jsonb,
  color_hex text default '#f6b84b',
  townships_included text[] default '{}',
  geometry jsonb default '{}'::jsonb,
  active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_fleet_assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_name text not null,
  asset_type text not null check (asset_type in ('bike','delivery_van','pickup_van','other')),
  operation_type text not null,
  assigned_zone_codes text[] default '{}',
  first_stop_dropoff text,
  capacity integer default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_service_locations (
  id uuid primary key default gen_random_uuid(),
  location_code text not null unique,
  location_name text not null,
  township text,
  address text,
  longitude numeric,
  latitude numeric,
  location_type text default 'custom',
  zone_code text,
  operation_type text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_excluded_townships (
  id uuid primary key default gen_random_uuid(),
  township_name text not null unique,
  reason text default 'Excluded outer/rural township',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.be_seed_wayplan_fleet_zoning()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_wayplan_fleet_zones
    (zone_code, zone_name, group_no, layer_type, operation_type, vehicle_assignment, color_hex, townships_included, geometry, sort_order, active)
  values
    ('GROUP_1_BIKES','Group 1: Hub Proximity Bike Zone',1,'zone_boundary','hybrid_delivery_and_pickup',
      '{"teamA":["Bike Rider 1","Bike Rider 2","Bike Rider 3"],"teamB":["Bike Rider 4","Bike Rider 5","Bike Rider 6"],"teamC":["Bike Rider 7","Bike Rider 8","Bike Rider 9"]}'::jsonb,
      '#00FF00',
      array['East Dagon','North Dagon','South Dagon','North Okkalapa','South Okkalapa','Thingangyun','Yankin'],
      '{"type":"MultiPolygon","coordinates":[[[[96.162,16.942],[96.245,16.942],[96.245,16.845],[96.162,16.845],[96.162,16.942]]]]}'::jsonb,
      1,true),
    ('GROUP_2_DOWNTOWN','Group 2: Downtown Core Delivery',2,'zone_boundary','delivery_only',
      '{"delivery_van":"Van A (Group 2 Delivery)"}'::jsonb,
      '#FF9900',
      array['Ahlone','Sanchaung','Kyeemyindaing','Lanmadaw','Latha','Pabedan','Kyauktada','Botahtaung','Pazundaung'],
      '{"type":"MultiPolygon","coordinates":[[[[96.118,16.825],[96.174,16.825],[96.174,16.765],[96.118,16.765],[96.118,16.825]]]]}'::jsonb,
      2,true),
    ('GROUP_3_EAST_CENTRAL','Group 3: East-Central Belt Delivery',3,'zone_boundary','delivery_only',
      '{"delivery_van":"Van C (Group 3 Delivery)"}'::jsonb,
      '#800080',
      array['Bahan','Tamwe','Mingala Taungnyunt','Dawbon','Thaketa'],
      '{"type":"MultiPolygon","coordinates":[[[[96.142,16.842],[96.205,16.842],[96.205,16.775],[96.142,16.775],[96.142,16.842]]]]}'::jsonb,
      3,true),
    ('GROUP_4_WEST','Group 4: West Corridor Delivery',4,'zone_boundary','delivery_only',
      '{"delivery_van":"Van B (Group 4 Delivery)"}'::jsonb,
      '#FFB000',
      array['Kamayut','Hlaing','Mayangone'],
      '{"type":"MultiPolygon","coordinates":[[[[96.095,16.895],[96.145,16.895],[96.145,16.81],[96.095,16.81],[96.095,16.895]]]]}'::jsonb,
      4,true),
    ('GROUP_5_NORTH','Group 5: Northern Rim & Industrial Hubs',5,'zone_boundary','delivery_only',
      '{"delivery_van":"Van D (Group 5 Delivery)"}'::jsonb,
      '#4F46E5',
      array['Mingaladon','Shwepyitha','Insein','Hlaingtharya'],
      '{"type":"MultiPolygon","coordinates":[[[[96.052,17.025],[96.210,17.025],[96.210,16.896],[96.052,16.896],[96.052,17.025]]]]}'::jsonb,
      5,true),
    ('PICKUP_VAN_1_G2_G4','Pickup Van 1: Delta Drop & West/Downtown Pickup Loop',24,'zone_boundary','pickup_only_after_delta_drop',
      '{"pickup_van":"Pickup Van 1","first_stop_dropoff":"Dagon Ayar Highway Bus Station","delivery_vans_assigned":["Van A (Group 2 Delivery)","Van B (Group 4 Delivery)"]}'::jsonb,
      '#FB923C',
      array['Mayangone','Hlaing','Kamayut','Kyeemyindaing','Sanchaung','Ahlone','Lanmadaw','Latha','Pabedan','Kyauktada','Botahtaung','Pazundaung'],
      '{"type":"MultiPolygon","coordinates":[[[[96.095,16.895],[96.161,16.895],[96.161,16.765],[96.095,16.765],[96.095,16.895]]]]}'::jsonb,
      6,true),
    ('PICKUP_VAN_2_G3_G5','Pickup Van 2: Aung Mingalar Drop & North/Central Pickup Loop',35,'zone_boundary','pickup_only_after_gate_drop',
      '{"pickup_van":"Pickup Van 2","first_stop_dropoff":"Aung Mingalar Highway Bus Station","delivery_vans_assigned":["Van C (Group 3 Delivery)","Van D (Group 5 Delivery)"]}'::jsonb,
      '#A855F7',
      array['Mingaladon','Shwepyitha','Insein','Hlaingtharya','Bahan','Tamwe','Mingala Taungnyunt','Dawbon','Thaketa'],
      '{"type":"MultiPolygon","coordinates":[[[[96.052,17.025],[96.210,17.025],[96.210,16.896],[96.052,16.896],[96.052,17.025]]]]}'::jsonb,
      7,true)
  on conflict (zone_code) do update set
    zone_name = excluded.zone_name,
    group_no = excluded.group_no,
    layer_type = excluded.layer_type,
    operation_type = excluded.operation_type,
    vehicle_assignment = excluded.vehicle_assignment,
    color_hex = excluded.color_hex,
    townships_included = excluded.townships_included,
    geometry = excluded.geometry,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

  insert into public.be_wayplan_fleet_assets
    (asset_code, asset_name, asset_type, operation_type, assigned_zone_codes, first_stop_dropoff, capacity, active)
  values
    ('BIKE_1','Bike Rider 1','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_2','Bike Rider 2','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_3','Bike Rider 3','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_4','Bike Rider 4','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_5','Bike Rider 5','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_6','Bike Rider 6','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_7','Bike Rider 7','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_8','Bike Rider 8','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('BIKE_9','Bike Rider 9','bike','hybrid_delivery_and_pickup',array['GROUP_1_BIKES'],null,25,true),
    ('VAN_A_DELIVERY_G2','Van A (Group 2 Delivery)','delivery_van','delivery_only',array['GROUP_2_DOWNTOWN'],null,80,true),
    ('VAN_B_DELIVERY_G4','Van B (Group 4 Delivery)','delivery_van','delivery_only',array['GROUP_4_WEST'],null,80,true),
    ('VAN_C_DELIVERY_G3','Van C (Group 3 Delivery)','delivery_van','delivery_only',array['GROUP_3_EAST_CENTRAL'],null,80,true),
    ('VAN_D_DELIVERY_G5','Van D (Group 5 Delivery)','delivery_van','delivery_only',array['GROUP_5_NORTH'],null,80,true),
    ('PICKUP_VAN_1','Pickup Van 1','pickup_van','pickup_only',array['PICKUP_VAN_1_G2_G4'],'Dagon Ayar Highway Bus Station',60,true),
    ('PICKUP_VAN_2','Pickup Van 2','pickup_van','pickup_only',array['PICKUP_VAN_2_G3_G5'],'Aung Mingalar Highway Bus Station',60,true)
  on conflict (asset_code) do update set
    asset_name = excluded.asset_name,
    asset_type = excluded.asset_type,
    operation_type = excluded.operation_type,
    assigned_zone_codes = excluded.assigned_zone_codes,
    first_stop_dropoff = excluded.first_stop_dropoff,
    capacity = excluded.capacity,
    active = true,
    updated_at = now();

  insert into public.be_wayplan_service_locations
    (location_code, location_name, township, address, longitude, latitude, location_type, zone_code, operation_type, active)
  values
    ('HUB_EAST_DAGON','Head Office (Britium Ventures)','East Dagon','East Dagon, Yangon',96.199675,16.889554,'hub','GROUP_1_BIKES','hub',true),
    ('GATE_DAGON_AYAR','Dagon Ayar Highway Bus Station','Hlaingtharya','Dagon Ayar Highway Bus Station, Hlaingtharya',96.068,16.858,'highway_gate','PICKUP_VAN_1_G2_G4','regional_forwarding_drop',true),
    ('GATE_AUNG_MINGALAR','Aung Mingalar Highway Bus Station','Mingaladon','Aung Mingalar Highway Bus Station, Yangon',96.160,16.932,'highway_gate','PICKUP_VAN_2_G3_G5','regional_forwarding_drop',true)
  on conflict (location_code) do update set
    location_name = excluded.location_name,
    township = excluded.township,
    address = excluded.address,
    longitude = excluded.longitude,
    latitude = excluded.latitude,
    location_type = excluded.location_type,
    zone_code = excluded.zone_code,
    operation_type = excluded.operation_type,
    active = true,
    updated_at = now();

  insert into public.be_wayplan_excluded_townships (township_name, reason, active)
  select x, 'Excluded outer/rural township', true
  from unnest(array[
    'Seikgyi Kanaungto','Thanlyin','Kyauktan','Thongwa','Kayan','Khayan','Twante',
    'Kungyangon','Kawhmu','Hmawbi','Hlegu','Taikkyi','Htantabin','Dala'
  ]) as x
  on conflict (township_name) do update set active = true, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'zones', (select count(*) from public.be_wayplan_fleet_zones where active),
    'assets', (select count(*) from public.be_wayplan_fleet_assets where active),
    'locations', (select count(*) from public.be_wayplan_service_locations where active),
    'excluded', (select count(*) from public.be_wayplan_excluded_townships where active)
  );
end;
$$;

grant execute on function public.be_seed_wayplan_fleet_zoning() to authenticated;

create or replace view public.be_v_wayplan_fleet_zoning_geojson as
with zone_features as (
  select jsonb_build_object(
    'type','Feature',
    'id', zone_code,
    'properties', jsonb_build_object(
      'zone_code', zone_code,
      'zone_name', zone_name,
      'layer_type', layer_type,
      'operation_type', operation_type,
      'vehicle_assignment', vehicle_assignment,
      'color_hex', color_hex,
      'townships_included', townships_included
    ),
    'geometry', geometry
  ) as feature
  from public.be_wayplan_fleet_zones
  where active
),
location_features as (
  select jsonb_build_object(
    'type','Feature',
    'id', location_code,
    'properties', jsonb_build_object(
      'name', location_name,
      'layer_type', case when location_type = 'hub' then 'hub' else 'service_location' end,
      'marker-color', case when location_type = 'hub' then '#0000FF' else '#F6B84B' end,
      'address', address,
      'township', township,
      'location_type', location_type,
      'zone_code', zone_code,
      'operation_type', operation_type
    ),
    'geometry', jsonb_build_object('type','Point','coordinates', jsonb_build_array(longitude, latitude))
  ) as feature
  from public.be_wayplan_service_locations
  where active and longitude is not null and latitude is not null
)
select jsonb_build_object(
  'type','FeatureCollection',
  'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
) as geojson
from (
  select feature from location_features
  union all
  select feature from zone_features
) f;

create or replace function public.be_wayplan_zoning_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.sort_order, z.zone_code) from public.be_wayplan_fleet_zones z where z.active), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.asset_code) from public.be_wayplan_fleet_assets a where a.active), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.location_type, l.location_code) from public.be_wayplan_service_locations l where l.active), '[]'::jsonb),
    'excluded_townships', coalesce((select jsonb_agg(t.township_name order by t.township_name) from public.be_wayplan_excluded_townships t where t.active), '[]'::jsonb),
    'geojson', (select geojson from public.be_v_wayplan_fleet_zoning_geojson limit 1)
  );
$$;

grant execute on function public.be_wayplan_zoning_snapshot() to authenticated;

select public.be_seed_wayplan_fleet_zoning();
notify pgrst, 'reload schema';
