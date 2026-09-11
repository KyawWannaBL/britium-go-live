create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.hr_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_master(id) on delete cascade,
  attendance_date date not null default current_date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text not null default 'present' check (status in ('present','late','absent','leave','remote')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, attendance_date)
);

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_master(id) on delete cascade,
  leave_type text not null default 'annual' check (leave_type in ('annual','medical','casual','maternity','unpaid','other')),
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_staff_id uuid references public.staff_master(id) on delete set null,
  approval_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null unique,
  title text not null,
  channel text not null default 'sms' check (channel in ('sms','email','facebook','tiktok','telegram','viber','mixed')),
  status text not null default 'draft' check (status in ('draft','scheduled','active','paused','completed','cancelled')),
  audience_filter jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  budget numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_offices (
  id uuid primary key default gen_random_uuid(),
  branch_code text not null unique,
  branch_name text not null,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  manager_staff_id uuid references public.staff_master(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipments
  add column if not exists branch_office_id uuid references public.branch_offices(id) on delete set null;

alter table public.finance_transactions
  add column if not exists branch_office_id uuid references public.branch_offices(id) on delete set null;

create table if not exists public.branch_office_finance_entries (
  id uuid primary key default gen_random_uuid(),
  branch_office_id uuid not null references public.branch_offices(id) on delete cascade,
  entry_type text not null check (entry_type in ('income','expense')),
  amount numeric(14,2) not null default 0,
  entry_date date not null default current_date,
  category text not null default 'general',
  notes text,
  related_transaction_id uuid references public.finance_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_user_settings (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  language_code text not null default 'en' check (language_code in ('en','mm')),
  email_notifications boolean not null default true,
  sms_notifications boolean not null default true,
  push_notifications boolean not null default true,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_attendance_updated_at on public.hr_attendance;
create trigger trg_hr_attendance_updated_at before update on public.hr_attendance
for each row execute function public.set_updated_at();

drop trigger if exists trg_hr_leave_requests_updated_at on public.hr_leave_requests;
create trigger trg_hr_leave_requests_updated_at before update on public.hr_leave_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger trg_marketing_campaigns_updated_at before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists trg_branch_offices_updated_at on public.branch_offices;
create trigger trg_branch_offices_updated_at before update on public.branch_offices
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_user_settings_updated_at on public.app_user_settings;
create trigger trg_app_user_settings_updated_at before update on public.app_user_settings
for each row execute function public.set_updated_at();

alter table public.hr_attendance enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.branch_offices enable row level security;
alter table public.branch_office_finance_entries enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.app_user_settings enable row level security;

drop policy if exists "hr_attendance_select_authenticated" on public.hr_attendance;
create policy "hr_attendance_select_authenticated" on public.hr_attendance
for select to authenticated using (true);

drop policy if exists "hr_attendance_write_authenticated" on public.hr_attendance;
create policy "hr_attendance_write_authenticated" on public.hr_attendance
for all to authenticated using (true) with check (true);

drop policy if exists "hr_leave_requests_select_authenticated" on public.hr_leave_requests;
create policy "hr_leave_requests_select_authenticated" on public.hr_leave_requests
for select to authenticated using (true);

drop policy if exists "hr_leave_requests_write_authenticated" on public.hr_leave_requests;
create policy "hr_leave_requests_write_authenticated" on public.hr_leave_requests
for all to authenticated using (true) with check (true);

drop policy if exists "marketing_campaigns_select_authenticated" on public.marketing_campaigns;
create policy "marketing_campaigns_select_authenticated" on public.marketing_campaigns
for select to authenticated using (true);

drop policy if exists "marketing_campaigns_write_authenticated" on public.marketing_campaigns;
create policy "marketing_campaigns_write_authenticated" on public.marketing_campaigns
for all to authenticated using (true) with check (true);

drop policy if exists "branch_offices_select_authenticated" on public.branch_offices;
create policy "branch_offices_select_authenticated" on public.branch_offices
for select to authenticated using (true);

drop policy if exists "branch_offices_write_authenticated" on public.branch_offices;
create policy "branch_offices_write_authenticated" on public.branch_offices
for all to authenticated using (true) with check (true);

drop policy if exists "branch_office_finance_entries_select_authenticated" on public.branch_office_finance_entries;
create policy "branch_office_finance_entries_select_authenticated" on public.branch_office_finance_entries
for select to authenticated using (true);

drop policy if exists "branch_office_finance_entries_write_authenticated" on public.branch_office_finance_entries;
create policy "branch_office_finance_entries_write_authenticated" on public.branch_office_finance_entries
for all to authenticated using (true) with check (true);

drop policy if exists "customer_feedback_select_authenticated" on public.customer_feedback;
create policy "customer_feedback_select_authenticated" on public.customer_feedback
for select to authenticated using (true);

drop policy if exists "customer_feedback_write_authenticated" on public.customer_feedback;
create policy "customer_feedback_write_authenticated" on public.customer_feedback
for all to authenticated using (true) with check (true);

drop policy if exists "app_user_settings_select_authenticated" on public.app_user_settings;
create policy "app_user_settings_select_authenticated" on public.app_user_settings
for select to authenticated using (auth.uid() = auth_user_id);

drop policy if exists "app_user_settings_write_authenticated" on public.app_user_settings;
create policy "app_user_settings_write_authenticated" on public.app_user_settings
for all to authenticated using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

create index if not exists idx_hr_attendance_staff_date on public.hr_attendance(staff_id, attendance_date desc);
create index if not exists idx_hr_leave_requests_staff_id on public.hr_leave_requests(staff_id, start_date desc);
create index if not exists idx_marketing_campaigns_status on public.marketing_campaigns(status, scheduled_at desc);
create index if not exists idx_branch_office_finance_entries_branch_id on public.branch_office_finance_entries(branch_office_id, entry_date desc);
create index if not exists idx_customer_feedback_shipment_id on public.customer_feedback(shipment_id, created_at desc);
