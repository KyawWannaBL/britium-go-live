do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_delivery_location_upsert_v11'
  limit 1;

  if v_def is null then
    raise exception 'be_delivery_location_upsert_v11 not found';
  end if;

  v_old := '  if v_match not in (''ADDRESS_EXACT'',''POI_EXACT'',''STREET_APPROXIMATE'',''WARD_APPROXIMATE'',''MANUAL'') then
    raise exception ''Unsupported location precision: %'', v_match;
  end if;';

  v_new := '  if v_match not in (''ADDRESS_EXACT'',''POI_EXACT'',''STREET_APPROXIMATE'',''WARD_APPROXIMATE'',''POSTAL_DEFAULT'',''TOWNSHIP_DEFAULT'',''MANUAL'') then
    raise exception ''Unsupported location precision: %'', v_match;
  end if;';

  if position(v_old in v_def)=0 then
    raise exception 'upsert v11 precision contract changed; migration stopped safely';
  end if;

  execute replace(v_def,v_old,v_new);
end
$migration$;