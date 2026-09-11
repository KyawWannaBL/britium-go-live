create or replace function public.be_multi_van_context()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
   raise exception using errcode='42501',message='Wayplan operator permission is required.';
 end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type') order by record_key),'[]') into v_vehicles
 from public.be_master_data_rows where dataset_key='fleet_master' and deleted_at is null
 and upper(coalesce(status,'ACTIVE'))='ACTIVE'
 and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
 and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');
 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'helper_code',helper_code)),'[]') into v_busy
 from public.be_wayplan_dispatches where wayplan_status not in ('CANCELLED','COMPLETED','CLOSED');
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','helpers',v_options->'helpers','busy',v_busy);
end $$;
revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_multi_van_queue(p_region text)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_queue jsonb; v_rows jsonb;
begin
 perform public.be_multi_van_context();
 v_queue:=public.be_dispatch_ready_queue_v19(10000,p_region);
 select coalesce(jsonb_agg(r||jsonb_build_object('latitude',l.latitude,'longitude',l.longitude)),'[]') into v_rows
 from jsonb_array_elements(v_queue->'queue') r
 join public.be_delivery_location_registry l on l.delivery_way_id=r->>'delivery_way_id';
 return v_queue||jsonb_build_object('queue',v_rows);
end $$;
revoke all on function public.be_multi_van_queue(text) from public,anon;
grant execute on function public.be_multi_van_queue(text) to authenticated;

create or replace function public.be_generate_multi_van(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
 ctx jsonb; plans jsonb:=p_payload->'plans'; p jsonb; v jsonb; driver jsonb; helper jsonb;
 request_id text:=p_payload->>'request_id'; region text:=upper(p_payload->>'region_code');
 old_event jsonb; result jsonb; results jsonb:='[]'; ids text[]:='{}'; crews text[]:='{}'; vans text[]:='{}';
 parcel_id text; n int; short_count int:=0; total_count int:=0; weight numeric;
 reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
 actor text; plan_id text; idx int:=0; below_used boolean;
begin
 ctx:=public.be_multi_van_context();
 actor:=coalesce(auth.jwt()->>'email',auth.uid()::text);
 if request_id is null or request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
 if plans is null or jsonb_typeof(plans)<>'array' or jsonb_array_length(plans) not between 1 and 7 then raise exception 'Select one to seven delivery vans.'; end if;
 if region is null or region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('britium-multi-van-planner',0));
 select details into old_event from public.be_audit_events where action='MULTI_VAN_CREATED' and resource_id=request_id limit 1;
 if old_event is not null then
   if old_event->'request' is distinct from p_payload or old_event->>'actor_id'<>auth.uid()::text then raise exception 'Request ID already belongs to another operation.'; end if;
   return old_event->'result';
 end if;
 -- Reload availability after taking the lock.
 ctx:=public.be_multi_van_context();
 for p in select value from jsonb_array_elements(plans) loop
   n:=jsonb_array_length(p->'delivery_way_ids');
   if n is null or n<1 then raise exception 'Each activated van needs parcels.'; end if;
   total_count:=total_count+n;
   if n<50 then short_count:=short_count+1; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
   if v is null then raise exception 'Choose a delivery van; pickup/highway vehicles are reserved.'; end if;
   if (p->>'vehicle_code')=any(vans) then raise exception 'A van cannot be allocated twice.'; end if;
   vans:=array_append(vans,p->>'vehicle_code');
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   if driver is null then raise exception 'Choose an active, authenticated driver.'; end if;
   if coalesce(driver->>'branch_code','') not in ('',case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end) then raise exception 'Driver belongs to another branch.'; end if;
   helper:=null;
   if coalesce(p->>'helper_code','')<>'' then
     select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
     if helper is null then raise exception 'Choose an active helper or leave helper empty.'; end if;
   end if;
   if helper is not null and coalesce(helper->>'branch_code','') not in ('',case region when 'YANGON' then 'YGN' when 'MANDALAY' then 'MDY' else 'NPT' end) then raise exception 'Helper belongs to another branch.'; end if;
   if (p->>'driver_code')=any(crews) or (coalesce(p->>'helper_code','')<>'' and (p->>'helper_code')=any(crews)) then raise exception 'A crew member cannot serve two vans in this plan.'; end if;
   crews:=array_append(crews,p->>'driver_code');
   if helper is not null then crews:=array_append(crews,p->>'helper_code'); end if;
   if exists(select 1 from jsonb_array_elements(ctx->'busy') b where b->>'vehicle_code'=p->>'vehicle_code' or b->>'driver_code'=p->>'driver_code' or (helper is not null and b->>'helper_code'=p->>'helper_code')) then raise exception 'A selected vehicle or crew member already has an active Wayplan. Refresh availability.'; end if;
   for parcel_id in select jsonb_array_elements_text(p->'delivery_way_ids') loop
     if parcel_id=any(ids) then raise exception 'A parcel cannot belong to two vans.'; end if;
     ids:=array_append(ids,parcel_id);
   end loop;
   select coalesce(sum(weight_kg),0) into weight from public.be_data_entry_parcel_details where delivery_way_id in (select jsonb_array_elements_text(p->'delivery_way_ids'));
   if coalesce((v->>'capacity_kg')::numeric,0)>0 and weight>(v->>'capacity_kg')::numeric then raise exception 'Selected parcel weight exceeds vehicle capacity.'; end if;
 end loop;
 if short_count>1 then raise exception 'Only one delivery van may be below 50 parcels.'; end if;
 if short_count=1 then
   if coalesce((p_payload->>'approve_below_minimum')::boolean,false) is not true or length(reason)<5 then raise exception 'Operator approval and a reason are required for the van below 50 parcels.'; end if;
   select exists(select 1 from public.be_audit_events where action='MULTI_VAN_BELOW_MINIMUM_APPROVED'
     and (created_at at time zone 'Asia/Yangon')::date=(now() at time zone 'Asia/Yangon')::date) into below_used;
   if below_used then raise exception 'The one below-minimum van exception for today has already been used.'; end if;
 end if;
 -- Locks serialize parcel changes during this atomic operation.
 perform 1 from public.be_data_entry_parcel_details where delivery_way_id=any(ids) order by delivery_way_id for update;
 for p in select value from jsonb_array_elements(plans) loop
   idx:=idx+1; plan_id:='WP-'||to_char(now(),'YYYYMMDD')||'-'||request_id||'-'||idx;
   if exists(select 1 from public.be_wayplan_dispatches where wayplan_id=plan_id) then raise exception 'Wayplan identifier already exists.'; end if;
   select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code';
   select x into driver from jsonb_array_elements(ctx->'drivers') x where x->>'id'=p->>'driver_code';
   select x into helper from jsonb_array_elements(ctx->'helpers') x where x->>'id'=p->>'helper_code';
   result:=public.be_generate_wayplan(p||jsonb_build_object('wayplan_id',plan_id,'region_code',region,
    'vehicle_name',v->>'name','driver_name',driver->>'name','helper_name',coalesce(helper->>'name',''),
    'rider_code','','rider_name','','actor',actor));
   if not coalesce((result->>'ok')::boolean,false) then raise exception '%',coalesce(result->>'error','Wayplan creation failed.'); end if;
   update public.be_wayplan_dispatches set metadata=metadata||jsonb_build_object('multi_van_request',request_id,'operator_id',auth.uid(),
     'below_minimum',jsonb_array_length(p->'delivery_way_ids')<50,'below_minimum_reason',reason)
   where wayplan_id=plan_id;
   -- Keep the operator-reviewed geographic sequence, not a fresh alphabetical sort.
   update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=plan_id;
   update public.be_wayplan_dispatch_stops s set stop_sequence=x.ord::int
   from jsonb_array_elements_text(p->'delivery_way_ids') with ordinality x(id,ord)
   where s.wayplan_id=plan_id and s.delivery_way_id=x.id;
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
