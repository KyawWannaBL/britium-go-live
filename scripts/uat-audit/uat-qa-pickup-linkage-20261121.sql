-- Hosted UAT only: reconcile synthetic parcel/wayplan fixture pickup references to canonical pickup requests.
-- Never run against production. Does NOT publish, scan, deliver, or settle parcels.
BEGIN;
SET LOCAL statement_timeout='35s';
DO $guard$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL
    OR (SELECT count(*) FROM auth.users)<>18
    OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16
    OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2
    OR (SELECT count(*) FROM public.be_wayplan_dispatches)<>2
    OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4
    OR (SELECT count(*) FROM public.be_wayplan_membership_v40)<>4
    OR (SELECT count(*) FROM public.be_wayplan_dispatch_stops)<>4
 THEN RAISE EXCEPTION 'Not verified clean synthetic UAT'; END IF;
 IF (SELECT count(*) FROM public.be_portal_pickup_requests
     WHERE pickup_id IN ('P2026-ISN-901','P2026-MDY-901')
       AND merchant_code='UAT-QA' AND pickup_address='SYNTHETIC TEST ONLY - NO ACTUAL PICKUP')<>2
 THEN RAISE EXCEPTION 'Pickup fixtures have changed'; END IF;
 IF (SELECT count(*) FROM public.be_data_entry_parcel_details WHERE pickup_id LIKE 'UAT-QA-PICKUP-%')<>4
 OR (SELECT count(*) FROM public.be_wayplan_dispatch_stops WHERE pickup_id LIKE 'UAT-QA-PICKUP-%')<>4
 OR (SELECT count(*) FROM public.be_wayplan_membership_v40 WHERE pickup_id LIKE 'UAT-QA-PICKUP-%')<>4
 THEN RAISE EXCEPTION 'Synthetic pickup references have changed'; END IF;
END $guard$;
UPDATE public.be_data_entry_parcel_details SET pickup_id='P2026-ISN-901'
       WHERE pickup_id='UAT-QA-PICKUP-ISN-20261121' AND delivery_way_id LIKE 'UAT-QA-ISN-%';
UPDATE public.be_wayplan_dispatch_stops SET pickup_id='P2026-ISN-901'
       WHERE pickup_id='UAT-QA-PICKUP-ISN-20261121' AND delivery_way_id LIKE 'UAT-QA-ISN-%';
UPDATE public.be_wayplan_membership_v40 SET pickup_id='P2026-ISN-901'
       WHERE pickup_id='UAT-QA-PICKUP-ISN-20261121' AND delivery_way_id LIKE 'UAT-QA-ISN-%';
UPDATE public.be_data_entry_parcel_details SET pickup_id='P2026-MDY-901'
       WHERE pickup_id='UAT-QA-PICKUP-MDY-20261121' AND delivery_way_id LIKE 'UAT-QA-MDY-%';
UPDATE public.be_wayplan_dispatch_stops SET pickup_id='P2026-MDY-901'
       WHERE pickup_id='UAT-QA-PICKUP-MDY-20261121' AND delivery_way_id LIKE 'UAT-QA-MDY-%';
UPDATE public.be_wayplan_membership_v40 SET pickup_id='P2026-MDY-901'
       WHERE pickup_id='UAT-QA-PICKUP-MDY-20261121' AND delivery_way_id LIKE 'UAT-QA-MDY-%';
DO $verified$ DECLARE b text; n integer; BEGIN
 FOR b IN SELECT unnest(ARRAY['ISN','MDY']) LOOP
  IF (SELECT count(*) FROM public.be_data_entry_parcel_details WHERE pickup_id='P2026-'||b||'-901')<>2
     OR (SELECT count(*) FROM public.be_wayplan_dispatch_stops WHERE pickup_id='P2026-'||b||'-901')<>2
     OR (SELECT count(*) FROM public.be_wayplan_membership_v40 WHERE pickup_id='P2026-'||b||'-901')<>2
  THEN RAISE EXCEPTION 'QA parcel chain not aligned for branch %',b; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.be_wayplan_review_v43 WHERE review_status<>'DRAFT') THEN RAISE EXCEPTION 'Unexpected approved QA wayplan'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Financial mutation shadow was disabled'; END IF;
END $verified$;
COMMIT;
