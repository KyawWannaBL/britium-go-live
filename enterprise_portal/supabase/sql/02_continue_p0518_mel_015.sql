
-- Continue the verified clean pickup through Data Entry, Supervisor, Rider, and Wayplan.
-- Exact clean pickup from your successful CS test:
--   P0518-MEL-015

-- 1) Data Entry: create delivery waybill rows D0518-MEL-013..015
select public.be_data_entry_prepare_pickup_template('P0518-MEL-015');

-- 2) Verify delivery rows exist
select
  pickup_id,
  deliver_way_id,
  tracking_no,
  line_no,
  event_type,
  status,
  field_pickup_checked,
  data_entry_registration_checked
from public.be_portal_cargo_events
where pickup_id = 'P0518-MEL-015'
order by line_no;

-- 3) Data Entry submit to operations
select public.be_data_entry_submit_pickup_parcels('P0518-MEL-015');

-- 4) Supervisor assignment to field team
select public.be_assign_pickup_field_team(
  'P0518-MEL-015',
  'rider_ygn_0001',
  'driver_ygn_0001',
  'helper_ygn_0001',
  'YGN-1234',
  'final go-live stability verification'
);

-- 5) Generate wayplan from the Data Entry delivery rows
select public.be_generate_wayplan_for_pickup('P0518-MEL-015');

-- 6) View wayplan routes/stops
select jsonb_pretty(public.be_wayplan_list('P0518-MEL-015', 100));

-- 7) Verify Rider App sees assignment/jobs/notifications
select jsonb_pretty(public.be_mobile_go_live_snapshot('rider_ygn_0001', 'rider', 20));
select jsonb_pretty(public.be_mobile_go_live_snapshot('driver_ygn_0001', 'driver', 20));
select jsonb_pretty(public.be_mobile_go_live_snapshot('helper_ygn_0001', 'helper', 20));
