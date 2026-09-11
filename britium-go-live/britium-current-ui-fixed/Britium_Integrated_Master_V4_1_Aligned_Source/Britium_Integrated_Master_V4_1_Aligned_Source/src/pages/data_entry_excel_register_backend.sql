-- Parcel-format Data Entry backend
-- Replaces the former DataEntry Register schema with the exact parcel.xlsx columns:
-- id, way_id, customer_id, merchant_id, status, recipient_name, recipient_phone,
-- township, delivery_address, item_price, delivery_charges, cod_amount, weight_kg,
-- created_at, updated_at, environment.
--
-- Existing rider-proof, pickup selection, township search, dropdown behavior and
-- waybill synchronization remain compatible. Delivery charges and COD are always
-- recalculated by the backend; spreadsheet values for those two columns are not trusted.
--
-- Run this whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Exact parcel.xlsx storage table
-- -----------------------------------------------------------------------------

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  way_id text not null,
  customer_id text,
  merchant_id text,
  status text not null default 'registered',
  recipient_name text,
  recipient_phone text,
  township text,
  delivery_address text,
  item_price numeric(14,2) not null default 0,
  delivery_charges numeric(14,2) not null default 0,
  cod_amount numeric(14,2) not null default 0,
  weight_kg numeric(12,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  environment text not null default 'production'
);

-- Safe additive patch when public.parcels already exists.
alter table public.parcels
  add column if not exists way_id text,
  add column if not exists customer_id text,
  add column if not exists merchant_id text,
  add column if not exists status text default 'registered',
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists township text,
  add column if not exists delivery_address text,
  add column if not exists item_price numeric(14,2) default 0,
  add column if not exists delivery_charges numeric(14,2) default 0,
  add column if not exists cod_amount numeric(14,2) default 0,
  add column if not exists weight_kg numeric(12,3) default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists environment text default 'production';

update public.parcels
set
  status = coalesce(nullif(status, ''), 'registered'),
  item_price = coalesce(item_price, 0),
  delivery_charges = coalesce(delivery_charges, 0),
  cod_amount = coalesce(cod_amount, item_price, 0),
  weight_kg = coalesce(weight_kg, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now()),
  environment = coalesce(nullif(environment, ''), 'production');

-- Preserve duplicate legacy rows while making way_id safely unique for upserts.
with ranked as (
  select
    ctid,
    way_id,
    row_number() over (partition by way_id order by updated_at desc nulls last, created_at desc nulls last, ctid desc) as duplicate_no
  from public.parcels
  where way_id is not null and btrim(way_id) <> ''
)
update public.parcels p
set way_id = p.way_id || '-DUP-' || substr(md5(p.ctid::text), 1, 8)
from ranked r
where p.ctid = r.ctid
  and r.duplicate_no > 1;

create unique index if not exists parcels_way_id_uidx
  on public.parcels (way_id)
  where way_id is not null and btrim(way_id) <> '';

create index if not exists parcels_merchant_idx
  on public.parcels (merchant_id, created_at desc);

create index if not exists parcels_customer_idx
  on public.parcels (customer_id, created_at desc);

create index if not exists parcels_status_environment_idx
  on public.parcels (status, environment, updated_at desc);

create or replace function public.be_touch_parcel_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists be_touch_parcel_updated_at on public.parcels;
create trigger be_touch_parcel_updated_at
before update on public.parcels
for each row execute function public.be_touch_parcel_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Customer calculation preferences and import/waybill audit tables
-- -----------------------------------------------------------------------------

create table if not exists public.be_parcel_customer_preferences (
  customer_id text primary key,
  customer_name text,
  customer_tier text not null default 'Standard',
  base_delivery_charge numeric(14,2),
  included_weight_kg numeric(12,3),
  extra_kg_rate numeric(14,2),
  default_environment text default 'production',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_parcel_import_batches (
  batch_id uuid primary key default gen_random_uuid(),
  batch_no text not null default ('PARCEL-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6))),
  source_file_name text,
  pickup_id text,
  uploaded_by text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  status text not null default 'registered',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_parcel_waybills (
  waybill_id uuid primary key default gen_random_uuid(),
  waybill_no text not null unique default ('WB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6))),
  pickup_id text not null unique,
  parcel_count integer not null default 0,
  total_item_price numeric(16,2) not null default 0,
  total_delivery_charges numeric(16,2) not null default 0,
  total_cod_amount numeric(16,2) not null default 0,
  status text not null default 'created',
  environment text not null default 'production',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3) Shared helpers
-- -----------------------------------------------------------------------------

create or replace function public.be_data_entry_safe_numeric(
  p_value text,
  p_default numeric default 0
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_clean text;
begin
  v_clean := nullif(regexp_replace(coalesce(p_value, ''), '[,[:space:]]', '', 'g'), '');
  if v_clean is null then
    return coalesce(p_default, 0);
  end if;

  begin
    return v_clean::numeric;
  exception when others then
    return coalesce(p_default, 0);
  end;
end;
$$;

create or replace function public.be_data_entry_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return null;
  end if;
  return btrim(p_value)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.be_data_entry_clean_code(
  p_value text,
  p_fallback text default 'GEN'
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]+', '', 'g')), ''),
    upper(coalesce(nullif(p_fallback, ''), 'GEN'))
  );
$$;

-- -----------------------------------------------------------------------------
-- 4) Exact parcel.xlsx schema metadata and dropdown snapshots
-- -----------------------------------------------------------------------------

create or replace function public.be_data_entry_parcel_template_schema()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'version', 'parcel-xlsx-2026-07',
    'title', 'Parcel Data Entry',
    'sheet_name', 'Sheet1',
    'file_name', 'parcel.xlsx',
    'columns', jsonb_build_array(
      jsonb_build_object('field','id','header','id','type','system','width',38),
      jsonb_build_object('field','way_id','header','way_id','type','system','width',22),
      jsonb_build_object('field','customer_id','header','customer_id','type','dropdown','dropdownKey','customers','width',18),
      jsonb_build_object('field','merchant_id','header','merchant_id','type','dropdown','dropdownKey','merchants','width',18),
      jsonb_build_object('field','status','header','status','type','dropdown','dropdownKey','statuses','width',20),
      jsonb_build_object('field','recipient_name','header','recipient_name','type','manual','width',24),
      jsonb_build_object('field','recipient_phone','header','recipient_phone','type','manual','width',18),
      jsonb_build_object('field','township','header','township','type','dropdown','dropdownKey','townships','width',20),
      jsonb_build_object('field','delivery_address','header','delivery_address','type','manual','width',44),
      jsonb_build_object('field','item_price','header','item_price','type','manual_number','width',14),
      jsonb_build_object('field','delivery_charges','header','delivery_charges','type','system_calculated','width',18),
      jsonb_build_object('field','cod_amount','header','cod_amount','type','system_calculated','width',16),
      jsonb_build_object('field','weight_kg','header','weight_kg','type','manual_number','width',12),
      jsonb_build_object('field','created_at','header','created_at','type','system','width',24),
      jsonb_build_object('field','updated_at','header','updated_at','type','system','width',24),
      jsonb_build_object('field','environment','header','environment','type','dropdown','dropdownKey','environments','width',16)
    ),
    'calculation', jsonb_build_object(
      'delivery_charges', 'Base tariff plus rounded-up extra-weight surcharge',
      'cod_amount', 'Equal to item_price, preserving existing Register Now behavior',
      'customer_tier', 'Resolved internally from be_parcel_customer_preferences; defaults to Standard'
    )
  );
$$;

create or replace function public.be_data_entry_parcel_dropdown_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customers jsonb := '[]'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
  v_townships jsonb := '[]'::jsonb;
  v_master jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'label'), '[]'::jsonb)
  into v_customers
  from (
    select jsonb_build_object(
      'value', customer_id,
      'id', customer_id,
      'label', coalesce(nullif(customer_name, ''), customer_id),
      'customer_tier', customer_tier,
      'environment', default_environment
    ) as x
    from public.be_parcel_customer_preferences
    where is_active

    union

    select jsonb_build_object(
      'value', customer_id,
      'id', customer_id,
      'label', customer_id,
      'customer_tier', 'Standard',
      'environment', 'production'
    ) as x
    from (
      select distinct customer_id
      from public.parcels
      where nullif(btrim(customer_id), '') is not null
    ) p
  ) customer_rows;

  -- Prefer the existing application master-data snapshot when available.
  begin
    select public.be_master_data_dropdown_snapshot() into v_master;
    v_merchants := coalesce(v_master->'merchants', '[]'::jsonb);
    v_townships := coalesce(v_master->'townships', v_master->'township', '[]'::jsonb);
  exception when undefined_function then
    v_master := '{}'::jsonb;
  when others then
    v_master := '{}'::jsonb;
  end;

  -- Merchant fallback: values already present in parcels.
  if jsonb_typeof(v_merchants) <> 'array' or jsonb_array_length(v_merchants) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'value', merchant_id,
      'id', merchant_id,
      'label', merchant_id
    ) order by merchant_id), '[]'::jsonb)
    into v_merchants
    from (
      select distinct merchant_id
      from public.parcels
      where nullif(btrim(merchant_id), '') is not null
    ) m;
  end if;

  -- Township fallback: use the application's searchable township view when present.
  if (jsonb_typeof(v_townships) <> 'array' or jsonb_array_length(v_townships) = 0)
     and to_regclass('public.be_v_township_search_options') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'value', township,
          'label', coalesce(label, township),
          'township_mm', township_mm,
          'city', city,
          'region_state', region_state
        ) order by township), '[]'::jsonb)
        from public.be_v_township_search_options
      $q$ into v_townships;
    exception when others then
      v_townships := '[]'::jsonb;
    end;
  end if;

  return jsonb_build_object(
    'customers', coalesce(v_customers, '[]'::jsonb),
    'merchants', coalesce(v_merchants, '[]'::jsonb),
    'townships', coalesce(v_townships, '[]'::jsonb),
    'statuses', jsonb_build_array(
      'registered',
      'ready_for_waybill',
      'waybill_created',
      'cancelled'
    ),
    'environments', jsonb_build_array(
      'production',
      'staging',
      'development',
      'test'
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Background tariff calculation mapped to parcel columns
-- -----------------------------------------------------------------------------

create or replace function public.be_calculate_parcel_amounts(
  p_township text,
  p_customer_id text default null,
  p_weight_kg numeric default 0,
  p_item_price numeric default 0,
  p_environment text default 'production'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_township text := nullif(btrim(coalesce(p_township, '')), '');
  v_city text := null;
  v_region_state text := null;
  v_branch_code text := null;
  v_customer_tier text := 'Standard';
  v_base_fee numeric := null;
  v_included_kg numeric := null;
  v_extra_kg_rate numeric := null;
  v_weight numeric := greatest(coalesce(p_weight_kg, 0), 0);
  v_item_price numeric := greatest(coalesce(p_item_price, 0), 0);
  v_extra_kg numeric := 0;
  v_delivery_charges numeric := 0;
  v_cod_amount numeric := 0;
  v_environment text := coalesce(nullif(btrim(p_environment), ''), 'production');
begin
  -- Resolve canonical township/city/branch from the existing dropdown view.
  if v_township is not null and to_regclass('public.be_v_township_search_options') is not null then
    begin
      execute $q$
        select township, city, region_state, branch_code
        from public.be_v_township_search_options
        where lower(regexp_replace(coalesce(township, ''), '[\s\-_()]+', '', 'g')) =
              lower(regexp_replace($1, '[\s\-_()]+', '', 'g'))
           or lower(regexp_replace(coalesce(township_mm, ''), '[\s\-_()]+', '', 'g')) =
              lower(regexp_replace($1, '[\s\-_()]+', '', 'g'))
           or lower(coalesce(search_text, '')) like '%' || lower($1) || '%'
        order by case when lower(township) = lower($1) then 0 else 1 end
        limit 1
      $q$
      into v_township, v_city, v_region_state, v_branch_code
      using p_township;
    exception when undefined_column then
      begin
        execute $q$
          select township, city, region_state, null::text
          from public.be_v_township_search_options
          where lower(regexp_replace(coalesce(township, ''), '[\s\-_()]+', '', 'g')) =
                lower(regexp_replace($1, '[\s\-_()]+', '', 'g'))
             or lower(regexp_replace(coalesce(township_mm, ''), '[\s\-_()]+', '', 'g')) =
                lower(regexp_replace($1, '[\s\-_()]+', '', 'g'))
          limit 1
        $q$
        into v_township, v_city, v_region_state, v_branch_code
        using p_township;
      exception when others then
        null;
      end;
    when others then
      null;
    end;
  end if;

  if nullif(btrim(coalesce(p_customer_id, '')), '') is not null then
    select
      coalesce(nullif(customer_tier, ''), 'Standard'),
      base_delivery_charge,
      included_weight_kg,
      extra_kg_rate,
      coalesce(nullif(default_environment, ''), v_environment)
    into
      v_customer_tier,
      v_base_fee,
      v_included_kg,
      v_extra_kg_rate,
      v_environment
    from public.be_parcel_customer_preferences
    where customer_id = p_customer_id
      and is_active
    limit 1;
  end if;

  v_customer_tier := coalesce(nullif(v_customer_tier, ''), 'Standard');
  v_environment := coalesce(nullif(v_environment, ''), 'production');

  -- Existing go-live tariff retained:
  -- Yangon/YGN = 4,000; Mandalay/MDY and Naypyitaw/NPT = 6,000.
  if v_base_fee is null then
    if upper(coalesce(v_branch_code, '')) in ('MDY', 'NPT')
       or lower(coalesce(v_region_state, '')) like '%mandalay%'
       or lower(coalesce(v_region_state, '') || ' ' || coalesce(v_city, '') || ' ' || coalesce(v_township, p_township, ''))
          ~ '(naypyitaw|nay pyi taw|mandalay)' then
      v_base_fee := 6000;
    else
      v_base_fee := 4000;
    end if;
  end if;

  if v_included_kg is null then
    v_included_kg := case when lower(v_customer_tier) = 'royal' then 5 else 3 end;
  end if;

  if v_extra_kg_rate is null then
    v_extra_kg_rate := 500;
  end if;

  v_extra_kg := greatest(ceil(v_weight) - v_included_kg, 0);
  v_delivery_charges := round(v_base_fee + (v_extra_kg * v_extra_kg_rate), 2);

  -- Retains the old Register Now rule: COD is derived from Item Price.
  v_cod_amount := round(v_item_price, 2);

  return jsonb_build_object(
    'township', coalesce(v_township, p_township),
    'destination', coalesce(v_city, p_township),
    'region_state', v_region_state,
    'branch_code', v_branch_code,
    'customer_id', p_customer_id,
    'customer_tier', v_customer_tier,
    'environment', v_environment,
    'base_delivery_charge', round(v_base_fee, 2),
    'included_weight_kg', v_included_kg,
    'extra_weight_kg', v_extra_kg,
    'extra_kg_rate', round(v_extra_kg_rate, 2),
    'delivery_charges', v_delivery_charges,
    'cod_amount', v_cod_amount,
    'actual_collect', round(v_cod_amount + v_delivery_charges, 2)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Save one exact parcel row. Calculated values are always recomputed.
-- -----------------------------------------------------------------------------

create or replace function public.be_save_data_entry_parcel(
  p_id text,
  p_way_id text,
  p_customer_id text,
  p_merchant_id text,
  p_status text,
  p_recipient_name text,
  p_recipient_phone text,
  p_township text,
  p_delivery_address text,
  p_item_price numeric,
  p_delivery_charges numeric,
  p_cod_amount numeric,
  p_weight_kg numeric,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_environment text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc jsonb;
  v_saved public.parcels%rowtype;
  v_delivery_charges numeric;
  v_cod_amount numeric;
  v_environment text;
begin
  if nullif(btrim(coalesce(p_way_id, '')), '') is null then
    raise exception 'way_id is required';
  end if;

  v_calc := public.be_calculate_parcel_amounts(
    p_township,
    p_customer_id,
    coalesce(p_weight_kg, 0),
    coalesce(p_item_price, 0),
    coalesce(nullif(p_environment, ''), 'production')
  );

  v_delivery_charges := coalesce((v_calc->>'delivery_charges')::numeric, 0);
  v_cod_amount := coalesce((v_calc->>'cod_amount')::numeric, coalesce(p_item_price, 0));
  v_environment := coalesce(nullif(v_calc->>'environment', ''), nullif(p_environment, ''), 'production');

  insert into public.parcels (
    way_id,
    customer_id,
    merchant_id,
    status,
    recipient_name,
    recipient_phone,
    township,
    delivery_address,
    item_price,
    delivery_charges,
    cod_amount,
    weight_kg,
    created_at,
    updated_at,
    environment
  )
  values (
    btrim(p_way_id),
    nullif(btrim(coalesce(p_customer_id, '')), ''),
    nullif(btrim(coalesce(p_merchant_id, '')), ''),
    coalesce(nullif(btrim(p_status), ''), 'registered'),
    nullif(btrim(coalesce(p_recipient_name, '')), ''),
    nullif(btrim(coalesce(p_recipient_phone, '')), ''),
    coalesce(nullif(v_calc->>'township', ''), nullif(btrim(coalesce(p_township, '')), '')),
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    greatest(coalesce(p_item_price, 0), 0),
    v_delivery_charges,
    v_cod_amount,
    greatest(coalesce(p_weight_kg, 0), 0),
    coalesce(p_created_at, now()),
    now(),
    v_environment
  )
  on conflict (way_id) where way_id is not null and btrim(way_id) <> ''
  do update set
    customer_id = excluded.customer_id,
    merchant_id = excluded.merchant_id,
    status = excluded.status,
    recipient_name = excluded.recipient_name,
    recipient_phone = excluded.recipient_phone,
    township = excluded.township,
    delivery_address = excluded.delivery_address,
    item_price = excluded.item_price,
    delivery_charges = excluded.delivery_charges,
    cod_amount = excluded.cod_amount,
    weight_kg = excluded.weight_kg,
    environment = excluded.environment,
    updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'ok', true,
    'parcel', to_jsonb(v_saved),
    'calculation', v_calc,
    'actor_email', p_actor_email,
    'uploaded_id_ignored', p_id,
    'uploaded_delivery_charges_ignored', p_delivery_charges,
    'uploaded_cod_amount_ignored', p_cod_amount,
    'uploaded_updated_at_ignored', p_updated_at
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Bulk import exact parcel.xlsx rows
-- -----------------------------------------------------------------------------

create or replace function public.be_data_entry_register_parcels_bulk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_source_file text := coalesce(nullif(p_payload->>'source_file_name', ''), 'parcel.xlsx');
  v_pickup_id text := nullif(p_payload->>'pickup_id', '');
  v_uploaded_by text := nullif(p_payload->>'uploaded_by', '');
  v_batch_id uuid := gen_random_uuid();
  v_total integer := 0;
  v_valid integer := 0;
  v_warning integer := 0;
  v_index integer := 0;
  v_row jsonb;
  v_way_id text;
  v_result jsonb;
  v_errors jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'payload.rows must be a JSON array';
  end if;

  v_total := jsonb_array_length(v_rows);

  insert into public.be_parcel_import_batches (
    batch_id,
    source_file_name,
    pickup_id,
    uploaded_by,
    total_rows,
    status,
    payload
  )
  values (
    v_batch_id,
    v_source_file,
    v_pickup_id,
    v_uploaded_by,
    v_total,
    'processing',
    p_payload
  );

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    v_index := v_index + 1;
    v_way_id := nullif(btrim(coalesce(v_row->>'way_id', '')), '');

    if v_way_id is null then
      v_way_id := 'PARCEL-' || to_char(now(), 'YYYYMMDD') || '-'
        || public.be_data_entry_clean_code(v_row->>'merchant_id', 'GEN') || '-'
        || lpad(v_index::text, 4, '0');
    end if;

    begin
      v_result := public.be_save_data_entry_parcel(
        nullif(v_row->>'id', ''),
        v_way_id,
        nullif(v_row->>'customer_id', ''),
        nullif(v_row->>'merchant_id', ''),
        coalesce(nullif(v_row->>'status', ''), 'registered'),
        nullif(v_row->>'recipient_name', ''),
        nullif(v_row->>'recipient_phone', ''),
        nullif(v_row->>'township', ''),
        nullif(v_row->>'delivery_address', ''),
        public.be_data_entry_safe_numeric(v_row->>'item_price', 0),
        public.be_data_entry_safe_numeric(v_row->>'delivery_charges', 0),
        public.be_data_entry_safe_numeric(v_row->>'cod_amount', 0),
        public.be_data_entry_safe_numeric(v_row->>'weight_kg', 0),
        case
          when nullif(v_row->>'created_at', '') is null then null
          else (v_row->>'created_at')::timestamptz
        end,
        case
          when nullif(v_row->>'updated_at', '') is null then null
          else (v_row->>'updated_at')::timestamptz
        end,
        coalesce(nullif(v_row->>'environment', ''), 'production'),
        v_uploaded_by
      );

      if nullif(v_row->>'merchant_id', '') is null
         or nullif(v_row->>'recipient_name', '') is null
         or nullif(v_row->>'recipient_phone', '') is null
         or nullif(v_row->>'township', '') is null
         or nullif(v_row->>'delivery_address', '') is null then
        v_warning := v_warning + 1;
      else
        v_valid := v_valid + 1;
      end if;
    exception when others then
      v_warning := v_warning + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_index,
        'way_id', v_way_id,
        'error', sqlerrm
      ));
    end;
  end loop;

  update public.be_parcel_import_batches
  set
    valid_rows = v_valid,
    warning_rows = v_warning,
    status = case when jsonb_array_length(v_errors) = 0 then 'registered' else 'registered_with_warnings' end,
    updated_at = now()
  where batch_id = v_batch_id;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'batch_id', v_batch_id,
    'source_file_name', v_source_file,
    'total_rows', v_total,
    'valid_rows', v_valid,
    'warning_rows', v_warning,
    'errors', v_errors,
    'status', case when jsonb_array_length(v_errors) = 0 then 'registered' else 'registered_with_warnings' end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) Save exact parcel rows, create pickup-level waybill, and sync legacy flow
-- -----------------------------------------------------------------------------

create or replace function public.be_data_entry_create_waybill_from_parcels(
  p_pickup_id text,
  p_rows jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bulk_result jsonb;
  v_way_ids text[];
  v_waybill public.be_parcel_waybills%rowtype;
  v_count integer := 0;
  v_item_total numeric := 0;
  v_delivery_total numeric := 0;
  v_cod_total numeric := 0;
  v_environment text := 'production';
  v_legacy_rows jsonb := '[]'::jsonb;
  v_legacy_result jsonb := null;
  v_legacy_error text := null;
begin
  if nullif(btrim(coalesce(p_pickup_id, '')), '') is null then
    raise exception 'pickup_id is required';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    raise exception 'At least one parcel row is required';
  end if;

  v_bulk_result := public.be_data_entry_register_parcels_bulk(jsonb_build_object(
    'source_file_name', 'DataEntryPage.register_now.tsx',
    'pickup_id', p_pickup_id,
    'uploaded_by', p_actor_email,
    'rows', p_rows
  ));

  select array_agg(nullif(btrim(r.value->>'way_id'), ''))
  into v_way_ids
  from jsonb_array_elements(p_rows) as r(value);

  update public.parcels
  set status = 'waybill_created', updated_at = now()
  where way_id = any(v_way_ids);

  select
    count(*),
    coalesce(sum(item_price), 0),
    coalesce(sum(delivery_charges), 0),
    coalesce(sum(cod_amount), 0),
    coalesce(max(environment), 'production')
  into
    v_count,
    v_item_total,
    v_delivery_total,
    v_cod_total,
    v_environment
  from public.parcels
  where way_id = any(v_way_ids);

  insert into public.be_parcel_waybills (
    pickup_id,
    parcel_count,
    total_item_price,
    total_delivery_charges,
    total_cod_amount,
    status,
    environment,
    created_by,
    updated_at
  )
  values (
    p_pickup_id,
    v_count,
    v_item_total,
    v_delivery_total,
    v_cod_total,
    'created',
    v_environment,
    p_actor_email,
    now()
  )
  on conflict (pickup_id) do update set
    parcel_count = excluded.parcel_count,
    total_item_price = excluded.total_item_price,
    total_delivery_charges = excluded.total_delivery_charges,
    total_cod_amount = excluded.total_cod_amount,
    status = 'created',
    environment = excluded.environment,
    created_by = coalesce(excluded.created_by, public.be_parcel_waybills.created_by),
    updated_at = now()
  returning * into v_waybill;

  -- Translate exact parcel rows to the older waybill payload when that RPC exists.
  -- This preserves Waybill Studio / Warehouse queue behavior during migration.
  select coalesce(jsonb_agg(jsonb_build_object(
    'parcel_sequence', r.ordinality,
    'delivery_way_id', p.way_id,
    'recipient_name', p.recipient_name,
    'contact_no_1', p.recipient_phone,
    'contact_no_2', null,
    'township', p.township,
    'recipient_address', p.delivery_address,
    'customer_tier', coalesce(pref.customer_tier, 'Standard'),
    'item_price', p.item_price,
    'weight_kg', p.weight_kg,
    'surcharge', greatest(
      p.delivery_charges
      - case when lower(coalesce(p.township, '')) ~ '(mandalay|naypyitaw|nay pyi taw)' then 6000 else 4000 end,
      0
    ),
    'delivery_fee', p.delivery_charges,
    'cod_amount', p.cod_amount,
    'actual_collect', p.cod_amount + p.delivery_charges,
    'destination', p.township,
    'pickup_by', 'DATA_ENTRY',
    'remark', '',
    'proof_photo_path', null
  ) order by r.ordinality), '[]'::jsonb)
  into v_legacy_rows
  from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality)
  join public.parcels p
    on p.way_id = r.value->>'way_id'
  left join public.be_parcel_customer_preferences pref
    on pref.customer_id = p.customer_id;

  begin
    execute 'select to_jsonb(public.be_data_entry_create_waybill_from_rows($1, $2, $3))'
      into v_legacy_result
      using p_pickup_id, v_legacy_rows, p_actor_email;
  exception
    when undefined_function then
      v_legacy_result := null;
    when others then
      v_legacy_error := sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'waybill_id', v_waybill.waybill_id,
    'waybill_no', coalesce(v_legacy_result->>'waybill_no', v_legacy_result->>'waybillNo', v_waybill.waybill_no),
    'parcel_count', v_count,
    'total_item_price', v_item_total,
    'total_delivery_charges', v_delivery_total,
    'total_cod_amount', v_cod_total,
    'environment', v_environment,
    'bulk_result', v_bulk_result,
    'legacy_result', v_legacy_result,
    'legacy_sync_error', v_legacy_error
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9) Snapshots and rider-proof compatible view
-- -----------------------------------------------------------------------------

create or replace function public.be_data_entry_parcel_snapshot(
  p_status text default null,
  p_environment text default null,
  p_limit integer default 300
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.parcels),
      'registered', (select count(*) from public.parcels where status = 'registered'),
      'ready_for_waybill', (select count(*) from public.parcels where status = 'ready_for_waybill'),
      'waybill_created', (select count(*) from public.parcels where status = 'waybill_created')
    ),
    'synced_at', now()
  )
  from (
    select
      id,
      way_id,
      customer_id,
      merchant_id,
      status,
      recipient_name,
      recipient_phone,
      township,
      delivery_address,
      item_price,
      delivery_charges,
      cod_amount,
      weight_kg,
      created_at,
      updated_at,
      environment
    from public.parcels
    where (p_status is null or status = p_status)
      and (p_environment is null or environment = p_environment)
    order by updated_at desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)
  ) x;
$$;

create or replace view public.be_v_data_entry_registered_parcels as
select
  id,
  way_id,
  customer_id,
  merchant_id,
  status,
  recipient_name,
  recipient_phone,
  township,
  delivery_address,
  item_price,
  delivery_charges,
  cod_amount,
  weight_kg,
  created_at,
  updated_at,
  environment
from public.parcels;

-- Build the preferred proof + parcel view only when the source tables exist.
-- If a deployment has different proof-table columns, the block leaves an empty
-- compatible view and the web page falls back to its older proof views.
do $$
begin
  if to_regclass('public.be_pickup_parcel_verifications') is not null
     and to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $view$
        create or replace view public.be_v_data_entry_parcel_rows as
        select
          pv.pickup_id,
          pv.parcel_sequence,
          pv.delivery_way_id,
          pv.parcel_weight_kg,
          pv.proof_photo_path,
          pv.verified_at,
          pv.photo_taken_at,
          pr.merchant_code,
          pr.merchant_name,
          pr.pickup_date,
          pr.township as pickup_township,
          pr.city,
          p.id as parcel_id,
          p.way_id,
          p.customer_id,
          p.merchant_id,
          p.status as parcel_status,
          p.recipient_name,
          p.recipient_phone,
          p.township,
          p.delivery_address,
          p.item_price,
          p.delivery_charges,
          p.cod_amount,
          p.weight_kg,
          p.created_at as parcel_created_at,
          p.updated_at as parcel_updated_at,
          p.environment,
          pref.customer_tier,
          coalesce(pr.city, p.township) as destination
        from public.be_pickup_parcel_verifications pv
        left join public.be_portal_pickup_requests pr
          on pr.pickup_id = pv.pickup_id
        left join public.parcels p
          on p.way_id = pv.delivery_way_id
        left join public.be_parcel_customer_preferences pref
          on pref.customer_id = p.customer_id
      $view$;
    exception when others then
      raise notice 'Could not build be_v_data_entry_parcel_rows from proof tables: %', sqlerrm;
    end;
  end if;

  if to_regclass('public.be_v_data_entry_parcel_rows') is null then
    execute $view$
      create view public.be_v_data_entry_parcel_rows as
      select
        null::text as pickup_id,
        null::integer as parcel_sequence,
        null::text as delivery_way_id,
        null::numeric as parcel_weight_kg,
        null::text as proof_photo_path,
        null::timestamptz as verified_at,
        null::timestamptz as photo_taken_at,
        null::text as merchant_code,
        null::text as merchant_name,
        null::date as pickup_date,
        null::text as pickup_township,
        null::text as city,
        null::uuid as parcel_id,
        null::text as way_id,
        null::text as customer_id,
        null::text as merchant_id,
        null::text as parcel_status,
        null::text as recipient_name,
        null::text as recipient_phone,
        null::text as township,
        null::text as delivery_address,
        null::numeric as item_price,
        null::numeric as delivery_charges,
        null::numeric as cod_amount,
        null::numeric as weight_kg,
        null::timestamptz as parcel_created_at,
        null::timestamptz as parcel_updated_at,
        null::text as environment,
        null::text as customer_tier,
        null::text as destination
      where false
    $view$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10) Security and API grants
-- -----------------------------------------------------------------------------

alter table public.parcels enable row level security;
alter table public.be_parcel_customer_preferences enable row level security;
alter table public.be_parcel_import_batches enable row level security;
alter table public.be_parcel_waybills enable row level security;

drop policy if exists parcels_all_auth on public.parcels;
drop policy if exists be_parcel_customer_preferences_all_auth on public.be_parcel_customer_preferences;
drop policy if exists be_parcel_import_batches_all_auth on public.be_parcel_import_batches;
drop policy if exists be_parcel_waybills_all_auth on public.be_parcel_waybills;

create policy parcels_all_auth
  on public.parcels for all to authenticated
  using (true) with check (true);

create policy be_parcel_customer_preferences_all_auth
  on public.be_parcel_customer_preferences for all to authenticated
  using (true) with check (true);

create policy be_parcel_import_batches_all_auth
  on public.be_parcel_import_batches for all to authenticated
  using (true) with check (true);

create policy be_parcel_waybills_all_auth
  on public.be_parcel_waybills for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.parcels to authenticated;
grant select, insert, update, delete on public.be_parcel_customer_preferences to authenticated;
grant select, insert, update, delete on public.be_parcel_import_batches to authenticated;
grant select, insert, update, delete on public.be_parcel_waybills to authenticated;
grant select on public.be_v_data_entry_registered_parcels to authenticated;
grant select on public.be_v_data_entry_parcel_rows to authenticated;

grant execute on function public.be_data_entry_safe_numeric(text,numeric) to anon, authenticated;
grant execute on function public.be_data_entry_try_uuid(text) to anon, authenticated;
grant execute on function public.be_data_entry_clean_code(text,text) to anon, authenticated;
grant execute on function public.be_data_entry_parcel_template_schema() to anon, authenticated;
grant execute on function public.be_data_entry_parcel_dropdown_snapshot() to anon, authenticated;
grant execute on function public.be_calculate_parcel_amounts(text,text,numeric,numeric,text) to anon, authenticated;
grant execute on function public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.be_data_entry_register_parcels_bulk(jsonb) to authenticated;
grant execute on function public.be_data_entry_create_waybill_from_parcels(text,jsonb,text) to authenticated;
grant execute on function public.be_data_entry_parcel_snapshot(text,text,integer) to authenticated;

notify pgrst, 'reload schema';

-- Smoke tests after deployment:
-- select public.be_data_entry_parcel_template_schema();
-- select public.be_data_entry_parcel_dropdown_snapshot();
-- select public.be_calculate_parcel_amounts('North Dagon', null, 4, 25000, 'production');
-- select public.be_data_entry_register_parcels_bulk('{"source_file_name":"parcel.xlsx","rows":[{"way_id":"TEST-001","merchant_id":"MERCHANT","status":"registered","recipient_name":"Test","recipient_phone":"09","township":"North Dagon","delivery_address":"Test address","item_price":25000,"weight_kg":4,"environment":"test"}]}'::jsonb);
-- select public.be_data_entry_parcel_snapshot(null, null, 20);
