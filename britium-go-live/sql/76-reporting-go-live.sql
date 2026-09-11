-- Package 07: Reporting RPCs

-- Operational report (period summary)
CREATE OR REPLACE FUNCTION public.be_report_operational(p_from DATE, p_to DATE, p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','auditor','finance') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'period', json_build_object('from',p_from,'to',p_to),
    'branch', COALESCE(p_branch,'ALL'),
    'totals', (SELECT row_to_json(t) FROM (
      SELECT COUNT(*) AS total_shipments,
             COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
             COUNT(*) FILTER (WHERE status IN ('FAILED_DELIVERY','RETURN_INITIATED','RETURNED')) AS failed,
             COUNT(*) FILTER (WHERE status='HOLD') AS on_hold,
             ROUND(COUNT(*) FILTER (WHERE status='DELIVERED')::NUMERIC / NULLIF(COUNT(*),0)*100,1) AS delivery_rate_pct,
             COALESCE(SUM(delivery_fee),0) AS total_delivery_fee,
             COALESCE(SUM(cod_amount) FILTER (WHERE payment_method='COD'),0) AS total_cod_collected,
             COALESCE(AVG(weight_kg),0) AS avg_weight_kg
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to
        AND (p_branch IS NULL OR branch_code=p_branch)
    ) t),
    'by_status', (SELECT COALESCE(json_agg(row_to_json(s)),'[]'::json) FROM (
      SELECT status, COUNT(*) AS count,
             ROUND(COUNT(*)::NUMERIC/NULLIF((SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE created_at::DATE BETWEEN p_from AND p_to),0)*100,1) AS pct
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY status ORDER BY count DESC
    ) s),
    'by_day', (SELECT COALESCE(json_agg(row_to_json(d)),'[]'::json) FROM (
      SELECT created_at::DATE AS date,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status='DELIVERED') AS delivered,
             COALESCE(SUM(delivery_fee),0) AS revenue
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY created_at::DATE ORDER BY date
    ) d),
    'by_tier', (SELECT COALESCE(json_agg(row_to_json(ti)),'[]'::json) FROM (
      SELECT service_tier, COUNT(*) AS count, COALESCE(SUM(delivery_fee),0) AS revenue
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to AND (p_branch IS NULL OR branch_code=p_branch)
      GROUP BY service_tier ORDER BY count DESC
    ) ti)
  ));
END;
$$;

-- Finance report (COD vs Prepaid breakdown)
CREATE OR REPLACE FUNCTION public.be_report_finance(p_from DATE, p_to DATE)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','finance','accountant','auditor','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'period', json_build_object('from',p_from,'to',p_to),
    'by_payment', (SELECT COALESCE(json_agg(row_to_json(p)),'[]'::json) FROM (
      SELECT payment_method, COUNT(*) AS count,
             COALESCE(SUM(delivery_fee),0) AS total_fee,
             COALESCE(SUM(cod_amount),0) AS total_cod
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to GROUP BY payment_method
    ) p),
    'by_merchant', (SELECT COALESCE(json_agg(row_to_json(m)),'[]'::json) FROM (
      SELECT merchant_code, merchant_name, COUNT(*) AS shipments,
             COALESCE(SUM(delivery_fee),0) AS total_fee,
             COALESCE(SUM(cod_amount) FILTER (WHERE payment_method='COD'),0) AS cod_amount
      FROM public.be_portal_pickup_requests
      WHERE created_at::DATE BETWEEN p_from AND p_to GROUP BY merchant_code, merchant_name ORDER BY total_fee DESC LIMIT 20
    ) m)
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_report_operational TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_report_finance TO authenticated;

CREATE OR REPLACE FUNCTION public.be_reporting_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_report_operational','be_report_finance')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_reporting_go_live_verification TO authenticated;
