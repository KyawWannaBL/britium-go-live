-- V75: remove Supervisor Wayplan approval statement-timeout hotspot.
-- Preserve V43 validation semantics while replacing the expensive warehouse receipt view
-- with direct indexed joins scoped to the selected Wayplan only.

create or replace function public.be_wayplan_validate_review_v43(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
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
  v_route_status jsonb;
  v_route_group text;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  select count(*)::integer,
         count(distinct route_zone)::integer,
         min(route_zone),
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
  if coalesce(cardinality(v_assignment_modes),0)<>1 then raise exception 'Wayplan % contains mixed assignment modes',v_wayplan; end if;
  if v_missing_assignment>0 then
    if v_assignment_modes[1]='RIDER' then raise exception 'Wayplan % Rider Delivery assignment is missing Rider',v_wayplan;
    elsif v_assignment_modes[1]='VEHICLE_CREW' then raise exception 'Wayplan % Vehicle Crew assignment requires Vehicle and Driver; Helper is optional',v_wayplan;
    else raise exception 'Wayplan % is missing Rider or Vehicle assignment',v_wayplan; end if;
  end if;

  if exists(
    select 1
    from public.be_wayplan_membership_v40
    where wayplan_id=v_wayplan
      and membership_status in ('DISPATCHED','RTO','ON_HOLD')
  ) then
    raise exception 'Wayplan % contains dispatched, RTO, or held membership and cannot enter review',v_wayplan;
  end if;

  v_route_status := public.be_wayplan_route_status_v45(v_wayplan);
  if not coalesce((v_route_status->>'ok')::boolean,false) then
    raise exception 'Wayplan % requires one complete reviewed road route before Supervisor review',v_wayplan;
  end if;

  v_route_group := case
    when v_route_count = 1 and coalesce(v_route,'') <> '' then v_route
    else 'ROAD_ROUTE:' || v_wayplan
  end;

  -- V75 performance fix:
  -- be_v_warehouse_receipt_v39 expands the complete parcel population, including
  -- canonical ranking and lateral legacy lookups. Supervisor review only needs
  -- the parcels in this Wayplan, so resolve those 1:N rows directly by indexed keys.
  select coalesce(array_agg(m.delivery_way_id order by m.delivery_way_id),'{}'::text[])
  into v_invalid
  from public.be_wayplan_membership_v40 m
  join public.be_data_entry_parcel_details d
    on d.delivery_way_id=m.delivery_way_id
  left join public.be_warehouse_receipts_v36 r
    on r.pickup_id=d.pickup_id
   and r.parcel_sequence=d.parcel_sequence
  left join public.be_delivery_attempt_state_v39 a
    on a.delivery_way_id=m.delivery_way_id
  where m.wayplan_id=v_wayplan
    and m.membership_status not in ('CANCELLED','COMPLETED')
    and (
      r.pickup_id is null
      or coalesce(r.warehouse_status,'PENDING')<>'WAREHOUSE_READY'
      or coalesce(r.discrepancy_code,'')<>''
      or upper(coalesce(a.last_status,''))='RTO'
      or upper(coalesce(d.financial_validation_status,'')) not in ('VALID','OK')
    );

  select count(*)::integer
  into v_auth_invalid
  from (
    select distinct rider_code,driver_code,helper_code,
      upper(coalesce(metadata->>'assignment_mode',metadata#>>'{assignment_v44,assignment_mode}','LEGACY_COMBINED')) as mode
    from public.be_wayplan_membership_v40
    where wayplan_id=v_wayplan and membership_status not in ('CANCELLED','COMPLETED')
  ) x
  where (x.rider_code is not null and not exists(
           select 1 from public.be_mobile_workforce_accounts a
           where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.rider_code)
             and upper(coalesce(a.role,''))='RIDER'
             and a.auth_user_id is not null
             and coalesce(a.active,true) and coalesce(a.is_active,true)
        ))
     or (x.driver_code is not null and not exists(
           select 1 from public.be_mobile_workforce_accounts a
           where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.driver_code)
             and upper(coalesce(a.role,''))='DRIVER'
             and a.auth_user_id is not null
             and coalesce(a.active,true) and coalesce(a.is_active,true)
        ))
     or (x.helper_code is not null and not exists(
           select 1 from public.be_mobile_workforce_accounts a
           where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=upper(x.helper_code)
             and upper(coalesce(a.role,''))='HELPER'
             and a.auth_user_id is not null
             and coalesce(a.active,true) and coalesce(a.is_active,true)
        ));

  return jsonb_build_object(
    'ok',coalesce(cardinality(v_invalid),0)=0 and v_auth_invalid=0,
    'wayplan_id',v_wayplan,
    'parcel_count',v_count,
    'route_group',v_route_group,
    'route_zone_count',v_route_count,
    'route_status',v_route_status,
    'assignment_mode',v_assignment_modes[1],
    'membership_statuses',to_jsonb(v_statuses),
    'invalid_way_ids',to_jsonb(v_invalid),
    'invalid_count',coalesce(cardinality(v_invalid),0),
    'assignment_complete',v_missing_assignment=0,
    'auth_mapping_valid',v_auth_invalid=0,
    'helper_optional',true,
    'build','WAYPLAN_REVIEW_VALIDATION_FAST_V75'
  );
end;
$function$;

grant execute on function public.be_wayplan_validate_review_v43(text) to authenticated;
