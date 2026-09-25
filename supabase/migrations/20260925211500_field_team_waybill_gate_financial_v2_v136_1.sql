-- V136.1: Financial V2 wrapper must use canonical field-team pickup state,
-- not the legacy rider_status column. Driver/helper collection is valid.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  if nullif(v_pickup ->> 'pickup_verified_at','') is null
     or nullif(v_pickup ->> 'pickup_collected_at','') is null
     or upper(coalesce(v_pickup ->> 'rider_status','')) not in ('COLLECTED','TO_WAREHOUSE') then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','RIDER_COLLECTION_NOT_VERIFIED','message','Pickup must be Rider-verified and collected before waybill creation.'
    )),'access',v_access);
  end if;
$old$;
  v_new text := $new$
  if nullif(v_pickup ->> 'pickup_verified_at','') is null
     or nullif(v_pickup ->> 'pickup_collected_at','') is null
     or not (
       upper(coalesce(v_pickup ->> 'pickup_status','')) in (
         'PICKUP_COLLECTED',
         'DELIVERED_TO_WAREHOUSE'
       )
       or upper(coalesce(v_pickup ->> 'workflow_stage','')) in (
         'PICKUP_COLLECTED',
         'TO_WAREHOUSE',
         'DELIVERED_TO_WAREHOUSE'
       )
       or upper(coalesce(v_pickup ->> 'rider_app_stage','')) in (
         'COLLECTED_PICKUP',
         'WAREHOUSE_HANDOFF'
       )
     ) then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','FIELD_TEAM_COLLECTION_NOT_VERIFIED','message','Pickup must be field-team verified and collected before waybill creation.'
    )),'access',v_access);
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure(
    'public.be_data_entry_financial_v2_create_waybill(jsonb)'
  );

  if v_definition is null then
    raise exception 'V136.1 safety stop: be_data_entry_financial_v2_create_waybill(jsonb) is missing.';
  end if;

  v_definition := replace(v_definition, chr(13), '');

  if position(v_old in v_definition) = 0 then
    raise exception 'V136.1 safety stop: legacy Rider-only Financial V2 gate was not found exactly.';
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
  v_legacy_definition text;
  v_financial_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_legacy_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure(
    'public.be_data_entry_create_waybill_from_rows(text,jsonb,text)'
  );

  select pg_get_functiondef(p.oid)
  into v_financial_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.oid = to_regprocedure(
    'public.be_data_entry_financial_v2_create_waybill(jsonb)'
  );

  if v_legacy_definition is null
     or lower(v_legacy_definition) like '%v_pickup.rider_status%'
     or lower(v_legacy_definition) not like '%v_pickup.pickup_status%'
     or lower(v_legacy_definition) not like '%v_pickup.workflow_stage%'
     or lower(v_legacy_definition) not like '%collected_pickup%' then
    raise exception
      'Safety stop: legacy Data Entry waybill RPC is not using canonical field-team collection state.';
  end if;

  if v_financial_definition is null
     or lower(v_financial_definition) like '%v_pickup ->> ''rider_status''%'
     or lower(v_financial_definition) not like '%v_pickup ->> ''pickup_status''%'
     or lower(v_financial_definition) not like '%v_pickup ->> ''workflow_stage''%'
     or lower(v_financial_definition) not like '%collected_pickup%' then
    raise exception
      'Safety stop: Financial V2 waybill RPC is not using canonical field-team collection state.';
  end if;
end
$function$;

select public.be_assert_data_entry_waybill_gate();
