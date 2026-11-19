-- Disposable CI only: production-catalog-verified private ground settlement confirmations.
-- No settlement, verification or confirmation records are seeded.
CREATE TABLE IF NOT EXISTS private.be_ground_settlement_confirmations_v1 (
 source_sha256 text NOT NULL,
 delivery_way_id text NOT NULL,
 confirmation_no text NOT NULL UNIQUE,
 source_sheet text NOT NULL,
 source_row integer NOT NULL,
 ground_business_date date NOT NULL,
 ground_final_cod_mmk numeric(18,2),
 ground_cash_mmk numeric(18,2),
 ground_kpay_mmk numeric(18,2),
 source_check text NOT NULL,
 ground_status text NOT NULL DEFAULT 'MANAGEMENT_REPORTED_SETTLED',
 finance_status text NOT NULL DEFAULT 'PENDING_FINANCE_RECONCILIATION',
 ground_recorded_at timestamptz NOT NULL DEFAULT now(),
 finance_verified_by uuid,
 finance_verified_at timestamptz,
 finance_payment_reference text,
 finance_note text,
 CONSTRAINT be_ground_settlement_confirmations_v1_pkey PRIMARY KEY(source_sha256,delivery_way_id),
 CONSTRAINT be_gsc_finance_proof_ck CHECK (finance_status <> 'FINANCE_RECEIPT_VERIFIED' OR (finance_verified_by IS NOT NULL AND finance_verified_at IS NOT NULL AND length(btrim(coalesce(finance_payment_reference,'')))>=6)),
 CONSTRAINT be_gsc_finance_status_ck CHECK (finance_status IN ('PENDING_FINANCE_RECONCILIATION','FINANCE_RECEIPT_VERIFIED')),
 CONSTRAINT be_gsc_ground_status_ck CHECK (ground_status='MANAGEMENT_REPORTED_SETTLED')
);
ALTER TABLE private.be_ground_settlement_confirmations_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_ground_settlement_confirmations_v1 FROM PUBLIC,anon,authenticated;
