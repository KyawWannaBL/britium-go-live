-- Proposed append-only physical custody event store for UAT.
-- NEVER derive actual handover events from routing labels or imported spreadsheets.
-- No grants to authenticated/anon. Writes require a reviewed backend integration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_parcel_custody_events_v1 (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 delivery_way_id text NOT NULL CHECK (length(trim(delivery_way_id)) > 0),
 event_type text NOT NULL CHECK (event_type IN
 ('WAREHOUSE_INBOUND','WAYPLAN_ASSIGNED','DISPATCH_SCAN','HANDOVER_OFFERED',
  'HANDOVER_ACCEPTED','PROVIDER_INBOUND','PROVIDER_OUTBOUND','DELIVERY_ATTEMPT',
  'DELIVERED','RETURN_INBOUND','RTO_MERCHANT_HANDOVER','CUSTODY_EXCEPTION')),
 from_custodian_type text,
 from_custodian_code text,
 to_custodian_type text,
 to_custodian_code text,
 provider_code text,
 wayplan_id text,
 manifest_reference text,
 external_tracking_reference text,
 event_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 actor_user_id uuid NOT NULL,
 receiver_name text,
 receipt_reference text,
 proof_reference text,
 physical_location_code text,
 notes text,
 idempotency_key text NOT NULL UNIQUE,
 source_system text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 CONSTRAINT be_custody_acceptance_evidence CHECK (
  event_type NOT IN ('HANDOVER_ACCEPTED','PROVIDER_INBOUND','RTO_MERCHANT_HANDOVER')
  OR (nullif(trim(receiver_name),'') IS NOT NULL
      AND (nullif(trim(receipt_reference),'') IS NOT NULL
           OR nullif(trim(proof_reference),'') IS NOT NULL))
 )
);
CREATE INDEX IF NOT EXISTS be_custody_events_way_time_idx
 ON public.be_parcel_custody_events_v1(delivery_way_id,event_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS be_custody_events_provider_time_idx
 ON public.be_parcel_custody_events_v1(provider_code,event_at DESC);
ALTER TABLE public.be_parcel_custody_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_custody_events_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.be_parcel_custody_events_v1_id_seq FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.be_custody_events_v1_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Custody evidence is append-only; enter a compensating event instead';
END; $$;
REVOKE ALL ON FUNCTION public.be_custody_events_v1_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS be_custody_events_v1_no_mutation
 ON public.be_parcel_custody_events_v1;
CREATE TRIGGER be_custody_events_v1_no_mutation
 BEFORE UPDATE OR DELETE ON public.be_parcel_custody_events_v1
 FOR EACH ROW EXECUTE FUNCTION public.be_custody_events_v1_immutable();
COMMENT ON TABLE public.be_parcel_custody_events_v1 IS
 'Append-only custody evidence; no automatic synthetic events. Access restricted pending approved role-scoped event RPC.';
COMMIT;
