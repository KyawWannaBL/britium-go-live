-- Package 09: Branch Office RPCs

-- Branch snapshot (YGN / MDY / NPT)
CREATE OR REPLACE FUNCTION public.be_branch_snapshot(p_branch TEXT)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_allowed_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','branch_office','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  -- Branch office role can only see own branch
  IF v_role = 'branch_office' THEN
    SELECT branch_code INTO v_allowed_branch FROM public.be_user_account_registry WHERE auth_user_id=auth.uid() LIMIT 1;
    IF v_allowed_branch != p_branch THEN RAISE EXCEPTION 'Access denied to branch %', p_branch; END IF;
  END IF;
  RETURN (SELECT json_build_object(
    'branch', p_branch,
    'today', json_build_object(
      'new_shipments', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND created_at::DATE=CURRENT_DATE),
      'delivered', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND updated_at::DATE=CURRENT_DATE),
      'failed', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='FAILED_DELIVERY' AND updated_at::DATE=CURRENT_DATE),
      'in_transit', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='IN_TRANSIT'),
      'revenue', (SELECT COALESCE(SUM(delivery_fee),0) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND updated_at::DATE=CURRENT_DATE)
    ),
    'this_month', json_build_object(
      'new_shipments', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())),
      'delivered', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND DATE_TRUNC('month',updated_at)=DATE_TRUNC('month',NOW())),
      'revenue', (SELECT COALESCE(SUM(delivery_fee),0) FROM public.be_portal_pickup_requests WHERE branch_code=p_branch AND status='DELIVERED' AND DATE_TRUNC('month',updated_at)=DATE_TRUNC('month',NOW()))
    ),
    'staff', (SELECT COALESCE(json_agg(row_to_json(u)),'[]'::json) FROM (
      SELECT user_id, full_name, role, phone_number, status FROM public.be_user_account_registry WHERE branch_code=p_branch AND status='active' ORDER BY role, full_name
    ) u),
    'recent_shipments', (SELECT COALESCE(json_agg(row_to_json(s)),'[]'::json) FROM (
      SELECT pickup_id, merchant_name, recipient_name, delivery_township, status, created_at
      FROM public.be_portal_pickup_requests WHERE branch_code=p_branch ORDER BY created_at DESC LIMIT 10
    ) s)
  ));
END;
$$;

-- List all branches with summary
CREATE OR REPLACE FUNCTION public.be_branch_list()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(b)),'[]'::json) FROM (
    SELECT branch_code,
           COUNT(*) AS total_shipments,
           COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
           COUNT(*) FILTER (WHERE status='IN_TRANSIT') AS in_transit,
           COUNT(*) FILTER (WHERE created_at::DATE=CURRENT_DATE) AS today
    FROM public.be_portal_pickup_requests
    GROUP BY branch_code ORDER BY branch_code
  ) b);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_branch_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_list TO authenticated;

CREATE OR REPLACE FUNCTION public.be_branch_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_branch_snapshot','be_branch_list')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_branch_go_live_verification TO authenticated;
