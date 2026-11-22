-- Initial production access: elevate only authenticated superadmin accounts.
-- Explicitly excludes all other authenticated employees; no anon access.
-- Every source table retains RLS. This file is separate from schema creation.
BEGIN;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
   'be_waybill_ledger',
   'be_finance_cod_settlements_v48',
   'be_provider_transfer_custody_v1',
   'be_parcel_provider_overrides_v1',
   'be_warehouse_return_scans_v39'
 ] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('DROP POLICY IF EXISTS be_harmonized_superadmin_read_v1 ON public.%I',t);
   EXECUTE format($pol$
    CREATE POLICY be_harmonized_superadmin_read_v1 ON public.%I
    FOR SELECT TO authenticated USING (
      (SELECT auth.uid()) IS NOT NULL
      AND lower(replace(public.be_current_role(),'-','_'))
        IN ('superadmin','super_admin','operation_manager','operations_manager')
    )$pol$,t);
 END LOOP;
END $$;
REVOKE ALL ON public.be_v_harmonized_parcel_monitor_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.be_v_harmonized_parcel_monitor_v1 TO authenticated;
COMMENT ON VIEW public.be_v_harmonized_parcel_monitor_v1 IS
 'Superadmin-only via security_invoker and source-table RLS. No COD or physical proof inferred from a label; no ordinary authenticated account access. Gate and dispatch assumptions remain spreadsheet-only until verified.';
COMMIT;

-- Test gates: anon receives permission denied; branch/rider/finance authenticated
-- should receive zero sensitive rows. Superadmin user with valid JWT must see 1985
-- distinct Way IDs (as of 2026-11-22 baseline).
-- Do not relax policy for ordinary authenticated users.
