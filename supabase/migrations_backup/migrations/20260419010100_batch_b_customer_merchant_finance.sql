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

create table if not exists public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_code text not null unique,
  merchant_name text not null,
  contact_name text,
  email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  auth_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipments
  add column if not exists merchant_profile_id uuid references public.merchant_profiles(id) on delete set null;

alter table public.shipments
  add column if not exists customer_auth_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.customer_support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('TKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  shipment_id uuid references public.shipments(id) on delete set null,
  merchant_profile_id uuid references public.merchant_profiles(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  created_by_role text not null default 'customer',
  channel text not null default 'portal' check (channel in ('portal','chat','phone','email','branch')),
  category text not null default 'general',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  subject text not null,
  description text not null,
  assigned_staff_id uuid references public.staff_master(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_chat_threads (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.customer_support_tickets(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  assigned_staff_id uuid references public.staff_master(id) on delete set null,
  status text not null default 'open' check (status in ('open','waiting','closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_chat_threads(id) on delete cascade,
  sender_auth_user_id uuid references auth.users(id) on delete set null,
  sender_staff_id uuid references public.staff_master(id) on delete set null,
  sender_role text not null default 'customer',
  message_text text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  merchant_profile_id uuid references public.merchant_profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  amount numeric(14,2) not null default 0,
  delivery_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','overdue','refunded','disputed')),
  issued_date date not null default current_date,
  due_date date not null default current_date + 7,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  related_type text,
  related_id uuid,
  category text not null,
  direction text not null check (direction in ('in','out')),
  amount numeric(14,2) not null default 0,
  status text not null default 'posted' check (status in ('draft','posted','reconciled','void')),
  transaction_date timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_merchant_profiles_updated_at on public.merchant_profiles;
create trigger trg_merchant_profiles_updated_at before update on public.merchant_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_support_tickets_updated_at on public.customer_support_tickets;
create trigger trg_customer_support_tickets_updated_at before update on public.customer_support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_chat_threads_updated_at on public.customer_chat_threads;
create trigger trg_customer_chat_threads_updated_at before update on public.customer_chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists trg_finance_receipts_updated_at on public.finance_receipts;
create trigger trg_finance_receipts_updated_at before update on public.finance_receipts
for each row execute function public.set_updated_at();

alter table public.merchant_profiles enable row level security;
alter table public.customer_support_tickets enable row level security;
alter table public.customer_chat_threads enable row level security;
alter table public.customer_chat_messages enable row level security;
alter table public.finance_receipts enable row level security;
alter table public.finance_transactions enable row level security;

drop policy if exists "merchant_profiles_select_authenticated" on public.merchant_profiles;
create policy "merchant_profiles_select_authenticated" on public.merchant_profiles
for select to authenticated using (true);

drop policy if exists "merchant_profiles_write_authenticated" on public.merchant_profiles;
create policy "merchant_profiles_write_authenticated" on public.merchant_profiles
for all to authenticated using (true) with check (true);

drop policy if exists "customer_support_tickets_select_authenticated" on public.customer_support_tickets;
create policy "customer_support_tickets_select_authenticated" on public.customer_support_tickets
for select to authenticated using (true);

drop policy if exists "customer_support_tickets_write_authenticated" on public.customer_support_tickets;
create policy "customer_support_tickets_write_authenticated" on public.customer_support_tickets
for all to authenticated using (true) with check (true);

drop policy if exists "customer_chat_threads_select_authenticated" on public.customer_chat_threads;
create policy "customer_chat_threads_select_authenticated" on public.customer_chat_threads
for select to authenticated using (true);

drop policy if exists "customer_chat_threads_write_authenticated" on public.customer_chat_threads;
create policy "customer_chat_threads_write_authenticated" on public.customer_chat_threads
for all to authenticated using (true) with check (true);

drop policy if exists "customer_chat_messages_select_authenticated" on public.customer_chat_messages;
create policy "customer_chat_messages_select_authenticated" on public.customer_chat_messages
for select to authenticated using (true);

drop policy if exists "customer_chat_messages_write_authenticated" on public.customer_chat_messages;
create policy "customer_chat_messages_write_authenticated" on public.customer_chat_messages
for all to authenticated using (true) with check (true);

drop policy if exists "finance_receipts_select_authenticated" on public.finance_receipts;
create policy "finance_receipts_select_authenticated" on public.finance_receipts
for select to authenticated using (true);

drop policy if exists "finance_receipts_write_authenticated" on public.finance_receipts;
create policy "finance_receipts_write_authenticated" on public.finance_receipts
for all to authenticated using (true) with check (true);

drop policy if exists "finance_transactions_select_authenticated" on public.finance_transactions;
create policy "finance_transactions_select_authenticated" on public.finance_transactions
for select to authenticated using (true);

drop policy if exists "finance_transactions_write_authenticated" on public.finance_transactions;
create policy "finance_transactions_write_authenticated" on public.finance_transactions
for all to authenticated using (true) with check (true);

create index if not exists idx_customer_support_tickets_status on public.customer_support_tickets(status, created_at desc);
create index if not exists idx_customer_support_tickets_shipment_id on public.customer_support_tickets(shipment_id);
create index if not exists idx_customer_chat_threads_ticket_id on public.customer_chat_threads(ticket_id);
create index if not exists idx_customer_chat_messages_thread_id on public.customer_chat_messages(thread_id, created_at);
create index if not exists idx_finance_receipts_merchant_profile_id on public.finance_receipts(merchant_profile_id, issued_date desc);
create index if not exists idx_finance_transactions_transaction_date on public.finance_transactions(transaction_date desc);
