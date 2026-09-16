-- V42 regression contract: Wayplan merchant identity falls back to Merchant Master via the 3-character WayID code.
-- Run after the V42 migration in a Supabase SQL test environment.

DO $$
DECLARE
  v_master_name text;
  v_code text;
  v_name text;
  v_source text;
BEGIN
  SELECT NULLIF(btrim(r.payload->>'merchant_name'), '')
    INTO v_master_name
    FROM public.be_v_master_data_live_rows r
   WHERE r.dataset_key IN ('merchant_master', 'merchants')
     AND upper(coalesce(NULLIF(btrim(r.payload->>'merchant_code'), ''), r.record_key)) = 'KSC'
   LIMIT 1;

  IF v_master_name IS NULL THEN
    RAISE EXCEPTION 'Fixture prerequisite failed: active Merchant Master entry KSC was not found';
  END IF;

  SELECT merchant_code, merchant_name, merchant_source
    INTO v_code, v_name, v_source
    FROM public.be_wayplan_resolve_merchant_identity('D0902-KSC-359', '');

  IF v_code IS DISTINCT FROM 'KSC' THEN
    RAISE EXCEPTION 'Expected merchant code KSC, got %', v_code;
  END IF;
  IF v_name IS DISTINCT FROM v_master_name THEN
    RAISE EXCEPTION 'Expected KSC Merchant Master name %, got %', v_master_name, v_name;
  END IF;
  IF v_source IS DISTINCT FROM 'WAY_ID_MERCHANT_MASTER' THEN
    RAISE EXCEPTION 'Expected WAY_ID_MERCHANT_MASTER source, got %', v_source;
  END IF;

  SELECT merchant_code, merchant_name, merchant_source
    INTO v_code, v_name, v_source
    FROM public.be_wayplan_resolve_merchant_identity('D0902-KSC-359', 'Authoritative Saved Merchant');

  IF v_name IS DISTINCT FROM 'Authoritative Saved Merchant' OR v_source IS DISTINCT FROM 'SAVED' THEN
    RAISE EXCEPTION 'Saved merchant must remain authoritative; got name %, source %', v_name, v_source;
  END IF;

  SELECT merchant_code, merchant_name, merchant_source
    INTO v_code, v_name, v_source
    FROM public.be_wayplan_resolve_merchant_identity('NOT-A-WAY-ID', '');

  IF v_code IS NOT NULL OR coalesce(v_name, '') <> '' OR v_source IS DISTINCT FROM 'UNRESOLVED' THEN
    RAISE EXCEPTION 'Malformed WayID must remain unresolved; got code %, name %, source %', v_code, v_name, v_source;
  END IF;
END;
$$;
