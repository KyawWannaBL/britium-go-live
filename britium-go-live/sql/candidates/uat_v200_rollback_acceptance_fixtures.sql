-- CI ONLY. Executed AFTER the original acceptance savepoint; its original
-- ROLLBACK removes every row/permission below. No Auth users are created.
DO $fixture_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.parcels WHERE way_id IN ('D1007-TSW-001','D1006-KNY-001'))
 OR EXISTS(SELECT 1 FROM public.be_user_account_registry WHERE auth_user_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Refusing Finance acceptance fixtures in a populated database';
 END IF;
END $fixture_guard$;

INSERT INTO public.be_user_account_registry(auth_user_id,email,full_name,role,role_code,status,is_active,active)
VALUES
 ('00000000-0000-4000-8000-000000000701','ci-finance-maker@example.test','CI Finance Maker','SUPERADMIN','SUPERADMIN','active',true,true),
 ('00000000-0000-4000-8000-000000000702','ci-finance-checker@example.test','CI Finance Checker','FINANCE','FINANCE','active',true,true);

INSERT INTO public.parcels(tracking_code,way_id,merchant_id,sender_name,recipient_name,recipient_phone,recipient_address,township,customer_tier,amount_entry_type,item_price,delivery_charges,cod_amount,collect_amount,status,delivered_at,validation_status,merchant_final_settlement_amount,net_system_delivery_charge,settlement_direction)
VALUES
 ('D1007-TSW-001','D1007-TSW-001','TSW','CI Sender','CI Recipient','0000000000','CI address','သာကေတ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,4000,54000,54000,'delivered',now(),'OK',50000,4000,'PAY_MERCHANT'),
 ('D1006-KNY-001','D1006-KNY-001','KNY','CI Sender','CI Recipient','0000000000','CI address','သာကေတ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',15000,4000,19000,19000,'delivered',now(),'OK',15000,4000,'PAY_MERCHANT');

INSERT INTO public.be_finance_cod_settlements_v48(delivery_way_id,wayplan_id,expected_cod,reported_collected,settled_amount,settlement_status)
VALUES
 ('D1007-TSW-001','CI-FINANCE-ACCEPTANCE',54000,54000,0,'PENDING_REMITTANCE'),
 ('D1006-KNY-001','CI-FINANCE-ACCEPTANCE',19000,19000,0,'PENDING_REMITTANCE');
