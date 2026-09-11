-- Britium UAT Role Authority + Account Registry Preparation
-- Run this first in Supabase SQL Editor.
-- Then run seed_uat_accounts.mjs with SUPABASE_SERVICE_ROLE_KEY on a trusted machine.

create extension if not exists pgcrypto;

create table if not exists public.be_role_authority_matrix (
  role_id text primary key,
  role_name text not null,
  authority_level integer not null check (authority_level between 0 and 100),
  user_type text not null check (user_type in ('internal', 'external', 'mobile')),
  default_landing_path text not null default '/',
  can_access_portal boolean not null default true,
  can_access_mobile boolean not null default false,
  rights jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.be_role_authority_matrix add column if not exists role_name text;
alter table public.be_role_authority_matrix add column if not exists authority_level integer;
alter table public.be_role_authority_matrix add column if not exists user_type text;
alter table public.be_role_authority_matrix add column if not exists default_landing_path text;
alter table public.be_role_authority_matrix add column if not exists can_access_portal boolean default true;
alter table public.be_role_authority_matrix add column if not exists can_access_mobile boolean default false;
alter table public.be_role_authority_matrix add column if not exists rights jsonb default '{}'::jsonb;
alter table public.be_role_authority_matrix add column if not exists is_active boolean default true;
alter table public.be_role_authority_matrix add column if not exists created_at timestamptz default now();
alter table public.be_role_authority_matrix add column if not exists updated_at timestamptz default now();

insert into public.be_role_authority_matrix
(role_id, role_name, authority_level, user_type, default_landing_path, can_access_portal, can_access_mobile, rights)
values
('superadmin', 'Super Admin', 100, 'internal', '/admin/master-data', true, false, '{"portals": ["enterprise", "merchant", "customer", "rider"], "modules": {"all": {"view": true, "create": true, "update": true, "delete": true, "approve": true, "assign": true, "upload": true, "export": true, "settle": true, "admin": true}}}'::jsonb),
('marketing', 'Marketing', 45, 'internal', '/marketing', true, false, '{"portals": ["enterprise"], "modules": {"merchant_master": {"view": true, "create": true, "update": true, "export": true}, "customer_master": {"view": true, "create": true, "update": true, "export": true}, "campaigns": {"view": true, "create": true, "update": true, "export": true}, "pickup_tracking": {"view": true}}}'::jsonb),
('business_development_manager', 'Bus. Dev. Manager', 75, 'internal', '/business-development', true, false, '{"portals": ["enterprise"], "modules": {"merchant_master": {"view": true, "create": true, "update": true, "approve": true, "export": true}, "contracts": {"view": true, "create": true, "update": true, "approve": true, "export": true}, "tariff": {"view": true, "update": true, "approve": true}, "pickup_tracking": {"view": true}, "reports": {"view": true, "export": true}}}'::jsonb),
('branch_office_manager', 'Branch Manager', 72, 'internal', '/branch-office', true, false, '{"portals": ["enterprise"], "modules": {"branch_office": {"view": true, "create": true, "update": true, "approve": true, "export": true}, "pickup_tracking": {"view": true, "update": true}, "warehouse": {"view": true, "update": true}, "dispatch": {"view": true, "assign": true}, "reports": {"view": true, "export": true}}}'::jsonb),
('staff', 'Staff', 30, 'internal', '/staff', true, false, '{"portals": ["enterprise"], "modules": {"pickup_tracking": {"view": true}, "reports": {"view": true}, "notifications": {"view": true, "update": true}}}'::jsonb),
('customer_service', 'Customer Service', 60, 'internal', '/customer-service', true, false, '{"portals": ["enterprise"], "modules": {"pickup_request": {"view": true, "create": true, "update": true, "export": true}, "customer_service": {"view": true, "create": true, "update": true, "assign": true}, "merchant_master": {"view": true}, "customer_master": {"view": true, "update": true}, "cargo_events": {"view": true, "create": true}, "exceptions": {"view": true, "create": true, "update": true}, "notifications": {"view": true, "update": true}}}'::jsonb),
('data_entry', 'Data Entry', 55, 'internal', '/data-entry', true, false, '{"portals": ["enterprise"], "modules": {"data_entry": {"view": true, "create": true, "update": true, "upload": true, "export": true}, "waybill": {"view": true, "create": true, "update": true, "upload": true, "export": true}, "tariff": {"view": true}, "pickup_tracking": {"view": true}, "cargo_events": {"view": true, "create": true}}}'::jsonb),
('supervisor', 'Supervisor', 70, 'internal', '/supervisor-pickup', true, false, '{"portals": ["enterprise"], "modules": {"supervisor_pickup": {"view": true, "update": true, "assign": true, "export": true}, "supervisor_wayplan": {"view": true, "update": true, "approve": true, "assign": true}, "workforce": {"view": true}, "fleet": {"view": true}, "dispatch": {"view": true, "assign": true}, "cargo_events": {"view": true, "create": true}}}'::jsonb),
('warehouse', 'Warehouse', 62, 'internal', '/warehouse', true, false, '{"portals": ["enterprise"], "modules": {"warehouse": {"view": true, "create": true, "update": true, "upload": true, "export": true}, "inventory": {"view": true, "create": true, "update": true, "export": true}, "exceptions": {"view": true, "create": true, "update": true}, "cargo_events": {"view": true, "create": true}}}'::jsonb),
('dispatch', 'Dispatch', 68, 'internal', '/dispatch', true, false, '{"portals": ["enterprise"], "modules": {"dispatch": {"view": true, "create": true, "update": true, "assign": true, "export": true}, "routes": {"view": true, "create": true, "update": true, "assign": true, "export": true}, "workforce": {"view": true}, "fleet": {"view": true}, "cargo_events": {"view": true, "create": true}}}'::jsonb),
('finance', 'Finance', 62, 'internal', '/finance', true, false, '{"portals": ["enterprise"], "modules": {"finance": {"view": true, "create": true, "update": true, "settle": true, "export": true}, "cod_settlement": {"view": true, "create": true, "update": true, "settle": true, "export": true}, "tariff": {"view": true, "update": true}, "pickup_tracking": {"view": true}, "reports": {"view": true, "export": true}}}'::jsonb),
('merchant', 'Merchant', 35, 'external', '/merchant', true, false, '{"portals": ["merchant"], "modules": {"merchant_portal": {"view": true, "create": true, "update": true, "upload": true, "export": true}, "pickup_request": {"view": true, "create": true, "upload": true, "export": true}, "tracking": {"view": true}, "merchant_template": {"view": true, "create": true, "upload": true, "export": true}}}'::jsonb),
('customer', 'Customer', 15, 'external', '/customer', true, false, '{"portals": ["customer"], "modules": {"customer_portal": {"view": true, "create": true, "update": true}, "pickup_request": {"view": true, "create": true}, "tracking": {"view": true}, "customer_service": {"view": true, "create": true}}}'::jsonb),
('rider', 'Rider', 25, 'mobile', '/rider/jobs', true, true, '{"portals": ["rider"], "modules": {"rider_app": {"view": true, "update": true}, "assigned_jobs": {"view": true, "update": true}, "cargo_events": {"view": true, "create": true}, "exceptions": {"view": true, "create": true}}}'::jsonb),
('driver', 'Driver', 25, 'mobile', '/rider/jobs', true, true, '{"portals": ["rider"], "modules": {"driver_app": {"view": true, "update": true}, "assigned_jobs": {"view": true, "update": true}, "cargo_events": {"view": true, "create": true}, "exceptions": {"view": true, "create": true}}}'::jsonb),
('helper', 'Helper', 20, 'mobile', '/rider/jobs', true, true, '{"portals": ["rider"], "modules": {"helper_app": {"view": true, "update": true}, "assigned_jobs": {"view": true, "update": true}, "cargo_events": {"view": true, "create": true}, "exceptions": {"view": true, "create": true}}}'::jsonb)
on conflict (role_id) do update set
  role_name = excluded.role_name,
  authority_level = excluded.authority_level,
  user_type = excluded.user_type,
  default_landing_path = excluded.default_landing_path,
  can_access_portal = excluded.can_access_portal,
  can_access_mobile = excluded.can_access_mobile,
  rights = excluded.rights,
  is_active = true,
  updated_at = now();

create table if not exists public.be_user_account_registry (
  auth_user_id uuid,
  email text primary key,
  full_name text,
  role_id text not null,
  role_name text,
  authority_level integer not null default 0,
  user_type text not null default 'internal',
  branch_code text default 'YGN',
  default_landing_path text default '/',
  rights jsonb not null default '{}'::jsonb,
  must_change_password boolean not null default false,
  is_active boolean not null default true,
  is_uat_account boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.be_user_account_registry add column if not exists auth_user_id uuid;
alter table public.be_user_account_registry add column if not exists full_name text;
alter table public.be_user_account_registry add column if not exists role_id text;
alter table public.be_user_account_registry add column if not exists role_name text;
alter table public.be_user_account_registry add column if not exists authority_level integer default 0;
alter table public.be_user_account_registry add column if not exists user_type text default 'internal';
alter table public.be_user_account_registry add column if not exists branch_code text default 'YGN';
alter table public.be_user_account_registry add column if not exists default_landing_path text default '/';
alter table public.be_user_account_registry add column if not exists rights jsonb default '{}'::jsonb;
alter table public.be_user_account_registry add column if not exists must_change_password boolean default false;
alter table public.be_user_account_registry add column if not exists is_active boolean default true;
alter table public.be_user_account_registry add column if not exists is_uat_account boolean default false;
alter table public.be_user_account_registry add column if not exists created_at timestamptz default now();
alter table public.be_user_account_registry add column if not exists updated_at timestamptz default now();

create unique index if not exists be_user_account_registry_email_uidx
  on public.be_user_account_registry (lower(email));

create index if not exists be_user_account_registry_role_idx
  on public.be_user_account_registry (role_id, authority_level);

create table if not exists public.be_mobile_workforce_accounts (
  auth_user_id uuid,
  email text primary key,
  workforce_code text,
  role text,
  full_name text,
  phone_primary text,
  branch_code text default 'YGN',
  assigned_zone text default 'Yangon Central',
  status text default 'Active',
  must_change_password boolean not null default false,
  is_active boolean not null default true,
  is_uat_account boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.be_mobile_workforce_accounts add column if not exists auth_user_id uuid;
alter table public.be_mobile_workforce_accounts add column if not exists email text;
alter table public.be_mobile_workforce_accounts add column if not exists workforce_code text;
alter table public.be_mobile_workforce_accounts add column if not exists role text;
alter table public.be_mobile_workforce_accounts add column if not exists full_name text;
alter table public.be_mobile_workforce_accounts add column if not exists phone_primary text;
alter table public.be_mobile_workforce_accounts add column if not exists branch_code text default 'YGN';
alter table public.be_mobile_workforce_accounts add column if not exists assigned_zone text default 'Yangon Central';
alter table public.be_mobile_workforce_accounts add column if not exists status text default 'Active';
alter table public.be_mobile_workforce_accounts add column if not exists must_change_password boolean default false;
alter table public.be_mobile_workforce_accounts add column if not exists is_active boolean default true;
alter table public.be_mobile_workforce_accounts add column if not exists is_uat_account boolean default false;
alter table public.be_mobile_workforce_accounts add column if not exists created_at timestamptz default now();
alter table public.be_mobile_workforce_accounts add column if not exists updated_at timestamptz default now();

create unique index if not exists be_mobile_workforce_accounts_email_uidx
  on public.be_mobile_workforce_accounts (lower(email));

create unique index if not exists be_mobile_workforce_accounts_code_uidx
  on public.be_mobile_workforce_accounts (workforce_code)
  where workforce_code is not null and workforce_code <> '';

create table if not exists public.be_uat_test_accounts (
  role_label text,
  email text primary key,
  role_id text not null,
  role_name text,
  authority_level integer,
  user_type text,
  branch_code text default 'YGN',
  workforce_code text,
  must_change_password boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.be_uat_test_accounts
(role_label, email, role_id, role_name, authority_level, user_type, branch_code, workforce_code, must_change_password, is_active)
values
('Super Admin', 'testadmin@britiumexpress.com', 'superadmin', 'Super Admin', 100, 'internal', 'YGN', '', false, true),
('Marketing', 'testmarketing@britiumexpress.com', 'marketing', 'Marketing', 45, 'internal', 'YGN', '', false, true),
('Bus. Dev. Manager', 'testbusiness_development_manager@britiumexpress.com', 'business_development_manager', 'Bus. Dev. Manager', 75, 'internal', 'YGN', '', false, true),
('Branch Manager', 'testbranch_office_manager@britiumexpress.com', 'branch_office_manager', 'Branch Manager', 72, 'internal', 'YGN', '', false, true),
('Staff', 'teststaff@britiumexpress.com', 'staff', 'Staff', 30, 'internal', 'YGN', '', false, true),
('Customer Service', 'testcustomer_service@britiumexpress.com', 'customer_service', 'Customer Service', 60, 'internal', 'YGN', '', false, true),
('Data Entry', 'testdata_entry@britiumexpress.com', 'data_entry', 'Data Entry', 55, 'internal', 'YGN', '', false, true),
('Supervisor', 'testsupervisor@britiumexpress.com', 'supervisor', 'Supervisor', 70, 'internal', 'YGN', '', false, true),
('Warehouse', 'testwarehouse@britiumexpress.com', 'warehouse', 'Warehouse', 62, 'internal', 'YGN', '', false, true),
('Dispatch', 'testdispatch@britiumexpress.com', 'dispatch', 'Dispatch', 68, 'internal', 'YGN', '', false, true),
('Finance', 'testfinance@britiumexpress.com', 'finance', 'Finance', 62, 'internal', 'YGN', '', false, true),
('Merchant', 'testmerchant@britiumexpress.com', 'merchant', 'Merchant', 35, 'external', 'YGN', '', false, true),
('Customer', 'testcustomer@britiumexpress.com', 'customer', 'Customer', 15, 'external', 'YGN', '', false, true),
('Rider', 'testrider@britiumexpress.com', 'rider', 'Rider', 25, 'mobile', 'YGN', 'UAT-RIDER-001', false, true),
('Driver', 'testdriver@britiumexpress.com', 'driver', 'Driver', 25, 'mobile', 'YGN', 'UAT-DRIVER-001', false, true),
('Helper', 'testhelper@britiumexpress.com', 'helper', 'Helper', 20, 'mobile', 'YGN', 'UAT-HELPER-001', false, true)
on conflict (email) do update set
  role_label = excluded.role_label,
  role_id = excluded.role_id,
  role_name = excluded.role_name,
  authority_level = excluded.authority_level,
  user_type = excluded.user_type,
  branch_code = excluded.branch_code,
  workforce_code = excluded.workforce_code,
  must_change_password = false,
  is_active = true;

create or replace function public.be_current_user_role()
returns table (
  auth_user_id uuid,
  email text,
  role_id text,
  role_name text,
  authority_level integer,
  user_type text,
  default_landing_path text,
  rights jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.auth_user_id,
    r.email,
    r.role_id,
    r.role_name,
    r.authority_level,
    r.user_type,
    r.default_landing_path,
    r.rights
  from public.be_user_account_registry r
  where r.auth_user_id = auth.uid()
    and r.is_active = true
  limit 1;
$$;

create or replace function public.be_can_access_module(p_module text, p_action text default 'view')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.be_user_account_registry%rowtype;
  v_allowed boolean;
begin
  select *
  into v_role
  from public.be_user_account_registry
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;

  if not found then
    return false;
  end if;

  if v_role.role_id = 'superadmin' then
    return true;
  end if;

  v_allowed := coalesce((v_role.rights -> 'modules' -> p_module ->> p_action)::boolean, false);

  return v_allowed;
end;
$$;

select role_id, role_name, authority_level, user_type, default_landing_path
from public.be_role_authority_matrix
order by authority_level desc, role_id;

select role_label, email, role_id, authority_level, must_change_password, is_active
from public.be_uat_test_accounts
order by authority_level desc, email;
