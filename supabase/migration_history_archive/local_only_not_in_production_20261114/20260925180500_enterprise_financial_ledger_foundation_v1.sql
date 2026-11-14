begin;

create extension if not exists pgcrypto;

create table public.be_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_name text not null,
  account_type text not null check (account_type in ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE')),
  normal_balance text not null check (normal_balance in ('DEBIT','CREDIT')),
  parent_account_id uuid null references public.be_chart_of_accounts(id) on delete restrict,
  report_group text not null,
  is_postable boolean not null default true,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index be_chart_of_accounts_parent_idx on public.be_chart_of_accounts(parent_account_id);
create index be_chart_of_accounts_type_active_idx on public.be_chart_of_accounts(account_type,is_active);

create table public.be_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  period_code text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'OPEN' check (status in ('OPEN','SOFT_CLOSED','CLOSED')),
  closed_by uuid null,
  closed_at timestamptz null,
  reopened_by uuid null,
  reopened_at timestamptz null,
  close_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index be_accounting_periods_dates_idx on public.be_accounting_periods(period_start,period_end);

create table public.be_accounting_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  source_system text not null,
  source_table text not null,
  source_record_id text not null,
  source_reference text null,
  event_type text not null,
  accounting_version text not null,
  description text null,
  currency_code text not null default 'MMK',
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  review_status text not null default 'DRAFT'
    check (review_status in ('DRAFT','REVIEW_PENDING','APPROVED','POSTED','NEEDS_REVIEW','HELD','REJECTED','SYNC_FAILED','REVERSED')),
  source_snapshot jsonb not null default '{}'::jsonb,
  input_fingerprint text not null,
  created_by uuid null,
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  posted_journal_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index be_accounting_events_date_status_idx on public.be_accounting_events(event_date,review_status);
create index be_accounting_events_source_idx on public.be_accounting_events(source_system,source_table,source_record_id);

create table public.be_accounting_event_lines (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.be_accounting_events(id) on delete cascade,
  account_id uuid not null references public.be_chart_of_accounts(id) on delete restrict,
  sequence_no integer not null default 1 check (sequence_no > 0),
  debit_amount numeric(18,2) not null default 0,
  credit_amount numeric(18,2) not null default 0,
  branch_code text null,
  merchant_id text null,
  rider_or_employee_id text null,
  cost_center text null,
  description text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_id, sequence_no),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0)
  )
);
create index be_accounting_event_lines_event_idx on public.be_accounting_event_lines(event_id);
create index be_accounting_event_lines_account_idx on public.be_accounting_event_lines(account_id);

create table public.be_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_number text not null unique,
  accounting_date date not null,
  description text null,
  source_event_id uuid null references public.be_accounting_events(id) on delete restrict,
  accounting_period_id uuid null references public.be_accounting_periods(id) on delete restrict,
  status text not null default 'POSTED' check (status in ('POSTED','REVERSED')),
  posted_by uuid null,
  posted_at timestamptz not null default now(),
  reversal_of_journal_id uuid null references public.be_journal_entries(id) on delete restrict,
  replacement_for_journal_id uuid null references public.be_journal_entries(id) on delete restrict,
  currency_code text not null default 'MMK',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index be_journal_entries_date_idx on public.be_journal_entries(accounting_date);
create index be_journal_entries_source_event_idx on public.be_journal_entries(source_event_id);
create index be_journal_entries_period_idx on public.be_journal_entries(accounting_period_id);
create index be_journal_entries_reversal_idx on public.be_journal_entries(reversal_of_journal_id);

alter table public.be_accounting_events
  add constraint be_accounting_events_posted_journal_id_fkey
  foreign key (posted_journal_id) references public.be_journal_entries(id) on delete restrict;

create index be_accounting_events_posted_journal_idx on public.be_accounting_events(posted_journal_id);

create table public.be_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.be_journal_entries(id) on delete restrict,
  account_id uuid not null references public.be_chart_of_accounts(id) on delete restrict,
  sequence_no integer not null check (sequence_no > 0),
  debit_amount numeric(18,2) not null default 0,
  credit_amount numeric(18,2) not null default 0,
  branch_code text null,
  merchant_id text null,
  rider_or_employee_id text null,
  source_reference text null,
  cost_center text null,
  description text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (journal_id, sequence_no),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or
    (credit_amount > 0 and debit_amount = 0)
  )
);
create index be_journal_lines_journal_idx on public.be_journal_lines(journal_id);
create index be_journal_lines_account_idx on public.be_journal_lines(account_id);

create table public.be_accounting_source_links (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_table text not null,
  source_record_id text not null,
  event_type text not null,
  accounting_version text not null,
  input_fingerprint text not null,
  event_id uuid not null references public.be_accounting_events(id) on delete restrict,
  journal_id uuid null references public.be_journal_entries(id) on delete restrict,
  source_updated_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index be_accounting_source_links_identity_uq
on public.be_accounting_source_links (
  source_system, source_table, source_record_id, event_type, accounting_version
);
create index be_accounting_source_links_event_idx on public.be_accounting_source_links(event_id);
create index be_accounting_source_links_journal_idx on public.be_accounting_source_links(journal_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  actor_email text null,
  action text not null,
  entity_type text not null default 'ACCOUNTING',
  entity_id text null,
  status text not null default 'success',
  before_data jsonb null,
  after_data jsonb null,
  notes text null,
  created_at timestamptz not null default now(),
  table_name text null,
  record_id uuid null,
  old_data jsonb null,
  new_data jsonb null,
  performed_by uuid null,
  reason text null,
  request_id text null,
  source_ip inet null,
  user_agent text null,
  related_journal_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  "timestamp" timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists actor_id uuid null,
  add column if not exists actor_email text null,
  add column if not exists entity_type text,
  add column if not exists entity_id text null,
  add column if not exists status text default 'success',
  add column if not exists before_data jsonb null,
  add column if not exists after_data jsonb null,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists table_name text null,
  add column if not exists record_id uuid null,
  add column if not exists old_data jsonb null,
  add column if not exists new_data jsonb null,
  add column if not exists performed_by uuid null,
  add column if not exists reason text null,
  add column if not exists request_id text null,
  add column if not exists source_ip inet null,
  add column if not exists user_agent text null,
  add column if not exists related_journal_id uuid null,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists "timestamp" timestamptz default now();

update public.audit_logs
set entity_type=coalesce(nullif(entity_type,''),nullif(table_name,''),'ACCOUNTING')
where entity_type is null or btrim(entity_type)='';

update public.audit_logs
set table_name=coalesce(nullif(table_name,''),nullif(entity_type,''),'ACCOUNTING')
where table_name is null or btrim(table_name)='';

update public.audit_logs
set "timestamp"=coalesce("timestamp",created_at,now())
where "timestamp" is null;

alter table public.audit_logs
  alter column entity_type set default 'ACCOUNTING',
  alter column entity_type set not null,
  alter column status set default 'success',
  alter column created_at set default now(),
  alter column "timestamp" set default now(),
  alter column "timestamp" set not null,
  alter column metadata set default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='audit_logs_related_journal_id_fkey'
      and conrelid='public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_related_journal_id_fkey
      foreign key (related_journal_id)
      references public.be_journal_entries(id)
      on delete restrict;
  end if;
end $$;

create index if not exists audit_logs_record_idx on public.audit_logs(table_name,record_id,"timestamp" desc);
create index if not exists audit_logs_journal_idx on public.audit_logs(related_journal_id);

create table public.be_fixed_asset_register (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_name text not null,
  category text not null,
  acquisition_date date not null,
  acquisition_cost numeric(18,2) not null check (acquisition_cost > 0),
  residual_value numeric(18,2) not null default 0 check (residual_value >= 0),
  useful_life_months integer not null check (useful_life_months > 0),
  depreciation_method text not null default 'STRAIGHT_LINE' check (depreciation_method in ('STRAIGHT_LINE')),
  department_code text null,
  branch_code text null,
  supplier_reference text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','FULLY_DEPRECIATED','DISPOSED','UNDER_REVIEW')),
  disposed_at date null,
  disposal_proceeds numeric(18,2) null check (disposal_proceeds is null or disposal_proceeds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (residual_value <= acquisition_cost)
);
create index be_fixed_asset_register_status_idx on public.be_fixed_asset_register(status,acquisition_date);
create index be_fixed_asset_register_branch_idx on public.be_fixed_asset_register(branch_code);

create table public.be_asset_depreciation_schedule (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.be_fixed_asset_register(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  depreciation_amount numeric(18,2) not null check (depreciation_amount >= 0),
  accumulated_depreciation numeric(18,2) not null check (accumulated_depreciation >= 0),
  net_book_value numeric(18,2) not null check (net_book_value >= 0),
  journal_id uuid null references public.be_journal_entries(id) on delete restrict,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','POSTED','SKIPPED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (asset_id, period_start, period_end),
  check (period_end >= period_start)
);
create index be_asset_depreciation_schedule_asset_idx on public.be_asset_depreciation_schedule(asset_id);
create index be_asset_depreciation_schedule_journal_idx on public.be_asset_depreciation_schedule(journal_id);

create table public.be_financial_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  accounting_period_id uuid null references public.be_accounting_periods(id) on delete restrict,
  report_type text not null check (report_type in ('TRIAL_BALANCE','PROFIT_LOSS','BALANCE_SHEET','MONTHLY_STATEMENTS')),
  report_version text not null,
  ledger_cutoff_at timestamptz not null,
  report_data jsonb not null,
  content_hash text not null,
  approved_by uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (accounting_period_id, report_type, report_version)
);
create index be_financial_report_snapshots_period_idx on public.be_financial_report_snapshots(accounting_period_id);

insert into public.be_chart_of_accounts
(account_code,account_name,account_type,normal_balance,report_group,is_postable)
values
('1000','Cash on Hand','ASSET','DEBIT','CASH_AND_EQUIVALENTS',true),
('1010','Petty Cash','ASSET','DEBIT','CASH_AND_EQUIVALENTS',true),
('1100','Bank Accounts','ASSET','DEBIT','CASH_AND_EQUIVALENTS',true),
('1200','COD Unallocated Clearing','ASSET','DEBIT','COD_CLEARING',true),
('1210','Rider COD Receivable','ASSET','DEBIT','RECEIVABLES',true),
('1220','Accounts Receivable','ASSET','DEBIT','RECEIVABLES',true),
('1300','Prepaid Expenses','ASSET','DEBIT','PREPAYMENTS',true),
('1500','Fixed Assets Control','ASSET','DEBIT','FIXED_ASSETS',false),
('1510','Fleet Vehicles','ASSET','DEBIT','FIXED_ASSETS',true),
('1520','Warehouse Machinery','ASSET','DEBIT','FIXED_ASSETS',true),
('1530','IT Infrastructure','ASSET','DEBIT','FIXED_ASSETS',true),
('1540','Office Equipment','ASSET','DEBIT','FIXED_ASSETS',true),
('1590','Accumulated Depreciation','ASSET','CREDIT','ACCUMULATED_DEPRECIATION',true),
('2000','Accounts Payable','LIABILITY','CREDIT','ACCOUNTS_PAYABLE',true),
('2100','Merchant COD Payable','LIABILITY','CREDIT','MERCHANT_PAYABLE',true),
('2200','Rider Commission Payable','LIABILITY','CREDIT','RIDER_PAYABLE',true),
('2300','Payroll Payable','LIABILITY','CREDIT','PAYROLL_PAYABLE',true),
('2400','Expense Accruals','LIABILITY','CREDIT','ACCRUED_EXPENSES',true),
('2500','COD Pending Remittance','LIABILITY','CREDIT','COD_LIABILITIES',true),
('3000','Capital','EQUITY','CREDIT','CAPITAL',true),
('3100','Retained Earnings','EQUITY','CREDIT','RETAINED_EARNINGS',true),
('3200','Current Year Earnings','EQUITY','CREDIT','CURRENT_EARNINGS',false),
('4000','Delivery Service Revenue','REVENUE','CREDIT','DELIVERY_REVENUE',true),
('4100','COD Handling Revenue','REVENUE','CREDIT','COD_REVENUE',true),
('4200','Surcharge Revenue','REVENUE','CREDIT','SURCHARGE_REVENUE',true),
('4300','Partner Commission Revenue','REVENUE','CREDIT','PARTNER_COMMISSION_REVENUE',true),
('5000','Rider Commission Expense','COGS','DEBIT','RIDER_COMMISSION',true),
('5100','Fuel & Tolls Expense','COGS','DEBIT','FUEL_TOLLS',true),
('5200','Packaging Supplies Expense','COGS','DEBIT','PACKAGING',true),
('5300','Outsourced Delivery Expense','COGS','DEBIT','OUTSOURCE_DELIVERY',true),
('6000','Payroll Expense','EXPENSE','DEBIT','PAYROLL',true),
('6100','Warehouse Overtime Expense','EXPENSE','DEBIT','OVERTIME',true),
('6200','Rent Expense','EXPENSE','DEBIT','RENT',true),
('6300','Utilities Expense','EXPENSE','DEBIT','UTILITIES',true),
('6400','Administrative Expense','EXPENSE','DEBIT','ADMIN',true),
('6500','Depreciation Expense','EXPENSE','DEBIT','DEPRECIATION',true),
('6600','Petty Cash Expense','EXPENSE','DEBIT','PETTY_CASH_EXPENSE',true),
('6700','Other Operating Expense','EXPENSE','DEBIT','OTHER_OPEX',true)
on conflict (account_code) do nothing;

alter table public.be_chart_of_accounts enable row level security;
alter table public.be_accounting_periods enable row level security;
alter table public.be_accounting_events enable row level security;
alter table public.be_accounting_event_lines enable row level security;
alter table public.be_journal_entries enable row level security;
alter table public.be_journal_lines enable row level security;
alter table public.be_accounting_source_links enable row level security;
alter table public.audit_logs enable row level security;
alter table public.be_fixed_asset_register enable row level security;
alter table public.be_asset_depreciation_schedule enable row level security;
alter table public.be_financial_report_snapshots enable row level security;

comment on table public.be_journal_entries is
  'Enterprise accounting journal headers. Posted history is immutable through application policy/RPC controls.';
comment on table public.be_journal_lines is
  'Double-entry journal lines. Each row contains exactly one positive debit or one positive credit.';
comment on table public.be_accounting_events is
  'Normalized accounting events awaiting review/posting; operational source data remains authoritative for logistics economics.';

commit;
