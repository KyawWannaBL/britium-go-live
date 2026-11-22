-- UAT access gate for evidence claims: initial elevated-account release only.
-- Depends on harmonized_ground_outcome_claims_v1_20261122.sql.
-- No direct warehouse, delivery, provider-custody or finance mutation.
BEGIN;

-- Defensively enforce review/claim separation even against column update grants.
CREATE OR REPLACE FUNCTION public.be_ground_claim_review_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
BEGIN
 IF ROW(NEW.original_delivery_way_id,NEW.reported_outcome,NEW.provider_code,
   NEW.branch_code,NEW.external_tracking_reference,NEW.source_document_reference,
   NEW.evidence_storage_path,NEW.observed_at,NEW.reported_by_user_id,
   NEW.submitted_at,NEW.claimed_cod_collected_mmk,NEW.claimed_provider_charge_mmk,
   NEW.claimed_gate_charge_mmk,NEW.source_fingerprint)
   IS DISTINCT FROM
   ROW(OLD.original_delivery_way_id,OLD.reported_outcome,OLD.provider_code,
   OLD.branch_code,OLD.external_tracking_reference,OLD.source_document_reference,
   OLD.evidence_storage_path,OLD.observed_at,OLD.reported_by_user_id,
   OLD.submitted_at,OLD.claimed_cod_collected_mmk,OLD.claimed_provider_charge_mmk,
   OLD.claimed_gate_charge_mmk,OLD.source_fingerprint)
 THEN RAISE EXCEPTION 'Ground claim source evidence cannot be modified. Submit a new claim.'; END IF;
 IF OLD.review_state <> 'UNREVIEWED' AND OLD.review_state <> 'NEEDS_EVIDENCE'
 THEN RAISE EXCEPTION 'Terminal ground claim review cannot be overwritten'; END IF;
 IF NEW.review_state NOT IN ('NEEDS_EVIDENCE','VERIFIED','REJECTED','CONFLICT')
 THEN RAISE EXCEPTION 'Invalid ground claim review transition'; END IF;
 IF NEW.reviewer_user_id IS DISTINCT FROM (select auth.uid())
 OR NEW.reviewer_user_id IS NULL
 OR NEW.reviewer_user_id = OLD.reported_by_user_id
 THEN RAISE EXCEPTION 'Independent authenticated reviewer required'; END IF;
 IF NEW.reviewed_at IS NULL OR abs(extract(epoch FROM (NEW.reviewed_at - now())))>120
 THEN RAISE EXCEPTION 'Current review timestamp required'; END IF;
 IF nullif(btrim(coalesce(NEW.review_note,'')),'') IS NULL
 THEN RAISE EXCEPTION 'Reasoned review note required'; END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.be_ground_claim_review_guard_v1() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS be_ground_claim_review_guard_v1
  ON public.be_parcel_ground_outcome_claims_v1;
CREATE TRIGGER be_ground_claim_review_guard_v1
  BEFORE UPDATE ON public.be_parcel_ground_outcome_claims_v1
  FOR EACH ROW EXECUTE FUNCTION public.be_ground_claim_review_guard_v1();

ALTER TABLE public.be_parcel_ground_outcome_claims_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_ground_outcome_claims_v1 FROM PUBLIC, anon, authenticated;
-- Only authenticated elevated-role accounts can browse claims at this stage.
CREATE POLICY be_ground_claim_elevated_read_v1
 ON public.be_parcel_ground_outcome_claims_v1
 FOR SELECT TO authenticated
 USING (
  (select auth.uid()) IS NOT NULL
  AND replace(lower(coalesce(public.be_current_role(),'')),'-','_')
   IN ('superadmin','super_admin','app_owner','sys','admin')
 );

CREATE POLICY be_ground_claim_elevated_submit_v1
 ON public.be_parcel_ground_outcome_claims_v1
 FOR INSERT TO authenticated
 WITH CHECK (
  (select auth.uid()) = reported_by_user_id
  AND review_state = 'UNREVIEWED'
  AND reviewer_user_id IS NULL AND reviewed_at IS NULL
  AND replace(lower(coalesce(public.be_current_role(),'')),'-','_')
   IN ('superadmin','super_admin','app_owner','sys','admin')
  AND EXISTS (SELECT 1 FROM public.be_data_entry_parcel_details d
    WHERE d.delivery_way_id = original_delivery_way_id
      AND coalesce(d.parcel_status,'') <> 'duplicate_archived')
 );

CREATE POLICY be_ground_claim_elevated_review_v1
 ON public.be_parcel_ground_outcome_claims_v1
 FOR UPDATE TO authenticated
 USING (
  (select auth.uid()) IS NOT NULL
  AND (select auth.uid()) <> reported_by_user_id
  AND replace(lower(coalesce(public.be_current_role(),'')),'-','_')
   IN ('superadmin','super_admin','app_owner','sys','admin')
 )
 WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND reviewer_user_id = (select auth.uid())
  AND (select auth.uid()) <> reported_by_user_id
  AND replace(lower(coalesce(public.be_current_role(),'')),'-','_')
   IN ('superadmin','super_admin','app_owner','sys','admin')
 );

GRANT SELECT ON public.be_parcel_ground_outcome_claims_v1 TO authenticated;
GRANT INSERT (
  original_delivery_way_id,reported_outcome,provider_code,branch_code,
  external_tracking_reference,source_document_reference,evidence_storage_path,
  observed_at,reported_by_user_id,claimed_cod_collected_mmk,
  claimed_provider_charge_mmk,claimed_gate_charge_mmk,source_fingerprint
) ON public.be_parcel_ground_outcome_claims_v1 TO authenticated;
GRANT UPDATE(review_state,reviewer_user_id,reviewed_at,review_note)
 ON public.be_parcel_ground_outcome_claims_v1 TO authenticated;

-- New events remain closed; a VERIFIED claim is not a custody event or settlement.
COMMENT ON TABLE public.be_parcel_ground_outcome_claims_v1 IS
'Authenticated elevated accounts can submit ground assertions; a separate elevated actor reviews them. Claims do not update parcel/finance state. Territory and provider-scoped rights require separate rollout.';
COMMIT;

-- UAT tests required:
-- 1) anon denied SELECT/INSERT/UPDATE
-- 2) non-elevated authenticated denied
-- 3) elevated submit: own auth.uid only + valid Way ID, UNREVIEWED
-- 4) self-review denied, source-edit denied, final-review re-edit denied
-- 5) distinct elevated reviewer may mark VERIFIED with reason and timestamp
-- 6) verified claim must not change warehouse/COD/delivery/custody rows.
