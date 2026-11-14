-- V41 phase 3: workflow transitions, escalation, reopen, and Superadmin-only route override.

create or replace function public.be_cs_role_can_process_department(p_role text, p_department text)
returns boolean
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_department, '')))
    when 'operations' then lower(btrim(coalesce(p_role, ''))) in ('operations','operations_admin','dispatcher','dispatch','supervisor','super_admin','superadmin')
    when 'data_entry' then lower(btrim(coalesce(p_role, ''))) in ('data_entry','data_entry_operator','operations','operations_admin','supervisor','super_admin','superadmin')
    when 'warehouse' then lower(btrim(coalesce(p_role, ''))) in ('warehouse','warehouse_operator','warehouse_admin','supervisor','super_admin','superadmin')
    when 'finance' then lower(btrim(coalesce(p_role, ''))) in ('finance','finance_admin','finance_operator','super_admin','superadmin')
    when 'pickup_supervisor' then lower(btrim(coalesce(p_role, ''))) in ('pickup','pickup_supervisor','supervisor','operations','operations_admin','super_admin','superadmin')
    else false
  end
$$;

create or replace function public.be_cs_mark_customer_voice_seen(p_voice_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if not public.be_cs_role_can_process_department(r,v.current_department) then raise exception 'CUSTOMER_VOICE_DEPARTMENT_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v.workflow_status not in ('OPEN','ROUTED','SEEN','ESCALATED','REOPENED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='SEEN',updated_at=now() where id=v.id;
  update public.be_customer_voice_notifications set status='SEEN',seen_at=coalesce(seen_at,now()) where customer_voice_id=v.id and destination_department=v.current_department and status in ('QUEUED','SENT','SEEN');
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,department,actor_id,actor_role,resulting_status) values(v.id,'SEEN',v.current_department,auth.uid(),r,'SEEN');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','SEEN');
end $$;

create or replace function public.be_cs_acknowledge_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if not public.be_cs_role_can_process_department(r,v.current_department) then raise exception 'CUSTOMER_VOICE_DEPARTMENT_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v.workflow_status not in ('ROUTED','SEEN','ESCALATED','REOPENED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='ACKNOWLEDGED',updated_at=now() where id=v.id;
  update public.be_customer_voice_notifications set status='ACKNOWLEDGED',seen_at=coalesce(seen_at,now()),acknowledged_at=coalesce(acknowledged_at,now()) where customer_voice_id=v.id and destination_department=v.current_department and status not in ('RESOLVED');
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,'ACKNOWLEDGED',nullif(btrim(coalesce(p_note,'')),''),v.current_department,auth.uid(),r,'ACKNOWLEDGED');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','ACKNOWLEDGED');
end $$;

create or replace function public.be_cs_update_customer_voice_action(p_voice_id uuid,p_action_note text,p_status text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g')); s text:=upper(btrim(coalesce(p_status,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if btrim(coalesce(p_action_note,''))='' then raise exception 'ACTION_NOTE_REQUIRED'; end if;
  if s not in ('IN_PROGRESS','ACTION_TAKEN') then raise exception 'INVALID_ACTION_STATUS'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if not public.be_cs_role_can_process_department(r,v.current_department) then raise exception 'CUSTOMER_VOICE_DEPARTMENT_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v.workflow_status not in ('ACKNOWLEDGED','IN_PROGRESS','ACTION_TAKEN','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status=s,updated_at=now() where id=v.id;
  update public.be_customer_voice_notifications set status='ACTIONED',actioned_at=coalesce(actioned_at,now()) where customer_voice_id=v.id and destination_department=v.current_department and s='ACTION_TAKEN';
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,s,p_action_note,v.current_department,auth.uid(),r,s);
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status',s);
end $$;

create or replace function public.be_cs_resolve_customer_voice(p_voice_id uuid,p_resolution_note text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if btrim(coalesce(p_resolution_note,''))='' then raise exception 'RESOLUTION_NOTE_REQUIRED'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if not public.be_cs_role_can_process_department(r,v.current_department) then raise exception 'CUSTOMER_VOICE_DEPARTMENT_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v.workflow_status not in ('ACKNOWLEDGED','IN_PROGRESS','ACTION_TAKEN','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='RESOLVED',resolution_status='RESOLVED',updated_at=now() where id=v.id;
  update public.be_customer_voice_notifications set status='RESOLVED',resolved_at=coalesce(resolved_at,now()),actioned_at=coalesce(actioned_at,now()) where customer_voice_id=v.id and destination_department=v.current_department;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,'RESOLVED',p_resolution_note,v.current_department,auth.uid(),r,'RESOLVED');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','RESOLVED');
end $$;

create or replace function public.be_cs_confirm_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if r not in ('customer_service','cs','support','super_admin','superadmin') then raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if v.workflow_status <> 'RESOLVED' then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='CS_CONFIRMED',updated_at=now() where id=v.id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,'CS_CONFIRMED',nullif(btrim(coalesce(p_note,'')),''),v.current_department,auth.uid(),r,'CS_CONFIRMED');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','CS_CONFIRMED');
end $$;

create or replace function public.be_cs_close_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if r not in ('customer_service','cs','support','super_admin','superadmin') then raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if v.workflow_status not in ('CS_CONFIRMED','RESOLVED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='CLOSED',closed_at=now(),updated_at=now() where id=v.id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,'CLOSED',nullif(btrim(coalesce(p_note,'')),''),v.current_department,auth.uid(),r,'CLOSED');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','CLOSED');
end $$;

create or replace function public.be_cs_escalate_customer_voice(p_voice_id uuid,p_reason text,p_requested_department text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'ESCALATION_REASON_REQUIRED'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if not (r in ('customer_service','cs','support','super_admin','superadmin') or public.be_cs_role_can_process_department(r,v.current_department)) then raise exception 'CUSTOMER_VOICE_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v.workflow_status='CLOSED' then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  insert into public.be_customer_voice_escalations(customer_voice_id,escalation_reason,requested_department,status,raised_by) values(v.id,p_reason,nullif(lower(btrim(coalesce(p_requested_department,''))),''),'PENDING',auth.uid());
  update public.be_customer_voices set workflow_status='ESCALATED',updated_at=now() where id=v.id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status,metadata) values(v.id,'ESCALATED',p_reason,v.current_department,auth.uid(),r,'ESCALATED',jsonb_build_object('requested_department',nullif(lower(btrim(coalesce(p_requested_department,''))),''),'ownership_unchanged',true));
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','ESCALATED','current_department',v.current_department);
end $$;

create or replace function public.be_cs_reopen_customer_voice(p_voice_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g'));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if r not in ('customer_service','cs','support','super_admin','superadmin') then raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode='42501'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'REOPEN_REASON_REQUIRED'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if v.workflow_status not in ('RESOLVED','CS_CONFIRMED','CLOSED') then raise exception 'INVALID_CUSTOMER_VOICE_TRANSITION'; end if;
  update public.be_customer_voices set workflow_status='REOPENED',resolution_status=null,closed_at=null,updated_at=now() where id=v.id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status) values(v.id,'REOPENED',p_reason,v.current_department,auth.uid(),r,'REOPENED');
  insert into public.be_customer_voice_notifications(customer_voice_id,destination_department,status,transport_status) values(v.id,v.current_department,'QUEUED','PENDING');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','REOPENED','current_department',v.current_department);
end $$;

create or replace function public.be_cs_superadmin_override_route(p_voice_id uuid,p_new_department text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v public.be_customer_voices%rowtype; r text := lower(regexp_replace(btrim(coalesce(public.be_current_user_role(),public.be_current_role(),'')),'[ _-]+','_','g')); nd text:=lower(btrim(coalesce(p_new_department,''))); oldd text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if r not in ('super_admin','superadmin') then raise exception 'SUPERADMIN_OVERRIDE_REQUIRED' using errcode='42501'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
  if nd not in ('operations','data_entry','warehouse','finance','pickup_supervisor') then raise exception 'INVALID_DESTINATION_DEPARTMENT'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  oldd:=v.current_department;
  if oldd=nd then raise exception 'DESTINATION_DEPARTMENT_UNCHANGED'; end if;
  update public.be_customer_voices set current_department=nd,workflow_status='ROUTED',updated_at=now() where id=v.id;
  update public.be_customer_voice_escalations set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_reason where customer_voice_id=v.id and status='PENDING';
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,action_note,department,actor_id,actor_role,resulting_status,metadata) values(v.id,'SUPERADMIN_ROUTE_OVERRIDE',p_reason,nd,auth.uid(),r,'ROUTED',jsonb_build_object('original_department',oldd,'new_department',nd,'override_reason',p_reason));
  insert into public.be_customer_voice_notifications(customer_voice_id,destination_department,status,transport_status) values(v.id,nd,'QUEUED','PENDING');
  return jsonb_build_object('ok',true,'voice_id',v.id,'workflow_status','ROUTED','original_department',oldd,'current_department',nd,'override_reason',p_reason);
end $$;

revoke all on function public.be_cs_mark_customer_voice_seen(uuid) from public,anon;
revoke all on function public.be_cs_acknowledge_customer_voice(uuid,text) from public,anon;
revoke all on function public.be_cs_update_customer_voice_action(uuid,text,text) from public,anon;
revoke all on function public.be_cs_resolve_customer_voice(uuid,text) from public,anon;
revoke all on function public.be_cs_confirm_customer_voice(uuid,text) from public,anon;
revoke all on function public.be_cs_close_customer_voice(uuid,text) from public,anon;
revoke all on function public.be_cs_escalate_customer_voice(uuid,text,text) from public,anon;
revoke all on function public.be_cs_reopen_customer_voice(uuid,text) from public,anon;
revoke all on function public.be_cs_superadmin_override_route(uuid,text,text) from public,anon;
grant execute on function public.be_cs_mark_customer_voice_seen(uuid) to authenticated;
grant execute on function public.be_cs_acknowledge_customer_voice(uuid,text) to authenticated;
grant execute on function public.be_cs_update_customer_voice_action(uuid,text,text) to authenticated;
grant execute on function public.be_cs_resolve_customer_voice(uuid,text) to authenticated;
grant execute on function public.be_cs_confirm_customer_voice(uuid,text) to authenticated;
grant execute on function public.be_cs_close_customer_voice(uuid,text) to authenticated;
grant execute on function public.be_cs_escalate_customer_voice(uuid,text,text) to authenticated;
grant execute on function public.be_cs_reopen_customer_voice(uuid,text) to authenticated;
grant execute on function public.be_cs_superadmin_override_route(uuid,text,text) to authenticated;
