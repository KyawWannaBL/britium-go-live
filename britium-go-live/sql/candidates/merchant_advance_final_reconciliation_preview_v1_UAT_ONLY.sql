-- BRITIUM EXPRESS: reviewed advance vs final COD / RTO reconciliation PREVIEW.
-- Install AFTER merchant_advance_settlement_v1_UAT_ONLY.sql, in restored UAT only.
-- READ ONLY: no double payout, delivery status changes, wallet posting or refunds.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_finance_advance_final_reconciliation_preview_v1(
 p_merchant_id text DEFAULT NULL, p_limit integer DEFAULT 1000
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_rows jsonb; v_kpis jsonb;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(coalesce(v_role,'')) NOT IN
   ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER','FINANCE_ADMIN',
    'FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN
   RAISE EXCEPTION 'Finance authorization required';
 END IF;
 WITH totals AS (
  SELECT i.id AS advance_item_id,i.parcel_id,i.delivery_way_id,i.merchant_id,i.service_provider_code,
   i.pickup_receipt_at,i.advance_amount,i.item_price_snapshot,
   b.id AS advance_batch_id,b.batch_number,b.paid_at,b.payment_reference,
   coalesce(q.status,'UNKNOWN') AS delivery_status,
   coalesce(q.validation_status,'') AS validation_status,
   coalesce(q.settlement_state,'') AS standard_settlement_state,
   q.merchant_final_settlement_amount AS normal_final_entitlement,
   r.id AS recovery_id,r.amount AS recovery_claim,
   r.status AS recovery_status,r.received_at AS refund_received_at,
   CASE WHEN r.status='REFUND_RECEIVED' THEN r.amount ELSE 0 END AS confirmed_refund_received,
   coalesce(hold.financial_hold,false) AS finance_hold,
   EXISTS(SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
          WHERE d.parcel_id=i.parcel_id AND d.status NOT IN ('RESOLVED','REJECTED','CLOSED')) AS disputed
  FROM public.be_finance_advance_items_v1 i
  JOIN public.be_finance_advance_batches_v1 b ON b.id=i.batch_id AND b.status='DISBURSED'
  LEFT JOIN public.be_v_finance_merchant_settlement_queue_v2 q ON q.parcel_id=i.parcel_id
  LEFT JOIN public.be_finance_advance_rto_recoveries_v1 r ON r.advance_item_id=i.id
  LEFT JOIN public.be_finance_settlement_parcel_control_v3 hold ON hold.parcel_id=i.parcel_id
  WHERE p_merchant_id IS NULL OR i.merchant_id=p_merchant_id
 ), evaluated AS (
  SELECT t.*,
   CASE
    WHEN t.finance_hold OR t.disputed THEN 'FINANCIAL_REVIEW_REQUIRED'
    WHEN upper(t.delivery_status) IN ('DELIVERED','DELIVERY_COMPLETED')
      AND t.validation_status='OK' AND t.normal_final_entitlement IS NOT NULL THEN 'DELIVERED_FINAL_REVIEW'
    WHEN upper(t.delivery_status) LIKE 'RTO%' OR upper(t.delivery_status) IN ('RETURN_TO_SENDER','RETURNED_TO_ORIGIN') THEN
      CASE WHEN t.recovery_id IS NULL THEN 'RTO_REFUND_NOT_OPENED'
           WHEN t.recovery_status='REFUND_RECEIVED' THEN 'RTO_REFUND_RECORDED'
           WHEN t.recovery_status='WAIVED' THEN 'RTO_REFUND_WAIVED'
           ELSE 'RTO_REFUND_PENDING' END
    ELSE 'DELIVERY_PENDING'
   END AS reconciliation_state,
   CASE WHEN upper(t.delivery_status) IN ('DELIVERED','DELIVERY_COMPLETED')
      AND t.validation_status='OK' AND NOT t.finance_hold AND NOT t.disputed
      AND t.normal_final_entitlement IS NOT NULL
      THEN round(t.normal_final_entitlement - t.advance_amount,2) ELSE NULL END AS net_final_delta,
   CASE WHEN upper(t.delivery_status) LIKE 'RTO%' OR upper(t.delivery_status) IN ('RETURN_TO_SENDER','RETURNED_TO_ORIGIN')
     THEN greatest(0,t.advance_amount-t.confirmed_refund_received) ELSE NULL END AS advance_at_risk
  FROM totals t
 ), bounded AS (
 SELECT * FROM evaluated ORDER BY paid_at DESC NULLS LAST, delivery_way_id LIMIT greatest(1,least(coalesce(p_limit,1000),3000))
 )
 SELECT coalesce(jsonb_agg(to_jsonb(bounded) ORDER BY paid_at DESC NULLS LAST,delivery_way_id),'[]'::jsonb)
 INTO v_rows FROM bounded;
 SELECT jsonb_build_object(
  'disbursed_advance_ways',count(*),
  'total_advance_disbursed',coalesce(sum(advance_amount),0),
  'delivered_net_due_to_merchant',coalesce(sum(greatest(net_final_delta,0)) FILTER (WHERE reconciliation_state='DELIVERED_FINAL_REVIEW'),0),
  'delivered_net_due_from_merchant',coalesce(sum(greatest(-net_final_delta,0)) FILTER (WHERE reconciliation_state='DELIVERED_FINAL_REVIEW'),0),
  'rto_advance_at_risk',coalesce(sum(advance_at_risk),0),
  'refund_confirmed_received',coalesce(sum(confirmed_refund_received),0),
  'requires_review',count(*) FILTER (WHERE reconciliation_state<>'DELIVERED_FINAL_REVIEW')
 ) INTO v_kpis
 FROM jsonb_to_recordset(coalesce(v_rows,'[]'::jsonb)) AS evaluated(
  advance_amount numeric, net_final_delta numeric, advance_at_risk numeric,
  confirmed_refund_received numeric, reconciliation_state text
 );
 RETURN jsonb_build_object(
   'ok',true,'build','ADVANCE_FINAL_RECONCILIATION_PREVIEW_V1',
   'rows',v_rows,'kpis',v_kpis,
   'kpis_scope','RETURNED_PAGE_ONLY',
   'posting_status','READ_ONLY_NOT_POSTED',
   'note','This is a financial preview only. Final COD settlement, wallet offset and adjustments require separately tested ledger posting and approval.'
 );
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_advance_final_reconciliation_preview_v1(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_finance_advance_final_reconciliation_preview_v1(text,integer) TO authenticated,service_role;
COMMIT;
