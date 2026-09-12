-- Full Operational Wayplan V1: Rider is a first-class crew allocation and every created Wayplan records an immutable generated route.

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
    'vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code,'wayplan_id',wayplan_id
  )),'[]'::jsonb)
  into v_busy
  from public.be_wayplan_dispatches
  where upper(coalesce(wayplan_status,'')) not in ('CANCELLED','COMPLETED','CLOSED');

  select coalesce(jsonb_object_agg(x.region_code,jsonb_build_object(
    'branch_code',x.branch_code,'label',x.branch_name,'latitude',x.lat,'longitude',x.lng
  )),'{}'::jsonb)
  into v_route_origins
  from (
    select distinct on (case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end)
      case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end as region_code,
      branch_code,branch_name,lat,lng,updated_at
    from public.be_branch_offices
    where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null
    order by case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,
             coalesce(is_head_office,false) desc,updated_at desc nulls last
  ) x
  where x.region_code is not null;

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

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code'); branch text;
 old_event jsonb; result jsonb; route_result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
 reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0;
begin
 ctx:=public.be_multi_van_context();
 actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' when 'NAYPYITAW' then 'NPT' else null end;
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if branch is null then raise exception 'Choose an active delivery region.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));

 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then
   if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
   return old_event->'result';
 end if;

 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids');
   if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   if n>75 then raise exception 'A delivery van may carry at most 75 parcels in this planning mode.'; end if;
   total_count:=total_count+n;
   if n<50 then short_count:=short_count+1; end if;

   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
   if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if;
   vans:=array_append(vans,p->>'vehicle_code');

   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   if driver is null then raise exception 'Choose an active, authenticated driver.'; end if;
   if coalesce(driver->>'branch_code','') not in ('',branch) then raise exception 'Driver belongs to another branch.'; end if;

   select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
   if rider is null then raise exception 'Choose an active, authenticated rider.'; end if;
   if coalesce(rider->>'branch_code','') not in ('',branch) then raise exception 'Rider belongs to another branch.'; end if;

   helper:=null;
   if coalesce(p->>'helper_code','')<>'' then
     select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
     if helper is null then raise exception 'Choose an active helper or leave helper empty.'; end if;
     if coalesce(helper->>'branch_code','') not in ('',branch) then raise exception 'Helper belongs to another branch.'; end if;
   end if;

   if upper(p->>'driver_code')=upper(p->>'rider_code')
      or (helper is not null and upper(p->>'helper_code') in (upper(p->>'driver_code'),upper(p->>'rider_code'))) then
     raise exception 'Driver, Rider and Helper must be different people.';
   end if;

   if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews)
      or (helper is not null and (p->>'helper_code')=any(crews)) then
     raise exception 'A crew member cannot occupy another crew position in this planning batch.';
   end if;
   crews:=array_append(crews,p->>'driver_code');
   crews:=array_append(crews,p->>'rider_code');
   if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;

   if exists(
     select 1 from jsonb_array_elements(ctx->'busy') b
     where b->>'vehicle_code'=p->>'vehicle_code'
       or upper(p->>'driver_code') in (upper(coalesce(b->>'driver_code','')),upper(coalesce(b->>'rider_code','')),upper(coalesce(b->>'helper_code','')))
       or upper(p->>'rider_code') in (upper(coalesce(b->>'driver_code','')),upper(coalesce(b->>'rider_code','')),upper(coalesce(b->>'helper_code','')))
       or (helper is not null and upper(p->>'helper_code') in (upper(coalesce(b->>'driver_code','')),upper(coalesce(b->>'rider_code','')),upper(coalesce(b->>'helper_code',''))))
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
     'wayplan_id',plan_id,'region_code',region,
     'vehicle_name',v->>'name','driver_name',driver->>'name',
     'rider_code',rider->>'id','rider_name',rider->>'name',
     'helper_name',coalesce(helper->>'name',''),'actor',actor
   ));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;

   update public.be_wayplan_dispatches set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
     'multi_van_request',request_id,'operator_id',auth.uid(),
     'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason,
     'route_source',coalesce(p#>>'{route,source}','GEOGRAPHIC_FALLBACK'),
     'route_mode',coalesce(p#>>'{route,route_mode}','GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY')
   ) where wayplan_id=plan_id;

   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
   where s.wayplan_id=plan_id and s.delivery_way_id=x.id;

   route_result:=public.be_wayplan_record_generated_route_v1(plan_id,coalesce(p->'route','{}'::jsonb),actor);
   result:=result||jsonb_build_object('generated_route',route_result);
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
