-- Read-only evidence bridge for Merchant Settlement UI.
-- Exact matching Way IDs only; never mark returns complete from an RTO request alone.
CREATE OR REPLACE FUNCTION public.be_finance_rto_evidence_snapshot_v1(p_merchant_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public','auth','pg_temp' AS $fn$
DECLARE v_role text; v_rows jsonb;
BEGIN
 v_role:=public.be_finance_assert_internal_v3();
 IF upper(coalesce(v_role,'')) NOT IN
  ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN')
 THEN RAISE EXCEPTION 'Finance access required'; END IF;
 WITH returned AS (
   SELECT DISTINCT ON (upper(btrim(w.delivery_way_id)))
     upper(btrim(w.delivery_way_id)) AS way_key,
     w.scanned_at, w.warehouse_code,w.reason_code,w.reason_name,w.remark
   FROM public.be_warehouse_return_scans_v39 w
   WHERE nullif(btrim(coalesce(w.delivery_way_id,'')),'') IS NOT NULL
   ORDER BY upper(btrim(w.delivery_way_id)),w.scanned_at DESC NULLS LAST,w.id DESC
 ), matched AS (
   SELECT q.delivery_way_id,q.merchant_id,q.status AS source_status,
     w.scanned_at AS warehouse_return_scanned_at,w.warehouse_code,
     w.reason_code,w.reason_name,w.remark,
     CASE
       WHEN upper(coalesce(q.status,'')) IN
        ('RTO_RETURNED_TO_ORIGIN','RTO_RETURN_COMPLETED','RTO_RETURNED_TO_SENDER',
         'RETURNED_TO_ORIGIN','RETURNED_TO_SENDER','RETURN_TO_ORIGIN_COMPLETED')
       THEN 'RTO_RETURN'
       WHEN w.scanned_at IS NOT NULL AND upper(coalesce(q.status,'')) IN
        ('RTO','RETURN_SCANNED','RTO_WAREHOUSE','RTO_RETURNED_TO_HUB','RETURNED_TO_WAREHOUSE')
       THEN 'RTO_WAREHOUSE'
       ELSE 'RTO_PENDING'
     END AS finance_rto_stage
   FROM public.be_v_finance_merchant_settlement_queue_v2 q
   JOIN returned w ON w.way_key=upper(btrim(q.delivery_way_id))
   WHERE p_merchant_id IS NULL OR q.merchant_id=p_merchant_id
 )
 SELECT coalesce(jsonb_agg(to_jsonb(matched) ORDER BY warehouse_return_scanned_at DESC NULLS LAST),'[]'::jsonb)
 INTO v_rows FROM matched;
 RETURN jsonb_build_object('ok',true,'build','FINANCE_RTO_EVIDENCE_V1','rows',v_rows,
  'note','Warehouse return scan proves warehouse receipt only, never final sender return or fee authorization');
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_rto_evidence_snapshot_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_finance_rto_evidence_snapshot_v1(text) TO authenticated,service_role;
