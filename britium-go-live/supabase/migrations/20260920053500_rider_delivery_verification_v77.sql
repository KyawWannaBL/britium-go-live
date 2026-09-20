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


-- V77 canonical-coordinate compatibility layer.
-- The active V40/V43 Wayplan flow does not require a saved V45 route plan.
-- Arrival therefore uses the accepted delivery-location registry directly.

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
  if auth.uid() is null then raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('rider','driver','helper') then raise exception 'FIELD_ROLE_NOT_RECOGNIZED' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',s.delivery_way_id,
    'wayplan_id',s.wayplan_id,
    'stop_sequence',s.stop_sequence,
    'dispatch_stop_status',upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')),
    'delivery_arrival_status',
      case
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER' then 'ARRIVED_AT_CUSTOMER'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
        else upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'READY_FOR_DELIVERY'))
      end,
    'arrived_at',nullif(s.metadata->>'customer_arrived_at','')::timestamptz,
    'arrival_distance_m',nullif(s.metadata->>'arrival_distance_m','')::numeric,
    'geo_verified',coalesce((s.metadata->>'geo_verified')::boolean,false),
    'geofence_override_used',coalesce((s.metadata->>'geofence_override_used')::boolean,false),
    'arrival_latitude',nullif(s.metadata->>'arrival_latitude','')::numeric,
    'arrival_longitude',nullif(s.metadata->>'arrival_longitude','')::numeric,
    'destination_latitude',lr.latitude,
    'destination_longitude',lr.longitude,
    'coordinate_source',lr.coordinate_source,
    'coordinate_review_status',lr.review_status
  ) order by s.stop_sequence),'[]'::jsonb)
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
  left join lateral (
    select l.*
    from public.be_delivery_location_registry l
    where upper(l.delivery_way_id)=upper(s.delivery_way_id)
      and l.latitude is not null and l.longitude is not null
    order by case when upper(coalesce(l.review_status,''))='ACCEPTED' then 0 else 1 end,
             l.updated_at desc nulls last
    limit 1
  ) lr on true
  where case v_role
    when 'rider' then upper(coalesce(m.rider_code,w.rider_code,s.rider_code,''))=v_code
    when 'driver' then upper(coalesce(m.driver_code,w.driver_code,''))=v_code
    when 'helper' then upper(coalesce(m.helper_code,w.helper_code,''))=v_code
    else false end;

  return jsonb_build_object(
    'ok',true,'worker_code',v_code,'worker_role',v_role,'rows',v_rows,
    'coordinate_source','be_delivery_location_registry',
    'build','RIDER_DELIVERY_ARRIVAL_STATE_V77_CANONICAL'
  );
end;
$function$;

grant execute on function public.be_field_team_delivery_arrival_snapshot_v77() to authenticated;

create or replace function public.be_supervisor_approve_geofence_override_v50(
  p_wayplan_id text,
  p_delivery_way_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile_role text:=lower(coalesce(public.be_current_role(),''));
  v_registry_role text:=lower(coalesce(public.be_current_user_role(),''));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_actor text:=coalesce(nullif(auth.jwt()->>'email',''),auth.uid()::text,'unknown');
  v_row public.be_rider_geofence_overrides_v50%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if v_profile_role not in ('superadmin','admin','supervisor','operations_manager','operation_manager','operations','ops')
     and v_registry_role not in ('superadmin','admin','supervisor','operations_manager','operation_manager','operations','ops') then
    raise exception 'SUPERVISOR_ROLE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_wayplan_id,'')),'') is null
     or nullif(btrim(coalesce(p_delivery_way_id,'')),'') is null then
    raise exception 'WAYPLAN_AND_DELIVERY_WAY_REQUIRED';
  end if;

  if v_reason is null or length(v_reason)<5 then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;

  if not exists(
    select 1 from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=btrim(p_wayplan_id)
      and upper(s.delivery_way_id)=upper(btrim(p_delivery_way_id))
  ) then
    raise exception 'DELIVERY_STOP_NOT_FOUND';
  end if;

  insert into public.be_rider_geofence_overrides_v50(
    wayplan_id,delivery_way_id,reason,approved_by,approved_role,expires_at,metadata
  ) values (
    btrim(p_wayplan_id),btrim(p_delivery_way_id),v_reason,v_actor,
    coalesce(nullif(v_profile_role,''),nullif(v_registry_role,''),'supervisor'),
    now()+interval '30 minutes',
    jsonb_build_object('source','canonical_wayplan_geofence_v77','build','V77')
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'override_id',v_row.id,'wayplan_id',v_row.wayplan_id,
    'delivery_way_id',v_row.delivery_way_id,'approved_by',v_row.approved_by,
    'expires_at',v_row.expires_at,'build','GEOFENCE_OVERRIDE_V77_CANONICAL'
  );
end;
$function$;

create or replace function public.be_field_team_delivery_action_v77(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_uid uuid:=auth.uid();
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
  v_dest_lat numeric;
  v_dest_lng numeric;
  v_distance numeric;
  v_radius numeric:=100;
  v_override_id uuid;
  v_status text;
  v_rider text;
  v_driver text;
  v_helper text;
  v_has_scan boolean:=false;
  v_result jsonb;
  v_operation text:=coalesce(
    nullif(btrim(p_payload->>'idempotency_key'),''),
    nullif(btrim(p_payload->>'operation_id'),''),
    gen_random_uuid()::text
  );
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_way is null then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;

  select s.wayplan_id,
         upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')),
         upper(coalesce(m.rider_code,w.rider_code,s.rider_code,'')),
         upper(coalesce(m.driver_code,w.driver_code,'')),
         upper(coalesce(m.helper_code,w.helper_code,'')),
         exists(
           select 1 from public.be_dispatch_scans_v39 ds
           where ds.delivery_way_id=s.delivery_way_id and ds.scan_status='SCANNED'
             and (ds.wayplan_code=s.wayplan_id or ds.wayplan_code is null)
         )
  into v_wayplan,v_status,v_rider,v_driver,v_helper,v_has_scan
  from public.be_wayplan_dispatch_stops s
  join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
  left join lateral (
    select mm.* from public.be_wayplan_membership_v40 mm
    where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id
    order by mm.updated_at desc nulls last limit 1
  ) m on true
  where upper(s.delivery_way_id)=upper(v_way)
    and (v_wayplan is null or s.wayplan_id=v_wayplan)
  order by s.updated_at desc nulls last
  limit 1;

  if v_wayplan is null then raise exception 'DELIVERY_NOT_FOUND_OR_NOT_REGISTERED: %',v_way using errcode='P0002'; end if;
  if not (case v_role when 'rider' then v_rider=v_code when 'driver' then v_driver=v_code when 'helper' then v_helper=v_code else false end) then
    raise exception 'DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_FIELD_WORKER: %',v_way using errcode='42501';
  end if;

  if v_action in ('start_delivery','out_for_delivery') then
    return public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
      )
    )||jsonb_build_object('build','FIELD_DELIVERY_START_V77_CANONICAL');
  end if;

  if v_action in ('arrive_customer','arrived_at_customer','arrive_delivery','delivery_arrived') then
    if v_role='helper' then
      return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can confirm customer arrival.');
    end if;
    if not v_has_scan then raise exception 'DISPATCH_SCAN_REQUIRED_BEFORE_CUSTOMER_ARRIVAL: %',v_way using errcode='22023'; end if;
    if v_status in ('DELIVERED','COMPLETED') then
      return jsonb_build_object('ok',true,'delivery_way_id',v_way,'action','arrive_customer','mobile_status','DELIVERED','already_applied',true);
    end if;
    if v_status<>'OUT_FOR_DELIVERY' and v_status<>'ARRIVED_AT_CUSTOMER' then
      raise exception 'START_DELIVERY_REQUIRED_BEFORE_CUSTOMER_ARRIVAL: current status %',coalesce(v_status,'NULL') using errcode='22023';
    end if;

    begin
      v_lat:=nullif(btrim(coalesce(p_payload->>'latitude',p_payload->>'lat','')),'')::numeric;
      v_lng:=nullif(btrim(coalesce(p_payload->>'longitude',p_payload->>'lng','')),'')::numeric;
    exception when others then
      raise exception 'VALID_GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023';
    end;
    if v_lat is null or v_lng is null then raise exception 'GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023'; end if;

    select l.latitude,l.longitude
      into v_dest_lat,v_dest_lng
    from public.be_delivery_location_registry l
    where upper(l.delivery_way_id)=upper(v_way)
      and l.latitude is not null and l.longitude is not null
    order by case when upper(coalesce(l.review_status,''))='ACCEPTED' then 0 else 1 end,
             l.updated_at desc nulls last
    limit 1;

    select coalesce(numeric_value,100) into v_radius
    from public.be_rider_route_settings_v46
    where setting_key='delivery_arrival_radius_m';
    v_radius:=coalesce(v_radius,100);

    if v_dest_lat is not null and v_dest_lng is not null then
      v_distance:=public.be_rider_distance_m_v46(v_lat,v_lng,v_dest_lat,v_dest_lng);
    end if;

    if v_dest_lat is null or v_dest_lng is null or v_distance is null or v_distance>v_radius then
      select id into v_override_id
      from public.be_rider_geofence_overrides_v50
      where wayplan_id=v_wayplan
        and upper(delivery_way_id)=upper(v_way)
        and used_at is null
        and expires_at>now()
      order by created_at desc
      limit 1
      for update skip locked;

      if v_override_id is null then
        if v_dest_lat is null or v_dest_lng is null then
          raise exception 'DESTINATION_COORDINATES_REQUIRED|supervisor_override_required=true' using errcode='22023';
        end if;
        raise exception 'GEOFENCE_OUTSIDE_RADIUS|distance_m=%|radius_m=%|supervisor_override_required=true',
          round(v_distance),round(v_radius) using errcode='22023';
      end if;
    end if;

    if v_override_id is not null then
      update public.be_rider_geofence_overrides_v50
      set used_at=now(),used_by=coalesce(nullif(auth.jwt()->>'email',''),v_code,v_uid::text)
      where id=v_override_id;
    end if;

    update public.be_wayplan_dispatch_stops
    set stop_status='ARRIVED_AT_CUSTOMER',
        rider_status='ARRIVED_AT_CUSTOMER',
        dispatch_status='ARRIVED_AT_CUSTOMER',
        rider_action_at=now(),
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_arrived_at',now(),
          'arrival_latitude',v_lat,
          'arrival_longitude',v_lng,
          'destination_latitude',v_dest_lat,
          'destination_longitude',v_dest_lng,
          'arrival_distance_m',v_distance,
          'geofence_radius_m',v_radius,
          'geo_verified',coalesce(v_distance<=v_radius,false),
          'geofence_override_used',v_override_id is not null,
          'geofence_override_id',v_override_id,
          'worker_code',v_code,'worker_role',v_role,
          'arrival_operation_id',v_operation,'build','V77'
        )
    where wayplan_id=v_wayplan and upper(delivery_way_id)=upper(v_way);

    update public.be_waybill_ledger
    set rider_status='ARRIVED_AT_CUSTOMER',updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_arrived_at',now(),'arrival_distance_m',v_distance,
          'geo_verified',coalesce(v_distance<=v_radius,false),
          'geofence_override_used',v_override_id is not null,'build','V77'
        )
    where upper(delivery_way_id)=upper(v_way) or upper(tracking_no)=upper(v_way);

    return jsonb_build_object(
      'ok',true,'action','arrive_customer','mobile_status','ARRIVED_AT_CUSTOMER',
      'delivery_way_id',v_way,'wayplan_id',v_wayplan,
      'distance_m',v_distance,'geofence_radius_m',v_radius,
      'inside_geofence',coalesce(v_distance<=v_radius,false),
      'override_used',v_override_id is not null,'override_id',v_override_id,
      'destination_coordinates_available',v_dest_lat is not null and v_dest_lng is not null,
      'build','FIELD_DELIVERY_ARRIVAL_V77_CANONICAL'
    );
  end if;

  if v_action in ('deliver','delivered','verify_delivery','delivery_verified') then
    if v_status<>'ARRIVED_AT_CUSTOMER' then
      raise exception 'ARRIVED_AT_CUSTOMER_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    if not exists(
      select 1
      from public.be_wayplan_dispatch_stops s
      where s.wayplan_id=v_wayplan and upper(s.delivery_way_id)=upper(v_way)
        and (
          coalesce((s.metadata->>'geo_verified')::boolean,false)
          or coalesce((s.metadata->>'geofence_override_used')::boolean,false)
        )
    ) then
      raise exception 'ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
      )
    );

    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'arrival_verified',true,'build','FIELD_DELIVERY_COMPLETE_V77_CANONICAL'
    );
  end if;

  if v_action='exception' or v_action like '%delivery_exception%' or v_action like '%delivery_failed%' then
    return public.be_field_team_delivery_action_v71(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
      )
    )||jsonb_build_object('build','FIELD_DELIVERY_EXCEPTION_V77_CANONICAL');
  end if;

  return public.be_field_team_delivery_action(
    p_payload||jsonb_build_object(
      'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
    )
  )||jsonb_build_object('build','FIELD_DELIVERY_ACTION_V77_CANONICAL');
end;
$function$;

grant execute on function public.be_field_team_delivery_action_v77(jsonb) to authenticated;


-- Keep legacy Dispatch/Wayplan read models synchronized from the canonical stop.
create or replace function public.be_sync_rider_delivery_compat_v77()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_status text:=upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_public_status text;
begin
  v_public_status:=case
    when v_status in ('DELIVERED','COMPLETED') then 'DELIVERED'
    when v_status='ARRIVED_AT_CUSTOMER' then 'ARRIVED_AT_CUSTOMER'
    when v_status='OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
    when v_status in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED') then 'ATTEMPTED_FAILED'
    when v_status in ('RETURN_TO_WAREHOUSE','RTO') then 'RTO'
    else v_status
  end;

  update public.be_dispatch_job_assignments
  set delivery_status=v_public_status,
      dispatch_status=v_public_status,
      failed_reason=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,failed_reason)
        else failed_reason
      end,
      exception_status=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then v_public_status
        when v_public_status='DELIVERED' then null
        else exception_status
      end,
      last_exception_reason=case
        when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,last_exception_reason)
        else last_exception_reason
      end,
      updated_at=now()
  where (upper(tracking_no)=upper(new.delivery_way_id))
     or (wayplan_code=new.wayplan_id and upper(tracking_no)=upper(coalesce(new.tracking_no,new.delivery_way_id)));

  update public.be_wayplan_items
  set delivery_status=v_public_status,
      dispatch_status=v_public_status,
      item_status=v_public_status,
      delivered_at=case when v_public_status='DELIVERED' then coalesce(delivered_at,new.delivered_at,now()) else delivered_at end,
      failed_reason=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,failed_reason) else failed_reason end,
      exception_status=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then v_public_status when v_public_status='DELIVERED' then null else exception_status end,
      last_exception_reason=case when v_public_status in ('ATTEMPTED_FAILED','RTO') then coalesce(new.failed_reason,last_exception_reason) else last_exception_reason end,
      proof_photo_url=coalesce(new.proof_url,new.rider_proof_url,proof_photo_url),
      delivery_proof_photo_url=coalesce(new.rider_proof_url,new.proof_url,delivery_proof_photo_url),
      receiver_name=coalesce(new.receiver_name,receiver_name),
      receiver_phone=coalesce(new.receiver_phone,receiver_phone),
      updated_at=now()
  where (upper(coalesce(delivery_way_id,''))=upper(new.delivery_way_id))
     or (new.wayplan_id=coalesce(wayplan_id,wayplan_code)
         and upper(coalesce(tracking_no,''))=upper(coalesce(new.tracking_no,new.delivery_way_id)));

  return new;
end;
$function$;

drop trigger if exists be_sync_rider_delivery_compat_v77_trg on public.be_wayplan_dispatch_stops;
create trigger be_sync_rider_delivery_compat_v77_trg
after insert or update of stop_status,rider_status,dispatch_status,failed_reason,proof_url,rider_proof_url,receiver_name,receiver_phone
on public.be_wayplan_dispatch_stops
for each row
execute function public.be_sync_rider_delivery_compat_v77();


-- Compatibility layer: canonical versioned Wayplan stops are sufficient for
-- Rider delivery execution. A saved V45 Mapbox route plan is not required.
create or replace function public.be_rider_prepare_route_v77(
  p_wayplan_id text,
  p_worker_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_worker text:=upper(btrim(coalesce(p_worker_key,'')));
  v_operator jsonb;
  v_version integer;
  v_current integer;
  v_existing_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_wayplan is null then raise exception 'WAYPLAN_REQUIRED' using errcode='22023'; end if;

  v_operator:=public.be_rider_route_operator_v46(v_wayplan,v_worker);
  if not coalesce((v_operator->>'ok')::boolean,false) then
    raise exception 'ROUTE_NOT_ASSIGNED_TO_SIGNED_IN_WORKER: %',v_worker using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id=v_wayplan
      and m.membership_status in ('DISPATCHED','COMPLETED','RTO')
  ) and not exists(
    select 1
    from public.be_wayplan_dispatches w
    where w.wayplan_id=v_wayplan
      and upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY')
  ) then
    raise exception 'WAYPLAN_NOT_DISPATCHED_TO_FIELD: %',v_wayplan using errcode='22023';
  end if;

  select max(route_version) into v_version
  from public.be_wayplan_route_version_stops_v1
  where wayplan_id=v_wayplan;

  if v_version is null then
    raise exception 'WAYPLAN_STOP_COORDINATES_REQUIRED: no versioned stops for %',v_wayplan using errcode='22023';
  end if;

  select run_status into v_existing_status
  from public.be_rider_route_runs_v46
  where wayplan_id=v_wayplan;

  insert into public.be_rider_route_runs_v46(
    wayplan_id,run_status,route_version,
    assigned_rider_code,assigned_rider_name,
    assigned_driver_code,assigned_driver_name,
    metadata
  )
  values(
    v_wayplan,
    coalesce(v_existing_status,'ASSIGNED'),
    v_version,
    v_operator->>'rider_code',v_operator->>'rider_name',
    v_operator->>'driver_code',v_operator->>'driver_name',
    jsonb_build_object(
      'source','be_wayplan_route_version_stops_v1',
      'build','RIDER_ROUTE_PREPARE_V77'
    )
  )
  on conflict(wayplan_id) do update set
    route_version=excluded.route_version,
    assigned_rider_code=excluded.assigned_rider_code,
    assigned_rider_name=excluded.assigned_rider_name,
    assigned_driver_code=excluded.assigned_driver_code,
    assigned_driver_name=excluded.assigned_driver_name,
    metadata=coalesce(public.be_rider_route_runs_v46.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  insert into public.be_rider_route_stop_state_v46(
    wayplan_id,delivery_way_id,stop_sequence,stop_status,
    recipient_name,recipient_phone,address,township,
    longitude,latitude
  )
  select
    rv.wayplan_id,
    rv.delivery_way_id,
    rv.stop_sequence,
    case
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('RTO','RETURN_TO_WAREHOUSE') then 'RTO'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED') then 'FAILED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER' then 'ARRIVED'
      else 'PENDING'
    end,
    coalesce(s.recipient_name,d.recipient_name),
    coalesce(s.recipient_phone,d.contact_no_1),
    coalesce(s.address,d.recipient_address,loc.address_original),
    coalesce(s.township,d.township,loc.township),
    coalesce(rv.longitude,loc.longitude),
    coalesce(rv.latitude,loc.latitude)
  from public.be_wayplan_route_version_stops_v1 rv
  join public.be_wayplan_dispatch_stops s
    on s.wayplan_id=rv.wayplan_id and s.delivery_way_id=rv.delivery_way_id
  left join lateral(
    select dd.*
    from public.be_data_entry_parcel_details dd
    where dd.delivery_way_id=rv.delivery_way_id
    order by dd.updated_at desc nulls last,dd.saved_at desc nulls last
    limit 1
  ) d on true
  left join public.be_delivery_location_registry loc
    on loc.delivery_way_id=rv.delivery_way_id
  where rv.wayplan_id=v_wayplan
    and rv.route_version=v_version
  on conflict(wayplan_id,delivery_way_id) do update set
    stop_sequence=excluded.stop_sequence,
    recipient_name=excluded.recipient_name,
    recipient_phone=excluded.recipient_phone,
    address=excluded.address,
    township=excluded.township,
    longitude=coalesce(excluded.longitude,public.be_rider_route_stop_state_v46.longitude),
    latitude=coalesce(excluded.latitude,public.be_rider_route_stop_state_v46.latitude),
    stop_status=case
      when public.be_rider_route_stop_state_v46.stop_status in ('DELIVERED','FAILED','RTO')
        then public.be_rider_route_stop_state_v46.stop_status
      when public.be_rider_route_stop_state_v46.stop_status='ARRIVED'
        then 'ARRIVED'
      else excluded.stop_status
    end,
    updated_at=now();

  if exists(
    select 1
    from public.be_rider_route_stop_state_v46
    where wayplan_id=v_wayplan and (latitude is null or longitude is null)
      and stop_status in ('PENDING','ARRIVED')
  ) then
    raise exception 'WAYPLAN_STOP_COORDINATES_INCOMPLETE: %',v_wayplan using errcode='22023';
  end if;

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id=v_wayplan and stop_status in ('PENDING','ARRIVED');

  update public.be_rider_route_runs_v46
  set current_stop_sequence=v_current,updated_at=now()
  where wayplan_id=v_wayplan;

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan,
    'route_version',v_version,
    'current_stop_sequence',v_current,
    'operator',v_operator,
    'source','be_wayplan_route_version_stops_v1',
    'build','RIDER_ROUTE_PREPARE_V77'
  );
end;
$function$;

grant execute on function public.be_rider_prepare_route_v77(text,text) to authenticated;

create or replace function public.be_rider_arrive_customer_v77(
  p_wayplan_id text,
  p_delivery_way_id text,
  p_worker_key text,
  p_latitude numeric,
  p_longitude numeric,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_wayplan text:=btrim(coalesce(p_wayplan_id,''));
  v_way text:=upper(btrim(coalesce(p_delivery_way_id,'')));
  v_worker text:=upper(btrim(coalesce(p_worker_key,'')));
  v_operation text:=coalesce(nullif(btrim(coalesce(p_operation_id,'')),''),gen_random_uuid()::text);
  v_run_status text;
  v_current integer;
  v_sequence integer;
  v_stop_lat numeric;
  v_stop_lng numeric;
  v_stop_status text;
  v_distance numeric;
  v_radius numeric:=100;
  v_override_id uuid;
  v_geo_verified boolean:=false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_wayplan='' or v_way='' then raise exception 'WAYPLAN_AND_DELIVERY_WAY_REQUIRED' using errcode='22023'; end if;
  if p_latitude is null or p_longitude is null then raise exception 'GPS_REQUIRED' using errcode='22023'; end if;

  perform public.be_rider_prepare_route_v77(v_wayplan,v_worker);

  if exists(
    select 1 from public.be_rider_route_events_v46
    where operation_id=v_operation
  ) then
    select stop_sequence,latitude,longitude,stop_status,arrival_distance_m,geo_verified
      into v_sequence,v_stop_lat,v_stop_lng,v_stop_status,v_distance,v_geo_verified
    from public.be_rider_route_stop_state_v46
    where wayplan_id=v_wayplan and delivery_way_id=v_way;
    return jsonb_build_object(
      'ok',true,'duplicate_operation',true,'wayplan_id',v_wayplan,
      'delivery_way_id',v_way,'stop_sequence',v_sequence,'stop_status',v_stop_status,
      'distance_m',v_distance,'geo_verified',v_geo_verified,'build','RIDER_ARRIVE_CUSTOMER_V77'
    );
  end if;

  select run_status into v_run_status
  from public.be_rider_route_runs_v46
  where wayplan_id=v_wayplan
  for update;

  if v_run_status in ('ASSIGNED','ACCEPTED') then
    update public.be_rider_route_runs_v46
    set run_status='IN_PROGRESS',
        accepted_by=coalesce(accepted_by,v_worker),
        accepted_at=coalesce(accepted_at,now()),
        started_by=coalesce(started_by,v_worker),
        started_at=coalesce(started_at,now()),
        updated_at=now()
    where wayplan_id=v_wayplan;
    v_run_status:='IN_PROGRESS';
  end if;

  if v_run_status<>'IN_PROGRESS' then
    raise exception 'ROUTE_NOT_IN_PROGRESS: %',coalesce(v_run_status,'NULL') using errcode='22023';
  end if;

  select stop_sequence,latitude,longitude,stop_status
    into v_sequence,v_stop_lat,v_stop_lng,v_stop_status
  from public.be_rider_route_stop_state_v46
  where wayplan_id=v_wayplan and delivery_way_id=v_way
  for update;

  if not found then raise exception 'DELIVERY_STOP_NOT_FOUND' using errcode='P0002'; end if;

  if v_stop_status in ('DELIVERED','FAILED','RTO') then
    raise exception 'DELIVERY_STOP_ALREADY_TERMINAL: %',v_stop_status using errcode='22023';
  end if;

  select min(stop_sequence) into v_current
  from public.be_rider_route_stop_state_v46
  where wayplan_id=v_wayplan and stop_status in ('PENDING','ARRIVED');

  if v_sequence<>v_current then
    raise exception 'STOP_ORDER_ENFORCED: complete or fail stop % before stop %',v_current,v_sequence using errcode='22023';
  end if;

  select coalesce(numeric_value,100) into v_radius
  from public.be_rider_route_settings_v46
  where setting_key='delivery_arrival_radius_m';
  v_radius:=coalesce(v_radius,100);

  v_distance:=public.be_rider_distance_m_v46(
    p_latitude,p_longitude,v_stop_lat,v_stop_lng
  );

  if v_distance is null then raise exception 'DESTINATION_COORDINATES_REQUIRED' using errcode='22023'; end if;

  v_geo_verified:=v_distance<=v_radius;

  if not v_geo_verified then
    select id into v_override_id
    from public.be_rider_geofence_overrides_v50
    where wayplan_id=v_wayplan
      and delivery_way_id=v_way
      and used_at is null
      and expires_at>now()
    order by created_at desc
    limit 1
    for update skip locked;

    if v_override_id is null then
      raise exception 'GEOFENCE_OUTSIDE_RADIUS|distance_m=%|radius_m=%|supervisor_override_required=true',
        round(v_distance),round(v_radius) using errcode='22023';
    end if;
  end if;

  update public.be_rider_route_stop_state_v46
  set stop_status='ARRIVED',
      arrived_at=coalesce(arrived_at,now()),
      arrival_latitude=p_latitude,
      arrival_longitude=p_longitude,
      arrival_distance_m=v_distance,
      geo_verified=v_geo_verified,
      updated_at=now()
  where wayplan_id=v_wayplan and delivery_way_id=v_way;

  update public.be_rider_route_runs_v46
  set current_stop_sequence=v_sequence,
      last_latitude=p_latitude,last_longitude=p_longitude,
      last_gps_at=now(),updated_at=now()
  where wayplan_id=v_wayplan;

  insert into public.be_rider_route_events_v46(
    wayplan_id,delivery_way_id,event_type,operation_id,actor_key,
    latitude,longitude,payload
  )
  values(
    v_wayplan,v_way,'DELIVERY_STOP_ARRIVED',v_operation,v_worker,
    p_latitude,p_longitude,
    jsonb_build_object(
      'stop_sequence',v_sequence,
      'distance_m',v_distance,
      'geo_verified',v_geo_verified,
      'verification_radius_m',v_radius,
      'override_id',v_override_id,
      'source','V77_VERSIONED_STOP'
    )
  );

  if v_override_id is not null then
    update public.be_rider_geofence_overrides_v50
    set used_at=now(),
        used_by=coalesce(nullif(auth.jwt()->>'email',''),v_worker,auth.uid()::text)
    where id=v_override_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan,
    'delivery_way_id',v_way,
    'stop_sequence',v_sequence,
    'stop_status','ARRIVED',
    'distance_m',v_distance,
    'geofence_radius_m',v_radius,
    'inside_geofence',v_geo_verified,
    'geo_verified',v_geo_verified,
    'override_used',v_override_id is not null,
    'override_id',v_override_id,
    'build','RIDER_ARRIVE_CUSTOMER_V77'
  );
end;
$function$;

grant execute on function public.be_rider_arrive_customer_v77(text,text,text,numeric,numeric,text) to authenticated;

-- Final V77 action implementation: versioned Wayplan stops, no V45 dependency.
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
  v_result jsonb;
  v_operation text:=coalesce(
    nullif(btrim(p_payload->>'idempotency_key'),''),
    nullif(btrim(p_payload->>'operation_id'),''),
    gen_random_uuid()::text
  );
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_way is null then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;

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

    perform public.be_rider_prepare_route_v77(v_wayplan,v_code);

    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,
        'wayplan_id',v_wayplan,
        'operation_id',v_operation
      )
    );

    update public.be_rider_route_runs_v46
    set run_status=case when run_status in ('ASSIGNED','ACCEPTED') then 'IN_PROGRESS' else run_status end,
        accepted_by=coalesce(accepted_by,v_code),
        accepted_at=coalesce(accepted_at,now()),
        started_by=coalesce(started_by,v_code),
        started_at=coalesce(started_at,now()),
        updated_at=now()
    where wayplan_id=v_wayplan;

    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'route_prepared',true,
      'build','FIELD_DELIVERY_ACTION_V77'
    );
  end if;

  if v_action in ('arrive_customer','arrived_at_customer','arrive_delivery','delivery_arrived') then
    if v_role='helper' then
      return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can confirm customer arrival.');
    end if;

    begin
      v_lat:=nullif(btrim(coalesce(p_payload->>'latitude',p_payload->>'lat','')),'')::numeric;
      v_lng:=nullif(btrim(coalesce(p_payload->>'longitude',p_payload->>'lng','')),'')::numeric;
    exception when others then
      raise exception 'VALID_GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023';
    end;

    if v_lat is null or v_lng is null then raise exception 'GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL' using errcode='22023'; end if;

    v_result:=public.be_rider_arrive_customer_v77(
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
          'arrival_distance_m',v_result->'distance_m',
          'geo_verified',v_result->'geo_verified',
          'geofence_override_used',v_result->'override_used',
          'worker_code',v_code,'worker_role',v_role,'build','V77'
        )
    where wayplan_id=v_wayplan and delivery_way_id=v_way;

    update public.be_waybill_ledger
    set rider_status='ARRIVED_AT_CUSTOMER',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_arrived_at',now(),
          'arrival_distance_m',v_result->'distance_m',
          'geo_verified',v_result->'geo_verified',
          'geofence_override_used',v_result->'override_used',
          'build','V77'
        )
    where delivery_way_id=v_way or tracking_no=v_way;

    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'action','arrive_customer',
      'mobile_status','ARRIVED_AT_CUSTOMER',
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
        and (
          coalesce(rs.geo_verified,false)
          or exists(
            select 1 from public.be_rider_geofence_overrides_v50 o
            where o.wayplan_id=v_wayplan
              and o.delivery_way_id=v_way
              and o.used_at is not null
          )
        )
    ) then
      raise exception 'ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    if not exists(
      select 1 from public.be_wayplan_dispatch_stops s
      where s.wayplan_id=v_wayplan and s.delivery_way_id=v_way
        and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER'
    ) then
      raise exception 'ARRIVED_AT_CUSTOMER_STATUS_REQUIRED_BEFORE_DELIVERED' using errcode='22023';
    end if;

    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object(
        'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
      )
    );

    update public.be_rider_route_stop_state_v46
    set stop_status='DELIVERED',updated_at=now()
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
        'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
      )
    );

    perform public.be_rider_prepare_route_v77(v_wayplan,v_code);

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
      'delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation
    )
  )||jsonb_build_object('build','FIELD_DELIVERY_ACTION_V77');
end;
$function$;

grant execute on function public.be_field_team_delivery_action_v77(jsonb) to authenticated;
