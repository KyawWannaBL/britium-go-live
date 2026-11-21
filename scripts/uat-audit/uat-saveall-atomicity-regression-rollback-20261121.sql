-- UAT ONLY, REPEATABLE: Save All atomicity, valid save and idempotency regression.
-- WARNING: this script temporarily sets ACTIVE inside BEGIN; ALL data changes ROLLBACK.
-- NEVER split transaction statements or run against production. Proof rows are artificial.
BEGIN;
SET LOCAL statement_timeout='60s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL
 OR (SELECT count(*) FROM auth.users)<>18
 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16
 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2
 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4
 OR (SELECT count(*) FROM public.be_delivery_way_id_registry)<>4
 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0
 OR (SELECT count(*) FROM public.parcels)<>0
 OR (SELECT count(*) FROM public.be_data_entry_register_rows)<>0
 OR (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW'
THEN RAISE EXCEPTION 'Not the controlled isolated UAT baseline'; END IF;
IF to_regprocedure('public.be_data_entry_financial_v2_save_batch_v22(jsonb)') IS NULL
 OR has_function_privilege('authenticated','public.be_data_entry_financial_v2_save_batch_v22(jsonb)','EXECUTE')
THEN RAISE EXCEPTION 'Save All source must exist but remain unavailable to app roles'; END IF;
END $gate$;
CREATE TEMP TABLE uat_regression_outcome(test_case text, response jsonb, canonical_parcels integer,registered_rows integer,financial_audits integer) ON COMMIT DROP;
UPDATE public.be_data_entry_financial_v2_runtime_v58 SET mutation_mode='ACTIVE' WHERE singleton;
INSERT INTO public.be_pickup_parcel_verifications(pickup_id,parcel_sequence,delivery_way_id,status,verification_status,proof_check_status,proof_photo_path)
VALUES
('P2026-ISN-901',1,'D2026-ISN-0001','VERIFIED','RIDER_VERIFIED','APPROVED','UAT_QA_SYNTHETIC_NO_FILE'),
('P2026-ISN-901',2,'D2026-ISN-0002','VERIFIED','RIDER_VERIFIED','APPROVED','UAT_QA_SYNTHETIC_NO_FILE');
DO $test$
DECLARE actor uuid; v jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.be_user_account_registry WHERE lower(replace(role_code,'-','_'))='super_admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 v:=public.be_data_entry_financial_v2_save_batch_v22('{"request_id":"UAT-REPEATABLE-SAVEALL-INVALID-20261121","pickup_id":"P2026-ISN-901","rows":[{"pickup_id":"P2026-ISN-901","parcel_sequence":1,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 1","recipient_phone":"09990000101","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 1","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"},{"pickup_id":"P2026-ISN-901","parcel_sequence":2,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 2","recipient_phone":"","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 2","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"}],"reason":"UAT_SYNTHETIC_ROLLBACK_REGRESSION"}'::jsonb);
 INSERT INTO uat_regression_outcome SELECT 'invalid_second_row',v,(SELECT count(*) FROM public.parcels),(SELECT count(*) FROM public.be_data_entry_register_rows),(SELECT count(*) FROM public.be_parcel_financial_audit_v2);
 IF coalesce((v->>'rolled_back')::boolean,false) IS NOT TRUE OR (SELECT count(*) FROM public.parcels)<>0 THEN RAISE EXCEPTION 'Invalid batch was not fully rolled back'; END IF;
 v:=public.be_data_entry_financial_v2_save_batch_v22('{"request_id":"UAT-REPEATABLE-SAVEALL-VALID-20261121","pickup_id":"P2026-ISN-901","rows":[{"pickup_id":"P2026-ISN-901","parcel_sequence":1,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 1","recipient_phone":"09990000101","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 1","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"},{"pickup_id":"P2026-ISN-901","parcel_sequence":2,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 2","recipient_phone":"09990000102","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 2","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"}],"reason":"UAT_SYNTHETIC_ROLLBACK_REGRESSION"}'::jsonb);
 INSERT INTO uat_regression_outcome SELECT 'valid_two_rows',v,(SELECT count(*) FROM public.parcels),(SELECT count(*) FROM public.be_data_entry_register_rows),(SELECT count(*) FROM public.be_parcel_financial_audit_v2);
 IF coalesce((v->>'ok')::boolean,false) IS NOT TRUE OR (v->>'saved_count')::integer<>2 OR (SELECT count(*) FROM public.parcels)<>2 OR (SELECT count(*) FROM public.be_data_entry_register_rows)<>2 THEN RAISE EXCEPTION 'Valid UAT Save All did not persist two rows within test transaction: %',v; END IF;
 v:=public.be_data_entry_financial_v2_save_batch_v22('{"request_id":"UAT-REPEATABLE-SAVEALL-VALID-20261121","pickup_id":"P2026-ISN-901","rows":[{"pickup_id":"P2026-ISN-901","parcel_sequence":1,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 1","recipient_phone":"09990000101","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 1","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"},{"pickup_id":"P2026-ISN-901","parcel_sequence":2,"merchant_id":"UAT-QA","recipient_name":"UAT QA RECIPIENT 2","recipient_phone":"09990000102","township":"အင်းစိန်","delivery_address":"UAT NONDELIVERABLE TEST 2","weight_kg":1,"customer_tier":"STANDARD","service_provider_code":"BRITIUM","delivery_region":"YANGON","delivery_route_mode":"DOORSTEP_MAP","service_type":"STANDARD","amount_entry_type":"ITEM_PRICE_PLUS_DECLARED_DELIVERY","item_price":20000,"delivery_charges":4000,"photo_evidence_mode":"PICKER_PHOTO"}],"reason":"UAT_SYNTHETIC_ROLLBACK_REGRESSION"}'::jsonb);
 INSERT INTO uat_regression_outcome SELECT 'idempotent_replay',v,(SELECT count(*) FROM public.parcels),(SELECT count(*) FROM public.be_data_entry_register_rows),(SELECT count(*) FROM public.be_parcel_financial_audit_v2);
 IF (v->>'idempotent_replay')::boolean IS NOT TRUE OR (SELECT count(*) FROM public.parcels)<>2 THEN RAISE EXCEPTION 'Idempotent replay failed'; END IF;
END $test$;
SELECT test_case,response->>'ok' AS ok,response->>'rolled_back' AS rolled_back,response->>'saved_count' AS saved_count,response->>'idempotent_replay' AS idempotent_replay,response->'errors'->0->>'code' AS error_code,canonical_parcels,registered_rows,financial_audits
 FROM uat_regression_outcome ORDER BY CASE test_case WHEN 'invalid_second_row' THEN 1 WHEN 'valid_two_rows' THEN 2 ELSE 3 END;
ROLLBACK;
