
-- Find all triggers and their functions
SELECT 
  t.trigger_name,
  t.event_object_table,
  t.event_manipulation,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
FROM information_schema.triggers t
JOIN pg_proc p ON p.proname = substring(t.action_statement from 'EXECUTE FUNCTION ([^(]+)')
WHERE t.event_object_schema = 'public'
  AND t.event_object_table = 'shipments'
LIMIT 5;
