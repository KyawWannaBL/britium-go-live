-- Extend the installed provider-transfer workflow. Release controls and site approvals are unchanged.
-- Apply after the provider-transfer base installer on an operational UAT schema.
begin;

insert into public.be_data_entry_service_providers (provider_code,display_name,provider_type)
values ('SKY DELI','SKY Deli','OUTSOURCE')
on conflict (provider_code) do nothing;

create or replace function private.be_transfer_provider_for_parcel_v1(
  p_parcel_id uuid,p_quote jsonb,p_route_mode text
) returns text language sql stable set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (select nullif(upper(btrim(c.provider_code)),'')
       from private.be_warehouse_provider_assignment_confirmation_v1 c
      where c.parcel_detail_id=p_parcel_id),
    case when upper(btrim(p_route_mode))='HIGHWAY_BUS_STATION' then 'H.TERMINAL DROP-OFF' end,
    nullif(upper(btrim(p_quote->>'service_provider_code')),'')
  )
$$;

create or replace function private.be_transfer_terminal_matches_v1(
  p_station_code text,p_station_name text,p_location_code text,p_location_name text
) returns boolean language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select case
    when upper(btrim(p_station_code))='AUNG_MINGALAR'
      then upper(btrim(p_location_code)) in ('AUNG_MINGALAR','GATE_AUNG_MINGALAR')
    when nullif(upper(btrim(p_station_code)),'') not in ('OTHER','UNSET','DAGON_AYAR_THIRI')
      then upper(btrim(p_station_code))=upper(btrim(p_location_code))
    else coalesce(nullif(upper(btrim(p_station_name)),'')=upper(btrim(p_location_name)),false)
      or coalesce(upper(btrim(p_location_code))='GATE_AUNG_MINGALAR'
        and btrim(p_station_name) in ('အောင်မင်္ဂလာ','အောင်မင်္ဂလာဂိတ်'),false)
  end
$$;

revoke all on function private.be_transfer_provider_for_parcel_v1(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function private.be_transfer_terminal_matches_v1(text,text,text,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_warehouse_provider_transfer_preview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Warehouse session required';
  end if;
  perform public.be_warehouse_assert_internal();
  v_base := public.be_warehouse_scan_lifecycle_snapshot_v211();

  with src as materialized (
    select e, ord,
      upper(coalesce(nullif(e->>'canonical_delivery_way_id',''),
                     nullif(e->>'delivery_way_id',''))) way_id
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb))
         with ordinality as t(e,ord)
  ), metadata as (
    select s.e, s.ord, s.way_id,
      coalesce(private.be_transfer_provider_for_parcel_v1(d.id,d.financial_quote,d.delivery_route_mode),'UNSET') provider_code,
      d.handoff_station_code,
      d.handoff_station_name,
      upper(coalesce(nullif(d.delivery_region,''),'UNSET')) destination_region,
      upper(coalesce(nullif(d.delivery_route_mode,''),'UNSET')) route_mode,
      upper(coalesce(nullif(d.financial_validation_status,''),'UNSET')) financial_status,
      coalesce(nullif(split_part(upper(r.warehouse_code),'-',1),''),'UNSET') origin_branch_code,
      upper(coalesce(nullif(r.warehouse_status,''),'UNSET')) authoritative_receipt_status,
      r.discrepancy_code
    from src s
    left join lateral (
      select d.id,d.financial_quote,d.delivery_region,d.delivery_route_mode,d.handoff_station_code,d.handoff_station_name,
             d.financial_validation_status
      from public.be_data_entry_parcel_details d
      where upper(d.delivery_way_id)=s.way_id
        and upper(d.pickup_id)=upper(coalesce(s.e->>'pickup_id',''))
      order by d.updated_at desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select wr.warehouse_code,wr.warehouse_status,wr.discrepancy_code
      from public.be_warehouse_receipts_v36 wr
      where upper(wr.delivery_way_id)=s.way_id
      order by wr.updated_at desc nulls last limit 1
    ) r on true
  ), sites as (
    select m.*, provider.provider_type, site.location_code as handover_location_code,
      site.location_name as handover_location_name,
      site.latitude as handover_latitude,
      site.longitude as handover_longitude
    from metadata m
    left join public.be_data_entry_service_providers provider
      on provider.provider_code=m.provider_code and provider.is_active
    left join lateral (
      select loc.location_code,loc.location_name,loc.latitude,loc.longitude
      from public.be_provider_handover_sites_v1 approval
      join public.be_wayplan_service_locations loc
        on loc.location_code=approval.location_code
      where approval.provider_code=m.provider_code
        and approval.origin_branch_code=m.origin_branch_code
        and approval.active=true
        and approval.verified_at is not null
        and approval.verified_by is not null
        and loc.active=true
        and loc.latitude between 9 and 29
        and loc.longitude between 92 and 102
        and (provider.provider_type <> 'TERMINAL' or private.be_transfer_terminal_matches_v1(
          m.handoff_station_code,m.handoff_station_name,loc.location_code,loc.location_name
        ))
      order by approval.verified_at desc,loc.location_code
      limit 1
    ) site on true
  ), flagged as (
    select *,
      case
        when provider_code='BRITIUM' then 'BRITIUM_LAST_MILE'
        when provider_code='UNSET' then 'PROVIDER_REVIEW'
        when destination_region='OUTSIDE_CORE' then 'PROVIDER_TRANSFER_REQUIRED'
        when provider_type in ('OUTSOURCE','TERMINAL')
          then 'PROVIDER_HANDOVER_WITHIN_CORE_REGION'
        when provider_type='BRANCH' then 'BRANCH_HANDOVER_WITHIN_CORE_REGION'
        else 'PROVIDER_REVIEW'
      end as service_lane,
      case
        when nullif(e->>'active_wayplan_id','') is not null
          then 'ALREADY_ASSIGNED'
        when upper(coalesce(e->>'delivery_status','')) in
          ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
          then 'TERMINAL_PARCEL'
        when upper(coalesce(e->>'dispatch_workflow_stage','')) in
          ('SCHEDULED_HOLD','AWAITING_RETURN_SCAN','DISPATCH_SCAN_REQUIRED',
           'DISPATCH_SCANNED','IN_WAYPLAN_AWAITING_SUPERVISOR')
          then 'WORKFLOW_HOLD'
        when authoritative_receipt_status<>'WAREHOUSE_READY' or coalesce(discrepancy_code,'')<>''
          then 'WAREHOUSE_NOT_READY'
        when provider_type is null
          then 'PROVIDER_REVIEW_REQUIRED'
        when financial_status not in ('OK','VALID')
          then 'FINANCIAL_VALIDATION_PENDING'
        when provider_type in ('OUTSOURCE','TERMINAL')
          then case when handover_location_code is not null
            then 'PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN'
            else 'NEEDS_PROVIDER_TRANSFER_WAYPLAN' end
        when provider_type='BRANCH'
          then case when handover_location_code is not null
            then 'BRANCH_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN'
            else 'NEEDS_BRANCH_TRANSFER_WAYPLAN' end
        else 'REGIONAL_WAYPLAN_REVIEW'
      end as planning_gate
    from sites
  )
  select coalesce(jsonb_agg(e || jsonb_build_object(
      'reported_warehouse_status',coalesce(e->>'warehouse_scan_status',e->>'warehouse_status'),
      'authoritative_receipt_status',authoritative_receipt_status,
      'warehouse_scan_status',case when authoritative_receipt_status='UNSET' then e->>'warehouse_scan_status' else authoritative_receipt_status end,
      'service_provider_code',provider_code,
      'provider_type',provider_type,
      'handoff_station_name',handoff_station_name,
      'delivery_region',destination_region,
      'delivery_route_mode',route_mode,
      'financial_validation_status',financial_status,
      'service_lane',service_lane,
      'provider_planning_gate',planning_gate,
      'handover_origin_branch',origin_branch_code,
      'handover_location_code',handover_location_code,
      'handover_location_name',handover_location_name,
      'handover_location_verified',handover_location_code is not null
    ) order by ord),'[]'::jsonb) into v_rows
  from flagged;

  return v_base || jsonb_build_object(
    'rows',v_rows,
    'provider_transfer_preview',true,
    'build','WAREHOUSE_PROVIDER_TRANSFER_PREVIEW_V1',
    'note','Provider transfers require an approved physical site and a dedicated transfer Wayplan. No dispatch or custody events created.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.be_provider_transfer_wayplan_draft_v1(p_request_id uuid, p_provider_code text, p_origin_branch_code text, p_handover_location_code text, p_delivery_way_ids text[], p_vehicle_code text, p_driver_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
  v_pickup text;
  v_dest_region text;
  v_provider_actual text;
  v_station_code text;
  v_station_name text;
  v_provider_type text;
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

  select provider_type into v_provider_type
  from public.be_data_entry_service_providers
  where provider_code=v_provider and is_active
    and provider_type in ('OUTSOURCE','TERMINAL','BRANCH');
  if not found then raise exception 'Select an active transfer provider'; end if;

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
      private.be_transfer_provider_for_parcel_v1(d.id,d.financial_quote,d.delivery_route_mode),
      d.handoff_station_code,d.handoff_station_name
    into v_pickup,v_finance,v_status,v_dest_region,v_provider_actual,v_station_code,v_station_name
    from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=v_way
    order by d.updated_at desc nulls last,d.id
    limit 1;
    if v_pickup is null then raise exception 'Way % not found',v_way; end if;
    if v_finance not in ('VALID','OK')
      then raise exception 'Way % has pending financial validation',v_way; end if;
    if v_status in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
      then raise exception 'Way % is terminal',v_way; end if;
    if v_provider_actual is distinct from v_provider
      then raise exception 'Way % belongs to another service provider',v_way; end if;
    if v_provider_type='TERMINAL' and not private.be_transfer_terminal_matches_v1(
      v_station_code,v_station_name,v_site.location_code,v_site.location_name
    ) then raise exception 'Way % requires the matching approved highway gate',v_way; end if;
    if not exists (
      select 1
      from (
        select warehouse_status,warehouse_code,discrepancy_code
        from public.be_warehouse_receipts_v36 r
        where upper(r.delivery_way_id)=v_way
        order by r.updated_at desc nulls last
        limit 1
      ) receipt
      where upper(receipt.warehouse_status)='WAREHOUSE_READY'
        and upper(split_part(receipt.warehouse_code,'-',1))=v_branch
        and coalesce(receipt.discrepancy_code,'')=''
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
  ) values(v_plan_id,'DRAFT','{}'::jsonb)
  on conflict (wayplan_id) do nothing;

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
$function$
;

revoke all on function public.be_warehouse_provider_transfer_preview_v1() from public,anon;
grant execute on function public.be_warehouse_provider_transfer_preview_v1() to authenticated;
revoke all on function public.be_provider_transfer_wayplan_draft_v1(uuid,text,text,text,text[],text,text) from public,anon;
grant execute on function public.be_provider_transfer_wayplan_draft_v1(uuid,text,text,text,text[],text,text) to authenticated;

-- Management can select maintained physical location codes without direct table access.
create or replace function public.be_provider_transfer_site_options_v1()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.uid() is null or lower(replace(coalesce(public.be_current_role(),''),'-','_'))
      not in ('superadmin','super_admin','operation_manager','operations_manager') then
    raise exception 'Provider handover site options require management authority' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'providers',(select coalesce(jsonb_agg(jsonb_build_object('code',provider_code,'label',display_name,'type',provider_type)
      order by display_name),'[]'::jsonb)
      from public.be_data_entry_service_providers
      where is_active and provider_type in ('OUTSOURCE','BRANCH','TERMINAL')),
    'locations',(select coalesce(jsonb_agg(jsonb_build_object('code',location_code,'label',location_name)
      order by location_name),'[]'::jsonb)
      from public.be_wayplan_service_locations
      where active and latitude between 9 and 29 and longitude between 92 and 102)
  );
end;
$$;
revoke all on function public.be_provider_transfer_site_options_v1() from public,anon;
grant execute on function public.be_provider_transfer_site_options_v1() to authenticated;

create or replace function public.be_provider_transfer_register_site_v1(
  p_provider_code text,p_origin_branch_code text,p_name text,p_address text,
  p_latitude numeric,p_longitude numeric,p_verification_note text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_name text := nullif(btrim(p_name),'');
  v_address text := nullif(btrim(p_address),'');
  v_provider text := upper(btrim(coalesce(p_provider_code,'')));
  v_branch text := upper(btrim(coalesce(p_origin_branch_code,'')));
  v_type text;
  v_code text;
begin
  if auth.uid() is null or lower(replace(coalesce(public.be_current_role(),''),'-','_'))
      not in ('superadmin','super_admin','operation_manager','operations_manager') then
    raise exception 'Provider site registration requires management authority' using errcode='42501';
  end if;
  if v_branch not in ('YGN','MDY','NPT') then
    raise exception 'Choose a valid origin branch';
  end if;
  perform public.be_branch_scope_v1(v_branch);
  if v_name is null or v_address is null or p_latitude is null or p_longitude is null
      or p_latitude not between 9 and 29 or p_longitude not between 92 and 102
      or length(btrim(coalesce(p_verification_note,'')))<8 then
    raise exception 'A name, physical address, verified Myanmar coordinates and evidence reference are required';
  end if;
  select provider_type into v_type from public.be_data_entry_service_providers
  where provider_code=v_provider and is_active and provider_type in ('OUTSOURCE','BRANCH','TERMINAL');
  if not found then raise exception 'Select an active transfer provider'; end if;

  -- The name and address form a stable physical-site key for retries and parallel requests.
  v_code := 'HANDOVER_'||upper(md5(jsonb_build_array(lower(v_name),lower(v_address))::text));
  perform pg_advisory_xact_lock(hashtextextended('provider-location:'||v_code,0));
  if exists (
    select 1 from public.be_wayplan_service_locations
    where location_code=v_code and (latitude is distinct from p_latitude or longitude is distinct from p_longitude)
  ) then
    raise exception 'An existing site has different coordinates. Review the existing service location.';
  end if;
  insert into public.be_wayplan_service_locations
    (location_code,location_name,address,latitude,longitude,location_type,active)
  values (v_code,v_name,v_address,p_latitude,p_longitude,
          case when v_type='TERMINAL' then 'highway_gate' else 'custom' end,true)
  on conflict (location_code) do nothing;

  -- Reuse the site's role checks, evidence validation and audit trail.
  return public.be_provider_handover_site_approve_v1(
    v_provider,v_branch,v_code,p_verification_note
  );
end;
$$;
revoke all on function public.be_provider_transfer_register_site_v1(text,text,text,text,numeric,numeric,text) from public,anon;
grant execute on function public.be_provider_transfer_register_site_v1(text,text,text,text,numeric,numeric,text) to authenticated;

commit;
