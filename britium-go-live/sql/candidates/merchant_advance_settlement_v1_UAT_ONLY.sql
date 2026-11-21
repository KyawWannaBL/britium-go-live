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
   exists(select 1 from public.be_finance_settlement_batch_items_v3 z where z.parcel_id=d.id AND z.active) AS regular_batch,
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
     WHEN regular_batch THEN 'ALREADY_IN_NORMAL_SETTLEMENT'
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
 IF length(btrim(coalesce(p_reference,'')))<4 OR length(btrim(coalesce(p_method,'')))<3
  OR p_evidence_url !~ '^https://[^[:space:]]{8,2000}$' THEN RAISE EXCEPTION 'Actual payment reference, method and secure evidence URL required'; END IF;
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
COMMIT;
