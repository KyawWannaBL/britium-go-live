-- Full Operational Wayplan V1: Rider current-stop workflow, stop events and append-only reroutes.

create or replace function public.be_rider_active_wayplan_routes_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  d record;
  rv public.be_wayplan_route_versions_v1%rowtype;
  v_stops jsonb;
  v_current jsonb;
  v_plans jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;

  for d in
    select * from public.be_wayplan_dispatches w
    where upper(coalesce(w.wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED')
      and case v_role
        when 'driver' then upper(coalesce(w.driver_code,''))=v_code
        when 'helper' then upper(coalesce(w.helper_code,''))=v_code
        else upper(coalesce(w.rider_code,''))=v_code
      end
    order by coalesce(w.dispatched_at,w.planned_at,w.created_at) desc nulls last
  loop
    select * into rv
    from public.be_wayplan_route_versions_v1
    where wayplan_id=d.wayplan_id
      and route_version=coalesce(d.active_route_version,d.generated_route_version)
    limit 1;
    if not found then continue; end if;

    select coalesce(jsonb_agg(
      x.stop || jsonb_build_object(
        'active_sequence',coalesce((x.stop->>'sequence')::integer,x.ord::integer),
        'original_sequence',coalesce((s.metadata->>'generated_delivery_sequence')::integer,s.stop_sequence),
        'waybill_no',coalesce(nullif(s.waybill_no,''),x.stop->>'waybill_no'),
        'recipient_name',coalesce(nullif(s.recipient_name,''),nullif(s.receiver_name,''),x.stop->>'recipient_name'),
        'recipient_phone',coalesce(nullif(s.recipient_phone,''),nullif(s.receiver_phone,''),x.stop->>'recipient_phone'),
        'address',coalesce(nullif(s.delivery_address,''),nullif(s.address,''),x.stop->>'address'),
        'township',coalesce(nullif(s.delivery_township,''),nullif(s.recipient_township,''),nullif(s.township,''),x.stop->>'township'),
        'notes',coalesce(nullif(s.failed_reason,''),nullif(s.metadata->>'notes',''),nullif(s.warehouse_notes,''),x.stop->>'notes',''),
        'status',coalesce(nullif(s.stop_status,''),nullif(s.rider_status,''),nullif(s.dispatch_status,''),'PENDING'),
        'cod_amount',coalesce(s.cod_amount,s.amount_to_collect,0)
      ) order by coalesce((x.stop->>'sequence')::integer,x.ord::integer)
    ),'[]'::jsonb)
    into v_stops
    from jsonb_array_elements(rv.ordered_stops) with ordinality x(stop,ord)
    left join public.be_wayplan_dispatch_stops s
      on s.wayplan_id=d.wayplan_id and s.delivery_way_id=x.stop->>'delivery_way_id';

    select value into v_current
    from jsonb_array_elements(v_stops)
    where upper(coalesce(value->>'status','PENDING')) not in (
      'DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO','CUSTOMER_UNAVAILABLE','RESCHEDULE','SKIP','CANCELLED'
    )
    order by coalesce((value->>'active_sequence')::integer,999999)
    limit 1;

    v_plans:=v_plans||jsonb_build_array(jsonb_build_object(
      'wayplan_id',d.wayplan_id,'vehicle_code',d.vehicle_code,'vehicle_name',d.vehicle_name,
      'driver_code',d.driver_code,'rider_code',d.rider_code,'helper_code',d.helper_code,
      'generated_route_version',d.generated_route_version,'active_route_version',d.active_route_version,
      'route_version',rv.route_version,'route_kind',rv.route_kind,'route_source',rv.route_source,'route_mode',rv.route_mode,
      'distance_m',rv.distance_m,'duration_s',rv.duration_s,'generated_at',rv.generated_at,
      'current_stop',v_current,'stops',v_stops
    ));
  end loop;

  return jsonb_build_object('ok',true,'worker_code',v_code,'role',v_role,'plans',v_plans,'generated_at',now());
end $$;

revoke all on function public.be_rider_active_wayplan_routes_v1() from public,anon;
grant execute on function public.be_rider_active_wayplan_routes_v1() to authenticated;

create or replace function public.be_wayplan_save_rider_reroute_v1(p_wayplan_id text,p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_allowed boolean:=false;
  v_route_ids text[];
  v_remaining_ids text[];
  v_duplicates text[];
  v_version integer;
  v_parent integer;
  v_source text:=upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK'));
  v_mode text:=coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY');
  v_ordered jsonb:=coalesce(p_route->'ordered_stops','[]'::jsonb);
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver') then return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED'); end if;
  if v_wayplan is null then return jsonb_build_object('ok',false,'error','wayplan_id is required'); end if;
  if jsonb_typeof(v_ordered)<>'array' or jsonb_array_length(v_ordered)=0 then return jsonb_build_object('ok',false,'error','ordered_stops are required'); end if;

  select exists(select 1 from public.be_wayplan_dispatches w where w.wayplan_id=v_wayplan and
    case v_role when 'driver' then upper(coalesce(w.driver_code,''))=v_code else upper(coalesce(w.rider_code,''))=v_code end)
  into v_allowed;
  if not v_allowed then return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER'); end if;

  select array_agg(id order by id) into v_route_ids
  from (select nullif(btrim(value->>'delivery_way_id'),'') id from jsonb_array_elements(v_ordered)) q where id is not null;

  select array_agg(id) into v_duplicates from (
    select value->>'delivery_way_id' id,count(*) c from jsonb_array_elements(v_ordered)
    group by value->>'delivery_way_id' having count(*)>1
  ) q;
  if coalesce(cardinality(v_duplicates),0)>0 then return jsonb_build_object('ok',false,'error','Duplicate stop in reroute','duplicates',to_jsonb(v_duplicates)); end if;

  select array_agg(delivery_way_id order by delivery_way_id) into v_remaining_ids
  from public.be_wayplan_dispatch_stops
  where wayplan_id=v_wayplan and upper(coalesce(stop_status,rider_status,dispatch_status,'PENDING')) not in (
    'DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO','CUSTOMER_UNAVAILABLE','RESCHEDULE','SKIP','CANCELLED'
  );

  if coalesce(v_route_ids,'{}'::text[]) is distinct from coalesce(v_remaining_ids,'{}'::text[]) then
    return jsonb_build_object('ok',false,'error','Reroute must contain every remaining eligible stop exactly once','expected',to_jsonb(v_remaining_ids),'received',to_jsonb(v_route_ids));
  end if;

  select coalesce(active_route_version,generated_route_version) into v_parent from public.be_wayplan_dispatches where wayplan_id=v_wayplan for update;
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;

  insert into public.be_wayplan_route_versions_v1(
    wayplan_id,route_version,route_kind,route_source,route_mode,ordered_stops,distance_m,duration_s,request_count,parent_route_version,generated_by,metadata
  ) values (
    v_wayplan,v_version,'RIDER_REROUTE',v_source,v_mode,v_ordered,
    greatest(coalesce(nullif(p_route->>'distance_m','')::bigint,0),0),
    greatest(coalesce(nullif(p_route->>'duration_s','')::bigint,0),0),
    greatest(coalesce(nullif(p_route->>'request_count','')::integer,0),0),
    v_parent,v_code,
    jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','immutable',true)
  );

  update public.be_wayplan_dispatches
  set active_route_version=v_version,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_version,'last_reroute_source',v_source,'last_reroute_mode',v_mode,'last_reroute_by',v_code,'last_reroute_at',now()),
      updated_at=now()
  where wayplan_id=v_wayplan;

  insert into public.be_wayplan_route_stop_events_v1(wayplan_id,delivery_way_id,route_version,original_sequence,active_sequence,event_type,actor_code,actor_role,metadata)
  select v_wayplan,x.value->>'delivery_way_id',v_version,
         coalesce((s.metadata->>'generated_delivery_sequence')::integer,s.stop_sequence),
         coalesce((x.value->>'sequence')::integer,x.ordinality::integer),
         'REROUTED',v_code,v_role,jsonb_build_object('parent_route_version',v_parent,'source',v_source,'mode',v_mode)
  from jsonb_array_elements(v_ordered) with ordinality x(value,ordinality)
  left join public.be_wayplan_dispatch_stops s on s.wayplan_id=v_wayplan and s.delivery_way_id=x.value->>'delivery_way_id';

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version,'parent_route_version',v_parent,'route_source',v_source,'route_mode',v_mode,'warehouse_route_version_unchanged',(select generated_route_version from public.be_wayplan_dispatches where wayplan_id=v_wayplan));
end $$;

revoke all on function public.be_wayplan_save_rider_reroute_v1(text,jsonb) from public,anon;
grant execute on function public.be_wayplan_save_rider_reroute_v1(text,jsonb) to authenticated;

create or replace function public.be_rider_wayplan_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_role text:=lower(v_identity->>'role');
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_action text:=lower(coalesce(p_payload->>'action',''));
  v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery text:=nullif(btrim(p_payload->>'delivery_way_id'),'');
  v_allowed boolean:=false;
  v_result jsonb;
  v_event text;
  v_version integer;
  v_original integer;
  v_active integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_role='helper' and v_action in ('deliver','delivered','complete','complete_delivery','start_delivery','out_for_delivery','customer_unavailable','reschedule','rto','skip') then
    return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only the assigned rider or driver can control the delivery route.');
  end if;

  if v_action in ('customer_unavailable','reschedule','rto','skip') then
    if v_wayplan is null or v_delivery is null then return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required'); end if;
    select exists(select 1 from public.be_wayplan_membership_v40 m where m.wayplan_id=v_wayplan and m.delivery_way_id=v_delivery and
      case v_role when 'driver' then upper(coalesce(m.driver_code,''))=v_code when 'helper' then upper(coalesce(m.helper_code,''))=v_code else upper(coalesce(m.rider_code,''))=v_code end)
    into v_allowed;
    if not v_allowed then return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER'); end if;

    update public.be_wayplan_dispatch_stops
    set rider_status=upper(v_action),stop_status=case when v_action='rto' then 'RETURN_TO_WAREHOUSE' else upper(v_action) end,
        rider_action_at=now(),failed_reason=coalesce(nullif(p_payload->>'remark',''),nullif(p_payload->>'failed_reason',''),failed_reason),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_rider_action',v_action,'semantic_status',upper(v_action),'last_rider_action_at',now(),'actor_code',v_code),updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
    if not found then return jsonb_build_object('ok',false,'error','Wayplan stop not found'); end if;
    v_result:=jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'action',v_action,'status',case when v_action='rto' then 'RETURN_TO_WAREHOUSE' else upper(v_action) end);
  else
    v_result:=public.be_rider_wayplan_action_primary_guard_legacy_v101(p_payload||jsonb_build_object('authenticated_worker_code',v_code,'authenticated_worker_role',v_role));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  end if;

  v_event:=case v_action when 'arrived' then 'ARRIVED' when 'deliver' then 'DELIVERED' when 'customer_unavailable' then 'CUSTOMER_UNAVAILABLE' when 'reschedule' then 'RESCHEDULE' when 'rto' then 'RTO' when 'return' then 'RTO' when 'skip' then 'SKIP' else null end;
  if v_event is not null and v_wayplan is not null and v_delivery is not null then
    select coalesce(active_route_version,generated_route_version) into v_version from public.be_wayplan_dispatches where wayplan_id=v_wayplan;
    select coalesce((metadata->>'generated_delivery_sequence')::integer,stop_sequence) into v_original from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
    select coalesce((x.value->>'sequence')::integer,x.ordinality::integer) into v_active
    from public.be_wayplan_route_versions_v1 r, jsonb_array_elements(r.ordered_stops) with ordinality x(value,ordinality)
    where r.wayplan_id=v_wayplan and r.route_version=v_version and x.value->>'delivery_way_id'=v_delivery limit 1;
    insert into public.be_wayplan_route_stop_events_v1(wayplan_id,delivery_way_id,route_version,original_sequence,active_sequence,event_type,actor_code,actor_role,metadata)
    values(v_wayplan,v_delivery,v_version,v_original,v_active,v_event,v_code,v_role,coalesce(p_payload,'{}'::jsonb));
  end if;

  return v_result||jsonb_build_object('route_event',v_event,'route_version',v_version);
end $$;

revoke all on function public.be_rider_wayplan_action(jsonb) from public,anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;
