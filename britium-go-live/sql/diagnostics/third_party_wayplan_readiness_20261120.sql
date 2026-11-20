-- Britium Express / third-party Wayplan diagnostic (READ ONLY).
-- Does not create Wayplans, scans, custody events, or financial entries.
-- Compare staging completeness by authoritative provider and delivery region.
WITH pending AS (
  SELECT
    d.delivery_way_id,
    coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET') AS provider_code,
    coalesce(d.delivery_region,'UNSET') AS delivery_region,
    coalesce(d.delivery_route_mode,'UNSET') AS route_mode,
    upper(coalesce(r.warehouse_status,'')) AS warehouse_status,
    upper(coalesce(d.financial_validation_status,'')) AS finance_status,
    coalesce(d.location_required,false) AS location_required,
    EXISTS (
      SELECT 1 FROM public.be_wayplan_membership_v40 m
      WHERE m.delivery_way_id=d.delivery_way_id
        AND m.membership_status IN ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
    ) AS active_membership,
    EXISTS (
      SELECT 1 FROM public.be_warehouse_return_scans_v39 rs
      WHERE rs.delivery_way_id=d.delivery_way_id
    ) AS has_return_scan,
    EXISTS (
      SELECT 1 FROM public.be_delivery_reschedules_v71 dr
      WHERE dr.delivery_way_id=d.delivery_way_id
        AND dr.status='ACTIVE'
        AND dr.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
    ) AS future_reschedule
  FROM public.be_data_entry_parcel_details d
  JOIN public.be_warehouse_receipts_v36 r
    ON r.pickup_id=d.pickup_id
   AND r.parcel_sequence=d.parcel_sequence
  WHERE upper(coalesce(d.parcel_status,'')) NOT IN
    ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
)
SELECT provider_code, delivery_region,route_mode,warehouse_status,
       count(*) AS current_parcels,
       count(*) FILTER (WHERE finance_status IN ('VALID','OK')) AS finance_valid,
       count(*) FILTER (WHERE active_membership) AS already_in_wayplan,
       count(*) FILTER (WHERE has_return_scan) AS physical_returns,
       count(*) FILTER (WHERE future_reschedule) AS future_date_holds,
       count(*) FILTER (WHERE warehouse_status='WAREHOUSE_READY' AND NOT active_membership AND finance_status IN ('VALID','OK')) AS ready_not_planned,
       count(*) FILTER (WHERE delivery_region='OUTSIDE_CORE' AND warehouse_status='WAREHOUSE_READY' AND NOT active_membership) AS blocked_by_three_region_queue
FROM pending
WHERE warehouse_status IN ('RECEIVED','WAREHOUSE_READY','RETURN_SCANNED','AWAITING_RETURN_SCAN')
GROUP BY 1,2,3,4
ORDER BY ready_not_planned DESC, provider_code, delivery_region;
