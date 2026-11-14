
create or replace function public.be_field_team_confirm_delivery_v146(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = 'public', 'auth', 'pg_temp'
as $function$
declare
  v_way text := nullif(upper(btrim(coalesce(p_payload->>'delivery_way_id',''))),'');
  v_wayplan text := nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_status text;
  v_lat text := coalesce(
    nullif(btrim(p_payload->>'latitude'),''),
    nullif(btrim(p_payload->>'gps_lat'),'')
  );
  v_lng text := coalesce(
    nullif(btrim(p_payload->>'longitude'),''),
    nullif(btrim(p_payload->>'gps_lng'),'')
  );
  v_stage jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;

  if v_way is null then
    return jsonb_build_object('ok',false,'error','DELIVERY_WAY_ID_REQUIRED');
  end if;

  if v_wayplan is null then
    select s.wayplan_id
      into v_wayplan
    from public.be_wayplan_dispatch_stops s
    where upper(s.delivery_way_id)=v_way
    order by s.updated_at desc nulls last
    limit 1;
  end if;

  if v_wayplan is null then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_FOUND');
  end if;

  select upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))
    into v_status
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_wayplan
    and upper(s.delivery_way_id)=v_way
  order by s.updated_at desc nulls last
  limit 1;

  if v_status in ('DELIVERED','DELIVERY_COMPLETED','POD_VERIFIED','COMPLETED') then
    return jsonb_build_object(
      'ok',true,
      'delivery_way_id',v_way,
      'wayplan_id',v_wayplan,
      'mobile_status','DELIVERED',
      'already_applied',true,
      'build','FIELD_CONFIRM_DELIVERY_V146'
    );
  end if;

  if v_status in ('DISPATCHED','PENDING','READY_FOR_DISPATCH','') or v_status is null then
    return jsonb_build_object(
      'ok',false,
      'error','ACCEPT_REQUIRED_BEFORE_DELIVERED',
      'message','Accept the parcel before confirming delivery.',
      'current_status',coalesce(v_status,'')
    );
  end if;

  if v_status in ('RIDER_ACCEPTED','DELIVERY_ACCEPTED','ACCEPTED_FOR_DELIVERY') then
    v_stage := public.be_field_team_delivery_action_v77(
      p_payload || jsonb_build_object(
        'action','start_delivery',
        'wayplan_id',v_wayplan,
        'delivery_way_id',v_way
      )
    );
    if coalesce((v_stage->>'ok')::boolean,false)=false then
      return v_stage || jsonb_build_object('failed_stage','start_delivery','build','FIELD_CONFIRM_DELIVERY_V146');
    end if;

    select upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))
      into v_status
    from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan and upper(s.delivery_way_id)=v_way
    order by s.updated_at desc nulls last
    limit 1;
  end if;

  if v_status='OUT_FOR_DELIVERY' then
    if v_lat is null or v_lng is null then
      return jsonb_build_object(
        'ok',false,
        'error','GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL',
        'message','Current GPS is required before confirming delivery.',
        'current_status',v_status
      );
    end if;

    v_stage := public.be_field_team_delivery_action_v77(
      p_payload || jsonb_build_object(
        'action','arrive_customer',
        'wayplan_id',v_wayplan,
        'delivery_way_id',v_way,
        'latitude',v_lat,
        'longitude',v_lng
      )
    );
    if coalesce((v_stage->>'ok')::boolean,false)=false then
      return v_stage || jsonb_build_object('failed_stage','arrive_customer','build','FIELD_CONFIRM_DELIVERY_V146');
    end if;

    select upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))
      into v_status
    from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan and upper(s.delivery_way_id)=v_way
    order by s.updated_at desc nulls last
    limit 1;
  end if;

  if v_status <> 'ARRIVED_AT_CUSTOMER' then
    return jsonb_build_object(
      'ok',false,
      'error','ARRIVED_AT_CUSTOMER_STATUS_REQUIRED_BEFORE_DELIVERED',
      'current_status',coalesce(v_status,'')
    );
  end if;

  v_result := public.be_field_team_delivery_action_v77(
    p_payload || jsonb_build_object(
      'action','deliver',
      'wayplan_id',v_wayplan,
      'delivery_way_id',v_way,
      'latitude',v_lat,
      'longitude',v_lng
    )
  );

  if coalesce((v_result->>'ok')::boolean,false)=false then
    return v_result || jsonb_build_object('failed_stage','deliver','build','FIELD_CONFIRM_DELIVERY_V146');
  end if;

  if not exists(
    select 1
    from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan
      and upper(s.delivery_way_id)=v_way
      and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','DELIVERY_COMPLETED','POD_VERIFIED','COMPLETED')
  ) then
    return jsonb_build_object(
      'ok',false,
      'error','DELIVERY_STATE_NOT_PERSISTED',
      'message','Delivery action returned but authoritative stop status did not become DELIVERED.',
      'build','FIELD_CONFIRM_DELIVERY_V146'
    );
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'delivery_way_id',v_way,
    'wayplan_id',v_wayplan,
    'mobile_status','DELIVERED',
    'authoritative_success',true,
    'build','FIELD_CONFIRM_DELIVERY_V146'
  );
end;
$function$;

revoke all on function public.be_field_team_confirm_delivery_v146(jsonb) from public;
revoke all on function public.be_field_team_confirm_delivery_v146(jsonb) from anon;
grant execute on function public.be_field_team_confirm_delivery_v146(jsonb) to authenticated;
grant execute on function public.be_field_team_confirm_delivery_v146(jsonb) to service_role;
