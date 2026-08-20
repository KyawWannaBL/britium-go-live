-- Package 08: Dispatch Center RPCs

-- Workforce roster (riders/drivers available today)
CREATE OR REPLACE FUNCTION public.be_dispatch_workforce(p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT u.user_id, u.full_name, u.role, u.phone_number, u.branch_code,
           u.vehicle_type, u.license_plate,
           COUNT(p.pickup_id) FILTER (WHERE p.status='IN_TRANSIT') AS active_assignments,
           COUNT(p.pickup_id) FILTER (WHERE p.status='DELIVERED' AND p.created_at::DATE=CURRENT_DATE) AS delivered_today,
           u.status AS availability_status
    FROM public.be_user_account_registry u
    LEFT JOIN public.be_portal_pickup_requests p ON p.assigned_rider_id::TEXT = u.user_id::TEXT
    WHERE u.role IN ('rider','driver') AND u.status='active'
      AND (p_branch IS NULL OR u.branch_code=p_branch)
    GROUP BY u.user_id, u.full_name, u.role, u.phone_number, u.branch_code, u.vehicle_type, u.license_plate, u.status
    ORDER BY active_assignments ASC, u.full_name
  ) t);
END;
$$;

-- Get unassigned shipments ready for dispatch
CREATE OR REPLACE FUNCTION public.be_dispatch_unassigned(p_branch TEXT DEFAULT NULL, p_limit INT DEFAULT 100)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, waybill_no, merchant_name,
           recipient_name, recipient_phone, delivery_address, delivery_township,
           service_tier, priority, payment_method, cod_amount, delivery_fee, branch_code, created_at
    FROM public.be_portal_pickup_requests
    WHERE assigned_rider_id IS NULL
      AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP')
      AND (p_branch IS NULL OR branch_code=p_branch)
    ORDER BY CASE priority WHEN 'SAME_DAY' THEN 1 WHEN 'EXPRESS' THEN 2 ELSE 3 END, created_at ASC
    LIMIT p_limit
  ) t);
END;
$$;

-- Bulk assign shipments to rider/driver
CREATE OR REPLACE FUNCTION public.be_dispatch_assign(
  p_pickup_ids TEXT[], p_assignee_id UUID, p_assignee_name TEXT, p_route_label TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests
  SET assigned_rider_id=p_assignee_id, status='IN_TRANSIT', route_label=p_route_label, updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  SELECT pid,'ASSIGNED','Assigned to '||p_assignee_name||(CASE WHEN p_route_label IS NOT NULL THEN ' — route: '||p_route_label ELSE '' END), v_role, NOW()
  FROM UNNEST(p_pickup_ids) AS pid;
  RETURN json_build_object('success',true,'assigned',v_count,'assignee',p_assignee_name,'route',p_route_label);
END;
$$;

-- Dispatch summary counters
CREATE OR REPLACE FUNCTION public.be_dispatch_summary(p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','dispatch','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'unassigned', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE assigned_rider_id IS NULL AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP') AND (p_branch IS NULL OR branch_code=p_branch)),
    'in_transit', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_TRANSIT' AND (p_branch IS NULL OR branch_code=p_branch)),
    'delivered_today', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='DELIVERED' AND created_at::DATE=CURRENT_DATE AND (p_branch IS NULL OR branch_code=p_branch)),
    'failed_today', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='FAILED_DELIVERY' AND updated_at::DATE=CURRENT_DATE AND (p_branch IS NULL OR branch_code=p_branch)),
    'active_riders', (SELECT COUNT(*) FROM public.be_user_account_registry WHERE role IN ('rider','driver') AND status='active' AND (p_branch IS NULL OR branch_code=p_branch))
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_dispatch_workforce TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_unassigned TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_assign TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dispatch_summary TO authenticated;

CREATE OR REPLACE FUNCTION public.be_dispatch_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_dispatch_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_dispatch_go_live_verification TO authenticated;
