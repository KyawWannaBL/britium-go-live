-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 90-master-dropdown-snapshot.sql
-- Unified backend dropdown snapshot for frontend select controls.
-- ============================================================

create or replace function public.be_master_dropdown_snapshot(p_lang text default 'en')
returns json language sql stable security definer as $$
  select json_build_object(
    'counts', json_build_object(
      'merchants', (select count(*) from public.be_masterdata_merchants where status = 'active'),
      'riders', (select count(*) from public.be_masterdata_riders where lower(status) = 'active'),
      'drivers', (select count(*) from public.be_masterdata_drivers where lower(status) = 'active'),
      'fleet', (select count(*) from public.be_masterdata_fleet where lower(status) in ('active','assigned')),
      'users', (select count(*) from public.be_user_account_registry where status = 'active')
    ),
    'merchants', coalesce((select json_agg(row_to_json(t) order by merchant_name) from (
      select merchant_code as value, merchant_code || ' — ' || merchant_name as label,
             merchant_id, merchant_code, merchant_name, contact_phone, pickup_address, pickup_township, pickup_city,
             payment_profile, service_profile, tariff_tier
      from public.be_masterdata_merchants where status = 'active'
    ) t), '[]'::json),
    'riders', coalesce((select json_agg(row_to_json(t) order by rider_id) from (
      select rider_id as value, rider_id || ' — ' || rider_name as label,
             rider_id, rider_name, phone_primary, assigned_zone, employment_type
      from public.be_masterdata_riders where lower(status) = 'active'
    ) t), '[]'::json),
    'drivers', coalesce((select json_agg(row_to_json(t) order by driver_id) from (
      select driver_id as value, driver_id || ' — ' || driver_name as label,
             driver_id, driver_name, phone_primary, license_no, assigned_fleet_id
      from public.be_masterdata_drivers where lower(status) = 'active'
    ) t), '[]'::json),
    'fleet', coalesce((select json_agg(row_to_json(t) order by fleet_id) from (
      select fleet_id as value, fleet_id || ' — ' || vehicle_no || ' — ' || vehicle_type as label,
             fleet_id, vehicle_no, vehicle_type, capacity_kg, capacity_cbm, assigned_driver_id, zone_note
      from public.be_masterdata_fleet where lower(coalesce(status,'')) in ('active','assigned')
    ) t), '[]'::json)
  );
$$;

create or replace function public.be_master_record_lookup(
  p_record_type text,
  p_search text default null,
  p_limit int default 20,
  p_lang text default 'en'
) returns json language plpgsql stable security definer as $$
begin
  if p_record_type = 'merchant' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select merchant_code as value, merchant_code || ' — ' || merchant_name as label, *
      from public.be_masterdata_merchants
      where status = 'active'
        and (p_search is null or merchant_code ilike '%'||p_search||'%' or merchant_name ilike '%'||p_search||'%')
      order by merchant_name limit p_limit
    ) t);
  elsif p_record_type = 'rider' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select rider_id as value, rider_id || ' — ' || rider_name as label, *
      from public.be_masterdata_riders
      where lower(status) = 'active'
        and (p_search is null or rider_id ilike '%'||p_search||'%' or rider_name ilike '%'||p_search||'%')
      order by rider_id limit p_limit
    ) t);
  elsif p_record_type = 'driver' then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select driver_id as value, driver_id || ' — ' || driver_name as label, *
      from public.be_masterdata_drivers
      where lower(status) = 'active'
        and (p_search is null or driver_id ilike '%'||p_search||'%' or driver_name ilike '%'||p_search||'%')
      order by driver_id limit p_limit
    ) t);
  elsif p_record_type in ('vehicle','fleet') then
    return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
      select fleet_id as value, fleet_id || ' — ' || vehicle_no || ' — ' || vehicle_type as label, *
      from public.be_masterdata_fleet
      where lower(coalesce(status,'')) in ('active','assigned')
        and (p_search is null or fleet_id ilike '%'||p_search||'%' or vehicle_no ilike '%'||p_search||'%' or vehicle_type ilike '%'||p_search||'%')
      order by fleet_id limit p_limit
    ) t);
  end if;

  return '[]'::json;
end;
$$;

grant execute on function public.be_master_dropdown_snapshot(text) to authenticated;
grant execute on function public.be_master_record_lookup(text,text,int,text) to authenticated;

notify pgrst, 'reload schema';
