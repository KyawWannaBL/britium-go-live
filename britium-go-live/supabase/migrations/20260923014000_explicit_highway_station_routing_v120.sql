-- V120: honor explicit highway-station delivery instructions before ordinary township routing.
-- Prevent addresses such as "ဂိတ်ချပေးရန် ... အဝေးပြေးကားဝင်း" from being forced into doorstep delivery.

do $migration$
declare
  v_def text;
  v_old_decl text := $old$
  v_station_required boolean := false;
begin
$old$;
  v_new_decl text := $new$
  v_station_required boolean := false;
  v_explicit_station boolean := (
    coalesce(p_item_price,0) <= 0
    and lower(coalesce(p_delivery_address,'')) ~ '(ဂိတ်ချပေးရန်|အဝေးပြေးကားဝင်း|highway bus station|highway station)'
  );
begin
$new$;
  v_old_branch text := $old2$
  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,'reason',v_reason,'region_code',v_region,
      'delivery_mode',v_mode,'map_required',false,'station_required',false,
      'destination_key',v_key,'matched_destination',null,
      'build','YANGON_DYNAMIC_ZONING_V37_20260915'
    );
  end if;

  if v_key = any(array[
$old2$;
  v_new_branch text := $new2$
  if v_explicit_station then
    return jsonb_build_object(
      'provider_code','H.TERMINAL DROP-OFF',
      'reason','EXPLICIT_HIGHWAY_STATION_V120',
      'region_code','OUTSIDE_CORE',
      'delivery_mode','HIGHWAY_BUS_STATION',
      'map_required',false,
      'station_required',true,
      'destination_key',v_key,
      'matched_destination',v_legacy->>'matched_destination',
      'royal_available',false,
      'build','EXPLICIT_HIGHWAY_STATION_V120_20260923'
    );
  end if;

  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,'reason',v_reason,'region_code',v_region,
      'delivery_mode',v_mode,'map_required',false,'station_required',false,
      'destination_key',v_key,'matched_destination',null,
      'build','YANGON_DYNAMIC_ZONING_V37_20260915'
    );
  end if;

  if v_key = any(array[
$new2$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_data_entry_delivery_route_v26'
  limit 1;

  if v_def is null then
    raise exception 'be_data_entry_delivery_route_v26 was not found';
  end if;

  if position(v_old_decl in v_def)=0 then
    raise exception 'Expected route declaration block was not found; aborting V120 patch';
  end if;
  v_def := replace(v_def,v_old_decl,v_new_decl);

  if position(v_old_branch in v_def)=0 then
    raise exception 'Expected route decision block was not found; aborting V120 patch';
  end if;
  v_def := replace(v_def,v_old_branch,v_new_branch);

  execute v_def;
end
$migration$;

comment on function public.be_data_entry_delivery_route_v26(text,numeric,text,text)
is 'V120: explicit highway-station instructions with no item price route to H.TERMINAL DROP-OFF before normal township routing.';
