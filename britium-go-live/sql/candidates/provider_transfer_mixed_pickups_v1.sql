-- Britium Express: draft mixed pickup + third-party transfer trip planning
-- UAT CANDIDATE. Install AFTER provider_transfer_wayplan_draft_v1.sql.
-- This attaches pickup stops to the SAME physical vehicle trip/transfer Wayplan.
-- Pickup collection is NOT a delivery parcel membership and cannot create a
-- warehouse dispatch scan. Separate pickup scan/proof requirements still apply.
create table if not exists public.be_provider_transfer_pickup_stops_v1 (
  wayplan_id text not null references public.be_wayplan_dispatches(wayplan_id),
  pickup_id text not null,
  pickup_way_id text not null,
  stop_sequence integer not null check (stop_sequence>0),
  latitude numeric not null check(latitude between 9 and 29),
  longitude numeric not null check(longitude between 92 and 102),
  address text not null check(length(btrim(address))>=8),
  location_evidence_ref text not null check(length(btrim(location_evidence_ref))>=8),
  verified_by uuid not null,
  verified_at timestamptz not null default now(),
  pickup_stage text not null default 'PLANNED' check(pickup_stage in ('PLANNED','CANCELLED','COLLECTED')),
  created_at timestamptz not null default now(),
  primary key(wayplan_id,pickup_id),
  unique(pickup_id)
);
alter table public.be_provider_transfer_pickup_stops_v1 enable row level security;
revoke all on table public.be_provider_transfer_pickup_stops_v1 from public,anon,authenticated;

create or replace function public.be_provider_transfer_add_pickups_v1(
  p_wayplan_id text,
  p_pickup_stops jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $body$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_plan public.be_wayplan_dispatches%rowtype;
  v_pickup jsonb;
  v_id text;
  v_row public.be_portal_pickup_requests%rowtype;
  v_seq int;
  v_lat numeric;
  v_lon numeric;
  v_address text;
  v_evidence text;
  v_count int:=0;
  v_requested int;
begin
  if not exists(select 1 from public.be_provider_transfer_release_control_v1 where control_key='PROVIDER_TRANSFER_V1' and mixed_trip_enabled) then raise exception 'Mixed provider trips not yet enabled'; end if;
  if v_actor is null or v_role not in
    ('superadmin','super_admin','operation_manager','operations_manager') then
    raise exception 'Management authority required for mixed trip planning';
  end if;
  if length(btrim(coalesce(p_reason,'')))<8 then
    raise exception 'Document the mixed-trip planning decision';
  end if;
  if jsonb_typeof(p_pickup_stops)<>'array' then
    raise exception 'Pickup stops must be an array';
  end if;
  v_requested:=jsonb_array_length(p_pickup_stops);
  if v_requested not between 1 and 30 then
    raise exception 'Choose 1 to 30 distinct pickup stops';
  end if;
  select * into v_plan from public.be_wayplan_dispatches
  where wayplan_id=p_wayplan_id for update;
  if not found or v_plan.metadata->>'plan_type'<>'THIRD_PARTY_PROVIDER_TRANSFER'
    or upper(coalesce(v_plan.wayplan_status,'')) not in ('CREATED','DRAFT') then
    raise exception 'Only an unreleased third-party transfer draft can become a mixed trip';
  end if;
  perform public.be_branch_scope_v1(v_plan.branch_code);
  if not exists(select 1 from public.be_wayplan_review_v43
    where wayplan_id=p_wayplan_id and review_status='DRAFT') then
    raise exception 'Cannot append pickups after submission to Supervisor';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mixed-trip:'||p_wayplan_id,0));

  for v_pickup in select value from jsonb_array_elements(p_pickup_stops) loop
    v_id:=upper(btrim(coalesce(v_pickup->>'pickup_id','')));
    if v_id='' then raise exception 'Pickup ID is required'; end if;
    if (v_pickup->>'sequence') !~ '^[0-9]{1,3}$' then
      raise exception 'Pickup % requires a positive stop sequence',v_id;
    end if;
    v_seq:=(v_pickup->>'sequence')::integer;
    if v_seq<=0 then raise exception 'Invalid pickup sequence'; end if;
    if (v_pickup->>'latitude') !~ '^-?[0-9]+(\\.[0-9]+)?$'
      or (v_pickup->>'longitude') !~ '^-?[0-9]+(\\.[0-9]+)?$'
      then raise exception 'Pickup % needs verified coordinates',v_id; end if;
    v_lat:=(v_pickup->>'latitude')::numeric;
    v_lon:=(v_pickup->>'longitude')::numeric;
    if v_lat not between 9 and 29 or v_lon not between 92 and 102 then
      raise exception 'Pickup % coordinate outside supported Myanmar boundary',v_id;
    end if;
    v_evidence:=btrim(coalesce(v_pickup->>'location_evidence_ref',''));
    if length(v_evidence)<8 then
      raise exception 'Pickup % requires an approved Google pin/evidence reference',v_id;
    end if;
    select * into v_row from public.be_portal_pickup_requests
    where upper(pickup_id)=v_id
      and upper(coalesce(branch_code,assigned_branch,''))=upper(v_plan.branch_code)
    for update;
    if not found then raise exception 'Pickup % not found in origin branch',v_id; end if;
    if upper(coalesce(v_row.pickup_status,v_row.status,'')) in
      ('CANCELLED','COLLECTED','DELIVERED_TO_WAREHOUSE','COMPLETED','CLOSED')
      then raise exception 'Pickup % is already closed or collected',v_id; end if;
    if upper(coalesce(v_row.workflow_stage,'')) in
      ('TO_WAREHOUSE','PICKUP_COMPLETED','CANCELLED')
      then raise exception 'Pickup % is already beyond collection',v_id; end if;
    if nullif(btrim(coalesce(v_row.assigned_driver_code,'')),'') is not null
      and upper(v_row.assigned_driver_code)<>upper(v_plan.driver_code)
      then raise exception 'Pickup % is assigned to a different Driver',v_id; end if;
    if nullif(btrim(coalesce(v_row.assigned_vehicle_code,'')),'') is not null
      and upper(v_row.assigned_vehicle_code)<>upper(v_plan.vehicle_code)
      then raise exception 'Pickup % is assigned to a different vehicle',v_id; end if;
    v_address:=btrim(coalesce(v_row.pickup_address,''));
    if length(v_address)<8 then raise exception 'Pickup % needs a complete pickup address',v_id; end if;

    insert into public.be_provider_transfer_pickup_stops_v1(
      wayplan_id,pickup_id,pickup_way_id,stop_sequence,latitude,longitude,
      address,location_evidence_ref,verified_by
    ) values(p_wayplan_id,v_id,coalesce(nullif(v_row.pickup_way_id,''),v_id),
      v_seq,v_lat,v_lon,v_address,v_evidence,v_actor);
    v_count:=v_count+1;
  end loop;

  update public.be_wayplan_dispatches set
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'physical_trip_type','MIXED_PICKUP_AND_PROVIDER_TRANSFER',
      'pickup_stop_count',v_count,
      'pickup_manifest_separate_from_parcel_membership',true,
      'mixed_trip_route_optimization_pending',true,
      'pickup_scan_required',true
    ),updated_at=now()
  where wayplan_id=p_wayplan_id;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values(v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'MIXED_TRIP_PICKUPS_STAGED_V1','WAYPLAN',p_wayplan_id,
    jsonb_build_object('pickup_count',v_count,'reason',p_reason,
      'pickup_scans_created',false,'dispatch_scans_created',false,
      'provider_handover_confirmed',false));

  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,
    'pickup_stop_count',v_count,'physical_trip_type','MIXED_PICKUP_AND_PROVIDER_TRANSFER',
    'pickup_collection_confirmed',false,'provider_transfer_confirmed',false,
    'route_optimization_pending',true);
end
$body$;
revoke all on function public.be_provider_transfer_add_pickups_v1(text,jsonb,text) from public,anon;
grant execute on function public.be_provider_transfer_add_pickups_v1(text,jsonb,text) to authenticated;
