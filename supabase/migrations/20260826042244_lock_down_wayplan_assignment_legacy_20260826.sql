-- Idempotent, fail-closed legacy RPC access revocation.
-- A missing legacy function has no executable surface; an existing one must be denied.
DO $legacy_revoke$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.be_wayplan_assignment_options_v44_legacy_20260826()');
BEGIN
  IF v_rpc IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.be_wayplan_assignment_options_v44_legacy_20260826()
      FROM PUBLIC, anon, authenticated;
    IF has_function_privilege('anon', v_rpc, 'EXECUTE')
       OR has_function_privilege('authenticated', v_rpc, 'EXECUTE') THEN
      RAISE EXCEPTION 'LEGACY_WAYPLAN_RPC_STILL_EXPOSED';
    END IF;
  END IF;
END $legacy_revoke$;
