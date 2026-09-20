-- V87: CREATED Wayplans are planning records, not physical crew allocations.
-- Crew exclusivity must guard only physically active DISPATCHED / ON_HOLD Wayplans.
create or replace function public.be_wayplan_operational_crew_guard_v1()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_driver text:=upper(nullif(btrim(coalesce(new.driver_code,'')),''));
  v_rider text:=upper(nullif(btrim(coalesce(new.rider_code,'')),''));
  v_helper text:=upper(nullif(btrim(coalesce(new.helper_code,'')),''));
  v_active boolean:=upper(coalesce(new.wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD');
begin
  if v_driver is not null and v_rider is not null and v_driver=v_rider then
    raise exception using errcode='23514',message='Driver and Rider must be different workforce members.';
  end if;
  if v_driver is not null and v_helper is not null and v_driver=v_helper then
    raise exception using errcode='23514',message='Driver and Helper must be different workforce members.';
  end if;
  if v_rider is not null and v_helper is not null and v_rider=v_helper then
    raise exception using errcode='23514',message='Rider and Helper must be different workforce members.';
  end if;

  if v_active then
    if v_driver is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD')
        and v_driver in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Driver is already allocated to another physically active Wayplan.'; end if;

    if v_rider is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD')
        and v_rider in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Rider is already allocated to another physically active Wayplan.'; end if;

    if v_helper is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD')
        and v_helper in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Helper is already allocated to another physically active Wayplan.'; end if;
  end if;
  return new;
end
$function$;

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
 select coalesce(jsonb_agg(jsonb_build_object('id',record_key,'name',payload->>'vehicle_no','capacity_kg',payload->'capacity_kg','operation_type',payload->>'operation_type','branch_code',payload->>'branch_code','zone_code',payload->>'zone_code','zone_name',payload->>'zone_name') order by record_key),'[]'::jsonb)
 into v_vehicles from public.be_master_data_rows
 where dataset_key='fleet_master' and deleted_at is null and upper(coalesce(status,'ACTIVE'))='ACTIVE'
   and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
   and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');
 select coalesce(jsonb_agg(jsonb_build_object('vehicle_code',vehicle_code,'driver_code',driver_code,'rider_code',rider_code,'helper_code',helper_code)),'[]'::jsonb)
 into v_busy from public.be_wayplan_dispatches where upper(coalesce(wayplan_status,'CREATED')) in ('DISPATCHED','ON_HOLD');
 select coalesce(jsonb_object_agg(case branch_code when 'YGN' then 'YANGON' when 'MDY' then 'MANDALAY' when 'NPT' then 'NAYPYITAW' end,jsonb_build_object('branch_code',branch_code,'label',branch_name,'latitude',lat,'longitude',lng)),'{}'::jsonb)
 into v_route_origins from public.be_branch_offices
 where branch_code in ('YGN','MDY','NPT') and coalesce(active,true)=true and lat is not null and lng is not null;
 return jsonb_build_object('vehicles',v_vehicles,'drivers',v_options->'drivers','riders',v_options->'riders','helpers',v_options->'helpers','busy',v_busy,'route_origins',v_route_origins,'crew_busy_scope','DISPATCHED_OR_ON_HOLD_ONLY','build','WAYPLAN_OPTIONAL_HELPER_CANCEL_V87');
end
$function$;

grant execute on function public.be_multi_van_context() to authenticated;
