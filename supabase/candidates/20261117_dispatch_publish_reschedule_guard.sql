-- Britium Express 2026-11-17 verified production repair.
-- Prevent publication of a Supervisor-approved Wayplan with late-arriving
-- reschedule/warehouse return holds even if membership remains READY.
-- This is a guarded, repeatable candidate patch, NOT an auto-run migration.
DO $fix$
DECLARE
  v_def text;
  v_anchor text := '  v_result := public.be_dispatch_publish_wayplan_v41(v_wayplan, v_actor);';
  v_insert text := $guard$
  -- Recheck all actual stops just before publication. The existing
  -- membership, scanning, branch scope, and supervisor guards still apply.
  IF EXISTS (
    SELECT 1 FROM public.be_wayplan_dispatch_stops s
    WHERE s.wayplan_id = v_wayplan
      AND NOT public.be_delivery_schedule_allows_wayplan_v71(s.delivery_way_id)
  ) THEN
    RAISE EXCEPTION 'Publish blocked: customer reschedule/warehouse return hold on Way ID(s): %',
      (
        SELECT string_agg(s.delivery_way_id, ', ' ORDER BY s.delivery_way_id)
        FROM public.be_wayplan_dispatch_stops s
        WHERE s.wayplan_id = v_wayplan
          AND NOT public.be_delivery_schedule_allows_wayplan_v71(s.delivery_way_id)
      );
  END IF;

$guard$;
BEGIN
  SELECT pg_get_functiondef('public.be_dispatch_publish_wayplan_v43(text,text)'::regprocedure)
  INTO v_def;
  IF position('Publish blocked: customer reschedule/warehouse return hold on Way ID(s)' IN v_def) > 0 THEN
    RAISE NOTICE 'Dispatch reschedule guard already installed';
    RETURN;
  END IF;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected dispatch publish implementation; no change made';
  END IF;
  EXECUTE replace(v_def,v_anchor,v_insert || v_anchor);
END $fix$;

-- Read-only verification:
-- SELECT position('Publish blocked: customer reschedule/warehouse return hold on Way ID(s)'
-- IN pg_get_functiondef('public.be_dispatch_publish_wayplan_v43(text,text)'::regprocedure))>0 installed;
-- SELECT w.wayplan_id, string_agg(s.delivery_way_id, ', ') FILTER
-- (WHERE NOT public.be_delivery_schedule_allows_wayplan_v71(s.delivery_way_id)) held_ids
-- FROM public.be_wayplan_dispatches w JOIN public.be_wayplan_dispatch_stops s USING(wayplan_id)
-- WHERE w.wayplan_status='CREATED' GROUP BY w.wayplan_id;
-- Confirmed 3 held stops on Nov 13 bicycle Wayplan, 0 on Nov 10 van.
