-- Britium daily cashier reconciliation v1.
-- A cashier entry records cash/digital received; it NEVER posts COD settlement or marks a parcel delivered.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_finance_cashier_way_receipts_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_date date NOT NULL,
 delivery_way_id text NOT NULL CHECK(length(btrim(delivery_way_id)) BETWEEN 3 AND 90),
 wayplan_id text,
 worker_role text NOT NULL CHECK(worker_role IN ('RIDER','DRIVER','HELPER','UNASSIGNED')),
 worker_code text NOT NULL CHECK(length(btrim(worker_code)) BETWEEN 2 AND 90),
 cashier_actual_mmk numeric(16,2) NOT NULL CHECK(cashier_actual_mmk>=0 AND cashier_actual_mmk<=100000000000),
 payment_method text NOT NULL CHECK(payment_method IN ('CASH','DIGITAL','MIXED','OTHER')),
 evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference))>=5),
 exception_note text,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(delivery_way_id),
 CHECK(exception_note IS NULL OR length(btrim(exception_note))>=8)
);
ALTER TABLE public.be_finance_cashier_way_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_finance_cashier_way_receipts_v1 FROM PUBLIC,anon,authenticated;
-- Only finance managers can inspect the records directly; field users read a tightly scoped RPC.
CREATE POLICY be_cashier_receipt_finance_read_v1 ON public.be_finance_cashier_way_receipts_v1
 FOR SELECT TO authenticated USING (
 (SELECT auth.uid()) IS NOT NULL AND
 lower(replace(public.be_current_role(),'-','_')) IN
 ('superadmin','super_admin','finance','accountant','operation_manager','operations_manager'));
GRANT SELECT ON public.be_finance_cashier_way_receipts_v1 TO authenticated;

CREATE OR REPLACE FUNCTION public.be_finance_cashier_record_way_v1(
 p_date date,p_way_id text,p_worker_role text,p_worker_code text,
 p_actual numeric,p_method text,p_evidence text,p_exception_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid();v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_way text:=btrim(coalesce(p_way_id,''));v_plan text;v_plan_worker text;
 v_workrole text:=upper(btrim(coalesce(p_worker_role,'')));
 v_worker text:=upper(btrim(coalesce(p_worker_code,'')));
 v_id uuid;
BEGIN
 IF v_user IS NULL OR v_role NOT IN ('finance','accountant','superadmin','super_admin')
 THEN RAISE EXCEPTION 'Cashier role required' USING ERRCODE='42501';END IF;
 IF p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Yangon')::date
    OR p_date<(now() AT TIME ZONE 'Asia/Yangon')::date-interval '90 days'
 THEN RAISE EXCEPTION 'Cashier work date must be within last 90 days';END IF;
 IF length(v_way)<3 OR v_workrole NOT IN ('RIDER','DRIVER','HELPER','UNASSIGNED')
 OR length(v_worker)<2 OR p_actual IS NULL OR p_actual<0
 OR p_method NOT IN ('CASH','DIGITAL','MIXED','OTHER')
 OR length(btrim(coalesce(p_evidence,'')))<5
 THEN RAISE EXCEPTION 'Way, responsible worker, received amount, method and receipt reference are required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.be_data_entry_parcel_details d WHERE d.delivery_way_id=v_way)
 THEN RAISE EXCEPTION 'Unknown original Way ID';END IF;
 -- A source Wayplan is only verified when the stop belongs to the declared work date.
 SELECT w.wayplan_id,upper(NULLIF(CASE v_workrole
   WHEN 'RIDER' THEN w.rider_code WHEN 'DRIVER' THEN w.driver_code
   WHEN 'HELPER' THEN w.helper_code END,'')) INTO v_plan,v_plan_worker
 FROM public.be_wayplan_dispatch_stops s JOIN public.be_wayplan_dispatches w
 ON w.wayplan_id=s.wayplan_id
 WHERE s.delivery_way_id=v_way
 AND (coalesce(w.dispatched_at,w.planned_at,w.created_at) AT TIME ZONE 'Asia/Yangon')::date=p_date
 ORDER BY w.dispatched_at DESC NULLS LAST,w.created_at DESC LIMIT 1;
 IF v_plan IS NULL OR v_workrole='UNASSIGNED' OR v_plan_worker IS DISTINCT FROM v_worker THEN
   IF length(btrim(coalesce(p_exception_note,'')))<8 THEN
    RAISE EXCEPTION 'No verified Wayplan/team match. Explain the unmatched cashier entry (minimum 8 characters).';END IF;
 END IF;
 -- Historical Finance SETTLED records require an explicit backfill reason;
 -- this cashier register never re-posts settlement or changes prior approval.
 IF EXISTS(SELECT 1 FROM public.be_finance_cod_settlements_v48 f
           WHERE f.delivery_way_id=v_way AND f.settlement_status='SETTLED')
    AND length(btrim(coalesce(p_exception_note,'')))<8 THEN
    RAISE EXCEPTION 'Existing Finance SETTLED record. Explain why cashier evidence is being registered (minimum 8 characters).';
 END IF;
 INSERT INTO public.be_finance_cashier_way_receipts_v1
 (work_date,delivery_way_id,wayplan_id,worker_role,worker_code,cashier_actual_mmk,
 payment_method,evidence_reference,exception_note,created_by)
 VALUES(p_date,v_way,v_plan,v_workrole,v_worker,p_actual,p_method,
 btrim(p_evidence),nullif(btrim(p_exception_note),'') ,v_user)
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'receipt_id',v_id,'way_id',v_way,'wayplan_id',v_plan,
 'worker_match',coalesce(v_plan_worker=v_worker,false),'state','CASHIER_RECORDED_NOT_FINAL_SETTLEMENT');
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_cashier_record_way_v1(date,text,text,text,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_finance_cashier_record_way_v1(date,text,text,text,numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.be_finance_cashier_daily_report_v1(
 p_from date,p_to date,p_worker_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid();v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_field jsonb;v_code text;v_rows jsonb;v_summ jsonb;
BEGIN
 IF v_user IS NULL OR v_role NOT IN
 ('finance','accountant','superadmin','super_admin','operation_manager','operations_manager','rider','driver','helper')
 THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>31 OR
 p_from<(now() AT TIME ZONE 'Asia/Yangon')::date-interval '180 days'
 THEN RAISE EXCEPTION 'Use a valid Myanmar work-date range of up to 31 days within 180 days';END IF;
 IF v_role IN ('rider','driver','helper') THEN
   v_field:=public.be_current_field_team_identity();
   v_code:=upper(v_field->>'worker_code');
 ELSE v_code:=nullif(upper(btrim(coalesce(p_worker_code,''))),''); END IF;
 WITH planned_raw AS (
   SELECT (coalesce(w.dispatched_at,w.planned_at,w.created_at) AT TIME ZONE 'Asia/Yangon')::date work_date,
     s.delivery_way_id,w.wayplan_id,w.rider_code,w.rider_name,w.driver_code,w.driver_name,
     w.helper_code,w.helper_name,w.vehicle_code,
     row_number() over(partition by (coalesce(w.dispatched_at,w.planned_at,w.created_at) AT TIME ZONE 'Asia/Yangon')::date,s.delivery_way_id
     ORDER BY w.dispatched_at DESC NULLS LAST,w.created_at DESC,s.created_at DESC) rn
   FROM public.be_wayplan_dispatch_stops s
   JOIN public.be_wayplan_dispatches w ON w.wayplan_id=s.wayplan_id
   WHERE s.delivery_way_id IS NOT NULL
    AND (coalesce(w.dispatched_at,w.planned_at,w.created_at) AT TIME ZONE 'Asia/Yangon')::date BETWEEN p_from AND p_to
 ), planned AS (SELECT * FROM planned_raw WHERE rn=1),
 all_ways AS (
   SELECT work_date,delivery_way_id FROM planned
   UNION
   SELECT work_date,delivery_way_id FROM public.be_finance_cashier_way_receipts_v1
    WHERE work_date BETWEEN p_from AND p_to
 ), joined AS (
 SELECT a.work_date,a.delivery_way_id,p.wayplan_id,
 p.rider_code,p.rider_name,p.driver_code,p.driver_name,p.helper_code,p.helper_name,p.vehicle_code,
 d.actual_collect data_entry_actual_collect,d.cod_amount data_entry_cod_amount,
 d.item_price,d.delivery_fee,
 c.id receipt_id,c.work_date cashier_receipt_work_date,c.worker_role cashier_worker_role,c.worker_code cashier_worker_code,
 c.cashier_actual_mmk,c.payment_method,c.evidence_reference,c.created_at cashier_registered_at,
 c.exception_note,c.created_by cashier_user_id,
 f.settlement_status finance_settlement_status,f.settled_amount finance_settled_amount,
 f.settlement_reference finance_settlement_reference,
 f.settled_at finance_settled_at,
 fs.status wayplan_finance_status,
 CASE WHEN p.wayplan_id IS NOT NULL THEN true ELSE false END listed_in_wayplan,
 CASE WHEN p.wayplan_id IS NOT NULL AND
 (nullif(btrim(coalesce(p.rider_code,'')),'') IS NOT NULL OR
 nullif(btrim(coalesce(p.driver_code,'')),'') IS NOT NULL OR
 nullif(btrim(coalesce(p.helper_code,'')),'') IS NOT NULL)
 THEN true ELSE false END wayplan_team_assigned,
 CASE WHEN c.id IS NULL THEN NULL
      ELSE (c.worker_role='RIDER' AND upper(coalesce(p.rider_code,''))=upper(c.worker_code))
        OR (c.worker_role='DRIVER' AND upper(coalesce(p.driver_code,''))=upper(c.worker_code))
        OR (c.worker_role='HELPER' AND upper(coalesce(p.helper_code,''))=upper(c.worker_code))
 END cashier_worker_is_assigned
 FROM all_ways a LEFT JOIN planned p USING(work_date,delivery_way_id)
 LEFT JOIN LATERAL (
 SELECT d1.* FROM public.be_data_entry_parcel_details d1
 WHERE d1.delivery_way_id=a.delivery_way_id
 ORDER BY d1.updated_at DESC NULLS LAST LIMIT 1) d ON true
 LEFT JOIN public.be_finance_cashier_way_receipts_v1 c
 ON c.delivery_way_id=a.delivery_way_id
 LEFT JOIN public.be_finance_cod_settlements_v48 f ON f.delivery_way_id=a.delivery_way_id
 LEFT JOIN public.be_field_finance_settlements_v1 fs
 ON fs.work_date=a.work_date AND fs.wayplan_id=p.wayplan_id
 ), visible AS (
 SELECT j.*,
 CASE WHEN j.cashier_actual_mmk IS NULL THEN NULL
      WHEN coalesce(nullif(j.data_entry_actual_collect,0),j.data_entry_cod_amount) IS NULL THEN NULL
      ELSE j.cashier_actual_mmk-coalesce(nullif(j.data_entry_actual_collect,0),j.data_entry_cod_amount)
 END difference_mmk,
 CASE WHEN NOT j.listed_in_wayplan THEN 'NOT_LISTED_IN_WAYPLAN'
 WHEN NOT j.wayplan_team_assigned THEN 'NO_WORKER_ASSIGNED'
 WHEN j.receipt_id IS NULL AND (j.finance_settlement_status='SETTLED' OR j.wayplan_finance_status='CLEARED') THEN 'FINANCE_SETTLED_CASHIER_UNRECORDED'
 WHEN j.receipt_id IS NULL THEN 'MISSING_CASHIER_RECEIPT'
 WHEN j.cashier_receipt_work_date<>j.work_date THEN 'CASHIER_RECEIPT_DIFFERENT_DATE'
 WHEN j.receipt_id IS NOT NULL AND NOT coalesce(j.cashier_worker_is_assigned,false)
 THEN 'RECEIPT_WORKER_NOT_ASSIGNED'
 WHEN coalesce(nullif(j.data_entry_actual_collect,0),j.data_entry_cod_amount) IS NULL THEN 'DATA_ENTRY_AMOUNT_MISSING'
 WHEN j.cashier_actual_mmk<>coalesce(nullif(j.data_entry_actual_collect,0),j.data_entry_cod_amount) THEN 'AMOUNT_DIFFERENCE'
 WHEN j.finance_settlement_status='SETTLED' OR j.wayplan_finance_status='CLEARED' THEN 'FINANCE_RECORDED_CHECK_EVIDENCE'
 ELSE 'CASHIER_RECORDED_FINANCE_PENDING' END sync_status
 FROM joined j
 WHERE v_code IS NULL OR
 upper(coalesce(j.rider_code,''))=v_code OR upper(coalesce(j.driver_code,''))=v_code
 OR upper(coalesce(j.helper_code,''))=v_code
 OR (v_role NOT IN ('rider','driver','helper') AND upper(coalesce(j.cashier_worker_code,''))=v_code)
 )
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.work_date,v.wayplan_id,v.delivery_way_id),'[]'::jsonb)
 INTO v_rows FROM visible v;
 SELECT jsonb_build_object('ways',count(*),
 'listed_in_wayplan',count(*) filter(where r->>'listed_in_wayplan'='true'),
 'not_listed_in_wayplan',count(*) filter(where r->>'listed_in_wayplan'='false'),
 'missing_cashier',count(*) filter(where r->>'receipt_id' IS NULL),
 'finance_settled_cashier_unrecorded',count(*) filter(where r->>'sync_status'='FINANCE_SETTLED_CASHIER_UNRECORDED'),
 'cashier_recorded',count(*) filter(where r->>'receipt_id' IS NOT NULL),
 'finance_settled',count(*) filter(where r->>'finance_settlement_status'='SETTLED'),
 'cashier_total_mmk',coalesce(sum((r->>'cashier_actual_mmk')::numeric),0),
 'data_entry_total_mmk',coalesce(sum(coalesce(nullif((r->>'data_entry_actual_collect')::numeric,0),(r->>'data_entry_cod_amount')::numeric)),0),
 'difference_recorded_mmk',coalesce(sum((r->>'difference_mmk')::numeric),0))
 INTO v_summ FROM jsonb_array_elements(v_rows) r;
 RETURN jsonb_build_object('ok',true,'from',p_from,'to',p_to,
 'rows',v_rows,'summary',v_summ,
 'notes','Cashier receipt is independent of finance settlement; missing means not recorded in this register, not proven loss.');
END $fn$;
REVOKE ALL ON FUNCTION public.be_finance_cashier_daily_report_v1(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_finance_cashier_daily_report_v1(date,date,text) TO authenticated;
COMMENT ON TABLE public.be_finance_cashier_way_receipts_v1 IS
'Append-only cashier intake register separate from actual finance COD final settlement. One receipt per Way ID and work date; no automatic settlement posting.';
COMMIT;
