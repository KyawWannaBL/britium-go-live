
-- Run after enterprise_portal_full_sync.sql

select public.be_enterprise_portal_healthcheck();

select public.be_portal_sync_smoke_test();

select
  (select count(*) from public.be_v_portal_live_jobs) as live_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_jobs,
  (select count(*) from public.be_v_exception_board) as exceptions,
  (select count(*) from public.be_portal_pickup_requests) as pickup_requests;

-- Known UAT waybill / pickup quick check
select
  tracking_no,
  waybill_no,
  pickup_id,
  recipient_name,
  township,
  warehouse_status,
  wayplan_status,
  dispatch_status,
  delivery_status,
  cod_amount,
  delivery_charges
from public.be_v_portal_live_jobs
where pickup_id = 'P0620-APA-030'
   or waybill_no = 'WB0620-APA-030'
order by tracking_no;
