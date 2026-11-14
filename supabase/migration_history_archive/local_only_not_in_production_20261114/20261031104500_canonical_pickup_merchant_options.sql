-- Read newly created active merchants directly; do not depend on the stale projection.
-- Source of truth: public.merchant_master.

create or replace function public.be_get_merchants_dropdown()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  with active_merchants as (
    select
      coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),'')) as merchant_code,
      coalesce(
        nullif(btrim(m.merchant_name),''),
        nullif(btrim(m.business_name),''),
        nullif(btrim(m.sender_name),''),
        coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),''))
      ) as merchant_name,
      coalesce(nullif(btrim(m.business_type),''), '') as business_type,
      coalesce(nullif(btrim(m.contact_person),''), nullif(btrim(m.sender_name),''), '') as contact_person,
      coalesce(
        nullif(btrim(m.contact_phone),''),
        nullif(btrim(m.default_pickup_phone),''),
        nullif(btrim(m.sender_phone),''),
        nullif(btrim(m.phone_primary),''),
        nullif(btrim(m.phone_secondary),''),
        ''
      ) as phone,
      coalesce(
        nullif(btrim(m.default_pickup_address),''),
        nullif(btrim(m.pickup_address),''),
        nullif(btrim(m.sender_address),''),
        nullif(btrim(m.address_line_1),''),
        nullif(btrim(m.address_en),''),
        nullif(btrim(m.address_mm),''),
        ''
      ) as address,
      coalesce(nullif(btrim(m.township),''), '') as township,
      coalesce(nullif(btrim(m.city),''), '') as city,
      coalesce(nullif(btrim(m.region_state),''), nullif(btrim(m.region),''), nullif(btrim(m.city_region),''), '') as region_state,
      coalesce(nullif(btrim(m.payment_terms),''), 'COD') as payment_terms,
      coalesce(nullif(btrim(m.status),''), nullif(btrim(m.merchant_status),''), nullif(btrim(m.account_status),''), 'ACTIVE') as status,
      m.customer_tier,
      array(select distinct btrim(n) from unnest(array[m.merchant_name,m.business_name,m.sender_name])n where nullif(btrim(n),'')is not null)as search_names,
      m.business_name,m.sender_name,m.updated_at
    from public.merchant_master m
    where coalesce(m.is_active,true) and coalesce(m.active,true)
      and not coalesce(m.is_deleted,false)
      and lower(btrim(coalesce(nullif(btrim(m.status),''),nullif(btrim(m.merchant_status),''),nullif(btrim(m.account_status),''),'active')))
          in ('active','enabled')
      and coalesce(nullif(btrim(m.merchant_code),''), nullif(btrim(m.merchant_id),'')) is not null
  )
  select jsonb_build_object(
    'source','merchant_master',
    'synced',true,
    'option_count',count(*),
    'options',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'value', merchant_code,
          'label', merchant_code || ' - ' || merchant_name || case when nullif(btrim(business_name),'')is not null and btrim(business_name)<>merchant_name then ' / '||btrim(business_name)else ''end,
          'merchant_code', merchant_code,
          'merchant_name', merchant_name,
          'business_name',business_name,'sender_name',sender_name,'search_names',to_jsonb(search_names),'customer_tier',customer_tier,
          'business_type', business_type,
          'contact_person', contact_person,
          'phone', phone,
          'address', address,
          'township', township,
          'city', city,
          'region_state', region_state,
          'payment_terms', payment_terms,
          'status', status,
          'updated_at', updated_at
        )
        order by upper(merchant_name), upper(merchant_code)
      ),
      '[]'::jsonb
    )
  )
  from active_merchants;
$function$;

-- CREATE OR REPLACE retains the existing execute privileges.

-- Keep Customer Service on the same active-record rules; retain invoker/RLS semantics.
CREATE OR REPLACE FUNCTION public.be_customer_service_merchant_options()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'value',m.merchant_code,
        'label',m.merchant_name,
        'merchant_code',m.merchant_code,
        'merchant_id',m.merchant_code,
        'merchant_name',m.merchant_name,
        'business_name',m.business_name,'sender_name',m.sender_name,
        'search_names',to_jsonb(array[m.merchant_name,m.business_name,m.sender_name]),
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
  where coalesce(m.is_active,true)and coalesce(m.active,true)
    and coalesce(m.is_deleted,false)=false
    and lower(btrim(coalesce(nullif(btrim(m.status),''),nullif(btrim(m.merchant_status),''),nullif(btrim(m.account_status),''),'active')))in('active','enabled');
$function$
;
