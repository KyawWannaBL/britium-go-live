-- Branch identity comes only from active server-side registry and territories.
create or replace function public.be_branch_scope_v1(p_branch text default null)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare r text:=replace(public.be_current_role(),'-','_'); b text; requested text:=nullif(upper(btrim(p_branch)),'');
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select upper(branch_code) into b from public.be_user_account_registry
 where auth_user_id=auth.uid() and coalesce(active,true) and coalesce(is_active,true)
 and lower(status) in ('active','enabled') limit 1;
 if not found or coalesce(r,'') in ('','guest') then raise exception 'ACCOUNT_INACTIVE' using errcode='42501'; end if;
 if r in ('superadmin','super_admin','app_owner','sys') then return requested; end if;
 if r in ('branch_manager','branch_office_manager','branch_office','branch_staff','branch_admin') then
  if b is null or (requested is not null and requested<>b) or not exists(
   select 1 from public.be_employee_territory_assignments a where a.user_id=auth.uid() and a.active and a.can_read
    and a.scope_type='BRANCH' and upper(a.branch_code)=b
  ) then raise exception 'BRANCH_SCOPE_DENIED' using errcode='42501'; end if;
  return b;
 end if;
 -- Existing HQ roles retain their existing operational scope, but cannot use branch controls to elevate it.
 return requested;
end $$;

create or replace function public.be_branch_control_scope_v1(p_branch text default null)
returns text language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare r text:=replace(public.be_current_role(),'-','_'); b text; own text;
begin
 b:=public.be_branch_scope_v1(p_branch);
 if r in ('superadmin','super_admin','app_owner','sys','branch_manager','branch_office_manager','branch_admin') then return b; end if;
 if r not in ('finance','finance_user','finance_manager','accountant','admin') then raise exception 'BRANCH_CONTROL_READ_DENIED'; end if;
 select upper(branch_code) into own from public.be_user_account_registry where auth_user_id=auth.uid() limit 1;
 if own='YGN' then return b; end if;
 if own is null or (b is not null and b<>own) then raise exception 'BRANCH_SCOPE_DENIED'; end if;
 return own;
end $$;
revoke all on function public.be_branch_control_scope_v1(text) from public,anon;
grant execute on function public.be_branch_control_scope_v1(text) to authenticated;

create or replace function public.be_branch_wayplan_allowed_v1(p_wayplan text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text; r text:=replace(public.be_current_role(),'-','_');
begin
 if auth.uid() is null then return false; end if;
 b:=public.be_branch_scope_v1(null);
 if r not in ('branch_manager','branch_office_manager','branch_office','branch_staff','branch_admin') then return true; end if;
 return exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=p_wayplan and upper(d.branch_code)=b);
end $$;

create or replace function public.be_branch_require_wayplan_v1(p_wayplan text)
returns void language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
 if not public.be_branch_wayplan_allowed_v1(p_wayplan) then raise exception 'WAYPLAN_BRANCH_DENIED' using errcode='42501'; end if;
end $$;

create or replace function public.be_branch_require_region_v1(p_region text)
returns void language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=case upper(p_region) when 'MANDALAY' then 'MDY' when 'YANGON' then 'YGN' when 'NAYPYITAW' then 'NPT' end;
begin
 if b is null then raise exception 'REGION_REQUIRED'; end if;
 perform public.be_branch_scope_v1(b);
end $$;

create table if not exists public.be_branch_control_records_v1(
 id uuid primary key default gen_random_uuid(),branch_code text not null references public.be_branch_offices(branch_code),
 kind text not null check(kind in ('SETUP','EXPENSE','ASSET','CONTRACT','DAILY_CLOSE')),
 title text not null,amount numeric(18,2) not null default 0 check(amount>=0),reference text not null,evidence text not null,
 notes text not null default '',status text not null default 'SUBMITTED' check(status in ('SUBMITTED','APPROVED','REJECTED')),
 created_by uuid not null,created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz,review_reason text,
 unique(branch_code,kind,reference)
);
create table if not exists public.be_branch_parcel_transfers_v1(
 id uuid primary key default gen_random_uuid(),from_branch text not null references public.be_branch_offices(branch_code),
 to_branch text not null references public.be_branch_offices(branch_code),check(from_branch<>to_branch),
 carrier text not null,reference text not null,reason text not null,status text not null default 'DISPATCHED'
 check(status in ('DISPATCHED','PARTIALLY_RECEIVED','RECEIVED')),created_by uuid not null,created_at timestamptz not null default now(),
 unique(from_branch,reference)
);
create table if not exists public.be_branch_parcel_transfer_items_v1(
 transfer_id uuid not null references public.be_branch_parcel_transfers_v1(id),delivery_way_id text not null,
 expected_collection numeric(18,2) not null,received_at timestamptz,received_by uuid,receipt_note text,
 primary key(transfer_id,delivery_way_id)
);
alter table public.be_branch_control_records_v1 enable row level security;
alter table public.be_branch_parcel_transfers_v1 enable row level security;
alter table public.be_branch_parcel_transfer_items_v1 enable row level security;
revoke all on public.be_branch_control_records_v1,public.be_branch_parcel_transfers_v1,public.be_branch_parcel_transfer_items_v1 from public,anon,authenticated;
grant select on public.be_branch_control_records_v1,public.be_branch_parcel_transfers_v1,public.be_branch_parcel_transfer_items_v1 to authenticated;
create policy branch_control_read on public.be_branch_control_records_v1 for select to authenticated
using(public.be_branch_control_scope_v1(null) is null or branch_code=public.be_branch_control_scope_v1(null));
create policy branch_transfer_read on public.be_branch_parcel_transfers_v1 for select to authenticated
using(public.be_branch_control_scope_v1(null) is null or public.be_branch_control_scope_v1(null) in (from_branch,to_branch));
create policy branch_transfer_items_read on public.be_branch_parcel_transfer_items_v1 for select to authenticated
using(exists(select 1 from public.be_branch_parcel_transfers_v1 t where t.id=transfer_id));

create or replace function public.be_branch_parcel_at_v1(p_way text,p_branch text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select auth.uid() is not null and exists(
 select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=p_way
 and coalesce((select h.to_branch from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 h on h.id=i.transfer_id where i.delivery_way_id=d.delivery_way_id and i.received_at is not null order by i.received_at desc limit 1),
 (select upper(pr.branch_code) from public.be_portal_pickup_requests pr where pr.pickup_id=d.pickup_id limit 1))=p_branch
 and not exists(select 1 from public.be_branch_parcel_transfer_items_v1 i where i.delivery_way_id=d.delivery_way_id and i.received_at is null));
$$;
revoke all on function public.be_branch_parcel_at_v1(text,text) from public,anon;
grant execute on function public.be_branch_parcel_at_v1(text,text) to authenticated;

create or replace function public.be_branch_control_action_v1(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare a text:=p->>'action'; r text:=replace(public.be_current_role(),'-','_'); scope text; b text; dest text;
 id uuid; result jsonb; ids text[]; way text; n integer; rec public.be_branch_control_records_v1%rowtype;
 t public.be_branch_parcel_transfers_v1%rowtype; note text:=nullif(btrim(p->>'reason'),'');
begin
 scope:=public.be_branch_control_scope_v1(null);
 if r not in ('superadmin','super_admin','app_owner','sys','branch_manager','branch_office_manager','finance','finance_user','finance_manager','accountant') then
  raise exception 'BRANCH_CONTROL_WRITE_DENIED' using errcode='42501'; end if;
 if a='SUBMIT_RECORD' then
  b:=public.be_branch_scope_v1(p->>'branch');
  if b is null then raise exception 'BRANCH_REQUIRED'; end if;
  if nullif(btrim(p->>'title'),'') is null or nullif(btrim(p->>'reference'),'') is null or nullif(btrim(p->>'evidence'),'') is null then raise exception 'TITLE_REFERENCE_EVIDENCE_REQUIRED'; end if;
  insert into public.be_branch_control_records_v1(branch_code,kind,title,amount,reference,evidence,notes,created_by)
  values(b,p->>'kind',btrim(p->>'title'),coalesce((p->>'amount')::numeric,0),btrim(p->>'reference'),btrim(p->>'evidence'),coalesce(p->>'notes',''),auth.uid()) returning * into rec;
  id:=rec.id;result:=to_jsonb(rec);
 elsif a='REVIEW_RECORD' then
  if r not in ('superadmin','super_admin','app_owner','sys','finance','finance_manager','accountant') then raise exception 'HQ_REVIEW_REQUIRED' using errcode='42501'; end if;
  if scope is not null or (r in ('finance','finance_manager','accountant') and not exists(select 1 from public.be_user_account_registry u where u.auth_user_id=auth.uid() and upper(u.branch_code)='YGN')) then raise exception 'HQ_REVIEW_REQUIRED'; end if;
  select * into rec from public.be_branch_control_records_v1 where be_branch_control_records_v1.id=(p->>'id')::uuid for update;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if rec.created_by=auth.uid() then raise exception 'SELF_APPROVAL_DENIED'; end if;
  if rec.status<>'SUBMITTED' then raise exception 'RECORD_ALREADY_REVIEWED'; end if;
  if p->>'decision' not in ('APPROVED','REJECTED') or note is null then raise exception 'DECISION_REASON_REQUIRED'; end if;
  update public.be_branch_control_records_v1 set status=p->>'decision',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=note where be_branch_control_records_v1.id=rec.id returning * into rec;
  id:=rec.id;result:=to_jsonb(rec);
 elsif a='CREATE_TRANSFER' then
  if r in ('finance','finance_user','finance_manager','accountant') then raise exception 'OPERATIONS_AUTHORITY_REQUIRED'; end if;
  b:=public.be_branch_scope_v1(p->>'from_branch');dest:=upper(p->>'to_branch');
  if b not in ('MDY','YGN') or dest not in ('MDY','YGN') or b=dest then raise exception 'INVALID_TRANSFER_BRANCHES'; end if;
  if note is null or nullif(btrim(p->>'carrier'),'') is null or nullif(btrim(p->>'reference'),'') is null then raise exception 'CARRIER_REFERENCE_REASON_REQUIRED'; end if;
  select array_agg(distinct x order by x) into ids from jsonb_array_elements_text(p->'way_ids') x where nullif(btrim(x),'') is not null;
  if coalesce(cardinality(ids),0)=0 or cardinality(ids)>500 then raise exception 'SELECT_1_TO_500_WAY_IDS'; end if;
  -- Stable lock order prevents simultaneous overlapping manifests.
  perform 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=any(ids) order by d.delivery_way_id for update;
  select count(*) into n from public.be_data_entry_parcel_details d where d.delivery_way_id=any(ids)
    and d.delivery_region=case dest when 'YGN' then 'YANGON' else 'MANDALAY' end
    and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','CANCELLED','RTO','SETTLED','CLOSED','DUPLICATE_ARCHIVED')
    and coalesce((select history.to_branch from public.be_branch_parcel_transfer_items_v1 i join public.be_branch_parcel_transfers_v1 history on history.id=i.transfer_id where i.delivery_way_id=d.delivery_way_id and i.received_at is not null order by i.received_at desc limit 1),
     (select upper(pr.branch_code) from public.be_portal_pickup_requests pr where pr.pickup_id=d.pickup_id limit 1))=b;
  if n<>cardinality(ids) then raise exception 'UNKNOWN_CLOSED_OR_WRONG_DESTINATION_PARCEL'; end if;
  if exists(select 1 from public.be_branch_parcel_transfer_items_v1 i where i.delivery_way_id=any(ids) and i.received_at is null) then raise exception 'PARCEL_ALREADY_IN_TRANSFER'; end if;
  insert into public.be_branch_parcel_transfers_v1(from_branch,to_branch,carrier,reference,reason,created_by)
   values(b,dest,btrim(p->>'carrier'),btrim(p->>'reference'),note,auth.uid()) returning * into t;
  insert into public.be_branch_parcel_transfer_items_v1(transfer_id,delivery_way_id,expected_collection)
   select t.id,d.delivery_way_id,coalesce(d.actual_collect,d.cod_amount,0) from public.be_data_entry_parcel_details d where d.delivery_way_id=any(ids);
  id:=t.id;result:=to_jsonb(t);
 elsif a='RECEIVE_TRANSFER' then
  if r in ('finance','finance_user','finance_manager','accountant') then raise exception 'OPERATIONS_AUTHORITY_REQUIRED'; end if;
  select * into t from public.be_branch_parcel_transfers_v1 where be_branch_parcel_transfers_v1.id=(p->>'id')::uuid for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if scope is not null and scope<>t.to_branch then raise exception 'DESTINATION_BRANCH_REQUIRED'; end if;
  if note is null then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select array_agg(distinct x) into ids from jsonb_array_elements_text(p->'received_way_ids') x;
  if coalesce(cardinality(ids),0)=0 then raise exception 'RECEIVED_WAY_IDS_REQUIRED'; end if;
  if exists(select 1 from unnest(ids) x where not exists(select 1 from public.be_branch_parcel_transfer_items_v1 i where i.transfer_id=t.id and i.delivery_way_id=x)) then raise exception 'WAY_NOT_IN_MANIFEST'; end if;
  update public.be_branch_parcel_transfer_items_v1 set received_at=now(),received_by=auth.uid(),receipt_note=note where transfer_id=t.id and delivery_way_id=any(ids) and received_at is null;
  update public.be_branch_parcel_transfers_v1 set status=case when exists(select 1 from public.be_branch_parcel_transfer_items_v1 i where i.transfer_id=t.id and i.received_at is null) then 'PARTIALLY_RECEIVED' else 'RECEIVED' end where be_branch_parcel_transfers_v1.id=t.id returning * into t;
  id:=t.id;result:=to_jsonb(t);
 else raise exception 'UNKNOWN_BRANCH_ACTION'; end if;
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
 values(auth.uid(),auth.jwt()->>'email',r,a,'BRANCH_CONTROL',id::text,result||jsonb_build_object('reason',note,'no_payment_or_gl_posting',true));
 return result||jsonb_build_object('ok',true,'payment_executed',false,'ledger_posted',false);
end $$;

create or replace function public.be_branch_control_snapshot_v1(p_branch text default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text:=public.be_branch_control_scope_v1(p_branch); docs jsonb; transfers jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into docs from
 (select * from public.be_branch_control_records_v1 d where b is null or d.branch_code=b order by created_at desc limit 500)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into transfers from
 (select t.*, (select coalesce(jsonb_agg(to_jsonb(i) order by delivery_way_id),'[]') from public.be_branch_parcel_transfer_items_v1 i where i.transfer_id=t.id) items
 from public.be_branch_parcel_transfers_v1 t where b is null or b in(t.from_branch,t.to_branch) order by t.created_at desc limit 200)x;
 return jsonb_build_object('ok',true,'branch',b,'records',docs,'transfers',transfers,'as_of',now(),'approval_is_payment',false);
end $$;

create or replace function public.be_branch_wayplan_scan_v1(p_wayplan text,p_way_id text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b text;
begin
 perform public.be_branch_require_wayplan_v1(p_wayplan);
 select branch_code into b from public.be_wayplan_dispatches where wayplan_id=p_wayplan;
 if not exists(select 1 from public.be_wayplan_membership_v40 m where m.wayplan_id=p_wayplan and m.delivery_way_id=p_way_id and m.membership_status='READY_FOR_DISPATCH') then raise exception 'WAY_NOT_READY_IN_SELECTED_WAYPLAN'; end if;
 return public.be_warehouse_dispatch_scan(p_way_id,null,b||'-MAIN');
end $$;
revoke all on function public.be_branch_wayplan_scan_v1(text,text) from public,anon;
grant execute on function public.be_branch_wayplan_scan_v1(text,text) to authenticated;

create index if not exists be_branch_transfer_pending_way_idx on public.be_branch_parcel_transfer_items_v1(delivery_way_id) where received_at is null;
create index if not exists be_branch_control_branch_time_idx on public.be_branch_control_records_v1(branch_code,created_at desc);
create index if not exists be_branch_transfer_destination_idx on public.be_branch_parcel_transfers_v1(to_branch,created_at desc);

revoke all on function public.be_branch_scope_v1(text),public.be_branch_wayplan_allowed_v1(text),public.be_branch_require_wayplan_v1(text),public.be_branch_require_region_v1(text),public.be_branch_control_action_v1(jsonb),public.be_branch_control_snapshot_v1(text) from public,anon;
grant execute on function public.be_branch_scope_v1(text),public.be_branch_wayplan_allowed_v1(text),public.be_branch_require_wayplan_v1(text),public.be_branch_require_region_v1(text),public.be_branch_control_action_v1(jsonb),public.be_branch_control_snapshot_v1(text) to authenticated;
