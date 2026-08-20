-- Verification after running pickup_form_rider_grouping_golive_hotfix.sql

-- 1) Pickup RPC should have exactly one signature.
select
  p.oid::regprocedure as rpc_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'be_create_pickup_request_from_master'
order by 1;

-- 2) Rider grouped pickup snapshot: P0620-APA-030 should appear once, not 30 times.
select public.be_rider_assigned_pickup_snapshot('testrider@britiumexpress.com') as rider_pickup_snapshot;

-- 3) Easier table view.
select
  pickup_id,
  delivery_way_count,
  parcel_count,
  delivered_count,
  pending_count,
  status,
  status_summary
from public.be_v_rider_assigned_pickups_grouped
where rider_email = 'testrider@britiumexpress.com'
   or driver_email = 'testrider@britiumexpress.com'
   or helper_email = 'testrider@britiumexpress.com'
order by assigned_at desc nulls last, pickup_id;
