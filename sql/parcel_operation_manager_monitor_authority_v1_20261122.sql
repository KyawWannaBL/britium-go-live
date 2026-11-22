-- Role-scoped extension of parcel monitoring + evidence/task tools.
-- Does not grant finance settlement posting, custody event creation or proof fabrication.
BEGIN;
-- Britium Express / harmonized parcel monitoring (non-mutating, read-only projection)
-- Install only after UAT migration replay. No warehouse status, custody or cash mutation.
-- Reconcile by ORIGINAL delivery_way_id, not merchant code or pickup ID.

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
returns AS (
 SELECT nullif(trim(delivery_way_id),'') AS delivery_way_id,
   count(*) AS return_scan_count, max(scanned_at) AS last_return_scanned_at
 FROM public.be_warehouse_return_scans_v39
 WHERE nullif(trim(delivery_way_id),'') IS NOT NULL
 GROUP BY 1
),
ways AS (
 SELECT delivery_way_id FROM warehouse
 UNION SELECT delivery_way_id FROM ledger
 UNION SELECT delivery_way_id FROM custody
 UNION SELECT delivery_way_id FROM finance
 UNION SELECT delivery_way_id FROM returns
)
SELECT
  w.delivery_way_id,
  h.created_at AS warehouse_record_created_at,
  h.dispatch_scanned_at AS verified_dispatch_scanned_at,
  coalesce(h.merchant_name, l.merchant_name) AS merchant_name,
  coalesce(h.delivery_township, l.ledger_township) AS destination_township,
  coalesce(h.recipient_address, l.delivery_address) AS destination_address,
  coalesce(f.expected_cod, h.cod_amount) AS expected_cod_mmk,
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
  coalesce(r.return_scan_count,0) AS return_scan_count,
  r.last_return_scanned_at,
  array_remove(ARRAY[
    CASE WHEN upper(coalesce(f.settlement_status,''))='SETTLED'
      AND h.item_status IN ('READY_FOR_DELIVERY','SUBMITTED','DELIVERY_FAILED','RETURN_TO_SENDER')
      AND l.delivered_at IS NULL THEN 'SETTLEMENT_OUTCOME_CONFLICT'::text END,
    CASE WHEN coalesce(r.return_scan_count,0)>0 AND h.item_status='READY_FOR_DELIVERY'
      THEN 'RETURN_SCAN_READY_STATUS_CONFLICT'::text END,
    CASE WHEN upper(coalesce(f.settlement_status,''))='PENDING_REMITTANCE'
      THEN 'COD_REMITTANCE_REVIEW'::text END,
    CASE WHEN h.item_status IN ('DELIVERY_FAILED','RETURN_TO_SENDER')
      THEN 'FAILED_OR_RTO_PHYSICAL_DISPOSITION_REVIEW'::text END,
    CASE WHEN c.physically_handed_over_at IS NULL AND
       coalesce(o.override_provider_code,c.provider_code,o.automatic_provider_code) IS NOT NULL
       THEN 'PROVIDER_HANDOVER_EVIDENCE_GAP'::text END,
    CASE WHEN f.delivery_way_id IS NULL
      THEN 'FINANCE_COD_COVERAGE_REVIEW_NOT_PROOF_OF_DEBT'::text END
  ], NULL::text) AS exception_flags,
  CASE
    WHEN h.delivery_way_id IS NULL THEN 'WAREHOUSE_RECORD_UNMATCHED'
    -- A settled finance row does not prove physical delivery; reconcile against POD and origin event.
    WHEN upper(coalesce(f.settlement_status,'')) = 'SETTLED'
      AND h.item_status IN ('READY_FOR_DELIVERY','SUBMITTED','DELIVERY_FAILED','RETURN_TO_SENDER')
      AND l.delivered_at IS NULL THEN 'FINANCE_SETTLED_PHYSICAL_OUTCOME_UNVERIFIED'
    WHEN upper(coalesce(f.settlement_status,'')) = 'PENDING_REMITTANCE'
      THEN 'COD_REMITTANCE_REVIEW'
    WHEN h.item_status = 'RETURN_TO_SENDER'
      THEN 'RTO_HANDOVER_AND_FINANCE_REVIEW'
    WHEN h.item_status = 'DELIVERY_FAILED'
      AND coalesce(r.return_scan_count,0) = 0
      THEN 'FAILED_DELIVERY_OUTCOME_REVIEW'
    WHEN coalesce(r.return_scan_count,0) > 0 AND h.item_status = 'READY_FOR_DELIVERY'
      THEN 'RETURN_SCAN_WAREHOUSE_STATUS_CONFLICT'
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
           f.finance_created_at, o.changed_at, r.last_return_scanned_at) AS last_evidence_at
FROM ways w
LEFT JOIN warehouse h USING (delivery_way_id)
LEFT JOIN ledger l USING (delivery_way_id)
LEFT JOIN custody c USING (delivery_way_id)
LEFT JOIN provider_override o USING (delivery_way_id)
LEFT JOIN finance f USING (delivery_way_id)
LEFT JOIN returns r USING (delivery_way_id)
WHERE (SELECT auth.uid()) IS NOT NULL
  AND lower(replace(public.be_current_role(),'-','_'))
    IN ('superadmin','super_admin','operation_manager','operations_manager');

COMMENT ON VIEW public.be_v_harmonized_parcel_monitor_v1 IS
'Read-only way-level reconciliation of warehouse, provider custody, override and finance evidence. NO_PROVIDER_CUSTODY_RECORD is not a parcel-loss finding. Routing/provider labels do not confirm physical custody.';

REVOKE ALL ON public.be_v_harmonized_parcel_monitor_v1 FROM PUBLIC, anon;
-- Authenticated access deliberately not granted until base-table RLS/role/territory audit.


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['be_waybill_ledger','be_finance_cod_settlements_v48','be_provider_transfer_custody_v1','be_parcel_provider_overrides_v1','be_warehouse_return_scans_v39']
  LOOP
    EXECUTE format($policy$ALTER POLICY be_harmonized_superadmin_read_v1 ON public.%I USING ((SELECT auth.uid()) IS NOT NULL AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager'))$policy$,t);
  END LOOP;
END $$;
ALTER POLICY be_ground_claim_elevated_read_v1 ON public.be_parcel_ground_outcome_claims_v1
  USING ((SELECT auth.uid()) IS NOT NULL AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager'));
ALTER POLICY be_ground_claim_elevated_submit_v1 ON public.be_parcel_ground_outcome_claims_v1
  WITH CHECK ((SELECT auth.uid())=reported_by_user_id AND review_state='UNREVIEWED'
    AND reviewer_user_id IS NULL AND reviewed_at IS NULL
    AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager')
    AND EXISTS (SELECT 1 FROM public.be_data_entry_parcel_details d
      WHERE d.delivery_way_id=original_delivery_way_id AND coalesce(d.parcel_status,'')<>'duplicate_archived'));
ALTER POLICY be_ground_claim_elevated_review_v1 ON public.be_parcel_ground_outcome_claims_v1
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) <> reported_by_user_id
    AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager'))
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND reviewer_user_id=(SELECT auth.uid())
    AND (SELECT auth.uid()) <> reported_by_user_id
    AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager'));
ALTER POLICY be_followup_select_v1 ON public.be_parcel_followup_tasks_v1
  USING ((SELECT auth.uid()) IN (assigned_user_id,created_by)
    OR ((SELECT auth.uid()) IS NOT NULL AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager')));
ALTER POLICY be_followup_create_v1 ON public.be_parcel_followup_tasks_v1
  WITH CHECK ((SELECT auth.uid())=created_by AND status='OPEN'
    AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager')
    AND EXISTS (SELECT 1 FROM public.be_data_entry_parcel_details d
      WHERE d.delivery_way_id=original_delivery_way_id AND coalesce(d.parcel_status,'')<>'duplicate_archived')
    AND EXISTS (SELECT 1 FROM public.be_user_account_registry u
      WHERE u.auth_user_id=assigned_user_id AND coalesce(u.is_active,true)));
COMMIT;
-- This extends only parcel-monitoring-related roles, not finance-posting RPC privileges.
