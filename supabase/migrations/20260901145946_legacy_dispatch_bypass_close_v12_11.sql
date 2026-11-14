create or replace function public.be_dispatch_start_wayplan(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wayplan_id text:=nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_actor text:=nullif(btrim(coalesce(p_payload->>'actor_email',p_payload->>'actor','')),'');
  v_check jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authenticated Dispatch operator is required';
  end if;
  if v_wayplan_id is null then return jsonb_build_object('ok',false,'error','wayplan_id is required'); end if;
  v_check:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan_id,null,null,null);
  if not coalesce((v_check->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'error','DISPATCH_BLOCKED_V12_11','wayplan_id',v_wayplan_id,'integrity',v_check,'next_step','Complete supervisor approval, valid workforce assignment, and mandatory parcel scanning.');
  end if;
  return public.be_dispatch_publish_wayplan_v43(v_wayplan_id,v_actor);
end;
$$;

create or replace function public.be_wayplan_update_status(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wayplan_id text:=nullif(p_payload->>'wayplan_id','');
  v_status text:=upper(coalesce(nullif(p_payload->>'status',''),''));
  v_actor text:=coalesce(nullif(p_payload->>'actor',''),'wayplan_command_center');
  v_check jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;
  if v_wayplan_id is null then return jsonb_build_object('ok',false,'error','wayplan_id is required'); end if;
  if v_status not in ('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED') then
    return jsonb_build_object('ok',false,'error','Invalid status','allowed_statuses',jsonb_build_array('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED'));
  end if;

  if v_status='DISPATCHED' then
    v_check:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan_id,null,null,null);
    if not coalesce((v_check->>'ok')::boolean,false) then
      return jsonb_build_object('ok',false,'error','DISPATCH_BLOCKED_V12_11','wayplan_id',v_wayplan_id,'integrity',v_check,'next_step','Use Supervisor approval + mandatory Dispatch scan before publishing.');
    end if;
    return public.be_dispatch_publish_wayplan_v43(v_wayplan_id,v_actor);
  end if;

  update public.be_wayplan_dispatches
     set wayplan_status=v_status,
         completed_at=case when v_status='COMPLETED' and completed_at is null then now() else completed_at end,
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_action_actor',v_actor,'last_action_status',v_status,'last_action_at',now(),'dispatch_guard','V12_11'),
         updated_at=now()
   where wayplan_id=v_wayplan_id;

  update public.be_wayplan_dispatch_stops
     set stop_status=v_status,updated_at=now()
   where wayplan_id=v_wayplan_id
     and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  update public.be_waybill_ledger
     set dispatch_status=v_status,wayplan_status=v_status,updated_at=now()
   where wayplan_id=v_wayplan_id
     and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan_id,'status',v_status,'dispatch_guard','V12_11');
end;
$$;;
