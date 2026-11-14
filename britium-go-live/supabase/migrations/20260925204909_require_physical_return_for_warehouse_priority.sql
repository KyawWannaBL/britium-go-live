do $$
declare
  v_def text;
  v_old_row text := $old$
      coalesce(
        dja.next_attempt_priority,
        (
          coalesce(st.consecutive_failures,0) between 1 and 2
          and upper(coalesce(st.last_status,''))='ATTEMPTED_FAILED'
          and coalesce(rh.max_return_attempt,0) >= coalesce(st.consecutive_failures,0)
        ),
        false
      ) as next_attempt_priority,$old$;
  v_new_row text := $new$
      (
        coalesce(st.consecutive_failures,0) between 1 and 2
        and upper(coalesce(st.last_status,''))='ATTEMPTED_FAILED'
        and coalesce(rh.max_return_attempt,0) >= coalesce(st.consecutive_failures,0)
      ) as next_attempt_priority,$new$;
  v_old_stat text := $oldstat$
    'priority',count(*) filter (
      where assignment_priority
         or (
           consecutive_failures between 1 and 2
           and delivery_status='ATTEMPTED_FAILED'
           and max_return_attempt>=consecutive_failures
         )
    ),$oldstat$;
  v_new_stat text := $newstat$
    'priority',count(*) filter (
      where consecutive_failures between 1 and 2
        and delivery_status='ATTEMPTED_FAILED'
        and max_return_attempt>=consecutive_failures
    ),$newstat$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_warehouse_scan_lifecycle_snapshot'
  limit 1;

  if v_def is null then raise exception 'Warehouse snapshot not found'; end if;
  if position(v_old_row in v_def)=0 then raise exception 'Priority row expression anchor not found'; end if;
  if position(v_old_stat in v_def)=0 then raise exception 'Priority stats expression anchor not found'; end if;

  v_def := replace(v_def,v_old_row,v_new_row);
  v_def := replace(v_def,v_old_stat,v_new_stat);
  execute v_def;
end;
$$;

notify pgrst,'reload schema';