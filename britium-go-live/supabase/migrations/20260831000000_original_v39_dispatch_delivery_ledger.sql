-- Original V39 dispatch/delivery ledger foundations extracted without changes from warehouse_dispatch_rto_alert_v39.sql.
-- Empty operational tables only: no historic rows, no fixtures, no end-user table grants.
create table if not exists public.be_dispatch_scans_v39 (
  delivery_way_id text primary key,
  pickup_id text,
  parcel_sequence integer,
  wayplan_code text,
  scan_status text not null default 'SCANNED',
  scanned_at timestamptz not null default now(),
  scanned_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint be_dispatch_scans_v39_status_check check (scan_status in ('SCANNED', 'REVERSED'))
);

create table if not exists public.be_dispatch_scan_events_v39 (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  pickup_id text,
  parcel_sequence integer,
  wayplan_code text,
  action text not null,
  actor_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_delivery_attempt_state_v39 (
  delivery_way_id text primary key,
  pickup_id text,
  consecutive_failures integer not null default 0,
  last_status text,
  last_failure_reason text,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  rto_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.be_delivery_attempt_events_v39 (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null unique,
  delivery_way_id text not null,
  pickup_id text,
  attempt_number integer not null,
  result_status text not null,
  reason text,
  actor_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_operational_alerts_v39 (
  alert_key text primary key,
  alert_type text not null,
  severity text not null default 'WARNING',
  pickup_id text,
  delivery_way_id text,
  title text not null,
  message text not null,
  target_role text not null default 'warehouse',
  alert_status text not null default 'OPEN',
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint be_operational_alerts_v39_status_check check (alert_status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
);

alter table public.be_dispatch_scans_v39 enable row level security;
revoke all on table public.be_dispatch_scans_v39 from public, anon, authenticated;
alter table public.be_dispatch_scan_events_v39 enable row level security;
revoke all on table public.be_dispatch_scan_events_v39 from public, anon, authenticated;
alter table public.be_delivery_attempt_state_v39 enable row level security;
revoke all on table public.be_delivery_attempt_state_v39 from public, anon, authenticated;
alter table public.be_delivery_attempt_events_v39 enable row level security;
revoke all on table public.be_delivery_attempt_events_v39 from public, anon, authenticated;
alter table public.be_operational_alerts_v39 enable row level security;
revoke all on table public.be_operational_alerts_v39 from public, anon, authenticated;
