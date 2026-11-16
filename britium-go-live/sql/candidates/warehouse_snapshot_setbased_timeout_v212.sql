-- Warehouse snapshot timeout remediation.
-- Replace N-per-row calls to be_warehouse_dispatch_scan_state_v75 with
-- set-based state reconciliation. Preserve read authorization from V164.
-- No parcel, custody, wayplan or finance records are modified.
CREATE OR REPLACE FUNCTION public.be_warehouse_scan_lifecycle_snapshot_v211()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE
  v_base jsonb:=public.be_warehouse_scan_lifecycle_snapshot_v164();
  v_rows jsonb;
  v_stats jsonb;
BEGIN
  WITH src AS MATERIALIZED (
    SELECT r.e,r.ord,
      upper(coalesce(nullif(r.e->>'canonical_delivery_way_id',''),
                     nullif(r.e->>'delivery_way_id',''))) AS way_id
    FROM jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
      WITH ORDINALITY r(e,ord)
  ),
  keys AS MATERIALIZED (SELECT DISTINCT way_id FROM src WHERE way_id IS NOT NULL),
  plans_ranked AS (
    SELECT m.delivery_way_id AS way_id,m.wayplan_id,m.membership_status,
       m.updated_at AS membership_updated_at,
       w.wayplan_status,coalesce(rv.review_status,'DRAFT') AS review_status,
       rv.dispatch_ready_at,
       row_number() OVER(PARTITION BY m.delivery_way_id ORDER BY
         CASE m.membership_status
           WHEN 'READY_FOR_DISPATCH' THEN 1
           WHEN 'PLANNED' THEN 2 ELSE 3 END,
         m.updated_at DESC NULLS LAST) AS rn
    FROM public.be_wayplan_membership_v40 m
    JOIN keys k ON k.way_id=m.delivery_way_id
    JOIN public.be_wayplan_dispatches w ON w.wayplan_id=m.wayplan_id
    LEFT JOIN public.be_wayplan_review_v43 rv ON rv.wayplan_id=m.wayplan_id
    WHERE m.membership_status IN ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
       AND upper(coalesce(w.wayplan_status,'')) NOT IN ('COMPLETED','CANCELLED')
  ),
  plans AS MATERIALIZED (SELECT * FROM plans_ranked WHERE rn=1),
  returns AS MATERIALIZED (
    SELECT h.delivery_way_id AS way_id,max(h.scanned_at) AS last_return,
           count(*)::int AS return_count
    FROM public.be_warehouse_return_scans_v39 h
    JOIN keys k ON k.way_id=h.delivery_way_id
    GROUP BY h.delivery_way_id
  ),
  reschedules AS MATERIALIZED (
    SELECT r.delivery_way_id AS way_id,r.requested_delivery_date
    FROM public.be_delivery_reschedules_v71 r
    JOIN keys k ON k.way_id=r.delivery_way_id
    WHERE r.status='ACTIVE'
  ),
  scans AS MATERIALIZED (
    SELECT d.delivery_way_id AS way_id,d.scan_status,d.scanned_at,
           d.wayplan_code
    FROM public.be_dispatch_scans_v39 d
    JOIN keys k ON k.way_id=d.delivery_way_id
  ),
  attempted AS MATERIALIZED (
    SELECT a.delivery_way_id AS way_id,a.last_status,a.consecutive_failures
    FROM public.be_delivery_attempt_state_v39 a
    JOIN keys k ON k.way_id=a.delivery_way_id
  ),
  source_history AS MATERIALIZED (
    SELECT s.delivery_way_id AS way_id,
       jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'wayplan_id',p.wayplan_id,
          'work_date',p.metadata->>'work_date',
          'plan_type',p.metadata->>'plan_type',
          'completion_basis',p.metadata->>'completion_basis',
          'reported_outcome',s.metadata->>'md_attested_outcome',
          'source_way_id',s.metadata->>'source_way_id',
          'source_file',p.metadata->>'source_file_name',
          'driver_name',p.driver_name,'helper_name',p.helper_name,
          'rider_name',p.rider_name,'vehicle_code',p.vehicle_code,
          'reason',s.metadata->'source_attempt_evidence'->>'reason',
          'verification',s.metadata->'source_attempt_evidence'->>'verification'
       )) ORDER BY p.metadata->>'work_date',p.wayplan_id) AS history
    FROM public.be_wayplan_dispatch_stops s
    JOIN keys k ON k.way_id=s.delivery_way_id
    JOIN public.be_wayplan_dispatches p ON p.wayplan_id=s.wayplan_id
    WHERE p.metadata->>'completion_basis'='MD_INSTRUCTED_ASSUMPTION'
      AND p.metadata->>'plan_type' IN ('OUTBOUND','THIRD_PARTY')
    GROUP BY s.delivery_way_id
  ),
  computed AS (
    SELECT s.e,s.ord,s.way_id, p.wayplan_id,p.membership_status,
       p.review_status,p.dispatch_ready_at,
       rs.requested_delivery_date,
       coalesce(rt.return_count,0) AS physical_returns,
       rt.last_return,
       CASE
         WHEN upper(coalesce(at.last_status,''))='RTO'
           OR upper(coalesce(s.e->>'delivery_status',''))='RTO'
           THEN 'RTO'
         WHEN upper(coalesce(at.last_status,''))='DELIVERED'
           OR upper(coalesce(s.e->>'delivery_status',''))='DELIVERED'
           THEN 'DELIVERED'
         WHEN rs.requested_delivery_date IS NOT NULL
           AND (rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
                OR coalesce(rt.return_count,0)=0)
           THEN 'SCHEDULED_HOLD'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           AND coalesce(at.consecutive_failures,0)>coalesce(rt.return_count,0)
           THEN 'AWAITING_RETURN_SCAN'
         WHEN coalesce(rt.return_count,0)>0
           AND (p.wayplan_id IS NULL
                OR coalesce(p.membership_updated_at,'epoch'::timestamptz)<=rt.last_return)
           THEN 'RETURNED_WAITING_REPLAN'
         WHEN ds.scan_status='SCANNED' AND p.wayplan_id IS NOT NULL
           AND ds.wayplan_code=p.wayplan_id
           THEN 'DISPATCH_SCANNED'
         WHEN p.wayplan_id IS NOT NULL
           AND p.membership_status='READY_FOR_DISPATCH'
           AND upper(p.review_status)='DISPATCH_READY'
           THEN 'DISPATCH_SCAN_REQUIRED'
         WHEN p.wayplan_id IS NOT NULL AND upper(p.review_status)='APPROVED'
           THEN 'SUPERVISOR_APPROVED_AWAITING_RELEASE'
         WHEN p.wayplan_id IS NOT NULL THEN 'IN_WAYPLAN_AWAITING_SUPERVISOR'
         WHEN coalesce((s.e->>'field_exception_pending')::boolean,false)
           THEN 'AWAITING_RETURN_SCAN'
         ELSE coalesce(nullif(s.e->>'dispatch_workflow_stage',''),'NOT_RECEIVED')
       END AS reconciled_stage,
       coalesce(h.history,'[]'::jsonb) AS history
    FROM src s
    LEFT JOIN plans p ON p.way_id=s.way_id
    LEFT JOIN returns rt ON rt.way_id=s.way_id
    LEFT JOIN reschedules rs ON rs.way_id=s.way_id
    LEFT JOIN scans ds ON ds.way_id=s.way_id
    LEFT JOIN attempted at ON at.way_id=s.way_id
    LEFT JOIN source_history h ON h.way_id=s.way_id
  ),
  final_rows AS MATERIALIZED (
    SELECT e || jsonb_build_object(
      'reported_source_history',history,
      'dispatch_workflow_stage',reconciled_stage,
      'current_lifecycle_status',reconciled_stage,
      'active_wayplan_id',wayplan_id,
      'membership_status',membership_status,
      'supervisor_review_status',review_status,
      'supervisor_dispatch_ready_at',dispatch_ready_at,
      'rescheduled_delivery_date',requested_delivery_date,
      'return_attempt_count',physical_returns,
      'physical_return_scan_count',physical_returns,
      'last_return_scan_at',last_return,
      'dispatch_scan_required',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_scan_allowed',reconciled_stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_status_source','WAREHOUSE_SET_BASED_RECONCILIATION_V212'
    ) AS e,ord,reconciled_stage AS stage
    FROM computed
  )
  SELECT coalesce(jsonb_agg(e ORDER BY ord),'[]'::jsonb),
    jsonb_build_object(
      'rows',count(*),
      'ready_for_wayplan',count(*) FILTER(WHERE stage='READY_FOR_WAYPLAN'),
      'waiting_supervisor',count(*) FILTER(WHERE stage IN
        ('IN_WAYPLAN_AWAITING_SUPERVISOR','SUPERVISOR_APPROVED_AWAITING_RELEASE')),
      'dispatch_scan_required',count(*) FILTER(WHERE stage='DISPATCH_SCAN_REQUIRED'),
      'dispatch_scanned',count(*) FILTER(WHERE stage='DISPATCH_SCANNED'),
      'awaiting_return_scan',count(*) FILTER(WHERE stage='AWAITING_RETURN_SCAN'),
      'scheduled_hold',count(*) FILTER(WHERE stage='SCHEDULED_HOLD'),
      'returned_waiting_replan',count(*) FILTER(WHERE stage='RETURNED_WAITING_REPLAN'),
      'delivered',count(*) FILTER(WHERE stage='DELIVERED'),
      'rto',count(*) FILTER(WHERE stage='RTO')
    )
  INTO v_rows,v_stats
  FROM final_rows;
  RETURN v_base || jsonb_build_object(
    'rows',v_rows,
    'stats',coalesce(v_base->'stats','{}'::jsonb)||v_stats,
    'build','WAREHOUSE_SET_BASED_RECONCILIATION_V212',
    'dispatch_scan_reconciliation','SET_BASED_NO_PER_ROW_RPC_V212'
  );
END
$fn$;
