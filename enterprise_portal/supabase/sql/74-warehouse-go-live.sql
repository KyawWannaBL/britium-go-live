-- Package 05: Warehouse Operations RPCs

-- Scan intake (mark as received in warehouse)
CREATE OR REPLACE FUNCTION public.be_warehouse_intake_scan(p_pickup_id TEXT, p_location TEXT DEFAULT 'INTAKE')
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_status TEXT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT status INTO v_status FROM public.be_portal_pickup_requests WHERE pickup_id=p_pickup_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Shipment not found: %', p_pickup_id; END IF;
  IF v_status NOT IN ('SUBMITTED','PICKED_UP') THEN RAISE EXCEPTION 'Cannot intake shipment in status: %', v_status; END IF;
  UPDATE public.be_portal_pickup_requests SET status='IN_WAREHOUSE', warehouse_location=p_location, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'INTAKE_SCAN','Received at warehouse — location: '||p_location, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'location',p_location,'prev_status',v_status);
END;
$$;

-- Sort scan (assign to sort zone / route)
CREATE OR REPLACE FUNCTION public.be_warehouse_sort_scan(p_pickup_id TEXT, p_sort_zone TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET warehouse_location=p_sort_zone, updated_at=NOW() WHERE pickup_id=p_pickup_id;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  VALUES(p_pickup_id,'SORT_SCAN','Sorted to zone: '||p_sort_zone, v_role, NOW());
  RETURN json_build_object('success',true,'pickup_id',p_pickup_id,'sort_zone',p_sort_zone);
END;
$$;

-- Dispatch confirmation (mark as dispatched from warehouse)
CREATE OR REPLACE FUNCTION public.be_warehouse_dispatch(p_pickup_ids TEXT[], p_rider_id TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_count INT:=0;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.be_portal_pickup_requests SET status='IN_TRANSIT', assigned_rider_id=p_rider_id, updated_at=NOW()
  WHERE pickup_id=ANY(p_pickup_ids) AND status IN ('IN_WAREHOUSE','SUBMITTED','PICKED_UP');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.be_portal_cargo_events(pickup_id,event_type,description,actor_role,created_at)
  SELECT pid,'DISPATCHED','Dispatched from warehouse to rider: '||p_rider_id, v_role, NOW()
  FROM UNNEST(p_pickup_ids) AS pid;
  RETURN json_build_object('success',true,'dispatched',v_count,'rider_id',p_rider_id);
END;
$$;

-- Warehouse summary
CREATE OR REPLACE FUNCTION public.be_warehouse_summary()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT json_build_object(
    'in_warehouse', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE'),
    'pending_sort', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND (warehouse_location IS NULL OR warehouse_location='INTAKE')),
    'pending_dispatch', (SELECT COUNT(*) FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND warehouse_location IS NOT NULL AND warehouse_location!='INTAKE'),
    'zones', (SELECT COALESCE(json_agg(row_to_json(z)),'[]'::json) FROM (
      SELECT warehouse_location AS zone, COUNT(*) AS count
      FROM public.be_portal_pickup_requests WHERE status='IN_WAREHOUSE' AND warehouse_location IS NOT NULL
      GROUP BY warehouse_location ORDER BY count DESC
    ) z)
  ));
END;
$$;

-- List warehouse items with optional zone/status filter
CREATE OR REPLACE FUNCTION public.be_warehouse_list(p_zone TEXT DEFAULT NULL, p_limit INT DEFAULT 50)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','warehouse','supervisor','dispatch') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT pickup_id, merchant_name, recipient_name, recipient_phone,
           delivery_township, delivery_address, warehouse_location,
           weight_kg, service_tier, status, updated_at
    FROM public.be_portal_pickup_requests
    WHERE status='IN_WAREHOUSE'
      AND (p_zone IS NULL OR warehouse_location=p_zone)
    ORDER BY updated_at ASC LIMIT p_limit
  ) t);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_warehouse_intake_scan TO authenticated;

do $
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_warehouse_sort_scan'
  loop
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end $;
GRANT EXECUTE ON FUNCTION public.be_warehouse_dispatch TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_warehouse_list TO authenticated;

CREATE OR REPLACE FUNCTION public.be_warehouse_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_warehouse_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_warehouse_go_live_verification TO authenticated;
