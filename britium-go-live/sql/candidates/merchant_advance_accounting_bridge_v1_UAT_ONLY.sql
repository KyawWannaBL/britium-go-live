-- Britium Express | UAT only: Merchant advance payout / refund journal bridge v1
-- INSTALL AFTER merchant_advance_settlement_v1_UAT_ONLY.sql.
-- No external bank transfer. Draft events enter REVIEW_PENDING, not posted journals.
-- Cash/bank accounts follow existing private.be_merchant_payment_accounting_v200.
BEGIN;
ALTER TABLE public.be_finance_advance_batches_v1
 ADD COLUMN IF NOT EXISTS accounting_event_id uuid UNIQUE;
ALTER TABLE public.be_finance_advance_rto_recoveries_v1
 ADD COLUMN IF NOT EXISTS accounting_event_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION private.be_finance_advance_accounting_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_type text;
 v_account_asset uuid;
 v_account_funds uuid;
 v_event jsonb;
 v_event_id uuid;
 v_funds_code text;
 v_amount numeric;
 v_method text;
 v_reference text;
 v_merchant text;
 v_snapshot jsonb;
BEGIN
 IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME = 'be_finance_advance_batches_v1' THEN
   IF NEW.status <> 'DISBURSED' THEN RETURN NEW; END IF;
   v_type:='MERCHANT_ADVANCE_DISBURSED';
   v_amount:=NEW.total_amount;
   v_method:=upper(btrim(coalesce(NEW.payment_method,'')));
   v_reference:=btrim(coalesce(NEW.payment_reference,''));
   v_merchant:=NEW.merchant_id;
   v_snapshot:=to_jsonb(NEW);
 ELSIF TG_TABLE_NAME = 'be_finance_advance_rto_recoveries_v1' THEN
   IF NEW.status <> 'REFUND_RECEIVED' THEN RETURN NEW; END IF;
   v_type:='MERCHANT_ADVANCE_REFUND_RECEIVED';
   v_amount:=NEW.amount;
   v_method:=upper(btrim(coalesce(NEW.receipt_method,'')));
   v_reference:=btrim(coalesce(NEW.receipt_reference,''));
   SELECT i.merchant_id INTO v_merchant
   FROM public.be_finance_advance_items_v1 i WHERE i.id=NEW.advance_item_id;
   v_snapshot:=to_jsonb(NEW);
 ELSE RETURN NEW;
 END IF;
 IF v_amount IS NULL OR v_amount<=0 OR v_amount<>round(v_amount,2) OR length(v_reference)<4 THEN
   RAISE EXCEPTION 'Advance accounting requires exact signed amount and external transfer evidence';
 END IF;
 IF v_method NOT IN ('CASH','BANK_TRANSFER','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','CHEQUE','OTHER') THEN
   RAISE EXCEPTION 'Unsupported advance payment method';
 END IF;
 v_funds_code:=CASE WHEN v_method='CASH' THEN '111001' ELSE '112003' END;
 SELECT id INTO v_account_asset FROM public.be_chart_of_accounts
 WHERE account_code='114004' AND is_active AND is_postable;
 SELECT id INTO v_account_funds FROM public.be_chart_of_accounts
 WHERE account_code=v_funds_code AND is_active AND is_postable;
 IF v_account_asset IS NULL OR v_account_funds IS NULL OR v_merchant IS NULL THEN
   RAISE EXCEPTION 'Merchant advance accounting accounts or merchant missing';
 END IF;
 v_event:=public.be_accounting_upsert_event_v1(
  'MERCHANT_ADVANCE',
  TG_TABLE_NAME,
  NEW.id::text,
  v_type,
  'MERCHANT_ADVANCE_V1',
  (now() AT TIME ZONE 'Asia/Yangon')::date,
  v_type||' / '||v_reference,
  'MMK',v_amount,
  v_snapshot||jsonb_build_object('source_reference',v_reference,'merchant_id',v_merchant),
  md5(v_snapshot::text),
  'REVIEW_PENDING',
  now(),
  jsonb_build_object('merchant_id',v_merchant,'reference',v_reference)
 );
 IF coalesce((v_event->>'ok')::boolean,false) IS NOT TRUE THEN
   RAISE EXCEPTION 'Advance accounting event failed: %',v_event;
 END IF;
 v_event_id:=(v_event->>'event_id')::uuid;
 IF v_event_id IS NULL THEN RAISE EXCEPTION 'Advance event creation did not return event ID'; END IF;
 IF v_type='MERCHANT_ADVANCE_DISBURSED' THEN
  INSERT INTO public.be_accounting_event_lines(
   event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
  ) VALUES
   (v_event_id,v_account_asset,10,v_amount,0,v_merchant,'Merchant advance receivable',jsonb_build_object('reference',v_reference)),
   (v_event_id,v_account_funds,20,0,v_amount,v_merchant,'Merchant advance paid externally',jsonb_build_object('reference',v_reference));
  UPDATE public.be_finance_advance_batches_v1 SET accounting_event_id=v_event_id WHERE id=NEW.id;
 ELSE
  INSERT INTO public.be_accounting_event_lines(
   event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
  ) VALUES
   (v_event_id,v_account_funds,10,v_amount,0,v_merchant,'Merchant advance refund actually received',jsonb_build_object('reference',v_reference)),
   (v_event_id,v_account_asset,20,0,v_amount,v_merchant,'Reduce merchant advance receivable',jsonb_build_object('reference',v_reference));
  UPDATE public.be_finance_advance_rto_recoveries_v1 SET accounting_event_id=v_event_id WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS be_finance_advance_disbursed_accounting_v1 ON public.be_finance_advance_batches_v1;
CREATE TRIGGER be_finance_advance_disbursed_accounting_v1
AFTER UPDATE OF status ON public.be_finance_advance_batches_v1
FOR EACH ROW EXECUTE FUNCTION private.be_finance_advance_accounting_v1();

DROP TRIGGER IF EXISTS be_finance_advance_refund_received_accounting_v1 ON public.be_finance_advance_rto_recoveries_v1;
CREATE TRIGGER be_finance_advance_refund_received_accounting_v1
AFTER UPDATE OF status ON public.be_finance_advance_rto_recoveries_v1
FOR EACH ROW EXECUTE FUNCTION private.be_finance_advance_accounting_v1();
REVOKE ALL ON FUNCTION private.be_finance_advance_accounting_v1() FROM PUBLIC,anon,authenticated;
COMMIT;
