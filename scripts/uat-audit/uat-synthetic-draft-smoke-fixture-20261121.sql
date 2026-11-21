-- UAT-only synthetic smoke fixture; does NOT verify registration or wayplan creation via frontend.
-- Non-deliverable; draft-only and zero COD. Never run against production.
BEGIN;
SET LOCAL statement_timeout = '45s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL
    OR (SELECT count(*) FROM auth.users)<>18
    OR (SELECT count(*) FROM public.be_user_account_registry)<>18
    OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16
 THEN RAISE EXCEPTION 'Wrong UAT target or identity roster changed'; END IF;
 IF EXISTS (SELECT 1 FROM public.be_wayplan_dispatches)
    OR EXISTS (SELECT 1 FROM public.be_wayplan_dispatch_stops)
    OR EXISTS (SELECT 1 FROM public.be_data_entry_parcel_details)
    OR EXISTS (SELECT 1 FROM public.be_wayplan_membership_v40)
    OR EXISTS (SELECT 1 FROM public.be_wayplan_review_v43)
 THEN RAISE EXCEPTION 'Existing test/operational data must be reviewed first'; END IF;
END $gate$;
INSERT INTO public.be_wayplan_dispatches(wayplan_id,branch_code,wayplan_status,total_stops,total_parcels,created_by,metadata) VALUES
 ('UAT-QA-ISN-20261121','ISN','CREATED',2,2,'UAT_QA_FIXTURE','{"synthetic":true,"not_for_dispatch":true}'::jsonb),
 ('UAT-QA-MDY-20261121','MDY','CREATED',2,2,'UAT_QA_FIXTURE','{"synthetic":true,"not_for_dispatch":true}'::jsonb);
INSERT INTO public.be_wayplan_review_v43(wayplan_id,review_status) VALUES
 ('UAT-QA-ISN-20261121','DRAFT'),
 ('UAT-QA-MDY-20261121','DRAFT');
INSERT INTO public.be_data_entry_parcel_details(pickup_id,parcel_sequence,delivery_way_id,recipient_name,township,recipient_address,cod_amount,merchant_id,warehouse_status) VALUES
 ('UAT-QA-PICKUP-ISN-20261121',1,'UAT-QA-ISN-0001','UAT TEST RECIPIENT','Insein','TEST ONLY - NOT A VALID ADDRESS',0,'UAT_SYNTHETIC','PENDING_PRINT'),
 ('UAT-QA-PICKUP-ISN-20261121',2,'UAT-QA-ISN-0002','UAT TEST RECIPIENT','Insein','TEST ONLY - NOT A VALID ADDRESS',0,'UAT_SYNTHETIC','PENDING_PRINT'),
 ('UAT-QA-PICKUP-MDY-20261121',1,'UAT-QA-MDY-0001','UAT TEST RECIPIENT','Chanayethazan','TEST ONLY - NOT A VALID ADDRESS',0,'UAT_SYNTHETIC','PENDING_PRINT'),
 ('UAT-QA-PICKUP-MDY-20261121',2,'UAT-QA-MDY-0002','UAT TEST RECIPIENT','Chanayethazan','TEST ONLY - NOT A VALID ADDRESS',0,'UAT_SYNTHETIC','PENDING_PRINT');
INSERT INTO public.be_wayplan_dispatch_stops(wayplan_id,stop_sequence,pickup_id,delivery_way_id,recipient_name,township,cod_amount,branch_code,metadata) VALUES
 ('UAT-QA-ISN-20261121',1,'UAT-QA-PICKUP-ISN-20261121','UAT-QA-ISN-0001','UAT TEST RECIPIENT','Insein',0,'ISN','{"synthetic":true}'::jsonb),
 ('UAT-QA-ISN-20261121',2,'UAT-QA-PICKUP-ISN-20261121','UAT-QA-ISN-0002','UAT TEST RECIPIENT','Insein',0,'ISN','{"synthetic":true}'::jsonb),
 ('UAT-QA-MDY-20261121',1,'UAT-QA-PICKUP-MDY-20261121','UAT-QA-MDY-0001','UAT TEST RECIPIENT','Chanayethazan',0,'MDY','{"synthetic":true}'::jsonb),
 ('UAT-QA-MDY-20261121',2,'UAT-QA-PICKUP-MDY-20261121','UAT-QA-MDY-0002','UAT TEST RECIPIENT','Chanayethazan',0,'MDY','{"synthetic":true}'::jsonb);
INSERT INTO public.be_wayplan_membership_v40(wayplan_id,delivery_way_id,pickup_id,membership_status,metadata) VALUES
 ('UAT-QA-ISN-20261121','UAT-QA-ISN-0001','UAT-QA-PICKUP-ISN-20261121','PLANNED','{"synthetic":true}'::jsonb),
 ('UAT-QA-ISN-20261121','UAT-QA-ISN-0002','UAT-QA-PICKUP-ISN-20261121','PLANNED','{"synthetic":true}'::jsonb),
 ('UAT-QA-MDY-20261121','UAT-QA-MDY-0001','UAT-QA-PICKUP-MDY-20261121','PLANNED','{"synthetic":true}'::jsonb),
 ('UAT-QA-MDY-20261121','UAT-QA-MDY-0002','UAT-QA-PICKUP-MDY-20261121','PLANNED','{"synthetic":true}'::jsonb);
DO $test$
DECLARE actor uuid; snapshot jsonb; result_count integer; b text;
BEGIN
 FOR b IN SELECT unnest(ARRAY['ISN','MDY']) LOOP
  SELECT auth_user_id INTO actor FROM public.be_user_account_registry WHERE lower(replace(role_code,'-','_'))='branch_manager' AND branch_code=b LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Missing test branch manager %',b; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  snapshot:=public.be_dispatch_command_snapshot_v63();
  IF jsonb_array_length(snapshot->'wayplans')<>1
    OR jsonb_array_length(snapshot->'jobs')<>2
    OR snapshot->'wayplans'->0->>'wayplan_id' <> 'UAT-QA-'||b||'-20261121'
  THEN RAISE EXCEPTION 'Branch snapshot mismatch for %: %',b,snapshot->'stats'; END IF;
 END LOOP;
 SELECT auth_user_id INTO actor FROM public.be_user_account_registry WHERE lower(replace(role_code,'-','_'))='super_admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 snapshot:=public.be_dispatch_command_snapshot_v63();
 IF jsonb_array_length(snapshot->'wayplans')<>2 OR jsonb_array_length(snapshot->'jobs')<>4 THEN
  RAISE EXCEPTION 'Super Admin snapshot mismatch';
 END IF;
 IF (SELECT count(*) FROM public.be_data_entry_parcel_details WHERE delivery_way_id LIKE 'UAT-QA-%')<>4 THEN
  RAISE EXCEPTION 'Parcel fixture count mismatch';
 END IF;
END $test$;
COMMIT;
