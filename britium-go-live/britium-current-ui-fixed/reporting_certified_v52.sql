-- BRITIUM EXPRESS
-- V52 - Certified Operational Reporting and Controlled Export
-- Build: REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30
-- Workflow: V50 CERTIFIED DATA -> FILTERED REPORT -> INDEPENDENT REVIEW -> CONTROLLED EXPORT

begin;

create extension if not exists pgcrypto;

do $$
declare
  v_missing text[] := '{}'::text[];
begin
  if to_regclass('public.be_final_sync_cases_v50') is null then v_missing := array_append(v_missing, 'be_final_sync_cases_v50'); end if;
  if to_regclass('public.be_wayplan_membership_v40') is null then v_missing := array_append(v_missing, 'be_wayplan_membership_v40'); end if;
  if to_regclass('public.be_data_entry_parcel_details') is null then v_missing := array_append(v_missing, 'be_data_entry_parcel_details'); end if;
  if to_regclass('public.be_finance_cod_settlements_v48') is null then v_missing := array_append(v_missing, 'be_finance_cod_settlements_v48'); end if;
  if to_regclass('public.be_cs_closure_v49') is null then v_missing := array_append(v_missing, 'be_cs_closure_v49'); end if;
  if cardinality(v_missing) > 0 then
    raise exception 'V52 prerequisites are missing: %', array_to_string(v_missing, ', ');
  end if;
end;
$$;

create table if not exists public.be_reporting_runs_v52 (
  report_run_id uuid primary key default gen_random_uuid(),
  report_name text not null,
  report_code text not null default 'CERTIFIED_OPERATIONAL',
  period_from date not null,
  period_to date not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  dataset_hash text not null,
  snapshot_payload jsonb not null default '{}'::jsonb,
  review_status text not null default 'DRAFT',
  generated_by text not null,
  generated_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  controlled_export_location text,
  certification_basis text not null default 'V50_CERTIFIED_ONLY',
  export_count integer not null default 0,
  last_exported_at timestamptz,
  stale boolean not null default false,
  stale_reason text,
  updated_at timestamptz not null default now(),
  constraint be_reporting_runs_v52_period_check check (period_to >= period_from),
  constraint be_reporting_runs_v52_status_check check (
    review_status in ('DRAFT','REVIEWED','APPROVED','REJECTED','STALE')
  )
);

create table if not exists public.be_reporting_exports_v52 (
  id bigint generated always as identity primary key,
  report_run_id uuid not null references public.be_reporting_runs_v52(report_run_id) on delete cascade,
  export_format text not null,
  file_name text not null,
  export_location text not null,
  row_count integer not null,
  dataset_hash text not null,
  exported_by text not null,
  exported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_reporting_exports_v52_format_check check (
    export_format in ('CSV','XLSX','PDF','JSON')
  )
);

create index if not exists be_reporting_runs_v52_generated_idx
  on public.be_reporting_runs_v52(generated_at desc, review_status);
create index if not exists be_reporting_runs_v52_period_idx
  on public.be_reporting_runs_v52(period_from, period_to, review_status);
create index if not exists be_reporting_exports_v52_run_idx
  on public.be_reporting_exports_v52(report_run_id, exported_at desc);

alter table public.be_reporting_runs_v52 enable row level security;
alter table public.be_reporting_exports_v52 enable row level security;
revoke all on public.be_reporting_runs_v52 from public, anon, authenticated;
revoke all on public.be_reporting_exports_v52 from public, anon, authenticated;

create or replace function public.be_reporting_actor_v52(p_actor text default null)
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

create or replace function public.be_reporting_role_v52()
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

create or replace function public.be_reporting_can_generate_v52()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select session_user = 'postgres' or regexp_replace(public.be_reporting_role_v52(), '[^a-z0-9]+', '', 'g') in (
    'superadmin','systemadmin','admin','administrator','supervisor',
    'operationssupervisor','operationsmanager','operationscontrol',
    'branchadmin','branchmanager','finance','financeadmin','financemanager',
    'accounting','accountant','analyst','dataanalyst','businessanalyst',
    'auditor','compliance','management','executive'
  );
$$;

create or replace function public.be_reporting_can_approve_v52()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select session_user = 'postgres' or regexp_replace(public.be_reporting_role_v52(), '[^a-z0-9]+', '', 'g') in (
    'superadmin','systemadmin','admin','administrator','supervisor',
    'operationssupervisor','operationsmanager','operationscontrol',
    'branchadmin','branchmanager','financemanager','financeadmin',
    'auditor','compliance','management','executive'
  );
$$;

create or replace function public.be_reporting_dataset_hash_v52(p_rows jsonb)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(p_rows, '[]'::jsonb)::text, 'sha256'), 'hex');
$$;

create or replace function public.be_reporting_certified_snapshot_v52(
  p_from date,
  p_to date,
  p_branch text default null,
  p_team text default null,
  p_service text default null,
  p_status text default null,
  p_finance_status text default null,
  p_limit integer default 2000
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      coalesce(p_from, current_date - 30) as date_from,
      coalesce(p_to, current_date) as date_to,
      upper(nullif(btrim(coalesce(p_branch, '')), '')) as branch_filter,
      upper(nullif(btrim(coalesce(p_team, '')), '')) as team_filter,
      upper(nullif(btrim(coalesce(p_service, '')), '')) as service_filter,
      upper(nullif(btrim(coalesce(p_status, '')), '')) as status_filter,
      upper(nullif(btrim(coalesce(p_finance_status, '')), '')) as finance_filter,
      greatest(1, least(coalesce(p_limit, 2000), 5000)) as row_limit
  ),
  certified_base as (
    select
      c.delivery_way_id,
      c.wayplan_id,
      c.pickup_id,
      coalesce(
        nullif(upper(m.metadata ->> 'branch_code'), ''),
        nullif(upper(m.metadata ->> 'branch'), ''),
        case when coalesce(m.route_zone, '') like 'GROUP_%' then 'YGN' else 'UNKNOWN' end
      ) as branch_code,
      coalesce(m.route_zone, c.route_zone, 'UNASSIGNED') as route_zone,
      case when nullif(m.rider_code, '') is not null then 'RIDER' else 'VEHICLE_CREW' end as assignment_mode,
      m.rider_code,
      m.rider_name,
      m.driver_code,
      m.driver_name,
      m.helper_code,
      m.helper_name,
      m.vehicle_code,
      m.vehicle_name,
      m.vehicle_type,
      coalesce(nullif(m.driver_code, ''), nullif(m.rider_code, ''), nullif(m.helper_code, ''), 'UNASSIGNED') as team_code,
      coalesce(nullif(m.driver_name, ''), nullif(m.rider_name, ''), nullif(m.helper_name, ''), 'Unassigned') as team_name,
      d.recipient_name,
      d.contact_no_1 as recipient_phone,
      d.township,
      d.destination,
      coalesce(nullif(d.customer_tier, ''), 'Standard') as service_tier,
      coalesce(d.weight_kg, 0)::numeric as weight_kg,
      coalesce(d.item_price, 0)::numeric as item_value,
      coalesce(d.delivery_fee, 0)::numeric as delivery_fee,
      coalesce(d.surcharge, 0)::numeric as surcharge,
      coalesce(d.actual_collect, 0)::numeric as collect_amount,
      coalesce(c.expected_cod, d.cod_amount, 0)::numeric as expected_cod,
      c.delivery_status,
      c.finance_status,
      c.cs_status,
      f.payment_mode,
      f.settled_amount,
      f.settlement_reference,
      f.settled_at,
      cs.contact_channel,
      cs.closed_at as customer_closed_at,
      c.certified_by,
      c.certified_at,
      c.certification_note,
      c.last_refreshed_at,
      c.source_snapshot
    from public.be_final_sync_cases_v50 c
    join public.be_wayplan_membership_v40 m
      on m.wayplan_id = c.wayplan_id
     and m.delivery_way_id = c.delivery_way_id
    left join public.be_data_entry_parcel_details d
      on d.delivery_way_id = c.delivery_way_id
    left join public.be_finance_cod_settlements_v48 f
      on f.delivery_way_id = c.delivery_way_id
    left join public.be_cs_closure_v49 cs
      on cs.delivery_way_id = c.delivery_way_id
    where public.be_reporting_can_generate_v52()
      and c.check_status = 'CERTIFIED'
      and coalesce(c.certification_stale, false) = false
      and coalesce(c.open_variance_count, 0) = 0
      and c.certified_at is not null
  ),
  period_base as (
    select b.*
    from certified_base b, params p
    where b.certified_at >= p.date_from::timestamptz
      and b.certified_at < (p.date_to + 1)::timestamptz
  ),
  filtered as (
    select b.*
    from period_base b, params p
    where (p.branch_filter is null or upper(b.branch_code) = p.branch_filter)
      and (p.team_filter is null or upper(coalesce(b.team_code, '')) = p.team_filter or upper(coalesce(b.team_name, '')) = p.team_filter)
      and (p.service_filter is null or upper(coalesce(b.service_tier, '')) = p.service_filter)
      and (p.status_filter is null or upper(coalesce(b.delivery_status, '')) = p.status_filter)
      and (p.finance_filter is null or upper(coalesce(b.finance_status, '')) = p.finance_filter)
  ),
  limited as (
    select * from filtered
    order by certified_at desc, wayplan_id, delivery_way_id
    limit (select row_limit from params)
  ),
  rows_payload as (
    select coalesce(jsonb_agg(to_jsonb(l) order by l.certified_at desc, l.wayplan_id, l.delivery_way_id), '[]'::jsonb) as rows
    from limited l
  ),
  summary_payload as (
    select jsonb_build_object(
      'rows', count(*)::integer,
      'pickups', count(distinct pickup_id)::integer,
      'wayplans', count(distinct wayplan_id)::integer,
      'delivered', count(*) filter (where delivery_status = 'DELIVERED')::integer,
      'failed', count(*) filter (where delivery_status = 'FAILED')::integer,
      'rto', count(*) filter (where delivery_status = 'RTO')::integer,
      'cancelled', count(*) filter (where delivery_status = 'CANCELLED')::integer,
      'delivery_rate_pct', round(100.0 * count(*) filter (where delivery_status = 'DELIVERED') / nullif(count(*), 0), 2),
      'total_weight_kg', coalesce(sum(weight_kg), 0),
      'total_item_value', coalesce(sum(item_value), 0),
      'total_delivery_fee', coalesce(sum(delivery_fee), 0),
      'total_surcharge', coalesce(sum(surcharge), 0),
      'total_collect_amount', coalesce(sum(collect_amount), 0),
      'expected_cod', coalesce(sum(expected_cod), 0),
      'settled_cod', coalesce(sum(case when finance_status in ('SETTLED','NOT_REQUIRED') then expected_cod else 0 end), 0),
      'finance_clear', count(*) filter (where finance_status in ('SETTLED','NOT_REQUIRED'))::integer,
      'customer_closed', count(*) filter (where cs_status = 'CLOSED')::integer,
      'certified_only', true,
      'stale_excluded', true
    ) as summary
    from filtered
  ),
  by_day as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', report_date,
      'rows', rows,
      'delivered', delivered,
      'delivery_fee', delivery_fee,
      'expected_cod', expected_cod
    ) order by report_date), '[]'::jsonb) as value
    from (
      select certified_at::date as report_date,
             count(*)::integer as rows,
             count(*) filter (where delivery_status = 'DELIVERED')::integer as delivered,
             coalesce(sum(delivery_fee), 0) as delivery_fee,
             coalesce(sum(expected_cod), 0) as expected_cod
      from filtered
      group by certified_at::date
    ) x
  ),
  by_status as (
    select coalesce(jsonb_agg(jsonb_build_object('status', delivery_status, 'count', count) order by count desc, delivery_status), '[]'::jsonb) as value
    from (select coalesce(delivery_status, 'UNKNOWN') as delivery_status, count(*)::integer as count from filtered group by coalesce(delivery_status, 'UNKNOWN')) x
  ),
  by_service as (
    select coalesce(jsonb_agg(jsonb_build_object('service', service_tier, 'count', count, 'delivery_fee', delivery_fee, 'expected_cod', expected_cod) order by count desc, service_tier), '[]'::jsonb) as value
    from (
      select coalesce(service_tier, 'UNKNOWN') as service_tier, count(*)::integer as count,
             coalesce(sum(delivery_fee), 0) as delivery_fee, coalesce(sum(expected_cod), 0) as expected_cod
      from filtered group by coalesce(service_tier, 'UNKNOWN')
    ) x
  ),
  by_route as (
    select coalesce(jsonb_agg(jsonb_build_object('route_zone', route_zone, 'count', count, 'delivery_rate_pct', delivery_rate_pct) order by count desc, route_zone), '[]'::jsonb) as value
    from (
      select coalesce(route_zone, 'UNASSIGNED') as route_zone, count(*)::integer as count,
             round(100.0 * count(*) filter (where delivery_status = 'DELIVERED') / nullif(count(*), 0), 2) as delivery_rate_pct
      from filtered group by coalesce(route_zone, 'UNASSIGNED')
    ) x
  ),
  by_finance as (
    select coalesce(jsonb_agg(jsonb_build_object('finance_status', finance_status, 'count', count, 'expected_cod', expected_cod) order by count desc, finance_status), '[]'::jsonb) as value
    from (
      select coalesce(finance_status, 'UNKNOWN') as finance_status, count(*)::integer as count, coalesce(sum(expected_cod), 0) as expected_cod
      from filtered group by coalesce(finance_status, 'UNKNOWN')
    ) x
  ),
  options as (
    select jsonb_build_object(
      'branches', coalesce((select to_jsonb(array_agg(distinct branch_code order by branch_code)) from period_base where branch_code is not null), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(x order by x->>'code') from (select distinct jsonb_build_object('code', team_code, 'name', team_name) as x from period_base where team_code is not null) q), '[]'::jsonb),
      'services', coalesce((select to_jsonb(array_agg(distinct service_tier order by service_tier)) from period_base where service_tier is not null), '[]'::jsonb),
      'statuses', coalesce((select to_jsonb(array_agg(distinct delivery_status order by delivery_status)) from period_base where delivery_status is not null), '[]'::jsonb),
      'finance_statuses', coalesce((select to_jsonb(array_agg(distinct finance_status order by finance_status)) from period_base where finance_status is not null), '[]'::jsonb)
    ) as value
  )
  select jsonb_build_object(
    'ok', true,
    'build', 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30',
    'workflow', 'V50 CERTIFIED DATA -> FILTERED REPORT -> INDEPENDENT REVIEW -> CONTROLLED EXPORT',
    'period', jsonb_build_object('from', (select date_from from params), 'to', (select date_to from params)),
    'filters', jsonb_build_object(
      'branch', (select branch_filter from params),
      'team', (select team_filter from params),
      'service', (select service_filter from params),
      'status', (select status_filter from params),
      'finance_status', (select finance_filter from params)
    ),
    'summary', (select summary from summary_payload),
    'rows', (select rows from rows_payload),
    'breakdowns', jsonb_build_object(
      'by_day', (select value from by_day),
      'by_status', (select value from by_status),
      'by_service', (select value from by_service),
      'by_route', (select value from by_route),
      'by_finance', (select value from by_finance)
    ),
    'filter_options', (select value from options),
    'generated_at', now()
  );
$$;

create or replace function public.be_reporting_generate_v52(
  p_report_name text,
  p_from date,
  p_to date,
  p_branch text default null,
  p_team text default null,
  p_service text default null,
  p_status text default null,
  p_finance_status text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_reporting_actor_v52(p_actor);
  v_name text := nullif(btrim(coalesce(p_report_name, '')), '');
  v_snapshot jsonb;
  v_hash text;
  v_run public.be_reporting_runs_v52%rowtype;
begin
  if not public.be_reporting_can_generate_v52() then
    raise exception 'Reporting V52 requires authorized Operations, Management, Finance, Analyst, Auditor, or Admin access';
  end if;
  if v_name is null then raise exception 'Report name is required'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'A valid report period is required'; end if;

  v_snapshot := public.be_reporting_certified_snapshot_v52(
    p_from, p_to, p_branch, p_team, p_service, p_status, p_finance_status, 5000
  );
  v_hash := public.be_reporting_dataset_hash_v52(v_snapshot -> 'rows');

  insert into public.be_reporting_runs_v52(
    report_name, period_from, period_to, filters, row_count, summary,
    dataset_hash, snapshot_payload, generated_by, generated_at, updated_at
  ) values (
    v_name, p_from, p_to,
    jsonb_build_object(
      'branch', upper(nullif(btrim(coalesce(p_branch, '')), '')),
      'team', upper(nullif(btrim(coalesce(p_team, '')), '')),
      'service', upper(nullif(btrim(coalesce(p_service, '')), '')),
      'status', upper(nullif(btrim(coalesce(p_status, '')), '')),
      'finance_status', upper(nullif(btrim(coalesce(p_finance_status, '')), ''))
    ),
    coalesce((v_snapshot -> 'summary' ->> 'rows')::integer, 0),
    coalesce(v_snapshot -> 'summary', '{}'::jsonb),
    v_hash, v_snapshot, v_actor, now(), now()
  ) returning * into v_run;

  return v_snapshot || jsonb_build_object('report_run', to_jsonb(v_run));
end;
$$;

create or replace function public.be_reporting_revalidate_v52(p_report_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.be_reporting_runs_v52%rowtype;
  v_snapshot jsonb;
  v_hash text;
  v_same boolean;
begin
  if not public.be_reporting_can_generate_v52() then raise exception 'Not authorized to revalidate reports'; end if;
  select * into v_run from public.be_reporting_runs_v52 where report_run_id = p_report_run_id;
  if not found then raise exception 'Report run % was not found', p_report_run_id; end if;

  v_snapshot := public.be_reporting_certified_snapshot_v52(
    v_run.period_from,
    v_run.period_to,
    v_run.filters ->> 'branch',
    v_run.filters ->> 'team',
    v_run.filters ->> 'service',
    v_run.filters ->> 'status',
    v_run.filters ->> 'finance_status',
    5000
  );
  v_hash := public.be_reporting_dataset_hash_v52(v_snapshot -> 'rows');
  v_same := v_hash = v_run.dataset_hash
            and coalesce((v_snapshot -> 'summary' ->> 'rows')::integer, 0) = v_run.row_count;

  if not v_same then
    update public.be_reporting_runs_v52
    set stale = true,
        stale_reason = 'Certified source data changed after report generation',
        review_status = case when review_status = 'APPROVED' then 'STALE' else review_status end,
        updated_at = now()
    where report_run_id = p_report_run_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'report_run_id', p_report_run_id,
    'same_dataset', v_same,
    'stored_hash', v_run.dataset_hash,
    'current_hash', v_hash,
    'stored_rows', v_run.row_count,
    'current_rows', coalesce((v_snapshot -> 'summary' ->> 'rows')::integer, 0),
    'snapshot', v_snapshot
  );
end;
$$;

create or replace function public.be_reporting_review_v52(
  p_report_run_id uuid,
  p_decision text,
  p_note text,
  p_export_location text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_reporting_actor_v52(p_actor);
  v_decision text := upper(nullif(btrim(coalesce(p_decision, '')), ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_location text := nullif(btrim(coalesce(p_export_location, '')), '');
  v_run public.be_reporting_runs_v52%rowtype;
  v_validation jsonb;
  v_role text := regexp_replace(public.be_reporting_role_v52(), '[^a-z0-9]+', '', 'g');
begin
  if not public.be_reporting_can_approve_v52() then raise exception 'Report review requires Management, Finance Manager, Supervisor, Auditor, Compliance, or Admin authority'; end if;
  if v_decision not in ('REVIEW','APPROVE','REJECT') then raise exception 'Decision must be REVIEW, APPROVE, or REJECT'; end if;
  if v_note is null then raise exception 'Review note is required'; end if;

  select * into v_run from public.be_reporting_runs_v52 where report_run_id = p_report_run_id for update;
  if not found then raise exception 'Report run % was not found', p_report_run_id; end if;

  if v_decision = 'APPROVE' then
    if v_run.row_count <= 0 then raise exception 'A zero-row report cannot be approved for operational use'; end if;
    if v_location is null then raise exception 'Controlled export location is required for approval'; end if;
    if lower(v_run.generated_by) = lower(v_actor) and v_role not in ('superadmin','systemadmin') then
      raise exception 'The report preparer cannot approve the same report; an independent reviewer is required';
    end if;
    v_validation := public.be_reporting_revalidate_v52(p_report_run_id);
    if coalesce((v_validation ->> 'same_dataset')::boolean, false) = false then
      raise exception 'Report data changed after generation. Generate a new report before approval';
    end if;
  end if;

  update public.be_reporting_runs_v52
  set review_status = case v_decision when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' else 'REVIEWED' end,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_note = v_note,
      controlled_export_location = coalesce(v_location, controlled_export_location),
      stale = false,
      stale_reason = null,
      updated_at = now()
  where report_run_id = p_report_run_id
  returning * into v_run;

  return jsonb_build_object('ok', true, 'report_run', to_jsonb(v_run));
end;
$$;

create or replace function public.be_reporting_register_export_v52(
  p_report_run_id uuid,
  p_export_format text,
  p_file_name text,
  p_export_location text,
  p_row_count integer,
  p_dataset_hash text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.be_reporting_actor_v52(p_actor);
  v_format text := upper(nullif(btrim(coalesce(p_export_format, '')), ''));
  v_file text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_location text := nullif(btrim(coalesce(p_export_location, '')), '');
  v_run public.be_reporting_runs_v52%rowtype;
  v_validation jsonb;
  v_export public.be_reporting_exports_v52%rowtype;
begin
  if not public.be_reporting_can_generate_v52() then raise exception 'Not authorized to register report exports'; end if;
  if v_format not in ('CSV','XLSX','PDF','JSON') then raise exception 'Unsupported export format %', v_format; end if;
  if v_file is null or v_location is null then raise exception 'File name and controlled export location are required'; end if;

  select * into v_run from public.be_reporting_runs_v52 where report_run_id = p_report_run_id for update;
  if not found then raise exception 'Report run % was not found', p_report_run_id; end if;
  if v_run.review_status <> 'APPROVED' or v_run.stale then raise exception 'Only a current APPROVED report may be exported'; end if;
  if coalesce(p_row_count, -1) <> v_run.row_count then raise exception 'Export row count does not match the approved report'; end if;
  if coalesce(p_dataset_hash, '') <> v_run.dataset_hash then raise exception 'Export dataset hash does not match the approved report'; end if;

  v_validation := public.be_reporting_revalidate_v52(p_report_run_id);
  if coalesce((v_validation ->> 'same_dataset')::boolean, false) = false then
    raise exception 'Report data became stale before export. Generate and approve a new report';
  end if;

  insert into public.be_reporting_exports_v52(
    report_run_id, export_format, file_name, export_location, row_count,
    dataset_hash, exported_by, exported_at
  ) values (
    p_report_run_id, v_format, v_file, v_location, v_run.row_count,
    v_run.dataset_hash, v_actor, now()
  ) returning * into v_export;

  update public.be_reporting_runs_v52
  set export_count = export_count + 1,
      last_exported_at = now(),
      controlled_export_location = v_location,
      updated_at = now()
  where report_run_id = p_report_run_id;

  return jsonb_build_object('ok', true, 'export', to_jsonb(v_export));
end;
$$;

create or replace function public.be_reporting_run_status_v52(p_report_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select to_jsonb(r) || jsonb_build_object(
        'exports', coalesce((
          select jsonb_agg(to_jsonb(e) order by e.exported_at desc, e.id desc)
          from public.be_reporting_exports_v52 e
          where e.report_run_id = r.report_run_id
        ), '[]'::jsonb)
      )
      from public.be_reporting_runs_v52 r
      where r.report_run_id = p_report_run_id
        and public.be_reporting_can_generate_v52()
    ),
    jsonb_build_object('ok', false, 'report_run_id', p_report_run_id, 'message', 'Report run not found')
  );
$$;

create or replace function public.be_reporting_recent_runs_v52(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'build', 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30',
    'runs', coalesce((
      select jsonb_agg(to_jsonb(r) - 'snapshot_payload' order by r.generated_at desc)
      from (
        select * from public.be_reporting_runs_v52
        where public.be_reporting_can_generate_v52()
        order by generated_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.be_reporting_actor_v52(text) from public, anon, authenticated;
revoke all on function public.be_reporting_role_v52() from public, anon, authenticated;
revoke all on function public.be_reporting_can_generate_v52() from public, anon, authenticated;
revoke all on function public.be_reporting_can_approve_v52() from public, anon, authenticated;
revoke all on function public.be_reporting_dataset_hash_v52(jsonb) from public, anon, authenticated;

revoke all on function public.be_reporting_certified_snapshot_v52(date,date,text,text,text,text,text,integer) from public, anon;
revoke all on function public.be_reporting_generate_v52(text,date,date,text,text,text,text,text,text) from public, anon;
revoke all on function public.be_reporting_revalidate_v52(uuid) from public, anon;
revoke all on function public.be_reporting_review_v52(uuid,text,text,text,text) from public, anon;
revoke all on function public.be_reporting_register_export_v52(uuid,text,text,text,integer,text,text) from public, anon;
revoke all on function public.be_reporting_run_status_v52(uuid) from public, anon;
revoke all on function public.be_reporting_recent_runs_v52(integer) from public, anon;

grant execute on function public.be_reporting_certified_snapshot_v52(date,date,text,text,text,text,text,integer) to authenticated;
grant execute on function public.be_reporting_generate_v52(text,date,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.be_reporting_revalidate_v52(uuid) to authenticated;
grant execute on function public.be_reporting_review_v52(uuid,text,text,text,text) to authenticated;
grant execute on function public.be_reporting_register_export_v52(uuid,text,text,text,integer,text,text) to authenticated;
grant execute on function public.be_reporting_run_status_v52(uuid) to authenticated;
grant execute on function public.be_reporting_recent_runs_v52(integer) to authenticated;

commit;

select jsonb_build_object(
  'certified_snapshot_rpc', to_regprocedure('public.be_reporting_certified_snapshot_v52(date,date,text,text,text,text,text,integer)')::text,
  'generate_report_rpc', to_regprocedure('public.be_reporting_generate_v52(text,date,date,text,text,text,text,text,text)')::text,
  'revalidate_report_rpc', to_regprocedure('public.be_reporting_revalidate_v52(uuid)')::text,
  'review_report_rpc', to_regprocedure('public.be_reporting_review_v52(uuid,text,text,text,text)')::text,
  'register_export_rpc', to_regprocedure('public.be_reporting_register_export_v52(uuid,text,text,text,integer,text,text)')::text,
  'run_status_rpc', to_regprocedure('public.be_reporting_run_status_v52(uuid)')::text,
  'recent_runs_rpc', to_regprocedure('public.be_reporting_recent_runs_v52(integer)')::text,
  'run_table', to_regclass('public.be_reporting_runs_v52')::text,
  'export_table', to_regclass('public.be_reporting_exports_v52')::text,
  'workflow', 'V50 CERTIFIED DATA -> FILTERED REPORT -> INDEPENDENT REVIEW -> CONTROLLED EXPORT',
  'build', 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30'
) as reporting_v52;
