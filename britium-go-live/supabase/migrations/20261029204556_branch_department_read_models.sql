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


revoke all on function public.be_branch_department_scope_v1(text,boolean),public.be_branch_department_way_v1(text,text),public.be_branch_department_snapshot_v1(text,text,text) from public,anon;
grant execute on function public.be_branch_department_scope_v1(text,boolean),public.be_branch_department_way_v1(text,text),public.be_branch_department_snapshot_v1(text,text,text) to authenticated;
