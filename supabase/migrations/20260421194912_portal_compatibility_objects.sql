create extension if not exists pgcrypto;

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid()
);

alter table if exists public.wallet_accounts add column if not exists account_name text;
alter table if exists public.wallet_accounts add column if not exists currency text default 'MMK';
alter table if exists public.wallet_accounts add column if not exists balance numeric default 0;
alter table if exists public.wallet_accounts add column if not exists available_balance numeric default 0;
alter table if exists public.wallet_accounts add column if not exists pending_balance numeric default 0;
alter table if exists public.wallet_accounts add column if not exists updated_at timestamptz default now();

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid()
);

alter table if exists public.wallet_transactions add column if not exists reference_no text;
alter table if exists public.wallet_transactions add column if not exists transaction_type text;
alter table if exists public.wallet_transactions add column if not exists amount numeric default 0;
alter table if exists public.wallet_transactions add column if not exists status text default 'posted';
alter table if exists public.wallet_transactions add column if not exists channel text;
alter table if exists public.wallet_transactions add column if not exists created_at timestamptz default now();

create or replace function public.get_finance_summary()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'wallet_accounts', coalesce((select count(*) from public.wallet_accounts), 0),
    'wallet_transactions', coalesce((select count(*) from public.wallet_transactions), 0),
    'total_balance', coalesce((select sum(coalesce(balance, 0)) from public.wallet_accounts), 0),
    'updated_at', now()
  );
$$;

create table if not exists public.role_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  role_code text,
  created_at timestamptz default now()
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  title text,
  document_type text,
  file_url text,
  created_at timestamptz default now()
);

create table if not exists public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  asset_code text,
  asset_type text,
  assigned_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.disciplinary_cases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  case_type text,
  notes text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid,
  training_name text,
  provider text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  title text,
  body text,
  unread boolean default true,
  created_at timestamptz default now()
);

alter table if exists public.attendance add column if not exists attendance_date date;