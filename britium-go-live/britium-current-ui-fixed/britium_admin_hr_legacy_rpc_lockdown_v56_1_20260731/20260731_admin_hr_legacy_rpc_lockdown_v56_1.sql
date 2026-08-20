-- BRITIUM PRODUCTION REMEDIATION
-- ADMIN/HR legacy SECURITY DEFINER RPC lockdown
-- Build: ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31
-- Safe intent:
--   * preserve the existing read-only snapshot for authenticated users
--   * remove browser execution of unsafe legacy employee save/delete RPCs
--   * retain service_role access for trusted server-side administration
--   * preserve function definitions before grant changes

begin;

create table if not exists public.be_rpc_security_backup_v56 (
  id bigint generated always as identity primary key,
  build text not null,
  schema_name text not null,
  function_name text not null,
  identity_arguments text not null,
  function_definition text not null,
  owner_name text not null,
  captured_at timestamptz not null default now(),
  unique (build, schema_name, function_name, identity_arguments)
);

insert into public.be_rpc_security_backup_v56 (
  build,
  schema_name,
  function_name,
  identity_arguments,
  function_definition,
  owner_name
)
select
  'ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31',
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  pg_get_functiondef(p.oid),
  pg_get_userbyid(p.proowner)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (p.proname = 'be_hr_employee_save'
      and pg_get_function_identity_arguments(p.oid) = 'p_record jsonb, p_actor_email text')
    or
    (p.proname = 'be_hr_employee_save_audited'
      and pg_get_function_identity_arguments(p.oid) = 'p_record jsonb, p_actor_email text')
    or
    (p.proname = 'be_hr_employee_delete'
      and pg_get_function_identity_arguments(p.oid) = 'p_employee_id text, p_actor_email text')
    or
    (p.proname = 'be_hr_employee_delete_audited'
      and pg_get_function_identity_arguments(p.oid) = 'p_employee_id text, p_actor_email text')
    or
    (p.proname = 'be_admin_hr_snapshot'
      and pg_get_function_identity_arguments(p.oid) = '')
  )
on conflict (build, schema_name, function_name, identity_arguments)
do nothing;

-- Remove unsafe direct browser access to legacy mutation RPCs.
revoke execute on function public.be_hr_employee_save(jsonb, text) from public;
revoke execute on function public.be_hr_employee_save_audited(jsonb, text) from public;
revoke execute on function public.be_hr_employee_delete(text, text) from public;
revoke execute on function public.be_hr_employee_delete_audited(text, text) from public;

-- Supabase client roles: revoke explicitly when present.
do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.be_hr_employee_save(jsonb, text) from anon';
    execute 'revoke execute on function public.be_hr_employee_save_audited(jsonb, text) from anon';
    execute 'revoke execute on function public.be_hr_employee_delete(text, text) from anon';
    execute 'revoke execute on function public.be_hr_employee_delete_audited(text, text) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.be_hr_employee_save(jsonb, text) from authenticated';
    execute 'revoke execute on function public.be_hr_employee_save_audited(jsonb, text) from authenticated';
    execute 'revoke execute on function public.be_hr_employee_delete(text, text) from authenticated';
    execute 'revoke execute on function public.be_hr_employee_delete_audited(text, text) from authenticated';
  end if;

  -- Trusted server-side callers may continue using the existing legacy functions
  -- until secured V54 mutation RPCs replace them.
  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.be_hr_employee_save(jsonb, text) to service_role';
    execute 'grant execute on function public.be_hr_employee_save_audited(jsonb, text) to service_role';
    execute 'grant execute on function public.be_hr_employee_delete(text, text) to service_role';
    execute 'grant execute on function public.be_hr_employee_delete_audited(text, text) to service_role';
  end if;
end
$$;

-- Read-only snapshot: authenticated production users may read it.
revoke execute on function public.be_admin_hr_snapshot() from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.be_admin_hr_snapshot() from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'grant execute on function public.be_admin_hr_snapshot() to authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.be_admin_hr_snapshot() to service_role';
  end if;
end
$$;

comment on table public.be_rpc_security_backup_v56 is
  'Versioned backups of production RPC definitions captured before security grant changes.';

commit;
