-- ============================================================
-- Britium Express
-- 95-mobile-workforce-code-compatibility-fix.sql
-- Fixes NOT NULL errors on public.be_mobile_workforce_accounts.workforce_code.
-- Run this in Supabase SQL Editor, then rerun 99-run-all-clean-enterprise-portal.sql.
-- ============================================================

create extension if not exists pgcrypto;


-- Workforce-code compatibility for existing testing/production databases.
-- Some older Britium schemas already have public.be_mobile_workforce_accounts.workforce_code as NOT NULL.
-- Always keep workforce_code populated from the template code: RID001, DRV001, etc.
alter table public.be_mobile_workforce_accounts
  add column if not exists workforce_code text;

update public.be_mobile_workforce_accounts w
set workforce_code = coalesce(
  nullif(btrim(w.workforce_code), ''),
  nullif(btrim(to_jsonb(w)->>'worker_id'), ''),
  nullif(btrim(to_jsonb(w)->>'rider_code'), ''),
  nullif(btrim(to_jsonb(w)->>'driver_code'), ''),
  nullif(btrim(to_jsonb(w)->>'helper_code'), ''),
  nullif(btrim(to_jsonb(w)->>'employee_code'), ''),
  'WF-' || upper(substr(gen_random_uuid()::text, 1, 8))
)
where w.workforce_code is null or btrim(w.workforce_code) = '';

alter table public.be_mobile_workforce_accounts
  alter column workforce_code set not null;

create unique index if not exists ux_be_mobile_workforce_accounts_workforce_code
  on public.be_mobile_workforce_accounts(workforce_code);

create or replace function public.be_mobile_workforce_accounts_set_workforce_code()
returns trigger
language plpgsql
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  if new.workforce_code is null or btrim(new.workforce_code) = '' then
    new.workforce_code := coalesce(
      nullif(btrim(v_row->>'worker_id'), ''),
      nullif(btrim(v_row->>'rider_code'), ''),
      nullif(btrim(v_row->>'driver_code'), ''),
      nullif(btrim(v_row->>'helper_code'), ''),
      nullif(btrim(v_row->>'employee_code'), ''),
      'WF-' || upper(substr(gen_random_uuid()::text, 1, 8))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_be_mobile_workforce_accounts_set_workforce_code
  on public.be_mobile_workforce_accounts;

create trigger trg_be_mobile_workforce_accounts_set_workforce_code
before insert or update on public.be_mobile_workforce_accounts
for each row
execute function public.be_mobile_workforce_accounts_set_workforce_code();



-- Rebuild template-only mobile workforce records using authoritative template codes.
-- This prevents old generated records such as rider_ygn_0001 from becoming dropdown/login source.
do $$
begin
  if to_regclass('public.be_masterdata_riders') is not null then
    delete from public.be_mobile_workforce_accounts;

    insert into public.be_mobile_workforce_accounts(
      worker_id,
      workforce_code,
      full_name,
      role_type,
      phone_number,
      branch_code,
      vehicle_type,
      license_plate,
      status
    )
    select
      rider_id,
      rider_id,
      rider_name,
      'rider',
      phone_primary,
      'YGN',
      null,
      null,
      lower(status)
    from public.be_masterdata_riders
    where lower(status) = 'active'
    on conflict(worker_id) do update set
      workforce_code = excluded.workforce_code,
      full_name = excluded.full_name,
      phone_number = excluded.phone_number,
      status = excluded.status;
  end if;

  if to_regclass('public.be_masterdata_drivers') is not null then
    insert into public.be_mobile_workforce_accounts(
      worker_id,
      workforce_code,
      full_name,
      role_type,
      phone_number,
      branch_code,
      vehicle_type,
      license_plate,
      status
    )
    select
      d.driver_id,
      d.driver_id,
      d.driver_name,
      'driver',
      d.phone_primary,
      'YGN',
      f.vehicle_type,
      f.vehicle_no,
      lower(d.status)
    from public.be_masterdata_drivers d
    left join public.be_masterdata_fleet f
      on f.assigned_driver_id = d.driver_name
      or f.assigned_driver_id = d.driver_id
    where lower(d.status) = 'active'
    on conflict(worker_id) do update set
      workforce_code = excluded.workforce_code,
      full_name = excluded.full_name,
      phone_number = excluded.phone_number,
      vehicle_type = excluded.vehicle_type,
      license_plate = excluded.license_plate,
      status = excluded.status;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Verification:
-- select worker_id, workforce_code, full_name, role_type, phone_number, status
-- from public.be_mobile_workforce_accounts
-- order by role_type, workforce_code;
