create or replace function public.be_branch_department_action_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_department_scope_v1(p->>'branch',true); m text:=lower(p->>'module'); a text:=upper(p->>'action'); rec jsonb:=coalesce(p->'record','{}'); k uuid:=nullif(coalesce(p->>'id',rec->>'id'),'')::uuid; name text:=nullif(btrim(rec->>'entity_name'),''); actor text; result jsonb; employee text; target text; way text; pickup text; proposed jsonb;
begin
 select lower(email) into actor from be_user_account_registry where auth_user_id=auth.uid() limit 1;
 if m not in('marketing','bd','cs','hr','master','tariff') then raise exception 'UNKNOWN_DEPARTMENT';end if;
 if a='REQUEST' then
  if nullif(btrim(rec->>'title'),'') is null or length(btrim(coalesce(rec->>'notes','')))<8 then raise exception 'REQUEST_TITLE_REASON_REQUIRED';end if;
  proposed:=jsonb_build_object('module',m,'title',rec->>'title','notes',rec->>'notes','proposed_value',rec->>'proposed_value','evidence',rec->>'evidence','branch_code',b,'application_status','NOT_APPLIED');
  result:=public.be_branch_amendment_request(jsonb_build_object('branch_code',b,'request_type','BRANCH_MODULE_'||upper(m),'target_table',case m when 'hr' then 'be_employee_master' when 'tariff' then 'be_delivery_tariff_master' else 'be_master_data_rows' end,'target_id',coalesce(nullif(rec->>'target_id',''),'NEW'),'requested_data',proposed,'remarks',rec->>'notes','actor_email',actor));
 elsif m in('marketing','bd') and a='SAVE' then
  if name is null then raise exception 'ENTITY_NAME_REQUIRED';end if;
  if length(name)>300 or coalesce(nullif(rec->>'expected_volume','')::integer,0)<0 or coalesce(nullif(rec->>'expected_revenue','')::numeric,0)<0 or coalesce(nullif(rec->>'expected_monthly_shipments','')::integer,0)<0 or coalesce(nullif(rec->>'expected_monthly_revenue','')::numeric,0)<0 then raise exception 'INVALID_PROSPECT_VALUES';end if;
  if m='marketing' then
   if coalesce(rec->>'stage','new') not in('new','contacted','qualified','proposal','negotiation','converted','closed_won','closed_lost') then raise exception 'INVALID_STAGE';end if;
   if k is null then
    insert into be_marketing_leads(entity_name,lead_name,contact_name,phone,email,city,township,customer_or_merchant,stage,status,source,expected_revenue,expected_volume,notes,note,created_by,branch_code,payload)
    values(name,name,rec->>'contact_name',rec->>'phone',lower(rec->>'email'),rec->>'city',rec->>'township',coalesce(rec->>'customer_or_merchant','merchant'),coalesce(rec->>'stage','new'),'new','branch_portal',coalesce(nullif(rec->>'expected_revenue','')::numeric,0),coalesce(nullif(rec->>'expected_volume','')::integer,0),rec->>'notes',rec->>'notes',auth.uid(),b,jsonb_build_object('branch_code',b)) returning id into k;
   else
    perform 1 from be_marketing_leads where id=k and branch_code=b for update;if not found then raise exception 'BRANCH_RECORD_DENIED';end if;
    update be_marketing_leads set entity_name=name,lead_name=name,contact_name=rec->>'contact_name',phone=rec->>'phone',email=lower(rec->>'email'),city=rec->>'city',township=rec->>'township',stage=coalesce(rec->>'stage',stage),expected_revenue=coalesce(nullif(rec->>'expected_revenue','')::numeric,0),expected_volume=coalesce(nullif(rec->>'expected_volume','')::integer,0),notes=rec->>'notes',note=rec->>'notes',updated_at=now() where id=k;
   end if;
  else
   if coalesce(rec->>'stage','prospect') not in('prospect','qualified','proposal','negotiation','closed_won','closed_lost') then raise exception 'INVALID_STAGE';end if;
   if k is null then
    insert into be_bd_accounts(account_type,entity_name,contact_name,phone,email,city,township,owner_id,owner_name,stage,expected_monthly_shipments,expected_monthly_revenue,status,notes,payload,source,branch_code)
    values('merchant',name,rec->>'contact_name',rec->>'phone',lower(rec->>'email'),rec->>'city',rec->>'township',auth.uid(),actor,coalesce(rec->>'stage','prospect'),coalesce(nullif(rec->>'expected_monthly_shipments','')::integer,0),coalesce(nullif(rec->>'expected_monthly_revenue','')::numeric,0),'active',rec->>'notes',jsonb_build_object('branch_code',b),'branch_portal',b) returning id into k;
   else
    perform 1 from be_bd_accounts where id=k and branch_code=b for update;if not found then raise exception 'BRANCH_RECORD_DENIED';end if;
    update be_bd_accounts set entity_name=name,contact_name=rec->>'contact_name',phone=rec->>'phone',email=lower(rec->>'email'),city=rec->>'city',township=rec->>'township',stage=coalesce(rec->>'stage',stage),expected_monthly_shipments=coalesce(nullif(rec->>'expected_monthly_shipments','')::integer,0),expected_monthly_revenue=coalesce(nullif(rec->>'expected_monthly_revenue','')::numeric,0),notes=rec->>'notes',updated_at=now() where id=k;
   end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',k,'branch_code',b);
 elsif m='cs' then
  target:=coalesce(nullif(p->>'target_role',''),'operations');if target not in('operations','dispatch','warehouse','supervisor','finance','customer_service') then raise exception 'INVALID_TARGET_DEPARTMENT';end if;
  if a='CREATE_CASE' then
   way:=btrim(rec->>'way_id');if not public.be_branch_department_way_v1(way,b) then raise exception 'BRANCH_WAY_DENIED';end if;
   if nullif(btrim(rec->>'title'),'') is null then raise exception 'CASE_TITLE_REQUIRED';end if;
   select d.pickup_id into pickup from be_data_entry_parcel_details d where d.delivery_way_id=way limit 1;
   result:=public.be_cs_create_ticket(jsonb_build_object('way_id',way,'pickup_id',pickup,'title',rec->>'title','description',rec->>'description','customer_name',rec->>'customer_name','customer_phone',rec->>'customer_phone','issue_type',coalesce(rec->>'issue_type','INQUIRY'),'priority',coalesce(rec->>'priority','medium'),'target_role',target,'sender_email',actor,'source','branch_portal','branch_code',b,'selected_waybills',jsonb_build_array(way)));
   if result->>'ok'='true' then update be_cs_tickets set branch_code=b,created_by=auth.uid() where id=(result->>'ticket_id')::uuid;end if;
  elsif a in('MESSAGE','STATUS') then
   perform 1 from be_cs_tickets t where t.id=k and (t.branch_code=b or public.be_branch_department_way_v1(t.way_id,b)) for update;if not found then raise exception 'BRANCH_CASE_DENIED';end if;
   if a='MESSAGE' then
    if nullif(btrim(p->>'message'),'') is null then raise exception 'MESSAGE_REQUIRED';end if;
    result:=public.be_cs_add_message(k,p->>'message','branch_manager',target,jsonb_build_object('sender_email',actor,'branch_code',b,'is_internal',true));
   else
    if p->>'status' not in('open','in_progress','waiting_customer','waiting_operations','resolved','closed','cancelled') then raise exception 'INVALID_STATUS';end if;
    if p->>'status' in('resolved','closed','cancelled') and length(btrim(coalesce(p->>'note','')))<8 then raise exception 'RESOLUTION_NOTE_REQUIRED';end if;
    result:=public.be_cs_update_ticket_status(k,p->>'status',p->>'note',target);
   end if;
  else raise exception 'INVALID_DEPARTMENT_ACTION';end if;
 elsif m='hr' and a in('PROFILE','REGISTER_DOCUMENT') then
  employee:=coalesce(nullif(rec->>'employee_id',''),nullif(rec->>'employee_code',''));
  perform 1 from be_employee_master e where upper(e.branch_code)=b and employee in(e.employee_id,e.employee_code) for update;
  if not found then perform 1 from be_user_account_registry r where upper(r.branch_code)=b and employee in(r.worker_code,r.email) for update;end if;
  if not found then raise exception 'BRANCH_EMPLOYEE_DENIED';end if;
  if a='PROFILE' then
   if nullif(btrim(rec->>'display_name'),'') is null then raise exception 'EMPLOYEE_NAME_REQUIRED';end if;
   update be_employee_master set employee_name=btrim(rec->>'display_name'),display_name=btrim(rec->>'display_name'),full_name=btrim(rec->>'display_name'),name=btrim(rec->>'display_name'),phone_primary=rec->>'phone_primary',phone_e164=rec->>'phone_primary',updated_at=now() where upper(branch_code)=b and employee in(employee_id,employee_code);
   -- Names/phones only; role, branch, pay, status and account identity never come from this form.
   update be_user_account_registry r set full_name=rec->>'display_name',display_name=rec->>'display_name',phone_number=rec->>'phone_primary' where upper(r.branch_code)=b and (employee in(r.worker_code,r.email) or r.auth_user_id in(select e.auth_user_id from be_employee_master e where upper(e.branch_code)=b and employee in(e.employee_id,e.employee_code)));
   update be_mobile_workforce_accounts w set full_name=rec->>'display_name',display_name=rec->>'display_name',name=rec->>'display_name',phone=rec->>'phone_primary',phone_primary=rec->>'phone_primary' where upper(w.branch_code)=b and w.auth_user_id in(select r.auth_user_id from be_user_account_registry r where upper(r.branch_code)=b and employee in(r.worker_code,r.email));
   update be_wayplan_roster_allowlist_v68 set display_name=rec->>'display_name',phone=rec->>'phone_primary' where upper(branch_code)=b and workforce_code=employee;
   update profiles pr set full_name=rec->>'display_name',phone=rec->>'phone_primary',updated_at=now() where pr.id in(select auth_user_id from be_employee_master where upper(branch_code)=b and employee in(employee_id,employee_code) union select auth_user_id from be_user_account_registry where upper(branch_code)=b and employee in(worker_code,email));
   result:=jsonb_build_object('ok',true,'employee_id',employee);
  else
   if coalesce(rec->>'storage_path','') not like b||'/'||auth.uid()::text||'/%' or strpos(rec->>'storage_path','..')>0 then raise exception 'DOCUMENT_PATH_DENIED';end if;
   if nullif(btrim(rec->>'title'),'') is null or coalesce(rec->>'document_type','OTHER') not in('EMPLOYMENT_CONTRACT','NRC_ID','NDA','AGREEMENT','HR_POLICY','WARNING','TRAINING','PAYROLL','LICENSE','OTHER') then raise exception 'INVALID_DOCUMENT';end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='hr-documents' and o.name=rec->>'storage_path') then raise exception 'DOCUMENT_UPLOAD_REQUIRED';end if;
   insert into be_hr_document_register_v1(employee_code,document_type,title,effective_date,expiry_date,status,storage_path,file_name,mime_type,notes,metadata,uploaded_by)
   values(employee,coalesce(rec->>'document_type','OTHER'),rec->>'title',nullif(rec->>'effective_date','')::date,nullif(rec->>'expiry_date','')::date,'ACTIVE',rec->>'storage_path',rec->>'file_name',rec->>'mime_type',rec->>'notes',jsonb_build_object('branch_code',b),auth.uid()) returning id into k;
   result:=jsonb_build_object('ok',true,'id',k);
  end if;
 else raise exception 'INVALID_DEPARTMENT_ACTION';end if;
 if result->>'ok' is distinct from 'true' then raise exception 'DEPARTMENT_ACTION_FAILED: %',result;end if;
 insert into be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_role(),'BRANCH_DEPARTMENT_'||a,m,coalesce(k::text,result->>'amendment_id',employee,way),jsonb_build_object('branch_code',b,'result',result));
 return result;
end $$;

revoke all on function public.be_branch_department_scope_v1(text,boolean),public.be_branch_department_way_v1(text,text),public.be_branch_department_snapshot_v1(text,text,text),public.be_branch_department_action_v1(jsonb) from public,anon;
grant execute on function public.be_branch_department_scope_v1(text,boolean),public.be_branch_department_way_v1(text,text),public.be_branch_department_snapshot_v1(text,text,text),public.be_branch_department_action_v1(jsonb) to authenticated;
