
SELECT 
  t.table_name,
  COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name), 0) AS approx_rows
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
