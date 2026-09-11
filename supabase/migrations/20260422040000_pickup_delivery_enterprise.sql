create extension if not exists pgcrypto;

create table if not exists public.document_daily_sequences (
  seq_date date not null,
  org_abbr text not null,
  seq_kind text not null check (seq_kind in ('P', 'D')),
  last_seq integer not null default 0,
  primary key (seq_date, org_abbr, seq_kind)
);

create or replace function public.reserve_document_id(
  p_seq_date date,
  p_org_abbr text,
  p_seq_kind text,
  p_existing_id text default null
)
returns text
language plpgsql
as $$
declare
  v_seq integer;
  v_prefix text;
begin
  if p_existing_id is not null and btrim(p_existing_id) <> '' then
    return p_existing_id;
  end if;

  insert into public.document_daily_sequences (seq_date, org_abbr, seq_kind, last_seq)
  values (p_seq_date, upper(p_org_abbr), upper(p_seq_kind), 1)
  on conflict (seq_date, org_abbr, seq_kind)
  do update set last_seq = public.document_daily_sequences.last_seq + 1
  returning last_seq into v_seq;

  v_prefix := case upper(p_seq_kind)
    when 'P' then 'P'
    else 'D'
  end;

  return v_prefix || to_char(p_seq_date, 'MMDD') || '-' || upper(p_org_abbr) || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

create table if not exists public.pickup_batches (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null unique,
  pickup_date date not null,
  org_abbr text not null,
  source_type text not null check (source_type in ('MER', 'CUS', 'OS', 'DEO')),
  merchant_name text not null,
  merchant_code text,
  contact_name text,
  contact_phone text,
  pickup_address text,
  pickup_township text,
  pickup_by text,
  total_way_count integer not null default 1,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pickup_batches_pickup_date on public.pickup_batches(pickup_date);
create index if not exists idx_pickup_batches_org_abbr on public.pickup_batches(org_abbr);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  pickup_batch_id uuid references public.pickup_batches(id) on delete cascade,
  pickup_id text not null,
  line_no integer not null,
  receiver_name text not null,
  receiver_phone text not null,
  township text,
  destination text,
  delivery_address text not null,
  remarks text,
  weight_kg numeric not null default 0,
  item_price numeric not null default 0,
  item_payment_status text not null default 'UNPAID' check (item_payment_status in ('PAID', 'UNPAID')),
  merchant_customer_delivery_charge numeric not null default 0,
  delivery_payment_status text not null default 'UNPAID' check (delivery_payment_status in ('PAID', 'UNPAID')),
  service_type text not null default 'standard',
  base_weight_kg numeric not null default 3,
  base_delivery_fee numeric not null default 0,
  overweight_kg numeric not null default 0,
  overweight_per_kg numeric not null default 0,
  overweight_surcharge numeric not null default 0,
  os_delivery_charge numeric not null default 0,
  printed_waybill_delivery_charge numeric not null default 0,
  os_total_cod numeric not null default 0,
  waybill_total_cod numeric not null default 0,
  receivable numeric not null default 0,
  qr_value text,
  qr_data_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_delivery_orders_pickup_line_no
on public.delivery_orders(pickup_id, line_no);

create index if not exists idx_delivery_orders_pickup_batch_id
on public.delivery_orders(pickup_batch_id);

create table if not exists public.delivery_evidence (
  id uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.delivery_orders(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.tariff_rate_cards (
  id uuid primary key default gen_random_uuid(),
  service_type text not null,
  township text,
  base_weight_kg numeric not null default 3,
  base_delivery_fee numeric not null default 4000,
  overweight_per_kg numeric not null default 2500,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tariff_rate_cards_unique
on public.tariff_rate_cards(service_type, coalesce(township, ''));

insert into public.tariff_rate_cards(service_type, township, base_weight_kg, base_delivery_fee, overweight_per_kg)
values
  ('standard', null, 3, 4000, 2500),
  ('same_day', null, 3, 6000, 3000),
  ('next_day', null, 3, 3500, 2000),
  ('scheduled', null, 3, 4500, 2500)
on conflict do nothing;