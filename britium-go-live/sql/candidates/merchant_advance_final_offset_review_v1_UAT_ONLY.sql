-- Britium Express — Advance versus delivered merchant final settlement offset review
-- UAT ONLY. Does NOT create money transfer, COD settlement, journal or wallet mutation.
-- Install AFTER merchant_advance_settlement_v1_UAT_ONLY.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.be_finance_advance_final_offset_reviews_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 advance_item_id uuid NOT NULL UNIQUE REFERENCES public.be_finance_advance_items_v1(id),
 parcel_id uuid NOT NULL REFERENCES public.be_data_entry_parcel_details(id),
 merchant_id text NOT NULL,
 delivery_way_id text NOT NULL,
 advance_batch_id uuid NOT NULL REFERENCES public.be_finance_advance_batches_v1(id),
 final_entitlement_snapshot numeric(16,2) NOT NULL,
 advance_paid_snapshot numeric(16,2) NOT NULL CHECK(advance_paid_snapshot>0),
 applied_offset_snapshot numeric(16,2) NOT NULL CHECK(applied_offset_snapshot>=0),
 remaining_merchant_payable numeric(16,2) NOT NULL CHECK(remaining_merchant_payable>=0),
 overadvance_recovery_due numeric(16,2) NOT NULL CHECK(overadvance_recovery_due>=0),
 other_merchant_receivable numeric(16,2) NOT NULL CHECK(other_merchant_receivable>=0),
 calculation_version text,
 delivery_status_snapshot text NOT NULL,
 state text NOT NULL DEFAULT 'REVIEW_PENDING' CHECK(state IN ('REVIEW_PENDING','APPROVED_REVIEW','REJECTED_REVIEW')),
 requested_by uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 request_note text NOT NULL,
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text,
 CONSTRAINT be_finance_advance_final_offset_conservation_v1 CHECK(
   applied_offset_snapshot+remaining_merchant_payable=greatest(final_entitlement_snapshot,0)
   AND applied_offset_snapshot+overadvance_recovery_due=advance_paid_snapshot
   AND other_merchant_receivable=greatest(-final_entitlement_snapshot,0)
 )
);
CREATE INDEX IF NOT EXISTS be_finance_advance_final_offset_merchant_idx
 ON public.be_finance_advance_final_offset_reviews_v1(merchant_id,requested_at DESC);
ALTER TABLE public.be_finance_advance_final_offset_reviews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_finance_advance_final_offset_reviews_v1 FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.be_finance_advance_final_offset_reviews_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.be_finance_advance_final_offset_prepare_v1(
 p_advance_item_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_actor uuid:=auth.uid(); i public.be_finance_advance_items_v1%rowtype;
 b public.be_finance_advance_batches_v1%rowtype; q record; v_id uuid; v_offset numeric;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF v_actor IS NULL OR upper(v_role) NOT IN
 ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN
   RAISE EXCEPTION 'Authenticated Finance advance creator required';
 END IF;
 IF length(btrim(coalesce(p_reason,'')))<12 THEN RAISE EXCEPTION 'Reconciliation reason/reference must have at least 12 characters'; END IF;
 SELECT * INTO i FROM public.be_finance_advance_items_v1 WHERE id=p_advance_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Advance item not found'; END IF;
 SELECT * INTO b FROM public.be_finance_advance_batches_v1 WHERE id=i.batch_id;
 IF b.status<>'DISBURSED' OR b.paid_at IS NULL OR b.payment_reference IS NULL THEN
   RAISE EXCEPTION 'Advance has not been independently verified and disbursed';
 END IF;
 PERFORM 1 FROM public.be_data_entry_parcel_details d WHERE d.id=i.parcel_id FOR UPDATE;
 SELECT q1.* INTO q FROM public.be_v_finance_merchant_settlement_queue_v2 q1 WHERE q1.parcel_id=i.parcel_id;
 IF NOT FOUND OR q.merchant_id IS DISTINCT FROM i.merchant_id OR upper(btrim(q.delivery_way_id))<>upper(btrim(i.delivery_way_id))
   OR upper(coalesce(q.status,''))<>'DELIVERED'
   OR upper(coalesce(q.validation_status,''))<>'OK'
   OR NOT coalesce(q.settlement_eligible,false)
   OR q.merchant_final_settlement_amount IS NULL
   OR q.financial_settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Verified delivered, unsettled, financially valid merchant parcel required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.be_finance_settlement_parcel_control_v3 c
    WHERE c.parcel_id=i.parcel_id AND c.financial_hold)
 OR EXISTS(SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
    WHERE d.parcel_id=i.parcel_id AND d.status NOT IN('RESOLVED','REJECTED','CLOSED'))
 OR EXISTS(SELECT 1 FROM public.be_finance_settlement_batch_items_v3 x
    JOIN public.be_finance_settlement_batches_v3 y ON y.id=x.batch_id
    WHERE x.parcel_id=i.parcel_id AND (
      x.active OR y.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')
      OR y.payment_status IN ('PAID','PARTIALLY_PAID','PROCESSING')
    )) THEN
    RAISE EXCEPTION 'Hold, dispute or prior standard settlement prevents offset review';
 END IF;
 IF EXISTS(SELECT 1 FROM public.be_finance_advance_final_offset_reviews_v1 v
    WHERE v.advance_item_id=i.id) THEN
    RAISE EXCEPTION 'Final offset review already exists for this advance item';
 END IF;
 v_offset:=least(greatest(q.merchant_final_settlement_amount,0),i.advance_amount);
 INSERT INTO public.be_finance_advance_final_offset_reviews_v1(
 advance_item_id,parcel_id,merchant_id,delivery_way_id,advance_batch_id,
 final_entitlement_snapshot,advance_paid_snapshot,applied_offset_snapshot,
 remaining_merchant_payable,overadvance_recovery_due,other_merchant_receivable,
 calculation_version,delivery_status_snapshot,requested_by,request_note
 ) VALUES (
 i.id,i.parcel_id,i.merchant_id,i.delivery_way_id,i.batch_id,
 q.merchant_final_settlement_amount,i.advance_amount,v_offset,
 greatest(q.merchant_final_settlement_amount,0)-v_offset,
 i.advance_amount-v_offset,greatest(-q.merchant_final_settlement_amount,0),
 q.calculation_version,q.status,v_actor,btrim(p_reason)
 ) RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'review_id',v_id,'state','REVIEW_PENDING',
 'offset_applied',v_offset,'remaining_merchant_payable',
 greatest(q.merchant_final_settlement_amount,0)-v_offset,
 'merchant_recovery_due',i.advance_amount-v_offset+greatest(-q.merchant_final_settlement_amount,0),
 'posting_status','NOT_POSTED','note','Review proposal only; no bank, wallet, journal or final COD mutation');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_final_offset_review_v1(
 p_review_id uuid,p_decision text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_actor uuid:=auth.uid(); v public.be_finance_advance_final_offset_reviews_v1%rowtype;
 q record; v_decision text:=upper(btrim(coalesce(p_decision,'')));
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF v_actor IS NULL OR upper(v_role) NOT IN
 ('FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') THEN
   RAISE EXCEPTION 'Independent Finance approver required'; END IF;
 IF v_decision NOT IN ('APPROVE','REJECT') OR length(btrim(coalesce(p_note,'')))<12 THEN
   RAISE EXCEPTION 'APPROVE or REJECT with independent review evidence'; END IF;
 SELECT * INTO v FROM public.be_finance_advance_final_offset_reviews_v1 WHERE id=p_review_id FOR UPDATE;
 IF NOT FOUND OR v.state<>'REVIEW_PENDING' OR v.requested_by=v_actor THEN
   RAISE EXCEPTION 'Review not pending or reviewer is original creator'; END IF;
 PERFORM 1 FROM public.be_data_entry_parcel_details d WHERE d.id=v.parcel_id FOR UPDATE;
 SELECT q1.* INTO q FROM public.be_v_finance_merchant_settlement_queue_v2 q1 WHERE q1.parcel_id=v.parcel_id;
 IF NOT FOUND OR q.merchant_id IS DISTINCT FROM v.merchant_id
   OR upper(coalesce(q.status,''))<>'DELIVERED'
   OR upper(coalesce(q.validation_status,''))<>'OK'
   OR NOT coalesce(q.settlement_eligible,false)
   OR q.merchant_final_settlement_amount IS DISTINCT FROM v.final_entitlement_snapshot
   OR q.financial_settled_at IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.be_finance_settlement_parcel_control_v3 c
      WHERE c.parcel_id=v.parcel_id AND c.financial_hold)
   OR EXISTS(SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
      WHERE d.parcel_id=v.parcel_id AND d.status NOT IN('RESOLVED','REJECTED','CLOSED'))
   OR EXISTS(SELECT 1 FROM public.be_finance_settlement_batch_items_v3 x
      JOIN public.be_finance_settlement_batches_v3 b ON b.id=x.batch_id
      WHERE x.parcel_id=v.parcel_id AND
       (x.active OR b.status IN('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')))
 THEN RAISE EXCEPTION 'Live final payable or hold/settlement state changed; approval rejected'; END IF;
 UPDATE public.be_finance_advance_final_offset_reviews_v1
 SET state=CASE WHEN v_decision='APPROVE' THEN 'APPROVED_REVIEW' ELSE 'REJECTED_REVIEW' END,
 reviewed_by=v_actor,reviewed_at=now(),review_note=btrim(p_note)
 WHERE id=p_review_id;
 RETURN jsonb_build_object('ok',true,'review_id',p_review_id,'decision',v_decision,
 'posting_status','NOT_POSTED','amount_offset',v.applied_offset_snapshot,
 'remaining_payable',v.remaining_merchant_payable,
 'recovery_due',v.overadvance_recovery_due+v.other_merchant_receivable);
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_final_offset_reviews_snapshot_v1(
 p_merchant_id text DEFAULT NULL,p_limit integer DEFAULT 500
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_rows jsonb;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF auth.uid() IS NULL OR upper(v_role) NOT IN
 ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER',
 'FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN
   RAISE EXCEPTION 'Finance authorization required'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.requested_at DESC),'[]'::jsonb)
 INTO v_rows FROM (
   SELECT * FROM public.be_finance_advance_final_offset_reviews_v1
   WHERE p_merchant_id IS NULL OR merchant_id=p_merchant_id
   ORDER BY requested_at DESC LIMIT least(greatest(coalesce(p_limit,500),1),2000)
 ) t;
 RETURN jsonb_build_object('ok',true,'rows',v_rows,'posted',false,
 'note','Approval is for offset calculation only, not actual posting/settlement');
END $fn$;
REVOKE ALL ON FUNCTION
 public.be_finance_advance_final_offset_prepare_v1(uuid,text),
 public.be_finance_advance_final_offset_review_v1(uuid,text,text),
 public.be_finance_advance_final_offset_reviews_snapshot_v1(text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.be_finance_advance_final_offset_prepare_v1(uuid,text),
 public.be_finance_advance_final_offset_review_v1(uuid,text,text),
 public.be_finance_advance_final_offset_reviews_snapshot_v1(text,integer)
TO authenticated,service_role;
COMMIT;
