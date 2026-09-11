create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_ops_admin(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = p_user_id
      and coalesce(up.is_active, true) = true
      and coalesce(up.role::text, '') in (
        'super-admin',
        'admin',
        'supervisor',
        'warehouse-manager',
        'hr-manager',
        'finance-manager',
        'operations-manager'
      )
  );
$$;

create table if not exists public.staff_master (
  id uuid primary key default gen_random_uuid(),
  staff_code text not null unique,
  full_name text not null,
  staff_type text not null check (staff_type in ('driver','rider','helper','warehouse','customer-service','finance','hr','marketing','supervisor','branch-office','admin','other')),
  role_name text not null,
  phone text,
  email text,
  branch_name text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  user_profile_id uuid references public.user_profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_master (
  id uuid primary key default gen_random_uuid(),
  vehicle_code text not null unique,
  registration_no text,
  vehicle_type text not null check (vehicle_type in ('bicycle','motorbike','van','truck','car','other')),
  display_name text,
  capacity_kg numeric(12,2) not null default 0,
  current_driver_staff_id uuid references public.staff_master(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status text not null default 'available' check (status in ('available','assigned','maintenance','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_master (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_type text not null check (asset_type in ('scanner','mobile-phone','helmet','bag','printer','signature-pad','camera','sim-card','uniform','other')),
  model_name text,
  serial_no text,
  status text not null default 'available' check (status in ('available','assigned','maintenance','retired','lost')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_master(id) on delete cascade,
  asset_id uuid references public.asset_master(id) on delete set null,
  vehicle_id uuid references public.vehicle_master(id) on delete set null,
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  issued_by uuid references public.staff_master(id) on delete set null,
  notes text,
  status text not null default 'assigned' check (status in ('assigned','returned','lost','maintenance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_asset_assignments_asset_or_vehicle_chk
    check (asset_id is not null or vehicle_id is not null)
);

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments(id) on delete cascade,
  manifest_id uuid references public.manifests(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  actor_staff_id uuid references public.staff_master(id) on delete set null,
  next_staff_id uuid references public.staff_master(id) on delete set null,
  process_step text not null,
  territory_code text,
  scan_channel text not null default 'qr_scanner' check (scan_channel in ('qr_scanner','mobile_scanner','manual_override')),
  event_payload jsonb not null default '{}'::jsonb,
  location_payload jsonb not null default '{}'::jsonb,
  notes text,
  requires_ack boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  qr_scan_event_id uuid not null references public.qr_scan_events(id) on delete cascade,
  responsible_staff_id uuid not null references public.staff_master(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','completed','rejected','timed_out')),
  due_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  reminder_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_master_staff_type on public.staff_master(staff_type);
create index if not exists idx_staff_master_role_name on public.staff_master(role_name);
create index if not exists idx_vehicle_master_vehicle_type on public.vehicle_master(vehicle_type);
create index if not exists idx_vehicle_master_status on public.vehicle_master(status);
create index if not exists idx_asset_master_asset_type on public.asset_master(asset_type);
create index if not exists idx_asset_master_status on public.asset_master(status);
create index if not exists idx_staff_asset_assignments_staff_id on public.staff_asset_assignments(staff_id);
create index if not exists idx_qr_scan_events_shipment_id on public.qr_scan_events(shipment_id);
create index if not exists idx_qr_scan_events_delivery_id on public.qr_scan_events(delivery_id);
create index if not exists idx_qr_scan_events_next_staff_id on public.qr_scan_events(next_staff_id);
create index if not exists idx_workflow_ack_qr_scan_event_id on public.workflow_acknowledgements(qr_scan_event_id);
create index if not exists idx_workflow_ack_responsible_staff_id on public.workflow_acknowledgements(responsible_staff_id);
create index if not exists idx_workflow_ack_status on public.workflow_acknowledgements(status);

drop trigger if exists trg_staff_master_updated_at on public.staff_master;
create trigger trg_staff_master_updated_at before update on public.staff_master
for each row execute function public.set_updated_at();

drop trigger if exists trg_vehicle_master_updated_at on public.vehicle_master;
create trigger trg_vehicle_master_updated_at before update on public.vehicle_master
for each row execute function public.set_updated_at();

drop trigger if exists trg_asset_master_updated_at on public.asset_master;
create trigger trg_asset_master_updated_at before update on public.asset_master
for each row execute function public.set_updated_at();

drop trigger if exists trg_staff_asset_assignments_updated_at on public.staff_asset_assignments;
create trigger trg_staff_asset_assignments_updated_at before update on public.staff_asset_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_workflow_acknowledgements_updated_at on public.workflow_acknowledgements;
create trigger trg_workflow_acknowledgements_updated_at before update on public.workflow_acknowledgements
for each row execute function public.set_updated_at();

alter table public.staff_master enable row level security;
alter table public.vehicle_master enable row level security;
alter table public.asset_master enable row level security;
alter table public.staff_asset_assignments enable row level security;
alter table public.qr_scan_events enable row level security;
alter table public.workflow_acknowledgements enable row level security;

drop policy if exists "staff_master_select_authenticated" on public.staff_master;
create policy "staff_master_select_authenticated" on public.staff_master
for select to authenticated
using (true);

drop policy if exists "staff_master_write_ops_admin" on public.staff_master;
create policy "staff_master_write_ops_admin" on public.staff_master
for all to authenticated
using (public.is_ops_admin(auth.uid()))
with check (public.is_ops_admin(auth.uid()));

drop policy if exists "vehicle_master_select_authenticated" on public.vehicle_master;
create policy "vehicle_master_select_authenticated" on public.vehicle_master
for select to authenticated
using (true);

drop policy if exists "vehicle_master_write_ops_admin" on public.vehicle_master;
create policy "vehicle_master_write_ops_admin" on public.vehicle_master
for all to authenticated
using (public.is_ops_admin(auth.uid()))
with check (public.is_ops_admin(auth.uid()));

drop policy if exists "asset_master_select_authenticated" on public.asset_master;
create policy "asset_master_select_authenticated" on public.asset_master
for select to authenticated
using (true);

drop policy if exists "asset_master_write_ops_admin" on public.asset_master;
create policy "asset_master_write_ops_admin" on public.asset_master
for all to authenticated
using (public.is_ops_admin(auth.uid()))
with check (public.is_ops_admin(auth.uid()));

drop policy if exists "staff_asset_assignments_select_authenticated" on public.staff_asset_assignments;
create policy "staff_asset_assignments_select_authenticated" on public.staff_asset_assignments
for select to authenticated
using (true);

drop policy if exists "staff_asset_assignments_write_ops_admin" on public.staff_asset_assignments;
create policy "staff_asset_assignments_write_ops_admin" on public.staff_asset_assignments
for all to authenticated
using (public.is_ops_admin(auth.uid()))
with check (public.is_ops_admin(auth.uid()));

drop policy if exists "qr_scan_events_select_authenticated" on public.qr_scan_events;
create policy "qr_scan_events_select_authenticated" on public.qr_scan_events
for select to authenticated
using (true);

drop policy if exists "qr_scan_events_insert_authenticated" on public.qr_scan_events;
create policy "qr_scan_events_insert_authenticated" on public.qr_scan_events
for insert to authenticated
with check (true);

drop policy if exists "workflow_ack_select_authenticated" on public.workflow_acknowledgements;
create policy "workflow_ack_select_authenticated" on public.workflow_acknowledgements
for select to authenticated
using (true);

drop policy if exists "workflow_ack_write_authenticated" on public.workflow_acknowledgements;
create policy "workflow_ack_write_authenticated" on public.workflow_acknowledgements
for all to authenticated
using (true)
with check (true);

create or replace function public.log_qr_scan_event(
  p_actor_staff_id uuid,
  p_next_staff_id uuid,
  p_process_step text,
  p_shipment_id uuid default null,
  p_manifest_id uuid default null,
  p_delivery_id uuid default null,
  p_territory_code text default null,
  p_scan_channel text default 'qr_scanner',
  p_notes text default null,
  p_event_payload jsonb default '{}'::jsonb,
  p_location_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  insert into public.qr_scan_events (
    shipment_id,
    manifest_id,
    delivery_id,
    actor_staff_id,
    next_staff_id,
    process_step,
    territory_code,
    scan_channel,
    notes,
    event_payload,
    location_payload,
    requires_ack
  )
  values (
    p_shipment_id,
    p_manifest_id,
    p_delivery_id,
    p_actor_staff_id,
    p_next_staff_id,
    p_process_step,
    p_territory_code,
    p_scan_channel,
    p_notes,
    coalesce(p_event_payload, '{}'::jsonb),
    coalesce(p_location_payload, '{}'::jsonb),
    true
  )
  returning id into v_event_id;

  if p_next_staff_id is not null then
    insert into public.workflow_acknowledgements (
      qr_scan_event_id,
      responsible_staff_id,
      status,
      due_at,
      reminder_count
    )
    values (
      v_event_id,
      p_next_staff_id,
      'pending',
      now() + interval '15 minutes',
      0
    );
  end if;

  return v_event_id;
end;
$$;
