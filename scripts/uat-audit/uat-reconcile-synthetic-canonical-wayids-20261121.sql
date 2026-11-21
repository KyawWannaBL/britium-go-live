-- UAT ONLY: reconcile four SYNTHETIC QA Way IDs to server-assigned canonical IDs.
-- Never modify real parcels: exact temporary IDs, draft reviews and zero published/scanned items required.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'Not isolated QA dataset'; END IF;
 IF (SELECT count(*) FROM public.be_data_entry_parcel_details WHERE (pickup_id,parcel_sequence,delivery_way_id) IN
  (('P2026-ISN-901',1,'UAT-QA-ISN-0001'),('P2026-ISN-901',2,'UAT-QA-ISN-0002'),('P2026-MDY-901',1,'UAT-QA-MDY-0001'),('P2026-MDY-901',2,'UAT-QA-MDY-0002')))<>4 THEN RAISE EXCEPTION 'Synthetic IDs were changed'; END IF;
 IF (SELECT count(*) FROM public.be_wayplan_dispatch_stops WHERE delivery_way_id LIKE 'UAT-QA-%')<>4 OR
    (SELECT count(*) FROM public.be_wayplan_membership_v40 WHERE delivery_way_id LIKE 'UAT-QA-%')<>4 OR
    (SELECT count(*) FROM public.be_wayplan_review_v43 WHERE review_status<>'DRAFT')<>0 OR
    (SELECT count(*) FROM public.be_delivery_way_id_registry)<>0 OR
    (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR
    (SELECT count(*) FROM public.parcels)<>0 OR
    (SELECT count(*) FROM public.be_dispatch_scans_v39)<>0 OR
    (SELECT count(*) FROM public.be_delivery_location_registry)<>0
 THEN RAISE EXCEPTION 'Non-synthetic operational references exist'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Financial runtime is active'; END IF;
END $gate$;
CREATE TEMP TABLE qa_way_id_map(pickup_id text,parcel_sequence integer,original_way_id text,canonical_way_id text) ON COMMIT DROP;
DO $allocate$ DECLARE r record; new_id text; BEGIN
 FOR r IN SELECT pickup_id,parcel_sequence,delivery_way_id FROM public.be_data_entry_parcel_details ORDER BY pickup_id,parcel_sequence LOOP
  new_id:=public.be_allocate_delivery_way_id(r.pickup_id,r.parcel_sequence);
  IF new_id !~ '^D2026-(ISN|MDY)-[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid UAT canonical Way ID: %',new_id; END IF;
  INSERT INTO qa_way_id_map VALUES(r.pickup_id,r.parcel_sequence,r.delivery_way_id,new_id);
 END LOOP;
END $allocate$;
UPDATE public.be_data_entry_parcel_details d SET delivery_way_id=m.canonical_way_id
 FROM qa_way_id_map m WHERE d.pickup_id=m.pickup_id AND d.parcel_sequence=m.parcel_sequence AND d.delivery_way_id=m.original_way_id;
UPDATE public.be_wayplan_dispatch_stops s SET delivery_way_id=m.canonical_way_id
 FROM qa_way_id_map m WHERE s.pickup_id=m.pickup_id AND s.stop_sequence=m.parcel_sequence AND s.delivery_way_id=m.original_way_id;
UPDATE public.be_wayplan_membership_v40 w SET delivery_way_id=m.canonical_way_id
 FROM qa_way_id_map m WHERE w.pickup_id=m.pickup_id AND w.delivery_way_id=m.original_way_id;
DO $verify$ BEGIN
 IF (SELECT count(*) FROM qa_way_id_map)<>4
 OR (SELECT count(*) FROM public.be_delivery_way_id_registry)<>4
 OR (SELECT count(*) FROM public.be_data_entry_parcel_details d JOIN qa_way_id_map m ON m.pickup_id=d.pickup_id AND m.parcel_sequence=d.parcel_sequence AND m.canonical_way_id=d.delivery_way_id)<>4
 OR (SELECT count(*) FROM public.be_wayplan_dispatch_stops s JOIN qa_way_id_map m ON m.pickup_id=s.pickup_id AND m.parcel_sequence=s.stop_sequence AND m.canonical_way_id=s.delivery_way_id)<>4
 OR (SELECT count(*) FROM public.be_wayplan_membership_v40 w JOIN qa_way_id_map m ON m.pickup_id=w.pickup_id AND m.canonical_way_id=w.delivery_way_id)<>4
 THEN RAISE EXCEPTION 'Canonical ID relinking inconsistent'; END IF;
 IF EXISTS(SELECT 1 FROM public.be_waybill_ledger) OR EXISTS(SELECT 1 FROM public.parcels) THEN RAISE EXCEPTION 'Unexpected publication'; END IF;
END $verify$;
COMMIT;
