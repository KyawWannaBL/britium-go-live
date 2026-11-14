
create table if not exists public.be_corporate_service_tariff_v1 (
 id uuid primary key default gen_random_uuid(),
 company_name text not null,
 merchant_code text not null,
 project_name text not null,
 contract_ref text not null,
 service_type text not null default 'SPECIAL_EVENT',
 area text not null check(area in ('YANGON','OUTSIDE_YANGON')),
 fixed_rate_mmk bigint not null check(fixed_rate_mmk>=0),
 included_kg numeric not null default 0 check(included_kg>=0),
 extra_per_kg_mmk bigint not null default 0 check(extra_per_kg_mmk>=0),
 bill_to text not null default 'CORPORATE' check(bill_to in ('CORPORATE','RECIPIENT')),
 valid_from date not null,
 valid_until date not null,
 approved_at timestamptz,
 approved_by uuid,
 created_by uuid not null,
 updated_by uuid,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint corporate_tariff_dates check(valid_until>=valid_from),
 constraint corporate_contract_area_unique unique(contract_ref,area)
);
alter table public.be_corporate_service_tariff_v1 enable row level security;
revoke all on public.be_corporate_service_tariff_v1 from public,anon,authenticated;

create table if not exists public.be_corporate_service_way_rate_v1 (
 delivery_way_id text primary key,
 tariff_id uuid not null references public.be_corporate_service_tariff_v1(id),
 contract_ref text not null,
 company_name text not null,
 merchant_code text not null,
 project_name text not null,
 service_type text not null,
 area text not null,
 bill_to text not null,
 weight_kg numeric not null,
 fixed_rate_mmk bigint not null,
 extra_per_kg_mmk bigint not null,
 included_kg numeric not null,
 agreed_fee_mmk bigint not null,
 corporate_receivable_mmk bigint not null,
 recipient_fee_mmk bigint not null,
 finance_review_status text not null default 'PENDING_FINANCE_REVIEW',
 applied_by uuid not null,
 applied_at timestamptz not null default now(),
 constraint corporate_assignment_fee_check check(agreed_fee_mmk=corporate_receivable_mmk+recipient_fee_mmk)
);
alter table public.be_corporate_service_way_rate_v1 enable row level security;
revoke all on public.be_corporate_service_way_rate_v1 from public,anon,authenticated;

create or replace function public.be_corporate_tariff_list_v1()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $fn$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not public.be_tariff_access_allowed(false)
 and lower(replace(coalesce(public.be_current_role(),''),'-','_')) not in
 ('customer_service','cs','support','finance','finance_manager','accountant') then
  raise exception 'CORPORATE_TARIFF_READ_DENIED' using errcode='42501';
 end if;
 return jsonb_build_object('ok',true,'rows',(
 select coalesce(jsonb_agg(to_jsonb(t) order by t.project_name,t.area,t.contract_ref),'[]'::jsonb)
 from public.be_corporate_service_tariff_v1 t));
end $fn$;

create or replace function public.be_corporate_tariff_manage_v1(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $fn$
declare
 v_id uuid;
 v_row public.be_corporate_service_tariff_v1%rowtype;
 v_action text:=upper(trim(coalesce(p_action,'')));
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_merchant text;
begin
 if auth.uid() is null or not public.be_tariff_manage_allowed_v1() then
  raise exception 'TARIFF_WRITE_DENIED' using errcode='42501';
 end if;
 if v_action='APPROVE' or v_action='REVOKE' then
  if v_role not in ('superadmin','super_admin') then
   raise exception 'SUPERADMIN_APPROVAL_REQUIRED' using errcode='42501';
  end if;
  v_id:=(p_data->>'id')::uuid;
  update public.be_corporate_service_tariff_v1
  set approved_at=case when v_action='APPROVE' then now() else null end,
      approved_by=case when v_action='APPROVE' then auth.uid() else null end,
      updated_by=auth.uid(),updated_at=now()
  where id=v_id returning * into v_row;
  if not found then raise exception 'CORPORATE_RATE_NOT_FOUND'; end if;
  return jsonb_build_object('ok',true,'row',to_jsonb(v_row));
 end if;
 if v_action not in ('UPSERT','CREATE') then raise exception 'INVALID_ACTION'; end if;
 v_merchant:=upper(trim(coalesce(p_data->>'merchant_code','')));
 if length(trim(coalesce(p_data->>'company_name','')))<3
 or length(trim(coalesce(p_data->>'project_name','')))<3
 or length(trim(coalesce(p_data->>'contract_ref','')))<3
 or length(v_merchant)<2
 or (p_data->>'area') not in ('YANGON','OUTSIDE_YANGON')
 or (p_data->>'bill_to') not in ('CORPORATE','RECIPIENT')
 or nullif(p_data->>'fixed_rate_mmk','') is null
 or (p_data->>'fixed_rate_mmk')::numeric<0
 or (p_data->>'fixed_rate_mmk')::numeric<>trunc((p_data->>'fixed_rate_mmk')::numeric)
 or (p_data->>'extra_per_kg_mmk')::numeric<0
 or (p_data->>'extra_per_kg_mmk')::numeric<>trunc((p_data->>'extra_per_kg_mmk')::numeric)
 or (p_data->>'included_kg')::numeric<0
 or (p_data->>'valid_from')::date>(p_data->>'valid_until')::date then
  raise exception 'INVALID_CORPORATE_CONTRACT_FIELDS';
 end if;
 if not exists(select 1 from public.be_merchant_master m where upper(m.merchant_code)=v_merchant) then
  raise exception 'REGISTERED_MERCHANT_REQUIRED';
 end if;
 if nullif(p_data->>'id','') is not null then
  v_id:=(p_data->>'id')::uuid;
  select * into v_row from public.be_corporate_service_tariff_v1 where id=v_id for update;
  if not found then raise exception 'CORPORATE_RATE_NOT_FOUND';end if;
  if v_row.approved_at is not null and v_role not in ('superadmin','super_admin') then
   raise exception 'SUPERADMIN_REVIEW_REQUIRED_FOR_APPROVED_RATE' using errcode='42501';
  end if;
  update public.be_corporate_service_tariff_v1 set
   company_name=trim(p_data->>'company_name'),merchant_code=v_merchant,
   project_name=trim(p_data->>'project_name'),contract_ref=trim(p_data->>'contract_ref'),
   service_type=coalesce(nullif(trim(p_data->>'service_type'),''),'SPECIAL_EVENT'),
   area=p_data->>'area',bill_to=p_data->>'bill_to',
   fixed_rate_mmk=(p_data->>'fixed_rate_mmk')::bigint,
   included_kg=(p_data->>'included_kg')::numeric,
   extra_per_kg_mmk=(p_data->>'extra_per_kg_mmk')::bigint,
   valid_from=(p_data->>'valid_from')::date,valid_until=(p_data->>'valid_until')::date,
   approved_at=null,approved_by=null,updated_by=auth.uid(),updated_at=now()
  where id=v_id returning * into v_row;
 else
  insert into public.be_corporate_service_tariff_v1
  (company_name,merchant_code,project_name,contract_ref,service_type,area,bill_to,
   fixed_rate_mmk,included_kg,extra_per_kg_mmk,valid_from,valid_until,created_by)
  values(trim(p_data->>'company_name'),v_merchant,trim(p_data->>'project_name'),
  trim(p_data->>'contract_ref'),coalesce(nullif(trim(p_data->>'service_type'),''),'SPECIAL_EVENT'),
  p_data->>'area',p_data->>'bill_to',
  (p_data->>'fixed_rate_mmk')::bigint,(p_data->>'included_kg')::numeric,
  (p_data->>'extra_per_kg_mmk')::bigint,
  (p_data->>'valid_from')::date,(p_data->>'valid_until')::date,auth.uid())
  returning * into v_row;
 end if;
 return jsonb_build_object('ok',true,'row',to_jsonb(v_row),'requires_superadmin_approval',true);
end $fn$;

create or replace function public.be_corporate_tariff_quote_v1(
 p_tariff_id uuid,p_merchant_code text,p_area text,p_weight_kg numeric default 0)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $fn$
declare v public.be_corporate_service_tariff_v1%rowtype; v_total bigint;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if not public.be_tariff_access_allowed(false) then raise exception 'TARIFF_READ_DENIED' using errcode='42501';end if;
 select * into v from public.be_corporate_service_tariff_v1 where id=p_tariff_id
 and approved_at is not null and current_date between valid_from and valid_until;
 if not found then raise exception 'NO_ACTIVE_APPROVED_CORPORATE_RATE'; end if;
 if v.merchant_code<>upper(trim(coalesce(p_merchant_code,''))) or v.area<>p_area then
  raise exception 'CORPORATE_CONTRACT_MERCHANT_OR_AREA_MISMATCH';
 end if;
 if p_weight_kg is null or p_weight_kg<0 then raise exception 'INVALID_WEIGHT'; end if;
 v_total:=v.fixed_rate_mmk+ceil(greatest(p_weight_kg-v.included_kg,0))*v.extra_per_kg_mmk;
 return jsonb_build_object('ok',true,'tariff_id',v.id,'contract_ref',v.contract_ref,
 'project_name',v.project_name,'merchant_code',v.merchant_code,'area',v.area,
 'bill_to',v.bill_to,'weight_kg',p_weight_kg,'service_fee_mmk',v_total,
 'recipient_fee_mmk',case when v.bill_to='RECIPIENT' then v_total else 0 end,
 'corporate_receivable_mmk',case when v.bill_to='CORPORATE' then v_total else 0 end,
 'finance_review_required',true,'automatic_settlement',false);
end $fn$;

create or replace function public.be_corporate_tariff_bind_way_v1(
 p_tariff_id uuid,p_delivery_way_id text)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $fn$
declare v public.be_corporate_service_tariff_v1%rowtype;
 d public.be_data_entry_parcel_details%rowtype;
 v_fee bigint; v_area text; v_existing public.be_corporate_service_way_rate_v1%rowtype;
begin
 if auth.uid() is null or not public.be_tariff_manage_allowed_v1() then raise exception 'TARIFF_WRITE_DENIED' using errcode='42501';end if;
 select * into v from public.be_corporate_service_tariff_v1 where id=p_tariff_id and approved_at is not null
 and current_date between valid_from and valid_until;
 if not found then raise exception 'NO_ACTIVE_APPROVED_CORPORATE_RATE';end if;
 select * into d from public.be_data_entry_parcel_details where delivery_way_id=p_delivery_way_id order by updated_at desc limit 1;
 if not found then raise exception 'REGISTERED_WAY_NOT_FOUND'; end if;
 if upper(coalesce(d.merchant_id,'')) <> v.merchant_code then raise exception 'MERCHANT_CONTRACT_MISMATCH'; end if;
 v_area:=case
   when upper(coalesce(d.delivery_region,'')) in ('YANGON','YGN') or upper(coalesce(d.city,'')) in ('YANGON','ရန်ကုန်') then 'YANGON'
   when coalesce(nullif(d.delivery_region,''),nullif(d.city,'')) is not null then 'OUTSIDE_YANGON'
   else null end;
 if v_area is null or v_area<>v.area then raise exception 'CORPORATE_REGION_UNVERIFIED_OR_MISMATCH';end if;
 if coalesce(d.weight_kg,0)<0 then raise exception 'INVALID_WEIGHT';end if;
 v_fee:=v.fixed_rate_mmk+ceil(greatest(coalesce(d.weight_kg,0)-v.included_kg,0))*v.extra_per_kg_mmk;
 if v.bill_to='RECIPIENT' and d.delivery_charges is distinct from v_fee then
  raise exception 'RECIPIENT_FEE_MUST_MATCH_REGISTERED_DELIVERY_CHARGE';end if;
 select * into v_existing from public.be_corporate_service_way_rate_v1 where delivery_way_id=p_delivery_way_id for update;
 if found then
  if v_existing.tariff_id=v.id and v_existing.agreed_fee_mmk=v_fee then
   return jsonb_build_object('ok',true,'already_bound',true,'finance_review_status',v_existing.finance_review_status);
  end if;
  raise exception 'CORPORATE_WAY_ALREADY_BOUND_REQUIRES_FINANCE_CORRECTION';
 end if;
 insert into public.be_corporate_service_way_rate_v1
 (delivery_way_id,tariff_id,contract_ref,company_name,merchant_code,project_name,
 service_type,area,bill_to,weight_kg,fixed_rate_mmk,extra_per_kg_mmk,included_kg,
 agreed_fee_mmk,corporate_receivable_mmk,recipient_fee_mmk,applied_by)
 values(p_delivery_way_id,v.id,v.contract_ref,v.company_name,v.merchant_code,v.project_name,
 v.service_type,v.area,v.bill_to,coalesce(d.weight_kg,0),v.fixed_rate_mmk,v.extra_per_kg_mmk,v.included_kg,
 v_fee,case when v.bill_to='CORPORATE' then v_fee else 0 end,
 case when v.bill_to='RECIPIENT' then v_fee else 0 end,auth.uid());
 return jsonb_build_object('ok',true,'delivery_way_id',p_delivery_way_id,'tariff_id',v.id,
 'corporate_receivable_mmk',case when v.bill_to='CORPORATE' then v_fee else 0 end,
 'recipient_fee_mmk',case when v.bill_to='RECIPIENT' then v_fee else 0 end,
 'finance_review_status','PENDING_FINANCE_REVIEW','settlement_posted',false);
end $fn$;

create or replace function public.be_corporate_way_finance_v1(p_search text default null,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $fn$
declare v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
begin
 if auth.uid() is null or v_role not in
 ('superadmin','super_admin','finance','finance_manager','accountant','operation_manager') then
 raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';end if;
 return jsonb_build_object('ok',true,'settlement_posted',false,'rows',
 (select coalesce(jsonb_agg(to_jsonb(x) order by x.applied_at desc),'[]'::jsonb)
 from (select * from public.be_corporate_service_way_rate_v1
 where (nullif(trim(coalesce(p_search,'')),'') is null or delivery_way_id ilike '%'||trim(p_search)||'%'
 or company_name ilike '%'||trim(p_search)||'%')
 order by applied_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x));
end $fn$;

create or replace function public.be_corporate_way_lookup_v1(p_delivery_way_id text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $fn$
declare v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));v_row jsonb;
begin
 if auth.uid() is null or (not public.be_tariff_access_allowed(false)
 and v_role not in ('customer_service','cs','support','finance','finance_manager','accountant')) then
 raise exception 'CORPORATE_LOOKUP_DENIED' using errcode='42501';end if;
 select to_jsonb(w) into v_row from public.be_corporate_service_way_rate_v1 w
 where delivery_way_id=p_delivery_way_id;
 return jsonb_build_object('ok',true,'assignment',v_row,'financial_review_only',true);
end $fn$;
revoke all on function public.be_corporate_tariff_list_v1() from public,anon;
revoke all on function public.be_corporate_tariff_manage_v1(text,jsonb) from public,anon;
revoke all on function public.be_corporate_tariff_quote_v1(uuid,text,text,numeric) from public,anon;
revoke all on function public.be_corporate_tariff_bind_way_v1(uuid,text) from public,anon;
revoke all on function public.be_corporate_way_finance_v1(text,integer) from public,anon;
revoke all on function public.be_corporate_way_lookup_v1(text) from public,anon;
grant execute on function public.be_corporate_tariff_list_v1() to authenticated;
grant execute on function public.be_corporate_tariff_manage_v1(text,jsonb) to authenticated;
grant execute on function public.be_corporate_tariff_quote_v1(uuid,text,text,numeric) to authenticated;
grant execute on function public.be_corporate_tariff_bind_way_v1(uuid,text) to authenticated;
grant execute on function public.be_corporate_way_finance_v1(text,integer) to authenticated;
grant execute on function public.be_corporate_way_lookup_v1(text) to authenticated;
