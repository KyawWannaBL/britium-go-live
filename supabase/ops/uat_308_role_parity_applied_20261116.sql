-- Applied directly to isolated UAT hgijdyfwmvskchsruknp on 2026-11-16.
-- Documented idempotent reconciliation for audit/replay review, NOT for production.
-- Do not use this file as substitute for the missing 20260721093501 snapshot.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rider';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'helper';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'SYS';

-- Verify roles and branch preservation.
WITH roles AS (
 SELECT t.typname AS name,e.enumlabel AS label
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 JOIN pg_enum e ON e.enumtypid=t.oid
 WHERE n.nspname='public' AND t.typname IN ('app_role','employee_role')
)
SELECT
 (SELECT count(*) FROM roles WHERE name='app_role' AND label IN ('rider','driver','helper'))=3 AS field_role_labels_ready,
 (SELECT count(*) FROM roles WHERE name='employee_role' AND label='SYS')=1 AS sys_role_label_ready,
 (SELECT count(*) FROM roles WHERE name='employee_role' AND label='branch-office')=1 AS uat_branch_office_preserved,
 (SELECT count(*) FROM public.branches WHERE code IN ('MDY_UAT','INSEIN_UAT') AND is_active)=2 AS both_uat_branches_active;
