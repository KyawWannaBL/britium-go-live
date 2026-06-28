-- Customer Service merchant pickup-address auto-fill fix.
-- No mock/sample operational rows.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists source text,
  add column if not exists requester_type text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists city_region text,
  add column if not exists branch_code text,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists status text default 'DATA_ENTRY_IN_PROGRESS',
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text,
  add column if not exists priority text default 'Normal',
  add column if not exists special_instructions text,
  add column if not exists pickup_date text,
  add column if not exists pickup_time text,
  add column if not exists updated_at timestamptz default now();

create or replace function public.be_text_from_jsonb(p_row jsonb, p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v jsonb;
  out_text text;
begin
  foreach k in array p_keys loop
    if p_row ? k then
      v := p_row -> k;
      if jsonb_typeof(v) = 'string' then
        out_text := p_row ->> k;
      elsif jsonb_typeof(v) = 'object' then
        out_text := concat_ws(', ',
          nullif(v ->> 'line1', ''),
          nullif(v ->> 'line_1', ''),
          nullif(v ->> 'address1', ''),
          nullif(v ->> 'address_1', ''),
          nullif(v ->> 'street', ''),
          nullif(v ->> 'street_address', ''),
          nullif(v ->> 'ward', ''),
          nullif(v ->> 'landmark', ''),
          nullif(v ->> 'township', ''),
          nullif(v ->> 'city', ''),
          nullif(v ->> 'region', '')
        );
      else
        out_text := p_row ->> k;
      end if;

      if nullif(trim(coalesce(out_text, '')), '') is not null then
        return trim(out_text);
      end if;
    end if;
  end loop;

  return '';
end;
$$;

drop function if exists public.be_customer_service_merchant_options(integer);

create or replace function public.be_customer_service_merchant_options(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
as $$
declare
  tbl text;
  sql text;
  result jsonb;
begin
  foreach tbl in array array[
    'merchant_master',
    'merchants',
    'merchant_profiles',
    'customer_master',
    'customers',
    'master_merchants'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      sql := format($q$
        select coalesce(jsonb_agg(x order by x->>'merchant_name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'id', public.be_text_from_jsonb(to_jsonb(m), array['id','merchant_id','merchantId','merchant_code','code']),
            'merchant_code', public.be_text_from_jsonb(to_jsonb(m), array['merchant_code','merchantCode','customer_code','client_code','code','merchant_id','merchantId','id']),
            'merchant_name', public.be_text_from_jsonb(to_jsonb(m), array['merchant_name','merchantName','business_name','businessName','customer_name','shop_name','store_name','name','sender_name']),
            'sender_name', public.be_text_from_jsonb(to_jsonb(m), array['sender_name','senderName','contact_person','contactPerson','owner_name','ownerName','primary_contact_name','merchant_name','business_name','name']),
            'sender_phone', public.be_text_from_jsonb(to_jsonb(m), array['sender_phone','senderPhone','phone','phone_number','phoneNumber','mobile','mobile_no','contact_phone','primary_phone','merchant_phone']),
            'pickup_address', public.be_text_from_jsonb(to_jsonb(m), array[
              'pickup_address','pickupAddress',
              'default_pickup_address','defaultPickupAddress',
              'registered_pickup_address','registeredPickupAddress',
              'registered_address','registeredAddress',
              'business_address','businessAddress',
              'sender_address','senderAddress',
              'address','full_address','fullAddress',
              'location_address','locationAddress'
            ]),
            'township', public.be_text_from_jsonb(to_jsonb(m), array['township','pickup_township','pickupTownship','sender_township','senderTownship','default_township','business_township']),
            'city_region', public.be_text_from_jsonb(to_jsonb(m), array['city_region','cityRegion','city','pickup_city','pickupCity','sender_city','senderCity','region','state','division']),
            'payment_terms', coalesce(nullif(public.be_text_from_jsonb(to_jsonb(m), array['payment_terms','paymentTerms','payment_type','paymentType']), ''), 'COD'),
            'tariff_code', public.be_text_from_jsonb(to_jsonb(m), array['tariff_code','tariffCode','rate_card_code','rateCardCode']),
            'assigned_branch', public.be_text_from_jsonb(to_jsonb(m), array['assigned_branch','assignedBranch','branch_code','branchCode','branch','default_branch','service_branch'])
          ) as x
          from public.%I m
          limit %s
        ) q
        where nullif(x->>'merchant_name','') is not null
           or nullif(x->>'merchant_code','') is not null
      $q$, tbl, greatest(coalesce(p_limit, 500), 1));

      execute sql into result;

      if jsonb_array_length(coalesce(result, '[]'::jsonb)) > 0 then
        return result;
      end if;
    end if;
  end loop;

  return '[]'::jsonb;
end;
$$;

drop function if exists public.be_customer_service_pickup_requests(integer);

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests
    order by created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) p;
$$;

drop function if exists public.be_customer_service_create_pickup(jsonb);

create or replace function public.be_customer_service_create_pickup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text;
  v_inserted public.be_portal_pickup_requests;
begin
  if nullif(trim(coalesce(p_payload->>'pickup_address', '')), '') is null then
    raise exception 'Pickup address is required from merchant master data.';
  end if;

  v_pickup_id := coalesce(
    nullif(p_payload->>'pickup_id', ''),
    'P' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(coalesce(nullif(p_payload->>'merchant_code',''), 'CS'))
  );

  insert into public.be_portal_pickup_requests (
    pickup_id, source, requester_type, merchant_code, merchant_name,
    sender_name, sender_phone, pickup_address, township, city_region,
    branch_code, parcel_count, cod_amount, status, payment_terms,
    tariff_code, priority, special_instructions, pickup_date, pickup_time, updated_at
  )
  values (
    v_pickup_id, 'customer_service', coalesce(nullif(p_payload->>'requester_type', ''), 'Merchant'),
    p_payload->>'merchant_code', p_payload->>'merchant_name',
    p_payload->>'sender_name', p_payload->>'sender_phone',
    p_payload->>'pickup_address', p_payload->>'township', p_payload->>'city_region',
    p_payload->>'assigned_branch',
    coalesce(nullif(p_payload->>'parcel_count','')::integer, 1),
    coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0),
    'DATA_ENTRY_IN_PROGRESS',
    coalesce(nullif(p_payload->>'payment_terms',''), 'COD'),
    p_payload->>'tariff_code',
    coalesce(nullif(p_payload->>'priority',''), 'Normal'),
    p_payload->>'special_instructions',
    p_payload->>'pickup_date',
    p_payload->>'pickup_time',
    now()
  )
  returning * into v_inserted;

  return to_jsonb(v_inserted);
end;
$$;

alter table public.be_portal_pickup_requests enable row level security;

drop policy if exists be_portal_pickup_requests_select_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_insert_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_update_auth on public.be_portal_pickup_requests;

create policy be_portal_pickup_requests_select_auth on public.be_portal_pickup_requests
for select to authenticated using (true);

create policy be_portal_pickup_requests_insert_auth on public.be_portal_pickup_requests
for insert to authenticated with check (true);

create policy be_portal_pickup_requests_update_auth on public.be_portal_pickup_requests
for update to authenticated using (true) with check (true);

-- Diagnostic for Baby Genius:
-- select *
-- from jsonb_to_recordset(public.be_customer_service_merchant_options(1000))
--   as x(merchant_code text, merchant_name text, pickup_address text, township text, city_region text)
-- where merchant_code = 'BBG' or merchant_name ilike '%Baby Genius%';
