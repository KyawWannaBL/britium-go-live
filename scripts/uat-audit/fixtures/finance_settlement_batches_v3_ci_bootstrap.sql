-- Disposable CI ONLY. Production-catalog-verified settlement batch schema.
-- Ledger rows, payment records and approvals are not copied or seeded.
CREATE TABLE IF NOT EXISTS public.be_finance_settlement_batches_v3 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_number text NOT NULL UNIQUE,
 merchant_id text NOT NULL,
 merchant_name text,
 period_from date,
 period_to date,
 planned_payment_date date,
 status text NOT NULL DEFAULT 'DRAFT'
   CONSTRAINT be_finance_settlement_batches_v3_status_check
   CHECK (status IN ('DRAFT','UNDER_REVIEW','PENDING_APPROVAL','APPROVED','PAYMENT_PROCESSING','PAID','PARTIALLY_PAID','REJECTED','CANCELLED','REOPENED')),
 payment_status text NOT NULL DEFAULT 'UNPAID'
   CONSTRAINT be_finance_settlement_batches_v3_payment_status_check
   CHECK (payment_status IN ('UNPAID','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID','FAILED','REVERSED')),
 payment_method text,
 merchant_bank_account text,
 finance_remarks text,
 customer_collection numeric(18,2) NOT NULL DEFAULT 0,
 item_value numeric(18,2) NOT NULL DEFAULT 0,
 company_delivery_revenue numeric(18,2) NOT NULL DEFAULT 0,
 delivery_excess_credit numeric(18,2) NOT NULL DEFAULT 0,
 delivery_shortfall_deduction numeric(18,2) NOT NULL DEFAULT 0,
 batch_credits numeric(18,2) NOT NULL DEFAULT 0,
 batch_deductions numeric(18,2) NOT NULL DEFAULT 0,
 advance_recovery numeric(18,2) NOT NULL DEFAULT 0,
 withholding_tax numeric(18,2) NOT NULL DEFAULT 0,
 parcel_settlement_total numeric(18,2) NOT NULL DEFAULT 0,
 batch_net_payable numeric(18,2) NOT NULL DEFAULT 0,
 paid_amount numeric(18,2) NOT NULL DEFAULT 0,
 outstanding_amount numeric(18,2) NOT NULL DEFAULT 0,
 created_by_uid uuid,
 created_by text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by text,
 reviewed_at timestamptz,
 approved_by text,
 approved_at timestamptz,
 rejected_by text,
 rejected_at timestamptz,
 paid_by text,
 paid_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 legacy_finalize_result jsonb
);
CREATE INDEX IF NOT EXISTS be_finance_settlement_batches_v3_merchant_idx
 ON public.be_finance_settlement_batches_v3(merchant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS be_finance_settlement_batches_v3_status_idx
 ON public.be_finance_settlement_batches_v3(status,payment_status,created_at DESC);
ALTER TABLE public.be_finance_settlement_batches_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_settlement_batches_v3 FROM PUBLIC,anon,authenticated;
