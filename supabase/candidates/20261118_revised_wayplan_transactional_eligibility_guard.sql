-- Britium Express: production-verified transactional Wayplan revision guard.
-- This guarded candidate records the live fix installed November 18, 2026.
-- It is NOT an auto-run migration while historical migration repair is pending.
-- Reapply only after confirming the target function is the expected version.
DO $patch$
DECLARE
  v_definition text;
  v_anchor text := '  -- Release the source membership/ledger inside this transaction. Any later failure rolls this back.';
  v_guard text := $guard$
  -- v323: enforce current customer reschedule / warehouse return eligibility
  -- INSIDE the replacement transaction before releasing source membership.
  IF EXISTS (
    SELECT 1 FROM unnest(v_selected_ids) AS selected(way_id)
    WHERE NOT public.be_delivery_schedule_allows_wayplan_v71(selected.way_id)
  ) THEN
    RAISE EXCEPTION 'Replacement blocked by reschedule/warehouse return hold on Way ID(s): %',
      (SELECT string_agg(selected.way_id, ', ' ORDER BY selected.way_id)
       FROM unnest(v_selected_ids) AS selected(way_id)
       WHERE NOT public.be_delivery_schedule_allows_wayplan_v71(selected.way_id));
  END IF;

$guard$;
BEGIN
  SELECT pg_get_functiondef('public.be_replace_created_wayplan_v46(jsonb)'::regprocedure)
    INTO v_definition;
  IF position('Replacement blocked by reschedule/warehouse return hold on Way ID(s)' IN v_definition) > 0 THEN
    RAISE NOTICE 'Revision transaction guard already installed';
    RETURN;
  END IF;
  IF position(v_anchor IN v_definition) = 0
     OR position('v_selected_ids:=array_append(v_selected_ids,v_id)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected revision function body; no update';
  END IF;
  EXECUTE replace(v_definition, v_anchor, v_guard || v_anchor);
END $patch$;

-- Read-only production verification:
-- SELECT position('Replacement blocked by reschedule/warehouse return hold on Way ID(s)'
-- IN pg_get_functiondef('public.be_replace_created_wayplan_v46(jsonb)'::regprocedure)) > 0 AS installed;
-- SELECT has_function_privilege('authenticated',
-- 'public.be_replace_created_wayplan_v46(jsonb)', 'EXECUTE') AS authenticated,
-- has_function_privilege('anon','public.be_replace_created_wayplan_v46(jsonb)','EXECUTE') AS anonymous;
-- Verified installed=true, authenticated=true, anonymous=false.
-- No parcel records or route statuses updated by this script.
