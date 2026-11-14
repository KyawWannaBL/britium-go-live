do $$
declare
  v_def text;
  v_start integer;
  v_finish integer;
  v_replacement text := $rep$
  select coalesce(
           jsonb_agg(to_jsonb(r) order by r.process_type,r.exception_code),
           '[]'::jsonb
         )
    into v_reasons
  from public.be_exception_rules r
  where coalesce(r.active,true)
    and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE');

  if not exists (
    select 1
    from public.be_exception_rules e
    where upper(coalesce(e.exception_code,''))='OTHER_MANUAL'
      and coalesce(e.active,true)
  ) then
    v_reasons := v_reasons || jsonb_build_array(
      jsonb_build_object(
        'process_type','DELIVERY',
        'exception_code','OTHER_MANUAL',
        'exception_name_en','Other / Manual reason',
        'exception_name_mm','အခြား / ကိုယ်တိုင်ရေးသားရန်',
        'mapped_status','ATTEMPTED_FAILED',
        'severity','NORMAL',
        'require_photo','NO',
        'require_remark','YES',
        'next_action','WAREHOUSE_RETURN',
        'active',true
      )
    );
  end if;

$rep$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_warehouse_scan_lifecycle_snapshot'
  limit 1;

  if v_def is null then
    raise exception 'be_warehouse_scan_lifecycle_snapshot() not found';
  end if;

  v_start := position('  select coalesce(jsonb_agg(to_jsonb(x)' in v_def);
  if v_start = 0 then
    raise exception 'Old Warehouse reasons block start not found';
  end if;

  v_finish := position('  return jsonb_build_object(' in substring(v_def from v_start));
  if v_finish = 0 then
    raise exception 'Warehouse return block boundary not found';
  end if;
  v_finish := v_start + v_finish - 1;

  v_def := substring(v_def from 1 for v_start-1)
           || v_replacement
           || substring(v_def from v_finish);

  execute v_def;
end;
$$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated,service_role;
notify pgrst,'reload schema';