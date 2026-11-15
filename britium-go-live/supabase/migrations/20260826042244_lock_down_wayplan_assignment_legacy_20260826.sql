-- Harden the legacy wayplan RPC only if it exists in this schema baseline.
-- Fresh UAT snapshot builds may not contain this deprecated function.
DO $$
BEGIN
  IF to_regprocedure('public.be_wayplan_assignment_options_v44_legacy_20260826()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.be_wayplan_assignment_options_v44_legacy_20260826()
      FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;
