CREATE OR REPLACE FUNCTION public.be_oct20_22_dispatch_review_v1(
  p_sheet_date date DEFAULT NULL,
  p_scan_review text DEFAULT 'ALL',
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
  v_role text;
  v_filter text := upper(coalesce(nullif(btrim(p_scan_review),''),'ALL'));
  v_rows jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  END IF;
  v_role := upper(replace(public.be_current_role(),'-','_'));
  IF v_role NOT IN ('SUPERADMIN','SUPER_ADMIN','ADMIN','WAREHOUSE','DISPATCH','SUPERVISOR','OPERATION_MANAGER','OPERATIONS_MANAGER','CUSTOMER_SERVICE','FINANCE','FINANCE_MANAGER') THEN
    RETURN jsonb_build_object('ok',false,'code','STAFF_REVIEW_ROLE_REQUIRED');
  END IF;
  IF p_sheet_date IS NOT NULL AND p_sheet_date NOT IN (date '2026-10-20',date '2026-10-21',date '2026-10-22') THEN
    RETURN jsonb_build_object('ok',false,'code','DATE_OUT_OF_SCOPE');
  END IF;
  IF v_filter NOT IN ('ALL','MISSING_SCAN_EVIDENCE','SYSTEM_ATTRIBUTED_SCAN_REVIEW','RECORDED_STAFF_SCAN') THEN
    RETURN jsonb_build_object('ok',false,'code','INVALID_FILTER');
  END IF;
  SELECT count(*) INTO v_count
    FROM private.be_oct20_22_dispatch_evidence_worklist_v1 e
    WHERE (p_sheet_date IS NULL OR e.sheet_date=p_sheet_date)
      AND (v_filter='ALL' OR e.scan_review=v_filter);
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.sheet_date,t.source_row),'[]'::jsonb)
    INTO v_rows FROM (
      SELECT e.sheet_date,e.source_row,e.delivery_way_id,e.scan_status,e.scanned_at,
             e.scanned_by,e.scan_review,e.delivery_review,e.stop_evidence,
             e.parcel_status,e.financial_review_state
      FROM private.be_oct20_22_dispatch_evidence_worklist_v1 e
      WHERE (p_sheet_date IS NULL OR e.sheet_date=p_sheet_date)
        AND (v_filter='ALL' OR e.scan_review=v_filter)
      ORDER BY e.sheet_date,e.source_row,e.delivery_way_id
      LIMIT least(greatest(coalesce(p_limit,100),1),200)
      OFFSET least(greatest(coalesce(p_offset,0),0),10000)
    ) t;
  RETURN jsonb_build_object('ok',true,'total',v_count,'count',jsonb_array_length(v_rows),
    'rows',v_rows,
    'notice','Review evidence only: no historic scan or payment posting');
END
$body$;
REVOKE ALL ON FUNCTION public.be_oct20_22_dispatch_review_v1(date,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_oct20_22_dispatch_review_v1(date,text,integer,integer) TO authenticated;