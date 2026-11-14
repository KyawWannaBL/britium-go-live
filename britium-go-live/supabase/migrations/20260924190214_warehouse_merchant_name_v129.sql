-- V129: enrich Warehouse lifecycle rows with full merchant names.
-- Prefer the original parcel source merchant name when available; otherwise use live merchant master by code.

create or replace function public.be_warehouse_scan_lifecycle_snapshot_v129()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb := public.be_warehouse_scan_lifecycle_snapshot_v92();
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      e
      || jsonb_build_object(
        'merchant_name',
        coalesce(
          nullif(btrim(src.source_merchant_name),''),
          nullif(btrim(mm.merchant_name),''),
          nullif(btrim(e->>'merchant_name'),''),
          nullif(btrim(e->>'merchant_code'),'')
        )
      )
      order by ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality t(e,ord)
  left join lateral (
    select nullif(btrim(d.financial_quote->>'source_merchant_name'),'') as source_merchant_name
    from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=upper(coalesce(e->>'canonical_delivery_way_id',e->>'delivery_way_id',''))
    order by d.updated_at desc nulls last,d.saved_at desc nulls last,d.created_at desc nulls last
    limit 1
  ) src on true
  left join lateral (
    select m.merchant_name
    from public.be_merchant_master m
    where upper(btrim(m.merchant_code))=upper(btrim(coalesce(e->>'merchant_code','')))
    order by m.merchant_name
    limit 1
  ) mm on true;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'merchant_display','FULL_NAME',
    'merchant_name_source','SOURCE_PARCEL_THEN_MERCHANT_MASTER',
    'build','WAREHOUSE_MERCHANT_NAME_V129'
  );
end
$function$;

grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v129() to authenticated;

comment on function public.be_warehouse_scan_lifecycle_snapshot_v129()
is 'V129: Warehouse Queue rows expose full merchant_name while retaining merchant_code internally.';
