
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('shipments', 'deliveries', 'manifests', 'vehicles', 'warehouses', 
                    'complaints', 'attendance', 'leave_requests', 'cod_collections', 
                    'invoices', 'user_profiles')
ORDER BY tablename, policyname;
