-- CONTROLLED UAT CANDIDATE - NOT AUTHORIZED FOR PRODUCTION UNTIL UAT.
-- Depends on provider_handover_sites_v1.sql and reviewed approval.
-- Creates DRAFT transfer Wayplans only. Does not dispatch, hand over,
-- confirm customer delivery, create financial postings, or mark RTO.
create or replace function public.be_provider_transfer_wayplan_draft_v1(
  p_request_id uuid,
  p_provider_code text,
  p_origin_branch_code text,
  p_handover_location_code text,
  p_delivery_way_ids text[],
  p_vehicle_code text,
  p_driver_code text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $body$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_provider text := upper(btrim(coalesce(p_provider_code,'')));
  v_branch text := upper(btrim(coalesce(p_origin_branch_code,'')));
  v_location text := upper(btrim(coalesce(p_handover_location_code,'')));
  v_vehicle text := upper(btrim(coalesce(p_vehicle_code,'')));
  v_driver text := upper(btrim(coalesce(p_driver_code,'')));
  v_site record;
  v_origin record;
  v_plan_id text;
  v_way text;
  v_rows integer;
  v_requested integer;
  v_ordered jsonb := '[]'::jsonb;
  v_saved jsonb;
  v_snapshot jsonb;
  v_active text;
  v_finance text;
  v_status text;
  v_route_mode text;
  v_pickup text;
  v_dest_region text;
  v_provider_actual text;
begin
  if not exists(select 1 from public.be_provider_transfer_release_control_v1 where control_key='PROVIDER_TRANSFER_V1' and draft_enabled) then raise exception 'Provider transfer draft creation not yet enabled'; end if;
  if v_actor is null or v_role not in
    ('superadmin','super_admin','operation_manager','operations_manager')
    then raise exception 'Management authorization required';
  end if;
  if p_request_id is null then raise exception 'Stable request ID required'; end if;
  if not exists (
    select 1 from public.be_wayplan_roster_allowlist_v68 roster
    where roster.workforce_code=v_driver and roster.role_code='DRIVER'
      and upper(roster.branch_code)=v_branch and roster.active=true
  ) then raise exception 'Active authenticated branch Driver is required'; end if;
  if not exists (
    select 1 from public.be_mobile_workforce_accounts mobile
    where v_driver=any(array[
        upper(coalesce(mobile.worker_code,'')),
        upper(coalesce(mobile.workforce_code,'')),
        upper(coalesce(mobile.account_code,'')),
        upper(coalesce(mobile.driver_code,''))
      ])
      and upper(coalesce(mobile.role,''))='DRIVER'
      and mobile.auth_user_id is not null
      and coalesce(mobile.active,true) and coalesce(mobile.is_active,true)
  ) then raise exception 'Driver must have an active mobile authentication mapping'; end if;
  if not exists (
    select 1 from public.be_master_data_rows fleet
    where fleet.dataset_key='fleet_master' and upper(fleet.record_key)=v_vehicle
      and fleet.deleted_at is null
      and upper(coalesce(fleet.status,'ACTIVE'))='ACTIVE'
      and upper(coalesce(fleet.payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
      and upper(coalesce(fleet.payload->>'branch_code',''))=v_branch
      and fleet.payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY')
  ) then raise exception 'Choose an active delivery or highway-transfer vehicle in the origin branch'; end if;
  if exists(
    select 1 from public.be_wayplan_dispatches w
    where upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','ON_HOLD')
      and (upper(coalesce(w.vehicle_code,''))=v_vehicle or upper(coalesce(w.driver_code,''))=v_driver)
  ) then raise exception 'Vehicle or Driver is busy on another active Wayplan'; end if;
  if v_branch not in ('YGN','MDY','NPT') then raise exception 'Invalid origin branch'; end if;
  perform public.be_branch_scope_v1(v_branch);
  select branch_code,branch_name,lat,lng into v_origin
  from public.be_branch_offices
  where branch_code=v_branch and coalesce(active,true)
    and lat between 9 and 29 and lng between 92 and 102;
  if not found then raise exception 'Active origin branch coordinates must be verified'; end if;
  if v_provider='' or v_location='' or v_vehicle='' or v_driver=''
    then raise exception 'Provider, verified site, vehicle and driver are mandatory'; end if;
  v_requested := coalesce(array_length(p_delivery_way_ids,1),0);
  if v_requested not between 1 and 75
    then raise exception 'Select 1 to 75 unique Delivery Way IDs'; end if;
  if (select count(distinct upper(btrim(x))) from unnest(p_delivery_way_ids) x)
     <>v_requested
    then raise exception 'Duplicate or empty Delivery Way IDs'; end if;

  select loc.location_code,loc.location_name,loc.address,loc.latitude,loc.longitude
    into v_site
  from public.be_provider_handover_sites_v1 approval
  join public.be_wayplan_service_locations loc on loc.location_code=approval.location_code
  where approval.provider_code=v_provider
    and approval.origin_branch_code=v_branch
    and upper(approval.location_code)=v_location
    and approval.active=true and approval.verified_at is not null
    and approval.verified_by is not null and loc.active=true
    and loc.latitude between 9 and 29 and loc.longitude between 92 and 102;
  if not found then raise exception 'Verified active physical handover site is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('provider-transfer-wayplans:'||v_branch,0));
  v_plan_id := 'PT-'||v_branch||'-'||p_request_id::text;
  select wayplan_id into v_active from public.be_wayplan_dispatches
   where wayplan_id=v_plan_id;
  if v_active is not null then
    raise exception 'Request ID already used; review existing Wayplan %',v_plan_id;
  end if;

  -- Lock only the exact requested operational parcel rows.
  perform 1 from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=any(
    select upper(btrim(x)) from unnest(p_delivery_way_ids) x
  ) order by d.delivery_way_id for update;

  for v_way in
    select upper(btrim(x)) from unnest(p_delivery_way_ids) x order by upper(btrim(x))
  loop
    select d.pickup_id,upper(coalesce(d.financial_validation_status,'')),
      upper(coalesce(d.parcel_status,'')),d.delivery_region,
      upper(coalesce(d.financial_quote->>'service_provider_code',''))
    into v_pickup,v_finance,v_status,v_dest_region,v_provider_actual
    from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=v_way;
    if v_pickup is null then raise exception 'Way % not found',v_way; end if;
    if v_finance not in ('VALID','OK')
      then raise exception 'Way % has pending financial validation',v_way; end if;
    if v_status in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
      then raise exception 'Way % is terminal',v_way; end if;
    if v_provider_actual is distinct from v_provider
      then raise exception 'Way % belongs to another service provider',v_way; end if;
    if not exists (
      select 1 from public.be_warehouse_receipts_v36 r
      where upper(r.delivery_way_id)=v_way
       and upper(r.warehouse_status)='WAREHOUSE_READY'
       and upper(split_part(r.warehouse_code,'-',1))=v_branch
       and coalesce(r.discrepancy_code,'')=''
    ) then raise exception 'Way % requires cleared WAREHOUSE_READY receipt',v_way; end if;
    if exists (
      select 1 from public.be_wayplan_membership_v40 m
      join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
      where upper(m.delivery_way_id)=v_way
      and upper(coalesce(m.membership_status,'')) not in ('CANCELLED','COMPLETED','RTO')
      and upper(coalesce(w.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
    ) then raise exception 'Way % is already assigned to an active Wayplan',v_way; end if;
    if exists (
      select 1 from public.be_delivery_reschedules_v71 rs
      where upper(rs.delivery_way_id)=v_way and rs.status='ACTIVE'
        and rs.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
    ) then raise exception 'Way % is on a future-date hold',v_way; end if;
    -- A parcel previously scanned out must have a newer physical return scan
    -- before it can be scheduled into another route. Never infer a return.
    if exists (
      select 1 from public.be_dispatch_scans_v39 ds
      where upper(ds.delivery_way_id)=v_way and ds.scan_status='SCANNED'
        and not exists (
          select 1 from public.be_warehouse_return_scans_v39 rs
          where upper(rs.delivery_way_id)=v_way and rs.scanned_at>ds.scanned_at
        )
    ) then raise exception 'Way % requires a physical return scan after dispatch',v_way; end if;
    if exists (
      select 1 from public.be_thirdparty_cs_current_v1 cs
      where upper(cs.delivery_way_id)=v_way
        and upper(cs.outcome) in ('DELIVERED','RTO','HANDED_TO_PARTNER')
    ) then raise exception 'Way % already has a terminal or custody event',v_way; end if;
    if exists (
      select 1 from public.be_delivery_attempt_state_v39 a
      where upper(a.delivery_way_id)=v_way and upper(coalesce(a.last_status,''))='RTO'
    ) then raise exception 'Way % is already an RTO',v_way; end if;
  end loop;

  -- Explicitly DRAFT: driver/vehicle identity and road route require subsequent
  -- Supervisor validation. Never auto-release as READY_FOR_DISPATCH.
  insert into public.be_wayplan_dispatches(
    wayplan_id,branch_code,vehicle_code,driver_code,wayplan_status,
    total_stops,total_parcels,created_by,metadata
  ) values (
    v_plan_id,v_branch,v_vehicle,v_driver,'CREATED',
    v_requested,v_requested,coalesce(auth.jwt()->>'email',v_actor::text),
    jsonb_build_object('plan_type','THIRD_PARTY_PROVIDER_TRANSFER',
      'provider_code',v_provider,'handover_location_code',v_site.location_code,
      'origin_branch_code',v_branch,'request_id',p_request_id,
      'custody_received',false,'dispatch_scanned',false,'approval_required',true,
      'recipient_delivery_confirmed',false)
  );

  insert into public.be_wayplan_review_v43(
    wayplan_id,review_status,approval_snapshot
  ) values(v_plan_id,'DRAFT','{}'::jsonb);

  insert into public.be_wayplan_membership_v40(
    wayplan_id,delivery_way_id,pickup_id,route_zone,membership_status,
    vehicle_code,driver_code,metadata,created_by
  )
  select v_plan_id,upper(d.delivery_way_id),d.pickup_id,
    'PROVIDER_TRANSFER:'||v_site.location_code,'PLANNED',
    v_vehicle,v_driver,
    jsonb_build_object('assignment_mode','VEHICLE_CREW',
      'plan_type','THIRD_PARTY_PROVIDER_TRANSFER',
      'provider_code',v_provider,'handover_location_code',v_site.location_code),
    coalesce(auth.jwt()->>'email',v_actor::text)
  from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=any(
    select upper(btrim(x)) from unnest(p_delivery_way_ids) x
  );
  get diagnostics v_rows=row_count;
  if v_rows<>v_requested then
    raise exception 'Membership creation count mismatch: % versus %',v_rows,v_requested;
  end if;

  insert into public.be_wayplan_dispatch_stops(
    wayplan_id,stop_sequence,delivery_way_id,pickup_id,
    address,township,stop_status,metadata
  )
  select v_plan_id,row_number() over(order by upper(d.delivery_way_id))::int,
    upper(d.delivery_way_id),d.pickup_id,
    v_site.address,v_site.location_name,'PLANNED',
    jsonb_build_object('stop_type','PROVIDER_HANDOVER','provider_code',v_provider,
      'handover_location_code',v_site.location_code,
      'original_delivery_region',d.delivery_region,
      'customer_delivery_not_confirmed',true)
  from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=any(
    select upper(btrim(x)) from unnest(p_delivery_way_ids) x
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_way_id',m.delivery_way_id,'sequence',s.stop_sequence,
    'latitude',v_site.latitude,'longitude',v_site.longitude,
    'address',v_site.address,'township',v_site.location_name)
    order by s.stop_sequence),'[]'::jsonb)
  into v_ordered
  from public.be_wayplan_membership_v40 m
  join public.be_wayplan_dispatch_stops s
    on s.wayplan_id=m.wayplan_id and s.delivery_way_id=m.delivery_way_id
  where m.wayplan_id=v_plan_id;

  v_saved := public.be_save_operational_route_version_v1(
    v_plan_id,'GENERATED',jsonb_build_object(
      'source','DEFERRED_PROVIDER','route_source','DEFERRED_PROVIDER',
      'route_mode','PROVIDER_HANDOVER','origin',jsonb_build_object(
        'branch_code',v_branch,'label',v_origin.branch_name,
        'latitude',v_origin.lat,'longitude',v_origin.lng),
      'ordered_stops',v_ordered,
      'handover_location_code',v_site.location_code),'Provider handover site route awaiting review'
  );

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values(v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'THIRD_PARTY_TRANSFER_WAYPLAN_DRAFT_V1','WAYPLAN',v_plan_id,
    jsonb_build_object('provider_code',v_provider,'way_ids',p_delivery_way_ids,
      'site_code',v_site.location_code,'status','DRAFT','dispatch_created',false));

  return jsonb_build_object('ok',true,'wayplan_id',v_plan_id,
    'parcel_count',v_requested,'status','DRAFT',
    'provider_code',v_provider,'site_code',v_site.location_code,
    'dispatch_created',false,'handover_recorded',false,
    'customer_delivery_confirmed',false,
    'build','THIRD_PARTY_TRANSFER_DRAFT_V1');
end;
$body$;
revoke all on function public.be_provider_transfer_wayplan_draft_v1(
  uuid,text,text,text,text[],text,text) from public,anon;
grant execute on function public.be_provider_transfer_wayplan_draft_v1(
  uuid,text,text,text,text[],text,text) to authenticated;
