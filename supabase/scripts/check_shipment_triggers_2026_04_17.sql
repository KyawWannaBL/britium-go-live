
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'shipments'
  AND event_object_schema = 'public';

SELECT table_name 
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%supply%';
