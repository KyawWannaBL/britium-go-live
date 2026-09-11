
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('warehouses','vehicles','shipments','manifests','complaints','attendance','leave_requests','cod_collections','invoices')
ORDER BY table_name, ordinal_position;
