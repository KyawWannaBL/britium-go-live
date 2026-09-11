-- Britium Express Wayplan V43
-- Supervisor approval gate between route planning and mandatory Dispatch scanning.
-- Requires Wayplan V40/V42 and Dispatch V41.

begin;

create extension if not exists pgcrypto;

create table if not exists public.be_wayplan_review_v43 (
  wayplan_id text primary key,
  review_status text not null default 'DRAFT',
  revision_no integer not null default 1,
  submitted_by text,
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  rejection_reason text,
  approval_snapshot jsonb not null default '{}'::jsonb,
  dispatch_ready_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint be_wayplan_review_v43_status_check check (
    review_status in ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','DISPATCH_READY','DISPATCHED','CANCELLED')
  )
);

create table if not exists public.be_wayplan_review_events_v43 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  event_type text not null,
  actor_email text,
  actor_role text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists be_wayplan_review_events_v43_wayplan_idx
  on public.be_wayplan_review_events_v43(wayplan_id, event_at desc);
create index if not exists be_wayplan_review_v43_status_idx
  on public.be_wayplan_review_v43(review_status, updated_at desc);

alter table public.be_wayplan_review_v43 enable row level security;
alter table public.be_wayplan_review_events_v43 enable row level security;
revoke all on public.be_wayplan_review_v43 from public, anon, authenticated;
revoke all on public.be_wayplan_review_events_v43 from public, anon, authenticated;

create or replace function public.be_wayplan_review_actor_v43(p_actor_email text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_actor_email), ''),
    nullif(auth.jwt() ->> 'email', ''),
    'wayplan-review@britiumexpress.com'
  );
$$;

create or replace function public.be_wayplan_review_role_v43()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb := '{}'::jsonb;
  v_role text := '';
  v_uid text := '';
  v_email text := '';
begin
  if session_user = 'postgres' then
    return 'super_admin';
  end if;

  begin
    v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  v_uid := coalesce(v_claims ->> 'sub', '');
  v_email := lower(coalesce(v_claims ->> 'email', ''));
  v_role := coalesce(
    v_claims -> 'app_metadata' ->> 'role',
    v_claims -> 'user_metadata' ->> 'role',
    v_claims ->> 'app_role',
    v_claims ->> 'role',
    ''
  );

  if to_regclass('public.profiles') is not null then
    begin
      execute $q$
        select coalesce(
          nullif(to_jsonb(p) ->> 'role', ''),
          nullif(to_jsonb(p) ->> 'user_role', ''),
          nullif(to_jsonb(p) ->> 'access_role', ''),
          nullif(to_jsonb(p) ->> 'portal_role', ''),
          $3
        )
        from public.profiles p
        where ($1 <> '' and (
          coalesce(to_jsonb(p) ->> 'id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'user_id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'auth_user_id', '') = $1
        ))
        or ($2 <> '' and lower(coalesce(to_jsonb(p) ->> 'email', '')) = $2)
        limit 1
      $q$ into v_role using v_uid, v_email, v_role;
    exception when others then
      null;
    end;
  end if;

  return lower(regexp_replace(coalesce(v_role, ''), '[^a-zA-Z0-9]+', '_', 'g'));
end;
$$;

create or replace function public.be_wayplan_can_review_v43()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := regexp_replace(public.be_wayplan_review_role_v43(), '[^a-z0-9]+', '', 'g');
  v_super boolean := false;
begin
  if session_user = 'postgres' then return true; end if;

  if to_regprocedure('public.be_is_super_admin_v39()') is not null then
    begin
      execute 'select public.be_is_super_admin_v39()' into v_super;
    exception when others then
      v_super := false;
    end;
  end if;

  return coalesce(v_super, false) or v_role in (
    'superadmin','systemadmin','admin','administrator',
    'supervisor','operationssupervisor','operationsmanager',
    'branchadmin','branchmanager','dispatchsupervisor'
  );
end;
$$;

create or replace function public.be_wayplan_validate_review_v43(p_wayplan_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
  v_route_count integer := 0;
  v_route text;
  v_invalid text[] := '{}'::text[];
  v_statuses text[] := '{}'::text[];
  v_missing_assignment integer := 0;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if to_regclass('public.be_wayplan_membership_v40') is null then
    raise exception 'Wayplan V40 membership is required before V43';
  end if;

  select
    count(*)::integer,
    count(distinct route_zone)::integer,
    min(route_zone),
    array_agg(distinct membership_status order by membership_status),
    count(*) filter (where coalesce(rider_code, rider_name, '') = '' or coalesce(vehicle_code, vehicle_name, '') = '')::integer
  into v_count, v_route_count, v_route, v_statuses, v_missing_assignment
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and membership_status not in ('CANCELLED','COMPLETED');

  if v_count = 0 then raise exception 'Wayplan % has no active parcel membership', v_wayplan; end if;
  if v_route_count <> 1 or coalesce(v_route, 'UNASSIGNED') = 'UNASSIGNED' then
    raise exception 'Wayplan % must contain exactly one assigned route group', v_wayplan;
  end if;
  if v_missing_assignment > 0 then
    raise exception 'Wayplan % is missing Rider or Vehicle assignment', v_wayplan;
  end if;
  if exists (
    select 1 from public.be_wayplan_membership_v40
    where wayplan_id = v_wayplan and membership_status in ('DISPATCHED','RTO','ON_HOLD')
  ) then
    raise exception 'Wayplan % contains dispatched, RTO, or held membership and cannot enter review', v_wayplan;
  end if;

  select coalesce(array_agg(m.delivery_way_id order by m.delivery_way_id), '{}'::text[])
  into v_invalid
  from public.be_wayplan_membership_v40 m
  left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
  where m.wayplan_id = v_wayplan
    and m.membership_status not in ('CANCELLED','COMPLETED')
    and (
      v.delivery_way_id is null
      or v.warehouse_status <> 'WAREHOUSE_READY'
      or coalesce(v.discrepancy_code, '') <> ''
      or coalesce(v.delivery_attempt_status, '') = 'RTO'
    );

  return jsonb_build_object(
    'ok', coalesce(cardinality(v_invalid), 0) = 0,
    'wayplan_id', v_wayplan,
    'parcel_count', v_count,
    'route_group', v_route,
    'membership_statuses', to_jsonb(v_statuses),
    'invalid_way_ids', to_jsonb(v_invalid),
    'invalid_count', coalesce(cardinality(v_invalid), 0),
    'assignment_complete', v_missing_assignment = 0
  );
end;
$$;

create or replace function public.be_wayplan_submit_review_v43(
  p_wayplan_id text,
  p_actor_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_validation jsonb;
  v_revision integer := 1;
  v_status text;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;

  v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    raise exception 'Wayplan review submission stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
  end if;

  select review_status, revision_no into v_status, v_revision
  from public.be_wayplan_review_v43 where wayplan_id = v_wayplan;

  if v_status in ('DISPATCH_READY','DISPATCHED','CANCELLED') then
    raise exception 'Wayplan % is already % and cannot be resubmitted', v_wayplan, v_status;
  end if;

  v_revision := case when v_status is null then 1 else coalesce(v_revision, 0) + 1 end;

  insert into public.be_wayplan_review_v43(
    wayplan_id, review_status, revision_no, submitted_by, submitted_at,
    reviewed_by, reviewed_at, review_notes, rejection_reason,
    approval_snapshot, updated_at
  ) values (
    v_wayplan, 'PENDING_REVIEW', v_revision, v_actor, now(),
    null, null, nullif(btrim(coalesce(p_notes, '')), ''), null,
    '{}'::jsonb, now()
  )
  on conflict (wayplan_id) do update
  set review_status = 'PENDING_REVIEW',
      revision_no = excluded.revision_no,
      submitted_by = excluded.submitted_by,
      submitted_at = excluded.submitted_at,
      reviewed_by = null,
      reviewed_at = null,
      review_notes = excluded.review_notes,
      rejection_reason = null,
      approval_snapshot = '{}'::jsonb,
      updated_at = now();

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_SUBMITTED_FOR_SUPERVISOR_REVIEW', v_actor, public.be_wayplan_review_role_v43(),
          jsonb_build_object('revision_no', v_revision, 'validation', v_validation, 'notes', nullif(btrim(coalesce(p_notes, '')), '')));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_SUBMITTED_FOR_SUPERVISOR_REVIEW_V43', v_actor,
          jsonb_build_object('revision_no', v_revision, 'validation', v_validation));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'PENDING_REVIEW',
    'revision_no', v_revision,
    'submitted_by', v_actor,
    'submitted_at', now(),
    'next_step', 'Supervisor reviews assignment, route group, parcel eligibility, and manifest before Dispatch handoff'
  );
end;
$$;

create or replace function public.be_wayplan_supervisor_decide_v43(
  p_wayplan_id text,
  p_decision text,
  p_notes text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_decision text := upper(regexp_replace(btrim(coalesce(p_decision, '')), '[^A-Za-z]+', '_', 'g'));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_status text;
  v_validation jsonb;
  v_snapshot jsonb;
begin
  if not public.be_wayplan_can_review_v43() then
    raise exception 'Supervisor, Branch Admin, Operations Manager, Admin, or Super Admin authority is required';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if v_decision not in ('APPROVE','APPROVED','REJECT','REJECTED','RETURN_FOR_CORRECTION') then
    raise exception 'Decision must be APPROVE or REJECT';
  end if;

  select review_status into v_status
  from public.be_wayplan_review_v43
  where wayplan_id = v_wayplan
  for update;

  if v_status is null then raise exception 'Wayplan % has not been submitted for supervisor review', v_wayplan; end if;
  if v_status <> 'PENDING_REVIEW' then
    raise exception 'Wayplan % is %, not PENDING_REVIEW', v_wayplan, v_status;
  end if;

  if v_decision in ('APPROVE','APPROVED') then
    v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
    if not coalesce((v_validation ->> 'ok')::boolean, false) then
      raise exception 'Approval stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
    end if;

    select jsonb_build_object(
      'wayplan_id', m.wayplan_id,
      'parcel_count', count(*)::integer,
      'route_group', min(m.route_zone),
      'rider_code', min(m.rider_code),
      'rider_name', min(m.rider_name),
      'vehicle_type', min(m.vehicle_type),
      'vehicle_code', min(m.vehicle_code),
      'vehicle_name', min(m.vehicle_name),
      'driver_code', min(m.driver_code),
      'driver_name', min(m.driver_name),
      'helper_code', min(m.helper_code),
      'helper_name', min(m.helper_name),
      'way_ids', jsonb_agg(m.delivery_way_id order by m.delivery_way_id)
    ) into v_snapshot
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id = v_wayplan
    group by m.wayplan_id;

    update public.be_wayplan_review_v43
    set review_status = 'APPROVED',
        reviewed_by = v_actor,
        reviewed_at = now(),
        review_notes = v_notes,
        rejection_reason = null,
        approval_snapshot = coalesce(v_snapshot, '{}'::jsonb),
        updated_at = now()
    where wayplan_id = v_wayplan;

    insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
    values (v_wayplan, 'WAYPLAN_APPROVED_BY_SUPERVISOR', v_actor, public.be_wayplan_review_role_v43(),
            jsonb_build_object('notes', v_notes, 'validation', v_validation, 'approval_snapshot', v_snapshot));

    insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
    values (v_wayplan, 'WAYPLAN_SUPERVISOR_APPROVED_V43', v_actor,
            jsonb_build_object('notes', v_notes, 'approval_snapshot', v_snapshot));

    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'APPROVED', 'reviewed_by', v_actor, 'reviewed_at', now());
  end if;

  if v_notes is null then raise exception 'A rejection/correction reason is required'; end if;

  update public.be_wayplan_review_v43
  set review_status = 'REJECTED',
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_notes = v_notes,
      rejection_reason = v_notes,
      updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_RETURNED_FOR_CORRECTION', v_actor, public.be_wayplan_review_role_v43(), jsonb_build_object('reason', v_notes));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_RETURNED_FOR_CORRECTION_V43', v_actor, jsonb_build_object('reason', v_notes));

  return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'REJECTED', 'rejection_reason', v_notes, 'reviewed_by', v_actor);
end;
$$;

create or replace function public.be_wayplan_prepare_dispatch_v43(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_review_status text;
  v_validation jsonb;
  v_count integer := 0;
  v_way_ids text[] := '{}'::text[];
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  select review_status into v_review_status
  from public.be_wayplan_review_v43
  where wayplan_id = v_wayplan
  for update;

  if v_review_status = 'DISPATCH_READY' then
    select count(*)::integer, array_agg(delivery_way_id order by delivery_way_id)
    into v_count, v_way_ids
    from public.be_wayplan_membership_v40
    where wayplan_id = v_wayplan and membership_status = 'READY_FOR_DISPATCH';
    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', v_review_status,
      'membership_status', 'READY_FOR_DISPATCH', 'parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'dispatch_scan_required', true);
  end if;

  if v_review_status <> 'APPROVED' then
    raise exception 'Wayplan % requires Supervisor APPROVED status before Dispatch handoff. Current status: %', v_wayplan, coalesce(v_review_status, 'NOT_SUBMITTED');
  end if;

  v_validation := public.be_wayplan_validate_review_v43(v_wayplan);
  if not coalesce((v_validation ->> 'ok')::boolean, false) then
    raise exception 'Dispatch handoff stopped. Ineligible parcel(s): %', coalesce(v_validation ->> 'invalid_way_ids', '[]');
  end if;

  select count(*)::integer, array_agg(delivery_way_id order by delivery_way_id)
  into v_count, v_way_ids
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan and membership_status = 'PLANNED';

  if v_count = 0 then raise exception 'Wayplan % has no PLANNED parcels to prepare', v_wayplan; end if;

  update public.be_wayplan_membership_v40
  set membership_status = 'READY_FOR_DISPATCH',
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supervisor_review_v43', 'APPROVED',
        'dispatch_ready_at', now(),
        'dispatch_ready_by', v_actor
      )
  where wayplan_id = v_wayplan and membership_status = 'PLANNED';

  update public.be_wayplan_review_v43
  set review_status = 'DISPATCH_READY', dispatch_ready_at = now(), updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'WAYPLAN_RELEASED_TO_MANDATORY_DISPATCH_SCAN', v_actor, public.be_wayplan_review_role_v43(),
          jsonb_build_object('parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'validation', v_validation));

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (v_wayplan, 'WAYPLAN_READY_FOR_MANDATORY_DISPATCH_SCAN_V43', v_actor,
          jsonb_build_object('parcel_count', v_count, 'way_ids', to_jsonb(v_way_ids), 'supervisor_approved', true));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'DISPATCH_READY',
    'membership_status', 'READY_FOR_DISPATCH',
    'parcel_count', v_count,
    'way_ids', to_jsonb(v_way_ids),
    'dispatch_scan_required', true,
    'message', format('%s passed Supervisor approval and is ready for mandatory Dispatch scanning.', v_wayplan)
  );
end;
$$;

-- Backward-compatible gate: old V40 callers can no longer bypass Supervisor approval.
create or replace function public.be_wayplan_prepare_dispatch_v40(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_wayplan_prepare_dispatch_v43(p_wayplan_id, p_actor_email);
$$;

create or replace function public.be_dispatch_publish_wayplan_v43(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_wayplan_review_actor_v43(p_actor_email);
  v_review_status text;
  v_result jsonb;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Dispatch operator is required';
  end if;
  select review_status into v_review_status
  from public.be_wayplan_review_v43 where wayplan_id = v_wayplan for update;

  if v_review_status = 'DISPATCHED' then
    return jsonb_build_object('ok', true, 'wayplan_id', v_wayplan, 'review_status', 'DISPATCHED', 'already_published', true);
  end if;
  if v_review_status <> 'DISPATCH_READY' then
    raise exception 'Publish blocked. Wayplan % requires Supervisor approval and DISPATCH_READY status. Current status: %', v_wayplan, coalesce(v_review_status, 'NOT_SUBMITTED');
  end if;

  v_result := public.be_dispatch_publish_wayplan_v41(v_wayplan, v_actor);

  update public.be_wayplan_review_v43
  set review_status = 'DISPATCHED', dispatched_at = now(), updated_at = now()
  where wayplan_id = v_wayplan;

  insert into public.be_wayplan_review_events_v43(wayplan_id, event_type, actor_email, actor_role, payload)
  values (v_wayplan, 'SUPERVISOR_APPROVED_WAYPLAN_PUBLISHED', v_actor, public.be_wayplan_review_role_v43(), coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'review_status', 'DISPATCHED',
    'supervisor_approval_enforced', true
  );
end;
$$;

create or replace function public.be_wayplan_review_status_v43(p_wayplan_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'wayplan_id', p_wayplan_id,
    'review_status', coalesce(r.review_status, 'DRAFT'),
    'revision_no', coalesce(r.revision_no, 0),
    'submitted_by', r.submitted_by,
    'submitted_at', r.submitted_at,
    'reviewed_by', r.reviewed_by,
    'reviewed_at', r.reviewed_at,
    'review_notes', r.review_notes,
    'rejection_reason', r.rejection_reason,
    'dispatch_ready_at', r.dispatch_ready_at,
    'dispatched_at', r.dispatched_at,
    'can_review', public.be_wayplan_can_review_v43(),
    'actor_role', public.be_wayplan_review_role_v43()
  )
  from (select 1) x
  left join public.be_wayplan_review_v43 r on r.wayplan_id = p_wayplan_id;
$$;

create or replace function public.be_wayplan_supervisor_snapshot_v43(p_wayplan_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filter text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_wayplans jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
begin
  with grouped as (
    select
      m.wayplan_id,
      min(m.route_zone) as route_zone,
      min(m.pickup_id) as pickup_id,
      min(m.rider_code) as rider_code,
      min(m.rider_name) as rider_name,
      min(m.driver_code) as driver_code,
      min(m.driver_name) as driver_name,
      min(m.helper_code) as helper_code,
      min(m.helper_name) as helper_name,
      min(m.vehicle_type) as vehicle_type,
      min(m.vehicle_code) as vehicle_code,
      min(m.vehicle_name) as vehicle_name,
      min(m.created_by) as created_by,
      min(m.created_at) as created_at,
      max(m.updated_at) as updated_at,
      count(*)::integer as parcel_count,
      count(*) filter (where m.membership_status = 'PLANNED')::integer as planned_count,
      count(*) filter (where m.membership_status = 'READY_FOR_DISPATCH')::integer as ready_count,
      count(*) filter (where m.membership_status = 'DISPATCHED')::integer as dispatched_count,
      count(*) filter (where m.membership_status in ('ON_HOLD','RTO'))::integer as held_count,
      coalesce(r.review_status, 'DRAFT') as review_status,
      coalesce(r.revision_no, 0) as revision_no,
      r.submitted_by,
      r.submitted_at,
      r.reviewed_by,
      r.reviewed_at,
      r.review_notes,
      r.rejection_reason,
      r.dispatch_ready_at,
      r.dispatched_at
    from public.be_wayplan_membership_v40 m
    left join public.be_wayplan_review_v43 r on r.wayplan_id = m.wayplan_id
    where m.membership_status not in ('CANCELLED','COMPLETED')
      and (v_filter is null or m.wayplan_id = v_filter)
    group by m.wayplan_id, r.review_status, r.revision_no, r.submitted_by, r.submitted_at,
             r.reviewed_by, r.reviewed_at, r.review_notes, r.rejection_reason,
             r.dispatch_ready_at, r.dispatched_at
  ), enriched as (
    select g.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'delivery_way_id', m.delivery_way_id,
          'pickup_id', m.pickup_id,
          'parcel_sequence', v.parcel_sequence,
          'recipient_name', v.recipient_name,
          'recipient_phone', v.recipient_phone,
          'township', v.township,
          'recipient_address', v.recipient_address,
          'cod_amount', v.actual_collect,
          'weight_kg', v.declared_weight_kg,
          'warehouse_status', v.warehouse_status,
          'discrepancy_code', v.discrepancy_code,
          'delivery_attempt_status', v.delivery_attempt_status,
          'membership_status', m.membership_status,
          'dispatch_scanned', v.dispatch_scanned
        ) order by v.township, v.parcel_sequence, m.delivery_way_id)
        from public.be_wayplan_membership_v40 m
        left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
        where m.wayplan_id = g.wayplan_id and m.membership_status not in ('CANCELLED','COMPLETED')
      ), '[]'::jsonb) as stops,
      coalesce((
        select count(*)::integer
        from public.be_wayplan_membership_v40 m
        left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
        where m.wayplan_id = g.wayplan_id
          and (v.delivery_way_id is null or v.warehouse_status <> 'WAREHOUSE_READY'
               or coalesce(v.discrepancy_code, '') <> '' or coalesce(v.delivery_attempt_status, '') = 'RTO'
               or m.membership_status in ('ON_HOLD','RTO'))
      ), 0) as blocked_count
    from grouped g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'wayplan_id', e.wayplan_id,
    'pickup_id', e.pickup_id,
    'route_zone', e.route_zone,
    'parcel_count', e.parcel_count,
    'planned_count', e.planned_count,
    'ready_count', e.ready_count,
    'dispatched_count', e.dispatched_count,
    'held_count', e.held_count,
    'blocked_count', e.blocked_count,
    'rider_code', e.rider_code,
    'rider_name', e.rider_name,
    'driver_code', e.driver_code,
    'driver_name', e.driver_name,
    'helper_code', e.helper_code,
    'helper_name', e.helper_name,
    'vehicle_type', e.vehicle_type,
    'vehicle_code', e.vehicle_code,
    'vehicle_name', e.vehicle_name,
    'created_by', e.created_by,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'review_status', e.review_status,
    'revision_no', e.revision_no,
    'submitted_by', e.submitted_by,
    'submitted_at', e.submitted_at,
    'reviewed_by', e.reviewed_by,
    'reviewed_at', e.reviewed_at,
    'review_notes', e.review_notes,
    'rejection_reason', e.rejection_reason,
    'dispatch_ready_at', e.dispatch_ready_at,
    'dispatched_at', e.dispatched_at,
    'stops', e.stops
  ) order by
    case e.review_status when 'PENDING_REVIEW' then 1 when 'APPROVED' then 2 when 'REJECTED' then 3 when 'DISPATCH_READY' then 4 when 'DISPATCHED' then 5 else 6 end,
    e.updated_at desc, e.wayplan_id), '[]'::jsonb)
  into v_wayplans
  from enriched e;

  select jsonb_build_object(
    'wayplans', count(distinct m.wayplan_id)::integer,
    'pending_review', count(distinct m.wayplan_id) filter (where coalesce(r.review_status, 'DRAFT') = 'PENDING_REVIEW')::integer,
    'approved', count(distinct m.wayplan_id) filter (where r.review_status = 'APPROVED')::integer,
    'rejected', count(distinct m.wayplan_id) filter (where r.review_status = 'REJECTED')::integer,
    'dispatch_ready', count(distinct m.wayplan_id) filter (where r.review_status = 'DISPATCH_READY')::integer,
    'dispatched', count(distinct m.wayplan_id) filter (where r.review_status = 'DISPATCHED')::integer,
    'parcels', count(*)::integer
  ) into v_stats
  from public.be_wayplan_membership_v40 m
  left join public.be_wayplan_review_v43 r on r.wayplan_id = m.wayplan_id
  where m.membership_status not in ('CANCELLED','COMPLETED')
    and (v_filter is null or m.wayplan_id = v_filter);

  return jsonb_build_object(
    'ok', true,
    'build', 'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
    'workflow', 'PLANNED -> PENDING_REVIEW -> APPROVED -> DISPATCH_READY -> mandatory Dispatch scan -> DISPATCHED',
    'can_review', public.be_wayplan_can_review_v43(),
    'actor_role', public.be_wayplan_review_role_v43(),
    'selected_wayplan_id', v_filter,
    'stats', coalesce(v_stats, '{}'::jsonb),
    'wayplans', v_wayplans
  );
end;
$$;

revoke all on function public.be_wayplan_review_actor_v43(text) from public, anon;
revoke all on function public.be_wayplan_review_role_v43() from public, anon;
revoke all on function public.be_wayplan_can_review_v43() from public, anon;
revoke all on function public.be_wayplan_validate_review_v43(text) from public, anon;
revoke all on function public.be_wayplan_submit_review_v43(text,text,text) from public, anon;
revoke all on function public.be_wayplan_supervisor_decide_v43(text,text,text,text) from public, anon;
revoke all on function public.be_wayplan_prepare_dispatch_v43(text,text) from public, anon;
revoke all on function public.be_wayplan_prepare_dispatch_v40(text,text) from public, anon;
revoke all on function public.be_dispatch_publish_wayplan_v43(text,text) from public, anon;
revoke all on function public.be_wayplan_review_status_v43(text) from public, anon;
revoke all on function public.be_wayplan_supervisor_snapshot_v43(text) from public, anon;

-- Prevent direct V41 Publish bypass after V43 is installed.
revoke execute on function public.be_dispatch_publish_wayplan_v41(text,text) from authenticated;

grant execute on function public.be_wayplan_review_role_v43() to authenticated;
grant execute on function public.be_wayplan_can_review_v43() to authenticated;
grant execute on function public.be_wayplan_validate_review_v43(text) to authenticated;
grant execute on function public.be_wayplan_submit_review_v43(text,text,text) to authenticated;
grant execute on function public.be_wayplan_supervisor_decide_v43(text,text,text,text) to authenticated;
grant execute on function public.be_wayplan_prepare_dispatch_v43(text,text) to authenticated;
grant execute on function public.be_wayplan_prepare_dispatch_v40(text,text) to authenticated;
grant execute on function public.be_dispatch_publish_wayplan_v43(text,text) to authenticated;
grant execute on function public.be_wayplan_review_status_v43(text) to authenticated;
grant execute on function public.be_wayplan_supervisor_snapshot_v43(text) to authenticated;

commit;

select
  to_regprocedure('public.be_wayplan_supervisor_snapshot_v43(text)')::text as supervisor_snapshot_rpc,
  to_regprocedure('public.be_wayplan_submit_review_v43(text,text,text)')::text as submit_review_rpc,
  to_regprocedure('public.be_wayplan_supervisor_decide_v43(text,text,text,text)')::text as supervisor_decision_rpc,
  to_regprocedure('public.be_wayplan_prepare_dispatch_v43(text,text)')::text as approved_dispatch_handoff_rpc,
  to_regprocedure('public.be_dispatch_publish_wayplan_v43(text,text)')::text as approval_guarded_publish_rpc,
  to_regprocedure('public.be_wayplan_review_status_v43(text)')::text as review_status_rpc,
  to_regclass('public.be_wayplan_review_v43')::text as review_table,
  'PLANNED -> Supervisor review -> APPROVED -> mandatory Dispatch scan -> guarded Publish'::text as workflow;
