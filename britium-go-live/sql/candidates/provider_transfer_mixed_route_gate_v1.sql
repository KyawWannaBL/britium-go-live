-- UAT ONLY: reviewed mixed pickup + provider-transfer vehicle itinerary.
-- Dependency: provider_transfer_mixed_pickups_v1.sql and transfer draft functions.
-- This is a separate physical itinerary and NEVER changes the delivery-way
-- parcel memberships used by Supervisor and physical Warehouse dispatch scans.
create table if not exists public.be_provider_transfer_mixed_routes_v1 (
  wayplan_id text primary key references public.be_wayplan_dispatches(wayplan_id),
  route_source text not null check(route_source in ('GOOGLE_ROUTES','OPERATOR_VERIFIED')),
  evidence_ref text not null check(length(btrim(evidence_ref))>=8),
  ordered_physical_stops jsonb not null,
  verified_by uuid not null,
  verified_at timestamptz not null default now(),
  constraint mixed_route_stops_array check (jsonb_typeof(ordered_physical_stops)='array')
);
alter table public.be_provider_transfer_mixed_routes_v1 enable row level security;
revoke all on table public.be_provider_transfer_mixed_routes_v1 from public,anon,authenticated;

create or replace function public.be_provider_transfer_review_mixed_route_v1(
  p_wayplan_id text,
  p_ordered_stops jsonb,
  p_route_source text,
  p_evidence_ref text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $body$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_plan public.be_wayplan_dispatches%rowtype;
  v_pickups integer;
  v_seen integer:=0;
  v_handover_count integer:=0;
  v_stop jsonb;
  v_ref text;
  v_sequence int:=0;
  v_checked text[]:='{}';
  v_site text;
  v_length int;
begin
  if not exists(select 1 from public.be_provider_transfer_release_control_v1 where control_key='PROVIDER_TRANSFER_V1' and mixed_trip_enabled) then raise exception 'Mixed route verification not yet enabled'; end if;
  if v_actor is null or v_role not in
    ('superadmin','super_admin','operation_manager','operations_manager')
    then raise exception 'Operations management approval required';
  end if;
  if p_route_source not in ('GOOGLE_ROUTES','OPERATOR_VERIFIED')
     or length(btrim(coalesce(p_evidence_ref,'')))<8
    then raise exception 'A reviewed road route and evidence reference are required'; end if;
  if jsonb_typeof(p_ordered_stops)<>'array'
    then raise exception 'Physical itinerary must be a JSON stop array'; end if;
  v_length:=jsonb_array_length(p_ordered_stops);
  select * into v_plan from public.be_wayplan_dispatches
  where wayplan_id=p_wayplan_id for update;
  if not found
    or v_plan.metadata->>'physical_trip_type'<>'MIXED_PICKUP_AND_PROVIDER_TRANSFER'
    or upper(coalesce(v_plan.wayplan_status,'')) not in ('CREATED','DRAFT')
    then raise exception 'An unreleased, staged mixed transfer draft is required'; end if;
  perform public.be_branch_scope_v1(v_plan.branch_code);
  if not exists(select 1 from public.be_wayplan_review_v43
    where wayplan_id=p_wayplan_id and review_status='DRAFT')
    then raise exception 'Mixed itinerary must be verified before Supervisor submission'; end if;
  select count(*) into v_pickups from public.be_provider_transfer_pickup_stops_v1
    where wayplan_id=p_wayplan_id and pickup_stage='PLANNED';
  if v_pickups=0 or v_length<>v_pickups+1
    then raise exception 'Include every pickup exactly once and one provider handover stop'; end if;
  v_site:=upper(coalesce(v_plan.metadata->>'handover_location_code',''));
  for v_stop in select value from jsonb_array_elements(p_ordered_stops) loop
    v_sequence:=v_sequence+1;
    if coalesce(v_stop->>'sequence','')<>v_sequence::text
      then raise exception 'Physical stops must have consecutive sequences starting at 1'; end if;
    v_ref:=upper(btrim(coalesce(v_stop->>'reference_id','')));
    if v_ref='' or v_ref=any(v_checked)
      then raise exception 'Duplicate or missing physical stop reference'; end if;
    v_checked:=array_append(v_checked,v_ref);
    if upper(coalesce(v_stop->>'kind',''))='PICKUP' then
      if not exists (
        select 1 from public.be_provider_transfer_pickup_stops_v1 p
        where p.wayplan_id=p_wayplan_id and p.pickup_id=v_ref
          and p.pickup_stage='PLANNED'
          and p.latitude=(v_stop->>'latitude')::numeric
          and p.longitude=(v_stop->>'longitude')::numeric
      ) then raise exception 'Pickup % has unverified stop coordinates or is not assigned',v_ref; end if;
      v_seen:=v_seen+1;
    elsif upper(coalesce(v_stop->>'kind',''))='PROVIDER_HANDOVER' then
      if v_ref<>v_site then
        raise exception 'Provider handover must use its approved physical site'; end if;
      if not exists (
        select 1 from public.be_provider_handover_sites_v1 h
        join public.be_wayplan_service_locations loc on loc.location_code=h.location_code
        where h.provider_code=upper(v_plan.metadata->>'provider_code')
          and h.origin_branch_code=upper(v_plan.branch_code)
          and upper(h.location_code)=v_site and h.active
          and h.verified_at is not null and h.verified_by is not null
          and loc.active
          and loc.latitude=(v_stop->>'latitude')::numeric
          and loc.longitude=(v_stop->>'longitude')::numeric
      ) then raise exception 'Handover stop coordinates must match the verified site'; end if;
      v_handover_count:=v_handover_count+1;
    else
      raise exception 'Unsupported stop kind; use PICKUP or PROVIDER_HANDOVER'; end if;
  end loop;
  if v_seen<>v_pickups or v_handover_count<>1 then
    raise exception 'Physical itinerary does not cover all pickups and one provider handover'; end if;
  -- A route can be manually verified or calculated using Google Routes.
  -- We do not invent distance/duration or infer pickup completion from this evidence.
  insert into public.be_provider_transfer_mixed_routes_v1(
    wayplan_id,route_source,evidence_ref,ordered_physical_stops,verified_by)
  values(p_wayplan_id,p_route_source,btrim(p_evidence_ref),p_ordered_stops,v_actor)
  on conflict (wayplan_id) do update
  set route_source=excluded.route_source,evidence_ref=excluded.evidence_ref,
      ordered_physical_stops=excluded.ordered_physical_stops,
      verified_by=excluded.verified_by,verified_at=now();

  update public.be_wayplan_dispatches
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'mixed_trip_route_optimization_pending',false,
       'mixed_trip_route_verified',true,
       'mixed_trip_route_source',p_route_source,
       'mixed_trip_evidence_ref',p_evidence_ref,
       'physical_trip_stop_count',v_length
    ),updated_at=now()
    where wayplan_id=p_wayplan_id;
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
     'MIXED_PROVIDER_ROUTE_VERIFIED_V1','WAYPLAN',p_wayplan_id,
     jsonb_build_object('pickup_stops',v_pickups,'handover_stops',1,
        'route_source',p_route_source,'route_evidence',p_evidence_ref,
        'dispatch_scanned',false,'pickup_collected',false));
  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,
    'pickup_stop_count',v_pickups,'handover_stop_count',1,
    'physical_stop_count',v_length,'route_verified',true,
    'supervisor_release_recorded',false,'dispatch_scanned',false);
end;
$body$;
revoke all on function public.be_provider_transfer_review_mixed_route_v1(text,jsonb,text,text)
  from public,anon;
grant execute on function public.be_provider_transfer_review_mixed_route_v1(text,jsonb,text,text)
  to authenticated;

-- Approval gate only applies to mixed provider-transfer plans.
-- All existing direct-delivery Wayplans are unaffected.
create or replace function public.be_provider_transfer_mixed_release_gate_v1()
returns trigger language plpgsql security definer
set search_path=public,auth,pg_temp as $body$
declare
  v_metadata jsonb;
  v_pickups int;
  v_verified int;
begin
  if new.review_status in ('APPROVED','DISPATCH_READY')
    and old.review_status is distinct from new.review_status then
    select metadata into v_metadata from public.be_wayplan_dispatches
      where wayplan_id=new.wayplan_id;
    if coalesce(v_metadata->>'physical_trip_type','')='MIXED_PICKUP_AND_PROVIDER_TRANSFER' then
      select count(*) into v_pickups from public.be_provider_transfer_pickup_stops_v1
      where wayplan_id=new.wayplan_id and pickup_stage='PLANNED';
      select count(*) into v_verified from public.be_provider_transfer_mixed_routes_v1
      where wayplan_id=new.wayplan_id and jsonb_array_length(ordered_physical_stops)=v_pickups+1;
      if v_pickups=0 or v_verified<>1 then
        raise exception 'Mixed trip requires complete verified physical pickup and provider itinerary before Supervisor approval';
      end if;
    end if;
  end if;
  return new;
end;
$body$;
drop trigger if exists be_provider_transfer_mixed_release_gate_v1
  on public.be_wayplan_review_v43;
create trigger be_provider_transfer_mixed_release_gate_v1
before update of review_status on public.be_wayplan_review_v43
for each row execute function public.be_provider_transfer_mixed_release_gate_v1();

revoke all on function public.be_provider_transfer_mixed_release_gate_v1() from public,anon,authenticated;
