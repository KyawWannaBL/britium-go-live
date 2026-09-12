-- Warehouse must show the same business-facing Way ID used by Wayplan Command.
-- Keep delivery_way_id as the canonical internal parcel key, but expose the
-- imported/source waybill number as the visible waybill/display ID.

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_raw jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_raw := public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();

  select coalesce(
    jsonb_agg(
      t.e || jsonb_build_object(
        'canonical_delivery_way_id', t.e->>'delivery_way_id',
        'source_waybill_no', coalesce(
          src.source_waybill_no,
          nullif(t.e->>'waybill_no',''),
          t.e->>'delivery_way_id'
        ),
        'display_way_id', coalesce(
          src.source_waybill_no,
          nullif(t.e->>'waybill_no',''),
          t.e->>'delivery_way_id'
        ),
        'waybill_no', coalesce(
          src.source_waybill_no,
          nullif(t.e->>'waybill_no',''),
          t.e->>'delivery_way_id'
        )
      )
      order by t.ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) with ordinality as t(e,ord)
  left join lateral (
    select nullif(d.financial_quote->>'source_waybill_no','') as source_waybill_no
    from public.be_data_entry_parcel_details d
    where d.delivery_way_id = t.e->>'delivery_way_id'
    order by d.updated_at desc nulls last, d.saved_at desc nulls last
    limit 1
  ) src on true
  where not public.be_is_pre_golive_uat_key_v1(t.e->>'delivery_way_id');

  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null
      or upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY')),
    'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
    'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
    'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
    'rto',count(*) filter(where nullif(e->>'rto_at','') is not null or upper(coalesce(e->>'delivery_status',''))='RTO')
  ) into v_stats
  from jsonb_array_elements(v_rows) e;

  return v_raw || jsonb_build_object(
    'rows',v_rows,
    'stats',v_stats,
    'active_scope','POST_GOLIVE_ONLY',
    'pre_golive_uat_isolated',true,
    'way_id_display','SOURCE_WAYBILL'
  );
end;
$function$;
