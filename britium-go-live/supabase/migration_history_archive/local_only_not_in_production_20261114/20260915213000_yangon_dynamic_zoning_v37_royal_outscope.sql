begin;

-- V37 Yangon dynamic zoning: Dala and Seikgyi Kanaungto are out of scope for
-- Britium-operated Yangon delivery. They must always be handed to ROYAL Express,
-- irrespective of item price, address presence, or generic highway fallback rules.

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
      'destination_key',v_key,'matched_destination',null,
      'build','YANGON_DYNAMIC_ZONING_V37_20260915'
    );
  end if;

  if v_key = any(array[
    'dala','ဒလ',
    'seikgyikanaungto','seikkyikanaungto','ဆိပ်ကြီးခနောင်တို'
  ]::text[]) then
    v_provider := 'ROYAL EXPRESS';
    v_region := 'OUTSIDE_CORE';
    v_mode := 'ROYAL_EXPRESS';
    v_reason := 'YANGON_OUT_OF_SCOPE_ROYAL_V37';
    v_map_required := false;
    v_station_required := false;
  elsif v_key = any(array[
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
    'build','YANGON_DYNAMIC_ZONING_V37_20260915'
  );
end
$function$;

revoke all on function public.be_data_entry_delivery_route_v26(text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.be_data_entry_delivery_route_v26(text,numeric,text,text) to service_role;

-- V19 compatibility entrypoint continues to resolve through the V26/V37 router.
create or replace function public.be_data_entry_delivery_route_v19(
  p_township text, p_item_price numeric default null
) returns jsonb language sql stable security definer
set search_path to 'public','pg_temp'
as $function$
  select public.be_data_entry_delivery_route_v26(p_township,p_item_price,null,null);
$function$;

revoke all on function public.be_data_entry_delivery_route_v19(text,numeric) from public, anon, authenticated;
grant execute on function public.be_data_entry_delivery_route_v19(text,numeric) to service_role;

-- Migration assertions: both out-of-scope townships must remain Royal even when
-- the generic outside-core logic would otherwise select a highway terminal.
do $verify$
declare v_route jsonb;
begin
  v_route := public.be_data_entry_delivery_route_v26('Dala',null,null,null);
  if v_route->>'provider_code'<>'ROYAL EXPRESS'
     or v_route->>'delivery_mode'<>'ROYAL_EXPRESS'
     or v_route->>'reason'<>'YANGON_OUT_OF_SCOPE_ROYAL_V37' then
    raise exception 'V37 Dala routing assertion failed: %',v_route;
  end if;

  v_route := public.be_data_entry_delivery_route_v26('Seikgyi Kanaungto',null,null,null);
  if v_route->>'provider_code'<>'ROYAL EXPRESS'
     or v_route->>'delivery_mode'<>'ROYAL_EXPRESS'
     or v_route->>'reason'<>'YANGON_OUT_OF_SCOPE_ROYAL_V37' then
    raise exception 'V37 Seikgyi Kanaungto routing assertion failed: %',v_route;
  end if;

  v_route := public.be_data_entry_delivery_route_v26('မန္တလေး',null,null,null);
  if v_route->>'provider_code'<>'DK DELIVERY' then raise exception 'V37 regression: Mandalay must route to DK'; end if;

  v_route := public.be_data_entry_delivery_route_v26('သန်လျင်',null,null,null);
  if v_route->>'provider_code'<>'BRITIUM' then raise exception 'V37 regression: Thanlyin must remain Britium'; end if;
end
$verify$;

notify pgrst, 'reload schema';
commit;
