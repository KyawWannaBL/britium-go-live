-- Receipt metadata and temporary role overrides are fully rolled back.
BEGIN;
DO $test$
DECLARE actor record; object_name text; seen integer; tested integer:=0; role_name text;
BEGIN
 FOR actor IN SELECT auth_user_id,email FROM public.be_user_account_registry
  WHERE lower(role) IN ('finance','finance_user','accountant','accounts','finance_manager','finance_creator','finance_reviewer','finance_approver','finance_admin','payment_officer')
  AND auth_user_id IS NOT NULL AND coalesce(active,true) AND coalesce(is_active,true) AND lower(coalesce(status,'active'))='active' LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.auth_user_id,'email',actor.email,'role','authenticated')::text,true);
  object_name:=actor.auth_user_id::text||'/'||gen_random_uuid()::text||'.png';
  IF NOT private.be_settlement_receipt_can_upload(object_name) THEN RAISE EXCEPTION 'Finance upload denied for %',actor.email; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects(bucket_id,name) VALUES('merchant-settlement-receipts',object_name);
  SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id='merchant-settlement-receipts' AND name=object_name;
  IF seen<>1 THEN RAISE EXCEPTION 'Finance preview denied for %',actor.email; END IF;
  EXECUTE 'RESET ROLE';tested:=tested+1;
 END LOOP;
 IF tested=0 THEN RAISE EXCEPTION 'No active Finance accounts tested'; END IF;
 SELECT auth_user_id,email INTO actor FROM public.be_user_account_registry WHERE lower(email)='finance_ygn_004@britiumventures.com';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.auth_user_id,'email',actor.email,'role','authenticated')::text,true);
 FOREACH role_name IN ARRAY ARRAY['FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','FINANCE','FINANCE_MANAGER','FINANCE_ADMIN','PAYMENT_OFFICER','ACCOUNTS'] LOOP
  INSERT INTO public.be_finance_settlement_access_v3(email,access_role,active) VALUES(actor.email,role_name,true)
  ON CONFLICT(email) DO UPDATE SET access_role=EXCLUDED.access_role,active=true;
  object_name:=actor.auth_user_id::text||'/'||gen_random_uuid()::text||'.pdf';
  IF NOT private.be_settlement_receipt_can_upload(object_name) THEN RAISE EXCEPTION 'Finance role upload denied: %',role_name; END IF;
 END LOOP;
END $test$;
ROLLBACK;
SELECT 'PASS: all active Finance accounts and all Finance role variants can upload and preview receipts; test writes rolled back' AS result;
