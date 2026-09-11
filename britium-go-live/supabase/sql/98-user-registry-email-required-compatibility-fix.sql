-- ============================================================
-- Britium Express
-- 98-user-registry-email-required-compatibility-fix.sql
--
-- Fixes:
--   ERROR: null value in column "email" of relation
--          "be_user_account_registry" violates not-null constraint
--
-- Why:
--   Some seed blocks insert workforce/driver/rider accounts without email.
--   Existing testing/production-compatible schemas may require email NOT NULL.
--
-- Safe behavior:
--   - Does not delete users.
--   - Does not change Supabase Auth users.
--   - Auto-generates deterministic testing-safe emails for template users.
--   - Uses BEFORE INSERT/UPDATE trigger so legacy seed SQL can still run.
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
  ) then
    raise notice 'public.be_user_account_registry does not exist yet. Run this fix after bootstrap schema or use patched 99-run-all-clean-enterprise-portal.sql.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
      and column_name = 'email'
  ) then
    alter table public.be_user_account_registry
      add column email text;
  end if;
end $$;

create or replace function public.be_registry_safe_email_from_row(p_payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_seed text;
  v_role text;
  v_email text;
begin
  v_role := lower(coalesce(
    nullif(p_payload->>'role', ''),
    nullif(p_payload->>'role_type', ''),
    nullif(p_payload->>'workforce_type', ''),
    nullif(p_payload->>'user_type', ''),
    'user'
  ));

  v_seed := coalesce(
    nullif(p_payload->>'account_code', ''),
    nullif(p_payload->>'employee_code', ''),
    nullif(p_payload->>'workforce_code', ''),
    nullif(p_payload->>'worker_id', ''),
    nullif(p_payload->>'rider_code', ''),
    nullif(p_payload->>'driver_code', ''),
    nullif(p_payload->>'user_id', ''),
    nullif(p_payload->>'auth_user_id', ''),
    nullif(p_payload->>'phone_number', ''),
    nullif(p_payload->>'phone', ''),
    substring(md5(coalesce(p_payload::text, '') || 'britium') from 1 for 12)
  );

  v_email := lower(v_role || '-' || v_seed || '@testing.britium.local');
  v_email := regexp_replace(v_email, '[^a-z0-9@._+-]+', '-', 'g');
  v_email := regexp_replace(v_email, '-+', '-', 'g');
  v_email := regexp_replace(v_email, '^-|-$', '', 'g');

  if position('@' in v_email) = 0 then
    v_email := 'user-' || substring(md5(coalesce(p_payload::text, '') || clock_timestamp()::text) from 1 for 12) || '@testing.britium.local';
  end if;

  return v_email;
end;
$$;

create or replace function public.be_user_registry_required_defaults_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_base_email text;
  v_email text;
  v_counter integer := 0;
  v_current_id text;
begin
  v_payload := to_jsonb(new);
  v_current_id := coalesce(v_payload->>'id', v_payload->>'user_id', v_payload->>'auth_user_id', '');

  -- Fill email before NOT NULL constraint is checked.
  if new.email is null or btrim(new.email) = '' then
    v_base_email := public.be_registry_safe_email_from_row(v_payload);
    v_email := v_base_email;

    -- Avoid unique email collisions if the table has a unique index/constraint.
    while exists (
      select 1
      from public.be_user_account_registry existing
      where lower(existing.email) = lower(v_email)
        and coalesce(existing.id::text, existing.user_id::text, existing.auth_user_id::text, '') <> v_current_id
    ) loop
      v_counter := v_counter + 1;
      v_email := regexp_replace(v_base_email, '@', '-' || v_counter::text || '@', 'g');
      exit when v_counter > 50;
    end loop;

    new.email := v_email;
  end if;

  -- Keep other common required fields safe for mixed old/new seed files.
  if new.role is null or btrim(new.role) = '' then
    new.role := coalesce(nullif(v_payload->>'role_type', ''), nullif(v_payload->>'workforce_type', ''), 'user');
  end if;

  if new.full_name is null or btrim(new.full_name) = '' then
    new.full_name := coalesce(nullif(v_payload->>'display_name', ''), nullif(v_payload->>'name', ''), 'Britium User');
  end if;

  if new.status is null or btrim(new.status) = '' then
    new.status := 'active';
  end if;

  if new.branch_code is null or btrim(new.branch_code) = '' then
    new.branch_code := 'YGN';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_be_user_registry_required_defaults
on public.be_user_account_registry;

create trigger trg_be_user_registry_required_defaults
before insert or update on public.be_user_account_registry
for each row
execute function public.be_user_registry_required_defaults_trigger();

-- Backfill any existing rows before enforcing NOT NULL.
update public.be_user_account_registry r
set email = public.be_registry_safe_email_from_row(to_jsonb(r))
where r.email is null or btrim(r.email) = '';

alter table public.be_user_account_registry
  alter column email set not null;

comment on function public.be_user_registry_required_defaults_trigger()
is 'Britium compatibility trigger. Fills email/role/full_name/status/branch_code for legacy master-data seed inserts before NOT NULL checks.';

create or replace function public.be_user_registry_email_compat_verification()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'table_exists', to_regclass('public.be_user_account_registry') is not null,
    'null_email_count', (
      select count(*) from public.be_user_account_registry where email is null or btrim(email) = ''
    ),
    'generated_testing_email_count', (
      select count(*) from public.be_user_account_registry where email like '%@testing.britium.local'
    ),
    'total_users', (
      select count(*) from public.be_user_account_registry
    )
  );
$$;

notify pgrst, 'reload schema';
