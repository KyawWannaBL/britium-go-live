-- Acceptance tests call production functions inside a transaction; all payments,
-- receipts, access setup, journal events and notifications are rolled back.
BEGIN TRANSACTION;
DO $test$
declare
 v_user uuid; v_email text; v_checker uuid; v_checker_email text;
 v_parcel uuid; v_batch uuid; v_batch2 uuid; v_result jsonb; v_snapshot jsonb; v_history jsonb;
 v_ref text:='UAT-'||gen_random_uuid(); v_before numeric; v_net numeric;
 v_failed boolean; v_method text; v_type text; v_quote jsonb; v_expected numeric;
begin
 select auth_user_id,email into v_user,v_email from public.be_user_account_registry
 where upper(role)='SUPERADMIN' and auth_user_id is not null and coalesce(is_active,true) and coalesce(active,true) limit 1;
 select auth_user_id,email into v_checker,v_checker_email from public.be_user_account_registry
 where auth_user_id<>v_user and coalesce(is_active,true) and coalesce(active,true) limit 1;
 if v_user is null or v_checker is null then raise exception 'Finance acceptance actors missing'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'email',v_email,'role','authenticated')::text,true);
 -- Finance calculations: independent expected results for all six collection types.
 foreach v_type in array array['ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY',
   'DELIVERY_CHARGE_ONLY','EXACT_COLLECTION_AMOUNT','OPAQUE_COD_COLLECTION','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT'] loop
  v_quote:=public.be_calculate_parcel_financial_v2('သာကေတ','STANDARD',v_type,50000,4000,54000);
  v_expected:=case when v_type='DELIVERY_CHARGE_ONLY' then 0
    when v_type='ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then 46000 else 50000 end;
  if v_quote->>'validation_status'<>'OK' or (v_quote->>'merchant_final_settlement_amount')::numeric<>v_expected then
   raise exception 'Six-type calculation mismatch %: %',v_type,v_quote;
  end if;
 end loop;
 -- A delivered parcel is visible, but cannot be paid before Finance receives its COD.
 select parcel_id,merchant_final_settlement_amount into v_parcel,v_net
 from public.be_v_finance_merchant_settlement_queue_v2 where delivery_way_id='D1007-TSW-001' and upper(status)='DELIVERED';
 if v_parcel is null or v_net<>50000 then raise exception 'Delivered TSW fixture is absent or changed'; end if;
 if exists(select 1 from public.be_v_finance_merchant_settlement_queue_v2 where parcel_id=v_parcel and settlement_eligible) then
   raise exception 'Unremitted COD must not be settlement eligible';
 end if;
 update public.be_finance_cod_settlements_v48 set settled_amount=expected_cod,settlement_status='SETTLED'
   where delivery_way_id in ('D1007-TSW-001','D1006-KNY-001');
 v_result:=public.be_finance_create_settlement_batch_v3(array[v_parcel]);
 v_batch:=(v_result#>>'{batch,id}')::uuid;
 v_failed:=false;
 begin perform public.be_finance_create_settlement_batch_v3(array[v_parcel]); exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Parcel was included in two active batches'; end if;
 perform public.be_finance_transition_batch_v3(v_batch,'SUBMIT_REVIEW');
 perform public.be_finance_transition_batch_v3(v_batch,'SUBMIT_APPROVAL');
 v_failed:=false;
 begin perform public.be_finance_transition_batch_v3(v_batch,'APPROVE'); exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Maker-checker was bypassed'; end if;
 -- Delegate the second existing account only inside this rollback test.
 insert into public.be_finance_settlement_access_v3(email,access_role,active) values(v_checker_email,'FINANCE_APPROVER',true)
 on conflict(email) do update set access_role='FINANCE_APPROVER',active=true;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_checker,'email',v_checker_email,'role','authenticated')::text,true);
 perform public.be_finance_transition_batch_v3(v_batch,'APPROVE');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'email',v_email,'role','authenticated')::text,true);
 perform public.be_refresh_party_wallets_v1();
 v_before:=(private.be_merchant_payment_history_v200('TSW')#>>'{wallet,britium_owes}')::numeric;
 -- Each method preserves evidence and creates accounting, without altering fixtures.
 foreach v_method in array array['CASH','BANK_TRANSFER','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','CHEQUE','OTHER'] loop
  begin
   v_result:=public.be_finance_record_payment_v3(v_batch,1,v_method,v_ref||'-METHOD-'||v_method,'UAT account','https://example.test/method-receipt',true);
   if not exists(select 1 from public.be_finance_settlement_payments_v3
     where id=(v_result->>'payment_id')::uuid and payment_method=v_method and accounting_event_id is not null
       and evidence_url='https://example.test/method-receipt' and bank_account='UAT account') then
     raise exception 'Method evidence/accounting mismatch %',v_method;
   end if;
   raise exception using errcode='P9999',message='rollback method fixture';
  exception when sqlstate 'P9999' then null;
  end;
 end loop;
 v_result:=public.be_finance_record_payment_v3(v_batch,20000,'CASH',v_ref||'-PART',null,'https://example.test/cash-receipt',true);
 if (v_result#>>'{batch,paid_amount}')::numeric<>20000 or (v_result#>>'{batch,outstanding_amount}')::numeric<>30000 then
  raise exception 'Partial payment did not preserve the remainder: %',v_result;
 end if;
 if (private.be_merchant_payment_history_v200('TSW')#>>'{wallet,britium_owes}')::numeric<>v_before-20000 then
  raise exception 'Merchant wallet did not decrease by the confirmed partial payment';
 end if;
 if exists(select 1 from private.be_merchant_settlement_receipts_v200 where parcel_id=v_parcel) then
   raise exception 'Parcel finalized before full payment';
 end if;
 v_result:=public.be_finance_record_payment_v3(v_batch,20000,'CASH',v_ref||'-PART',null,'https://example.test/cash-receipt',true);
 if v_result->>'duplicate_reference'<>'true' then raise exception 'Payment retry is not idempotent'; end if;
 v_failed:=false;
 begin perform public.be_finance_record_payment_v3(v_batch,21000,'CASH',v_ref||'-PART',null,'https://example.test/cash-receipt',true); exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Changed amount reused a payment reference'; end if;
 v_failed:=false;
 begin perform public.be_finance_record_payment_v3(v_batch,30001,'CASH',v_ref||'-OVER',null,'https://example.test/cash-receipt',true); exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Overpayment accepted'; end if;
 -- Cross-API transfer reuse and canonical UUID duplicates must be rejected.
 v_failed:=false;
 begin perform public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',v_batch,'amount',1)),v_ref||'-PART','CASH',null,'https://example.test/cash-receipt');
 exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Individual reference reused by bulk transfer'; end if;
 v_failed:=false;
 begin perform public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',lower(v_batch::text),'amount',1),jsonb_build_object('batch_id',upper(v_batch::text),'amount',1)),
   v_ref||'-CASE','CASH',null,'https://example.test/cash-receipt');
 exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Alternate UUID spelling bypassed duplicate allocation guard'; end if;
 -- A dispute against the whole batch blocks payment even with no parcel ID.
 insert into public.be_finance_settlement_disputes_v3(batch_id,merchant_id,dispute_category,merchant_explanation)
 values(v_batch,'TSW','OTHER','Rollback-only batch dispute');
 v_failed:=false;
 begin perform public.be_finance_record_payment_v3(v_batch,1,'CASH',v_ref||'-DISPUTE',null,'https://example.test/dispute-receipt',true);
 exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Batch-wide dispute failed to block payment'; end if;
 update public.be_finance_settlement_disputes_v3 set status='RESOLVED' where batch_id=v_batch;
 -- All methods require receipt evidence; missing method/bank details are rejected.
 v_failed:=false;
 begin perform public.be_finance_record_payment_v3(v_batch,1,'BANK_TRANSFER',v_ref||'-NO-EVIDENCE',null,null,true); exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Evidence-free bank payment accepted'; end if;
 -- Create another approved merchant batch to verify atomic bulk transfers.
 select parcel_id into v_parcel from public.be_v_finance_merchant_settlement_queue_v2 where delivery_way_id='D1006-KNY-001';
 v_result:=public.be_finance_create_settlement_batch_v3(array[v_parcel]);
 v_batch2:=(v_result#>>'{batch,id}')::uuid;
 update public.be_finance_settlement_batches_v3 set status='APPROVED',approved_by=v_checker_email,approved_at=now() where id=v_batch2;
 -- Reject an invalid allocation without posting any other part of its bulk transfer.
 v_failed:=false;
 begin perform public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',v_batch,'amount',1000),jsonb_build_object('batch_id',v_batch2,'amount',16000)),
   v_ref||'-INVALID-BULK','BANK_TRANSFER','UAT merchant bank','https://example.test/bulk-receipt');
 exception when others then v_failed:=true; end;
 if not v_failed or (select count(*) from public.be_finance_settlement_payments_v3 where batch_id in(v_batch,v_batch2))<>1 then
   raise exception 'Failed bulk payment retained an allocation';
 end if;
 v_result:=public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',v_batch,'amount',30000),jsonb_build_object('batch_id',v_batch2,'amount',15000)),
   v_ref||'-BULK','BANK_TRANSFER','UAT merchant bank','https://example.test/bulk-receipt');
 if (select count(*) from public.be_finance_settlement_batches_v3 where id in (v_batch,v_batch2) and status='PAID' and outstanding_amount=0)<>2 then
  raise exception 'Split/bulk final payment did not close both batches';
 end if;
 v_result:=public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',v_batch,'amount',30000),jsonb_build_object('batch_id',v_batch2,'amount',15000)),
   v_ref||'-BULK','BANK_TRANSFER','UAT merchant bank','https://example.test/bulk-receipt');
 if (select count(*) from public.be_finance_settlement_payments_v3 where batch_id in (v_batch,v_batch2))<>3 then
  raise exception 'Bulk retry duplicated payments';
 end if;
 v_failed:=false;
 begin perform public.be_finance_record_bulk_payment_v200(
   jsonb_build_array(jsonb_build_object('batch_id',v_batch,'amount',30000)),
   v_ref||'-BULK','BANK_TRANSFER','UAT merchant bank','https://example.test/bulk-receipt');
 exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Bulk reference reused with changed allocation set'; end if;
 v_failed:=false;
 begin perform public.be_finance_record_payment_v3(v_batch,1,'CASH',v_ref||'-BULK',null,'https://example.test/cash-receipt',true);
 exception when others then v_failed:=true; end;
 if not v_failed then raise exception 'Bulk reference reused by individual payment'; end if;
 v_snapshot:=public.be_finance_settlement_snapshot_v3('TSW');
 v_history:=private.be_merchant_payment_history_v200('TSW');
 if (v_snapshot->'wallet') is distinct from (v_history->'wallet') then raise exception 'Finance/Merchant wallet mismatch'; end if;
 if (select count(*) from jsonb_array_elements(v_snapshot->'payments') p where p->>'batch_id'=v_batch::text)
   <>(select count(*) from jsonb_array_elements(v_history->'payments') p where p->>'batch_id'=v_batch::text) then
   raise exception 'Finance/Merchant history mismatch';
 end if;
 if (v_history#>>'{wallet,britium_owes}')::numeric<>v_before-50000 then raise exception 'Fully paid batch still contributes wallet payable'; end if;
 if exists(select 1 from public.be_finance_settlement_payments_v3 p where p.batch_id in(v_batch,v_batch2) and p.accounting_event_id is null) then
   raise exception 'Confirmed payment missing accounting/audit event';
 end if;
 if exists(select 1 from public.be_accounting_event_lines l join public.be_finance_settlement_payments_v3 p on p.accounting_event_id=l.event_id
   where p.batch_id in(v_batch,v_batch2) group by l.event_id having sum(l.debit_amount)<>sum(l.credit_amount)) then
   raise exception 'Merchant payment accounting is unbalanced';
 end if;
end $test$;
ROLLBACK TRANSACTION;
select 'PASS: six collection types, COD gate, maker-checker, partial/split/bulk payment, replay, overpayment, evidence, wallet, shared history and balanced accounting; all writes rolled back' result;

