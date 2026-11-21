-- Britium Express Merchant Advance | Payable accrual & final offset readiness
-- READ-ONLY RPC for restored UAT. No journal posting, payout or status mutation.
-- Requires prior three merchant_advance SQL candidates and final_offset_review_v1.
-- A verified POSTED accrual event is required before ANY Dr Payable / Cr Advance offset.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_finance_advance_payable_accrual_readiness_v1(
  p_merchant_id text DEFAULT NULL,
  p_limit integer DEFAULT 250
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public','auth','pg_temp'
AS $fn$
DECLARE v_role text; v_rows jsonb; v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated Finance session required';
  END IF;
  v_role := public.be_finance_assert_internal_v3();
  IF upper(coalesce(v_role,'')) NOT IN
    ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER',
     'FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN')
  THEN
    RAISE EXCEPTION 'Finance authorization required';
  END IF;

  WITH proposed AS (
    SELECT
      v.id AS review_id, v.advance_item_id, v.parcel_id,
      v.merchant_id, v.delivery_way_id,
      v.state AS offset_review_state,
      v.final_entitlement_snapshot,
      v.advance_paid_snapshot,
      v.applied_offset_snapshot,
      v.remaining_merchant_payable,
      v.overadvance_recovery_due,
      v.other_merchant_receivable,
      v.reviewed_by,
      b.status AS advance_batch_status,
      b.accounting_event_id AS advance_accounting_event_id,
      ae.review_status AS advance_event_status,
      q.status AS current_delivery_status,
      q.validation_status AS current_validation_status,
      q.merchant_id AS current_merchant_id,
      q.merchant_final_settlement_amount AS current_final_entitlement,
      q.financial_settled_at,
      coalesce(c.financial_hold,false) AS held,
      EXISTS (
        SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
        WHERE d.parcel_id=v.parcel_id
          AND d.status NOT IN ('RESOLVED','REJECTED','CLOSED')
      ) AS disputed,
      EXISTS (
        SELECT 1
        FROM public.be_finance_settlement_batch_items_v3 bi
        JOIN public.be_finance_settlement_batches_v3 bb ON bb.id=bi.batch_id
        WHERE bi.parcel_id=v.parcel_id
          AND (bi.active OR bb.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING'))
      ) AS standard_settlement_present,
      coalesce(accrual.matches,0) AS posted_accrual_events,
      coalesce(accrual.credited,0)::numeric AS posted_payable_credit
    FROM public.be_finance_advance_final_offset_reviews_v1 v
    JOIN public.be_finance_advance_batches_v1 b ON b.id=v.advance_batch_id
    LEFT JOIN public.be_accounting_events ae ON ae.id=b.accounting_event_id
    LEFT JOIN public.be_v_finance_merchant_settlement_queue_v2 q ON q.parcel_id=v.parcel_id
    LEFT JOIN public.be_finance_settlement_parcel_control_v3 c ON c.parcel_id=v.parcel_id
    LEFT JOIN LATERAL (
       SELECT count(DISTINCT e.id)::integer AS matches,
              coalesce(sum(lines.credit_amount),0) AS credited
       FROM public.be_accounting_events e
       JOIN public.be_accounting_event_lines lines ON lines.event_id=e.id
       JOIN public.be_chart_of_accounts account ON account.id=lines.account_id
       WHERE e.review_status='POSTED'
         AND e.event_type IN ('MERCHANT_PAYABLE_ACCRUED','MERCHANT_PAYABLE_RECOGNIZED')
         AND upper(btrim(coalesce(e.source_reference,'')))=upper(btrim(v.delivery_way_id))
         AND lines.merchant_id=v.merchant_id
         AND account.account_code='212002'
    ) accrual ON true
    WHERE p_merchant_id IS NULL OR v.merchant_id=p_merchant_id
    ORDER BY v.requested_at DESC
    LIMIT least(greatest(coalesce(p_limit,250),1),1000)
  ), evaluated AS (
    SELECT *,
      CASE
        WHEN offset_review_state<>'APPROVED_REVIEW' THEN 'OFFSET_NOT_INDEPENDENTLY_APPROVED'
        WHEN advance_batch_status<>'DISBURSED' THEN 'ADVANCE_NOT_DISBURSED'
        WHEN advance_accounting_event_id IS NULL THEN 'ADVANCE_ACCOUNTING_EVENT_MISSING'
        WHEN advance_event_status<>'POSTED' THEN 'ADVANCE_ACCOUNTING_NOT_POSTED'
        WHEN current_delivery_status IS NULL OR upper(current_delivery_status)<>'DELIVERED'
          THEN 'DELIVERY_NOT_VERIFIED'
        WHEN upper(coalesce(current_validation_status,''))<>'OK' THEN 'FINANCE_VALIDATION_CHANGED'
        WHEN current_merchant_id IS DISTINCT FROM merchant_id THEN 'MERCHANT_IDENTITY_CHANGED'
        WHEN current_final_entitlement IS DISTINCT FROM final_entitlement_snapshot
          THEN 'MERCHANT_PAYABLE_CHANGED'
        WHEN financial_settled_at IS NOT NULL THEN 'ALREADY_FINAL_SETTLED'
        WHEN held OR disputed OR standard_settlement_present THEN 'HOLD_DISPUTE_OR_STANDARD_SETTLEMENT'
        WHEN posted_accrual_events<>1 THEN 'POSTED_WAY_LEVEL_PAYABLE_ACCRUAL_REQUIRED'
        WHEN posted_payable_credit<>greatest(final_entitlement_snapshot,0)
          THEN 'PAYABLE_ACCRUAL_AMOUNT_MISMATCH'
        WHEN applied_offset_snapshot<=0 THEN 'NO_OFFSET_REQUIRED'
        ELSE 'POSTING_PREREQUISITES_SATISFIED_REVIEW_ONLY'
      END AS posting_gate
    FROM proposed
  ) SELECT
    coalesce(jsonb_agg(to_jsonb(evaluated) ORDER BY delivery_way_id),'[]'::jsonb),
    jsonb_build_object(
      'reviews',count(*),
      'prerequisites_satisfied',count(*) FILTER (WHERE posting_gate='POSTING_PREREQUISITES_SATISFIED_REVIEW_ONLY'),
      'blocked',count(*) FILTER (WHERE posting_gate<>'POSTING_PREREQUISITES_SATISFIED_REVIEW_ONLY'),
      'offset_amount_under_review',coalesce(sum(applied_offset_snapshot),0)
    )
    INTO v_rows,v_summary FROM evaluated;

  RETURN jsonb_build_object(
    'ok',true,'build','MERCHANT_ADVANCE_POSTED_ACCRUAL_GATE_V1',
    'posting_status','READ_ONLY_NO_LEDGER_POST',
    'rows',v_rows,'summary',v_summary,
    'note','Even prerequisites_satisfied does NOT post journals or initiate payments. An independently reviewed offset posting implementation and balanced-ledger acceptance testing remain mandatory.'
  );
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_advance_payable_accrual_readiness_v1(text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_finance_advance_payable_accrual_readiness_v1(text,integer)
TO authenticated,service_role;
COMMIT;
