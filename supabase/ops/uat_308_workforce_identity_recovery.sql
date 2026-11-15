-- Issue #308: VERIFIED UAT-ONLY operational recovery script.
-- Apply only to project hgijdyfwmvskchsruknp, NOT the production project.
-- Production-derived STRUCTURE and function text only; copies zero personnel records.
-- Existing UAT has already been patched with this script on 2026-11-16.
-- Does NOT repair full Supabase migration history; retain as operational recovery note.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_mobile_workforce_accounts (
 "worker_id" text PRIMARY KEY NOT NULL,
 "full_name" text,
 "role_type" text NOT NULL,
 "phone_number" text,
 "branch_code" text DEFAULT 'YGN'::text,
 "vehicle_type" text,
 "license_plate" text,
 "status" text NOT NULL DEFAULT 'active'::text,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 "workforce_code" text NOT NULL,
 "worker_code" text,
 "account" text,
 "email" text,
 "phone" text,
 "phone_e164" text,
 "display_name" text,
 "role" text,
 "role_label" text,
 "zone" text,
 "active" boolean DEFAULT true,
 "auth_user_id" uuid,
 "metadata" jsonb DEFAULT '{}'::jsonb,
 "updated_at" timestamptz DEFAULT now(),
 "workforce_type" text,
 "be_sync_uuid" uuid DEFAULT gen_random_uuid(),
 "account_code" text,
 "assigned_zone" text,
 "employment_type" text,
 "is_active" boolean DEFAULT true,
 "aliases" jsonb DEFAULT '[]'::jsonb,
 "rider_code" text,
 "id" uuid DEFAULT gen_random_uuid(),
 "driver_code" text,
 "helper_code" text,
 "employee_code" text,
 "name" text,
 "user_email" text,
 "zone_code" text,
 "assigned_branch" text,
 "vehicle_code" text,
 "phone_primary" text
);
ALTER TABLE public.be_mobile_workforce_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_mobile_workforce_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.be_mobile_workforce_accounts TO authenticated;
DROP POLICY IF EXISTS uat_workforce_self_select_v1 ON public.be_mobile_workforce_accounts;
CREATE POLICY uat_workforce_self_select_v1
ON public.be_mobile_workforce_accounts FOR SELECT TO authenticated
USING (
 auth_user_id = (SELECT auth.uid())
 AND (
  (SELECT public.is_superadmin())
  OR EXISTS (
   SELECT 1 FROM public.branches b
   WHERE b.code = be_mobile_workforce_accounts.branch_code
     AND b.id::text = (SELECT auth.jwt()->'app_metadata'->>'branch_id')
  )
 )
);
CREATE OR REPLACE FUNCTION public.be_current_field_team_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.be_mobile_workforce_accounts%rowtype;
  v_email text;
  v_code text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION
      'Authenticated field-team session is required'
      USING errcode = '28000';
  END IF;

  SELECT w.*
  INTO v_row
  FROM public.be_mobile_workforce_accounts w
  WHERE w.auth_user_id = v_uid
    AND COALESCE(w.active, true)
    AND COALESCE(w.is_active, true)
  ORDER BY w.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Signed-in user is not mapped to an active field-team account'
      USING errcode = '42501';
  END IF;

  SELECT LOWER(u.email)
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  v_code := UPPER(COALESCE(
    NULLIF(BTRIM(v_row.workforce_code), ''),
    NULLIF(BTRIM(v_row.worker_code), ''),
    NULLIF(BTRIM(v_row.account_code), ''),
    NULLIF(BTRIM(v_row.rider_code), ''),
    NULLIF(BTRIM(v_row.driver_code), ''),
    NULLIF(BTRIM(v_row.helper_code), '')
  ));

  IF v_code IS NULL THEN
    RAISE EXCEPTION
      'Field-team account has no canonical workforce code'
      USING errcode = '22023';
  END IF;

  v_role := CASE
    WHEN v_code LIKE 'DRV%' THEN 'driver'
    WHEN v_code LIKE 'HLP%' THEN 'helper'
    WHEN v_code LIKE 'RID%' THEN 'rider'
    WHEN UPPER(COALESCE(v_row.role, '')) LIKE '%DRIVER%'
      THEN 'driver'
    WHEN UPPER(COALESCE(v_row.role, '')) LIKE '%HELPER%'
      THEN 'helper'
    ELSE 'rider'
  END;

  RETURN jsonb_build_object(
    'auth_user_id', v_uid,
    'worker_code', v_code,
    'role', v_role,
    'email', COALESCE(
      v_email,
      LOWER(COALESCE(v_row.email, v_row.user_email))
    ),
    'display_name', COALESCE(
      NULLIF(BTRIM(v_row.display_name), ''),
      NULLIF(BTRIM(v_row.name), ''),
      v_code
    ),
    'branch_code', NULLIF(BTRIM(v_row.branch_code), ''),
    'assigned_zone', NULLIF(BTRIM(v_row.assigned_zone), '')
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.be_current_field_team_identity()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_current_field_team_identity()
TO authenticated;
COMMIT;

-- Read-only verification:
SELECT to_regclass('public.be_mobile_workforce_accounts') AS workforce_table,
       to_regprocedure('public.be_current_field_team_identity()') AS identity_function,
       has_function_privilege('anon','public.be_current_field_team_identity()','EXECUTE') AS anonymous_execute,
       has_function_privilege('authenticated','public.be_current_field_team_identity()','EXECUTE') AS authenticated_execute;
