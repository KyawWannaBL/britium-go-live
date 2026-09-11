-- 94-tariff-return-type-drop-fix.sql
-- Purpose:
--   Fix Postgres error:
--   ERROR: 42P13: cannot change return type of existing function
--   HINT: Use DROP FUNCTION be_calculate_tariff(text,numeric,boolean) first.
--
-- Run this BEFORE rerunning 99-run-all-clean-enterprise-portal.sql.
--
-- Safe for testing environment. It drops only the exact overloaded signature
-- public.be_calculate_tariff(text, numeric, boolean), then asks PostgREST
-- to reload its schema cache.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_calculate_tariff'
      and pg_get_function_identity_arguments(p.oid) = 'p_service_type text, p_weight numeric, p_is_cod boolean'
  ) then
    drop function public.be_calculate_tariff(text, numeric, boolean) cascade;
  elsif exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_calculate_tariff'
      and pg_get_function_identity_arguments(p.oid) = 'text, numeric, boolean'
  ) then
    drop function public.be_calculate_tariff(text, numeric, boolean) cascade;
  else
    -- Exact signature may not exist. This is fine for a fresh database.
    raise notice 'public.be_calculate_tariff(text,numeric,boolean) does not exist; nothing to drop.';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Optional verification after rerunning the full SQL:
-- select proname, pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as returns
-- from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname = 'be_calculate_tariff';
