-- V51 verification and assignment diagnosis.
select jsonb_build_object(
  'email_to_code', public.be_field_team_code_from_login_v51('driver_ygn_0001@britiumventures.com'),
  'snapshot_rpc', to_regprocedure('public.be_field_team_wayplan_snapshot_v51(jsonb)')::text,
  'operator_rpc', to_regprocedure('public.be_rider_route_operator_v46(text,text)')::text
) as v51_objects;

select distinct
  wayplan_id,
  membership_status,
  driver_code,
  driver_name,
  rider_code,
  rider_name,
  helper_code,
  helper_name,
  vehicle_code,
  vehicle_name
from public.be_wayplan_membership_v40
where wayplan_id = 'WP-20260730-053113'
order by membership_status, driver_code, rider_code;

select public.be_field_team_wayplan_snapshot_v51(
  jsonb_build_object(
    'worker_code', 'driver_ygn_0001@britiumventures.com',
    'login', 'driver_ygn_0001@britiumventures.com',
    'email', 'driver_ygn_0001@britiumventures.com',
    'role', 'driver'
  )
) as driver_snapshot;
