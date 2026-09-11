-- Package 04: Data Entry / Bulk Upload RPCs

-- Validate a single shipment row (called per CSV row preview)
CREATE OR REPLACE FUNCTION public.be_validate_bulk_row(p_row JSON)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_errors TEXT[] := '{}'; v_merchant_ok BOOLEAN;
BEGIN
  IF p_row->>'recipient_phone' IS NULL OR NOT ((p_row->>'recipient_phone') ~ '^(09|\+959)[0-9]{7,9}$') THEN v_errors := array_append(v_errors,'Invalid phone: '||(p_row->>'recipient_phone')); END IF;
  IF p_row->>'recipient_name' IS NULL OR length(trim(p_row->>'recipient_name'))<2 THEN v_errors := array_append(v_errors,'Recipient name too short'); END IF;
  IF p_row->>'delivery_address' IS NULL OR length(trim(p_row->>'delivery_address'))<5 THEN v_errors := array_append(v_errors,'Delivery address too short'); END IF;
  IF p_row->>'merchant_code' IS NULL THEN v_errors := array_append(v_errors,'merchant_code is required'); END IF;
  IF p_row->>'weight_kg' IS NOT NULL THEN IF (p_row->>'weight_kg')::NUMERIC <= 0 THEN v_errors := array_append(v_errors,'weight_kg must be positive'); END IF; END IF;
  SELECT EXISTS(SELECT 1 FROM public.be_masterdata_merchants WHERE merchant_code=p_row->>'merchant_code' AND status='active') INTO v_merchant_ok;
  IF NOT v_merchant_ok THEN v_errors := array_append(v_errors,'Unknown or inactive merchant: '||(p_row->>'merchant_code')); END IF;
  RETURN json_build_object('valid', array_length(v_errors,1) IS NULL, 'errors', to_json(v_errors));
END;
$$;

-- Get bulk upload history for current user
CREATE OR REPLACE FUNCTION public.be_bulk_upload_history(p_limit INT DEFAULT 20)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_role TEXT := public.be_current_user_role(); v_uid UUID := auth.uid();
BEGIN
  IF v_role NOT IN ('admin','operation_manager','data_entry','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN (SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.uploaded_at DESC),'[]'::json) FROM (
    SELECT batch_id, original_filename, total_rows, valid_rows, invalid_rows,
           status, error_summary, uploaded_by, uploaded_at
    FROM public.be_bulk_upload_batches
    WHERE uploaded_by = v_uid
    ORDER BY uploaded_at DESC LIMIT p_limit
  ) t);
END;
$$;

-- Submit validated bulk batch
CREATE OR REPLACE FUNCTION public.be_bulk_submit_batch(p_rows JSON, p_filename TEXT)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  v_role TEXT := public.be_current_user_role();
  v_uid UUID := auth.uid();
  v_batch_id TEXT := 'BATCH'||TO_CHAR(NOW(),'MMDD')||'-'||SUBSTR(MD5(RANDOM()::TEXT),1,6);
  v_total INT; v_valid INT := 0; v_invalid INT := 0;
  v_row JSON; v_validation JSON; v_date TEXT; v_code TEXT; v_seq INT;
BEGIN
  IF v_role NOT IN ('admin','operation_manager','data_entry','cs') THEN RAISE EXCEPTION 'Access denied'; END IF;
  v_total := json_array_length(p_rows);
  v_date  := TO_CHAR(NOW(),'MMDD');
  -- Insert batch record
  INSERT INTO public.be_bulk_upload_batches(batch_id,original_filename,total_rows,valid_rows,invalid_rows,status,uploaded_by,uploaded_at)
  VALUES(v_batch_id,p_filename,v_total,0,0,'PROCESSING',v_uid,NOW());
  -- Process each row
  FOR i IN 0..v_total-1 LOOP
    v_row := p_rows->i;
    v_validation := public.be_validate_bulk_row(v_row);
    IF (v_validation->>'valid')::BOOLEAN THEN
      v_code := UPPER(SUBSTRING(v_row->>'merchant_code',1,3));
      SELECT COALESCE(MAX((split_part(pickup_id,'-',3))::INT),0)+1 INTO v_seq
      FROM public.be_portal_pickup_requests WHERE pickup_id LIKE 'P'||v_date||'-'||v_code||'-%';
      INSERT INTO public.be_portal_pickup_requests(
        pickup_id,deliver_id,invoice_no,waybill_no,
        merchant_code,merchant_name,
        recipient_name,recipient_phone,delivery_township,delivery_address,
        service_tier,priority,payment_method,cod_amount,weight_kg,
        status,batch_id,created_by,created_at,updated_at
      )
      SELECT 'P'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             'D'||v_date||'-'||v_code||'-'||LPAD((v_seq+1)::TEXT,3,'0'),
             'I'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             'W'||v_date||'-'||v_code||'-'||LPAD(v_seq::TEXT,3,'0'),
             v_row->>'merchant_code', m.merchant_name,
             v_row->>'recipient_name', v_row->>'recipient_phone',
             COALESCE(v_row->>'delivery_township',''), COALESCE(v_row->>'delivery_address',''),
             COALESCE(v_row->>'service_tier','Standard'),
             COALESCE(v_row->>'priority','NORMAL'),
             COALESCE(v_row->>'payment_method','COD'),
             COALESCE((v_row->>'cod_amount')::NUMERIC,0),
             COALESCE((v_row->>'weight_kg')::NUMERIC,0),
             'SUBMITTED',v_batch_id,v_uid,NOW(),NOW()
      FROM public.be_masterdata_merchants m WHERE m.merchant_code=v_row->>'merchant_code' LIMIT 1;
      v_valid := v_valid + 1;
    ELSE
      v_invalid := v_invalid + 1;
    END IF;
  END LOOP;
  UPDATE public.be_bulk_upload_batches SET valid_rows=v_valid,invalid_rows=v_invalid,status=CASE WHEN v_invalid=0 THEN 'COMPLETED' ELSE 'COMPLETED_WITH_ERRORS' END, uploaded_at=NOW() WHERE batch_id=v_batch_id;
  RETURN json_build_object('success',true,'batch_id',v_batch_id,'total',v_total,'valid',v_valid,'invalid',v_invalid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.be_validate_bulk_row TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_bulk_upload_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_bulk_submit_batch TO authenticated;

CREATE OR REPLACE FUNCTION public.be_data_entry_go_live_verification()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object('ok',true,'rpc_count',(SELECT COUNT(*) FROM pg_proc WHERE proname IN ('be_validate_bulk_row','be_bulk_upload_history','be_bulk_submit_batch')),'ts',NOW());
$$;
GRANT EXECUTE ON FUNCTION public.be_data_entry_go_live_verification TO authenticated;
