-- Britium Express | FINAL OFFSET ACCOUNTING EVENT | UAT ONLY
-- Install AFTER 10_merchant_advance_install_UAT_only.sql.
-- This stages a balanced Dr Merchant Settlement Payable / Cr Merchant Advances event.
-- It DOES NOT mark a parcel settled, pay cash, or automatically post any journal.
-- Accounting review/posting must use existing independent Finance controls.
-- Any attempt to POST this event revalidates live merchant/parcel/accounting evidence.
BEGIN;
ALTER TABLE public.be_finance_advance_final_offset_reviews_v1
  ADD COLUMN IF NOT EXISTS offset_accounting_event_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION private.be_finance_advance_offset_post_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
  v public.be_finance_advance_final_offset_reviews_v1%rowtype;
  b public.be_finance_advance_batches_v1%rowtype;
  q record;
  v_accrual_count bigint;
  v_accrual_credit numeric;
  v_dr numeric;
  v_cr numeric;
  v_rows bigint;
BEGIN
  IF NEW.source_system IS DISTINCT FROM 'MERCHANT_ADVANCE'
    OR NEW.source_table IS DISTINCT FROM 'be_finance_advance_final_offset_reviews_v1'
    OR NEW.event_type IS DISTINCT FROM 'MERCHANT_ADVANCE_OFFSET'
    OR NEW.review_status IS DISTINCT FROM 'POSTED'
    OR OLD.review_status='POSTED'
  THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v
    FROM public.be_finance_advance_final_offset_reviews_v1
    WHERE id=NEW.source_record_id::uuid
    FOR UPDATE;
  IF NOT FOUND OR v.state<>'APPROVED_REVIEW'
    OR v.reviewed_by IS NULL OR v.requested_by=v.reviewed_by
    OR v.offset_accounting_event_id IS DISTINCT FROM NEW.id
    OR NEW.posted_journal_id IS NULL
  THEN
    RAISE EXCEPTION 'ADVANCE_OFFSET_POSTING_BLOCKED: independent review and matching approved accounting event required';
  END IF;

  SELECT * INTO b
    FROM public.be_finance_advance_batches_v1
    WHERE id=v.advance_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status<>'DISBURSED' OR b.accounting_event_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.be_accounting_events ae
      WHERE ae.id=b.accounting_event_id AND ae.review_status='POSTED'
        AND ae.posted_journal_id IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'ADVANCE_OFFSET_POSTING_BLOCKED: advance asset itself has not been posted';
  END IF;

  PERFORM 1 FROM public.be_data_entry_parcel_details d WHERE d.id=v.parcel_id FOR UPDATE;
  SELECT x.* INTO q
    FROM public.be_v_finance_merchant_settlement_queue_v2 x
    WHERE x.parcel_id=v.parcel_id;
  IF NOT FOUND OR q.merchant_id IS DISTINCT FROM v.merchant_id
     OR upper(coalesce(q.status,''))<>'DELIVERED'
     OR upper(coalesce(q.validation_status,''))<>'OK'
     OR NOT coalesce(q.settlement_eligible,false)
     OR q.merchant_final_settlement_amount IS DISTINCT FROM v.final_entitlement_snapshot
     OR q.financial_settled_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_parcel_control_v3 c
         WHERE c.parcel_id=v.parcel_id AND c.financial_hold)
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
         WHERE d.parcel_id=v.parcel_id AND d.status NOT IN ('RESOLVED','REJECTED','CLOSED'))
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_batch_items_v3 bi
         JOIN public.be_finance_settlement_batches_v3 sb ON sb.id=bi.batch_id
         WHERE bi.parcel_id=v.parcel_id
           AND (bi.active OR sb.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')))
  THEN
    RAISE EXCEPTION 'ADVANCE_OFFSET_POSTING_BLOCKED: delivery, finance, hold, dispute or normal-settlement state changed';
  END IF;

  SELECT count(DISTINCT e.id),coalesce(sum(l.credit_amount),0)
    INTO v_accrual_count,v_accrual_credit
  FROM public.be_accounting_events e
  JOIN public.be_accounting_event_lines l ON l.event_id=e.id
  JOIN public.be_chart_of_accounts a ON a.id=l.account_id
  WHERE e.review_status='POSTED'
    AND e.event_type IN ('MERCHANT_PAYABLE_ACCRUED','MERCHANT_PAYABLE_RECOGNIZED')
    AND upper(btrim(coalesce(e.source_reference,'')))=upper(btrim(v.delivery_way_id))
    AND l.merchant_id=v.merchant_id AND a.account_code='212002';
  IF v_accrual_count<>1 OR v_accrual_credit<>greatest(v.final_entitlement_snapshot,0) THEN
    RAISE EXCEPTION 'ADVANCE_OFFSET_POSTING_BLOCKED: one posted, amount-matched merchant payable accrual required';
  END IF;

  SELECT count(*),
     coalesce(sum(CASE WHEN a.account_code='212002' THEN l.debit_amount ELSE 0 END),0),
     coalesce(sum(CASE WHEN a.account_code='114004' THEN l.credit_amount ELSE 0 END),0)
    INTO v_rows,v_dr,v_cr
  FROM public.be_accounting_event_lines l
  JOIN public.be_chart_of_accounts a ON a.id=l.account_id
  WHERE l.event_id=NEW.id;
  IF v_rows<>2 OR v_dr<>v.applied_offset_snapshot
    OR v_cr<>v.applied_offset_snapshot
    OR v_dr<=0 OR NEW.total_amount<>v.applied_offset_snapshot
    OR NEW.source_reference IS DISTINCT FROM v.delivery_way_id
  THEN
    RAISE EXCEPTION 'ADVANCE_OFFSET_POSTING_BLOCKED: posting lines do not match immutable approved offset';
  END IF;

  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.be_finance_advance_offset_post_guard_v1() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS be_finance_advance_offset_post_guard_v1
  ON public.be_accounting_events;
CREATE TRIGGER be_finance_advance_offset_post_guard_v1
BEFORE UPDATE OF review_status ON public.be_accounting_events
FOR EACH ROW
EXECUTE FUNCTION private.be_finance_advance_offset_post_guard_v1();

CREATE OR REPLACE FUNCTION public.be_finance_advance_final_offset_stage_event_v1(
  p_review_id uuid,p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','auth','pg_temp'
AS $fn$
DECLARE
  v_role text;
  v_actor uuid:=auth.uid();
  v public.be_finance_advance_final_offset_reviews_v1%rowtype;
  b public.be_finance_advance_batches_v1%rowtype;
  q record;
  v_accrual_count bigint;
  v_accrual_credit numeric;
  v_payable_account uuid;
  v_advance_account uuid;
  v_result jsonb;
  v_event_id uuid;
  v_snapshot jsonb;
  v_fingerprint text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role:=public.be_finance_assert_internal_v3();
  IF upper(coalesce(v_role,'')) NOT IN
      ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN')
  THEN RAISE EXCEPTION 'Finance creator authorization required'; END IF;
  IF length(btrim(coalesce(p_note,'')))<12 THEN
    RAISE EXCEPTION 'At least 12 characters of independent accrual evidence required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_review_id::text,440011));
  SELECT * INTO v FROM public.be_finance_advance_final_offset_reviews_v1
    WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final offset review not found'; END IF;
  IF v.offset_accounting_event_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'idempotent',true,
      'event_id',v.offset_accounting_event_id,'posting_status','EXISTING_EVENT_REQUIRES_ACCOUNTING_REVIEW');
  END IF;
  IF v.state<>'APPROVED_REVIEW' OR v.reviewed_by IS NULL
    OR v.reviewed_by=v.requested_by OR v.applied_offset_snapshot<=0
  THEN RAISE EXCEPTION 'Independently approved positive final advance offset required'; END IF;
  SELECT * INTO b FROM public.be_finance_advance_batches_v1
    WHERE id=v.advance_batch_id FOR UPDATE;
  IF NOT FOUND OR b.status<>'DISBURSED' OR b.accounting_event_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.be_accounting_events ae
       WHERE ae.id=b.accounting_event_id
         AND ae.review_status='POSTED' AND ae.posted_journal_id IS NOT NULL
     )
  THEN RAISE EXCEPTION 'Advance disbursement journal must be posted first'; END IF;

  PERFORM 1 FROM public.be_data_entry_parcel_details WHERE id=v.parcel_id FOR UPDATE;
  SELECT x.* INTO q FROM public.be_v_finance_merchant_settlement_queue_v2 x
    WHERE x.parcel_id=v.parcel_id;
  IF NOT FOUND OR q.merchant_id IS DISTINCT FROM v.merchant_id
     OR upper(coalesce(q.status,''))<>'DELIVERED'
     OR upper(coalesce(q.validation_status,''))<>'OK'
     OR NOT coalesce(q.settlement_eligible,false)
     OR q.merchant_final_settlement_amount IS DISTINCT FROM v.final_entitlement_snapshot
     OR q.financial_settled_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_parcel_control_v3 c
        WHERE c.parcel_id=v.parcel_id AND c.financial_hold)
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
        WHERE d.parcel_id=v.parcel_id AND d.status NOT IN ('RESOLVED','REJECTED','CLOSED'))
     OR EXISTS (SELECT 1 FROM public.be_finance_settlement_batch_items_v3 z
        JOIN public.be_finance_settlement_batches_v3 sb ON sb.id=z.batch_id
        WHERE z.parcel_id=v.parcel_id
          AND (z.active OR sb.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')))
  THEN RAISE EXCEPTION 'Live delivered entitlement or finance restriction changed'; END IF;

  SELECT count(DISTINCT e.id),coalesce(sum(l.credit_amount),0)
    INTO v_accrual_count,v_accrual_credit
  FROM public.be_accounting_events e
  JOIN public.be_accounting_event_lines l ON l.event_id=e.id
  JOIN public.be_chart_of_accounts a ON a.id=l.account_id
  WHERE e.review_status='POSTED'
    AND e.event_type IN ('MERCHANT_PAYABLE_ACCRUED','MERCHANT_PAYABLE_RECOGNIZED')
    AND upper(btrim(coalesce(e.source_reference,'')))=upper(btrim(v.delivery_way_id))
    AND l.merchant_id=v.merchant_id AND a.account_code='212002';
  IF v_accrual_count<>1 OR v_accrual_credit<>greatest(v.final_entitlement_snapshot,0) THEN
    RAISE EXCEPTION 'Exactly one posted, correct-amount merchant payable accrual is required';
  END IF;

  SELECT id INTO v_payable_account FROM public.be_chart_of_accounts
    WHERE account_code='212002' AND is_active AND is_postable;
  SELECT id INTO v_advance_account FROM public.be_chart_of_accounts
    WHERE account_code='114004' AND is_active AND is_postable;
  IF v_payable_account IS NULL OR v_advance_account IS NULL THEN
    RAISE EXCEPTION 'Required merchant payable / advance account not configured';
  END IF;

  v_snapshot:=jsonb_build_object(
    'source_reference',v.delivery_way_id,
    'review_id',v.id,'merchant_id',v.merchant_id,
    'advance_item_id',v.advance_item_id,'advance_batch_id',v.advance_batch_id,
    'advance_paid_snapshot',v.advance_paid_snapshot,
    'final_entitlement_snapshot',v.final_entitlement_snapshot,
    'applied_offset_snapshot',v.applied_offset_snapshot,
    'reviewed_by',v.reviewed_by,
    'note',btrim(p_note)
  );
  v_fingerprint:=md5((v_snapshot-'note')::text);
  v_result:=public.be_accounting_upsert_event_v1(
    'MERCHANT_ADVANCE','be_finance_advance_final_offset_reviews_v1',v.id::text,
    'MERCHANT_ADVANCE_OFFSET','MERCHANT_ADVANCE_OFFSET_V1',
    (now() AT TIME ZONE 'Asia/Yangon')::date,
    'Final merchant advance offset / '||v.delivery_way_id,
    'MMK',v.applied_offset_snapshot,v_snapshot,v_fingerprint,
    'REVIEW_PENDING',now(),jsonb_build_object('advance_item_id',v.advance_item_id)
  );
  IF coalesce((v_result->>'ok')::boolean,false) IS DISTINCT FROM true
     OR v_result->>'code' NOT IN ('CREATED','UNCHANGED')
  THEN
    RAISE EXCEPTION 'Accounting source event stage failed: %',v_result;
  END IF;
  v_event_id:=(v_result->>'event_id')::uuid;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'Accounting event ID missing'; END IF;

  IF v_result->>'code'='CREATED' THEN
    INSERT INTO public.be_accounting_event_lines(
      event_id,account_id,sequence_no,debit_amount,credit_amount,
      merchant_id,description,metadata
    ) VALUES
    (v_event_id,v_payable_account,10,v.applied_offset_snapshot,0,
      v.merchant_id,'Apply merchant payable against paid advance',
      jsonb_build_object('way_id',v.delivery_way_id,'review_id',v.id)),
    (v_event_id,v_advance_account,20,0,v.applied_offset_snapshot,
      v.merchant_id,'Clear portion of merchant advance asset',
      jsonb_build_object('way_id',v.delivery_way_id,'review_id',v.id));
  END IF;
  UPDATE public.be_finance_advance_final_offset_reviews_v1
    SET offset_accounting_event_id=v_event_id WHERE id=v.id;
  RETURN jsonb_build_object('ok',true,'review_id',v.id,'event_id',v_event_id,
    'debit_account','212002','credit_account','114004',
    'amount',v.applied_offset_snapshot,
    'event_status','REVIEW_PENDING','journal_posted',false,
    'message','Finance Accounting must independently review and post this event. No merchant payment or COD finalization has occurred.');
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_advance_final_offset_stage_event_v1(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_finance_advance_final_offset_stage_event_v1(uuid,text)
  TO authenticated,service_role;
COMMIT;
