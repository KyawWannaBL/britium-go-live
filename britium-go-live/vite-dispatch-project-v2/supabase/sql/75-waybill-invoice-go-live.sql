-- Package 06: Waybill & Invoice RPCs

-- Label queue (waybills ready for printing)
CREATE OR REPLACE FUNCTION public.be_label_queue(
  p_status TEXT DEFAULT NULL, p_merchant_code TEXT DEFAULT NULL, p_limit INT DEFAULT 50
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry','finance','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, deliver_id, waybill_no, invoice_no,
           merchant_name, merchant_code,
           recipient_name, recipient_phone, delivery_address, delivery_township,
           service_tier, weight_kg, delivery_fee,
           payment_method, cod_amount, status, waybill_printed_at, created_at
    FROM public.be_portal_pickup_requests
    WHERE (p_status IS NULL OR status=p_status)
      AND (p_merchant_code IS NULL OR merchant_code=p_merchant_code)
    ORDER BY created_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Mark waybill as printed
CREATE OR REPLACE FUNCTION public.be_mark_waybill_printed(p_pickup_ids TEXT[])
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','cs','data_entry') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET waybill_printed_at=NOW(), updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('success',true,'updated',v_count,'ts',NOW());
END;
$$;

-- Invoice list for finance review
CREATE OR REPLACE FUNCTION public.be_invoice_list(
  p_status TEXT DEFAULT NULL, p_merchant_code TEXT DEFAULT NULL, p_limit INT DEFAULT 50
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','auditor','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT p.pickup_id, p.invoice_no, p.merchant_name, p.merchant_code,
           p.recipient_name, p.delivery_fee, p.cod_amount, p.payment_method,
           p.status, p.invoice_approved, p.invoice_approved_at, p.created_at,
           p.service_tier, p.weight_kg
    FROM public.be_portal_pickup_requests p
    WHERE (p_status IS NULL OR p.status=p_status)
      AND (p_merchant_code IS NULL OR p.merchant_code=p_merchant_code)
    ORDER BY p.created_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Approve / reject invoice
CREATE OR REPLACE FUNCTION public.be_invoice_approve(p_pickup_id TEXT, p_approved BOOLEAN, p_notes TEXT DEFAULT '')
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET invoice_approved=p_approved,
      invoice_approved_at=CASE WHEN p_approved THEN NOW() ELSE NULL END,
      invoice_notes=p_notes,
      updated_at=NOW()
  WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,CASE WHEN p_approved THEN 'INVOICE_APPROVED' ELSE 'INVOICE_REJECTED' END, COALESCE(p_notes,''), v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'approved',p_approved);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_label_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_mark_waybill_printed TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_invoice_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_invoice_approve TO authenticated;

CREATE OR REPLACE FUNCTION public.be_waybill_invoice_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_label_queue','be_mark_waybill_printed','be_invoice_list','be_invoice_approve')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_waybill_invoice_go_live_verification TO authenticated;
