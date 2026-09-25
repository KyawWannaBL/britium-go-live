-- V136: Data Entry waybill gate must accept canonical field-team verification/collection,
-- regardless of whether the assigned worker is a rider, driver, or helper.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  if v_pickup.pickup_verified_at is null
     or v_pickup.pickup_collected_at is null
     or upper(coalesce(v_pickup.rider_status, '')) not in (
       'COLLECTED',
       'TO_WAREHOUSE'
     ) then
    raise exception
      'Pickup % must be Rider-verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;
$old$;
  v_new text := $new$
  if v_pickup.pickup_verified_at is null
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
     ) then
    raise exception
      'Pickup % must be field-team verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure(
    'public.be_data_entry_create_waybill_from_rows(text,jsonb,text)'
  );

  if v_definition is null then
    raise exception 'V136 safety stop: be_data_entry_create_waybill_from_rows is missing.';
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'V136 safety stop: legacy Rider-only waybill gate was not found exactly.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$migration$;

create or replace function public.be_assert_data_entry_waybill_gate()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure(
    'public.be_data_entry_create_waybill_from_rows(text,jsonb,text)'
  );

  if v_definition is null
     or lower(v_definition) not like '%pickup_verified_at is null%'
     or lower(v_definition) not like '%pickup_collected_at is null%'
     or lower(v_definition) like '%v_pickup.rider_status%'
     or lower(v_definition) not like '%v_pickup.pickup_status%'
     or lower(v_definition) not like '%v_pickup.workflow_stage%'
     or lower(v_definition) not like '%collected_pickup%' then
    raise exception
      'Safety stop: Data Entry waybill RPC does not contain the canonical field-team verification/collection gate.';
  end if;
end
$function$;

select public.be_assert_data_entry_waybill_gate();
