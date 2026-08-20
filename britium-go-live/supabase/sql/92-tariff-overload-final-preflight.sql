-- 92-tariff-overload-final-preflight.sql
-- Purpose:
--   Clear all overloaded public.be_calculate_tariff functions before running the clean portal SQL.
--   This prevents:
--     42725: function name "public.be_calculate_tariff" is not unique
--     42P13: cannot change return type of existing function
--
-- Safe for testing database. Review carefully before production.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
    ORDER BY p.oid::regprocedure::text
  LOOP
    RAISE NOTICE 'Dropping %', fn.signature;
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.signature);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
