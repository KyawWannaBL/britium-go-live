-- Britium Express consolidated Merchant Advance UAT-only transactional installer.
-- Never execute on production; signed policy OFF by default and no sample financial rows.
-- Existing Mandalay/Insein UAT is currently missing required core objects.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $preflight$
DECLARE o text; missing text[]:=ARRAY[]::text[];
BEGIN
 FOREACH o IN ARRAY ARRAY[
   'public.be_data_entry_parcel_details',
   'public.be_warehouse_receipts_v36',
   'public.be_pickup_parcel_verifications',
   'public.be_finance_settlement_batches_v3',
   'public.be_finance_settlement_batch_items_v3',
   'public.be_finance_settlement_parcel_control_v3',
   'public.be_finance_settlement_disputes_v3',
   'public.be_finance_settlement_payments_v3',
   'public.be_parcel_settlement_ledger_v2',
   'public.be_v_finance_merchant_settlement_queue_v2',
   'public.be_accounting_events',
   'public.be_accounting_event_lines',
   'public.be_chart_of_accounts'
 ] LOOP
  IF to_regclass(o) IS NULL THEN missing:=array_append(missing,o); END IF;
 END LOOP;
 IF to_regprocedure('public.be_finance_assert_internal_v3()') IS NULL THEN
    missing:=array_append(missing,'public.be_finance_assert_internal_v3()');
 END IF;
 IF to_regprocedure('public.be_accounting_upsert_event_v1(text,text,text,text,text,date,text,text,numeric,jsonb,text,text,timestamptz,jsonb)') IS NULL THEN
    missing:=array_append(missing,'public.be_accounting_upsert_event_v1(...)');
 END IF;
 IF cardinality(missing)>0 THEN
   RAISE EXCEPTION 'UAT_ADVANCE_INSTALL_BLOCKED_MISSING_DEPENDENCIES: %',array_to_string(missing,', ');
 END IF;
END $preflight$;

-- SECTION 1 merchant_advance_settlement_v1_UAT_ONLY.sql
-- Britium Express | Merchant advance settlement v1 | UAT CANDIDATE
-- IMPORTANT: INSTALL ONLY AFTER FULL UAT SCHEMA RESTORE. NO PRODUCTION INSTALL HERE.
-- This ledger is separate from delivered/COD settlement. No physical transfer occurs from SQL.
-- Advance amounts use signed merchant policy; missing policy = ineligible, not zero.
-- Verified approved pickup review timestamp or physical warehouse inbound scan qualifies. Rider-submitted alone or return scan alone do not.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_finance_advance_merchant_policy_v1 (
 merchant_id text PRIMARY KEY,
 enabled boolean NOT NULL DEFAULT false,
 rate_pct numeric(7,4) NOT NULL CHECK(rate_pct > 0 AND rate_pct <= 100),
 flat_deduction numeric(16,2) NOT NULL DEFAULT 0 CHECK(flat_deduction >= 0),
 allowed_providers text[] NOT NULL DEFAULT ARRAY['BRITIUM','ROYAL EXPRESS','DK DELIVERY','MDY BRANCH','NPT BRANCH','H.TERMINAL DROP-OFF']::text[],
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference))>=8),
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.be_finance_advance_batches_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_number text NOT NULL UNIQUE DEFAULT ('FADV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||substr(gen_random_uuid()::text,1,8)),
 merchant_id text NOT NULL REFERENCES public.be_finance_advance_merchant_policy_v1(merchant_id),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISBURSED','REJECTED','CANCELLED')),
 total_amount numeric(16,2) NOT NULL CHECK(total_amount > 0),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz, approved_by uuid, approved_at timestamptz,
 payment_by uuid, paid_at timestamptz, payment_method text, payment_reference text UNIQUE,
 payment_evidence_url text, payment_account text,
 reason text NOT NULL, decision_note text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.be_finance_advance_items_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.be_finance_advance_batches_v1(id),
 parcel_id uuid NOT NULL UNIQUE REFERENCES public.be_data_entry_parcel_details(id),
 delivery_way_id text NOT NULL, pickup_id text NOT NULL,
 merchant_id text NOT NULL, service_provider_code text NOT NULL,
 pickup_receipt_at timestamptz NOT NULL,
 delivery_status_at_advance text NOT NULL,
 item_price_snapshot numeric(16,2) NOT NULL CHECK(item_price_snapshot >= 0),
 rate_pct_snapshot numeric(7,4) NOT NULL,
 deduction_snapshot numeric(16,2) NOT NULL,
 advance_amount numeric(16,2) NOT NULL CHECK(advance_amount > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.be_finance_advance_rto_recoveries_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 advance_item_id uuid NOT NULL UNIQUE REFERENCES public.be_finance_advance_items_v1(id),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 status text NOT NULL DEFAULT 'REFUND_DUE' CHECK(status IN ('REFUND_DUE','UNDER_REVIEW','APPROVED','REFUND_RECEIVED','WAIVED')),
 reason text NOT NULL, requested_by uuid NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid, reviewed_at timestamptz, review_note text,
 received_by uuid, received_at timestamptz, receipt_method text, receipt_reference text UNIQUE,
 receipt_evidence_url text
);
CREATE INDEX IF NOT EXISTS be_finance_advance_items_merchant_v1_idx
 ON public.be_finance_advance_items_v1(merchant_id,batch_id);
CREATE INDEX IF NOT EXISTS be_finance_advance_batches_merchant_v1_idx
 ON public.be_finance_advance_batches_v1(merchant_id,created_at DESC);
ALTER TABLE public.be_finance_advance_merchant_policy_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_finance_advance_batches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_finance_advance_items_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_finance_advance_rto_recoveries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_finance_advance_merchant_policy_v1,public.be_finance_advance_batches_v1,
 public.be_finance_advance_items_v1,public.be_finance_advance_rto_recoveries_v1 FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.be_finance_advance_merchant_policy_v1,public.be_finance_advance_batches_v1,
 public.be_finance_advance_items_v1,public.be_finance_advance_rto_recoveries_v1 TO service_role;
-- Internal-only roles via controlled SECURITY DEFINER RPC. All changes audited by actor columns.

CREATE OR REPLACE FUNCTION public.be_finance_advance_preview_v1(p_merchant_id text DEFAULT NULL,p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_rows jsonb; v_policies jsonb; v_batches jsonb; v_recoveries jsonb; v_items jsonb;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN
   RAISE EXCEPTION 'Finance authorization required';
 END IF;
 WITH candidates AS (
  SELECT q.parcel_id,q.delivery_way_id,q.merchant_id,q.merchant_name,q.status AS delivery_state,
   d.pickup_id,coalesce(d.item_price,0)::numeric AS item_price,
   upper(coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET')) AS provider_code,
   coalesce(pv.reviewed_at,r.scanned_at)::timestamptz AS receipt_at,
   case when pv.reviewed_at is not null then 'APPROVED_PICKUP' when r.scanned_at is not null then 'WAREHOUSE_RECEIPT' else 'UNVERIFIED' end AS pickup_proof_source,
   coalesce(q.validation_status,'') AS validation_status,
   coalesce(c.financial_hold,false) AS held,
   exists(select 1 from public.be_finance_settlement_disputes_v3 z where z.parcel_id=d.id and z.status not in ('RESOLVED','REJECTED','CLOSED')) AS disputed,
   exists(
     select 1 from public.be_finance_settlement_batch_items_v3 z
     join public.be_finance_settlement_batches_v3 b ON b.id=z.batch_id
     where z.parcel_id=d.id AND (z.active
       OR b.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')
       OR b.payment_status IN ('PAID','PARTIALLY_PAID','PROCESSING'))
   ) AS regular_batch,
   (q.financial_settled_at IS NOT NULL OR q.settlement_state='SETTLED') AS already_final_settled,
   exists(select 1 from public.be_finance_advance_items_v1 i where i.parcel_id=d.id) AS advanced,
   p.enabled AS policy_enabled,p.rate_pct,p.flat_deduction,p.allowed_providers,p.approval_reference
  FROM public.be_v_finance_merchant_settlement_queue_v2 q
  JOIN public.be_data_entry_parcel_details d ON d.id=q.parcel_id
  LEFT JOIN public.be_finance_advance_merchant_policy_v1 p ON p.merchant_id=q.merchant_id
  LEFT JOIN public.be_finance_settlement_parcel_control_v3 c ON c.parcel_id=q.parcel_id
  LEFT JOIN LATERAL (
    SELECT v.reviewed_at FROM public.be_pickup_parcel_verifications v
    WHERE v.delivery_way_id=d.delivery_way_id AND v.pickup_id=d.pickup_id
      AND upper(coalesce(v.verification_status,'')) IN ('APPROVED','DATA_ENTRY_APPROVED')
      AND v.reviewed_at IS NOT NULL
    ORDER BY v.reviewed_at ASC LIMIT 1
  ) pv ON true
  LEFT JOIN LATERAL (
    SELECT wr.scanned_at FROM public.be_warehouse_receipts_v36 wr
    WHERE wr.delivery_way_id=d.delivery_way_id AND wr.pickup_id=d.pickup_id
      AND upper(wr.warehouse_status) IN ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY','READY_FOR_DELIVERY')
      AND wr.scanned_at IS NOT NULL
    ORDER BY wr.scanned_at ASC LIMIT 1
  ) r ON true
  WHERE p_merchant_id IS NULL OR q.merchant_id=p_merchant_id
  ORDER BY d.created_at DESC
  LIMIT least(greatest(coalesce(p_limit,1000),1),3000)
 ), flagged AS (
  SELECT *,
    (receipt_at IS NOT NULL AND (now() AT TIME ZONE 'Asia/Yangon')::date > (receipt_at AT TIME ZONE 'Asia/Yangon')::date) AS next_day,
    round(item_price*coalesce(rate_pct,0)/100-coalesce(flat_deduction,0),2) AS proposed_advance,
    CASE WHEN NOT coalesce(policy_enabled,false) THEN 'MERCHANT_POLICY_NOT_APPROVED'
     WHEN upper(coalesce(merchant_id,'')) IN ('BLK','BBB') THEN 'CONSOLIDATED_MERCHANT_MAPPING_REQUIRED'
     WHEN validation_status<>'OK' THEN 'FINANCIAL_VALIDATION_PENDING'
     WHEN held OR disputed THEN 'FINANCIAL_HOLD_OR_DISPUTE'
     WHEN advanced THEN 'ALREADY_ADVANCED'
     WHEN regular_batch OR already_final_settled THEN 'ALREADY_IN_NORMAL_SETTLEMENT'
     WHEN receipt_at IS NULL THEN 'PICKUP_RECEIPT_NOT_VERIFIED'
     WHEN (now() AT TIME ZONE 'Asia/Yangon')::date <= (receipt_at AT TIME ZONE 'Asia/Yangon')::date THEN 'NEXT_DAY_NOT_REACHED'
     WHEN NOT (provider_code=ANY(coalesce(allowed_providers,ARRAY[]::text[]))) THEN 'PROVIDER_NOT_AUTHORIZED'
     WHEN upper(coalesce(delivery_state,'')) LIKE 'RTO%' OR upper(coalesce(delivery_state,'')) IN ('CANCELLED','CANCELED','RETURN_TO_SENDER') THEN 'RTO_OR_CANCELLED_BEFORE_ADVANCE'
     WHEN coalesce(item_price,0)<=0 OR round(item_price*coalesce(rate_pct,0)/100-coalesce(flat_deduction,0),2)<=0 THEN 'AMOUNT_REVIEW_REQUIRED'
     ELSE 'ELIGIBLE_FOR_ADVANCE_REVIEW' END AS advance_gate
  FROM candidates
 )
 SELECT coalesce(jsonb_agg(to_jsonb(flagged) ORDER BY receipt_at DESC NULLS LAST),'[]'::jsonb) INTO v_rows FROM flagged;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.merchant_id),'[]'::jsonb) INTO v_policies
 FROM public.be_finance_advance_merchant_policy_v1 p WHERE p_merchant_id IS NULL OR p.merchant_id=p_merchant_id;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC),'[]'::jsonb) INTO v_batches
 FROM (SELECT * FROM public.be_finance_advance_batches_v1 WHERE p_merchant_id IS NULL OR merchant_id=p_merchant_id ORDER BY created_at DESC LIMIT 300) b;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),'[]'::jsonb) INTO v_items
 FROM (SELECT i.*,b.batch_number,b.status AS batch_status,q.status AS current_delivery_status
  FROM public.be_finance_advance_items_v1 i
  JOIN public.be_finance_advance_batches_v1 b ON b.id=i.batch_id
  LEFT JOIN public.be_v_finance_merchant_settlement_queue_v2 q ON q.parcel_id=i.parcel_id
  WHERE p_merchant_id IS NULL OR i.merchant_id=p_merchant_id
  ORDER BY i.created_at DESC LIMIT 2000) a;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC),'[]'::jsonb) INTO v_recoveries
 FROM (SELECT r.*,i.delivery_way_id,i.merchant_id,b.batch_number FROM public.be_finance_advance_rto_recoveries_v1 r
 JOIN public.be_finance_advance_items_v1 i ON i.id=r.advance_item_id
 JOIN public.be_finance_advance_batches_v1 b ON b.id=i.batch_id
 WHERE p_merchant_id IS NULL OR i.merchant_id=p_merchant_id
 ORDER BY r.requested_at DESC LIMIT 300) x;
 RETURN jsonb_build_object('ok',true,'build','ADVANCE_SETTLEMENT_UAT_V1','rows',v_rows,
 'policies',v_policies,'batches',v_batches,'items',v_items,'recoveries',v_recoveries,
 'note','Preview never posts COD, transfers cash or marks parcels delivered.');
END $fn$;

-- Signed commercial approval only; disabled by default for every merchant.
CREATE OR REPLACE FUNCTION public.be_finance_advance_set_policy_v1(
 p_merchant_id text,p_enabled boolean,p_rate_pct numeric,p_flat_deduction numeric,
 p_allowed_providers text[],p_contract_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('SUPERADMIN','ADMIN','FINANCE_ADMIN') THEN RAISE EXCEPTION 'Merchant advance contract approval requires Finance Admin / Super Admin'; END IF;
 IF length(btrim(coalesce(p_merchant_id,'')))<2 OR p_rate_pct IS NULL OR p_rate_pct<=0 OR p_rate_pct>100
  OR p_flat_deduction IS NULL OR p_flat_deduction<0
  OR cardinality(coalesce(p_allowed_providers,ARRAY[]::text[]))=0
  OR length(btrim(coalesce(p_contract_ref,'')))<8 THEN
  RAISE EXCEPTION 'Approved merchant, signed fee/rate, provider list and contract evidence required';
 END IF;
 INSERT INTO public.be_finance_advance_merchant_policy_v1
  (merchant_id,enabled,rate_pct,flat_deduction,allowed_providers,approval_reference,approved_by)
 VALUES(upper(btrim(p_merchant_id)),coalesce(p_enabled,false),p_rate_pct,p_flat_deduction,
  p_allowed_providers,btrim(p_contract_ref),auth.uid())
 ON CONFLICT(merchant_id) DO UPDATE SET enabled=excluded.enabled,rate_pct=excluded.rate_pct,
  flat_deduction=excluded.flat_deduction,allowed_providers=excluded.allowed_providers,
  approval_reference=excluded.approval_reference,approved_by=excluded.approved_by,
  approved_at=now(),updated_at=now();
 RETURN jsonb_build_object('ok',true,'merchant_id',upper(btrim(p_merchant_id)),'enabled',coalesce(p_enabled,false),
 'note','Contract policy updated; no parcel settlement or cash payment created');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_create_draft_v1(p_parcel_ids uuid[],p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_merchant text; v_batch uuid; v_count int; v_total numeric; v_expected int; v_row record;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN RAISE EXCEPTION 'Advance draft creator role required'; END IF;
 IF p_parcel_ids IS NULL OR cardinality(p_parcel_ids)=0 OR cardinality(p_parcel_ids)>200 OR cardinality(p_parcel_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_parcel_ids) x)
 THEN RAISE EXCEPTION 'Select 1-200 distinct parcels'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<8 THEN RAISE EXCEPTION 'Document advance payout justification'; END IF;
 PERFORM 1 FROM public.be_data_entry_parcel_details WHERE id=ANY(p_parcel_ids) ORDER BY id FOR UPDATE;
 SELECT count(*),count(distinct x->>'merchant_id'),min(x->>'merchant_id'),coalesce(sum((x->>'proposed_advance')::numeric),0)
 INTO v_count,v_expected,v_merchant,v_total
 FROM jsonb_array_elements(public.be_finance_advance_preview_v1(null,3000)->'rows') x
 WHERE (x->>'parcel_id')::uuid=ANY(p_parcel_ids)
   AND x->>'advance_gate'='ELIGIBLE_FOR_ADVANCE_REVIEW';
 IF v_count<>cardinality(p_parcel_ids) OR v_expected<>1 OR v_total<=0 THEN RAISE EXCEPTION 'Advance eligibility changed, selection is mixed, or parcel set incomplete'; END IF;
 INSERT INTO public.be_finance_advance_batches_v1(merchant_id,total_amount,created_by,reason)
 VALUES(v_merchant,v_total,auth.uid(),btrim(p_reason)) RETURNING id INTO v_batch;
 INSERT INTO public.be_finance_advance_items_v1(batch_id,parcel_id,delivery_way_id,pickup_id,merchant_id,
  service_provider_code,pickup_receipt_at,delivery_status_at_advance,item_price_snapshot,
  rate_pct_snapshot,deduction_snapshot,advance_amount)
 SELECT v_batch,(x->>'parcel_id')::uuid,x->>'delivery_way_id',x->>'pickup_id',x->>'merchant_id',
  x->>'provider_code',(x->>'receipt_at')::timestamptz,x->>'delivery_state',
  (x->>'item_price')::numeric,(x->>'rate_pct')::numeric,
  (x->>'flat_deduction')::numeric,(x->>'proposed_advance')::numeric
 FROM jsonb_array_elements(public.be_finance_advance_preview_v1(v_merchant,3000)->'rows') x
 WHERE (x->>'parcel_id')::uuid=ANY(p_parcel_ids);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>cardinality(p_parcel_ids) THEN RAISE EXCEPTION 'Advance candidate set changed during draft; rolled back'; END IF;
 RETURN jsonb_build_object('ok',true,'batch_id',v_batch,'parcel_count',v_count,'amount',v_total,'status','DRAFT');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_transition_v1(p_batch_id uuid,p_action text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; b public.be_finance_advance_batches_v1%rowtype; v_action text:=upper(btrim(coalesce(p_action,'')));
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 SELECT * INTO b FROM public.be_finance_advance_batches_v1 WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Advance batch not found'; END IF;
 IF length(btrim(coalesce(p_note,'')))<8 THEN RAISE EXCEPTION 'Document review decision'; END IF;
 IF v_action='SUBMIT' AND b.status='DRAFT' AND b.created_by=auth.uid() AND upper(v_role) IN ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN
   UPDATE public.be_finance_advance_batches_v1 SET status='PENDING_APPROVAL',submitted_at=now(),decision_note=p_note,updated_at=now() WHERE id=p_batch_id;
 ELSIF v_action IN ('APPROVE','REJECT') AND b.status='PENDING_APPROVAL'
   AND b.created_by<>auth.uid() AND upper(v_role) IN ('FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') THEN
   UPDATE public.be_finance_advance_batches_v1 SET status=CASE WHEN v_action='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
   approved_by=auth.uid(),approved_at=now(),decision_note=p_note,updated_at=now() WHERE id=p_batch_id;
 ELSE RAISE EXCEPTION 'Invalid advance transition, insufficient role or no independent reviewer'; END IF;
 RETURN jsonb_build_object('ok',true,'batch_id',p_batch_id,'action',v_action);
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_confirm_payment_v1(
 p_batch_id uuid,p_method text,p_reference text,p_account text,p_evidence_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; b public.be_finance_advance_batches_v1%rowtype;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN RAISE EXCEPTION 'Payment officer role required'; END IF;
 SELECT * INTO b FROM public.be_finance_advance_batches_v1 WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR b.status<>'APPROVED' THEN RAISE EXCEPTION 'Independent approval required before recording payout'; END IF;
 IF b.created_by=auth.uid() OR b.approved_by=auth.uid() THEN RAISE EXCEPTION 'Payout recorder must be independent of creator and approver'; END IF;
 IF length(btrim(coalesce(p_reference,'')))<4 OR upper(btrim(coalesce(p_method,''))) NOT IN
   ('CASH','BANK_TRANSFER','KBZ_PAY','AYA_PAY','WAVE_PAY','CB_PAY','CHEQUE','OTHER')
   OR coalesce(p_evidence_url,'') NOT LIKE 'https://%' OR length(btrim(coalesce(p_evidence_url,'')))<16
   THEN RAISE EXCEPTION 'Actual payment reference, supported method and secure evidence URL required'; END IF;
 IF upper(btrim(p_method)) IN ('BANK_TRANSFER','CHEQUE') AND nullif(btrim(coalesce(p_account,'')),'') IS NULL THEN
   RAISE EXCEPTION 'Bank transfer requires merchant beneficiary account'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(p_reference)),200));
 IF EXISTS (SELECT 1 FROM public.be_finance_advance_batches_v1 x
     WHERE lower(btrim(coalesce(x.payment_reference,'')))=lower(btrim(p_reference)))
    OR EXISTS (SELECT 1 FROM public.be_finance_settlement_payments_v3 x
     WHERE lower(btrim(coalesce(x.payment_reference,'')))=lower(btrim(p_reference))
        OR lower(btrim(coalesce(x.payment_group_reference,'')))=lower(btrim(p_reference)))
    OR EXISTS (SELECT 1 FROM public.be_finance_advance_rto_recoveries_v1 x
     WHERE lower(btrim(coalesce(x.receipt_reference,'')))=lower(btrim(p_reference))) THEN
   RAISE EXCEPTION 'Transfer reference already used by a Finance payment or refund';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.be_finance_advance_merchant_policy_v1 p
    WHERE p.merchant_id=b.merchant_id AND p.enabled) THEN
   RAISE EXCEPTION 'Merchant advance authorization was revoked before payout'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.be_finance_advance_items_v1 i
   LEFT JOIN public.be_v_finance_merchant_settlement_queue_v2 q ON q.parcel_id=i.parcel_id
   LEFT JOIN public.be_finance_settlement_parcel_control_v3 c ON c.parcel_id=i.parcel_id
   WHERE i.batch_id=b.id AND (
      q.parcel_id IS NULL OR q.validation_status<>'OK' OR coalesce(c.financial_hold,false)
      OR upper(coalesce(q.status,'')) LIKE 'RTO%'
      OR upper(coalesce(q.status,'')) IN ('RETURN_TO_SENDER','RETURNED_TO_ORIGIN','CANCELLED','CANCELED')
      OR EXISTS (SELECT 1 FROM public.be_finance_settlement_disputes_v3 d
        WHERE d.parcel_id=i.parcel_id AND d.status NOT IN ('RESOLVED','REJECTED','CLOSED'))
      OR EXISTS (SELECT 1 FROM public.be_finance_settlement_batch_items_v3 z
        JOIN public.be_finance_settlement_batches_v3 sb ON sb.id=z.batch_id
        WHERE z.parcel_id=i.parcel_id
          AND (z.active OR sb.status IN ('PAID','PARTIALLY_PAID','PAYMENT_PROCESSING')
            OR sb.payment_status IN ('PAID','PARTIALLY_PAID','PROCESSING')))
      OR q.financial_settled_at IS NOT NULL OR q.settlement_state='SETTLED'
   )
 ) THEN RAISE EXCEPTION 'Parcel eligibility, hold, delivery, or normal settlement state changed before advance payout'; END IF;
 UPDATE public.be_finance_advance_batches_v1 SET status='DISBURSED',payment_by=auth.uid(),paid_at=now(),
 payment_method=p_method,payment_reference=p_reference,payment_account=p_account,payment_evidence_url=p_evidence_url,
 updated_at=now() WHERE id=p_batch_id;
 RETURN jsonb_build_object('ok',true,'batch_id',p_batch_id,'status','DISBURSED','amount',b.total_amount,
   'note','External merchant transfer recorded; COD and delivery state unchanged');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_flag_rto_v1(p_advance_item_id uuid,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; i public.be_finance_advance_items_v1%rowtype; b public.be_finance_advance_batches_v1%rowtype;
 v_delivery_status text;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN RAISE EXCEPTION 'Finance creator role required'; END IF;
 SELECT * INTO i FROM public.be_finance_advance_items_v1 WHERE id=p_advance_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Advance parcel missing'; END IF;
 SELECT * INTO b FROM public.be_finance_advance_batches_v1 WHERE id=i.batch_id;
 IF b.status<>'DISBURSED' THEN RAISE EXCEPTION 'Refund requires an actually paid advance'; END IF;
 SELECT upper(coalesce(q.status,'')) INTO v_delivery_status FROM public.be_v_finance_merchant_settlement_queue_v2 q WHERE q.parcel_id=i.parcel_id;
 IF coalesce(v_delivery_status,'') NOT LIKE 'RTO%' AND v_delivery_status NOT IN ('RETURN_TO_SENDER','RETURNED_TO_ORIGIN') THEN RAISE EXCEPTION 'Current parcel status is not verified RTO'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>i.advance_amount OR length(btrim(coalesce(p_reason,'')))<8 THEN RAISE EXCEPTION 'Recovery amount must be positive, within paid advance and justified'; END IF;
 INSERT INTO public.be_finance_advance_rto_recoveries_v1(advance_item_id,amount,reason,requested_by)
 VALUES(i.id,p_amount,btrim(p_reason));
 RETURN jsonb_build_object('ok',true,'delivery_way_id',i.delivery_way_id,'status','REFUND_DUE','refund_amount',p_amount);
END $fn$;


CREATE OR REPLACE FUNCTION public.be_finance_advance_review_rto_v1(p_recovery_id uuid,p_action text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; r public.be_finance_advance_rto_recoveries_v1%rowtype;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') THEN RAISE EXCEPTION 'Independent Finance approval required'; END IF;
 SELECT * INTO r FROM public.be_finance_advance_rto_recoveries_v1 WHERE id=p_recovery_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('REFUND_DUE','UNDER_REVIEW') THEN RAISE EXCEPTION 'RTO recovery is not reviewable'; END IF;
 IF r.requested_by=auth.uid() THEN RAISE EXCEPTION 'Creator cannot approve their own refund recovery'; END IF;
 IF upper(coalesce(p_action,'')) NOT IN ('APPROVE','WAIVE')
 OR length(btrim(coalesce(p_note,'')))<8 THEN RAISE EXCEPTION 'Approve or waive with documented reason'; END IF;
 UPDATE public.be_finance_advance_rto_recoveries_v1
 SET status=CASE WHEN upper(p_action)='APPROVE' THEN 'APPROVED' ELSE 'WAIVED' END,
 reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note WHERE id=p_recovery_id;
 RETURN jsonb_build_object('ok',true,'recovery_id',p_recovery_id,'status',CASE WHEN upper(p_action)='APPROVE' THEN 'APPROVED' ELSE 'WAIVED' END);
END $fn$;

CREATE OR REPLACE FUNCTION public.be_finance_advance_confirm_refund_v1(
 p_recovery_id uuid,p_method text,p_reference text,p_evidence_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; r public.be_finance_advance_rto_recoveries_v1%rowtype;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(v_role) NOT IN ('PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN RAISE EXCEPTION 'Finance payment officer required'; END IF;
 SELECT * INTO r FROM public.be_finance_advance_rto_recoveries_v1 WHERE id=p_recovery_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'APPROVED' THEN RAISE EXCEPTION 'Refund requires independent approval'; END IF;
 IF r.requested_by=auth.uid() OR r.reviewed_by=auth.uid() THEN RAISE EXCEPTION 'Refund receiver must be independent of requester and approver'; END IF;
 IF length(btrim(coalesce(p_reference,'')))<4 OR length(btrim(coalesce(p_method,'')))<3
 OR coalesce(p_evidence_url,'') NOT LIKE 'https://%' OR length(btrim(coalesce(p_evidence_url,'')))<16
 THEN RAISE EXCEPTION 'Verified refund receipt and reference required'; END IF;
 UPDATE public.be_finance_advance_rto_recoveries_v1
 SET status='REFUND_RECEIVED',received_by=auth.uid(),received_at=now(),
 receipt_method=p_method,receipt_reference=p_reference,receipt_evidence_url=p_evidence_url
 WHERE id=p_recovery_id;
 RETURN jsonb_build_object('ok',true,'recovery_id',p_recovery_id,'status','REFUND_RECEIVED','amount',r.amount,
 'note','External refund receipt recorded; original advance remains immutable');
END $fn$;

-- Prevent duplicate normal settlement until dedicated advance-offset reconciliation exists.
CREATE OR REPLACE FUNCTION public.be_finance_advance_legacy_batch_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $fn$
BEGIN
 IF EXISTS (SELECT 1 FROM public.be_finance_advance_items_v1 i
            JOIN public.be_finance_advance_batches_v1 b ON b.id=i.batch_id
            WHERE i.parcel_id=NEW.parcel_id AND b.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISBURSED')) THEN
   RAISE EXCEPTION 'ADVANCE_SETTLEMENT_RECONCILIATION_REQUIRED: parcel % already has an advance entry',NEW.delivery_way_id;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS be_finance_advance_legacy_batch_guard_v1 ON public.be_finance_settlement_batch_items_v3;
CREATE TRIGGER be_finance_advance_legacy_batch_guard_v1
BEFORE INSERT ON public.be_finance_settlement_batch_items_v3
FOR EACH ROW EXECUTE FUNCTION public.be_finance_advance_legacy_batch_guard_v1();

-- Legacy Finance V2 writes a separate parcel ledger, bypassing V3 batch items.
-- Do not allow it to finalize an advanced way as if no merchant advance existed.
CREATE OR REPLACE FUNCTION public.be_finance_advance_v2_ledger_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $fn$
BEGIN
 IF EXISTS (
   SELECT 1
   FROM public.be_finance_advance_items_v1 i
   JOIN public.be_finance_advance_batches_v1 b ON b.id=i.batch_id
   WHERE b.status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISBURSED')
     AND (
      (NEW.parcel_id IS NOT NULL AND NEW.parcel_id=i.parcel_id::text)
      OR (NULLIF(btrim(NEW.way_id),'') IS NOT NULL
         AND upper(btrim(NEW.way_id))=upper(btrim(i.delivery_way_id)))
     )
 ) THEN
   RAISE EXCEPTION 'ADVANCE_SETTLEMENT_RECONCILIATION_REQUIRED_V2: way % cannot bypass the advance ledger',NEW.way_id;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS be_finance_advance_v2_ledger_guard_v1 ON public.be_parcel_settlement_ledger_v2;
CREATE TRIGGER be_finance_advance_v2_ledger_guard_v1
BEFORE INSERT ON public.be_parcel_settlement_ledger_v2
FOR EACH ROW EXECUTE FUNCTION public.be_finance_advance_v2_ledger_guard_v1();
REVOKE ALL ON FUNCTION public.be_finance_advance_v2_ledger_guard_v1() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.be_finance_advance_preview_v1(text,integer),
 public.be_finance_advance_set_policy_v1(text,boolean,numeric,numeric,text[],text),
 public.be_finance_advance_create_draft_v1(uuid[],text),
 public.be_finance_advance_transition_v1(uuid,text,text),
 public.be_finance_advance_confirm_payment_v1(uuid,text,text,text,text),
 public.be_finance_advance_flag_rto_v1(uuid,numeric,text),
 public.be_finance_advance_review_rto_v1(uuid,text,text),
 public.be_finance_advance_confirm_refund_v1(uuid,text,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_finance_advance_preview_v1(text,integer),
 public.be_finance_advance_set_policy_v1(text,boolean,numeric,numeric,text[],text),
 public.be_finance_advance_create_draft_v1(uuid[],text),
 public.be_finance_advance_transition_v1(uuid,text,text),
 public.be_finance_advance_confirm_payment_v1(uuid,text,text,text,text),
 public.be_finance_advance_flag_rto_v1(uuid,numeric,text),
 public.be_finance_advance_review_rto_v1(uuid,text,text),
 public.be_finance_advance_confirm_refund_v1(uuid,text,text,text)
TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.be_finance_advance_legacy_batch_guard_v1() FROM PUBLIC,anon,authenticated;


-- SECTION 2 merchant_advance_final_reconciliation_preview_v1_UAT_ONLY.sql
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


-- SECTION 3 merchant_advance_accounting_bridge_v1_UAT_ONLY.sql
-- Britium Express | UAT only: Merchant advance payout / refund journal bridge v1
-- INSTALL AFTER merchant_advance_settlement_v1_UAT_ONLY.sql.
-- No external bank transfer. Draft events enter REVIEW_PENDING, not posted journals.
-- Cash/bank accounts follow existing private.be_merchant_payment_accounting_v200.
BEGIN;
ALTER TABLE public.be_finance_advance_batches_v1
 ADD COLUMN IF NOT EXISTS accounting_event_id uuid UNIQUE;
ALTER TABLE public.be_finance_advance_rto_recoveries_v1
 ADD COLUMN IF NOT EXISTS accounting_event_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION private.be_finance_advance_accounting_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_type text;
 v_account_asset uuid;
 v_account_funds uuid;
 v_event jsonb;
 v_event_id uuid;
 v_funds_code text;
 v_amount numeric;
 v_method text;
 v_reference text;
 v_merchant text;
 v_snapshot jsonb;
BEGIN
 IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME = 'be_finance_advance_batches_v1' THEN
   IF NEW.status <> 'DISBURSED' THEN RETURN NEW; END IF;
   v_type:='MERCHANT_ADVANCE_DISBURSED';
   v_amount:=NEW.total_amount;
   v_method:=upper(btrim(coalesce(NEW.payment_method,'')));
   v_reference:=btrim(coalesce(NEW.payment_reference,''));
   v_merchant:=NEW.merchant_id;
   v_snapshot:=to_jsonb(NEW);
 ELSIF TG_TABLE_NAME = 'be_finance_advance_rto_recoveries_v1' THEN
   IF NEW.status <> 'REFUND_RECEIVED' THEN RETURN NEW; END IF;
   v_type:='MERCHANT_ADVANCE_REFUND_RECEIVED';
   v_amount:=NEW.amount;
   v_method:=upper(btrim(coalesce(NEW.receipt_method,'')));
   v_reference:=btrim(coalesce(NEW.receipt_reference,''));
   SELECT i.merchant_id INTO v_merchant
   FROM public.be_finance_advance_items_v1 i WHERE i.id=NEW.advance_item_id;
   v_snapshot:=to_jsonb(NEW);
 ELSE RETURN NEW;
 END IF;
 IF v_amount IS NULL OR v_amount<=0 OR v_amount<>round(v_amount,2) OR length(v_reference)<4 THEN
   RAISE EXCEPTION 'Advance accounting requires exact signed amount and external transfer evidence';
 END IF;
 IF v_method NOT IN ('CASH','BANK_TRANSFER','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','CHEQUE','OTHER') THEN
   RAISE EXCEPTION 'Unsupported advance payment method';
 END IF;
 v_funds_code:=CASE WHEN v_method='CASH' THEN '111001' ELSE '112003' END;
 SELECT id INTO v_account_asset FROM public.be_chart_of_accounts
 WHERE account_code='114004' AND is_active AND is_postable;
 SELECT id INTO v_account_funds FROM public.be_chart_of_accounts
 WHERE account_code=v_funds_code AND is_active AND is_postable;
 IF v_account_asset IS NULL OR v_account_funds IS NULL OR v_merchant IS NULL THEN
   RAISE EXCEPTION 'Merchant advance accounting accounts or merchant missing';
 END IF;
 v_event:=public.be_accounting_upsert_event_v1(
  'MERCHANT_ADVANCE',
  TG_TABLE_NAME,
  NEW.id::text,
  v_type,
  'MERCHANT_ADVANCE_V1',
  (now() AT TIME ZONE 'Asia/Yangon')::date,
  v_type||' / '||v_reference,
  'MMK',v_amount,
  v_snapshot||jsonb_build_object('source_reference',v_reference,'merchant_id',v_merchant),
  md5(v_snapshot::text),
  'REVIEW_PENDING',
  now(),
  jsonb_build_object('merchant_id',v_merchant,'reference',v_reference)
 );
 IF coalesce((v_event->>'ok')::boolean,false) IS NOT TRUE THEN
   RAISE EXCEPTION 'Advance accounting event failed: %',v_event;
 END IF;
 v_event_id:=(v_event->>'event_id')::uuid;
 IF v_event_id IS NULL THEN RAISE EXCEPTION 'Advance event creation did not return event ID'; END IF;
 IF v_type='MERCHANT_ADVANCE_DISBURSED' THEN
  INSERT INTO public.be_accounting_event_lines(
   event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
  ) VALUES
   (v_event_id,v_account_asset,10,v_amount,0,v_merchant,'Merchant advance receivable',jsonb_build_object('reference',v_reference)),
   (v_event_id,v_account_funds,20,0,v_amount,v_merchant,'Merchant advance paid externally',jsonb_build_object('reference',v_reference));
  UPDATE public.be_finance_advance_batches_v1 SET accounting_event_id=v_event_id WHERE id=NEW.id;
 ELSE
  INSERT INTO public.be_accounting_event_lines(
   event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
  ) VALUES
   (v_event_id,v_account_funds,10,v_amount,0,v_merchant,'Merchant advance refund actually received',jsonb_build_object('reference',v_reference)),
   (v_event_id,v_account_asset,20,0,v_amount,v_merchant,'Reduce merchant advance receivable',jsonb_build_object('reference',v_reference));
  UPDATE public.be_finance_advance_rto_recoveries_v1 SET accounting_event_id=v_event_id WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS be_finance_advance_disbursed_accounting_v1 ON public.be_finance_advance_batches_v1;
CREATE TRIGGER be_finance_advance_disbursed_accounting_v1
AFTER UPDATE OF status ON public.be_finance_advance_batches_v1
FOR EACH ROW EXECUTE FUNCTION private.be_finance_advance_accounting_v1();

DROP TRIGGER IF EXISTS be_finance_advance_refund_received_accounting_v1 ON public.be_finance_advance_rto_recoveries_v1;
CREATE TRIGGER be_finance_advance_refund_received_accounting_v1
AFTER UPDATE OF status ON public.be_finance_advance_rto_recoveries_v1
FOR EACH ROW EXECUTE FUNCTION private.be_finance_advance_accounting_v1();
REVOKE ALL ON FUNCTION private.be_finance_advance_accounting_v1() FROM PUBLIC,anon,authenticated;


-- SECTION 4 merchant_advance_final_offset_review_v1_UAT_ONLY.sql
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


-- SECTION 5 merchant_advance_payable_accrual_readiness_v1_UAT_ONLY.sql
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

-- SECTION 6 merchant_advance_offset_accounting_event_v1
-- Install AFTER 10_merchant_advance_install_UAT_only.sql.
-- This stages a balanced Dr Merchant Settlement Payable / Cr Merchant Advances event.
-- It DOES NOT mark a parcel settled, pay cash, or automatically post any journal.
-- Accounting review/posting must use existing independent Finance controls.
-- Any attempt to POST this event revalidates live merchant/parcel/accounting evidence.
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
