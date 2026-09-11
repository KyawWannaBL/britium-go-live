alter table public.be_portal_pickup_requests
  add column if not exists parcel_count integer default 1,
  add column if not exists number_of_parcels integer default 1,
  add column if not exists total_parcels integer default 1,
  add column if not exists delivery_way_count integer default 1,
  add column if not exists data_entry_status text default 'PENDING',
  add column if not exists data_entry_completed_at timestamptz;

create table if not exists public.be_portal_pickup_request_items (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  line_no integer,
  tracking_no text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  delivery_township text,
  cod_amount numeric default 0,
  item_value numeric default 0,
  weight_kg numeric default 0,
  payment_method text default 'COD',
  parcel_count integer default 1,
  item_status text default 'DATA_ENTRY_REGISTERED',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_request_items
  add column if not exists pickup_id text,
  add column if not exists line_no integer,
  add column if not exists tracking_no text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_township text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists item_value numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists payment_method text default 'COD',
  add column if not exists parcel_count integer default 1,
  add column if not exists item_status text default 'DATA_ENTRY_REGISTERED',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_be_pickup_items_pickup_id
  on public.be_portal_pickup_request_items(pickup_id);
