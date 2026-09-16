-- V46: safe CREATED-only Wayplan revision by transactional replacement.
-- Historical generated route versions and warehouse loading snapshots are never mutated or deleted.

create or replace function public.be_created_wayplan_revision_snapshot_v46(p_wayplan_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_wayplan public.be_wayplan_dispatches%rowtype;
  v_stops jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;

  select * into v_wayplan
  from public.be_wayplan_dispatches
  where wayplan_id=nullif(btrim(coalesce(p_wayplan_id,'')),'');

  if not found then
    return jsonb_build_object('ok',false,'error','Wayplan not found.');
  end if;

  if upper(coalesce(v_wayplan.wayplan_status,'')) <> 'CREATED' then
    return jsonb_build_object('ok',false,'error','Only a CREATED Wayplan can be revised before dispatch','wayplan_status',v_wayplan.wayplan_status);
  end if;

  if v_wayplan.dispatched_at is not null or v_wayplan.loaded_to_vehicle_at is not null or v_wayplan.handed_over_to_rider_at is not null then
    return jsonb_build_object('ok',false,'error','This Wayplan has already entered dispatch or vehicle loading and is locked.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',s.delivery_way_id,
    'waybill_no',s.waybill_no,
    'pickup_id',s.pickup_id,
    'pickup_way_id',s.pickup_way_id,
    'recipient_name',s.recipient_name,
    'recipient_phone',s.recipient_phone,
    'township',s.township,
    'address',s.address,
    'cod_amount',s.cod_amount,
    'delivery_fee',s.delivery_fee,
    'parcel_weight_kg',s.parcel_weight_kg,
    'latitude',l.latitude,
    'longitude',l.longitude,
    'stop_sequence',s.stop_sequence,
    'source_wayplan_id',s.wayplan_id
  ) order by s.stop_sequence),'[]'::jsonb)
  into v_stops
  from public.be_wayplan_dispatch_stops s
  left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
  where s.wayplan_id=v_wayplan.wayplan_id
    and upper(coalesce(s.stop_status,'')) not in ('CANCELLED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan.wayplan_id,
    'wayplan_status',v_wayplan.wayplan_status,
    'region_code',coalesce(v_wayplan.metadata->>'region_code',case v_wayplan.branch_code when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' else 'YANGON' end),
    'vehicle_code',v_wayplan.vehicle_code,
    'vehicle_name',v_wayplan.vehicle_name,
    'driver_code',v_wayplan.driver_code,
    'driver_name',v_wayplan.driver_name,
    'rider_code',v_wayplan.rider_code,
    'rider_name',v_wayplan.rider_name,
    'helper_code',v_wayplan.helper_code,
    'helper_name',v_wayplan.helper_name,
    'total_stops',v_wayplan.total_stops,
    'stops',v_stops,
    'build','WAYPLAN_CREATED_REVISION_SNAPSHOT_V46'
  );
end;
$$;

create or replace function public.be_replace_created_wayplan_v46(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_source_id text:=nullif(btrim(coalesce(p_payload->>'source_wayplan_id','')),'');
  v_request_id text:=nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_plan jsonb:=coalesce(p_payload->'plan','{}'::jsonb);
  v_ids jsonb:=coalesce(v_plan->'delivery_way_ids','[]'::jsonb);
  v_route jsonb:=coalesce(v_plan->'route','{}'::jsonb);
  v_source public.be_wayplan_dispatches%rowtype;
  v_ctx jsonb;
  v_vehicle jsonb;
  v_result jsonb;
  v_old_event jsonb;
  v_route_result jsonb;
  v_route_recalc jsonb;
  v_route_payload jsonb;
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  v_role text:=lower(coalesce(public.be_current_user_role(),''));
  v_branch text;
  v_new_id text;
  v_n integer:=0;
  v_eligible integer:=0;
  v_old_count integer:=0;
  v_new_count integer:=0;
  v_short boolean:=false;
  v_reason text:=btrim(coalesce(p_payload->>'below_minimum_reason',''));
  v_approve boolean:=coalesce((p_payload->>'approve_below_minimum')::boolean,false);
  v_weight numeric:=0;
  v_route_source text:=upper(coalesce(v_route->>'source',''));
  v_base_source text:=upper(coalesce(v_route->>'base_source',''));
  v_old_ids text[]:='{}';
  v_selected_ids text[]:='{}';
  v_id text;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Wayplan operator is required' using errcode='42501';
  end if;
  if v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
    raise exception 'Wayplan revision permission is required' using errcode='42501';
  end if;
  if v_source_id is null then raise exception 'source_wayplan_id is required'; end if;
  if v_request_id is null or v_request_id !~ '^[a-fA-F0-9-]{36}$' then raise exception 'A stable request ID is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Choose an active delivery region.'; end if;
  if jsonb_typeof(v_ids)<>'array' then raise exception 'delivery_way_ids must be an array.'; end if;
  v_n:=jsonb_array_length(v_ids);
  if v_n<1 or v_n>75 then raise exception 'A revised Wayplan must contain between 1 and 75 parcels.'; end if;
  if v_route_source not in ('GOOGLE_ROUTES','MAPBOX_FALLBACK','OPERATOR_EDITED') then raise exception 'A reviewed road-based route is required before revision.'; end if;
  if v_region='YANGON' and not (v_route_source='GOOGLE_ROUTES' or (v_route_source='OPERATOR_EDITED' and v_base_source='GOOGLE_ROUTES')) then
    raise exception 'Yangon revised Wayplans require a Google Routes road plan.';
  end if;
  v_short:=v_n<50;
  if v_short and (not v_approve or length(v_reason)<5) then
    raise exception 'Operator approval and a reason are required for a revised Wayplan below 50 parcels.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wayplan-revision-v46:'||v_source_id,0));

  select details into v_old_event
  from public.be_audit_events
  where action='WAYPLAN_REVISED_V46' and resource_id=v_request_id
  limit 1;
  if v_old_event is not null then
    if v_old_event->'request' is distinct from p_payload or v_old_event->>'actor_id'<>auth.uid()::text then
      raise exception 'Request ID already belongs to another operation.';
    end if;
    return v_old_event->'result';
  end if;

  select * into v_source
  from public.be_wayplan_dispatches
  where wayplan_id=v_source_id
  for update;
  if not found then raise exception 'Source Wayplan not found.'; end if;
  if upper(coalesce(v_source.wayplan_status,'')) <> 'CREATED' then
    raise exception 'Only a CREATED Wayplan can be revised before dispatch';
  end if;
  if v_source.dispatched_at is not null or v_source.loaded_to_vehicle_at is not null or v_source.handed_over_to_rider_at is not null then
    raise exception 'This Wayplan has already entered dispatch or vehicle loading and is locked.';
  end if;

  v_branch:=case v_region when 'MANDALAY' then 'MDY' when 'NAYPYITAW' then 'NPT' else 'YGN' end;
  if coalesce(v_source.branch_code,'YGN')<>v_branch then raise exception 'Revision region does not match the source Wayplan branch.'; end if;

  foreach v_id in array array(select jsonb_array_elements_text(v_ids)) loop
    if v_id=any(v_selected_ids) then raise exception 'A parcel cannot appear twice in the revised Wayplan.'; end if;
    v_selected_ids:=array_append(v_selected_ids,v_id);
  end loop;

  select coalesce(array_agg(s.delivery_way_id order by s.stop_sequence),'{}'::text[]),count(*)::integer
  into v_old_ids,v_old_count
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_source_id
    and upper(coalesce(s.stop_status,'')) not in ('CANCELLED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');
  if v_old_count=0 then raise exception 'Source Wayplan has no revisable stops.'; end if;

  -- Release the source membership/ledger inside this transaction. Any later failure rolls this back.
  update public.be_wayplan_membership_v40
  set membership_status='CANCELLED',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46','RELEASED_FOR_REPLACEMENT','revision_request_id',v_request_id,'revised_at',now())
  where wayplan_id=v_source_id
    and membership_status not in ('CANCELLED','COMPLETED','RTO');

  update public.be_waybill_ledger
  set wayplan_id=null,wayplan_status='READY_FOR_WAYPLAN',dispatch_status='READY_FOR_DISPATCH',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46_released_from',v_source_id,'revision_request_id',v_request_id)
  where delivery_way_id=any(v_old_ids)
    and wayplan_id=v_source_id
    and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');

  -- After source release, every retained or newly-added way must be independently eligible.
  select count(*)::integer into v_eligible
  from public.be_v_dispatch_ready_queue q
  join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
  where q.delivery_way_id=any(v_selected_ids)
    and d.delivery_region=v_region
    and d.delivery_route_mode='DOORSTEP_MAP';
  if v_eligible<>v_n then
    raise exception 'Every revised parcel must be registered, financially valid, warehouse-ready, location-accepted, unassigned, and inside the same active region. Selected %, eligible %.',v_n,v_eligible;
  end if;

  v_ctx:=public.be_multi_van_context();
  select x into v_vehicle from jsonb_array_elements(v_ctx->'vehicles') x
  where x->>'id'=v_plan->>'vehicle_code' and x->>'operation_type'='DELIVERY';
  if v_vehicle is null then raise exception 'Choose an active delivery fleet for the revised Wayplan.'; end if;
  select coalesce(sum(d.weight_kg),0) into v_weight from public.be_data_entry_parcel_details d where d.delivery_way_id=any(v_selected_ids);
  if coalesce((v_vehicle->>'capacity_kg')::numeric,0)>0 and v_weight>(v_vehicle->>'capacity_kg')::numeric then
    raise exception 'Selected parcel weight exceeds vehicle capacity.';
  end if;

  v_new_id:='WP-'||to_char(now(),'YYYYMMDD')||'-REV-'||upper(substr(replace(v_request_id,'-',''),1,12));

  v_result:=public.be_generate_wayplan(jsonb_build_object(
    'wayplan_id',v_new_id,
    'region_code',v_region,
    'branch_code',v_branch,
    'delivery_way_ids',v_ids,
    'vehicle_code',v_plan->>'vehicle_code',
    'vehicle_name',v_vehicle->>'name',
    'driver_code',nullif(v_plan->>'driver_code',''),
    'driver_name',nullif(v_plan->>'driver_name',''),
    'rider_code',nullif(v_plan->>'rider_code',''),
    'rider_name',nullif(v_plan->>'rider_name',''),
    'helper_code',nullif(v_plan->>'helper_code',''),
    'helper_name',nullif(v_plan->>'helper_name',''),
    'actor',v_actor
  ));
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception '%',coalesce(v_result->>'error','Revised Wayplan generation failed.');
  end if;

  -- Preserve the reviewed road order returned by the frontend optimizer.
  update public.be_wayplan_dispatch_stops set stop_sequence=stop_sequence+100000 where wayplan_id=v_new_id;
  update public.be_wayplan_dispatch_stops s
  set stop_sequence=x.ord::int,
      optimized_sequence=x.ord::int,
      delivery_sequence=x.ord::int,
      rider_code=nullif(v_plan->>'rider_code',''),
      rider_name=nullif(v_plan->>'rider_name','')
  from jsonb_array_elements_text(v_ids) with ordinality x(id,ord)
  where s.wayplan_id=v_new_id and s.delivery_way_id=x.id;

  select count(*)::integer into v_new_count from public.be_wayplan_dispatch_stops where wayplan_id=v_new_id;
  if v_new_count<>v_n then raise exception 'Replacement Wayplan did not contain every revised stop.'; end if;

  v_route_payload:=v_route||jsonb_build_object(
    'origin',coalesce(v_ctx->'route_origins'->v_region,'{}'::jsonb),
    'ordered_stops',(
      select jsonb_agg(jsonb_build_object(
        'delivery_way_id',s.delivery_way_id,'sequence',s.stop_sequence,
        'latitude',l.latitude,'longitude',l.longitude,'waybill_no',s.waybill_no,
        'recipient_name',s.recipient_name,'recipient_phone',s.recipient_phone,
        'address',s.address,'township',s.township
      ) order by s.stop_sequence)
      from public.be_wayplan_dispatch_stops s
      left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
      where s.wayplan_id=v_new_id
    )
  );

  -- Version 1 establishes the immutable replacement loading snapshot; version 2 records that it is an operator revision.
  v_route_result:=public.be_save_operational_route_version_v1(v_new_id,'GENERATED',v_route_payload,'V46 replacement generated from reviewed revised membership');
  v_route_recalc:=public.be_save_operational_route_version_v1(v_new_id,'OPERATOR_RECALCULATION',v_route_payload,'V46 CREATED Wayplan membership revision');

  update public.be_wayplan_dispatches
  set vehicle_code=v_plan->>'vehicle_code',vehicle_name=v_vehicle->>'name',
      driver_code=nullif(v_plan->>'driver_code',''),driver_name=nullif(v_plan->>'driver_name',''),
      rider_code=nullif(v_plan->>'rider_code',''),rider_name=nullif(v_plan->>'rider_name',''),
      helper_code=nullif(v_plan->>'helper_code',''),helper_name=nullif(v_plan->>'helper_name',''),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'revision_v46',true,'replaces_wayplan_id',v_source_id,'revision_request_id',v_request_id,
        'revision_actor',v_actor,'revision_at',now(),'revision_reason',v_reason,
        'generated_route_version',v_route_result->'route_version','active_route_version',v_route_recalc->'route_version',
        'planning_mode','CREATED_WAYPLAN_REVISION_V46','wave_no',coalesce(nullif(v_plan->>'wave_no','')::int,1),'trip_no',coalesce(nullif(v_plan->>'trip_no','')::int,1)
      ),updated_at=now()
  where wayplan_id=v_new_id;

  update public.be_wayplan_membership_v40
  set membership_status='PLANNED',vehicle_code=v_plan->>'vehicle_code',vehicle_name=v_vehicle->>'name',
      driver_code=nullif(v_plan->>'driver_code',''),driver_name=nullif(v_plan->>'driver_name',''),
      rider_code=nullif(v_plan->>'rider_code',''),rider_name=nullif(v_plan->>'rider_name',''),
      helper_code=nullif(v_plan->>'helper_code',''),helper_name=nullif(v_plan->>'helper_name',''),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46',true,'replaces_wayplan_id',v_source_id,'revision_request_id',v_request_id)
  where wayplan_id=v_new_id;

  update public.be_wayplan_dispatches
  set wayplan_status='CANCELLED',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46',true,'replaced_by_wayplan_id',v_new_id,'revision_request_id',v_request_id,'revised_at',now()),
      updated_at=now()
  where wayplan_id=v_source_id;

  update public.be_wayplan_dispatch_stops
  set stop_status='CANCELLED',dispatch_status='CANCELLED',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('revision_v46_replaced_by',v_new_id,'revision_request_id',v_request_id)
  where wayplan_id=v_source_id
    and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

  v_result:=jsonb_build_object(
    'ok',true,
    'source_wayplan_id',v_source_id,
    'replacement_wayplan_id',v_new_id,
    'replaces_wayplan_id',v_source_id,
    'old_stop_count',v_old_count,
    'new_stop_count',v_new_count,
    'added_count',(select count(*) from unnest(v_selected_ids) x where not (x=any(v_old_ids))),
    'removed_count',(select count(*) from unnest(v_old_ids) x where not (x=any(v_selected_ids))),
    'status','CREATED',
    'route_source',v_route_source,
    'generated_route_version',v_route_result->'route_version',
    'active_route_version',v_route_recalc->'route_version',
    'dispatch_required_separately',true
  );

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'WAYPLAN_REVISED_V46','WAYPLAN_REVISION',v_request_id,
    jsonb_build_object('request',p_payload,'result',v_result,'actor_id',auth.uid(),'source_wayplan_id',v_source_id,'replacement_wayplan_id',v_new_id));

  return v_result;
end;
$$;

revoke all on function public.be_created_wayplan_revision_snapshot_v46(text) from public;
revoke all on function public.be_replace_created_wayplan_v46(jsonb) from public;
grant execute on function public.be_created_wayplan_revision_snapshot_v46(text) to authenticated;
grant execute on function public.be_replace_created_wayplan_v46(jsonb) to authenticated;
