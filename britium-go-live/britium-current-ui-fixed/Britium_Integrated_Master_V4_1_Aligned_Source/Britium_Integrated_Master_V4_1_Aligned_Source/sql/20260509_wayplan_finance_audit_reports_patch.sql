-- 20260509 Wayplan, Finance, Audit, Reports wiring patch
-- Purpose:
-- 1) Auto-generate wayplans from Data Entry / large shipment upload rows.
-- 2) Keep Enterprise Portal and Rider/Driver workflows synced by using backend APIs.
-- 3) Post finance events, employee wallet bonuses, and audit logs.
-- 4) Generate operational/financial health reports.
--
-- Safe to rerun.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. Core audit table
-- =========================================================
create table if not exists public.be_audit_log (
  audit_id uuid primary key default gen_random_uuid(),
  event_name text not null,
  entity_type text,
  entity_id text,
  actor_role text,
  actor_id text,
  before_data jsonb,
  after_data jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_be_audit_log_entity
on public.be_audit_log(entity_type, entity_id, created_at desc);

create index if not exists idx_be_audit_log_event
on public.be_audit_log(event_name, created_at desc);

create or replace function public.be_audit_event(
  p_event_name text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_actor_role text default null,
  p_actor_id text default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.be_audit_log (
    event_name,
    entity_type,
    entity_id,
    actor_role,
    actor_id,
    before_data,
    after_data,
    payload
  )
  values (
    p_event_name,
    p_entity_type,
    p_entity_id,
    p_actor_role,
    p_actor_id,
    p_before_data,
    p_after_data,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning audit_id into v_id;

  return jsonb_build_object('ok', true, 'audit_id', v_id);
end;
$$;

-- =========================================================
-- 2. Wayplan tables
-- =========================================================
create table if not exists public.be_wayplans (
  wayplan_id uuid primary key default gen_random_uuid(),
  wayplan_code text not null unique,
  upload_code text,
  pickup_id text,
  group_by text,
  group_key text,
  township text,
  merchant_name text,

  assigned_rider_id text,
  assigned_rider_name text,
  assigned_driver_id text,
  assigned_driver_name text,
  assigned_helper_id text,
  assigned_helper_name text,
  assigned_fleet_id text,
  vehicle_plate text,

  status text not null default 'draft',
  total_parcels integer not null default 0,
  total_cod numeric not null default 0,
  total_delivery_fee_os numeric not null default 0,
  total_actual_collect numeric not null default 0,

  generated_by text default 'system',
  generated_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_be_wayplans_upload
on public.be_wayplans(upload_code, created_at desc);

create index if not exists idx_be_wayplans_status
on public.be_wayplans(status, created_at desc);

create table if not exists public.be_wayplan_items (
  item_id uuid primary key default gen_random_uuid(),
  wayplan_code text not null references public.be_wayplans(wayplan_code) on delete cascade,
  upload_code text,
  tracking_no text not null,
  merchant_name text,
  customer_name text,
  customer_phone text,
  township text,
  delivery_address text,
  cod_amount numeric not null default 0,
  delivery_fee_os numeric not null default 0,
  actual_collect numeric not null default 0,
  weight_kg numeric not null default 0,
  sort_order integer,
  status text not null default 'planned',
  picked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_be_wayplan_items_tracking
on public.be_wayplan_items(tracking_no);

create index if not exists idx_be_wayplan_items_wayplan
on public.be_wayplan_items(wayplan_code, sort_order);

create index if not exists idx_be_wayplan_items_upload
on public.be_wayplan_items(upload_code, tracking_no);

-- =========================================================
-- 3. Finance and wallet tables
-- =========================================================
create table if not exists public.be_finance_events (
  finance_event_id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  source text not null default 'wayplan',
  upload_code text,
  wayplan_code text,
  tracking_no text,
  merchant_name text,
  event_type text not null,
  debit_account text,
  credit_account text,
  amount numeric not null default 0,
  currency text not null default 'MMK',
  status text not null default 'posted',
  payload jsonb not null default '{}'::jsonb,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_be_finance_events_upload
on public.be_finance_events(upload_code, event_type, posted_at desc);

create index if not exists idx_be_finance_events_wayplan
on public.be_finance_events(wayplan_code, event_type);

create table if not exists public.be_employee_wallet_transactions (
  wallet_txn_id uuid primary key default gen_random_uuid(),
  employee_role text not null,
  employee_id text,
  employee_name text,
  tracking_no text,
  wayplan_code text,
  upload_code text,
  amount numeric not null default 0,
  currency text not null default 'MMK',
  basis text not null default 'delivered_way',
  status text not null default 'earned',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz
);

create unique index if not exists uq_be_wallet_role_tracking
on public.be_employee_wallet_transactions(employee_role, tracking_no, wayplan_code);

create index if not exists idx_be_wallet_upload
on public.be_employee_wallet_transactions(upload_code, employee_role, status);

-- =========================================================
-- 4. Utility: safely sync assignment to shipments only if columns exist
-- =========================================================
create or replace function public.be_sync_wayplan_assignment_to_shipments(
  p_wayplan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wp record;
  set_parts text[] := array[]::text[];
  sql_text text;
  affected integer := 0;
begin
  select * into wp
  from public.be_wayplans
  where wayplan_code = p_wayplan_code;

  if wp.wayplan_code is null then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_rider_id'
  ) then
    set_parts := array_append(set_parts, format('assigned_rider_id = %L', wp.assigned_rider_id));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_rider_name'
  ) then
    set_parts := array_append(set_parts, format('assigned_rider_name = %L', wp.assigned_rider_name));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_driver_id'
  ) then
    set_parts := array_append(set_parts, format('assigned_driver_id = %L', wp.assigned_driver_id));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_driver_name'
  ) then
    set_parts := array_append(set_parts, format('assigned_driver_name = %L', wp.assigned_driver_name));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_helper_id'
  ) then
    set_parts := array_append(set_parts, format('assigned_helper_id = %L', wp.assigned_helper_id));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'assigned_helper_name'
  ) then
    set_parts := array_append(set_parts, format('assigned_helper_name = %L', wp.assigned_helper_name));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'vehicle_plate'
  ) then
    set_parts := array_append(set_parts, format('vehicle_plate = %L', wp.vehicle_plate));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'updated_at'
  ) then
    set_parts := array_append(set_parts, 'updated_at = now()');
  end if;

  if array_length(set_parts, 1) is null then
    return jsonb_build_object('ok', true, 'updated_shipments', 0, 'message', 'No compatible assignment columns on shipments.');
  end if;

  sql_text := 'update public.shipments set ' || array_to_string(set_parts, ', ') ||
              ' where tracking_no in (select tracking_no from public.be_wayplan_items where wayplan_code = $1)';

  execute sql_text using p_wayplan_code;

  get diagnostics affected = row_count;

  return jsonb_build_object('ok', true, 'updated_shipments', affected);
end;
$$;

-- =========================================================
-- 5. Auto-generate wayplans from Data Entry / large shipment upload
-- =========================================================
create or replace function public.be_auto_generate_wayplan_from_data_entry(
  p_upload_code text,
  p_group_by text default 'township',
  p_max_items_per_plan integer default 60,
  p_generated_by text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  grp record;
  seq_no integer := 0;
  code_prefix text;
  group_code text;
  wp_code text;
  created_plans integer := 0;
  inserted_items integer := 0;
  inserted_for_plan integer := 0;
  rows_available integer := 0;
begin
  if p_upload_code is null or btrim(p_upload_code) = '' then
    raise exception 'upload_code is required.';
  end if;

  if to_regclass('public.be_large_shipment_rows') is null then
    raise exception 'public.be_large_shipment_rows does not exist. Run the large shipment upload patch first.';
  end if;

  select count(*)
  into rows_available
  from public.be_large_shipment_rows r
  where r.upload_code = p_upload_code;

  if rows_available = 0 then
    return jsonb_build_object(
      'ok', false,
      'upload_code', p_upload_code,
      'message', 'No data entry rows found for upload_code.',
      'wayplans_created', 0,
      'items_created', 0
    );
  end if;

  code_prefix := 'WP-' || to_char(now(), 'MMDD');

  for grp in
    select
      case
        when lower(coalesce(p_group_by, 'township')) = 'merchant' then coalesce(nullif(r.merchant_name, ''), 'UNKNOWN')
        when lower(coalesce(p_group_by, 'township')) = 'upload' then p_upload_code
        else coalesce(nullif(r.township, ''), 'UNKNOWN')
      end as group_key,
      max(nullif(r.township, '')) as township,
      max(nullif(r.merchant_name, '')) as merchant_name,
      count(*) as total_parcels,
      coalesce(sum(coalesce(r.cod_amount, 0)), 0) as total_cod,
      coalesce(sum(coalesce(r.delivery_fee_os, 0)), 0) as total_delivery_fee_os,
      coalesce(sum(coalesce(r.actual_collect, 0)), 0) as total_actual_collect
    from public.be_large_shipment_rows r
    where r.upload_code = p_upload_code
      and r.tracking_no is not null
      and btrim(r.tracking_no) <> ''
      and not exists (
        select 1
        from public.be_wayplan_items wi
        where wi.tracking_no = r.tracking_no
      )
    group by 1
    order by 1
  loop
    seq_no := seq_no + 1;

    group_code := upper(regexp_replace(coalesce(grp.group_key, 'GEN'), '[^a-zA-Z0-9]+', '', 'g'));
    group_code := left(case when group_code = '' then 'GEN' else group_code end, 8);

    wp_code := code_prefix || '-' || group_code || '-' || lpad(seq_no::text, 3, '0');

    insert into public.be_wayplans (
      wayplan_code,
      upload_code,
      pickup_id,
      group_by,
      group_key,
      township,
      merchant_name,
      status,
      total_parcels,
      total_cod,
      total_delivery_fee_os,
      total_actual_collect,
      generated_by,
      notes
    )
    values (
      wp_code,
      p_upload_code,
      p_upload_code,
      coalesce(p_group_by, 'township'),
      grp.group_key,
      grp.township,
      grp.merchant_name,
      'draft',
      0,
      0,
      0,
      0,
      p_generated_by,
      'Auto-generated from data entry upload ' || p_upload_code
    )
    on conflict (wayplan_code) do nothing;

    insert into public.be_wayplan_items (
      wayplan_code,
      upload_code,
      tracking_no,
      merchant_name,
      customer_name,
      customer_phone,
      township,
      delivery_address,
      cod_amount,
      delivery_fee_os,
      actual_collect,
      weight_kg,
      sort_order,
      status
    )
    select
      wp_code,
      r.upload_code,
      r.tracking_no,
      r.merchant_name,
      r.customer_name,
      r.customer_phone,
      r.township,
      r.delivery_address,
      coalesce(r.cod_amount, 0),
      coalesce(r.delivery_fee_os, 0),
      coalesce(r.actual_collect, 0),
      coalesce(r.weight_kg, 0),
      row_number() over (order by r.tracking_no),
      case
        when coalesce(r.ground_proof_status, '') = 'completed' then 'picked'
        when coalesce(r.picker_status, '') = 'picked' then 'picked'
        else 'planned'
      end
    from public.be_large_shipment_rows r
    where r.upload_code = p_upload_code
      and r.tracking_no is not null
      and btrim(r.tracking_no) <> ''
      and (
        case
          when lower(coalesce(p_group_by, 'township')) = 'merchant' then coalesce(nullif(r.merchant_name, ''), 'UNKNOWN')
          when lower(coalesce(p_group_by, 'township')) = 'upload' then p_upload_code
          else coalesce(nullif(r.township, ''), 'UNKNOWN')
        end
      ) = grp.group_key
      and not exists (
        select 1
        from public.be_wayplan_items wi
        where wi.tracking_no = r.tracking_no
      )
    order by r.tracking_no
    limit greatest(coalesce(p_max_items_per_plan, 60), 1);

    get diagnostics inserted_for_plan = row_count;

    if inserted_for_plan > 0 then
      created_plans := created_plans + 1;
      inserted_items := inserted_items + inserted_for_plan;

      update public.be_wayplans wp
      set
        total_parcels = s.total_parcels,
        total_cod = s.total_cod,
        total_delivery_fee_os = s.total_delivery_fee_os,
        total_actual_collect = s.total_actual_collect,
        updated_at = now()
      from (
        select
          wayplan_code,
          count(*) as total_parcels,
          coalesce(sum(cod_amount), 0) as total_cod,
          coalesce(sum(delivery_fee_os), 0) as total_delivery_fee_os,
          coalesce(sum(actual_collect), 0) as total_actual_collect
        from public.be_wayplan_items
        where wayplan_code = wp_code
        group by wayplan_code
      ) s
      where wp.wayplan_code = s.wayplan_code;

      perform public.be_audit_event(
        'WAYPLAN_AUTO_GENERATED',
        'be_wayplans',
        wp_code,
        'system',
        p_generated_by,
        null,
        null,
        jsonb_build_object('upload_code', p_upload_code, 'items', inserted_for_plan, 'group_key', grp.group_key)
      );
    else
      delete from public.be_wayplans where wayplan_code = wp_code and total_parcels = 0;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'upload_code', p_upload_code,
    'rows_available', rows_available,
    'wayplans_created', created_plans,
    'items_created', inserted_items
  );
end;
$$;

-- Alias with shorter name
create or replace function public.be_auto_generate_wayplan(
  p_upload_code text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_auto_generate_wayplan_from_data_entry(p_upload_code, 'township', 60, 'system');
$$;

-- Finalize upload: called by frontend immediately after Data Entry upload/import.
create or replace function public.be_finalize_data_entry_submission(
  p_upload_code text,
  p_auto_wayplan boolean default true,
  p_group_by text default 'township'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wayplan_result jsonb := '{}'::jsonb;
  snapshot jsonb;
begin
  if p_auto_wayplan then
    wayplan_result := public.be_auto_generate_wayplan_from_data_entry(
      p_upload_code,
      p_group_by,
      60,
      'data_entry_finalize'
    );
  end if;

  snapshot := public.be_wayplan_finance_audit_snapshot(p_upload_code);

  perform public.be_audit_event(
    'DATA_ENTRY_SUBMISSION_FINALIZED',
    'upload_code',
    p_upload_code,
    'data_entry',
    null,
    null,
    null,
    jsonb_build_object('wayplan_result', wayplan_result, 'snapshot', snapshot)
  );

  return jsonb_build_object(
    'ok', true,
    'upload_code', p_upload_code,
    'wayplan_result', wayplan_result,
    'snapshot', snapshot
  );
end;
$$;

-- =========================================================
-- 6. Assign wayplan team
-- =========================================================
create or replace function public.be_assign_wayplan_team(
  p_wayplan_code text,
  p_rider_id text default null,
  p_rider_name text default null,
  p_driver_id text default null,
  p_driver_name text default null,
  p_helper_id text default null,
  p_helper_name text default null,
  p_fleet_id text default null,
  p_vehicle_plate text default null,
  p_note text default null,
  p_actor_role text default 'supervisor',
  p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  sync_result jsonb;
begin
  select to_jsonb(wp) into before_row
  from public.be_wayplans wp
  where wp.wayplan_code = p_wayplan_code;

  if before_row is null then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  update public.be_wayplans
  set
    assigned_rider_id = p_rider_id,
    assigned_rider_name = p_rider_name,
    assigned_driver_id = p_driver_id,
    assigned_driver_name = p_driver_name,
    assigned_helper_id = p_helper_id,
    assigned_helper_name = p_helper_name,
    assigned_fleet_id = p_fleet_id,
    vehicle_plate = p_vehicle_plate,
    notes = concat_ws(E'\n', nullif(notes, ''), p_note),
    status = 'assigned',
    assigned_at = now(),
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  select to_jsonb(wp) into after_row
  from public.be_wayplans wp
  where wp.wayplan_code = p_wayplan_code;

  sync_result := public.be_sync_wayplan_assignment_to_shipments(p_wayplan_code);

  perform public.be_audit_event(
    'WAYPLAN_TEAM_ASSIGNED',
    'be_wayplans',
    p_wayplan_code,
    p_actor_role,
    p_actor_id,
    before_row,
    after_row,
    jsonb_build_object('sync_result', sync_result)
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'status', 'assigned',
    'sync_result', sync_result
  );
end;
$$;

-- =========================================================
-- 7. Finance posting and employee wallet
-- =========================================================
create or replace function public.be_finance_post_for_wayplan(
  p_wayplan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wp record;
  item record;
  events_inserted integer := 0;
  wallet_inserted integer := 0;
  delivered_count integer := 0;
begin
  select * into wp
  from public.be_wayplans
  where wayplan_code = p_wayplan_code;

  if wp.wayplan_code is null then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  for item in
    select *
    from public.be_wayplan_items
    where wayplan_code = p_wayplan_code
  loop
    -- COD receivable / customer collect
    insert into public.be_finance_events (
      event_code,
      source,
      upload_code,
      wayplan_code,
      tracking_no,
      merchant_name,
      event_type,
      debit_account,
      credit_account,
      amount,
      payload
    )
    values (
      p_wayplan_code || ':' || item.tracking_no || ':COD_RECEIVABLE',
      'wayplan',
      wp.upload_code,
      p_wayplan_code,
      item.tracking_no,
      item.merchant_name,
      'COD_RECEIVABLE',
      'Cash / Rider Receivable',
      'Merchant COD Payable',
      coalesce(item.cod_amount, 0),
      to_jsonb(item)
    )
    on conflict (event_code) do nothing;

    if found then events_inserted := events_inserted + 1; end if;

    -- Delivery revenue
    insert into public.be_finance_events (
      event_code,
      source,
      upload_code,
      wayplan_code,
      tracking_no,
      merchant_name,
      event_type,
      debit_account,
      credit_account,
      amount,
      payload
    )
    values (
      p_wayplan_code || ':' || item.tracking_no || ':DELIVERY_REVENUE',
      'wayplan',
      wp.upload_code,
      p_wayplan_code,
      item.tracking_no,
      item.merchant_name,
      'DELIVERY_REVENUE',
      'Merchant Settlement Deduction',
      'Delivery Revenue',
      coalesce(item.delivery_fee_os, 0),
      to_jsonb(item)
    )
    on conflict (event_code) do nothing;

    if found then events_inserted := events_inserted + 1; end if;

    if lower(coalesce(item.status, '')) in ('delivered', 'completed') then
      delivered_count := delivered_count + 1;

      if coalesce(wp.assigned_rider_name, '') <> '' then
        insert into public.be_employee_wallet_transactions (
          employee_role,
          employee_id,
          employee_name,
          tracking_no,
          wayplan_code,
          upload_code,
          amount,
          status,
          payload
        )
        values (
          'rider',
          wp.assigned_rider_id,
          wp.assigned_rider_name,
          item.tracking_no,
          p_wayplan_code,
          wp.upload_code,
          400,
          'earned',
          jsonb_build_object('basis', '400 MMK per delivered way')
        )
        on conflict (employee_role, tracking_no, wayplan_code) do nothing;

        if found then wallet_inserted := wallet_inserted + 1; end if;
      end if;

      if coalesce(wp.assigned_driver_name, '') <> '' then
        insert into public.be_employee_wallet_transactions (
          employee_role,
          employee_id,
          employee_name,
          tracking_no,
          wayplan_code,
          upload_code,
          amount,
          status,
          payload
        )
        values (
          'driver',
          wp.assigned_driver_id,
          wp.assigned_driver_name,
          item.tracking_no,
          p_wayplan_code,
          wp.upload_code,
          200,
          'earned',
          jsonb_build_object('basis', '200 MMK per delivered way')
        )
        on conflict (employee_role, tracking_no, wayplan_code) do nothing;

        if found then wallet_inserted := wallet_inserted + 1; end if;
      end if;

      if coalesce(wp.assigned_helper_name, '') <> '' then
        insert into public.be_employee_wallet_transactions (
          employee_role,
          employee_id,
          employee_name,
          tracking_no,
          wayplan_code,
          upload_code,
          amount,
          status,
          payload
        )
        values (
          'helper',
          wp.assigned_helper_id,
          wp.assigned_helper_name,
          item.tracking_no,
          p_wayplan_code,
          wp.upload_code,
          200,
          'earned',
          jsonb_build_object('basis', '200 MMK per delivered way')
        )
        on conflict (employee_role, tracking_no, wayplan_code) do nothing;

        if found then wallet_inserted := wallet_inserted + 1; end if;
      end if;
    end if;
  end loop;

  perform public.be_audit_event(
    'FINANCE_POSTED_FOR_WAYPLAN',
    'be_wayplans',
    p_wayplan_code,
    'system',
    null,
    null,
    null,
    jsonb_build_object(
      'events_inserted', events_inserted,
      'wallet_inserted', wallet_inserted,
      'delivered_count', delivered_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'events_inserted', events_inserted,
    'wallet_inserted', wallet_inserted,
    'delivered_count', delivered_count
  );
end;
$$;

-- Mark delivered in the wayplan layer and post finance/wallet.
create or replace function public.be_mark_wayplan_delivered(
  p_wayplan_code text,
  p_actor_role text default 'operations',
  p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  set_parts text[] := array[]::text[];
  sql_text text;
  finance_result jsonb;
begin
  if not exists (select 1 from public.be_wayplans where wayplan_code = p_wayplan_code) then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  update public.be_wayplan_items
  set
    status = 'delivered',
    delivered_at = coalesce(delivered_at, now()),
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  update public.be_wayplans
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  -- Safely update shipment notes/delivered timestamp, avoiding status constraint issues.
  set_parts := array[]::text[];

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'delivered_at'
  ) then
    set_parts := array_append(set_parts, 'delivered_at = coalesce(delivered_at, now())');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'operation_notes'
  ) then
set_parts := array_append(
  set_parts,
  'operation_notes = concat_ws(E''\n'', nullif(operation_notes, ''''), ''[WAYPLAN_DELIVERED] Marked delivered from wayplan at '' || now())'
);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shipments' and column_name = 'updated_at'
  ) then
    set_parts := array_append(set_parts, 'updated_at = now()');
  end if;

  if array_length(set_parts, 1) is not null then
    sql_text := 'update public.shipments set ' || array_to_string(set_parts, ', ') ||
                ' where tracking_no in (select tracking_no from public.be_wayplan_items where wayplan_code = $1)';
    execute sql_text using p_wayplan_code;
  end if;

  finance_result := public.be_finance_post_for_wayplan(p_wayplan_code);

  perform public.be_audit_event(
    'WAYPLAN_MARKED_DELIVERED',
    'be_wayplans',
    p_wayplan_code,
    p_actor_role,
    p_actor_id,
    null,
    null,
    jsonb_build_object('finance_result', finance_result)
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'finance_result', finance_result
  );
end;
$$;

-- =========================================================
-- 8. Reports and health checks
-- =========================================================
create or replace function public.be_wayplan_finance_audit_snapshot(
  p_upload_code text default 'FULL-PICKUP-LIST-20260508'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'upload_code', p_upload_code,
    'staged_rows', (
      select count(*) from public.be_large_shipment_rows where upload_code = p_upload_code
    ),
    'synced_to_shipments', (
      select count(*)
      from public.shipments s
      where s.tracking_no in (
        select tracking_no
        from public.be_large_shipment_rows
        where upload_code = p_upload_code
      )
    ),
    'wayplans', (
      select count(*) from public.be_wayplans where upload_code = p_upload_code
    ),
    'wayplan_items', (
      select count(*) from public.be_wayplan_items where upload_code = p_upload_code
    ),
    'picked_items', (
      select count(*)
      from public.be_large_shipment_rows
      where upload_code = p_upload_code
        and coalesce(picker_status, '') = 'picked'
    ),
    'ground_proof_completed', (
      select count(*)
      from public.be_large_shipment_rows
      where upload_code = p_upload_code
        and coalesce(ground_proof_status, '') = 'completed'
    ),
    'delivered_items', (
      select count(*)
      from public.be_wayplan_items
      where upload_code = p_upload_code
        and lower(coalesce(status, '')) in ('delivered', 'completed')
    ),
    'total_cod', (
      select coalesce(sum(cod_amount), 0)
      from public.be_large_shipment_rows
      where upload_code = p_upload_code
    ),
    'total_delivery_fee_os', (
      select coalesce(sum(delivery_fee_os), 0)
      from public.be_large_shipment_rows
      where upload_code = p_upload_code
    ),
    'total_actual_collect', (
      select coalesce(sum(actual_collect), 0)
      from public.be_large_shipment_rows
      where upload_code = p_upload_code
    ),
    'finance_events', (
      select count(*) from public.be_finance_events where upload_code = p_upload_code
    ),
    'finance_amount_posted', (
      select coalesce(sum(amount), 0) from public.be_finance_events where upload_code = p_upload_code
    ),
    'rider_wallet_mmk', (
      select coalesce(sum(amount), 0)
      from public.be_employee_wallet_transactions
      where upload_code = p_upload_code and employee_role = 'rider'
    ),
    'driver_wallet_mmk', (
      select coalesce(sum(amount), 0)
      from public.be_employee_wallet_transactions
      where upload_code = p_upload_code and employee_role = 'driver'
    ),
    'helper_wallet_mmk', (
      select coalesce(sum(amount), 0)
      from public.be_employee_wallet_transactions
      where upload_code = p_upload_code and employee_role = 'helper'
    ),
    'missing_shipments', (
      select coalesce(jsonb_agg(r.tracking_no order by r.tracking_no), '[]'::jsonb)
      from public.be_large_shipment_rows r
      where r.upload_code = p_upload_code
        and not exists (
          select 1 from public.shipments s where s.tracking_no = r.tracking_no
        )
    ),
    'missing_wayplan_items', (
      select coalesce(jsonb_agg(r.tracking_no order by r.tracking_no), '[]'::jsonb)
      from public.be_large_shipment_rows r
      where r.upload_code = p_upload_code
        and not exists (
          select 1 from public.be_wayplan_items wi where wi.tracking_no = r.tracking_no
        )
    ),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

create or replace function public.be_finance_period_report(
  p_from date default current_date - interval '30 days',
  p_to date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'ledger', (
      select coalesce(jsonb_agg(x order by x.event_type), '[]'::jsonb)
      from (
        select
          event_type,
          debit_account,
          credit_account,
          count(*) as entries,
          coalesce(sum(amount), 0) as amount
        from public.be_finance_events
        where posted_at::date between p_from and p_to
        group by event_type, debit_account, credit_account
      ) x
    ),
    'cash_balance_proxy', (
      select coalesce(sum(amount), 0)
      from public.be_finance_events
      where event_type = 'COD_RECEIVABLE'
        and posted_at::date between p_from and p_to
    ),
    'delivery_revenue', (
      select coalesce(sum(amount), 0)
      from public.be_finance_events
      where event_type = 'DELIVERY_REVENUE'
        and posted_at::date between p_from and p_to
    ),
    'wallet_bonus_expense', (
      select coalesce(sum(amount), 0)
      from public.be_employee_wallet_transactions
      where created_at::date between p_from and p_to
    ),
    'profit_and_loss', jsonb_build_object(
      'revenue', (
        select coalesce(sum(amount), 0)
        from public.be_finance_events
        where event_type = 'DELIVERY_REVENUE'
          and posted_at::date between p_from and p_to
      ),
      'employee_bonus_expense', (
        select coalesce(sum(amount), 0)
        from public.be_employee_wallet_transactions
        where created_at::date between p_from and p_to
      ),
      'gross_profit_after_bonus', (
        (select coalesce(sum(amount), 0)
         from public.be_finance_events
         where event_type = 'DELIVERY_REVENUE'
           and posted_at::date between p_from and p_to)
        -
        (select coalesce(sum(amount), 0)
         from public.be_employee_wallet_transactions
         where created_at::date between p_from and p_to)
      )
    ),
    'wallet_by_employee', (
      select coalesce(jsonb_agg(w order by w.employee_role, w.employee_name), '[]'::jsonb)
      from (
        select
          employee_role,
          employee_id,
          employee_name,
          count(*) as delivered_ways,
          coalesce(sum(amount), 0) as bonus_amount,
          status
        from public.be_employee_wallet_transactions
        where created_at::date between p_from and p_to
        group by employee_role, employee_id, employee_name, status
      ) w
    ),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

create or replace function public.be_system_wireup_health_check(
  p_upload_code text default 'FULL-PICKUP-LIST-20260508'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'upload_code', p_upload_code,
    'tables', jsonb_build_object(
      'be_large_shipment_rows', to_regclass('public.be_large_shipment_rows') is not null,
      'shipments', to_regclass('public.shipments') is not null,
      'be_wayplans', to_regclass('public.be_wayplans') is not null,
      'be_wayplan_items', to_regclass('public.be_wayplan_items') is not null,
      'be_finance_events', to_regclass('public.be_finance_events') is not null,
      'be_employee_wallet_transactions', to_regclass('public.be_employee_wallet_transactions') is not null,
      'be_audit_log', to_regclass('public.be_audit_log') is not null
    ),
    'functions', jsonb_build_object(
      'be_auto_generate_wayplan_from_data_entry', exists(select 1 from pg_proc where proname = 'be_auto_generate_wayplan_from_data_entry'),
      'be_finalize_data_entry_submission', exists(select 1 from pg_proc where proname = 'be_finalize_data_entry_submission'),
      'be_assign_wayplan_team', exists(select 1 from pg_proc where proname = 'be_assign_wayplan_team'),
      'be_mark_wayplan_delivered', exists(select 1 from pg_proc where proname = 'be_mark_wayplan_delivered'),
      'be_finance_period_report', exists(select 1 from pg_proc where proname = 'be_finance_period_report'),
      'be_field_pickup_batches', exists(select 1 from pg_proc where proname = 'be_field_pickup_batches'),
      'be_order_picker_submit_ground_proof', exists(select 1 from pg_proc where proname = 'be_order_picker_submit_ground_proof')
    ),
    'snapshot', public.be_wayplan_finance_audit_snapshot(p_upload_code),
    'recommendations', jsonb_build_array(
      'Enterprise Portal Data Entry upload should call be_finalize_data_entry_submission(upload_code) after rows are saved.',
      'Rider/Driver app should read active pickup batches from be_field_pickup_batches, not raw shipments.',
      'Finance dashboards should read be_finance_events and be_employee_wallet_transactions for ledger/wallet reporting.',
      'Ground operation proof should call be_order_picker_submit_ground_proof before dispatch.'
    ),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

grant execute on function public.be_audit_event(text,text,text,text,text,jsonb,jsonb,jsonb) to anon, authenticated;
grant execute on function public.be_sync_wayplan_assignment_to_shipments(text) to anon, authenticated;
grant execute on function public.be_auto_generate_wayplan_from_data_entry(text,text,integer,text) to anon, authenticated;
grant execute on function public.be_auto_generate_wayplan(text) to anon, authenticated;
grant execute on function public.be_finalize_data_entry_submission(text,boolean,text) to anon, authenticated;
grant execute on function public.be_assign_wayplan_team(text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.be_finance_post_for_wayplan(text) to anon, authenticated;
grant execute on function public.be_mark_wayplan_delivered(text,text,text) to anon, authenticated;
grant execute on function public.be_wayplan_finance_audit_snapshot(text) to anon, authenticated;
grant execute on function public.be_finance_period_report(date,date) to anon, authenticated;
grant execute on function public.be_system_wireup_health_check(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Quick verification examples:
-- select public.be_finalize_data_entry_submission('FULL-PICKUP-LIST-20260508', true, 'township');
-- select public.be_system_wireup_health_check('FULL-PICKUP-LIST-20260508');
-- select public.be_wayplan_finance_audit_snapshot('FULL-PICKUP-LIST-20260508');
