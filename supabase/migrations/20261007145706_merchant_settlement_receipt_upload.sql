-- Separate private bucket; receipt evidence is immutable and never publicly downloadable.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('merchant-settlement-receipts','merchant-settlement-receipts',false,10485760,ARRAY['image/jpeg','image/png','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION private.be_settlement_receipt_can_upload(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_role text;
BEGIN
 IF auth.uid() IS NULL OR split_part(p_name,'/',1)<>auth.uid()::text
    OR p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$' THEN RETURN false; END IF;
 SELECT a.access_role INTO v_role FROM public.be_finance_actor_access_v3() a;
 RETURN coalesce(v_role IN ('PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN'),false);
END $fn$;

CREATE OR REPLACE FUNCTION private.be_settlement_receipt_can_read(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_role text; v_merchant text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 BEGIN SELECT a.access_role INTO v_role FROM public.be_finance_actor_access_v3() a;
 EXCEPTION WHEN insufficient_privilege THEN v_role:=NULL; END;
 IF v_role IN ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') THEN RETURN true; END IF;
 -- The Merchant Portal also supports staff linked by verified auth email, without a registry merchant role.
 BEGIN v_merchant:=private.be_current_merchant_identity_impl()->>'merchant_code';
 EXCEPTION WHEN insufficient_privilege THEN RETURN false; END;
 RETURN nullif(v_merchant,'') IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.be_finance_settlement_payments_v3 p
  JOIN public.be_finance_settlement_batches_v3 b ON b.id=p.batch_id
  WHERE upper(b.merchant_id)=upper(v_merchant) AND p.status='CONFIRMED'
   AND split_part(p.evidence_url,'/storage/v1/object/authenticated/merchant-settlement-receipts/',2)=p_name
 );
END $fn$;
REVOKE ALL ON FUNCTION private.be_settlement_receipt_can_upload(text),private.be_settlement_receipt_can_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.be_settlement_receipt_can_upload(text),private.be_settlement_receipt_can_read(text) TO authenticated;

CREATE POLICY be_settlement_receipts_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='merchant-settlement-receipts' AND private.be_settlement_receipt_can_upload(name));
CREATE POLICY be_settlement_receipts_select ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='merchant-settlement-receipts' AND private.be_settlement_receipt_can_read(name));
-- No UPDATE or DELETE policy: uploaded evidence cannot be replaced or removed by app users.
