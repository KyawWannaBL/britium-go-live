-- Disposable CI only. Fail the migration replay if application RPCs or core tables are absent.
-- Never run as a substitute for actual authenticated screen tests.
DO $assert$
DECLARE v_missing text;
BEGIN
  WITH expected(name, kind) AS (
    VALUES
      ('be_role_dashboard_v1','function'),
      ('be_cs_parcel_support_queue','function'),
      ('be_cs_thirdparty_queue_v1','function'),
      ('be_get_merchants_dropdown','function'),
      ('be_data_entry_financial_v2_schema','function'),
      ('be_warehouse_scan_lifecycle_snapshot_v211','function'),
      ('be_warehouse_scan_lifecycle_snapshot_v164','function'),
      ('be_branch_intake_snapshot_v1','function'),
      ('be_data_entry_parcel_details','relation'),
      ('be_waybill_ledger','relation'),
      ('be_dispatch_scans_v39','relation'),
      ('be_branch_offices','relation'),
      ('be_wayplan_dispatches','relation'),
      ('be_wayplan_dispatch_stops','relation'),
      ('be_warehouse_return_scans_v39','relation')
  ), missing AS (
    SELECT e.name, e.kind FROM expected e
    WHERE (e.kind='relation' AND to_regclass(format('%I.%I','public',e.name)) IS NULL)
      OR (e.kind='function' AND NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.pronamespace='public'::regnamespace AND p.proname=e.name
          AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      ))
  )
  SELECT string_agg(kind || ': ' || name, E'\n' ORDER BY kind,name)
  INTO v_missing FROM missing;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION E'UAT replay incomplete; missing required application objects:\n%',v_missing;
  END IF;
  RAISE NOTICE 'UAT operational schema objects present; authenticated workflow tests still required.';
END;
$assert$;
