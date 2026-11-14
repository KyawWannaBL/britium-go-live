create or replace function public.be_warehouse_scan_lifecycle_snapshot_v164()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_result jsonb;
begin
  v_result := public.be_warehouse_scan_lifecycle_snapshot_v158();
  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'build','WAREHOUSE_SNAPSHOT_V164_COMPAT',
    'compat_source','be_warehouse_scan_lifecycle_snapshot_v158'
  );
end
$function$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot_v164() from public, anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v164() to authenticated, service_role;