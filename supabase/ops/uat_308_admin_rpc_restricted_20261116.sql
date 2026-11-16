-- Issue #308: applied and verified in isolated UAT hgijdyfwmvskchsruknp.
-- Production must remain unchanged. This SQL records current UAT state.
-- All three functions are SECURITY DEFINER and were executable by anon/authenticated.
-- Account deletion RPC did not check the caller's admin authority.
-- Reporting RPCs did not enforce branch scope or an admin check.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_soft_delete_account(uuid)
 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_pickup_ways(integer,integer,text,text,date,date,text,text,text,text)
 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_overdue_ways_by_merchant(integer,integer,text,text,date,date,text,text)
 FROM PUBLIC, anon, authenticated;
COMMIT;

-- Post-change verification expects all three anon/auth values FALSE.
SELECT p.proname,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
AND p.proname IN ('rpc_admin_soft_delete_account','rpc_admin_pickup_ways','rpc_admin_overdue_ways_by_merchant')
ORDER BY p.proname;

-- Do not restore browser EXECUTE until role/branch checks are implemented and
-- negative tests verify that Mandalay cannot read or mutate Insein records.
