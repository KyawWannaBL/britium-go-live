-- Full Operational Wayplan V1
-- Additive production upgrade: Rider crew allocation, immutable generated/reroute versions,
-- frozen warehouse LIFO snapshots, and audited Rider stop events.

create table if not exists public.be_wayplan_route_versions_v1 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  route_version integer not null,
  route_purpose text not null,
  route_source text not null,
  route_mode text not null,
  origin jsonb not null default '{}'::jsonb,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  parent_route_version integer,
  actor_id uuid,
  actor_code text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_wayplan_route_versions_v1_unique unique (wayplan_id, route_version),
  constraint be_wayplan_route_versions_v1_purpose check (route_purpose in ('GENERATED','RIDER_REROUTE')),
  constraint be_wayplan_route_versions_v1_stops_array check (jsonb_typeof(ordered_stops)='array')
);

create index if not exists idx_be_wayplan_route_versions_v1_wayplan
  on public.be_wayplan_route_versions_v1(wayplan_id, route_version desc);

create table if not exists public.be_wayplan_warehouse_load_versions_v1 (
  wayplan_id text primary key,
  generated_route_version integer not null,
  load_strategy text not null default 'LIFO',
  delivery_order jsonb not null default '[]'::jsonb,
  load_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  constraint be_wayplan_warehouse_load_versions_v1_strategy check (load_strategy='LIFO')
);

create table if not exists public.be_wayplan_stop_events_v1 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  delivery_way_id text not null,
  route_version integer,
  event_type text not null,
  actor_id uuid,
  actor_code text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint be_wayplan_stop_events_v1_event check (event_type in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'))
);

create index if not exists idx_be_wayplan_stop_events_v1_wayplan
  on public.be_wayplan_stop_events_v1(wayplan_id, event_at desc);
create index if not exists idx_be_wayplan_stop_events_v1_stop
  on public.be_wayplan_stop_events_v1(wayplan_id, delivery_way_id, event_at desc);

revoke all on public.be_wayplan_route_versions_v1 from anon, authenticated;
revoke all on public.be_wayplan_warehouse_load_versions_v1 from anon, authenticated;
revoke all on public.be_wayplan_stop_events_v1 from anon, authenticated;

create or replace function public.be_wayplan_distinct_rider_helper_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_driver text:=upper(nullif(btrim(coalesce(new.driver_code,'')),''));
  v_rider text:=upper(nullif(btrim(coalesce(new.rider_code,'')),''));
  v_helper text:=upper(nullif(btrim(coalesce(new.helper_code,'')),''));
begin
  if v_driver is not null and v_rider is not null and v_driver=v_rider then
    raise exception using errcode='23514',message='The same workforce member cannot be assigned as both Driver and Rider on one Wayplan.';
  end if;
  if v_driver is not null and v_helper is not null and v_driver=v_helper then
    raise exception using errcode='23514',message='The same workforce member cannot be assigned as both Driver and Helper on one Wayplan.';
  end if;
  if v_rider is not null and v_helper is not null and v_rider=v_helper then
    raise exception using errcode='23514',message='The same workforce member cannot be assigned as both Rider and Helper on one Wayplan.';
  end if;
  return new;
end $$;

-- Existing trigger, if present, continues to call the replaced function.

drop trigger if exists trg_be_wayplan_distinct_rider_helper_guard_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_distinct_rider_helper_guard_v1
before insert or update of driver_code,rider_code,helper_code on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_distinct_rider_helper_guard();

create or replace function public.be_multi_van_context()
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_options jsonb;
  v_vehicles jsonb;
  v_busy jsonb;
  v_role text;
  v_route_origins jsonb:='{}'::jsonb;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
    raise exception using errcode='42501',message='Wayplan operator permission is required.';
  end if;

  v_options:=public.be_wayplan_assignment_options_v44();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg',
    'operation_type',payload->>'operation_type') order by record_key),'[]'::jsonb)
  into v_vehicles
  from public.be_master_data_rows
  where dataset_key='fleet_master' and deleted_at is null
    and upper(coalesce(status,'ACTIVE'))='ACTIVE'
    and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
    and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');

  select coalesce(jsonb_agg(jsonb_build_object(
    'vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code
  )),'[]'::jsonb)
  into v_busy
  from public.be_wayplan_dispatches
  where upper(coalesce(wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED');

  select coalesce(jsonb_object_agg(
    case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' else branch_code end,
    jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)
  ),'{}'::jsonb)
  into v_route_origins
  from public.be_branch_offices
  where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;

  return jsonb_build_object(
    'vehicles',v_vehicles,
    'drivers',coalesce(v_options->'drivers','[]'::jsonb),
    'riders',coalesce(v_options->'riders','[]'::jsonb),
    'helpers',coalesce(v_options->'helpers','[]'::jsonb),
    'busy',v_busy,
    'route_origins',v_route_origins
  );
end $$;

revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_wayplan_current_route_version_v1(p_wayplan_id text)
returns integer
language sql
stable security definer
set search_path=public,pg_temp
as $$
  select max(route_version) from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id
$$;
revoke all on function public.be_wayplan_current_route_version_v1(text) from public,anon;
grant execute on function public.be_wayplan_current_route_version_v1(text) to authenticated;

create or replace function public.be_wayplan_save_rider_reroute_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_ordered jsonb:=coalesce(p_payload->'ordered_stops','[]'::jsonb);
  v_current integer;
  v_next integer;
  v_parent integer;
  v_expected text[];
  v_given text[];
begin
  if auth.uid() is null or v_role not in ('rider','driver') then
    raise exception using errcode='42501',message='Assigned Rider or Driver session is required.';
  end if;
  if v_wayplan is null or jsonb_typeof(v_ordered)<>'array' or jsonb_array_length(v_ordered)=0 then
    raise exception 'Wayplan and remaining ordered stops are required.';
  end if;
  if not exists(
    select 1 from public.be_wayplan_dispatches d
    where d.wayplan_id=v_wayplan
      and case when v_role='driver' then upper(coalesce(d.driver_code,''))=v_code else upper(coalesce(d.rider_code,''))=v_code end
  ) then raise exception using errcode='42501',message='This active Wayplan is not assigned to the signed-in worker.'; end if;

  select max(route_version) into v_current from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;
  if v_current is null then raise exception 'Generated route version is missing for %',v_wayplan; end if;
  v_parent:=v_current; v_next:=v_current+1;

  select array_agg(s.delivery_way_id order by s.delivery_way_id) into v_expected
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_wayplan
    and upper(coalesce(s.stop_status,s.rider_status,'PENDING')) not in
      ('DELIVERED','RETURN_TO_WAREHOUSE','RTO','SKIP','SKIPPED','RESCHEDULE','RESCHEDULED','CUSTOMER_UNAVAILABLE','FAILED_DELIVERY');

  select array_agg(x.id order by x.id) into v_given
  from (select nullif(btrim(value->>'delivery_way_id'),'') id from jsonb_array_elements(v_ordered)) x
  where x.id is not null;

  if coalesce(cardinality(v_given),0)<>jsonb_array_length(v_ordered) then raise exception 'Every reroute stop requires delivery_way_id.'; end if;
  if v_given is distinct from v_expected then raise exception 'Reroute must contain every remaining eligible stop exactly once.'; end if;

  insert into public.be_wayplan_route_versions_v1(
    wayplan_id,route_version,route_purpose,route_source,route_mode,origin,ordered_stops,
    distance_m,duration_s,request_count,parent_route_version,actor_id,actor_code,metadata
  ) values (
    v_wayplan,v_next,'RIDER_REROUTE',coalesce(nullif(p_payload->>'source',''),'GEOGRAPHIC_FALLBACK'),
    coalesce(nullif(p_payload->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),
    coalesce(p_payload->'origin','{}'::jsonb),v_ordered,
    coalesce(nullif(p_payload->>'distance_m','')::bigint,0),coalesce(nullif(p_payload->>'duration_s','')::bigint,0),
    coalesce(nullif(p_payload->>'request_count','')::integer,0),v_parent,auth.uid(),v_code,
    jsonb_build_object('reason',p_payload->>'reason','fallback',coalesce((p_payload->>'fallback')::boolean,false),'warning',p_payload->>'warning')
  );

  update public.be_wayplan_dispatches
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_next,'last_rerouted_at',now(),'last_rerouted_by',v_code),updated_at=now()
  where wayplan_id=v_wayplan;

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_next,'parent_route_version',v_parent,'warehouse_route_unchanged',true);
end $$;
revoke all on function public.be_wayplan_save_rider_reroute_v1(jsonb) from public,anon;
grant execute on function public.be_wayplan_save_rider_reroute_v1(jsonb) to authenticated;

create or replace function public.be_wayplan_rider_event_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery text:=nullif(btrim(p_payload->>'delivery_way_id'),'');
  v_event text:=upper(coalesce(p_payload->>'event_type',''));
  v_version integer;
  v_result jsonb;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then return jsonb_build_object('ok',false,'error','ASSIGNED_RIDER_OR_DRIVER_REQUIRED'); end if;
  if v_event not in ('ARRIVED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP') then return jsonb_build_object('ok',false,'error','INVALID_ROUTE_EVENT'); end if;
  if v_wayplan is null or v_delivery is null then return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required'); end if;
  if not exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan and case when v_role='driver' then upper(coalesce(d.driver_code,''))=v_code else upper(coalesce(d.rider_code,''))=v_code end) then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER');
  end if;

  if v_event='ARRIVED' then
    v_result:=public.be_rider_wayplan_action(jsonb_build_object('wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'action','arrived'));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  elsif v_event='RTO' then
    v_result:=public.be_rider_wayplan_action(jsonb_build_object('wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'action','return','failed_reason',coalesce(p_payload->>'reason','RTO')));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
  else
    update public.be_wayplan_dispatch_stops
    set rider_status=v_event,stop_status=v_event,rider_action_at=now(),
        failed_reason=case when v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','SKIP') then coalesce(nullif(p_payload->>'reason',''),failed_reason) else failed_reason end,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_route_event',v_event,'last_route_event_at',now(),'last_route_event_by',v_code),updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
    if not found then return jsonb_build_object('ok',false,'error','Wayplan stop not found'); end if;
  end if;

  select max(route_version) into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;
  insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_id,actor_code,payload)
  values(v_wayplan,v_delivery,v_version,v_event,auth.uid(),v_code,p_payload-'wayplan_id'-'delivery_way_id'-'event_type');

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'event_type',v_event,'route_version',v_version,'reroute_remaining',v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'));
end $$;
revoke all on function public.be_wayplan_rider_event_v1(jsonb) from public,anon;
grant execute on function public.be_wayplan_rider_event_v1(jsonb) to authenticated;

create or replace function public.be_wayplan_route_snapshot_v1(p_wayplan_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_plan public.be_wayplan_dispatches%rowtype;
  v_version public.be_wayplan_route_versions_v1%rowtype;
  v_generated public.be_wayplan_route_versions_v1%rowtype;
  v_warehouse jsonb;
  v_stops jsonb:='[]'::jsonb;
  v_events jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then raise exception 'Wayplan not found.'; end if;
  if v_role in ('rider','driver') and not (case when v_role='driver' then upper(coalesce(v_plan.driver_code,''))=v_code else upper(coalesce(v_plan.rider_code,''))=v_code end) then
    raise exception using errcode='42501',message='Wayplan is not assigned to this worker.';
  elsif v_role not in ('rider','driver','superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','warehouse') then
    raise exception using errcode='42501',message='Wayplan permission is required.';
  end if;

  select * into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id order by route_version desc limit 1;
  select * into v_generated from public.be_wayplan_route_versions_v1 where wayplan_id=p_wayplan_id and route_purpose='GENERATED' order by route_version asc limit 1;
  select to_jsonb(w) into v_warehouse from public.be_wayplan_warehouse_load_versions_v1 w where wayplan_id=p_wayplan_id;
  if v_version.id is null then raise exception 'Immutable route version is not available for this Wayplan.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',(x.stop->>'sequence')::integer,
    'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
    'recipient_name',coalesce(s.receiver_name,s.recipient_name),
    'recipient_phone',coalesce(s.receiver_phone,s.recipient_phone),
    'address',coalesce(s.delivery_address,s.address),'township',coalesce(s.delivery_township,s.recipient_township,s.township),
    'latitude',coalesce(nullif(x.stop->>'latitude','')::numeric,nullif(s.metadata->>'latitude','')::numeric),
    'longitude',coalesce(nullif(x.stop->>'longitude','')::numeric,nullif(s.metadata->>'longitude','')::numeric),
    'notes',coalesce(s.failed_reason,s.warehouse_notes,''),'status',coalesce(s.stop_status,s.rider_status,'PENDING'),
    'route_version',v_version.route_version
  ) order by (x.stop->>'sequence')::integer),'[]'::jsonb)
  into v_stops
  from jsonb_array_elements(v_version.ordered_stops) x(stop)
  join public.be_wayplan_dispatch_stops s on s.wayplan_id=p_wayplan_id and s.delivery_way_id=x.stop->>'delivery_way_id';

  select coalesce(jsonb_agg(to_jsonb(e) order by e.event_at desc),'[]'::jsonb) into v_events
  from public.be_wayplan_stop_events_v1 e where e.wayplan_id=p_wayplan_id;

  return jsonb_build_object(
    'ok',true,'wayplan_id',p_wayplan_id,'vehicle_code',v_plan.vehicle_code,'driver_code',v_plan.driver_code,'rider_code',v_plan.rider_code,'helper_code',v_plan.helper_code,
    'generated_route_version',v_generated.route_version,'active_route_version',v_version.route_version,
    'route_source',v_version.route_source,'route_mode',v_version.route_mode,'route_purpose',v_version.route_purpose,
    'origin',v_version.origin,'distance_m',v_version.distance_m,'duration_s',v_version.duration_s,
    'stops',v_stops,
    'current_stop',(select value from jsonb_array_elements(v_stops) value where upper(coalesce(value->>'status','PENDING')) not in ('DELIVERED','RETURN_TO_WAREHOUSE','RTO','SKIP','SKIPPED','RESCHEDULE','RESCHEDULED','CUSTOMER_UNAVAILABLE','FAILED_DELIVERY') order by (value->>'sequence')::integer limit 1),
    'warehouse_load_snapshot',v_warehouse,'events',v_events
  );
end $$;
revoke all on function public.be_wayplan_route_snapshot_v1(text) from public,anon;
grant execute on function public.be_wayplan_route_snapshot_v1(text) to authenticated;

create or replace function public.be_wayplan_lifo_manifest(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_role text:=lower(public.be_current_user_role());
  v_plan public.be_wayplan_dispatches%rowtype;
  v_snapshot public.be_wayplan_warehouse_load_versions_v1%rowtype;
  v_rows jsonb;
begin
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','warehouse') then
    raise exception using errcode='42501',message='Warehouse or Wayplan permission is required.';
  end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then raise exception 'Wayplan not found.'; end if;
  select * into v_snapshot from public.be_wayplan_warehouse_load_versions_v1 where wayplan_id=p_wayplan_id;
  if v_snapshot.wayplan_id is not null then
    return jsonb_build_object('ok',true,'wayplan_id',v_plan.wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
      'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO','generated_route_version',v_snapshot.generated_route_version,
      'immutable',true,'rows',v_snapshot.load_order);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1),
    'delivery_sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,'township',s.township,
    'recipient_name',s.recipient_name,'address',s.address,'parcel_weight_kg',s.parcel_weight_kg
  ) order by coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1)),'[]'::jsonb)
  into v_rows from public.be_wayplan_dispatch_stops s where s.wayplan_id=p_wayplan_id;
  return jsonb_build_object('ok',true,'wayplan_id',v_plan.wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
    'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO','immutable',false,'legacy_fallback',true,'rows',v_rows);
end $$;
revoke all on function public.be_wayplan_lifo_manifest(text) from public,anon;
grant execute on function public.be_wayplan_lifo_manifest(text) to authenticated;

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code');
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
 reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; branch text; route jsonb; ordered jsonb; load_rows jsonb; route_origin jsonb;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region is null or region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
 route_origin:=coalesce(ctx->'route_origins'->region,'{}'::jsonb);
 if route_origin='{}'::jsonb then raise exception 'The branch route origin is not configured.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then
   if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
   return old_event->'result';
 end if;

 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   if n>75 then raise exception 'A delivery van cannot exceed 75 parcels.'; end if;
   total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
   if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if; vans:=array_append(vans,p->>'vehicle_code');
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   if driver is null then raise exception 'Choose an active, authenticated driver.'; end if;
   if rider is null then raise exception 'Choose an active, authenticated rider.'; end if;
   if coalesce(driver->>'branch_code','') not in ('',branch) or coalesce(rider->>'branch_code','') not in ('',branch) then raise exception 'Driver or Rider belongs to another branch.'; end if;
   helper:=null;
   if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active helper or leave helper empty.'; end if; end if;
   if helper is not null and coalesce(helper->>'branch_code','') not in ('',branch) then raise exception 'Helper belongs to another branch.'; end if;
   if p->>'driver_code'=p->>'rider_code' or (helper is not null and (p->>'helper_code' in (p->>'driver_code',p->>'rider_code'))) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (coalesce(p->>'helper_code','')<>'' and (p->>'helper_code')=any(crews)) then raise exception 'A workforce member cannot serve two crew positions in this planning batch.'; end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code'
       or p->>'driver_code' in (coalesce(b->>'driver_code',''),coalesce(b->>'rider_code',''),coalesce(b->>'helper_code',''))
       or p->>'rider_code' in (coalesce(b->>'driver_code',''),coalesce(b->>'rider_code',''),coalesce(b->>'helper_code',''))
       or (helper is not null and p->>'helper_code' in (coalesce(b->>'driver_code',''),coalesce(b->>'rider_code',''),coalesce(b->>'helper_code','')))) then
     raise exception 'A selected vehicle or workforce member already has an active Wayplan. Refresh availability.';
   end if;
   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if; ids:=array_append(ids,parcel_id); end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
   if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then raise exception 'Operator approval and a reason are required for the van below 50 parcels.'; end if;
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;

 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx;
   if exists(select 1 from public.be_wayplan_dispatches where wayplan_id=plan_id) then raise exception 'Wayplan identifier already exists.'; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
   route:=coalesce(p->'route','{}'::jsonb);
   result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name',
     'rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),'actor',actor));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
   update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),
     'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason,'generated_route_version',1,'active_route_version',1,
     'route_source',coalesce(route->>'source','GEOGRAPHIC_FALLBACK'),'route_mode',coalesce(route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'))
   where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
   where s.wayplan_id=plan_id and s.delivery_way_id=x.id;

   select coalesce(jsonb_agg(jsonb_build_object('sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
     'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',coalesce(s.delivery_address,s.address),'township',coalesce(s.delivery_township,s.township),
     'latitude',nullif(s.metadata->>'latitude','')::numeric,'longitude',nullif(s.metadata->>'longitude','')::numeric) order by s.stop_sequence),'[]'::jsonb)
   into ordered from public.be_wayplan_dispatch_stops s where s.wayplan_id=plan_id;

   insert into public.be_wayplan_route_versions_v1(wayplan_id,route_version,route_purpose,route_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,actor_id,actor_code,metadata)
   values(plan_id,1,'GENERATED',coalesce(route->>'source','GEOGRAPHIC_FALLBACK'),coalesce(route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),route_origin,ordered,
     coalesce(nullif(route->>'distance_m','')::bigint,0),coalesce(nullif(route->>'duration_s','')::bigint,0),coalesce(nullif(route->>'request_count','')::integer,0),auth.uid(),actor,
     jsonb_build_object('fallback',coalesce((route->>'fallback')::boolean,false),'warning',route->>'warning','immutable_generated_route',true));

   select coalesce(jsonb_agg(jsonb_build_object('load_sequence',z.load_sequence,'delivery_sequence',z.delivery_sequence,'delivery_way_id',z.delivery_way_id,'waybill_no',z.waybill_no,
     'township',z.township,'recipient_name',z.recipient_name,'address',z.address,'parcel_weight_kg',z.parcel_weight_kg) order by z.load_sequence),'[]'::jsonb)
   into load_rows
   from (select row_number() over(order by s.stop_sequence desc)::integer load_sequence,s.stop_sequence delivery_sequence,s.delivery_way_id,s.waybill_no,s.township,s.recipient_name,s.address,s.parcel_weight_kg
         from public.be_wayplan_dispatch_stops s where s.wayplan_id=plan_id) z;
   insert into public.be_wayplan_warehouse_load_versions_v1(wayplan_id,generated_route_version,delivery_order,load_order,created_by,metadata)
   values(plan_id,1,ordered,load_rows,auth.uid(),jsonb_build_object('immutable',true,'source_route_version',1));

   results:=results||jsonb_build_array(result||jsonb_build_object('generated_route_version',1,'route_source',coalesce(route->>'source','GEOGRAPHIC_FALLBACK')));
   if jsonb_array_length(p->'delivery_way_ids')<50 then
     insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
     values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id));
   end if;
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count,'immutable_route_versions',true,'warehouse_lifo_frozen',true);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
 values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;

revoke all on function public.be_generate_multi_van(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van(jsonb) to authenticated;
