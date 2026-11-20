-- BRITIUM EXPRESS - UAT BASELINE INVENTORY (READ ONLY)
-- Run once on production, then once on isolated UAT. Compare outputs.
-- Does not clone parcel data, manipulate migration history or modify objects.

WITH required(object_name, category) AS (
 VALUES
 ('public.be_data_entry_parcel_details','Parcel registration'),
 ('public.be_warehouse_receipts_v36','Warehouse'),
 ('public.be_dispatch_scans_v39','Dispatch'),
 ('public.be_warehouse_return_scans_v39','Returns'),
 ('public.be_wayplan_dispatches','Wayplan'),
 ('public.be_wayplan_dispatch_stops','Wayplan'),
 ('public.be_wayplan_membership_v40','Wayplan'),
 ('public.be_wayplan_review_v43','Supervisor'),
 ('public.be_wayplan_service_locations','Location'),
 ('public.be_branch_offices','Branch'),
 ('public.be_data_entry_service_providers','Provider'),
 ('public.be_delivery_reschedules_v71','Reschedule'),
 ('public.be_data_entry_financial_v2_runtime_v58','Finance')
)
SELECT current_database() AS db_name,category,object_name,
       to_regclass(object_name) IS NOT NULL AS present
FROM required ORDER BY category,object_name;

SELECT COUNT(*) AS recorded_migrations,
       MIN(version) AS first_migration,
       MAX(version) AS last_migration
FROM supabase_migrations.schema_migrations;

SELECT n.nspname AS enum_schema,t.typname AS enum_name,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname='public' AND t.typname='app_role'
GROUP BY n.nspname,t.typname;

SELECT table_schema,table_name,column_name
FROM information_schema.columns
WHERE udt_name='app_role'
ORDER BY table_schema,table_name,column_name;

-- Schema-only extraction requires an authenticated pg_dump connection.
-- The catalog queries above do not constitute a restorable schema backup.
