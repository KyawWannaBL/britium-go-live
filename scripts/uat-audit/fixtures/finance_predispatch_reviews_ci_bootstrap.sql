-- Disposable CI only. Catalog-verified original Finance pre-dispatch reviews.
-- No finance decisions, identities, or customer data are inserted.
CREATE TABLE IF NOT EXISTS public.be_finance_predispatch_reviews_v1 (
 delivery_way_id text PRIMARY KEY,
 pickup_id text NOT NULL,
 parcel_sequence integer,
 merchant_code text,
 merchant_name text,
 payment_type text NOT NULL,
 declared_item_value numeric NOT NULL DEFAULT 0,
 delivery_region text,
 cod_requested boolean NOT NULL DEFAULT false,
 cod_policy_status text NOT NULL,
 cod_service_fee_rate numeric NOT NULL DEFAULT 0,
 cod_service_fee_amount numeric NOT NULL DEFAULT 0,
 finance_status text NOT NULL,
 finance_required boolean NOT NULL DEFAULT false,
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text,
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS be_finance_predispatch_pickup_idx
 ON public.be_finance_predispatch_reviews_v1 (pickup_id,finance_status);
CREATE INDEX IF NOT EXISTS be_finance_predispatch_merchant_idx
 ON public.be_finance_predispatch_reviews_v1 (merchant_code,created_at DESC);
CREATE INDEX IF NOT EXISTS be_finance_predispatch_status_idx
 ON public.be_finance_predispatch_reviews_v1 (finance_status,updated_at DESC);
ALTER TABLE public.be_finance_predispatch_reviews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_predispatch_reviews_v1 FROM PUBLIC, anon, authenticated;
-- The original review select policy is governed by be_accounting_can_v1.
CREATE POLICY be_finance_predispatch_select_v1
 ON public.be_finance_predispatch_reviews_v1
 FOR SELECT TO authenticated
 USING (public.be_accounting_can_v1('finance_entry')
     OR public.be_accounting_can_v1('finance_review')
     OR public.be_accounting_can_v1('financial_reports')
     OR public.be_accounting_can_v1('ledger_admin'));
