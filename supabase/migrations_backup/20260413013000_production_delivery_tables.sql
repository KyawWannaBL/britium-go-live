create extension if not exists pgcrypto;

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  reference_no text null,
  cargo_rows jsonb not null default '[]'::jsonb,
  notes text null,
  status text not null default 'draft',
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.parcel_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  tracking_no text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  tracking_no text not null,
  signature_data_url text null,
  evidence_urls jsonb not null default '[]'::jsonb,
  exception_reason text null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.delivery_jobs enable row level security;
alter table public.parcel_events enable row level security;
alter table public.delivery_proofs enable row level security;

drop policy if exists "delivery_jobs_select_authenticated" on public.delivery_jobs;
create policy "delivery_jobs_select_authenticated"
on public.delivery_jobs
for select
to authenticated
using (true);

drop policy if exists "delivery_jobs_insert_authenticated" on public.delivery_jobs;
create policy "delivery_jobs_insert_authenticated"
on public.delivery_jobs
for insert
to authenticated
with check (true);

drop policy if exists "delivery_jobs_update_authenticated" on public.delivery_jobs;
create policy "delivery_jobs_update_authenticated"
on public.delivery_jobs
for update
to authenticated
using (true)
with check (true);

drop policy if exists "parcel_events_select_authenticated" on public.parcel_events;
create policy "parcel_events_select_authenticated"
on public.parcel_events
for select
to authenticated
using (true);

drop policy if exists "parcel_events_insert_authenticated" on public.parcel_events;
create policy "parcel_events_insert_authenticated"
on public.parcel_events
for insert
to authenticated
with check (true);

drop policy if exists "delivery_proofs_select_authenticated" on public.delivery_proofs;
create policy "delivery_proofs_select_authenticated"
on public.delivery_proofs
for select
to authenticated
using (true);

drop policy if exists "delivery_proofs_insert_authenticated" on public.delivery_proofs;
create policy "delivery_proofs_insert_authenticated"
on public.delivery_proofs
for insert
to authenticated
with check (true);
