-- Britium Express — operational reconciliation queue (READ ONLY).
-- Run on the authorized database as a qualified Finance/Operations auditor.
-- No physical outcome, cash collection, or settlement is inferred from a label.
-- The report shows CURRENT application records; ground evidence is imported separately.
WITH finance AS (
  SELECT DISTINCT ON (nullif(btrim(delivery_way_id),''))
    nullif(btrim(delivery_way_id),'') AS way_id,
    expected_cod, settled_amount, reported_collected, settlement_status,
    settlement_reference, settled_at
  FROM public.be_finance_cod_settlements_v48
  WHERE nullif(btrim(delivery_way_id),'') IS NOT NULL
  ORDER BY nullif(btrim(delivery_way_id),''),
           updated_at DESC NULLS LAST, created_at DESC NULLS LAST
), returns AS (
  SELECT nullif(btrim(delivery_way_id),'') AS way_id,
     count(*) AS return_scan_events, max(scanned_at) AS last_return_scan
  FROM public.be_warehouse_return_scans_v39
  WHERE nullif(btrim(delivery_way_id),'') IS NOT NULL
  GROUP BY 1
), warehouse AS (
  SELECT DISTINCT ON (nullif(btrim(delivery_way_id),''))
    nullif(btrim(delivery_way_id),'') AS way_id,
    merchant_name, delivery_township, item_status,
    warehouse_entered_at, dispatch_scanned_at, dispatch_scanned
  FROM public.be_v_warehouse_lifecycle_v39
  WHERE nullif(btrim(delivery_way_id),'') IS NOT NULL
  ORDER BY nullif(btrim(delivery_way_id),''),
           updated_at DESC NULLS LAST, created_at DESC NULLS LAST
)
SELECT w.way_id AS original_delivery_way_id,
 w.merchant_name,w.delivery_township,w.item_status AS app_warehouse_status,
 f.settlement_status AS app_finance_status,
 f.expected_cod AS recorded_expected_cod_mmk,
 f.reported_collected AS recorded_claimed_collection_mmk,
 f.settled_amount AS recorded_settled_amount_mmk,
 f.settlement_reference,f.settled_at,
 coalesce(r.return_scan_events,0) AS return_scan_events,
 r.last_return_scan,
 w.warehouse_entered_at,w.dispatch_scanned_at,
 CASE
   WHEN f.settlement_status='SETTLED' AND w.item_status='READY_FOR_DELIVERY'
     THEN 'P0_FINANCE_SETTLED_WAREHOUSE_READY_CONFLICT'
   WHEN f.settlement_status='PENDING_REMITTANCE'
     THEN 'P0_PENDING_COD_REMITTANCE'
   WHEN w.item_status='RETURN_TO_SENDER'
     THEN 'P1_RTO_RECEIPT_AND_FEE_REVIEW'
   WHEN w.item_status='DELIVERY_FAILED'
     THEN 'P1_FAILED_DELIVERY_RECONCILIATION'
   WHEN w.item_status='SUBMITTED'
     THEN 'P1_STALLED_SUBMISSION'
   WHEN w.item_status='READY_FOR_DELIVERY' AND f.way_id IS NULL
     THEN 'P1_READY_BUT_NOT_IN_FINANCE_V48'
   ELSE 'OTHER_REVIEW'
 END AS reconciliation_workstream,
 CASE
   WHEN f.settlement_status IN ('SETTLED','PENDING_REMITTANCE')
     THEN 'Finance Controller + Operations'
   WHEN w.item_status='RETURN_TO_SENDER'
     THEN 'Warehouse + Merchant Relations'
   WHEN w.item_status='DELIVERY_FAILED'
     THEN 'CS + Dispatch'
   ELSE 'Operations + Provider Coordinator'
 END AS proposed_accountable_team,
 CASE WHEN f.way_id IS NULL THEN 'NOT_RECORDED'
      ELSE 'FINANCE_V48_RECORD_PRESENT' END AS finance_record_coverage,
 (coalesce(r.return_scan_events,0)>0
    AND w.item_status='READY_FOR_DELIVERY') AS return_status_conflict,
 'EVIDENCE_REQUIRED_BEFORE_ANY_STATE_OR_MONEY_POSTING'::text AS action_gate
FROM warehouse w
LEFT JOIN finance f ON f.way_id=w.way_id
LEFT JOIN returns r ON r.way_id=w.way_id
ORDER BY
 CASE
   WHEN f.settlement_status='SETTLED' AND w.item_status='READY_FOR_DELIVERY' THEN 1
   WHEN f.settlement_status='PENDING_REMITTANCE' THEN 2
   WHEN w.item_status='RETURN_TO_SENDER' THEN 3
   WHEN w.item_status='DELIVERY_FAILED' THEN 4
   WHEN w.item_status='SUBMITTED' THEN 5
   ELSE 6 END,
 w.way_id;

-- To summarize without exporting sensitive recipient details, wrap the SELECT:
-- SELECT reconciliation_workstream, count(*) FROM (<above SELECT>) q GROUP BY 1;
-- Never convert null recorded_expected_cod_mmk to zero in a financial closing report.
