-- 95-tariff-overload-safe-grants-final.sql
-- Purpose:
--   Grant execute on every public.be_calculate_tariff overload without using ambiguous bare function name.

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
    RAISE NOTICE 'Granting execute on %', fn.signature;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn.signature);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
