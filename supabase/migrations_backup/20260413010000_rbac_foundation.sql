create extension if not exists pgcrypto;

alter table if exists public.user_profiles
  add column if not exists role text,
  add column if not exists role_code text,
  add column if not exists app_role text,
  add column if not exists user_role text,
  add column if not exists authority_level text,
  add column if not exists data_scope text,
  add column if not exists permissions jsonb default '{}'::jsonb,
  add column if not exists screens text[] default '{}'::text[],
  add column if not exists must_change_password boolean default false,
  add column if not exists requires_password_change boolean default false;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  actor_email text null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  status text not null default 'success',
  before_data jsonb null,
  after_data jsonb null,
  notes text null,
  created_at timestamptz not null default now()
);

alter table if exists public.audit_logs
  add column if not exists actor_id uuid null,
  add column if not exists actor_email text null,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id text null,
  add column if not exists status text default 'success',
  add column if not exists before_data jsonb null,
  add column if not exists after_data jsonb null,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  entity_type text not null,
  entity_id text null,
  requested_by uuid not null,
  requested_role text null,
  status text not null default 'pending',
  payload jsonb null,
  approved_by uuid null,
  approved_at timestamptz null,
  rejected_by uuid null,
  rejected_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table if exists public.approval_requests
  add column if not exists request_type text,
  add column if not exists entity_type text,
  add column if not exists entity_id text null,
  add column if not exists requested_by uuid null,
  add column if not exists requested_role text null,
  add column if not exists status text default 'pending',
  add column if not exists payload jsonb null,
  add column if not exists approved_by uuid null,
  add column if not exists approved_at timestamptz null,
  add column if not exists rejected_by uuid null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists created_at timestamptz not null default now();

alter table public.audit_logs enable row level security;
alter table public.approval_requests enable row level security;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email'), '')
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select lower(public.current_user_email()) = 'md@britiumexpress.com'
$$;

drop policy if exists "audit_logs_self_or_superadmin_select" on public.audit_logs;
create policy "audit_logs_self_or_superadmin_select"
on public.audit_logs
for select
to authenticated
using (
  public.is_superadmin()
  or actor_id = auth.uid()
);

drop policy if exists "audit_logs_self_insert" on public.audit_logs;
create policy "audit_logs_self_insert"
on public.audit_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  or public.is_superadmin()
);

drop policy if exists "approval_requests_select_owner_or_superadmin" on public.approval_requests;
create policy "approval_requests_select_owner_or_superadmin"
on public.approval_requests
for select
to authenticated
using (
  public.is_superadmin()
  or requested_by = auth.uid()
);

drop policy if exists "approval_requests_insert_owner" on public.approval_requests;
create policy "approval_requests_insert_owner"
on public.approval_requests
for insert
to authenticated
with check (
  requested_by = auth.uid()
  or public.is_superadmin()
);

drop policy if exists "approval_requests_update_superadmin" on public.approval_requests;
create policy "approval_requests_update_superadmin"
on public.approval_requests
for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) ||
  '{"role":"super-admin","role_code":"super-admin","app_role":"super-admin","user_role":"super-admin"}'::jsonb
where email = 'md@britiumexpress.com';

update public.user_profiles
set
  role = 'super-admin',
  role_code = 'super-admin',
  app_role = 'super-admin',
  user_role = 'super-admin',
  authority_level = 'L5',
  data_scope = 'S5',
  must_change_password = false,
  requires_password_change = false
where id = (
  select id from auth.users where email = 'md@britiumexpress.com'
);
