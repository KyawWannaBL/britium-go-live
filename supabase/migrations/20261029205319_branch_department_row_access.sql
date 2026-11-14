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
