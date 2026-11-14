begin;

-- V26: geography wins first. Highway-station delivery is the strict
-- outside-core fallback only when item price, address, and Royal coverage are
-- all absent. Calculate and Save re-resolve both route and terminal fee.

create or replace function public.be_data_entry_handoff_charge_v26(p_station_code text)
returns bigint language sql immutable parallel safe
set search_path to 'public','pg_temp'
as $function$
  select case upper(btrim(coalesce(p_station_code,'')))
    when 'AUNG_MINGALAR' then 3000
    when 'DAGON_AYAR_THIRI' then 4000
    when 'OTHER' then 4000
    else null
  end;
$function$;

revoke all on function public.be_data_entry_handoff_charge_v26(text) from public, anon, authenticated;
grant execute on function public.be_data_entry_handoff_charge_v26(text) to service_role;

create or replace function public.be_data_entry_delivery_route_v26(
  p_township text,
  p_item_price numeric default null,
  p_delivery_address text default null,
  p_requested_provider text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_legacy jsonb := public.be_data_entry_service_provider_route_v17(p_township);
  v_key text := coalesce(v_legacy->>'destination_key','');
  v_legacy_reason text := coalesce(v_legacy->>'reason','UNRESOLVED');
  v_royal_available boolean := (
      upper(coalesce(v_legacy->>'provider_code',''))='ROYAL EXPRESS'
      and (
        nullif(btrim(coalesce(v_legacy->>'matched_destination','')),'') is not null
        or v_legacy_reason='NAYPYITAW_EXCEPTION_ROYAL'
      )
    ) or upper(btrim(coalesce(p_requested_provider,'')))='ROYAL EXPRESS';
  v_provider text;
  v_region text := 'UNRESOLVED';
  v_mode text := 'UNRESOLVED';
  v_reason text := 'UNRESOLVED';
  v_map_required boolean := false;
  v_station_required boolean := false;
begin
  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,'reason',v_reason,'region_code',v_region,
      'delivery_mode',v_mode,'map_required',false,'station_required',false,
      'destination_key',v_key,'matched_destination',null
    );
  end if;

  if v_key = any(array[
    'yangon','rangoon','ရန်ကုန်',
    'thanlyin','syriam','သန်လျင်',
    'thongwa','thone gwa','thone-gwa','သုံးခွ'
  ]::text[]) then
    v_provider := 'BRITIUM'; v_region := 'YANGON';
    v_mode := 'DOORSTEP_MAP'; v_reason := 'EXACT_BRITIUM_ROUTE'; v_map_required := true;
  elsif v_legacy_reason='MANDALAY_DK_SERVICE_AREA' then
    v_provider := 'DK DELIVERY'; v_region := 'MANDALAY';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  elsif v_legacy_reason='NAYPYITAW_BRANCH_SERVICE_AREA' then
    v_provider := 'NPT BRANCH'; v_region := 'NAYPYITAW';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  elsif v_legacy_reason='EXACT_BRITIUM_ROUTE' then
    v_provider := 'BRITIUM'; v_region := 'YANGON';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  else
    v_region := 'OUTSIDE_CORE';
    if coalesce(p_item_price,0)>0
       or btrim(coalesce(p_delivery_address,''))<>''
       or v_royal_available then
      v_provider := 'ROYAL EXPRESS'; v_mode := 'ROYAL_EXPRESS';
      v_reason := case when coalesce(p_item_price,0)>0
        then 'OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE' else 'OUTSIDE_CORE_ROYAL_DEFAULT' end;
    else
      v_provider := 'H.TERMINAL DROP-OFF'; v_mode := 'HIGHWAY_BUS_STATION';
      v_reason := 'OUTSIDE_CORE_HIGHWAY_STATION'; v_station_required := true;
    end if;
  end if;

  return jsonb_build_object(
    'provider_code',v_provider,'reason',v_reason,'region_code',v_region,
    'delivery_mode',v_mode,'map_required',v_map_required,
    'station_required',v_station_required,'destination_key',v_key,
    'matched_destination',v_legacy->>'matched_destination',
    'royal_available',v_royal_available,
    'build','DATA_ENTRY_INITIAL_PROVIDER_GEOGRAPHY_V26_20260905'
  );
end
$function$;

revoke all on function public.be_data_entry_delivery_route_v26(text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.be_data_entry_delivery_route_v26(text,numeric,text,text) to service_role;

create or replace function public.be_data_entry_delivery_route_v19(
  p_township text, p_item_price numeric default null
) returns jsonb language sql stable security definer
set search_path to 'public','pg_temp'
as $function$
  select public.be_data_entry_delivery_route_v26(p_township,p_item_price,null,null);
$function$;

revoke all on function public.be_data_entry_delivery_route_v19(text,numeric) from public, anon, authenticated;
grant execute on function public.be_data_entry_delivery_route_v19(text,numeric) to service_role;

-- Retain the complete V19 authorization/audit implementations and replace only
-- their route call and their handoff fee immediately before financial commit.
do $migration$
declare
  v_name text;
  v_definition text;
  v_old_route text := 'public.be_data_entry_delivery_route_v19(p_payload->>''township'',v_item_price)';
  v_new_route text := 'public.be_data_entry_delivery_route_v26(p_payload->>''township'',v_item_price,p_payload->>''delivery_address'',p_payload->>''service_provider_code'')';
begin
  foreach v_name in array array[
    'public.be_data_entry_financial_v2_calculate_v19_legacy(jsonb)',
    'public.be_data_entry_financial_v2_save(jsonb)'
  ] loop
    select pg_get_functiondef(v_name::regprocedure) into v_definition;
    if position(v_old_route in v_definition)=0 then
      raise exception 'V26 route upgrade target was not found in %',v_name;
    end if;
    v_definition := replace(v_definition,v_old_route,v_new_route);
    if v_name like '%calculate%' then
      v_definition := replace(v_definition,
        'v_result := public.be_data_entry_financial_v2_calculate_v13_2_legacy(v_payload);',
        'if coalesce((v_route->>''station_required'')::boolean,false) then v_payload := v_payload || jsonb_build_object(''delivery_charges'',public.be_data_entry_handoff_charge_v26(v_station->>''code'')); end if; v_result := public.be_data_entry_financial_v2_calculate_v13_2_legacy(v_payload);');
    else
      v_definition := replace(v_definition,
        'v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);',
        'if v_station_required then v_payload := v_payload || jsonb_build_object(''delivery_charges'',public.be_data_entry_handoff_charge_v26(v_station->>''code'')); end if; v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);');
    end if;
    execute v_definition;
  end loop;
end
$migration$;

do $verify$
declare v_route jsonb;
begin
  v_route := public.be_data_entry_delivery_route_v26('မန္တလေး',null,null,null);
  if v_route->>'provider_code'<>'DK DELIVERY' then raise exception 'Mandalay must route to DK'; end if;
  v_route := public.be_data_entry_delivery_route_v26('ဇမ္ဗူသီရိ',null,null,null);
  if v_route->>'provider_code'<>'NPT BRANCH' then raise exception 'Naypyitaw must route to NPT Branch'; end if;
  v_route := public.be_data_entry_delivery_route_v26('သန်လျင်',null,null,null);
  if v_route->>'provider_code'<>'BRITIUM' then raise exception 'Thanlyin must route to Britium'; end if;
  v_route := public.be_data_entry_delivery_route_v26('Unsupported Township',null,null,null);
  if v_route->>'provider_code'<>'H.TERMINAL DROP-OFF' then raise exception 'Empty outside-core fallback must use highway station'; end if;
  v_route := public.be_data_entry_delivery_route_v26('Unsupported Township',null,'Receiver address',null);
  if v_route->>'provider_code'<>'ROYAL EXPRESS' then raise exception 'Addressed outside-core parcel must use Royal'; end if;
  if public.be_data_entry_handoff_charge_v26('AUNG_MINGALAR')<>3000
     or public.be_data_entry_handoff_charge_v26('DAGON_AYAR_THIRI')<>4000
     or public.be_data_entry_handoff_charge_v26('OTHER')<>4000 then
    raise exception 'V26 highway-station fee contract failed';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
commit;
