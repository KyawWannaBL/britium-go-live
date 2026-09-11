
SELECT 
  tg.tgname as trigger_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_body
FROM pg_trigger tg
JOIN pg_class c ON tg.tgrelid = c.oid
JOIN pg_proc p ON tg.tgfoid = p.oid
WHERE c.relname = 'shipments'
  AND NOT tg.tgisinternal;
