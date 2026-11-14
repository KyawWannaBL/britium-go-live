-- V57: repair Multi-Van Wayplan creation and make Rider optional when a valid Driver is assigned.
-- Fixes ambiguous rider_name/driver_name/helper_name PL/pgSQL references and preserves Driver-only van operation.

CREATE OR REPLACE FUNCTION public.be_generate_multi_van_v43(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
#variable_conflict use_variable
declare
  ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
  request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code'); branch text;
  planning_mode text:=upper(coalesce(nullif(p_payload->>'planning_mode',''),'STANDARD_50_75'));
  old_event jsonb; result jsonb; results jsonb:='[]'::jsonb; ids text[]:='{}'; crew_keys text[]:='{}'; van_keys text[]:='{}';
  parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
  reason text:=btrim(coalesce(p_payload->>'below_minimum_reason','')); actor text; plan_id text; idx int:=0;
  route_payload jsonb; origin jsonb; saved_route jsonb; crew_mode text; emergency_reason text;
  driver_name text; rider_name text; helper_name text; wave_no int; trip_no int; wave_count int:=1; key text;
begin
  ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
  if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 64 then raise exception 'Select one to 64 route trips.'; end if;
  if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
  branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end;
  origin:=ctx->'route_origins'->region; if origin is null then raise exception 'Configured branch route origin is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner-v43',0));
  select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED_V43' and resource_id=request_id limit 1;
  if old_event is not null then
    if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
    return old_event->'result';
  end if;
  ctx:=public.be_multi_van_context();
  for p in select value from jsonb_array_elements(plans) loop
    wave_no:=greatest(1,coalesce(nullif(p->>'wave_no','')::int,1));
    trip_no:=greatest(1,coalesce(nullif(p->>'trip_no','')::int,1));
    wave_count:=greatest(wave_count,wave_no); crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
    n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated route needs parcels.'; end if;
    if n>75 then raise exception 'A delivery route cannot exceed 75 parcels.'; end if; total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
    if v is null then raise exception 'Choose a delivery fleet; pickup/highway fleets are reserved.'; end if;
    key:=wave_no::text||':'||(p->>'vehicle_code'); if key=any(van_keys) then raise exception 'A fleet cannot run two routes in the same wave.'; end if; van_keys:=array_append(van_keys,key);
    if crew_mode='EMERGENCY_MANUAL' then
      driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),''); emergency_reason:=nullif(btrim(p->>'emergency_substitution_reason'),'');
      if driver_name is null or rider_name is null then raise exception 'Emergency Driver and Rider names are required.'; end if;
      if emergency_reason is null or length(emergency_reason)<5 then raise exception 'A reason is required for emergency crew substitution.'; end if;
      if lower(driver_name)=lower(rider_name) or (helper_name is not null and lower(helper_name) in (lower(driver_name),lower(rider_name))) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
      foreach key in array array[wave_no::text||':manual:'||lower(driver_name),wave_no::text||':manual:'||lower(rider_name)] loop
        if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
      end loop;
      if helper_name is not null then key:=wave_no::text||':manual:'||lower(helper_name); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key); end if;
    elsif crew_mode='ROSTER' then
      select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code'; if driver is null then raise exception 'Choose an active Driver.'; end if;
      rider:=null; if coalesce(p->>'rider_code','')<>'' then rider:=null; if coalesce(p->>'rider_code','')<>'' then select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code'; end if; if rider is null then raise exception 'Choose an active Rider or leave Rider empty.'; end if; end if;
      helper:=null; if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if; end if;
      if coalesce(driver->>'branch_code','') not in ('',branch) or (rider is not null and coalesce(rider->>'branch_code','') not in ('',branch)) or (helper is not null and coalesce(helper->>'branch_code','') not in ('',branch)) then raise exception 'Selected crew belongs to another branch.'; end if;
      if (rider is not null and p->>'driver_code'=p->>'rider_code') or (helper is not null and p->>'helper_code'=p->>'driver_code') or (helper is not null and rider is not null and p->>'helper_code'=p->>'rider_code') then raise exception 'Driver, Rider and Helper must be different people.'; end if;
      key:=wave_no::text||':'||(p->>'driver_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key);
      if rider is not null then key:=wave_no::text||':'||(p->>'rider_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key); end if;
      if helper is not null then key:=wave_no::text||':'||(p->>'helper_code'); if key=any(crew_keys) then raise exception 'A crew member cannot serve two routes in the same wave.'; end if; crew_keys:=array_append(crew_keys,key); end if;
      if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or (rider is not null and b->>'rider_code'=p->>'rider_code') or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'A selected fleet or crew member is physically active on another dispatched/on-hold Wayplan. Refresh availability.'; end if;
    else raise exception 'Invalid crew mode.'; end if;
    for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two routes.'; end if; ids:=array_append(ids,parcel_id); end loop;
    select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
    if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
  end loop;
  if planning_mode not in ('YANGON_MASTER','YANGON_MASTER_MULTI_TRIP') and short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
  if planning_mode not in ('YANGON_MASTER','YANGON_MASTER_MULTI_TRIP') and short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then raise exception 'Operator approval and a reason are required for the van below 50 parcels.'; end if;
  perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
  for p in select value from jsonb_array_elements(plans) loop
    idx:=idx+1; wave_no:=greatest(1,coalesce(nullif(p->>'wave_no','')::int,1)); trip_no:=greatest(1,coalesce(nullif(p->>'trip_no','')::int,1));
    plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx; crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
    if crew_mode='ROSTER' then
      select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
      select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
      select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
      result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name','rider_name',coalesce(rider->>'name',''),'helper_name',coalesce(helper->>'name',''),'actor',actor));
      driver_name:=driver->>'name'; rider_name:=coalesce(rider->>'name',''); helper_name:=coalesce(helper->>'name','');
    else
      driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),'');
      result:=public.be_generate_wayplan_emergency_crew_v1(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'branch_code',branch,'vehicle_name',v->>'name','actor',actor));
    end if;
    if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
    update public.be_wayplan_dispatches
    set rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,
        rider_name=rider_name,
        driver_code=case when crew_mode='ROSTER' then p->>'driver_code' else null end,
        driver_name=driver_name,
        helper_code=case when crew_mode='ROSTER' then nullif(p->>'helper_code','') else null end,
        helper_name=helper_name,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),'planning_mode',planning_mode,'wave_no',wave_no,'trip_no',trip_no,'crew_mode',crew_mode,'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason,'emergency_substitution_reason',p->>'emergency_substitution_reason'),
        updated_at=now()
    where wayplan_id=plan_id;
    update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
    update public.be_wayplan_dispatch_stops s
    set stop_sequence=x.ord::int,rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,rider_name=rider_name
    from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
    where s.wayplan_id=plan_id and s.delivery_way_id=x.id;
    route_payload:=coalesce(p->'route','{}'::jsonb)||jsonb_build_object('origin',origin,'wave_no',wave_no,'trip_no',trip_no,'ordered_stops',(
      select jsonb_agg(jsonb_build_object('delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township) order by s.stop_sequence)
      from public.be_wayplan_dispatch_stops s left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id where s.wayplan_id=plan_id));
    saved_route:=public.be_save_operational_route_version_v1(plan_id,'GENERATED',route_payload,null);
    results:=results||jsonb_build_array(result||jsonb_build_object('route_version',saved_route->'route_version','route_source',p#>>'{route,source}','route_mode',p#>>'{route,route_mode}','crew_mode',crew_mode,'wave_no',wave_no,'trip_no',trip_no));
    if jsonb_array_length(p->'delivery_way_ids')<50 then
      insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
      values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id,'wave_no',wave_no,'trip_no',trip_no));
    end if;
  end loop;
  result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count,'wave_count',wave_count);
  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED_V43','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
  return result || jsonb_build_object('build','WAYPLAN_MULTI_VAN_GENERATE_V57','rider_optional',true);
end
$function$
;
