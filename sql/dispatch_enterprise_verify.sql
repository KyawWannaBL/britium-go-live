-- Verify unified dispatch backend
select public.be_enterprise_dispatch_snapshot();

select
  (select count(*) from public.be_v_enterprise_dispatch_wayplans) as dispatch_wayplans,
  (select count(*) from public.be_v_enterprise_dispatch_jobs) as dispatch_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_visible_jobs;

-- For current UAT wayplan:
select
  wayplan_code,
  waybill_no,
  pickup_id,
  parcel_count,
  dispatch_status,
  delivery_status,
  driver_email
from public.be_v_enterprise_dispatch_wayplans
where wayplan_code = 'WP0620-APA-030'
   or waybill_no = 'WB0620-APA-030'
   or pickup_id = 'P0620-APA-030';

select
  wayplan_code,
  tracking_no,
  recipient_name,
  phone_number,
  delivery_township,
  dispatch_status,
  delivery_status
from public.be_v_enterprise_dispatch_jobs
where wayplan_code = 'WP0620-APA-030'
order by parcel_sequence;
