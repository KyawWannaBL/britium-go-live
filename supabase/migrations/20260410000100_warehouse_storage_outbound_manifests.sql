create extension if not exists pgcrypto;

create table if not exists public.warehouse_storage_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  zone text not null,
  rack text not null,
  bin text not null,
  is_staging boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_storage_records (
  id uuid primary key default gen_random_uuid(),
  tracking_no text not null unique,
  shipment_id uuid null,
  location_id uuid null references public.warehouse_storage_locations(id) on delete set null,
  phase text not null default 'inbound',
  status text not null default 'received',
  notes text null,
  last_scan_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_storage_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid null references public.warehouse_storage_records(id) on delete cascade,
  tracking_no text not null,
  from_location_id uuid null references public.warehouse_storage_locations(id) on delete set null,
  to_location_id uuid null references public.warehouse_storage_locations(id) on delete set null,
  event_type text not null,
  note text null,
  actor_id text null,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_outbound_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  manifest_id uuid null,
  destination_name text not null,
  vehicle_no text null,
  driver_name text null,
  total_parcels integer not null default 0,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz null
);

create table if not exists public.warehouse_manifests (
  id uuid primary key default gen_random_uuid(),
  manifest_no text not null unique,
  destination_name text not null,
  vehicle_no text null,
  driver_name text null,
  total_parcels integer not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null
);

create table if not exists public.warehouse_manifest_items (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.warehouse_manifests(id) on delete cascade,
  tracking_no text not null,
  storage_record_id uuid null references public.warehouse_storage_records(id) on delete set null,
  batch_id uuid null references public.warehouse_outbound_batches(id) on delete set null,
  status text not null default 'manifested',
  created_at timestamptz not null default now()
);

create index if not exists idx_wh_storage_records_phase on public.warehouse_storage_records(phase);
create index if not exists idx_wh_storage_records_status on public.warehouse_storage_records(status);
create index if not exists idx_wh_events_tracking on public.warehouse_storage_events(tracking_no);
create index if not exists idx_wh_outbound_status on public.warehouse_outbound_batches(status);
create index if not exists idx_wh_manifest_items_manifest on public.warehouse_manifest_items(manifest_id);