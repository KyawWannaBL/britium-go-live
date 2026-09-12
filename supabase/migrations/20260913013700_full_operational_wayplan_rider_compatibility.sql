-- Wire the existing RiderOperationalRoutePage RPC contract to the new immutable route-version layer.

create or replace function public.be_my_operational_wayplans_v1()
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_code text:=upper(v_identity->>'worker_code');
  v_role text:=lower(v_identity->>'role');
  v_rows jsonb;
begin
  if auth.uid() is null or v_role not in ('rider','driver','helper') then
    return jsonb_build_object('ok',false,'error','FIELD_ROLE_REQUIRED','wayplans','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.planned_at desc nulls last,x.wayplan_id),'[]'::jsonb)
  into v_rows
  from (
    select d.wayplan_id,d.wayplan_status,d.vehicle_code,d.vehicle_name,d.driver_code,d.driver_name,d.rider_code,d.rider_name,d.helper_code,d.helper_name,d.planned_at,d.dispatched_at,
      coalesce((d.metadata->>'active_route_version')::integer,0) as active_route_version
    from public.be_wayplan_dispatches d
    where upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
      and case v_role
        when 'driver' then upper(coalesce(d.driver_code,''))=v_code
        when 'helper' then upper(coalesce(d.helper_code,''))=v_code
        else upper(coalesce(d.rider_code,''))=v_code
      end
  ) x;
  return jsonb_build_object('ok',true,'worker_code',v_code,'role',v_role,'wayplans',v_rows);
end $$;
revoke all on function public.be_my_operational_wayplans_v1() from public,anon;
grant execute on function public.be_my_operational_wayplans_v1() to authenticated;

create or replace function public.be_operational_wayplan_snapshot_v1(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_wayplan text:=nullif(btrim(p_wayplan_id),'');
  v_plan jsonb; v_version integer; v_route jsonb; v_stops jsonb; v_events jsonb;
  v_role text:=lower(public.be_current_user_role()); v_identity jsonb; v_code text; v_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select to_jsonb(d),coalesce((d.metadata->>'active_route_version')::integer,0) into v_plan,v_version
  from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan;
  if v_plan is null then raise exception 'Wayplan not found'; end if;
  if v_role in ('rider','driver','helper') then
    v_identity:=private.be_field_primary_context_v101(); v_code:=upper(v_identity->>'worker_code');
    v_allowed:=case v_role when 'driver' then upper(coalesce(v_plan->>'driver_code',''))=v_code when 'helper' then upper(coalesce(v_plan->>'helper_code',''))=v_code else upper(coalesce(v_plan->>'rider_code',''))=v_code end;
    if not v_allowed then raise exception using errcode='42501',message='Wayplan is not assigned to the signed-in field worker.'; end if;
  end if;
  if v_version<=0 then
    return jsonb_build_object('ok',true,'wayplan',v_plan,'active_route',null,'stops','[]'::jsonb,'events','[]'::jsonb,'message','This Wayplan predates immutable Generated Route Version creation. It was not rewritten.');
  end if;
  select to_jsonb(r) into v_route from public.be_wayplan_route_versions_v1 r where r.wayplan_id=v_wayplan and r.route_version=v_version;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.stop_sequence),'[]'::jsonb) into v_stops from (
    select rv.stop_sequence,rv.delivery_way_id,rv.latitude,rv.longitude,d.waybill_no,d.recipient_name,d.recipient_phone,d.address,d.township,
      coalesce(nullif(d.metadata->>'delivery_notes',''),nullif(d.metadata->>'notes',''),nullif(d.warehouse_notes,'')) as notes,
      d.stop_status,d.rider_status,d.cod_amount,d.failed_reason,d.metadata,
      ws.delivery_sequence as warehouse_delivery_sequence,ws.load_sequence as warehouse_load_sequence
    from public.be_wayplan_route_version_stops_v1 rv
    join public.be_wayplan_dispatch_stops d on d.wayplan_id=rv.wayplan_id and d.delivery_way_id=rv.delivery_way_id
    left join public.be_wayplan_warehouse_loading_snapshots_v1 ws on ws.wayplan_id=rv.wayplan_id and ws.delivery_way_id=rv.delivery_way_id
    where rv.wayplan_id=v_wayplan and rv.route_version=v_version
  ) x;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb) into v_events from public.be_wayplan_stop_events_v1 e where e.wayplan_id=v_wayplan;
  return jsonb_build_object('ok',true,'wayplan',v_plan,'active_route',v_route,'stops',v_stops,'events',v_events);
end $$;
revoke all on function public.be_operational_wayplan_snapshot_v1(text) from public,anon;
grant execute on function public.be_operational_wayplan_snapshot_v1(text) to authenticated;

create or replace function public.be_rider_operational_route_snapshot(p_wayplan_id text default null)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=private.be_field_primary_context_v101(); v_code text:=upper(v_identity->>'worker_code'); v_role text:=lower(v_identity->>'role');
  v_wayplan text:=nullif(btrim(p_wayplan_id),''); v_base jsonb; v_route jsonb; v_stops jsonb; v_current jsonb; v_generated jsonb; v_warehouse jsonb; v_version integer;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then return jsonb_build_object('ok',false,'error','PRIMARY_RIDER_OR_DRIVER_REQUIRED'); end if;
  if v_wayplan is null then
    select d.wayplan_id into v_wayplan from public.be_wayplan_dispatches d
    where upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
      and (case when v_role='driver' then upper(coalesce(d.driver_code,''))=v_code else upper(coalesce(d.rider_code,''))=v_code end)
    order by d.dispatched_at desc nulls last,d.planned_at desc nulls last,d.created_at desc nulls last limit 1;
  end if;
  if v_wayplan is null then return jsonb_build_object('ok',true,'wayplan_id',null,'message','No active Wayplan assigned.'); end if;
  v_base:=public.be_operational_wayplan_snapshot_v1(v_wayplan);
  if v_base->'active_route' is null then return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'message',coalesce(v_base->>'message','No immutable generated route exists for this older Wayplan.')); end if;
  v_route:=v_base->'active_route'; v_version:=(v_route->>'route_version')::integer;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',x.stop_sequence,'delivery_way_id',x.delivery_way_id,'waybill_no',x.waybill_no,'recipient_name',x.recipient_name,'recipient_phone',x.recipient_phone,
    'address',x.address,'township',x.township,'notes',x.notes,'status',coalesce(x.stop_status,x.rider_status,'PENDING'),'latitude',x.latitude,'longitude',x.longitude
  ) order by x.stop_sequence),'[]'::jsonb)
  into v_stops
  from jsonb_to_recordset(v_base->'stops') as x(stop_sequence integer,delivery_way_id text,waybill_no text,recipient_name text,recipient_phone text,address text,township text,notes text,stop_status text,rider_status text,latitude numeric,longitude numeric);
  select value into v_current from jsonb_array_elements(v_stops) value
  where upper(coalesce(value->>'status','PENDING')) not in ('DELIVERED','RTO','SKIP','SKIPPED','RESCHEDULE','DELIVERY_RESCHEDULED','CUSTOMER_UNAVAILABLE','RETURN_TO_WAREHOUSE','FAILED_DELIVERY','CANCELLED')
  order by (value->>'sequence')::integer limit 1;
  select to_jsonb(r) into v_generated from public.be_wayplan_route_versions_v1 r where r.wayplan_id=v_wayplan and r.version_type='GENERATED' order by r.route_version limit 1;
  select jsonb_build_object('generated_route_version',coalesce((v_generated->>'route_version')::integer,1),'metadata',jsonb_build_object('origin',coalesce(v_generated->'origin','{}'::jsonb)),'loading_stops',coalesce(jsonb_agg(to_jsonb(w) order by w.load_sequence),'[]'::jsonb)) into v_warehouse
  from public.be_wayplan_warehouse_loading_snapshots_v1 w where w.wayplan_id=v_wayplan;
  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version,'route_kind',v_route->>'version_type','optimizer_source',v_route->>'route_source','route_mode',v_route->>'route_mode','distance_m',(v_route->>'distance_m')::bigint,'duration_s',(v_route->>'duration_s')::bigint,'current_stop',v_current,'stops',v_stops,'warehouse_snapshot',v_warehouse,'warehouse_route_immutable',jsonb_array_length(coalesce(v_warehouse->'loading_stops','[]'::jsonb))>0);
end $$;
revoke all on function public.be_rider_operational_route_snapshot(text) from public,anon;
grant execute on function public.be_rider_operational_route_snapshot(text) to authenticated;

create or replace function public.be_rider_operational_route_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_action text:=upper(nullif(btrim(p_payload->>'action'),'')); v_event text; v_result jsonb; v_snapshot jsonb;
begin
  v_event:=case v_action when 'ARRIVED' then 'ARRIVED' when 'CUSTOMER_UNAVAILABLE' then 'CUSTOMER_UNAVAILABLE' when 'RESCHEDULE' then 'RESCHEDULE' when 'RTO' then 'RTO' when 'SKIP' then 'SKIP' else null end;
  if v_event is null then return jsonb_build_object('ok',false,'error','INVALID_OPERATIONAL_ROUTE_ACTION'); end if;
  v_result:=public.be_record_operational_stop_event_v1(p_payload||jsonb_build_object('event_type',v_event,'reason',coalesce(p_payload->>'remark',p_payload->>'reason')));
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  v_snapshot:=public.be_rider_operational_route_snapshot(p_payload->>'wayplan_id');
  return v_snapshot||jsonb_build_object('reroute_required',coalesce((v_result->>'requires_reroute')::boolean,false),'recorded_event',v_event);
end $$;
revoke all on function public.be_rider_operational_route_action(jsonb) from public,anon;
grant execute on function public.be_rider_operational_route_action(jsonb) to authenticated;

create or replace function public.be_rider_apply_operational_reroute(p_wayplan_id text,p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_result jsonb;
begin
  v_result:=public.be_apply_rider_reroute_v1(jsonb_build_object('wayplan_id',p_wayplan_id,'reason','Rider remaining-stop reroute','route',p_route));
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  return public.be_rider_operational_route_snapshot(p_wayplan_id);
end $$;
revoke all on function public.be_rider_apply_operational_reroute(text,jsonb) from public,anon;
grant execute on function public.be_rider_apply_operational_reroute(text,jsonb) to authenticated;

-- Delivery completion remains under the existing proof/payment/signature guard. This audit trigger
-- observes a successful transition to DELIVERED and records it against the active route version.
create or replace function public.be_wayplan_delivered_event_audit_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_version integer; v_actor uuid:=auth.uid(); v_code text; v_role text;
begin
  if upper(coalesce(new.stop_status,''))='DELIVERED' and upper(coalesce(old.stop_status,'')) is distinct from 'DELIVERED' then
    select coalesce((d.metadata->>'active_route_version')::integer,0) into v_version from public.be_wayplan_dispatches d where d.wayplan_id=new.wayplan_id;
    if v_version>0 then
      begin v_code:=upper(private.be_field_primary_context_v101()->>'worker_code'); v_role:=lower(private.be_field_primary_context_v101()->>'role'); exception when others then v_code:=null;v_role:=null; end;
      insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_id,actor_code,actor_role,payload)
      values(new.wayplan_id,new.delivery_way_id,v_version,'DELIVERED',v_actor,v_code,v_role,jsonb_build_object('source','DELIVERY_PROOF_WORKFLOW','stop_status',new.stop_status));
    end if;
  end if;
  return new;
end $$;
revoke all on function public.be_wayplan_delivered_event_audit_v1() from public,anon,authenticated;
drop trigger if exists trg_be_wayplan_delivered_event_audit_v1 on public.be_wayplan_dispatch_stops;
create trigger trg_be_wayplan_delivered_event_audit_v1
after update of stop_status on public.be_wayplan_dispatch_stops
for each row execute function public.be_wayplan_delivered_event_audit_v1();
