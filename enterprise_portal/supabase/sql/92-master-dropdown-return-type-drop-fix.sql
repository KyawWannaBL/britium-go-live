-- 92-master-dropdown-return-type-drop-fix.sql
-- Britium clean Enterprise Portal compatibility fix.
-- Purpose:
--   Existing Supabase projects may already contain public.be_master_dropdown_snapshot(text)
--   with a different return type. PostgreSQL cannot CREATE OR REPLACE a function when
--   the return type changes, so we drop the existing overload(s) before rerunning the
--   clean portal SQL.
--
-- Safe for TESTING/STAGING. For production, backup first.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'be_master_dropdown_snapshot',
        'be_master_record_lookup'
      )
  loop
    execute 'drop function if exists ' || r.signature || ' cascade';
  end loop;
end $$;

notify pgrst, 'reload schema';

create or replace function public.be_master_dropdown_return_type_drop_verification()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'message', 'Existing master dropdown RPC overloads were dropped. Rerun 99-run-all-clean-enterprise-portal.sql now.',
    'remaining_master_dropdown_snapshot_overloads',
      (
        select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'be_master_dropdown_snapshot'
      ),
    'remaining_master_record_lookup_overloads',
      (
        select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'be_master_record_lookup'
      )
  );
$$;

grant execute on function public.be_master_dropdown_return_type_drop_verification() to authenticated, anon, service_role;
