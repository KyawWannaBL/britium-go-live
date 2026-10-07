-- All test metadata, financial writes and temporary identity setup are rolled back.
BEGIN;
DO $test$
DECLARE
 finance_uid uuid; finance_email text; merchant_uid uuid; merchant_email text; other_uid uuid;
 object_name text; receipt_url text; test_batch uuid; failed boolean; seen integer;
BEGIN
 SELECT auth_user_id,email INTO finance_uid,finance_email FROM public.be_user_account_registry
 WHERE lower(email)='finance_ygn_001@britiumventures.com';
 SELECT auth_user_id,email INTO merchant_uid,merchant_email FROM public.be_user_account_registry
 WHERE lower(email)='finance_ygn_004@britiumventures.com';
 SELECT auth_user_id INTO other_uid FROM public.be_user_account_registry WHERE lower(role)='warehouse' AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT id INTO test_batch FROM public.be_finance_settlement_batches_v3 WHERE batch_number='FS-20261007-000007' AND status='APPROVED' AND outstanding_amount>=20000;
 IF finance_uid IS NULL OR merchant_uid IS NULL OR other_uid IS NULL OR test_batch IS NULL THEN RAISE EXCEPTION 'Receipt UAT fixtures missing'; END IF;
 object_name:=finance_uid::text||'/'||gen_random_uuid()::text||'.png';
 receipt_url:='https://dltavabvjwocknkyvwgz.supabase.co/storage/v1/object/authenticated/merchant-settlement-receipts/'||object_name;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_uid,'email',finance_email,'role','authenticated')::text,true);
 IF NOT private.be_settlement_receipt_can_upload(object_name) THEN RAISE EXCEPTION 'Finance manager upload denied'; END IF;
 IF private.be_settlement_receipt_can_upload(merchant_uid::text||'/wrong.png') THEN RAISE EXCEPTION 'Other uploader folder accepted'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO storage.objects(bucket_id,name) VALUES('merchant-settlement-receipts',object_name);
 SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 IF seen<>1 THEN RAISE EXCEPTION 'Finance cannot preview uploaded receipt'; END IF;
 UPDATE storage.objects SET name=object_name||'.changed' WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 BEGIN DELETE FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 IF seen<>1 THEN RAISE EXCEPTION 'Receipt overwrite/deletion allowed'; END IF;
 EXECUTE 'RESET ROLE';
 -- A linked merchant can read only their attached receipt, even without a global merchant role.
 INSERT INTO public.be_merchant_portal_staff(email,merchant_code,status,role) VALUES(merchant_email,'TSW','active','merchant_user');
 INSERT INTO public.be_finance_settlement_access_v3(email,access_role,active) VALUES(merchant_email,'MERCHANT',true)
 ON CONFLICT(email) DO UPDATE SET access_role='MERCHANT',active=true;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',merchant_uid,'email',merchant_email,'role','authenticated')::text,true);
 IF private.be_settlement_receipt_can_read(object_name) THEN RAISE EXCEPTION 'Unattached receipt leaked to merchant'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_uid,'email',finance_email,'role','authenticated')::text,true);
 PERFORM public.be_finance_record_bulk_payment_v200(jsonb_build_array(jsonb_build_object('batch_id',test_batch,'amount',20000)),'RECEIPT-UAT-'||gen_random_uuid(),'KBZ_PAY','UAT wallet',receipt_url);
 IF NOT EXISTS(SELECT 1 FROM public.be_finance_settlement_payments_v3 WHERE batch_id=test_batch AND evidence_url=receipt_url AND amount=20000 AND status='CONFIRMED') THEN RAISE EXCEPTION 'Uploaded evidence lost in F09 payment'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',merchant_uid,'email',merchant_email,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 IF seen<>1 THEN RAISE EXCEPTION 'Merchant cannot view own confirmed receipt'; END IF;
 failed:=false;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('merchant-settlement-receipts',merchant_uid::text||'/'||gen_random_uuid()::text||'.png'); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Merchant upload allowed'; END IF;
 EXECUTE 'RESET ROLE';
 UPDATE public.be_merchant_portal_staff SET merchant_code='KNY' WHERE lower(email)=lower(merchant_email);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 IF seen<>0 THEN RAISE EXCEPTION 'Other merchant receipt leaked'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
 IF seen<>0 THEN RAISE EXCEPTION 'Warehouse receipt access allowed'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{}',true);
 IF private.be_settlement_receipt_can_read(object_name) OR private.be_settlement_receipt_can_upload(object_name) THEN RAISE EXCEPTION 'Anonymous receipt access allowed'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: private receipt upload, immutable storage, merchant isolation and F09 payment evidence (all writes rolled back)' AS result;
