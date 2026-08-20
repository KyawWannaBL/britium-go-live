-- Warehouse Scan Lifecycle verification

select public.be_warehouse_scan_lifecycle_snapshot();

select
  (select count(*) from public.be_v_warehouse_scan_lifecycle) as warehouse_rows,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where warehouse_scan_status = 'RECEIVED') as received,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where dispatch_scan_at is not null) as dispatch_scanned,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where return_attempt_count > 0) as return_scanned,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where next_attempt_priority) as priority_next_wayplan,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where rto_at is not null or warehouse_scan_status = 'RTO') as rto,
  (select count(*) from public.be_v_exception_board where resolved_at is null) as open_exceptions;

-- Staff/global exception board
select public.be_exception_screen_snapshot(null, null);

-- Merchant-only exception board example:
-- replace APAC and email with the actual merchant login
select public.be_merchant_exception_screen_snapshot('APAC', 'testmerchant@britiumexpress.com');
