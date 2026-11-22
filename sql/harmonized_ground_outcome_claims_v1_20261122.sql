-- UAT-only proposal: ground truth is an evidence CLAIM, never a confirmed operational event.
-- No automatic delivery, RTO, COD settlement or payment writes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_parcel_ground_outcome_claims_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_delivery_way_id text NOT NULL CHECK(length(btrim(original_delivery_way_id))>0),
  reported_outcome text NOT NULL CHECK (reported_outcome IN
    ('DELIVERED','RTO_MERCHANT_RECEIVED','RETURN_IN_TRANSIT','FAILED_ATTEMPT',
     'PENDING_WAREHOUSE','PENDING_PROVIDER','PENDING_NEXT_ATTEMPT',
     'CANCELLED_WITH_PROOF','UNKNOWN_DISPUTED')),
  provider_code text,
  branch_code text,
  external_tracking_reference text,
  source_document_reference text NOT NULL CHECK(length(btrim(source_document_reference))>0),
  evidence_storage_path text,
  observed_at timestamptz,
  reported_by_user_id uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  claimed_cod_collected_mmk numeric(15,2) CHECK (claimed_cod_collected_mmk >= 0),
  claimed_provider_charge_mmk numeric(15,2) CHECK (claimed_provider_charge_mmk >= 0),
  claimed_gate_charge_mmk numeric(15,2) CHECK (claimed_gate_charge_mmk >= 0),
  source_fingerprint text NOT NULL UNIQUE,
  review_state text NOT NULL DEFAULT 'UNREVIEWED'
    CHECK(review_state IN ('UNREVIEWED','NEEDS_EVIDENCE','VERIFIED','REJECTED','CONFLICT')),
  reviewer_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  CHECK (review_state NOT IN ('VERIFIED','REJECTED','CONFLICT') OR
     (reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL
       AND reviewer_user_id <> reported_by_user_id)),
  CHECK (observed_at IS NULL OR observed_at <= submitted_at + interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS be_ground_claims_way_idx ON public.be_parcel_ground_outcome_claims_v1(original_delivery_way_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS be_ground_claims_review_idx ON public.be_parcel_ground_outcome_claims_v1(review_state,submitted_at DESC);
ALTER TABLE public.be_parcel_ground_outcome_claims_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_ground_outcome_claims_v1 FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.be_parcel_ground_outcome_claims_v1 IS
 'Evidence intake proposals only. No client grants until approved maker/checker RPC and region-scoped RLS. Never infer status or financial posting from claims.';
COMMIT;
