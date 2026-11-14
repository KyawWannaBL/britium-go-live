-- Production candidate: Customer Service controlled delivery-date amendment,
-- shared field exception "Other" reason, and safe Rider Wayplan readiness.
-- Apply only after preview + operational UAT. Never dispatch a parcel here.
BEGIN;

INSERT INTO public.be_exception_rules
(exception_code,process_type,exception_name_en,exception_name_mm,mapped_status,severity,require_photo,require_remark,next_action,raw_rule,active)
VALUES
('OTHER_REASON','DELIVERY','Other reason (describe the issue)','အခြားအကြောင်းအရာ (အကြောင်းရင်းအသေးစိတ်ရေးရန်)','DELIVERY_ATTEMPTED','MEDIUM','NO','YES','CUSTOMER_SERVICE_REVIEW',
 '{"require_free_text":true,"category":"OTHER","source":"RIDER_CS_UNIFIED_V218"}'::jsonb,true)
ON CONFLICT (process_type,exception_code) DO UPDATE SET
 exception_name_en=EXCLUDED.exception_name_en,
 exception_name_mm=EXCLUDED.exception_name_mm,
 mapped_status=EXCLUDED.mapped_status,
 require_remark='YES',require_photo='NO',next_action=EXCLUDED.next_action,
 raw_rule=coalesce(public.be_exception_rules.raw_rule,'{}'::jsonb)||EXCLUDED.raw_rule,
 active=true,updated_at=now();

INSERT INTO public.be_delivery_failure_reasons
(reason_code,reason_mm,reason_en,requires_reschedule,requires_other_text,status,
 sort_order,requires_note,active,failure_category)
VALUES
('OTHER_REASON','အခြားအကြောင်းအရာ (အသေးစိတ်ဖြည့်ပါ)','Other reason (free-text required)',false,true,
 'active',990,true,true,'INVALID_REASON')
ON CONFLICT (reason_code) DO UPDATE SET
 reason_mm=EXCLUDED.reason_mm,reason_en=EXCLUDED.reason_en,
 requires_other_text=true,requires_note=true,active=true,status='active',
 failure_category='INVALID_REASON',updated_at=now();

CREATE OR REPLACE FUNCTION public.be_cs_change_delivery_appointment_v218(
 p_way_id text,p_new_delivery_date date,p_customer_confirmation text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $function$
DECLARE
 v_role text:=lower(regexp_replace(btrim(coalesce(
   public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
 v_way text;
 v_existing public.be_delivery_reschedules_v71%rowtype;
 v_result jsonb;
 v_today date:=(now() at time zone 'Asia/Yangon')::date;
 v_actor text:=coalesce(nullif(lower(auth.jwt()->>'email'),''),'authenticated-user');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
 IF v_role NOT IN ('customer_service','cs','support','super_admin','superadmin',
                   'operation_manager','operations_manager','admin','app_owner')
 THEN RAISE EXCEPTION 'CUSTOMER_SERVICE_DATE_CHANGE_AUTHORITY_REQUIRED' USING errcode='42501'; END IF;
 IF p_new_delivery_date IS NULL OR p_new_delivery_date<v_today
 THEN RAISE EXCEPTION 'DELIVERY_DATE_MUST_BE_TODAY_OR_LATER_IN_YANGON'; END IF;
 IF length(btrim(coalesce(p_customer_confirmation,'')))<12
 THEN RAISE EXCEPTION 'CUSTOMER_CONFIRMATION_NOTE_REQUIRED'; END IF;
 v_way:=public.be_resolve_internal_way_id_v70(p_way_id,null);
 IF v_way IS NULL THEN RAISE EXCEPTION 'WAY_NOT_FOUND'; END IF;
 SELECT * INTO v_existing FROM public.be_delivery_reschedules_v71
 WHERE delivery_way_id=v_way AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_CUSTOMER_RESCHEDULE_REQUIRED'; END IF;
 IF v_existing.requested_delivery_date=p_new_delivery_date THEN
    RETURN jsonb_build_object('ok',true,'unchanged',true,'way_id',v_way,
      'requested_delivery_date',p_new_delivery_date);
 END IF;
 v_result:=public.be_set_delivery_reschedule_v71(
   v_way,p_new_delivery_date,'CUSTOMER_REQUESTED_RESCHEDULE',
   v_actor,'Customer Service confirmed revision: '||btrim(p_customer_confirmation));
 UPDATE public.be_delivery_reschedules_v71
 SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
   'latest_cs_appointment_change',jsonb_build_object(
     'old_date',v_existing.requested_delivery_date,
     'new_date',p_new_delivery_date,'by',v_actor,'at',now(),
     'confirmation',btrim(p_customer_confirmation)
   ),
   'cs_appointment_change_history',
   coalesce(v_existing.metadata->'cs_appointment_change_history','[]'::jsonb)
   ||jsonb_build_array(jsonb_build_object(
     'old_date',v_existing.requested_delivery_date,'new_date',p_new_delivery_date,
     'by',v_actor,'at',now(),'confirmation',btrim(p_customer_confirmation)
   ))
 )
 WHERE delivery_way_id=v_way;
 RETURN jsonb_build_object('ok',true,'way_id',v_way,
   'previous_date',v_existing.requested_delivery_date,
   'requested_delivery_date',p_new_delivery_date,
   'warehouse_return_scan_still_required',not exists(
      select 1 from public.be_warehouse_return_scans_v39 s
      where s.delivery_way_id=v_way
   ),
   'wayplan_eligible',public.be_delivery_schedule_allows_wayplan_v71(v_way),
   'schedule',v_result);
END;
$function$;
REVOKE ALL ON FUNCTION public.be_cs_change_delivery_appointment_v218(text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_cs_change_delivery_appointment_v218(text,date,text) TO authenticated;
COMMIT;
