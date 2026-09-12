-- Full Operational Wayplan V1
-- Additive production upgrade: Rider crew allocation, immutable generated-route history,
-- immutable warehouse LIFO snapshot, Rider stop events, and active reroute versions.

create table if not exists public.be_wayplan_route_versions_v1 (
  wayplan_id text not null,
  route_version integer not null,
  route_kind text not null default 'GENERATED',
  optimizer_source text not null,
  route_mode text not null,
  origin jsonb not null default '{}'::jsonb,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  parent_route_version integer,
  reason text,
  generated_by text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (wayplan_id, route_version),
  constraint be_wayplan_route_versions_v1_kind_ck check (route_kind in ('GENERATED','RIDER_REROUTE'))
);

create table if not exists public.be_wayplan_route_current_v1 (
  wayplan_id text primary key,
  generated_route_version integer not null,
  active_route_version integer not null,
  warehouse_route_version integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.be_wayplan_warehouse_route_snapshot_v1 (
  wayplan_id text primary key,
  route_version integer not null,
  load_strategy text not null default 'LIFO',
  load_rows jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  constraint be_wayplan_warehouse_route_snapshot_v1_strategy_ck check (load_strategy='LIFO')
);

create table if not exists public.be_wayplan_stop_events_v1 (
  id bigserial primary key,
  wayplan_id text not null,
  delivery_way_id text not null,
  route_version integer not null,
  event_type text not null,
  actor_code text,
  actor_role text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint be_wayplan_stop_events_v1_event_ck check (event_type in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'))
);

create index if not exists be_wayplan_stop_events_v1_wayplan_idx on public.be_wayplan_stop_events_v1(wayplan_id,event_at desc);
create index if not exists be_wayplan_stop_events_v1_delivery_idx on public.be_wayplan_stop_events_v1(delivery_way_id,event_at desc);

alter table public.be_wayplan_route_versions_v1 enable row level security;
alter table public.be_wayplan_route_current_v1 enable row level security;
alter table public.be_wayplan_warehouse_route_snapshot_v1 enable row level security;
alter table public.be_wayplan_stop_events_v1 enable row level security;

revoke all on public.be_wayplan_route_versions_v1 from public,anon;
revoke all on public.be_wayplan_route_current_v1 from public,anon;
revoke all on public.be_wayplan_warehouse_route_snapshot_v1 from public,anon;
revoke all on public.be_wayplan_stop_events_v1 from public,anon;
grant select on public.be_wayplan_route_versions_v1 to authenticated;
grant select on public.be_wayplan_route_current_v1 to authenticated;
grant select on public.be_wayplan_warehouse_route_snapshot_v1 to authenticated;
grant select on public.be_wayplan_stop_events_v1 to authenticated;

create or replace function public.be_full_wayplan_actor_v1()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb; v_role text; v_code text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  begin
    v_identity:=private.be_field_primary_context_v101();
  exception when others then
    v_identity:='{}'::jsonb;
  end;
  v_role:=lower(coalesce(nullif(v_identity->>'role',''),public.be_current_user_role(),''));
  v_code:=coalesce(nullif(v_identity->>'worker_code',''),auth.jwt()->>'email',auth.uid()::text);
  return jsonb_build_object('uid',auth.uid(),'role',v_role,'code',v_code,'email',auth.jwt()->>'email');
end $$;
revoke all on function public.be_full_wayplan_actor_v1() from public,anon;
grant execute on function public.be_full_wayplan_actor_v1() to authenticated;

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
  if jsonb_typeof(v_ordered)<>'array' or jsonb_array_length(v_ordered)=0 then raise exception 'ordered_stops are required'; end if;
  if jsonb_array_length(v_ordered)>75 then raise exception 'A delivery Wayplan cannot exceed 75 stops'; end if;

  select array_agg(delivery_way_id order by delivery_way_id),count(*)::integer into v_members,v_count
  from public.be_wayplan_dispatch_stops where wayplan_id=p_wayplan_id;
  select array_agg(x.id order by x.id) into v_ids from (
    select nullif(btrim(value->>'delivery_way_id'),'') id from jsonb_array_elements(v_ordered)
  ) x where x.id is not null;
  if coalesce(cardinality(v_ids),0)<>coalesce(v_count,0) or v_ids is distinct from v_members then
    raise exception 'Generated route must contain every Wayplan stop exactly once';
  end if;
  if exists(select 1 from jsonb_array_elements(v_ordered) s group by s->>'delivery_way_id' having count(*)>1) then raise exception 'Duplicate delivery Way ID in generated route'; end if;

  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_route_versions_v1(wayplan_id,route_version,route_kind,optimizer_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,generated_by,metadata)
  values(p_wayplan_id,v_version,'GENERATED',upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')),coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),v_origin,v_ordered,
    coalesce(nullif(p_route->>'distance_m','')::numeric,0)::bigint,coalesce(nullif(p_route->>'duration_s','')::numeric,0)::bigint,coalesce(nullif(p_route->>'request_count','')::integer,0),v_actor,
    jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','immutable',true));

  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',v_count-(s->>'sequence')::integer+1,
    'delivery_sequence',(s->>'sequence')::integer,
    'delivery_way_id',s->>'delivery_way_id',
    'waybill_no',d.waybill_no,'recipient_name',d.recipient_name,'recipient_phone',d.recipient_phone,
    'address',d.address,'township',d.township,'parcel_weight_kg',d.parcel_weight_kg
  ) order by (s->>'sequence')::integer desc),'[]'::jsonb) into v_load
  from jsonb_array_elements(v_ordered) s join public.be_wayplan_dispatch_stops d on d.wayplan_id=p_wayplan_id and d.delivery_way_id=s->>'delivery_way_id';

  insert into public.be_wayplan_warehouse_route_snapshot_v1(wayplan_id,route_version,load_rows,created_by)
  values(p_wayplan_id,v_version,v_load,v_actor)
  on conflict(wayplan_id) do nothing;

  insert into public.be_wayplan_route_current_v1(wayplan_id,generated_route_version,active_route_version,warehouse_route_version)
  values(p_wayplan_id,v_version,v_version,v_version)
  on conflict(wayplan_id) do update set active_route_version=excluded.active_route_version,updated_at=now();

  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'generated_route_version',v_version,'active_route_version',v_version,'warehouse_route_version',coalesce((select route_version from public.be_wayplan_warehouse_route_snapshot_v1 where wayplan_id=p_wayplan_id),v_version),
    'route_source',upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')),'route_mode',coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY')
  ),updated_at=now() where wayplan_id=p_wayplan_id;

  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'generated_route_version',v_version,'warehouse_route_version',(select route_version from public.be_wayplan_warehouse_route_snapshot_v1 where wayplan_id=p_wayplan_id));
end $$;
revoke all on function public.be_wayplan_save_generated_route_v1(text,jsonb,text) from public,anon;
grant execute on function public.be_wayplan_save_generated_route_v1(text,jsonb,text) to authenticated;

create or replace function public.be_wayplan_save_rider_reroute_v1(p_wayplan_id text,p_route jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor jsonb:=public.be_full_wayplan_actor_v1(); v_current public.be_wayplan_route_current_v1%rowtype; v_version integer; v_ordered jsonb:=coalesce(p_route->'ordered_stops','[]'::jsonb); v_eligible text[]; v_ids text[];
begin
  if lower(v_actor->>'role') not in ('rider','driver','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then raise exception using errcode='42501',message='Rider or Wayplan operator permission is required.'; end if;
  select * into v_current from public.be_wayplan_route_current_v1 where wayplan_id=p_wayplan_id for update;
  if not found then raise exception 'Generated route version is required before Rider rerouting'; end if;
  select array_agg(delivery_way_id order by delivery_way_id) into v_eligible from public.be_wayplan_dispatch_stops
   where wayplan_id=p_wayplan_id and upper(coalesce(stop_status,rider_status,'')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','FAILED_DELIVERY','CANCELLED','SKIPPED','RESCHEDULED','CUSTOMER_UNAVAILABLE');
  select array_agg(x.id order by x.id) into v_ids from (select nullif(btrim(value->>'delivery_way_id'),'') id from jsonb_array_elements(v_ordered))x where x.id is not null;
  if coalesce(cardinality(v_ids),0)=0 then raise exception 'Reroute ordered_stops are required'; end if;
  if v_ids is distinct from v_eligible then raise exception 'Rider reroute must contain all and only remaining eligible stops'; end if;
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_route_versions_v1(wayplan_id,route_version,route_kind,optimizer_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,parent_route_version,reason,generated_by,metadata)
  values(p_wayplan_id,v_version,'RIDER_REROUTE',upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')),coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),coalesce(p_route->'origin','{}'::jsonb),v_ordered,
    coalesce(nullif(p_route->>'distance_m','')::numeric,0)::bigint,coalesce(nullif(p_route->>'duration_s','')::numeric,0)::bigint,coalesce(nullif(p_route->>'request_count','')::integer,0),v_current.active_route_version,p_reason,v_actor->>'code',jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','warehouse_route_version_unchanged',v_current.warehouse_route_version,'immutable',true));
  update public.be_wayplan_route_current_v1 set active_route_version=v_version,updated_at=now() where wayplan_id=p_wayplan_id;
  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_version,'warehouse_route_version',v_current.warehouse_route_version),updated_at=now() where wayplan_id=p_wayplan_id;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'active_route_version',v_version,'warehouse_route_version',v_current.warehouse_route_version,'warehouse_history_changed',false);
end $$;
revoke all on function public.be_wayplan_save_rider_reroute_v1(text,jsonb,text) from public,anon;
grant execute on function public.be_wayplan_save_rider_reroute_v1(text,jsonb,text) to authenticated;

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
  select coalesce(jsonb_agg(jsonb_build_object(
   'sequence',(r->>'sequence')::integer,'delivery_way_id',d.delivery_way_id,'waybill_no',d.waybill_no,'recipient_name',d.recipient_name,'recipient_phone',d.recipient_phone,
   'address',d.address,'township',d.township,'latitude',coalesce((r->>'latitude')::numeric,nullif(d.metadata->>'latitude','')::numeric),'longitude',coalesce((r->>'longitude')::numeric,nullif(d.metadata->>'longitude','')::numeric),
   'notes',coalesce(d.metadata->>'delivery_notes',d.metadata->>'notes',''),'status',coalesce(d.stop_status,d.rider_status,'PENDING')
  ) order by (r->>'sequence')::integer),'[]'::jsonb) into v_stops
  from jsonb_array_elements(v_route.ordered_stops) r join public.be_wayplan_dispatch_stops d on d.wayplan_id=p_wayplan_id and d.delivery_way_id=r->>'delivery_way_id';
  select x into v_current_stop from jsonb_array_elements(v_stops) x where upper(coalesce(x->>'status','')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','FAILED_DELIVERY','CANCELLED','SKIPPED','RESCHEDULED','CUSTOMER_UNAVAILABLE') order by (x->>'sequence')::integer limit 1;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'vehicle_code',v_plan.vehicle_code,'driver_code',v_plan.driver_code,'rider_code',v_plan.rider_code,'helper_code',v_plan.helper_code,
   'generated_route_version',v_current.generated_route_version,'active_route_version',v_current.active_route_version,'warehouse_route_version',v_current.warehouse_route_version,
   'route_kind',v_route.route_kind,'optimizer_source',v_route.optimizer_source,'route_mode',v_route.route_mode,'distance_m',v_route.distance_m,'duration_s',v_route.duration_s,
   'current_stop',v_current_stop,'stops',v_stops,'warehouse_history_immutable',true);
end $$;
revoke all on function public.be_rider_wayplan_snapshot_v1(text) from public,anon;
grant execute on function public.be_rider_wayplan_snapshot_v1(text) to authenticated;

create or replace function public.be_rider_stop_event_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor jsonb:=public.be_full_wayplan_actor_v1(); v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),''); v_delivery text:=nullif(btrim(p_payload->>'delivery_way_id'),''); v_event text:=upper(nullif(btrim(p_payload->>'event_type'),'')); v_current public.be_wayplan_route_current_v1%rowtype; v_result jsonb;
begin
  if lower(v_actor->>'role') not in ('rider','driver') then raise exception using errcode='42501',message='Assigned Rider or Driver is required.'; end if;
  if v_wayplan is null or v_delivery is null or v_event is null then raise exception 'wayplan_id, delivery_way_id and event_type are required'; end if;
  if v_event not in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP') then raise exception 'Unsupported stop event'; end if;
  if not exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan and upper(v_actor->>'code') in (upper(coalesce(d.rider_code,'')),upper(coalesce(d.driver_code,'')))) then raise exception using errcode='42501',message='Wayplan is not assigned to the signed-in Rider or Driver.'; end if;
  select * into v_current from public.be_wayplan_route_current_v1 where wayplan_id=v_wayplan;
  if not found then raise exception 'Generated route version is required'; end if;

  if v_event='ARRIVED' then
    v_result:=public.be_rider_wayplan_action(jsonb_build_object('wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'action','arrived'));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  elsif v_event='DELIVERED' then
    v_result:=public.be_rider_wayplan_action(p_payload||jsonb_build_object('action','deliver'));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  else
    update public.be_wayplan_dispatch_stops set stop_status=case v_event when 'CUSTOMER_UNAVAILABLE' then 'CUSTOMER_UNAVAILABLE' when 'RESCHEDULE' then 'RESCHEDULED' when 'RTO' then 'RETURN_TO_WAREHOUSE' else 'SKIPPED' end,
      rider_status=case v_event when 'CUSTOMER_UNAVAILABLE' then 'CUSTOMER_UNAVAILABLE' when 'RESCHEDULE' then 'RESCHEDULED' when 'RTO' then 'RETURN_TO_WAREHOUSE' else 'SKIPPED' end,
      failed_reason=coalesce(nullif(p_payload->>'reason',''),failed_reason),rider_action_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_route_event',v_event,'last_route_event_at',now(),'last_route_event_by',v_actor->>'code'),updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
    if not found then raise exception 'Wayplan stop not found'; end if;
  end if;

  insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_code,actor_role,payload)
  values(v_wayplan,v_delivery,v_current.active_route_version,v_event,v_actor->>'code',v_actor->>'role',p_payload);
  return public.be_rider_wayplan_snapshot_v1(v_wayplan)||jsonb_build_object('recorded_event',v_event,'reroute_recommended',v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'));
end $$;
revoke all on function public.be_rider_stop_event_v1(jsonb) from public,anon;
grant execute on function public.be_rider_stop_event_v1(jsonb) to authenticated;

-- Replace the multi-van context additively so Rider availability is included.
create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then raise exception using errcode='42501',message='Wayplan operator permission is required.'; end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type') order by record_key),'[]'::jsonb) into v_vehicles
 from public.be_master_data_rows where dataset_key='fleet_master' and deleted_at is null and upper(coalesce(status,'ACTIVE'))='ACTIVE' and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED') and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');
 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb) into v_busy
 from public.be_wayplan_dispatches where wayplan_status not in ('CANCELLED','COMPLETED','CLOSED');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,
   jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb) into v_route_origins
 from public.be_branch_offices where branch_code in ('YGN','MDY','NPT') and coalesce(active,true) and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins);
end $$;
revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

-- Strengthen same-Wayplan workforce exclusivity for Driver/Rider/Helper.
create or replace function public.be_wayplan_distinct_rider_helper_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare d text:=upper(btrim(coalesce(new.driver_code,''))); r text:=upper(btrim(coalesce(new.rider_code,''))); h text:=upper(btrim(coalesce(new.helper_code,'')));
begin
 if d<>'' and r<>'' and d=r then raise exception using errcode='23514',message='Driver and Rider must be different people on one Wayplan.'; end if;
 if d<>'' and h<>'' and d=h then raise exception using errcode='23514',message='Driver and Helper must be different people on one Wayplan.'; end if;
 if r<>'' and h<>'' and r=h then raise exception using errcode='23514',message='Rider and Helper must be different people on one Wayplan.'; end if;
 return new;
end $$;

-- Rider cannot be assigned to another active Wayplan at the same time.
create or replace function public.be_wayplan_active_rider_guard_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if nullif(btrim(coalesce(new.rider_code,'')),'') is not null and upper(coalesce(new.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED') and exists(
   select 1 from public.be_wayplan_dispatches d where d.id<>new.id and upper(coalesce(d.rider_code,''))=upper(new.rider_code) and upper(coalesce(d.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
 ) then raise exception using errcode='23514',message='Selected Rider already has another active Wayplan.'; end if;
 return new;
end $$;
drop trigger if exists trg_be_wayplan_active_rider_guard_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_active_rider_guard_v1 before insert or update of rider_code,wayplan_status on public.be_wayplan_dispatches for each row execute function public.be_wayplan_active_rider_guard_v1();

-- Replace multi-van creation to validate Rider and persist immutable generated-route + LIFO snapshots.
create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code');
 old_event jsonb; result jsonb; route_result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric; reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; branch text;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text); branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if; return old_event->'result'; end if;
 ctx:=public.be_multi_van_context();
 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   if n>75 then raise exception 'A delivery van cannot exceed 75 parcels.'; end if; total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY'; if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if; vans:=array_append(vans,p->>'vehicle_code');
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code'; if driver is null then raise exception 'Choose an active authenticated Driver.'; end if;
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code'; if rider is null then raise exception 'Choose an active authenticated Rider.'; end if;
   helper:=null; if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if; end if;
   if coalesce(driver->>'branch_code','') not in ('',branch) or coalesce(rider->>'branch_code','') not in ('',branch) or (helper is not null and coalesce(helper->>'branch_code','') not in ('',branch)) then raise exception 'Selected workforce belongs to another branch.'; end if;
   if p->>'driver_code'=p->>'rider_code' or (helper is not null and p->>'helper_code' in (p->>'driver_code',p->>'rider_code')) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (coalesce(p->>'helper_code','')<>'' and (p->>'helper_code')=any(crews)) then raise exception 'A workforce member cannot serve two positions/vans in this plan.'; end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or b->>'rider_code'=p->>'rider_code' or b->>'helper_code'=p->>'driver_code' or b->>'driver_code'=p->>'rider_code' or b->>'helper_code'=p->>'rider_code' or (helper is not null and (b->>'driver_code'=p->>'helper_code' or b->>'rider_code'=p->>'helper_code' or b->>'helper_code'=p->>'helper_code'))) then raise exception 'A selected vehicle or workforce member already has an active Wayplan. Refresh availability.'; end if;
   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if; ids:=array_append(ids,parcel_id); end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids')); if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then raise exception 'Operator approval and a reason are required for the van below 50 parcels.'; end if;
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code'; select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code'; select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code'; select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
   result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name','rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),'actor',actor));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
   update public.be_wayplan_dispatches set rider_code=p->>'rider_code',rider_name=rider->>'name',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason),updated_at=now() where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int,rider_code=p->>'rider_code',rider_name=rider->>'name' from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord) where s.wayplan_id=plan_id and s.delivery_way_id=x.id;
   route_result:=public.be_wayplan_save_generated_route_v1(plan_id,coalesce(p->'route','{}'::jsonb)||jsonb_build_object('origin',ctx->'route_origins'->region,'ordered_stops',(select jsonb_agg(jsonb_build_object('delivery_way_id',x.id,'sequence',x.ord,'latitude',l.latitude,'longitude',l.longitude) order by x.ord) from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord) join public.be_delivery_location_registry l on l.delivery_way_id=x.id)),actor);
   results:=results||jsonb_build_array(result||jsonb_build_object('route',route_result));
   if jsonb_array_length(p->'delivery_way_ids')<50 then insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id)); end if;
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;
revoke all on function public.be_generate_multi_van(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van(jsonb) to authenticated;
