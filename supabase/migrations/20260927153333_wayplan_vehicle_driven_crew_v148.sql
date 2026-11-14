-- V148: vehicle-driven Wayplan crew assignment.
-- Vehicle must be selected first.
-- MOTORBIKE/BICYCLE => Rider required, Driver/Helper forbidden.
-- Other delivery vehicles => Driver required, Helper optional, Rider forbidden.

create or replace function public.be_multi_van_context()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare v_options jsonb; v_vehicles jsonb; v_busy jsonb; v_role text; v_route_origins jsonb;
begin
 v_role:=lower(public.be_current_user_role());
 if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','operations','operations_admin','operations-admin','management','director') then
   raise exception using errcode='42501',message='Wayplan operator permission is required.';
 end if;
 v_options:=public.be_wayplan_assignment_options_v44();
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg',
   'operation_type',payload->>'operation_type','branch_code',payload->>'branch_code',
   'zone_code',payload->>'zone_code','zone_name',payload->>'zone_name','vehicle_mode','DRIVER_CREW'
 ) order by record_key),'[]'::jsonb)
 into v_vehicles from public.be_master_data_rows
 where dataset_key='fleet_master' and deleted_at is null and upper(coalesce(status,'ACTIVE'))='ACTIVE'
   and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
   and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');

 v_vehicles:=coalesce(v_vehicles,'[]'::jsonb)||jsonb_build_array(
   jsonb_build_object('id','MOTORBIKE','name','Motor Bike','capacity_kg',0,'operation_type','DELIVERY','branch_code','','vehicle_mode','RIDER_ONLY','virtual',true),
   jsonb_build_object('id','BICYCLE','name','Bicycle','capacity_kg',0,'operation_type','DELIVERY','branch_code','','vehicle_mode','RIDER_ONLY','virtual',true)
 );

 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb)
 into v_busy from public.be_wayplan_dispatches where upper(coalesce(wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb)
 into v_route_origins from public.be_branch_offices
 where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins,'crew_busy_scope','DISPATCHED_OR_ON_HOLD_ONLY','vehicle_selection_first',true,'build','WAYPLAN_VEHICLE_DRIVEN_CREW_V148');
end
$function$;

do $patch$
declare
  v_def text;
  v_start integer;
  v_end integer;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_generate_multi_van_v43'
  limit 1;
  if v_def is null then raise exception 'be_generate_multi_van_v43 not found'; end if;

  if position('vehicle_mode text;' in v_def)=0 then
    v_old:='  driver_name text; rider_name text; helper_name text; wave_no int; trip_no int; wave_count int:=1; key text;';
    v_new:='  driver_name text; rider_name text; helper_name text; wave_no int; trip_no int; wave_count int:=1; key text; vehicle_mode text;';
    if position(v_old in v_def)=0 then raise exception 'V148 declaration anchor changed'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  v_old:='    select x into v from jsonb_array_elements(ctx->''vehicles'') x where x->>''id''=p->>''vehicle_code'' and x->>''operation_type''=''DELIVERY'';
    if v is null then raise exception ''Choose a delivery fleet; pickup/highway fleets are reserved.''; end if;
        if coalesce(v->>''branch_code'','''') not in ('''',branch) then raise exception ''Selected delivery fleet belongs to another branch.''; end if;';
  v_new:='    select x into v from jsonb_array_elements(ctx->''vehicles'') x where x->>''id''=p->>''vehicle_code'' and x->>''operation_type''=''DELIVERY'';
    if v is null then raise exception ''Choose a delivery vehicle first.''; end if;
    vehicle_mode:=upper(coalesce(nullif(v->>''vehicle_mode'',''''),case when upper(coalesce(p->>''vehicle_code'','''')) in (''MOTORBIKE'',''BICYCLE'') then ''RIDER_ONLY'' else ''DRIVER_CREW'' end));
    if coalesce(v->>''branch_code'','''') not in ('''',branch) then raise exception ''Selected delivery fleet belongs to another branch.''; end if;';
  if position(v_old in v_def)=0 then raise exception 'V148 vehicle anchor changed'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_start:=position('    if crew_mode=''EMERGENCY_MANUAL'' then' in v_def);
  v_end:=position('    else raise exception ''Invalid crew mode.''; end if;' in v_def);
  if v_start=0 or v_end=0 or v_end<v_start then raise exception 'V148 crew validation block not found'; end if;
  v_end:=v_end+length('    else raise exception ''Invalid crew mode.''; end if;');
  v_new:='    if crew_mode=''EMERGENCY_MANUAL'' then
      driver_name:=nullif(btrim(p->>''driver_name''),''''); rider_name:=nullif(btrim(p->>''rider_name''),''''); helper_name:=nullif(btrim(p->>''helper_name''),''''); emergency_reason:=nullif(btrim(p->>''emergency_substitution_reason''),'''');
      if emergency_reason is null or length(emergency_reason)<5 then raise exception ''A reason is required for emergency crew substitution.''; end if;
      if vehicle_mode=''RIDER_ONLY'' then
        if rider_name is null then raise exception ''Choose an Emergency Rider for the Motor Bike/Bicycle.''; end if;
        if driver_name is not null or helper_name is not null then raise exception ''Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.''; end if;
        key:=wave_no::text||'':manual:''||lower(rider_name); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key);
      else
        if driver_name is null then raise exception ''Choose an Emergency Driver for the selected vehicle.''; end if;
        if rider_name is not null then raise exception ''Van/car/truck routes do not use a Rider. Clear Rider and choose Driver/Helper only.''; end if;
        if helper_name is not null and lower(helper_name)=lower(driver_name) then raise exception ''Driver and Helper must be different people.''; end if;
        key:=wave_no::text||'':manual:''||lower(driver_name); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key);
        if helper_name is not null then key:=wave_no::text||'':manual:''||lower(helper_name); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key); end if;
      end if;
    elsif crew_mode=''ROSTER'' then
      driver:=null; rider:=null; helper:=null;
      if vehicle_mode=''RIDER_ONLY'' then
        if coalesce(p->>''driver_code'','''')<>'''' or coalesce(p->>''helper_code'','''')<>'''' then raise exception ''Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.''; end if;
        if coalesce(p->>''rider_code'','''')='''' then raise exception ''Choose a Rider for the Motor Bike/Bicycle.''; end if;
        select x into rider from jsonb_array_elements(ctx->''riders'') x where x->>''id''=p->>''rider_code'';
        if rider is null then raise exception ''Choose an active Rider.''; end if;
        if coalesce(rider->>''branch_code'','''') not in ('''',branch) then raise exception ''Selected Rider belongs to another branch.''; end if;
        key:=wave_no::text||'':''||(p->>''rider_code''); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key);
        if exists(select 1 from jsonb_array_elements(ctx->''busy'') b where b->>''vehicle_code''=p->>''vehicle_code'' or b->>''rider_code''=p->>''rider_code'') then raise exception ''The selected Motor Bike/Bicycle or Rider is active on another dispatched/on-hold Wayplan. Refresh availability.''; end if;
      else
        if coalesce(p->>''rider_code'','''')<>'''' then raise exception ''Van/car/truck routes do not use a Rider. Clear Rider and choose Driver/Helper only.''; end if;
        select x into driver from jsonb_array_elements(ctx->''drivers'') x where x->>''id''=p->>''driver_code'';
        if driver is null then raise exception ''Choose an active Driver.''; end if;
        if coalesce(p->>''helper_code'','''')<>'''' then select x into helper from jsonb_array_elements(ctx->''helpers'') x where x->>''id''=p->>''helper_code''; if helper is null then raise exception ''Choose an active Helper or leave Helper empty.''; end if; end if;
        if coalesce(driver->>''branch_code'','''') not in ('''',branch) or (helper is not null and coalesce(helper->>''branch_code'','''') not in ('''',branch)) then raise exception ''Selected crew belongs to another branch.''; end if;
        if helper is not null and p->>''helper_code''=p->>''driver_code'' then raise exception ''Driver and Helper must be different people.''; end if;
        key:=wave_no::text||'':''||(p->>''driver_code''); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key);
        if helper is not null then key:=wave_no::text||'':''||(p->>''helper_code''); if key=any(crew_keys) then raise exception ''A crew member cannot serve two routes in the same wave.''; end if; crew_keys:=array_append(crew_keys,key); end if;
        if exists(select 1 from jsonb_array_elements(ctx->''busy'') b where b->>''vehicle_code''=p->>''vehicle_code'' or b->>''driver_code''=p->>''driver_code'' or (helper is not null and b->>''helper_code''=p->>''helper_code'')) then raise exception ''A selected fleet or crew member is physically active on another dispatched/on-hold Wayplan. Refresh availability.''; end if;
      end if;
    else raise exception ''Invalid crew mode.''; end if;';
  v_def:=substr(v_def,1,v_start-1)||v_new||substr(v_def,v_end+1);

  -- Re-derive the vehicle mode in the creation loop and pass it to the emergency generator.
  v_old:='    select x into v from jsonb_array_elements(ctx->''vehicles'') x where x->>''id''=p->>''vehicle_code'';
    if crew_mode=''ROSTER'' then';
  v_new:='    select x into v from jsonb_array_elements(ctx->''vehicles'') x where x->>''id''=p->>''vehicle_code'';
    vehicle_mode:=upper(coalesce(nullif(v->>''vehicle_mode'',''''),case when upper(coalesce(p->>''vehicle_code'','''')) in (''MOTORBIKE'',''BICYCLE'') then ''RIDER_ONLY'' else ''DRIVER_CREW'' end));
    if crew_mode=''ROSTER'' then';
  if position(v_old in v_def)=0 then raise exception 'V148 creation-loop vehicle anchor changed'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_def:=replace(v_def,
    'result:=public.be_generate_wayplan_emergency_crew_v1(p||jsonb_build_object(''wayplan_id'',plan_id,''region_code'',region,''branch_code'',branch,''vehicle_name'',v->>''name'',''actor'',actor));',
    'result:=public.be_generate_wayplan_emergency_crew_v1(p||jsonb_build_object(''wayplan_id'',plan_id,''region_code'',region,''branch_code'',branch,''vehicle_name'',v->>''name'',''vehicle_mode'',vehicle_mode,''actor'',actor));'
  );

  execute v_def;
end
$patch$;

do $emergency$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_generate_wayplan_emergency_crew_v1'
  limit 1;
  if v_def is null then raise exception 'be_generate_wayplan_emergency_crew_v1 not found'; end if;

  if position('v_vehicle_mode text' in v_def)=0 then
    v_old:='  v_vehicle_name text:=nullif(p_payload->>''vehicle_name'','''');';
    v_new:='  v_vehicle_name text:=nullif(p_payload->>''vehicle_name'','''');
  v_vehicle_mode text:=upper(coalesce(nullif(p_payload->>''vehicle_mode'',''''),case when upper(coalesce(p_payload->>''vehicle_code'','''')) in (''MOTORBIKE'',''BICYCLE'') then ''RIDER_ONLY'' else ''DRIVER_CREW'' end));';
    if position(v_old in v_def)=0 then raise exception 'V148 emergency declaration anchor changed'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  v_old:='  if v_driver_name is null or v_rider_name is null then raise exception ''Emergency Driver and Rider names are required.''; end if;';
  v_new:='  if v_vehicle_mode=''RIDER_ONLY'' then
    if v_rider_name is null then raise exception ''Emergency Rider is required for Motor Bike/Bicycle.''; end if;
    if v_driver_name is not null or v_helper_name is not null then raise exception ''Motor Bike/Bicycle uses Rider only; Driver and Helper must be empty.''; end if;
  else
    if v_driver_name is null then raise exception ''Emergency Driver is required for the selected vehicle.''; end if;
    if v_rider_name is not null then raise exception ''Van/car/truck routes do not use a Rider.''; end if;
  end if;';
  if position(v_old in v_def)>0 then v_def:=replace(v_def,v_old,v_new); end if;

  v_def:=replace(v_def,
    '''build'',''WAYPLAN_EMERGENCY_CREW_V1'',''crew_mode'',''EMERGENCY_MANUAL'',',
    '''build'',''WAYPLAN_EMERGENCY_CREW_V148'',''crew_mode'',''EMERGENCY_MANUAL'',''vehicle_mode'',v_vehicle_mode,'
  );
  execute v_def;
end
$emergency$;

comment on function public.be_multi_van_context() is 'V148: includes Motor Bike and Bicycle as Rider-only Wayplan vehicle choices and exposes vehicle-driven crew mode.';
comment on function public.be_generate_multi_van_v43(jsonb) is 'V148: vehicle-first crew contract. Motor Bike/Bicycle require Rider only; other delivery vehicles require Driver with optional Helper and forbid Rider.';
