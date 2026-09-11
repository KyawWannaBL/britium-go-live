-- 93-warehouse-sort-scan-overload-hardfix.sql
-- Purpose:
--   Fix "function name public.be_warehouse_sort_scan is not unique" by
--   removing all existing overloads before the clean portal SQL recreates the
--   canonical function signature.
--
-- Safe for testing/staging reruns. It only targets public.be_warehouse_sort_scan.

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
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
