-- Britium Express Mandalay / Insein UAT schema and account release gate.
-- READ ONLY. Target isolated project hgijdyfwmvskchsruknp ONLY.
-- Do not execute against Production. Never substitute this audit for a full
-- clean, schema-only migration replay or verified branch RLS tests.
WITH required_objects(kind, schema_name, object_name) AS (
  VALUES
    ('table','public','be_user_account_registry'),
    ('table','public','be_branch_offices'),
    ('table','public','be_role_authority_matrix'),
    ('table','public','be_branch_intake_parcels_v1'),
    ('function','public','be_login_access_profile')
), status AS (
  SELECT kind, schema_name, object_name,
    CASE WHEN kind='table'
      THEN to_regclass(format('%I.%I',schema_name,object_name)) IS NOT NULL
      ELSE EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=schema_name AND p.proname=object_name
      )
    END AS present
  FROM required_objects
)
SELECT kind, schema_name, object_name, present FROM status ORDER BY kind,object_name;

-- All five core objects must exist before any Auth invitations.
SELECT
  (SELECT count(*) FROM auth.users) AS auth_user_count,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS public_table_count,
  EXISTS(SELECT 1 FROM pg_type WHERE typname='app_role') AS app_role_enum_exists,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS recorded_migration_count;

-- Inventory for migration dependency comparison; no table contents selected.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;

-- Do not assume an Auth user is operational. The login RPC checks registry,
-- authorized profile, branch territory, and role privileges.
-- Release remains BLOCKED while migration status is MIGRATIONS_FAILED.
