-- V78: Pickup Request merchant dropdown is synchronized with live Merchant Master.
-- Source of truth: public.be_v_master_merchants (same merchant_master dataset used by Master Data).

create or replace function public.be_get_merchants_dropdown()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select jsonb_build_object(
    'source', 'be_v_master_merchants',
    'synced', true,
    'options', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'value', m.merchant_code,
          'label', m.merchant_code || ' - ' || coalesce(nullif(m.merchant_name,''), m.merchant_code),
          'merchant_code', m.merchant_code,
          'merchant_name', coalesce(nullif(m.merchant_name,''), m.merchant_code),
          'business_type', coalesce(m.business_type,''),
          'contact_person', coalesce(m.contact_person,''),
          'phone', coalesce(nullif(m.phone_primary,''), nullif(m.phone_secondary,''), ''),
          'address', coalesce(m.address_line_1,''),
          'township', coalesce(m.township,''),
          'city', coalesce(m.city,''),
          'region_state', coalesce(m.region_state,''),
          'payment_terms', coalesce(nullif(m.payment_terms,''), 'COD'),
          'status', coalesce(m.status,'ACTIVE'),
          'updated_at', m.updated_at
        )
        order by upper(coalesce(m.merchant_name,'')), upper(m.merchant_code)
      ),
      '[]'::jsonb
    )
  )
  from public.be_v_master_merchants m
  where nullif(btrim(m.merchant_code),'') is not null
    and lower(coalesce(nullif(m.status,''),'active')) in ('active','enabled');
$function$;

grant execute on function public.be_get_merchants_dropdown() to authenticated;
