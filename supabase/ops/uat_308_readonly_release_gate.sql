-- Issue #308: isolated UAT read-only go/no-go gate. No DDL or writes.
-- Verify you are connected to hgijdyfwmvskchsruknp before running.
WITH facts AS (
 SELECT
  (SELECT count(*) FROM public.branches WHERE code IN ('MDY_UAT','INSEIN_UAT') AND is_active) AS active_uat_branches,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migration_count,
  (SELECT count(*) FROM auth.users) AS auth_user_count,
  to_regclass('public.be_portal_pickup_requests') IS NOT NULL AS canonical_pickups_present,
  to_regclass('public.be_data_entry_parcels') IS NOT NULL AS canonical_parcels_present,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260721093501') AS snapshot_version_recorded
)
SELECT *,
 (active_uat_branches=2 AND snapshot_version_recorded AND canonical_pickups_present AND canonical_parcels_present) AS minimal_schema_gate,
 (active_uat_branches=2 AND snapshot_version_recorded AND canonical_pickups_present AND canonical_parcels_present AND auth_user_count>=16) AS staff_provisioning_gate
FROM facts;
