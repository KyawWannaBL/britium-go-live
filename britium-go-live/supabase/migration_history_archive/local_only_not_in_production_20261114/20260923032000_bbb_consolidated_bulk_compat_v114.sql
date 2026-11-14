-- V114: Make BBB the canonical Consolidated Bulk merchant code while preserving legacy BLK compatibility.
-- Scope: Data Entry calculation/save, original WayID reconciliation, Super Admin bulkload bypass,
-- and non-billable container safeguards.

DO $$
DECLARE
  v_def text;
BEGIN
  -- Calculation wrapper: BBB and legacy BLK both resolve through the original merchant.
  SELECT pg_get_functiondef('public.be_data_entry_financial_v2_calculate(jsonb)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if v_merchant=''BLK'' then',
    'if v_merchant in (''BBB'',''BLK'') then');
  v_def := replace(v_def,
    '''container_merchant_code'',''BLK''',
    '''container_merchant_code'',v_merchant');
  v_def := replace(v_def,
    'if v_payload->>''container_merchant_code''=''BLK'' and',
    'if v_payload->>''container_merchant_code'' in (''BBB'',''BLK'') and');
  EXECUTE v_def;

  -- Save wrapper: original merchant/source WayIDs are reconciled for BBB and legacy BLK pickups.
  SELECT pg_get_functiondef('public.be_data_entry_financial_v2_save(jsonb)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'v_pickup ~ ''-BLK-''',
    'v_pickup ~ ''-(BBB|BLK)-''');
  EXECUTE v_def;

  -- Legacy save implementation: treat BBB as the canonical consolidated container.
  SELECT pg_get_functiondef('public.be_data_entry_financial_v2_save_legacy_v33(jsonb)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if upper(btrim(coalesce(v_payload->>''merchant_id'','''')))=''BLK'' then',
    'if upper(btrim(coalesce(v_payload->>''merchant_id'',''''))) in (''BBB'',''BLK'') then');
  v_def := replace(v_def,
    '''container_merchant_code'',''BLK''',
    '''container_merchant_code'',upper(btrim(coalesce(p_payload->>''merchant_id'','''')))');
  EXECUTE v_def;
END
$$;

CREATE OR REPLACE FUNCTION public.be_superadmin_bulkload_waybill_bypass_v34(p_pickup_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.be_user_account_registry u
    JOIN public.be_portal_pickup_requests p
      ON p.pickup_id = nullif(btrim(p_pickup_id),'')
    WHERE u.auth_user_id = auth.uid()
      AND coalesce(u.is_active,false) = true
      AND lower(coalesce(u.status,'')) = 'active'
      AND upper(coalesce(u.role,'')) = 'SUPERADMIN'
      AND upper(coalesce(p.merchant_code,p.merchant_id,'')) IN ('BBB','BLK')
  );
$function$;

CREATE OR REPLACE FUNCTION public.be_invoice_list(
  p_status text DEFAULT NULL::text,
  p_merchant_code text DEFAULT NULL::text,
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','auditor','operation_manager') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json)
    FROM (
      SELECT p.pickup_id, p.invoice_no, p.merchant_name, p.merchant_code, p.recipient_name,
             p.delivery_fee, p.cod_amount, p.payment_method, p.status, p.invoice_approved,
             p.invoice_approved_at, p.created_at, p.service_tier, p.weight_kg
      FROM public.be_portal_pickup_requests p
      WHERE upper(coalesce(p.merchant_code,'')) NOT IN ('BBB','BLK')
        AND (p_status IS NULL OR p.status=p_status)
        AND (p_merchant_code IS NULL OR p.merchant_code=p_merchant_code)
      ORDER BY p.created_at DESC
      LIMIT p_limit
    ) t
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.be_reject_blk_client_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF upper(coalesce(to_jsonb(NEW)->>'merchant_code','')) IN ('BBB','BLK') THEN
    RAISE EXCEPTION 'BBB/BLK is an internal non-billable consolidated container. Invoice the original parcel merchant.'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;
