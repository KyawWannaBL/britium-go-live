
-- ============================================================
-- Britium Go-Live Safe SQL Repair
-- Purpose:
--   1) Repair Master Data CRUD functions
--   2) Repair Data Entry -> Waybill -> Finance/COD sync functions
--   3) Avoid rerunning the broken full production_go_live_master.sql
--
-- Safe to rerun with:
-- psql "postgresql://postgres:YOUR_PASSWORD@db.dltavabvjwocknkyvwgz.supabase.co:5432/postgres" -v ON_ERROR_STOP=1 -f britium_go_live_safe_sql_repair.sql
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) MASTER DATA BASE TABLES
-- ============================================================

create table if not exists public.be_master_data_tabs (
  dataset_key text primary key,
  sheet_name text,
  display_name_en text not null,
  display_name_mm text,
  category text default 'Master Data',
  primary_key text not null,
  sort_order integer default 999,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_master_data_tabs
  add column if not exists sheet_name text,
  add column if not exists display_name_en text,
  add column if not exists display_name_mm text,
  add column if not exists category text default 'Master Data',
  add column if not exists primary_key text,
  add column if not exists sort_order integer default 999,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_master_data_columns (
  dataset_key text not null references public.be_master_data_tabs(dataset_key) on delete cascade,
  field_key text not null,
  label_en text not null,
  label_mm text,
  data_type text not null default 'text',
  required boolean default false,
  editable boolean default true,
  visible boolean default true,
  options jsonb default '[]'::jsonb,
  sort_order integer default 999,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (dataset_key, field_key)
);

alter table public.be_master_data_columns
  add column if not exists label_en text,
  add column if not exists label_mm text,
  add column if not exists data_type text default 'text',
  add column if not exists required boolean default false,
  add column if not exists editable boolean default true,
  add column if not exists visible boolean default true,
  add column if not exists options jsonb default '[]'::jsonb,
  add column if not exists sort_order integer default 999,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_master_data_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null references public.be_master_data_tabs(dataset_key) on delete cascade,
  record_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by_email text,
  deleted_at timestamptz,
  unique (dataset_key, record_key)
);

alter table public.be_master_data_rows
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists updated_by_email text,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_be_master_data_rows_dataset_key
  on public.be_master_data_rows(dataset_key)
  where deleted_at is null;

create index if not exists idx_be_master_data_rows_payload_gin
  on public.be_master_data_rows using gin(payload);

-- ============================================================
-- 2) MASTER DATA CRUD FUNCTIONS
-- ============================================================

create or replace function public.be_master_data_upsert_column(
  p_dataset_key text,
  p_field_key text,
  p_label_en text default null,
  p_label_mm text default null,
  p_data_type text default 'text',
  p_required boolean default false,
  p_editable boolean default true,
  p_visible boolean default true,
  p_options jsonb default '[]'::jsonb,
  p_sort_order integer default 999
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_master_data_columns (
    dataset_key,
    field_key,
    label_en,
    label_mm,
    data_type,
    required,
    editable,
    visible,
    options,
    sort_order,
    updated_at
  )
  values (
    p_dataset_key,
    p_field_key,
    coalesce(p_label_en, initcap(replace(p_field_key, '_', ' '))),
    coalesce(p_label_mm, p_label_en, initcap(replace(p_field_key, '_', ' '))),
    coalesce(p_data_type, 'text'),
    coalesce(p_required, false),
    coalesce(p_editable, true),
    coalesce(p_visible, true),
    coalesce(p_options, '[]'::jsonb),
    coalesce(p_sort_order, 999),
    now()
  )
  on conflict (dataset_key, field_key) do update set
    label_en = excluded.label_en,
    label_mm = excluded.label_mm,
    data_type = excluded.data_type,
    required = excluded.required,
    editable = excluded.editable,
    visible = excluded.visible,
    options = excluded.options,
    sort_order = excluded.sort_order,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'dataset_key', p_dataset_key,
    'field_key', p_field_key
  );
end;
$$;

create or replace function public.be_master_data_upsert_record(
  p_dataset_key text,
  p_record_key text,
  p_payload jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_key text;
  v_record_key text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_row public.be_master_data_rows;
begin
  if p_dataset_key is null or length(trim(p_dataset_key)) = 0 then
    raise exception 'dataset_key is required';
  end if;

  select primary_key
  into v_primary_key
  from public.be_master_data_tabs
  where dataset_key = p_dataset_key
    and active = true;

  if v_primary_key is null then
    raise exception 'Unknown master dataset: %', p_dataset_key;
  end if;

  v_record_key := nullif(trim(coalesce(p_record_key, '')), '');

  if v_record_key is null then
    v_record_key := nullif(trim(coalesce(v_payload ->> v_primary_key, '')), '');
  end if;

  if v_record_key is null then
    v_record_key := upper(substr(md5(clock_timestamp()::text || random()::text), 1, 12));
    v_payload := jsonb_set(v_payload, array[v_primary_key], to_jsonb(v_record_key), true);
  end if;

  insert into public.be_master_data_rows (
    dataset_key,
    record_key,
    payload,
    status,
    updated_by_email,
    updated_at,
    deleted_at
  )
  values (
    p_dataset_key,
    v_record_key,
    v_payload,
    coalesce(nullif(v_payload ->> 'status', ''), 'ACTIVE'),
    p_actor_email,
    now(),
    null
  )
  on conflict (dataset_key, record_key) do update set
    payload = excluded.payload,
    status = coalesce(nullif(excluded.payload ->> 'status', ''), public.be_master_data_rows.status, 'ACTIVE'),
    updated_by_email = excluded.updated_by_email,
    updated_at = now(),
    deleted_at = null
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'dataset_key', v_row.dataset_key,
    'record_key', v_row.record_key,
    'row', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.be_master_data_delete_record(
  p_dataset_key text,
  p_record_key text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.be_master_data_rows
  set deleted_at = now(),
      status = 'DELETED',
      updated_by_email = p_actor_email,
      updated_at = now()
  where dataset_key = p_dataset_key
    and record_key = p_record_key
    and deleted_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', v_count > 0,
    'dataset_key', p_dataset_key,
    'record_key', p_record_key,
    'deleted', v_count
  );
end;
$$;

create or replace function public.be_master_data_bulk_upsert_records(
  p_dataset_key text,
  p_rows jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_pk text;
  v_key text;
begin
  select primary_key
  into v_pk
  from public.be_master_data_tabs
  where dataset_key = p_dataset_key;

  if v_pk is null then
    raise exception 'Unknown master dataset: %', p_dataset_key;
  end if;

  for v_row in
    select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_key := nullif(v_row ->> v_pk, '');
    perform public.be_master_data_upsert_record(p_dataset_key, v_key, v_row, p_actor_email);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'dataset_key', p_dataset_key,
    'upserted', v_count
  );
end;
$$;

create or replace function public.be_master_data_page_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'datasets',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'dataset_key', t.dataset_key,
            'sheet_name', t.sheet_name,
            'display_name_en', t.display_name_en,
            'display_name_mm', t.display_name_mm,
            'category', t.category,
            'primary_key', t.primary_key,
            'sort_order', t.sort_order,
            'active', t.active,
            'row_count', (
              select count(*)
              from public.be_master_data_rows r
              where r.dataset_key = t.dataset_key
                and r.deleted_at is null
            ),
            'fields',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'field_key', c.field_key,
                    'label_en', c.label_en,
                    'label_mm', c.label_mm,
                    'data_type', c.data_type,
                    'required', c.required,
                    'editable', c.editable,
                    'visible', c.visible,
                    'options', c.options,
                    'sort_order', c.sort_order
                  )
                  order by c.sort_order, c.field_key
                )
                from public.be_master_data_columns c
                where c.dataset_key = t.dataset_key
                  and c.visible = true
              ), '[]'::jsonb)
          )
          order by t.sort_order, t.dataset_key
        )
        from public.be_master_data_tabs t
        where t.active = true
      ), '[]'::jsonb),
    'records_by_dataset',
      coalesce((
        select jsonb_object_agg(dataset_key, rows)
        from (
          select
            r.dataset_key,
            jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'dataset_key', r.dataset_key,
                'record_key', r.record_key,
                'payload', r.payload,
                'status', r.status,
                'updated_at', r.updated_at,
                'updated_by_email', r.updated_by_email
              )
              order by r.record_key
            ) as rows
          from public.be_master_data_rows r
          where r.deleted_at is null
          group by r.dataset_key
        ) s
      ), '{}'::jsonb),
    'counts',
      jsonb_build_object(
        'datasets', (select count(*) from public.be_master_data_tabs where active),
        'columns', (select count(*) from public.be_master_data_columns),
        'rows', (select count(*) from public.be_master_data_rows where deleted_at is null)
      ),
    'merchants',
      coalesce((
        select jsonb_agg(
          payload || jsonb_build_object(
            'code', payload ->> 'merchant_code',
            'name', payload ->> 'merchant_name',
            'phone', payload ->> 'phone_primary',
            'town', payload ->> 'township',
            'address', coalesce(payload ->> 'default_pickup_address', payload ->> 'address_line_1')
          )
          order by record_key
        )
        from public.be_master_data_rows
        where dataset_key = 'merchant_master'
          and deleted_at is null
      ), '[]'::jsonb)
  );
$$;

create or replace function public.be_master_data_healthcheck()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'datasets', (select count(*) from public.be_master_data_tabs where active),
    'columns', (select count(*) from public.be_master_data_columns),
    'rows', (select count(*) from public.be_master_data_rows where deleted_at is null),
    'sample_tabs', (
      select jsonb_agg(dataset_key order by sort_order)
      from public.be_master_data_tabs
      where active
    )
  );
$$;

create or replace view public.be_v_master_data_live_rows as
select
  r.id,
  r.dataset_key,
  t.display_name_en,
  t.category,
  t.primary_key,
  r.record_key,
  r.payload,
  r.status,
  r.updated_at,
  r.updated_by_email
from public.be_master_data_rows r
join public.be_master_data_tabs t
  on t.dataset_key = r.dataset_key
where r.deleted_at is null
  and t.active = true;

-- ============================================================
-- 3) GENERIC GO-LIVE HELPERS
-- ============================================================

drop function if exists public.be_gl_num(text, numeric);
drop function if exists public.be_gl_code(text, text);
drop function if exists public.be_gl_pickup_id(date, text, integer);
drop function if exists public.be_gl_delivery_id(date, text, integer);

create function public.be_gl_num(p_value text, p_default numeric default 0)
returns numeric
language plpgsql
immutable
as $$
declare
  v_num numeric;
begin
  begin
    v_num := nullif(regexp_replace(coalesce(p_value, ''), '[^0-9.-]', '', 'g'), '')::numeric;
  exception when others then
    v_num := p_default;
  end;

  return coalesce(v_num, p_default);
end;
$$;

create function public.be_gl_code(p_value text, p_default text default 'GEN')
returns text
language sql
immutable
as $$
  select left(coalesce(nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g')), ''), p_default), 12);
$$;

create function public.be_gl_pickup_id(p_pickup_date date, p_merchant_code text, p_count integer)
returns text
language sql
stable
as $$
  select 'P'
    || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
    || '-'
    || public.be_gl_code(p_merchant_code, 'GEN')
    || '-'
    || lpad(greatest(coalesce(p_count, 1), 1)::text, 3, '0');
$$;

create function public.be_gl_delivery_id(p_pickup_date date, p_merchant_code text, p_sequence integer)
returns text
language sql
stable
as $$
  select 'D'
    || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
    || '-'
    || public.be_gl_code(p_merchant_code, 'GEN')
    || '-'
    || lpad(greatest(coalesce(p_sequence, 1), 1)::text, 3, '0');
$$;

-- ============================================================
-- 4) DATA ENTRY / WAYBILL / FINANCE TABLES
-- ============================================================

create table if not exists public.delivery_waybills (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text,
  pickup_way_id text,
  pickup_id text,
  pickup_date date,
  merchant text,
  merchant_code text,
  merchant_name text,
  recipient_name text,
  recipient_phone text,
  recipient_phone_2 text,
  recipient_township text,
  recipient_address text,
  item_price numeric default 0,
  deli_fee_os numeric default 0,
  delivery_fee_os numeric default 0,
  cod_os numeric default 0,
  std_deli numeric default 0,
  max_deli numeric default 0,
  weight_kg numeric default 0,
  surcharge numeric default 0,
  final_cod numeric default 0,
  destination text,
  pickup_by_1 text,
  pickup_by_2 text,
  general_remarks text,
  driver_rider text,
  helper text,
  plate_no text,
  delivery_remarks text,
  finance_deli numeric default 0,
  finance_cod numeric default 0,
  finance_received_by text,
  finance_status text default 'pending_finance',
  operation_status text default 'data_entry_registered',
  overall_status text default 'registered',
  financial_status text default 'pending_finance',
  validation_status text default 'valid',
  validation_errors jsonb default '[]'::jsonb,
  raw_row jsonb default '{}'::jsonb,
  created_by text,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_waybills
  add column if not exists delivery_way_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_id text,
  add column if not exists pickup_date date,
  add column if not exists merchant text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_phone_2 text,
  add column if not exists recipient_township text,
  add column if not exists recipient_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists deli_fee_os numeric default 0,
  add column if not exists delivery_fee_os numeric default 0,
  add column if not exists cod_os numeric default 0,
  add column if not exists std_deli numeric default 0,
  add column if not exists max_deli numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists surcharge numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists destination text,
  add column if not exists pickup_by_1 text,
  add column if not exists pickup_by_2 text,
  add column if not exists general_remarks text,
  add column if not exists driver_rider text,
  add column if not exists helper text,
  add column if not exists plate_no text,
  add column if not exists delivery_remarks text,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists finance_received_by text,
  add column if not exists finance_status text default 'pending_finance',
  add column if not exists operation_status text default 'data_entry_registered',
  add column if not exists overall_status text default 'registered',
  add column if not exists financial_status text default 'pending_finance',
  add column if not exists validation_status text default 'valid',
  add column if not exists validation_errors jsonb default '[]'::jsonb,
  add column if not exists raw_row jsonb default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists delivery_waybills_delivery_way_id_uidx
  on public.delivery_waybills(delivery_way_id)
  where delivery_way_id is not null and delivery_way_id <> '';

create index if not exists delivery_waybills_finance_status_idx
  on public.delivery_waybills(finance_status);

create table if not exists public.be_enterprise_workflow_events (
  event_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  event_type text,
  event_status text,
  source_module text,
  target_module text,
  amount numeric default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_cod_ledger (
  cod_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text unique,
  merchant_code text,
  merchant_name text,
  recipient_name text,
  rider_id text,
  rider_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  cod_status text default 'pending_collection',
  collected_at timestamptz,
  handed_over_at timestamptz,
  received_by text,
  received_by_name text,
  settlement_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_cod_ledger
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists collected_amount numeric default 0,
  add column if not exists handover_amount numeric default 0,
  add column if not exists variance_amount numeric default 0,
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists collected_at timestamptz,
  add column if not exists handed_over_at timestamptz,
  add column if not exists received_by text,
  add column if not exists received_by_name text,
  add column if not exists settlement_id text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_financial_settlements (
  settlement_id text primary key default ('SET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text unique,
  cod_id uuid,
  merchant_code text,
  merchant_name text,
  recipient_name text,
  delivery_fee numeric default 0,
  gross_cod numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  finance_deli numeric default 0,
  finance_cod numeric default 0,
  settlement_status text default 'pending_finance',
  finance_note text,
  closed_by text,
  closed_by_name text,
  closed_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_financial_settlements
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists cod_id uuid,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists gross_cod numeric default 0,
  add column if not exists handover_amount numeric default 0,
  add column if not exists variance_amount numeric default 0,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists settlement_status text default 'pending_finance',
  add column if not exists finance_note text,
  add column if not exists closed_by text,
  add column if not exists closed_by_name text,
  add column if not exists closed_at timestamptz,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_finance_journal_entries (
  journal_id uuid primary key default gen_random_uuid(),
  settlement_id text,
  delivery_way_id text,
  account_code text,
  account_name text,
  debit numeric default 0,
  credit numeric default 0,
  description text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_customer_invoices (
  invoice_id text primary key default ('INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  settlement_id text,
  delivery_way_id text unique,
  merchant_code text,
  merchant_name text,
  invoice_amount numeric default 0,
  invoice_status text default 'draft',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_data_entry_register_batches (
  batch_id uuid primary key default gen_random_uuid(),
  batch_no text default ('DER-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  source_file_name text,
  uploaded_by text,
  uploaded_by_name text,
  total_rows int default 0,
  valid_rows int default 0,
  rejected_rows int default 0,
  status text default 'registered',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_data_entry_register_rows (
  row_id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  row_no int,
  source_file_name text,
  pickup_date date,
  pickup_way_id text,
  delivery_way_id text,
  merchant_code text,
  merchant_name text,
  recipient_name text,
  recipient_phone text,
  recipient_township text,
  recipient_address text,
  item_price numeric default 0,
  deli_fee_os numeric default 0,
  delivery_fee_os numeric default 0,
  cod_os numeric default 0,
  std_deli numeric default 0,
  max_deli numeric default 0,
  weight_kg numeric default 0,
  surcharge numeric default 0,
  final_cod numeric default 0,
  destination text,
  pickup_by_1 text,
  pickup_by_2 text,
  general_remarks text,
  driver_rider text,
  helper text,
  plate_no text,
  delivery_remarks text,
  finance_deli numeric default 0,
  finance_cod numeric default 0,
  finance_received_by text,
  finance_status text default 'pending_finance',
  operation_status text default 'data_entry_registered',
  overall_status text default 'registered',
  financial_status text default 'pending_finance',
  validation_status text default 'valid',
  validation_errors jsonb default '[]'::jsonb,
  raw_row jsonb default '{}'::jsonb,
  created_by text,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists be_data_entry_register_rows_delivery_way_uidx
  on public.be_data_entry_register_rows(delivery_way_id)
  where delivery_way_id is not null and delivery_way_id <> '';

-- ============================================================
-- 5) TRIGGERS AND SYNC FUNCTIONS
-- ============================================================

create or replace function public.be_delivery_waybill_normalize_biu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item numeric;
  v_fee numeric;
  v_sur numeric;
begin
  new.delivery_way_id := nullif(trim(coalesce(new.delivery_way_id, '')), '');
  new.pickup_way_id := nullif(trim(coalesce(new.pickup_way_id, new.pickup_id, '')), '');
  new.pickup_id := nullif(trim(coalesce(new.pickup_id, new.pickup_way_id, '')), '');
  new.merchant_code := nullif(trim(coalesce(new.merchant_code, split_part(coalesce(new.merchant, ''), ' - ', 1), '')), '');
  new.merchant_name := nullif(trim(coalesce(new.merchant_name, new.merchant, '')), '');

  v_item := coalesce(nullif(new.item_price, 0), public.be_gl_num(new.raw_row ->> 'item_price', 0), 0);
  v_fee := coalesce(nullif(new.delivery_fee_os, 0), nullif(new.deli_fee_os, 0), public.be_gl_num(new.raw_row ->> 'delivery_fee', 0), 0);
  v_sur := coalesce(nullif(new.surcharge, 0), public.be_gl_num(new.raw_row ->> 'surcharge', 0), 0);

  new.item_price := v_item;
  new.deli_fee_os := v_fee;
  new.delivery_fee_os := v_fee;
  new.std_deli := coalesce(nullif(new.std_deli, 0), v_fee, 0);
  new.max_deli := coalesce(nullif(new.max_deli, 0), v_fee, 0);
  new.cod_os := coalesce(nullif(new.cod_os, 0), v_item + v_fee, 0);
  new.final_cod := coalesce(nullif(new.final_cod, 0), v_item + v_fee + v_sur, 0);
  new.finance_deli := coalesce(nullif(new.finance_deli, 0), v_fee, 0);
  new.finance_cod := coalesce(nullif(new.finance_cod, 0), new.final_cod, 0);
  new.overall_status := coalesce(nullif(new.overall_status, ''), 'registered');
  new.operation_status := coalesce(nullif(new.operation_status, ''), 'data_entry_registered');
  new.financial_status := coalesce(nullif(new.financial_status, ''), 'pending_finance');
  new.finance_status := coalesce(nullif(new.finance_status, ''), 'pending_finance');
  new.validation_status := coalesce(nullif(new.validation_status, ''), 'valid');
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists be_delivery_waybill_normalize_biu on public.delivery_waybills;

create trigger be_delivery_waybill_normalize_biu
before insert or update on public.delivery_waybills
for each row
execute function public.be_delivery_waybill_normalize_biu();

create or replace function public.be_sync_waybill_to_finance_aiu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cod_id uuid;
  v_settlement_id text;
  v_invoice_id text;
begin
  if new.delivery_way_id is null or trim(new.delivery_way_id) = '' then
    return new;
  end if;

  insert into public.be_cod_ledger (
    pickup_id,
    pickup_way_id,
    delivery_way_id,
    merchant_code,
    merchant_name,
    recipient_name,
    cod_amount,
    cod_status,
    payload,
    updated_at
  )
  values (
    new.pickup_id,
    new.pickup_way_id,
    new.delivery_way_id,
    new.merchant_code,
    new.merchant_name,
    new.recipient_name,
    coalesce(new.finance_cod, new.final_cod, 0),
    case
      when coalesce(new.finance_cod, new.final_cod, 0) > 0 then 'pending_collection'
      else 'not_required'
    end,
    to_jsonb(new),
    now()
  )
  on conflict (delivery_way_id) do update set
    pickup_id = excluded.pickup_id,
    pickup_way_id = excluded.pickup_way_id,
    merchant_code = excluded.merchant_code,
    merchant_name = excluded.merchant_name,
    recipient_name = excluded.recipient_name,
    cod_amount = excluded.cod_amount,
    cod_status = case
      when public.be_cod_ledger.cod_status in ('handed_over_to_finance', 'finance_settled') then public.be_cod_ledger.cod_status
      else excluded.cod_status
    end,
    payload = coalesce(public.be_cod_ledger.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning cod_id into v_cod_id;

  insert into public.be_financial_settlements (
    pickup_id,
    pickup_way_id,
    delivery_way_id,
    cod_id,
    merchant_code,
    merchant_name,
    recipient_name,
    delivery_fee,
    gross_cod,
    finance_deli,
    finance_cod,
    settlement_status,
    payload,
    updated_at
  )
  values (
    new.pickup_id,
    new.pickup_way_id,
    new.delivery_way_id,
    v_cod_id,
    new.merchant_code,
    new.merchant_name,
    new.recipient_name,
    coalesce(new.finance_deli, new.deli_fee_os, 0),
    coalesce(new.finance_cod, new.final_cod, 0),
    coalesce(new.finance_deli, new.deli_fee_os, 0),
    coalesce(new.finance_cod, new.final_cod, 0),
    coalesce(new.finance_status, 'pending_finance'),
    to_jsonb(new),
    now()
  )
  on conflict (delivery_way_id) do update set
    cod_id = excluded.cod_id,
    pickup_id = excluded.pickup_id,
    pickup_way_id = excluded.pickup_way_id,
    merchant_code = excluded.merchant_code,
    merchant_name = excluded.merchant_name,
    recipient_name = excluded.recipient_name,
    delivery_fee = excluded.delivery_fee,
    gross_cod = excluded.gross_cod,
    finance_deli = excluded.finance_deli,
    finance_cod = excluded.finance_cod,
    settlement_status = case
      when public.be_financial_settlements.settlement_status = 'finance_settled' then public.be_financial_settlements.settlement_status
      else excluded.settlement_status
    end,
    payload = coalesce(public.be_financial_settlements.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning settlement_id into v_settlement_id;

  update public.be_cod_ledger
  set settlement_id = v_settlement_id,
      updated_at = now()
  where cod_id = v_cod_id;

  insert into public.be_customer_invoices (
    settlement_id,
    delivery_way_id,
    merchant_code,
    merchant_name,
    invoice_amount,
    invoice_status,
    payload,
    updated_at
  )
  values (
    v_settlement_id,
    new.delivery_way_id,
    new.merchant_code,
    new.merchant_name,
    coalesce(new.finance_deli, new.deli_fee_os, 0),
    'draft',
    to_jsonb(new),
    now()
  )
  on conflict (delivery_way_id) do update set
    settlement_id = excluded.settlement_id,
    merchant_code = excluded.merchant_code,
    merchant_name = excluded.merchant_name,
    invoice_amount = excluded.invoice_amount,
    payload = coalesce(public.be_customer_invoices.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning invoice_id into v_invoice_id;

  insert into public.be_enterprise_workflow_events (
    pickup_id,
    pickup_way_id,
    delivery_way_id,
    event_type,
    event_status,
    source_module,
    target_module,
    amount,
    payload
  )
  values (
    new.pickup_id,
    new.pickup_way_id,
    new.delivery_way_id,
    'DATA_ENTRY_TO_FINANCE_SYNC',
    coalesce(new.finance_status, 'pending_finance'),
    'data_entry',
    'finance',
    coalesce(new.finance_cod, new.final_cod, 0),
    jsonb_build_object(
      'cod_id', v_cod_id,
      'settlement_id', v_settlement_id,
      'invoice_id', v_invoice_id
    )
  );

  return new;
end;
$$;

drop trigger if exists be_delivery_waybill_finance_aiu on public.delivery_waybills;

create trigger be_delivery_waybill_finance_aiu
after insert or update on public.delivery_waybills
for each row
execute function public.be_sync_waybill_to_finance_aiu();

-- ============================================================
-- 6) DATA ENTRY BULK REGISTER RPC
-- ============================================================

create or replace function public.be_data_entry_register_bulk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_rows jsonb := coalesce(p_payload -> 'rows', '[]'::jsonb);
  v_total int := jsonb_array_length(coalesce(p_payload -> 'rows', '[]'::jsonb));
  v_upserted int := 0;
  v_row jsonb;
  v_idx int := 0;
  v_pickup_date date;
  v_delivery_way_id text;
  v_pickup_way_id text;
  v_merchant_code text;
  v_item_price numeric;
  v_deli_fee numeric;
  v_surcharge numeric;
  v_final_cod numeric;
begin
  insert into public.be_data_entry_register_batches (
    batch_id,
    source_file_name,
    uploaded_by,
    uploaded_by_name,
    total_rows,
    status,
    payload
  )
  values (
    v_batch,
    p_payload ->> 'source_file_name',
    p_payload ->> 'uploaded_by',
    p_payload ->> 'uploaded_by_name',
    v_total,
    'registered',
    p_payload
  );

  for v_row in
    select * from jsonb_array_elements(v_rows)
  loop
    v_idx := v_idx + 1;

    begin
      v_pickup_date := coalesce(nullif(v_row ->> 'pickup_date', '')::date, current_date);
    exception when others then
      v_pickup_date := current_date;
    end;

    v_merchant_code := public.be_gl_code(coalesce(v_row ->> 'merchant_code', v_row ->> 'merchant'), 'GEN');
    v_pickup_way_id := nullif(coalesce(v_row ->> 'pickup_way_id', v_row ->> 'pickup_id'), '');
    if v_pickup_way_id is null then
      v_pickup_way_id := public.be_gl_pickup_id(v_pickup_date, v_merchant_code, 1);
    end if;

    v_delivery_way_id := nullif(coalesce(v_row ->> 'delivery_way_id', v_row ->> 'way_id', v_row ->> 'tracking_no'), '');
    if v_delivery_way_id is null then
      v_delivery_way_id := public.be_gl_delivery_id(v_pickup_date, v_merchant_code, v_idx);
    end if;

    v_item_price := public.be_gl_num(coalesce(v_row ->> 'item_price', v_row ->> 'cod_amount'), 0);
    v_deli_fee := public.be_gl_num(coalesce(v_row ->> 'delivery_fee', v_row ->> 'deli_fee_os', v_row ->> 'deli_fee'), 0);
    v_surcharge := public.be_gl_num(v_row ->> 'surcharge', 0);
    v_final_cod := coalesce(nullif(public.be_gl_num(coalesce(v_row ->> 'actual_collect', v_row ->> 'final_cod'), 0), 0), v_item_price + v_deli_fee + v_surcharge);

    insert into public.delivery_waybills (
      pickup_date,
      pickup_way_id,
      pickup_id,
      delivery_way_id,
      merchant_code,
      merchant_name,
      merchant,
      recipient_name,
      recipient_phone,
      recipient_phone_2,
      recipient_township,
      recipient_address,
      item_price,
      deli_fee_os,
      delivery_fee_os,
      cod_os,
      std_deli,
      max_deli,
      weight_kg,
      surcharge,
      final_cod,
      destination,
      pickup_by_1,
      general_remarks,
      finance_deli,
      finance_cod,
      finance_received_by,
      finance_status,
      operation_status,
      overall_status,
      financial_status,
      validation_status,
      validation_errors,
      raw_row,
      created_by,
      created_by_name,
      updated_at
    )
    values (
      v_pickup_date,
      v_pickup_way_id,
      v_pickup_way_id,
      v_delivery_way_id,
      v_merchant_code,
      nullif(coalesce(v_row ->> 'merchant_name', v_row ->> 'merchant'), ''),
      nullif(coalesce(v_row ->> 'merchant', v_row ->> 'merchant_name'), ''),
      nullif(v_row ->> 'recipient_name', ''),
      nullif(coalesce(v_row ->> 'recipient_phone', v_row ->> 'contact_no_1', v_row ->> 'phone'), ''),
      nullif(coalesce(v_row ->> 'recipient_phone_2', v_row ->> 'contact_no_2'), ''),
      nullif(coalesce(v_row ->> 'recipient_township', v_row ->> 'township', v_row ->> 'town'), ''),
      nullif(coalesce(v_row ->> 'recipient_address', v_row ->> 'address'), ''),
      v_item_price,
      v_deli_fee,
      v_deli_fee,
      v_item_price + v_deli_fee,
      v_deli_fee,
      v_deli_fee,
      public.be_gl_num(coalesce(v_row ->> 'weight_kg', v_row ->> 'weight'), 0),
      v_surcharge,
      v_final_cod,
      nullif(coalesce(v_row ->> 'destination', v_row ->> 'city'), ''),
      nullif(coalesce(v_row ->> 'pickup_by', v_row ->> 'pickup_by_1'), ''),
      nullif(coalesce(v_row ->> 'remark', v_row ->> 'remarks', v_row ->> 'general_remarks'), ''),
      v_deli_fee,
      v_final_cod,
      nullif(v_row ->> 'finance_received_by', ''),
      coalesce(nullif(v_row ->> 'finance_status', ''), 'pending_finance'),
      'data_entry_registered',
      'registered',
      'pending_finance',
      'valid',
      '[]'::jsonb,
      v_row,
      p_payload ->> 'uploaded_by',
      p_payload ->> 'uploaded_by_name',
      now()
    )
    on conflict (delivery_way_id) do update set
      pickup_date = excluded.pickup_date,
      pickup_way_id = excluded.pickup_way_id,
      pickup_id = excluded.pickup_id,
      merchant_code = excluded.merchant_code,
      merchant_name = excluded.merchant_name,
      merchant = excluded.merchant,
      recipient_name = excluded.recipient_name,
      recipient_phone = excluded.recipient_phone,
      recipient_phone_2 = excluded.recipient_phone_2,
      recipient_township = excluded.recipient_township,
      recipient_address = excluded.recipient_address,
      item_price = excluded.item_price,
      deli_fee_os = excluded.deli_fee_os,
      delivery_fee_os = excluded.delivery_fee_os,
      cod_os = excluded.cod_os,
      std_deli = excluded.std_deli,
      max_deli = excluded.max_deli,
      weight_kg = excluded.weight_kg,
      surcharge = excluded.surcharge,
      final_cod = excluded.final_cod,
      destination = excluded.destination,
      pickup_by_1 = excluded.pickup_by_1,
      general_remarks = excluded.general_remarks,
      finance_deli = excluded.finance_deli,
      finance_cod = excluded.finance_cod,
      finance_status = excluded.finance_status,
      operation_status = excluded.operation_status,
      overall_status = excluded.overall_status,
      financial_status = excluded.financial_status,
      validation_status = excluded.validation_status,
      validation_errors = excluded.validation_errors,
      raw_row = excluded.raw_row,
      updated_at = now();

    insert into public.be_data_entry_register_rows (
      batch_id,
      row_no,
      source_file_name,
      pickup_date,
      pickup_way_id,
      delivery_way_id,
      merchant_code,
      merchant_name,
      recipient_name,
      recipient_phone,
      recipient_township,
      recipient_address,
      item_price,
      deli_fee_os,
      delivery_fee_os,
      cod_os,
      std_deli,
      max_deli,
      weight_kg,
      surcharge,
      final_cod,
      destination,
      pickup_by_1,
      general_remarks,
      finance_deli,
      finance_cod,
      finance_received_by,
      finance_status,
      operation_status,
      overall_status,
      financial_status,
      validation_status,
      validation_errors,
      raw_row,
      created_by,
      created_by_name,
      updated_at
    )
    values (
      v_batch,
      v_idx,
      p_payload ->> 'source_file_name',
      v_pickup_date,
      v_pickup_way_id,
      v_delivery_way_id,
      v_merchant_code,
      nullif(coalesce(v_row ->> 'merchant_name', v_row ->> 'merchant'), ''),
      nullif(v_row ->> 'recipient_name', ''),
      nullif(coalesce(v_row ->> 'recipient_phone', v_row ->> 'contact_no_1', v_row ->> 'phone'), ''),
      nullif(coalesce(v_row ->> 'recipient_township', v_row ->> 'township', v_row ->> 'town'), ''),
      nullif(coalesce(v_row ->> 'recipient_address', v_row ->> 'address'), ''),
      v_item_price,
      v_deli_fee,
      v_deli_fee,
      v_item_price + v_deli_fee,
      v_deli_fee,
      v_deli_fee,
      public.be_gl_num(coalesce(v_row ->> 'weight_kg', v_row ->> 'weight'), 0),
      v_surcharge,
      v_final_cod,
      nullif(coalesce(v_row ->> 'destination', v_row ->> 'city'), ''),
      nullif(coalesce(v_row ->> 'pickup_by', v_row ->> 'pickup_by_1'), ''),
      nullif(coalesce(v_row ->> 'remark', v_row ->> 'remarks', v_row ->> 'general_remarks'), ''),
      v_deli_fee,
      v_final_cod,
      nullif(v_row ->> 'finance_received_by', ''),
      coalesce(nullif(v_row ->> 'finance_status', ''), 'pending_finance'),
      'data_entry_registered',
      'registered',
      'pending_finance',
      'valid',
      '[]'::jsonb,
      v_row,
      p_payload ->> 'uploaded_by',
      p_payload ->> 'uploaded_by_name',
      now()
    )
    on conflict (delivery_way_id) do update set
      batch_id = excluded.batch_id,
      row_no = excluded.row_no,
      item_price = excluded.item_price,
      deli_fee_os = excluded.deli_fee_os,
      finance_cod = excluded.finance_cod,
      raw_row = excluded.raw_row,
      updated_at = now();

    v_upserted := v_upserted + 1;
  end loop;

  update public.be_data_entry_register_batches
  set valid_rows = (
        select count(*)
        from public.be_data_entry_register_rows
        where batch_id = v_batch
          and validation_status = 'valid'
      ),
      rejected_rows = (
        select count(*)
        from public.be_data_entry_register_rows
        where batch_id = v_batch
          and validation_status <> 'valid'
      ),
      updated_at = now()
  where batch_id = v_batch;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch,
    'total_rows', v_total,
    'upserted_rows', v_upserted,
    'synced_to_delivery_waybills', true,
    'synced_to_finance', true
  );
end;
$$;

-- ============================================================
-- 7) FINANCE ACTIONS / DASHBOARDS
-- ============================================================

create or replace function public.be_go_live_finance_backfill()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.delivery_waybills
  set updated_at = now()
  where delivery_way_id is not null;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'delivery_waybills_touched', v_count,
    'cod_ledger_rows', (select count(*) from public.be_cod_ledger),
    'settlement_rows', (select count(*) from public.be_financial_settlements),
    'invoice_rows', (select count(*) from public.be_customer_invoices)
  );
end;
$$;

create or replace function public.be_cod_mark_collected(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(coalesce(p_payload ->> 'delivery_way_id', p_payload ->> 'way_id'), '');
  v_amt numeric := coalesce(public.be_gl_num(coalesce(p_payload ->> 'amount', p_payload ->> 'collected_amount'), 0), 0);
  v_id uuid;
begin
  update public.be_cod_ledger
  set collected_amount = case when v_amt > 0 then v_amt else cod_amount end,
      variance_amount = (case when v_amt > 0 then v_amt else cod_amount end) - cod_amount,
      cod_status = 'collected',
      collected_at = now(),
      rider_id = coalesce(nullif(p_payload ->> 'rider_id', ''), rider_id),
      rider_name = coalesce(nullif(p_payload ->> 'rider_name', ''), rider_name),
      payload = coalesce(payload, '{}'::jsonb) || p_payload,
      updated_at = now()
  where delivery_way_id = v_way
  returning cod_id into v_id;

  if v_id is null then
    raise exception 'COD ledger row not found for %', v_way;
  end if;

  return jsonb_build_object('ok', true, 'cod_id', v_id, 'status', 'collected');
end;
$$;

create or replace function public.be_cod_mark_handover(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(coalesce(p_payload ->> 'delivery_way_id', p_payload ->> 'way_id'), '');
  v_amt numeric := coalesce(public.be_gl_num(coalesce(p_payload ->> 'amount', p_payload ->> 'handover_amount'), 0), 0);
  v_id uuid;
  v_set text;
begin
  update public.be_cod_ledger
  set handover_amount = case when v_amt > 0 then v_amt else coalesce(nullif(collected_amount, 0), cod_amount) end,
      variance_amount = (case when v_amt > 0 then v_amt else coalesce(nullif(collected_amount, 0), cod_amount) end) - cod_amount,
      cod_status = 'handed_over_to_finance',
      handed_over_at = now(),
      received_by = coalesce(nullif(p_payload ->> 'received_by', ''), received_by),
      received_by_name = coalesce(nullif(p_payload ->> 'received_by_name', ''), received_by_name),
      payload = coalesce(payload, '{}'::jsonb) || p_payload,
      updated_at = now()
  where delivery_way_id = v_way
  returning cod_id, settlement_id into v_id, v_set;

  if v_id is null then
    raise exception 'COD ledger row not found for %', v_way;
  end if;

  update public.be_financial_settlements
  set handover_amount = (
        select handover_amount
        from public.be_cod_ledger
        where cod_id = v_id
      ),
      variance_amount = (
        select variance_amount
        from public.be_cod_ledger
        where cod_id = v_id
      ),
      settlement_status = 'handed_over_to_finance',
      payload = coalesce(payload, '{}'::jsonb) || p_payload,
      updated_at = now()
  where settlement_id = v_set
     or delivery_way_id = v_way;

  return jsonb_build_object('ok', true, 'cod_id', v_id, 'settlement_id', v_set, 'status', 'handed_over_to_finance');
end;
$$;

create or replace function public.be_finance_close_settlement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(coalesce(p_payload ->> 'delivery_way_id', p_payload ->> 'way_id'), '');
  v_set text := nullif(p_payload ->> 'settlement_id', '');
  v_closed text := nullif(p_payload ->> 'closed_by', '');
  v_closed_name text := nullif(p_payload ->> 'closed_by_name', '');
  v_final_set text;
begin
  update public.be_financial_settlements
  set settlement_status = 'finance_settled',
      finance_note = coalesce(nullif(p_payload ->> 'finance_note', ''), finance_note),
      closed_by = coalesce(v_closed, closed_by),
      closed_by_name = coalesce(v_closed_name, closed_by_name),
      closed_at = now(),
      payload = coalesce(payload, '{}'::jsonb) || p_payload,
      updated_at = now()
  where (v_set is not null and settlement_id = v_set)
     or (v_way is not null and delivery_way_id = v_way)
  returning settlement_id into v_final_set;

  if v_final_set is null then
    raise exception 'Settlement not found';
  end if;

  update public.be_cod_ledger
  set cod_status = 'finance_settled',
      updated_at = now()
  where settlement_id = v_final_set
     or delivery_way_id = v_way;

  update public.delivery_waybills
  set finance_status = 'finance_settled',
      financial_status = 'finance_settled',
      overall_status = 'finance_settled',
      updated_at = now()
  where delivery_way_id = v_way
     or delivery_way_id in (
       select delivery_way_id
       from public.be_financial_settlements
       where settlement_id = v_final_set
     );

  insert into public.be_finance_journal_entries (
    settlement_id,
    delivery_way_id,
    account_code,
    account_name,
    debit,
    credit,
    description,
    payload
  )
  select
    s.settlement_id,
    s.delivery_way_id,
    '4001',
    'Delivery Fee Income',
    0,
    coalesce(s.finance_deli, s.delivery_fee, 0),
    'Finance settlement closed',
    to_jsonb(s)
  from public.be_financial_settlements s
  where s.settlement_id = v_final_set;

  return jsonb_build_object(
    'ok', true,
    'settlement_id', v_final_set,
    'status', 'finance_settled'
  );
end;
$$;

create or replace function public.be_finance_snapshot(
  p_status text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := nullif(p_status, '');
  v_limit integer := greatest(coalesce(p_limit, 100), 1);
  v_cod jsonb;
  v_settlements jsonb;
  v_invoices jsonb;
  v_journal jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_cod
  from (
    select *
    from public.be_cod_ledger
    where v_status is null
       or cod_status = v_status
    order by updated_at desc
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_settlements
  from (
    select *
    from public.be_financial_settlements
    where v_status is null
       or settlement_status = v_status
    order by updated_at desc
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_invoices
  from (
    select *
    from public.be_customer_invoices
    order by updated_at desc
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
  into v_journal
  from (
    select *
    from public.be_finance_journal_entries
    order by created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'kpis', jsonb_build_object(
      'cod_pending', (select count(*) from public.be_cod_ledger where cod_status = 'pending_collection'),
      'cod_collected', (select count(*) from public.be_cod_ledger where cod_status = 'collected'),
      'cod_handed_over', (select count(*) from public.be_cod_ledger where cod_status = 'handed_over_to_finance'),
      'finance_pending', (select count(*) from public.be_financial_settlements where settlement_status = 'pending_finance'),
      'finance_settled', (select count(*) from public.be_financial_settlements where settlement_status = 'finance_settled'),
      'total_receivable', (select coalesce(sum(gross_cod), 0) from public.be_financial_settlements),
      'total_handover', (select coalesce(sum(handover_amount), 0) from public.be_financial_settlements),
      'variance', (select coalesce(sum(variance_amount), 0) from public.be_financial_settlements),
      'delivery_fee_income', (select coalesce(sum(finance_deli), 0) from public.be_financial_settlements)
    ),
    'cod_rows', v_cod,
    'settlements', v_settlements,
    'invoices', v_invoices,
    'journal', v_journal,
    'reports', jsonb_build_object(
      'cashBookSummary', jsonb_build_array(jsonb_build_object(
        'branch', 'YGN',
        'zone', 'Yangon',
        'report_date', current_date,
        'account_description', 'Cash / COD Handover',
        'received', (select coalesce(sum(handover_amount), 0) from public.be_financial_settlements)
      )),
      'incomeStatement', jsonb_build_array(jsonb_build_object(
        'code_no', '4001',
        'description', 'Delivery Fee Income',
        'category', 'income',
        'amount', (select coalesce(sum(finance_deli), 0) from public.be_financial_settlements)
      )),
      'profitAndLoss', jsonb_build_array(jsonb_build_object(
        'code_no', '4000',
        'description', 'Operating Revenue',
        'category', 'income',
        'amount', (select coalesce(sum(finance_deli), 0) from public.be_financial_settlements)
      ))
    ),
    'synced_at', now()
  );
end;
$$;

create or replace function public.be_go_live_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with checks as (
    select
      'delivery_waybills_schema'::text as check_code,
      exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'delivery_waybills'
          and column_name = 'deli_fee_os'
      )
      and exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'delivery_waybills'
          and column_name = 'finance_status'
      ) as passed,
      'delivery_waybills has Excel and Finance columns'::text as message
    union all
    select
      'finance_tables',
      to_regclass('public.be_cod_ledger') is not null
        and to_regclass('public.be_financial_settlements') is not null
        and to_regclass('public.be_finance_journal_entries') is not null,
      'COD, settlement and journal tables exist'
    union all
    select
      'finance_rpc',
      to_regprocedure('public.be_finance_snapshot(text,integer)') is not null
        and to_regprocedure('public.be_finance_close_settlement(jsonb)') is not null,
      'Finance RPCs exist'
    union all
    select
      'data_entry_to_finance_sync',
      (select count(*) from public.delivery_waybills where delivery_way_id is not null) = 0
        or (select count(*) from public.be_financial_settlements) >=
           (select count(*) from public.delivery_waybills where delivery_way_id is not null),
      'Every delivery waybill should have a settlement row'
  )
  select jsonb_build_object(
    'checks', coalesce(jsonb_agg(row_to_json(checks)::jsonb), '[]'::jsonb),
    'passed', bool_and(passed),
    'kpis', public.be_finance_snapshot(null, 50) -> 'kpis',
    'synced_at', now()
  )
  from checks;
$$;

create or replace function public.be_go_live_purge_mock_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted jsonb := '[]'::jsonb;
  v_count integer;
begin
  delete from public.delivery_waybills
  where lower(coalesce(raw_row ->> 'source', '')) in ('mock', 'sample', 'demo')
     or upper(coalesce(delivery_way_id, '')) like 'MOCK%'
     or upper(coalesce(delivery_way_id, '')) like 'SAMPLE%';

  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('table', 'delivery_waybills', 'rows', v_count));

  delete from public.be_cod_ledger
  where lower(coalesce(payload ->> 'source', '')) in ('mock', 'sample', 'demo')
     or upper(coalesce(delivery_way_id, '')) like 'MOCK%'
     or upper(coalesce(delivery_way_id, '')) like 'SAMPLE%';

  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('table', 'be_cod_ledger', 'rows', v_count));

  delete from public.be_financial_settlements
  where lower(coalesce(payload ->> 'source', '')) in ('mock', 'sample', 'demo')
     or upper(coalesce(delivery_way_id, '')) like 'MOCK%'
     or upper(coalesce(delivery_way_id, '')) like 'SAMPLE%';

  get diagnostics v_count = row_count;
  v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('table', 'be_financial_settlements', 'rows', v_count));

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

-- ============================================================
-- 8) RLS / GRANTS / CACHE RELOAD
-- ============================================================

alter table public.delivery_waybills enable row level security;
alter table public.be_enterprise_workflow_events enable row level security;
alter table public.be_cod_ledger enable row level security;
alter table public.be_financial_settlements enable row level security;
alter table public.be_finance_journal_entries enable row level security;
alter table public.be_customer_invoices enable row level security;
alter table public.be_data_entry_register_batches enable row level security;
alter table public.be_data_entry_register_rows enable row level security;

drop policy if exists delivery_waybills_read_all on public.delivery_waybills;
drop policy if exists delivery_waybills_write_all on public.delivery_waybills;
drop policy if exists workflow_events_read_all on public.be_enterprise_workflow_events;
drop policy if exists workflow_events_write_all on public.be_enterprise_workflow_events;
drop policy if exists cod_ledger_read_all on public.be_cod_ledger;
drop policy if exists cod_ledger_write_all on public.be_cod_ledger;
drop policy if exists settlements_read_all on public.be_financial_settlements;
drop policy if exists settlements_write_all on public.be_financial_settlements;
drop policy if exists finance_journal_read_all on public.be_finance_journal_entries;
drop policy if exists finance_journal_write_all on public.be_finance_journal_entries;
drop policy if exists invoices_read_all on public.be_customer_invoices;
drop policy if exists invoices_write_all on public.be_customer_invoices;
drop policy if exists der_batches_read_all on public.be_data_entry_register_batches;
drop policy if exists der_batches_write_all on public.be_data_entry_register_batches;
drop policy if exists der_rows_read_all on public.be_data_entry_register_rows;
drop policy if exists der_rows_write_all on public.be_data_entry_register_rows;

create policy delivery_waybills_read_all on public.delivery_waybills for select to anon, authenticated using (true);
create policy delivery_waybills_write_all on public.delivery_waybills for all to anon, authenticated using (true) with check (true);
create policy workflow_events_read_all on public.be_enterprise_workflow_events for select to anon, authenticated using (true);
create policy workflow_events_write_all on public.be_enterprise_workflow_events for all to anon, authenticated using (true) with check (true);
create policy cod_ledger_read_all on public.be_cod_ledger for select to anon, authenticated using (true);
create policy cod_ledger_write_all on public.be_cod_ledger for all to anon, authenticated using (true) with check (true);
create policy settlements_read_all on public.be_financial_settlements for select to anon, authenticated using (true);
create policy settlements_write_all on public.be_financial_settlements for all to anon, authenticated using (true) with check (true);
create policy finance_journal_read_all on public.be_finance_journal_entries for select to anon, authenticated using (true);
create policy finance_journal_write_all on public.be_finance_journal_entries for all to anon, authenticated using (true) with check (true);
create policy invoices_read_all on public.be_customer_invoices for select to anon, authenticated using (true);
create policy invoices_write_all on public.be_customer_invoices for all to anon, authenticated using (true) with check (true);
create policy der_batches_read_all on public.be_data_entry_register_batches for select to anon, authenticated using (true);
create policy der_batches_write_all on public.be_data_entry_register_batches for all to anon, authenticated using (true) with check (true);
create policy der_rows_read_all on public.be_data_entry_register_rows for select to anon, authenticated using (true);
create policy der_rows_write_all on public.be_data_entry_register_rows for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.be_master_data_tabs to anon, authenticated;
grant select, insert, update, delete on public.be_master_data_columns to anon, authenticated;
grant select, insert, update, delete on public.be_master_data_rows to anon, authenticated;
grant select on public.be_v_master_data_live_rows to anon, authenticated;

grant select, insert, update, delete on public.delivery_waybills to anon, authenticated;
grant select, insert, update, delete on public.be_enterprise_workflow_events to anon, authenticated;
grant select, insert, update, delete on public.be_cod_ledger to anon, authenticated;
grant select, insert, update, delete on public.be_financial_settlements to anon, authenticated;
grant select, insert, update, delete on public.be_finance_journal_entries to anon, authenticated;
grant select, insert, update, delete on public.be_customer_invoices to anon, authenticated;
grant select, insert, update, delete on public.be_data_entry_register_batches to anon, authenticated;
grant select, insert, update, delete on public.be_data_entry_register_rows to anon, authenticated;

grant execute on function public.be_master_data_upsert_column(text,text,text,text,text,boolean,boolean,boolean,jsonb,integer) to anon, authenticated;
grant execute on function public.be_master_data_upsert_record(text,text,jsonb,text) to anon, authenticated;
grant execute on function public.be_master_data_delete_record(text,text,text) to anon, authenticated;
grant execute on function public.be_master_data_bulk_upsert_records(text,jsonb,text) to anon, authenticated;
grant execute on function public.be_master_data_page_snapshot() to anon, authenticated;
grant execute on function public.be_master_data_healthcheck() to anon, authenticated;

grant execute on function public.be_data_entry_register_bulk(jsonb) to anon, authenticated;
grant execute on function public.be_go_live_finance_backfill() to anon, authenticated;
grant execute on function public.be_cod_mark_collected(jsonb) to anon, authenticated;
grant execute on function public.be_cod_mark_handover(jsonb) to anon, authenticated;
grant execute on function public.be_finance_close_settlement(jsonb) to anon, authenticated;
grant execute on function public.be_finance_snapshot(text, integer) to anon, authenticated;
grant execute on function public.be_go_live_readiness_snapshot() to anon, authenticated;
grant execute on function public.be_go_live_purge_mock_data() to anon, authenticated;

select public.be_go_live_finance_backfill();

notify pgrst, 'reload schema';

-- ============================================================
-- Verification commands after running this file:
--
-- select public.be_master_data_healthcheck();
-- select public.be_go_live_readiness_snapshot();
-- select public.be_finance_snapshot(null, 10) -> 'kpis';
-- ============================================================
