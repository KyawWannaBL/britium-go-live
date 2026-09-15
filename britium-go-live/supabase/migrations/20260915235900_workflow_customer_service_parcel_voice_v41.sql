-- V41 Customer Voice workflow transitions and authority controls.

alter table public.be_customer_voice_escalations
  add column if not exists requested_department text;

create or replace function public.be_cs_voice_transition_authorized(
  p_voice_id uuid,
  p_allow_customer_service boolean default false
) returns boolean
language plpgsql
stable security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_voice public.be_customer_voices%rowtype;
  v_department text := public.be_cs_actor_department();
begin
  if auth.uid() is null then return false; end if;
  select * into v_voice from public.be_customer_voices where id=p_voice_id;
  if not found then return false; end if;
  if not public.be_cs_can_access_delivery_way(v_voice.delivery_way_id,'read') then return false; end if;
  if v_department='superadmin' then return true; end if;
  if p_allow_customer_service and v_department='customer_service' then return true; end if;
  return v_department=v_voice.current_department;
end;
$$;

create or replace function public.be_cs_mark_customer_voice_seen(p_voice_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype;
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,false) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('OPEN','ROUTED','REOPENED','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='SEEN' where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'SEEN',v.workflow_status,'SEEN',v.current_department,v.current_department,'Receiving department viewed the Customer Voice');
  update public.be_customer_voice_notifications set status=case when status in ('QUEUED','PENDING') then 'SENT' else status end, sent_at=coalesce(sent_at,now())
   where customer_voice_id=p_voice_id and department=v.current_department;
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','SEEN');
end;
$$;

create or replace function public.be_cs_acknowledge_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype;
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,false) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('OPEN','ROUTED','SEEN','REOPENED','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='ACKNOWLEDGED' where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'ACKNOWLEDGED',v.workflow_status,'ACKNOWLEDGED',v.current_department,v.current_department,nullif(btrim(coalesce(p_note,'')),''));
  update public.be_customer_voice_notifications set status=case when status in ('QUEUED','PENDING') then 'SENT' else status end, sent_at=coalesce(sent_at,now())
   where customer_voice_id=p_voice_id and department=v.current_department;
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','ACKNOWLEDGED');
end;
$$;

create or replace function public.be_cs_update_customer_voice_action(p_voice_id uuid,p_action_note text,p_status text)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype; v_status text:=upper(btrim(coalesce(p_status,''))); v_note text:=btrim(coalesce(p_action_note,''));
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,false) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  if v_note='' then raise exception 'ACTION_NOTE_REQUIRED' using errcode='22023'; end if;
  if v_status not in ('IN_PROGRESS','ACTION_TAKEN') then raise exception 'INVALID_ACTION_STATUS' using errcode='22023'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('SEEN','ACKNOWLEDGED','IN_PROGRESS','ACTION_TAKEN','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status=v_status where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,v_status,v.workflow_status,v_status,v.current_department,v.current_department,v_note);
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status',v_status);
end;
$$;

create or replace function public.be_cs_resolve_customer_voice(p_voice_id uuid,p_resolution_note text)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype; v_note text:=btrim(coalesce(p_resolution_note,''));
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,false) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  if v_note='' then raise exception 'RESOLUTION_NOTE_REQUIRED' using errcode='22023'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('ACKNOWLEDGED','IN_PROGRESS','ACTION_TAKEN','ESCALATED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='RESOLVED',resolution_status='RESOLVED' where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'RESOLVED',v.workflow_status,'RESOLVED',v.current_department,v.current_department,v_note);
  update public.be_customer_voice_escalations set resolved_at=coalesce(resolved_at,now()),resolution_note=coalesce(resolution_note,v_note)
   where customer_voice_id=p_voice_id and resolved_at is null;
  insert into public.be_customer_voice_notifications(customer_voice_id,department,channel,status,notification_payload)
  values(p_voice_id,'customer_service','in_app','QUEUED',jsonb_build_object('event','CUSTOMER_VOICE_RESOLVED','resolution_note',v_note));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','RESOLVED');
end;
$$;

create or replace function public.be_cs_confirm_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype;
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,true) or public.be_cs_actor_department() not in ('customer_service','superadmin') then raise exception 'CUSTOMER_SERVICE_CONFIRM_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status<>'RESOLVED' then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='CS_CONFIRMED',resolution_status='CS_CONFIRMED' where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'CS_CONFIRMED',v.workflow_status,'CS_CONFIRMED',v.current_department,v.current_department,nullif(btrim(coalesce(p_note,'')),''));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','CS_CONFIRMED');
end;
$$;

create or replace function public.be_cs_close_customer_voice(p_voice_id uuid,p_note text default null)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype;
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,true) or public.be_cs_actor_department() not in ('customer_service','superadmin') then raise exception 'CUSTOMER_SERVICE_CLOSE_REQUIRED' using errcode='42501'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('RESOLVED','CS_CONFIRMED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='CLOSED',resolution_status='CLOSED',closed_at=now() where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'CLOSED',v.workflow_status,'CLOSED',v.current_department,v.current_department,nullif(btrim(coalesce(p_note,'')),''));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','CLOSED');
end;
$$;

create or replace function public.be_cs_escalate_customer_voice(p_voice_id uuid,p_reason text,p_requested_department text default null)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_requested text:=nullif(lower(btrim(coalesce(p_requested_department,''))),'');
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,true) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  if v_reason='' then raise exception 'ESCALATION_REASON_REQUIRED' using errcode='22023'; end if;
  if v_requested is not null and v_requested not in ('operations','data_entry','warehouse','finance','pickup_supervisor') then raise exception 'INVALID_REQUESTED_DEPARTMENT' using errcode='22023'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status in ('CLOSED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  insert into public.be_customer_voice_escalations(customer_voice_id,reason,severity,requested_department)
  values(p_voice_id,v_reason,case when v.priority='urgent' then 'urgent' else 'high' end,v_requested);
  update public.be_customer_voices set workflow_status='ESCALATED' where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note,action_payload)
  values(p_voice_id,'ESCALATED',v.workflow_status,'ESCALATED',v.current_department,v.current_department,v_reason,jsonb_build_object('requested_department',v_requested));
  insert into public.be_customer_voice_notifications(customer_voice_id,department,channel,status,notification_payload)
  values(p_voice_id,case when v_requested is not null then v_requested else v.current_department end,'in_app','QUEUED',jsonb_build_object('event','CUSTOMER_VOICE_ESCALATED','reason',v_reason,'ownership_changed',false));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','ESCALATED','current_department',v.current_department,'requested_department',v_requested);
end;
$$;

create or replace function public.be_cs_reopen_customer_voice(p_voice_id uuid,p_reason text)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare v public.be_customer_voices%rowtype; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if not public.be_cs_voice_transition_authorized(p_voice_id,true) then raise exception 'CUSTOMER_VOICE_ACTION_DENIED' using errcode='42501'; end if;
  if v_reason='' then raise exception 'REOPEN_REASON_REQUIRED' using errcode='22023'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if v.workflow_status not in ('RESOLVED','CS_CONFIRMED','CLOSED') then raise exception 'INVALID_CUSTOMER_VOICE_STATE' using errcode='22023'; end if;
  update public.be_customer_voices set workflow_status='REOPENED',resolution_status='REOPENED',closed_at=null where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note)
  values(p_voice_id,'REOPENED',v.workflow_status,'REOPENED',v.current_department,v.current_department,v_reason);
  insert into public.be_customer_voice_notifications(customer_voice_id,department,channel,status,notification_payload)
  values(p_voice_id,v.current_department,'in_app','QUEUED',jsonb_build_object('event','CUSTOMER_VOICE_REOPENED','reason',v_reason));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status','REOPENED','current_department',v.current_department);
end;
$$;

create or replace function public.be_cs_superadmin_override_route(p_voice_id uuid,p_new_department text,p_reason text)
returns jsonb
language plpgsql security definer
set search_path=public,auth,pg_temp
as $$
declare
  v public.be_customer_voices%rowtype;
  v_role text:=public.be_cs_normalize_role(coalesce(public.be_current_user_role(),public.be_current_role(),''));
  v_department text:=lower(btrim(coalesce(p_new_department,'')));
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('super_admin','superadmin','app_owner','sys') then
    raise exception 'SUPERADMIN_OVERRIDE_REQUIRED' using errcode='42501';
  end if;
  if v_reason='' then raise exception 'OVERRIDE_REASON_REQUIRED' using errcode='22023'; end if;
  if v_department not in ('operations','data_entry','warehouse','finance','pickup_supervisor') then raise exception 'INVALID_ROUTE_DEPARTMENT' using errcode='22023'; end if;
  select * into v from public.be_customer_voices where id=p_voice_id for update;
  if not found then raise exception 'CUSTOMER_VOICE_NOT_FOUND' using errcode='P0002'; end if;
  if v.current_department=v_department then raise exception 'ROUTE_ALREADY_ASSIGNED' using errcode='22023'; end if;
  update public.be_customer_voices set current_department=v_department where id=p_voice_id;
  insert into public.be_customer_voice_actions(customer_voice_id,action_type,from_status,to_status,from_department,to_department,action_note,action_payload)
  values(p_voice_id,'SUPERADMIN_ROUTE_OVERRIDE',v.workflow_status,v.workflow_status,v.current_department,v_department,v_reason,jsonb_build_object('override',true,'old_department',v.current_department,'new_department',v_department));
  insert into public.be_customer_voice_notifications(customer_voice_id,department,channel,status,notification_payload)
  values(p_voice_id,v_department,'in_app','QUEUED',jsonb_build_object('event','CUSTOMER_VOICE_ROUTE_OVERRIDDEN','reason',v_reason,'old_department',v.current_department));
  return jsonb_build_object('ok',true,'voice_id',p_voice_id,'workflow_status',v.workflow_status,'old_department',v.current_department,'current_department',v_department);
end;
$$;

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
