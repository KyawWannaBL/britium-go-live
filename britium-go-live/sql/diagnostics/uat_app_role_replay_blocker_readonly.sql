-- Britium Express | UAT schema replay blocker diagnostics (read-only)
-- Status 2026-11-20: Supabase branch hgijdyfwmvskchsruknp MIGRATIONS_FAILED.
-- Postgres log confirmed rebase failed on CREATE TYPE public.app_role ... already exists.
-- DO NOT DROP, RENAME, RECREATE OR FORCE MIGRATION HISTORY.
SELECT n.nspname AS enum_schema,t.typname AS enum_name,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) AS existing_labels
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname='public' AND t.typname='app_role'
GROUP BY n.nspname,t.typname;

SELECT table_schema,table_name,column_name
FROM information_schema.columns WHERE udt_name='app_role'
ORDER BY table_schema,table_name,column_name;

SELECT to_regclass('public.be_data_entry_parcel_details') IS NOT NULL AS parcel_master,
       to_regclass('public.be_warehouse_receipts_v36') IS NOT NULL AS warehouse_receipts,
       to_regclass('public.be_wayplan_dispatches') IS NOT NULL AS wayplan_dispatches,
       to_regclass('public.be_wayplan_review_v43') IS NOT NULL AS supervisor_review,
       to_regclass('public.be_provider_handover_sites_v1') IS NOT NULL AS provider_sites;

SELECT COUNT(*) AS recorded_migration_count,
       min(version) AS earliest_version,
       max(version) AS latest_version
FROM supabase_migrations.schema_migrations;

-- REQUIRED REMEDIATION:
-- (1) Reproduce in a NEW cost-approved isolated schema-only rehearsal branch.
-- (2) Fix idempotence or clean-branch migration ordering at the true replay source.
-- (3) Do not force-applying 481 missing migration versions to this existing UAT
--     or synthesize placeholder operational tables.
-- (4) Ensure the restored branch passes complete dependency and role tests
--     before installing 10_provider_transfer_install_UAT_only.sql.
