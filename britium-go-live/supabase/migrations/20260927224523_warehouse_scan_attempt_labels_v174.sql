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
  scan_state as (
    select s.*,
      coalesce((
        select count(*)::int
        from public.be_warehouse_return_scans_v39 r
        where upper(r.delivery_way_id)=s.way_id
      ),0) as physical_return_count,
      (
        select max(r.scanned_at)
        from public.be_warehouse_return_scans_v39 r
        where upper(r.delivery_way_id)=s.way_id
      ) as last_return_scan_at,
      (
        select max(d.scanned_at)
        from public.be_dispatch_scans_v39 d
        where upper(d.delivery_way_id)=s.way_id
          and d.scan_status='SCANNED'
      ) as last_dispatch_scan_at
    from src s
  ),
  labelled as (
    select ss.*,
      case
        when last_dispatch_scan_at is not null
         and (last_return_scan_at is null or last_dispatch_scan_at > last_return_scan_at)
          then physical_return_count + 1
        when physical_return_count > 0 then physical_return_count
        else case when last_dispatch_scan_at is not null then 1 else 0 end
      end as dispatch_attempt_no,
      case
        when last_dispatch_scan_at is not null
         and (last_return_scan_at is null or last_dispatch_scan_at > last_return_scan_at)
          then 'DISPATCH'
        when last_return_scan_at is not null then 'RETURN'
        else 'NONE'
      end as latest_scan_kind
    from scan_state ss
  )
  select coalesce(jsonb_agg(
    e || jsonb_build_object(
      'return_attempt_count',physical_return_count,
      'delivery_attempts',physical_return_count,
      'next_attempt_priority',(physical_return_count between 1 and 2),
      'pending_return_attempt_no',case
        when coalesce((e->>'field_exception_pending')::boolean,false)
          then least(physical_return_count + 1,3)
        else physical_return_count
      end,
      'pending_return_is_rto',(physical_return_count >= 3),
      'physical_return_scan_count',physical_return_count,
      'dispatch_scan_attempt_no',dispatch_attempt_no,
      'return_scan_attempt_no',physical_return_count,
      'dispatch_scan_label',case
        when dispatch_attempt_no > 0 then format('Dispatch Scan (%s)',dispatch_attempt_no)
        else null
      end,
      'return_scan_label',case
        when physical_return_count = 0 then null
        when physical_return_count >= 3 then 'Return Scan (3) / RTO'
        else format('Return Scan (%s)',physical_return_count)
      end,
      'latest_scan_kind',latest_scan_kind,
      'latest_scan_label',case
        when latest_scan_kind='DISPATCH' then format('Dispatch Scan (%s)',dispatch_attempt_no)
        when latest_scan_kind='RETURN' and physical_return_count>=3 then 'Return Scan (3) / RTO'
        when latest_scan_kind='RETURN' then format('Return Scan (%s)',physical_return_count)
        else 'Not Scanned'
      end,
      'last_dispatch_scan_at',last_dispatch_scan_at,
      'last_return_scan_at',last_return_scan_at,
      'return_attempt_source','be_warehouse_return_scans_v39',
      'dispatch_attempt_source','return_scan_count_plus_fresh_dispatch',
      'build','WAREHOUSE_SCAN_ATTEMPT_LABELS_V174'
    ) order by ord
  ),'[]'::jsonb)
  into v_rows
  from labelled;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'build','WAREHOUSE_SCAN_ATTEMPT_LABELS_V174',
    'compat_source','be_warehouse_scan_lifecycle_snapshot_v158'
  );
end
$function$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot_v164() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v164() to authenticated,service_role;