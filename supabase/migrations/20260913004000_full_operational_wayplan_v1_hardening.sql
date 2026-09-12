-- Full Operational Wayplan V1 hardening and Rider screen compatibility.

create or replace function public.be_wayplan_immutable_history_guard_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception using errcode='55000',message='Immutable Wayplan history cannot be updated or deleted.';
end $$;

drop trigger if exists trg_be_wayplan_route_versions_v1_immutable on public.be_wayplan_route_versions_v1;
create trigger trg_be_wayplan_route_versions_v1_immutable before update or delete on public.be_wayplan_route_versions_v1 for each row execute function public.be_wayplan_immutable_history_guard_v1();
drop trigger if exists trg_be_wayplan_warehouse_route_snapshot_v1_immutable on public.be_wayplan_warehouse_route_snapshot_v1;
create trigger trg_be_wayplan_warehouse_route_snapshot_v1_immutable before update or delete on public.be_wayplan_warehouse_route_snapshot_v1 for each row execute function public.be_wayplan_immutable_history_guard_v1();
drop trigger if exists trg_be_wayplan_stop_events_v1_immutable on public.be_wayplan_stop_events_v1;
create trigger trg_be_wayplan_stop_events_v1_immutable before update or delete on public.be_wayplan_stop_events_v1 for each row execute function public.be_wayplan_immutable_history_guard_v1();

-- Prevent a second generated/pre-dispatch route from replacing the warehouse snapshot.
create or replace function public.be_wayplan_save_generated_route_v1(p_wayplan_id text,p_route jsonb,p_actor text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_plan public.be_wayplan_dispatches%rowtype; v_count integer; v_ids text[]; v_members text[];
  v_actor text:=coalesce(nullif(btrim(p_actor),''),auth.jwt()->>'email',auth.uid()::text);
  v_origin jsonb:=coalesce(p_route->'origin','{}'::jsonb); v_ordered jsonb:=coalesce(p_route->'ordered_stops','[]'::jsonb);
  v_version integer:=1; v_load jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then raise exception 'Authenticated Wayplan operator is required'; end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id for update;
  if not found then raise exception 'Wayplan % not found',p_wayplan_id; end if;
  if exists(select 1 from public.be_wayplan_warehouse_route_snapshot_v1 where wayplan_id=p_wayplan_id) then
    raise exception 'Generated/pre-dispatch route is already locked for Wayplan %. Rider changes must create a reroute version.',p_wayplan_id;
  end if;
  if jsonb_typeof(v_ordered)<>'array' or jsonb_array_length(v_ordered)=0 then raise exception 'ordered_stops are required'; end if;
  if jsonb_array_length(v_ordered)>75 then raise exception 'A delivery Wayplan cannot exceed 75 stops'; end if;
  select array_agg(delivery_way_id order by delivery_way_id),count(*)::integer into v_members,v_count from public.be_wayplan_dispatch_stops where wayplan_id=p_wayplan_id;
  select array_agg(x.id order by x.id) into v_ids from (select nullif(btrim(value->>'delivery_way_id'),'') id from jsonb_array_elements(v_ordered)) x where x.id is not null;
  if coalesce(cardinality(v_ids),0)<>coalesce(v_count,0) or v_ids is distinct from v_members then raise exception 'Generated route must contain every Wayplan stop exactly once'; end if;
  if exists(select 1 from jsonb_array_elements(v_ordered) s group by s->>'delivery_way_id' having count(*)>1) then raise exception 'Duplicate delivery Way ID in generated route'; end if;
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_route_versions_v1(wayplan_id,route_version,route_kind,optimizer_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,generated_by,metadata)
  values(p_wayplan_id,v_version,'GENERATED',upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')),coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),v_origin,v_ordered,
    coalesce(public.be_wayplan_try_numeric_v45(p_route->>'distance_m'),0)::bigint,coalesce(public.be_wayplan_try_numeric_v45(p_route->>'duration_s'),0)::bigint,coalesce(public.be_wayplan_try_numeric_v45(p_route->>'request_count'),0)::integer,v_actor,
    jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','immutable',true));
  select coalesce(jsonb_agg(jsonb_build_object('load_sequence',v_count-(s->>'sequence')::integer+1,'delivery_sequence',(s->>'sequence')::integer,'delivery_way_id',s->>'delivery_way_id','waybill_no',d.waybill_no,'recipient_name',d.recipient_name,'recipient_phone',d.recipient_phone,'address',d.address,'township',d.township,'parcel_weight_kg',d.parcel_weight_kg) order by (s->>'sequence')::integer desc),'[]'::jsonb)
  into v_load from jsonb_array_elements(v_ordered) s join public.be_wayplan_dispatch_stops d on d.wayplan_id=p_wayplan_id and d.delivery_way_id=s->>'delivery_way_id';
  insert into public.be_wayplan_warehouse_route_snapshot_v1(wayplan_id,route_version,load_rows,created_by) values(p_wayplan_id,v_version,v_load,v_actor);
  insert into public.be_wayplan_route_current_v1(wayplan_id,generated_route_version,active_route_version,warehouse_route_version) values(p_wayplan_id,v_version,v_version,v_version);
  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('generated_route_version',v_version,'active_route_version',v_version,'warehouse_route_version',v_version,'route_source',upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')),'route_mode',coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY')),updated_at=now() where wayplan_id=p_wayplan_id;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'generated_route_version',v_version,'warehouse_route_version',v_version);
end $$;

create or replace function public.be_rider_wayplan_snapshot_v1(p_wayplan_id text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_actor jsonb:=public.be_full_wayplan_actor_v1(); v_plan public.be_wayplan_dispatches%rowtype; v_current public.be_wayplan_route_current_v1%rowtype; v_route public.be_wayplan_route_versions_v1%rowtype; v_stops jsonb; v_current_stop jsonb;
begin
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then raise exception 'Wayplan not found'; end if;
  if lower(v_actor->>'role') in ('rider','driver','helper') and upper(v_actor->>'code') not in (upper(coalesce(v_plan.rider_code,'')),upper(coalesce(v_plan.driver_code,'')),upper(coalesce(v_plan.helper_code,''))) then raise exception using errcode='42501',message='Wayplan is not assigned to the signed-in worker.'; end if;
  select * into v_current from public.be_wayplan_route_current_v1 where wayplan_id=p_wayplan_id;
  if not found then return jsonb_build_object('ok',false,'error','ROUTE_VERSION_NOT_GENERATED','wayplan_id',p_wayplan_id); end if;
  select * into v_route from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id and route_version=v_current.active_route_version;
  select coalesce(jsonb_agg(jsonb_build_object('sequence',(r->>'sequence')::integer,'delivery_way_id',d.delivery_way_id,'waybill_no',d.waybill_no,'recipient_name',d.recipient_name,'recipient_phone',d.recipient_phone,'address',d.address,'township',d.township,
   'latitude',coalesce(public.be_wayplan_try_numeric_v45(r->>'latitude'),public.be_wayplan_try_numeric_v45(d.metadata->>'latitude')),'longitude',coalesce(public.be_wayplan_try_numeric_v45(r->>'longitude'),public.be_wayplan_try_numeric_v45(d.metadata->>'longitude')),
   'notes',coalesce(d.metadata->>'delivery_notes',d.metadata->>'notes',''),'status',coalesce(d.stop_status,d.rider_status,'PENDING')) order by (r->>'sequence')::integer),'[]'::jsonb)
  into v_stops from jsonb_array_elements(v_route.ordered_stops) r join public.be_wayplan_dispatch_stops d on d.wayplan_id=p_wayplan_id and d.delivery_way_id=r->>'delivery_way_id';
  select x into v_current_stop from jsonb_array_elements(v_stops) x where upper(coalesce(x->>'status','')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','FAILED_DELIVERY','CANCELLED','SKIPPED','RESCHEDULED','CUSTOMER_UNAVAILABLE') order by (x->>'sequence')::integer limit 1;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'vehicle_code',v_plan.vehicle_code,'driver_code',v_plan.driver_code,'rider_code',v_plan.rider_code,'helper_code',v_plan.helper_code,
   'generated_route_version',v_current.generated_route_version,'active_route_version',v_current.active_route_version,'warehouse_route_version',v_current.warehouse_route_version,'route_kind',v_route.route_kind,'optimizer_source',v_route.optimizer_source,'route_mode',v_route.route_mode,'distance_m',v_route.distance_m,'duration_s',v_route.duration_s,'origin',v_route.origin,'current_stop',v_current_stop,'stops',v_stops,'warehouse_history_immutable',true);
end $$;

-- Existing Rider UI compatibility: find the signed-in worker's active Wayplan when no ID is supplied.
create or replace function public.be_rider_operational_route_snapshot(p_wayplan_id text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor jsonb:=public.be_full_wayplan_actor_v1(); v_wayplan text:=nullif(btrim(p_wayplan_id),''); v_base jsonb; v_wh public.be_wayplan_warehouse_route_snapshot_v1%rowtype; v_origin jsonb;
begin
  if lower(v_actor->>'role') not in ('rider','driver','helper','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then raise exception using errcode='42501',message='Operational Wayplan permission is required.'; end if;
  if v_wayplan is null then
    select d.wayplan_id into v_wayplan from public.be_wayplan_dispatches d
    where upper(v_actor->>'code') in (upper(coalesce(d.rider_code,'')),upper(coalesce(d.driver_code,'')),upper(coalesce(d.helper_code,'')))
      and upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED')
    order by coalesce(d.dispatched_at,d.planned_at,d.created_at) desc nulls last limit 1;
  end if;
  if v_wayplan is null then return jsonb_build_object('ok',true,'wayplan_id',null,'message','No active Wayplan assigned.'); end if;
  v_base:=public.be_rider_wayplan_snapshot_v1(v_wayplan);
  if coalesce((v_base->>'ok')::boolean,false)=false then return v_base; end if;
  select * into v_wh from public.be_wayplan_warehouse_route_snapshot_v1 where wayplan_id=v_wayplan;
  select origin into v_origin from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan and route_version=(v_base->>'generated_route_version')::integer;
  return v_base||jsonb_build_object('route_version',(v_base->>'active_route_version')::integer,'warehouse_snapshot',jsonb_build_object('generated_route_version',v_wh.route_version,'load_strategy',v_wh.load_strategy,'load_rows',v_wh.load_rows,'created_at',v_wh.created_at,'metadata',jsonb_build_object('origin',v_origin)),'warehouse_route_immutable',true);
end $$;
revoke all on function public.be_rider_operational_route_snapshot(text) from public,anon;
grant execute on function public.be_rider_operational_route_snapshot(text) to authenticated;

create or replace function public.be_rider_operational_route_action(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_action text:=upper(coalesce(p_payload->>'action','')); v_event text; v_result jsonb;
begin
  v_event:=case v_action when 'ARRIVED' then 'ARRIVED' when 'CUSTOMER_UNAVAILABLE' then 'CUSTOMER_UNAVAILABLE' when 'RESCHEDULE' then 'RESCHEDULE' when 'RTO' then 'RTO' when 'SKIP' then 'SKIP' else null end;
  if v_event is null then raise exception 'Unsupported operational route action'; end if;
  v_result:=public.be_rider_stop_event_v1(p_payload||jsonb_build_object('event_type',v_event,'reason',coalesce(p_payload->>'remark',p_payload->>'reason')));
  return v_result||jsonb_build_object('route_version',v_result->'active_route_version','warehouse_snapshot',jsonb_build_object('generated_route_version',v_result->'warehouse_route_version'),'warehouse_route_immutable',true,'reroute_required',v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'));
end $$;
revoke all on function public.be_rider_operational_route_action(jsonb) from public,anon;
grant execute on function public.be_rider_operational_route_action(jsonb) to authenticated;

create or replace function public.be_rider_apply_operational_reroute(p_wayplan_id text,p_route jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_saved jsonb; v_snapshot jsonb;
begin
  v_saved:=public.be_wayplan_save_rider_reroute_v1(p_wayplan_id,p_route,'Rider operational reroute after stop exception');
  v_snapshot:=public.be_rider_operational_route_snapshot(p_wayplan_id);
  return v_snapshot||jsonb_build_object('route_version',v_saved->'active_route_version','warehouse_route_immutable',true);
end $$;
revoke all on function public.be_rider_apply_operational_reroute(text,jsonb) from public,anon;
grant execute on function public.be_rider_apply_operational_reroute(text,jsonb) to authenticated;

-- Capture delivery completion in the immutable stop-event stream even when completed through the existing proof workflow.
create or replace function public.be_wayplan_delivery_event_audit_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_route integer; v_actor text;
begin
  if upper(coalesce(new.stop_status,new.rider_status,''))='DELIVERED' and upper(coalesce(old.stop_status,old.rider_status,''))<>'DELIVERED' then
    select active_route_version into v_route from public.be_wayplan_route_current_v1 where wayplan_id=new.wayplan_id;
    if v_route is not null then
      v_actor:=coalesce(new.metadata->>'confirmed_by_workforce_code',new.metadata->>'last_rider_action_by',new.rider_code);
      insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_code,actor_role,payload)
      values(new.wayplan_id,new.delivery_way_id,v_route,'DELIVERED',v_actor,'rider',jsonb_build_object('source','existing_delivery_proof_workflow','delivered_at',new.delivered_at,'proof_url',new.rider_proof_url));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_be_wayplan_delivery_event_audit_v1 on public.be_wayplan_dispatch_stops;
create trigger trg_be_wayplan_delivery_event_audit_v1 after update of stop_status,rider_status on public.be_wayplan_dispatch_stops for each row execute function public.be_wayplan_delivery_event_audit_v1();
