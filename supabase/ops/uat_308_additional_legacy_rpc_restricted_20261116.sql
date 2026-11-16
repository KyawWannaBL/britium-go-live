-- Issue #308: applied to isolated UAT hgijdyfwmvskchsruknp on 2026-11-16.
-- Do not apply to live production without a separate reviewed release.
-- These legacy SECURITY DEFINER functions are unsafe as client-facing RPCs:
-- 1. debug_auth returns the submitted and stored password values.
-- 2. rpc_admin_block_account lacks an admin authorization check.
-- 3. authenticate_demo_user uses legacy demonstration credential storage.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.debug_auth_2026_02_17_18_40(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_block_account(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authenticate_demo_user_2026_02_19_14_00(text,text) FROM PUBLIC, anon, authenticated;
COMMIT;

-- Expected: 3 rows, anon_exec=false, auth_exec=false.
SELECT p.proname,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
 AND p.proname IN ('debug_auth_2026_02_17_18_40','rpc_admin_block_account','authenticate_demo_user_2026_02_19_14_00')
ORDER BY p.proname;
