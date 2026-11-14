do $patch_failure$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_record_delivery_failure_v39'
  limit 1;

  if v_def is null then raise exception 'be_record_delivery_failure_v39 not found'; end if;

  if position('v_status := case when v_attempt >= v_limit then ''RTO'' else ''ATTEMPTED_FAILED'' end;' in v_def)=0 then
    raise exception 'delivery failure status anchor changed';
  end if;

  v_def:=replace(
    v_def,
    'v_status := case when v_attempt >= v_limit then ''RTO'' else ''ATTEMPTED_FAILED'' end;',
    'v_status := ''ATTEMPTED_FAILED'';'
  );

  v_def:=replace(
    v_def,
    'rto_at = case when v_status = ''RTO'' then coalesce(rto_at, now()) else null end,',
    'rto_at = null,'
  );

  execute v_def;
end
$patch_failure$;