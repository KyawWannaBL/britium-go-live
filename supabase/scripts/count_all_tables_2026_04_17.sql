
SELECT 'user_profiles' as tbl, COUNT(*) as cnt FROM public.user_profiles
UNION ALL SELECT 'shipments', COUNT(*) FROM public.shipments
UNION ALL SELECT 'deliveries', COUNT(*) FROM public.deliveries
UNION ALL SELECT 'manifests', COUNT(*) FROM public.manifests
UNION ALL SELECT 'vehicles', COUNT(*) FROM public.vehicles
UNION ALL SELECT 'warehouses', COUNT(*) FROM public.warehouses
UNION ALL SELECT 'complaints', COUNT(*) FROM public.complaints
UNION ALL SELECT 'attendance', COUNT(*) FROM public.attendance
UNION ALL SELECT 'leave_requests', COUNT(*) FROM public.leave_requests
UNION ALL SELECT 'cod_collections', COUNT(*) FROM public.cod_collections
UNION ALL SELECT 'invoices', COUNT(*) FROM public.invoices;
