create or replace function public.be_cs_change_delivery_appointment_v218(
  p_way_id text, p_new_delivery_date date, p_customer_confirmation text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(),public.be_current_role(),'')), '[ _-]+','_','g'));
  v_way text := upper(btrim(coalesce(p_way_id,'')));
  v_parcel jsonb;
  v_existing public.be_delivery_reschedules_v71%rowtype;
  v_branch text;
  v_township text;
  v_status text;
  v_actor text := coalesce(nullif(lower(auth.jwt()->>'email'),''),auth.uid()::text);
  v_note text := btrim(coalesce(p_customer_confirmation,''));
  v_change jsonb;
begin
  if auth.uid() is null or v_role not in ('customer_service','cs','support','super_admin','superadmin',
    'operation_manager','operations_manager','admin','app_owner','operations_admin','supervisor') then
    raise exception 'Customer Service appointment permission is required.' using errcode='42501';
  end if;
  if p_new_delivery_date is null or not isfinite(p_new_delivery_date)
     or p_new_delivery_date < (now() at time zone 'Asia/Yangon')::date then
    raise exception 'Choose today or a later delivery date in Myanmar time.';
  end if;
  if length(v_note) not between 12 and 1000 then
    raise exception 'Enter the customer confirmation (12 to 1,000 characters).';
  end if;

  select to_jsonb(d) into v_parcel from public.be_data_entry_parcel_details d
  where d.delivery_way_id=v_way and d.saved_at is not null
    and coalesce(d.parcel_status,'')<>'duplicate_archived'
  for update;
  if not found then raise exception 'Open the registered parcel by its canonical Way ID.'; end if;

  v_branch := public.be_cs_resolve_parcel_branch(v_parcel);
  v_township := coalesce(nullif(v_parcel->>'township',''),nullif(v_parcel->>'delivery_township',''),nullif(v_parcel->>'recipient_township',''));
  if v_role not in ('super_admin','superadmin','app_owner','admin','operation_manager','operations_manager')
     and not (coalesce(public.be_employee_can_access_territory(null,v_branch,v_township,'update'),false)
              or coalesce(public.be_customer_service_can_manage_pickup_request(v_branch,v_township,'update'),false)) then
    raise exception 'Your account cannot change appointments for this parcel territory.' using errcode='42501';
  end if;

  select a.last_status into v_status from public.be_delivery_attempt_state_v39 a where a.delivery_way_id=v_way;
  if upper(coalesce(v_status,'')) in ('DELIVERED','RTO','RETURN_TO_SENDER')
    or upper(coalesce(v_parcel->>'parcel_status','')) in ('DELIVERED','COMPLETED','RTO','RETURNED','RETURNED_TO_SENDER','CANCELLED','CANCELED','SETTLED')
    or public.be_branch_warehouse_rto_confirmed_v1(v_way)
    or exists (select 1 from public.be_waybill_ledger l where l.delivery_way_id=v_way
        and (upper(coalesce(l.dispatch_status,'')) in ('DELIVERED','COMPLETED','RTO','CANCELLED','RETURNED_TO_SENDER')
          or upper(coalesce(l.rider_status,'')) in ('DELIVERED','RTO','CANCELLED','RETURNED_TO_SENDER'))) then
    raise exception 'This parcel is closed. Its delivery appointment cannot be changed.';
  end if;

  select * into v_existing from public.be_delivery_reschedules_v71
    where delivery_way_id=v_way for update;
  if v_existing.status='ACTIVE' and v_existing.requested_delivery_date=p_new_delivery_date then
    return jsonb_build_object('ok',true,'unchanged',true,'requested_delivery_date',p_new_delivery_date);
  end if;

  v_change := jsonb_build_object('old_date',v_existing.requested_delivery_date,'new_date',p_new_delivery_date,
    'by',v_actor,'at',now(),'confirmation',v_note);
  insert into public.be_delivery_reschedules_v71(
    delivery_way_id,original_way_id,requested_delivery_date,reason_code,reason_name_en,reason_name_mm,
    note,status,requested_by,requested_at,updated_at,metadata
  ) values (
    v_way,public.be_operational_way_id_v70(v_way),p_new_delivery_date,'CUSTOMER_REQUESTED_RESCHEDULE',
    'Customer-requested delivery appointment','Customer သတ်မှတ် ပို့ဆောင်ရက်ချိန်း',v_note,'ACTIVE',v_actor,
    now(),now(),jsonb_build_object('pickup_id',v_parcel->>'pickup_id','latest_cs_appointment_change',v_change,
      'cs_appointment_change_history',jsonb_build_array(v_change))
  )
  on conflict (delivery_way_id) do update set
    requested_delivery_date=excluded.requested_delivery_date,
    status='ACTIVE',
    updated_at=now(),
    metadata=coalesce(be_delivery_reschedules_v71.metadata,'{}'::jsonb)||jsonb_build_object(
      'latest_cs_appointment_change',v_change,
      'cs_appointment_change_history',coalesce(be_delivery_reschedules_v71.metadata->'cs_appointment_change_history','[]'::jsonb)
        ||jsonb_build_array(v_change)
    );

  insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  values (case when v_existing.delivery_way_id is null then 'CREATE' else 'UPDATE' end,
    'be_delivery_reschedules_v71',v_way,to_jsonb(v_existing),v_change,auth.uid(),now());
  return jsonb_build_object('ok',true,'requested_delivery_date',p_new_delivery_date);
end;
$$;

revoke all on function public.be_cs_change_delivery_appointment_v218(text,date,text) from public,anon;
grant execute on function public.be_cs_change_delivery_appointment_v218(text,date,text) to authenticated;
CREATE OR REPLACE FUNCTION public.be_warehouse_return_scan_v71(p_tracking_no text, p_reason_code text, p_delivery_date date DEFAULT NULL::date, p_actor_email text DEFAULT NULL::text, p_remark text DEFAULT NULL::text, p_warehouse_code text DEFAULT 'YGN-MAIN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_input text:=nullif(upper(btrim(coalesce(p_tracking_no,''))),'');
  v_internal text;
  v_reason text:=upper(nullif(btrim(coalesce(p_reason_code,'')),''));
  v_saved_reason text;
  v_effective_date date;
  v_existing_date date;
  v_result jsonb;
  v_schedule jsonb:='{}'::jsonb;
begin
 -- BRANCH_WAREHOUSE_ENTRY_V1
 if replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then
perform public.be_branch_warehouse_require_way_v1(p_tracking_no,'RETURN');p_warehouse_code:=public.be_branch_warehouse_scope_v1(true)||'-MAIN';p_actor_email:=public.be_warehouse_actor_email();
 end if;

  if v_input is null then raise exception 'Delivery Way ID is required'; end if;
  v_internal:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_internal is null then raise exception 'Way ID % was not found',v_input; end if;

  -- Serialize against CS appointment changes for the same parcel.
  perform 1 from public.be_data_entry_parcel_details where delivery_way_id=v_internal for update;
  select upper(nullif(btrim(s.last_failure_reason),'')) into v_saved_reason
  from public.be_delivery_attempt_state_v39 s
  where upper(s.delivery_way_id)=v_internal limit 1;
  -- Field-submitted reason is authoritative; Warehouse need not enter it again.
  v_reason:=coalesce(v_saved_reason,v_reason);
  v_effective_date:=p_delivery_date;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' then
    select requested_delivery_date into v_existing_date
    from public.be_delivery_reschedules_v71
    where delivery_way_id=v_internal and status='ACTIVE' limit 1;
    v_effective_date:=coalesce(v_existing_date,p_delivery_date);
  end if;
  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_effective_date is null then
    raise exception 'Dedicated delivery date is required for customer reschedule';
  end if;

  v_result:=public.be_warehouse_return_scan(
    v_internal,v_reason,p_actor_email,p_remark,p_warehouse_code
  );

  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and v_result->>'ok'='true' and v_existing_date is null then
    v_schedule:=public.be_set_delivery_reschedule_v71(
      v_internal,v_effective_date,v_reason,p_actor_email,p_remark
    );
  elsif v_existing_date is not null then
    v_schedule:=jsonb_build_object('requested_delivery_date',v_existing_date);
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'input_way_id',v_input,
    'operational_way_id',public.be_operational_way_id_v70(v_internal),
    'internal_delivery_way_id',v_internal,
    'reschedule',v_schedule,
    'build','WAREHOUSE_RETURN_RESCHEDULE_V71'
  );
end;
$function$;
