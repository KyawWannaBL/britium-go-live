-- Britium Express: Isolated Mandalay / Insein UAT Auth linking
-- Run ONLY in Supabase project hgijdyfwmvskchsruknp, never production.
-- FIRST create users with Supabase Auth Admin API / Authentication Users dashboard.
-- Assign raw_app_meta_data (server-controlled, NOT user_metadata):
-- {"uat_approved":true, "branch_id":"<UAT branch UUID>",
--  "uat_role":"branch-office"|"supervisor"|"data-entry"|"warehouse-staff"|"rider"|"driver"|"helper",
--  "worker_code":"RIDUAT001"} (worker_code required for rider/driver/helper).
-- Auth account creation and app_metadata updates must happen via supported Admin API.
-- This script NEVER inserts into or modifies auth.users.

BEGIN;

DO $validate$
DECLARE n_bad integer;
BEGIN
  IF (SELECT COUNT(*) FROM public.branches
      WHERE code IN ('MDY_UAT','INSEIN_UAT')) <> 2 THEN
    RAISE EXCEPTION 'Expected both UAT branch records';
  END IF;

  SELECT COUNT(*) INTO n_bad
  FROM auth.users a
  JOIN public.branches b
    ON (a.raw_app_meta_data ->> 'branch_id') = b.id::text
  WHERE b.code IN ('MDY_UAT','INSEIN_UAT')
    AND (a.raw_app_meta_data ->> 'uat_approved') = 'true'
    AND (
      a.email IS NULL
      OR COALESCE(a.raw_app_meta_data ->> 'uat_role','') NOT IN
         ('branch-office','supervisor','data-entry','warehouse-staff','finance','rider','driver','helper')
      OR (
        (a.raw_app_meta_data ->> 'uat_role') IN ('rider','driver','helper')
        AND COALESCE(NULLIF(BTRIM(a.raw_app_meta_data ->> 'worker_code'),''),'') = ''
      )
    );
  IF n_bad > 0 THEN
    RAISE EXCEPTION 'Invalid UAT approved Auth user metadata; count %',n_bad;
  END IF;
END $validate$;

WITH eligible AS (
  SELECT a.id, LOWER(a.email) AS email,
    b.id AS branch_id,
    COALESCE(NULLIF(a.raw_app_meta_data ->> 'display_name',''),a.email) AS display_name,
    -- Helpers must not inherit branch management privileges. They remain
    -- 'helper' in the workforce registry, with restrictive portal profile
    -- until an explicit employee_role + RLS policy has been reviewed.
    CASE WHEN a.raw_app_meta_data ->> 'uat_role' = 'helper'
      THEN 'customer'
      ELSE a.raw_app_meta_data ->> 'uat_role' END::public.employee_role AS employee_role
  FROM auth.users a
  JOIN public.branches b
    ON (a.raw_app_meta_data ->> 'branch_id') = b.id::text
  WHERE b.code IN ('MDY_UAT','INSEIN_UAT')
    AND (a.raw_app_meta_data ->> 'uat_approved') = 'true'
    AND (a.raw_app_meta_data ->> 'uat_role') IN
      ('branch-office','supervisor','data-entry','warehouse-staff','finance','rider','driver','helper')
)
INSERT INTO public.user_profiles(id,email,full_name,role,branch_id,is_active)
SELECT id,email,display_name,employee_role,branch_id,true FROM eligible
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  branch_id = EXCLUDED.branch_id,
  is_active = true,
  updated_at = now()
WHERE public.user_profiles.branch_id IN (
  SELECT id FROM public.branches WHERE code IN ('MDY_UAT','INSEIN_UAT')
);

WITH eligible AS (
 SELECT a.id, lower(a.email) email,
    b.code AS branch_code,
    lower(a.raw_app_meta_data ->> 'uat_role') role_type,
    upper(btrim(a.raw_app_meta_data ->> 'worker_code')) worker_code,
    COALESCE(NULLIF(a.raw_app_meta_data ->> 'display_name',''),a.email) display_name
 FROM auth.users a
 JOIN public.branches b ON (a.raw_app_meta_data ->> 'branch_id')=b.id::text
 WHERE b.code IN ('MDY_UAT','INSEIN_UAT')
   AND a.raw_app_meta_data ->> 'uat_approved'='true'
   AND a.raw_app_meta_data ->> 'uat_role' IN ('rider','driver','helper')
   AND NULLIF(btrim(a.raw_app_meta_data ->> 'worker_code'),'') IS NOT NULL
)
INSERT INTO public.be_mobile_workforce_accounts
(worker_id,workforce_code,worker_code,role_type,role,branch_code,
 auth_user_id,email,display_name,full_name,active,is_active,updated_at)
SELECT
  'UAT_' || replace(id::text,'-',''),
  worker_code,worker_code,role_type,role_type,branch_code,
  id,email,display_name,display_name,true,true,now()
FROM eligible
ON CONFLICT (worker_id) DO UPDATE SET
  workforce_code = EXCLUDED.workforce_code,
  worker_code = EXCLUDED.worker_code,
  role_type = EXCLUDED.role_type,
  role = EXCLUDED.role,
  branch_code = EXCLUDED.branch_code,
  auth_user_id = EXCLUDED.auth_user_id,
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  active = true,
  is_active = true,
  updated_at = now();

COMMIT;

-- Read-only post-link inspection:
SELECT b.code AS branch_code,
       COUNT(DISTINCT a.id) AS approved_auth_users,
       COUNT(DISTINCT up.id) AS linked_profiles,
       COUNT(DISTINCT w.auth_user_id) AS linked_field_workers
FROM public.branches b
LEFT JOIN auth.users a
 ON a.raw_app_meta_data ->> 'branch_id'=b.id::text
 AND a.raw_app_meta_data ->> 'uat_approved'='true'
LEFT JOIN public.user_profiles up ON up.id=a.id
LEFT JOIN public.be_mobile_workforce_accounts w ON w.auth_user_id=a.id
WHERE b.code IN ('MDY_UAT','INSEIN_UAT')
GROUP BY b.code ORDER BY b.code;
