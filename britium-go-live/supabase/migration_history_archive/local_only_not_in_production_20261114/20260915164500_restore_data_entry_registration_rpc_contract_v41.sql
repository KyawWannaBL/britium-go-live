-- Restore the Data Entry registration RPC contract used by DataEntryRegistrationStablePage.
-- The physical table already exists; this migration intentionally does not create a duplicate table.
-- V41 / 2026-09-15

CREATE OR REPLACE FUNCTION public.be_data_entry_load_registration_lines_v5(
  p_pickup_id text
)
RETURNS TABLE (
  line_no integer,
  recipient_name text,
  contact_no_1 text,
  contact_no_2 text,
  township text,
  recipient_address text,
  customer_tier text,
  item_price numeric,
  weight_kg numeric,
  surcharge numeric,
  total_delivery_fee numeric,
  cod numeric,
  actual_collect numeric,
  remark text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pickup_id text := NULLIF(BTRIM(COALESCE(p_pickup_id, '')), '');
BEGIN
  PERFORM public.be_data_entry_require_access_v57('view', false);

  IF v_pickup_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pickup_id is required';
  END IF;

  RETURN QUERY
  SELECT
    r.line_no,
    r.recipient_name,
    r.contact_no_1,
    r.contact_no_2,
    r.township,
    r.recipient_address,
    COALESCE(NULLIF(BTRIM(r.customer_tier), ''), 'STANDARD') AS customer_tier,
    COALESCE(r.item_price, 0) AS item_price,
    COALESCE(r.weight_kg, 1) AS weight_kg,
    COALESCE(r.surcharge, 0) AS surcharge,
    COALESCE(r.total_delivery_fee, 0) AS total_delivery_fee,
    COALESCE(r.cod, 0) AS cod,
    COALESCE(r.actual_collect, 0) AS actual_collect,
    r.remark
  FROM public.be_data_entry_registration_lines r
  WHERE r.pickup_id = v_pickup_id
  ORDER BY r.line_no;
END;
$$;

REVOKE ALL ON FUNCTION public.be_data_entry_load_registration_lines_v5(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.be_data_entry_load_registration_lines_v5(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_load_registration_lines_v5(text) TO service_role;

CREATE OR REPLACE FUNCTION public.be_data_entry_submit_all_info_v5(
  p_pickup_id text,
  p_rows jsonb,
  p_actor_email text DEFAULT NULL,
  p_submit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_access jsonb;
  v_pickup_id text := NULLIF(BTRIM(COALESCE(p_pickup_id, '')), '');
  v_rows jsonb := COALESCE(p_rows, '[]'::jsonb);
  v_actor_email text;
  v_saved_count integer := 0;
  v_registered_count integer := 0;
  v_expected_count integer := 0;
  v_is_complete boolean := false;
BEGIN
  v_access := public.be_data_entry_require_access_v57('update', false);

  IF v_pickup_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pickup_id is required';
  END IF;

  IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_rows must be a JSON array';
  END IF;

  IF jsonb_array_length(v_rows) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At least one registration row is required';
  END IF;

  v_actor_email := COALESCE(
    NULLIF(LOWER(BTRIM(v_access->>'actor_email')), ''),
    NULLIF(LOWER(BTRIM(COALESCE(p_actor_email, ''))), '')
  );

  -- Draft saves replace only draft rows. Submitted rows are never erased by a later draft save.
  IF NOT COALESCE(p_submit, false) THEN
    DELETE FROM public.be_data_entry_registration_lines
    WHERE pickup_id = v_pickup_id
      AND COALESCE(submitted, false) = false;
  END IF;

  INSERT INTO public.be_data_entry_registration_lines (
    pickup_id,
    line_no,
    recipient_name,
    contact_no_1,
    contact_no_2,
    township,
    recipient_address,
    customer_tier,
    item_price,
    weight_kg,
    surcharge,
    total_delivery_fee,
    cod,
    actual_collect,
    remark,
    submitted,
    actor_email,
    raw_row,
    updated_at
  )
  SELECT
    v_pickup_id,
    COALESCE(NULLIF(BTRIM(e.item->>'line_no'), '')::integer, e.ordinality::integer),
    NULLIF(BTRIM(e.item->>'recipient_name'), ''),
    NULLIF(BTRIM(e.item->>'contact_no_1'), ''),
    NULLIF(BTRIM(e.item->>'contact_no_2'), ''),
    NULLIF(BTRIM(e.item->>'township'), ''),
    NULLIF(BTRIM(e.item->>'recipient_address'), ''),
    COALESCE(NULLIF(UPPER(BTRIM(e.item->>'customer_tier')), ''), 'STANDARD'),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'item_price'), ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'weight_kg'), ',', ''), '')::numeric, 1),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'surcharge'), ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'total_delivery_fee'), ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'cod'), ',', ''), '')::numeric, 0),
    COALESCE(NULLIF(REPLACE(BTRIM(e.item->>'actual_collect'), ',', ''), '')::numeric, 0),
    NULLIF(BTRIM(e.item->>'remark'), ''),
    COALESCE(p_submit, false),
    v_actor_email,
    e.item,
    now()
  FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS e(item, ordinality)
  ON CONFLICT (pickup_id, line_no) DO UPDATE
  SET
    recipient_name = EXCLUDED.recipient_name,
    contact_no_1 = EXCLUDED.contact_no_1,
    contact_no_2 = EXCLUDED.contact_no_2,
    township = EXCLUDED.township,
    recipient_address = EXCLUDED.recipient_address,
    customer_tier = EXCLUDED.customer_tier,
    item_price = EXCLUDED.item_price,
    weight_kg = EXCLUDED.weight_kg,
    surcharge = EXCLUDED.surcharge,
    total_delivery_fee = EXCLUDED.total_delivery_fee,
    cod = EXCLUDED.cod,
    actual_collect = EXCLUDED.actual_collect,
    remark = EXCLUDED.remark,
    submitted = public.be_data_entry_registration_lines.submitted OR EXCLUDED.submitted,
    actor_email = COALESCE(EXCLUDED.actor_email, public.be_data_entry_registration_lines.actor_email),
    raw_row = EXCLUDED.raw_row,
    updated_at = now();

  GET DIAGNOSTICS v_saved_count = ROW_COUNT;

  SELECT COUNT(*)::integer
  INTO v_registered_count
  FROM public.be_data_entry_registration_lines r
  WHERE r.pickup_id = v_pickup_id
    AND COALESCE(r.submitted, false) = true;

  IF COALESCE(p_submit, false) THEN
    SELECT GREATEST(
      COALESCE(MAX(p.expected_parcels), 0),
      COALESCE(MAX(p.expected_parcel_count), 0),
      1
    )::integer
    INTO v_expected_count
    FROM public.be_portal_pickup_requests p
    WHERE p.pickup_id = v_pickup_id
       OR p.pickup_way_id = v_pickup_id;

    v_expected_count := GREATEST(COALESCE(v_expected_count, 0), 1);
    v_is_complete := v_registered_count >= v_expected_count;

    UPDATE public.be_portal_pickup_requests p
    SET
      registered_parcel_count = v_registered_count,
      data_entry_status = CASE
        WHEN v_is_complete THEN 'PARCEL_BULK_LOADED'
        ELSE 'PARTIAL_PARCEL_REGISTERED'
      END,
      workflow_stage = CASE
        WHEN v_is_complete THEN 'WAITING_WAREHOUSE_RECEIVE'
        ELSE 'PARTIAL_DATA_ENTRY'
      END,
      warehouse_status = CASE
        WHEN v_is_complete THEN 'WAITING_WAREHOUSE_RECEIVE'
        WHEN v_registered_count > 0 THEN 'PARTIAL_WAREHOUSE_RECEIVE_ALLOWED'
        ELSE p.warehouse_status
      END,
      updated_at = now()
    WHERE p.pickup_id = v_pickup_id
       OR p.pickup_way_id = v_pickup_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'be_data_entry_submit_all_info_v5',
    'pickup_id', v_pickup_id,
    'saved_count', v_saved_count,
    'registered_count', v_registered_count,
    'expected_count', v_expected_count,
    'submitted', COALESCE(p_submit, false),
    'complete', v_is_complete,
    'message', CASE
      WHEN COALESCE(p_submit, false) AND v_is_complete
        THEN 'Registration submitted. Pickup is ready for Warehouse Receive.'
      WHEN COALESCE(p_submit, false)
        THEN 'Approved registration rows submitted. Remaining parcels stay open for re-upload.'
      ELSE 'Registration draft saved.'
    END,
    'access', v_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.be_data_entry_submit_all_info_v5(text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.be_data_entry_submit_all_info_v5(text, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_submit_all_info_v5(text, jsonb, text, boolean) TO service_role;
