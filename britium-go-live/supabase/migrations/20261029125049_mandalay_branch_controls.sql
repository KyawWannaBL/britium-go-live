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

-- Existing operational RPC guards
CREATE OR REPLACE FUNCTION public.be_wayplan_supervisor_decide_v43(p_wayplan_id text, p_decision text, p_notes text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_decision text := upper(regexp_replace(btrim(coalesce(p_decision, '')), '[^A-Za-z]+', '_', 'g'));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_status text;
  v_validation jsonb;
  v_snapshot jsonb;
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if not public.be_wayplan_can_review_v43() then
    raise exception 'Supervisor, Branch Admin, Operations Manager, Admin, or Super Admin authority is required';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if v_decision not in ('APPROVE','APPROVED','REJECT','REJECTED','RETURN_FOR_CORRECTION') then
    raise exception 'Decision must be APPROVE or REJECT';
  end if;

  select review_status into v_status
  from public.be_wayplan_review_v43
  where wayplan_id = v_wayplan
  for update;

  if v_status is null then raise exception 'Wayplan % has not been submitted for supervisor review', v_wayplan; end if;
  if v_status <> 'PENDING_REVIEW' then
    raise exception 'Wayplan % is %, not PENDING_REVIEW', v_wayplan, v_status;
  end if;

  if v_decision in ('APPROVE','APPROVED') then
    v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
    if not coalesce((v_validation ->> 'ok')::boolean, false) then
      raise exception 'Approval stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
    end if;

    select jsonb_build_object(
      'wayplan_id', m.wayplan_id,
      'parcel_count', count(*)::integer,
      'route_group', min(m.route_zone),
      'rider_code', min(m.rider_code),
      'rider_name', min(m.rider_name),
      'vehicle_type', min(m.vehicle_type),
      'vehicle_code', min(m.vehicle_code),
      'vehicle_name', min(m.vehicle_name),
      'driver_code', min(m.driver_code),
      'driver_name', min(m.driver_name),
      'helper_code', min(m.helper_code),
      'helper_name', min(m.helper_name),
      'way_ids', jsonb_agg(m.delivery_way_id order by m.delivery_way_id)
    ) into v_snapshot
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id = v_wayplan
    group by m.wayplan_id;

    update public.be_wayplan_review_v43
    set review_status = 'APPROVED',
        reviewed_by = v_actor,
        reviewed_at = now(),
        review_notes = v_notes,
        rejection_reason = null,
        approval_snapshot = coalesce(v_snapshot, '{}'::jsonb),
        updated_at = now()
    where wayplan_id = v_wayplan;

    insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
    values (v_wayplan, 'WAYPLAN_APPROVED_BY_SUPERVISOR', v_actor, public.be_wayplan_review_role_v43(),
            jsonb_build_object('notes', v_notes, 'validation', v_validation, 'approval_snapshot', v_snapshot));

    insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
    values (v_wayplan, 'WAYPLAN_SUPERVISOR_APPROVED_V43', v_actor,
            jsonb_build_object('notes', v_notes, 'approval_snapshot', v_snapshot));

    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'APPROVED', 'reviewed_by', v_actor, 'reviewed_at', now());
  end if;

  if v_notes is null then raise exception 'A rejection/correction reason is required'; end if;

  update public.be_wayplan_review_v43
  set review_status = 'REJECTED',
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_notes = v_notes,
      rejection_reason = v_notes,
      updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_RETURNED_FOR_CORRECTION', v_actor, public.be_wayplan_review_role_v43(), jsonb_build_object('reason', v_notes));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_RETURNED_FOR_CORRECTION_V43', v_actor, jsonb_build_object('reason', v_notes));

  return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'REJECTED', 'rejection_reason', v_notes, 'reviewed_by', v_actor);
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_supervisor_assign_crew_v68(p_wayplan_id text, p_driver_code text, p_rider_code text DEFAULT NULL::text, p_helper_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text:=lower(replace(coalesce(public.be_current_user_role(),''),'-','_'));
  v_review text;
  v_options jsonb;
  v_driver jsonb;
  v_rider jsonb;
  v_helper jsonb;
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  if v_role not in (
    'branch-manager','branch_manager','branch_office_manager','superadmin','super_admin','app_owner','admin','supervisor',
    'operations','operations_admin','operation_manager','operations_manager','ops_manager',
    'management','director'
  ) then
    raise exception 'Supervisor or Operations Manager authority is required.';
  end if;

  select review_status into v_review
  from public.be_wayplan_review_v43
  where wayplan_id=p_wayplan_id;

  if v_review is null then raise exception 'Wayplan review record not found.'; end if;
  if upper(v_review) in ('DISPATCH_READY','DISPATCHED') then
    raise exception 'Crew editing is locked after the Wayplan is released to Dispatch.';
  end if;

  v_options:=public.be_wayplan_assignment_options_v44();

  select x into v_driver
  from jsonb_array_elements(v_options->'drivers') x
  where x->>'id'=p_driver_code;
  if v_driver is null then raise exception 'Choose an active Driver from the approved roster.'; end if;

  if nullif(p_rider_code,'') is not null then
    select x into v_rider
    from jsonb_array_elements(v_options->'riders') x
    where x->>'id'=p_rider_code;
    if v_rider is null then raise exception 'Choose an active Rider or leave Rider empty.'; end if;
  end if;

  if nullif(p_helper_code,'') is not null then
    select x into v_helper
    from jsonb_array_elements(v_options->'helpers') x
    where x->>'id'=p_helper_code;
    if v_helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if;
  end if;

  if p_driver_code=coalesce(p_rider_code,'')
     or p_driver_code=coalesce(p_helper_code,'')
     or (nullif(p_rider_code,'') is not null and p_rider_code=coalesce(p_helper_code,'')) then
    raise exception 'Driver, Rider and Helper must be different people/codes.';
  end if;

  update public.be_wayplan_dispatches
  set driver_code=p_driver_code,
      driver_name=v_driver->>'name',
      rider_code=nullif(p_rider_code,''),
      rider_name=coalesce(v_rider->>'name',''),
      helper_code=nullif(p_helper_code,''),
      helper_name=coalesce(v_helper->>'name',''),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'supervisor_crew_updated_at',now(),
        'supervisor_crew_updated_by',v_actor
      ),
      updated_at=now()
  where wayplan_id=p_wayplan_id;

  update public.be_wayplan_dispatch_stops
  set rider_code=nullif(p_rider_code,''),
      rider_name=coalesce(v_rider->>'name',''),
      updated_at=now()
  where wayplan_id=p_wayplan_id;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  )
  values(
    auth.uid(),v_actor,public.be_current_user_role(),
    'SUPERVISOR_CREW_UPDATED_V76','WAYPLAN',p_wayplan_id,
    jsonb_build_object(
      'driver_code',p_driver_code,
      'rider_code',nullif(p_rider_code,''),
      'helper_code',nullif(p_helper_code,'')
    )
  );

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',p_wayplan_id,
    'driver',v_driver,
    'rider',v_rider,
    'helper',v_helper,
    'review_status',v_review,
    'build','SUPERVISOR_CREW_ASSIGNMENT_AUTH_V76'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_submit_review_v43(p_wayplan_id text, p_actor_email text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_validation jsonb;
  v_revision integer := 1;
  v_status text;
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;

  v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    raise exception 'Wayplan review submission stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
  end if;

  select review_status, revision_no into v_status, v_revision
  from public.be_wayplan_review_v43 where wayplan_id = v_wayplan;

  if v_status in ('DISPATCH_READY','DISPATCHED','CANCELLED') then
    raise exception 'Wayplan % is already % and cannot be resubmitted', v_wayplan, v_status;
  end if;

  v_revision := case when v_status is null then 1 else coalesce(v_revision, 0) + 1 end;

  insert into public.be_wayplan_review_v43(
    wayplan_id, review_status, revision_no, submitted_by, submitted_at,
    reviewed_by, reviewed_at, review_notes, rejection_reason,
    approval_snapshot, updated_at
  ) values (
    v_wayplan, 'PENDING_REVIEW', v_revision, v_actor, now(),
    null, null, nullif(btrim(coalesce(p_notes, '')), ''), null,
    '{}'::jsonb, now()
  )
  on conflict (wayplan_id) do update
  set review_status = 'PENDING_REVIEW',
      revision_no = excluded.revision_no,
      submitted_by = excluded.submitted_by,
      submitted_at = excluded.submitted_at,
      reviewed_by = null,
      reviewed_at = null,
      review_notes = excluded.review_notes,
      rejection_reason = null,
      approval_snapshot = '{}'::jsonb,
      updated_at = now();

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_SUBMITTED_FOR_SUPERVISOR_REVIEW', v_actor, public.be_wayplan_review_role_v43(),
          jsonb_build_object('revision_no', v_revision, 'validation', v_validation, 'notes', nullif(btrim(coalesce(p_notes, '')), '')));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_SUBMITTED_FOR_SUPERVISOR_REVIEW_V43', v_actor,
          jsonb_build_object('revision_no', v_revision, 'validation', v_validation));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'PENDING_REVIEW',
    'revision_no', v_revision,
    'submitted_by', v_actor,
    'submitted_at', now(),
    'next_step', 'Supervisor reviews assignment, route group, parcel eligibility, and manifest before Dispatch handoff'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_prepare_dispatch_v43(p_wayplan_id text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_review_status text;
  v_validation jsonb;
  v_count integer := 0;
  v_way_ids text[] := '{}'::text[];
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  select review_status into v_review_status
  from public.be_wayplan_review_v43
  where wayplan_id = v_wayplan
  for update;

  if v_review_status = 'DISPATCH_READY' then
    select count(*)::integer, array_agg(delivery_way_id order by delivery_way_id)
    into v_count, v_way_ids
    from public.be_wayplan_membership_v40
    where wayplan_id = v_wayplan and membership_status = 'READY_FOR_DISPATCH';
    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', v_review_status,
      'membership_status', 'READY_FOR_DISPATCH', 'parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'dispatch_scan_required', true);
  end if;

  if v_review_status <> 'APPROVED' then
    raise exception 'Wayplan % requires Supervisor APPROVED status before Dispatch handoff. Current status: %', v_wayplan, coalesce(v_review_status, 'NOT_SUBMITTED');
  end if;

  v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    raise exception 'Dispatch handoff stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
  end if;

  select count(*)::integer, array_agg(delivery_way_id order by delivery_way_id)
  into v_count, v_way_ids
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan and membership_status = 'PLANNED';

  if v_count = 0 then raise exception 'Wayplan % has no PLANNED parcels to prepare', v_wayplan; end if;

  update public.be_wayplan_membership_v40
  set membership_status = 'READY_FOR_DISPATCH',
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_review_v43', 'APPROVED',
        'dispatch_ready_at', now(),
        'dispatch_ready_by', v_actor
      )
  where wayplan_id = v_wayplan and membership_status = 'PLANNED';

  update public.be_wayplan_review_v43
  set review_status = 'DISPATCH_READY', dispatch_ready_at = now(), updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_RELEASED_TO_MANDATORY_DISPATCH_SCAN', v_actor, public.be_wayplan_review_role_v43(),
          jsonb_build_object('parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'validation', v_validation));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_READY_FOR_MANDATORY_DISPATCH_SCAN_V43', v_actor,
          jsonb_build_object('parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'supervisor_approved', true));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'DISPATCH_READY',
    'membership_status', 'READY_FOR_DISPATCH',
    'parcel_count', v_count,
    'way_ids', to_jsonb(v_way_ids),
    'dispatch_scan_required', true,
    'message', format('%s passed Supervisor approval and is ready for mandatory Dispatch scanning.', v_wayplan)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_dispatch_publish_wayplan_v43(p_wayplan_id text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_review_status text;
  v_result jsonb;
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Dispatch operator is required';
  end if;
  select review_status into v_review_status
  from public.be_wayplan_review_v43 where wayplan_id = v_wayplan for update;

  if v_review_status = 'DISPATCHED' then
    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'DISPATCHED', 'already_published', true);
  end if;
  if v_review_status <> 'DISPATCH_READY' then
    raise exception 'Publish blocked. Wayplan % requires Supervisor approval and DISPATCH_READY status. Current status: %', v_wayplan, coalesce(v_review_status, 'NOT_SUBMITTED');
  end if;

  v_result := public.be_dispatch_publish_wayplan_v41(v_wayplan, v_actor);

  update public.be_wayplan_review_v43
  set review_status = 'DISPATCHED', dispatched_at = now(), updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'SUPERVISOR_APPROVED_WAYPLAN_PUBLISHED', v_actor, public.be_wayplan_review_role_v43(), coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'DISPATCHED',
    'supervisor_approval_enforced', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_created_wayplan_revision_snapshot_v46(p_wayplan_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wayplan public.be_wayplan_dispatches%rowtype;
  v_stops jsonb;
begin
  perform public.be_branch_require_wayplan_v1(p_wayplan_id);
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;

  select * into v_wayplan
  from public.be_wayplan_dispatches
  where wayplan_id=nullif(btrim(coalesce(p_wayplan_id,'')),'');

  if not found then
    return jsonb_build_object('ok',false,'error','Wayplan not found.');
  end if;

  if upper(coalesce(v_wayplan.wayplan_status,'')) <> 'CREATED' then
    return jsonb_build_object('ok',false,'error','Only a CREATED Wayplan can be revised before dispatch','wayplan_status',v_wayplan.wayplan_status);
  end if;

  if v_wayplan.dispatched_at is not null or v_wayplan.loaded_to_vehicle_at is not null or v_wayplan.handed_over_to_rider_at is not null then
    return jsonb_build_object('ok',false,'error','This Wayplan has already entered dispatch or vehicle loading and is locked.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',s.delivery_way_id,
    'waybill_no',s.waybill_no,
    'pickup_id',s.pickup_id,
    'pickup_way_id',s.pickup_way_id,
    'recipient_name',s.recipient_name,
    'recipient_phone',s.recipient_phone,
    'township',s.township,
    'address',s.address,
    'cod_amount',s.cod_amount,
    'delivery_fee',s.delivery_fee,
    'parcel_weight_kg',s.parcel_weight_kg,
    'latitude',l.latitude,
    'longitude',l.longitude,
    'stop_sequence',s.stop_sequence,
    'source_wayplan_id',s.wayplan_id
  ) order by s.stop_sequence),'[]'::jsonb)
  into v_stops
  from public.be_wayplan_dispatch_stops s
  left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
  where s.wayplan_id=v_wayplan.wayplan_id
    and upper(coalesce(s.stop_status,'')) not in ('CANCELLED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan.wayplan_id,
    'wayplan_status',v_wayplan.wayplan_status,
    'region_code',coalesce(v_wayplan.metadata->>'region_code',case v_wayplan.branch_code when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' else 'YANGON' end),
    'vehicle_code',v_wayplan.vehicle_code,
    'vehicle_name',v_wayplan.vehicle_name,
    'driver_code',v_wayplan.driver_code,
    'driver_name',v_wayplan.driver_name,
    'rider_code',v_wayplan.rider_code,
    'rider_name',v_wayplan.rider_name,
    'helper_code',v_wayplan.helper_code,
    'helper_name',v_wayplan.helper_name,
    'total_stops',v_wayplan.total_stops,
    'stops',v_stops,
    'build','WAYPLAN_CREATED_REVISION_SNAPSHOT_V46'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_dispatch_start_wayplan(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan_id text:=nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_actor text:=nullif(btrim(coalesce(p_payload->>'actor_email',p_payload->>'actor','')),'');
  v_check jsonb; v_wave_check jsonb;
begin
  perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id');
  if auth.uid() is null and session_user<>'postgres' then raise exception 'Authenticated Dispatch operator is required'; end if;
  if v_wayplan_id is null then return jsonb_build_object('ok',false,'error','wayplan_id is required'); end if;
  v_wave_check:=public.be_multi_trip_dispatch_ready_v43(v_wayplan_id);
  if not coalesce((v_wave_check->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'error','MULTI_TRIP_WAVE_BLOCKED_V43','wayplan_id',v_wayplan_id,'wave_guard',v_wave_check,'next_step','Complete or cancel the previous trip for this vehicle before dispatching the next wave.');
  end if;
  v_check:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan_id,null,null,null);
  if not coalesce((v_check->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'error','DISPATCH_BLOCKED_V12_11','wayplan_id',v_wayplan_id,'integrity',v_check,'next_step','Complete supervisor approval, valid workforce assignment, and mandatory parcel scanning.');
  end if;
  return public.be_dispatch_publish_wayplan_v43(v_wayplan_id,v_actor);
end
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_update_status(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan_id text:=nullif(p_payload->>'wayplan_id','');
  v_status text:=upper(coalesce(nullif(p_payload->>'status',''),''));
  v_actor text:=coalesce(nullif(p_payload->>'actor',''),'wayplan_command_center');
  v_check jsonb;
  v_wave_check jsonb;
  v_current_status text;
  v_dispatched_at timestamptz;
  v_active_stops integer:=0;
begin
  perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id');
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;
  if v_wayplan_id is null then
    return jsonb_build_object('ok',false,'error','wayplan_id is required');
  end if;
  if v_status not in ('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED') then
    return jsonb_build_object(
      'ok',false,'error','Invalid status',
      'allowed_statuses',jsonb_build_array('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED')
    );
  end if;

  select upper(coalesce(wayplan_status,'')),dispatched_at
    into v_current_status,v_dispatched_at
  from public.be_wayplan_dispatches
  where wayplan_id=v_wayplan_id;

  if not found then
    return jsonb_build_object('ok',false,'error','Wayplan not found','wayplan_id',v_wayplan_id);
  end if;

  if v_status='DISPATCHED' then
    v_wave_check:=public.be_multi_trip_dispatch_ready_v43(v_wayplan_id);
    if not coalesce((v_wave_check->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,'error','MULTI_TRIP_WAVE_BLOCKED_V43',
        'wayplan_id',v_wayplan_id,'wave_guard',v_wave_check,
        'next_step','Complete or cancel the previous trip for this vehicle before dispatching the next wave.'
      );
    end if;

    v_check:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan_id,null,null,null);
    if not coalesce((v_check->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,'error','DISPATCH_BLOCKED_V12_11',
        'wayplan_id',v_wayplan_id,'integrity',v_check,
        'next_step','Use Supervisor approval + mandatory Dispatch scan before publishing.'
      );
    end if;

    return public.be_dispatch_publish_wayplan_v43(v_wayplan_id,v_actor);
  end if;

  if v_status='COMPLETED' then
    if v_current_status<>'DISPATCHED' or v_dispatched_at is null then
      return jsonb_build_object(
        'ok',false,
        'error','PREMATURE_COMPLETE_BLOCKED_V61',
        'wayplan_id',v_wayplan_id,
        'current_status',v_current_status,
        'next_step','Supervisor approval, mandatory Dispatch scan, and actual Dispatch must happen before Complete.'
      );
    end if;

    select count(*)::integer
      into v_active_stops
    from public.be_wayplan_dispatch_stops
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

    if v_active_stops>0 then
      return jsonb_build_object(
        'ok',false,
        'error','WAYPLAN_NOT_FINISHED_V61',
        'wayplan_id',v_wayplan_id,
        'active_stops',v_active_stops,
        'next_step','Finish delivery/return outcomes for every dispatched stop before completing the Wayplan.'
      );
    end if;

    update public.be_wayplan_dispatches
    set wayplan_status='COMPLETED',
        completed_at=coalesce(completed_at,now()),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'last_action_actor',v_actor,
          'last_action_status','COMPLETED',
          'last_action_at',now(),
          'lifecycle_guard','V61'
        ),
        updated_at=now()
    where wayplan_id=v_wayplan_id;

    update public.be_wayplan_review_v43
    set updated_at=now()
    where wayplan_id=v_wayplan_id;

    return jsonb_build_object(
      'ok',true,'wayplan_id',v_wayplan_id,'status','COMPLETED',
      'lifecycle_guard','V61','active_stops',0
    );
  end if;

  if v_status='ON_HOLD' and v_current_status not in ('CREATED','DISPATCHED','ON_HOLD') then
    return jsonb_build_object(
      'ok',false,'error','HOLD_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Only CREATED or DISPATCHED Wayplans can be placed on hold.'
    );
  end if;

  if v_status='CREATED' and v_current_status not in ('CREATED','ON_HOLD') then
    return jsonb_build_object(
      'ok',false,'error','REOPEN_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Only an ON_HOLD pre-dispatch Wayplan can be reopened to CREATED.'
    );
  end if;

  if v_status='CANCELLED' and v_current_status in ('DISPATCHED','COMPLETED') then
    return jsonb_build_object(
      'ok',false,'error','CANCEL_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Use the field return/RTO workflow after a Wayplan has been dispatched.'
    );
  end if;

  update public.be_wayplan_dispatches
  set wayplan_status=v_status,
      completed_at=case when v_status<>'COMPLETED' then null else completed_at end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_action_actor',v_actor,
        'last_action_status',v_status,
        'last_action_at',now(),
        'dispatch_guard','V43_MULTI_TRIP',
        'lifecycle_guard','V61'
      ),
      updated_at=now()
  where wayplan_id=v_wayplan_id;

  if v_status='CREATED' then
    update public.be_wayplan_dispatch_stops
    set stop_status='READY_FOR_DISPATCH',updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE');

    update public.be_waybill_ledger
    set dispatch_status='WAYPLAN_CREATED',wayplan_status='WAYPLAN_CREATED',updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');
  else
    update public.be_wayplan_dispatch_stops
    set stop_status=v_status,updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

    update public.be_waybill_ledger
    set dispatch_status=v_status,wayplan_status=v_status,updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');
  end if;

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan_id,'status',v_status,
    'dispatch_guard','V43_MULTI_TRIP','lifecycle_guard','V61'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.be_replace_created_wayplan_v46(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_source_id text:=nullif(btrim(coalesce(p_payload->>'source_wayplan_id','')),'');
  v_request_id text:=nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_plan jsonb:=coalesce(p_payload->'plan','{}'::jsonb);
  v_ids jsonb:=coalesce(v_plan->'delivery_way_ids','[]'::jsonb);
  v_route jsonb:=coalesce(v_plan->'route','{}'::jsonb);
  v_source public.be_wayplan_dispatches%rowtype;
  v_ctx jsonb;
  v_vehicle jsonb;
  v_driver jsonb;
  v_rider jsonb;
  v_helper jsonb;
  v_result jsonb;
  v_old_event jsonb;
  v_route_result jsonb;
  v_route_recalc jsonb;
  v_route_payload jsonb;
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  v_role text:=lower(coalesce(public.be_current_user_role(),''));
  v_branch text;
  v_new_id text;
  v_n integer:=0;
  v_eligible integer:=0;
  v_old_count integer:=0;
  v_new_count integer:=0;
  v_short boolean:=false;
  v_reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
  v_approve boolean:=coalesce((p_payload->>'approve_below_minimum')::boolean,false);
  v_weight numeric:=0;
  v_route_source text:=upper(coalesce(v_route->>'source',''));
  v_base_source text:=upper(coalesce(v_route->>'base_source',''));
  v_old_ids text[]:='{}';
  v_selected_ids text[]:='{}';
  v_id text;
  v_rider_only boolean:=upper(coalesce(v_plan->>'vehicle_code','')) in ('MOTORBIKE','BICYCLE');
begin
  perform public.be_branch_require_wayplan_v1(p_payload->>'source_wayplan_id');
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;
  if v_role not in ('branch-manager','branch_manager','branch_office_manager','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
    raise exception 'Wayplan revision permission is required' using errcode='42501';
  end if;
  if v_source_id is null then raise exception 'source_wayplan_id is required'; end if;
  if v_request_id is null or v_request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
  if jsonb_typeof(v_ids)<>'array' then raise exception 'delivery_way_ids must be an array.'; end if;
  v_n:=jsonb_array_length(v_ids);
  if v_n<1 or v_n>75 then raise exception 'A revised Wayplan must contain between 1 and 75 parcels.'; end if;
  if v_route_source not in ('GOOGLE_ROUTES','MAPBOX_FALLBACK','OPERATOR_EDITED','DEFERRED_PROVIDER') then
    raise exception 'A supported reviewed route is required before revision.';
  end if;
  if (v_route_source='DEFERRED_PROVIDER' or (v_route_source='OPERATOR_EDITED' and v_base_source='DEFERRED_PROVIDER'))
     and (not coalesce((v_route->>'estimated')::boolean,false)
          or v_route->>'route_mode' is distinct from 'LOCAL_HAVERSINE_ESTIMATE'
          or length(btrim(coalesce(v_route->>'warning','')))<5) then
    raise exception 'A deferred route must retain its labelled estimate and operator warning.';
  end if;
  v_short:=v_n<50 and not v_rider_only;
  if v_short and (not v_approve or length(v_reason)<5) then
    raise exception 'Operator approval and a reason are required for a revised Wayplan below 50 parcels.';
  end if;

  if v_rider_only then
    if nullif(btrim(v_plan->>'rider_code'),'') is null
       or nullif(btrim(v_plan->>'driver_code'),'') is not null
       or nullif(btrim(v_plan->>'helper_code'),'') is not null then
      raise exception 'Motor Bike/Bicycle uses Rider only; a Rider is required and Driver and Helper must be empty.';
    end if;
  else
    if nullif(btrim(v_plan->>'driver_code'),'') is null or nullif(btrim(v_plan->>'rider_code'),'') is not null then
      raise exception 'Van routes use a required Driver and optional Helper; Rider must be empty.';
    end if;
    if nullif(btrim(v_plan->>'helper_code'),'')=nullif(btrim(v_plan->>'driver_code'),'') then
      raise exception 'Driver and Helper must be different people.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wayplan-revision-v46:'||v_source_id,0));

  select details into v_old_event
  from public.be_audit_events
  where action='WAYPLAN_REVISED_V46' and resource_id=v_request_id
  limit 1;
  if v_old_event is not null then
    if v_old_event->'request' is distinct from p_payload or v_old_event->>'actor_id'<>auth.uid()::text then
      raise exception 'Request ID already belongs to another operation.';
    end if;
    return v_old_event->'result';
  end if;

  -- Serialize roster revalidation with dispatch/fleet mutations, including direct writes.
  lock table public.be_wayplan_dispatches in share row exclusive mode;

  select * into v_source
  from public.be_wayplan_dispatches
  where wayplan_id=v_source_id
  for update;
  if not found then raise exception 'Source Wayplan not found.'; end if;
  if upper(coalesce(v_source.wayplan_status,'')) <> 'CREATED' then
    raise exception 'Only a CREATED Wayplan can be revised before dispatch';
  end if;
  if v_source.dispatched_at is not null or v_source.loaded_to_vehicle_at is not null or v_source.handed_over_to_rider_at is not null then
    raise exception 'This Wayplan has already entered dispatch or vehicle loading and is locked.';
  end if;

  v_branch:=case v_region when 'MANDALAY' then 'MDY' when 'NAYPYITAW' then 'NPT' else 'YGN' end;
  if coalesce(v_source.branch_code,'YGN')<>v_branch then raise exception 'Revision region does not match the source Wayplan branch.'; end if;

  foreach v_id in array array(select jsonb_array_elements_text(v_ids)) loop
    if v_id=any(v_selected_ids) then raise exception 'A parcel cannot appear twice in the revised Wayplan.'; end if;
    v_selected_ids:=array_append(v_selected_ids,v_id);
  end loop;

  select coalesce(array_agg(s.delivery_way_id order by s.stop_sequence),'{}'::text[]),count(*)::integer
  into v_old_ids,v_old_count
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_source_id
    and upper(coalesce(s.stop_status,'')) not in ('CANCELLED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');
  if v_old_count=0 then raise exception 'Source Wayplan has no revisable stops.'; end if;

  -- Release the source membership/ledger inside this transaction. Any later failure rolls this back.
  update public.be_wayplan_membership_v40
  set membership_status='CANCELLED',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46','RELEASED_FOR_REPLACEMENT','revision_request_id',v_request_id,'revised_at',now())
  where wayplan_id=v_source_id
    and membership_status not in ('CANCELLED','COMPLETED','RTO');

  update public.be_waybill_ledger
  set wayplan_id=null,wayplan_status='READY_FOR_WAYPLAN',dispatch_status='READY_FOR_DISPATCH',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46_released_from',v_source_id,'revision_request_id',v_request_id)
  where delivery_way_id=any(v_old_ids)
    and wayplan_id=v_source_id
    and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');

  -- After source release, every retained or newly-added way must be independently eligible.
  select count(*)::integer into v_eligible
  from public.be_v_dispatch_ready_queue q
  join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
  where q.delivery_way_id=any(v_selected_ids)
    and d.delivery_region=v_region
    and d.delivery_route_mode='DOORSTEP_MAP';
  if v_eligible<>v_n then
    raise exception 'Every revised parcel must be registered, financially valid, warehouse-ready, location-accepted, unassigned, and inside the same active region. Selected %, eligible %.',v_n,v_eligible;
  end if;

  v_ctx:=public.be_multi_van_context();
  select x into v_vehicle from jsonb_array_elements(v_ctx->'vehicles') x
  where x->>'id'=v_plan->>'vehicle_code' and x->>'operation_type'='DELIVERY';
  if v_vehicle is null then raise exception 'Choose an active delivery fleet for the revised Wayplan.'; end if;
  if coalesce(v_vehicle->>'branch_code','') not in ('',v_branch) then
    raise exception 'Selected vehicle belongs to another branch.';
  end if;
  if v_rider_only then
    select x into v_rider from jsonb_array_elements(v_ctx->'riders') x where x->>'id'=v_plan->>'rider_code';
    if v_rider is null then raise exception 'Choose an active Rider.'; end if;
    if coalesce(v_rider->>'branch_code','') not in ('',v_branch) then raise exception 'Selected crew belongs to another branch.'; end if;
  else
    select x into v_driver from jsonb_array_elements(v_ctx->'drivers') x where x->>'id'=v_plan->>'driver_code';
    if v_driver is null then raise exception 'Choose an active Driver.'; end if;
    if nullif(btrim(v_plan->>'helper_code'),'') is not null then
      select x into v_helper from jsonb_array_elements(v_ctx->'helpers') x where x->>'id'=v_plan->>'helper_code';
      if v_helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if;
    end if;
    if coalesce(v_driver->>'branch_code','') not in ('',v_branch)
       or (v_helper is not null and coalesce(v_helper->>'branch_code','') not in ('',v_branch)) then
      raise exception 'Selected crew belongs to another branch.';
    end if;
  end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(v_ctx->'busy','[]'::jsonb)) b
    where coalesce(nullif(b->>'wayplan_id',''),b->>'wayplan_code','')<>v_source_id
      and (b->>'vehicle_code'=v_plan->>'vehicle_code'
        or exists(select 1 from unnest(array[b->>'driver_code',b->>'rider_code',b->>'helper_code']) worker(code)
          where nullif(worker.code,'') is not null and worker.code=any(array[v_plan->>'driver_code',v_plan->>'rider_code',v_plan->>'helper_code'])))
  ) then
    raise exception 'Selected fleet or crew is active on another dispatched/on-hold Wayplan. Refresh availability.';
  end if;
  select coalesce(sum(d.weight_kg),0) into v_weight from public.be_data_entry_parcel_details d where d.delivery_way_id=any(v_selected_ids);
  if coalesce((v_vehicle->>'capacity_kg')::numeric,0)>0 and v_weight>(v_vehicle->>'capacity_kg')::numeric then
    raise exception 'Selected parcel weight exceeds vehicle capacity.';
  end if;

  v_new_id:='WP-'||to_char(now(),'YYYYMMDD')||'-REV-'||upper(substr(replace(v_request_id,'-',''),1,12));

  v_result:=public.be_generate_wayplan(jsonb_build_object(
    'wayplan_id',v_new_id,
    'region_code',v_region,
    'branch_code',v_branch,
    'delivery_way_ids',v_ids,
    'vehicle_code',v_plan->>'vehicle_code',
    'vehicle_name',v_vehicle->>'name',
    'driver_code',nullif(v_plan->>'driver_code',''),
    'driver_name',v_driver->>'name',
    'rider_code',nullif(v_plan->>'rider_code',''),
    'rider_name',v_rider->>'name',
    'helper_code',nullif(v_plan->>'helper_code',''),
    'helper_name',v_helper->>'name',
    'actor',v_actor
  ));
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception '%',coalesce(v_result->>'error','Revised Wayplan generation failed.');
  end if;

  -- Preserve the reviewed road order returned by the frontend optimizer.
  update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=v_new_id;
  update public.be_wayplan_dispatch_stops s
  set stop_sequence=x.ord::int,
      optimized_sequence=x.ord::int,
      delivery_sequence=x.ord::int,
      rider_code=nullif(v_plan->>'rider_code',''),
      rider_name=v_rider->>'name'
  from jsonb_array_elements_text(v_ids) with ordinality x(id,ord)
  where s.wayplan_id=v_new_id and s.delivery_way_id=x.id;

  select count(*)::integer into v_new_count from public.be_wayplan_dispatch_stops where wayplan_id=v_new_id;
  if v_new_count<>v_n then raise exception 'Replacement Wayplan did not contain every revised stop.'; end if;

  v_route_payload:=v_route||jsonb_build_object(
    'origin',coalesce(v_ctx->'route_origins'->v_region,'{}'::jsonb),
    'ordered_stops',(
      select jsonb_agg(jsonb_build_object(
        'delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,
        'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,
        'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,
        'address',s.address,'township',s.township
      ) order by s.stop_sequence)
      from public.be_wayplan_dispatch_stops s
      left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
      where s.wayplan_id=v_new_id
    )
  );

  -- Version 1 establishes the immutable replacement loading snapshot; version 2 records that it is an operator revision.
  v_route_result:=public.be_save_operational_route_version_v1(v_new_id,'GENERATED',v_route_payload,'V46 replacement generated from reviewed revised membership');
  v_route_recalc:=public.be_save_operational_route_version_v1(v_new_id,'OPERATOR_RECALCULATION',v_route_payload,'V46 CREATED Wayplan membership revision');

  update public.be_wayplan_dispatches
  set vehicle_code=v_plan->>'vehicle_code',vehicle_name=v_vehicle->>'name',
      driver_code=nullif(v_plan->>'driver_code',''),driver_name=v_driver->>'name',
      rider_code=nullif(v_plan->>'rider_code',''),rider_name=v_rider->>'name',
      helper_code=nullif(v_plan->>'helper_code',''),helper_name=v_helper->>'name',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'revision_v46',true,'replaces_wayplan_id',v_source_id,'revision_request_id',v_request_id,
        'revision_actor',v_actor,'revision_at',now(),'revision_reason',v_reason,
        'generated_route_version',v_route_result->'route_version','active_route_version',v_route_recalc->'route_version',
        'planning_mode','CREATED_WAYPLAN_REVISION_V46','wave_no',coalesce(nullif(v_plan->>'wave_no','')::int,1),'trip_no',coalesce(nullif(v_plan->>'trip_no','')::int,1)
      ),updated_at=now()
  where wayplan_id=v_new_id;

  update public.be_wayplan_membership_v40
  set membership_status='PLANNED',vehicle_code=v_plan->>'vehicle_code',vehicle_name=v_vehicle->>'name',
      driver_code=nullif(v_plan->>'driver_code',''),driver_name=v_driver->>'name',
      rider_code=nullif(v_plan->>'rider_code',''),rider_name=v_rider->>'name',
      helper_code=nullif(v_plan->>'helper_code',''),helper_name=v_helper->>'name',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46',true,'replaces_wayplan_id',v_source_id,'revision_request_id',v_request_id)
  where wayplan_id=v_new_id;

  update public.be_wayplan_dispatches
  set wayplan_status='CANCELLED',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46',true,'replaced_by_wayplan_id',v_new_id,'revision_request_id',v_request_id,'revised_at',now()),
      updated_at=now()
  where wayplan_id=v_source_id;

  update public.be_wayplan_dispatch_stops
  set stop_status='CANCELLED',dispatch_status='CANCELLED',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46_replaced_by',v_new_id,'revision_request_id',v_request_id)
  where wayplan_id=v_source_id
    and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  v_result:=jsonb_build_object(
    'ok',true,
    'source_wayplan_id',v_source_id,
    'replacement_wayplan_id',v_new_id,
    'replaces_wayplan_id',v_source_id,
    'old_stop_count',v_old_count,
    'new_stop_count',v_new_count,
    'added_count',(select count(*) from unnest(v_selected_ids) x where not (x=any(v_old_ids))),
    'removed_count',(select count(*) from unnest(v_old_ids) x where not (x=any(v_selected_ids))),
    'status','CREATED',
    'route_source',v_route_source,
    'generated_route_version',v_route_result->'route_version',
    'active_route_version',v_route_recalc->'route_version',
    'dispatch_required_separately',true
  );

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'WAYPLAN_REVISED_V46','WAYPLAN_REVISION',v_request_id,
    jsonb_build_object('request',p_payload,'result',v_result,'actor_id',auth.uid(),'source_wayplan_id',v_source_id,'replacement_wayplan_id',v_new_id));

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_delete_created_wayplan_v55(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_wayplan_id text := nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_actor text := coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then raise exception 'HEAD_OFFICE_DELETE_REQUIRED'; end if;
  perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id');
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;
  if v_wayplan_id is null then raise exception 'wayplan_id is required'; end if;

  -- V47 performs all safety gates and releases eligible parcels back to READY.
  v_result := public.be_delete_created_wayplan_v47(p_payload);
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  -- Keep audit history, but remove the deleted pre-dispatch Wayplan from every
  -- operational/read-model table so it no longer appears as CANCELLED.
  delete from public.be_wayplan_route_version_stops_v1 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_warehouse_loading_snapshots_v1 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_route_events_v45 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_route_plans_v45 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_review_events_v43 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_review_v43 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_events_v40 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_command_rows where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_items where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_stops where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_stops_v25 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplans where wayplan_id=v_wayplan_id;
  delete from public.be_wayplans_v25 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_membership_v40 where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  delete from public.be_wayplan_dispatches where wayplan_id=v_wayplan_id;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (
    auth.uid(),v_actor,public.be_current_user_role(),
    'WAYPLAN_PURGED_V55','WAYPLAN',coalesce(v_request_id,v_wayplan_id),
    jsonb_build_object(
      'wayplan_id',v_wayplan_id,
      'request_id',v_request_id,
      'released_count',coalesce((v_result->>'released_count')::integer,0),
      'operational_rows_removed',true,
      'audit_history_retained',true,
      'source_result',v_result
    )
  );

  return v_result || jsonb_build_object(
    'status','DELETED',
    'purged',true,
    'operational_rows_removed',true,
    'audit_history_retained',true,
    'build','WAYPLAN_DELETE_PURGE_V55'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_generate_multi_van_v43(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
#variable_conflict use_variable
declare
  ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
  request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code'); branch text;
  planning_mode text:=upper(coalesce(nullif(p_payload->>'planning_mode',''),'STANDARD_50_75'));
  old_event jsonb; result jsonb; results jsonb:='[]'::jsonb; ids text[]:='{}'; crew_keys text[]:='{}'; van_keys text[]:='{}';
  parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
  reason text:=btrim(coalesce(p_payload->>'below_minimum_reason','')); actor text; plan_id text; idx int:=0;
  route_payload jsonb; origin jsonb; saved_route jsonb; crew_mode text; emergency_reason text;
  driver_name text; rider_name text; helper_name text; wave_no int; trip_no int; wave_count int:=1; key text; vehicle_mode text;
begin
  perform public.be_branch_require_region_v1(p_payload->>'region_code'); if p_payload ? 'branch_code' then perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;
  ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
  if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 64 then raise exception 'Select one to 64 route trips.'; end if;
  if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
  branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
  origin:=ctx->'route_origins'->region; if origin is null then raise exception 'Configured branch route origin is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner-v43',0));
  select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED_V43' and resource_id=request_id limit 1;
  if old_event is not null then
    if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
    return old_event->'result';
  end if;
  ctx:=public.be_multi_van_context();
  for p in select value from jsonb_array_elements(plans) loop
    wave_no:=greatest(1,coalesce(nullif(p->>'wave_no','')::int,1));
    trip_no:=greatest(1,coalesce(nullif(p->>'trip_no','')::int,1));
    wave_count:=greatest(wave_count,wave_no); crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
    n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated route needs parcels.'; end if;
    if n>75 then raise exception 'A delivery route cannot exceed 75 parcels.'; end if; total_count:=total_count+n; if n<50 and not ((crew_mode='ROSTER' and coalesce(p->>'rider_code','')<>'') or (crew_mode='EMERGENCY_MANUAL' and coalesce(btrim(p->>'rider_name'),'')<>'')) then short_count:=short_count+1; end if;
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
    if v is null then raise exception 'Choose a delivery vehicle first.'; end if;
    vehicle_mode:=upper(coalesce(nullif(v->>'vehicle_mode',''),case when upper(coalesce(p->>'vehicle_code','')) in ('MOTORBIKE','BICYCLE') then 'RIDER_ONLY' else 'DRIVER_CREW' end));
    if coalesce(v->>'branch_code','') not in ('',branch) then raise exception 'Selected delivery fleet belongs to another branch.'; end if;
    if vehicle_mode<>'RIDER_ONLY' then
      key:=wave_no::text||':'||(p->>'vehicle_code');
      if key=any(van_keys) then raise exception 'A fleet cannot run two routes in the same wave.'; end if;
      van_keys:=array_append(van_keys,key);
    end if;
    if crew_mode='EMERGENCY_MANUAL' then
      driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),''); emergency_reason:=nullif(btrim(p->>'emergency_substitution_reason'),'');
      if emergency_reason is null or length(emergency_reason)<5 then raise exception 'A reason is required for emergency crew substitution.'; end if;
      if vehicle_mode='RIDER_ONLY' then
        if rider_name is null then raise exception 'Choose an Emergency Rider for the Motor Bike/Bicycle.'; end if;
        if driver_name is not null or helper_name is not null then raise exception 'Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.'; end if;
        key:=wave_no::text||':manual:'||lower(rider_name); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
      else
        if driver_name is null then raise exception 'Choose an Emergency Driver for the selected vehicle.'; end if;
        if rider_name is not null then raise exception 'Van/car/truck routes do not use a Rider. Clear Rider and choose Driver/Helper only.'; end if;
        if helper_name is not null and lower(helper_name)=lower(driver_name) then raise exception 'Driver and Helper must be different people.'; end if;
        key:=wave_no::text||':manual:'||lower(driver_name); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
        if helper_name is not null then key:=wave_no::text||':manual:'||lower(helper_name); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key); end if;
      end if;
    elsif crew_mode='ROSTER' then
      driver:=null; rider:=null; helper:=null;
      if vehicle_mode='RIDER_ONLY' then
        if coalesce(p->>'driver_code','')<>'' or coalesce(p->>'helper_code','')<>'' then raise exception 'Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.'; end if;
        if coalesce(p->>'rider_code','')='' then raise exception 'Choose a Rider for the Motor Bike/Bicycle.'; end if;
        select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
        if rider is null then raise exception 'Choose an active Rider.'; end if;
        if coalesce(rider->>'branch_code','') not in ('',branch) then raise exception 'Selected Rider belongs to another branch.'; end if;
        key:=wave_no::text||':'||(p->>'rider_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
        if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'rider_code'=p->>'rider_code') then raise exception 'The selected Rider is active on another dispatched/on-hold Wayplan. Choose another Rider or complete/cancel the active route first.'; end if;
      else
        if coalesce(p->>'rider_code','')<>'' then raise exception 'Van/car/truck routes do not use a Rider. Clear Rider and choose Driver/Helper only.'; end if;
        select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
        if driver is null then raise exception 'Choose an active Driver.'; end if;
        if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if; end if;
        if coalesce(driver->>'branch_code','') not in ('',branch) or (helper is not null and coalesce(helper->>'branch_code','') not in ('',branch)) then raise exception 'Selected crew belongs to another branch.'; end if;
        if helper is not null and p->>'helper_code'=p->>'driver_code' then raise exception 'Driver and Helper must be different people.'; end if;
        key:=wave_no::text||':'||(p->>'driver_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
        if helper is not null then key:=wave_no::text||':'||(p->>'helper_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key); end if;
        if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'A selected fleet or crew member is physically active on another dispatched/on-hold Wayplan. Refresh availability.'; end if;
      end if;
    else raise exception 'Invalid crew mode.'; end if;    for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two routes.'; end if; ids:=array_append(ids,parcel_id); end loop;
    select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
    if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
  end loop;
  if planning_mode not in ('YANGON_MASTER','YANGON_MASTER_MULTI_TRIP') and short_count>1 then
    raise exception 'Only one delivery van may be below 50 parcels.';
  end if;
  if short_count>0 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then
    if planning_mode in ('YANGON_MASTER','YANGON_MASTER_MULTI_TRIP') then
      raise exception 'Operator approval and a reason are required for the unavoidable Yangon hard-fence route(s) below 50 parcels.';
    else
      raise exception 'Operator approval and a reason are required for the van below 50 parcels.';
    end if;
  end if;
  perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
  for p in select value from jsonb_array_elements(plans) loop
    idx:=idx+1; wave_no:=greatest(1,coalesce(nullif(p->>'wave_no','')::int,1)); trip_no:=greatest(1,coalesce(nullif(p->>'trip_no','')::int,1));
    plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx; crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
    vehicle_mode:=upper(coalesce(nullif(v->>'vehicle_mode',''),case when upper(coalesce(p->>'vehicle_code','')) in ('MOTORBIKE','BICYCLE') then 'RIDER_ONLY' else 'DRIVER_CREW' end));
    if crew_mode='ROSTER' then
      select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
      select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
      select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
      result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name','rider_name',coalesce(rider->>'name',''),'helper_name',coalesce(helper->>'name',''),'actor',actor));
      driver_name:=driver->>'name'; rider_name:=coalesce(rider->>'name',''); helper_name:=coalesce(helper->>'name','');
    else
      driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),'');
      result:=public.be_generate_wayplan_emergency_crew_v1(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'branch_code',branch,'vehicle_name',v->>'name','vehicle_mode',vehicle_mode,'actor',actor));
    end if;
    if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
    update public.be_wayplan_dispatches
    set rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,
        rider_name=rider_name,
        driver_code=case when crew_mode='ROSTER' then p->>'driver_code' else null end,
        driver_name=driver_name,
        helper_code=case when crew_mode='ROSTER' then nullif(p->>'helper_code','') else null end,
        helper_name=helper_name,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),'planning_mode',planning_mode,'wave_no',wave_no,'trip_no',trip_no,'crew_mode',crew_mode,'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50 and not ((crew_mode='ROSTER' and coalesce(p->>'rider_code','')<>'') or (crew_mode='EMERGENCY_MANUAL' and coalesce(btrim(p->>'rider_name'),'')<>'')),'rider_minimum_exempt',jsonb_array_length(p->'delivery_way_ids')<50 and ((crew_mode='ROSTER' and coalesce(p->>'rider_code','')<>'') or (crew_mode='EMERGENCY_MANUAL' and coalesce(btrim(p->>'rider_name'),'')<>'')),'below_minimum_reason',reason,'emergency_substitution_reason',p->>'emergency_substitution_reason'),
        updated_at=now()
    where wayplan_id=plan_id;
    update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
    update public.be_wayplan_dispatch_stops s
    set stop_sequence=x.ord::int,rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,rider_name=rider_name
    from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
    where s.wayplan_id=plan_id and s.delivery_way_id=x.id;
    route_payload:=coalesce(p->'route','{}'::jsonb)||jsonb_build_object('origin',origin,'wave_no',wave_no,'trip_no',trip_no,'ordered_stops',(
      select jsonb_agg(jsonb_build_object('delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township) order by s.stop_sequence)
      from public.be_wayplan_dispatch_stops s left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id where s.wayplan_id=plan_id));
    saved_route:=public.be_save_operational_route_version_v1(plan_id,'GENERATED',route_payload,null);
    results:=results||jsonb_build_array(result||jsonb_build_object('route_version',saved_route->'route_version','route_source',p#>>'{route,source}','route_mode',p#>>'{route,route_mode}','crew_mode',crew_mode,'wave_no',wave_no,'trip_no',trip_no));
    if jsonb_array_length(p->'delivery_way_ids')<50 and not ((crew_mode='ROSTER' and coalesce(p->>'rider_code','')<>'') or (crew_mode='EMERGENCY_MANUAL' and coalesce(btrim(p->>'rider_name'),'')<>'')) then
      insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
      values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id,'wave_no',wave_no,'trip_no',trip_no));
    end if;
  end loop;
  result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count,'wave_count',wave_count);
  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED_V43','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
  return result || jsonb_build_object('build','WAYPLAN_MOBILITY_TYPE_AVAILABILITY_V157','rider_optional',true,'rider_minimum_parcels',0,'van_minimum_parcels',50);
end
$function$;

CREATE OR REPLACE FUNCTION public.be_generate_wayplan_v18_legacy(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wayplan_id text;
  v_vehicle_code text;
  v_vehicle_name text;
  v_driver_code text;
  v_driver_name text;
  v_rider_code text;
  v_rider_name text;
  v_helper_code text;
  v_helper_name text;
  v_actor text;
  v_selected jsonb;
  v_selected_count integer:=0;
  v_eligible_selected_count integer:=0;
  v_count integer:=0;
  v_cod numeric:=0;
  v_driver_ok boolean:=true;
  v_rider_ok boolean:=true;
  v_helper_ok boolean:=true;
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') and exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'delivery_way_ids','[]'::jsonb)) x where not public.be_branch_parcel_at_v1(x,public.be_branch_scope_v1(null))) then raise exception 'DESTINATION_RECEIPT_REQUIRED'; end if;
  if exists(select 1 from public.be_wayplan_dispatches w where w.wayplan_id=p_payload->>'wayplan_id') then perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id'); end if; p_payload:=p_payload||jsonb_build_object('branch_code',case upper(p_payload->>'region_code') when 'MANDALAY' then 'MDY' when 'YANGON' then 'YGN' when 'NAYPYITAW' then 'NPT' end);
  perform public.be_branch_require_region_v1(p_payload->>'region_code'); if p_payload ? 'branch_code' then perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;
  v_wayplan_id:=coalesce(nullif(p_payload->>'wayplan_id',''),'WP-'||to_char(now(),'YYYYMMDD-HH24MISS'));
  v_vehicle_code:=nullif(p_payload->>'vehicle_code','');
  v_vehicle_name:=nullif(p_payload->>'vehicle_name','');
  v_driver_code:=upper(nullif(p_payload->>'driver_code',''));
  v_driver_name:=nullif(p_payload->>'driver_name','');
  v_rider_code:=upper(nullif(p_payload->>'rider_code',''));
  v_rider_name:=nullif(p_payload->>'rider_name','');
  v_helper_code:=upper(nullif(p_payload->>'helper_code',''));
  v_helper_name:=nullif(p_payload->>'helper_name','');
  v_actor:=coalesce(nullif(p_payload->>'actor',''),'dispatch');
  v_selected:=coalesce(p_payload->'delivery_way_ids',p_payload->'waybill_nos','[]'::jsonb);
  v_selected_count:=jsonb_array_length(v_selected);

  if v_rider_code is null and v_driver_code is null then
    return jsonb_build_object('ok',false,'error','Rider or Driver is required before Wayplan creation.');
  end if;

  if v_rider_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_rider_code
        and upper(coalesce(a.role,''))='RIDER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_rider_ok;
  end if;
  if v_driver_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_driver_code
        and upper(coalesce(a.role,''))='DRIVER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_driver_ok;
  end if;
  if v_helper_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_helper_code
        and upper(coalesce(a.role,''))='HELPER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_helper_ok;
  end if;

  if not v_rider_ok then return jsonb_build_object('ok',false,'error','Assigned Rider does not have an active Rider App authentication mapping.','worker_code',v_rider_code); end if;
  if not v_driver_ok then return jsonb_build_object('ok',false,'error','Assigned Driver does not have an active Rider App authentication mapping.','worker_code',v_driver_code); end if;
  if not v_helper_ok then return jsonb_build_object('ok',false,'error','Assigned Helper does not have an active Helper App authentication mapping. Helper is optional; remove or correct the helper assignment.','worker_code',v_helper_code); end if;

  if v_selected_count>0 then
    select count(*)::integer into v_eligible_selected_count
    from jsonb_array_elements_text(v_selected) s(id)
    where exists(
      select 1 from public.be_wayplan_eligible_rows_v69(v_region) q
      where q.delivery_way_id=s.id or q.waybill_no=s.id
    );
    if v_eligible_selected_count<>v_selected_count then
      return jsonb_build_object(
        'ok',false,
        'error','Some selected parcels are no longer in the canonical ready-for-Wayplan queue.',
        'selected',v_selected_count,'eligible',v_eligible_selected_count,
        'region_code',v_region,'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE'
      );
    end if;
  end if;

  insert into public.be_wayplan_dispatches(
    wayplan_id,dispatch_batch_no,branch_code,vehicle_code,vehicle_name,
    driver_code,driver_name,rider_code,rider_name,helper_code,helper_name,
    wayplan_status,created_by,metadata
  ) values (
    v_wayplan_id,v_wayplan_id,coalesce(nullif(p_payload->>'branch_code',''),'YGN'),v_vehicle_code,v_vehicle_name,
    v_driver_code,v_driver_name,v_rider_code,v_rider_name,v_helper_code,v_helper_name,
    'CREATED',v_actor,p_payload||jsonb_build_object(
      'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE','helper_optional',true,
      'queue_source','be_dispatch_ready_queue_v19/V67_FAST'
    )
  ) on conflict(wayplan_id) do update set
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,
    driver_code=excluded.driver_code,driver_name=excluded.driver_name,
    rider_code=excluded.rider_code,rider_name=excluded.rider_name,
    helper_code=excluded.helper_code,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_dispatches.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  delete from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_dispatch_stops(
    wayplan_id,stop_sequence,pickup_id,pickup_way_id,delivery_way_id,waybill_no,
    recipient_name,recipient_phone,township,address,cod_amount,delivery_fee,parcel_weight_kg,stop_status,metadata
  )
  select v_wayplan_id,row_number() over(order by chosen.ord),
         chosen.pickup_id,chosen.pickup_way_id,chosen.delivery_way_id,chosen.waybill_no,
         chosen.recipient_name,chosen.recipient_phone,chosen.township,chosen.address,
         chosen.cod_amount,chosen.delivery_fee,chosen.parcel_weight_kg,'READY_FOR_DISPATCH',
         coalesce(chosen.metadata,'{}'::jsonb)||jsonb_build_object('wayplan_build','V69','queue_source','be_dispatch_ready_queue_v19/V67_FAST')
  from (
    select s.ord,q.*
    from jsonb_array_elements_text(v_selected) with ordinality s(id,ord)
    join lateral (
      select e.*
      from public.be_wayplan_eligible_rows_v69(v_region) e
      where e.delivery_way_id=s.id or e.waybill_no=s.id
      order by case when e.delivery_way_id=s.id then 0 else 1 end,e.updated_at desc nulls last,e.delivery_way_id
      limit 1
    ) q on true
  ) chosen;

  select count(*),coalesce(sum(cod_amount),0) into v_count,v_cod
  from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  if v_count=0 then
    delete from public.be_wayplan_dispatches where wayplan_id=v_wayplan_id;
    return jsonb_build_object('ok',false,'error','No eligible dispatch-ready stops found.','wayplan_id',v_wayplan_id,'total_stops',0);
  end if;

  update public.be_wayplan_dispatches set total_stops=v_count,total_parcels=v_count,total_cod=v_cod,updated_at=now() where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_membership_v40(
    wayplan_id,delivery_way_id,pickup_id,route_zone,membership_status,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,created_by,metadata
  )
  select v_wayplan_id,s.delivery_way_id,s.pickup_id,coalesce(nullif(s.township,''),'UNASSIGNED'),'PLANNED',
         v_vehicle_code,v_vehicle_name,v_rider_code,v_rider_name,v_driver_code,v_driver_name,v_helper_code,v_helper_name,v_actor,
         jsonb_build_object('assignment_mode',case when v_driver_code is not null then 'VEHICLE_CREW' else 'RIDER' end,'helper_optional',true,'build','V69')
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id
  on conflict(wayplan_id,delivery_way_id) do update set
    pickup_id=excluded.pickup_id,route_zone=excluded.route_zone,membership_status='PLANNED',
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,rider_code=excluded.rider_code,rider_name=excluded.rider_name,
    driver_code=excluded.driver_code,driver_name=excluded.driver_name,helper_code=excluded.helper_code,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_membership_v40.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  update public.be_waybill_ledger w set wayplan_id=v_wayplan_id,wayplan_status='WAYPLAN_CREATED',dispatch_status='WAYPLAN_CREATED',updated_at=now()
  where exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id and s.delivery_way_id=w.delivery_way_id);

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan_id,'total_stops',v_count,'total_cod',v_cod,
    'status','WAYPLAN_CREATED','helper_optional',true,'auth_mapping_enforced',true,
    'data_entry_registration_enforced',true,'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_generate_wayplan_emergency_crew_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text:=lower(public.be_current_user_role());
  v_wayplan_id text:=coalesce(nullif(p_payload->>'wayplan_id',''),'WP-'||to_char(now(),'YYYYMMDD-HH24MISS'));
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_branch text:=coalesce(nullif(p_payload->>'branch_code',''),case v_region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end);
  v_vehicle_code text:=nullif(p_payload->>'vehicle_code','');
  v_vehicle_name text:=nullif(p_payload->>'vehicle_name','');
  v_vehicle_mode text:=upper(coalesce(nullif(p_payload->>'vehicle_mode',''),case when upper(coalesce(p_payload->>'vehicle_code','')) in ('MOTORBIKE','BICYCLE') then 'RIDER_ONLY' else 'DRIVER_CREW' end));
  v_driver_name text:=nullif(btrim(p_payload->>'driver_name'),'');
  v_rider_name text:=nullif(btrim(p_payload->>'rider_name'),'');
  v_helper_name text:=nullif(btrim(p_payload->>'helper_name'),'');
  v_reason text:=nullif(btrim(p_payload->>'emergency_substitution_reason'),'');
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  v_selected jsonb:=coalesce(p_payload->'delivery_way_ids','[]'::jsonb);
  v_selected_count int; v_eligible int; v_count int; v_cod numeric;
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') and exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'delivery_way_ids','[]'::jsonb)) x where not public.be_branch_parcel_at_v1(x,public.be_branch_scope_v1(null))) then raise exception 'DESTINATION_RECEIPT_REQUIRED'; end if;
  if exists(select 1 from public.be_wayplan_dispatches w where w.wayplan_id=p_payload->>'wayplan_id') then perform public.be_branch_require_wayplan_v1(p_payload->>'wayplan_id'); end if; p_payload:=p_payload||jsonb_build_object('branch_code',case upper(p_payload->>'region_code') when 'MANDALAY' then 'MDY' when 'YANGON' then 'YGN' when 'NAYPYITAW' then 'NPT' end);
  perform public.be_branch_require_region_v1(p_payload->>'region_code'); if p_payload ? 'branch_code' then perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_role not in ('branch-manager','branch_manager','branch_office_manager','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
    raise exception using errcode='42501',message='Emergency crew substitution requires management/operations Wayplan permission.';
  end if;
  if v_vehicle_mode='RIDER_ONLY' then
    if v_rider_name is null then raise exception 'Emergency Rider is required for Motor Bike/Bicycle.'; end if;
    if v_driver_name is not null or v_helper_name is not null then raise exception 'Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.'; end if;
  else
    if v_driver_name is null then raise exception 'Emergency Driver is required for the selected vehicle.'; end if;
    if v_rider_name is not null then raise exception 'Van/car/truck routes do not use a Rider.'; end if;
  end if;
  if v_reason is null or length(v_reason)<5 then raise exception 'A reason is required for emergency crew substitution.'; end if;
  if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)=0 then raise exception 'Select at least one delivery parcel.'; end if;
  v_selected_count:=jsonb_array_length(v_selected);

  select count(*)::int into v_eligible from public.be_v_dispatch_ready_queue q
  join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
  where d.delivery_region=v_region and d.delivery_route_mode='DOORSTEP_MAP' and d.location_required
    and (q.delivery_way_id in (select jsonb_array_elements_text(v_selected)) or q.waybill_no in (select jsonb_array_elements_text(v_selected)));
  if v_eligible<>v_selected_count then raise exception 'Every selected parcel must be ready and belong to the active Wayplan region.'; end if;

  insert into public.be_wayplan_dispatches(
    wayplan_id,dispatch_batch_no,branch_code,vehicle_code,vehicle_name,
    driver_code,driver_name,rider_code,rider_name,helper_code,helper_name,
    wayplan_status,created_by,metadata
  ) values (
    v_wayplan_id,v_wayplan_id,v_branch,v_vehicle_code,v_vehicle_name,
    null,v_driver_name,null,v_rider_name,null,v_helper_name,
    'CREATED',v_actor,p_payload||jsonb_build_object(
      'build','WAYPLAN_EMERGENCY_CREW_V148','crew_mode','EMERGENCY_MANUAL','vehicle_mode',v_vehicle_mode,
      'emergency_substitution',true,'emergency_substitution_reason',v_reason,
      'rider_app_mapping',false,'manual_crew_warning','Manual emergency Rider has no Rider App account mapping unless separately provisioned.'
    )
  ) on conflict(wayplan_id) do update set
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,
    driver_code=null,driver_name=excluded.driver_name,rider_code=null,rider_name=excluded.rider_name,
    helper_code=null,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_dispatches.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  delete from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  insert into public.be_wayplan_dispatch_stops(
    wayplan_id,stop_sequence,pickup_id,pickup_way_id,delivery_way_id,waybill_no,
    recipient_name,recipient_phone,township,address,cod_amount,delivery_fee,parcel_weight_kg,stop_status,rider_code,rider_name,metadata
  )
  select v_wayplan_id,row_number() over(order by q.township,q.address,q.delivery_way_id),
         q.pickup_id,q.pickup_way_id,q.delivery_way_id,q.waybill_no,q.recipient_name,q.recipient_phone,
         q.township,q.address,q.cod_amount,q.delivery_fee,q.parcel_weight_kg,'READY_FOR_DISPATCH',null,v_rider_name,
         q.metadata||jsonb_build_object('wayplan_build','EMERGENCY_CREW_V1','crew_mode','EMERGENCY_MANUAL')
  from public.be_v_dispatch_ready_queue q
  where q.delivery_way_id in (select jsonb_array_elements_text(v_selected))
     or q.waybill_no in (select jsonb_array_elements_text(v_selected));

  select count(*),coalesce(sum(cod_amount),0) into v_count,v_cod from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  if v_count=0 then delete from public.be_wayplan_dispatches where wayplan_id=v_wayplan_id; raise exception 'No eligible dispatch-ready stops found.'; end if;
  update public.be_wayplan_dispatches set total_stops=v_count,total_parcels=v_count,total_cod=v_cod,updated_at=now() where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_membership_v40(
    wayplan_id,delivery_way_id,pickup_id,route_zone,membership_status,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,created_by,metadata
  )
  select v_wayplan_id,s.delivery_way_id,s.pickup_id,coalesce(nullif(s.township,''),'UNASSIGNED'),'PLANNED',
         v_vehicle_code,v_vehicle_name,null,v_rider_name,null,v_driver_name,null,v_helper_name,v_actor,
         jsonb_build_object('assignment_mode','EMERGENCY_MANUAL','emergency_substitution_reason',v_reason,'build','EMERGENCY_CREW_V1')
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id
  on conflict(wayplan_id,delivery_way_id) do update set
    pickup_id=excluded.pickup_id,route_zone=excluded.route_zone,membership_status='PLANNED',
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,rider_code=null,rider_name=excluded.rider_name,
    driver_code=null,driver_name=excluded.driver_name,helper_code=null,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_membership_v40.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  update public.be_waybill_ledger w set wayplan_id=v_wayplan_id,wayplan_status='WAYPLAN_CREATED',dispatch_status='WAYPLAN_CREATED',updated_at=now()
  where exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id and s.delivery_way_id=w.delivery_way_id);

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'WAYPLAN_EMERGENCY_CREW_SUBSTITUTION','WAYPLAN',v_wayplan_id,
    jsonb_build_object('driver_name',v_driver_name,'rider_name',v_rider_name,'helper_name',v_helper_name,'reason',v_reason,'vehicle_code',v_vehicle_code));

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan_id,'total_stops',v_count,'total_cod',v_cod,'status','WAYPLAN_CREATED','crew_mode','EMERGENCY_MANUAL');
end $function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_visible_queue_v124(p_region_code text DEFAULT 'YANGON'::text, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_route_ready integer := 0;
begin
  perform public.be_branch_require_region_v1(p_region_code);
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;

  with base as (
    select
      d.delivery_way_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_merchant_name',''),nullif(d.merchant_id,''),'') as merchant_name,
      nullif(d.merchant_id,'') as merchant_code,
      coalesce(d.recipient_name,'') as recipient_name,
      coalesce(d.contact_no_1,'') as recipient_phone,
      coalesce(d.township,'') as township,
      coalesce(d.recipient_address,'') as address,
      coalesce(d.cod_amount,0) as cod_amount,
      coalesce(d.delivery_fee,0) as delivery_fee,
      coalesce(d.weight_kg,0) as parcel_weight_kg,
      'READY_FOR_DISPATCH'::text as dispatch_status,
      r.warehouse_status,
      coalesce(nullif(d.way_management_status,''),'READY_FOR_WAYPLAN') as wayplan_status,
      coalesce(d.updated_at,d.saved_at,d.created_at,now()) as created_at,
      d.delivery_region,
      d.delivery_route_mode,
      d.location_required,
      coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code,
      loc.latitude,
      loc.longitude,
      loc.review_status as location_review_status,
      loc.match_level as location_match_level,
      loc.coordinate_source as location_coordinate_source,
      (
        d.delivery_route_mode='DOORSTEP_MAP'
        and coalesce(d.location_required,false)
        and loc.review_status='ACCEPTED'
        and loc.latitude between 9 and 29
        and loc.longitude between 92 and 102
        and (
          upper(coalesce(loc.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
          or (
            upper(coalesce(loc.coordinate_source,'')) ~ '^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$'
            and loc.match_level in ('ADDRESS_EXACT','POI_EXACT')
          )
          or (
            upper(coalesce(loc.coordinate_source,'')) = 'POSTAL_WARD_DEFAULT_V136'
            and loc.match_level = 'POSTAL_DEFAULT'
          )
          or (
            upper(coalesce(loc.coordinate_source,'')) = 'TOWNSHIP_DEFAULT_V136'
            and loc.match_level = 'TOWNSHIP_DEFAULT'
          )
        )
        and loc.coordinate_source<>'QUARANTINED_BULK_COORDINATE_V30'
        and not (round(loc.latitude::numeric,5)=16.80000 and round(loc.longitude::numeric,5)=96.15000)
        and (
          loc.match_level in ('ADDRESS_EXACT','POI_EXACT','POSTAL_DEFAULT','TOWNSHIP_DEFAULT')
          or (
            loc.match_level='MANUAL'
            and loc.coordinate_source in (
              'DATA_ENTRY_MANUAL_PIN_V30','DATA_ENTRY_MANUAL_COORDINATE',
              'PASTED_TOWNSHIP_VALIDATED_COORDINATE','MANAGEMENT_POSTAL_VALIDATED_ADDRESS'
            )
          )
        )
      ) as route_ready
    from public.be_data_entry_parcel_details d
    join public.be_warehouse_receipts_v36 r
      on r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
    left join public.be_delivery_location_registry loc
      on loc.delivery_way_id=d.delivery_way_id
    where (replace(public.be_current_role(),'-','_') not in ('branch_manager','branch_office_manager') or public.be_branch_parcel_at_v1(d.delivery_way_id,public.be_branch_scope_v1(null))) and d.delivery_region=v_region
      and upper(coalesce(r.warehouse_status,''))='WAREHOUSE_READY'
      and upper(coalesce(d.financial_validation_status,'')) in ('VALID','OK')
      and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
      and not exists (
        select 1 from public.be_wayplan_membership_v40 m
        where m.delivery_way_id=d.delivery_way_id
          and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      )
  ),
  limited as (
    select * from base
    order by created_at desc, delivery_way_id
    limit greatest(coalesce(p_limit,10000),1)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'delivery_way_id',delivery_way_id,
      'waybill_no',waybill_no,
      'pickup_id',pickup_id,
      'pickup_way_id',pickup_id,
      'merchant_name',merchant_name,
      'merchant_code',merchant_code,
      'recipient_name',recipient_name,
      'recipient_phone',recipient_phone,
      'township',township,
      'address',address,
      'cod_amount',cod_amount,
      'delivery_fee',delivery_fee,
      'parcel_weight_kg',parcel_weight_kg,
      'dispatch_status',dispatch_status,
      'warehouse_status',warehouse_status,
      'wayplan_status',wayplan_status,
      'created_at',created_at,
      'delivery_region',delivery_region,
      'delivery_route_mode',delivery_route_mode,
      'location_required',location_required,
      'service_provider_code',service_provider_code,
      'latitude',latitude,
      'longitude',longitude,
      'route_ready',route_ready,
      'route_block_reason',case when route_ready then null else 'LOCATION_PENDING' end,
      'location_review_status',location_review_status,
      'location_match_level',location_match_level,
      'location_coordinate_source',location_coordinate_source
    ) order by created_at desc, delivery_way_id),'[]'::jsonb),
    count(*)::integer,
    count(*) filter (where route_ready)::integer
  into v_rows,v_total,v_route_ready
  from limited;

  return jsonb_build_object(
    'ok',true,
    'region_code',v_region,
    'queue',v_rows,
    'count',v_total,
    'route_ready_count',v_route_ready,
    'location_pending_count',greatest(v_total-v_route_ready,0),
    'build','WAYPLAN_VISIBLE_QUEUE_V136_GENERIC_DEFAULTS_20260924'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.be_multi_van_queue(p_region text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_queue jsonb;
begin
  perform public.be_branch_require_region_v1(p_region);
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  v_queue:=public.be_dispatch_ready_queue_v71(10000,p_region);
  return v_queue||jsonb_build_object('build','MULTI_VAN_QUEUE_V71_RESCHEDULE_DATE');
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_command_center(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rows jsonb;
begin
  perform public.be_branch_scope_v1(null);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select * from public.be_v_wayplan_command_center
    where public.be_branch_wayplan_allowed_v1(wayplan_id) and created_at >= public.be_golive_live_cutoff_v1()
      and not public.be_is_pre_golive_uat_key_v1(wayplan_id)
      and not (
        upper(coalesce(wayplan_status,''))='CANCELLED'
        and coalesce((metadata->>'operational_delete_v47')::boolean,false)
      )
    order by created_at desc
    limit greatest(coalesce(p_limit,100),1)
  ) x;
  return jsonb_build_object(
    'ok',true,'wayplans',v_rows,'count',jsonb_array_length(v_rows),
    'source','be_wayplan_command_center','pre_golive_uat_isolated',true,
    'operator_deleted_hidden',true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_supervisor_list_v62()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with rows as (
  select
    d.branch_code,d.wayplan_id,
    d.wayplan_status,
    d.total_stops,
    d.total_parcels,
    d.vehicle_code,
    d.vehicle_name,
    d.driver_code,
    d.driver_name,
    d.rider_code,
    d.rider_name,
    d.helper_code,
    d.helper_name,
    d.created_at,
    d.updated_at,
    coalesce(r.review_status,'DRAFT') as review_status,
    coalesce(r.revision_no,1) as revision_no,
    r.review_notes,
    r.rejection_reason,
    r.submitted_at,
    r.reviewed_at,
    r.dispatch_ready_at,
    r.dispatched_at,
    coalesce(m.parcel_count,0) as parcel_count,
    coalesce(m.planned_count,0) as planned_count,
    coalesce(m.ready_count,0) as ready_count,
    coalesce(m.dispatched_count,0) as dispatched_count,
    coalesce(m.held_count,0) as held_count
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  left join lateral (
    select
      count(*)::integer as parcel_count,
      count(*) filter(where membership_status='PLANNED')::integer as planned_count,
      count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer as ready_count,
      count(*) filter(where membership_status='DISPATCHED')::integer as dispatched_count,
      count(*) filter(where membership_status in ('ON_HOLD','RTO'))::integer as held_count
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id=d.wayplan_id
      and m.membership_status not in ('CANCELLED','COMPLETED')
  ) m on true
  where public.be_branch_wayplan_allowed_v1(d.wayplan_id) and upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED')
    and coalesce(m.parcel_count,0)>0
)
select jsonb_build_object(
  'ok',true,
  'build','SUPERVISOR_WAYPLAN_V62_FAST_LIST',
  'stats',jsonb_build_object(
    'wayplans',count(*)::integer,
    'pending_review',count(*) filter(where review_status='PENDING_REVIEW')::integer,
    'approved',count(*) filter(where review_status='APPROVED')::integer,
    'dispatch_ready',count(*) filter(where review_status='DISPATCH_READY')::integer,
    'dispatched',count(*) filter(where review_status='DISPATCHED')::integer,
    'parcels',coalesce(sum(parcel_count),0)::integer
  ),
  'wayplans',coalesce(jsonb_agg(to_jsonb(rows) order by
    case review_status when 'PENDING_REVIEW' then 1 when 'DRAFT' then 2 when 'APPROVED' then 3 when 'DISPATCH_READY' then 4 when 'DISPATCHED' then 5 else 6 end,
    updated_at desc
  ),'[]'::jsonb)
)
from rows;
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_supervisor_detail_v62(p_wayplan_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with header as (
  select
    d.branch_code,d.wayplan_id,
    d.wayplan_status,
    d.vehicle_code,d.vehicle_name,
    d.driver_code,d.driver_name,
    d.rider_code,d.rider_name,
    d.helper_code,d.helper_name,
    coalesce(r.review_status,'DRAFT') as review_status,
    coalesce(r.revision_no,1) as revision_no,
    r.review_notes,r.rejection_reason,
    r.submitted_at,r.reviewed_at,r.dispatch_ready_at,r.dispatched_at
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  where d.wayplan_id=p_wayplan_id and public.be_branch_wayplan_allowed_v1(d.wayplan_id)
), stops as (
  select
    s.stop_sequence,
    s.delivery_way_id,
    coalesce(s.recipient_name,p.recipient_name) as recipient_name,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) as recipient_phone,
    coalesce(s.township,s.delivery_township,s.recipient_township,p.township) as township,
    coalesce(s.address,s.delivery_address,p.recipient_address) as recipient_address,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0) as cod_amount,
    coalesce(s.parcel_weight_kg,p.weight_kg,0) as weight_kg,
    coalesce(m.membership_status,'') as membership_status,
    coalesce(s.warehouse_status,p.warehouse_status,'') as warehouse_status,
    coalesce(s.scan_count,0) as scan_count,
    (coalesce(s.scan_count,0)>0) as dispatch_scanned
  from public.be_wayplan_dispatch_stops s
  left join public.be_wayplan_membership_v40 m
    on m.wayplan_id=s.wayplan_id and m.delivery_way_id=s.delivery_way_id
  left join public.be_data_entry_parcel_details p
    on p.delivery_way_id=s.delivery_way_id
  where s.wayplan_id=p_wayplan_id and public.be_branch_wayplan_allowed_v1(s.wayplan_id)
), blocked as (
  select count(*)::integer as n
  from stops
  where membership_status in ('ON_HOLD','RTO')
     or upper(coalesce(warehouse_status,'')) not in ('WAREHOUSE_READY','READY_FOR_DISPATCH')
)
select jsonb_build_object(
  'ok',true,
  'build','SUPERVISOR_WAYPLAN_V62_FAST_DETAIL',
  'wayplan',coalesce((select to_jsonb(header) from header),'{}'::jsonb)
    || jsonb_build_object(
      'blocked_count',coalesce((select n from blocked),0),
      'parcel_count',(select count(*) from stops),
      'stops',coalesce((select jsonb_agg(to_jsonb(stops) order by stop_sequence,delivery_way_id) from stops),'[]'::jsonb)
    )
);
$function$;

CREATE OR REPLACE FUNCTION public.be_multi_van_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
  perform public.be_branch_scope_v1(null);
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('branch-manager','branch_manager','branch_office_manager','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
   raise exception using errcode='42501',message='Wayplan operator permission is required.';
 end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg',
   'operation_type',payload->>'operation_type','branch_code',payload->>'branch_code',
   'zone_code',payload->>'zone_code','zone_name',payload->>'zone_name','vehicle_mode','DRIVER_CREW'
 ) order by record_key),'[]'::jsonb)
 into v_vehicles from public.be_master_data_rows
 where (public.be_branch_scope_v1(null) is null or payload->>'branch_code'=public.be_branch_scope_v1(null)) and dataset_key='fleet_master' and deleted_at is null and upper(coalesce(status,'ACTIVE'))='ACTIVE'
   and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
   and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');

 v_vehicles:=coalesce(v_vehicles,'[]'::jsonb)||jsonb_build_array(
   jsonb_build_object('id','MOTORBIKE','name','Motor Bike','capacity_kg',0,'operation_type','DELIVERY','branch_code','','vehicle_mode','RIDER_ONLY','virtual',true),
   jsonb_build_object('id','BICYCLE','name','Bicycle','capacity_kg',0,'operation_type','DELIVERY','branch_code','','vehicle_mode','RIDER_ONLY','virtual',true)
 );

 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb)
 into v_busy from public.be_wayplan_dispatches where public.be_branch_wayplan_allowed_v1(wayplan_id) and upper(coalesce(wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb)
 into v_route_origins from public.be_branch_offices
 where (public.be_branch_scope_v1(null) is null or branch_code=public.be_branch_scope_v1(null)) and branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins,'crew_busy_scope','DISPATCHED_OR_ON_HOLD_ONLY','vehicle_selection_first',true,'build','WAYPLAN_VEHICLE_DRIVEN_CREW_V148');
end
$function$;

CREATE OR REPLACE FUNCTION public.be_wayplan_assignment_options_v44()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_drivers jsonb:='[]'::jsonb;
  v_riders jsonb:='[]'::jsonb;
  v_helpers jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  v_base:=public.be_wayplan_assignment_options_v44_legacy_20260826();

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','DRIVER','label','🚚 '||a.display_name,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.driver_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='DRIVER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_drivers
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='DRIVER' and a.active and (public.be_branch_scope_v1(null) is null or upper(a.branch_code)=public.be_branch_scope_v1(null));

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','RIDER','label','🚴 '||a.display_name,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.rider_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='RIDER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_riders
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='RIDER' and a.active and (public.be_branch_scope_v1(null) is null or upper(a.branch_code)=public.be_branch_scope_v1(null));

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','HELPER','label','📦 '||a.display_name,
    'acting_as_helper',false,'manageable_as_helper',true,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.helper_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='HELPER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_helpers
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='HELPER' and a.active and (public.be_branch_scope_v1(null) is null or upper(a.branch_code)=public.be_branch_scope_v1(null));

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'ok',true,'build','WAYPLAN_ASSIGNMENT_ROSTER_V68',
    'drivers',v_drivers,'riders',v_riders,'helpers',v_helpers,'helper_master',v_helpers,
    'helper_optional',true,'roster_source','ATTACHED_OPERATIONAL_SPREADSHEETS',
    'counts',jsonb_build_object(
      'active_drivers',jsonb_array_length(v_drivers),
      'active_riders',jsonb_array_length(v_riders),
      'active_helpers',jsonb_array_length(v_helpers)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_branch_office_snapshot(p_branch_code text DEFAULT NULL::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_branches jsonb := '[]'::jsonb;
  v_staff jsonb := '[]'::jsonb;
  v_shipments jsonb := '[]'::jsonb;
  v_amendments jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  p_branch_code:=public.be_branch_scope_v1(p_branch_code);
  select coalesce(jsonb_agg(to_jsonb(b) order by b.branch_code), '[]'::jsonb)
  into v_branches
  from public.be_branch_offices b
  where p_branch_code is null or b.branch_code = p_branch_code;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.branch_code, s.employee_name), '[]'::jsonb)
  into v_staff
  from (
    select
      coalesce(branch_code, 'YGN') as branch_code,
      employee_id,
      coalesce(employee_name, employee_id, email) as employee_name,
      role_id,
      department,
      phone,
      email,
      status,
      created_at,
      updated_at
    from public.be_branch_staff
    where p_branch_code is null or branch_code = p_branch_code

    union all

    select
      coalesce(branch_code, 'YGN') as branch_code,
      employee_id,
      coalesce(full_name, display_name, name, email, employee_id) as employee_name,
      coalesce(role_id, app_role) as role_id,
      department,
      phone_e164 as phone,
      email,
      status,
      created_at,
      updated_at
    from public.be_employee_master
    where coalesce(is_active, true) = true
      and (p_branch_code is null or branch_code = p_branch_code)

    limit greatest(coalesce(p_limit, 300), 1)
  ) s;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_shipments
  from (
    select bs.*
    from public.be_branch_shipments bs
    where p_branch_code is null or bs.branch_code = p_branch_code
    order by bs.created_at desc nulls last
    limit greatest(coalesce(p_limit, 300), 1)
  ) x;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  into v_amendments
  from (
    select *
    from public.be_branch_amendment_requests
    where p_branch_code is null
       or coalesce(branch_code, branch_id::text, 'YGN') = p_branch_code
    order by created_at desc nulls last
    limit 100
  ) a;

  select jsonb_build_object(
    'branches', coalesce(jsonb_array_length(v_branches), 0),
    'active_branches', (
      select count(*)
      from public.be_branch_offices
      where (p_branch_code is null or branch_code = p_branch_code)
        and coalesce(status, 'Active') = 'Active'
    ),
    'staff', coalesce(jsonb_array_length(v_staff), 0),
    'shipments', coalesce(jsonb_array_length(v_shipments), 0),
    'pending_shipments', (
      select count(*)
      from jsonb_array_elements(v_shipments) x
      where coalesce(x->>'shipment_status', '') not in ('DELIVERED','CANCELLED','RETURNED')
    ),
    'cod_total', (
      select coalesce(sum(coalesce(nullif(x->>'cod_amount', '')::numeric, 0)), 0)
      from jsonb_array_elements(v_shipments) x
    ),
    'pending_amendments', (
      select count(*)
      from public.be_branch_amendment_requests
      where (p_branch_code is null or coalesce(branch_code, branch_id::text, 'YGN') = p_branch_code)
        and coalesce(approval_status, 'PENDING') = 'PENDING'
    )
  )
  into v_summary;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_branch_office_snapshot',
    'summary', coalesce(v_summary, '{}'::jsonb),
    'branches', coalesce(v_branches, '[]'::jsonb),
    'staff', coalesce(v_staff, '[]'::jsonb),
    'shipments', coalesce(v_shipments, '[]'::jsonb),
    'amendments', coalesce(v_amendments, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_branch_amendment_request(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_branch_code text := coalesce(p_payload->>'branch_code', 'YGN');
  v_request_type text := coalesce(p_payload->>'request_type', 'SHIPMENT_AMENDMENT');
  v_target_table text := nullif(p_payload->>'target_table', '');
  v_target_id text := nullif(p_payload->>'target_id', '');
  v_requested_data jsonb := coalesce(p_payload->'requested_data', '{}'::jsonb);
  v_old_data jsonb := coalesce(p_payload->'old_data', '{}'::jsonb);
  v_actor text := nullif(p_payload->>'actor_email', '');
  v_reason text := nullif(p_payload->>'remarks', '');
  v_id uuid;
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then v_branch_code:=public.be_branch_scope_v1(p_payload->>'branch_code'); else perform public.be_branch_scope_v1(p_payload->>'branch_code'); end if;
  insert into public.be_branch_amendment_requests (
    branch_code,
    request_type,
    target_table,
    target_id,
    old_data,
    requested_data,
    approval_status,
    requested_by,
    remarks
  )
  values (
    v_branch_code,
    v_request_type,
    v_target_table,
    v_target_id,
    v_old_data,
    v_requested_data,
    'PENDING',
    v_actor,
    v_reason
  )
  returning id into v_id;

  insert into public.be_governance_audit_log (
    module,
    action,
    ref_table,
    ref_id,
    actor_email,
    after_data,
    metadata
  )
  values (
    'BRANCH_OFFICE',
    'AMENDMENT_REQUESTED',
    v_target_table,
    v_target_id,
    v_actor,
    v_requested_data,
    jsonb_build_object('amendment_id', v_id, 'branch_code', v_branch_code)
  );

  return jsonb_build_object(
    'ok', true,
    'amendment_id', v_id,
    'approval_status', 'PENDING'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_branch_amendment_decide(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := nullif(p_payload->>'amendment_id', '')::uuid;
  v_decision text := upper(coalesce(p_payload->>'decision', 'APPROVED'));
  v_actor text := nullif(p_payload->>'actor_email', '');
  v_role text := lower(coalesce(p_payload->>'actor_role', 'admin'));
  v_note text := nullif(p_payload->>'decision_note', '');
  v_ctx jsonb;
  v_req record;
  v_updated integer := 0;
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager','branch_staff','branch_office') then raise exception 'HEAD_OFFICE_APPROVAL_REQUIRED'; end if;
  v_ctx := public.be_require_admin(v_actor, v_role);

  if v_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED';
  end if;

  select *
  into v_req
  from public.be_branch_amendment_requests
  where id = v_id
  for update;

  if not found then
    raise exception 'Amendment request not found: %', v_id;
  end if;

  if coalesce(v_req.approval_status, 'PENDING') <> 'PENDING' then
    return jsonb_build_object(
      'ok', true,
      'amendment_id', v_id,
      'approval_status', v_req.approval_status,
      'message', 'Already decided',
      'actor', v_ctx
    );
  end if;

  update public.be_branch_amendment_requests
  set
    approval_status = v_decision,
    approved_by = coalesce(v_actor, v_ctx->>'email'),
    approved_at = now(),
    remarks = coalesce(v_note, remarks),
    updated_at = now()
  where id = v_id;

  if v_decision = 'APPROVED' then
    if v_req.target_table = 'be_branch_shipments' then
      update public.be_branch_shipments
      set
        recipient_name = coalesce(v_req.requested_data->>'recipient_name', recipient_name),
        recipient_phone = coalesce(v_req.requested_data->>'recipient_phone', recipient_phone),
        township = coalesce(v_req.requested_data->>'township', township),
        address = coalesce(v_req.requested_data->>'address', address),
        shipment_status = coalesce(v_req.requested_data->>'shipment_status', shipment_status),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'last_amendment_id', v_id,
          'amended_by', coalesce(v_actor, v_ctx->>'email'),
          'amended_at', now()
        ),
        updated_at = now()
      where id::text = v_req.target_id
         or delivery_way_id = v_req.target_id
         or waybill_no = v_req.target_id
         or tracking_no = v_req.target_id;

      get diagnostics v_updated = row_count;
    end if;

    if v_req.target_table = 'be_master_entity_records' then
      update public.be_master_entity_records
      set
        data = coalesce(data, '{}'::jsonb) || v_req.requested_data,
        updated_by = coalesce(v_actor, v_ctx->>'email'),
        updated_at = now()
      where id::text = v_req.target_id
         or entity_code = v_req.target_id;

      get diagnostics v_updated = row_count;
    end if;
  end if;

  insert into public.be_governance_audit_log (
    module,
    action,
    ref_table,
    ref_id,
    actor_email,
    before_data,
    after_data,
    metadata
  )
  values (
    'BRANCH_OFFICE',
    'AMENDMENT_' || v_decision,
    v_req.target_table,
    v_req.target_id,
    coalesce(v_actor, v_ctx->>'email'),
    v_req.old_data,
    v_req.requested_data,
    jsonb_build_object(
      'amendment_id', v_id,
      'updated_rows', v_updated,
      'decision_note', v_note
    )
  );

  return jsonb_build_object(
    'ok', true,
    'amendment_id', v_id,
    'approval_status', v_decision,
    'updated_rows', v_updated,
    'actor', v_ctx
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_warehouse_dispatch_scan(p_tracking_no text, p_actor_email text DEFAULT NULL::text, p_warehouse_code text DEFAULT 'YGN-MAIN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text;
  v_actor text;
  v_way text:=nullif(btrim(coalesce(p_tracking_no,'')),'');
  v_wayplan text;
  v_review_status text;
  v_membership_status text;
  v_stage jsonb;
  v_result jsonb;
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then v_role:=public.be_current_role(); perform public.be_branch_scope_v1(null); else v_role:=public.be_warehouse_assert_internal(); end if;
  v_actor:=public.be_warehouse_actor_email();
  if v_way is null then raise exception 'Delivery Way ID is required'; end if;

  v_stage:=public.be_warehouse_dispatch_scan_state_v75(v_way);
  if coalesce((v_stage->>'dispatch_scan_allowed')::boolean,false) is not true then
    raise exception '%',
      coalesce(
        nullif(v_stage->>'dispatch_scan_instruction',''),
        'This parcel is not currently released for Dispatch Scan.'
      )
      using errcode='22023';
  end if;

  v_wayplan:=v_stage->>'active_wayplan_id';
  perform public.be_branch_require_wayplan_v1(v_wayplan); v_review_status:=v_stage->>'supervisor_review_status';
  v_membership_status:=v_stage->>'membership_status';

  if v_wayplan is null
     or upper(coalesce(v_review_status,''))<>'DISPATCH_READY'
     or upper(coalesce(v_membership_status,''))<>'READY_FOR_DISPATCH' then
    raise exception 'Dispatch Scan blocked. Supervisor DISPATCH_READY release is required.' using errcode='22023';
  end if;

  v_result:=public.be_dispatch_scan_parcel_v39(v_way,v_wayplan,v_actor);

  update public.be_wayplan_items
     set dispatch_scan_at=now(),
         dispatch_scan_by=v_actor,
         dispatch_scan_code=coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
         warehouse_scan_status='DISPATCH_SCANNED',
         updated_at=now()
   where tracking_no=v_way or delivery_way_id=v_way;

  update public.be_dispatch_job_assignments
     set dispatch_scan_at=now(),
         updated_by_email=v_actor,
         updated_at=now()
   where tracking_no in (v_way,public.be_operational_way_id_v70(v_way));

  return v_result||jsonb_build_object(
    'ok',true,
    'tracking_no',v_way,
    'operational_way_id',public.be_operational_way_id_v70(v_way),
    'wayplan_code',v_wayplan,
    'dispatch_scan_at',now(),
    'dispatch_workflow_stage','DISPATCH_SCANNED',
    'actor_email',v_actor,
    'authorized_role',v_role,
    'build','WAREHOUSE_DISPATCH_GATE_V75'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_dispatch_scan_parcel_v39(p_way_id text, p_wayplan_code text DEFAULT NULL::text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_actor text;
begin
  if replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager') then perform public.be_branch_require_wayplan_v1(p_wayplan_code); v_role:=public.be_current_role(); else v_role := public.be_warehouse_assert_internal(); end if;
  v_actor := public.be_warehouse_actor_email();
  return public.be_dispatch_scan_parcel_v39_legacy_20260823(
    p_way_id,p_wayplan_code,v_actor
  ) || jsonb_build_object('authorized_role',v_role,'actor_email',v_actor,'auth_enforced',true);
end;
$function$;
notify pgrst, 'reload schema';
