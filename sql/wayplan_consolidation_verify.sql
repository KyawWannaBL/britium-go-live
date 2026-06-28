-- Wayplan Command Center verification

-- 1) Data Entry -> Warehouse -> Wayplan ready queue
select
  count(*) as ready_rows,
  count(distinct pickup_id) as ready_pickups,
  count(distinct waybill_no) as ready_waybills
from public.be_v_wayplan_queue
where warehouse_status = 'RECEIVED'
  and wayplan_status = 'READY_FOR_WAYPLAN';

-- 2) Created/assigned operational wayplans
select
  wayplan_code,
  wayplan_no,
  waybill_no,
  pickup_id,
  parcel_count,
  total_parcels,
  status,
  wayplan_status,
  dispatch_status,
  route_name,
  driver_email,
  updated_at
from public.be_wayplans
where coalesce(pickup_id, '') <> ''
   or coalesce(waybill_no, '') <> ''
   or coalesce(parcel_count, 0) > 0
order by updated_at desc nulls last;

-- 3) Child row health
select
  w.wayplan_code,
  w.waybill_no,
  w.pickup_id,
  w.parcel_count,
  count(i.*) as wayplan_item_rows
from public.be_wayplans w
left join public.be_wayplan_items i
  on i.wayplan_code = w.wayplan_code
where coalesce(w.pickup_id, '') <> ''
   or coalesce(w.waybill_no, '') <> ''
   or coalesce(w.parcel_count, 0) > 0
group by w.wayplan_code, w.waybill_no, w.pickup_id, w.parcel_count
order by max(w.updated_at) desc nulls last;
