-- BLK is an internal pickup container, never a parcel billing merchant.
-- Parcel calculations resolve the original merchant against the active master.
BEGIN;

INSERT INTO public.be_masterdata_merchants
  (merchant_id, merchant_code, merchant_name, payment_profile, service_profile, tariff_tier, status)
VALUES ('BLK', 'BLK', 'Consolidated Bulk', 'INTERNAL_NON_BILLABLE', 'CONSOLIDATED_CONTAINER', 'INTERNAL_ZERO', 'active')
ON CONFLICT (merchant_code) DO NOTHING;

DO $migration$
DECLARE definition text; marker text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.be_masterdata_merchants
    WHERE merchant_code='BLK' AND merchant_name='Consolidated Bulk'
      AND payment_profile='INTERNAL_NON_BILLABLE') THEN
    RAISE EXCEPTION 'BLK already belongs to another merchant; aborting';
  END IF;
  SELECT pg_get_functiondef('public.be_data_entry_financial_v2_calculate(jsonb)'::regprocedure) INTO definition;
  marker := '  v_result := public.be_data_entry_financial_v2_calculate_v21_legacy(v_payload);';
  IF position('CONSOLIDATED_SOURCE_MERCHANT_REQUIRED' in definition)=0 THEN
    IF position(marker in definition)=0 THEN RAISE EXCEPTION 'Calculation function changed; review required'; END IF;
    definition := replace(definition, marker, $replacement$
  -- Resolve only an exact, unique active master match. No name guessing.
  if v_merchant='BLK' then
    if (select count(*) from public.be_masterdata_merchants m
        where m.status='active' and m.merchant_code<>'BLK'
        and (lower(btrim(m.merchant_code))=lower(btrim(coalesce(v_payload->>'source_merchant_name','')))
          or lower(btrim(m.merchant_name))=lower(btrim(coalesce(v_payload->>'source_merchant_name',''))))) <> 1 then
      return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object(
        'code','CONSOLIDATED_SOURCE_MERCHANT_REQUIRED','field','source_merchant_name',
        'message','Select an exact active original merchant for this BLK parcel. The container cannot be billed.')));
    end if;
    select upper(m.merchant_code) into v_merchant from public.be_masterdata_merchants m
      where m.status='active' and m.merchant_code<>'BLK'
        and (lower(btrim(m.merchant_code))=lower(btrim(v_payload->>'source_merchant_name'))
          or lower(btrim(m.merchant_name))=lower(btrim(v_payload->>'source_merchant_name')));
    v_payload := v_payload || jsonb_build_object('merchant_id',v_merchant,'container_merchant_code','BLK');
  end if;
  v_result := public.be_data_entry_financial_v2_calculate_v21_legacy(v_payload);
  if v_payload->>'container_merchant_code'='BLK' and coalesce((v_result->>'ok')::boolean,false) then
    v_result := jsonb_set(v_result,'{data}',coalesce(v_result->'data','{}'::jsonb)||jsonb_build_object(
      'source_merchant_name',v_payload->>'source_merchant_name','container_merchant_code','BLK'));
  end if;
$replacement$);
    EXECUTE definition;
  END IF;
END
$migration$;

DO $invoice_list$
DECLARE definition text; marker text := 'WHERE (p_status IS NULL OR p.status=p_status)';
BEGIN
  SELECT pg_get_functiondef('public.be_invoice_list(text,text,integer)'::regprocedure) INTO definition;
  IF position('upper(coalesce(p.merchant_code' in definition)=0 THEN
    IF position(marker in definition)=0 THEN RAISE EXCEPTION 'Invoice list changed; review required'; END IF;
    EXECUTE replace(definition, marker, 'WHERE upper(coalesce(p.merchant_code,''''))<>''BLK'' AND (p_status IS NULL OR p.status=p_status)');
  END IF;
END
$invoice_list$;

-- Reject client-invoice writes for the internal container at the database boundary.
CREATE OR REPLACE FUNCTION public.be_reject_blk_client_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF upper(coalesce(to_jsonb(NEW)->>'merchant_code',''))='BLK' THEN
    RAISE EXCEPTION 'BLK is an internal non-billable container. Invoice the original parcel merchant.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.be_reject_blk_client_invoice() FROM PUBLIC;

DO $guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['be_customer_invoices','be_finance_invoice_bridge','be_finance_invoices','be_invoice_ledger','be_invoice_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS be_reject_blk_client_invoice ON public.%I',target);
    EXECUTE format('CREATE TRIGGER be_reject_blk_client_invoice BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.be_reject_blk_client_invoice()',target);
  END LOOP;
END
$guards$;
COMMIT;
