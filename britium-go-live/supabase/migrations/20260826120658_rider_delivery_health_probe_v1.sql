-- BRITIUM_RIDER_DELIVERY_HEALTH_PROBE_V1_20260826
-- Monitoring-only correction. Does not read, impersonate, or mutate rider jobs.

begin;
do $migration$
declare
  v_function text;
  v_old text := $old$
  begin
    v_item := public.be_rider_delivery_wayplan_jobs('RID001', 50);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'module', 'Rider Delivery Jobs',
      'ok', coalesce((v_item->>'ok')::boolean, false),
      'source', 'be_rider_delivery_wayplan_jobs',
      'count', coalesce((v_item->>'count')::integer, 0)
    ));
  exception when others then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'module', 'Rider Delivery Jobs',
      'ok', false,
      'source', 'be_rider_delivery_wayplan_jobs',
      'error', sqlerrm
    ));
  end;
$old$;
  v_new text := $new$
  begin
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'module', 'Rider Delivery Jobs',
      'ok',
        to_regprocedure('public.be_rider_delivery_wayplan_jobs(text,integer)') is not null
        and to_regclass('public.be_v_rider_delivery_wayplan_jobs') is not null
        and has_function_privilege(
          'authenticated',
          to_regprocedure('public.be_rider_delivery_wayplan_jobs(text,integer)'),
          'execute'
        ),
      'source', 'be_rider_delivery_wayplan_jobs',
      'count', 0,
      'summary', jsonb_build_object(
        'probe', 'OBJECT_AND_PERMISSION_CHECK',
        'function_exists',
          to_regprocedure('public.be_rider_delivery_wayplan_jobs(text,integer)') is not null,
        'view_exists',
          to_regclass('public.be_v_rider_delivery_wayplan_jobs') is not null,
        'authenticated_execute',
          has_function_privilege(
            'authenticated',
            to_regprocedure('public.be_rider_delivery_wayplan_jobs(text,integer)'),
            'execute'
          ),
        'assignment_data_read', false
      )
    ));
  exception when others then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'module', 'Rider Delivery Jobs',
      'ok', false,
      'source', 'be_rider_delivery_wayplan_jobs',
      'error', sqlerrm
    ));
  end;
$new$;
begin
  select pg_get_functiondef(
    to_regprocedure('public.be_portal_wiring_health()')
  ) into v_function;

  if v_function is null then
    raise exception 'Required function public.be_portal_wiring_health() was not found';
  end if;

  -- Normalize the exported CRLF body before matching the reviewed block.
  v_function := replace(v_function, chr(13) || chr(10), chr(10));

  if position(v_old in v_function) = 0 then
    raise exception 'Safety anchor not found; be_portal_wiring_health was not changed';
  end if;

  v_function := replace(v_function, v_old, v_new);
  execute v_function;
end;
$migration$;
comment on function public.be_portal_wiring_health() is
  'Portal health monitor. Rider Delivery Jobs uses a non-impersonating object and permission probe.';
commit;
