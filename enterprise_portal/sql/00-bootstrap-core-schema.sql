-- ============================================================
-- Britium Express Clean Enterprise Portal
-- 00-bootstrap-core-schema.sql
-- Run this before 70-79 module RPC SQL files.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.be_user_account_registry (
  user_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text,
  role text not null default 'guest',
  email text,
  phone_number text,
  branch_code text default 'YGN',
  vehicle_type text,
  license_plate text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_merchants (
  merchant_id text primary key,
  merchant_code text unique not null,
  merchant_name text not null,
  contact_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text default 'Yangon',
  payment_profile text default 'COD',
  service_profile text default 'Standard',
  tariff_tier text default 'Standard',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_riders (
  rider_id text primary key,
  rider_name text not null,
  phone_primary text,
  nrc_or_id_no text,
  assigned_zone text,
  employment_type text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_drivers (
  driver_id text primary key,
  driver_name text not null,
  phone_primary text,
  license_no text,
  license_expiry_date text,
  assigned_fleet_id text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_masterdata_fleet (
  fleet_id text primary key,
  vehicle_no text,
  vehicle_type text,
  capacity_kg numeric,
  capacity_cbm numeric,
  assigned_driver_id text,
  ownership_type text,
  insurance_expiry_date text,
  status text,
  zone_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_mobile_workforce_accounts (
  worker_id text primary key,
  full_name text,
  role_type text not null,
  phone_number text,
  branch_code text default 'YGN',
  vehicle_type text,
  license_plate text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique not null,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  merchant_id text,
  merchant_code text,
  merchant_name text,
  sender_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text,
  recipient_name text,
  recipient_phone text,
  delivery_township text,
  delivery_address text,
  service_tier text default 'Standard',
  priority text default 'NORMAL',
  payment_method text default 'COD',
  cod_amount numeric default 0,
  cod_settled boolean default false,
  weight_kg numeric default 0,
  delivery_fee numeric default 0,
  status text not null default 'SUBMITTED',
  branch_code text default 'YGN',
  requester_type text default 'PORTAL',
  created_by uuid,
  assigned_rider_id text,
  assigned_rider_name text,
  route_label text,
  warehouse_location text,
  waybill_printed_at timestamptz,
  invoice_approved boolean,
  invoice_approved_at timestamptz,
  invoice_approved_by uuid,
  invoice_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_be_portal_pickup_status on public.be_portal_pickup_requests(status);
create index if not exists idx_be_portal_pickup_branch on public.be_portal_pickup_requests(branch_code);
create index if not exists idx_be_portal_pickup_created_at on public.be_portal_pickup_requests(created_at);
create index if not exists idx_be_portal_pickup_merchant on public.be_portal_pickup_requests(merchant_code);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  event_type text not null,
  description text,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_be_portal_events_pickup on public.be_portal_cargo_events(pickup_id);
create index if not exists idx_be_portal_events_created_at on public.be_portal_cargo_events(created_at);

create table if not exists public.be_bulk_upload_batches (
  batch_id uuid primary key default gen_random_uuid(),
  original_filename text,
  total_rows int default 0,
  valid_rows int default 0,
  invalid_rows int default 0,
  status text default 'UPLOADED',
  rows_json jsonb default '[]'::jsonb,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.be_tariff_master (
  tier_name text primary key,
  free_allowance_kg int not null default 3,
  base_fee_mmk int not null default 4000,
  extra_per_kg_mmk int not null default 500,
  highway_fee_mmk int not null default 3000,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.be_tariff_master(tier_name, free_allowance_kg, base_fee_mmk, extra_per_kg_mmk, highway_fee_mmk)
values
  ('Standard', 3, 4000, 500, 3000),
  ('Royal', 5, 4000, 500, 3000),
  ('Commitment', 5, 3500, 500, 3000)
on conflict (tier_name) do update set
  free_allowance_kg = excluded.free_allowance_kg,
  base_fee_mmk = excluded.base_fee_mmk,
  extra_per_kg_mmk = excluded.extra_per_kg_mmk,
  highway_fee_mmk = excluded.highway_fee_mmk,
  is_active = true,
  updated_at = now();

create table if not exists public.be_system_config (
  config_key text primary key,
  config_value text,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.be_system_config(config_key, config_value, description)
values
  ('portal_mode', 'production', 'Britium enterprise portal operating mode'),
  ('default_branch', 'YGN', 'Default branch when branch is not specified'),
  ('waybill_prefix', 'W', 'Waybill number prefix')
on conflict (config_key) do nothing;

create table if not exists public.be_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  performed_by uuid,
  performed_at timestamptz not null default now()
);

-- Bootstrap helper: first authenticated user can register as admin only when registry is empty.
create or replace function public.be_bootstrap_first_admin(
  p_full_name text default 'Britium Admin',
  p_branch_code text default 'YGN'
) returns json
language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_count int;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_count from public.be_user_account_registry where status = 'active';

  if v_count > 0 then
    raise exception 'Admin bootstrap is locked because registry already has users';
  end if;

  insert into public.be_user_account_registry(auth_user_id, full_name, role, email, branch_code, status)
  values (v_uid, p_full_name, 'admin', v_email, p_branch_code, 'active')
  on conflict (auth_user_id) do update set role = 'admin', status = 'active', updated_at = now();

  return json_build_object('ok', true, 'role', 'admin', 'email', v_email);
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.be_bootstrap_first_admin(text,text) to authenticated;

notify pgrst, 'reload schema';
