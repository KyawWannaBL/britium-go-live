-- Shared departmental records, explicitly attributed without guessing historical branches.
alter table public.be_marketing_leads add column if not exists branch_code text;
alter table public.be_bd_accounts add column if not exists branch_code text;
alter table public.be_cs_tickets add column if not exists branch_code text;
create index if not exists be_marketing_leads_branch_updated on public.be_marketing_leads(branch_code,updated_at desc);
create index if not exists be_bd_accounts_branch_updated on public.be_bd_accounts(branch_code,updated_at desc);
create index if not exists be_cs_tickets_branch_updated on public.be_cs_tickets(branch_code,updated_at desc);

create or replace function public.be_branch_department_scope_v1(p_branch text default null,p_write boolean default false)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare r text:=replace(public.be_current_role(),'-','_'); b text;
begin
 if r not in ('branch_manager','branch_office_manager','superadmin','super_admin','app_owner','sys') then raise exception 'DEPARTMENT_ACCESS_DENIED' using errcode='42501';end if;
 b:=public.be_branch_scope_v1(p_branch);
 if b is null then raise exception 'SELECT_ONE_BRANCH';end if;
 if p_write and r in ('branch_manager','branch_office_manager') and not exists(
  select 1 from public.be_employee_territory_assignments a where a.user_id=auth.uid() and a.active and a.scope_type='BRANCH' and upper(a.branch_code)=b and a.can_create and a.can_update
 ) then raise exception 'BRANCH_WRITE_DENIED' using errcode='42501';end if;
 return b;
end $$;

-- Owner-only set helper avoids a registry/territory lookup for every candidate parcel.
create or replace function public.be_branch_department_related_ways_v1(p_branch text)
returns setof text language sql stable security invoker set search_path=public,pg_temp as $$
 select d.delivery_way_id from public.be_data_entry_parcel_details d where
  exists(select 1 from public.be_portal_pickup_requests p where p.pickup_id=d.pickup_id and upper(p.branch_code)=p_branch)
  or exists(select 1 from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 t on t.id=i.transfer_id where i.delivery_way_id=d.delivery_way_id and p_branch in(t.from_branch,t.to_branch));
$$;
revoke all on function public.be_branch_department_related_ways_v1(text) from public,anon,authenticated;
create or replace function public.be_branch_department_way_v1(p_way text,p_branch text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select public.be_branch_department_scope_v1(p_branch)=p_branch and exists(select 1 from public.be_branch_department_related_ways_v1(p_branch) w where w=p_way);
$$;

create or replace function public.be_branch_department_snapshot_v1(p_module text,p_branch text default null,p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_department_scope_v1(p_branch); m text:=lower(p_module); q text:=lower(btrim(coalesce(p_search,''))); rows jsonb:='[]'; documents jsonb:='[]'; messages jsonb:='[]'; requests jsonb:='[]'; total bigint:=0;
begin
 if m='marketing' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into total,rows from(select id,lead_no,entity_name,contact_name,phone,email,city,township,customer_or_merchant,stage,status,expected_revenue,expected_volume,notes,branch_code,updated_at from be_marketing_leads where branch_code=b and (q='' or lower(coalesce(entity_name,'')||' '||coalesce(phone,'')||' '||coalesce(stage,'')) like '%'||q||'%') order by updated_at desc limit 500)x;
 elsif m='bd' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into total,rows from(select id,account_no,entity_name,account_type,contact_name,phone,email,city,township,stage,status,expected_monthly_shipments,expected_monthly_revenue,notes,branch_code,updated_at from be_bd_accounts where branch_code=b and (q='' or lower(coalesce(entity_name,'')||' '||coalesce(phone,'')||' '||coalesce(stage,'')) like '%'||q||'%') order by updated_at desc limit 500)x;
 elsif m='cs' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') into total,rows from(select id,ticket_no,way_id,pickup_id,title,description,customer_name,customer_phone,issue_type,priority,status,payload,updated_at from be_cs_tickets where (branch_code=b or way_id in(select public.be_branch_department_related_ways_v1(b))) and (q='' or lower(coalesce(way_id,'')||' '||coalesce(ticket_no,'')||' '||coalesce(title,'')) like '%'||q||'%') order by updated_at desc limit 500)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') into messages from(select cm.id,cm.ticket_id,cm.message,cm.sender_email,cm.sender_role,cm.target_role,cm.message_type,cm.created_at from be_cs_messages cm where cm.ticket_id in(select (j->>'id')::uuid from jsonb_array_elements(rows)j) order by cm.created_at desc limit 2000)x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into documents from(select d.delivery_way_id,d.pickup_id,d.recipient_name,d.contact_no_1,d.township,d.parcel_status from be_data_entry_parcel_details d where d.delivery_way_id in(select public.be_branch_department_related_ways_v1(b)) and(q='' or lower(d.delivery_way_id||' '||coalesce(d.recipient_name,'')) like '%'||q||'%') order by d.delivery_way_id desc limit 500)x;
 elsif m='hr' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.employee_id),'[]') into total,rows from(select * from (
    select employee_id,employee_code,employee_name,display_name,phone_primary,email,role_id,department,status,is_active,branch_code from be_employee_master where upper(branch_code)=b
    union all
    select coalesce(nullif(r.worker_code,''),r.email),r.worker_code,r.full_name,r.full_name,r.phone_number,r.email,r.role,'Operations',r.status,coalesce(r.active,true) and coalesce(r.is_active,true),r.branch_code
    from be_user_account_registry r where upper(r.branch_code)=b and not exists(select 1 from be_employee_master e where upper(e.branch_code)=b and (e.auth_user_id=r.auth_user_id or e.employee_id=r.worker_code or e.employee_code=r.worker_code))
   )staff where(q='' or lower(coalesce(employee_code,employee_id)||' '||coalesce(display_name,employee_name,'')) like '%'||q||'%') order by employee_id limit 500)x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into documents from(select id,employee_code,document_type,title,effective_date,expiry_date,status,storage_path,file_name,notes,created_at from be_hr_document_register_v1 where metadata->>'branch_code'=b and(q='' or lower(coalesce(employee_code,'')||' '||coalesce(title,'')) like '%'||q||'%') order by created_at desc limit 500)x;
 elsif m='master' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.dataset_key,x.record_key),'[]') into total,rows from(
   select dataset_key,record_key,status,payload from be_master_data_rows where deleted_at is null and (
    (dataset_key in('rider_master','driver_master','helper_master','employee_master','fleet_master') and b in(upper(payload->>'branch_code'),upper(payload->>'asset_branch_code')))
    or dataset_key in('service_types','weight_brackets','vehicle_capacity','zone_master','township_master','cod_fee_rules','surcharge_rules','cargo_dropoff_rate')
   ) and(q='' or lower(record_key||' '||coalesce(payload::text,'')) like '%'||q||'%') order by dataset_key,record_key limit 1000)x;
 elsif m='tariff' then
  select count(*),coalesce(jsonb_agg(to_jsonb(x) order by x.branch_code,x.township,x.customer_tier),'[]') into total,rows from(select id,township,township_key,branch_code,customer_tier,base_fee,included_kg,extra_kg_fee,is_active,effective_from,tariff_area_type,source_label from be_delivery_tariff_master where is_active and(q='' or lower(coalesce(township,'')||' '||coalesce(branch_code,'')||' '||coalesce(customer_tier,'')) like '%'||q||'%') order by branch_code,township,customer_tier limit 2000)x;
 else raise exception 'UNKNOWN_DEPARTMENT';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into requests from(select id,request_type,target_id,requested_data,approval_status,remarks,created_at from be_branch_amendment_requests where branch_code=b and request_type='BRANCH_MODULE_'||upper(m) order by created_at desc limit 100)x;
 return jsonb_build_object('ok',true,'branch_code',b,'module',m,'rows',rows,'count',total,'documents',documents,'messages',messages,'requests',requests,'as_of',now(),'row_limit',case m when 'master' then 1000 when 'tariff' then 2000 else 500 end,'truncated',total>=case m when 'master' then 1000 when 'tariff' then 2000 else 500 end);
end $$;

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

alter table public.be_marketing_leads enable row level security;
alter table public.be_bd_accounts enable row level security;
alter table public.be_cs_tickets enable row level security;
alter table public.be_cs_messages enable row level security;
alter table public.be_employee_master enable row level security;
-- Restrictive policies supplement existing module policies; they never grant new table access.
do $rls$
declare t text;
begin
 foreach t in array array['be_marketing_leads','be_bd_accounts'] loop
  execute format('drop policy if exists branch_department_scope_guard on public.%I',t);
  execute format('create policy branch_department_scope_guard on public.%I as restrictive for all to authenticated using(case when replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then branch_code=public.be_branch_department_scope_v1(null) else true end) with check(case when replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then branch_code=public.be_branch_department_scope_v1(null,true) else true end)',t);
 end loop;
end $rls$;
drop policy if exists branch_cs_scope_guard on public.be_cs_tickets;
create policy branch_cs_scope_guard on public.be_cs_tickets as restrictive for all to authenticated
using(case when replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then branch_code=public.be_branch_department_scope_v1(null) or public.be_branch_department_way_v1(way_id,public.be_branch_department_scope_v1(null)) else true end)
with check(case when replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then public.be_branch_department_way_v1(way_id,public.be_branch_department_scope_v1(null,true)) else true end);
drop policy if exists branch_cs_message_scope_guard on public.be_cs_messages;
create policy branch_cs_message_scope_guard on public.be_cs_messages as restrictive for all to authenticated
using(case when replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then exists(select 1 from public.be_cs_tickets t where t.id=ticket_id and (t.branch_code=public.be_branch_department_scope_v1(null) or public.be_branch_department_way_v1(t.way_id,public.be_branch_department_scope_v1(null)))) else true end)
with check(case when replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then exists(select 1 from public.be_cs_tickets t where t.id=ticket_id and public.be_branch_department_way_v1(t.way_id,public.be_branch_department_scope_v1(null,true))) else true end);
drop policy if exists branch_hr_read_scope_guard on public.be_employee_master;
create policy branch_hr_read_scope_guard on public.be_employee_master as restrictive for select to authenticated
using(case when replace(public.be_current_role(),'-','_') in('branch_manager','branch_office_manager') then upper(branch_code)=public.be_branch_department_scope_v1(null) else true end);
do $hr_writes$
declare op text;
begin
 foreach op in array array['insert','update','delete'] loop
  execute format('drop policy if exists %I on public.be_employee_master','branch_hr_'||op||'_guard');
  execute format('create policy %I on public.be_employee_master as restrictive for %s to authenticated %s','branch_hr_'||op||'_guard',op,
   case op when 'insert' then 'with check(replace(public.be_current_role(),''-'',''_'') not in (''branch_manager'',''branch_office_manager''))'
    when 'delete' then 'using(replace(public.be_current_role(),''-'',''_'') not in (''branch_manager'',''branch_office_manager''))'
    else 'using(replace(public.be_current_role(),''-'',''_'') not in (''branch_manager'',''branch_office_manager'')) with check(replace(public.be_current_role(),''-'',''_'') not in (''branch_manager'',''branch_office_manager''))' end);
 end loop;
end $hr_writes$;

create or replace function public.be_branch_department_cs_guard_v1()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b text; actor text; w text;
begin
 if replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return new;end if;
 b:=public.be_branch_department_scope_v1(null,true);
 select lower(email) into actor from be_user_account_registry where auth_user_id=auth.uid() limit 1;
 if tg_table_name='be_cs_tickets' then
  if not public.be_branch_department_way_v1(new.way_id,b) then raise exception 'BRANCH_WAY_DENIED';end if;
  if tg_op='INSERT' or new.way_id is distinct from old.way_id or new.payload->'selected_waybills' is distinct from old.payload->'selected_waybills' then
   for w in select jsonb_array_elements_text(coalesce(new.payload->'selected_waybills',jsonb_build_array(new.way_id))) loop
    if not public.be_branch_department_way_v1(w,b) then raise exception 'BRANCH_WAY_DENIED';end if;
   end loop;
  end if;
  if tg_op='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'CASE_AUTHOR_IMMUTABLE';end if;
  if tg_op='INSERT' then new.branch_code:=b;new.created_by:=auth.uid();
  elsif new.branch_code is distinct from old.branch_code then raise exception 'BRANCH_IDENTITY_IMMUTABLE';end if;
  select pickup_id into new.pickup_id from be_data_entry_parcel_details where delivery_way_id=new.way_id limit 1;
  new.payload:=coalesce(new.payload,'{}')||jsonb_build_object('sender_email',actor,'branch_code',coalesce(new.branch_code,b));
 else
  if not exists(select 1 from be_cs_tickets t where t.id=new.ticket_id and public.be_branch_department_way_v1(t.way_id,b)) then raise exception 'BRANCH_CASE_DENIED';end if;
  new.sender_email:=actor;new.sender_role:='branch_manager';new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('sender_email',actor,'branch_code',b);
 end if;
 return new;
end $$;
drop trigger if exists branch_cs_identity_guard on public.be_cs_tickets;
create trigger branch_cs_identity_guard before insert or update on public.be_cs_tickets for each row execute function public.be_branch_department_cs_guard_v1();
drop trigger if exists branch_cs_message_identity_guard on public.be_cs_messages;
create trigger branch_cs_message_identity_guard before insert or update on public.be_cs_messages for each row execute function public.be_branch_department_cs_guard_v1();
revoke all on function public.be_branch_department_cs_guard_v1() from public,anon,authenticated;

-- Legacy HQ-only read/administration endpoints must not bypass the new branch views.
-- Keep their existing implementation and grants; add an early branch-manager denial.
do $legacy_guards$
declare f record; d text; body text;
begin
 for f in select p.oid,p.proname,l.lanname from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace
  and p.proname in('be_cs_ticket_history','be_cs_ticket_detail','be_customer_service_snapshot','be_cs_parcel_support_queue','be_hr_dashboard','be_admin_hr_snapshot','be_hr_document_snapshot_v1','be_master_data_page_snapshot','be_master_data_snapshot','be_master_data_upsert_record','be_master_data_delete_record','be_master_data_bulk_upsert_records')
  and p.prorettype='jsonb'::regtype
 loop
  d:=pg_get_functiondef(f.oid);if strpos(d,'BRANCH_DEPARTMENT_LEGACY_GUARD_V1')>0 then continue;end if;
  if f.lanname='plpgsql' then
   d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_DEPARTMENT_LEGACY_GUARD_V1\n if replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then raise exception ''USE_BRANCH_DEPARTMENT_WORKSPACE'' using errcode=''42501'';end if;','i');
  elsif f.lanname='sql' then
   select prosrc into body from pg_proc where oid=f.oid;
   d:=replace(d,'LANGUAGE sql','LANGUAGE plpgsql');
   d:=replace(d,body,E'begin\n -- BRANCH_DEPARTMENT_LEGACY_GUARD_V1\n if replace(public.be_current_role(),''-'',''_'') in (''branch_manager'',''branch_office_manager'') then raise exception ''USE_BRANCH_DEPARTMENT_WORKSPACE'' using errcode=''42501'';end if;\n return ('||regexp_replace(body,';[[:space:]]*$','')||E');\nend;');
  else continue;end if;
  execute d;
 end loop;
end $legacy_guards$;

-- Branch vault paths are isolated from HQ and other branch document folders.
create or replace function public.be_branch_department_storage_branch_v1(p_write boolean default false)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if auth.uid() is null or replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return null;end if;
 return public.be_branch_department_scope_v1(null,p_write);
end $$;
revoke all on function public.be_branch_department_storage_branch_v1(boolean) from public,anon;
grant execute on function public.be_branch_department_storage_branch_v1(boolean) to authenticated;
create or replace function public.be_branch_hr_orphan_v1(p_path text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_department_storage_branch_v1(true);
begin
 return b is not null and p_path like b||'/'||auth.uid()::text||'/%' and not exists(select 1 from public.be_hr_document_register_v1 d where d.storage_path=p_path);
end $$;
revoke all on function public.be_branch_hr_orphan_v1(text) from public,anon;
grant execute on function public.be_branch_hr_orphan_v1(text) to authenticated;
drop policy if exists branch_hr_vault_insert on storage.objects;
create policy branch_hr_vault_insert on storage.objects for insert to authenticated with check(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(true)
 and split_part(name,'/',2)=auth.uid()::text and strpos(name,'..')=0
);
drop policy if exists branch_hr_vault_read on storage.objects;
create policy branch_hr_vault_read on storage.objects for select to authenticated using(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(false)
);
drop policy if exists branch_hr_vault_orphan_cleanup on storage.objects;
create policy branch_hr_vault_orphan_cleanup on storage.objects for delete to authenticated using(
 bucket_id='hr-documents' and split_part(name,'/',1)=public.be_branch_department_storage_branch_v1(true)
 and split_part(name,'/',2)=auth.uid()::text and public.be_branch_hr_orphan_v1(name)
);

-- Existing HQ search can locate new branch-attributed CRM records by branch code.
do $hq_search$
declare f record; d text;
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('be_marketing_lead_snapshot_v1','be_bd_pipeline_snapshot_v1') loop
  d:=pg_get_functiondef(f.oid);
  if strpos(d,'BRANCH_CRM_SEARCH_V1')>0 then continue;end if;
  if strpos(d,'coalesce(stage,'''')) like')=0 then raise exception 'Review HQ CRM search before changing branch search';end if;
  d:=replace(d,'coalesce(stage,'''')) like','coalesce(stage,'''')||'' ''||coalesce(branch_code,'''')) like');
  d:=regexp_replace(d,'\m(begin)\M',E'begin\n -- BRANCH_CRM_SEARCH_V1','i');execute d;
 end loop;
end $hq_search$;
