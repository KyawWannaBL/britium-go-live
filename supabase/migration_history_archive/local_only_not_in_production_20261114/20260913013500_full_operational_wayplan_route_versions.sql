-- Full Operational Wayplan: immutable generated route versions, Rider reroute history,
-- Rider allocation protection, stop event audit and immutable warehouse LIFO snapshots.

create table if not exists public.be_wayplan_route_versions_v1 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  route_version integer not null,
  version_type text not null check (version_type in ('GENERATED','RIDER_REROUTE','OPERATOR_RECALCULATION')),
  route_source text not null,
  route_mode text not null,
  origin jsonb not null default '{}'::jsonb,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  fallback boolean not null default false,
  reason text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (wayplan_id, route_version)
);

create table if not exists public.be_wayplan_route_version_stops_v1 (
  wayplan_id text not null,
  route_version integer not null,
  delivery_way_id text not null,
  stop_sequence integer not null,
  latitude numeric,
  longitude numeric,
  stop_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (wayplan_id, route_version, delivery_way_id),
  unique (wayplan_id, route_version, stop_sequence)
);

create table if not exists public.be_wayplan_warehouse_loading_snapshots_v1 (
  wayplan_id text not null,
  generated_route_version integer not null,
  delivery_way_id text not null,
  delivery_sequence integer not null,
  load_sequence integer not null,
  stop_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (wayplan_id, delivery_way_id),
  unique (wayplan_id, load_sequence)
);

create table if not exists public.be_wayplan_stop_events_v1 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  delivery_way_id text not null,
  route_version integer not null,
  event_type text not null check (event_type in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP')),
  actor_id uuid,
  actor_code text,
  actor_role text,
  latitude numeric,
  longitude numeric,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wayplan_route_versions_v1_wayplan on public.be_wayplan_route_versions_v1(wayplan_id, route_version desc);
create index if not exists idx_wayplan_stop_events_v1_wayplan on public.be_wayplan_stop_events_v1(wayplan_id, created_at desc);

create or replace function public.be_operational_wayplan_immutable_guard_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception using errcode='55000', message='Generated route history and warehouse loading snapshots are immutable.';
end $$;

revoke all on function public.be_operational_wayplan_immutable_guard_v1() from public,anon,authenticated;

drop trigger if exists trg_route_versions_immutable_v1 on public.be_wayplan_route_versions_v1;
create trigger trg_route_versions_immutable_v1 before update or delete on public.be_wayplan_route_versions_v1
for each row execute function public.be_operational_wayplan_immutable_guard_v1();

drop trigger if exists trg_route_version_stops_immutable_v1 on public.be_wayplan_route_version_stops_v1;
create trigger trg_route_version_stops_immutable_v1 before update or delete on public.be_wayplan_route_version_stops_v1
for each row execute function public.be_operational_wayplan_immutable_guard_v1();

drop trigger if exists trg_warehouse_loading_immutable_v1 on public.be_wayplan_warehouse_loading_snapshots_v1;
create trigger trg_warehouse_loading_immutable_v1 before update or delete on public.be_wayplan_warehouse_loading_snapshots_v1
for each row execute function public.be_operational_wayplan_immutable_guard_v1();

revoke all on table public.be_wayplan_route_versions_v1 from anon;
revoke all on table public.be_wayplan_route_version_stops_v1 from anon;
revoke all on table public.be_wayplan_warehouse_loading_snapshots_v1 from anon;
revoke all on table public.be_wayplan_stop_events_v1 from anon;
grant select on public.be_wayplan_route_versions_v1, public.be_wayplan_route_version_stops_v1, public.be_wayplan_warehouse_loading_snapshots_v1, public.be_wayplan_stop_events_v1 to authenticated;

create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
   raise exception using errcode='42501',message='Wayplan operator permission is required.';
 end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type') order by record_key),'[]'::jsonb) into v_vehicles
 from public.be_master_data_rows where dataset_key='fleet_master' and deleted_at is null
 and upper(coalesce(status,'ACTIVE'))='ACTIVE'
 and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
 and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');
 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb) into v_busy
 from public.be_wayplan_dispatches where wayplan_status not in ('CANCELLED','COMPLETED','CLOSED');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,
   jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb)
 into v_route_origins from public.be_branch_offices
 where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins);
end $$;
revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_save_operational_route_version_v1(
  p_wayplan_id text,
  p_version_type text,
  p_route jsonb,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_wayplan text:=nullif(btrim(p_wayplan_id),''); v_type text:=upper(coalesce(p_version_type,''));
  v_version integer; v_stops jsonb:=coalesce(p_route->'ordered_stops','[]'::jsonb); v_stop jsonb; v_ids text[]:='{}';
  v_actor_email text:=coalesce(auth.jwt()->>'email',auth.uid()::text); v_index integer:=0; v_total integer;
begin
  if auth.uid() is null and session_user<>'postgres' then raise exception 'Authenticated Wayplan user is required'; end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if v_type not in ('GENERATED','RIDER_REROUTE','OPERATOR_RECALCULATION') then raise exception 'Invalid route version type'; end if;
  if jsonb_typeof(v_stops)<>'array' or jsonb_array_length(v_stops)=0 then raise exception 'ordered_stops are required'; end if;
  select total_stops into v_total from public.be_wayplan_dispatches where wayplan_id=v_wayplan;
  if v_total is null then raise exception 'Wayplan not found'; end if;
  if jsonb_array_length(v_stops)<>v_total and v_type<>'RIDER_REROUTE' then raise exception 'Generated route must contain every Wayplan stop'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operational-route:'||v_wayplan,0));
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;
  if v_type='GENERATED' and v_version<>1 then raise exception 'Generated route version already exists for %',v_wayplan; end if;
  insert into public.be_wayplan_route_versions_v1(wayplan_id,route_version,version_type,route_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,fallback,reason,actor_id,actor_email,metadata)
  values(v_wayplan,v_version,v_type,coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK'),coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),coalesce(p_route->'origin','{}'::jsonb),v_stops,
   coalesce(nullif(p_route->>'distance_m','')::bigint,0),coalesce(nullif(p_route->>'duration_s','')::bigint,0),coalesce(nullif(p_route->>'request_count','')::integer,0),coalesce(nullif(p_route->>'fallback','')::boolean,false),p_reason,auth.uid(),v_actor_email,
   jsonb_build_object('warning',p_route->>'warning','optimized_at',p_route->>'optimized_at'));
  for v_stop in select value from jsonb_array_elements(v_stops) loop
    v_index:=v_index+1;
    if nullif(v_stop->>'delivery_way_id','') is null then raise exception 'Every route stop needs delivery_way_id'; end if;
    if (v_stop->>'delivery_way_id')=any(v_ids) then raise exception 'Duplicate delivery_way_id in route'; end if;
    v_ids:=array_append(v_ids,v_stop->>'delivery_way_id');
    insert into public.be_wayplan_route_version_stops_v1(wayplan_id,route_version,delivery_way_id,stop_sequence,latitude,longitude,stop_snapshot)
    values(v_wayplan,v_version,v_stop->>'delivery_way_id',v_index,nullif(v_stop->>'latitude','')::numeric,nullif(v_stop->>'longitude','')::numeric,v_stop);
  end loop;
  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_version,'generated_route_version',coalesce((metadata->>'generated_route_version')::integer,case when v_type='GENERATED' then v_version else null end),'active_route_source',p_route->>'source','active_route_mode',p_route->>'route_mode'),updated_at=now() where wayplan_id=v_wayplan;
  if v_type='GENERATED' then
    insert into public.be_wayplan_warehouse_loading_snapshots_v1(wayplan_id,generated_route_version,delivery_way_id,delivery_sequence,load_sequence,stop_snapshot)
    select v_wayplan,v_version,s.delivery_way_id,s.stop_sequence,v_total-s.stop_sequence+1,s.stop_snapshot
    from public.be_wayplan_route_version_stops_v1 s where s.wayplan_id=v_wayplan and s.route_version=v_version order by s.stop_sequence
    on conflict do nothing;
    update public.be_wayplan_dispatch_stops d set warehouse_metadata=coalesce(d.warehouse_metadata,'{}'::jsonb)||jsonb_build_object('generated_route_version',v_version,'immutable_delivery_sequence',s.delivery_sequence,'immutable_lifo_load_sequence',s.load_sequence,'warehouse_load_strategy','LIFO')
    from public.be_wayplan_warehouse_loading_snapshots_v1 s where s.wayplan_id=v_wayplan and s.delivery_way_id=d.delivery_way_id and d.wayplan_id=v_wayplan;
  end if;
  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version,'version_type',v_type);
end $$;
revoke all on function public.be_save_operational_route_version_v1(text,text,jsonb,text) from public,anon;
grant execute on function public.be_save_operational_route_version_v1(text,text,jsonb,text) to authenticated;

create or replace function public.be_operational_wayplan_snapshot_v1(p_wayplan_id text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_wayplan text:=nullif(btrim(p_wayplan_id),''); v_plan jsonb; v_version integer; v_route jsonb; v_stops jsonb; v_events jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select to_jsonb(d),coalesce((d.metadata->>'active_route_version')::integer,1) into v_plan,v_version from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan;
  if v_plan is null then raise exception 'Wayplan not found'; end if;
  select to_jsonb(r) into v_route from public.be_wayplan_route_versions_v1 r where r.wayplan_id=v_wayplan and r.route_version=v_version;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.stop_sequence),'[]'::jsonb) into v_stops from (
    select rv.stop_sequence,rv.delivery_way_id,rv.latitude,rv.longitude,d.waybill_no,d.recipient_name,d.recipient_phone,d.address,d.township,d.stop_status,d.rider_status,d.cod_amount,d.failed_reason,
      ws.delivery_sequence as warehouse_delivery_sequence,ws.load_sequence as warehouse_load_sequence
    from public.be_wayplan_route_version_stops_v1 rv join public.be_wayplan_dispatch_stops d on d.wayplan_id=rv.wayplan_id and d.delivery_way_id=rv.delivery_way_id
    left join public.be_wayplan_warehouse_loading_snapshots_v1 ws on ws.wayplan_id=rv.wayplan_id and ws.delivery_way_id=rv.delivery_way_id
    where rv.wayplan_id=v_wayplan and rv.route_version=v_version
  ) x;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb) into v_events from public.be_wayplan_stop_events_v1 e where e.wayplan_id=v_wayplan;
  return jsonb_build_object('ok',true,'wayplan',v_plan,'active_route',v_route,'stops',v_stops,'events',v_events);
end $$;
revoke all on function public.be_operational_wayplan_snapshot_v1(text) from public,anon;
grant execute on function public.be_operational_wayplan_snapshot_v1(text) to authenticated;

create or replace function public.be_apply_rider_reroute_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb:=private.be_field_primary_context_v101(); v_code text:=upper(v_identity->>'worker_code'); v_role text:=lower(v_identity->>'role'); v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),''); v_reason text:=nullif(btrim(p_payload->>'reason'),''); v_allowed boolean;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then return jsonb_build_object('ok',false,'error','PRIMARY_RIDER_OR_DRIVER_REQUIRED'); end if;
  select exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan and (upper(coalesce(d.rider_code,''))=v_code or upper(coalesce(d.driver_code,''))=v_code)) into v_allowed;
  if not v_allowed then return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER'); end if;
  return public.be_save_operational_route_version_v1(v_wayplan,'RIDER_REROUTE',coalesce(p_payload->'route','{}'::jsonb),v_reason);
end $$;
revoke all on function public.be_apply_rider_reroute_v1(jsonb) from public,anon;
grant execute on function public.be_apply_rider_reroute_v1(jsonb) to authenticated;

create or replace function public.be_record_operational_stop_event_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb:=private.be_field_primary_context_v101(); v_code text:=upper(v_identity->>'worker_code'); v_role text:=lower(v_identity->>'role'); v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),''); v_delivery text:=nullif(btrim(p_payload->>'delivery_way_id'),''); v_event text:=upper(nullif(btrim(p_payload->>'event_type'),'')); v_version integer; v_allowed boolean; v_legacy jsonb;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then return jsonb_build_object('ok',false,'error','PRIMARY_RIDER_OR_DRIVER_REQUIRED'); end if;
  if v_event not in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP') then return jsonb_build_object('ok',false,'error','INVALID_STOP_EVENT'); end if;
  select exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan and (upper(coalesce(d.rider_code,''))=v_code or upper(coalesce(d.driver_code,''))=v_code)),coalesce((metadata->>'active_route_version')::integer,1)
  into v_allowed,v_version from public.be_wayplan_dispatches where wayplan_id=v_wayplan;
  if not coalesce(v_allowed,false) then return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER'); end if;
  if not exists(select 1 from public.be_wayplan_route_version_stops_v1 where wayplan_id=v_wayplan and route_version=v_version and delivery_way_id=v_delivery) then return jsonb_build_object('ok',false,'error','STOP_NOT_IN_ACTIVE_ROUTE_VERSION'); end if;
  if v_event='ARRIVED' then
    v_legacy:=public.be_rider_wayplan_action(p_payload||jsonb_build_object('action','arrived'));
    if not coalesce((v_legacy->>'ok')::boolean,false) then return v_legacy; end if;
  elsif v_event='DELIVERED' then
    v_legacy:=public.be_rider_wayplan_action(p_payload||jsonb_build_object('action','deliver'));
    if not coalesce((v_legacy->>'ok')::boolean,false) then return v_legacy; end if;
  else
    update public.be_wayplan_dispatch_stops set stop_status=case v_event when 'CUSTOMER_UNAVAILABLE' then 'FAILED_DELIVERY' when 'RESCHEDULE' then 'DELIVERY_RESCHEDULED' when 'RTO' then 'RETURN_TO_WAREHOUSE' else 'SKIPPED' end,
      rider_status=v_event,failed_reason=coalesce(nullif(p_payload->>'reason',''),failed_reason),rider_action_at=now(),updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_operational_event',v_event,'last_operational_event_at',now())
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
  end if;
  insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,route_version,event_type,actor_id,actor_code,actor_role,latitude,longitude,reason,payload)
  values(v_wayplan,v_delivery,v_version,v_event,auth.uid(),v_code,v_role,nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,nullif(p_payload->>'reason',''),p_payload);
  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'event_type',v_event,'route_version',v_version,'requires_reroute',v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP'));
end $$;
revoke all on function public.be_record_operational_stop_event_v1(jsonb) from public,anon;
grant execute on function public.be_record_operational_stop_event_v1(jsonb) to authenticated;

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code'); branch text;
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric; reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; route_payload jsonb; origin jsonb; saved_route jsonb;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end; origin:=ctx->'route_origins'->region;
 if origin is null then raise exception 'Configured branch route origin is required.'; end if;
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
   if coalesce(driver->>'branch_code','') not in ('',branch) or coalesce(rider->>'branch_code','') not in ('',branch) or (helper is not null and coalesce(helper->>'branch_code','') not in ('',branch)) then raise exception 'Selected crew belongs to another branch.'; end if;
   if p->>'driver_code'=p->>'rider_code' or (helper is not null and p->>'helper_code' in (p->>'driver_code',p->>'rider_code')) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (helper is not null and (p->>'helper_code')=any(crews)) then raise exception 'A crew member cannot serve two vans in this plan.'; end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or b->>'rider_code'=p->>'rider_code' or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'A selected vehicle or crew member already has an active Wayplan. Refresh availability.'; end if;
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
   route_payload:=coalesce(p->'route','{}'::jsonb)||jsonb_build_object('origin',origin,'ordered_stops',(select jsonb_agg(jsonb_build_object('delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township) order by s.stop_sequence) from public.be_wayplan_dispatch_stops s left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id where s.wayplan_id=plan_id));
   saved_route:=public.be_save_operational_route_version_v1(plan_id,'GENERATED',route_payload,null);
   results:=results||jsonb_build_array(result||jsonb_build_object('route_version',saved_route->'route_version','route_source',p#>>'{route,source}','route_mode',p#>>'{route,route_mode}'));
   if jsonb_array_length(p->'delivery_way_ids')<50 then insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id)); end if;
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;
revoke all on function public.be_generate_multi_van(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van(jsonb) to authenticated;
