-- Britium Operations V39
-- Optional warehouse receiving scan controlled by Super Admin,
-- mandatory dispatch scan, automatic RTO after 3 consecutive delivery failures,
-- and warehouse dwell warning alerts after 48 hours.
-- Run after Warehouse V36 and Data Entry / Waybill V33+.

begin;

create extension if not exists pgcrypto;

-- ================================================================
-- 1. Operational settings and audit
-- ================================================================
create table if not exists public.be_operational_settings_v39 (
  setting_key text primary key,
  bool_value boolean,
  numeric_value numeric,
  text_value text,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.be_operational_settings_v39(setting_key, bool_value, updated_by)
values ('warehouse_receiving_scan_required', false, 'V39_INSTALL')
on conflict (setting_key) do nothing;

insert into public.be_operational_settings_v39(setting_key, numeric_value, updated_by)
values
  ('warehouse_dwell_alert_hours', 48, 'V39_INSTALL'),
  ('delivery_failures_before_rto', 3, 'V39_INSTALL')
on conflict (setting_key) do nothing;

create table if not exists public.be_operational_setting_events_v39 (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  actor_email text,
  created_at timestamptz not null default now()
);

alter table public.be_operational_settings_v39 enable row level security;
alter table public.be_operational_setting_events_v39 enable row level security;
revoke all on public.be_operational_settings_v39 from anon, authenticated;
revoke all on public.be_operational_setting_events_v39 from anon, authenticated;

-- ================================================================
-- 2. Extend the V36 warehouse receipt ledger without replacing it
-- ================================================================
alter table public.be_warehouse_receipts_v36
  add column if not exists receipt_method text not null default 'SCAN',
  add column if not exists receiving_scan_skipped boolean not null default false,
  add column if not exists receiving_scan_skipped_at timestamptz,
  add column if not exists receiving_scan_skipped_by text,
  add column if not exists receiving_scan_skip_reason text,
  add column if not exists warehouse_entered_at timestamptz;

update public.be_warehouse_receipts_v36
set warehouse_entered_at = coalesce(warehouse_entered_at, scanned_at, ready_at, created_at)
where warehouse_status <> 'PENDING'
  and warehouse_entered_at is null;

insert into public.be_warehouse_exception_codes_v36(code, label, parcel_condition)
values
  ('DELIVERY_RTO', 'Return to Origin after 3 consecutive failed delivery attempts', 'RTO'),
  ('FAILED_RETURN', 'Failed delivery parcel returned to warehouse', 'FAILED_RETURN')
on conflict (code) do update
set label = excluded.label,
    parcel_condition = excluded.parcel_condition,
    active = true,
    updated_at = now();

-- ================================================================
-- 3. Dispatch scan, delivery-attempt and alert ledgers
-- ================================================================
create table if not exists public.be_dispatch_scans_v39 (
  delivery_way_id text primary key,
  pickup_id text,
  parcel_sequence integer,
  wayplan_code text,
  scan_status text not null default 'SCANNED',
  scanned_at timestamptz not null default now(),
  scanned_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint be_dispatch_scans_v39_status_check check (scan_status in ('SCANNED', 'REVERSED'))
);

create table if not exists public.be_dispatch_scan_events_v39 (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  pickup_id text,
  parcel_sequence integer,
  wayplan_code text,
  action text not null,
  actor_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_delivery_attempt_state_v39 (
  delivery_way_id text primary key,
  pickup_id text,
  consecutive_failures integer not null default 0,
  last_status text,
  last_failure_reason text,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  rto_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.be_delivery_attempt_events_v39 (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null unique,
  delivery_way_id text not null,
  pickup_id text,
  attempt_number integer not null,
  result_status text not null,
  reason text,
  actor_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_operational_alerts_v39 (
  alert_key text primary key,
  alert_type text not null,
  severity text not null default 'WARNING',
  pickup_id text,
  delivery_way_id text,
  title text not null,
  message text not null,
  target_role text not null default 'warehouse',
  alert_status text not null default 'OPEN',
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint be_operational_alerts_v39_status_check check (alert_status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'))
);

create index if not exists be_dispatch_scans_v39_pickup_idx
  on public.be_dispatch_scans_v39(pickup_id, scanned_at desc);
create index if not exists be_delivery_attempt_state_v39_status_idx
  on public.be_delivery_attempt_state_v39(last_status, consecutive_failures);
create index if not exists be_operational_alerts_v39_open_idx
  on public.be_operational_alerts_v39(alert_status, alert_type, last_detected_at desc);

alter table public.be_dispatch_scans_v39 enable row level security;
alter table public.be_dispatch_scan_events_v39 enable row level security;
alter table public.be_delivery_attempt_state_v39 enable row level security;
alter table public.be_delivery_attempt_events_v39 enable row level security;
alter table public.be_operational_alerts_v39 enable row level security;

revoke all on public.be_dispatch_scans_v39 from anon, authenticated;
revoke all on public.be_dispatch_scan_events_v39 from anon, authenticated;
revoke all on public.be_delivery_attempt_state_v39 from anon, authenticated;
revoke all on public.be_delivery_attempt_events_v39 from anon, authenticated;
revoke all on public.be_operational_alerts_v39 from anon, authenticated;

-- ================================================================
-- 4. Role and notification helpers
-- ================================================================
create or replace function public.be_is_super_admin_v39()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb := '{}'::jsonb;
  v_uid text := '';
  v_email text := '';
  v_role text := '';
begin
  -- SQL Editor / migration owner is allowed to administer the setting.
  if session_user = 'postgres' then
    return true;
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
    v_claims ->> 'role',
    ''
  );

  if regexp_replace(lower(v_role), '[^a-z0-9]+', '', 'g') in ('superadmin', 'systemadmin') then
    return true;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute $q$
        select coalesce(
          to_jsonb(p) ->> 'role',
          to_jsonb(p) ->> 'user_role',
          to_jsonb(p) ->> 'access_role',
          to_jsonb(p) ->> 'portal_role',
          ''
        )
        from public.profiles p
        where ($1 <> '' and (
          coalesce(to_jsonb(p) ->> 'id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'user_id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'auth_user_id', '') = $1
        ))
        or ($2 <> '' and lower(coalesce(to_jsonb(p) ->> 'email', '')) = $2)
        limit 1
      $q$ into v_role using v_uid, v_email;
    exception when others then
      v_role := coalesce(v_role, '');
    end;
  end if;

  return regexp_replace(lower(coalesce(v_role, '')), '[^a-z0-9]+', '', 'g') in ('superadmin', 'systemadmin');
end;
$$;

create or replace function public.be_emit_notification_v39(
  p_event_key text,
  p_notification_type text,
  p_target_role text,
  p_pickup_id text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required_columns integer := 0;
  v_updated integer := 0;
begin
  if to_regclass('public.be_app_notifications') is null then
    return false;
  end if;

  select count(*)::integer
  into v_required_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'be_app_notifications'
    and column_name in (
      'event_key', 'notification_type', 'category', 'target_role', 'pickup_id',
      'source_table', 'source_key', 'title', 'body', 'message', 'status',
      'is_read', 'payload', 'metadata', 'created_at'
    );

  if v_required_columns < 15 then
    return false;
  end if;

  execute $q$
    update public.be_app_notifications
    set notification_type = $2,
        category = $2,
        target_role = $3,
        pickup_id = $4,
        source_table = 'be_operational_alerts_v39',
        source_key = $1,
        title = $5,
        body = $6,
        message = $6,
        status = 'unread',
        is_read = false,
        payload = $7,
        metadata = $7,
        created_at = now()
    where event_key = $1
  $q$ using p_event_key, p_notification_type, p_target_role, p_pickup_id, p_title, p_message, coalesce(p_metadata, '{}'::jsonb);
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    execute $q$
      insert into public.be_app_notifications(
        event_key, notification_type, category, target_role, pickup_id,
        source_table, source_key, title, body, message, status, is_read,
        payload, metadata, created_at
      ) values (
        $1, $2, $2, $3, $4,
        'be_operational_alerts_v39', $1, $5, $6, $6, 'unread', false,
        $7, $7, now()
      )
    $q$ using p_event_key, p_notification_type, p_target_role, p_pickup_id, p_title, p_message, coalesce(p_metadata, '{}'::jsonb);
  end if;

  return true;
exception when others then
  return false;
end;
$$;

-- ================================================================
-- 5. Scan policy RPCs
-- ================================================================
create or replace function public.be_warehouse_scan_policy_v39()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_required boolean := false;
  v_hours numeric := 48;
  v_failures numeric := 3;
begin
  select coalesce(bool_value, false)
  into v_required
  from public.be_operational_settings_v39
  where setting_key = 'warehouse_receiving_scan_required';

  select coalesce(numeric_value, 48)
  into v_hours
  from public.be_operational_settings_v39
  where setting_key = 'warehouse_dwell_alert_hours';

  select coalesce(numeric_value, 3)
  into v_failures
  from public.be_operational_settings_v39
  where setting_key = 'delivery_failures_before_rto';

  return jsonb_build_object(
    'receiving_scan_required', coalesce(v_required, false),
    'receiving_scan_mode', case when coalesce(v_required, false) then 'REQUIRED' else 'OPTIONAL' end,
    'dispatch_scan_required', true,
    'failed_attempts_before_rto', greatest(1, coalesce(v_failures, 3))::integer,
    'warehouse_dwell_alert_hours', greatest(1, coalesce(v_hours, 48)),
    'can_manage_scan_policy', public.be_is_super_admin_v39()
  );
end;
$$;

create or replace function public.be_set_warehouse_scan_policy_v39(
  p_receiving_scan_required boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old boolean := false;
  v_email text := '';
  v_claims jsonb := '{}'::jsonb;
begin
  if not public.be_is_super_admin_v39() then
    raise exception 'Only Super Admin may change the warehouse receiving-scan policy';
  end if;

  begin
    v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  v_email := coalesce(v_claims ->> 'email', session_user, 'super-admin');

  select coalesce(bool_value, false)
  into v_old
  from public.be_operational_settings_v39
  where setting_key = 'warehouse_receiving_scan_required'
  for update;

  update public.be_operational_settings_v39
  set bool_value = coalesce(p_receiving_scan_required, false),
      updated_by = v_email,
      updated_at = now()
  where setting_key = 'warehouse_receiving_scan_required';

  insert into public.be_operational_setting_events_v39(
    setting_key, old_value, new_value, reason, actor_email
  ) values (
    'warehouse_receiving_scan_required',
    jsonb_build_object('required', v_old),
    jsonb_build_object('required', coalesce(p_receiving_scan_required, false)),
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_email
  );

  return public.be_warehouse_scan_policy_v39();
end;
$$;

-- ================================================================
-- 6. Enriched warehouse views and dwell alerts
-- ================================================================
create or replace view public.be_v_warehouse_receipt_v39 as
select
  v.*,
  case
    when r.pickup_id is null then 'NOT_PROCESSED'
    when coalesce(r.receiving_scan_skipped, false) then 'SCAN_SKIPPED'
    else coalesce(r.receipt_method, 'SCAN')
  end as receipt_method,
  coalesce(r.receiving_scan_skipped, false) as receiving_scan_skipped,
  r.receiving_scan_skipped_at,
  r.receiving_scan_skipped_by,
  r.receiving_scan_skip_reason,
  coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at) as warehouse_entered_at,
  round((extract(epoch from (now() - coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at))) / 3600.0)::numeric, 1) as dwell_hours,
  (
    v.warehouse_status in ('RECEIVED', 'WAREHOUSE_READY')
    and coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at) is not null
    and coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at)
      <= now() - make_interval(hours => greatest(1, coalesce((
        select numeric_value::integer
        from public.be_operational_settings_v39
        where setting_key = 'warehouse_dwell_alert_hours'
      ), 48)))
    and not exists (
      select 1
      from public.be_dispatch_scans_v39 ds
      where ds.delivery_way_id = v.delivery_way_id
        and ds.scan_status = 'SCANNED'
    )
  ) as dwell_alert,
  coalesce(ds.scan_status = 'SCANNED', false) as dispatch_scanned,
  ds.scanned_at as dispatch_scanned_at,
  ds.scanned_by as dispatch_scanned_by,
  coalesce(a.consecutive_failures, 0) as consecutive_delivery_failures,
  a.last_status as delivery_attempt_status,
  a.rto_at
from public.be_v_warehouse_receipt_v36 v
left join public.be_warehouse_receipts_v36 r
  on r.pickup_id = v.pickup_id
 and r.parcel_sequence = v.parcel_sequence
left join public.be_dispatch_scans_v39 ds
  on ds.delivery_way_id = v.delivery_way_id
left join public.be_delivery_attempt_state_v39 a
  on a.delivery_way_id = v.delivery_way_id;

grant select on public.be_v_warehouse_receipt_v39 to authenticated;

create or replace view public.be_v_warehouse_lifecycle_v39 as
select
  v.delivery_way_id as waybill_no,
  v.delivery_way_id,
  v.pickup_id,
  v.batch_waybill_no,
  v.merchant_name,
  v.recipient_name,
  v.recipient_phone,
  v.township as delivery_township,
  v.recipient_address,
  v.actual_collect as cod_amount,
  v.declared_weight_kg as weight_kg,
  case
    when v.delivery_attempt_status = 'RTO' then 'RETURN_TO_SENDER'
    when v.delivery_attempt_status = 'ATTEMPTED_FAILED' then 'DELIVERY_FAILED'
    when v.warehouse_status = 'WAREHOUSE_EXCEPTION' then 'WAREHOUSE_EXCEPTION'
    when v.warehouse_status = 'WAREHOUSE_READY' then 'READY_FOR_DELIVERY'
    when v.warehouse_status = 'RECEIVED' then 'WAREHOUSE_RECEIVED'
    else 'SUBMITTED'
  end as item_status,
  v.consecutive_delivery_failures as delivery_attempts,
  v.receipt_method,
  v.receiving_scan_skipped,
  v.warehouse_entered_at,
  v.dwell_hours,
  v.dwell_alert,
  v.dispatch_scanned,
  v.dispatch_scanned_at,
  v.updated_at,
  coalesce(v.warehouse_entered_at, v.updated_at, now()) as created_at
from public.be_v_warehouse_receipt_v39 v;

grant select on public.be_v_warehouse_lifecycle_v39 to authenticated;

create or replace function public.be_refresh_warehouse_dwell_alerts_v39()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open integer := 0;
  v_resolved integer := 0;
  v_inserted integer := 0;
  v_hours numeric := 48;
  r record;
begin
  select greatest(1, coalesce(numeric_value, 48))
  into v_hours
  from public.be_operational_settings_v39
  where setting_key = 'warehouse_dwell_alert_hours';

  update public.be_operational_alerts_v39 a
  set last_detected_at = now(),
      alert_status = 'OPEN',
      resolved_at = null,
      title = 'Warehouse dwell time exceeded',
      message = format('Parcel %s has remained in warehouse for %s hours.', v.delivery_way_id, v.dwell_hours),
      metadata = jsonb_build_object(
        'pickup_id', v.pickup_id,
        'way_id', v.delivery_way_id,
        'dwell_hours', v.dwell_hours,
        'threshold_hours', v_hours,
        'warehouse_status', v.warehouse_status,
        'staging_zone', v.staging_zone
      )
  from public.be_v_warehouse_receipt_v39 v
  where a.alert_key = 'WAREHOUSE_DWELL:' || v.delivery_way_id
    and v.dwell_alert;

  insert into public.be_operational_alerts_v39(
    alert_key, alert_type, severity, pickup_id, delivery_way_id,
    title, message, target_role, alert_status, metadata
  )
  select
    'WAREHOUSE_DWELL:' || v.delivery_way_id,
    'WAREHOUSE_DWELL_OVER_LIMIT',
    'WARNING',
    v.pickup_id,
    v.delivery_way_id,
    'Warehouse dwell time exceeded',
    format('Parcel %s has remained in warehouse for %s hours.', v.delivery_way_id, v.dwell_hours),
    'warehouse',
    'OPEN',
    jsonb_build_object(
      'pickup_id', v.pickup_id,
      'way_id', v.delivery_way_id,
      'dwell_hours', v.dwell_hours,
      'threshold_hours', v_hours,
      'warehouse_status', v.warehouse_status,
      'staging_zone', v.staging_zone
    )
  from public.be_v_warehouse_receipt_v39 v
  where v.dwell_alert
    and not exists (
      select 1 from public.be_operational_alerts_v39 a
      where a.alert_key = 'WAREHOUSE_DWELL:' || v.delivery_way_id
    );
  get diagnostics v_inserted = row_count;

  update public.be_operational_alerts_v39 a
  set alert_status = 'RESOLVED',
      resolved_at = now(),
      last_detected_at = now()
  where a.alert_type = 'WAREHOUSE_DWELL_OVER_LIMIT'
    and a.alert_status <> 'RESOLVED'
    and not exists (
      select 1
      from public.be_v_warehouse_receipt_v39 v
      where v.delivery_way_id = a.delivery_way_id
        and v.dwell_alert
    );
  get diagnostics v_resolved = row_count;

  select count(*)::integer
  into v_open
  from public.be_operational_alerts_v39
  where alert_type = 'WAREHOUSE_DWELL_OVER_LIMIT'
    and alert_status = 'OPEN';

  for r in
    select *
    from public.be_operational_alerts_v39
    where alert_type = 'WAREHOUSE_DWELL_OVER_LIMIT'
      and alert_status = 'OPEN'
  loop
    perform public.be_emit_notification_v39(
      r.alert_key,
      'warehouse_dwell_warning',
      'warehouse',
      r.pickup_id,
      r.title,
      r.message,
      r.metadata
    );
    perform public.be_emit_notification_v39(
      r.alert_key || ':operation_supervisor',
      'warehouse_dwell_warning',
      'operation_supervisor',
      r.pickup_id,
      r.title,
      r.message,
      r.metadata
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'threshold_hours', v_hours,
    'new_alerts', v_inserted,
    'open_alerts', v_open,
    'resolved_alerts', v_resolved
  );
end;
$$;

create or replace function public.be_warehouse_dwell_scheduler_status_v39()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    return jsonb_build_object(
      'scheduler_available', false,
      'scheduled', false,
      'mode', 'ON_SCREEN_REFRESH',
      'message', 'pg_cron is not enabled; alerts still refresh whenever Warehouse or Warehouse Ops is opened'
    );
  end if;

  begin
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobid', jobid,
        'jobname', jobname,
        'schedule', schedule,
        'active', active
      ) order by jobid desc), '[]'::jsonb)
      from cron.job
      where jobname = 'be-v39-warehouse-dwell-alerts'
    $q$ into v_jobs;
  exception when others then
    return jsonb_build_object(
      'scheduler_available', true,
      'scheduled', false,
      'mode', 'ON_SCREEN_REFRESH',
      'message', sqlerrm
    );
  end;

  return jsonb_build_object(
    'scheduler_available', true,
    'scheduled', jsonb_array_length(v_jobs) > 0,
    'mode', case when jsonb_array_length(v_jobs) > 0 then 'HOURLY_DATABASE_JOB' else 'ON_SCREEN_REFRESH' end,
    'jobs', v_jobs
  );
end;
$$;

-- Schedule an hourly database-side dwell check when pg_cron is available.
-- This block is deliberately non-fatal: deployments without pg_cron continue
-- to refresh alerts whenever Warehouse or Warehouse Ops loads.
do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      execute 'select jobid from cron.job where jobname = $1 limit 1'
      into v_job_id
      using 'be-v39-warehouse-dwell-alerts';

      if v_job_id is null then
        execute 'select cron.schedule($1,$2,$3)'
        into v_job_id
        using
          'be-v39-warehouse-dwell-alerts',
          '15 * * * *',
          'select public.be_refresh_warehouse_dwell_alerts_v39();';
      end if;
    exception when others then
      raise notice 'V39 dwell scheduler was not installed; screen-refresh alert mode remains active: %', sqlerrm;
    end;
  end if;
end;
$$;


create or replace function public.be_warehouse_receipt_snapshot_v39(
  p_pickup_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb := '{}'::jsonb;
  v_pickup_id text;
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
begin
  perform public.be_refresh_warehouse_dwell_alerts_v39();
  v_base := public.be_warehouse_receipt_snapshot_v36(p_pickup_id);
  v_pickup_id := nullif(v_base ->> 'selected_pickup_id', '');

  if v_pickup_id is not null then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.parcel_sequence), '[]'::jsonb)
    into v_rows
    from public.be_v_warehouse_receipt_v39 v
    where v.pickup_id = v_pickup_id;

    select jsonb_build_object(
      'expected', count(*)::integer,
      'scanned', count(*) filter (where v.warehouse_status <> 'PENDING' and not v.receiving_scan_skipped)::integer,
      'scan_skipped', count(*) filter (where v.receiving_scan_skipped)::integer,
      'processed', count(*) filter (where v.warehouse_status <> 'PENDING')::integer,
      'ready', count(*) filter (where v.warehouse_status = 'WAREHOUSE_READY')::integer,
      'exceptions', count(*) filter (where v.warehouse_status = 'WAREHOUSE_EXCEPTION')::integer,
      'remaining', count(*) filter (where v.warehouse_status = 'PENDING')::integer,
      'label_qa_passed', count(*) filter (where v.label_scan_passed)::integer,
      'label_qa_pending', count(*) filter (where v.warehouse_status <> 'PENDING' and not v.label_scan_passed)::integer,
      'dispatch_scanned', count(*) filter (where v.dispatch_scanned)::integer,
      'dwell_alerts', count(*) filter (where v.dwell_alert)::integer,
      'total_collect', coalesce(sum(v.actual_collect), 0)
    )
    into v_stats
    from public.be_v_warehouse_receipt_v39 v
    where v.pickup_id = v_pickup_id;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.last_detected_at desc), '[]'::jsonb)
    into v_alerts
    from public.be_operational_alerts_v39 a
    where a.pickup_id = v_pickup_id
      and a.alert_status = 'OPEN';
  end if;

  return v_base || jsonb_build_object(
    'build', 'WAREHOUSE_DISPATCH_V39_OPTIONAL_RECEIVING_SCAN_RTO_ALERTS_2026-07-30',
    'rows', v_rows,
    'stats', v_stats,
    'policy', public.be_warehouse_scan_policy_v39(),
    'alert_scheduler', public.be_warehouse_dwell_scheduler_status_v39(),
    'alerts', v_alerts
  );
end;
$$;

-- ================================================================
-- 7. Warehouse receiving: scanned or policy-authorized skip
-- ================================================================
create or replace function public.be_warehouse_receive_scan_v39(
  p_pickup_id text,
  p_way_id text,
  p_action text default 'RECEIVE',
  p_condition text default 'GOOD',
  p_exception_code text default null,
  p_remark text default null,
  p_actual_weight_kg numeric default null,
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.be_warehouse_receive_scan_v36(
    p_pickup_id, p_way_id, p_action, p_condition, p_exception_code,
    p_remark, p_actual_weight_kg, p_warehouse_code, p_staging_zone, p_actor_email
  );

  update public.be_warehouse_receipts_v36
  set receipt_method = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then 'SCAN'
        else receipt_method
      end,
      receiving_scan_skipped = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then false
        else receiving_scan_skipped
      end,
      receiving_scan_skipped_at = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skipped_at
      end,
      receiving_scan_skipped_by = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skipped_by
      end,
      receiving_scan_skip_reason = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then null
        else receiving_scan_skip_reason
      end,
      warehouse_entered_at = case
        when upper(coalesce(p_action, 'RECEIVE')) in ('RECEIVE', 'READY', 'LABEL_PASS', 'LABEL_FAIL') then coalesce(warehouse_entered_at, scanned_at, now())
        else warehouse_entered_at
      end,
      updated_at = now()
  where pickup_id = p_pickup_id
    and delivery_way_id = p_way_id;

  return v_result || jsonb_build_object('receipt_method', 'SCAN', 'receiving_scan_skipped', false);
end;
$$;

create or replace function public.be_warehouse_receive_batch_v39(
  p_pickup_id text,
  p_way_ids text[],
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default 'INTAKE',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text;
  v_accepted integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    raise exception 'At least one Way ID is required';
  end if;

  foreach v_way_id in array p_way_ids loop
    begin
      v_results := v_results || jsonb_build_array(
        public.be_warehouse_receive_scan_v39(
          p_pickup_id, v_way_id, 'RECEIVE', 'GOOD', null, null, null,
          p_warehouse_code, p_staging_zone, p_actor_email
        )
      );
      v_accepted := v_accepted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false, 'way_id', v_way_id, 'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'accepted', v_accepted,
    'failed', v_failed,
    'results', v_results
  );
end;
$$;

create or replace function public.be_warehouse_skip_receiving_scan_v39(
  p_pickup_id text,
  p_reason text,
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default 'READY_FOR_DISPATCH',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required boolean := false;
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_count integer := 0;
  v_inserted integer := 0;
  v_exception_count integer := 0;
begin
  if nullif(btrim(coalesce(p_pickup_id, '')), '') is null then
    raise exception 'pickup_id is required';
  end if;
  if v_reason is null then
    raise exception 'A reason is required when receiving scan is skipped';
  end if;

  select coalesce(bool_value, false)
  into v_required
  from public.be_operational_settings_v39
  where setting_key = 'warehouse_receiving_scan_required';

  if v_required then
    raise exception 'Receiving scan is currently REQUIRED by Super Admin policy';
  end if;

  insert into public.be_warehouse_receipts_v36(
    pickup_id, parcel_sequence, delivery_way_id, warehouse_status,
    parcel_condition, warehouse_code, staging_zone, declared_weight_kg,
    receipt_method, receiving_scan_skipped, receiving_scan_skipped_at,
    receiving_scan_skipped_by, receiving_scan_skip_reason,
    warehouse_entered_at, ready_at, ready_by, created_at, updated_at
  )
  select
    d.pickup_id, d.parcel_sequence, d.delivery_way_id, 'WAREHOUSE_READY',
    'DATA_ENTRY_GROUND_CHECK', coalesce(nullif(p_warehouse_code, ''), 'YGN-MAIN'),
    coalesce(nullif(p_staging_zone, ''), 'READY_FOR_DISPATCH'), coalesce(d.weight_kg, 0),
    'SCAN_SKIPPED', true, now(), v_actor, v_reason,
    now(), now(), v_actor, now(), now()
  from public.be_data_entry_parcel_details d
  where d.pickup_id = p_pickup_id
    and not exists (
      select 1
      from public.be_warehouse_receipts_v36 r
      where r.pickup_id = d.pickup_id
        and r.parcel_sequence = d.parcel_sequence
    );
  get diagnostics v_inserted = row_count;

  insert into public.be_warehouse_receipt_events_v36(
    pickup_id, parcel_sequence, delivery_way_id, action,
    previous_status, new_status, remark, warehouse_code, staging_zone, actor_email
  )
  select
    r.pickup_id, r.parcel_sequence, r.delivery_way_id, 'SKIP_RECEIVING_SCAN',
    r.warehouse_status, 'WAREHOUSE_READY', v_reason,
    coalesce(nullif(p_warehouse_code, ''), r.warehouse_code, 'YGN-MAIN'),
    coalesce(nullif(p_staging_zone, ''), r.staging_zone, 'READY_FOR_DISPATCH'),
    v_actor
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id = p_pickup_id
    and r.warehouse_status in ('PENDING', 'RECEIVED');

  update public.be_warehouse_receipts_v36
  set warehouse_status = 'WAREHOUSE_READY',
      parcel_condition = case when parcel_condition in ('UNINSPECTED', '') then 'DATA_ENTRY_GROUND_CHECK' else parcel_condition end,
      discrepancy_code = null,
      discrepancy_remark = null,
      warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
      staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'READY_FOR_DISPATCH'),
      receipt_method = 'SCAN_SKIPPED',
      receiving_scan_skipped = true,
      receiving_scan_skipped_at = now(),
      receiving_scan_skipped_by = v_actor,
      receiving_scan_skip_reason = v_reason,
      warehouse_entered_at = coalesce(warehouse_entered_at, now()),
      ready_at = now(),
      ready_by = v_actor,
      updated_at = now()
  where pickup_id = p_pickup_id
    and warehouse_status in ('PENDING', 'RECEIVED');
  get diagnostics v_count = row_count;
  v_count := v_count + v_inserted;

  select count(*)::integer
  into v_exception_count
  from public.be_warehouse_receipts_v36
  where pickup_id = p_pickup_id
    and warehouse_status = 'WAREHOUSE_EXCEPTION';

  perform public.be_emit_notification_v39(
    'WAREHOUSE_SCAN_SKIPPED:' || p_pickup_id,
    'warehouse_receiving_scan_skipped',
    'operation_supervisor',
    p_pickup_id,
    'Warehouse receiving scan skipped',
    format('Receiving scan was skipped for pickup %s under optional-scan policy. %s parcel(s) are ready for mandatory dispatch scanning.', p_pickup_id, v_count),
    jsonb_build_object('pickup_id', p_pickup_id, 'skipped_count', v_count, 'reason', v_reason, 'actor', v_actor)
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'receiving_scan_skipped', true,
    'ready_count', v_count,
    'exceptions_left_on_hold', v_exception_count,
    'dispatch_scan_required', true,
    'reason', v_reason
  );
end;
$$;

-- ================================================================
-- 8. Mandatory dispatch scan and guarded publish
-- ================================================================
create or replace function public.be_dispatch_scan_parcel_v39(
  p_way_id text,
  p_wayplan_code text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_pickup_id text;
  v_sequence integer;
  v_status text;
  v_exception text;
  v_updated integer := 0;
begin
  if v_way_id is null then
    raise exception 'Parcel Way ID is required for dispatch scan';
  end if;

  select d.pickup_id, d.parcel_sequence
  into v_pickup_id, v_sequence
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then
    raise exception 'Way ID % was not found in canonical Data Entry rows', v_way_id;
  end if;

  select r.warehouse_status, r.discrepancy_code
  into v_status, v_exception
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id = v_pickup_id
    and r.parcel_sequence = v_sequence;

  if coalesce(v_status, 'PENDING') <> 'WAREHOUSE_READY' then
    raise exception 'Way ID % is not WAREHOUSE_READY. Complete or policy-skip receiving first.', v_way_id;
  end if;
  if v_exception is not null then
    raise exception 'Way ID % remains on warehouse hold: %', v_way_id, v_exception;
  end if;
  if exists (
    select 1 from public.be_delivery_attempt_state_v39 a
    where a.delivery_way_id = v_way_id and a.last_status = 'RTO'
  ) then
    raise exception 'Way ID % is RTO and cannot be released to dispatch', v_way_id;
  end if;

  update public.be_dispatch_scans_v39
  set pickup_id = v_pickup_id,
      parcel_sequence = v_sequence,
      wayplan_code = nullif(btrim(coalesce(p_wayplan_code, '')), ''),
      scan_status = 'SCANNED',
      scanned_at = now(),
      scanned_by = v_actor,
      updated_at = now()
  where delivery_way_id = v_way_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.be_dispatch_scans_v39(
      delivery_way_id, pickup_id, parcel_sequence, wayplan_code,
      scan_status, scanned_at, scanned_by, created_at, updated_at
    ) values (
      v_way_id, v_pickup_id, v_sequence, nullif(btrim(coalesce(p_wayplan_code, '')), ''),
      'SCANNED', now(), v_actor, now(), now()
    );
  end if;

  insert into public.be_dispatch_scan_events_v39(
    delivery_way_id, pickup_id, parcel_sequence, wayplan_code, action, actor_email
  ) values (
    v_way_id, v_pickup_id, v_sequence, nullif(btrim(coalesce(p_wayplan_code, '')), ''), 'DISPATCH_SCAN', v_actor
  );

  update public.be_operational_alerts_v39
  set alert_status = 'RESOLVED', resolved_at = now(), last_detected_at = now()
  where alert_key = 'WAREHOUSE_DWELL:' || v_way_id
    and alert_status <> 'RESOLVED';

  return jsonb_build_object(
    'ok', true,
    'way_id', v_way_id,
    'pickup_id', v_pickup_id,
    'parcel_sequence', v_sequence,
    'wayplan_code', nullif(btrim(coalesce(p_wayplan_code, '')), ''),
    'dispatch_scanned', true,
    'scanned_at', now(),
    'scanned_by', v_actor
  );
end;
$$;

create or replace function public.be_dispatch_scan_snapshot_v39(
  p_way_ids text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_scanned integer := 0;
begin
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'way_id', s.delivery_way_id,
        'scanned', s.scan_status = 'SCANNED',
        'scanned_at', s.scanned_at,
        'scanned_by', s.scanned_by,
        'wayplan_code', s.wayplan_code
      ) order by s.scanned_at desc), '[]'::jsonb),
      count(*)::integer,
      count(*) filter (where s.scan_status = 'SCANNED')::integer
    into v_rows, v_total, v_scanned
    from public.be_dispatch_scans_v39 s;
  else
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'way_id', x.way_id,
        'scanned', coalesce(s.scan_status = 'SCANNED', false),
        'scanned_at', s.scanned_at,
        'scanned_by', s.scanned_by,
        'wayplan_code', s.wayplan_code
      ) order by x.ordinality), '[]'::jsonb),
      count(*)::integer,
      count(*) filter (where s.scan_status = 'SCANNED')::integer
    into v_rows, v_total, v_scanned
    from unnest(p_way_ids) with ordinality as x(way_id, ordinality)
    left join public.be_dispatch_scans_v39 s
      on s.delivery_way_id = x.way_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'dispatch_scan_required', true,
    'total', coalesce(v_total, 0),
    'scanned', coalesce(v_scanned, 0),
    'remaining', greatest(coalesce(v_total, 0) - coalesce(v_scanned, 0), 0),
    'rows', v_rows
  );
end;
$$;

create or replace function public.be_dispatch_validate_release_v39(
  p_way_ids text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_missing_scan text[] := '{}'::text[];
  v_not_ready text[] := '{}'::text[];
  v_rto text[] := '{}'::text[];
  v_total integer := 0;
begin
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'No parcel rows were supplied for dispatch release',
      'total', 0,
      'missing_dispatch_scan', '[]'::jsonb,
      'not_warehouse_ready', '[]'::jsonb,
      'rto_rows', '[]'::jsonb
    );
  end if;

  select count(*)::integer
  into v_total
  from (select distinct nullif(btrim(x), '') as way_id from unnest(p_way_ids) x) q
  where q.way_id is not null;

  select coalesce(array_agg(q.way_id order by q.way_id), '{}'::text[])
  into v_missing_scan
  from (
    select distinct nullif(btrim(x), '') as way_id from unnest(p_way_ids) x
  ) q
  where q.way_id is not null
    and not exists (
      select 1 from public.be_dispatch_scans_v39 s
      where s.delivery_way_id = q.way_id and s.scan_status = 'SCANNED'
    );

  select coalesce(array_agg(q.way_id order by q.way_id), '{}'::text[])
  into v_not_ready
  from (
    select distinct nullif(btrim(x), '') as way_id from unnest(p_way_ids) x
  ) q
  where q.way_id is not null
    and not exists (
      select 1 from public.be_warehouse_receipts_v36 r
      where r.delivery_way_id = q.way_id
        and r.warehouse_status = 'WAREHOUSE_READY'
        and r.discrepancy_code is null
    );

  select coalesce(array_agg(q.way_id order by q.way_id), '{}'::text[])
  into v_rto
  from (
    select distinct nullif(btrim(x), '') as way_id from unnest(p_way_ids) x
  ) q
  where q.way_id is not null
    and exists (
      select 1 from public.be_delivery_attempt_state_v39 a
      where a.delivery_way_id = q.way_id and a.last_status = 'RTO'
    );

  return jsonb_build_object(
    'ok', cardinality(v_missing_scan) = 0 and cardinality(v_not_ready) = 0 and cardinality(v_rto) = 0,
    'total', v_total,
    'dispatch_scanned', greatest(v_total - cardinality(v_missing_scan), 0),
    'missing_dispatch_scan_count', cardinality(v_missing_scan),
    'not_warehouse_ready_count', cardinality(v_not_ready),
    'rto_count', cardinality(v_rto),
    'missing_dispatch_scan', to_jsonb(v_missing_scan[1:20]),
    'not_warehouse_ready', to_jsonb(v_not_ready[1:20]),
    'rto_rows', to_jsonb(v_rto[1:20]),
    'message', case
      when cardinality(v_missing_scan) > 0 then format('%s parcel(s) still require dispatch scanning', cardinality(v_missing_scan))
      when cardinality(v_not_ready) > 0 then format('%s parcel(s) are not Warehouse Ready', cardinality(v_not_ready))
      when cardinality(v_rto) > 0 then format('%s RTO parcel(s) cannot be dispatched', cardinality(v_rto))
      else 'Dispatch release validation passed'
    end
  );
end;
$$;

create or replace function public.be_publish_wayplan_with_dispatch_scan_v39(
  p_wayplan_code text,
  p_way_ids text[],
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
begin
  v_check := public.be_dispatch_validate_release_v39(p_way_ids);
  if not coalesce((v_check ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(v_check ->> 'message', 'Dispatch scan validation failed');
  end if;

  if to_regprocedure('public.be_publish_wayplan_to_dispatch(text,text)') is null then
    raise exception 'Legacy publish RPC be_publish_wayplan_to_dispatch(text,text) is not installed';
  end if;

  execute 'select public.be_publish_wayplan_to_dispatch($1,$2)'
  using p_wayplan_code, p_actor_email;

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'published_rows', coalesce(array_length(p_way_ids, 1), 0),
    'dispatch_scan_validation', v_check
  );
end;
$$;

create or replace function public.be_publish_all_wayplans_with_dispatch_scan_v39(
  p_way_ids text[],
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
begin
  v_check := public.be_dispatch_validate_release_v39(p_way_ids);
  if not coalesce((v_check ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(v_check ->> 'message', 'Dispatch scan validation failed');
  end if;

  if to_regprocedure('public.be_publish_all_wayplans_to_dispatch(text)') is null then
    raise exception 'Legacy publish-all RPC be_publish_all_wayplans_to_dispatch(text) is not installed';
  end if;

  execute 'select public.be_publish_all_wayplans_to_dispatch($1)'
  using p_actor_email;

  return jsonb_build_object(
    'ok', true,
    'published_rows', coalesce(array_length(p_way_ids, 1), 0),
    'dispatch_scan_validation', v_check
  );
end;
$$;

-- ================================================================
-- 9. Consecutive delivery failures, automatic RTO and return scan
-- ================================================================
create or replace function public.be_record_delivery_failure_v39(
  p_way_id text,
  p_reason text,
  p_actor_email text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Delivery attempt failed');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_operation text;
  v_pickup_id text;
  v_attempt integer := 0;
  v_limit integer := 3;
  v_status text;
  v_legacy_ok boolean := false;
  v_legacy_message text := null;
  v_updated integer := 0;
begin
  if v_way_id is null then
    raise exception 'Way ID is required';
  end if;

  select d.pickup_id
  into v_pickup_id
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then
    raise exception 'Way ID % was not found', v_way_id;
  end if;

  select greatest(1, coalesce(numeric_value, 3))::integer
  into v_limit
  from public.be_operational_settings_v39
  where setting_key = 'delivery_failures_before_rto';

  v_operation := coalesce(
    nullif(btrim(coalesce(p_operation_id, '')), ''),
    encode(digest(v_way_id || '|' || v_actor || '|' || v_reason || '|' || date_trunc('minute', now())::text, 'sha256'), 'hex')
  );

  if exists (
    select 1 from public.be_delivery_attempt_events_v39 e
    where e.operation_id = v_operation
  ) then
    select consecutive_failures, last_status
    into v_attempt, v_status
    from public.be_delivery_attempt_state_v39
    where delivery_way_id = v_way_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate_operation', true,
      'operation_id', v_operation,
      'way_id', v_way_id,
      'attempt_count', coalesce(v_attempt, 0),
      'status', coalesce(v_status, 'ATTEMPTED_FAILED'),
      'rto', coalesce(v_status, '') = 'RTO'
    );
  end if;

  insert into public.be_delivery_attempt_state_v39(
    delivery_way_id, pickup_id, consecutive_failures, last_status,
    last_failure_reason, last_failure_at, updated_at
  ) values (
    v_way_id, v_pickup_id, 0, 'PENDING', v_reason, now(), now()
  ) on conflict (delivery_way_id) do nothing;

  select consecutive_failures
  into v_attempt
  from public.be_delivery_attempt_state_v39
  where delivery_way_id = v_way_id
  for update;

  v_attempt := coalesce(v_attempt, 0) + 1;
  v_status := case when v_attempt >= v_limit then 'RTO' else 'ATTEMPTED_FAILED' end;

  update public.be_delivery_attempt_state_v39
  set pickup_id = v_pickup_id,
      consecutive_failures = v_attempt,
      last_status = v_status,
      last_failure_reason = v_reason,
      last_failure_at = now(),
      rto_at = case when v_status = 'RTO' then coalesce(rto_at, now()) else null end,
      updated_at = now()
  where delivery_way_id = v_way_id;

  insert into public.be_delivery_attempt_events_v39(
    operation_id, delivery_way_id, pickup_id, attempt_number,
    result_status, reason, actor_email
  ) values (
    v_operation, v_way_id, v_pickup_id, v_attempt,
    v_status, v_reason, v_actor
  );

  if to_regprocedure('public.be_driver_update_delivery_status(text,text,text,text)') is not null then
    begin
      execute 'select public.be_driver_update_delivery_status($1,$2,$3,$4)'
      using v_way_id, v_status, v_actor, v_reason;
      v_legacy_ok := true;
    exception when others then
      v_legacy_message := sqlerrm;
    end;
  else
    v_legacy_message := 'Legacy status RPC is not installed';
  end if;

  if to_regclass('public.be_portal_pickup_request_items') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'waybill_no'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'item_status'
     ) then
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'be_portal_pickup_request_items' and column_name = 'delivery_attempts'
      ) then
        execute 'update public.be_portal_pickup_request_items set item_status = $1, delivery_attempts = $2 where waybill_no = $3'
        using case when v_status = 'RTO' then 'RETURN_TO_SENDER' else 'DELIVERY_FAILED' end, v_attempt, v_way_id;
      else
        execute 'update public.be_portal_pickup_request_items set item_status = $1 where waybill_no = $2'
        using case when v_status = 'RTO' then 'RETURN_TO_SENDER' else 'DELIVERY_FAILED' end, v_way_id;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Every failed delivery returns to a controlled warehouse state. A fresh
  -- dispatch scan is therefore mandatory before any later delivery attempt.
  update public.be_dispatch_scans_v39
  set scan_status = 'REVERSED', updated_at = now()
  where delivery_way_id = v_way_id;

  insert into public.be_dispatch_scan_events_v39(
    delivery_way_id, pickup_id, wayplan_code, action, actor_email
  ) values (
    v_way_id, v_pickup_id, null, 'DELIVERY_FAILURE_REQUIRES_RESCAN', v_actor
  );

  if v_status = 'RTO' then
    insert into public.be_operational_alerts_v39(
      alert_key, alert_type, severity, pickup_id, delivery_way_id,
      title, message, target_role, alert_status, metadata
    ) values (
      'DELIVERY_RTO:' || v_way_id,
      'DELIVERY_RTO',
      'HIGH',
      v_pickup_id,
      v_way_id,
      'Parcel moved to RTO',
      format('Parcel %s reached %s consecutive failed delivery attempts and is now RTO.', v_way_id, v_attempt),
      'operation_supervisor',
      'OPEN',
      jsonb_build_object('way_id', v_way_id, 'pickup_id', v_pickup_id, 'attempt_count', v_attempt, 'reason', v_reason)
    ) on conflict (alert_key) do update
    set alert_status = 'OPEN',
        message = excluded.message,
        last_detected_at = now(),
        resolved_at = null,
        metadata = excluded.metadata;

    perform public.be_emit_notification_v39(
      'DELIVERY_RTO:' || v_way_id,
      'delivery_rto',
      'operation_supervisor',
      v_pickup_id,
      'Parcel moved to RTO',
      format('Parcel %s reached %s consecutive failed delivery attempts and is now RTO.', v_way_id, v_attempt),
      jsonb_build_object('way_id', v_way_id, 'pickup_id', v_pickup_id, 'attempt_count', v_attempt, 'reason', v_reason)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation,
    'way_id', v_way_id,
    'pickup_id', v_pickup_id,
    'attempt_count', v_attempt,
    'attempt_limit', v_limit,
    'status', v_status,
    'rto', v_status = 'RTO',
    'return_scan_required', true,
    'legacy_status_updated', v_legacy_ok,
    'legacy_message', v_legacy_message
  );
end;
$$;

create or replace function public.be_record_delivery_success_v39(
  p_way_id text,
  p_actor_email text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
begin
  if v_way_id is null then raise exception 'Way ID is required'; end if;

  insert into public.be_delivery_attempt_state_v39(
    delivery_way_id, consecutive_failures, last_status, last_success_at, updated_at
  ) values (
    v_way_id, 0, 'DELIVERED', now(), now()
  ) on conflict (delivery_way_id) do update
  set consecutive_failures = 0,
      last_status = 'DELIVERED',
      last_success_at = now(),
      last_failure_reason = null,
      rto_at = null,
      updated_at = now();

  update public.be_operational_alerts_v39
  set alert_status = 'RESOLVED', resolved_at = now(), last_detected_at = now()
  where delivery_way_id = v_way_id
    and alert_type in ('DELIVERY_RTO', 'WAREHOUSE_DWELL_OVER_LIMIT')
    and alert_status <> 'RESOLVED';

  return jsonb_build_object(
    'ok', true,
    'way_id', v_way_id,
    'status', 'DELIVERED',
    'consecutive_failures', 0,
    'actor', v_actor,
    'operation_id', p_operation_id
  );
end;
$$;

create or replace function public.be_dispatch_update_delivery_status_v39(
  p_way_id text,
  p_status text,
  p_actor_email text default null,
  p_note text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(nullif(btrim(coalesce(p_status, '')), ''));
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
begin
  if v_way_id is null then raise exception 'Way ID is required'; end if;

  if v_status in ('ATTEMPTED_FAILED', 'DELIVERY_FAILED', 'FAILED') then
    return public.be_record_delivery_failure_v39(v_way_id, p_note, v_actor, p_operation_id);
  end if;

  if v_status = 'RTO' then
    if not public.be_is_super_admin_v39() then
      raise exception 'RTO is automatic after 3 consecutive failures; manual RTO requires Super Admin';
    end if;
  end if;

  if v_status = 'OUT_FOR_DELIVERY' and not exists (
    select 1 from public.be_dispatch_scans_v39 s
    where s.delivery_way_id = v_way_id and s.scan_status = 'SCANNED'
  ) then
    raise exception 'Dispatch scan is required before OUT_FOR_DELIVERY for %', v_way_id;
  end if;

  if to_regprocedure('public.be_driver_update_delivery_status(text,text,text,text)') is null then
    raise exception 'Legacy status RPC be_driver_update_delivery_status(text,text,text,text) is not installed';
  end if;

  execute 'select public.be_driver_update_delivery_status($1,$2,$3,$4)'
  using v_way_id, v_status, v_actor, p_note;

  if v_status in ('DELIVERED', 'COMPLETED', 'DROP_OFF') then
    perform public.be_record_delivery_success_v39(v_way_id, v_actor, p_operation_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'way_id', v_way_id,
    'status', v_status,
    'actor', v_actor
  );
end;
$$;

create or replace function public.be_warehouse_return_scan_v39(
  p_way_id text,
  p_actor_email text default null,
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default 'FAILED_RETURN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_pickup_id text;
  v_attempt integer := 0;
  v_status text := null;
  v_result jsonb;
begin
  if v_way_id is null then raise exception 'Way ID is required'; end if;

  select d.pickup_id
  into v_pickup_id
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_way_id
  order by d.updated_at desc nulls last, d.saved_at desc nulls last
  limit 1;

  if v_pickup_id is null then raise exception 'Way ID % was not found', v_way_id; end if;

  select consecutive_failures, last_status
  into v_attempt, v_status
  from public.be_delivery_attempt_state_v39
  where delivery_way_id = v_way_id;

  if v_status = 'RTO' then
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'EXCEPTION', 'RTO', 'DELIVERY_RTO',
      format('Return scan recorded after %s consecutive failed attempts', coalesce(v_attempt, 3)),
      null, p_warehouse_code, 'RTO', v_actor
    );
  elsif v_status = 'ATTEMPTED_FAILED' then
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'RECEIVE', 'FAILED_RETURN', null,
      format('Failed delivery return scan. Attempt %s of 3.', coalesce(v_attempt, 1)),
      null, p_warehouse_code, coalesce(nullif(p_staging_zone, ''), 'FAILED_RETURN'), v_actor
    );
  else
    v_result := public.be_warehouse_receive_scan_v39(
      v_pickup_id, v_way_id, 'RECEIVE', 'GOOD', null, null,
      null, p_warehouse_code, 'INTAKE', v_actor
    );
  end if;

  update public.be_warehouse_receipts_v36
  set receipt_method = case when v_status in ('ATTEMPTED_FAILED', 'RTO') then 'RETURN_SCAN' else 'SCAN' end,
      warehouse_entered_at = now(),
      updated_at = now()
  where pickup_id = v_pickup_id
    and delivery_way_id = v_way_id;

  return v_result || jsonb_build_object(
    'attempt_count', coalesce(v_attempt, 0),
    'delivery_attempt_status', v_status,
    'rto', v_status = 'RTO',
    'return_scan_recorded', v_status in ('ATTEMPTED_FAILED', 'RTO')
  );
end;
$$;

create or replace function public.be_warehouse_lifecycle_alerts_v39()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerts jsonb := '[]'::jsonb;
begin
  perform public.be_refresh_warehouse_dwell_alerts_v39();

  select coalesce(jsonb_agg(to_jsonb(a) order by
    case a.severity when 'CRITICAL' then 1 when 'HIGH' then 2 else 3 end,
    a.last_detected_at desc
  ), '[]'::jsonb)
  into v_alerts
  from public.be_operational_alerts_v39 a
  where a.alert_status = 'OPEN';

  return jsonb_build_object(
    'ok', true,
    'open_alert_count', jsonb_array_length(v_alerts),
    'alerts', v_alerts,
    'policy', public.be_warehouse_scan_policy_v39()
  );
end;
$$;

-- ================================================================
-- 10. Grants
-- ================================================================
revoke all on function public.be_is_super_admin_v39() from public, anon;
revoke all on function public.be_emit_notification_v39(text,text,text,text,text,text,jsonb) from public, anon;
revoke all on function public.be_warehouse_scan_policy_v39() from public, anon;
revoke all on function public.be_set_warehouse_scan_policy_v39(boolean,text) from public, anon;
revoke all on function public.be_refresh_warehouse_dwell_alerts_v39() from public, anon;
revoke all on function public.be_warehouse_dwell_scheduler_status_v39() from public, anon;
revoke all on function public.be_warehouse_receipt_snapshot_v39(text) from public, anon;
revoke all on function public.be_warehouse_receive_scan_v39(text,text,text,text,text,text,numeric,text,text,text) from public, anon;
revoke all on function public.be_warehouse_receive_batch_v39(text,text[],text,text,text) from public, anon;
revoke all on function public.be_warehouse_skip_receiving_scan_v39(text,text,text,text,text) from public, anon;
revoke all on function public.be_dispatch_scan_parcel_v39(text,text,text) from public, anon;
revoke all on function public.be_dispatch_scan_snapshot_v39(text[]) from public, anon;
revoke all on function public.be_dispatch_validate_release_v39(text[]) from public, anon;
revoke all on function public.be_publish_wayplan_with_dispatch_scan_v39(text,text[],text) from public, anon;
revoke all on function public.be_publish_all_wayplans_with_dispatch_scan_v39(text[],text) from public, anon;
revoke all on function public.be_record_delivery_failure_v39(text,text,text,text) from public, anon;
revoke all on function public.be_record_delivery_success_v39(text,text,text) from public, anon;
revoke all on function public.be_dispatch_update_delivery_status_v39(text,text,text,text,text) from public, anon;
revoke all on function public.be_warehouse_return_scan_v39(text,text,text,text) from public, anon;
revoke all on function public.be_warehouse_lifecycle_alerts_v39() from public, anon;

grant execute on function public.be_is_super_admin_v39() to authenticated;
grant execute on function public.be_warehouse_scan_policy_v39() to authenticated;
grant execute on function public.be_set_warehouse_scan_policy_v39(boolean,text) to authenticated;
grant execute on function public.be_refresh_warehouse_dwell_alerts_v39() to authenticated;
grant execute on function public.be_warehouse_dwell_scheduler_status_v39() to authenticated;
grant execute on function public.be_warehouse_receipt_snapshot_v39(text) to authenticated;
grant execute on function public.be_warehouse_receive_scan_v39(text,text,text,text,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.be_warehouse_receive_batch_v39(text,text[],text,text,text) to authenticated;
grant execute on function public.be_warehouse_skip_receiving_scan_v39(text,text,text,text,text) to authenticated;
grant execute on function public.be_dispatch_scan_parcel_v39(text,text,text) to authenticated;
grant execute on function public.be_dispatch_scan_snapshot_v39(text[]) to authenticated;
grant execute on function public.be_dispatch_validate_release_v39(text[]) to authenticated;
grant execute on function public.be_publish_wayplan_with_dispatch_scan_v39(text,text[],text) to authenticated;
grant execute on function public.be_publish_all_wayplans_with_dispatch_scan_v39(text[],text) to authenticated;
grant execute on function public.be_record_delivery_failure_v39(text,text,text,text) to authenticated;
grant execute on function public.be_record_delivery_success_v39(text,text,text) to authenticated;
grant execute on function public.be_dispatch_update_delivery_status_v39(text,text,text,text,text) to authenticated;
grant execute on function public.be_warehouse_return_scan_v39(text,text,text,text) to authenticated;
grant execute on function public.be_warehouse_lifecycle_alerts_v39() to authenticated;

commit;

select
  to_regprocedure('public.be_warehouse_receipt_snapshot_v39(text)')::text as warehouse_snapshot_rpc,
  to_regprocedure('public.be_set_warehouse_scan_policy_v39(boolean,text)')::text as super_admin_policy_rpc,
  to_regprocedure('public.be_warehouse_skip_receiving_scan_v39(text,text,text,text,text)')::text as skip_receiving_scan_rpc,
  to_regprocedure('public.be_dispatch_scan_parcel_v39(text,text,text)')::text as mandatory_dispatch_scan_rpc,
  to_regprocedure('public.be_publish_wayplan_with_dispatch_scan_v39(text,text[],text)')::text as guarded_dispatch_publish_rpc,
  to_regprocedure('public.be_record_delivery_failure_v39(text,text,text,text)')::text as delivery_failure_rpc,
  to_regprocedure('public.be_warehouse_return_scan_v39(text,text,text,text)')::text as failed_return_scan_rpc,
  to_regprocedure('public.be_refresh_warehouse_dwell_alerts_v39()')::text as dwell_alert_rpc,
  to_regprocedure('public.be_warehouse_dwell_scheduler_status_v39()')::text as dwell_scheduler_status_rpc,
  to_regclass('public.be_operational_alerts_v39')::text as alert_table,
  (select bool_value from public.be_operational_settings_v39 where setting_key = 'warehouse_receiving_scan_required') as receiving_scan_required_default,
  (select numeric_value from public.be_operational_settings_v39 where setting_key = 'warehouse_dwell_alert_hours') as dwell_alert_hours,
  (select numeric_value from public.be_operational_settings_v39 where setting_key = 'delivery_failures_before_rto') as failed_attempts_before_rto,
  'Warehouse receiving scan optional by Super Admin policy; dispatch scan mandatory; 3 consecutive failures => RTO; >48h warehouse dwell => warning alert'::text as workflow;
