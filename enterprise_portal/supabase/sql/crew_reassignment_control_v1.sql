-- Proposed controlled wayplan crew reassignment.
-- Separate API intentionally avoids weakening the existing v68 pre-dispatch lock.
create or replace function public.be_wayplan_request_crew_reassignment_v1(
  p_wayplan_id text, p_position text, p_new_worker_code text,
  p_reason text, p_handover_reference text default null
) returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(replace(coalesce(public.be_current_user_role(),''),'-','_'));
  v_position text := upper(btrim(coalesce(p_position,'')));
  v_status text;
  v_old text;
  v_new jsonb;
  v_worker_type text;
  v_options jsonb;
  v_dispatch public.be_wayplan_dispatches%rowtype;
  v_open_count integer;
  v_active boolean;
  v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'Authentication required'; end if;
  if v_role not in ('superadmin','super_admin','app_owner','admin','supervisor',
     'operations','operations_admin','operation_manager','operations_manager',
     'ops_manager','management','director') then
    raise exception 'Supervisor, Manager or Super Admin permission required';
  end if;
  if v_position not in ('RIDER','DRIVER','HELPER') then
    raise exception 'Position must be RIDER, DRIVER or HELPER';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 8 then
    raise exception 'A meaningful reassignment reason is mandatory';
  end if;
  if nullif(btrim(coalesce(p_new_worker_code,'')),'') is null then
    raise exception 'Choose a replacement worker';
  end if;
  select * into v_dispatch from public.be_wayplan_dispatches
  where wayplan_id=p_wayplan_id for update;
  if not found then raise exception 'Wayplan dispatch record not found'; end if;
  select review_status into v_status from public.be_wayplan_review_v43
  where wayplan_id=p_wayplan_id;
  if v_status is null then raise exception 'Wayplan review not found'; end if;
  if v_dispatch.completed_at is not null or upper(coalesce(v_dispatch.wayplan_status,'')) in ('COMPLETED','CANCELLED','CANCELED') then
    raise exception 'Completed or cancelled route cannot be reassigned';
  end if;
  select count(*) into v_open_count
  from public.be_wayplan_dispatch_stops
  where wayplan_id=p_wayplan_id
    and upper(coalesce(stop_status,'')) not in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','CANCELLED','CANCELED','RTO_COMPLETED');
  if v_open_count=0 then raise exception 'No unfinished stops to reassign'; end if;
  v_active := v_dispatch.dispatched_at is not null
    or upper(coalesce(v_status,'')) in ('DISPATCH_READY','DISPATCHED')
    or upper(coalesce(v_dispatch.wayplan_status,'')) in ('DISPATCHED','OUT_FOR_DELIVERY','IN_PROGRESS');
  -- A reference is mandatory, but does not by itself verify custody.
  -- Active moves are recorded as PENDING_HANDOVER rather than auto-transferring parcels.
  v_options := public.be_wayplan_assignment_options_v44();
  v_worker_type := case v_position when 'RIDER' then 'riders' when 'DRIVER' then 'drivers' else 'helpers' end;
  select x into v_new from jsonb_array_elements(v_options->v_worker_type) x
  where x->>'id'=p_new_worker_code
    and (coalesce(x->>'branch_code','')='' or x->>'branch_code'=v_dispatch.branch_code)
  limit 1;
  if v_new is null then raise exception 'Replacement must be in active branch workforce roster'; end if;
  v_old := case v_position when 'RIDER' then v_dispatch.rider_code when 'DRIVER' then v_dispatch.driver_code else v_dispatch.helper_code end;
  if v_old is not distinct from p_new_worker_code then
    raise exception 'Replacement is already assigned to this position';
  end if;
  if p_new_worker_code in (coalesce(case when v_position <> 'RIDER' then v_dispatch.rider_code end,''),
                           coalesce(case when v_position <> 'DRIVER' then v_dispatch.driver_code end,''),
                           coalesce(case when v_position <> 'HELPER' then v_dispatch.helper_code end,'')) then
    raise exception 'Same worker cannot hold two roles on one team';
  end if;
  if v_active and length(btrim(coalesce(p_handover_reference,''))) < 6 then
    raise exception 'Active route requires a documented parcel handover reference';
  end if;
  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values (v_id,coalesce(auth.jwt()->>'email',v_id::text),public.be_current_user_role(),
    case when v_active then 'CREW_REASSIGNMENT_PENDING_HANDOVER' else 'CREW_REASSIGNED_PRE_DISPATCH' end,
    'WAYPLAN',p_wayplan_id,
    jsonb_build_object('position',v_position,'old_code',v_old,'new_code',p_new_worker_code,
      'reason',p_reason,'handover_reference',p_handover_reference,'open_stops',v_open_count));
  if v_active then
    return jsonb_build_object('ok',true,'status','PENDING_HANDOVER',
      'message','No live assignment changed. Verify custody with the warehouse and replacement worker before executing a separate transfer.',
      'wayplan_id',p_wayplan_id,'position',v_position,'old_code',v_old,
      'new_code',p_new_worker_code);
  end if;
  -- Before dispatch, reuse the existing role, roster and stop-validation RPC.
  -- This helper supports Driver-led wayplans; never silently clear unrelated roles.
  perform public.be_wayplan_supervisor_assign_crew_v68(
    p_wayplan_id,
    case when v_position='DRIVER' then p_new_worker_code else v_dispatch.driver_code end,
    case when v_position='RIDER' then p_new_worker_code else v_dispatch.rider_code end,
    case when v_position='HELPER' then p_new_worker_code else v_dispatch.helper_code end
  );
  return jsonb_build_object('ok',true,'status','REASSIGNED','wayplan_id',p_wayplan_id,
    'position',v_position,'old_code',v_old,'new_code',p_new_worker_code);
end;
$$;
revoke all on function public.be_wayplan_request_crew_reassignment_v1(text,text,text,text,text) from public, anon;
grant execute on function public.be_wayplan_request_crew_reassignment_v1(text,text,text,text,text) to authenticated;
