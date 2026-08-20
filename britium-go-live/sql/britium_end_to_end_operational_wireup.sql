begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Canonical pickup request operational columns
-- =========================================================

alter table public.be_portal_pickup_requests
  add column if not exists workflow_stage text default 'PICKUP_REQUESTED',
  add column if not exists pickup_status text default 'PICKUP_REQUESTED',
  add column if not exists supervisor_status text default 'PENDING_ASSIGNMENT',
  add column if not exists rider_status text default 'NOT_ASSIGNED',
  add column if not exists data_entry_status text default 'WAITING_PICKUP',
  add column if not exists warehouse_status text default 'WAITING_DATA_ENTRY',
  add column if not exists wayplan_status text default 'WAITING_WAREHOUSE',
  add column if not exists dispatch_status text default 'WAITING_WAYPLAN',
  add column if not exists finance_status text default 'NOT_READY',
  add column if not exists cod_settlement_status text default 'NOT_REQUIRED',

  add column if not exists assigned_rider_email text,
  add column if not exists assigned_driver_email text,
  add column if not exists assigned_helper_email text,
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_vehicle_id text,
  add column if not exists assigned_by_email text,
  add column if not exists assigned_at timestamptz,

  add column if not exists collected_parcels integer,
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by_email text,

  add column if not exists waybill_no text,
  add column if not exists wayplan_id text,

  add column if not exists cod_amount numeric(14,2) default 0,
  add column if not exists cod_collected_amount numeric(14,2) default 0,
  add column if not exists cod_settled_amount numeric(14,2) default 0,

  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by_email text,

  add column if not exists last_event_at timestamptz,
  add column if not exists last_event_by text,
  add column if not exists last_event_note text,
  add column if not exists updated_at timestamptz default now();

-- =========================================================
-- 2) Mobile workforce table safety
-- =========================================================

create table if not exists public.be_mobile_workforce_accounts (
  id uuid primary key default gen_random_uuid()
);

alter table public.be_mobile_workforce_accounts
  add column if not exists auth_user_id uuid,
  add column if not exists email text,
  add column if not exists workforce_code text,
  add column if not exists name text,
  add column if not exists full_name text,
  add column if not exists role text,
  add column if not exists status text default 'Active',
  add column if not exists branch_code text default 'YGN',
  add column if not exists assigned_zone text,
  add column if not exists phone_primary text,
  add column if not exists is_active boolean default true,
  add column if not exists is_uat_account boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- =========================================================
-- 3) Operational event log
-- =========================================================

create table if not exists public.be_operational_events (
  event_id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  pickup_id text,
  waybill_no text,
  wayplan_id text,
  from_status text,
  to_status text,
  actor_email text,
  actor_role text,
  event_note text,
  event_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_be_operational_events_entity
on public.be_operational_events(entity_type, entity_id);

create index if not exists idx_be_operational_events_pickup
on public.be_operational_events(pickup_id);

create index if not exists idx_be_operational_events_waybill
on public.be_operational_events(waybill_no);

-- =========================================================
-- 4) Waybills
-- =========================================================

create table if not exists public.be_waybills (
  waybill_no text primary key,
  pickup_id text,
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  destination_city text,
  destination_township text,
  destination_branch_code text,
  parcel_count integer default 1,
  weight_kg numeric(10,2) default 0,
  cod_amount numeric(14,2) default 0,
  payment_type text,
  waybill_status text default 'DATA_ENTRY_CREATED',
  warehouse_status text default 'PENDING_RECEIVE',
  dispatch_status text default 'WAITING_WAYPLAN',
  delivery_status text default 'NOT_DISPATCHED',
  finance_status text default 'NOT_READY',
  wayplan_id text,
  created_by_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_be_waybills_pickup_id
on public.be_waybills(pickup_id);

create index if not exists idx_be_waybills_wayplan_id
on public.be_waybills(wayplan_id);

-- =========================================================
-- 5) Wayplans
-- =========================================================

create table if not exists public.be_wayplans (
  wayplan_id text primary key,
  branch_code text default 'YGN',
  route_code text,
  route_name text,
  dispatch_date date default current_date,
  vehicle_id text,
  rider_email text,
  driver_email text,
  helper_email text,
  wayplan_status text default 'CREATED',
  dispatch_status text default 'READY_FOR_DISPATCH',
  total_waybills integer default 0,
  total_cod_amount numeric(14,2) default 0,
  created_by_email text,
  dispatched_by_email text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- 6) COD settlements
-- =========================================================

create table if not exists public.be_cod_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  waybill_no text,
  wayplan_id text,
  merchant_code text,
  rider_email text,
  driver_email text,
  cod_amount numeric(14,2) default 0,
  collected_amount numeric(14,2) default 0,
  settled_amount numeric(14,2) default 0,
  settlement_status text default 'PENDING_SETTLEMENT',
  settlement_method text,
  reference_no text,
  collected_at timestamptz,
  settled_by_email text,
  settled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_be_cod_settlements_waybill
on public.be_cod_settlements(waybill_no);

create index if not exists idx_be_cod_settlements_status
on public.be_cod_settlements(settlement_status);

-- =========================================================
-- 7) Helper: log event
-- =========================================================

create or replace function public.be_log_operational_event(
  p_entity_type text,
  p_entity_id text,
  p_pickup_id text default null,
  p_waybill_no text default null,
  p_wayplan_id text default null,
  p_from_status text default null,
  p_to_status text default null,
  p_actor_email text default null,
  p_actor_role text default null,
  p_event_note text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.be_operational_events (
    entity_type,
    entity_id,
    pickup_id,
    waybill_no,
    wayplan_id,
    from_status,
    to_status,
    actor_email,
    actor_role,
    event_note,
    event_payload
  )
  values (
    p_entity_type,
    p_entity_id,
    p_pickup_id,
    p_waybill_no,
    p_wayplan_id,
    p_from_status,
    p_to_status,
    p_actor_email,
    p_actor_role,
    p_event_note,
    coalesce(p_event_payload, '{}'::jsonb)
  )
  returning event_id into v_event_id;

  return v_event_id;
end;
$$;

-- =========================================================
-- 8) Supervisor assigns rider/driver/helper
-- =========================================================

create or replace function public.be_supervisor_assign_pickup(
  p_pickup_id text,
  p_rider_email text,
  p_driver_email text default null,
  p_helper_email text default null,
  p_vehicle_id text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_rider_code text;
  v_driver_code text;
  v_helper_code text;
begin
  select pickup_status
  into v_old_status
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
  limit 1;

  if v_old_status is null then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  select workforce_code into v_rider_code
  from public.be_mobile_workforce_accounts
  where lower(email) = lower(p_rider_email)
  limit 1;

  select workforce_code into v_driver_code
  from public.be_mobile_workforce_accounts
  where lower(email) = lower(p_driver_email)
  limit 1;

  select workforce_code into v_helper_code
  from public.be_mobile_workforce_accounts
  where lower(email) = lower(p_helper_email)
  limit 1;

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'RIDER_ASSIGNED',
    pickup_status = 'RIDER_ASSIGNED',
    supervisor_status = 'ASSIGNED',
    rider_status = 'ASSIGNED',
    data_entry_status = 'WAITING_PICKUP',
    warehouse_status = 'WAITING_DATA_ENTRY',
    wayplan_status = 'WAITING_WAREHOUSE',
    dispatch_status = 'WAITING_WAYPLAN',
    assigned_rider_email = p_rider_email,
    assigned_driver_email = p_driver_email,
    assigned_helper_email = p_helper_email,
    assigned_rider_code = v_rider_code,
    assigned_driver_code = v_driver_code,
    assigned_helper_code = v_helper_code,
    assigned_vehicle_id = p_vehicle_id,
    assigned_by_email = p_actor_email,
    assigned_at = now(),
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Supervisor assigned pickup workforce',
    updated_at = now()
  where pickup_id = p_pickup_id;

  perform public.be_log_operational_event(
    'pickup',
    p_pickup_id,
    p_pickup_id,
    null,
    null,
    v_old_status,
    'RIDER_ASSIGNED',
    p_actor_email,
    'supervisor',
    'Supervisor assigned rider/driver/helper',
    jsonb_build_object(
      'rider_email', p_rider_email,
      'driver_email', p_driver_email,
      'helper_email', p_helper_email,
      'vehicle_id', p_vehicle_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'status', 'RIDER_ASSIGNED'
  );
end;
$$;

-- =========================================================
-- 9) Rider marks collected
-- =========================================================

create or replace function public.be_rider_mark_pickup_collected(
  p_pickup_id text,
  p_collected_parcels integer,
  p_actor_email text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_parcels integer;
begin
  select pickup_status
  into v_old_status
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
  limit 1;

  if v_old_status is null then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  v_parcels := greatest(coalesce(p_collected_parcels, 1), 1);

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'PICKUP_COLLECTED',
    pickup_status = 'PICKUP_COLLECTED',
    rider_status = 'COLLECTED',
    data_entry_status = 'READY_FOR_DATA_ENTRY',
    warehouse_status = 'WAITING_DATA_ENTRY',
    wayplan_status = 'WAITING_WAREHOUSE',
    dispatch_status = 'WAITING_WAYPLAN',
    collected_parcels = v_parcels,
    collected_at = now(),
    collected_by_email = p_actor_email,
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = coalesce(p_note, 'Rider collected pickup'),
    updated_at = now()
  where pickup_id = p_pickup_id;

  perform public.be_log_operational_event(
    'pickup',
    p_pickup_id,
    p_pickup_id,
    null,
    null,
    v_old_status,
    'PICKUP_COLLECTED',
    p_actor_email,
    'rider',
    coalesce(p_note, 'Rider collected pickup'),
    jsonb_build_object('collected_parcels', v_parcels)
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'status', 'PICKUP_COLLECTED',
    'collected_parcels', v_parcels
  );
end;
$$;

-- =========================================================
-- 10) Data Entry creates waybill
-- =========================================================

create sequence if not exists public.be_waybill_seq;

create or replace function public.be_next_waybill_no()
returns text
language sql
as $$
  select 'WB' || to_char(now(), 'YYMMDD') || lpad(nextval('public.be_waybill_seq')::text, 6, '0');
$$;

create or replace function public.be_data_entry_create_waybill(
  p_pickup_id text,
  p_waybill_no text default null,
  p_receiver_name text default null,
  p_receiver_phone text default null,
  p_receiver_address text default null,
  p_destination_city text default null,
  p_destination_township text default null,
  p_cod_amount numeric default 0,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_waybill_no text;
  v_old_status text;
begin
  select *
  into p
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
  limit 1;

  if p.pickup_id is null then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  v_waybill_no := coalesce(nullif(p_waybill_no, ''), public.be_next_waybill_no());
  v_old_status := p.data_entry_status;

  insert into public.be_waybills (
    waybill_no,
    pickup_id,
    merchant_code,
    merchant_name,
    sender_name,
    sender_phone,
    receiver_name,
    receiver_phone,
    receiver_address,
    destination_city,
    destination_township,
    parcel_count,
    cod_amount,
    payment_type,
    waybill_status,
    warehouse_status,
    dispatch_status,
    delivery_status,
    finance_status,
    created_by_email,
    created_at,
    updated_at
  )
  values (
    v_waybill_no,
    p_pickup_id,
    p.merchant_code,
    p.merchant_name,
    p.contact_person,
    p.phone_primary,
    p_receiver_name,
    p_receiver_phone,
    p_receiver_address,
    p_destination_city,
    p_destination_township,
    coalesce(p.collected_parcels, p.expected_parcels, 1),
    coalesce(p_cod_amount, 0),
    p.payment_type,
    'DATA_ENTRY_CREATED',
    'PENDING_RECEIVE',
    'WAITING_WAYPLAN',
    'NOT_DISPATCHED',
    case when coalesce(p_cod_amount, 0) > 0 then 'COD_PENDING_COLLECTION' else 'NOT_REQUIRED' end,
    p_actor_email,
    now(),
    now()
  )
  on conflict (waybill_no) do update set
    receiver_name = excluded.receiver_name,
    receiver_phone = excluded.receiver_phone,
    receiver_address = excluded.receiver_address,
    destination_city = excluded.destination_city,
    destination_township = excluded.destination_township,
    cod_amount = excluded.cod_amount,
    updated_at = now();

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'WAYBILL_CREATED',
    pickup_status = 'WAYBILL_CREATED',
    data_entry_status = 'COMPLETED',
    warehouse_status = 'READY_TO_RECEIVE',
    wayplan_status = 'WAITING_WAREHOUSE',
    dispatch_status = 'WAITING_WAYPLAN',
    finance_status = case when coalesce(p_cod_amount, 0) > 0 then 'COD_PENDING_COLLECTION' else 'NOT_REQUIRED' end,
    cod_settlement_status = case when coalesce(p_cod_amount, 0) > 0 then 'PENDING_COLLECTION' else 'NOT_REQUIRED' end,
    cod_amount = coalesce(p_cod_amount, 0),
    waybill_no = v_waybill_no,
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Data Entry created waybill',
    updated_at = now()
  where pickup_id = p_pickup_id;

  perform public.be_log_operational_event(
    'waybill',
    v_waybill_no,
    p_pickup_id,
    v_waybill_no,
    null,
    v_old_status,
    'DATA_ENTRY_COMPLETED',
    p_actor_email,
    'data_entry',
    'Data Entry created waybill',
    jsonb_build_object('cod_amount', coalesce(p_cod_amount, 0))
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'waybill_no', v_waybill_no,
    'status', 'WAYBILL_CREATED'
  );
end;
$$;

-- =========================================================
-- 11) Warehouse receive
-- =========================================================

create or replace function public.be_warehouse_receive_waybill(
  p_waybill_no text,
  p_actor_email text,
  p_branch_code text default 'YGN',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
begin
  select *
  into w
  from public.be_waybills
  where waybill_no = p_waybill_no
  limit 1;

  if w.waybill_no is null then
    raise exception 'Waybill not found: %', p_waybill_no;
  end if;

  update public.be_waybills
  set
    warehouse_status = 'RECEIVED',
    waybill_status = 'WAREHOUSE_RECEIVED',
    updated_at = now()
  where waybill_no = p_waybill_no;

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'WAREHOUSE_RECEIVED',
    pickup_status = 'WAREHOUSE_RECEIVED',
    warehouse_status = 'RECEIVED',
    wayplan_status = 'READY_FOR_WAYPLAN',
    dispatch_status = 'WAITING_WAYPLAN',
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = coalesce(p_note, 'Warehouse received waybill'),
    updated_at = now()
  where pickup_id = w.pickup_id;

  perform public.be_log_operational_event(
    'warehouse',
    p_waybill_no,
    w.pickup_id,
    p_waybill_no,
    null,
    w.warehouse_status,
    'RECEIVED',
    p_actor_email,
    'warehouse',
    coalesce(p_note, 'Warehouse received waybill'),
    jsonb_build_object('branch_code', p_branch_code)
  );

  return jsonb_build_object(
    'ok', true,
    'waybill_no', p_waybill_no,
    'pickup_id', w.pickup_id,
    'warehouse_status', 'RECEIVED'
  );
end;
$$;

-- =========================================================
-- 12) Wayplan create and add waybill
-- =========================================================

create sequence if not exists public.be_wayplan_seq;

create or replace function public.be_next_wayplan_id(
  p_branch_code text default 'YGN',
  p_route_code text default 'ROUTE'
)
returns text
language sql
as $$
  select
    'WP'
    || to_char(current_date, 'MMDD')
    || '-'
    || upper(coalesce(nullif(p_branch_code, ''), 'YGN'))
    || '-'
    || upper(regexp_replace(coalesce(nullif(p_route_code, ''), 'ROUTE'), '[^A-Za-z0-9]', '', 'g'))
    || '-'
    || lpad(nextval('public.be_wayplan_seq')::text, 3, '0');
$$;

create or replace function public.be_wayplan_create(
  p_branch_code text default 'YGN',
  p_route_code text default 'ROUTE',
  p_route_name text default null,
  p_dispatch_date date default current_date,
  p_vehicle_id text default null,
  p_rider_email text default null,
  p_driver_email text default null,
  p_helper_email text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan_id text;
begin
  v_wayplan_id := public.be_next_wayplan_id(p_branch_code, p_route_code);

  insert into public.be_wayplans (
    wayplan_id,
    branch_code,
    route_code,
    route_name,
    dispatch_date,
    vehicle_id,
    rider_email,
    driver_email,
    helper_email,
    wayplan_status,
    dispatch_status,
    total_waybills,
    total_cod_amount,
    created_by_email,
    created_at,
    updated_at
  )
  values (
    v_wayplan_id,
    coalesce(p_branch_code, 'YGN'),
    p_route_code,
    p_route_name,
    coalesce(p_dispatch_date, current_date),
    p_vehicle_id,
    p_rider_email,
    p_driver_email,
    p_helper_email,
    'CREATED',
    'READY_FOR_DISPATCH',
    0,
    0,
    p_actor_email,
    now(),
    now()
  );

  perform public.be_log_operational_event(
    'wayplan',
    v_wayplan_id,
    null,
    null,
    v_wayplan_id,
    null,
    'CREATED',
    p_actor_email,
    'wayplan',
    'Wayplan created',
    jsonb_build_object(
      'branch_code', p_branch_code,
      'route_code', p_route_code,
      'dispatch_date', p_dispatch_date
    )
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan_id,
    'status', 'CREATED'
  );
end;
$$;

create or replace function public.be_wayplan_add_waybill(
  p_wayplan_id text,
  p_waybill_no text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
begin
  select *
  into w
  from public.be_waybills
  where waybill_no = p_waybill_no
  limit 1;

  if w.waybill_no is null then
    raise exception 'Waybill not found: %', p_waybill_no;
  end if;

  if not exists (select 1 from public.be_wayplans where wayplan_id = p_wayplan_id) then
    raise exception 'Wayplan not found: %', p_wayplan_id;
  end if;

  update public.be_waybills
  set
    wayplan_id = p_wayplan_id,
    waybill_status = 'WAYPLAN_ASSIGNED',
    dispatch_status = 'READY_FOR_DISPATCH',
    updated_at = now()
  where waybill_no = p_waybill_no;

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'WAYPLAN_ASSIGNED',
    pickup_status = 'WAYPLAN_ASSIGNED',
    wayplan_status = 'ASSIGNED',
    dispatch_status = 'READY_FOR_DISPATCH',
    wayplan_id = p_wayplan_id,
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Waybill assigned to wayplan',
    updated_at = now()
  where pickup_id = w.pickup_id;

  update public.be_wayplans wp
  set
    total_waybills = (
      select count(*)
      from public.be_waybills bw
      where bw.wayplan_id = p_wayplan_id
    ),
    total_cod_amount = (
      select coalesce(sum(cod_amount), 0)
      from public.be_waybills bw
      where bw.wayplan_id = p_wayplan_id
    ),
    updated_at = now()
  where wp.wayplan_id = p_wayplan_id;

  perform public.be_log_operational_event(
    'wayplan',
    p_wayplan_id,
    w.pickup_id,
    p_waybill_no,
    p_wayplan_id,
    w.dispatch_status,
    'READY_FOR_DISPATCH',
    p_actor_email,
    'wayplan',
    'Waybill added to wayplan',
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', p_wayplan_id,
    'waybill_no', p_waybill_no,
    'status', 'READY_FOR_DISPATCH'
  );
end;
$$;

-- =========================================================
-- 13) Dispatch
-- =========================================================

create or replace function public.be_dispatch_start_wayplan(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.be_wayplans
  set
    wayplan_status = 'DISPATCHED',
    dispatch_status = 'OUT_FOR_DELIVERY',
    dispatched_by_email = p_actor_email,
    dispatched_at = now(),
    updated_at = now()
  where wayplan_id = p_wayplan_id;

  update public.be_waybills
  set
    waybill_status = 'OUT_FOR_DELIVERY',
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = 'OUT_FOR_DELIVERY',
    updated_at = now()
  where wayplan_id = p_wayplan_id;

  update public.be_portal_pickup_requests p
  set
    workflow_stage = 'OUT_FOR_DELIVERY',
    pickup_status = 'OUT_FOR_DELIVERY',
    dispatch_status = 'OUT_FOR_DELIVERY',
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Wayplan dispatched',
    updated_at = now()
  where p.waybill_no in (
    select waybill_no
    from public.be_waybills
    where wayplan_id = p_wayplan_id
  );

  perform public.be_log_operational_event(
    'dispatch',
    p_wayplan_id,
    null,
    null,
    p_wayplan_id,
    'READY_FOR_DISPATCH',
    'OUT_FOR_DELIVERY',
    p_actor_email,
    'dispatch',
    'Wayplan dispatched',
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', p_wayplan_id,
    'status', 'OUT_FOR_DELIVERY'
  );
end;
$$;

create or replace function public.be_dispatch_mark_delivered(
  p_waybill_no text,
  p_collected_cod_amount numeric default 0,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  v_cod numeric;
begin
  select *
  into w
  from public.be_waybills
  where waybill_no = p_waybill_no
  limit 1;

  if w.waybill_no is null then
    raise exception 'Waybill not found: %', p_waybill_no;
  end if;

  v_cod := coalesce(p_collected_cod_amount, 0);

  update public.be_waybills
  set
    waybill_status = 'DELIVERED',
    dispatch_status = 'DELIVERED',
    delivery_status = 'DELIVERED',
    finance_status = case when coalesce(cod_amount, 0) > 0 then 'COD_COLLECTED' else 'NOT_REQUIRED' end,
    updated_at = now()
  where waybill_no = p_waybill_no;

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'DELIVERED',
    pickup_status = 'DELIVERED',
    dispatch_status = 'DELIVERED',
    finance_status = case when coalesce(w.cod_amount, 0) > 0 then 'COD_COLLECTED' else 'NOT_REQUIRED' end,
    cod_settlement_status = case when coalesce(w.cod_amount, 0) > 0 then 'PENDING_SETTLEMENT' else 'NOT_REQUIRED' end,
    cod_collected_amount = v_cod,
    delivered_at = now(),
    delivered_by_email = p_actor_email,
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Delivery completed',
    updated_at = now()
  where pickup_id = w.pickup_id;

  if coalesce(w.cod_amount, 0) > 0 then
    insert into public.be_cod_settlements (
      pickup_id,
      waybill_no,
      wayplan_id,
      merchant_code,
      rider_email,
      driver_email,
      cod_amount,
      collected_amount,
      settled_amount,
      settlement_status,
      collected_at,
      created_at,
      updated_at
    )
    values (
      w.pickup_id,
      w.waybill_no,
      w.wayplan_id,
      w.merchant_code,
      null,
      null,
      w.cod_amount,
      v_cod,
      0,
      'PENDING_SETTLEMENT',
      now(),
      now(),
      now()
    )
    on conflict do nothing;
  end if;

  perform public.be_log_operational_event(
    'delivery',
    p_waybill_no,
    w.pickup_id,
    p_waybill_no,
    w.wayplan_id,
    w.delivery_status,
    'DELIVERED',
    p_actor_email,
    'dispatch',
    'Delivery completed',
    jsonb_build_object('collected_cod_amount', v_cod)
  );

  return jsonb_build_object(
    'ok', true,
    'waybill_no', p_waybill_no,
    'pickup_id', w.pickup_id,
    'status', 'DELIVERED'
  );
end;
$$;

-- =========================================================
-- 14) Finance COD settlement
-- =========================================================

create or replace function public.be_finance_settle_cod(
  p_waybill_no text,
  p_settled_amount numeric,
  p_settlement_method text default 'CASH_HANDOVER',
  p_reference_no text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_status text;
begin
  select *
  into c
  from public.be_cod_settlements
  where waybill_no = p_waybill_no
  order by created_at desc
  limit 1;

  if c.waybill_no is null then
    raise exception 'COD settlement row not found for waybill: %', p_waybill_no;
  end if;

  if coalesce(p_settled_amount, 0) >= coalesce(c.cod_amount, 0) then
    v_status := 'SETTLED';
  else
    v_status := 'PARTIALLY_SETTLED';
  end if;

  update public.be_cod_settlements
  set
    settled_amount = coalesce(p_settled_amount, 0),
    settlement_status = v_status,
    settlement_method = p_settlement_method,
    reference_no = p_reference_no,
    settled_by_email = p_actor_email,
    settled_at = now(),
    updated_at = now()
  where settlement_id = c.settlement_id;

  update public.be_waybills
  set
    finance_status = case when v_status = 'SETTLED' then 'COD_SETTLED' else 'COD_PARTIAL' end,
    updated_at = now()
  where waybill_no = p_waybill_no;

  update public.be_portal_pickup_requests
  set
    finance_status = case when v_status = 'SETTLED' then 'COD_SETTLED' else 'COD_PARTIAL' end,
    cod_settlement_status = v_status,
    cod_settled_amount = coalesce(p_settled_amount, 0),
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Finance COD settlement updated',
    updated_at = now()
  where pickup_id = c.pickup_id;

  perform public.be_log_operational_event(
    'finance',
    p_waybill_no,
    c.pickup_id,
    p_waybill_no,
    c.wayplan_id,
    c.settlement_status,
    v_status,
    p_actor_email,
    'finance',
    'Finance COD settlement updated',
    jsonb_build_object(
      'settled_amount', p_settled_amount,
      'settlement_method', p_settlement_method,
      'reference_no', p_reference_no
    )
  );

  return jsonb_build_object(
    'ok', true,
    'waybill_no', p_waybill_no,
    'settlement_status', v_status
  );
end;
$$;

-- =========================================================
-- 15) Queue views for each portal page
-- =========================================================

create or replace view public.be_v_cs_pickup_queue as
select *
from public.be_portal_pickup_requests
order by created_at desc;

create or replace view public.be_v_supervisor_pickup_queue as
select *
from public.be_portal_pickup_requests
where pickup_status in ('PICKUP_REQUESTED', 'RIDER_ASSIGNED', 'PICKUP_COLLECTED')
order by created_at desc;

create or replace view public.be_v_rider_jobs as
select *
from public.be_portal_pickup_requests
where rider_status in ('ASSIGNED', 'COLLECTED')
order by assigned_at desc nulls last, created_at desc;

create or replace view public.be_v_data_entry_queue as
select *
from public.be_portal_pickup_requests
where data_entry_status = 'READY_FOR_DATA_ENTRY'
order by collected_at desc nulls last, created_at desc;

create or replace view public.be_v_warehouse_queue as
select *
from public.be_waybills
where warehouse_status in ('PENDING_RECEIVE', 'RECEIVED')
order by created_at desc;

create or replace view public.be_v_wayplan_queue as
select *
from public.be_waybills
where warehouse_status = 'RECEIVED'
  and wayplan_id is null
order by updated_at desc;

create or replace view public.be_v_dispatch_queue as
select *
from public.be_wayplans
order by dispatch_date desc, created_at desc;

create or replace view public.be_v_finance_cod_queue as
select *
from public.be_cod_settlements
where settlement_status in ('PENDING_SETTLEMENT', 'PARTIALLY_SETTLED')
order by collected_at desc nulls last, created_at desc;

-- =========================================================
-- 16) Permissions for authenticated users
-- =========================================================

grant select on public.be_v_cs_pickup_queue to authenticated;
grant select on public.be_v_supervisor_pickup_queue to authenticated;
grant select on public.be_v_rider_jobs to authenticated;
grant select on public.be_v_data_entry_queue to authenticated;
grant select on public.be_v_warehouse_queue to authenticated;
grant select on public.be_v_wayplan_queue to authenticated;
grant select on public.be_v_dispatch_queue to authenticated;
grant select on public.be_v_finance_cod_queue to authenticated;

grant select, insert, update on public.be_operational_events to authenticated;
grant select, insert, update on public.be_waybills to authenticated;
grant select, insert, update on public.be_wayplans to authenticated;
grant select, insert, update on public.be_cod_settlements to authenticated;

grant execute on function public.be_supervisor_assign_pickup(text,text,text,text,text,text) to authenticated;
grant execute on function public.be_rider_mark_pickup_collected(text,integer,text,text) to authenticated;
grant execute on function public.be_data_entry_create_waybill(text,text,text,text,text,text,text,numeric,text) to authenticated;
grant execute on function public.be_warehouse_receive_waybill(text,text,text,text) to authenticated;
grant execute on function public.be_wayplan_create(text,text,text,date,text,text,text,text,text) to authenticated;
grant execute on function public.be_wayplan_add_waybill(text,text,text) to authenticated;
grant execute on function public.be_dispatch_start_wayplan(text,text) to authenticated;
grant execute on function public.be_dispatch_mark_delivered(text,numeric,text) to authenticated;
grant execute on function public.be_finance_settle_cod(text,numeric,text,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';