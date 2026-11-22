-- Britium Express: HR-master linked parcel follow-up staff directory and bulk notification.
-- Original Way IDs and source warehouse/finance records are never modified.
BEGIN;

CREATE OR REPLACE FUNCTION public.be_parcel_hr_directory_v2()
RETURNS TABLE (
 employee_code text, employee_name text, employee_department text,
 department_key text, employee_role text, branch_code text,
 email text, auth_user_id uuid, account_linked boolean, active boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public AS $f$
DECLARE v_role text; v_payload jsonb;
BEGIN
 v_role := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 IF auth.uid() IS NULL OR v_role NOT IN ('superadmin','super_admin','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'Parcel HR directory access denied' USING ERRCODE='42501'; END IF;
 v_payload := public.be_hr_dashboard();
 RETURN QUERY
 WITH src AS (
   SELECT h.value AS obj FROM jsonb_array_elements(coalesce(v_payload->'employees','[]'::jsonb)) h
 ), staff AS (
   SELECT nullif(btrim(coalesce(obj->>'employee_code',obj->>'employee_id')),'') AS code,
    coalesce(nullif(btrim(obj->>'display_name'),''),nullif(btrim(obj->>'employee_name'),''),'Unnamed employee') AS staff_name,
    coalesce(nullif(btrim(obj->>'department'),''),'Unassigned') AS raw_department,
    coalesce(nullif(btrim(obj->>'role_label'),''),nullif(btrim(obj->>'role_id'),''),'Staff') AS staff_role,
    coalesce(nullif(btrim(obj->>'branch_code'),''),'YGN') AS raw_branch,
    lower(nullif(btrim(obj->>'email'),'')) AS staff_email,
    lower(coalesce(obj->>'status','active')) AS hr_status,
    coalesce((obj->>'is_active')::boolean,true) AS hr_active
   FROM src
 )
 SELECT s.code,s.staff_name,s.raw_department,
  public.be_parcel_department_key_v1(s.raw_department,s.staff_role) AS department_key,
  s.staff_role,s.raw_branch,s.staff_email,u.auth_user_id,
  (u.auth_user_id IS NOT NULL),s.hr_active AND s.hr_status NOT IN ('inactive','terminated','deleted','suspended')
 FROM staff s
 LEFT JOIN LATERAL (
   SELECT a.auth_user_id FROM public.be_user_account_registry a
   WHERE s.staff_email IS NOT NULL AND lower(btrim(a.email))=s.staff_email
   AND a.auth_user_id IS NOT NULL AND coalesce(a.active,a.is_active,true)
   AND lower(coalesce(a.status,'active')) IN ('active','enabled')
   ORDER BY a.updated_at DESC NULLS LAST LIMIT 1
 ) u ON true
 ORDER BY s.raw_department,s.staff_name,s.code
 LIMIT 1000;
END $f$;
REVOKE ALL ON FUNCTION public.be_parcel_hr_directory_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_hr_directory_v2() TO authenticated;

-- v1 singleton key must be widened to support multiple ways in a single batch.
DROP INDEX IF EXISTS public.be_followup_task_request_recipient_idx;
CREATE UNIQUE INDEX IF NOT EXISTS be_followup_task_request_way_recipient_v2
 ON public.be_parcel_followup_tasks_v1(notification_request_id,original_delivery_way_id,assigned_user_id)
 WHERE notification_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.be_parcel_bulk_followup_batches_v1 (
 request_id uuid PRIMARY KEY,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 wayplan_filter text,
 department_key text NOT NULL,
 recipient_scope text NOT NULL CHECK(recipient_scope IN ('PERSON','DEPARTMENT')),
 selected_way_count int NOT NULL CHECK(selected_way_count BETWEEN 1 AND 100),
 notification_count int NOT NULL CHECK(notification_count BETWEEN 1 AND 400),
 status text NOT NULL DEFAULT 'SENT' CHECK(status='SENT'),
 CHECK(length(department_key)>1)
);
ALTER TABLE public.be_parcel_bulk_followup_batches_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_bulk_followup_batches_v1 FROM PUBLIC,anon,authenticated;
CREATE POLICY be_parcel_bulk_followup_batch_view_v1 ON public.be_parcel_bulk_followup_batches_v1
 FOR SELECT TO authenticated USING (
 (SELECT auth.uid())=created_by OR
 (SELECT auth.uid()) IS NOT NULL AND lower(replace(public.be_current_role(),'-','_'))
 IN ('superadmin','super_admin','operation_manager','operations_manager'));
GRANT SELECT ON public.be_parcel_bulk_followup_batches_v1 TO authenticated;

CREATE TABLE IF NOT EXISTS public.be_parcel_bulk_followup_decisions_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES public.be_parcel_bulk_followup_batches_v1(request_id),
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','CANCELLED')),
 reason text NOT NULL CHECK(length(btrim(reason))>=8),
 decided_by uuid NOT NULL,
 decided_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id)
);
ALTER TABLE public.be_parcel_bulk_followup_decisions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_bulk_followup_decisions_v1 FROM PUBLIC,anon,authenticated;
CREATE POLICY be_parcel_bulk_decision_view_v1 ON public.be_parcel_bulk_followup_decisions_v1
 FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.be_parcel_bulk_followup_batches_v1 b
 WHERE b.request_id=batch_id AND ((SELECT auth.uid())=b.created_by
 OR lower(replace(public.be_current_role(),'-','_'))
 IN ('superadmin','super_admin','operation_manager','operations_manager'))));
GRANT SELECT ON public.be_parcel_bulk_followup_decisions_v1 TO authenticated;

CREATE OR REPLACE FUNCTION public.be_parcel_bulk_followup_send_v1(
 p_items jsonb, p_department text, p_scope text, p_recipient_id uuid,
 p_default_type text, p_message_en text, p_message_my text,
 p_due_at timestamptz, p_wayplan text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_actor uuid:=auth.uid(); v_role text;
 v_targets uuid[]; v_emails text[]; v_ids text[];
 v_target uuid; v_email text; v_item jsonb; v_way text; v_wayplan text;
 v_en text; v_my text; v_tasktype text; v_task_id uuid;
 v_count int:=0; v_total int; v_unique int; v_target_count int;
BEGIN
 v_role:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 IF v_actor IS NULL OR v_role NOT IN ('superadmin','super_admin','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'Not authorized for bulk notification' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
 THEN RAISE EXCEPTION 'Items and batch request id required'; END IF;
 v_total:=jsonb_array_length(p_items);
 IF v_total<1 OR v_total>100 THEN RAISE EXCEPTION 'Select 1 to 100 Way IDs per batch'; END IF;
 IF p_scope NOT IN ('PERSON','DEPARTMENT') OR p_department NOT IN
 ('OPERATIONS','FIELD_TEAM','WAREHOUSE','CUSTOMER_SERVICE','FINANCE','BRANCH','THIRD_PARTY',
 'MERCHANT_RELATIONS','ADMIN_HR','MARKETING')
 THEN RAISE EXCEPTION 'Invalid recipient selection'; END IF;
 IF p_scope='PERSON' AND p_recipient_id IS NULL THEN RAISE EXCEPTION 'Employee required'; END IF;
 IF p_due_at IS NULL OR p_due_at<now()+interval '5 minutes' OR p_due_at>now()+interval '30 days'
 THEN RAISE EXCEPTION 'Deadline out of range'; END IF;
 IF p_default_type NOT IN ('POD_VERIFICATION','PROVIDER_HANDOVER','RTO_CONFIRMATION',
  'COD_RECONCILIATION','GATE_SETTLEMENT','LOCATION_AND_CUSTODY','OTHER_REVIEW')
 THEN RAISE EXCEPTION 'Invalid task type'; END IF;
 IF length(btrim(coalesce(p_message_en,'')))<8 OR length(btrim(coalesce(p_message_my,'')))<8
 THEN RAISE EXCEPTION 'English and Myanmar messages required'; END IF;
 IF EXISTS(SELECT 1 FROM public.be_parcel_bulk_followup_batches_v1 WHERE request_id=p_request_id)
 THEN
   IF NOT EXISTS (SELECT 1 FROM public.be_parcel_bulk_followup_batches_v1
    WHERE request_id=p_request_id AND created_by=v_actor) THEN
     RAISE EXCEPTION 'Batch id belongs to another account'; END IF;
   RETURN jsonb_build_object('already_sent',true,'request_id',p_request_id);
 END IF;
 -- Sendable employees are exactly the active HR master entries linked to active Auth.
 SELECT array_agg(DISTINCT d.auth_user_id),array_agg(DISTINCT d.email)
 INTO v_targets,v_emails
 FROM public.be_parcel_hr_directory_v2() d
 WHERE d.active AND d.account_linked AND d.department_key=p_department
 AND (p_scope='DEPARTMENT' OR d.auth_user_id=p_recipient_id);
 v_target_count:=coalesce(array_length(v_targets,1),0);
 IF v_target_count<1 THEN RAISE EXCEPTION 'No linked active HR employee in destination'; END IF;
 IF v_target_count>30 OR v_target_count*v_total>400 THEN
    RAISE EXCEPTION 'Batch exceeds safe recipient limit (30 staff / 400 notifications). Narrow selection'; END IF;
 -- Validate every Way ID and optional Wayplan before any insert.
 SELECT array_agg(DISTINCT nullif(btrim(x.value->>'way_id'),'')),
        count(DISTINCT nullif(btrim(x.value->>'way_id'),'')) INTO v_ids,v_unique
 FROM jsonb_array_elements(p_items) x;
 IF coalesce(v_unique,0)<>v_total THEN RAISE EXCEPTION 'Invalid or duplicate Way ID in selection'; END IF;
 FOREACH v_way IN ARRAY v_ids LOOP
   SELECT w.wayplan_id INTO v_wayplan FROM public.be_v_harmonized_parcel_monitor_v1 w
    WHERE w.delivery_way_id=v_way LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or unauthorized Way ID: %',v_way; END IF;
   IF nullif(btrim(coalesce(p_wayplan,'')),'') IS NOT NULL
    AND v_wayplan IS DISTINCT FROM btrim(p_wayplan) THEN
     RAISE EXCEPTION 'Way ID % does not belong to selected Wayplan',v_way;
   END IF;
 END LOOP;
 INSERT INTO public.be_parcel_bulk_followup_batches_v1
  (request_id,created_by,wayplan_filter,department_key,recipient_scope,selected_way_count,notification_count)
 VALUES(p_request_id,v_actor,nullif(btrim(p_wayplan),''),p_department,p_scope,v_total,v_total*v_target_count);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_way:=btrim(v_item->>'way_id');
   v_en:=coalesce(nullif(btrim(v_item->>'message_en'),''),p_message_en);
   v_my:=coalesce(nullif(btrim(v_item->>'message_my'),''),p_message_my);
   v_tasktype:=coalesce(nullif(btrim(v_item->>'task_type'),''),p_default_type);
   IF length(v_en)<8 OR length(v_my)<8 OR length(v_en)>1500 OR length(v_my)>1500
    OR v_tasktype NOT IN ('POD_VERIFICATION','PROVIDER_HANDOVER','RTO_CONFIRMATION',
    'COD_RECONCILIATION','GATE_SETTLEMENT','LOCATION_AND_CUSTODY','OTHER_REVIEW')
   THEN RAISE EXCEPTION 'Invalid per-Way message or task type'; END IF;
   FOREACH v_target IN ARRAY v_targets LOOP
      SELECT d.email INTO v_email FROM public.be_parcel_hr_directory_v2() d
      WHERE d.auth_user_id=v_target AND d.active AND d.account_linked LIMIT 1;
      INSERT INTO public.be_parcel_followup_tasks_v1
       (original_delivery_way_id,assigned_user_id,assigned_department,task_type,
        task_note,created_by,due_at,notification_request_id)
      VALUES(v_way,v_target,p_department,v_tasktype,
       left('Way ID: '||v_way||E'\n'||v_en||E'\n'||v_my,3000),
       v_actor,p_due_at,p_request_id)
      RETURNING id INTO v_task_id;
      INSERT INTO public.be_app_notifications(
       target_user_id,target_email,title,message,body,is_read,created_at,
       event_key,event_type,notification_type,source_table,source_key,waybill_no,category,priority,metadata)
      VALUES(v_target::text,v_email,'Parcel follow-up / ပါဆယ်လုပ်ငန်းတာဝန်',
       'Way ID: '||v_way||E'\n'||v_en||E'\n'||v_my,v_en||E'\n'||v_my,false,now(),
       'BE_PARCEL_BULK:'||v_task_id::text,'PARCEL_FOLLOWUP',
       'PARCEL_BULK_'||v_task_id::text,'be_parcel_followup_tasks_v1',v_task_id::text,
       v_way,'operations','HIGH',jsonb_build_object('link','/parcel-follow-up',
       'way_id',v_way,'wayplan',p_wayplan,'batch_id',p_request_id,'due_at',p_due_at));
      v_count:=v_count+1;
   END LOOP;
 END LOOP;
 RETURN jsonb_build_object('already_sent',false,'sent',v_count,'ways',v_total,
   'recipients',v_target_count,'request_id',p_request_id);
END $f$;
REVOKE ALL ON FUNCTION public.be_parcel_bulk_followup_send_v1(jsonb,text,text,uuid,text,text,text,timestamptz,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_bulk_followup_send_v1(jsonb,text,text,uuid,text,text,text,timestamptz,text,uuid) TO authenticated;

-- Allow auditable managerial cancellation of open follow-up tasks; historical assignment data remains immutable.
ALTER TABLE public.be_parcel_followup_tasks_v1
 DROP CONSTRAINT be_parcel_followup_tasks_v1_status_check;
ALTER TABLE public.be_parcel_followup_tasks_v1
 ADD CONSTRAINT be_parcel_followup_tasks_v1_status_check
 CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED'));

CREATE OR REPLACE FUNCTION public.be_parcel_followup_change_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF ROW(NEW.original_delivery_way_id,NEW.assigned_user_id,NEW.assigned_department,NEW.task_type,
    NEW.task_note,NEW.evidence_reference,NEW.created_by,NEW.created_at,NEW.due_at) IS DISTINCT FROM
    ROW(OLD.original_delivery_way_id,OLD.assigned_user_id,OLD.assigned_department,OLD.task_type,
    OLD.task_note,OLD.evidence_reference,OLD.created_by,OLD.created_at,OLD.due_at)
 THEN RAISE EXCEPTION 'Task assignment evidence cannot be altered'; END IF;
 IF OLD.status IN ('RESOLVED','CANCELLED') THEN RAISE EXCEPTION 'Closed task cannot be altered'; END IF;
 IF OLD.status='OPEN' AND NEW.status='ACKNOWLEDGED' THEN
   IF NEW.acknowledged_by IS DISTINCT FROM auth.uid()
      OR NEW.acknowledged_by IS DISTINCT FROM OLD.assigned_user_id
      OR NEW.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Assigned employee acknowledgement required'; END IF;
 ELSIF OLD.status IN ('OPEN','ACKNOWLEDGED') AND NEW.status='RESOLVED' THEN
   IF NEW.resolved_by IS DISTINCT FROM auth.uid() OR NEW.resolved_at IS NULL
   OR length(btrim(coalesce(NEW.resolution_note,'')))<8
   THEN RAISE EXCEPTION 'Assigned employee with evidence is required for resolution'; END IF;
 ELSIF OLD.status IN ('OPEN','ACKNOWLEDGED') AND NEW.status='CANCELLED' THEN
   IF auth.uid() IS NULL OR lower(replace(public.be_current_role(),'-','_'))
     NOT IN ('superadmin','super_admin','operation_manager','operations_manager')
   OR NEW.resolved_by IS DISTINCT FROM auth.uid() OR NEW.resolved_at IS NULL
   OR length(btrim(coalesce(NEW.resolution_note,'')))<8
   THEN RAISE EXCEPTION 'Documented manager cancellation required'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported task state transition';
 END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $f$;

CREATE OR REPLACE FUNCTION private.be_parcel_followup_reminder_tick_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,private AS $f$
DECLARE v_created integer:=0;
BEGIN
 INSERT INTO public.be_app_notifications(target_user_id,title,message,notification_type,event_type,
 event_key,source_table,source_key,waybill_no,priority,is_read,created_at)
 SELECT t.assigned_user_id::text,
 CASE WHEN t.due_at<now() THEN 'Overdue parcel follow-up' ELSE 'Parcel follow-up due within 24 hours' END,
 'Way ID '||t.original_delivery_way_id||' | '||t.assigned_department||' | '||t.task_type||
 ' | due '||to_char(t.due_at AT TIME ZONE 'Asia/Yangon','YYYY-MM-DD HH24:MI')||' Myanmar time.',
 'workflow','PARCEL_FOLLOWUP_TASK',
 'PARCEL_FOLLOWUP:'||t.id::text||CASE WHEN t.due_at<now() THEN ':OVERDUE' ELSE ':DUE_SOON' END,
 'be_parcel_followup_tasks_v1',t.id::text,t.original_delivery_way_id,
 CASE WHEN t.due_at<now() THEN 'HIGH' ELSE 'NORMAL' END,false,now()
 FROM public.be_parcel_followup_tasks_v1 t
 WHERE t.status NOT IN ('RESOLVED','CANCELLED') AND t.due_at<=now()+interval '24 hours'
 AND t.assigned_user_id IS NOT NULL
 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS v_created=ROW_COUNT;
 RETURN jsonb_build_object('targeted_reminders_written',v_created);
END $f$;
REVOKE ALL ON FUNCTION private.be_parcel_followup_reminder_tick_v1() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_parcel_bulk_followup_decide_v1(
 p_batch_id uuid,p_decision text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $f$
DECLARE v_actor uuid:=auth.uid(); v_role text; v_batch record;
BEGIN
 v_role:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 IF v_actor IS NULL OR v_role NOT IN ('superadmin','super_admin','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'Decision not authorized' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('APPROVED','REJECTED','CANCELLED') OR length(btrim(coalesce(p_reason,'')))<8
 THEN RAISE EXCEPTION 'Decision and reason required'; END IF;
 SELECT * INTO v_batch FROM public.be_parcel_bulk_followup_batches_v1
 WHERE request_id=p_batch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
 IF p_decision='APPROVED' AND v_batch.created_by=v_actor
 THEN RAISE EXCEPTION 'Independent reviewer required'; END IF;
 INSERT INTO public.be_parcel_bulk_followup_decisions_v1(batch_id,decision,reason,decided_by)
 VALUES(p_batch_id,p_decision,btrim(p_reason),v_actor);
 IF p_decision IN ('REJECTED','CANCELLED') THEN
   UPDATE public.be_parcel_followup_tasks_v1 t
   SET status='CANCELLED',resolved_at=now(),resolved_by=v_actor,
       resolution_note=left(p_decision||': '||btrim(p_reason),1000)
   WHERE t.notification_request_id=p_batch_id AND t.status IN ('OPEN','ACKNOWLEDGED');
   INSERT INTO public.be_app_notifications(
     target_user_id,title,message,body,is_read,created_at,event_key,event_type,
     notification_type,source_table,source_key,waybill_no,category,priority,metadata)
   SELECT DISTINCT t.assigned_user_id::text,
    'Parcel task '||lower(p_decision)||' / တာဝန်ပယ်ဖျက်ထားသည်',
    'Way ID: '||t.original_delivery_way_id||E'\\nManager decision: '||p_decision||E'\\nReason: '||btrim(p_reason),
    'Original parcel history is unchanged. Follow-up assignment was '||lower(p_decision),
    false,now(),'BE_PARCEL_BATCH_REVIEW:'||t.id::text,
    'PARCEL_FOLLOWUP','PARCEL_BATCH_REVIEW_'||t.id::text,
    'be_parcel_followup_tasks_v1',t.id::text,t.original_delivery_way_id,
    'operations','NORMAL',jsonb_build_object('batch_id',p_batch_id,'decision',p_decision)
   FROM public.be_parcel_followup_tasks_v1 t WHERE t.notification_request_id=p_batch_id AND t.status='CANCELLED'
   ON CONFLICT(event_key) DO NOTHING;
 END IF;
 -- Decision concerns follow-up task review, NOT proof of delivery or COD approval.
 RETURN jsonb_build_object('batch_id',p_batch_id,'review_decision',p_decision);
END $f$;
REVOKE ALL ON FUNCTION public.be_parcel_bulk_followup_decide_v1(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_bulk_followup_decide_v1(uuid,text,text) TO authenticated;
COMMIT;
