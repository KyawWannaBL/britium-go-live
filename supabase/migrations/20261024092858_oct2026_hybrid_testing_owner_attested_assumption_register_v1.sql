
CREATE TABLE IF NOT EXISTS private.be_oct20_22_hybrid_assumptions_v1 (
 delivery_way_id text PRIMARY KEY,
 ground_business_date date NOT NULL CHECK (ground_business_date BETWEEN '2026-10-20'::date AND '2026-10-22'::date),
 scan_evidence_kind text NOT NULL,
 recorded_delivery_evidence text NOT NULL,
 warehouse_stage text NOT NULL DEFAULT 'ASSUMED_COMPLETE_FOR_HYBRID_TEST',
 operations_stage text NOT NULL DEFAULT 'ASSUMED_COMPLETE_FOR_HYBRID_TEST',
 customer_service_stage text NOT NULL DEFAULT 'ASSUMED_COMPLETE_FOR_HYBRID_TEST',
 downstream_stage text NOT NULL DEFAULT 'READY_FOR_FINANCE_TEST_RECONCILIATION',
 actual_cash_receipt_verified boolean NOT NULL DEFAULT false,
 actual_financial_settlement_posted boolean NOT NULL DEFAULT false,
 completion_basis text NOT NULL DEFAULT 'OWNER_SUPERADMIN_ATTESTED_GROUND_WORK_COMPLETE; HYBRID TEST ASSUMPTION ONLY',
 source_final_cod_mmk numeric,
 source_cash_mmk numeric,
 source_kpay_mmk numeric,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.be_oct20_22_hybrid_assumptions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.be_oct20_22_hybrid_assumptions_v1 FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS private.be_oct20_22_hybrid_workitem_snapshot_v1 (
 work_item_id uuid PRIMARY KEY,
 original_record jsonb NOT NULL,
 hybrid_closeout_basis text NOT NULL DEFAULT 'OWNER_SUPERADMIN_ATTESTED_FOR_HYBRID_TEST_ONLY',
 snapshot_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.be_oct20_22_hybrid_workitem_snapshot_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.be_oct20_22_hybrid_workitem_snapshot_v1 FROM PUBLIC,anon,authenticated;
