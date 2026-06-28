-- 96-mobile-workforce-workforce-code-trigger-hardfix.sql
-- Purpose:
--   Fix NOT NULL failures on public.be_mobile_workforce_accounts.workforce_code
--   when older seed/import SQL inserts rider/driver rows without explicitly
--   providing workforce_code.
--
-- Run this AFTER the table exists and BEFORE rerunning seed/full SQL.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.be_mobile_workforce_accounts') is null then
    raise exception 'public.be_mobile_workforce_accounts does not exist yet. Run 00-bootstrap-core-schema.sql first, then run this file, then rerun the seed/full SQL.';
  end if;
end $$;

-- Ensure the column exists. Your current error confirms it exists, but this makes
-- the patch safe for slightly different testing schemas.
alter table public.be_mobile_workforce_accounts
  add column if not exists workforce_code text;

-- Temporarily relax the constraint while old rows are normalized.
alter table public.be_mobile_workforce_accounts
  alter column workforce_code drop not null;

-- Backfill any existing null/blank workforce_code values from authoritative
-- template-compatible columns.
update public.be_mobile_workforce_accounts w
set workforce_code = coalesce(
    nullif(trim(w.workforce_code), ''),
    nullif(trim(to_jsonb(w)->>'worker_id'), ''),
    nullif(trim(to_jsonb(w)->>'rider_code'), ''),
    nullif(trim(to_jsonb(w)->>'driver_code'), ''),
    nullif(trim(to_jsonb(w)->>'helper_code'), ''),
    nullif(trim(to_jsonb(w)->>'employee_code'), ''),
    nullif(trim(to_jsonb(w)->>'staff_code'), ''),
    nullif(trim(to_jsonb(w)->>'fleet_code'), ''),
    nullif(trim(to_jsonb(w)->>'mobile_user_code'), ''),
    'WF-' || upper(substr(w.id::text, 1, 8))
  )
where w.workforce_code is null or trim(w.workforce_code) = '';

-- This trigger catches old INSERT statements that still omit workforce_code.
create or replace function public.be_fill_mobile_workforce_code()
returns trigger
language plpgsql
as $$
declare
  v_payload jsonb;
  v_code text;
begin
  v_payload := to_jsonb(new);

  v_code := coalesce(
    nullif(trim(new.workforce_code), ''),
    nullif(trim(v_payload->>'worker_id'), ''),
    nullif(trim(v_payload->>'rider_code'), ''),
    nullif(trim(v_payload->>'driver_code'), ''),
    nullif(trim(v_payload->>'helper_code'), ''),
    nullif(trim(v_payload->>'employee_code'), ''),
    nullif(trim(v_payload->>'staff_code'), ''),
    nullif(trim(v_payload->>'fleet_code'), ''),
    nullif(trim(v_payload->>'mobile_user_code'), ''),
    nullif(trim(v_payload->>'code'), '')
  );

  if v_code is null or v_code = '' then
    v_code := 'WF-' || upper(substr(coalesce(new.id, gen_random_uuid())::text, 1, 8));
  end if;

  new.workforce_code := v_code;

  -- Keep common duplicate code fields aligned where those columns exist in the
  -- row payload. These assignments use dynamic SQL because some environments
  -- have different columns.
  return new;
end;
$$;

drop trigger if exists trg_be_fill_mobile_workforce_code on public.be_mobile_workforce_accounts;

create trigger trg_be_fill_mobile_workforce_code
before insert or update on public.be_mobile_workforce_accounts
for each row
execute function public.be_fill_mobile_workforce_code();

-- Re-apply NOT NULL after trigger and backfill are in place.
alter table public.be_mobile_workforce_accounts
  alter column workforce_code set not null;

-- A non-breaking index helps dropdown lookup without forcing uniqueness across
-- mixed legacy rows. We do not create a unique index here because old duplicates
-- may still exist in testing until cleaned.
create index if not exists idx_be_mobile_workforce_accounts_workforce_code
on public.be_mobile_workforce_accounts (workforce_code);

-- Optional normalization for known template code columns if they exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='be_mobile_workforce_accounts'
      and column_name='rider_code'
  ) then
    execute $q$
      update public.be_mobile_workforce_accounts
      set rider_code = workforce_code
      where lower(coalesce(role_type, workforce_type, '')) = 'rider'
        and (rider_code is null or trim(rider_code) = '')
    $q$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='be_mobile_workforce_accounts'
      and column_name='driver_code'
  ) then
    execute $q$
      update public.be_mobile_workforce_accounts
      set driver_code = workforce_code
      where lower(coalesce(role_type, workforce_type, '')) = 'driver'
        and (driver_code is null or trim(driver_code) = '')
    $q$;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verification result
select
  'be_mobile_workforce_accounts workforce_code hardfix installed' as status,
  count(*) filter (where workforce_code is null or trim(workforce_code) = '') as null_or_blank_workforce_code_rows,
  count(*) as total_workforce_rows
from public.be_mobile_workforce_accounts;
