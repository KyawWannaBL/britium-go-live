-- DISPOSABLE CI ONLY. Canonical merchant settlement items and payments V3.
-- Restored from production PostgreSQL catalog with no customer or financial records.
-- Neither table grants browser access; preserve RLS on both.
CREATE TABLE IF NOT EXISTS public.be_finance_settlement_batch_items_v3 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.be_finance_settlement_batches_v3(id) ON DELETE CASCADE,
 parcel_id uuid NOT NULL,
 delivery_way_id text NOT NULL,
 merchant_id text NOT NULL,
 merchant_name text,
 delivered_date date,
 recipient_name text,
 destination text,
 customer_tier text,
 amount_entry_type text,
 item_price numeric(18,2),
 merchant_declared_delivery numeric(18,2),
 customer_total_collection numeric(18,2) NOT NULL DEFAULT 0,
 net_system_delivery_charge numeric(18,2) NOT NULL DEFAULT 0,
 delivery_difference numeric(18,2),
 settlement_direction text,
 other_merchant_credits numeric(18,2) NOT NULL DEFAULT 0,
 merchant_payable_charges numeric(18,2) NOT NULL DEFAULT 0,
 merchant_final_settlement_amount numeric(18,2),
 validation_status text,
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 removed_at timestamptz,
 removed_by text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS be_finance_settlement_batch_items_v3_active_uidx
 ON public.be_finance_settlement_batch_items_v3(parcel_id) WHERE active;
CREATE INDEX IF NOT EXISTS be_finance_settlement_batch_items_v3_batch_idx
 ON public.be_finance_settlement_batch_items_v3(batch_id,active,delivery_way_id);

CREATE TABLE IF NOT EXISTS public.be_finance_settlement_payments_v3 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.be_finance_settlement_batches_v3(id),
 amount numeric(18,2) NOT NULL
  CONSTRAINT be_finance_settlement_payments_v3_amount_check CHECK (amount > 0),
 payment_date date NOT NULL DEFAULT CURRENT_DATE,
 payment_method text,
 payment_reference text,
 bank_account text,
 evidence_url text,
 status text NOT NULL DEFAULT 'PROCESSING'
  CONSTRAINT be_finance_settlement_payments_v3_status_check
  CHECK (status IN ('SCHEDULED','PROCESSING','CONFIRMED','FAILED','REVERSED')),
 entered_by text,
 confirmed_by text,
 confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS be_finance_settlement_payments_v3_batch_idx
 ON public.be_finance_settlement_payments_v3(batch_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS be_finance_settlement_payments_v3_ref_uidx
 ON public.be_finance_settlement_payments_v3(payment_reference)
 WHERE payment_reference IS NOT NULL AND btrim(payment_reference)<>'';

ALTER TABLE public.be_finance_settlement_batch_items_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_finance_settlement_payments_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_settlement_batch_items_v3,public.be_finance_settlement_payments_v3 FROM PUBLIC,anon,authenticated;
-- V200 adds the later payment_group_reference and accounting_event_id columns.

-- Production-catalog-verified finance parcel hold control (empty in CI).
CREATE TABLE IF NOT EXISTS public.be_finance_settlement_parcel_control_v3 (
 parcel_id uuid PRIMARY KEY,
 delivery_way_id text,
 financial_hold boolean NOT NULL DEFAULT false,
 hold_reason text,
 hold_by text,
 hold_at timestamptz,
 exact_collection_resolution jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_finance_settlement_parcel_control_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_settlement_parcel_control_v3 FROM PUBLIC,anon,authenticated;
