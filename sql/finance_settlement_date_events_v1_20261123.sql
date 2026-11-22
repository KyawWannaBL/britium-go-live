-- Daily settlement event report: settlement date (not dispatch date), separate from
-- cashier intake and field worker dispatch-day report. No mutations to financial balances.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_finance_daily_settled_events_v1(
 p_from date,p_to date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR v_role NOT IN
 ('superadmin','super_admin','finance','accountant','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'Finance settlement report access denied' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>31 OR
 p_from<(now() AT TIME ZONE 'Asia/Yangon')::date-interval '180 days'
 THEN RAISE EXCEPTION 'Select an authorized date range of up to 31 days';END IF;
 WITH sources AS (
 SELECT f.delivery_way_id,f.settlement_status,f.settled_amount,
 f.expected_cod,f.settlement_reference,f.settled_at,
 (f.settled_at AT TIME ZONE 'Asia/Yangon')::date settlement_work_date,
 p.wayplan_id,p.rider_code,p.driver_code,p.helper_code,
 p.dispatched_at,p.planned_at,
 c.id cashier_receipt_id,c.work_date cashier_receipt_date,
 c.cashier_actual_mmk,c.worker_role cashier_worker_role,c.worker_code cashier_worker_code,
 d.actual_collect data_entry_actual_collect,d.cod_amount data_entry_cod_amount,
 d.item_price,d.delivery_fee
 FROM public.be_finance_cod_settlements_v48 f
 LEFT JOIN LATERAL (
  SELECT w.wayplan_id,w.rider_code,w.driver_code,w.helper_code,
  w.dispatched_at,w.planned_at
  FROM public.be_wayplan_dispatch_stops s
  JOIN public.be_wayplan_dispatches w ON w.wayplan_id=s.wayplan_id
  WHERE s.delivery_way_id=f.delivery_way_id
  ORDER BY w.dispatched_at DESC NULLS LAST,w.created_at DESC NULLS LAST
  LIMIT 1
 ) p ON true
 LEFT JOIN public.be_finance_cashier_way_receipts_v1 c
 ON c.delivery_way_id=f.delivery_way_id
 LEFT JOIN LATERAL (
   SELECT x.actual_collect,x.cod_amount,x.item_price,x.delivery_fee
   FROM public.be_data_entry_parcel_details x
   WHERE x.delivery_way_id=f.delivery_way_id
   ORDER BY x.updated_at DESC NULLS LAST LIMIT 1
 ) d ON true
 WHERE f.settlement_status='SETTLED' AND f.settled_at IS NOT NULL
 AND (f.settled_at AT TIME ZONE 'Asia/Yangon')::date BETWEEN p_from AND p_to
 ), report AS (
 SELECT s.*,
 (s.wayplan_id IS NOT NULL) listed_in_wayplan,
 (nullif(btrim(coalesce(s.rider_code,'')),'') IS NOT NULL OR
 nullif(btrim(coalesce(s.driver_code,'')),'') IS NOT NULL OR
 nullif(btrim(coalesce(s.helper_code,'')),'') IS NOT NULL) team_assigned,
 coalesce(nullif(s.data_entry_actual_collect,0),s.data_entry_cod_amount) data_entry_registered_mmk,
 CASE WHEN s.cashier_actual_mmk IS NULL OR
 coalesce(nullif(s.data_entry_actual_collect,0),s.data_entry_cod_amount) IS NULL
 THEN NULL ELSE s.cashier_actual_mmk-
 coalesce(nullif(s.data_entry_actual_collect,0),s.data_entry_cod_amount) END cashier_vs_data_entry_mmk,
 CASE WHEN s.wayplan_id IS NULL THEN 'FINANCE_SETTLED_WAYPLAN_MISSING'
 WHEN s.cashier_receipt_id IS NULL THEN 'FINANCE_SETTLED_CASHIER_UNRECORDED'
 WHEN s.cashier_receipt_date IS DISTINCT FROM s.settlement_work_date THEN 'CASHIER_FINANCE_DIFFERENT_DATE'
 WHEN s.cashier_actual_mmk IS DISTINCT FROM s.settled_amount THEN 'CASHIER_FINANCE_AMOUNT_DIFFERENCE'
 ELSE 'RECORDED_NEEDS_EVIDENCE_REVIEW' END reconciliation_status
 FROM sources s
 ), summary AS (
 SELECT count(*) total_settled_waybills,
 count(*) FILTER(WHERE NOT listed_in_wayplan) without_wayplan,
 count(*) FILTER(WHERE cashier_receipt_id IS NULL) without_cashier_receipt,
 count(*) FILTER(WHERE cashier_receipt_id IS NOT NULL) cashier_matched,
 count(*) FILTER(WHERE cashier_receipt_id IS NOT NULL AND cashier_receipt_date<>settlement_work_date) cross_day,
 coalesce(sum(settled_amount),0) finance_settled_total_mmk,
 coalesce(sum(cashier_actual_mmk),0) cashier_recorded_total_mmk,
 count(*) FILTER(WHERE cashier_actual_mmk IS NOT NULL AND cashier_actual_mmk<>settled_amount) amount_mismatch
 FROM report
 )
 SELECT jsonb_build_object('ok',true,'date_basis','Asia/Yangon FINANCE settled_at',
 'from',p_from,'to',p_to,
 'summary',(SELECT to_jsonb(s) FROM summary s),
 'rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.settlement_work_date,r.delivery_way_id) FROM report r),'[]'::jsonb),
 'disclaimer','Finance SETTLED is a system claim, not automatically proof of physical delivery or actual cash custody.')
 INTO v_result;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_daily_settled_events_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_finance_daily_settled_events_v1(date,date) TO authenticated;
COMMIT;
