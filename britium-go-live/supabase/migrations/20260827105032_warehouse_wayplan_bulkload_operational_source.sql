create table if not exists public.be_wayplan_inventory_bulkload (
  delivery_way_id text primary key,
  pickup_way_id text not null,
  source_status text not null check (source_status in ('Inbound','Failed')),
  priority integer not null default 2,
  route_bucket text,
  merchant_name text,
  merchant_code text,
  recipient_name text,
  recipient_phone text,
  township text,
  recipient_address text,
  destination text,
  item_price numeric not null default 0,
  delivery_fee numeric not null default 0,
  weight_kg numeric not null default 0,
  surcharge numeric not null default 0,
  cod_amount numeric not null default 0,
  assignment_pool text,
  same_day_rule text,
  suggested_sequence text,
  pickup_date date,
  remarks text,
  source_file_name text not null,
  active boolean not null default true,
  loaded_at timestamptz not null default now()
);

alter table public.be_wayplan_inventory_bulkload enable row level security;
revoke all on public.be_wayplan_inventory_bulkload from anon, authenticated;

create index if not exists be_wayplan_inventory_bulkload_active_route_idx
on public.be_wayplan_inventory_bulkload(active, priority, route_bucket, delivery_way_id);;
