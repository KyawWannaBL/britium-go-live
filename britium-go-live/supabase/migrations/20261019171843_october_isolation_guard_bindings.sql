
do $$declare t record;begin
 for t in select table_name from private.be_oct2026_scope order by table_name loop
  if to_regclass(format('public.%I',t.table_name)) is null then raise exception 'Cutover table missing: %',t.table_name;end if;
  execute format('drop trigger if exists aaa_oct2026_guard on public.%I',t.table_name);
  execute format('create trigger aaa_oct2026_guard before insert or update or delete on public.%I for each row execute function private.be_oct2026_write_guard()',t.table_name);
  execute format('drop trigger if exists zzzzzz_oct2026_guard on public.%I',t.table_name);
  execute format('create trigger zzzzzz_oct2026_guard after insert or update on public.%I for each row execute function private.be_oct2026_write_guard()',t.table_name);
  execute format('drop trigger if exists oct2026_truncate_guard on public.%I',t.table_name);
  execute format('create trigger oct2026_truncate_guard before truncate on public.%I for each statement execute function private.be_oct2026_write_guard()',t.table_name);
 end loop;
end $$;

