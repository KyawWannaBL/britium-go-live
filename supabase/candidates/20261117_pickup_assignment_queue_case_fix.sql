-- Britium Express pickup assignment queue case normalization.
-- Applied to production on 2026-11-17; this guarded patch is safe to replay.
-- The existing queue returned ASSIGNED rows because its filter compared to
-- lowercase 'assigned'. Do not mutate pickup rows or relax authorizations.
DO $fix$
DECLARE
  original_definition text;
  old_filter text := 'coalesce(assignment_status, ''pending_assignment'') <> ''assigned''';
  new_filter text := 'upper(coalesce(assignment_status, ''PENDING_ASSIGNMENT'')) <> ''ASSIGNED''';
BEGIN
  SELECT pg_get_functiondef('public.be_pending_pickup_assignment_list(text,integer)'::regprocedure)
    INTO original_definition;
  IF position(new_filter IN original_definition) > 0 AND position(old_filter IN original_definition) = 0 THEN
    RAISE NOTICE 'Pickup assignment queue already normalizes assignment status';
    RETURN;
  END IF;
  IF position(old_filter IN original_definition) = 0 THEN
    RAISE EXCEPTION 'Queue function differs from expected baseline; inspect manually';
  END IF;
  EXECUTE replace(original_definition, old_filter, new_filter);
END $fix$;

-- Read-only verification:
-- SELECT jsonb_array_length(public.be_pending_pickup_assignment_list('',100)) queue_count;
-- SELECT count(*) incorrectly_assigned FROM
--   jsonb_array_elements(public.be_pending_pickup_assignment_list('',100)) q
--   WHERE upper(coalesce(q->>'assignment_status','')) = 'ASSIGNED';
-- At verification: queue count 26; incorrectly assigned count 0.
