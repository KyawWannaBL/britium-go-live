-- Master Data Portal CRUD compatibility patch
-- Run in Supabase SQL Editor if Add/Edit/Delete fails because of missing tables/columns or RLS.
-- This patch is intentionally additive and safe to rerun.

create extension if not exists pgcrypto;

create table if not exists public.merchant_master (
  merchant_id text primary key,
  merchant_code text,
  merchant_name text,
  phone_primary text,
  address_line_1 text,
  township text,
  city text,
  region_state text,
  business_type text,
  payment_terms text default 'COD',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.merchant_master
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists phone_primary text,
  add column if not exists address_line_1 text,
  add column if not exists township text,
  add column if not exists city text,
  add column if not exists region_state text,
  add column if not exists business_type text,
  add column if not exists payment_terms text default 'COD',
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.townships (
  id uuid primary key default gen_random_uuid(),
  township_code text unique,
  township_name text,
  township_mm text,
  city text default 'Yangon',
  region_state text default 'Yangon',
  zone text,
  delivery_fee numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.townships
  add column if not exists township_code text,
  add column if not exists township_name text,
  add column if not exists township_mm text,
  add column if not exists city text default 'Yangon',
  add column if not exists region_state text default 'Yangon',
  add column if not exists zone text,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.staff_master (
  id uuid primary key default gen_random_uuid(),
  staff_code text unique,
  full_name text,
  staff_type text,
  role_name text,
  phone text,
  email text,
  branch_name text,
  warehouse_id uuid,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vehicle_master (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text unique,
  registration_no text,
  vehicle_type text,
  display_name text,
  capacity_kg numeric default 0,
  warehouse_id uuid,
  status text default 'available',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.asset_master (
  id uuid primary key default gen_random_uuid(),
  asset_code text unique,
  asset_type text,
  model_name text,
  serial_no text,
  status text default 'available',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.staff_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid,
  asset_id uuid,
  vehicle_id uuid,
  status text default 'assigned',
  notes text,
  assigned_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  actor_staff_id uuid,
  next_staff_id uuid,
  shipment_id uuid,
  process_step text,
  territory_code text,
  scan_channel text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.workflow_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  responsible_staff_id uuid,
  status text default 'pending',
  due_at timestamptz,
  reminder_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.be_master_data_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'merchant_master',
    'townships',
    'staff_master',
    'vehicle_master',
    'asset_master',
    'staff_asset_assignments',
    'workflow_acknowledgements'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || tbl || '_touch_updated_at', tbl);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.be_master_data_touch_updated_at()',
      'trg_' || tbl || '_touch_updated_at',
      tbl
    );
  end loop;
end $$;

-- RLS policies for authenticated portal users.
-- Adjust these policies if you need stricter role-based access.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'merchant_master',
    'townships',
    'staff_master',
    'vehicle_master',
    'asset_master',
    'staff_asset_assignments',
    'qr_scan_events',
    'workflow_acknowledgements'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_select_auth', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_insert_auth', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_update_auth', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_delete_auth', tbl);

    execute format('create policy %I on public.%I for select to authenticated using (true)', tbl || '_select_auth', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', tbl || '_insert_auth', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', tbl || '_update_auth', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', tbl || '_delete_auth', tbl);
  end loop;
end $$;
