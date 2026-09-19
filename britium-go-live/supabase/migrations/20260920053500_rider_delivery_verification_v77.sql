-- V77: Rider delivery verification hardening.
-- Enforce GPS/geofence arrival before successful delivery verification.

create or replace function public.be_field_team_delivery_arrival_snapshot_v77()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('rider','driver','helper') then
    raise exception 'FIELD_ROLE_NOT_RECOGNIZED' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',s.delivery_way_id,
    'wayplan_id',s.wayplan_id,
    'dispatch_stop_status',upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')),
    'route_run_status',rr.run_status,
    'route_stop_status',rs.stop_status,
    'arrived_at',rs.arrived_at,
    'arrival_distance_m',rs.arrival_distance_m,
    'geo_verified',coalesce(rs.geo_verified,false),
    'arrival_latitude',rs.arrival_latitude,
    'arrival_longitude',rs.arrival_longitude,
    'delivery_arrival_status',
      case
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
        when rs.stop_status='ARRIVED' or upper(coalesce(s.stop_status,''))='ARRIVED_AT_CUSTOMER' then 'ARRIVED_AT_CUSTOMER'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
        else upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'READY_FOR_DELIVERY'))
      end
  ) order by s.updated_at desc),'[]'::jsonb)
  into v_rows
  from public.be_wayplan_dispatch_stops s
  join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
  left join lateral (
    select mm.*
    from public.be_wayplan_membership_v40 mm
    where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id
    order by mm.updated_at desc nulls last
    limit 1
  ) m on true
  left join public.be_rider_route_runs_v46 rr on rr.wayplan_id=s.wayplan_id
  left join public.be_rider_route_stop_state_v46 rs
    on rs.wayplan_id=s.wayplan_id and rs.delivery_way_id=s.delivery_way_id
  where case v_role
    when 'rider' then upper(coalesce(m.rider_code,w.rider_code,s.rider_code,''))=v_code
    when 'driver' then upper(coalesce(m.driver_code,w.driver_code,''))=v_code
    when 'helper' then upper(coalesce(m.helper_code,w.helper_code,''))=v_code
    else false end;

  return jsonb_build_object(
    'ok',true,
    'worker_code',v_code,
    'worker_role',v_role,
    'rows',v_rows,
    'build','RIDER_DELIVERY_ARRIVAL_STATE_V77'
  );
end;
$function$;

grant execute on function public.be_field_team_delivery_arrival_snapshot_v77() to authenticated;

create or replace function public.be_field_team_delivery_action_v77(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_action text:=lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_way text:=coalesce(
    nullif(upper(btrim(p_payload->>'delivery_way_id')),''),
    nullif(upper(btrim(p_payload->>'tracking_no')),''),
    case when upper(coalesce(p_payload->>'pickup_id','')) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      then upper(btrim(p_payload->>'pickup_id')) end
  );
  v_wayplan text:=nullif(btrim(coalesce(p_payload->>'wayplan_id','')),'');
  v_lat numeric;
  v_lng numeric;
  v_run_status text;
  v_arrival jsonb;
  v_result jsonb;
  v_operation text:=coalesce(
    nullif(btrim(p_payload->>'idempotency_key'),''),
    nullif(btrim(p_payload->>'operation_id'),''),
    gen_random_uuid()::text
  );
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;
  if v_role not in ('rider','driver','helper') then
    return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED');
  end if;
  if v_way is null then
    raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023';
  end if;

  if v_wayplan is null then
    select s.wayplan_id into v_wayplan
    from public.be_wayplan_dispatch_stops s
    where s.delivery_way_id=v_way
    order by s.updated_at desc nulls last
    limit 1;
  end if;

  if v_action in ('start_delivery','out_for_delivery') then
    if v_role='helper' then
      return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can start delivery.');
    end if;

    begin
      v_lat:=nullif(btrim(coalesce(p_payload->>'latitude',p_payload->>'lat','')),'')::numeric;
      v_lng:=nullif(btrim(coalesce(p_payload->>'longitude',p_payload->>'lng','')),'')::numeric;
    exception when others then
      raise exception 'VALID_GPS_REQUIRED_TO_START_ROUTE' using errcode='22023';
    end;

    if v_wayplan is null then
      raise exception 'WAYPLAN_REQUIRED_TO_START_DELIVERY' using errcode='22023';
    end if;
    if v_lat is null or v_lng is null then
      raise exception 'GPS_REQUIRED_TO_START_ROUTE' using errcode='22023';
    end if;

    perform public.be_rider_initialize_route_v46(v_wayplan,v_code);

    select run_status into v_run_status
    from public.be_rider_route_runs_v46
    where wayplan_id=v_wayplan;

    if coalesce(v_run_status,'ASSIGNED') in ('ASSIGNED','ACCEPTED') then
      perform public.be_rider_start_route_v46(
        v_wayplan,v_code,v_lat,v_lng,'V77-START-'||v_operation
      );
    elsif v_run_status not in ('IN_PROGRESS','COMPLETED','COMPLETED_WITH_EXCEPTIONS') then
      raise exception 'ROUTE_NOT_READY_FOR_DELIVERY: %',coalesce(v_run_status,'NULL') using errcode='22023';
    end if;

    return public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,
        'wayplan_id',v_wayplan,
        'operation_id',v_operation
      )
    )||jsonb_build_object('build','FIELD_DELIVERY_ACTION_V77');
  end if;

  if v_action in ('arrive_customer','arrived_at_customer','arrive_delivery','delivery_arrived') then
    if v_role='helper' then
      return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can confirm customer arrival.');
    end if;
    if v_wayplan is null then
      raise exception 'WAYPLAN_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023';
    end if;

    begin
      v_lat:=nullif(btrim(coalesce(p_payload->>'latitude',p_payload->>'lat','')),'')::numeric;
      v_lng:=nullif(btrim(coalesce(p_payload->>'longitude',p_payload->>'lng','')),'')::numeric;
    exception when others then
      raise exception 'VALID_GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023';
    end;

    if v_lat is null or v_lng is null then
      raise exception 'GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023';
    end if;

    v_arrival:=public.be_rider_arrive_stop_v50(
      v_wayplan,v_way,v_code,v_lat,v_lng,'V77-ARRIVE-'||v_operation
    );

    update public.be_wayplan_dispatch_stops
    set stop_status='ARRIVED_AT_CUSTOMER',
        rider_status='ARRIVED_AT_CUSTOMER',
        dispatch_status='ARRIVED_AT_CUSTOMER',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_arrived_at',now(),
          'arrival_latitude',v_lat,
          'arrival_longitude',v_lng,
          'arrival_distance_m',v_arrival->'distance_m',
          'geo_verified',v_arrival->'geo_verified',
          'geofence_override_used',v_arrival->'override_used',
          'worker_code',v_code,
          'worker_role',v_role,
          'build','V77'
        )
    where wayplan_id=v_wayplan and delivery_way_id=v_way;

    update public.be_waybill_ledger
    set rider_status='ARRIVED_AT_CUSTOMER',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_arrived_at',now(),
          'arrival_distance_m',v_arrival->'distance_m',
          'geo_verified',v_arrival->'geo_verified',
          'geofence_override_used',v_arrival->'override_used',
          'build','V77'
        )
    where delivery_way_id=v_way or tracking_no=v_way;

    return coalesce(v_arrival,'{}'::jsonb)||jsonb_build_object(
      'ok',true,
      'action','arrive_customer',
      'mobile_status','ARRIVED_AT_CUSTOMER',
      'delivery_way_id',v_way,
      'wayplan_id',v_wayplan,
      'build','FIELD_DELIVERY_ARRIVAL_V77'
    );
  end if;

  if v_action in ('deliver','delivered','verify_delivery','delivery_verified') then
    if not exists(
      select 1
      from public.be_rider_route_stop_state_v46 rs
      where rs.wayplan_id=v_wayplan
        and rs.delivery_way_id=v_way
        and rs.stop_status='ARRIVED'
        and coalesce(rs.geo_verified,false)
    )
    and not exists(
      select 1
      from public.be_rider_geofence_overrides_v50 o
      where o.wayplan_id=v_wayplan
        and o.delivery_way_id=v_way
        and o.used_at is not null
    ) then
      raise exception 'ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    if not exists(
      select 1 from public.be_wayplan_dispatch_stops s
      where s.wayplan_id=v_wayplan
        and s.delivery_way_id=v_way
        and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER'
    ) then
      raise exception 'ARRIVED_AT_CUSTOMER_STATUS_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,
        'wayplan_id',v_wayplan,
        'operation_id',v_operation
      )
    );

    update public.be_rider_route_stop_state_v46
    set stop_status='DELIVERED',
        updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_way;

    update public.be_rider_route_runs_v46 rr
    set current_stop_sequence=(
          select min(rs.stop_sequence)
          from public.be_rider_route_stop_state_v46 rs
          where rs.wayplan_id=v_wayplan and rs.stop_status in ('PENDING','ARRIVED')
        ),
        run_status=case
          when not exists(
            select 1 from public.be_rider_route_stop_state_v46 rs
            where rs.wayplan_id=v_wayplan and rs.stop_status in ('PENDING','ARRIVED')
          ) then
            case when exists(
              select 1 from public.be_rider_route_stop_state_v46 rs
              where rs.wayplan_id=v_wayplan and rs.stop_status in ('FAILED','RTO')
            ) then 'COMPLETED_WITH_EXCEPTIONS' else 'COMPLETED' end
          else rr.run_status
        end,
        updated_at=now()
    where rr.wayplan_id=v_wayplan;

    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('build','FIELD_DELIVERY_ACTION_V77');
  end if;

  if v_action='exception' or v_action like '%delivery_exception%' or v_action like '%delivery_failed%' then
    v_result:=public.be_field_team_delivery_action_v71(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,
        'wayplan_id',v_wayplan,
        'operation_id',v_operation
      )
    );

    update public.be_rider_route_stop_state_v46
    set stop_status=case when upper(coalesce(v_result->>'mobile_status',v_result->>'status',''))='RTO' then 'RTO' else 'FAILED' end,
        updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_way;

    update public.be_rider_route_runs_v46 rr
    set current_stop_sequence=(
          select min(rs.stop_sequence)
          from public.be_rider_route_stop_state_v46 rs
          where rs.wayplan_id=v_wayplan and rs.stop_status in ('PENDING','ARRIVED')
        ),
        run_status=case
          when not exists(
            select 1 from public.be_rider_route_stop_state_v46 rs
            where rs.wayplan_id=v_wayplan and rs.stop_status in ('PENDING','ARRIVED')
          ) then 'COMPLETED_WITH_EXCEPTIONS'
          else rr.run_status
        end,
        updated_at=now()
    where rr.wayplan_id=v_wayplan;

    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('build','FIELD_DELIVERY_EXCEPTION_V77');
  end if;

  return public.be_field_team_delivery_action(
    p_payload||jsonb_build_object(
      'delivery_way_id',v_way,
      'wayplan_id',v_wayplan,
      'operation_id',v_operation
    )
  )||jsonb_build_object('build','FIELD_DELIVERY_ACTION_V77');
end;
$function$;

grant execute on function public.be_field_team_delivery_action_v77(jsonb) to authenticated;

create or replace function public.be_rider_pickup_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_role text:=lower(v_identity->>'role');
  v_action text:=lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_id text:=upper(btrim(coalesce(
    p_payload->>'delivery_way_id',
    p_payload->>'tracking_no',
    p_payload->>'pickup_id',
    p_payload->>'pickup_way_id',''
  )));
  v_process text:=lower(btrim(coalesce(p_payload->>'process_type',p_payload->>'workflow_area','')));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;

  if v_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
     or v_action in (
       'start_delivery','out_for_delivery',
       'arrive_customer','arrived_at_customer','arrive_delivery','delivery_arrived',
       'deliver','delivered','verify_delivery','delivery_verified'
     )
     or (v_action='exception' and v_process='delivery')
     or v_action like '%delivery_exception%'
     or v_action like '%delivery_failed%' then
    return public.be_field_team_delivery_action_v77(p_payload);
  end if;

  if v_role='helper' and v_action in (
    'verify_pickup','pickup_verify','pickup_verified','verify',
    'collect','pickup_collected','collected','delivered_to_warehouse'
  ) then
    return jsonb_build_object(
      'ok',false,'error','PRIMARY_WORKER_REQUIRED',
      'message','Only assigned rider or driver can finalize pickup or delivery. Helper may upload evidence and report exceptions.'
    );
  end if;

  return public.be_rider_pickup_action_primary_guard_legacy_v101(
    p_payload||jsonb_build_object(
      'authenticated_worker_code',v_identity->>'worker_code',
      'authenticated_worker_role',v_role
    )
  );
end;
$function$;

grant execute on function public.be_rider_pickup_action(jsonb) to authenticated;
