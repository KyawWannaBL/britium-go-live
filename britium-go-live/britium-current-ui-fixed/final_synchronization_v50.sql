-- BRITIUM EXPRESS
-- V50 - Final Synchronization and Canonical Reconciliation
-- Build: FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30
-- Workflow: DEPARTMENTAL FINAL STATES -> CANONICAL REFRESH -> VARIANCE RESOLUTION -> CERTIFIED FOR REPORTING

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_missing text[] := '{}'::text[];
begin
  if to_regclass('public.be_wayplan_membership_v40') is null then v_missing := array_append(v_missing, 'be_wayplan_membership_v40'); end if;
  if to_regclass('public.be_wayplan_review_v43') is null then v_missing := array_append(v_missing, 'be_wayplan_review_v43'); end if;
  if to_regclass('public.be_wayplan_route_plans_v45') is null then v_missing := array_append(v_missing, 'be_wayplan_route_plans_v45'); end if;
  if to_regclass('public.be_rider_route_runs_v46') is null then v_missing := array_append(v_missing, 'be_rider_route_runs_v46'); end if;
  if to_regclass('public.be_rider_route_stop_state_v46') is null then v_missing := array_append(v_missing, 'be_rider_route_stop_state_v46'); end if;
  if to_regclass('public.be_finance_cod_settlements_v48') is null then v_missing := array_append(v_missing, 'be_finance_cod_settlements_v48'); end if;
  if to_regclass('public.be_cs_closure_v49') is null then v_missing := array_append(v_missing, 'be_cs_closure_v49'); end if;
  if to_regclass('public.be_warehouse_receipts_v36') is null then v_missing := array_append(v_missing, 'be_warehouse_receipts_v36'); end if;
  if to_regclass('public.be_dispatch_scans_v39') is null then v_missing := array_append(v_missing, 'be_dispatch_scans_v39'); end if;
  if to_regclass('public.be_operational_alerts_v39') is null then v_missing := array_append(v_missing, 'be_operational_alerts_v39'); end if;
  if to_regclass('public.be_delivery_attempt_state_v39') is null then v_missing := array_append(v_missing, 'be_delivery_attempt_state_v39'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'V50 prerequisites are missing: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

create table if not exists public.be_final_sync_cases_v50 (
  delivery_way_id text primary key,
  wayplan_id text not null,
  pickup_id text,
  route_zone text,
  membership_status text,
  warehouse_status text,
  dispatch_scan_status text,
  review_status text,
  route_status text,
  rider_run_status text,
  delivery_status text,
  finance_status text,
  cs_status text,
  expected_cod numeric not null default 0,
  open_alert_count integer not null default 0,
  check_status text not null default 'PENDING',
  issue_codes text[] not null default '{}'::text[],
  open_variance_count integer not null default 0,
  source_snapshot jsonb not null default '{}'::jsonb,
  certification_stale boolean not null default false,
  certified_by text,
  certified_at timestamptz,
  certification_note text,
  last_refreshed_by text,
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint be_final_sync_cases_v50_status_check check (
    check_status in ('PENDING','VARIANCE','READY_TO_CERTIFY','CERTIFIED','EXCLUDED')
  )
);

create table if not exists public.be_final_sync_variances_v50 (
  id bigint generated always as identity primary key,
  delivery_way_id text not null references public.be_final_sync_cases_v50(delivery_way_id) on delete cascade,
  wayplan_id text not null,
  issue_code text not null,
  issue_summary text not null,
  variance_status text not null default 'OPEN',
  owner text,
  owner_note text,
  detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  assigned_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  detected_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint be_final_sync_variances_v50_status_check check (
    variance_status in ('OPEN','ASSIGNED','RESOLVED','WAIVED')
  )
);

create unique index if not exists be_final_sync_variances_v50_open_uq
  on public.be_final_sync_variances_v50(delivery_way_id, issue_code)
  where variance_status in ('OPEN','ASSIGNED');

create index if not exists be_final_sync_cases_v50_wayplan_idx
  on public.be_final_sync_cases_v50(wayplan_id, check_status);
create index if not exists be_final_sync_cases_v50_pickup_idx
  on public.be_final_sync_cases_v50(pickup_id, check_status);
create index if not exists be_final_sync_variances_v50_status_idx
  on public.be_final_sync_variances_v50(variance_status, owner, wayplan_id);

create table if not exists public.be_final_sync_events_v50 (
  id bigint generated always as identity primary key,
  delivery_way_id text,
  wayplan_id text,
  variance_id bigint,
  event_type text not null,
  actor text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists be_final_sync_events_v50_wayplan_idx
  on public.be_final_sync_events_v50(wayplan_id, event_at desc);

alter table public.be_final_sync_cases_v50 enable row level security;
alter table public.be_final_sync_variances_v50 enable row level security;
alter table public.be_final_sync_events_v50 enable row level security;

revoke all on public.be_final_sync_cases_v50 from anon, authenticated;
revoke all on public.be_final_sync_variances_v50 from anon, authenticated;
revoke all on public.be_final_sync_events_v50 from anon, authenticated;

create or replace function public.be_final_sync_actor_v50(p_actor text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb := '{}'::jsonb;
  v_actor text := nullif(btrim(coalesce(p_actor, '')), '');
begin
  if v_actor is not null then return lower(v_actor); end if;
  begin
    v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  return lower(coalesce(nullif(v_claims ->> 'email', ''), nullif(v_claims ->> 'sub', ''), session_user, 'system'));
end;
$$;

create or replace function public.be_final_sync_role_v50()
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
  if session_user = 'postgres' then return 'super_admin'; end if;
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

create or replace function public.be_final_sync_can_manage_v50()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := regexp_replace(public.be_final_sync_role_v50(), '[^a-z0-9]+', '', 'g');
  v_super boolean := false;
begin
  if session_user = 'postgres' then return true; end if;
  if to_regprocedure('public.be_is_super_admin_v39()') is not null then
    begin execute 'select public.be_is_super_admin_v39()' into v_super; exception when others then v_super := false; end;
  end if;
  return coalesce(v_super, false) or v_role in (
    'superadmin','systemadmin','admin','administrator',
    'supervisor','operationssupervisor','operationsmanager','operationscontrol',
    'branchadmin','branchmanager','dispatchsupervisor','auditor','compliance'
  );
end;
$$;

create or replace function public.be_final_sync_issue_label_v50(p_code text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_code, ''))
    when 'MISSING_WAREHOUSE_RECEIPT' then 'Warehouse receipt is missing'
    when 'WAREHOUSE_NOT_READY' then 'Warehouse record is not ready or contains an exception'
    when 'MISSING_DISPATCH_SCAN' then 'Mandatory Dispatch scan is missing or reversed'
    when 'WAYPLAN_NOT_DISPATCHED' then 'Wayplan or membership is not in a dispatched/final state'
    when 'MISSING_APPROVED_ROUTE' then 'Approved Mapbox route is missing'
    when 'RIDER_ROUTE_NOT_FINAL' then 'Rider route is not completed'
    when 'DELIVERY_NOT_FINAL' then 'Delivery stop has no final outcome'
    when 'FINANCE_NOT_CLEAR' then 'COD settlement is not financially clear'
    when 'CUSTOMER_CLOSURE_NOT_COMPLETE' then 'Customer communication is not closed'
    when 'DUPLICATE_ACTIVE_MEMBERSHIP' then 'Parcel appears in more than one active Wayplan'
    when 'OPEN_OPERATIONAL_ALERT' then 'An unresolved operational alert remains open'
    when 'RTO_ATTEMPT_MISMATCH' then 'RTO state does not agree with the failed-attempt ledger'
    when 'TIMESTAMP_ORDER_MISMATCH' then 'Department timestamps are out of workflow order'
    else initcap(replace(lower(coalesce(p_code, 'unknown variance')), '_', ' '))
  end;
$$;

create or replace function public.be_final_sync_refresh_v50(p_scope text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_scope text := nullif(btrim(coalesce(p_scope, '')), '');
  v_actor text := public.be_final_sync_actor_v50(null);
  v_issues text[];
  v_snapshot jsonb;
  v_old_snapshot jsonb;
  v_old_status text;
  v_old_certified_at timestamptz;
  v_case_status text;
  v_stale boolean;
  v_issue text;
  v_rows integer := 0;
  v_variances_opened integer := 0;
  v_variances_resolved integer := 0;
  v_before_count integer;
begin
  if not public.be_final_sync_can_manage_v50() then
    raise exception 'Final synchronization refresh requires Operations Control, Supervisor, Admin, Auditor, or Compliance authority';
  end if;

  for r in
    select
      m.delivery_way_id,
      m.wayplan_id,
      m.pickup_id,
      m.route_zone,
      m.membership_status,
      w.warehouse_status,
      w.updated_at as warehouse_updated_at,
      ds.scan_status as dispatch_scan_status,
      ds.scanned_at as dispatch_scanned_at,
      rv.review_status,
      rv.dispatched_at,
      rp.route_status,
      rp.route_version,
      rp.optimized_at,
      rr.run_status as rider_run_status,
      rr.completed_at as rider_completed_at,
      rs.stop_status as delivery_status,
      rs.result_at as delivery_result_at,
      rs.result_operation_id,
      f.settlement_status as finance_status,
      f.expected_cod,
      f.proof_status as finance_proof_status,
      f.settled_at as finance_settled_at,
      c.workflow_status as cs_status,
      c.contacted_at,
      c.closed_at as cs_closed_at,
      coalesce(am.active_memberships, 0)::integer as active_memberships,
      coalesce(oa.open_alert_count, 0)::integer as open_alert_count,
      coalesce(da.consecutive_failures, 0)::integer as consecutive_failures
    from public.be_wayplan_membership_v40 m
    left join lateral (
      select wr.warehouse_status, wr.updated_at
      from public.be_warehouse_receipts_v36 wr
      where wr.delivery_way_id = m.delivery_way_id
      order by wr.updated_at desc nulls last
      limit 1
    ) w on true
    left join public.be_dispatch_scans_v39 ds
      on ds.delivery_way_id = m.delivery_way_id
    left join public.be_wayplan_review_v43 rv
      on rv.wayplan_id = m.wayplan_id
    left join public.be_wayplan_route_plans_v45 rp
      on rp.wayplan_id = m.wayplan_id and rp.route_status = 'READY'
    left join public.be_rider_route_runs_v46 rr
      on rr.wayplan_id = m.wayplan_id
    left join public.be_rider_route_stop_state_v46 rs
      on rs.wayplan_id = m.wayplan_id and rs.delivery_way_id = m.delivery_way_id
    left join public.be_finance_cod_settlements_v48 f
      on f.delivery_way_id = m.delivery_way_id
    left join public.be_cs_closure_v49 c
      on c.delivery_way_id = m.delivery_way_id
    left join lateral (
      select count(*) as active_memberships
      from public.be_wayplan_membership_v40 x
      where x.delivery_way_id = m.delivery_way_id
        and x.membership_status not in ('CANCELLED','COMPLETED','RTO')
    ) am on true
    left join lateral (
      select count(*) as open_alert_count
      from public.be_operational_alerts_v39 a
      where a.delivery_way_id = m.delivery_way_id
        and a.alert_status in ('OPEN','ACKNOWLEDGED')
    ) oa on true
    left join public.be_delivery_attempt_state_v39 da
      on da.delivery_way_id = m.delivery_way_id
    where v_scope is null
       or m.delivery_way_id = v_scope
       or m.wayplan_id = v_scope
       or m.pickup_id = v_scope
    order by m.wayplan_id, m.delivery_way_id
  loop
    v_rows := v_rows + 1;
    v_issues := '{}'::text[];

    if r.warehouse_status is null then
      v_issues := array_append(v_issues, 'MISSING_WAREHOUSE_RECEIPT');
    elsif coalesce(r.delivery_status, '') in ('FAILED','RTO','CANCELLED') then
      if r.warehouse_status not in ('WAREHOUSE_READY','WAREHOUSE_EXCEPTION') then
        v_issues := array_append(v_issues, 'WAREHOUSE_NOT_READY');
      end if;
    elsif r.warehouse_status <> 'WAREHOUSE_READY' then
      v_issues := array_append(v_issues, 'WAREHOUSE_NOT_READY');
    end if;

    if coalesce(r.dispatch_scan_status, '') <> 'SCANNED' then
      v_issues := array_append(v_issues, 'MISSING_DISPATCH_SCAN');
    end if;

    if coalesce(r.review_status, '') <> 'DISPATCHED'
       or coalesce(r.membership_status, '') not in ('DISPATCHED','COMPLETED','RTO','CANCELLED') then
      v_issues := array_append(v_issues, 'WAYPLAN_NOT_DISPATCHED');
    end if;

    if coalesce(r.route_status, '') <> 'READY' then
      v_issues := array_append(v_issues, 'MISSING_APPROVED_ROUTE');
    end if;

    if coalesce(r.rider_run_status, '') not in ('COMPLETED','COMPLETED_WITH_EXCEPTIONS') then
      v_issues := array_append(v_issues, 'RIDER_ROUTE_NOT_FINAL');
    end if;

    if coalesce(r.delivery_status, '') not in ('DELIVERED','FAILED','RTO','CANCELLED') then
      v_issues := array_append(v_issues, 'DELIVERY_NOT_FINAL');
    end if;

    if coalesce(r.delivery_status, '') = 'DELIVERED' then
      if coalesce(r.expected_cod, 0) > 0 and coalesce(r.finance_status, '') <> 'SETTLED' then
        v_issues := array_append(v_issues, 'FINANCE_NOT_CLEAR');
      elsif coalesce(r.expected_cod, 0) <= 0 and coalesce(r.finance_status, '') not in ('SETTLED','NOT_REQUIRED') then
        v_issues := array_append(v_issues, 'FINANCE_NOT_CLEAR');
      end if;
    end if;

    if coalesce(r.cs_status, '') <> 'CLOSED' then
      v_issues := array_append(v_issues, 'CUSTOMER_CLOSURE_NOT_COMPLETE');
    end if;

    if r.active_memberships > 1 then
      v_issues := array_append(v_issues, 'DUPLICATE_ACTIVE_MEMBERSHIP');
    end if;

    if r.open_alert_count > 0 then
      v_issues := array_append(v_issues, 'OPEN_OPERATIONAL_ALERT');
    end if;

    if coalesce(r.delivery_status, '') = 'RTO' and r.consecutive_failures < 3 then
      v_issues := array_append(v_issues, 'RTO_ATTEMPT_MISMATCH');
    end if;

    if (r.delivery_result_at is not null and r.dispatched_at is not null and r.delivery_result_at < r.dispatched_at)
       or (r.finance_settled_at is not null and r.delivery_result_at is not null and r.finance_settled_at < r.delivery_result_at)
       or (r.cs_closed_at is not null and r.delivery_result_at is not null and r.cs_closed_at < r.delivery_result_at)
       or (coalesce(r.expected_cod, 0) > 0 and r.cs_closed_at is not null and r.finance_settled_at is not null and r.cs_closed_at < r.finance_settled_at) then
      v_issues := array_append(v_issues, 'TIMESTAMP_ORDER_MISMATCH');
    end if;

    select coalesce(array_agg(distinct x order by x), '{}'::text[])
      into v_issues
    from unnest(v_issues) x;

    v_snapshot := jsonb_build_object(
      'delivery_way_id', r.delivery_way_id,
      'wayplan_id', r.wayplan_id,
      'pickup_id', r.pickup_id,
      'membership_status', r.membership_status,
      'warehouse', jsonb_build_object('status', r.warehouse_status, 'updated_at', r.warehouse_updated_at),
      'dispatch', jsonb_build_object('scan_status', r.dispatch_scan_status, 'scanned_at', r.dispatch_scanned_at),
      'wayplan_review', jsonb_build_object('status', r.review_status, 'dispatched_at', r.dispatched_at),
      'route', jsonb_build_object('status', r.route_status, 'version', r.route_version, 'optimized_at', r.optimized_at),
      'rider_run', jsonb_build_object('status', r.rider_run_status, 'completed_at', r.rider_completed_at),
      'delivery', jsonb_build_object('status', r.delivery_status, 'result_at', r.delivery_result_at, 'operation_id', r.result_operation_id),
      'finance', jsonb_build_object('status', r.finance_status, 'expected_cod', coalesce(r.expected_cod, 0), 'proof_status', r.finance_proof_status, 'settled_at', r.finance_settled_at),
      'customer_service', jsonb_build_object('status', r.cs_status, 'contacted_at', r.contacted_at, 'closed_at', r.cs_closed_at),
      'active_memberships', r.active_memberships,
      'open_alert_count', r.open_alert_count,
      'consecutive_failures', r.consecutive_failures,
      'issues', to_jsonb(v_issues)
    );

    select source_snapshot, check_status, certified_at
      into v_old_snapshot, v_old_status, v_old_certified_at
    from public.be_final_sync_cases_v50
    where delivery_way_id = r.delivery_way_id;

    if cardinality(v_issues) > 0 then
      v_case_status := 'VARIANCE';
      v_stale := v_old_certified_at is not null;
    elsif v_old_status = 'CERTIFIED' and v_old_snapshot = v_snapshot then
      v_case_status := 'CERTIFIED';
      v_stale := false;
    else
      v_case_status := 'READY_TO_CERTIFY';
      v_stale := v_old_certified_at is not null and v_old_snapshot is distinct from v_snapshot;
    end if;

    insert into public.be_final_sync_cases_v50 (
      delivery_way_id, wayplan_id, pickup_id, route_zone,
      membership_status, warehouse_status, dispatch_scan_status,
      review_status, route_status, rider_run_status, delivery_status,
      finance_status, cs_status, expected_cod, open_alert_count,
      check_status, issue_codes, source_snapshot, certification_stale,
      last_refreshed_by, last_refreshed_at, updated_at
    ) values (
      r.delivery_way_id, r.wayplan_id, r.pickup_id, r.route_zone,
      r.membership_status, r.warehouse_status, r.dispatch_scan_status,
      r.review_status, r.route_status, r.rider_run_status, r.delivery_status,
      r.finance_status, r.cs_status, coalesce(r.expected_cod, 0), r.open_alert_count,
      v_case_status, v_issues, v_snapshot, v_stale,
      v_actor, now(), now()
    )
    on conflict (delivery_way_id) do update set
      wayplan_id = excluded.wayplan_id,
      pickup_id = excluded.pickup_id,
      route_zone = excluded.route_zone,
      membership_status = excluded.membership_status,
      warehouse_status = excluded.warehouse_status,
      dispatch_scan_status = excluded.dispatch_scan_status,
      review_status = excluded.review_status,
      route_status = excluded.route_status,
      rider_run_status = excluded.rider_run_status,
      delivery_status = excluded.delivery_status,
      finance_status = excluded.finance_status,
      cs_status = excluded.cs_status,
      expected_cod = excluded.expected_cod,
      open_alert_count = excluded.open_alert_count,
      check_status = excluded.check_status,
      issue_codes = excluded.issue_codes,
      source_snapshot = excluded.source_snapshot,
      certification_stale = excluded.certification_stale,
      last_refreshed_by = excluded.last_refreshed_by,
      last_refreshed_at = excluded.last_refreshed_at,
      updated_at = now();

    foreach v_issue in array v_issues loop
      select count(*) into v_before_count
      from public.be_final_sync_variances_v50
      where delivery_way_id = r.delivery_way_id
        and issue_code = v_issue
        and variance_status in ('OPEN','ASSIGNED');

      insert into public.be_final_sync_variances_v50 (
        delivery_way_id, wayplan_id, issue_code, issue_summary,
        variance_status, detected_at, last_detected_at, detected_snapshot, updated_at
      )
      select r.delivery_way_id, r.wayplan_id, v_issue,
             public.be_final_sync_issue_label_v50(v_issue),
             'OPEN', now(), now(), v_snapshot, now()
      where v_before_count = 0;

      if v_before_count = 0 then
        v_variances_opened := v_variances_opened + 1;
      else
        update public.be_final_sync_variances_v50
        set last_detected_at = now(), detected_snapshot = v_snapshot, updated_at = now()
        where delivery_way_id = r.delivery_way_id
          and issue_code = v_issue
          and variance_status in ('OPEN','ASSIGNED');
      end if;
    end loop;

    with resolved as (
      update public.be_final_sync_variances_v50
      set variance_status = 'RESOLVED',
          resolved_by = v_actor,
          resolved_at = now(),
          resolution_note = coalesce(resolution_note, 'Automatically cleared by canonical refresh'),
          updated_at = now()
      where delivery_way_id = r.delivery_way_id
        and variance_status in ('OPEN','ASSIGNED')
        and not (issue_code = any(v_issues))
      returning 1
    )
    select count(*) into v_before_count from resolved;

    v_variances_resolved := v_variances_resolved + v_before_count;

    update public.be_final_sync_cases_v50 c
    set open_variance_count = (
          select count(*)::integer
          from public.be_final_sync_variances_v50 v
          where v.delivery_way_id = c.delivery_way_id
            and v.variance_status in ('OPEN','ASSIGNED')
        ),
        updated_at = now()
    where c.delivery_way_id = r.delivery_way_id;
  end loop;

  insert into public.be_final_sync_events_v50(event_type, actor, payload)
  values ('CANONICAL_REFRESH', v_actor, jsonb_build_object(
    'scope', v_scope,
    'rows_refreshed', v_rows,
    'variances_opened', v_variances_opened,
    'variances_resolved', v_variances_resolved,
    'build', 'FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30'
  ));

  return jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'rows_refreshed', v_rows,
    'variances_opened', v_variances_opened,
    'variances_resolved', v_variances_resolved,
    'refreshed_by', v_actor,
    'refreshed_at', now(),
    'build', 'FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30'
  );
end;
$$;

create or replace function public.be_final_sync_snapshot_v50(
  p_filter text default 'ALL',
  p_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select upper(coalesce(nullif(btrim(p_filter), ''), 'ALL')) as filter_value,
           greatest(1, least(coalesce(p_limit, 500), 2000)) as row_limit
  ),
  filtered as (
    select c.*
    from public.be_final_sync_cases_v50 c, params p
    where p.filter_value = 'ALL'
       or c.check_status = p.filter_value
       or p.filter_value = any(c.issue_codes)
  ),
  limited as (
    select * from filtered
    order by
      case check_status when 'VARIANCE' then 1 when 'READY_TO_CERTIFY' then 2 when 'PENDING' then 3 when 'CERTIFIED' then 4 else 5 end,
      updated_at desc,
      delivery_way_id
    limit (select row_limit from params)
  ),
  row_payload as (
    select
      to_jsonb(l) || jsonb_build_object(
        'open_variances', coalesce((
          select jsonb_agg(to_jsonb(v) order by v.detected_at, v.id)
          from public.be_final_sync_variances_v50 v
          where v.delivery_way_id = l.delivery_way_id
            and v.variance_status in ('OPEN','ASSIGNED')
        ), '[]'::jsonb)
      ) as row_json
    from limited l
  ),
  summary as (
    select jsonb_build_object(
      'rows', count(*)::integer,
      'pending', count(*) filter (where check_status = 'PENDING')::integer,
      'variance', count(*) filter (where check_status = 'VARIANCE')::integer,
      'ready_to_certify', count(*) filter (where check_status = 'READY_TO_CERTIFY')::integer,
      'certified', count(*) filter (where check_status = 'CERTIFIED')::integer,
      'stale_certifications', count(*) filter (where certification_stale)::integer,
      'open_variances', coalesce(sum(open_variance_count), 0)::integer,
      'expected_cod', coalesce(sum(expected_cod), 0)
    ) as value
    from filtered
  )
  select jsonb_build_object(
    'ok', true,
    'build', 'FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30',
    'filter', (select filter_value from params),
    'workflow', 'CANONICAL REFRESH -> VARIANCE RESOLUTION -> CERTIFIED FOR REPORTING',
    'summary', (select value from summary),
    'rows', coalesce((select jsonb_agg(row_json) from row_payload), '[]'::jsonb),
    'issue_catalog', jsonb_build_array(
      jsonb_build_object('code','MISSING_WAREHOUSE_RECEIPT','label',public.be_final_sync_issue_label_v50('MISSING_WAREHOUSE_RECEIPT')),
      jsonb_build_object('code','WAREHOUSE_NOT_READY','label',public.be_final_sync_issue_label_v50('WAREHOUSE_NOT_READY')),
      jsonb_build_object('code','MISSING_DISPATCH_SCAN','label',public.be_final_sync_issue_label_v50('MISSING_DISPATCH_SCAN')),
      jsonb_build_object('code','WAYPLAN_NOT_DISPATCHED','label',public.be_final_sync_issue_label_v50('WAYPLAN_NOT_DISPATCHED')),
      jsonb_build_object('code','MISSING_APPROVED_ROUTE','label',public.be_final_sync_issue_label_v50('MISSING_APPROVED_ROUTE')),
      jsonb_build_object('code','RIDER_ROUTE_NOT_FINAL','label',public.be_final_sync_issue_label_v50('RIDER_ROUTE_NOT_FINAL')),
      jsonb_build_object('code','DELIVERY_NOT_FINAL','label',public.be_final_sync_issue_label_v50('DELIVERY_NOT_FINAL')),
      jsonb_build_object('code','FINANCE_NOT_CLEAR','label',public.be_final_sync_issue_label_v50('FINANCE_NOT_CLEAR')),
      jsonb_build_object('code','CUSTOMER_CLOSURE_NOT_COMPLETE','label',public.be_final_sync_issue_label_v50('CUSTOMER_CLOSURE_NOT_COMPLETE')),
      jsonb_build_object('code','DUPLICATE_ACTIVE_MEMBERSHIP','label',public.be_final_sync_issue_label_v50('DUPLICATE_ACTIVE_MEMBERSHIP')),
      jsonb_build_object('code','OPEN_OPERATIONAL_ALERT','label',public.be_final_sync_issue_label_v50('OPEN_OPERATIONAL_ALERT')),
      jsonb_build_object('code','RTO_ATTEMPT_MISMATCH','label',public.be_final_sync_issue_label_v50('RTO_ATTEMPT_MISMATCH')),
      jsonb_build_object('code','TIMESTAMP_ORDER_MISMATCH','label',public.be_final_sync_issue_label_v50('TIMESTAMP_ORDER_MISMATCH'))
    ),
    'generated_at', now()
  );
$$;

create or replace function public.be_final_sync_assign_variance_v50(
  p_variance_id bigint,
  p_owner text,
  p_note text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_final_sync_actor_v50(p_actor);
  v_row public.be_final_sync_variances_v50%rowtype;
begin
  if not public.be_final_sync_can_manage_v50() then raise exception 'Not authorized to assign final synchronization variances'; end if;
  if nullif(btrim(coalesce(p_owner, '')), '') is null then raise exception 'Variance owner is required'; end if;

  update public.be_final_sync_variances_v50
  set variance_status = 'ASSIGNED',
      owner = btrim(p_owner),
      owner_note = nullif(btrim(coalesce(p_note, '')), ''),
      assigned_at = now(),
      updated_at = now()
  where id = p_variance_id
    and variance_status in ('OPEN','ASSIGNED')
  returning * into v_row;

  if not found then raise exception 'Open variance % was not found', p_variance_id; end if;

  insert into public.be_final_sync_events_v50(delivery_way_id, wayplan_id, variance_id, event_type, actor, payload)
  values (v_row.delivery_way_id, v_row.wayplan_id, v_row.id, 'VARIANCE_ASSIGNED', v_actor,
          jsonb_build_object('owner', v_row.owner, 'note', v_row.owner_note, 'issue_code', v_row.issue_code));

  return jsonb_build_object('ok', true, 'variance', to_jsonb(v_row));
end;
$$;

create or replace function public.be_final_sync_resolve_variance_v50(
  p_variance_id bigint,
  p_resolution text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_final_sync_actor_v50(p_actor);
  v_row public.be_final_sync_variances_v50%rowtype;
begin
  if not public.be_final_sync_can_manage_v50() then raise exception 'Not authorized to resolve final synchronization variances'; end if;
  if nullif(btrim(coalesce(p_resolution, '')), '') is null then raise exception 'Resolution note is required'; end if;

  update public.be_final_sync_variances_v50
  set variance_status = 'RESOLVED',
      resolved_by = v_actor,
      resolved_at = now(),
      resolution_note = btrim(p_resolution),
      updated_at = now()
  where id = p_variance_id
    and variance_status in ('OPEN','ASSIGNED')
  returning * into v_row;

  if not found then raise exception 'Open variance % was not found', p_variance_id; end if;

  insert into public.be_final_sync_events_v50(delivery_way_id, wayplan_id, variance_id, event_type, actor, payload)
  values (v_row.delivery_way_id, v_row.wayplan_id, v_row.id, 'VARIANCE_RESOLVED', v_actor,
          jsonb_build_object('resolution', v_row.resolution_note, 'issue_code', v_row.issue_code));

  perform public.be_final_sync_refresh_v50(v_row.delivery_way_id);
  return public.be_final_sync_status_v50(v_row.delivery_way_id);
end;
$$;

create or replace function public.be_final_sync_certify_v50(
  p_delivery_way_id text,
  p_note text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text := upper(nullif(btrim(coalesce(p_delivery_way_id, '')), ''));
  v_actor text := public.be_final_sync_actor_v50(p_actor);
  v_case public.be_final_sync_cases_v50%rowtype;
  v_open integer := 0;
begin
  if not public.be_final_sync_can_manage_v50() then raise exception 'Not authorized to certify final synchronization'; end if;
  if v_way_id is null then raise exception 'Way ID is required'; end if;

  perform public.be_final_sync_refresh_v50(v_way_id);

  select * into v_case
  from public.be_final_sync_cases_v50
  where delivery_way_id = v_way_id;

  if not found then raise exception 'Final synchronization case % was not found', v_way_id; end if;

  select count(*)::integer into v_open
  from public.be_final_sync_variances_v50
  where delivery_way_id = v_way_id
    and variance_status in ('OPEN','ASSIGNED');

  if v_open > 0 or cardinality(v_case.issue_codes) > 0 or v_case.check_status <> 'READY_TO_CERTIFY' then
    raise exception 'Way ID % is not ready to certify. Open variances: %, status: %', v_way_id, v_open, v_case.check_status;
  end if;

  update public.be_final_sync_cases_v50
  set check_status = 'CERTIFIED',
      certification_stale = false,
      certified_by = v_actor,
      certified_at = now(),
      certification_note = nullif(btrim(coalesce(p_note, '')), ''),
      updated_at = now()
  where delivery_way_id = v_way_id
  returning * into v_case;

  insert into public.be_final_sync_events_v50(delivery_way_id, wayplan_id, event_type, actor, payload)
  values (v_case.delivery_way_id, v_case.wayplan_id, 'FINAL_SYNC_CERTIFIED', v_actor,
          jsonb_build_object('note', v_case.certification_note, 'source_snapshot', v_case.source_snapshot));

  return jsonb_build_object('ok', true, 'case', to_jsonb(v_case));
end;
$$;

create or replace function public.be_final_sync_certify_batch_v50(
  p_delivery_way_ids text[],
  p_note text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_ok integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_delivery_way_ids is null or cardinality(p_delivery_way_ids) = 0 then raise exception 'At least one Way ID is required'; end if;
  foreach v_id in array p_delivery_way_ids loop
    begin
      v_results := v_results || jsonb_build_array(public.be_final_sync_certify_v50(v_id, p_note, p_actor));
      v_ok := v_ok + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('ok', false, 'delivery_way_id', v_id, 'error', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('ok', v_failed = 0, 'certified', v_ok, 'failed', v_failed, 'results', v_results);
end;
$$;

create or replace function public.be_final_sync_status_v50(p_delivery_way_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select to_jsonb(c) || jsonb_build_object(
        'variances', coalesce((
          select jsonb_agg(to_jsonb(v) order by v.detected_at, v.id)
          from public.be_final_sync_variances_v50 v
          where v.delivery_way_id = c.delivery_way_id
        ), '[]'::jsonb)
      )
      from public.be_final_sync_cases_v50 c
      where c.delivery_way_id = upper(btrim(p_delivery_way_id))
    ),
    jsonb_build_object('ok', false, 'delivery_way_id', upper(btrim(p_delivery_way_id)), 'message', 'Final synchronization case not found')
  );
$$;

revoke all on function public.be_final_sync_actor_v50(text) from public, anon, authenticated;
revoke all on function public.be_final_sync_role_v50() from public, anon, authenticated;
revoke all on function public.be_final_sync_can_manage_v50() from public, anon, authenticated;
revoke all on function public.be_final_sync_issue_label_v50(text) from public, anon, authenticated;

revoke all on function public.be_final_sync_refresh_v50(text) from public, anon;
revoke all on function public.be_final_sync_snapshot_v50(text,integer) from public, anon;
revoke all on function public.be_final_sync_assign_variance_v50(bigint,text,text,text) from public, anon;
revoke all on function public.be_final_sync_resolve_variance_v50(bigint,text,text) from public, anon;
revoke all on function public.be_final_sync_certify_v50(text,text,text) from public, anon;
revoke all on function public.be_final_sync_certify_batch_v50(text[],text,text) from public, anon;
revoke all on function public.be_final_sync_status_v50(text) from public, anon;

grant execute on function public.be_final_sync_refresh_v50(text) to authenticated;
grant execute on function public.be_final_sync_snapshot_v50(text,integer) to authenticated;
grant execute on function public.be_final_sync_assign_variance_v50(bigint,text,text,text) to authenticated;
grant execute on function public.be_final_sync_resolve_variance_v50(bigint,text,text) to authenticated;
grant execute on function public.be_final_sync_certify_v50(text,text,text) to authenticated;
grant execute on function public.be_final_sync_certify_batch_v50(text[],text,text) to authenticated;
grant execute on function public.be_final_sync_status_v50(text) to authenticated;

commit;

select jsonb_build_object(
  'final_sync_snapshot_rpc', to_regprocedure('public.be_final_sync_snapshot_v50(text,integer)')::text,
  'canonical_refresh_rpc', to_regprocedure('public.be_final_sync_refresh_v50(text)')::text,
  'assign_variance_rpc', to_regprocedure('public.be_final_sync_assign_variance_v50(bigint,text,text,text)')::text,
  'resolve_variance_rpc', to_regprocedure('public.be_final_sync_resolve_variance_v50(bigint,text,text)')::text,
  'certify_rpc', to_regprocedure('public.be_final_sync_certify_v50(text,text,text)')::text,
  'batch_certify_rpc', to_regprocedure('public.be_final_sync_certify_batch_v50(text[],text,text)')::text,
  'status_rpc', to_regprocedure('public.be_final_sync_status_v50(text)')::text,
  'case_table', to_regclass('public.be_final_sync_cases_v50')::text,
  'variance_table', to_regclass('public.be_final_sync_variances_v50')::text,
  'workflow', 'CANONICAL REFRESH -> VARIANCE RESOLUTION -> CERTIFIED FOR REPORTING',
  'build', 'FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30'
) as final_synchronization_v50;
