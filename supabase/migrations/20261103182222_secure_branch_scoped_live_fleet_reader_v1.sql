create or replace function public.be_ops_live_fleet_positions_v1()
returns jsonb
language plpgsql
stable security definer
set search_path = 'public', 'auth', 'pg_temp'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_is_hq boolean := false;
  v_positions jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.be_user_account_registry a
    where a.auth_user_id=v_uid
      and coalesce(a.active,true)
      and coalesce(a.is_active,true)
      and lower(coalesce(a.status,'active')) in ('active','enabled')
  ) then
    raise exception 'ACTIVE_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  v_role := replace(lower(coalesce(public.be_current_role(),'')),'-','_');
  v_is_hq := v_role in ('superadmin','super_admin','app_owner','sys');
  if not v_is_hq and v_role not in
    ('branch_manager','branch_office_manager','operation_manager','operations_manager','ops_manager','supervisor','dispatcher') then
    raise exception 'LIVE_FLEET_ACCESS_DENIED' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'worker_code', p.worker_code,
    'role_code', p.role_code,
    'wayplan_id', p.wayplan_id,
    'branch_code', d.branch_code,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'accuracy_m', p.accuracy_m,
    'last_seen_at', p.last_seen_at,
    'expires_at', p.expires_at
  ) order by p.last_seen_at desc),'[]'::jsonb)
  into v_positions
  from public.be_field_live_position_v1 p
  join public.be_wayplan_dispatches d on d.wayplan_id = p.wayplan_id
  where p.last_seen_at > now() - interval '2 minutes'
    and p.expires_at > now()
    and p.last_seen_at <= now()
    and p.latitude between -90 and 90
    and p.longitude between -180 and 180
    and not (p.latitude=0 and p.longitude=0)
    and (
      v_is_hq
      or exists (
        select 1
        from public.be_employee_territory_assignments t
        where t.user_id=v_uid and t.active and t.can_read
          and t.scope_type='BRANCH'
          and upper(t.branch_code)=upper(d.branch_code)
      )
    );
  return jsonb_build_object('ok',true,'positions',v_positions);
end
$fn$;
revoke all on function public.be_ops_live_fleet_positions_v1() from public, anon;
grant execute on function public.be_ops_live_fleet_positions_v1() to authenticated;