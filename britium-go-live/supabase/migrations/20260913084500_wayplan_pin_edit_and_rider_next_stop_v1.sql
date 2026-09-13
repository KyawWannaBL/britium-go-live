-- Wayplan usability: audited map pin correction + Rider Finish -> next-stop progression.

create or replace function public.be_update_delivery_location_pin_v1(
  p_delivery_way_id text,
  p_latitude numeric,
  p_longitude numeric,
  p_context text default 'WAYPLAN_MAP_PIN'
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,private,pg_temp
as $$
declare
  v_delivery text:=nullif(btrim(p_delivery_way_id),'');
  v_role text:=lower(public.be_current_user_role());
  v_identity jsonb;
  v_worker_code text;
  v_allowed boolean:=false;
  v_old_lat numeric;
  v_old_lng numeric;
  v_actor_email text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  if v_delivery is null then raise exception 'Delivery Way ID is required.'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between 9 and 29 or p_longitude not between 92 and 102 then
    raise exception 'Pin must be inside the supported Myanmar coordinate bounds.';
  end if;

  if v_role in ('superadmin','super_admin','admin','dispatch','wayplan_operator','wayplan-manager','supervisor','operations','operations_admin','operations-admin','management','director') then
    v_allowed:=true;
  elsif v_role in ('rider','driver') then
    v_identity:=private.be_field_primary_context_v101();
    v_worker_code:=upper(coalesce(v_identity->>'worker_code',''));
    select exists(
      select 1
      from public.be_wayplan_dispatches d
      join public.be_wayplan_dispatch_stops s on s.wayplan_id=d.wayplan_id
      where s.delivery_way_id=v_delivery
        and upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
        and ((v_role='rider' and upper(coalesce(d.rider_code,''))=v_worker_code)
          or (v_role='driver' and upper(coalesce(d.driver_code,''))=v_worker_code))
    ) into v_allowed;
  end if;

  if not coalesce(v_allowed,false) then
    raise exception using errcode='42501',message='Location pin update is not permitted for this parcel.';
  end if;

  select latitude,longitude into v_old_lat,v_old_lng
  from public.be_delivery_location_registry
  where delivery_way_id=v_delivery
  for update;
  if not found then raise exception 'Location registry entry was not found for %',v_delivery; end if;

  update public.be_delivery_location_registry
  set latitude=p_latitude,
      longitude=p_longitude,
      coordinate_source='MANUAL_PIN',
      review_status='ACCEPTED',
      confidence=1,
      updated_by=auth.uid(),
      updated_at=now()
  where delivery_way_id=v_delivery;

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor_email,public.be_current_user_role(),'DELIVERY_LOCATION_PIN_UPDATED','DELIVERY_LOCATION',v_delivery,
    jsonb_build_object(
      'old_latitude',v_old_lat,'old_longitude',v_old_lng,
      'new_latitude',p_latitude,'new_longitude',p_longitude,
      'context',coalesce(nullif(btrim(p_context),''),'WAYPLAN_MAP_PIN'),
      'coordinate_source','MANUAL_PIN'
    ));

  return jsonb_build_object(
    'ok',true,'delivery_way_id',v_delivery,
    'latitude',p_latitude,'longitude',p_longitude,
    'old_latitude',v_old_lat,'old_longitude',v_old_lng,
    'updated_at',now(),'route_recalculation_required',true
  );
end $$;
revoke all on function public.be_update_delivery_location_pin_v1(text,numeric,numeric,text) from public,anon;
grant execute on function public.be_update_delivery_location_pin_v1(text,numeric,numeric,text) to authenticated;

create or replace function public.be_rider_operational_route_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_action text:=upper(nullif(btrim(p_payload->>'action'),''));
  v_event text;
  v_result jsonb;
  v_snapshot jsonb;
begin
  v_event:=case v_action
    when 'ARRIVED' then 'ARRIVED'
    when 'DELIVERED' then 'DELIVERED'
    when 'FINISH' then 'DELIVERED'
    when 'FINISH_STOP' then 'DELIVERED'
    when 'CUSTOMER_UNAVAILABLE' then 'CUSTOMER_UNAVAILABLE'
    when 'RESCHEDULE' then 'RESCHEDULE'
    when 'RTO' then 'RTO'
    when 'SKIP' then 'SKIP'
    else null end;
  if v_event is null then return jsonb_build_object('ok',false,'error','INVALID_OPERATIONAL_ROUTE_ACTION'); end if;

  v_result:=public.be_record_operational_stop_event_v1(
    p_payload||jsonb_build_object(
      'event_type',v_event,
      'reason',coalesce(p_payload->>'remark',p_payload->>'reason')
    )
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  v_snapshot:=public.be_rider_operational_route_snapshot(p_payload->>'wayplan_id');
  return v_snapshot||jsonb_build_object(
    'reroute_required',coalesce((v_result->>'requires_reroute')::boolean,false),
    'recorded_event',v_event,
    'finished_stop_delivery_way_id',case when v_event='DELIVERED' then p_payload->>'delivery_way_id' else null end,
    'advance_to_next_stop',v_event='DELIVERED',
    'route_complete',v_event='DELIVERED' and (v_snapshot->'current_stop' is null)
  );
end $$;
revoke all on function public.be_rider_operational_route_action(jsonb) from public,anon;
grant execute on function public.be_rider_operational_route_action(jsonb) to authenticated;
