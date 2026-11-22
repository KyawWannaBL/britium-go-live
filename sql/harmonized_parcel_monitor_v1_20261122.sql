-- Britium Express / harmonized parcel monitoring (non-mutating, read-only projection)
-- Install only after UAT migration replay. No warehouse status, custody or cash mutation.
-- Reconcile by ORIGINAL delivery_way_id, not merchant code or pickup ID.
BEGIN;

CREATE OR REPLACE VIEW public.be_v_harmonized_parcel_monitor_v1
WITH (security_invoker = true)
AS
WITH ledger AS (
 SELECT DISTINCT ON (nullif(trim(delivery_way_id),''))
   nullif(trim(delivery_way_id),'') AS delivery_way_id,
   merchant_name, township AS ledger_township, delivery_address, item_price,
   delivery_fee, wayplan_id AS ledger_wayplan_id,
   rider_proof_url, delivered_at, cod_settled_at, finance_status,
   status AS ledger_status
 FROM public.be_waybill_ledger
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 ORDER BY nullif(trim(delivery_way_id),''), updated_at DESC NULLS LAST, created_at DESC NULLS LAST
),
warehouse AS (
 SELECT DISTINCT ON (nullif(trim(delivery_way_id),''))
  nullif(trim(delivery_way_id),'') AS delivery_way_id,
  merchant_name, delivery_township, recipient_address, cod_amount,
  item_status, receipt_method, receiving_scan_skipped,
  warehouse_entered_at, dispatch_scanned, dispatch_scanned_at,
  dwell_hours, dwell_alert, updated_at, created_at
 FROM public.be_v_warehouse_lifecycle_v39
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 ORDER BY nullif(trim(delivery_way_id),''), updated_at DESC NULLS LAST, created_at DESC NULLS LAST
),
custody AS (
 SELECT DISTINCT ON (nullif(trim(delivery_way_id),''))
   nullif(trim(delivery_way_id),'') AS delivery_way_id,
   provider_code, attempt_number, wayplan_id, handover_location_code,
   handover_manifest_ref, provider_receiver_name, provider_receipt_ref,
   proof_reference, dispatch_scanned_at AS provider_dispatch_at,
   physically_handed_over_at, created_at AS custody_created_at
 FROM public.be_provider_transfer_custody_v1
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 ORDER BY nullif(trim(delivery_way_id),''), created_at DESC NULLS LAST, id DESC
),
provider_override AS (
 SELECT DISTINCT ON (nullif(trim(delivery_way_id),''))
   nullif(trim(delivery_way_id),'') AS delivery_way_id,
   automatic_provider_code, override_provider_code, override_reason,
   changed_at
 FROM public.be_parcel_provider_overrides_v1
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 ORDER BY nullif(trim(delivery_way_id),''), changed_at DESC NULLS LAST
),
finance AS (
 SELECT DISTINCT ON (nullif(trim(delivery_way_id),''))
   nullif(trim(delivery_way_id),'') AS delivery_way_id,
   expected_cod, reported_collected, settled_amount,
   settlement_status, settlement_reference, settled_at, proof_reference,
   created_at AS finance_created_at
 FROM public.be_finance_cod_settlements_v48
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 ORDER BY nullif(trim(delivery_way_id),''), updated_at DESC NULLS LAST, created_at DESC NULLS LAST
),
ways AS (
 SELECT delivery_way_id FROM warehouse
 UNION SELECT delivery_way_id FROM ledger
 UNION SELECT delivery_way_id FROM custody
 UNION SELECT delivery_way_id FROM finance
)
SELECT
  w.delivery_way_id,
  coalesce(h.merchant_name, l.merchant_name) AS merchant_name,
  coalesce(h.delivery_township, l.ledger_township) AS destination_township,
  coalesce(h.recipient_address, l.delivery_address) AS destination_address,
  coalesce(h.cod_amount, f.expected_cod, 0) AS expected_cod_mmk,
  l.item_price AS item_price_mmk, l.delivery_fee AS delivery_fee_mmk,
  coalesce(o.override_provider_code, c.provider_code, o.automatic_provider_code)
    AS recorded_provider_code,
  o.automatic_provider_code AS automatic_provider_code,
  o.override_provider_code AS override_provider_code,
  c.provider_code AS physically_recorded_provider,
  CASE WHEN c.physically_handed_over_at IS NOT NULL
         AND nullif(trim(c.provider_receiver_name),'') IS NOT NULL
         AND (nullif(trim(c.provider_receipt_ref),'') IS NOT NULL OR nullif(trim(c.proof_reference),'') IS NOT NULL)
       THEN 'HANDOVER_EVIDENCED'
       WHEN c.delivery_way_id IS NOT NULL THEN 'HANDOVER_INCOMPLETE'
       ELSE 'NO_PROVIDER_CUSTODY_RECORD' END AS provider_custody_evidence,
  coalesce(c.wayplan_id,l.ledger_wayplan_id) AS wayplan_id,
  c.handover_manifest_ref, c.handover_location_code,
  c.provider_receiver_name, c.provider_receipt_ref,
  c.physically_handed_over_at, c.attempt_number,
  h.item_status AS warehouse_status, h.receipt_method,
  h.receiving_scan_skipped, h.warehouse_entered_at,
  h.dispatch_scanned, h.dispatch_scanned_at, h.dwell_hours,
  h.dwell_alert, l.ledger_status, l.delivered_at,
  (nullif(trim(coalesce(l.rider_proof_url,'')),'') IS NOT NULL) AS rider_proof_present,
  f.reported_collected AS reported_cod_collected_mmk,
  f.settled_amount AS settled_cod_mmk,
  f.settlement_status AS finance_settlement_status,
  f.settlement_reference, f.settled_at,
  CASE
    WHEN h.delivery_way_id IS NULL THEN 'WAREHOUSE_RECORD_UNMATCHED'
    WHEN coalesce(h.dwell_alert,false) AND h.item_status NOT ILIKE '%DELIVER%'
      THEN 'WAREHOUSE_DWELL_REVIEW'
    WHEN coalesce(h.dispatch_scanned,false)
       AND c.physically_handed_over_at IS NULL
       AND coalesce(o.override_provider_code,c.provider_code,o.automatic_provider_code) IS NOT NULL
      THEN 'DISPATCH_PROVIDER_HANDOVER_GAP'
    WHEN l.delivered_at IS NOT NULL
       AND nullif(trim(coalesce(l.rider_proof_url,'')),'') IS NULL
      THEN 'DELIVERY_PROOF_REVIEW'
    WHEN l.delivered_at IS NOT NULL
       AND coalesce(h.cod_amount,f.expected_cod,0) > 0
       AND f.settled_at IS NULL AND l.cod_settled_at IS NULL
      THEN 'DELIVERED_COD_RECONCILIATION'
    WHEN coalesce(o.override_provider_code,c.provider_code,o.automatic_provider_code) IS NULL
      THEN 'PROVIDER_ASSIGNMENT_REVIEW'
    ELSE 'MONITOR' END AS attention_category,
  greatest(h.updated_at, l.delivered_at, c.custody_created_at,
           f.finance_created_at, o.changed_at) AS last_evidence_at
FROM ways w
LEFT JOIN warehouse h USING (delivery_way_id)
LEFT JOIN ledger l USING (delivery_way_id)
LEFT JOIN custody c USING (delivery_way_id)
LEFT JOIN provider_override o USING (delivery_way_id)
LEFT JOIN finance f USING (delivery_way_id);

COMMENT ON VIEW public.be_v_harmonized_parcel_monitor_v1 IS
'Read-only way-level reconciliation of warehouse, provider custody, override and finance evidence. NO_PROVIDER_CUSTODY_RECORD is not a parcel-loss finding. Routing/provider labels do not confirm physical custody.';

REVOKE ALL ON public.be_v_harmonized_parcel_monitor_v1 FROM PUBLIC, anon;
-- Authenticated access deliberately not granted until base-table RLS/role/territory audit.
COMMIT;

-- Read-only UAT smoke tests (run under an appropriately permitted database role):
-- SELECT count(*) AS ways, count(DISTINCT delivery_way_id) AS unique_ways
-- FROM public.be_v_harmonized_parcel_monitor_v1;
-- SELECT attention_category, count(*) FROM public.be_v_harmonized_parcel_monitor_v1 GROUP BY 1 ORDER BY 2 DESC;
-- SELECT * FROM public.be_v_harmonized_parcel_monitor_v1 WHERE delivery_way_id = '<known_way_id>';
