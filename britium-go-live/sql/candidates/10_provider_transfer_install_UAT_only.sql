-- BRITIUM EXPRESS CONTROLLED PROVIDER TRANSFER / MIXED-TRIP SCHEMA INSTALL
-- Run ONLY on an isolated complete UAT environment first, after backup and review.
-- No parcel status, dispatch scan, pickup collection, custody or delivery mutations.
-- All new workflow capabilities install DEFAULT OFF.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
DO $check$ BEGIN
 IF to_regclass('public.be_data_entry_parcel_details') is null OR
    to_regclass('public.be_warehouse_receipts_v36') is null OR
    to_regclass('public.be_wayplan_dispatches') is null OR
    to_regclass('public.be_wayplan_membership_v40') is null OR
    to_regclass('public.be_wayplan_review_v43') is null OR
    to_regclass('public.be_wayplan_service_locations') is null OR
    to_regclass('public.be_dispatch_scans_v39') is null OR
    to_regclass('public.be_warehouse_return_scans_v39') is null OR
    to_regclass('public.be_portal_pickup_requests') is null
 THEN RAISE EXCEPTION 'UAT operational schema incomplete; refusing installation'; END IF;
END $check$;

-- =====================================
-- 1: provider_handover_sites_v1.sql
-- =====================================
-- Candidate only. Do NOT execute on production until UAT schema replay and review pass.
-- Provider handover locations must be physically verified and explicitly linked.
-- No implicit Royal Express site and no fabricated latitude/longitude.
create table if not exists public.be_provider_handover_sites_v1 (
  provider_code text not null references public.be_data_entry_service_providers(provider_code),
  origin_branch_code text not null,
  location_code text not null references public.be_wayplan_service_locations(location_code),
  active boolean not null default false,
  verified_at timestamptz,
  verified_by uuid,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_code,origin_branch_code,location_code),
  constraint be_provider_handover_verified_active
    check (not active or (verified_at is not null and verified_by is not null
      and length(btrim(coalesce(verification_note,''))) >= 8))
);
alter table public.be_provider_handover_sites_v1 enable row level security;
revoke all on table public.be_provider_handover_sites_v1 from public, anon, authenticated;
-- No policies by default: only trusted server-side, reviewed procedures may access.
-- Operational users must not insert arbitrary coordinates, toggle active rows, or
-- forge a provider handover to bypass custody verification.
--
-- Preparation for route planning:
-- JOIN active provider site to be_wayplan_service_locations with s.active=true,
-- latitude between 9 and 29, longitude between 92 and 102;
-- branch must match the authorized origin branch;
-- do not use the recipient's remote location as a local handover stop.
--
-- Sites are intentionally NOT seeded. Royal, DK and terminal handover sites
-- require an Operations-approved location before any transfer Wayplan can be created.


-- =====================================
-- 2: provider_handover_site_approve_v1.sql
-- =====================================
-- UAT CANDIDATE ONLY. Requires provider_handover_sites_v1.sql to be installed first.
-- Manual administrative approval of an existing mapped physical handover location.
-- This is NOT a dispatch scan, provider custody acceptance, or delivery confirmation.
create or replace function public.be_provider_handover_site_approve_v1(
  p_provider_code text,
  p_origin_branch_code text,
  p_location_code text,
  p_verification_note text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_role text := replace(lower(coalesce(public.be_current_role(),'')),'-','_');
  v_provider text := upper(btrim(coalesce(p_provider_code,'')));
  v_branch text := upper(btrim(coalesce(p_origin_branch_code,'')));
  v_location text := upper(btrim(coalesce(p_location_code,'')));
  v_note text := btrim(coalesce(p_verification_note,''));
  v_site record;
  v_provider_type text;
begin
  if v_user is null then
    raise exception 'Authenticated management approval is required';
  end if;
  if v_role not in ('superadmin','super_admin','operation_manager','operations_manager') then
    raise exception 'Management authority is required to approve a provider handover site';
  end if;
  if v_branch not in ('YGN','MDY','NPT') then
    raise exception 'Choose a valid origin branch';
  end if;
  if length(v_note)<8 then
    raise exception 'Document the physical handover verification (minimum eight characters)';
  end if;
  select provider_type into v_provider_type
  from public.be_data_entry_service_providers
  where provider_code=v_provider and is_active=true;
  if v_provider_type is null or upper(v_provider_type) not in ('OUTSOURCE','BRANCH','TERMINAL') then
    raise exception 'Select an active authorized external provider, branch or terminal';
  end if;
  select location_code,location_name,latitude,longitude,location_type
    into v_site
  from public.be_wayplan_service_locations
  where upper(location_code)=v_location and active=true
    and latitude between 9 and 29
    and longitude between 92 and 102;
  if not found then
    raise exception 'Select an existing active, geocoded physical service location';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_provider||':'||v_branch||':'||v_location,0));
  insert into public.be_provider_handover_sites_v1 (
    provider_code,origin_branch_code,location_code,active,
    verified_at,verified_by,verification_note,updated_at
  ) values (
    v_provider,v_branch,v_site.location_code,true,
    now(),v_user,v_note,now()
  )
  on conflict (provider_code,origin_branch_code,location_code)
  do update set active=true,verified_at=excluded.verified_at,
    verified_by=excluded.verified_by,
    verification_note=excluded.verification_note,updated_at=now();
  -- Audit records keep the physical site and the explicit management decision.
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (
    v_user,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_HANDOVER_SITE_APPROVED_V1','PROVIDER_HANDOVER_SITE',
    v_provider||':'||v_branch||':'||v_location,
    jsonb_build_object(
      'provider_code',v_provider,'origin_branch_code',v_branch,
      'location_code',v_location,'location_name',v_site.location_name,
      'latitude',v_site.latitude,'longitude',v_site.longitude,
      'verification_note',v_note,'verified_by',v_user
    )
  );
  return jsonb_build_object(
    'ok',true,'provider_code',v_provider,'origin_branch_code',v_branch,
    'location_code',v_location,'location_name',v_site.location_name,
    'verified_by',v_user,'site_approved',true,
    'dispatch_created',false,'custody_transfer_created',false,
    'build','PROVIDER_HANDOVER_SITE_APPROVE_V1'
  );
end;
$function$;

revoke all on function public.be_provider_handover_site_approve_v1(text,text,text,text) from public,anon;
grant execute on function public.be_provider_handover_site_approve_v1(text,text,text,text) to authenticated;


-- =====================================
-- 3: provider_transfer_release_control_v1.sql
-- =====================================
-- Provider transfer go-live capability switch.
-- Install on isolated UAT first; all features default to FALSE.
create table if not exists public.be_provider_transfer_release_control_v1 (
  control_key text primary key check (control_key='PROVIDER_TRANSFER_V1'),
  draft_enabled boolean not null default false,
  custody_enabled boolean not null default false,
  mixed_trip_enabled boolean not null default false,
  last_approval_evidence text,
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint provider_release_approval_required check (
    not (draft_enabled or custody_enabled or mixed_trip_enabled)
    or (approved_by is not null and approved_at is not null
      and length(btrim(coalesce(last_approval_evidence,'')))>=20)
  )
);
alter table public.be_provider_transfer_release_control_v1 enable row level security;
revoke all on table public.be_provider_transfer_release_control_v1 from public,anon,authenticated;
insert into public.be_provider_transfer_release_control_v1(control_key)
values ('PROVIDER_TRANSFER_V1') on conflict do nothing;

create or replace function public.be_provider_transfer_capabilities_v1()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $body$
declare
  v_control record;
  v_authenticated boolean:=auth.uid() is not null;
begin
  -- No role details, personal data or privileged metadata are returned.
  if not v_authenticated then
    return jsonb_build_object('ok',false,'draft_enabled',false,
      'custody_enabled',false,'mixed_trip_enabled',false);
  end if;
  select * into v_control from public.be_provider_transfer_release_control_v1
    where control_key='PROVIDER_TRANSFER_V1';
  return jsonb_build_object('ok',true,
    'draft_enabled',coalesce(v_control.draft_enabled,false),
    'custody_enabled',coalesce(v_control.custody_enabled,false),
    'mixed_trip_enabled',coalesce(v_control.mixed_trip_enabled,false),
    'build','PROVIDER_TRANSFER_CAPABILITIES_V1');
end;
$body$;
revoke all on function public.be_provider_transfer_capabilities_v1() from public,anon;
grant execute on function public.be_provider_transfer_capabilities_v1() to authenticated;

create or replace function public.be_provider_transfer_approve_release_v1(
  p_draft boolean,p_custody boolean,p_mixed boolean,p_evidence_ref text
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $body$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_evidence text:=btrim(coalesce(p_evidence_ref,''));
begin
  if v_actor is null or v_role not in ('superadmin','super_admin')
    then raise exception 'Super Admin approval required to change provider release capability'; end if;
  if coalesce(p_mixed,false) and not coalesce(p_draft,false) then
    raise exception 'Mixed trips require transfer draft capability'; end if;
  if (coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)) then
    if length(v_evidence)<20
      then raise exception 'Reference reviewed end-to-end UAT, handover and rollback evidence'; end if;
    if not exists(
      select 1 from public.be_provider_handover_sites_v1 h
      join public.be_wayplan_service_locations loc on loc.location_code=h.location_code
      where h.active and h.verified_at is not null and h.verified_by is not null
      and loc.active
    ) then raise exception 'At least one verified active provider handover site is required'; end if;
  end if;
  update public.be_provider_transfer_release_control_v1
  set draft_enabled=coalesce(p_draft,false),custody_enabled=coalesce(p_custody,false),
      mixed_trip_enabled=coalesce(p_mixed,false),
      last_approval_evidence=nullif(v_evidence,''),
      approved_by=case when coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)
        then v_actor else null end,
      approved_at=case when coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)
        then now() else null end,
      updated_at=now()
  where control_key='PROVIDER_TRANSFER_V1';
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_TRANSFER_RELEASE_CONTROL_V1','SYSTEM_CAPABILITY','PROVIDER_TRANSFER_V1',
    jsonb_build_object('draft_enabled',p_draft,'custody_enabled',p_custody,
      'mixed_trip_enabled',p_mixed,'uat_evidence_ref',v_evidence));
  return public.be_provider_transfer_capabilities_v1();
end;
$body$;
revoke all on function public.be_provider_transfer_approve_release_v1(boolean,boolean,boolean,text) from public,anon;
grant execute on function public.be_provider_transfer_approve_release_v1(boolean,boolean,boolean,text) to authenticated;


-- =====================================
-- 4: warehouse_provider_transfer_preview_v1.sql
-- =====================================
-- Candidate only. REVIEW + APPLY TO ISOLATED UAT FIRST.
-- Read-only; do not replace the authoritative Wayplan creator or Warehouse scan RPCs.
-- Canonical provider metadata attached only to already-authorized Warehouse snapshot rows.
create or replace function public.be_warehouse_provider_transfer_preview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
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
      upper(coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET')) provider_code,
      upper(coalesce(nullif(d.delivery_region,''),'UNSET')) destination_region,
      upper(coalesce(nullif(d.delivery_route_mode,''),'UNSET')) route_mode,
      upper(coalesce(nullif(d.financial_validation_status,''),'UNSET')) financial_status,
      coalesce(nullif(split_part(upper(r.warehouse_code),'-',1),''),'UNSET') origin_branch_code,
      upper(coalesce(nullif(r.warehouse_status,''),'UNSET')) authoritative_receipt_status
    from src s
    left join lateral (
      select d.financial_quote,d.delivery_region,d.delivery_route_mode,
             d.financial_validation_status
      from public.be_data_entry_parcel_details d
      where upper(d.delivery_way_id)=s.way_id
        and upper(d.pickup_id)=upper(coalesce(s.e->>'pickup_id',''))
      order by d.updated_at desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select wr.warehouse_code,wr.warehouse_status
      from public.be_warehouse_receipts_v36 wr
      where upper(wr.delivery_way_id)=s.way_id
      order by wr.updated_at desc nulls last limit 1
    ) r on true
  ), sites as (
    select m.*, site.location_code as handover_location_code,
      site.location_name as handover_location_name,
      site.latitude as handover_latitude,
      site.longitude as handover_longitude
    from metadata m
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
      order by approval.verified_at desc,loc.location_code
      limit 1
    ) site on true
  ), flagged as (
    select *,
      case
        when provider_code='BRITIUM' then 'BRITIUM_LAST_MILE'
        when provider_code='UNSET' then 'PROVIDER_REVIEW'
        when destination_region='OUTSIDE_CORE' then 'PROVIDER_TRANSFER_REQUIRED'
        when provider_code in ('ROYAL EXPRESS','DK DELIVERY','GRS','H.TERMINAL DROP-OFF')
          then 'PROVIDER_HANDOVER_WITHIN_CORE_REGION'
        when provider_code like '%BRANCH%' then 'BRANCH_HANDOVER_WITHIN_CORE_REGION'
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
        when (case when authoritative_receipt_status='UNSET'
                    then upper(coalesce(e->>'warehouse_scan_status',e->>'warehouse_status',''))
                    else authoritative_receipt_status end) not in
          ('RECEIVED','WAREHOUSE_READY','RETURN_SCANNED')
          then 'WAREHOUSE_NOT_READY'
        when provider_code='UNSET'
          then 'PROVIDER_REVIEW_REQUIRED'
        when financial_status not in ('OK','VALID')
          then 'FINANCIAL_VALIDATION_PENDING'
        when destination_region='OUTSIDE_CORE'
          or provider_code in ('ROYAL EXPRESS','DK DELIVERY','GRS','H.TERMINAL DROP-OFF')
          then case when handover_location_code is not null
            then 'PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN'
            else 'NEEDS_PROVIDER_TRANSFER_WAYPLAN' end
        when provider_code like '%BRANCH%'
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
$function$;

revoke all on function public.be_warehouse_provider_transfer_preview_v1() from public, anon;
grant execute on function public.be_warehouse_provider_transfer_preview_v1() to authenticated;


-- =====================================
-- 5: provider_transfer_wayplan_draft_v1.sql
-- =====================================
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


-- =====================================
-- 6: provider_transfer_custody_v1.sql
-- =====================================
-- ISOLATED UAT ONLY. Requires provider_transfer_wayplan_draft_v1.sql.
-- Custody is independent of delivery. It requires an actual Warehouse dispatch
-- scan AND the partner's physical signed receipt reference.
create table if not exists public.be_provider_transfer_custody_v1 (
  delivery_way_id text primary key,
  wayplan_id text not null references public.be_wayplan_dispatches(wayplan_id),
  provider_code text not null references public.be_data_entry_service_providers(provider_code),
  handover_location_code text not null references public.be_wayplan_service_locations(location_code),
  handover_manifest_ref text not null,
  provider_receiver_name text not null,
  provider_receipt_ref text not null,
  proof_reference text not null,
  dispatch_scanned_at timestamptz not null,
  physically_handed_over_at timestamptz not null default now(),
  confirmed_by uuid not null,
  created_at timestamptz not null default now(),
  constraint provider_receipt_nonblank check (
    length(btrim(provider_receiver_name))>=3
    and length(btrim(provider_receipt_ref))>=5
    and length(btrim(proof_reference))>=5
    and length(btrim(handover_manifest_ref))>=5
  )
);
alter table public.be_provider_transfer_custody_v1 enable row level security;
revoke all on table public.be_provider_transfer_custody_v1 from public,anon,authenticated;
-- A verified physical handover is recorded through an authorized RPC only.
create or replace function public.be_provider_transfer_confirm_handover_v1(
  p_way_id text,p_wayplan_id text,p_provider_code text,p_location_code text,
  p_manifest_ref text,p_receiver_name text,p_provider_receipt_ref text,p_proof_reference text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $body$
declare
  v_way text:=upper(btrim(coalesce(p_way_id,'')));
  v_plan text:=btrim(coalesce(p_wayplan_id,''));
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_location text:=upper(btrim(coalesce(p_location_code,'')));
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_last_scan timestamptz;
  v_branch text;
begin
  if not exists(select 1 from public.be_provider_transfer_release_control_v1 where control_key='PROVIDER_TRANSFER_V1' and custody_enabled) then raise exception 'Provider custody confirmation not yet enabled'; end if;
  if v_actor is null or v_role not in
     ('superadmin','super_admin','operation_manager','operations_manager',
      'warehouse','warehouse_staff','warehouse_lead','warehouse_manager',
      'operations','operations_admin','supervisor','admin')
    then raise exception 'Authorized Warehouse or Operations staff required'; end if;
  -- The Warehouse legacy assertion excludes some Operations Manager roles;
  -- this RPC has its own explicit role+branch+auth gate and does not bypass
  -- Supervisor release or the actual dispatch scan.
  if coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Anonymous sessions cannot confirm provider custody';
  end if;
  if length(btrim(coalesce(p_manifest_ref,'')))<5
    or length(btrim(coalesce(p_receiver_name,'')))<3
    or length(btrim(coalesce(p_provider_receipt_ref,'')))<5
    or length(btrim(coalesce(p_proof_reference,'')))<5
    then raise exception 'Physical manifest, receiver, provider receipt and evidence are mandatory';
  end if;
  select branch_code into v_branch
  from public.be_wayplan_dispatches
  where wayplan_id=v_plan
    and metadata->>'plan_type'='THIRD_PARTY_PROVIDER_TRANSFER'
    and upper(metadata->>'provider_code')=v_provider
    and upper(metadata->>'handover_location_code')=v_location;
  if v_branch is null then raise exception 'Approved third-party transfer Wayplan not found'; end if;
  perform public.be_branch_scope_v1(v_branch);
  if not exists(
    select 1 from public.be_wayplan_review_v43 r
    where r.wayplan_id=v_plan and r.review_status='DISPATCH_READY'
  ) then raise exception 'Supervisor DISPATCH_READY release required'; end if;
  if not exists (
    select 1 from public.be_wayplan_membership_v40 m
    where m.wayplan_id=v_plan and upper(m.delivery_way_id)=v_way
      and m.membership_status not in ('CANCELLED','COMPLETED','RTO')
  ) then raise exception 'Way is not active in this Wayplan'; end if;
  if not exists(
    select 1 from public.be_provider_handover_sites_v1 h
    where h.provider_code=v_provider and h.origin_branch_code=v_branch
      and upper(h.location_code)=v_location and h.active
      and h.verified_at is not null and h.verified_by is not null
  ) then raise exception 'Approved provider handover site is no longer active'; end if;
  select max(scanned_at) into v_last_scan
  from public.be_dispatch_scans_v39 ds
  where upper(ds.delivery_way_id)=v_way and ds.wayplan_code=v_plan
    and ds.scan_status='SCANNED';
  if v_last_scan is null then
    raise exception 'Physical Warehouse Dispatch Scan is required before partner handover';
  end if;
  if exists (
    select 1 from public.be_warehouse_return_scans_v39 rs
    where upper(rs.delivery_way_id)=v_way and rs.scanned_at>=v_last_scan
  ) then raise exception 'Parcel already physically returned after dispatch'; end if;
  if not exists (
    select 1 from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=v_way
      and upper(coalesce(d.parcel_status,'')) not in
        ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
  ) then raise exception 'Way no longer belongs to an active parcel'; end if;
  if exists (
    select 1 from public.be_thirdparty_cs_current_v1 cs
    where upper(cs.delivery_way_id)=v_way
      and upper(coalesce(cs.outcome,'')) in ('DELIVERED','RTO')
  ) then raise exception 'CS has already recorded a terminal third-party outcome'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-custody:'||v_way,0));
  if exists(select 1 from public.be_provider_transfer_custody_v1 where delivery_way_id=v_way)
    then raise exception 'Provider custody already confirmed for this Way ID'; end if;
  insert into public.be_provider_transfer_custody_v1(
    delivery_way_id,wayplan_id,provider_code,handover_location_code,
    handover_manifest_ref,provider_receiver_name,provider_receipt_ref,
    proof_reference,dispatch_scanned_at,confirmed_by
  ) values (
    v_way,v_plan,v_provider,v_location,btrim(p_manifest_ref),btrim(p_receiver_name),
    btrim(p_provider_receipt_ref),btrim(p_proof_reference),v_last_scan,v_actor
  );
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (
    v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_HANDOVER_CONFIRMED_V1','DELIVERY_WAY',v_way,
    jsonb_build_object('wayplan_id',v_plan,'provider_code',v_provider,
      'handover_location_code',v_location,'provider_receipt_ref',p_provider_receipt_ref,
      'manifest_ref',p_manifest_ref,'dispatch_scan_at',v_last_scan,
      'customer_delivery_confirmed',false,'settlement_posted',false)
  );
  return jsonb_build_object('ok',true,'delivery_way_id',v_way,
    'provider_code',v_provider,'wayplan_id',v_plan,
    'handover_recorded',true,'customer_delivery_confirmed',false,
    'settlement_posted',false,'build','PROVIDER_HANDOVER_CONFIRM_V1');
end;
$body$;
revoke all on function public.be_provider_transfer_confirm_handover_v1(
  text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.be_provider_transfer_confirm_handover_v1(
  text,text,text,text,text,text,text,text) to authenticated;


-- =====================================
-- 7: provider_transfer_mixed_pickups_v1.sql
-- =====================================
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


-- =====================================
-- 8: provider_transfer_mixed_route_gate_v1.sql
-- =====================================
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

DO $check$ BEGIN
 IF to_regprocedure('public.be_provider_transfer_wayplan_draft_v1(uuid,text,text,text,text[],text,text)') is null OR
    to_regprocedure('public.be_provider_transfer_confirm_handover_v1(text,text,text,text,text,text,text,text)') is null OR
    to_regprocedure('public.be_provider_transfer_add_pickups_v1(text,jsonb,text)') is null OR
    to_regprocedure('public.be_provider_transfer_review_mixed_route_v1(text,jsonb,text,text)') is null OR
    to_regprocedure('public.be_provider_transfer_capabilities_v1()') is null
 THEN RAISE EXCEPTION 'Provider transfer installation incomplete'; END IF;
END $check$;
COMMIT;
