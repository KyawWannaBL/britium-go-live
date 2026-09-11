-- ============================================================
-- Britium Express: 70-dashboard-go-live.sql
-- Run in Supabase SQL Editor
-- Depends on: be_user_account_registry, be_portal_pickup_requests,
--             be_portal_cargo_events, be_mobile_workforce_accounts
-- ============================================================

-- ── Helper: resolve current user role ───────────────────────
CREATE OR REPLACE FUNCTION public.be_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT role FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1),
    'guest'
  );
$$;

-- ── Dashboard KPI snapshot ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_kpi_today()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
  v_today DATE := CURRENT_DATE;
  v_res JSON;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance','cs','dispatch','warehouse') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT branch_code INTO v_branch
  FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  SELECT json_build_object(
    'total_pickups_today',     (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE created_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'pending_pickups',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('SUBMITTED','PENDING_ASSIGNMENT') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'active_shipments',        (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'delivered_today',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'DELIVERED' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'failed_today',            (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'FAILED_ATTEMPT' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'returned_today',          (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status = 'RETURNED' AND updated_at::date = v_today AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'pending_cod',             (SELECT COALESCE(SUM(cod_amount),0) FROM public.be_portal_pickup_requests WHERE status = 'DELIVERED' AND payment_method = 'COD' AND cod_settled = false AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'active_riders',           (SELECT COUNT(*) FROM public.be_mobile_workforce_accounts WHERE role_type = 'rider' AND status = 'active'),
    'exceptions_open',         (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status IN ('EXCEPTION','ON_HOLD') AND (v_branch IS NULL OR branch_code = v_branch OR v_role IN ('admin','operation_manager'))),
    'as_of',                   NOW()
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- ── 7-day delivery trend ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_trend_7d()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance','cs','dispatch','warehouse') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT branch_code INTO v_branch FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.day)
    FROM (
      SELECT
        TO_CHAR(d.day,'Mon DD') AS day,
        COALESCE(SUM(CASE WHEN p.status='DELIVERED' THEN 1 ELSE 0 END),0)::int AS delivered,
        COALESCE(SUM(CASE WHEN p.status='FAILED_ATTEMPT' THEN 1 ELSE 0 END),0)::int AS failed,
        COALESCE(SUM(CASE WHEN p.status IN ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY') THEN 1 ELSE 0 END),0)::int AS active
      FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval) d(day)
      LEFT JOIN public.be_portal_pickup_requests p
        ON p.created_at::date = d.day::date
        AND (v_branch IS NULL OR p.branch_code = v_branch OR v_role IN ('admin','operation_manager'))
      GROUP BY d.day
    ) t
  );
END;
$$;

-- ── Module throughput (pickup counts by module/source) ───────
CREATE OR REPLACE FUNCTION public.be_dashboard_module_throughput()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT requester_type AS source,
             COUNT(*)::int AS total,
             SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END)::int AS delivered,
             SUM(CASE WHEN status='FAILED_ATTEMPT' THEN 1 ELSE 0 END)::int AS failed
      FROM public.be_portal_pickup_requests
      WHERE created_at >= CURRENT_DATE - 29
      GROUP BY requester_type
      ORDER BY total DESC
    ) t
  );
END;
$$;

-- ── Recent activity feed ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_activity_feed(p_limit INT DEFAULT 20)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_branch TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','cs','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT branch_code INTO v_branch FROM public.be_user_account_registry WHERE auth_user_id = auth.uid() LIMIT 1;

  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        e.id, e.event_type, e.pickup_id, e.description,
        e.actor_role, e.created_at,
        p.merchant_name, p.status AS current_status
      FROM public.be_portal_cargo_events e
      LEFT JOIN public.be_portal_pickup_requests p ON p.pickup_id = e.pickup_id
      WHERE (v_branch IS NULL OR p.branch_code = v_branch OR v_role IN ('admin','operation_manager'))
      ORDER BY e.created_at DESC
      LIMIT p_limit
    ) t
  );
END;
$$;

-- ── SLA summary (delivery within 24h / 48h) ─────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_sla_summary()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','supervisor','finance') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (
    SELECT json_build_object(
      'total_delivered_7d', COUNT(*),
      'within_24h',  SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 24 THEN 1 ELSE 0 END)::int,
      'within_48h',  SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 48 THEN 1 ELSE 0 END)::int,
      'over_48h',    SUM(CASE WHEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 >  48 THEN 1 ELSE 0 END)::int
    )
    FROM public.be_portal_pickup_requests
    WHERE status = 'DELIVERED' AND updated_at >= CURRENT_DATE - 6
  );
END;
$$;

-- ── Permissions ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.be_dashboard_kpi_today TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_trend_7d TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_module_throughput TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_activity_feed TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_dashboard_sla_summary TO authenticated;

-- ── Verification ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.be_dashboard_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'ok', true,
    'rpc_count', (SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_dashboard_%'),
    'ts', NOW()
  );
$$;
GRANT EXECUTE ON FUNCTION public.be_dashboard_go_live_verification TO authenticated;
