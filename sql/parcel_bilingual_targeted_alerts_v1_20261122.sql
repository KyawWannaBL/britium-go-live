-- Bilingual targeted parcel action notifications, operational only.
-- Callers are verified against server-side be_current_role; recipient identity is
-- resolved from the registry. Department broadcast is capped and never uses target_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.be_parcel_department_key_v1(p_department text, p_role text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT CASE
  WHEN lower(coalesce(p_department,'')) ~ 'finance|account|ငွေ|စာရင်း' OR lower(coalesce(p_role,'')) ~ 'finance|account' THEN 'FINANCE'
  WHEN lower(coalesce(p_department,'')) ~ 'warehouse|ဂိုဒေါင်' OR lower(coalesce(p_role,'')) ~ 'warehouse' THEN 'WAREHOUSE'
  WHEN lower(coalesce(p_department,'')) ~ 'customer|service|cs|ဝန်ဆောင်' OR lower(coalesce(p_role,'')) ~ 'customer_service|^cs$' THEN 'CUSTOMER_SERVICE'
  WHEN lower(coalesce(p_department,'')) ~ 'branch|ရုံးခွဲ' OR lower(coalesce(p_role,'')) ~ 'branch' THEN 'BRANCH'
  WHEN lower(coalesce(p_department,'')) ~ 'third.party|provider|3pl|ပြင်ပ' THEN 'THIRD_PARTY'
  WHEN lower(coalesce(p_department,'')) ~ 'merchant|ဆိုင်' THEN 'MERCHANT_RELATIONS'
  WHEN lower(coalesce(p_department,'')) ~ 'admin|hr|စီမံ' OR lower(coalesce(p_role,'')) ~ 'admin|human_resource' THEN 'ADMIN_HR'
  WHEN lower(coalesce(p_department,'')) ~ 'market|ဈေးကွက်' OR lower(coalesce(p_role,'')) ~ 'marketing' THEN 'MARKETING'
  WHEN lower(coalesce(p_role,'')) ~ 'rider|driver|helper' THEN 'FIELD_TEAM'
  WHEN lower(coalesce(p_department,'')) ~ 'operation|လုပ်ငန်း' OR lower(coalesce(p_role,'')) ~ 'operation|supervisor|dispatch' THEN 'OPERATIONS'
  ELSE 'UNASSIGNED' END
$fn$;
REVOKE ALL ON FUNCTION public.be_parcel_department_key_v1(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_department_key_v1(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.be_parcel_alert_directory_v1()
RETURNS TABLE(auth_user_id uuid, full_name text, email text, department text, role_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT u.auth_user_id, coalesce(nullif(trim(u.full_name),''),nullif(trim(u.display_name),''),u.email),
 u.email,
 public.be_parcel_department_key_v1(u.department,coalesce(u.role_code,u.app_role,u.role)),
 coalesce(u.role_code,u.app_role,u.role)
 FROM public.be_user_account_registry u
 WHERE auth.uid() IS NOT NULL
 AND lower(replace(public.be_current_role(),'-','_')) IN ('superadmin','super_admin','operation_manager','operations_manager')
 AND u.auth_user_id IS NOT NULL
 AND coalesce(u.active,u.is_active,true)
 AND lower(coalesce(u.status,'active')) IN ('active','enabled')
 ORDER BY u.full_name NULLS LAST,u.email LIMIT 400
$fn$;
REVOKE ALL ON FUNCTION public.be_parcel_alert_directory_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_alert_directory_v1() TO authenticated;

ALTER TABLE public.be_parcel_followup_tasks_v1
 ADD COLUMN IF NOT EXISTS notification_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS be_followup_task_request_recipient_idx
 ON public.be_parcel_followup_tasks_v1(notification_request_id,assigned_user_id)
 WHERE notification_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.be_parcel_send_targeted_alert_v1(
 p_way_id text, p_department text, p_recipient_scope text, p_recipient_user_id uuid,
 p_task_type text, p_message_en text, p_message_my text,
 p_due_at timestamptz, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_actor uuid := auth.uid(); v_role text;
        v_user record; v_count int:=0; v_task_id uuid; v_dept text;
        v_total int:=0; v_existing int:=0;
BEGIN
 v_role := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 IF v_actor IS NULL OR v_role NOT IN ('superadmin','super_admin','operation_manager','operations_manager')
   THEN RAISE EXCEPTION 'Not authorized to assign parcel alerts' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID is mandatory'; END IF;
 IF p_recipient_scope NOT IN ('PERSON','DEPARTMENT')
   THEN RAISE EXCEPTION 'Select person or department'; END IF;
 IF length(trim(coalesce(p_way_id,'')))<3 OR length(trim(p_way_id))>90
   OR NOT EXISTS(SELECT 1 FROM public.be_v_warehouse_lifecycle_v39 w WHERE w.delivery_way_id=trim(p_way_id))
   THEN RAISE EXCEPTION 'Unknown warehouse Way ID'; END IF;
 IF p_department NOT IN ('OPERATIONS','WAREHOUSE','CUSTOMER_SERVICE','FINANCE','BRANCH',
     'THIRD_PARTY','MERCHANT_RELATIONS','ADMIN_HR','MARKETING','FIELD_TEAM')
   THEN RAISE EXCEPTION 'Invalid department'; END IF;
 IF p_task_type NOT IN ('POD_VERIFICATION','PROVIDER_HANDOVER','RTO_CONFIRMATION',
     'COD_RECONCILIATION','GATE_SETTLEMENT','LOCATION_AND_CUSTODY','OTHER_REVIEW')
   THEN RAISE EXCEPTION 'Invalid action type'; END IF;
 IF length(trim(coalesce(p_message_en,'')))<8 OR length(trim(coalesce(p_message_my,'')))<8
    OR length(p_message_en)>1500 OR length(p_message_my)>1500
   THEN RAISE EXCEPTION 'Both bilingual messages must be 8-1500 characters'; END IF;
 IF p_due_at IS NULL OR p_due_at<now()+interval '5 minutes' OR p_due_at>now()+interval '30 days'
   THEN RAISE EXCEPTION 'Deadline must be between 5 minutes and 30 days'; END IF;
 IF p_recipient_scope='PERSON' AND p_recipient_user_id IS NULL THEN
   RAISE EXCEPTION 'Choose an individual employee'; END IF;
 -- A repeated browser submission never sends additional notifications.
 SELECT count(*) INTO v_existing FROM public.be_parcel_followup_tasks_v1
 WHERE notification_request_id=p_request_id AND created_by=v_actor;
 IF v_existing>0 THEN RETURN jsonb_build_object('sent',v_existing,'already_sent',true); END IF;

 FOR v_user IN
   SELECT u.auth_user_id,u.email,
     public.be_parcel_department_key_v1(u.department,coalesce(u.role_code,u.app_role,u.role)) AS department_key
   FROM public.be_user_account_registry u
   WHERE u.auth_user_id IS NOT NULL
     AND coalesce(u.active,u.is_active,true)
     AND lower(coalesce(u.status,'active')) IN ('active','enabled')
     AND (p_recipient_scope='DEPARTMENT' OR u.auth_user_id=p_recipient_user_id)
   ORDER BY u.email
 LOOP
   v_dept:=v_user.department_key;
   IF v_dept<>p_department THEN CONTINUE; END IF;
   v_total:=v_total+1;
   IF v_total>80 THEN RAISE EXCEPTION 'Department exceeds 80 recipients; choose individuals or a smaller team'; END IF;
   INSERT INTO public.be_parcel_followup_tasks_v1(
       original_delivery_way_id,assigned_user_id,assigned_department,task_type,
       task_note,created_by,due_at,notification_request_id)
   VALUES(trim(p_way_id),v_user.auth_user_id,p_department,p_task_type,
       left(trim(p_message_en)||E'\n'||trim(p_message_my),3000),v_actor,p_due_at,p_request_id)
   ON CONFLICT DO NOTHING RETURNING id INTO v_task_id;
   IF v_task_id IS NULL THEN CONTINUE; END IF;

   INSERT INTO public.be_app_notifications(
     target_user_id,target_email,title,message,body,is_read,created_at,
     event_key,event_type,notification_type,source_table,source_key,
     waybill_no,category,priority,metadata)
   VALUES(v_user.auth_user_id::text,v_user.email,
     'Parcel task / ပါဆယ်လုပ်ငန်းတာဝန်',
     'Way ID: '||trim(p_way_id)||E'\n'||trim(p_message_en)||E'\n'||trim(p_message_my),
     trim(p_message_en)||E'\n'||trim(p_message_my),false,now(),
     'BE_PARCEL_TASK:'||v_task_id::text,'PARCEL_FOLLOWUP',
     'PARCEL_TASK_'||v_task_id::text,'be_parcel_followup_tasks_v1',
     v_task_id::text,trim(p_way_id),'operations','HIGH',
     jsonb_build_object('link','/parcel-follow-up','way_id',trim(p_way_id),
     'assigned_department',p_department,'language','en,my',
     'due_at',p_due_at,'task_id',v_task_id));
   v_count:=v_count+1; v_task_id:=NULL;
 END LOOP;
 IF v_total=0 THEN RAISE EXCEPTION 'No active matching recipient in selected department'; END IF;
 RETURN jsonb_build_object('sent',v_count,'already_sent',false,
   'department',p_department,'scope',p_recipient_scope,'way_id',trim(p_way_id));
END $fn$;
REVOKE ALL ON FUNCTION public.be_parcel_send_targeted_alert_v1(text,text,text,uuid,text,text,text,timestamptz,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_parcel_send_targeted_alert_v1(text,text,text,uuid,text,text,text,timestamptz,uuid)
 TO authenticated;
COMMENT ON FUNCTION public.be_parcel_send_targeted_alert_v1(text,text,text,uuid,text,text,text,timestamptz,uuid)
 IS 'Atomic Way ID task + exact recipient in-app notification, bilingual, idempotent, 80-recipient cap, no financial posting.';
COMMIT;
