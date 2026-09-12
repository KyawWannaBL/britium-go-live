-- Flexible Wayplan operations: management/operations access, audited emergency crew substitution,
-- while preserving roster validation for normal operations and immutable route/LIFO snapshots.

create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in (
   'superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor',
   'operations','operations_admin','operations-admin','management','director'
 ) then
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

create or replace function public.be_generate_wayplan_emergency_crew_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_role text:=lower(public.be_current_user_role());
  v_wayplan_id text:=coalesce(nullif(p_payload->>'wayplan_id',''),'WP-'||to_char(now(),'YYYYMMDD-HH24MISS'));
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_branch text:=coalesce(nullif(p_payload->>'branch_code',''),case v_region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end);
  v_vehicle_code text:=nullif(p_payload->>'vehicle_code','');
  v_vehicle_name text:=nullif(p_payload->>'vehicle_name','');
  v_driver_name text:=nullif(btrim(p_payload->>'driver_name'),'');
  v_rider_name text:=nullif(btrim(p_payload->>'rider_name'),'');
  v_helper_name text:=nullif(btrim(p_payload->>'helper_name'),'');
  v_reason text:=nullif(btrim(p_payload->>'emergency_substitution_reason'),'');
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  v_selected jsonb:=coalesce(p_payload->'delivery_way_ids','[]'::jsonb);
  v_selected_count int; v_eligible int; v_count int; v_cod numeric;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
    raise exception using errcode='42501',message='Emergency crew substitution requires management/operations Wayplan permission.';
  end if;
  if v_driver_name is null or v_rider_name is null then raise exception 'Emergency Driver and Rider names are required.'; end if;
  if v_reason is null or length(v_reason)<5 then raise exception 'A reason is required for emergency crew substitution.'; end if;
  if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)=0 then raise exception 'Select at least one delivery parcel.'; end if;
  v_selected_count:=jsonb_array_length(v_selected);

  select count(*)::int into v_eligible from public.be_v_dispatch_ready_queue q
  join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
  where d.delivery_region=v_region and d.delivery_route_mode='DOORSTEP_MAP' and d.location_required
    and (q.delivery_way_id in (select jsonb_array_elements_text(v_selected)) or q.waybill_no in (select jsonb_array_elements_text(v_selected)));
  if v_eligible<>v_selected_count then raise exception 'Every selected parcel must be ready and belong to the active Wayplan region.'; end if;

  insert into public.be_wayplan_dispatches(
    wayplan_id,dispatch_batch_no,branch_code,vehicle_code,vehicle_name,
    driver_code,driver_name,rider_code,rider_name,helper_code,helper_name,
    wayplan_status,created_by,metadata
  ) values (
    v_wayplan_id,v_wayplan_id,v_branch,v_vehicle_code,v_vehicle_name,
    null,v_driver_name,null,v_rider_name,null,v_helper_name,
    'CREATED',v_actor,p_payload||jsonb_build_object(
      'build','WAYPLAN_EMERGENCY_CREW_V1','crew_mode','EMERGENCY_MANUAL',
      'emergency_substitution',true,'emergency_substitution_reason',v_reason,
      'rider_app_mapping',false,'manual_crew_warning','Manual emergency Rider has no Rider App account mapping unless separately provisioned.'
    )
  ) on conflict(wayplan_id) do update set
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,
    driver_code=null,driver_name=excluded.driver_name,rider_code=null,rider_name=excluded.rider_name,
    helper_code=null,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_dispatches.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  delete from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  insert into public.be_wayplan_dispatch_stops(
    wayplan_id,stop_sequence,pickup_id,pickup_way_id,delivery_way_id,waybill_no,
    recipient_name,recipient_phone,township,address,cod_amount,delivery_fee,parcel_weight_kg,stop_status,rider_code,rider_name,metadata
  )
  select v_wayplan_id,row_number() over(order by q.township,q.address,q.delivery_way_id),
         q.pickup_id,q.pickup_way_id,q.delivery_way_id,q.waybill_no,q.recipient_name,q.recipient_phone,
         q.township,q.address,q.cod_amount,q.delivery_fee,q.parcel_weight_kg,'READY_FOR_DISPATCH',null,v_rider_name,
         q.metadata||jsonb_build_object('wayplan_build','EMERGENCY_CREW_V1','crew_mode','EMERGENCY_MANUAL')
  from public.be_v_dispatch_ready_queue q
  where q.delivery_way_id in (select jsonb_array_elements_text(v_selected))
     or q.waybill_no in (select jsonb_array_elements_text(v_selected));

  select count(*),coalesce(sum(cod_amount),0) into v_count,v_cod from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  if v_count=0 then delete from public.be_wayplan_dispatches where wayplan_id=v_wayplan_id; raise exception 'No eligible dispatch-ready stops found.'; end if;
  update public.be_wayplan_dispatches set total_stops=v_count,total_parcels=v_count,total_cod=v_cod,updated_at=now() where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_membership_v40(
    wayplan_id,delivery_way_id,pickup_id,route_zone,membership_status,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,created_by,metadata
  )
  select v_wayplan_id,s.delivery_way_id,s.pickup_id,coalesce(nullif(s.township,''),'UNASSIGNED'),'PLANNED',
         v_vehicle_code,v_vehicle_name,null,v_rider_name,null,v_driver_name,null,v_helper_name,v_actor,
         jsonb_build_object('assignment_mode','EMERGENCY_MANUAL','emergency_substitution_reason',v_reason,'build','EMERGENCY_CREW_V1')
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id
  on conflict(wayplan_id,delivery_way_id) do update set
    pickup_id=excluded.pickup_id,route_zone=excluded.route_zone,membership_status='PLANNED',
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,rider_code=null,rider_name=excluded.rider_name,
    driver_code=null,driver_name=excluded.driver_name,helper_code=null,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_membership_v40.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  update public.be_waybill_ledger w set wayplan_id=v_wayplan_id,wayplan_status='WAYPLAN_CREATED',dispatch_status='WAYPLAN_CREATED',updated_at=now()
  where exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id and s.delivery_way_id=w.delivery_way_id);

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'WAYPLAN_EMERGENCY_CREW_SUBSTITUTION','WAYPLAN',v_wayplan_id,
    jsonb_build_object('driver_name',v_driver_name,'rider_name',v_rider_name,'helper_name',v_helper_name,'reason',v_reason,'vehicle_code',v_vehicle_code));

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan_id,'total_stops',v_count,'total_cod',v_cod,'status','WAYPLAN_CREATED','crew_mode','EMERGENCY_MANUAL');
end $$;
revoke all on function public.be_generate_wayplan_emergency_crew_v1(jsonb) from public,anon;
grant execute on function public.be_generate_wayplan_emergency_crew_v1(jsonb) to authenticated;

create or replace function public.be_generate_multi_van_v2(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; rider jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code'); branch text;
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric; reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; route_payload jsonb; origin jsonb; saved_route jsonb; crew_mode text; emergency_reason text;
 driver_name text; rider_name text; helper_name text;
begin
 ctx:=public.be_multi_van_context(); actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 branch:=case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end; origin:=ctx->'route_origins'->region;
 if origin is null then raise exception 'Configured branch route origin is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED_V2' and resource_id=request_id limit 1;
 if old_event is not null then if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if; return old_event->'result'; end if;
 ctx:=public.be_multi_van_context();

 for p in select value from jsonb_array_elements(plans) loop
   crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
   n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   if n>75 then raise exception 'A delivery van cannot exceed 75 parcels.'; end if; total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY'; if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if; vans:=array_append(vans,p->>'vehicle_code');

   if crew_mode='EMERGENCY_MANUAL' then
     driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),''); emergency_reason:=nullif(btrim(p->>'emergency_substitution_reason'),'');
     if driver_name is null or rider_name is null then raise exception 'Emergency Driver and Rider names are required.'; end if;
     if emergency_reason is null or length(emergency_reason)<5 then raise exception 'A reason is required for emergency crew substitution.'; end if;
     if lower(driver_name)=lower(rider_name) or (helper_name is not null and lower(helper_name) in (lower(driver_name),lower(rider_name))) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
     if ('manual:'||lower(driver_name))=any(crews) or ('manual:'||lower(rider_name))=any(crews) or (helper_name is not null and ('manual:'||lower(helper_name))=any(crews)) then raise exception 'An emergency substitute cannot serve two vans in the same plan.'; end if;
     crews:=array_append(crews,'manual:'||lower(driver_name)); crews:=array_append(crews,'manual:'||lower(rider_name)); if helper_name is not null then crews:=array_append(crews,'manual:'||lower(helper_name)); end if;
   elsif crew_mode='ROSTER' then
     select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code'; if driver is null then raise exception 'Choose an active Driver.'; end if;
     select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code'; if rider is null then raise exception 'Choose an active Rider.'; end if;
     helper:=null; if coalesce(p->>'helper_code','')<>'' then select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code'; if helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if; end if;
     if coalesce(driver->>'branch_code','') not in ('',branch) or coalesce(rider->>'branch_code','') not in ('',branch) or (helper is not null and coalesce(helper->>'branch_code','') not in ('',branch)) then raise exception 'Selected crew belongs to another branch.'; end if;
     if p->>'driver_code'=p->>'rider_code' or (helper is not null and p->>'helper_code' in (p->>'driver_code',p->>'rider_code')) then raise exception 'Driver, Rider and Helper must be different people.'; end if;
     if (p->>'driver_code')=any(crews) or (p->>'rider_code')=any(crews) or (helper is not null and (p->>'helper_code')=any(crews)) then raise exception 'A crew member cannot serve two vans in this plan.'; end if;
     crews:=array_append(crews,p->>'driver_code'); crews:=array_append(crews,p->>'rider_code'); if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
     if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or b->>'rider_code'=p->>'rider_code' or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'A selected vehicle or crew member already has an active Wayplan. Refresh availability.'; end if;
   else raise exception 'Invalid crew mode.'; end if;

   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if; ids:=array_append(ids,parcel_id); end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
   if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 and (coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5) then raise exception 'Operator approval and a reason are required for the van below 50 parcels.'; end if;
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;

 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx; crew_mode:=upper(coalesce(nullif(p->>'crew_mode',''),'ROSTER'));
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
   if crew_mode='ROSTER' then
     select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
     select x into rider from jsonb_array_elements(ctx->'riders') x where x->>'id'=p->>'rider_code';
     select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
     result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'vehicle_name',v->>'name','driver_name',driver->>'name','rider_name',rider->>'name','helper_name',coalesce(helper->>'name',''),'actor',actor));
     driver_name:=driver->>'name'; rider_name:=rider->>'name'; helper_name:=coalesce(helper->>'name','');
   else
     driver_name:=nullif(btrim(p->>'driver_name'),''); rider_name:=nullif(btrim(p->>'rider_name'),''); helper_name:=nullif(btrim(p->>'helper_name'),'');
     result:=public.be_generate_wayplan_emergency_crew_v1(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,'branch_code',branch,'vehicle_name',v->>'name','actor',actor));
   end if;
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;

   update public.be_wayplan_dispatches set
     rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,rider_name=rider_name,
     driver_code=case when crew_mode='ROSTER' then p->>'driver_code' else null end,driver_name=driver_name,
     helper_code=case when crew_mode='ROSTER' then nullif(p->>'helper_code','') else null end,helper_name=helper_name,
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),'crew_mode',crew_mode,'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason,'emergency_substitution_reason',p->>'emergency_substitution_reason'),updated_at=now()
   where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int,rider_code=case when crew_mode='ROSTER' then p->>'rider_code' else null end,rider_name=rider_name
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord) where s.wayplan_id=plan_id and s.delivery_way_id=x.id;

   route_payload:=coalesce(p->'route','{}'::jsonb)||jsonb_build_object('origin',origin,'ordered_stops',(select jsonb_agg(jsonb_build_object('delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,'address',s.address,'township',s.township) order by s.stop_sequence) from public.be_wayplan_dispatch_stops s left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id where s.wayplan_id=plan_id));
   saved_route:=public.be_save_operational_route_version_v1(plan_id,'GENERATED',route_payload,null);
   results:=results||jsonb_build_array(result||jsonb_build_object('route_version',saved_route->'route_version','route_source',p#>>'{route,source}','route_mode',p#>>'{route,route_mode}','crew_mode',crew_mode));
   if jsonb_array_length(p->'delivery_way_ids')<50 then insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_BELOW_MINIMUM_APPROVED','WAYPLAN',plan_id,jsonb_build_object('vehicle',v,'parcel_count',jsonb_array_length(p->'delivery_way_ids'),'reason',reason,'request_id',request_id)); end if;
 end loop;
 result:=jsonb_build_object('ok',true,'wayplans',results,'parcel_count',total_count);
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details) values(auth.uid(),actor,public.be_current_user_role(),'MULTI_VAN_CREATED_V2','WAYPLAN_BATCH',request_id,jsonb_build_object('request',p_payload,'result',result,'actor_id',auth.uid()));
 return result;
end $$;
revoke all on function public.be_generate_multi_van_v2(jsonb) from public,anon;
grant execute on function public.be_generate_multi_van_v2(jsonb) to authenticated;
