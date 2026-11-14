create or replace function public.be_warehouse_scan_lifecycle_snapshot_v164()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb := public.be_warehouse_scan_lifecycle_snapshot_v158();
  v_rows jsonb := '[]'::jsonb;
begin
  with src as (
    select e,ord,
      upper(coalesce(
        nullif(e->>'delivery_way_id',''),
        nullif(e->>'canonical_delivery_way_id',''),
        nullif(e->>'waybill_no','')
      )) as way_id
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      with ordinality t(e,ord)
  ),
  counted as (
    select s.*,
      coalesce((
        select count(*)::int
        from public.be_warehouse_return_scans_v39 r
        where upper(r.delivery_way_id)=s.way_id
      ),0) as physical_return_count
    from src s
  )
  select coalesce(jsonb_agg(
    e || jsonb_build_object(
      'return_attempt_count',physical_return_count,
      'delivery_attempts',physical_return_count,
      'next_attempt_priority',(physical_return_count between 1 and 2),
      'pending_return_attempt_no',case
        when coalesce((e->>'field_exception_pending')::boolean,false)
          then physical_return_count + 1
        else physical_return_count
      end,
      'pending_return_is_rto',(physical_return_count >= 3),
      'physical_return_scan_count',physical_return_count,
      'return_attempt_source','be_warehouse_return_scans_v39',
      'build','WAREHOUSE_SNAPSHOT_V164_PHYSICAL_RETURN_V171'
    ) order by ord
  ),'[]'::jsonb)
  into v_rows
  from counted;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'build','WAREHOUSE_SNAPSHOT_V164_PHYSICAL_RETURN_V171',
    'compat_source','be_warehouse_scan_lifecycle_snapshot_v158'
  );
end
$function$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot_v164() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v164() to authenticated,service_role;