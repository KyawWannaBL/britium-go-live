-- Read-only production preflight for Wayplan Route Optimization + Rider Tracking V62.
-- This script performs no INSERT, UPDATE, DELETE, ALTER, CREATE, GRANT or policy change.
with required_functions(function_name) as (
  values
    ('be_wayplan_route_snapshot_v45'),
    ('be_wayplan_save_mapbox_route_v45'),
    ('be_rider_route_snapshot_v46'),
    ('be_rider_accept_route_v46'),
    ('be_rider_start_route_v46'),
    ('be_rider_arrive_stop_v46'),
    ('be_rider_update_live_location')
), function_state as (
  select
    r.function_name,
    count(p.oid)::integer as overload_count,
    coalesce(bool_or(p.prosecdef), false) as any_security_definer,
    coalesce(jsonb_agg(distinct pg_get_function_identity_arguments(p.oid)) filter (where p.oid is not null), '[]'::jsonb) as signatures
  from required_functions r
  left join pg_proc p on p.proname = r.function_name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  group by r.function_name
), live_table as (
  select
    to_regclass('public.be_rider_live_locations') is not null as exists,
    coalesce(c.relrowsecurity, false) as rls_enabled
  from (select 1) seed
  left join pg_class c on c.oid = to_regclass('public.be_rider_live_locations')
), publication_state as (
  select exists (
    select 1
    from pg_publication_tables
    where schemaname = 'public'
      and tablename = 'be_rider_live_locations'
  ) as realtime_published
), result as (
  select jsonb_build_object(
    'ok',
      not exists (select 1 from function_state where overload_count = 0)
      and (select exists from live_table),
    'build', 'WAYPLAN_ROUTE_TRACKING_BACKEND_PREFLIGHT_V62_2026_08_02',
    'read_only', true,
    'functions', (
      select jsonb_agg(jsonb_build_object(
        'function_name', function_name,
        'overload_count', overload_count,
        'security_definer', any_security_definer,
        'signatures', signatures
      ) order by function_name)
      from function_state
    ),
    'live_location_table', (select jsonb_build_object('exists', exists, 'rls_enabled', rls_enabled) from live_table),
    'realtime', (select jsonb_build_object('be_rider_live_locations_published', realtime_published) from publication_state),
    'gps_write_contract', jsonb_build_object(
      'required_rpc', 'be_rider_update_live_location',
      'direct_client_table_write_required', false
    ),
    'next_gate', case
      when not exists (select 1 from function_state where overload_count = 0)
       and (select exists from live_table)
      then 'INSTALL_BUILD_AND_DEPLOY_V62_FRONTEND'
      else 'STOP_AND_RETURN_THIS_PREFLIGHT_JSON'
    end
  ) as payload
)
select jsonb_pretty(payload) from result;
