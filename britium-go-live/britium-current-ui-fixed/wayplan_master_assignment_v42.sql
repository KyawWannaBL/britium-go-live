-- Britium Express Wayplan V42
-- Master-data-backed Rider / Driver / Helper / Vehicle assignment with a controlled manual-entry fallback.
-- Requires Wayplan V40. Dispatch V41 remains unchanged.

begin;

create or replace function public.be_wayplan_normalize_vehicle_type_v42(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]_-]+', ' ', 'g'));
begin
  if v = '' then return null; end if;
  if v = 'delivery van' or v like '%delivery van%' then return 'delivery_van'; end if;
  if v = 'van' or v like '% van%' or v like 'van %' then return 'van'; end if;
  if v = 'bicycle' or v like '%bicycle%' then return 'bicycle'; end if;
  if v = 'bike' or v like '% bike%' or v like 'bike %' then return 'bike'; end if;
  return null;
end;
$$;

create or replace function public.be_wayplan_assignment_options_v42()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_riders jsonb := '[]'::jsonb;
  v_drivers jsonb := '[]'::jsonb;
  v_helpers jsonb := '[]'::jsonb;
  v_vehicles jsonb := '[]'::jsonb;
  v_excluded_vehicle_count integer := 0;
begin
  if to_regclass('public.be_master_data_rows') is null then
    raise exception 'Master Data table be_master_data_rows is not installed';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key', r.record_key,
    'id', coalesce(nullif(r.payload ->> 'rider_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key),
    'name', coalesce(nullif(r.payload ->> 'rider_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
    'phone', coalesce(r.payload ->> 'phone_primary', r.payload ->> 'phone', ''),
    'zone', coalesce(r.payload ->> 'assigned_zone', r.payload ->> 'zone', ''),
    'status', coalesce(r.payload ->> 'status', r.status, 'ACTIVE'),
    'label', concat_ws(' · ',
      coalesce(nullif(r.payload ->> 'rider_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
      coalesce(nullif(r.payload ->> 'rider_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key),
      nullif(coalesce(r.payload ->> 'assigned_zone', r.payload ->> 'zone', ''), '')
    )
  ) order by lower(coalesce(r.payload ->> 'rider_name', r.payload ->> 'employee_name', r.payload ->> 'name', r.record_key))), '[]'::jsonb)
  into v_riders
  from public.be_master_data_rows r
  where r.dataset_key = 'rider_master'
    and r.deleted_at is null
    and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
    and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key', r.record_key,
    'id', coalesce(nullif(r.payload ->> 'driver_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key),
    'name', coalesce(nullif(r.payload ->> 'driver_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
    'phone', coalesce(r.payload ->> 'phone_primary', r.payload ->> 'phone', ''),
    'license_no', coalesce(r.payload ->> 'license_no', ''),
    'assigned_fleet_id', coalesce(r.payload ->> 'assigned_fleet_id', ''),
    'status', coalesce(r.payload ->> 'status', r.status, 'ACTIVE'),
    'label', concat_ws(' · ',
      coalesce(nullif(r.payload ->> 'driver_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
      coalesce(nullif(r.payload ->> 'driver_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key),
      nullif(coalesce(r.payload ->> 'license_no', ''), '')
    )
  ) order by lower(coalesce(r.payload ->> 'driver_name', r.payload ->> 'employee_name', r.payload ->> 'name', r.record_key))), '[]'::jsonb)
  into v_drivers
  from public.be_master_data_rows r
  where r.dataset_key = 'driver_master'
    and r.deleted_at is null
    and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
    and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key', r.record_key,
    'id', coalesce(nullif(r.payload ->> 'helper_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key),
    'name', coalesce(nullif(r.payload ->> 'helper_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
    'phone', coalesce(r.payload ->> 'phone_primary', r.payload ->> 'phone', ''),
    'zone', coalesce(r.payload ->> 'assigned_zone', r.payload ->> 'zone', ''),
    'status', coalesce(r.payload ->> 'status', r.status, 'ACTIVE'),
    'label', concat_ws(' · ',
      coalesce(nullif(r.payload ->> 'helper_name', ''), nullif(r.payload ->> 'employee_name', ''), nullif(r.payload ->> 'name', ''), r.record_key),
      coalesce(nullif(r.payload ->> 'helper_id', ''), nullif(r.payload ->> 'employee_id', ''), r.record_key)
    )
  ) order by lower(coalesce(r.payload ->> 'helper_name', r.payload ->> 'employee_name', r.payload ->> 'name', r.record_key))), '[]'::jsonb)
  into v_helpers
  from public.be_master_data_rows r
  where r.dataset_key = 'helper_master'
    and r.deleted_at is null
    and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
    and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');

  with fleet as (
    select
      r.record_key,
      r.payload,
      r.status,
      public.be_wayplan_normalize_vehicle_type_v42(coalesce(
        r.payload ->> 'vehicle_type',
        r.payload ->> 'asset_type',
        r.payload ->> 'fleet_type'
      )) as normalized_vehicle_type
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
      'vehicle_type', f.normalized_vehicle_type,
      'master_vehicle_type', coalesce(f.payload ->> 'vehicle_type', f.payload ->> 'asset_type', ''),
      'capacity_kg', coalesce(nullif(f.payload ->> 'capacity_kg', ''), nullif(f.payload ->> 'safe_capacity_kg', '')),
      'capacity_cbm', coalesce(nullif(f.payload ->> 'capacity_cbm', ''), nullif(f.payload ->> 'safe_capacity_cbm', '')),
      'assigned_driver_id', coalesce(f.payload ->> 'assigned_driver_id', ''),
      'status', coalesce(f.payload ->> 'status', f.status, 'ACTIVE'),
      'label', concat_ws(' · ',
        coalesce(nullif(f.payload ->> 'vehicle_no', ''), nullif(f.payload ->> 'vehicle_name', ''), nullif(f.payload ->> 'plate_no', ''), f.record_key),
        coalesce(nullif(f.payload ->> 'fleet_id', ''), nullif(f.payload ->> 'vehicle_code', ''), f.record_key),
        nullif(coalesce(f.payload ->> 'vehicle_type', f.payload ->> 'asset_type', ''), '')
      )
    ) order by lower(coalesce(f.payload ->> 'vehicle_no', f.payload ->> 'vehicle_name', f.record_key))) filter (where f.normalized_vehicle_type is not null), '[]'::jsonb),
    count(*) filter (where f.normalized_vehicle_type is null)::integer
  into v_vehicles, v_excluded_vehicle_count
  from fleet f;

  return jsonb_build_object(
    'ok', true,
    'build', 'WAYPLAN_V42_MASTER_DATA_ASSIGNMENT_OPTIONS_2026-07-30',
    'riders', v_riders,
    'drivers', v_drivers,
    'helpers', v_helpers,
    'vehicles', v_vehicles,
    'counts', jsonb_build_object(
      'riders', jsonb_array_length(v_riders),
      'drivers', jsonb_array_length(v_drivers),
      'helpers', jsonb_array_length(v_helpers),
      'eligible_vehicles', jsonb_array_length(v_vehicles),
      'excluded_unsupported_vehicles', v_excluded_vehicle_count
    ),
    'manual_option', jsonb_build_object(
      'record_key', '',
      'id', '',
      'name', '',
      'label', 'Blank / type manually'
    )
  );
end;
$$;

create or replace function public.be_generate_wayplan_from_warehouse_v42(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_result jsonb;
  v_wayplan_id text;
  v_item jsonb;
  v_key text;
  v_code text;
  v_name text;
  v_vehicle_type text;
  v_assignment jsonb := '{}'::jsonb;
begin
  if to_regprocedure('public.be_generate_wayplan_from_warehouse_v40(jsonb)') is null then
    raise exception 'Wayplan V40 is required before Wayplan V42';
  end if;
  if to_regclass('public.be_master_data_rows') is null then
    raise exception 'Master Data table be_master_data_rows is not installed';
  end if;

  -- Rider: required by V40. A selected master record overrides client-supplied ID/name.
  v_key := nullif(btrim(coalesce(v_payload ->> 'rider_master_key', '')), '');
  if v_key is not null then
    select r.payload into v_item
    from public.be_master_data_rows r
    where r.dataset_key = 'rider_master'
      and r.record_key = v_key
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
      and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');
    if v_item is null then raise exception 'Selected Rider master record % is unavailable', v_key; end if;
    v_code := coalesce(nullif(v_item ->> 'rider_id', ''), nullif(v_item ->> 'employee_id', ''), v_key);
    v_name := coalesce(nullif(v_item ->> 'rider_name', ''), nullif(v_item ->> 'employee_name', ''), nullif(v_item ->> 'name', ''), v_key);
    v_payload := v_payload || jsonb_build_object('rider_code', v_code, 'rider_name', v_name, 'rider_source', 'MASTER_DATA');
    v_assignment := v_assignment || jsonb_build_object('rider', jsonb_build_object('source','MASTER_DATA','record_key',v_key,'id',v_code,'name',v_name));
  else
    v_assignment := v_assignment || jsonb_build_object('rider', jsonb_build_object('source','MANUAL','id',v_payload ->> 'rider_code','name',v_payload ->> 'rider_name'));
    v_payload := v_payload || jsonb_build_object('rider_source', 'MANUAL');
  end if;

  -- Driver: optional.
  v_key := nullif(btrim(coalesce(v_payload ->> 'driver_master_key', '')), '');
  if v_key is not null then
    select r.payload into v_item
    from public.be_master_data_rows r
    where r.dataset_key = 'driver_master'
      and r.record_key = v_key
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
      and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');
    if v_item is null then raise exception 'Selected Driver master record % is unavailable', v_key; end if;
    v_code := coalesce(nullif(v_item ->> 'driver_id', ''), nullif(v_item ->> 'employee_id', ''), v_key);
    v_name := coalesce(nullif(v_item ->> 'driver_name', ''), nullif(v_item ->> 'employee_name', ''), nullif(v_item ->> 'name', ''), v_key);
    v_payload := v_payload || jsonb_build_object('driver_code', v_code, 'driver_name', v_name, 'driver_source', 'MASTER_DATA');
    v_assignment := v_assignment || jsonb_build_object('driver', jsonb_build_object('source','MASTER_DATA','record_key',v_key,'id',v_code,'name',v_name));
  else
    v_assignment := v_assignment || jsonb_build_object('driver', jsonb_build_object('source','MANUAL','id',v_payload ->> 'driver_code','name',v_payload ->> 'driver_name'));
    v_payload := v_payload || jsonb_build_object('driver_source', 'MANUAL');
  end if;

  -- Helper: optional.
  v_key := nullif(btrim(coalesce(v_payload ->> 'helper_master_key', '')), '');
  if v_key is not null then
    select r.payload into v_item
    from public.be_master_data_rows r
    where r.dataset_key = 'helper_master'
      and r.record_key = v_key
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
      and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED');
    if v_item is null then raise exception 'Selected Helper master record % is unavailable', v_key; end if;
    v_code := coalesce(nullif(v_item ->> 'helper_id', ''), nullif(v_item ->> 'employee_id', ''), v_key);
    v_name := coalesce(nullif(v_item ->> 'helper_name', ''), nullif(v_item ->> 'employee_name', ''), nullif(v_item ->> 'name', ''), v_key);
    v_payload := v_payload || jsonb_build_object('helper_code', v_code, 'helper_name', v_name, 'helper_source', 'MASTER_DATA');
    v_assignment := v_assignment || jsonb_build_object('helper', jsonb_build_object('source','MASTER_DATA','record_key',v_key,'id',v_code,'name',v_name));
  else
    v_assignment := v_assignment || jsonb_build_object('helper', jsonb_build_object('source','MANUAL','id',v_payload ->> 'helper_code','name',v_payload ->> 'helper_name'));
    v_payload := v_payload || jsonb_build_object('helper_source', 'MANUAL');
  end if;

  -- Vehicle: required by V40. Only server-permitted types are accepted.
  v_key := nullif(btrim(coalesce(v_payload ->> 'vehicle_master_key', '')), '');
  if v_key is not null then
    select r.payload into v_item
    from public.be_master_data_rows r
    where r.dataset_key = 'fleet_master'
      and r.record_key = v_key
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED','MAINTENANCE','OUT_OF_SERVICE')
      and upper(coalesce(r.payload ->> 'status', 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED','MAINTENANCE','OUT_OF_SERVICE');
    if v_item is null then raise exception 'Selected Vehicle master record % is unavailable', v_key; end if;
    v_code := coalesce(nullif(v_item ->> 'fleet_id', ''), nullif(v_item ->> 'vehicle_code', ''), v_key);
    v_name := coalesce(nullif(v_item ->> 'vehicle_no', ''), nullif(v_item ->> 'vehicle_name', ''), nullif(v_item ->> 'plate_no', ''), v_key);
    v_vehicle_type := public.be_wayplan_normalize_vehicle_type_v42(coalesce(v_item ->> 'vehicle_type', v_item ->> 'asset_type', v_payload ->> 'vehicle_type'));
    if v_vehicle_type is null then
      raise exception 'Selected Vehicle % has an unsupported type %. Use van/delivery van or bike/bicycle.', v_key, coalesce(v_item ->> 'vehicle_type', v_item ->> 'asset_type', 'blank');
    end if;
    v_payload := v_payload || jsonb_build_object('vehicle_code', v_code, 'vehicle_name', v_name, 'vehicle_type', v_vehicle_type, 'vehicle_source', 'MASTER_DATA');
    v_assignment := v_assignment || jsonb_build_object('vehicle', jsonb_build_object('source','MASTER_DATA','record_key',v_key,'id',v_code,'name',v_name,'vehicle_type',v_vehicle_type));
  else
    v_vehicle_type := public.be_wayplan_normalize_vehicle_type_v42(v_payload ->> 'vehicle_type');
    if v_vehicle_type is null then
      raise exception 'Manual Vehicle Type must be van, delivery van, bike, or bicycle';
    end if;
    v_payload := v_payload || jsonb_build_object('vehicle_type', v_vehicle_type, 'vehicle_source', 'MANUAL');
    v_assignment := v_assignment || jsonb_build_object('vehicle', jsonb_build_object('source','MANUAL','id',v_payload ->> 'vehicle_code','name',v_payload ->> 'vehicle_name','vehicle_type',v_vehicle_type));
  end if;

  v_result := public.be_generate_wayplan_from_warehouse_v40(v_payload);
  v_wayplan_id := coalesce(
    nullif(v_result ->> 'wayplan_id', ''),
    nullif(v_result ->> 'wayplan_code', ''),
    nullif(v_result #>> '{data,wayplan_id}', '')
  );

  if v_wayplan_id is not null then
    update public.be_wayplan_membership_v40
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'assignment_v42', v_assignment,
          'assignment_resolved_at', now()
        ),
        updated_at = now()
    where wayplan_id = v_wayplan_id;

    insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
    values (
      v_wayplan_id,
      'WAYPLAN_MASTER_DATA_ASSIGNMENTS_RESOLVED_V42',
      public.be_wayplan_actor_v40(v_payload ->> 'actor'),
      v_assignment
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'v42_master_assignment_validated', true,
    'assignment', v_assignment
  );
end;
$$;

revoke all on function public.be_wayplan_normalize_vehicle_type_v42(text) from public, anon;
revoke all on function public.be_wayplan_assignment_options_v42() from public, anon;
revoke all on function public.be_generate_wayplan_from_warehouse_v42(jsonb) from public, anon;

grant execute on function public.be_wayplan_normalize_vehicle_type_v42(text) to authenticated;
grant execute on function public.be_wayplan_assignment_options_v42() to authenticated;
grant execute on function public.be_generate_wayplan_from_warehouse_v42(jsonb) to authenticated;

commit;

select
  to_regprocedure('public.be_wayplan_assignment_options_v42()')::text as assignment_options_rpc,
  to_regprocedure('public.be_generate_wayplan_from_warehouse_v42(jsonb)')::text as guarded_wayplan_create_rpc,
  to_regprocedure('public.be_wayplan_normalize_vehicle_type_v42(text)')::text as vehicle_type_normalizer,
  'Master Data dropdowns with blank/manual fallback; selected IDs and names are server-resolved'::text as workflow;
