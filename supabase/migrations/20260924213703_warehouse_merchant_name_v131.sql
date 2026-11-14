-- V131: make Warehouse merchant display name resilient.
-- Resolve full merchant name from the canonical Data Entry parcel/source identity first,
-- then from the live merchant master, while keeping the 3-letter code as an internal identifier only.

create or replace function public.be_warehouse_resolve_merchant_name_v131(
  p_merchant_code text,
  p_merchant_name text,
  p_way_id text,
  p_delivery_way_id text
)
returns text
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_code text := nullif(upper(btrim(coalesce(p_merchant_code,''))),'');
  v_existing text := nullif(btrim(coalesce(p_merchant_name,'')),'');
  v_source_name text;
  v_source_code text;
  v_master_name text;
  v_way_code text;
begin
  -- Recover original/source merchant identity from the canonical Data Entry parcel
  -- using any warehouse-visible Way ID alias.
  select
    nullif(btrim(d.financial_quote->>'source_merchant_name'),''),
    nullif(upper(btrim(coalesce(d.merchant_id,''))),'')
  into v_source_name,v_source_code
  from public.be_data_entry_parcel_details d
  where
    upper(coalesce(d.delivery_way_id,'')) in (
      upper(coalesce(p_way_id,'')),
      upper(coalesce(p_delivery_way_id,''))
    )
    or upper(coalesce(d.financial_quote->>'source_waybill_no','')) in (
      upper(coalesce(p_way_id,'')),
      upper(coalesce(p_delivery_way_id,''))
    )
  order by d.updated_at desc nulls last,d.saved_at desc nulls last,d.created_at desc nulls last
  limit 1;

  -- If the original merchant name is available, it is authoritative for display.
  if v_source_name is not null and v_source_name !~ '^[A-Za-z0-9]{2,5}$' then
    return v_source_name;
  end if;

  -- Derive a merchant code from either DMMDD-CODE-NNN or PMMDD-CODE-NNN[-NNN].
  select (regexp_match(upper(coalesce(x,'')),'^[DP][0-9]{4}-([A-Z0-9]{2,5})-'))[1]
  into v_way_code
  from unnest(array[p_way_id,p_delivery_way_id]) x
  where x is not null
    and upper(x) ~ '^[DP][0-9]{4}-[A-Z0-9]{2,5}-'
  limit 1;

  if v_code is null then
    v_code := coalesce(
      v_source_code,
      v_way_code,
      case when v_existing ~ '^[A-Za-z0-9]{2,5}$' then upper(v_existing) end
    );
  end if;

  if v_code is not null then
    select nullif(btrim(m.merchant_name),'')
      into v_master_name
    from public.be_merchant_master m
    where upper(btrim(coalesce(m.merchant_code,'')))=v_code
    order by m.merchant_name
    limit 1;
  end if;

  if v_master_name is not null then
    return v_master_name;
  end if;

  -- Preserve a pre-existing full name if one was already present.
  if v_existing is not null and v_existing !~ '^[A-Za-z0-9]{2,5}$' then
    return v_existing;
  end if;

  return coalesce(v_source_name,v_existing,v_code,'');
end
$function$;

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
        public.be_warehouse_resolve_merchant_name_v131(
          e->>'merchant_code',
          e->>'merchant_name',
          coalesce(e->>'waybill_no',e->>'display_way_id',e->>'tracking_no'),
          coalesce(e->>'canonical_delivery_way_id',e->>'delivery_way_id')
        )
      )
      order by ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality t(e,ord);

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'merchant_display','FULL_NAME',
    'merchant_name_source','CANONICAL_SOURCE_THEN_LIVE_MERCHANT_MASTER_V131',
    'build','WAREHOUSE_MERCHANT_NAME_V131'
  );
end
$function$;

grant execute on function public.be_warehouse_resolve_merchant_name_v131(text,text,text,text) to authenticated;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v129() to authenticated;

comment on function public.be_warehouse_resolve_merchant_name_v131(text,text,text,text)
is 'V131: resolves Warehouse merchant display name from canonical parcel/source merchant and live merchant master; merchant codes remain internal identifiers.';

comment on function public.be_warehouse_scan_lifecycle_snapshot_v129()
is 'V131: Warehouse snapshot always enriches merchant_name to a full merchant display name whenever master/source data exists.';
