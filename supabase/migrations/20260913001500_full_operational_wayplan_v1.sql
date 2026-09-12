-- Full Operational Wayplan V1
-- Additive production upgrade: immutable generated route versions, immutable warehouse LIFO snapshots,
-- Rider-aware multi-van allocation, auditable road-route provenance, and rider reroute history.

create table if not exists public.be_wayplan_route_versions (
  wayplan_id text not null,
  route_version integer not null,
  version_type text not null default 'GENERATED',
  route_source text not null default 'GEOGRAPHIC_FALLBACK',
  route_mode text not null default 'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY',
  parent_route_version integer,
  origin jsonb not null default '{}'::jsonb,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  reason text,
  generated_by text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (wayplan_id, route_version)
);

create index if not exists idx_be_wayplan_route_versions_wayplan_time
  on public.be_wayplan_route_versions(wayplan_id, generated_at desc);

create table if not exists public.be_wayplan_loading_snapshots (
  wayplan_id text primary key,
  generated_route_version integer not null,
  delivery_order jsonb not null default '[]'::jsonb,
  warehouse_load_order jsonb not null default '[]'::jsonb,
  route_source text not null,
  route_mode text not null,
  created_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.be_wayplan_stop_events_v1 (
  id bigserial primary key,
  wayplan_id text not null,
  delivery_way_id text,
  event_type text not null,
  route_version integer,
  original_stop_sequence integer,
  active_stop_sequence integer,
  actor_code text,
  actor_role text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_be_wayplan_stop_events_v1_wayplan_time
  on public.be_wayplan_stop_events_v1(wayplan_id, event_at desc);

create or replace function public.be_wayplan_immutable_history_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception using errcode='55000', message='Generated route and warehouse loading history is immutable.';
end $$;

revoke all on function public.be_wayplan_immutable_history_guard() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_route_versions_immutable on public.be_wayplan_route_versions;
create trigger trg_be_wayplan_route_versions_immutable
before update or delete on public.be_wayplan_route_versions
for each row execute function public.be_wayplan_immutable_history_guard();

drop trigger if exists trg_be_wayplan_loading_snapshots_immutable on public.be_wayplan_loading_snapshots;
create trigger trg_be_wayplan_loading_snapshots_immutable
before update or delete on public.be_wayplan_loading_snapshots
for each row execute function public.be_wayplan_immutable_history_guard();

create or replace function public.be_wayplan_distinct_crew_guard_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  d text:=upper(btrim(coalesce(new.driver_code,'')));
  r text:=upper(btrim(coalesce(new.rider_code,'')));
  h text:=upper(btrim(coalesce(new.helper_code,'')));
begin
  if d<>'' and r<>'' and d=r then raise exception using errcode='23514',message='Driver and Rider must be different people.'; end if;
  if d<>'' and h<>'' and d=h then raise exception using errcode='23514',message='Driver and Helper must be different people.'; end if;
  if r<>'' and h<>'' and r=h then raise exception using errcode='23514',message='Rider and Helper must be different people.'; end if;

  if r<>'' and upper(coalesce(new.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED') and exists(
    select 1 from public.be_wayplan_dispatches x
    where x.id<>new.id
      and upper(coalesce(x.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
      and r in (upper(coalesce(x.rider_code,'')),upper(coalesce(x.driver_code,'')),upper(coalesce(x.helper_code,'')))
  ) then
    raise exception using errcode='23514',message='The selected Rider is already assigned to another active Wayplan.';
  end if;
  return new;
end $$;

revoke all on function public.be_wayplan_distinct_crew_guard_v1() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_distinct_crew_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_distinct_crew_v1
before insert or update of driver_code,rider_code,helper_code,wayplan_status
on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_distinct_crew_guard_v1();

create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare
  v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_origins jsonb;
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
  where upper(coalesce(wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED');

  select coalesce(jsonb_object_agg(region_key, origin),'{}'::jsonb) into v_origins
  from (
    select case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end region_key,
      jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng) origin,
      row_number() over(partition by branch_code order by coalesce(is_head_office,false) desc,updated_at desc nulls last) rn
    from public.be_branch_offices
    where branch_code in ('YGN','MDY','NPT') and coalesce(active,true) and lat is not null and lng is not null
  ) q where rn=1 and region_key is not null;

  return jsonb_build_object(
    'vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers',
    'busy',v_busy,'route_origins',v_origins
  );
end $$;

revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_wayplan_insert_generated_route_v1(
  p_wayplan_id text, p_route jsonb, p_actor text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_source text:=upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK'));
  v_mode text:=upper(coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'));
  v_delivery jsonb; v_loading jsonb; v_origin jsonb; v_count int;
begin
  if exists(select 1 from public.be_wayplan_route_versions where wayplan_id=p_wayplan_id and route_version=1) then
    raise exception 'Generated route version already exists for %',p_wayplan_id;
  end if;

  select count(*)::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
      'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township,
      'notes',coalesce(s.metadata->>'notes',s.metadata->>'remark',s.metadata->>'remarks',''),'status',coalesce(s.stop_status,'PENDING')
    ) order by s.stop_sequence),'[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'load_sequence',(d.total_stops-s.stop_sequence+1),'delivery_sequence',s.stop_sequence,
      'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,'township',s.township,'recipient_name',s.recipient_name,'address',s.address
    ) order by s.stop_sequence desc),'[]'::jsonb)
  into v_count,v_delivery,v_loading
  from public.be_wayplan_dispatch_stops s join public.be_wayplan_dispatches d on d.wayplan_id=s.wayplan_id
  where s.wayplan_id=p_wayplan_id;

  if coalesce(v_count,0)=0 then raise exception 'Wayplan % has no stops',p_wayplan_id; end if;

  select jsonb_build_object('branch_code',b.branch_code,'label',b.branch_name,'latitude',b.lat,'longitude',b.lng)
  into v_origin
  from public.be_wayplan_dispatches d join public.be_branch_offices b on b.branch_code=d.branch_code
  where d.wayplan_id=p_wayplan_id and coalesce(b.active,true) and b.lat is not null and b.lng is not null
  order by coalesce(b.is_head_office,false) desc,b.updated_at desc nulls last limit 1;

  insert into public.be_wayplan_route_versions(
    wayplan_id,route_version,version_type,route_source,route_mode,parent_route_version,origin,ordered_stops,
    distance_m,duration_s,request_count,reason,generated_by,metadata
  ) values (
    p_wayplan_id,1,'GENERATED',v_source,v_mode,null,coalesce(v_origin,'{}'::jsonb),v_delivery,
    coalesce(nullif(p_route->>'distance_m','')::bigint,0),coalesce(nullif(p_route->>'duration_s','')::bigint,0),
    coalesce(nullif(p_route->>'request_count','')::int,0),null,p_actor,
    jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','optimized_at',p_route->>'optimized_at')
  );

  insert into public.be_wayplan_loading_snapshots(
    wayplan_id,generated_route_version,delivery_order,warehouse_load_order,route_source,route_mode,created_by,metadata
  ) values (p_wayplan_id,1,v_delivery,v_loading,v_source,v_mode,p_actor,jsonb_build_object('strategy','LIFO','immutable',true));

  update public.be_wayplan_dispatches set
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'generated_route_version',1,'active_route_version',1,'generated_route_source',v_source,'generated_route_mode',v_mode,'warehouse_loading_route_version',1
    ), updated_at=now()
  where wayplan_id=p_wayplan_id;

  update public.be_wayplan_dispatch_stops s set
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('generated_route_version',1,'original_delivery_sequence',s.stop_sequence),
    warehouse_metadata=coalesce(warehouse_metadata,'{}'::jsonb)||jsonb_build_object(
      'generated_route_version',1,'delivery_sequence',s.stop_sequence,'lifo_load_sequence',d.total_stops-s.stop_sequence+1,'load_strategy','LIFO','immutable',true
    ),updated_at=now()
  from public.be_wayplan_dispatches d where d.wayplan_id=s.wayplan_id and s.wayplan_id=p_wayplan_id;

  return jsonb_build_object('ok',true,'route_version',1,'route_source',v_source,'route_mode',v_mode,'stop_count',v_count);
end $$;

revoke all on function public.be_wayplan_insert_generated_route_v1(text,jsonb,text) from public,anon,authenticated;

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code');
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
 reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; branch text;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
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
   total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;

   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
   if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if; vans:=array_append(vans,p->>'vehicle_code');

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

   if p->>'driver_code'=p->>'rider_code' or (helper is not null and p->>'helper_code' in (p->>'driver_code',p->>'rider_code')) then
     raise exception 'Driver, Rider and Helper must be different people.';
   end if;
   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (helper is not null and (p->>'helper_code')=any(crews)) then
     raise exception 'A crew member cannot serve two vans or two crew positions in this plan.';
   end if;
   crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;

   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where
     b->>'vehicle_code'=p->>'vehicle_code' or
     p->>'driver_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code') or
     p->>'rider_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code') or
     (helper is not null and p->>'helper_code' in (b->>'driver_code',b->>'rider_code',b->>'helper_code'))
   ) then raise exception 'A selected vehicle or crew member already has an active Wayplan. Refresh availability.'; end if;

   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop
     if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if; ids:=array_append(ids,parcel_id);
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

   result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,
     'vehicle_name',v->>'name','driver_name',driver->>'name','rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),
     'rider_code',p->>'rider_code','actor',actor));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;

   update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
     'multi_van_request',request_id,'operator_id',auth.uid(),'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason
   ) where wayplan_id=plan_id;

   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
   where s.wayplan_id=plan_id and s.delivery_way_id=x.id;

   perform public.be_wayplan_insert_generated_route_v1(plan_id,coalesce(p->'route','{}'::jsonb),actor);
   result:=result||jsonb_build_object('route_version',1,'route_source',coalesce(p#>>'{route,source}','GEOGRAPHIC_FALLBACK'),'route_mode',coalesce(p#>>'{route,route_mode}','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'));
   results:=results||jsonb_build_array(result);

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

revoke all on function public.be_generate_multi_van(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van(jsonb) to authenticated;

create or replace function public.be_wayplan_lifo_manifest(p_wayplan_id text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_role text; v_plan public.be_wayplan_dispatches%rowtype; v_rows jsonb; v_version int;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','warehouse') then
    raise exception using errcode='42501',message='Warehouse or Wayplan permission is required.';
  end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then raise exception 'Wayplan not found.'; end if;
  select generated_route_version,warehouse_load_order into v_version,v_rows from public.be_wayplan_loading_snapshots where wayplan_id=p_wayplan_id;
  if found then
    return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
      'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO','generated_route_version',v_version,'immutable',true,'rows',v_rows);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',v_plan.total_stops-s.stop_sequence+1,'delivery_sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,
    'waybill_no',s.waybill_no,'township',s.township,'recipient_name',s.recipient_name,'address',s.address,'parcel_weight_kg',s.parcel_weight_kg
  ) order by v_plan.total_stops-s.stop_sequence+1),'[]'::jsonb) into v_rows
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=p_wayplan_id;
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
    'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO','legacy_snapshot',true,'rows',v_rows);
end $$;

revoke all on function public.be_wayplan_lifo_manifest(text) from public,anon;
grant execute on function public.be_wayplan_lifo_manifest(text) to authenticated;

create or replace function public.be_rider_wayplan_route_snapshot_v1(p_wayplan_id text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity(); v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role','')); v_plan public.be_wayplan_dispatches%rowtype; v_active int; v_generated int;
  v_route public.be_wayplan_route_versions%rowtype; v_rows jsonb; v_current jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then return jsonb_build_object('ok',false,'error','Wayplan not found'); end if;
  if not ((v_role='rider' and upper(coalesce(v_plan.rider_code,''))=v_code) or (v_role='driver' and upper(coalesce(v_plan.driver_code,''))=v_code) or (v_role='helper' and upper(coalesce(v_plan.helper_code,''))=v_code)) then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER');
  end if;
  v_generated:=coalesce((v_plan.metadata->>'generated_route_version')::int,1);
  v_active:=coalesce((v_plan.metadata->>'active_route_version')::int,v_generated);
  select * into v_route from public.be_wayplan_route_versions where wayplan_id=p_wayplan_id and route_version=v_active;
  if not found then return jsonb_build_object('ok',false,'error','No generated route version is available for this Wayplan'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',(o.value->>'sequence')::int,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
    'recipient_name',coalesce(s.receiver_name,s.recipient_name),'recipient_phone',coalesce(s.receiver_phone,s.recipient_phone),
    'address',coalesce(s.delivery_address,s.address),'township',coalesce(s.delivery_township,s.recipient_township,s.township),
    'notes',coalesce(s.metadata->>'notes',s.metadata->>'remark',s.metadata->>'remarks',''),'status',coalesce(s.stop_status,s.rider_status,'PENDING')
  ) order by (o.value->>'sequence')::int),'[]'::jsonb) into v_rows
  from jsonb_array_elements(v_route.ordered_stops) o(value)
  join public.be_wayplan_dispatch_stops s on s.wayplan_id=p_wayplan_id and s.delivery_way_id=o.value->>'delivery_way_id';

  select x into v_current from jsonb_array_elements(v_rows) x
  where upper(coalesce(x->>'status','PENDING')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','SKIP','RESCHEDULE','CUSTOMER_UNAVAILABLE','FAILED_DELIVERY','CANCELLED')
  order by (x->>'sequence')::int limit 1;

  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'generated_route_version',v_generated,'active_route_version',v_active,
    'route_source',v_route.route_source,'route_mode',v_route.route_mode,'route_distance_m',v_route.distance_m,'route_duration_s',v_route.duration_s,
    'current_stop',v_current,'stops',v_rows,'warehouse_route_immutable',true);
end $$;

revoke all on function public.be_rider_wayplan_route_snapshot_v1(text) from public,anon;
grant execute on function public.be_rider_wayplan_route_snapshot_v1(text) to authenticated;

create or replace function public.be_rider_wayplan_stop_event_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity(); v_code text:=upper(coalesce(v_identity->>'worker_code','')); v_role text:=lower(coalesce(v_identity->>'role',''));
  v_wayplan text:=btrim(coalesce(p_payload->>'wayplan_id','')); v_delivery text:=btrim(coalesce(p_payload->>'delivery_way_id',''));
  v_event text:=upper(btrim(coalesce(p_payload->>'event_type',''))); v_plan public.be_wayplan_dispatches%rowtype; v_stop public.be_wayplan_dispatch_stops%rowtype;
  v_version int; v_active_seq int; v_original_seq int;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_wayplan='' or v_delivery='' then return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required'); end if;
  if v_event not in ('ARRIVED','DELIVERED','CUSTOMER_UNAVAILABLE','RESCHEDULE','RTO','SKIP') then return jsonb_build_object('ok',false,'error','Invalid stop event'); end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=v_wayplan;
  if not found then return jsonb_build_object('ok',false,'error','Wayplan not found'); end if;
  if not ((v_role='rider' and upper(coalesce(v_plan.rider_code,''))=v_code) or (v_role='driver' and upper(coalesce(v_plan.driver_code,''))=v_code)) then
    return jsonb_build_object('ok',false,'error','PRIMARY_ASSIGNED_RIDER_OR_DRIVER_REQUIRED');
  end if;
  select * into v_stop from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and delivery_way_id=v_delivery for update;
  if not found then return jsonb_build_object('ok',false,'error','Wayplan stop not found'); end if;
  v_version:=coalesce((v_plan.metadata->>'active_route_version')::int,(v_plan.metadata->>'generated_route_version')::int,1);
  v_original_seq:=coalesce((v_stop.metadata->>'original_delivery_sequence')::int,v_stop.stop_sequence);
  select (x.value->>'sequence')::int into v_active_seq from public.be_wayplan_route_versions r,jsonb_array_elements(r.ordered_stops) x(value)
    where r.wayplan_id=v_wayplan and r.route_version=v_version and x.value->>'delivery_way_id'=v_delivery limit 1;

  if v_event in ('CUSTOMER_UNAVAILABLE','RESCHEDULE','SKIP') then
    update public.be_wayplan_dispatch_stops set stop_status=v_event,rider_status=v_event,rider_action_at=now(),
      failed_reason=coalesce(nullif(p_payload->>'reason',''),failed_reason),updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;
  end if;

  insert into public.be_wayplan_stop_events_v1(wayplan_id,delivery_way_id,event_type,route_version,original_stop_sequence,active_stop_sequence,actor_code,actor_role,payload)
  values(v_wayplan,v_delivery,v_event,v_version,v_original_seq,v_active_seq,v_code,v_role,p_payload);
  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_delivery,'event_type',v_event,'route_version',v_version,'active_stop_sequence',v_active_seq);
end $$;

revoke all on function public.be_rider_wayplan_stop_event_v1(jsonb) from public,anon;
grant execute on function public.be_rider_wayplan_stop_event_v1(jsonb) to authenticated;

create or replace function public.be_rider_wayplan_reroute_v1(p_wayplan_id text,p_route jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity(); v_code text:=upper(coalesce(v_identity->>'worker_code','')); v_role text:=lower(coalesce(v_identity->>'role',''));
  v_plan public.be_wayplan_dispatches%rowtype; v_parent int; v_new int; v_expected text[]; v_actual text[]; v_duplicates text[];
  v_source text:=upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK')); v_mode text:=upper(coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY'));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id for update;
  if not found then return jsonb_build_object('ok',false,'error','Wayplan not found'); end if;
  if not ((v_role='rider' and upper(coalesce(v_plan.rider_code,''))=v_code) or (v_role='driver' and upper(coalesce(v_plan.driver_code,''))=v_code)) then
    return jsonb_build_object('ok',false,'error','PRIMARY_ASSIGNED_RIDER_OR_DRIVER_REQUIRED');
  end if;
  if jsonb_typeof(p_route->'ordered_stops')<>'array' then return jsonb_build_object('ok',false,'error','ordered_stops are required'); end if;

  select array_agg(delivery_way_id order by delivery_way_id) into v_expected
  from public.be_wayplan_dispatch_stops where wayplan_id=p_wayplan_id
    and upper(coalesce(stop_status,rider_status,'PENDING')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','SKIP','RESCHEDULE','CUSTOMER_UNAVAILABLE','FAILED_DELIVERY','CANCELLED');
  select array_agg(value->>'delivery_way_id' order by value->>'delivery_way_id') into v_actual from jsonb_array_elements(p_route->'ordered_stops');
  select array_agg(id) into v_duplicates from (select value->>'delivery_way_id' id,count(*) from jsonb_array_elements(p_route->'ordered_stops') group by 1 having count(*)>1) q;
  if coalesce(cardinality(v_duplicates),0)>0 or coalesce(v_actual,'{}'::text[]) is distinct from coalesce(v_expected,'{}'::text[]) then
    return jsonb_build_object('ok',false,'error','Reroute must contain every remaining eligible stop exactly once','expected',v_expected,'actual',v_actual);
  end if;
  if coalesce(cardinality(v_expected),0)=0 then return jsonb_build_object('ok',false,'error','No remaining eligible stops to reroute'); end if;

  v_parent:=coalesce((v_plan.metadata->>'active_route_version')::int,(v_plan.metadata->>'generated_route_version')::int,1);
  select coalesce(max(route_version),0)+1 into v_new from public.be_wayplan_route_versions where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_route_versions(wayplan_id,route_version,version_type,route_source,route_mode,parent_route_version,origin,ordered_stops,
    distance_m,duration_s,request_count,reason,generated_by,metadata)
  values(p_wayplan_id,v_new,'RIDER_REROUTE',v_source,v_mode,v_parent,coalesce(p_route->'origin','{}'::jsonb),p_route->'ordered_stops',
    coalesce(nullif(p_route->>'distance_m','')::bigint,0),coalesce(nullif(p_route->>'duration_s','')::bigint,0),coalesce(nullif(p_route->>'request_count','')::int,0),
    p_reason,v_code,jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','optimized_at',p_route->>'optimized_at'));

  update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('active_route_version',v_new,'last_rerouted_at',now(),'last_rerouted_by',v_code),updated_at=now()
    where wayplan_id=p_wayplan_id;
  update public.be_rider_route_runs_v46 set route_version=v_new,updated_at=now() where wayplan_id=p_wayplan_id;
  insert into public.be_wayplan_stop_events_v1(wayplan_id,event_type,route_version,actor_code,actor_role,payload)
    values(p_wayplan_id,'REROUTE',v_new,v_code,v_role,jsonb_build_object('parent_route_version',v_parent,'reason',p_reason,'source',v_source,'mode',v_mode));
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'generated_route_version',coalesce((v_plan.metadata->>'generated_route_version')::int,1),
    'active_route_version',v_new,'warehouse_route_unchanged',true,'route_source',v_source,'route_mode',v_mode);
end $$;

revoke all on function public.be_rider_wayplan_reroute_v1(text,jsonb,text) from public,anon;
grant execute on function public.be_rider_wayplan_reroute_v1(text,jsonb,text) to authenticated;
