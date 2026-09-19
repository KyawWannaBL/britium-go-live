-- V69: make Wayplan creation use the same canonical V67 queue shown in Wayplan Command.
-- Fixes valid optmgr selections being rejected by legacy be_v_dispatch_ready_queue rechecks.

create or replace function public.be_wayplan_eligible_rows_v69(p_region text)
returns table(
  delivery_way_id text,
  waybill_no text,
  pickup_id text,
  pickup_way_id text,
  merchant_name text,
  merchant_code text,
  recipient_name text,
  recipient_phone text,
  township text,
  address text,
  cod_amount numeric,
  delivery_fee numeric,
  parcel_weight_kg numeric,
  dispatch_status text,
  warehouse_status text,
  wayplan_status text,
  created_at timestamptz,
  updated_at timestamptz,
  delivery_region text,
  delivery_route_mode text,
  location_required boolean,
  service_provider_code text,
  latitude numeric,
  longitude numeric,
  metadata jsonb
)
language sql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
  select
    x.delivery_way_id,x.waybill_no,x.pickup_id,x.pickup_way_id,
    x.merchant_name,x.merchant_code,x.recipient_name,x.recipient_phone,
    x.township,x.address,x.cod_amount,x.delivery_fee,x.parcel_weight_kg,
    x.dispatch_status,x.warehouse_status,x.wayplan_status,x.created_at,x.updated_at,
    x.delivery_region,x.delivery_route_mode,x.location_required,x.service_provider_code,
    x.latitude,x.longitude,x.metadata
  from jsonb_to_recordset(
    coalesce(public.be_dispatch_ready_queue_v19(10000,p_region)->'queue','[]'::jsonb)
  ) as x(
    delivery_way_id text,
    waybill_no text,
    pickup_id text,
    pickup_way_id text,
    merchant_name text,
    merchant_code text,
    recipient_name text,
    recipient_phone text,
    township text,
    address text,
    cod_amount numeric,
    delivery_fee numeric,
    parcel_weight_kg numeric,
    dispatch_status text,
    warehouse_status text,
    wayplan_status text,
    created_at timestamptz,
    updated_at timestamptz,
    delivery_region text,
    delivery_route_mode text,
    location_required boolean,
    service_provider_code text,
    latitude numeric,
    longitude numeric,
    metadata jsonb
  );
$function$;

grant execute on function public.be_wayplan_eligible_rows_v69(text) to authenticated;

create or replace function public.be_generate_wayplan(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_region text := upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
  v_branch text;
  v_active boolean := false;
  v_selected jsonb := coalesce(p_payload->'delivery_way_ids',p_payload->'waybill_nos','[]'::jsonb);
  v_selected_count integer := 0;
  v_eligible integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then
    return jsonb_build_object('ok',false,'error','Choose Yangon, Mandalay, or Naypyitaw before generating a Wayplan.');
  end if;

  select r.branch_code,r.is_active into v_branch,v_active
  from public.be_wayplan_region_runtime_v19 r where r.region_code=v_region;
  if not coalesce(v_active,false) then
    return jsonb_build_object('ok',false,'error',format('%s Wayplan is disabled.',initcap(lower(v_region))),'region_code',v_region);
  end if;
  if jsonb_typeof(v_selected)<>'array' then
    return jsonb_build_object('ok',false,'error','delivery_way_ids must be an array.');
  end if;
  v_selected_count := jsonb_array_length(v_selected);
  if v_selected_count=0 then
    return jsonb_build_object('ok',false,'error','Select at least one stop from the active regional queue.');
  end if;

  select count(*)::integer into v_eligible
  from jsonb_array_elements_text(v_selected) s(id)
  where exists(
    select 1 from public.be_wayplan_eligible_rows_v69(v_region) q
    where q.delivery_way_id=s.id or q.waybill_no=s.id
  );

  if v_eligible<>v_selected_count then
    return jsonb_build_object(
      'ok',false,
      'error','Every selected parcel must still be present in the canonical Wayplan queue for the active region.',
      'region_code',v_region,'selected',v_selected_count,'eligible',v_eligible,
      'build','WAYPLAN_REGION_GENERATE_V69_CANONICAL_QUEUE'
    );
  end if;

  v_payload := v_payload || jsonb_build_object('region_code',v_region,'branch_code',v_branch);
  v_result := public.be_generate_wayplan_v18_legacy(v_payload);

  if coalesce((v_result->>'ok')::boolean,false) then
    update public.be_wayplan_dispatches
    set branch_code=v_branch,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'region_code',v_region,'regional_gate','V69','map_required',true,
          'queue_source','be_dispatch_ready_queue_v19/V67_FAST'
        ),updated_at=now()
    where wayplan_id=v_result->>'wayplan_id';

    update public.be_wayplan_dispatch_stops
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'region_code',v_region,'regional_gate','V69',
      'queue_source','be_dispatch_ready_queue_v19/V67_FAST'
    ),updated_at=now()
    where wayplan_id=v_result->>'wayplan_id';
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'region_code',v_region,'branch_code',v_branch,
    'build','WAYPLAN_REGION_GENERATE_V69_CANONICAL_QUEUE'
  );
end;
$function$;

create or replace function public.be_generate_wayplan_v18_legacy(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
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
  v_region text:=upper(coalesce(nullif(btrim(p_payload->>'region_code'),''),'YANGON'));
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
    from jsonb_array_elements_text(v_selected) s(id)
    where exists(
      select 1 from public.be_wayplan_eligible_rows_v69(v_region) q
      where q.delivery_way_id=s.id or q.waybill_no=s.id
    );
    if v_eligible_selected_count<>v_selected_count then
      return jsonb_build_object(
        'ok',false,
        'error','Some selected parcels are no longer in the canonical ready-for-Wayplan queue.',
        'selected',v_selected_count,'eligible',v_eligible_selected_count,
        'region_code',v_region,'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE'
      );
    end if;
  end if;

  insert into public.be_wayplan_dispatches(
    wayplan_id,dispatch_batch_no,branch_code,vehicle_code,vehicle_name,
    driver_code,driver_name,rider_code,rider_name,helper_code,helper_name,
    wayplan_status,created_by,metadata
  ) values (
    v_wayplan_id,v_wayplan_id,coalesce(nullif(p_payload->>'branch_code',''),'YGN'),v_vehicle_code,v_vehicle_name,
    v_driver_code,v_driver_name,v_rider_code,v_rider_name,v_helper_code,v_helper_name,
    'CREATED',v_actor,p_payload||jsonb_build_object(
      'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE','helper_optional',true,
      'queue_source','be_dispatch_ready_queue_v19/V67_FAST'
    )
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
  select v_wayplan_id,row_number() over(order by chosen.ord),
         chosen.pickup_id,chosen.pickup_way_id,chosen.delivery_way_id,chosen.waybill_no,
         chosen.recipient_name,chosen.recipient_phone,chosen.township,chosen.address,
         chosen.cod_amount,chosen.delivery_fee,chosen.parcel_weight_kg,'READY_FOR_DISPATCH',
         coalesce(chosen.metadata,'{}'::jsonb)||jsonb_build_object('wayplan_build','V69','queue_source','be_dispatch_ready_queue_v19/V67_FAST')
  from (
    select s.ord,q.*
    from jsonb_array_elements_text(v_selected) with ordinality s(id,ord)
    join lateral (
      select e.*
      from public.be_wayplan_eligible_rows_v69(v_region) e
      where e.delivery_way_id=s.id or e.waybill_no=s.id
      order by case when e.delivery_way_id=s.id then 0 else 1 end,e.updated_at desc nulls last,e.delivery_way_id
      limit 1
    ) q on true
  ) chosen;

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
         jsonb_build_object('assignment_mode',case when v_driver_code is not null then 'VEHICLE_CREW' else 'RIDER' end,'helper_optional',true,'build','V69')
  from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id
  on conflict(wayplan_id,delivery_way_id) do update set
    pickup_id=excluded.pickup_id,route_zone=excluded.route_zone,membership_status='PLANNED',
    vehicle_code=excluded.vehicle_code,vehicle_name=excluded.vehicle_name,rider_code=excluded.rider_code,rider_name=excluded.rider_name,
    driver_code=excluded.driver_code,driver_name=excluded.driver_name,helper_code=excluded.helper_code,helper_name=excluded.helper_name,
    metadata=coalesce(public.be_wayplan_membership_v40.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

  update public.be_waybill_ledger w set wayplan_id=v_wayplan_id,wayplan_status='WAYPLAN_CREATED',dispatch_status='WAYPLAN_CREATED',updated_at=now()
  where exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=v_wayplan_id and s.delivery_way_id=w.delivery_way_id);

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan_id,'total_stops',v_count,'total_cod',v_cod,
    'status','WAYPLAN_CREATED','helper_optional',true,'auth_mapping_enforced',true,
    'data_entry_registration_enforced',true,'build','WAYPLAN_GENERATE_V69_CANONICAL_QUEUE'
  );
end;
$function$;
