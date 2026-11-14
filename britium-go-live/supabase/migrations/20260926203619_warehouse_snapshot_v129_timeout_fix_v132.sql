
create index if not exists be_data_entry_delivery_way_upper_v132_idx
  on public.be_data_entry_parcel_details (upper(delivery_way_id))
  where nullif(btrim(delivery_way_id),'') is not null;

create index if not exists be_merchant_master_code_upper_trim_v132_idx
  on public.be_merchant_master (upper(btrim(merchant_code)))
  where nullif(btrim(merchant_code),'') is not null;

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
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_code text := nullif(upper(btrim(coalesce(p_merchant_code,''))),'');
  v_existing text := nullif(btrim(coalesce(p_merchant_name,'')),'');
  v_source_name text;
  v_source_code text;
  v_master_name text;
  v_way_code text;
  v_way_upper text := nullif(upper(btrim(coalesce(p_way_id,''))),'');
  v_delivery_way_upper text := nullif(upper(btrim(coalesce(p_delivery_way_id,''))),'');
begin
  select
    nullif(btrim(d.financial_quote->>'source_merchant_name'),''),
    nullif(upper(btrim(coalesce(d.merchant_id,''))),'')
  into v_source_name,v_source_code
  from public.be_data_entry_parcel_details d
  where
    (
      v_way_upper is not null
      and (
        upper(d.delivery_way_id) = v_way_upper
        or upper(d.financial_quote->>'source_waybill_no') = v_way_upper
      )
    )
    or
    (
      v_delivery_way_upper is not null
      and (
        upper(d.delivery_way_id) = v_delivery_way_upper
        or upper(d.financial_quote->>'source_waybill_no') = v_delivery_way_upper
      )
    )
  order by d.updated_at desc nulls last,d.saved_at desc nulls last,d.created_at desc nulls last
  limit 1;

  if v_source_name is not null and v_source_name !~ '^[A-Za-z0-9]{2,5}$' then
    return v_source_name;
  end if;

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
    where upper(btrim(m.merchant_code)) = v_code
    order by m.merchant_name
    limit 1;
  end if;

  if v_master_name is not null then
    return v_master_name;
  end if;

  if v_existing is not null and v_existing !~ '^[A-Za-z0-9]{2,5}$' then
    return v_existing;
  end if;

  return coalesce(v_source_name,v_existing,v_code,'');
end
$function$;
