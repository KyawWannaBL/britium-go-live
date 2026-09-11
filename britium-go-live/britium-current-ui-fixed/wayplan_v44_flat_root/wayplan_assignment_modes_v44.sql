-- Britium Express Wayplan V44
-- Exclusive route assignment modes plus full fleet-master visibility.
-- Mode A: RIDER          -> Rider is required; Vehicle/Driver/Helper are not required.
-- Mode B: VEHICLE_CREW   -> Vehicle + Driver + Helper are required; Rider is not required.
-- All active fleet rows are returned by the dropdown RPC. Current Dispatch policy still permits
-- only van/delivery_van/bike/bicycle; other Master Data types remain visible but disabled in UI.
-- Requires V40, V42, V43.

begin;

create or replace function public.be_wayplan_vehicle_type_v44(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]_-]+', ' ', 'g'));
begin
  if v = '' then return null; end if;
  if v = 'delivery van' or v like '%delivery van%' then return 'delivery_van'; end if;
  if v = 'mini truck' or v like '%mini truck%' then return 'mini_truck'; end if;
  if v = 'truck' or v like '% truck%' or v like 'truck %' then return 'truck'; end if;
  if v = 'van' or v like '% van%' or v like 'van %' then return 'van'; end if;
  if v = 'bicycle' or v like '%bicycle%' then return 'bicycle'; end if;
  if v = 'bike' or v like '% bike%' or v like 'bike %' then return 'bike'; end if;
  if v = 'motorbike' or v like '%motorbike%' or v like '%motorcycle%' then return 'motorbike'; end if;
  if v = 'car' or v like '% car%' or v like 'car %' then return 'car'; end if;
  if v = 'tricycle' or v like '%tricycle%' then return 'tricycle'; end if;
  return regexp_replace(v, '[^a-z0-9]+', '_', 'g');
end;
$$;

create or replace function public.be_wayplan_vehicle_allowed_v44(p_value text)
returns boolean
language sql
immutable
as $$
  select public.be_wayplan_normalize_vehicle_type_v42(p_value) is not null;
$$;

create or replace function public.be_wayplan_assignment_options_v44()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

-- V44 replaces the V40 core validation so downstream V42 master resolution can submit
-- either exclusive assignment mode without inventing a fake Rider or fake Vehicle.
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
  v_mode text := upper(regexp_replace(btrim(coalesce(p_payload ->> 'assignment_mode', 'LEGACY_COMBINED')), '[^A-Za-z]+', '_', 'g'));
  v_vehicle_type text := lower(nullif(btrim(coalesce(p_payload ->> 'vehicle_type', '')), ''));
  v_count integer;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise exception 'Authenticated Wayplan operator is required';
  end if;

  if v_mode in ('RIDER_ONLY','RIDER_DELIVERY') then v_mode := 'RIDER'; end if;
  if v_mode in ('VEHICLE','CREW','VEHICLE_TEAM') then v_mode := 'VEHICLE_CREW'; end if;
  if v_mode not in ('RIDER','VEHICLE_CREW','LEGACY_COMBINED') then
    raise exception 'Assignment mode must be RIDER or VEHICLE_CREW';
  end if;

  select coalesce(array_agg(distinct btrim(value)), array[]::text[])
  into v_ids
  from jsonb_array_elements_text(coalesce(p_payload -> 'delivery_way_ids', '[]'::jsonb));

  v_ids := array_remove(v_ids, '');
  v_count := coalesce(cardinality(v_ids), 0);

  if v_count = 0 then raise exception 'Select at least one Warehouse Ready parcel'; end if;
  if v_count > 500 then raise exception 'A single Wayplan may not contain more than 500 parcels'; end if;

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

  if v_mode = 'RIDER' then
    if coalesce(nullif(btrim(p_payload ->> 'rider_code'), ''), nullif(btrim(p_payload ->> 'rider_name'), '')) is null then
      raise exception 'Rider Delivery mode requires an authorized Rider';
    end if;
    p_payload := p_payload
      - 'vehicle_code' - 'vehicle_name' - 'vehicle_master_key' - 'vehicle_source'
      - 'driver_code' - 'driver_name' - 'driver_master_key' - 'driver_source'
      - 'helper_code' - 'helper_name' - 'helper_master_key' - 'helper_source';
    p_payload := jsonb_set(p_payload, '{vehicle_type}', 'null'::jsonb, true);
    v_vehicle_type := null;
  elsif v_mode = 'VEHICLE_CREW' then
    if coalesce(nullif(btrim(p_payload ->> 'vehicle_code'), ''), nullif(btrim(p_payload ->> 'vehicle_name'), '')) is null then
      raise exception 'Vehicle Crew mode requires a permitted Vehicle';
    end if;
    if coalesce(nullif(btrim(p_payload ->> 'driver_code'), ''), nullif(btrim(p_payload ->> 'driver_name'), '')) is null then
      raise exception 'Vehicle Crew mode requires an authorized Driver';
    end if;
    if coalesce(nullif(btrim(p_payload ->> 'helper_code'), ''), nullif(btrim(p_payload ->> 'helper_name'), '')) is null then
      raise exception 'Vehicle Crew mode requires an assigned Helper';
    end if;
    p_payload := p_payload - 'rider_code' - 'rider_name' - 'rider_master_key' - 'rider_source';
  else
    if coalesce(nullif(btrim(p_payload ->> 'rider_code'), ''), nullif(btrim(p_payload ->> 'rider_name'), '')) is null then
      raise exception 'Assign an authorized Rider before creating the Wayplan';
    end if;
    if coalesce(nullif(btrim(p_payload ->> 'vehicle_code'), ''), nullif(btrim(p_payload ->> 'vehicle_name'), '')) is null then
      raise exception 'Assign a permitted vehicle before creating the Wayplan';
    end if;
  end if;

  if to_regprocedure('public.be_generate_wayplan(jsonb)') is null then
    raise exception 'Legacy Wayplan generator be_generate_wayplan(jsonb) is not installed';
  end if;

  p_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'actor', v_actor,
    'source', 'WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT',
    'assignment_mode', v_mode,
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
      'assignment_mode', v_mode,
      'legacy_result', v_result
    )
  from public.be_v_warehouse_receipt_v39 v
  where v.delivery_way_id = any(v_ids)
  on conflict (wayplan_id, delivery_way_id) do update
  set updated_at = now(), metadata = public.be_wayplan_membership_v40.metadata || excluded.metadata;

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (
    v_wayplan_id,
    'WAYPLAN_CREATED_WITH_EXCLUSIVE_ASSIGNMENT_V44',
    v_actor,
    jsonb_build_object('parcel_count', v_count, 'route_zone', v_routes[1], 'assignment_mode', v_mode, 'payload', p_payload)
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan_id,
    'v40_validated', true,
    'v44_validated', true,
    'assignment_mode', v_mode,
    'parcel_count', v_count,
    'route_zone', v_routes[1],
    'next_step', 'Submit for Supervisor review, then mandatory Dispatch scan before Publish'
  );
end;
$$;

create or replace function public.be_generate_wayplan_from_warehouse_v44(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_mode text := upper(regexp_replace(btrim(coalesce(p_payload ->> 'assignment_mode', '')), '[^A-Za-z]+', '_', 'g'));
  v_result jsonb;
  v_wayplan text;
begin
  if to_regprocedure('public.be_generate_wayplan_from_warehouse_v42(jsonb)') is null then
    raise exception 'Wayplan V42 master assignment resolver is required before V44';
  end if;

  if v_mode in ('RIDER_ONLY','RIDER_DELIVERY') then v_mode := 'RIDER'; end if;
  if v_mode in ('VEHICLE','CREW','VEHICLE_TEAM') then v_mode := 'VEHICLE_CREW'; end if;
  if v_mode not in ('RIDER','VEHICLE_CREW') then
    raise exception 'Choose exactly one assignment mode: RIDER or VEHICLE_CREW';
  end if;

  if v_mode = 'RIDER' then
    v_payload := v_payload
      - 'vehicle_code' - 'vehicle_name' - 'vehicle_master_key'
      - 'driver_code' - 'driver_name' - 'driver_master_key'
      - 'helper_code' - 'helper_name' - 'helper_master_key';
    -- V42 validates a vehicle_type before passing to the V40 core. V40/V44 then removes it for Rider mode.
    v_payload := v_payload || jsonb_build_object('assignment_mode', 'RIDER', 'vehicle_type', 'bike');
  else
    v_payload := v_payload - 'rider_code' - 'rider_name' - 'rider_master_key';
    v_payload := v_payload || jsonb_build_object('assignment_mode', 'VEHICLE_CREW');
  end if;

  v_result := public.be_generate_wayplan_from_warehouse_v42(v_payload);
  v_wayplan := coalesce(
    nullif(v_result ->> 'wayplan_id', ''),
    nullif(v_result ->> 'wayplan_code', ''),
    nullif(v_result #>> '{data,wayplan_id}', '')
  );

  if v_wayplan is not null then
    update public.be_wayplan_membership_v40
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'assignment_mode', v_mode,
          'assignment_v44', jsonb_build_object(
            'assignment_mode', v_mode,
            'exclusive', true,
            'resolved_at', now()
          )
        ),
        updated_at = now()
    where wayplan_id = v_wayplan;

    insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
    values (
      v_wayplan,
      'WAYPLAN_ASSIGNMENT_MODE_FINALIZED_V44',
      public.be_wayplan_actor_v40(v_payload ->> 'actor'),
      jsonb_build_object('assignment_mode', v_mode, 'exclusive', true)
    );
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'assignment_mode', v_mode,
    'exclusive_assignment', true,
    'full_fleet_visibility', true
  );
end;
$$;

-- V43 Supervisor review now accepts either exclusive V44 assignment or the older combined assignment.
create or replace function public.be_wayplan_validate_review_v43(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
  v_route_count integer := 0;
  v_route text;
  v_invalid text[] := '{}'::text[];
  v_statuses text[] := '{}'::text[];
  v_missing_assignment integer := 0;
  v_assignment_modes text[] := '{}'::text[];
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if to_regclass('public.be_wayplan_membership_v40') is null then
    raise exception 'Wayplan V40 membership is required before V43';
  end if;

  select
    count(*)::integer,
    count(distinct route_zone)::integer,
    min(route_zone),
    array_agg(distinct membership_status order by membership_status),
    array_agg(distinct upper(coalesce(metadata ->> 'assignment_mode', metadata #>> '{assignment_v44,assignment_mode}', 'LEGACY_COMBINED'))),
    count(*) filter (where
      case upper(coalesce(metadata ->> 'assignment_mode', metadata #>> '{assignment_v44,assignment_mode}', 'LEGACY_COMBINED'))
        when 'RIDER' then coalesce(rider_code, rider_name, '') = ''
        when 'VEHICLE_CREW' then
          coalesce(vehicle_code, vehicle_name, '') = ''
          or coalesce(driver_code, driver_name, '') = ''
          or coalesce(helper_code, helper_name, '') = ''
        else coalesce(rider_code, rider_name, '') = '' or coalesce(vehicle_code, vehicle_name, '') = ''
      end
    )::integer
  into v_count, v_route_count, v_route, v_statuses, v_assignment_modes, v_missing_assignment
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and membership_status not in ('CANCELLED','COMPLETED');

  if v_count = 0 then raise exception 'Wayplan % has no active parcel membership', v_wayplan; end if;
  if v_route_count <> 1 or coalesce(v_route, 'UNASSIGNED') = 'UNASSIGNED' then
    raise exception 'Wayplan % must contain exactly one assigned route group', v_wayplan;
  end if;
  if coalesce(cardinality(v_assignment_modes), 0) <> 1 then
    raise exception 'Wayplan % contains mixed assignment modes', v_wayplan;
  end if;
  if v_missing_assignment > 0 then
    if v_assignment_modes[1] = 'RIDER' then
      raise exception 'Wayplan % Rider Delivery assignment is missing Rider', v_wayplan;
    elsif v_assignment_modes[1] = 'VEHICLE_CREW' then
      raise exception 'Wayplan % Vehicle Crew assignment requires Vehicle, Driver, and Helper', v_wayplan;
    else
      raise exception 'Wayplan % is missing Rider or Vehicle assignment', v_wayplan;
    end if;
  end if;
  if exists (
    select 1 from public.be_wayplan_membership_v40
    where wayplan_id = v_wayplan and membership_status in ('DISPATCHED','RTO','ON_HOLD')
  ) then
    raise exception 'Wayplan % contains dispatched, RTO, or held membership and cannot enter review', v_wayplan;
  end if;

  select coalesce(array_agg(m.delivery_way_id order by m.delivery_way_id), '{}'::text[])
  into v_invalid
  from public.be_wayplan_membership_v40 m
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
  where m.wayplan_id = v_wayplan
    and m.membership_status not in ('CANCELLED','COMPLETED')
    and (
      v.delivery_way_id is null
      or v.warehouse_status <> 'WAREHOUSE_READY'
      or coalesce(v.discrepancy_code, '') <> ''
      or coalesce(v.delivery_attempt_status, '') = 'RTO'
    );

  return jsonb_build_object(
    'ok', coalesce(cardinality(v_invalid), 0) = 0,
    'wayplan_id', v_wayplan,
    'parcel_count', v_count,
    'route_group', v_route,
    'assignment_mode', v_assignment_modes[1],
    'membership_statuses', to_jsonb(v_statuses),
    'invalid_way_ids', to_jsonb(v_invalid),
    'invalid_count', coalesce(cardinality(v_invalid), 0),
    'assignment_complete', v_missing_assignment = 0
  );
end;
$$;

revoke all on function public.be_wayplan_vehicle_type_v44(text) from public, anon;
revoke all on function public.be_wayplan_vehicle_allowed_v44(text) from public, anon;
revoke all on function public.be_wayplan_assignment_options_v44() from public, anon;
revoke all on function public.be_generate_wayplan_from_warehouse_v44(jsonb) from public, anon;

grant execute on function public.be_wayplan_vehicle_type_v44(text) to authenticated;
grant execute on function public.be_wayplan_vehicle_allowed_v44(text) to authenticated;
grant execute on function public.be_wayplan_assignment_options_v44() to authenticated;
grant execute on function public.be_generate_wayplan_from_warehouse_v44(jsonb) to authenticated;

commit;

select
  to_regprocedure('public.be_wayplan_assignment_options_v44()')::text as assignment_options_rpc,
  to_regprocedure('public.be_generate_wayplan_from_warehouse_v44(jsonb)')::text as guarded_wayplan_create_rpc,
  to_regprocedure('public.be_wayplan_validate_review_v43(text)')::text as supervisor_validation_rpc,
  'RIDER => Rider only; VEHICLE_CREW => Vehicle + Driver + Helper; all active Fleet Master rows visible, policy-blocked types disabled'::text as workflow;
