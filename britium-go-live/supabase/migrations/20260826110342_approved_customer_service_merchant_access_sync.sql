create or replace function public.be_customer_service_merchant_options()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'value',m.merchant_code,
        'label',m.merchant_name,
        'merchant_code',m.merchant_code,
        'merchant_id',m.merchant_code,
        'merchant_name',m.merchant_name,
        'phone_primary',m.phone_primary,
        'phone_secondary',m.phone_secondary,
        'address_line_1',m.address_line_1,
        'address_line_2',m.address_line_2,
        'township',m.township,
        'city',m.city,
        'default_pickup_address',m.default_pickup_address,
        'payment_terms',coalesce(nullif(m.payment_terms,''),'COD'),
        'standard_allowance_kg',m.standard_allowance_kg,
        'special_allowance_kg',m.special_allowance_kg,
        'extra_per_kg_mmk',m.extra_per_kg_mmk,
        'contract_status',m.contract_status
      )
      order by m.merchant_name,m.merchant_code
    ),
    '[]'::jsonb
  )
  from public.merchant_master m
  where coalesce(m.is_active,false)=true
    and coalesce(m.is_deleted,false)=false;
$function$;

revoke execute on function public.be_customer_service_merchant_options() from public,anon;
grant execute on function public.be_customer_service_merchant_options() to authenticated;;
