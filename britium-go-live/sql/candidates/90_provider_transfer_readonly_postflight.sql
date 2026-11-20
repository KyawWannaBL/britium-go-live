-- Britium Express post-install and backlog clearance reconciliation (READ ONLY).
-- Run after installation in complete UAT; rerun after approved production release.
-- These are counts, NOT permission to create scans, mark delivery or settle COD.

SELECT control_key,draft_enabled,custody_enabled,mixed_trip_enabled,
       approved_at,last_approval_evidence
FROM public.be_provider_transfer_release_control_v1;

SELECT h.provider_code,h.origin_branch_code,h.location_code,
       loc.location_name,h.active,h.verified_at,
       (loc.active AND loc.latitude BETWEEN 9 AND 29
        AND loc.longitude BETWEEN 92 AND 102) AS physical_pin_valid
FROM public.be_provider_handover_sites_v1 h
JOIN public.be_wayplan_service_locations loc
 ON loc.location_code=h.location_code
ORDER BY h.provider_code,h.origin_branch_code,loc.location_name;

WITH eligible AS (
 SELECT d.delivery_way_id,
   upper(coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET')) provider_code,
   upper(coalesce(split_part(r.warehouse_code,'-',1),'UNSET')) branch_code,
   d.delivery_region,
   upper(coalesce(r.warehouse_status,'')) warehouse_status,
   upper(coalesce(d.financial_validation_status,'')) finance_status,
   EXISTS (
     SELECT 1 FROM public.be_wayplan_membership_v40 m
     JOIN public.be_wayplan_dispatches w ON w.wayplan_id=m.wayplan_id
     WHERE m.delivery_way_id=d.delivery_way_id
       AND upper(coalesce(m.membership_status,'')) NOT IN ('CANCELLED','COMPLETED','RTO')
       AND upper(coalesce(w.wayplan_status,'')) NOT IN ('CANCELLED','COMPLETED')
   ) AS active_plan,
   EXISTS (
     SELECT 1 FROM public.be_provider_transfer_custody_v1 c
     WHERE c.delivery_way_id=d.delivery_way_id
   ) AS has_provider_custody,
   EXISTS (
     SELECT 1 FROM public.be_thirdparty_cs_current_v1 cs
     WHERE cs.delivery_way_id=d.delivery_way_id
       AND upper(cs.outcome) IN ('DELIVERED','RTO')
   ) AS has_cs_terminal
 FROM public.be_data_entry_parcel_details d
 JOIN public.be_warehouse_receipts_v36 r
   ON r.pickup_id=d.pickup_id AND r.parcel_sequence=d.parcel_sequence
 WHERE upper(coalesce(d.parcel_status,'')) NOT IN
   ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
)
SELECT provider_code,delivery_region,branch_code,
       count(*) FILTER(WHERE warehouse_status='WAREHOUSE_READY'
                         AND finance_status IN ('OK','VALID')
                         AND NOT active_plan) AS ready_without_plan,
       count(*) FILTER(WHERE active_plan AND NOT has_provider_custody) AS active_plan_no_custody,
       count(*) FILTER(WHERE has_provider_custody AND NOT has_cs_terminal) AS handed_over_not_final_delivery,
       count(*) FILTER(WHERE has_cs_terminal) AS cs_terminal_reconciliation
FROM eligible
WHERE provider_code NOT IN ('BRITIUM','UNSET')
GROUP BY provider_code,delivery_region,branch_code
ORDER BY ready_without_plan DESC,provider_code;

SELECT c.provider_code,c.wayplan_id,count(*) AS handed_over_way_count,
       min(c.physically_handed_over_at) first_handover,
       max(c.physically_handed_over_at) latest_handover
FROM public.be_provider_transfer_custody_v1 c
GROUP BY c.provider_code,c.wayplan_id
ORDER BY latest_handover DESC LIMIT 100;
