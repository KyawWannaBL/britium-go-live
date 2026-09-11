-- Restore and normalize super-admin access for MD and Sai
-- Canonical application/database role value is: super-admin

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email'), '')
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select lower(public.current_user_email()) in ('md@britiumexpress.com', 'sai@britiumexpress.com')
$$;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'super-admin', 'role_code', 'SUPER_ADMIN'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'super-admin')
where lower(email) in ('md@britiumexpress.com', 'sai@britiumexpress.com');

insert into public.user_profiles (id, email, full_name, role, is_active)
select
  u.id,
  lower(u.email),
  case
    when lower(u.email) = 'md@britiumexpress.com' then coalesce(u.raw_user_meta_data ->> 'full_name', 'Managing Director')
    when lower(u.email) = 'sai@britiumexpress.com' then coalesce(u.raw_user_meta_data ->> 'full_name', 'Sai')
    else split_part(lower(u.email), '@', 1)
  end,
  'super-admin'::employee_role,
  true
from auth.users u
where lower(u.email) in ('md@britiumexpress.com', 'sai@britiumexpress.com')
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = true,
    updated_at = now();

-- Normalize any legacy underscore role tokens left by older password-reset scripts.
update public.user_profiles
set role = case
  when role::text = 'super_admin' then 'super-admin'::employee_role
  when role::text = 'warehouse_staff' then 'warehouse-staff'::employee_role
  when role::text = 'customer_service' then 'customer-service'::employee_role
  when role::text = 'branch_staff' then 'branch-office'::employee_role
  when role::text = 'wayplan' then 'wayplan-manager'::employee_role
  when role::text = 'hr' then 'hr-admin'::employee_role
  else role
end
where role::text in ('super_admin', 'warehouse_staff', 'customer_service', 'branch_staff', 'wayplan', 'hr');
