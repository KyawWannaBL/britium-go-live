create or replace function public.be_my_unified_workforce_profile_v1()
returns jsonb language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  person_id uuid := auth.uid();
  result jsonb;
begin
  if person_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'ok', true, 'auth_user_id', r.auth_user_id,
    'full_name', coalesce(nullif(trim(r.full_name), ''), nullif(trim(r.display_name), '')),
    'email', coalesce(nullif(trim(r.email), ''), nullif(trim(r.user_email), '')),
    'phone', r.phone_number, 'branch_code', r.branch_code,
    'enterprise_role', coalesce(r.role_code, r.role),
    'employee_code', coalesce(r.worker_code, r.user_code),
    'department', r.department
  ) into result
  from public.be_user_account_registry r
  where r.auth_user_id = person_id and coalesce(r.active, true) and coalesce(r.is_active, true)
  limit 1;
  if result is null then
    raise exception 'Active Enterprise workforce profile not found' using errcode = '42501';
  end if;
  return result;
end;
$fn$;
revoke all on function public.be_my_unified_workforce_profile_v1() from public, anon;
grant execute on function public.be_my_unified_workforce_profile_v1() to authenticated;