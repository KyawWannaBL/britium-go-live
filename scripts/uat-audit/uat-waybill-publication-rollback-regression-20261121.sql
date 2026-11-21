-- HOSTED UAT ONLY. Waybill publication + idempotency regression. EVERYTHING ROLLED BACK.
-- This is NOT production-equivalent: V32 epoch guards and real rider photo-upload workflow are absent.
-- DO NOT split this transaction or execute on production. All proof paths are synthetic placeholders.
BEGIN;
SET LOCAL statement_timeout='65s';
DO $preflight$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 THEN RAISE EXCEPTION 'Wrong hosted UAT'; END IF;
 IF (SELECT count(*) FROM public.parcels)<>0 OR (SELECT count(*) FROM public.be_v32_parcels)<>0 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_delivery_way_id_registry)<>4 OR (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Unsafe test data baseline'; END IF;
 IF has_function_privilege('authenticated','public.be_data_entry_financial_v2_create_ready_waybill(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Waybill creation is prematurely exposed to UAT browser users'; END IF;
END $preflight$;
CREATE TEMP TABLE uat_publication_test(name text,response jsonb,printable_rows integer,ledger_rows integer) ON COMMIT DROP;
INSERT INTO public.be_pickup_parcel_verifications(pickup_id,parcel_sequence,delivery_way_id,status,verification_status,proof_check_status,proof_photo_path)
VALUES
('P2026-ISN-901',1,'D2026-ISN-0001','VERIFIED','RIDER_VERIFIED','APPROVED','UAT_NO_ACTUAL_FILE'),
('P2026-ISN-901',2,'D2026-ISN-0002','VERIFIED','RIDER_VERIFIED','APPROVED','UAT_NO_ACTUAL_FILE');
UPDATE public.be_portal_pickup_requests SET pickup_verified_at=now(),pickup_collected_at=now(),pickup_status='PICKUP_COLLECTED',workflow_stage='PICKUP_COLLECTED',verified_parcels=2,pickup_proof_url='UAT_NOT_ACTUAL_PHOTO'
 WHERE pickup_id='P2026-ISN-901';
DO $test$
DECLARE actor uuid; r jsonb; w jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.be_user_account_registry WHERE lower(replace(role_code,'-','_'))='super_admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF NOT private.be_waybill_sync_allowed_v12_2() THEN RAISE EXCEPTION 'Superadmin private publication permission denied'; END IF;
 UPDATE public.be_data_entry_financial_v2_runtime_v58 SET mutation_mode='ACTIVE' WHERE singleton;
 r:=public.be_data_entry_financial_v2_save_batch_v22('{"request_id":"UAT-WAYBILL-REGRESSION-SAVE-20261121","pickup_id":"P2026-ISN-901","rows":[{"pickup_id":"P2026-ISN-901","parcel_sequence":1,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 1","recipient_phone":"09990000101","township":"အင်းစိန်","delivery_address":"UAT TEST ONLY 1","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"},{"pickup_id":"P2026-ISN-901","parcel_sequence":2,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 2","recipient_phone":"09990000102","township":"အင်းစိန်","delivery_address":"UAT TEST ONLY 2","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"}]}'::jsonb);
 IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'saved_count')::integer<>2 THEN RAISE EXCEPTION 'Save All did not produce two canonical parcels: %',r; END IF;
 w:=public.be_data_entry_financial_v2_create_ready_waybill('{"request_id":"UAT-WAYBILL-REGRESSION-PUBLISH-20261121","pickup_id":"P2026-ISN-901","parcel_sequences":[1,2],"dry_run":false}'::jsonb);
 INSERT INTO uat_publication_test SELECT 'publish',w,(SELECT count(*) FROM public.be_v32_parcels),(SELECT count(*) FROM public.be_waybill_ledger);
 IF (w->>'ok')::boolean IS NOT TRUE OR (w->>'persisted')::boolean IS NOT TRUE OR (w->>'waybill_created')::boolean IS NOT TRUE OR (w->>'printable_count')::integer<>2 OR (SELECT count(*) FROM public.be_v32_parcels)<>2 THEN RAISE EXCEPTION 'Waybill publication test failed: %',w; END IF;
 w:=public.be_data_entry_financial_v2_create_ready_waybill('{"request_id":"UAT-WAYBILL-REGRESSION-PUBLISH-20261121","pickup_id":"P2026-ISN-901","parcel_sequences":[1,2],"dry_run":false}'::jsonb);
 INSERT INTO uat_publication_test SELECT 'idempotent_replay',w,(SELECT count(*) FROM public.be_v32_parcels),(SELECT count(*) FROM public.be_waybill_ledger);
 IF (w->>'idempotent_replay')::boolean IS NOT TRUE OR (SELECT count(*) FROM public.be_v32_parcels)<>2 THEN RAISE EXCEPTION 'Repeated publication duplicated or changed rows: %',w; END IF;
 SELECT auth_user_id INTO actor FROM public.be_user_account_registry WHERE lower(replace(role_code,'-','_'))='branch_manager' AND branch_code='ISN' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF private.be_waybill_sync_allowed_v12_2() THEN RAISE EXCEPTION 'Branch manager unexpectedly permitted private Waybill synchronization'; END IF;
END $test$;
SELECT name,response->>'ok' AS ok,response->>'persisted' AS persisted,response->>'idempotent_replay' AS replay,response->>'printable_count' AS printable_count,printable_rows,ledger_rows
FROM uat_publication_test ORDER BY CASE name WHEN 'publish' THEN 1 ELSE 2 END;
ROLLBACK;
