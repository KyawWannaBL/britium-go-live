-- Compatibility contract for the Rider Operational Route page.

create or replace function public.be_rider_operational_route_snapshot(p_wayplan_id text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_all jsonb:=public.be_rider_active_wayplan_routes_v1();
  v_plan jsonb;
  v_snapshot jsonb;
begin
  if coalesce((v_all->>'ok')::boolean,false)=false then return v_all; end if;
  if nullif(btrim(coalesce(p_wayplan_id,'')),'') is null then
    select value into v_plan from jsonb_array_elements(coalesce(v_all->'plans','[]'::jsonb)) limit 1;
  else
    select value into v_plan from jsonb_array_elements(coalesce(v_all->'plans','[]'::jsonb)) where value->>'wayplan_id'=p_wayplan_id limit 1;
  end if;
  if v_plan is null then return jsonb_build_object('ok',true,'wayplan_id',null,'message','No active Wayplan assigned.'); end if;

  select to_jsonb(w) into v_snapshot from public.be_wayplan_warehouse_route_snapshots_v1 w where w.wayplan_id=v_plan->>'wayplan_id';
  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_plan->>'wayplan_id',
    'route_version',(v_plan->>'route_version')::integer,
    'route_kind',v_plan->>'route_kind',
    'optimizer_source',v_plan->>'route_source',
    'route_mode',v_plan->>'route_mode',
    'distance_m',coalesce((v_plan->>'distance_m')::bigint,0),
    'duration_s',coalesce((v_plan->>'duration_s')::bigint,0),
    'current_stop',v_plan->'current_stop',
    'stops',v_plan->'stops',
    'warehouse_snapshot',v_snapshot,
    'warehouse_route_immutable',v_snapshot is not null
  );
end $$;

revoke all on function public.be_rider_operational_route_snapshot(text) from public,anon;
grant execute on function public.be_rider_operational_route_snapshot(text) to authenticated;

create or replace function public.be_rider_operational_route_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_result jsonb;
  v_snapshot jsonb;
  v_action text:=upper(coalesce(p_payload->>'action',''));
  v_wayplan text:=p_payload->>'wayplan_id';
begin
  v_result:=public.be_rider_wayplan_action(p_payload||jsonb_build_object('action',lower(v_action)));
  if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  v_snapshot:=public.be_rider_operational_route_snapshot(v_wayplan);
  return v_snapshot||jsonb_build_object(
    'action_result',v_result,
    'reroute_required',v_action in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP')
  );
end $$;

revoke all on function public.be_rider_operational_route_action(jsonb) from public,anon;
grant execute on function public.be_rider_operational_route_action(jsonb) to authenticated;

create or replace function public.be_rider_apply_operational_reroute(p_wayplan_id text,p_route jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_saved jsonb;
  v_snapshot jsonb;
begin
  v_saved:=public.be_wayplan_save_rider_reroute_v1(p_wayplan_id,p_route);
  if coalesce((v_saved->>'ok')::boolean,false)=false then return v_saved; end if;
  v_snapshot:=public.be_rider_operational_route_snapshot(p_wayplan_id);
  return v_snapshot||jsonb_build_object('reroute_saved',v_saved);
end $$;

revoke all on function public.be_rider_apply_operational_reroute(text,jsonb) from public,anon;
grant execute on function public.be_rider_apply_operational_reroute(text,jsonb) to authenticated;
