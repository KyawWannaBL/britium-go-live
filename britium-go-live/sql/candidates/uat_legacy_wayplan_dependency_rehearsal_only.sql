-- DIAGNOSTIC ONLY: source-derived definition of historical legacy function,
-- obtained via read-only pg_get_functiondef from Production 2026-11-16.
-- Never deploy this fixture as an independent migration. Intended for a
-- disposable schema replay ahead of 20260826042244 privilege revocation.
CREATE OR REPLACE FUNCTION public.be_wayplan_assignment_options_v44_legacy_20260826()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_base jsonb;
  v_vehicles jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_eligible integer := 0;
begin
  if to_regprocedure('public.be_wayplan_assignment_options_v42()') is null then
    raise exception 'Wayplan V42 assignment options are required before V44';
  end if;
  if to_regclass('public.be_master_data_rows') is null then
    raise exception 'Master Data table be_master_data_rows is not installed';
  end if;

  v_base := public.be_wayplan_assignment_options_v42();

  with fleet as (
    select
      r.record_key,
      r.payload,
      r.status,
      public.be_wayplan_vehicle_type_v44(coalesce(
        r.payload ->> 'vehicle_type',
        r.payload ->> 'asset_type',
        r.payload ->> 'fleet_type',
        r.payload ->> 'type',
        r.payload ->> 'category'
      )) as normalized_master_type,
      public.be_wayplan_normalize_vehicle_type_v42(coalesce(
        r.payload ->> 'vehicle_type',
        r.payload ->> 'asset_type',
        r.payload ->> 'fleet_type',
        r.payload ->> 'type',
        r.payload ->> 'category'
      )) as dispatch_type
    from public.be_master_data_rows r
    where r.dataset_key = 'fleet_master'
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED','MAINTENANCE','OUT_OF_SERVICE')
      and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED','MAINTENANCE','OUT_OF_SERVICE')
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'record_key', f.record_key,
      'id', coalesce(nullif(f.payload ->> 'fleet_id', ''), nullif(f.payload ->> 'vehicle_code', ''), f.record_key),
      'name', coalesce(nullif(f.payload ->> 'vehicle_no', ''), nullif(f.payload ->> 'vehicle_name', ''), nullif(f.payload ->> 'plate_no', ''), f.record_key),
      'plate', coalesce(nullif(f.payload ->> 'vehicle_no', ''), nullif(f.payload ->> 'plate_no', ''), nullif(f.payload ->> 'vehicle_name', ''), ''),
      'vehicle_type', coalesce(f.dispatch_type, f.normalized_master_type),
      'master_vehicle_type', coalesce(f.payload ->> 'vehicle_type', f.payload ->> 'asset_type', f.payload ->> 'fleet_type', ''),
      'capacity_kg', coalesce(nullif(f.payload ->> 'capacity_kg', ''), nullif(f.payload ->> 'safe_capacity_kg', '')),
      'capacity_cbm', coalesce(nullif(f.payload ->> 'capacity_cbm', ''), nullif(f.payload ->> 'safe_capacity_cbm', '')),
      'assigned_driver_id', coalesce(f.payload ->> 'assigned_driver_id', ''),
      'ownership_type', coalesce(f.payload ->> 'ownership_type', ''),
      'zone_note', coalesce(f.payload ->> 'zone_note', ''),
      'status', coalesce(f.payload ->> 'status', f.status, 'ACTIVE'),
      'dispatch_eligible', f.dispatch_type is not null,
      'eligibility_reason', case
        when f.dispatch_type is not null then 'Dispatch eligible'
        else format('%s is visible from Fleet Master but current Dispatch policy permits only Van / Delivery Van / Bike / Bicycle.', coalesce(nullif(f.payload ->> 'vehicle_type', ''), 'This vehicle type'))
      end,
      'label', concat_ws(' · ',
        coalesce(nullif(f.payload ->> 'vehicle_no', ''), nullif(f.payload ->> 'vehicle_name', ''), nullif(f.payload ->> 'plate_no', ''), f.record_key),
        coalesce(nullif(f.payload ->> 'fleet_id', ''), nullif(f.payload ->> 'vehicle_code', ''), f.record_key),
        nullif(coalesce(f.payload ->> 'vehicle_type', f.payload ->> 'asset_type', f.payload ->> 'fleet_type', ''), '')
      )
    ) order by lower(coalesce(f.payload ->> 'vehicle_no', f.payload ->> 'vehicle_name', f.record_key))), '[]'::jsonb),
    count(*)::integer,
    count(*) filter (where f.dispatch_type is not null)::integer
  into v_vehicles, v_total, v_eligible
  from fleet f;

  return coalesce(v_base, '{}'::jsonb)
    || jsonb_build_object(
      'ok', true,
      'build', 'WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT_MODES_FULL_FLEET_VISIBILITY_2026-07-30',
      'vehicles', v_vehicles,
      'counts', coalesce(v_base -> 'counts', '{}'::jsonb) || jsonb_build_object(
        'fleet_records', v_total,
        'dispatch_eligible_vehicles', v_eligible,
        'policy_blocked_vehicles', greatest(v_total - v_eligible, 0)
      ),
      'assignment_modes', jsonb_build_array(
        jsonb_build_object('code','RIDER','label','Rider Delivery','required',jsonb_build_array('rider')),
        jsonb_build_object('code','VEHICLE_CREW','label','Vehicle Crew','required',jsonb_build_array('vehicle','driver','helper'))
      ),
      'vehicle_policy', 'All active Fleet Master records are visible. Dispatch eligibility remains restricted to van/delivery_van/bike/bicycle.'
    );
end;
$function$;
