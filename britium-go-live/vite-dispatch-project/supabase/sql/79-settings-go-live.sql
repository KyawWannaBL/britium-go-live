-- Package 10: Settings RPCs

-- Read tariff master config
CREATE OR REPLACE FUNCTION public.be_settings_get_tariff()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json) FROM (
    SELECT tier_name, free_allowance_kg, base_fee_mmk, extra_per_kg_mmk, highway_fee_mmk, is_active, updated_at
    FROM public.be_tariff_master ORDER BY tier_name
  ) t);
END;
$$;

-- Update tariff tier
CREATE OR REPLACE FUNCTION public.be_settings_update_tariff(p_tier TEXT, p_base_fee INT, p_extra_per_kg INT, p_free_kg INT, p_highway_fee INT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.be_tariff_master
  SET base_fee_mmk=p_base_fee, extra_per_kg_mmk=p_extra_per_kg, free_allowance_kg=p_free_kg, highway_fee_mmk=p_highway_fee, updated_at=NOW()
  WHERE tier_name=p_tier;
  -- Audit log
  INSERT INTO public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  VALUES('UPDATE','be_tariff_master',p_tier,NULL,json_build_object('tier',p_tier,'base_fee',p_base_fee,'extra',p_extra_per_kg,'free_kg',p_free_kg,'highway',p_highway_fee),auth.uid(),NOW());
  RETURN json_build_object('success',true,'tier',p_tier,'updated_at',NOW());
END;
$$;

-- List users with roles
CREATE OR REPLACE FUNCTION public.be_settings_users(p_role TEXT DEFAULT NULL, p_branch TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(u)),'[]'::json) FROM (
    SELECT user_id, full_name, role, email, phone_number, branch_code, status, created_at
    FROM public.be_user_account_registry
    WHERE (p_role IS NULL OR role=p_role)
      AND (p_branch IS NULL OR branch_code=p_branch)
    ORDER BY role, full_name
  ) u);
END;
$$;

-- Toggle user active/inactive
CREATE OR REPLACE FUNCTION public.be_settings_toggle_user(p_user_id UUID, p_status TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role NOT IN ('admin','operation_manager') THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_status NOT IN ('active','inactive','suspended') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.be_user_account_registry SET status=p_status, updated_at=NOW() WHERE user_id=p_user_id;
  RETURN json_build_object('success',true,'user_id',p_user_id,'status',p_status);
END;
$$;

-- System config key-value reader
CREATE OR REPLACE FUNCTION public.be_settings_get_config()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(c)),'[]'::json) FROM (
    SELECT config_key, config_value, description, updated_at FROM public.be_system_config ORDER BY config_key
  ) c);
END;
$$;

-- System config upsert
CREATE OR REPLACE FUNCTION public.be_settings_set_config(p_key TEXT, p_value TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role();
BEGIN
  IF v_role != 'admin' THEN RAISE EXCEPTION 'Admin only'; END IF;
  INSERT INTO public.be_system_config(config_key,config_value,updated_at) VALUES(p_key,p_value,NOW())
  ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value, updated_at=NOW();
  RETURN json_build_object('success',true,'key',p_key,'value',p_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_settings_get_tariff TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_update_tariff TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_toggle_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_get_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_settings_set_config TO authenticated;

CREATE OR REPLACE FUNCTION public.be_settings_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'be_settings_%'),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_settings_go_live_verification TO authenticated;
