
create or replace function public.be_warehouse_scan_lifecycle_snapshot_v129()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $function$
declare
  v_base jsonb := public.be_warehouse_scan_lifecycle_snapshot_v92();
  v_rows jsonb := '[]'::jsonb;
begin
  with detail_keys as materialized (
    select
      nullif(upper(btrim(d.delivery_way_id)),'') as key_upper,
      nullif(btrim(d.financial_quote->>'source_merchant_name'),'') as source_name,
      nullif(upper(btrim(d.merchant_id)),'') as source_code,
      d.updated_at,
      d.saved_at,
      d.created_at
    from public.be_data_entry_parcel_details d
    where nullif(btrim(d.delivery_way_id),'') is not null

    union all

    select
      nullif(upper(btrim(d.financial_quote->>'source_waybill_no')),'') as key_upper,
      nullif(btrim(d.financial_quote->>'source_merchant_name'),'') as source_name,
      nullif(upper(btrim(d.merchant_id)),'') as source_code,
      d.updated_at,
      d.saved_at,
      d.created_at
    from public.be_data_entry_parcel_details d
    where nullif(btrim(d.financial_quote->>'source_waybill_no'),'') is not null
  ),
  detail_latest as materialized (
    select distinct on (key_upper)
      key_upper,
      source_name,
      source_code,
      updated_at,
      saved_at,
      created_at
    from detail_keys
    where key_upper is not null
    order by
      key_upper,
      updated_at desc nulls last,
      saved_at desc nulls last,
      created_at desc nulls last
  ),
  merchant_master as materialized (
    select distinct on (code_upper)
      code_upper,
      merchant_name
    from (
      select
        nullif(upper(btrim(m.merchant_code)),'') as code_upper,
        nullif(btrim(m.merchant_name),'') as merchant_name
      from public.be_merchant_master m
    ) x
    where code_upper is not null
      and merchant_name is not null
    order by code_upper, merchant_name
  ),
  rows_src as (
    select
      e,
      ord,
      nullif(upper(btrim(coalesce(
        e->>'waybill_no',
        e->>'display_way_id',
        e->>'tracking_no'
      ))),'') as way_upper,
      nullif(upper(btrim(coalesce(
        e->>'canonical_delivery_way_id',
        e->>'delivery_way_id'
      ))),'') as delivery_upper,
      nullif(upper(btrim(coalesce(e->>'merchant_code',''))),'') as merchant_code_upper,
      nullif(btrim(coalesce(e->>'merchant_name','')),'') as existing_name,
      coalesce(
        substring(upper(coalesce(
          e->>'waybill_no',
          e->>'display_way_id',
          e->>'tracking_no',
          ''
        )) from '^[DP][0-9]{4}-([A-Z0-9]{2,5})-'),
        substring(upper(coalesce(
          e->>'canonical_delivery_way_id',
          e->>'delivery_way_id',
          ''
        )) from '^[DP][0-9]{4}-([A-Z0-9]{2,5})-')
      ) as way_code
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      with ordinality t(e,ord)
  ),
  resolved as (
    select
      r.*,
      chosen.source_name,
      chosen.source_code,
      coalesce(
        r.merchant_code_upper,
        chosen.source_code,
        r.way_code,
        case
          when r.existing_name ~ '^[A-Za-z0-9]{2,5}$'
            then upper(r.existing_name)
        end
      ) as resolved_code
    from rows_src r
    left join detail_latest d1 on d1.key_upper = r.way_upper
    left join detail_latest d2 on d2.key_upper = r.delivery_upper
    left join lateral (
      select x.source_name, x.source_code
      from (
        values
          (d1.source_name, d1.source_code, d1.updated_at, d1.saved_at, d1.created_at),
          (d2.source_name, d2.source_code, d2.updated_at, d2.saved_at, d2.created_at)
      ) as x(source_name, source_code, updated_at, saved_at, created_at)
      where x.source_name is not null
         or x.source_code is not null
         or x.updated_at is not null
         or x.saved_at is not null
         or x.created_at is not null
      order by
        x.updated_at desc nulls last,
        x.saved_at desc nulls last,
        x.created_at desc nulls last
      limit 1
    ) chosen on true
  )
  select coalesce(
    jsonb_agg(
      r.e ||
      jsonb_build_object(
        'merchant_name',
        case
          when r.source_name is not null
            and r.source_name !~ '^[A-Za-z0-9]{2,5}$'
            then r.source_name
          when mm.merchant_name is not null
            then mm.merchant_name
          when r.existing_name is not null
            and r.existing_name !~ '^[A-Za-z0-9]{2,5}$'
            then r.existing_name
          else coalesce(r.source_name, r.existing_name, r.resolved_code, '')
        end
      )
      order by r.ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from resolved r
  left join merchant_master mm
    on mm.code_upper = r.resolved_code;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'merchant_display','FULL_NAME',
    'merchant_name_source','SET_BASED_CANONICAL_SOURCE_THEN_LIVE_MERCHANT_MASTER_V133',
    'build','WAREHOUSE_MERCHANT_NAME_V133'
  );
end
$function$;
