-- Source-verified original field-team resolver required before 20260830094500.
-- No anonymous access; uses actual authenticated user ID and active workforce binding.
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

revoke all on function public.be_current_field_team_identity() from public, anon;
grant execute on function public.be_current_field_team_identity() to authenticated, service_role;
do $verify$
begin
 if has_function_privilege('anon','public.be_current_field_team_identity()','EXECUTE') then
  raise exception 'ANONYMOUS_FIELD_IDENTITY_ACCESS_FORBIDDEN';
 end if;
end $verify$;
