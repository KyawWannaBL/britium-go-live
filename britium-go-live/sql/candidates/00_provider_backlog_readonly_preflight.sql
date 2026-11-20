-- BRITIUM EXPRESS / SAFE BACKLOG PREFLIGHT v2
-- Works on BOTH operational and incomplete UAT projects.
-- Read-only; never creates placeholder objects or changes waybill states.
SELECT current_database() AS database_name,
       to_regclass('public.be_data_entry_parcel_details') IS NOT NULL AS parcel_master_exists,
       to_regclass('public.be_warehouse_receipts_v36') IS NOT NULL AS receipt_table_exists,
       to_regclass('public.be_wayplan_dispatches') IS NOT NULL AS wayplan_table_exists,
       to_regclass('public.be_wayplan_membership_v40') IS NOT NULL AS membership_table_exists;

DO $safe$
DECLARE
  v_missing text[];
  v_count bigint;
BEGIN
  SELECT array_agg(object_name) INTO v_missing FROM (
   VALUES
    ('public.be_data_entry_parcel_details'),
    ('public.be_warehouse_receipts_v36'),
    ('public.be_wayplan_dispatches'),
    ('public.be_wayplan_membership_v40'),
    ('public.be_dispatch_scans_v39'),
    ('public.be_warehouse_return_scans_v39'),
    ('public.be_delivery_reschedules_v71'),
    ('public.be_thirdparty_cs_current_v1')
  ) v(object_name) WHERE to_regclass(v.object_name) IS NULL;
  IF cardinality(v_missing)>0 THEN
    RAISE NOTICE 'READ-ONLY PREFLIGHT: Operational schema incomplete. Missing: %', array_to_string(v_missing, ', ');
    RAISE NOTICE 'Backlog counts skipped to avoid relation-not-found errors. Restore UAT migrations; do not create empty placeholder tables.';
  ELSE
    EXECUTE 'SELECT count(*) FROM public.be_data_entry_parcel_details'
      INTO v_count;
    RAISE NOTICE 'Parcel master accessible: % rows. Run the full backlog classification only in a complete operational schema.',v_count;
  END IF;
END;
$safe$;
