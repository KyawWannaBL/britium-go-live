-- Britium Express: rider delivery identity mismatch remediation.
-- Applied and verified against production 2026-11-17.
-- Keep workforce_code RID013 and aliases for login/legacy compatibility.
-- Prefer the canonical worker_code RID0013 for field-team delivery identity.
-- Safe to reapply: replaces only the exact original code-precedence block.
DO $fix$
DECLARE
  v_def text;
  v_old text := 'NULLIF(BTRIM(v_row.workforce_code), ''''),'
    || E'\r\n    ' || 'NULLIF(BTRIM(v_row.worker_code), ''''),';
  v_new text := 'NULLIF(BTRIM(v_row.worker_code), ''''),'
    || E'\r\n    ' || 'NULLIF(BTRIM(v_row.workforce_code), ''''),';
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_conflicts
  FROM public.be_mobile_workforce_accounts
  WHERE NULLIF(BTRIM(worker_code),'') IS NOT NULL
    AND NULLIF(BTRIM(workforce_code),'') IS NOT NULL
    AND upper(BTRIM(worker_code)) <> upper(BTRIM(workforce_code));
  IF v_conflicts <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canonical identity conflict; found %', v_conflicts;
  END IF;
  SELECT pg_get_functiondef('public.be_current_field_team_identity()'::regprocedure) INTO v_def;
  IF position(v_new IN v_def) > 0 AND position(v_old IN v_def) = 0 THEN
    RAISE NOTICE 'Canonical worker_code priority already installed';
    RETURN;
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Expected field-team identity resolver contract not found';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $fix$;

-- Production verification (read-only, with test-session user claim):
-- WITH session_context AS MATERIALIZED (
--   SELECT set_config('request.jwt.claim.sub',
--     '4811f755-b881-4223-8e04-af05e09e0a58', true) AS session_id
-- ) SELECT public.be_current_field_team_identity()->>'worker_code' AS resolved_code,
--          public.be_rider_delivery_wayplan_jobs_v187(100)->>'count' AS assigned_stops
-- FROM session_context;
-- Expected: RID0013, 13 (until delivery statuses change).
