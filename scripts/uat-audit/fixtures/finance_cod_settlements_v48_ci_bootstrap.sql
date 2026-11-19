-- DISPOSABLE CI ONLY: verified original canonical COD settlement ledger.
-- No financial data, settlement confirmations, or authentication records are copied.
CREATE TABLE IF NOT EXISTS public.be_finance_cod_settlements_v48 (
 delivery_way_id text PRIMARY KEY,
 wayplan_id text NOT NULL,
 pickup_id text,
 batch_waybill_no text,
 rider_code text,
 rider_name text,
 driver_code text,
 driver_name text,
 recipient_name text,
 recipient_phone text,
 township text,
 expected_cod numeric NOT NULL DEFAULT 0,
 reported_collected numeric NOT NULL DEFAULT 0,
 rider_remittance numeric NOT NULL DEFAULT 0,
 settled_amount numeric NOT NULL DEFAULT 0,
 delivery_fee numeric NOT NULL DEFAULT 0,
 item_value numeric NOT NULL DEFAULT 0,
 payment_mode text NOT NULL DEFAULT 'UNSPECIFIED',
 proof_status text NOT NULL DEFAULT 'MISSING'
  CONSTRAINT be_finance_cod_settlements_v48_proof_check
  CHECK (proof_status IN ('MISSING','AVAILABLE','VERIFIED','WAIVED')),
 proof_reference text,
 settlement_status text NOT NULL DEFAULT 'PENDING_REMITTANCE'
  CONSTRAINT be_finance_cod_settlements_v48_status_check
  CHECK (settlement_status IN ('PENDING_REMITTANCE','PENDING_PROOF','READY_TO_SETTLE','ON_HOLD','SETTLED','NOT_REQUIRED','VOID')),
 variance_type text NOT NULL DEFAULT 'MISSING_REMITTANCE'
  CONSTRAINT be_finance_cod_settlements_v48_variance_check
  CHECK (variance_type IN ('NONE','SHORTAGE','OVERAGE','MISSING_REMITTANCE','MISSING_PROOF','PAYMENT_MISMATCH','DUPLICATE_POSTING','OTHER')),
 variance_amount numeric NOT NULL DEFAULT 0,
 remittance_reference text,
 remittance_receiver text,
 remitted_at timestamptz,
 hold_code text,
 hold_note text,
 held_by text,
 held_at timestamptz,
 settlement_reference text,
 settlement_receiver text,
 settlement_note text,
 settled_by text,
 settled_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS be_finance_cod_settlements_v48_status_idx
 ON public.be_finance_cod_settlements_v48(settlement_status,delivered_at DESC);
CREATE INDEX IF NOT EXISTS be_finance_cod_v48_upper_waybill_idx
 ON public.be_finance_cod_settlements_v48(upper(delivery_way_id));
ALTER TABLE public.be_finance_cod_settlements_v48 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_cod_settlements_v48 FROM PUBLIC,anon,authenticated;
