-- V136.2: ready-waybill helper must accept canonical field-team verification/collection.
-- The pickup can be completed by an assigned driver/helper when no rider is assigned.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  if not v_os_evidence and not v_superadmin_bulkload and (v_pickup.pickup_verified_at is null
     or v_pickup.pickup_collected_at is null
     or upper(coalesce(v_pickup.rider_status, '')) not in (
       'COLLECTED',
       'TO_WAREHOUSE'
     )) then
    raise exception
      'Pickup % must be Rider-verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;
$old$;
  v_new text := $new$
  if not v_os_evidence and not v_superadmin_bulkload and (
       v_pickup.pickup_verified_at is null
       or v_pickup.pickup_collected_at is null
       or not (
         upper(coalesce(v_pickup.pickup_status, '')) in (
           'PICKUP_COLLECTED',
           'DELIVERED_TO_WAREHOUSE'
         )
         or upper(coalesce(v_pickup.workflow_stage, '')) in (
           'PICKUP_COLLECTED',
           'TO_WAREHOUSE',
           'DELIVERED_TO_WAREHOUSE'
         )
         or upper(coalesce(v_pickup.rider_app_stage, '')) in (
           'COLLECTED_PICKUP',
           'WAREHOUSE_HANDOFF'
         )
       )
     ) then
    raise exception
      'Pickup % must be field-team verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;
$new$;
begin
  select pg_get_functiondef(
    to_regprocedure('private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text)')
  )
  into v_definition;

  if v_definition is null then
    raise exception 'V136.2 safety stop: private ready-waybill helper is missing.';
  end if;

  v_definition := replace(v_definition, chr(13), '');

  if position(v_old in v_definition) = 0 then
    raise exception 'V136.2 safety stop: legacy Rider-only private gate was not found exactly.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;

do $verify$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    to_regprocedure('private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text)')
  )
  into v_definition;

  if lower(v_definition) like '%v_pickup.rider_status%'
     or lower(v_definition) not like '%v_pickup.pickup_status%'
     or lower(v_definition) not like '%v_pickup.workflow_stage%'
     or lower(v_definition) not like '%collected_pickup%' then
    raise exception 'V136.2 verification failed: private helper is not using canonical field-team state.';
  end if;
end
$verify$;
