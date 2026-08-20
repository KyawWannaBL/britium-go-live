
-- 98-user-registry-app-role-compatibility-fix.sql
-- Britium Enterprise Portal
-- Fixes legacy seed inserts where be_user_account_registry.app_role is NOT NULL
-- but the seed inserts rider/driver/user rows without app_role.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
  ) then
    raise notice 'public.be_user_account_registry does not exist yet. Skipping app_role compatibility fix.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
      and column_name = 'app_role'
  ) then
    alter table public.be_user_account_registry
      add column app_role text;
  end if;
end $$;

create or replace function public.be_normalize_registry_role_value(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_value, '')));
  v := replace(v, '-', '_');
  v := regexp_replace(v, '\s+', '_', 'g');

  if v = '' then
    return null;
  end if;

  return case
    when v in ('superadmin', 'super_admin', 'administrator', 'system_admin', 'owner') then 'admin'
    when v in ('admin') then 'admin'
    when v in ('customer_service', 'customerservice', 'cs', 'customer_support', 'support') then 'customer_service'
    when v in ('ops', 'operations', 'ops_manager', 'operation_manager', 'operations_manager') then 'ops_manager'
    when v in ('finance_manager', 'finance_mgr') then 'finance_manager'
    when v in ('accountant', 'cashier', 'auditor', 'finance') then v
    when v in ('warehouse', 'warehouse_user', 'warehouse_staff', 'wh') then 'warehouse'
    when v in ('dispatch', 'dispatcher', 'dispatch_user') then 'dispatch'
    when v in ('supervisor', 'pickup_supervisor') then 'supervisor'
    when v in ('merchant', 'merchant_user') then 'merchant'
    when v in ('rider', 'field_rider') then 'rider'
    when v in ('driver', 'field_driver') then 'driver'
    when v in ('helper', 'field_helper') then 'helper'
    when v in ('user', 'staff', 'workforce', 'mobile_workforce') then 'user'
    else v
  end;
end;
$$;

create or replace function public.be_user_registry_fill_required_fields()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  inferred_role text;
  inferred_email text;
  inferred_user_id text;
begin
  payload := to_jsonb(new);

  inferred_role := coalesce(
    public.be_normalize_registry_role_value(payload ->> 'app_role'),
    public.be_normalize_registry_role_value(payload ->> 'user_type'),
    public.be_normalize_registry_role_value(payload ->> 'role_type'),
    public.be_normalize_registry_role_value(payload ->> 'workforce_type'),
    public.be_normalize_registry_role_value(payload ->> 'account_type'),
    public.be_normalize_registry_role_value(payload ->> 'role'),
    'user'
  );

  new.app_role := coalesce(nullif(trim(new.app_role), ''), inferred_role, 'user');

  -- Keep legacy role usable for pages that still read role.
  if to_jsonb(new) ? 'role' then
    new.role := coalesce(
      nullif(trim(new.role), ''),
      initcap(replace(new.app_role, '_', ' '))
    );
  end if;

  -- Compatibility for stricter schemas where email is NOT NULL.
  if to_jsonb(new) ? 'email' then
    inferred_user_id := coalesce(
      nullif(payload ->> 'user_id', ''),
      nullif(payload ->> 'auth_user_id', ''),
      nullif(payload ->> 'account_code', ''),
      nullif(payload ->> 'employee_code', ''),
      nullif(payload ->> 'rider_code', ''),
      nullif(payload ->> 'driver_code', ''),
      nullif(payload ->> 'worker_id', ''),
      replace(coalesce(payload ->> 'full_name', 'user'), ' ', '-')
    );

    inferred_email := lower(
      regexp_replace(
        coalesce(new.app_role, 'user') || '-' || coalesce(inferred_user_id, gen_random_uuid()::text) || '@testing.britium.local',
        '[^a-zA-Z0-9@._-]+',
        '-',
        'g'
      )
    );

    new.email := coalesce(nullif(trim(new.email), ''), inferred_email);
  end if;

  -- Compatibility for schemas with user_id NOT NULL but source data only has auth_user_id.
  if to_jsonb(new) ? 'user_id' then
    new.user_id := coalesce(
      nullif(trim(new.user_id), ''),
      nullif(payload ->> 'auth_user_id', ''),
      'USR-' || upper(substr(md5(coalesce(new.email, gen_random_uuid()::text)), 1, 8))
    );
  end if;

  -- Compatibility for schemas with auth_user_id nullable/expected.
  if to_jsonb(new) ? 'auth_user_id' then
    -- auth_user_id is often UUID. Do not generate fake UUID if the column type is uuid and insert source has none.
    -- Keep whatever source supplied.
    new.auth_user_id := new.auth_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_be_user_registry_fill_required_fields on public.be_user_account_registry;

create trigger trg_be_user_registry_fill_required_fields
before insert or update on public.be_user_account_registry
for each row
execute function public.be_user_registry_fill_required_fields();

-- Backfill existing rows before enforcing/defaulting.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
      and column_name = 'app_role'
  ) then
    update public.be_user_account_registry r
    set app_role = coalesce(
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'app_role'),
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'user_type'),
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'role_type'),
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'workforce_type'),
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'account_type'),
      public.be_normalize_registry_role_value(to_jsonb(r) ->> 'role'),
      'user'
    )
    where app_role is null or trim(app_role) = '';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
      and column_name = 'email'
  ) then
    update public.be_user_account_registry r
    set email = lower(
      regexp_replace(
        coalesce(to_jsonb(r) ->> 'app_role', 'user') || '-' ||
        coalesce(
          to_jsonb(r) ->> 'user_id',
          to_jsonb(r) ->> 'auth_user_id',
          to_jsonb(r) ->> 'account_code',
          to_jsonb(r) ->> 'employee_code',
          to_jsonb(r) ->> 'rider_code',
          to_jsonb(r) ->> 'driver_code',
          to_jsonb(r) ->> 'worker_id',
          to_jsonb(r) ->> 'full_name',
          to_jsonb(r) ->> 'id',
          gen_random_uuid()::text
        ) || '@testing.britium.local',
        '[^a-zA-Z0-9@._-]+',
        '-',
        'g'
      )
    )
    where email is null or trim(email) = '';
  end if;
end $$;

alter table public.be_user_account_registry
  alter column app_role set default 'user';

create or replace function public.be_user_registry_app_role_compat_verification()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_null_app_role int := 0;
  v_null_email int := 0;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'be_user_account_registry table not found'
    );
  end if;

  execute 'select count(*) from public.be_user_account_registry'
    into v_total;

  execute 'select count(*) from public.be_user_account_registry where app_role is null or trim(app_role) = '''''
    into v_null_app_role;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'be_user_account_registry'
      and column_name = 'email'
  ) then
    execute 'select count(*) from public.be_user_account_registry where email is null or trim(email) = '''''
      into v_null_email;
  end if;

  return jsonb_build_object(
    'ok', v_null_app_role = 0,
    'total_registry_rows', v_total,
    'null_app_role_rows', v_null_app_role,
    'null_email_rows', v_null_email,
    'trigger_installed', exists (
      select 1 from pg_trigger where tgname = 'trg_be_user_registry_fill_required_fields'
    )
  );
end;
$$;

grant execute on function public.be_user_registry_app_role_compat_verification() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
