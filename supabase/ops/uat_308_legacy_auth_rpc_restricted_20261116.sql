-- Issue #308: already-applied isolated UAT function ACL correction, 2026-11-16.
-- Target: hgijdyfwmvskchsruknp only. NEVER run against production by default.
-- Risk identified from pg_get_functiondef(): no caller authorization checks.
-- The legacy create_managed_user writes directly to auth.users.
-- The legacy change_user_password_2026_02_17_18_40 updates the password field
-- for an arbitrary user_id without checking auth.uid().
BEGIN;
REVOKE EXECUTE ON FUNCTION public.create_managed_user(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_user_password_2026_02_17_18_40(uuid,text)
  FROM PUBLIC, anon, authenticated;
COMMIT;
-- Verification: expect two rows, false for each grant check.
SELECT p.proname,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
AND p.proname IN ('create_managed_user','change_user_password_2026_02_17_18_40')
ORDER BY p.proname;

-- Use supported Supabase Auth Admin APIs for account creation/password changes.
-- Avoid re-granting these procedures without full security review.
