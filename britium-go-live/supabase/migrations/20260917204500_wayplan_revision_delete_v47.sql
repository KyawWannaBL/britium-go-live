-- V47: operator-visible revision controls plus safe operational delete for CREATED Wayplans.
-- Delete is non-destructive: route versions and warehouse LIFO snapshots are preserved for audit.

create or replace function public.be_delete_created_wayplan_v47(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_wayplan_id text:=nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_request_id text:=nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_reason text:=coalesce(nullif(btrim(p_payload->>'reason'),''),'Deleted by operator before dispatch');
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  v_role text:=lower(coalesce(public.be_current_user_role(),''));
  v_wayplan public.be_wayplan_dispatches%rowtype;
  v_old_event jsonb;
  v_ids text[]:='{}';
  v_count integer:=0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;
  if v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
    raise exception 'Wayplan delete permission is required' using errcode='42501';
  end if;
  if v_wayplan_id is null then raise exception 'wayplan_id is required'; end if;
  if v_request_id is null or v_request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('wayplan-delete-v47:'||v_wayplan_id,0));

  select details into v_old_event
  from public.be_audit_events
  where action='WAYPLAN_DELETED_V47' and resource_id=v_request_id
  limit 1;
  if v_old_event is not null then
    if v_old_event->'request' is distinct from p_payload or v_old_event->>'actor_id'<>auth.uid()::text then
      raise exception 'Request ID already belongs to another operation.';
    end if;
    return v_old_event->'result';
  end if;

  select * into v_wayplan
  from public.be_wayplan_dispatches
  where wayplan_id=v_wayplan_id
  for update;
  if not found then raise exception 'Wayplan not found.'; end if;

  if upper(coalesce(v_wayplan.wayplan_status,'')) <> 'CREATED' then
    raise exception 'Only a CREATED Wayplan can be deleted before dispatch';
  end if;
  if v_wayplan.dispatched_at is not null
     or v_wayplan.loaded_to_vehicle_at is not null
     or v_wayplan.handed_over_to_rider_at is not null
     or v_wayplan.warehouse_confirmed_at is not null
     or v_wayplan.rider_confirmed_at is not null then
    raise exception 'This Wayplan has already entered loading, handoff, or dispatch and cannot be deleted.';
  end if;
  if exists (
    select 1 from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan_id
      and (s.loaded_to_vehicle_at is not null
        or s.handed_over_to_rider_at is not null
        or upper(coalesce(s.stop_status,'')) in ('DISPATCHED','DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE'))
  ) then
    raise exception 'One or more Wayplan stops have already entered loading, handoff, delivery, or RTO and cannot be deleted.';
  end if;

  select coalesce(array_agg(s.delivery_way_id order by s.stop_sequence),'{}'::text[]),count(*)::integer
  into v_ids,v_count
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_wayplan_id
    and upper(coalesce(s.stop_status,'')) not in ('CANCELLED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  update public.be_wayplan_membership_v40
  set membership_status='CANCELLED',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'delete_v47','RELEASED_TO_READY',
        'delete_request_id',v_request_id,
        'deleted_from_wayplan_id',v_wayplan_id,
        'deleted_at',now(),
        'deleted_by',v_actor
      ),
      updated_at=now()
  where wayplan_id=v_wayplan_id
    and membership_status not in ('CANCELLED','COMPLETED','RTO');

  update public.be_waybill_ledger
  set wayplan_id=null,
      wayplan_status='READY_FOR_WAYPLAN',
      dispatch_status='READY_FOR_DISPATCH',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'delete_v47_released_from',v_wayplan_id,
        'delete_request_id',v_request_id,
        'delete_reason',v_reason,
        'delete_at',now()
      ),
      updated_at=now()
  where delivery_way_id=any(v_ids)
    and wayplan_id=v_wayplan_id
    and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');

  update public.be_wayplan_dispatch_stops
  set stop_status='CANCELLED',
      dispatch_status='CANCELLED',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'delete_v47',true,
        'delete_request_id',v_request_id,
        'delete_reason',v_reason,
        'deleted_at',now(),
        'deleted_by',v_actor,
        'released_to_ready',true
      ),
      updated_at=now()
  where wayplan_id=v_wayplan_id
    and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  update public.be_wayplan_dispatches
  set wayplan_status='CANCELLED',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'operational_delete_v47',true,
        'delete_request_id',v_request_id,
        'delete_reason',v_reason,
        'deleted_at',now(),
        'deleted_by',v_actor,
        'released_count',v_count,
        'history_preserved',true
      ),
      updated_at=now()
  where wayplan_id=v_wayplan_id;

  v_result:=jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan_id,
    'status','CANCELLED',
    'released_count',v_count,
    'returned_to_ready',true,
    'history_preserved',true,
    'route_versions_preserved',true,
    'warehouse_lifo_preserved',true,
    'build','WAYPLAN_DELETE_V47'
  );

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'WAYPLAN_DELETED_V47','WAYPLAN',v_request_id,
    jsonb_build_object('request',p_payload,'result',v_result,'actor_id',auth.uid(),'wayplan_id',v_wayplan_id));

  return v_result;
end;
$$;

revoke all on function public.be_delete_created_wayplan_v47(jsonb) from public;
grant execute on function public.be_delete_created_wayplan_v47(jsonb) to authenticated;
