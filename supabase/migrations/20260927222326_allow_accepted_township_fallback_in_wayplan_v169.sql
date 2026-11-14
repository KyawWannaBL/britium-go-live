do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_dispatch_ready_queue_v19'
  limit 1;

  v_def := replace(
    v_def,
    'and upper(coalesce(loc.coordinate_source,'''') ) ~ ''^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)''',
    'and (upper(coalesce(loc.coordinate_source,'''') ) ~ ''^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'' or upper(coalesce(loc.coordinate_source,'''')) in (''TOWNSHIP_DEFAULT_V136'',''TOWNSHIP_DEFAULT_RETRY_V168''))'
  );

  v_def := replace(
    v_def,
    'loc.match_level in (''ADDRESS_EXACT'',''POI_EXACT'')',
    '(loc.match_level in (''ADDRESS_EXACT'',''POI_EXACT'') or (loc.match_level=''TOWNSHIP_DEFAULT'' and upper(coalesce(loc.coordinate_source,'''')) in (''TOWNSHIP_DEFAULT_V136'',''TOWNSHIP_DEFAULT_RETRY_V168'')))'
  );

  execute v_def;
end $$;