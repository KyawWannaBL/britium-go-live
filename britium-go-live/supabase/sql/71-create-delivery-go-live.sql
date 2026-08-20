-- ============================================================
-- Britium Express: 71-create-delivery-go-live.sql
-- ============================================================

-- ── Tariff calculator ────────────────────────────────────────

-- Britium compatibility: drop exact tariff overload before recreation.
-- Required when return type changed between old and clean SQL packages.
DROP FUNCTION IF EXISTS public.be_calculate_tariff(text, numeric, boolean) CASCADE;

CREATE OR REPLACE FUNCTION public.be_calculate_tariff(
  p_tier TEXT, p_weight NUMERIC, p_highway BOOLEAN DEFAULT FALSE
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_allowance INT; v_base_fee INT; v_extra_kg INT; v_surcharge INT; v_highway_fee INT;
BEGIN
  CASE p_tier
    WHEN 'Standard'   THEN v_allowance := 3; v_base_fee := 4000;
    WHEN 'Royal'      THEN v_allowance := 5; v_base_fee := 4000;
    WHEN 'Commitment' THEN v_allowance := 5; v_base_fee := 3500;
    ELSE RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END CASE;
  v_extra_kg   := GREATEST(0, CEIL(p_weight)::INT - v_allowance);
  v_surcharge  := v_extra_kg * 500;
  v_highway_fee := CASE WHEN p_highway THEN 3000 ELSE 0 END;
  RETURN json_build_object(
    'tier', p_tier, 'weight', p_weight, 'ceiling_weight', CEIL(p_weight),
    'allowance', v_allowance, 'extra_kg', v_extra_kg,
    'base_fee', v_base_fee, 'surcharge', v_surcharge, 'highway_fee', v_highway_fee,
    'total', v_base_fee + v_surcharge + v_highway_fee
  );
END;
$$;

-- ── Merchant dropdown ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_get_merchants_dropdown()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_agg(row_to_json(t)) FROM (
    SELECT merchant_id, merchant_code, merchant_name, contact_phone,
           pickup_address, pickup_township, pickup_city,
           payment_profile, service_profile, tariff_tier
    FROM public.be_masterdata_merchants WHERE status='active' ORDER BY merchant_name
  ) t);
END;
$$;

-- ── Create delivery ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_create_delivery(p_payload JSON)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_user_id UUID := auth.uid();
  v_pickup_id TEXT; v_deliver_id TEXT; v_invoice_no TEXT; v_waybill_no TEXT;
  v_date TEXT := TO_CHAR(NOW(),'MMDD');
  v_code TEXT; v_count INT; v_new_id UUID;
  v_tariff JSON;
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry') THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- Validate required fields
  IF p_payload->>'merchant_code' IS NULL OR p_payload->>'recipient_phone' IS NULL THEN
    RAISE EXCEPTION 'merchant_code and recipient_phone are required';
  END IF;
  -- Phone format check
  IF NOT ((p_payload->>'recipient_phone') ~ '^(09|\\+959)[0-9]{7,9}$') THEN
    RAISE EXCEPTION 'Invalid phone format: %', p_payload->>'recipient_phone';
  END IF;
  -- Generate IDs
  v_code := UPPER(SUBSTRING(p_payload->>'merchant_code',1,3));
  SELECT COALESCE(MAX((split_part(pickup_id,'-',3))::INT),0)+1 INTO v_count
  FROM public.be_portal_pickup_requests
  WHERE pickup_id LIKE 'P'||v_date||'-'||v_code||'-%';
  v_pickup_id  := 'P'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  v_deliver_id := 'D'||v_date||'-'||v_code||'-'||LPAD((v_count+1)::TEXT,3,'0');
  v_invoice_no := 'I'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  v_waybill_no := 'W'||v_date||'-'||v_code||'-'||LPAD(v_count::TEXT,3,'0');
  -- Branch resolution
  v_branch := CASE
    WHEN lower(p_payload->>'pickup_city') LIKE '%mandalay%' OR lower(p_payload->>'pickup_city') LIKE '%mdy%' THEN 'MDY'
    WHEN lower(p_payload->>'pickup_city') LIKE '%naypyi%' OR lower(p_payload->>'pickup_city') LIKE '%npt%' THEN 'NPT'
    ELSE 'YGN'
  END;
  -- Tariff calculation
  v_tariff := public.be_calculate_tariff(
    COALESCE(p_payload->>'service_tier','Standard'),
    COALESCE((p_payload->>'weight_kg')::NUMERIC, 0),
    COALESCE((p_payload->>'highway_dropoff')::BOOLEAN, FALSE)
  );
  -- Insert record
  INSERT INTO public.be_portal_pickup_requests (
    pickup_id, deliver_id, invoice_no, waybill_no,
    merchant_id, merchant_code, merchant_name,
    sender_phone, pickup_address, pickup_township, pickup_city,
    recipient_name, recipient_phone, delivery_township, delivery_address,
    service_tier, priority, payment_method, cod_amount,
    weight_kg, delivery_fee, status, branch_code,
    requester_type, created_by, created_at, updated_at
  ) VALUES (
    v_pickup_id, v_deliver_id, v_invoice_no, v_waybill_no,
    p_payload->>'merchant_id', p_payload->>'merchant_code', p_payload->>'merchant_name',
    p_payload->>'sender_phone', p_payload->>'pickup_address', p_payload->>'pickup_township', p_payload->>'pickup_city',
    p_payload->>'recipient_name', p_payload->>'recipient_phone', p_payload->>'delivery_township', p_payload->>'delivery_address',
    COALESCE(p_payload->>'service_tier','Standard'),
    COALESCE(p_payload->>'priority','NORMAL'),
    COALESCE(p_payload->>'payment_method','COD'),
    COALESCE((p_payload->>'cod_amount')::NUMERIC, 0),
    COALESCE((p_payload->>'weight_kg')::NUMERIC, 0),
    (v_tariff->>'total')::NUMERIC,
    'SUBMITTED', v_branch, 'PORTAL', v_user_id, NOW(), NOW()
  ) RETURNING id INTO v_new_id;
  -- Create initial cargo event
  INSERT INTO public.be_portal_cargo_events (pickup_id, event_type, description, actor_role, created_at)
  VALUES (v_pickup_id, 'SUBMITTED', 'Shipment created via Portal', v_role, NOW());
  RETURN json_build_object(
    'success', true, 'pickup_id', v_pickup_id, 'deliver_id', v_deliver_id,
    'invoice_no', v_invoice_no, 'waybill_no', v_waybill_no,
    'branch', v_branch, 'tariff', v_tariff, 'id', v_new_id
  );
END;
$$;

-- ── Permissions ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff(TEXT, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_get_merchants_dropdown TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_create_delivery TO authenticated;

-- ── Verification ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_create_delivery_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_calculate_tariff','be_get_merchants_dropdown','be_create_delivery')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_create_delivery_go_live_verification TO authenticated;
