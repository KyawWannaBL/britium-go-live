-- Full Operational Wayplan V1
-- Additive production extension: Rider allocation, immutable generated/reroute versions,
-- immutable warehouse LIFO snapshot, route stop audit events, and remaining-stop reroute persistence.

create table if not exists public.be_wayplan_route_versions_v1 (
  wayplan_id text not null,
  route_version integer not null,
  route_kind text not null,
  route_source text not null,
  route_mode text not null,
  route_status text not null default 'ACTIVE',
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
  constraint be_wayplan_route_versions_kind_ck check (route_kind in ('GENERATED','RIDER_REROUTE'))
);

create index if not exists idx_be_wayplan_route_versions_v1_latest
  on public.be_wayplan_route_versions_v1(wayplan_id, route_version desc);

create table if not exists public.be_wayplan_warehouse_loading_v1 (
  wayplan_id text primary key,
  generated_route_version integer not null,
  loading_strategy text not null default 'LIFO',
  loading_stops jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_wayplan_warehouse_loading_strategy_ck check (loading_strategy='LIFO')
);

create table if not exists public.be_wayplan_stop_events_v1 (
  id bigserial primary key,
  wayplan_id text not null,
  delivery_way_id text,
  event_type text not null,
  route_version integer,
  generated_route_version integer,
  original_stop_sequence integer,
  active_stop_sequence integer,
  actor_code text,
  actor_role text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_be_wayplan_stop_events_v1_wayplan
  on public.be_wayplan_stop_events_v1(wayplan_id, event_at desc);
create index if not exists idx_be_wayplan_stop_events_v1_delivery
  on public.be_wayplan_stop_events_v1(delivery_way_id, event_at desc);

create or replace function public.be_wayplan_immutable_row_guard_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  raise exception using errcode='55000', message='Generated route and warehouse loading history is immutable.';
end $$;

revoke all on function public.be_wayplan_immutable_row_guard_v1() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_route_versions_v1_immutable on public.be_wayplan_route_versions_v1;
create trigger trg_be_wayplan_route_versions_v1_immutable
before update or delete on public.be_wayplan_route_versions_v1
for each row execute function public.be_wayplan_immutable_row_guard_v1();

drop trigger if exists trg_be_wayplan_warehouse_loading_v1_immutable on public.be_wayplan_warehouse_loading_v1;
create trigger trg_be_wayplan_warehouse_loading_v1_immutable
before update or delete on public.be_wayplan_warehouse_loading_v1
for each row execute function public.be_wayplan_immutable_row_guard_v1();

revoke all on public.be_wayplan_route_versions_v1 from public,anon;
revoke all on public.be_wayplan_warehouse_loading_v1 from public,anon;
revoke all on public.be_wayplan_stop_events_v1 from public,anon;
grant select on public.be_wayplan_route_versions_v1 to authenticated;
grant select on public.be_wayplan_warehouse_loading_v1 to authenticated;
grant select on public.be_wayplan_stop_events_v1 to authenticated;

create or replace function public.be_wayplan_distinct_rider_helper_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_driver text:=upper(btrim(coalesce(new.driver_code,'')));
  v_rider text:=upper(btrim(coalesce(new.rider_code,'')));
  v_helper text:=upper(btrim(coalesce(new.helper_code,'')));
begin
  if v_driver<>'' and v_rider<>'' and v_driver=v_rider then
    raise exception using errcode='23514', message='The same workforce member cannot be assigned as both Driver and Rider on one wayplan.';
  end if;
  if v_driver<>'' and v_helper<>'' and v_driver=v_helper then
    raise exception using errcode='23514', message='The same workforce member cannot be assigned as both Driver and Helper on one wayplan.';
  end if;
  if v_rider<>'' and v_helper<>'' and v_rider=v_helper then
    raise exception using errcode='23514', message='The same workforce member cannot be assigned as both Rider and Helper on one wayplan.';
  end if;
  return new;
end $$;

create or replace function public.be_wayplan_active_crew_exclusive_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_code text;
begin
  if upper(coalesce(new.wayplan_status,'')) in ('CANCELLED','COMPLETED','CLOSED') then return new; end if;
  foreach v_code in array array[new.driver_code,new.rider_code,new.helper_code] loop
    v_code:=upper(btrim(coalesce(v_code,'')));
    if v_code='' then continue; end if;
    if exists(
      select 1 from public.be_wayplan_dispatches x
      where x.id<>new.id
        and upper(coalesce(x.wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED')
        and v_code in (upper(coalesce(x.driver_code,'')),upper(coalesce(x.rider_code,'')),upper(coalesce(x.helper_code,'')))
    ) then
      raise exception using errcode='23514', message='A selected Driver, Rider, or Helper is already assigned to another active Wayplan.';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_be_wayplan_active_crew_exclusive_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_active_crew_exclusive_v1
before insert or update of driver_code,rider_code,helper_code,wayplan_status on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_active_crew_exclusive_v1();

create or replace function public.be_wayplan_append_route_version_v1(
  p_wayplan_id text,
  p_route_kind text,
  p_route_source text,
  p_route_mode text,
  p_origin jsonb,
  p_ordered_stops jsonb,
  p_distance_m bigint default 0,
  p_duration_s bigint default 0,
  p_request_count integer default 0,
  p_parent_route_version integer default null,
  p_reason text default null,
  p_generated_by text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_version integer;
  v_count integer;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required.'; end if;
  if upper(coalesce(p_route_kind,'')) not in ('GENERATED','RIDER_REROUTE') then raise exception 'Invalid route kind.'; end if;
  if jsonb_typeof(coalesce(p_ordered_stops,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_ordered_stops,'[]'::jsonb))=0 then raise exception 'Ordered route stops are required.'; end if;
  select count(*)::integer into v_count from jsonb_array_elements(p_ordered_stops);
  if v_count<>jsonb_array_length(p_ordered_stops) then raise exception 'Invalid route stops.'; end if;
  if exists(
    select 1 from (
      select value->>'delivery_way_id' id,count(*) c from jsonb_array_elements(p_ordered_stops) group by value->>'delivery_way_id'
    ) q where nullif(btrim(coalesce(q.id,'')),'') is null or q.c>1
  ) then raise exception 'Every route stop must contain one unique delivery_way_id.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('wayplan-route-version:'||v_wayplan,0));
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;
  insert into public.be_wayplan_route_versions_v1(
    wayplan_id,route_version,route_kind,route_source,route_mode,origin,ordered_stops,
    distance_m,duration_s,request_count,parent_route_version,reason,generated_by,metadata
  ) values(
    v_wayplan,v_version,upper(p_route_kind),upper(coalesce(nullif(p_route_source,''),'GEOGRAPHIC_FALLBACK')),
    upper(coalesce(nullif(p_route_mode,''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY')),
    coalesce(p_origin,'{}'::jsonb),p_ordered_stops,greatest(coalesce(p_distance_m,0),0),
    greatest(coalesce(p_duration_s,0),0),greatest(coalesce(p_request_count,0),0),p_parent_route_version,p_reason,p_generated_by,
    coalesce(p_metadata,'{}'::jsonb)
  );
  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version);
end $$;

revoke all on function public.be_wayplan_append_route_version_v1(text,text,text,text,jsonb,jsonb,bigint,bigint,integer,integer,text,text,jsonb) from public,anon;
grant execute on function public.be_wayplan_append_route_version_v1(text,text,text,text,jsonb,jsonb,bigint,bigint,integer,integer,text,text,jsonb) to authenticated;

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
    'id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type'
  ) order by record_key),'[]'::jsonb)
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
  where upper(coalesce(wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED');

  select coalesce(jsonb_object_agg(region_code,jsonb_build_object(
    'branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng
  )),'{}'::jsonb)
  into v_route_origins
  from (
    select distinct on (branch_code)
      branch_code,coalesce(branch_name,branch_code) branch_name,lat,lng,
      case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end region_code
    from public.be_branch_offices
    where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null
    order by branch_code,coalesce(is_head_office,false) desc,updated_at desc nulls last
  ) o where region_code is not null;

  return jsonb_build_object(
    'vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers',
    'busy',v_busy,'route_origins',v_route_origins
  );
end $$;

revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

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
 actor text; plan_id text; idx int:=0; route jsonb; ordered jsonb; loading jsonb; origin jsonb; version_result jsonb; route_version int;
 branch text;
begin
 ctx:=public.be_multi_van_context();
 actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
 origin:=ctx->'route_origins'->region;
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region is null or region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 if origin is null then raise exception 'Branch route origin is not configured.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then
   if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
   return old_event->'result';
 end if;

 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids');
   if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   if n>75 then raise exception 'A delivery van cannot exceed 75 parcels.'; end if;
   total_count:=total_count+n;
   if n<50 then short_count:=short_count+1; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
   if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if;
   vans:=array_append(vans,p->>'vehicle_code');

   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   if driver is null then raise exception 'Choose an active, authenticated driver.'; end if;
   if rider is null then raise exception 'Choose an active, authenticated rider.'; end if;
   if coalesce(driver->>'branch_code','') not in ('',branch) then raise exception 'Driver belongs to another branch.'; end if;
   if coalesce(rider->>'branch_code','') not in ('',branch) then raise exception 'Rider belongs to another branch.'; end if;
   helper:=null;
   if coalesce(p->>'helper_code','')<>'' then
     select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
     if helper is null then raise exception 'Choose an active helper or leave helper empty.'; end if;
     if coalesce(helper->>'branch_code','') not in ('',branch) then raise exception 'Helper belongs to another branch.'; end if;
   end if;
   if upper(p->>'driver_code')=upper(p->>'rider_code')
      or (helper is not null and upper(p->>'helper_code') in (upper(p->>'driver_code'),upper(p->>'rider_code'))) then
     raise exception 'Driver, Rider, and Helper must be different people.';
   end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews)
      or (helper is not null and (p->>'helper_code')=any(crews)) then raise exception 'A crew member cannot serve two vans in this plan.'; end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code');
   if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;

   if exists(
     select 1 from jsonb_array_elements(ctx->'busy') b
     where b->>'vehicle_code'=p->>'vehicle_code'
        or p->>'driver_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code')
        or p->>'rider_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code')
        or (helper is not null and p->>'helper_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code'))
   ) then raise exception 'A selected vehicle or crew member already has an active Wayplan. Refresh availability.'; end if;

   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop
     if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if;
     ids:=array_append(ids,parcel_id);
   end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
   if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then
   raise exception 'Operator approval and a reason are required for the van below 50 parcels.';
 end if;

 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx;
   if exists(select 1 from public.be_wayplan_dispatches where wayplan_id=plan_id) then raise exception 'Wayplan identifier already exists.'; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';

   result:=public.be_generate_wayplan(p||jsonb_build_object(
     'wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name',
     'rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),'actor',actor
   ));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;

   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int, optimized_sequence=x.ord::int
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
   where s.wayplan_id=plan_id and s.delivery_way_id=x.id;

   select coalesce(jsonb_agg(jsonb_build_object(
     'sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
     'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',coalesce(s.delivery_address,s.address),
     'township',coalesce(s.delivery_township,s.recipient_township,s.township),
     'latitude',l.latitude,'longitude',l.longitude,'status',coalesce(s.stop_status,'PENDING')
   ) order by s.stop_sequence),'[]'::jsonb)
   into ordered
   from public.be_wayplan_dispatch_stops s
   left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
   where s.wayplan_id=plan_id;

   route:=coalesce(p->'route','{}'::jsonb);
   version_result:=public.be_wayplan_append_route_version_v1(
     plan_id,'GENERATED',coalesce(route->>'source','GEOGRAPHIC_FALLBACK'),coalesce(route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),
     origin,ordered,coalesce(nullif(route->>'distance_m','')::numeric,0)::bigint,coalesce(nullif(route->>'duration_s','')::numeric,0)::bigint,
     coalesce(nullif(route->>'request_count','')::integer,0),null,'PRE_DISPATCH_GENERATION',actor,
     jsonb_build_object('fallback',coalesce((route->>'fallback')::boolean,false),'warning',route->>'warning','request_id',request_id)
   );
   route_version:=(version_result->>'route_version')::integer;

   select coalesce(jsonb_agg(jsonb_build_object(
     'load_sequence',x.load_sequence,'delivery_sequence',x.stop_sequence,'delivery_way_id',x.delivery_way_id,
     'waybill_no',x.waybill_no,'township',x.township,'recipient_name',x.recipient_name,'address',x.address
   ) order by x.load_sequence),'[]'::jsonb)
   into loading
   from (
     select row_number() over(order by s.stop_sequence desc)::integer load_sequence,s.stop_sequence,s.delivery_way_id,s.waybill_no,
       coalesce(s.delivery_township,s.recipient_township,s.township) township,s.recipient_name,coalesce(s.delivery_address,s.address) address
     from public.be_wayplan_dispatch_stops s where s.wayplan_id=plan_id
   ) x;

   insert into public.be_wayplan_warehouse_loading_v1(wayplan_id,generated_route_version,loading_stops,created_by,metadata)
   values(plan_id,route_version,loading,actor,jsonb_build_object('source','PRE_DISPATCH_GENERATED_ROUTE','immutable',true));

   update public.be_wayplan_dispatches set
     rider_code=p->>'rider_code',rider_name=rider->>'name',
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'multi_van_request',request_id,'operator_id',auth.uid(),'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,
       'below_minimum_reason',reason,'generated_route_version',route_version,'current_route_version',route_version,
       'generated_route_source',coalesce(route->>'source','GEOGRAPHIC_FALLBACK'),'generated_route_mode',coalesce(route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY')
     )
   where wayplan_id=plan_id;

   insert into public.be_wayplan_stop_events_v1(wayplan_id,event_type,route_version,generated_route_version,actor_code,actor_role,payload)
   values(plan_id,'GENERATED_ROUTE_CREATED',route_version,route_version,actor,public.be_current_user_role(),jsonb_build_object('source',route->>'source','mode',route->>'route_mode'));

   results:=results||jsonb_build_array(result||jsonb_build_object('route_version',route_version,'route_source',route->>'source'));
   if jsonb_array_length(p->'delivery_way_ids')<50 then
     insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
     values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,
       jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id));
   end if;
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
 values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED','WAYPLAN_BATCH',request_id,
   jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;

create or replace function public.be_rider_operational_route_snapshot_v1(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_plan public.be_wayplan_dispatches%rowtype;
  v_current integer;
  v_generated integer;
  v_route public.be_wayplan_route_versions_v1%rowtype;
  v_stops jsonb;
  v_current_stop jsonb;
  v_warehouse integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authenticated field session is required.'; end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=btrim(p_wayplan_id);
  if not found then raise exception 'Wayplan not found.'; end if;
  if not (
    (v_role='driver' and upper(coalesce(v_plan.driver_code,''))=v_code) or
    (v_role='rider' and upper(coalesce(v_plan.rider_code,''))=v_code) or
    (v_role='helper' and upper(coalesce(v_plan.helper_code,''))=v_code)
  ) then raise exception using errcode='42501',message='Wayplan is not assigned to the signed-in worker.'; end if;
  v_generated:=coalesce(nullif(v_plan.metadata->>'generated_route_version','')::integer,1);
  v_current:=coalesce(nullif(v_plan.metadata->>'current_route_version','')::integer,v_generated);
  select * into v_route from public.be_wayplan_route_versions_v1 where wayplan_id=v_plan.wayplan_id and route_version=v_current;
  if not found then raise exception 'Immutable route history is not initialized for this Wayplan.'; end if;
  select generated_route_version into v_warehouse from public.be_wayplan_warehouse_loading_v1 where wayplan_id=v_plan.wayplan_id;

  select coalesce(jsonb_agg(stop||jsonb_build_object(
    'status',coalesce(s.stop_status,s.rider_status,'PENDING'),'rider_status',s.rider_status,
    'waybill_no',coalesce(nullif(stop->>'waybill_no',''),s.waybill_no),'recipient_name',coalesce(nullif(stop->>'recipient_name',''),s.recipient_name),
    'recipient_phone',coalesce(nullif(stop->>'recipient_phone',''),s.recipient_phone,s.receiver_phone),
    'address',coalesce(nullif(stop->>'address',''),s.delivery_address,s.address),'township',coalesce(nullif(stop->>'township',''),s.delivery_township,s.recipient_township,s.township),
    'notes',coalesce(s.warehouse_notes,s.metadata->>'notes',''),'original_stop_sequence',s.stop_sequence,
    'active_stop_sequence',coalesce(s.optimized_sequence,(stop->>'sequence')::integer)
  ) order by coalesce(s.optimized_sequence,(stop->>'sequence')::integer)),'[]'::jsonb)
  into v_stops
  from jsonb_array_elements(v_route.ordered_stops) stop
  left join public.be_wayplan_dispatch_stops s on s.wayplan_id=v_plan.wayplan_id and s.delivery_way_id=stop->>'delivery_way_id';

  select value into v_current_stop
  from jsonb_array_elements(v_stops)
  where upper(coalesce(value->>'status','PENDING')) not in ('DELIVERED','RETURN_TO_WAREHOUSE','RTO','RESCHEDULED','CUSTOMER_UNAVAILABLE','SKIPPED','FAILED_DELIVERY','CANCELLED')
  order by coalesce(nullif(value->>'active_stop_sequence','')::integer,999999) limit 1;

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_plan.wayplan_id,'route_version',v_current,'generated_route_version',v_generated,
    'warehouse_route_version',v_warehouse,'route_source',v_route.route_source,'route_mode',v_route.route_mode,
    'current_stop',v_current_stop,'stops',v_stops,'warehouse_history_immutable',true
  );
end $$;

revoke all on function public.be_rider_operational_route_snapshot_v1(text) from public,anon;
grant execute on function public.be_rider_operational_route_snapshot_v1(text) to authenticated;

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
  v_plan public.be_wayplan_dispatches%rowtype;
  v_route jsonb:=coalesce(p_payload->'route','{}'::jsonb);
  v_ordered jsonb:=coalesce(v_route->'ordered_stops','[]'::jsonb);
  v_expected text[]; v_supplied text[]; v_parent integer; v_generated integer; v_result jsonb; v_version integer; v_origin jsonb;
begin
  if auth.uid() is null or v_role not in ('rider','driver') then raise exception using errcode='42501',message='Assigned Rider or Driver session is required.'; end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required.'; end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=v_wayplan for update;
  if not found then raise exception 'Wayplan not found.'; end if;
  if not ((v_role='rider' and upper(coalesce(v_plan.rider_code,''))=v_code) or (v_role='driver' and upper(coalesce(v_plan.driver_code,''))=v_code)) then
    raise exception using errcode='42501',message='Wayplan is not assigned to the signed-in worker.';
  end if;
  if jsonb_typeof(v_ordered)<>'array' or jsonb_array_length(v_ordered)=0 then raise exception 'Reroute ordered stops are required.'; end if;

  select array_agg(delivery_way_id order by delivery_way_id) into v_expected
  from public.be_wayplan_dispatch_stops
  where wayplan_id=v_wayplan and upper(coalesce(stop_status,rider_status,'PENDING')) not in
    ('DELIVERED','RETURN_TO_WAREHOUSE','RTO','RESCHEDULED','CUSTOMER_UNAVAILABLE','SKIPPED','FAILED_DELIVERY','CANCELLED');
  select array_agg(id order by id) into v_supplied from (
    select value->>'delivery_way_id' id from jsonb_array_elements(v_ordered)
  ) q;
  if coalesce(cardinality(v_expected),0)=0 then raise exception 'No eligible remaining stops require rerouting.'; end if;
  if v_supplied is distinct from v_expected then raise exception 'Reroute must contain every remaining eligible stop exactly once and no completed/skipped stop.'; end if;

  v_generated:=coalesce(nullif(v_plan.metadata->>'generated_route_version','')::integer,1);
  v_parent:=coalesce(nullif(v_plan.metadata->>'current_route_version','')::integer,v_generated);
  v_origin:=coalesce(p_payload->'origin','{}'::jsonb);
  v_result:=public.be_wayplan_append_route_version_v1(
    v_wayplan,'RIDER_REROUTE',coalesce(v_route->>'source','GEOGRAPHIC_FALLBACK'),coalesce(v_route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'),
    v_origin,v_ordered,coalesce(nullif(v_route->>'distance_m','')::numeric,0)::bigint,coalesce(nullif(v_route->>'duration_s','')::numeric,0)::bigint,
    coalesce(nullif(v_route->>'request_count','')::integer,0),v_parent,coalesce(p_payload->>'reason','REMAINING_STOPS_REROUTE'),v_code,
    jsonb_build_object('fallback',coalesce((v_route->>'fallback')::boolean,false),'warning',v_route->>'warning','warehouse_route_version',v_generated)
  );
  v_version:=(v_result->>'route_version')::integer;

  update public.be_wayplan_dispatch_stops s set optimized_sequence=x.seq
  from (
    select value->>'delivery_way_id' id,(value->>'sequence')::integer seq from jsonb_array_elements(v_ordered)
  ) x
  where s.wayplan_id=v_wayplan and s.delivery_way_id=x.id;

  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'current_route_version',v_version,'last_rerouted_at',now(),'last_rerouted_by',v_code,'warehouse_route_version',v_generated
  ),updated_at=now() where wayplan_id=v_wayplan;

  insert into public.be_wayplan_stop_events_v1(wayplan_id,event_type,route_version,generated_route_version,actor_code,actor_role,payload)
  values(v_wayplan,'RIDER_REROUTE_CREATED',v_version,v_generated,v_code,v_role,jsonb_build_object('parent_route_version',v_parent,'reason',p_payload->>'reason','source',v_route->>'source'));

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version,'generated_route_version',v_generated,'warehouse_route_version',v_generated,'warehouse_history_unchanged',true);
end $$;

revoke all on function public.be_wayplan_save_rider_reroute_v1(jsonb) from public,anon;
grant execute on function public.be_wayplan_save_rider_reroute_v1(jsonb) to authenticated;

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
  v_result jsonb; v_event text; v_status text; v_stop public.be_wayplan_dispatch_stops%rowtype;
  v_generated integer; v_current integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_role='helper' and v_action in ('deliver','delivered','complete','complete_delivery','start_delivery','out_for_delivery','customer_unavailable','reschedule','rto','skip') then
    return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only the assigned rider or driver can execute route outcomes.');
  end if;

  if v_action in ('customer_unavailable','reschedule','rto','skip') then
    if v_wayplan is null or v_delivery is null then return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required'); end if;
    select * into v_stop from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and delivery_way_id=v_delivery for update;
    if not found then return jsonb_build_object('ok',false,'error','Wayplan stop not found'); end if;
    if not ((v_role='rider' and upper(coalesce(v_stop.rider_code,''))=v_code) or
            (v_role='driver' and exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=v_wayplan and upper(coalesce(d.driver_code,''))=v_code))) then
      return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER');
    end if;
    v_status:=case v_action when 'customer_unavailable' then 'CUSTOMER_UNAVAILABLE' when 'reschedule' then 'RESCHEDULED' when 'rto' then 'RETURN_TO_WAREHOUSE' else 'SKIPPED' end;
    v_event:=case v_action when 'customer_unavailable' then 'CUSTOMER_UNAVAILABLE' when 'reschedule' then 'RESCHEDULE' when 'rto' then 'RTO' else 'SKIP' end;
    update public.be_wayplan_dispatch_stops set stop_status=v_status,rider_status=v_status,rider_action_at=now(),
      failed_reason=case when v_action in ('customer_unavailable','rto','skip') then coalesce(nullif(p_payload->>'reason',''),nullif(p_payload->>'remark',''),failed_reason) else failed_reason end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_route_action',v_action,'last_route_action_at',now(),'last_route_action_by',v_code),updated_at=now()
    where id=v_stop.id;
    v_result:=jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'action',v_action,'status',v_status,'reroute_remaining',true);
  else
    v_result:=public.be_rider_wayplan_action_primary_guard_legacy_v101(p_payload||jsonb_build_object('authenticated_worker_code',v_code,'authenticated_worker_role',v_role));
    if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;
    v_event:=case v_action when 'arrived' then 'ARRIVED' when 'deliver' then 'DELIVERED' when 'return' then 'RTO' else upper(v_action) end;
    if v_wayplan is not null and v_delivery is not null then select * into v_stop from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and delivery_way_id=v_delivery; end if;
  end if;

  if v_wayplan is not null then
    select coalesce(nullif(metadata->>'generated_route_version','')::integer,1),coalesce(nullif(metadata->>'current_route_version','')::integer,nullif(metadata->>'generated_route_version','')::integer,1)
    into v_generated,v_current from public.be_wayplan_dispatches where wayplan_id=v_wayplan;
  end if;
  if v_wayplan is not null then
    insert into public.be_wayplan_stop_events_v1(
      wayplan_id,delivery_way_id,event_type,route_version,generated_route_version,original_stop_sequence,active_stop_sequence,actor_code,actor_role,payload
    ) values(
      v_wayplan,v_delivery,coalesce(v_event,upper(v_action)),v_current,v_generated,v_stop.stop_sequence,coalesce(v_stop.optimized_sequence,v_stop.stop_sequence),v_code,v_role,
      jsonb_build_object('action',v_action,'remark',p_payload->>'remark','reason',p_payload->>'reason','result',v_result)
    );
  end if;
  return v_result||jsonb_build_object('route_event',v_event,'route_version',v_current,'generated_route_version',v_generated);
end $$;

revoke all on function public.be_rider_wayplan_action(jsonb) from public,anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;
