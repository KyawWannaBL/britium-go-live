create or replace view public.be_v_dispatch_ready_queue as
select
  coalesce(nullif(w.delivery_way_id,''),nullif(d.delivery_way_id,'')) as delivery_way_id,
  coalesce(nullif(w.waybill_no,''),nullif(d.delivery_way_id,'')) as waybill_no,
  coalesce(d.pickup_id,w.pickup_id) as pickup_id,
  coalesce(d.pickup_id,w.pickup_way_id,w.pickup_id) as pickup_way_id,
  coalesce(w.merchant_name,'') as merchant_name,
  coalesce(d.recipient_name,w.recipient_name,w.customer_name,'') as recipient_name,
  coalesce(d.contact_no_1,w.recipient_phone,w.contact_no_1,'') as recipient_phone,
  coalesce(d.township,w.township,'') as township,
  coalesce(d.recipient_address,w.recipient_address,w.delivery_address,'') as address,
  coalesce(d.actual_collect,d.cod_amount,w.cod_amount,w.item_price,0) as cod_amount,
  coalesce(d.delivery_fee,w.delivery_fee,0) as delivery_fee,
  coalesce(d.weight_kg,w.weight_kg,w.parcel_weight_kg,w.total_weight_kg,0) as parcel_weight_kg,
  coalesce(w.dispatch_status,'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(d.warehouse_status,w.warehouse_status,'RECEIVED') as warehouse_status,
  coalesce(d.way_management_status,w.wayplan_status,'READY_FOR_WAYPLAN') as wayplan_status,
  coalesce(w.created_at,d.saved_at,now()) as created_at,
  coalesce(w.updated_at,d.updated_at,now()) as updated_at,
  jsonb_build_object(
    'source','be_v_dispatch_ready_queue_v12_11',
    'registered_data_entry',true,
    'financial_validation_status',d.financial_validation_status,
    'warehouse_status',coalesce(d.warehouse_status,w.warehouse_status),
    'dispatch_status',w.dispatch_status,
    'wayplan_status',coalesce(d.way_management_status,w.wayplan_status)
  ) as metadata
from public.be_data_entry_parcel_details d
join public.be_waybill_ledger w
  on w.delivery_way_id=d.delivery_way_id
where d.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
  and upper(coalesce(d.financial_validation_status,''))='VALID'
  and upper(coalesce(d.warehouse_status,'')) in ('RECEIVED','WAREHOUSE_READY','READY_FOR_WAYPLAN')
  and upper(coalesce(d.way_management_status,'')) in ('READY_FOR_WAYPLAN','NOT_PLANNED','')
  and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
  and upper(coalesce(w.dispatch_status,'READY_FOR_DISPATCH')) in ('READY_FOR_DISPATCH','WAITING_DISPATCH','READY','WAYBILL_CREATED','WAYPLAN_CREATED')
  and upper(coalesce(w.wayplan_status,'READY_FOR_WAYPLAN')) in ('NOT_PLANNED','READY_FOR_WAYPLAN','WAYPLAN_CREATED');

create or replace function public.be_generate_wayplan(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wayplan_id text;
  v_vehicle_code text;
  v_vehicle_name text;
  v_driver_code text;
  v_driver_name text;
  v_rider_code text;
  v_rider_name text;
  v_helper_code text;
  v_helper_name text;
  v_actor text;
  v_selected jsonb;
  v_selected_count integer:=0;
  v_eligible_selected_count integer:=0;
  v_count integer:=0;
  v_cod numeric:=0;
  v_driver_ok boolean:=true;
  v_rider_ok boolean:=true;
  v_helper_ok boolean:=true;
begin
  v_wayplan_id:=coalesce(nullif(p_payload->>'wayplan_id',''),'WP-'||to_char(now(),'YYYYMMDD-HH24MISS'));
  v_vehicle_code:=nullif(p_payload->>'vehicle_code','');
  v_vehicle_name:=nullif(p_payload->>'vehicle_name','');
  v_driver_code:=upper(nullif(p_payload->>'driver_code',''));
  v_driver_name:=nullif(p_payload->>'driver_name','');
  v_rider_code:=upper(nullif(p_payload->>'rider_code',''));
  v_rider_name:=nullif(p_payload->>'rider_name','');
  v_helper_code:=upper(nullif(p_payload->>'helper_code',''));
  v_helper_name:=nullif(p_payload->>'helper_name','');
  v_actor:=coalesce(nullif(p_payload->>'actor',''),'dispatch');
  v_selected:=coalesce(p_payload->'delivery_way_ids',p_payload->'waybill_nos','[]'::jsonb);
  v_selected_count:=jsonb_array_length(v_selected);

  if v_rider_code is null and v_driver_code is null then
    return jsonb_build_object('ok',false,'error','Rider or Driver is required before Wayplan creation.');
  end if;

  if v_rider_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_rider_code
        and upper(coalesce(a.role,''))='RIDER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_rider_ok;
  end if;
  if v_driver_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_driver_code
        and upper(coalesce(a.role,''))='DRIVER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_driver_ok;
  end if;
  if v_helper_code is not null then
    select exists(select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_helper_code
        and upper(coalesce(a.role,''))='HELPER' and coalesce(a.active,true) and coalesce(a.is_active,true) and a.auth_user_id is not null)
    into v_helper_ok;
  end if;

  if not v_rider_ok then return jsonb_build_object('ok',false,'error','Assigned Rider does not have an active Rider App authentication mapping.','worker_code',v_rider_code); end if;
  if not v_driver_ok then return jsonb_build_object('ok',false,'error','Assigned Driver does not have an active Rider App authentication mapping.','worker_code',v_driver_code); end if;
  if not v_helper_ok then return jsonb_build_object('ok',false,'error','Assigned Helper does not have an active Helper App authentication mapping. Helper is optional; remove or correct the helper assignment.','worker_code',v_helper_code); end if;

  if v_selected_count>0 then
    select count(*)::integer into v_eligible_selected_count
    from public.be_v_dispatch_ready_queue q
    where q.delivery_way_id in (select jsonb_array_elements_text(v_selected))
       or q.waybill_no in (select jsonb_array_elements_text(v_selected));
    if v_eligible_selected_count<>v_selected_count then
      return jsonb_build_object('ok',false,'error','Some selected parcels are not registered/financially valid/warehouse-ready for Wayplan.','selected',v_selected_count,'eligible',v_eligible_selected_count);
    end if;
  end if;

  insert into public.be_wayplan_dispatches(
    wayplan_id,dispatch_batch_no,branch_code,vehicle_code,vehicle_name,
    driver_code,driver_name,rider_code,rider_name,helper_code,helper_name,
    wayplan_status,created_by,metadata
  ) values (
    v_wayplan_id,v_wayplan_id,coalesce(nullif(p_payload->>'branch_code',''),'YGN'),v_vehicle_code,v_vehicle_name,
    v_driver_code,v_driver_name,v_rider_code,v_rider_name,v_helper_code,v_helper_name,
    'CREATED',v_actor,p_payload||jsonb_build_object('build','WAYPLAN_GENERATE_V12_11','helper_optional',true)
  ) on conflict(wayplan_id) do update set
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,
    driver_code=excluded.driver_code,driver_name=excluded.driver_name,
    rider_code=excluded.rider_code,rider_name=excluded.rider_name,
    helper_code=excluded.helper_code,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_dispatches.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  delete from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_dispatch_stops(
    wayplan_id,stop_sequence,pickup_id,pickup_way_id,delivery_way_id,waybill_no,
    recipient_name,recipient_phone,township,address,cod_amount,delivery_fee,parcel_weight_kg,stop_status,metadata
  )
  select v_wayplan_id,row_number() over(order by q.township,q.address,q.delivery_way_id),
         q.pickup_id,q.pickup_way_id,q.delivery_way_id,q.waybill_no,q.recipient_name,q.recipient_phone,
         q.township,q.address,q.cod_amount,q.delivery_fee,q.parcel_weight_kg,'READY_FOR_DISPATCH',
         q.metadata||jsonb_build_object('wayplan_build','V12_11')
  from public.be_v_dispatch_ready_queue q
  where v_selected_count=0
     or q.delivery_way_id in (select jsonb_array_elements_text(v_selected))
     or q.waybill_no in (select jsonb_array_elements_text(v_selected));

  select count(*),coalesce(sum(cod_amount),0) into v_count,v_cod
  from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan_id;
  if v_count=0 then
    delete from public.be_wayplan_dispatches where wayplan_id=v_wayplan_id;
    return jsonb_build_object('ok',false,'error','No eligible dispatch-ready stops found.','wayplan_id',v_wayplan_id,'total_stops',0);
  end if;

  update public.be_wayplan_dispatches set total_stops=v_count,total_parcels=v_count,total_cod=v_cod,updated_at=now() where wayplan_id=v_wayplan_id;

  insert into public.be_wayplan_membership_v40(
    wayplan_id,delivery_way_id,pickup_id,route_zone,membership_status,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,created_by,metadata
  )
  select v_wayplan_id,s.delivery_way_id,s.pickup_id,coalesce(nullif(s.township,''),'UNASSIGNED'),'PLANNED',
         v_vehicle_code,v_vehicle_name,v_rider_code,v_rider_name,v_driver_code,v_driver_name,v_helper_code,v_helper_name,v_actor,
         jsonb_build_object('assignment_mode',case when v_driver_code is not null then 'VEHICLE_CREW' else 'RIDER' end,'helper_optional',true,'build','V12_11')
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id
  on conflict(wayplan_id,delivery_way_id) do update set
    pickup_id=excluded.pickup_id,route_zone=excluded.route_zone,membership_status='PLANNED',
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,rider_code=excluded.rider_code,rider_name=excluded.rider_name,
    driver_code=excluded.driver_code,driver_name=excluded.driver_name,helper_code=excluded.helper_code,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_membership_v40.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  update public.be_waybill_ledger w set wayplan_id=v_wayplan_id,wayplan_status='WAYPLAN_CREATED',dispatch_status='WAYPLAN_CREATED',updated_at=now()
  where exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id and s.delivery_way_id=w.delivery_way_id);

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan_id,'total_stops',v_count,'total_cod',v_cod,'status','WAYPLAN_CREATED','helper_optional',true,'auth_mapping_enforced',true,'data_entry_registration_enforced',true);
end;
$$;

create or replace function public.be_wayplan_validate_review_v43(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_count integer:=0;
  v_route_count integer:=0;
  v_route text;
  v_invalid text[]:='{}'::text[];
  v_statuses text[]:='{}'::text[];
  v_missing_assignment integer:=0;
  v_assignment_modes text[]:='{}'::text[];
  v_auth_invalid integer:=0;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  select count(*)::integer,count(distinct route_zone)::integer,min(route_zone),
         array_agg(distinct membership_status order by membership_status),
         array_agg(distinct upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED'))),
         count(*) filter(where
           case upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED'))
             when 'RIDER' then coalesce(rider_code,rider_name,'')=''
             when 'VEHICLE_CREW' then coalesce(vehicle_code,vehicle_name,'')='' or coalesce(driver_code,driver_name,'')=''
             else coalesce(rider_code,rider_name,'')='' or coalesce(vehicle_code,vehicle_name,'')='' end)::integer
  into v_count,v_route_count,v_route,v_statuses,v_assignment_modes,v_missing_assignment
  from public.be_wayplan_membership_v40
  where wayplan_id=v_wayplan and membership_status not in ('CANCELLED','COMPLETED');

  if v_count=0 then raise exception 'Wayplan % has no active parcel membership',v_wayplan; end if;
  if v_route_count<>1 or coalesce(v_route,'UNASSIGNED')='UNASSIGNED' then raise exception 'Wayplan % must contain exactly one assigned route group',v_wayplan; end if;
  if coalesce(cardinality(v_assignment_modes),0)<>1 then raise exception 'Wayplan % contains mixed assignment modes',v_wayplan; end if;
  if v_missing_assignment>0 then
    if v_assignment_modes[1]='RIDER' then raise exception 'Wayplan % Rider Delivery assignment is missing Rider',v_wayplan;
    elsif v_assignment_modes[1]='VEHICLE_CREW' then raise exception 'Wayplan % Vehicle Crew assignment requires Vehicle and Driver; Helper is optional',v_wayplan;
    else raise exception 'Wayplan % is missing Rider or Vehicle assignment',v_wayplan; end if;
  end if;
  if exists(select 1 from public.be_wayplan_membership_v40 where wayplan_id=v_wayplan and membership_status in ('DISPATCHED','RTO','ON_HOLD')) then
    raise exception 'Wayplan % contains dispatched, RTO, or held membership and cannot enter review',v_wayplan;
  end if;

  select coalesce(array_agg(m.delivery_way_id order by m.delivery_way_id),'{}'::text[])
    into v_invalid
  from public.be_wayplan_membership_v40 m
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id=m.delivery_way_id
  where m.wayplan_id=v_wayplan and m.membership_status not in ('CANCELLED','COMPLETED')
    and (v.delivery_way_id is null or v.warehouse_status<>'WAREHOUSE_READY' or coalesce(v.discrepancy_code,'')<>'' or coalesce(v.delivery_attempt_status,'')='RTO'
         or not exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=m.delivery_way_id and upper(coalesce(d.financial_validation_status,''))='VALID'));

  select count(*)::integer into v_auth_invalid
  from (select distinct rider_code,driver_code,helper_code,upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED')) as mode
        from public.be_wayplan_membership_v40 where wayplan_id=v_wayplan and membership_status not in ('CANCELLED','COMPLETED')) x
  where (x.rider_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.rider_code) and upper(coalesce(a.role,''))='RIDER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)))
     or (x.driver_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.driver_code) and upper(coalesce(a.role,''))='DRIVER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)))
     or (x.helper_code is not null and not exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.helper_code) and upper(coalesce(a.role,''))='HELPER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true)));

  return jsonb_build_object('ok',coalesce(cardinality(v_invalid),0)=0 and v_auth_invalid=0,'wayplan_id',v_wayplan,'parcel_count',v_count,'route_group',v_route,'assignment_mode',v_assignment_modes[1],'membership_statuses',to_jsonb(v_statuses),'invalid_way_ids',to_jsonb(v_invalid),'invalid_count',coalesce(cardinality(v_invalid),0),'assignment_complete',v_missing_assignment=0,'auth_mapping_valid',v_auth_invalid=0,'helper_optional',true);
end;
$$;

create or replace function public.be_wayplan_assignment_options_v44()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_base jsonb;
  v_drivers jsonb:='[]'::jsonb;
  v_riders jsonb:='[]'::jsonb;
  v_helpers jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  v_base:=public.be_wayplan_assignment_options_v44_legacy_20260826();

  select coalesce(jsonb_agg(jsonb_build_object('record_key',c.code,'id',c.code,'name',c.name,'phone',coalesce(c.phone,''),'zone',coalesce(c.zone,''),'branch_code',coalesce(c.branch_code,''),'status',coalesce(c.status,'active'),'master_role',c.master_role,'label',c.display_name,'mobile_auth_ready',true) order by c.name),'[]'::jsonb)
  into v_drivers from public.be_v_active_driver_rider_candidates c
  where c.master_role='DRIVER' and exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(c.code) and upper(coalesce(a.role,''))='DRIVER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true));

  select coalesce(jsonb_agg(jsonb_build_object('record_key',c.code,'id',c.code,'name',c.name,'phone',coalesce(c.phone,''),'zone',coalesce(c.zone,''),'branch_code',coalesce(c.branch_code,''),'status',coalesce(c.status,'active'),'master_role',c.master_role,'label',c.display_name,'mobile_auth_ready',true) order by c.name),'[]'::jsonb)
  into v_riders from public.be_v_active_driver_rider_candidates c
  where c.master_role='RIDER' and exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(c.code) and upper(coalesce(a.role,''))='RIDER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true));

  select coalesce(jsonb_agg(jsonb_build_object('record_key',c.code,'id',c.code,'name',c.name,'phone',coalesce(c.phone,''),'zone',coalesce(c.zone,''),'branch_code',coalesce(c.branch_code,''),'status',coalesce(c.status,'active'),'master_role',c.master_role,'acting_as_helper',false,'manageable_as_helper',true,'label',c.display_name,'mobile_auth_ready',true) order by c.name),'[]'::jsonb)
  into v_helpers from public.be_v_active_helper_candidates c
  where c.master_role='HELPER' and exists(select 1 from public.be_mobile_workforce_accounts a where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(c.code) and upper(coalesce(a.role,''))='HELPER' and a.auth_user_id is not null and coalesce(a.active,true) and coalesce(a.is_active,true));

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object('ok',true,'build','WAYPLAN_ASSIGNMENT_AUTH_SAFE_V12_11','drivers',v_drivers,'riders',v_riders,'helpers',v_helpers,'helper_master',v_helpers,'helper_optional',true,'auth_mapping_enforced',true,'counts',coalesce(v_base->'counts','{}'::jsonb)||jsonb_build_object('active_drivers',jsonb_array_length(v_drivers),'active_riders',jsonb_array_length(v_riders),'helper_candidates',jsonb_array_length(v_helpers),'active_helpers',jsonb_array_length(v_helpers)));
end;
$$;;
