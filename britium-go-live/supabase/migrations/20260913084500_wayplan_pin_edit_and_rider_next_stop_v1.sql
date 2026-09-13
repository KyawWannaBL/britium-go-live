-- Wayplan usability: audited map pin correction + proof-safe Rider Finish -> next-stop progression.

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

create or replace function public.be_rider_finish_current_stop_v1(
  p_wayplan_id text,
  p_delivery_way_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,private,pg_temp
as $$
declare
  v_wayplan text:=nullif(btrim(p_wayplan_id),'');
  v_delivery text:=nullif(btrim(p_delivery_way_id),'');
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_allowed boolean:=false;
  v_proof_ready boolean:=false;
  v_version integer:=1;
  v_snapshot jsonb;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then
    return jsonb_build_object('ok',false,'error','PRIMARY_RIDER_OR_DRIVER_REQUIRED');
  end if;
  if v_wayplan is null or v_delivery is null then
    return jsonb_build_object('ok',false,'error','WAYPLAN_AND_DELIVERY_WAY_REQUIRED');
  end if;

  select exists(
    select 1 from public.be_wayplan_dispatches d2
    where d2.wayplan_id=v_wayplan
      and ((v_role='rider' and upper(coalesce(d2.rider_code,''))=v_code)
        or (v_role='driver' and upper(coalesce(d2.driver_code,''))=v_code))
  ), coalesce((d.metadata->>'active_route_version')::integer,1)
  into v_allowed,v_version
  from public.be_wayplan_dispatches d
  where d.wayplan_id=v_wayplan;

  if not coalesce(v_allowed,false) then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER');
  end if;

  select (
    exists(select 1 from public.shipment_delivery_proofs p where p.delivery_way_id=v_delivery and upper(coalesce(p.proof_type,'DELIVERY'))='DELIVERY')
    or exists(select 1 from public.be_wayplan_items i where (i.delivery_way_id=v_delivery or i.tracking_no=v_delivery) and (upper(coalesce(i.delivery_status,''))='DELIVERED' or i.delivered_at is not null))
    or exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan and s.delivery_way_id=v_delivery and upper(coalesce(s.stop_status,s.rider_status,''))='DELIVERED')
  ) into v_proof_ready;

  if not coalesce(v_proof_ready,false) then
    return jsonb_build_object(
      'ok',false,
      'error','DELIVERY_PROOF_REQUIRED_BEFORE_FINISH',
      'message','Complete delivery proof, receiver signature and COD/payment confirmation before pressing Finish.'
    );
  end if;

  update public.be_wayplan_dispatch_stops
  set stop_status='DELIVERED',rider_status='DELIVERED',rider_action_at=coalesce(rider_action_at,now()),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_operational_event','DELIVERED','last_operational_event_at',now(),'finish_next_stop',true)
  where wayplan_id=v_wayplan and delivery_way_id=v_delivery
    and upper(coalesce(stop_status,rider_status,''))<>'DELIVERED';

  if not exists(
    select 1 from public.be_wayplan_stop_events_v1 e
    where e.wayplan_id=v_wayplan and e.delivery_way_id=v_delivery and e.event_type='DELIVERED'
  ) then
    insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_id,actor_code,actor_role,reason,payload)
    values(v_wayplan,v_delivery,v_version,'DELIVERED',auth.uid(),v_code,v_role,'Finish current drop and advance to next stop',jsonb_build_object('finish_next_stop',true,'proof_verified',true));
  end if;

  v_snapshot:=public.be_rider_operational_route_snapshot(v_wayplan);
  return v_snapshot||jsonb_build_object(
    'ok',true,
    'recorded_event','DELIVERED',
    'finished_stop_delivery_way_id',v_delivery,
    'advance_to_next_stop',true,
    'route_complete',(v_snapshot->'current_stop' is null),
    'proof_verified',true
  );
end $$;
revoke all on function public.be_rider_finish_current_stop_v1(text,text) from public,anon;
grant execute on function public.be_rider_finish_current_stop_v1(text,text) to authenticated;

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
  if v_action in ('FINISH','FINISH_STOP') then
    return public.be_rider_finish_current_stop_v1(p_payload->>'wayplan_id',p_payload->>'delivery_way_id');
  end if;

  v_event:=case v_action
    when 'ARRIVED' then 'ARRIVED'
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
    'recorded_event',v_event
  );
end $$;
revoke all on function public.be_rider_operational_route_action(jsonb) from public,anon;
grant execute on function public.be_rider_operational_route_action(jsonb) to authenticated;
