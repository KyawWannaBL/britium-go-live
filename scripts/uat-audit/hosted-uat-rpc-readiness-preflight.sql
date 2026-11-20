-- Britium Express: read-only hosted-UAT preflight (DO NOT deploy as migration)
-- Run only in the hosted-UAT SQL Editor; no writes, no confidential data output.
WITH required(kind,schema_name,object_name,area) AS (
 VALUES
 ('function','public','be_dispatch_command_snapshot_v63','Dispatch'),
 ('function','public','be_dashboard_kpi_today','Dashboard'),
 ('function','public','be_dashboard_trend_7d','Dashboard'),
 ('function','public','be_dispatch_workforce','Dispatch'),
 ('function','public','be_dispatch_unassigned','Dispatch'),
 ('function','public','be_master_data_snapshot','Master Data'),
 ('function','public','be_master_data_upsert_row','Master Data'),
 ('function','public','be_settings_get_tariff','Settings'),
 ('function','public','be_settings_update_tariff','Settings'),
 ('function','public','be_branch_warehouse_scope_v1','Warehouse Auth'),
 ('function','public','be_branch_wayplan_allowed_v1','Wayplan Auth'),
 ('function','public','be_operational_way_id_v70','Waybill'),
 ('table','public','be_wayplan_dispatches','Dispatch'),
 ('table','public','be_wayplan_dispatch_stops','Dispatch'),
 ('table','public','be_wayplan_review_v43','Wayplan'),
 ('table','public','be_wayplan_membership_v40','Wayplan'),
 ('table','public','be_dispatch_scans_v39','Warehouse'),
 ('table','public','be_data_entry_parcel_details','Data Entry'),
 ('table','public','be_user_account_registry','Preserve Accounts'),
 ('table','private','uat_branch_account_roster_20261116','Preserve Branch Roster')
),
checked AS (
 SELECT area,kind,schema_name,object_name,
 CASE WHEN kind='function' THEN EXISTS (
 SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname=schema_name AND p.proname=object_name
 ) ELSE to_regclass(format('%I.%I',schema_name,object_name)) IS NOT NULL END AS exists_in_uat
 FROM required
)
SELECT area,kind,format('%I.%I',schema_name,object_name) AS object,exists_in_uat
FROM checked ORDER BY area,kind,object;

-- Overall function footprint, counting overloads separately.
SELECT n.nspname AS schema_name,
       count(*) FILTER(WHERE p.proname LIKE 'be\_%' ESCAPE '\') AS be_function_overloads,
       count(*) FILTER(WHERE p.proname LIKE 'rpc\_%' ESCAPE '\') AS rpc_function_overloads
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private')
GROUP BY n.nspname ORDER BY n.nspname;

-- Preservation baseline. Do not publish user identities or email addresses.
SELECT (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.be_user_account_registry) AS account_registry,
       (SELECT count(*) FROM private.uat_branch_account_roster_20261116) AS branch_roster;
