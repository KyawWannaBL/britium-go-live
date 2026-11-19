-- Britium UAT operational RPC readiness gate.
-- Read-only; do not install placeholder RPCs or bypass RLS.
WITH required_rpc(name, args, screen) AS (
 VALUES
 ('be_role_dashboard_v1','','Dashboard'),
 ('be_cs_parcel_support_queue','p_limit integer, p_search text','CS Command / CS Portal'),
 ('be_cs_thirdparty_queue_v1','p_search text, p_outcome text, p_limit integer','Third-party Confirmation'),
 ('be_get_merchants_dropdown','','Pickup Form'),
 ('be_data_entry_financial_v2_schema','','Data Entry'),
 ('be_warehouse_scan_lifecycle_snapshot_v211','','Warehouse / Warehouse Ops'),
 ('be_warehouse_scan_lifecycle_snapshot_v164','','Pending Parcels'),
 ('be_branch_intake_snapshot_v1','p_branch text','HQ Branch Shuttle')
), rpc_status AS (
 SELECT r.*, EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=r.name
     AND pg_get_function_identity_arguments(p.oid)=r.args
     AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 ) AS ready
 FROM required_rpc r
), required_rel(name) AS (
 SELECT unnest(ARRAY[
 'be_data_entry_parcel_details','be_waybill_ledger','be_data_entry_financial_v2_runtime_v58',
 'be_parcel_tariffs_v2','be_master_data_rows','be_dispatch_scans_v39',
 'be_branch_offices','be_user_account_registry',
 'be_customer_voices','be_warehouse_scan_events','be_waybill_status_events',
 'be_delivery_attempt_state_v39','be_warehouse_return_scans_v39',
 'be_wayplan_dispatch_stops','be_wayplan_dispatches','be_wayplan_membership_v40',
 'be_wayplan_review_v43','be_branch_intake_manifests_v1','be_branch_intake_parcels_v1',
 'merchant_master'
 ])
), rel_status AS (
 SELECT name,to_regclass(format('%I.%I','public',name)) IS NOT NULL AS ready
 FROM required_rel
)
SELECT 'RPC' AS kind,name,screen,ready FROM rpc_status
UNION ALL
SELECT 'RELATION',name,NULL,ready FROM rel_status
ORDER BY ready,kind,name;
