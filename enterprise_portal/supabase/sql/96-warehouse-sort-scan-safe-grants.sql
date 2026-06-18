-- 96-warehouse-sort-scan-safe-grants.sql
-- Purpose:
--   Grants EXECUTE on every currently installed be_warehouse_sort_scan overload
--   without using the ambiguous bare function name.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_warehouse_sort_scan'
  loop
    execute format('grant execute on function %s to authenticated', fn.signature);
    execute format('grant execute on function %s to anon', fn.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
