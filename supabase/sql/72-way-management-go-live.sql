-- ============================================================
-- Britium Express: 72-way-management-go-live.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.be_way_management_list(
  p_status TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL,
  p_branch TEXT DEFAULT NULL, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT CASE WHEN v_role IN ('admin','operation_manager') THEN NULL ELSE branch_code END INTO v_branch
  FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN (SELECT json_build_object(
    'rows', COALESCE((SELECT json_agg(row_to_json(t)) FROM (
      SELECT pickup_id, deliver_id, waybill_no, merchant_name, recipient_name, recipient_phone,
             delivery_address, delivery_township, status, payment_method, cod_amount,
             delivery_fee, branch_code, requester_type, created_at, updated_at
      FROM public.be_portal_pickup_requests
      WHERE status != 'DRAFT'
        AND (p_status IS NULL OR status = p_status)
        AND (v_branch IS NULL OR branch_code = v_branch OR p_branch IS NULL)
        AND (p_search IS NULL OR pickup_id ILIKE '%'||p_search||'%' OR recipient_name ILIKE '%'||p_search||'%' OR waybill_no ILIKE '%'||p_search||'%' OR merchant_name ILIKE '%'||p_search||'%')
      ORDER BY updated_at DESC LIMIT p_limit OFFSET p_offset
    ) t), '[]'::json),
    'total', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status != 'DRAFT' AND (p_status IS NULL OR status=p_status) AND (v_branch IS NULL OR branch_code=v_branch))
  ));
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_management_detail(p_pickup_id TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'shipment', row_to_json(p),
    'events', (SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at),'[]'::json) FROM public.be_portal_cargo_events e WHERE e.pickup_id = p_pickup_id)
  ) FROM public.be_portal_pickup_requests p WHERE p.pickup_id = p_pickup_id LIMIT 1);
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_update_status(p_pickup_id TEXT, p_status TEXT, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_old TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT status INTO v_old FROM public.be_portal_pickup_requests WHERE pickup_id = p_pickup_id;
  UPDATE public.be_portal_pickup_requests SET status=p_status, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'STATUS_UPDATE','Status changed from '||v_old||' to '||p_status||'. Reason: '||p_reason, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'old_status',v_old,'new_status',p_status);
END; $$;

CREATE OR REPLACE FUNCTION public.be_way_initiate_return(p_pickup_id TEXT, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET status='RETURN_INITIATED', updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'RETURN_INITIATED','Return to origin initiated. Reason: '||p_reason, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.be_way_management_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_management_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_update_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_way_initiate_return TO authenticated;

CREATE OR REPLACE FUNCTION public.be_way_management_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_way_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_way_management_go_live_verification TO authenticated;
