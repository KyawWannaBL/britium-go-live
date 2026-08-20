-- Branch Office SQL fix for:
-- ERROR: column "wayplan_id" does not exist
--
-- Cause:
-- Your existing be_app_notifications or be_portal_cargo_events table was created
-- before the newer branch-office SQL. CREATE TABLE IF NOT EXISTS does not add
-- missing columns to an existing table.
--
-- Run this patch first, then rerun branch_office_backend_patch.sql.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists pickup_id text,
  add column if not exists wayplan_id text,
  add column if not exists job_id text,
  add column if not exists event_type text,
  add column if not exists status text,
  add column if not exists actor_role text,
  add column if not exists actor_id text,
  add column if not exists notes text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table public.be_portal_cargo_events
  alter column event_type set default 'branch_event';

update public.be_portal_cargo_events
set event_type = 'branch_event'
where event_type is null;

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists pickup_id text,
  add column if not exists wayplan_id text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists target_role text,
  add column if not exists target_user_id text,
  add column if not exists target_branch text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create table if not exists public.be_branch_nodes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_branch_nodes
  add column if not exists branch_code text,
  add column if not exists branch_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists active boolean default true,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'be_branch_nodes_branch_code_key'
      and conrelid = 'public.be_branch_nodes'::regclass
  ) then
    alter table public.be_branch_nodes add constraint be_branch_nodes_branch_code_key unique (branch_code);
  end if;
end $$;

insert into public.be_branch_nodes (branch_code, branch_name, city, region, active)
values
  ('MDY', 'Mandalay Branch Office', 'Mandalay', 'Mandalay', true),
  ('NPT', 'Naypyitaw Branch Office', 'Naypyitaw', 'Naypyitaw', true)
on conflict (branch_code) do update set
  branch_name = excluded.branch_name,
  city = excluded.city,
  region = excluded.region,
  active = excluded.active,
  updated_at = now();

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
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
  add column if not exists warehouse_status text,
  add column if not exists rider_id text,
  add column if not exists driver_id text,
  add column if not exists helper_id text,
  add column if not exists vehicle_code text,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'be_portal_pickup_requests_pickup_id_key'
      and conrelid = 'public.be_portal_pickup_requests'::regclass
  ) then
    alter table public.be_portal_pickup_requests add constraint be_portal_pickup_requests_pickup_id_key unique (pickup_id);
  end if;
exception
  when others then
    -- Existing duplicate pickup_id rows can block a unique constraint.
    -- The branch page still works without the constraint.
    null;
end $$;

create table if not exists public.be_branch_transfers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_branch_transfers
  add column if not exists transfer_number text,
  add column if not exists from_branch_code text,
  add column if not exists to_branch_code text,
  add column if not exists status text default 'prepared',
  add column if not exists pickup_count integer default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists vehicle_code text,
  add column if not exists bag_code text,
  add column if not exists seal_code text,
  add column if not exists notes text,
  add column if not exists created_by text,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'be_branch_transfers_transfer_number_key'
      and conrelid = 'public.be_branch_transfers'::regclass
  ) then
    alter table public.be_branch_transfers add constraint be_branch_transfers_transfer_number_key unique (transfer_number);
  end if;
end $$;

create table if not exists public.be_branch_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid,
  pickup_id text,
  created_at timestamptz default now()
);

alter table public.be_branch_transfer_items
  add column if not exists transfer_id uuid,
  add column if not exists pickup_id text,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_be_pickups_branch on public.be_portal_pickup_requests(branch_code);
create index if not exists idx_be_pickups_pickup_id on public.be_portal_pickup_requests(pickup_id);
create index if not exists idx_be_notifications_branch on public.be_app_notifications(target_branch);
create index if not exists idx_be_notifications_wayplan on public.be_app_notifications(wayplan_id);
create index if not exists idx_be_cargo_pickup on public.be_portal_cargo_events(pickup_id);
create index if not exists idx_be_cargo_wayplan on public.be_portal_cargo_events(wayplan_id);
create index if not exists idx_be_transfers_from_to on public.be_branch_transfers(from_branch_code, to_branch_code);

create or replace function public.be_branch_nodes_list()
returns setof public.be_branch_nodes
language sql
stable
as $$
  select *
  from public.be_branch_nodes
  where active = true
  order by branch_code;
$$;

create or replace function public.be_branch_office_snapshot(p_branch_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(coalesce(p_branch_code, 'MDY'));
  v_branch jsonb;
  v_pickups jsonb;
  v_notifications jsonb;
  v_events jsonb;
  v_transfers jsonb;
begin
  select to_jsonb(b)
  into v_branch
  from public.be_branch_nodes b
  where b.branch_code = v_code
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  into v_pickups
  from public.be_portal_pickup_requests p
  where
    upper(coalesce(p.branch_code, '')) = v_code
    or upper(coalesce(p.city_region, '')) like case when v_code = 'MDY' then '%MANDALAY%' when v_code = 'NPT' then '%NAYPYITAW%' else '%' || v_code || '%' end
    or upper(coalesce(p.pickup_address, '')) like case when v_code = 'MDY' then '%MANDALAY%' when v_code = 'NPT' then '%NAYPYITAW%' else '%' || v_code || '%' end
    or (v_code = 'NPT' and upper(coalesce(p.pickup_address, '')) like '%NAYPYIDAW%');

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.be_app_notifications n
  where upper(coalesce(n.target_branch, '')) = v_code
     or lower(coalesce(n.target_role, '')) = 'branch';

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select e.*
    from public.be_portal_cargo_events e
    where e.pickup_id in (
      select p.pickup_id
      from public.be_portal_pickup_requests p
      where upper(coalesce(p.branch_code, '')) = v_code
    )
    order by e.created_at desc
    limit 200
  ) e;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_transfers
  from public.be_branch_transfers t
  where upper(coalesce(t.from_branch_code, '')) = v_code
     or upper(coalesce(t.to_branch_code, '')) = v_code;

  return jsonb_build_object(
    'branch', v_branch,
    'pickups', v_pickups,
    'notifications', v_notifications,
    'cargo_events', v_events,
    'transfers', v_transfers
  );
end;
$$;

create or replace function public.be_branch_office_update_pickup_status(
  p_branch_code text,
  p_pickup_id text,
  p_status text,
  p_notes text default null,
  p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.be_portal_pickup_requests
  set
    status = p_status,
    warehouse_status = p_status,
    branch_code = coalesce(branch_code, upper(p_branch_code)),
    updated_at = now()
  where pickup_id = p_pickup_id;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Pickup ID % not found', p_pickup_id;
  end if;

  insert into public.be_portal_cargo_events (
    pickup_id,
    event_type,
    status,
    actor_role,
    actor_id,
    notes,
    metadata
  )
  values (
    p_pickup_id,
    'branch_status_update',
    p_status,
    'branch',
    p_actor_id,
    p_notes,
    jsonb_build_object('branch_code', upper(p_branch_code))
  );

  insert into public.be_app_notifications (
    pickup_id,
    source_table,
    source_key,
    target_role,
    target_branch,
    title,
    body,
    metadata
  )
  values (
    p_pickup_id,
    'be_portal_pickup_requests',
    p_pickup_id,
    'operation_manager',
    upper(p_branch_code),
    'Branch status updated',
    'Pickup ' || p_pickup_id || ' updated to ' || p_status || ' at ' || upper(p_branch_code),
    jsonb_build_object('status', p_status, 'branch_code', upper(p_branch_code))
  );

  return jsonb_build_object('ok', true, 'pickup_id', p_pickup_id, 'status', p_status);
end;
$$;

create or replace function public.be_branch_office_receive_pickup(
  p_branch_code text,
  p_pickup_id text,
  p_condition text default 'good',
  p_shelf_bin text default null,
  p_notes text default null,
  p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
begin
  perform public.be_branch_office_update_pickup_status(
    p_branch_code,
    p_pickup_id,
    case when p_condition in ('damaged', 'mismatch', 'missing') then 'branch_exception' else 'branch_received' end,
    p_notes,
    p_actor_id
  );

  insert into public.be_portal_cargo_events (
    pickup_id,
    event_type,
    status,
    actor_role,
    actor_id,
    notes,
    metadata
  )
  values (
    p_pickup_id,
    'branch_received',
    p_condition,
    'branch',
    p_actor_id,
    p_notes,
    jsonb_build_object(
      'branch_code', upper(p_branch_code),
      'condition', p_condition,
      'shelf_bin', p_shelf_bin
    )
  );

  return jsonb_build_object('ok', true, 'pickup_id', p_pickup_id, 'condition', p_condition);
end;
$$;

create or replace function public.be_branch_office_create_transfer(
  p_from_branch_code text,
  p_to_branch_code text,
  p_pickup_ids text[],
  p_vehicle_code text default null,
  p_bag_code text default null,
  p_seal_code text default null,
  p_actor_id text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_transfer_id uuid;
  v_transfer_number text;
  v_pickup_id text;
  v_count integer := 0;
  v_cod numeric := 0;
begin
  if array_length(p_pickup_ids, 1) is null then
    raise exception 'At least one pickup ID is required';
  end if;

  select coalesce(sum(cod_amount), 0), count(*)
  into v_cod, v_count
  from public.be_portal_pickup_requests
  where pickup_id = any(p_pickup_ids);

  v_transfer_number := 'BT-' || upper(p_from_branch_code) || '-' || upper(p_to_branch_code) || '-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

  insert into public.be_branch_transfers (
    transfer_number,
    from_branch_code,
    to_branch_code,
    status,
    pickup_count,
    cod_amount,
    vehicle_code,
    bag_code,
    seal_code,
    notes,
    created_by
  )
  values (
    v_transfer_number,
    upper(p_from_branch_code),
    upper(p_to_branch_code),
    'prepared',
    v_count,
    v_cod,
    p_vehicle_code,
    p_bag_code,
    p_seal_code,
    p_notes,
    p_actor_id
  )
  returning id into v_transfer_id;

  foreach v_pickup_id in array p_pickup_ids loop
    insert into public.be_branch_transfer_items (transfer_id, pickup_id)
    values (v_transfer_id, v_pickup_id);

    update public.be_portal_pickup_requests
    set status = 'branch_transfer_prepared',
        warehouse_status = 'branch_transfer_prepared',
        updated_at = now()
    where pickup_id = v_pickup_id;

    insert into public.be_portal_cargo_events (
      pickup_id,
      event_type,
      status,
      actor_role,
      actor_id,
      notes,
      metadata
    )
    values (
      v_pickup_id,
      'branch_transfer_prepared',
      'prepared',
      'branch',
      p_actor_id,
      p_notes,
      jsonb_build_object(
        'transfer_number', v_transfer_number,
        'from_branch_code', upper(p_from_branch_code),
        'to_branch_code', upper(p_to_branch_code),
        'vehicle_code', p_vehicle_code,
        'bag_code', p_bag_code,
        'seal_code', p_seal_code
      )
    );
  end loop;

  insert into public.be_app_notifications (
    source_table,
    source_key,
    target_role,
    target_branch,
    title,
    body,
    metadata
  )
  values (
    'be_branch_transfers',
    v_transfer_number,
    'branch',
    upper(p_to_branch_code),
    'Incoming branch transfer',
    'Transfer ' || v_transfer_number || ' is prepared from ' || upper(p_from_branch_code),
    jsonb_build_object('transfer_number', v_transfer_number, 'pickup_count', v_count)
  );

  return jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'transfer_number', v_transfer_number,
    'pickup_count', v_count,
    'cod_amount', v_cod
  );
end;
$$;

alter table public.be_branch_nodes enable row level security;
alter table public.be_portal_pickup_requests enable row level security;
alter table public.be_portal_cargo_events enable row level security;
alter table public.be_app_notifications enable row level security;
alter table public.be_branch_transfers enable row level security;
alter table public.be_branch_transfer_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'be_branch_nodes',
    'be_portal_pickup_requests',
    'be_portal_cargo_events',
    'be_app_notifications',
    'be_branch_transfers',
    'be_branch_transfer_items'
  ] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);
    execute format('drop policy if exists %I_insert_auth on public.%I', t, t);
    execute format('drop policy if exists %I_update_auth on public.%I', t, t);
    execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert_auth on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_update_auth on public.%I for update to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
