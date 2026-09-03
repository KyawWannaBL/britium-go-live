-- Britium Express RLS-backed login and route authorization contract.
-- Password verification remains in Supabase Auth. This migration decides whether
-- the authenticated identity is an active, registered Britium account and exposes
-- only that identity's role/territory envelope to the browser.

revoke all on table public.be_user_account_registry from anon;
revoke all on table public.be_user_account_registry from authenticated;
grant select on table public.be_user_account_registry to authenticated;
alter table public.be_user_account_registry enable row level security;

drop policy if exists be_user_account_registry_read_all on public.be_user_account_registry;
drop policy if exists be_user_account_registry_write_all on public.be_user_account_registry;
drop policy if exists be_user_account_registry_own_read_v20 on public.be_user_account_registry;

create policy be_user_account_registry_own_read_v20
on public.be_user_account_registry
for select to authenticated
using (auth_user_id = (select auth.uid()));

create or replace function public.be_login_access_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.be_user_account_registry%rowtype;
  v_role text;
  v_active boolean;
  v_territories jsonb := '[]'::jsonb;
  v_requires_territory boolean;
begin
  if v_uid is null then
    return jsonb_build_object('authorized', false, 'reason', 'AUTH_REQUIRED');
  end if;

  select * into v_account
  from public.be_user_account_registry
  where auth_user_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('authorized', false, 'reason', 'ACCOUNT_NOT_REGISTERED');
  end if;

  v_role := lower(regexp_replace(btrim(coalesce(
    nullif(v_account.role_code, ''), nullif(v_account.app_role, ''),
    nullif(v_account.user_role, ''), nullif(v_account.role, ''), 'guest'
  )), '[ _]+', '-', 'g'));

  v_active := coalesce(v_account.active, v_account.is_active, true)
    and lower(btrim(coalesce(v_account.status, 'active'))) in ('active', 'enabled');

  if not v_active then
    return jsonb_build_object('authorized', false, 'reason', 'ACCOUNT_INACTIVE');
  end if;

  if v_role in ('', 'guest', 'authenticated', 'anon') then
    return jsonb_build_object('authorized', false, 'reason', 'ROLE_NOT_ASSIGNED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'scope_type', a.scope_type,
    'branch_id', a.branch_id,
    'branch_code', a.branch_code,
    'township_key', a.township_key,
    'can_read', a.can_read,
    'can_create', a.can_create,
    'can_update', a.can_update,
    'can_delete', a.can_delete
  ) order by a.scope_type, a.branch_code, a.township_key), '[]'::jsonb)
  into v_territories
  from public.be_employee_territory_assignments a
  where a.user_id = v_uid and a.active and a.can_read;

  v_requires_territory := v_role in (
    'admin', 'operations-admin', 'operations', 'supervisor', 'wayplan-manager',
    'warehouse-staff', 'warehouse', 'data-entry', 'customer-service',
    'finance', 'finance-user', 'analyst', 'driver', 'rider',
    'branch-office', 'branch-manager', 'branch-staff', 'branch-admin'
  );

  if v_requires_territory and jsonb_array_length(v_territories) = 0 then
    return jsonb_build_object('authorized', false, 'reason', 'TERRITORY_NOT_ASSIGNED');
  end if;

  return jsonb_build_object(
    'authorized', true,
    'user_id', v_account.user_id,
    'auth_user_id', v_uid,
    'email', coalesce(nullif(v_account.email, ''), nullif(v_account.account_email, ''), nullif(v_account.login_email, '')),
    'full_name', coalesce(nullif(v_account.full_name, ''), nullif(v_account.display_name, '')),
    'role', v_role,
    'branch_code', coalesce(nullif(v_account.branch_code, ''), nullif(v_account.branch, '')),
    'status', v_account.status,
    'must_change_password', coalesce(v_account.must_change_password, false)
      or coalesce(v_account.force_password_change, false)
      or coalesce(v_account.password_change_required, false),
    'territories', v_territories
  );
end
$$;

revoke all on function public.be_login_access_profile() from public, anon;
grant execute on function public.be_login_access_profile() to authenticated;

create or replace function public.be_complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.be_user_account_registry
  set must_change_password = false,
      force_password_change = false,
      password_change_required = false,
      updated_at = now()
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'ACCOUNT_NOT_REGISTERED' using errcode = '42501';
  end if;
  return true;
end
$$;

revoke all on function public.be_complete_password_change() from public, anon;
grant execute on function public.be_complete_password_change() to authenticated;

-- Retire email-address lookup endpoints that can disclose another employee's
-- role, branch, name, or active status. Login now resolves strictly by auth.uid().
revoke all on function public.be_get_user_access_by_email(text) from public, anon, authenticated;
revoke all on function public.be_resolve_user_access_by_email(text) from public, anon, authenticated;

create or replace function public.be_rls_login_health_v20()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok', true,
    'registry_rls', c.relrowsecurity,
    'open_registry_policies', (
      select count(*) from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'be_user_account_registry'
        and (p.qual = 'true' or p.with_check = 'true')
    ),
    'access_contract', to_regprocedure('public.be_login_access_profile()') is not null,
    'password_change_contract', to_regprocedure('public.be_complete_password_change()') is not null
  )
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'be_user_account_registry';
$$;

revoke all on function public.be_rls_login_health_v20() from public, anon;
grant execute on function public.be_rls_login_health_v20() to authenticated;
