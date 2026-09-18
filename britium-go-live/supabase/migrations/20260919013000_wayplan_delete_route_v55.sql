-- V55: hard-remove operator-deleted pre-dispatch Wayplans from operational stores.
-- Immutable audit events are retained; parcels are first released back to READY by V47.

create or replace function public.be_delete_created_wayplan_v55(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_result jsonb;
  v_wayplan_id text := nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_actor text := coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
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

grant execute on function public.be_delete_created_wayplan_v55(jsonb) to authenticated;

-- Remove historical V47 operator-deleted Wayplans that were intentionally
-- deleted before dispatch but remained visible as CANCELLED.
do $cleanup$
declare
  v_id text;
begin
  for v_id in
    select wayplan_id
    from public.be_wayplan_dispatches
    where upper(coalesce(wayplan_status,''))='CANCELLED'
      and coalesce((metadata->>'operational_delete_v47')::boolean,false)
      and dispatched_at is null
      and loaded_to_vehicle_at is null
      and handed_over_to_rider_at is null
  loop
    delete from public.be_wayplan_route_version_stops_v1 where wayplan_id=v_id;
    delete from public.be_wayplan_route_versions_v1 where wayplan_id=v_id;
    delete from public.be_wayplan_warehouse_loading_snapshots_v1 where wayplan_id=v_id;
    delete from public.be_wayplan_route_events_v45 where wayplan_id=v_id;
    delete from public.be_wayplan_route_plans_v45 where wayplan_id=v_id;
    delete from public.be_wayplan_review_events_v43 where wayplan_id=v_id;
    delete from public.be_wayplan_review_v43 where wayplan_id=v_id;
    delete from public.be_wayplan_events_v40 where wayplan_id=v_id;
    delete from public.be_wayplan_command_rows where wayplan_id=v_id;
    delete from public.be_wayplan_items where wayplan_id=v_id;
    delete from public.be_wayplan_stops where wayplan_id=v_id;
    delete from public.be_wayplan_stops_v25 where wayplan_id=v_id;
    delete from public.be_wayplans where wayplan_id=v_id;
    delete from public.be_wayplans_v25 where wayplan_id=v_id;
    delete from public.be_wayplan_membership_v40 where wayplan_id=v_id;
    delete from public.be_wayplan_dispatch_stops where wayplan_id=v_id;
    delete from public.be_wayplan_dispatches where wayplan_id=v_id;
  end loop;
end;
$cleanup$;

create or replace function public.be_wayplan_command_center(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select * from public.be_v_wayplan_command_center
    where created_at >= public.be_golive_live_cutoff_v1()
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
