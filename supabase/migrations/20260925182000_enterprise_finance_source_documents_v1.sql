begin;

create or replace function public.be_force_locked_submission_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  new.is_locked := true;
  new.submitted_at := coalesce(new.submitted_at, now());
  return new;
end;
$$;

create or replace function public.be_guard_locked_source_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if old.is_locked and coalesce(current_setting('be.accounting_override', true),'off') <> 'on' then
    raise exception using
      errcode='P0001',
      message='LOCKED_ACCOUNTING_SOURCE',
      detail='Submitted accounting source documents are immutable; use the audited correction workflow.';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create table public.finance_daily_logs (
  id uuid primary key default gen_random_uuid(),
  submission_no text not null unique default ('FIN-'||gen_random_uuid()::text),
  entry_date date not null,
  department_code text not null default 'FINANCE',
  delivery_fees_collected numeric(18,2) not null default 0 check (delivery_fees_collected >= 0),
  cod_handling_fees numeric(18,2) not null default 0 check (cod_handling_fees >= 0),
  surcharges numeric(18,2) not null default 0 check (surcharges >= 0),
  rider_commissions_accrued numeric(18,2) not null default 0 check (rider_commissions_accrued >= 0),
  fuel_and_tolls_spent numeric(18,2) not null default 0 check (fuel_and_tolls_spent >= 0),
  packaging_supplies_spent numeric(18,2) not null default 0 check (packaging_supplies_spent >= 0),
  petty_cash_expenses numeric(18,2) not null default 0 check (petty_cash_expenses >= 0),
  cod_cash_collected_in_hand numeric(18,2) not null default 0 check (cod_cash_collected_in_hand >= 0),
  accounts_receivable_invoiced numeric(18,2) not null default 0 check (accounts_receivable_invoiced >= 0),
  accounts_payable_incurred numeric(18,2) not null default 0 check (accounts_payable_incurred >= 0),
  source_mode text not null default 'MANUAL' check (source_mode in ('MANUAL','ADJUSTMENT','SYSTEM_ASSISTED')),
  accounting_event_id uuid null references public.be_accounting_events(id) on delete restrict,
  is_locked boolean not null default true,
  submitted_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  soft_deleted_at timestamptz null,
  soft_deleted_by uuid null,
  override_reason text null,
  version_no integer not null default 1 check (version_no > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (entry_date,department_code,version_no)
);
create index finance_daily_logs_event_idx on public.finance_daily_logs(accounting_event_id);
create index finance_daily_logs_date_idx on public.finance_daily_logs(entry_date,department_code);

create table public.admin_assets_and_hr_logs (
  id uuid primary key default gen_random_uuid(),
  submission_no text not null unique default ('AHR-'||gen_random_uuid()::text),
  entry_date date not null,
  department_code text not null default 'ADMIN_HR',
  asset_name text null,
  asset_category text null,
  acquisition_date date null,
  acquisition_cost numeric(18,2) null check (acquisition_cost is null or acquisition_cost > 0),
  residual_value numeric(18,2) not null default 0 check (residual_value >= 0),
  useful_life_months integer null check (useful_life_months is null or useful_life_months > 0),
  calculated_monthly_depreciation numeric(18,2)
    generated always as (
      case
        when acquisition_cost is not null and useful_life_months is not null
          then round((acquisition_cost-residual_value)/useful_life_months,2)
        else null
      end
    ) stored,
  warehouse_overtime numeric(18,2) not null default 0 check (warehouse_overtime >= 0),
  base_payroll_accrual numeric(18,2) not null default 0 check (base_payroll_accrual >= 0),
  facility_rent numeric(18,2) not null default 0 check (facility_rent >= 0),
  utilities_admin_cost numeric(18,2) not null default 0 check (utilities_admin_cost >= 0),
  source_mode text not null default 'MANUAL' check (source_mode in ('MANUAL','ADJUSTMENT','SYSTEM_ASSISTED')),
  accounting_event_id uuid null references public.be_accounting_events(id) on delete restrict,
  fixed_asset_id uuid null references public.be_fixed_asset_register(id) on delete restrict,
  is_locked boolean not null default true,
  submitted_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  soft_deleted_at timestamptz null,
  soft_deleted_by uuid null,
  override_reason text null,
  version_no integer not null default 1 check (version_no > 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (entry_date,department_code,version_no),
  check (acquisition_cost is null or residual_value <= acquisition_cost),
  check (
    asset_name is null
    or (asset_category is not null and acquisition_cost is not null and useful_life_months is not null)
  )
);
create index admin_assets_and_hr_logs_event_idx on public.admin_assets_and_hr_logs(accounting_event_id);
create index admin_assets_and_hr_logs_asset_idx on public.admin_assets_and_hr_logs(fixed_asset_id);
create index admin_assets_and_hr_logs_date_idx on public.admin_assets_and_hr_logs(entry_date,department_code);

create trigger finance_daily_logs_force_locked
before insert on public.finance_daily_logs
for each row execute function public.be_force_locked_submission_v1();

create trigger admin_assets_and_hr_logs_force_locked
before insert on public.admin_assets_and_hr_logs
for each row execute function public.be_force_locked_submission_v1();

create trigger finance_daily_logs_guard_locked
before update or delete on public.finance_daily_logs
for each row execute function public.be_guard_locked_source_v1();

create trigger admin_assets_and_hr_logs_guard_locked
before update or delete on public.admin_assets_and_hr_logs
for each row execute function public.be_guard_locked_source_v1();

alter table public.finance_daily_logs enable row level security;
alter table public.admin_assets_and_hr_logs enable row level security;

comment on table public.finance_daily_logs is
  'Immutable submitted Finance source documents. Corrections create audited replacement history.';
comment on table public.admin_assets_and_hr_logs is
  'Immutable submitted Admin/HR overhead and asset source documents.';

commit;
