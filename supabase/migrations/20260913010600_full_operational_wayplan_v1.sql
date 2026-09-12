-- Full Operational Wayplan V1
-- Additive production upgrade: Rider crew allocation, immutable route versions,
-- immutable warehouse LIFO snapshot, append-only stop events and route snapshots.

create table if not exists public.be_wayplan_route_versions (
  id bigserial primary key,
  wayplan_id text not null,
  route_version integer not null,
  version_type text not null default 'GENERATED',
  route_source text not null,
  route_mode text not null,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  generated_by text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(wayplan_id, route_version)
);

create table if not exists public.be_wayplan_warehouse_route_snapshots (
  wayplan_id text primary key,
  generated_route_version integer not null,
  delivery_order jsonb not null default '[]'::jsonb,
  lifo_load_order jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.be_wayplan_stop_events (
  id bigserial primary key,
  wayplan_id text not null,
  delivery_way_id text not null,
  route_version integer,
  event_type text not null,
  actor_code text,
  actor_role text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_be_wayplan_stop_events_wayplan on public.be_wayplan_stop_events(wayplan_id,event_at);
create index if not exists idx_be_wayplan_stop_events_delivery on public.be_wayplan_stop_events(delivery_way_id,event_at);

alter table public.be_wayplan_dispatches add column if not exists generated_route_version integer;
alter table public.be_wayplan_dispatches add column if not exists active_route_version integer;
alter table public.be_wayplan_dispatches add column if not exists route_source text;
alter table public.be_wayplan_dispatches add column if not exists route_mode text;

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
  v_route_origins jsonb := '{}'::jsonb;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
    raise exception using errcode='42501',message='Wayplan operator permission is required.';
  end if;
  v_options:=public.be_wayplan_assignment_options_v44();
  select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type') order by record_key),'[]'::jsonb)
  into v_vehicles
  from public.be_master_data_rows
  where dataset_key='fleet_master' and deleted_at is null
    and upper(coalesce(status,'ACTIVE'))='ACTIVE'
    and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
    and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');

  select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb)
  into v_busy
  from public.be_wayplan_dispatches
  where wayplan_status not in ('CANCELLED','COMPLETED','CLOSED');

  select coalesce(jsonb_object_agg(x.region_code,x.origin),'{}'::jsonb) into v_route_origins
  from (
    select case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end as region_code,
           jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng) as origin
    from public.be_branch_offices
    where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null
  ) x where x.region_code is not null;

  return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins);
end $$;
revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_wayplan_distinct_crew_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare vals text[];
begin
  vals:=array_remove(array[upper(nullif(btrim(coalesce(new.driver_code,'')),'')),upper(nullif(btrim(coalesce(new.rider_code,'')),'')),upper(nullif(btrim(coalesce(new.helper_code,'')),''))],null);
  if cardinality(vals) <> cardinality(array(select distinct unnest(vals))) then
    raise exception using errcode='23514',message='Driver, Rider and Helper must be different people.';
  end if;
  if nullif(btrim(coalesce(new.rider_code,'')),'') is not null and exists(
    select 1 from public.be_wayplan_dispatches w
    where w.id<>new.id and upper(coalesce(w.rider_code,''))=upper(new.rider_code)
      and upper(coalesce(w.wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED')
  ) then
    raise exception using errcode='23514',message='Selected Rider already has another active Wayplan.';
  end if;
  return new;
end $$;

drop trigger if exists trg_be_wayplan_distinct_crew_guard on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_distinct_crew_guard
before insert or update of driver_code,rider_code,helper_code,wayplan_status on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_distinct_crew_guard();

create or replace function public.be_wayplan_record_route_version(
  p_wayplan_id text,
  p_route jsonb,
  p_version_type text default 'GENERATED'
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_version integer;
  v_source text:=upper(coalesce(p_route->>'source','GEOGRAPHIC_FALLBACK'));
  v_mode text:=coalesce(p_route->>'route_mode','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY');
  v_stops jsonb:=coalesce(p_route->'ordered_stops','[]'::jsonb);
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text,session_user);
  v_type text:=upper(coalesce(p_version_type,'GENERATED'));
begin
  if jsonb_typeof(v_stops)<>'array' or jsonb_array_length(v_stops)=0 then raise exception 'Route ordered_stops are required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wayplan-route-version:'||p_wayplan_id,0));
  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_route_versions(wayplan_id,route_version,version_type,route_source,route_mode,ordered_stops,distance_m,duration_s,request_count,generated_by,metadata)
  values(p_wayplan_id,v_version,v_type,v_source,v_mode,v_stops,coalesce((p_route->>'distance_m')::bigint,0),coalesce((p_route->>'duration_s')::bigint,0),coalesce((p_route->>'request_count')::integer,0),v_actor,p_route-'ordered_stops');
  update public.be_wayplan_dispatches set active_route_version=v_version,route_source=v_source,route_mode=v_mode,
    generated_route_version=case when generated_route_version is null then v_version else generated_route_version end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_version,'route_source',v_source,'route_mode',v_mode),updated_at=now()
  where wayplan_id=p_wayplan_id;
  if v_type='GENERATED' then
    insert into public.be_wayplan_warehouse_route_snapshots(wayplan_id,generated_route_version,delivery_order,lifo_load_order,created_by,metadata)
    values(p_wayplan_id,v_version,v_stops,(select coalesce(jsonb_agg(value order by ord desc),'[]'::jsonb) from jsonb_array_elements(v_stops) with ordinality t(value,ord)),v_actor,jsonb_build_object('immutable',true,'source',v_source,'route_mode',v_mode))
    on conflict (wayplan_id) do nothing;
  end if;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'route_version',v_version,'version_type',v_type,'route_source',v_source,'route_mode',v_mode);
end $$;
revoke all on function public.be_wayplan_record_route_version(text,jsonb,text) from public,anon;
grant execute on function public.be_wayplan_record_route_version(text,jsonb,text) to authenticated;

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code');
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
 reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; route_result jsonb; route_payload jsonb; ordered jsonb;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region is null or region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then return old_event->'result'; end if;
 ctx:=public.be_multi_van_context();
 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids'); if n<1 then raise exception 'Each activated van needs parcels.'; end if;
   total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if; if n>75 then raise exception 'Maximum 75 parcels per van.'; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY'; if v is null then raise exception 'Choose a delivery van.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if; vans:=array_append(vans,p->>'vehicle_code');
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code'; if driver is null then raise exception 'Choose an active authenticated Driver.'; end if;
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code'; if rider is null then raise exception 'Choose an active authenticated Rider.'; end if;
   helper:=null; if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active Helper or leave blank.'; end if; end if;
   if p->>'driver_code'=p->>'rider_code' or (helper is not null and p->>'helper_code' in (p->>'driver_code',p->>'rider_code')) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (helper is not null and (p->>'helper_code')=any(crews)) then raise exception 'A crew member cannot serve two vans in this batch.'; end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or b->>'rider_code'=p->>'rider_code' or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'Selected vehicle or crew already has an active Wayplan.'; end if;
   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if; ids:=array_append(ids,parcel_id); end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
   if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then raise exception 'Operator approval and reason are required for the below-50 van.'; end if;
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
   result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name','rider_code',rider->>'id','rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),'actor',actor));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
   ordered:=(select coalesce(jsonb_agg(jsonb_build_object('delivery_way_id',x.id,'sequence',x.ord,'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township) order by x.ord),'[]'::jsonb)
            from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
            left join public.be_delivery_location_registry l on l.delivery_way_id=x.id
            left join public.be_wayplan_dispatch_stops s on s.wayplan_id=plan_id and s.delivery_way_id=x.id);
   route_payload:=coalesce(p->'route','{}'::jsonb)||jsonb_build_object('ordered_stops',ordered);
   route_result:=public.be_wayplan_record_route_version(plan_id,route_payload,'GENERATED');
   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int,metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object('generated_route_version',route_result->>'route_version')
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord) where s.wayplan_id=plan_id and s.delivery_way_id=x.id;
   update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason) where wayplan_id=plan_id;
   results:=results||jsonb_build_array(result||jsonb_build_object('route',route_result));
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;
revoke all on function public.be_generate_multi_van(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van(jsonb) to authenticated;

create or replace function public.be_wayplan_route_snapshot_v1(p_wayplan_id text)
returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
 select jsonb_build_object(
   'ok',true,'wayplan_id',d.wayplan_id,'generated_route_version',d.generated_route_version,'active_route_version',d.active_route_version,
   'route_source',d.route_source,'route_mode',d.route_mode,
   'warehouse_snapshot',(select to_jsonb(w) from public.be_wayplan_warehouse_route_snapshots w where w.wayplan_id=d.wayplan_id),
   'versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.route_version),'[]'::jsonb) from public.be_wayplan_route_versions v where v.wayplan_id=d.wayplan_id),
   'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.event_at),'[]'::jsonb) from public.be_wayplan_stop_events e where e.wayplan_id=d.wayplan_id)
 ) from public.be_wayplan_dispatches d where d.wayplan_id=p_wayplan_id;
$$;
revoke all on function public.be_wayplan_route_snapshot_v1(text) from public,anon;
grant execute on function public.be_wayplan_route_snapshot_v1(text) to authenticated;

create or replace function public.be_wayplan_remaining_route_version(p_wayplan_id text,p_route jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare r jsonb; actor text:=coalesce((private.be_field_primary_context_v101())->>'worker_code',auth.uid()::text); begin
 r:=public.be_wayplan_record_route_version(p_wayplan_id,p_route,'RIDER_REROUTE');
 insert into public.be_wayplan_stop_events(wayplan_id,delivery_way_id,route_version,event_type,actor_code,actor_role,payload)
 values(p_wayplan_id,'*',(r->>'route_version')::int,'RIDER_REROUTE',actor,lower((private.be_field_primary_context_v101())->>'role'),jsonb_build_object('reason',p_reason,'route',p_route));
 return r;
end $$;
revoke all on function public.be_wayplan_remaining_route_version(text,jsonb,text) from public,anon;
grant execute on function public.be_wayplan_remaining_route_version(text,jsonb,text) to authenticated;

create or replace function public.be_wayplan_record_stop_event(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare idn jsonb:=private.be_field_primary_context_v101(); ev text:=upper(coalesce(p_payload->>'event_type','')); wid text:=p_payload->>'wayplan_id'; did text:=p_payload->>'delivery_way_id'; rv integer; begin
 if ev not in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP') then raise exception 'Unsupported stop event'; end if;
 select active_route_version into rv from public.be_wayplan_dispatches where wayplan_id=wid;
 insert into public.be_wayplan_stop_events(wayplan_id,delivery_way_id,route_version,event_type,actor_code,actor_role,payload)
 values(wid,did,rv,ev,idn->>'worker_code',lower(idn->>'role'),p_payload-'event_type'-'wayplan_id'-'delivery_way_id');
 return jsonb_build_object('ok',true,'wayplan_id',wid,'delivery_way_id',did,'event_type',ev,'route_version',rv);
end $$;
revoke all on function public.be_wayplan_record_stop_event(jsonb) from public,anon;
grant execute on function public.be_wayplan_record_stop_event(jsonb) to authenticated;
