-- V78.1: Pickup Request merchant dropdown synchronized with canonical active Merchant Master.
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
      m.updated_at
    from public.merchant_master m
    where coalesce(m.is_active,m.active,true)
      and not coalesce(m.is_deleted,false)
      and lower(coalesce(nullif(m.status,''),nullif(m.merchant_status,''),nullif(m.account_status,''),'active'))
          not in ('inactive','disabled','deleted')
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
          'label', merchant_code || ' - ' || merchant_name,
          'merchant_code', merchant_code,
          'merchant_name', merchant_name,
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

grant execute on function public.be_get_merchants_dropdown() to authenticated;
