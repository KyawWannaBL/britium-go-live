-- 97-user-account-registry-schema-compatibility-fix.sql
-- Britium Enterprise Portal clean starter compatibility fix
-- Purpose:
--   1) Existing/testing DB has public.be_user_account_registry without user_id.
--   2) Some seed SQL still inserts into user_id.
--   3) This patch makes the table accept both user_id and auth_user_id safely.
--
-- Run this BEFORE rerunning 99-run-all-clean-enterprise-portal.sql.
-- Safe to run more than once.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.be_user_account_registry') is null then
    create table public.be_user_account_registry (
      id uuid primary key default gen_random_uuid(),
      auth_user_id uuid,
      user_id text,
      full_name text not null default 'User',
      role text not null default 'staff',
      email text,
      phone_number text,
      branch_code text default 'YGN',
      vehicle_type text,
      license_plate text,
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

alter table public.be_user_account_registry
  add column if not exists id uuid default gen_random_uuid();

alter table public.be_user_account_registry
  add column if not exists auth_user_id uuid;

alter table public.be_user_account_registry
  add column if not exists user_id text;

alter table public.be_user_account_registry
  add column if not exists full_name text;

alter table public.be_user_account_registry
  add column if not exists role text;

alter table public.be_user_account_registry
  add column if not exists email text;

alter table public.be_user_account_registry
  add column if not exists phone_number text;

alter table public.be_user_account_registry
  add column if not exists branch_code text;

alter table public.be_user_account_registry
  add column if not exists vehicle_type text;

alter table public.be_user_account_registry
  add column if not exists license_plate text;

alter table public.be_user_account_registry
  add column if not exists status text;

alter table public.be_user_account_registry
  add column if not exists metadata jsonb;

alter table public.be_user_account_registry
  add column if not exists created_at timestamptz;

alter table public.be_user_account_registry
  add column if not exists updated_at timestamptz;

update public.be_user_account_registry
set
  id = coalesce(id, gen_random_uuid()),
  user_id = coalesce(user_id, auth_user_id::text),
  full_name = coalesce(nullif(btrim(full_name), ''), email, phone_number, 'User'),
  role = coalesce(nullif(btrim(role), ''), 'staff'),
  branch_code = coalesce(nullif(btrim(branch_code), ''), 'YGN'),
  status = coalesce(nullif(btrim(status), ''), 'active'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

-- Make legacy user_id useful but non-blocking.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'be_user_account_registry_user_id_uidx'
  ) then
    begin
      create unique index be_user_account_registry_user_id_uidx
      on public.be_user_account_registry(user_id);
    exception
      when unique_violation then
        raise notice 'Duplicate user_id values exist; skipping unique user_id index.';
      when others then
        raise notice 'Could not create unique user_id index: %', sqlerrm;
    end;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'be_user_account_registry_auth_user_id_uidx'
  ) then
    begin
      create unique index be_user_account_registry_auth_user_id_uidx
      on public.be_user_account_registry(auth_user_id);
    exception
      when unique_violation then
        raise notice 'Duplicate auth_user_id values exist; skipping unique auth_user_id index.';
      when others then
        raise notice 'Could not create unique auth_user_id index: %', sqlerrm;
    end;
  end if;
end $$;

create or replace function public.be_user_account_registry_compat_before_write()
returns trigger
language plpgsql
as $$
declare
  v_uuid_regex constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.user_id is null and new.auth_user_id is not null then
    new.user_id := new.auth_user_id::text;
  end if;

  if new.auth_user_id is null and new.user_id is not null and lower(new.user_id) ~ v_uuid_regex then
    new.auth_user_id := new.user_id::uuid;
  end if;

  -- For testing seed rows without a real Supabase auth user, generate a stable DB UUID.
  -- Production real users should still be linked by their actual auth.users.id.
  if new.auth_user_id is null then
    new.auth_user_id := gen_random_uuid();
  end if;

  if new.user_id is null then
    new.user_id := new.auth_user_id::text;
  end if;

  new.full_name := coalesce(nullif(btrim(new.full_name), ''), new.email, new.phone_number, 'User');
  new.role := coalesce(nullif(btrim(new.role), ''), 'staff');
  new.branch_code := coalesce(nullif(btrim(new.branch_code), ''), 'YGN');
  new.status := coalesce(nullif(btrim(new.status), ''), 'active');
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists trg_be_user_account_registry_compat_before_write
on public.be_user_account_registry;

create trigger trg_be_user_account_registry_compat_before_write
before insert or update on public.be_user_account_registry
for each row execute function public.be_user_account_registry_compat_before_write();

-- Keep previous workforce_code issue covered in the same run.
do $$
begin
  if to_regclass('public.be_mobile_workforce_accounts') is not null then
    alter table public.be_mobile_workforce_accounts
      add column if not exists workforce_code text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists worker_id text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists role_type text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists workforce_type text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists full_name text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists phone_number text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists branch_code text;

    alter table public.be_mobile_workforce_accounts
      add column if not exists status text;
  end if;
end $$;

create or replace function public.be_mobile_workforce_code_compat_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.workforce_code is null then
    new.workforce_code := coalesce(
      nullif(btrim(new.worker_id), ''),
      nullif(btrim(new.rider_code), ''),
      nullif(btrim(new.driver_code), ''),
      nullif(btrim(new.employee_code), ''),
      'WF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    );
  end if;

  if new.worker_id is null then
    new.worker_id := new.workforce_code;
  end if;

  if new.role_type is null then
    new.role_type := coalesce(new.workforce_type, 'rider');
  end if;

  if new.workforce_type is null then
    new.workforce_type := new.role_type;
  end if;

  new.full_name := coalesce(nullif(btrim(new.full_name), ''), 'Workforce');
  new.branch_code := coalesce(nullif(btrim(new.branch_code), ''), 'YGN');
  new.status := coalesce(nullif(btrim(new.status), ''), 'available');

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.be_mobile_workforce_accounts') is not null then
    drop trigger if exists trg_be_mobile_workforce_code_compat_before_write
    on public.be_mobile_workforce_accounts;

    create trigger trg_be_mobile_workforce_code_compat_before_write
    before insert or update on public.be_mobile_workforce_accounts
    for each row execute function public.be_mobile_workforce_code_compat_before_write();
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verification
create or replace function public.be_user_registry_compat_verification()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'ok', true,
    'be_user_account_registry_exists', to_regclass('public.be_user_account_registry') is not null,
    'has_user_id', exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='be_user_account_registry' and column_name='user_id'
    ),
    'has_auth_user_id', exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='be_user_account_registry' and column_name='auth_user_id'
    ),
    'user_count', coalesce((select count(*) from public.be_user_account_registry), 0),
    'null_user_id_count', coalesce((select count(*) from public.be_user_account_registry where user_id is null), 0),
    'null_auth_user_id_count', coalesce((select count(*) from public.be_user_account_registry where auth_user_id is null), 0)
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.be_user_registry_compat_verification() to anon, authenticated, service_role;
