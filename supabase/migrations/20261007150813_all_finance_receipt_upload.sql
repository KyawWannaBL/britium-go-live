CREATE OR REPLACE FUNCTION private.be_settlement_receipt_can_upload(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_role text;
BEGIN
 IF auth.uid() IS NULL OR split_part(p_name,'/',1)<>auth.uid()::text
    OR p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$' THEN RETURN false; END IF;
 SELECT a.access_role INTO v_role FROM public.be_finance_actor_access_v3() a;
 RETURN coalesce(v_role IN ('FINANCE','FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN'),false);
END $fn$;
