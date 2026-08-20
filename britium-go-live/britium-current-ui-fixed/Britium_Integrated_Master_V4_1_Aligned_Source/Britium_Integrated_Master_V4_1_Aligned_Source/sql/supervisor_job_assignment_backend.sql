-- Supervisor job assignment, wayplan, dispatch, and tracking backend.
-- No mock data. No sample rows.
-- This creates working backend functions for the Supervisor Portal workflow.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null unique,
  source text,
  requester_type text,
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  township text,
  city_region text,
  branch_code text,
  parcel_count integer default 0,
  cod_amount numeric default 0,
  status text default 'submitted',
  assignment_status text default 'unassigned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  assigned_by text,
  assigned_at timestamptz,
  supervisor_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists source text,
  add column if not exists requester_type text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists city_region text,
  add column if not exists branch_code text,
  add column if not exists parcel_count integer default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists status text default 'submitted',
  add column if not exists assignment_status text default 'unassigned',
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists assigned_by text,
  add column if not exists assigned_at timestamptz,
  add column if not exists supervisor_note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_mobile_workforce_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  workforce_code text unique,
  full_name text not null,
  phone text,
  role text not null,
  branch_code text,
  zone text,
  vehicle_code text,
  status text default 'available',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_mobile_workforce_accounts
  add column if not exists auth_user_id uuid,
  add column if not exists workforce_code text,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists role text,
  add column if not exists branch_code text,
  add column if not exists zone text,
  add column if not exists vehicle_code text,
  add column if not exists status text default 'available',
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_supervisor_job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id text unique default ('JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  pickup_id text not null,
  job_type text not null check (job_type in ('order_picking', 'delivery', 'pickup', 'both')),
  status text not null default 'assigned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  assigned_by text,
  assigned_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz default now(),
  unique (pickup_id, job_type)
);

create table if not exists public.be_order_picking_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text unique default ('OP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  pickup_id text not null unique,
  status text not null default 'assigned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  assigned_by text,
  assigned_at timestamptz default now(),
  picked_at timestamptz,
  warehouse_received_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.be_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text unique default ('DJ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  pickup_id text,
  wayplan_id text,
  stop_id uuid,
  status text not null default 'assigned',
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  assigned_by text,
  assigned_at timestamptz default now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplans (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text not null unique,
  status text default 'planned',
  pickup_count integer default 0,
  stop_count integer default 0,
  rider_id text,
  driver_id text,
  helper_id text,
  vehicle_code text,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  dispatched_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_stops (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text not null references public.be_wayplans(wayplan_id) on delete cascade,
  pickup_id text not null,
  stop_no integer not null,
  merchant_name text,
  pickup_address text,
  township text,
  cod_amount numeric default 0,
  status text default 'planned',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (wayplan_id, pickup_id)
);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  wayplan_id text,
  job_id text,
  event_type text not null,
  status text,
  actor_role text,
  actor_id text,
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  wayplan_id text,
  source_table text,
  source_key text,
  target_role text,
  target_user_id text,
  target_branch text,
  title text,
  body text,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_be_supervisor_job_assignments_pickup on public.be_supervisor_job_assignments(pickup_id);
create index if not exists idx_be_order_picking_jobs_pickup on public.be_order_picking_jobs(pickup_id);
create index if not exists idx_be_delivery_jobs_wayplan on public.be_delivery_jobs(wayplan_id);
create index if not exists idx_be_wayplan_stops_wayplan on public.be_wayplan_stops(wayplan_id);
create index if not exists idx_be_cargo_events_pickup on public.be_portal_cargo_events(pickup_id);
create index if not exists idx_be_notifications_role on public.be_app_notifications(target_role);

create or replace function public.be_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_pickups on public.be_portal_pickup_requests;
create trigger trg_touch_pickups before update on public.be_portal_pickup_requests
for each row execute function public.be_touch_updated_at();

drop trigger if exists trg_touch_workforce on public.be_mobile_workforce_accounts;
create trigger trg_touch_workforce before update on public.be_mobile_workforce_accounts
for each row execute function public.be_touch_updated_at();

drop trigger if exists trg_touch_assignments on public.be_supervisor_job_assignments;
create trigger trg_touch_assignments before update on public.be_supervisor_job_assignments
for each row execute function public.be_touch_updated_at();

drop trigger if exists trg_touch_picking_jobs on public.be_order_picking_jobs;
create trigger trg_touch_picking_jobs before update on public.be_order_picking_jobs
for each row execute function public.be_touch_updated_at();

drop trigger if exists trg_touch_delivery_jobs on public.be_delivery_jobs;
create trigger trg_touch_delivery_jobs before update on public.be_delivery_jobs
for each row execute function public.be_touch_updated_at();

drop trigger if exists trg_touch_wayplans on public.be_wayplans;
create trigger trg_touch_wayplans before update on public.be_wayplans
for each row execute function public.be_touch_updated_at();

create or replace function public.be_supervisor_portal_snapshot()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickups jsonb;
  v_workforce jsonb;
  v_assignments jsonb;
  v_wayplans jsonb;
  v_events jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  into v_pickups
  from public.be_portal_pickup_requests p;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.role, w.full_name), '[]'::jsonb)
  into v_workforce
  from public.be_mobile_workforce_accounts w
  where coalesce(w.active, true) = true;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.assigned_at desc), '[]'::jsonb)
  into v_assignments
  from public.be_supervisor_job_assignments a;

  select coalesce(jsonb_agg(to_jsonb(wp) order by wp.created_at desc), '[]'::jsonb)
  into v_wayplans
  from public.be_wayplans wp;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select *
    from public.be_portal_cargo_events
    order by created_at desc
    limit 150
  ) e;

  return jsonb_build_object(
    'pickups', v_pickups,
    'workforce', v_workforce,
    'assignments', v_assignments,
    'wayplans', v_wayplans,
    'cargo_events', v_events
  );
end;
$$;

create or replace function public.be_supervisor_assign_job(
  p_pickup_id text,
  p_job_type text,
  p_rider_id text default null,
  p_driver_id text default null,
  p_helper_id text default null,
  p_vehicle_code text default null,
  p_assigned_by text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup public.be_portal_pickup_requests;
  v_types text[];
  v_type text;
  v_job public.be_supervisor_job_assignments;
begin
  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id;

  if v_pickup.pickup_id is null then
    raise exception 'Pickup ID % not found', p_pickup_id;
  end if;

  if p_job_type = 'both' then
    v_types := array['order_picking', 'delivery'];
  else
    v_types := array[p_job_type];
  end if;

  foreach v_type in array v_types loop
    insert into public.be_supervisor_job_assignments (
      pickup_id,
      job_type,
      status,
      rider_id,
      driver_id,
      helper_id,
      vehicle_code,
      notes,
      assigned_by
    )
    values (
      p_pickup_id,
      v_type,
      'assigned',
      p_rider_id,
      p_driver_id,
      p_helper_id,
      p_vehicle_code,
      p_notes,
      p_assigned_by
    )
    on conflict (pickup_id, job_type) do update set
      status = 'assigned',
      rider_id = excluded.rider_id,
      driver_id = excluded.driver_id,
      helper_id = excluded.helper_id,
      vehicle_code = excluded.vehicle_code,
      notes = excluded.notes,
      assigned_by = excluded.assigned_by,
      assigned_at = now(),
      updated_at = now()
    returning * into v_job;

    if v_type = 'order_picking' then
      insert into public.be_order_picking_jobs (
        pickup_id,
        status,
        rider_id,
        driver_id,
        helper_id,
        vehicle_code,
        notes,
        assigned_by
      )
      values (
        p_pickup_id,
        'assigned',
        p_rider_id,
        p_driver_id,
        p_helper_id,
        p_vehicle_code,
        p_notes,
        p_assigned_by
      )
      on conflict (pickup_id) do update set
        status = 'assigned',
        rider_id = excluded.rider_id,
        driver_id = excluded.driver_id,
        helper_id = excluded.helper_id,
        vehicle_code = excluded.vehicle_code,
        notes = excluded.notes,
        assigned_by = excluded.assigned_by,
        assigned_at = now(),
        updated_at = now();
    end if;

    insert into public.be_portal_cargo_events (
      pickup_id,
      job_id,
      event_type,
      status,
      actor_role,
      actor_id,
      notes,
      metadata
    )
    values (
      p_pickup_id,
      v_job.job_id,
      'supervisor_job_assigned',
      'assigned',
      'supervisor',
      p_assigned_by,
      p_notes,
      jsonb_build_object(
        'job_type', v_type,
        'rider_id', p_rider_id,
        'driver_id', p_driver_id,
        'helper_id', p_helper_id,
        'vehicle_code', p_vehicle_code
      )
    );

    insert into public.be_app_notifications (
      pickup_id,
      source_table,
      source_key,
      target_role,
      target_user_id,
      target_branch,
      title,
      body,
      metadata
    )
    values
      (p_pickup_id, 'be_supervisor_job_assignments', v_job.job_id, 'rider', p_rider_id, v_pickup.branch_code, 'New supervisor assignment', 'You have a new ' || v_type || ' job for pickup ' || p_pickup_id, jsonb_build_object('job_id', v_job.job_id, 'job_type', v_type)),
      (p_pickup_id, 'be_supervisor_job_assignments', v_job.job_id, 'driver', p_driver_id, v_pickup.branch_code, 'New supervisor assignment', 'You have a new ' || v_type || ' job for pickup ' || p_pickup_id, jsonb_build_object('job_id', v_job.job_id, 'job_type', v_type)),
      (p_pickup_id, 'be_supervisor_job_assignments', v_job.job_id, 'helper', p_helper_id, v_pickup.branch_code, 'New supervisor assignment', 'You have a new ' || v_type || ' job for pickup ' || p_pickup_id, jsonb_build_object('job_id', v_job.job_id, 'job_type', v_type));
  end loop;

  update public.be_portal_pickup_requests
  set
    status = 'assigned',
    assignment_status = 'assigned',
    rider_id = p_rider_id,
    driver_id = p_driver_id,
    helper_id = p_helper_id,
    vehicle_code = p_vehicle_code,
    assigned_by = p_assigned_by,
    assigned_at = now(),
    supervisor_note = p_notes
  where pickup_id = p_pickup_id;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'job_type', p_job_type
  );
end;
$$;

create or replace function public.be_supervisor_generate_wayplan(
  p_pickup_ids text[],
  p_created_by text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_wayplan_id text;
  v_pickup_id text;
  v_stop_no integer := 0;
  v_pickup public.be_portal_pickup_requests;
begin
  if array_length(p_pickup_ids, 1) is null then
    raise exception 'At least one pickup ID is required';
  end if;

  v_wayplan_id := 'WP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

  insert into public.be_wayplans (
    wayplan_id,
    status,
    pickup_count,
    stop_count,
    notes,
    created_by
  )
  values (
    v_wayplan_id,
    'planned',
    array_length(p_pickup_ids, 1),
    array_length(p_pickup_ids, 1),
    p_notes,
    p_created_by
  );

  foreach v_pickup_id in array p_pickup_ids loop
    select * into v_pickup
    from public.be_portal_pickup_requests
    where pickup_id = v_pickup_id;

    if v_pickup.pickup_id is not null then
      v_stop_no := v_stop_no + 1;

      insert into public.be_wayplan_stops (
        wayplan_id,
        pickup_id,
        stop_no,
        merchant_name,
        pickup_address,
        township,
        cod_amount,
        status
      )
      values (
        v_wayplan_id,
        v_pickup_id,
        v_stop_no,
        v_pickup.merchant_name,
        v_pickup.pickup_address,
        v_pickup.township,
        v_pickup.cod_amount,
        'planned'
      )
      on conflict (wayplan_id, pickup_id) do nothing;

      update public.be_portal_pickup_requests
      set status = 'wayplan_generated'
      where pickup_id = v_pickup_id;

      insert into public.be_portal_cargo_events (
        pickup_id,
        wayplan_id,
        event_type,
        status,
        actor_role,
        actor_id,
        notes
      )
      values (
        v_pickup_id,
        v_wayplan_id,
        'wayplan_generated',
        'planned',
        'supervisor',
        p_created_by,
        p_notes
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan_id,
    'pickup_count', array_length(p_pickup_ids, 1)
  );
end;
$$;

create or replace function public.be_supervisor_dispatch_wayplan(
  p_wayplan_id text,
  p_rider_id text default null,
  p_driver_id text default null,
  p_helper_id text default null,
  p_vehicle_code text default null,
  p_actor_id text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_stop record;
begin
  if not exists (select 1 from public.be_wayplans where wayplan_id = p_wayplan_id) then
    raise exception 'Wayplan ID % not found', p_wayplan_id;
  end if;

  update public.be_wayplans
  set
    status = 'dispatched',
    rider_id = p_rider_id,
    driver_id = p_driver_id,
    helper_id = p_helper_id,
    vehicle_code = p_vehicle_code,
    dispatched_at = now(),
    updated_at = now()
  where wayplan_id = p_wayplan_id;

  for v_stop in
    select *
    from public.be_wayplan_stops
    where wayplan_id = p_wayplan_id
    order by stop_no
  loop
    insert into public.be_delivery_jobs (
      pickup_id,
      wayplan_id,
      stop_id,
      status,
      rider_id,
      driver_id,
      helper_id,
      vehicle_code,
      notes,
      assigned_by
    )
    values (
      v_stop.pickup_id,
      p_wayplan_id,
      v_stop.id,
      'assigned',
      p_rider_id,
      p_driver_id,
      p_helper_id,
      p_vehicle_code,
      p_notes,
      p_actor_id
    );

    update public.be_wayplan_stops
    set status = 'dispatched'
    where id = v_stop.id;

    update public.be_portal_pickup_requests
    set
      status = 'dispatch_assigned',
      rider_id = p_rider_id,
      driver_id = p_driver_id,
      helper_id = p_helper_id,
      vehicle_code = p_vehicle_code
    where pickup_id = v_stop.pickup_id;

    insert into public.be_portal_cargo_events (
      pickup_id,
      wayplan_id,
      event_type,
      status,
      actor_role,
      actor_id,
      notes,
      metadata
    )
    values (
      v_stop.pickup_id,
      p_wayplan_id,
      'fleet_dispatched',
      'assigned',
      'supervisor',
      p_actor_id,
      p_notes,
      jsonb_build_object(
        'rider_id', p_rider_id,
        'driver_id', p_driver_id,
        'helper_id', p_helper_id,
        'vehicle_code', p_vehicle_code
      )
    );
  end loop;

  insert into public.be_app_notifications (
    wayplan_id,
    source_table,
    source_key,
    target_role,
    target_user_id,
    title,
    body,
    metadata
  )
  values
    (p_wayplan_id, 'be_wayplans', p_wayplan_id, 'rider', p_rider_id, 'Wayplan dispatched', 'Wayplan ' || p_wayplan_id || ' has been dispatched to you.', jsonb_build_object('wayplan_id', p_wayplan_id)),
    (p_wayplan_id, 'be_wayplans', p_wayplan_id, 'driver', p_driver_id, 'Wayplan dispatched', 'Wayplan ' || p_wayplan_id || ' has been dispatched to you.', jsonb_build_object('wayplan_id', p_wayplan_id)),
    (p_wayplan_id, 'be_wayplans', p_wayplan_id, 'helper', p_helper_id, 'Wayplan dispatched', 'Wayplan ' || p_wayplan_id || ' has been dispatched to you.', jsonb_build_object('wayplan_id', p_wayplan_id));

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', p_wayplan_id
  );
end;
$$;

alter table public.be_portal_pickup_requests enable row level security;
alter table public.be_mobile_workforce_accounts enable row level security;
alter table public.be_supervisor_job_assignments enable row level security;
alter table public.be_order_picking_jobs enable row level security;
alter table public.be_delivery_jobs enable row level security;
alter table public.be_wayplans enable row level security;
alter table public.be_wayplan_stops enable row level security;
alter table public.be_portal_cargo_events enable row level security;
alter table public.be_app_notifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'be_portal_pickup_requests',
    'be_mobile_workforce_accounts',
    'be_supervisor_job_assignments',
    'be_order_picking_jobs',
    'be_delivery_jobs',
    'be_wayplans',
    'be_wayplan_stops',
    'be_portal_cargo_events',
    'be_app_notifications'
  ] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);
    execute format('drop policy if exists %I_insert_auth on public.%I', t, t);
    execute format('drop policy if exists %I_update_auth on public.%I', t, t);
    execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert_auth on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update_auth on public.%I for update to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
