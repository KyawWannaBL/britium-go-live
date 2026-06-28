-- Buildfix #34: Persist successful end-to-end role synchronization repairs
-- Safe to rerun. Does not delete data.

begin;

create extension if not exists pgcrypto;

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists requester_type text default 'merchant',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_township text,
  add column if not exists pickup_city text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_township text,
  add column if not exists delivery_city text,
  add column if not exists assigned_branch text,
  add column if not exists warehouse_branch text,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists status text,
  add column if not exists assignment_status text default 'pending_assignment',
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists route_zone text,
  add column if not exists warehouse_status text,
  add column if not exists finance_status text default 'pending',
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.be_app_notifications
  add column if not exists target_role text,
  add column if not exists target_branch text,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists pickup_id text,
  add column if not exists event_type text default 'general',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz default now();

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  event_type text,
  status text,
  source_table text,
  source_key text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists event_type text,
  add column if not exists status text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create or replace function public.zzzz_force_canonical_pickup_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_prefix text;
  wanted_date date;
  wanted_parcels int;
  candidate text;
begin
  if new.requester_type is null or new.requester_type = '' then
    new.requester_type := 'merchant';
  end if;

  if tg_op = 'UPDATE' then
    if old.pickup_id is not null and old.pickup_id <> '' then
      new.pickup_id := old.pickup_id;
    end if;
    if old.pickup_way_id is not null and old.pickup_way_id <> '' then
      new.pickup_way_id := old.pickup_way_id;
    elsif new.pickup_way_id is null or new.pickup_way_id = '' then
      new.pickup_way_id := new.pickup_id;
    end if;
    return new;
  end if;

  if new.pickup_id ~ '^P[0-9]{4}-[A-Z0-9]{3}-[0-9]{3}$' then
    if new.pickup_way_id is null or new.pickup_way_id = '' then
      new.pickup_way_id := new.pickup_id;
    end if;
    return new;
  end if;

  wanted_prefix := public.be_pickup_id_prefix(coalesce(new.payload, '{}'::jsonb), coalesce(new.payload->'master_data_match', '{}'::jsonb), coalesce(new.merchant_code, new.merchant_name, 'GEN'));
  wanted_date := public.be_pickup_request_date(coalesce(new.payload, '{}'::jsonb));
  wanted_parcels := greatest(1, least(coalesce(new.parcel_count, nullif(regexp_replace(coalesce(new.payload->>'parcel_count', '1'), '[^0-9]', '', 'g'), '')::int, 1), 999));
  candidate := public.be_next_cs_pickup_id(wanted_prefix, wanted_date, wanted_parcels);
  new.pickup_id := candidate;
  new.pickup_way_id := candidate;
  return new;
end;
$$;

drop trigger if exists zzzzz_force_unique_pickup_way_id on public.be_portal_pickup_requests;
drop trigger if exists zzzzz_force_canonical_pickup_id on public.be_portal_pickup_requests;

create trigger zzzzz_force_canonical_pickup_id
before insert or update of pickup_id, pickup_way_id, merchant_code, merchant_name, requester_type, parcel_count, payload
on public.be_portal_pickup_requests
for each row
execute function public.zzzz_force_canonical_pickup_id();

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('be_sync_pickup_workflow','be_workflow_notify_roles')
  loop
    execute 'drop function if exists ' || r.fn;
  end loop;
end $$;

drop function if exists public.be_data_entry_queue(integer);
drop function if exists public.be_mobile_go_live_snapshot(text, text, integer);

create or replace function public.be_workflow_notify_roles(
  p_pickup_id text,
  p_event_type text,
  p_roles text[],
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text;
  req record;
  target_branch_value text;
begin
  select * into req
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id or pickup_way_id = p_pickup_id or id::text = p_pickup_id
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'pickup_id', p_pickup_id);
  end if;

  target_branch_value := coalesce(req.assigned_branch, req.warehouse_branch, 'general');

  foreach role_name in array coalesce(p_roles, array[]::text[]) loop
    begin
      insert into public.be_app_notifications (
        target_role, target_branch, title, message, source_table, source_key, pickup_id, event_type, metadata, created_at
      )
      values (
        role_name, target_branch_value, p_title, p_message, 'be_portal_pickup_requests', req.id::text, req.pickup_id, p_event_type, coalesce(p_metadata, '{}'::jsonb), now()
      );
    exception when unique_violation then null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'pickup_id', req.pickup_id, 'event_type', p_event_type, 'target_branch', target_branch_value);
end;
$$;

create or replace function public.be_data_entry_queue(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  rows jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(q) order by q.created_at desc), '[]'::jsonb)
  into rows
  from (
    select id, pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, tracking_number,
      merchant_code, merchant_name, sender_name, sender_phone, pickup_address, pickup_township,
      pickup_city, assigned_branch, parcel_count, cod_amount, status, assignment_status,
      assigned_rider_code, assigned_rider_name, finance_status, cod_status, created_at, updated_at,
      case
        when coalesce(pickup_address, '') = '' then 'missing_pickup_address'
        when coalesce(pickup_township, '') = '' then 'missing_pickup_township'
        when coalesce(pickup_city, '') = '' then 'missing_pickup_city'
        else 'ready_for_supervisor'
      end as data_entry_issue,
      (coalesce(pickup_address, '') <> '' and coalesce(pickup_township, '') <> '' and coalesce(pickup_city, '') <> '') as data_entry_complete
    from public.be_portal_pickup_requests
    where lower(coalesce(status, '')) in ('data_entry_in_progress','pending_assignment','pending_pickup','submitted')
       or coalesce(pickup_address, '') = ''
       or coalesce(pickup_township, '') = ''
       or coalesce(pickup_city, '') = ''
    order by created_at desc nulls last
    limit lim
  ) q;

  return jsonb_build_object('ok', true, 'count', jsonb_array_length(rows), 'items', rows, 'queue', rows);
end;
$$;

create or replace function public.be_mobile_go_live_snapshot(
  p_worker_code text default null,
  p_status text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  worker text := public.be_clean_text(p_worker_code);
  wanted_status text := lower(public.be_clean_text(p_status));
  lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
  jobs jsonb;
  metrics jsonb;
begin
  select coalesce(jsonb_agg(job order by (job->>'created_at') desc), '[]'::jsonb)
  into jobs
  from (
    select jsonb_build_object(
      'id', p.id, 'pickup_id', p.pickup_id, 'pickup_way_id', p.pickup_way_id,
      'deliver_id', p.deliver_id, 'invoice_no', p.invoice_no, 'waybill_no', p.waybill_no,
      'tracking_number', p.tracking_number, 'merchant_code', p.merchant_code,
      'merchant_name', p.merchant_name, 'sender_name', p.sender_name, 'sender_phone', p.sender_phone,
      'pickup_address', p.pickup_address, 'pickup_township', p.pickup_township, 'pickup_city', p.pickup_city,
      'recipient_name', p.recipient_name, 'recipient_phone', p.recipient_phone,
      'delivery_address', p.delivery_address, 'delivery_township', p.delivery_township, 'delivery_city', p.delivery_city,
      'parcel_count', coalesce(p.parcel_count, 1), 'cod_amount', coalesce(p.cod_amount, 0),
      'status', p.status, 'assignment_status', p.assignment_status,
      'assigned_rider_code', p.assigned_rider_code, 'assigned_rider_name', p.assigned_rider_name,
      'assigned_driver_code', p.assigned_driver_code, 'assigned_driver_name', p.assigned_driver_name,
      'assigned_helper_code', p.assigned_helper_code, 'assigned_helper_name', p.assigned_helper_name,
      'route_zone', p.route_zone, 'assigned_branch', p.assigned_branch,
      'warehouse_status', p.warehouse_status, 'finance_status', p.finance_status, 'cod_status', p.cod_status,
      'job_type', case when worker is not null and worker = p.assigned_driver_code then 'driver' when worker is not null and worker = p.assigned_helper_code then 'helper' else 'rider' end,
      'created_at', p.created_at, 'updated_at', p.updated_at, 'payload', coalesce(p.payload, '{}'::jsonb)
    ) as job
    from public.be_portal_pickup_requests p
    where (worker is null or worker = '' or p.assigned_rider_code = worker or p.assigned_driver_code = worker or p.assigned_helper_code = worker)
      and (wanted_status is null or wanted_status = '' or lower(coalesce(p.status, '')) = wanted_status or lower(coalesce(p.assignment_status, '')) = wanted_status)
      and lower(coalesce(p.status, '')) not in ('cancelled', 'closed')
    order by p.created_at desc nulls last
    limit lim
  ) q;

  select jsonb_build_object(
    'assigned_jobs', count(*) filter (where lower(coalesce(assignment_status, '')) = 'assigned'),
    'active_jobs', count(*) filter (where lower(coalesce(status, '')) in ('assigned','picked_up','in_warehouse','sorting','bagged','dispatched','out_for_delivery')),
    'delivered_count', count(*) filter (where lower(coalesce(status, '')) = 'delivered'),
    'failed_attempts', count(*) filter (where lower(coalesce(status, '')) in ('failed','failed_attempt')),
    'pending_cod', coalesce(sum(coalesce(cod_amount, 0)) filter (where coalesce(cod_amount, 0) > 0 and lower(coalesce(cod_status, '')) in ('pending_collection','collected','awaiting_handover')), 0)
  )
  into metrics
  from public.be_portal_pickup_requests p
  where worker is null or worker = '' or p.assigned_rider_code = worker or p.assigned_driver_code = worker or p.assigned_helper_code = worker;

  return jsonb_build_object('ok', true, 'worker_code', worker, 'count', jsonb_array_length(jobs), 'jobs', jobs, 'items', jobs, 'metrics', metrics);
end;
$$;

create or replace function public.be_sync_pickup_workflow(p_pickup_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  new_status text;
  notify_roles text[];
begin
  select * into req
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id or pickup_way_id = p_pickup_id or id::text = p_pickup_id
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'pickup_id', p_pickup_id);
  end if;

  new_status := case
    when coalesce(req.pickup_address, '') = '' or coalesce(req.pickup_township, '') = '' then 'data_entry_in_progress'
    when coalesce(req.assigned_rider_code, '') <> '' or coalesce(req.assignment_status, '') = 'assigned' then 'assigned'
    else 'pending_assignment'
  end;

  update public.be_portal_pickup_requests
  set
    status = case when lower(coalesce(status, '')) in ('delivered','closed','cancelled','returned') then status else new_status end,
    assignment_status = case when coalesce(assigned_rider_code, '') <> '' then 'assigned' else coalesce(nullif(assignment_status, ''), 'pending_assignment') end,
    finance_status = coalesce(nullif(finance_status, ''), 'pending'),
    cod_status = case when coalesce(cod_amount, 0) > 0 then coalesce(nullif(cod_status, ''), 'pending_collection') else coalesce(nullif(cod_status, ''), 'not_applicable') end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('workflow_synced_at', now(), 'workflow_sync_status', new_status, 'workflow_sync_source', 'be_sync_pickup_workflow'),
    updated_at = now()
  where id = req.id
  returning * into req;

  insert into public.be_portal_cargo_events (pickup_id, pickup_way_id, event_type, status, source_table, source_key, metadata, created_at)
  values (
    req.pickup_id, req.pickup_way_id, 'workflow_synced', new_status,
    'be_portal_pickup_requests', req.id::text,
    jsonb_build_object('assigned_rider_code', req.assigned_rider_code, 'assignment_status', req.assignment_status, 'finance_status', req.finance_status, 'cod_status', req.cod_status),
    now()
  );

  notify_roles := case
    when new_status = 'data_entry_in_progress' then array['customer_service','data_entry','operation_manager']
    when new_status = 'assigned' then array['customer_service','supervisor','dispatch','operation_manager','rider','finance']
    else array['customer_service','supervisor','dispatch','operation_manager']
  end;

  perform public.be_workflow_notify_roles(
    req.pickup_id,
    case when new_status = 'data_entry_in_progress' then 'data_entry_required' when new_status = 'assigned' then 'pickup_assigned' else 'assignment_required' end,
    notify_roles,
    case when new_status = 'data_entry_in_progress' then 'Pickup needs Data Entry completion' when new_status = 'assigned' then 'Pickup assigned to field team' else 'Pickup ready for Supervisor assignment' end,
    'Pickup ' || coalesce(req.pickup_id, req.pickup_way_id, req.id::text) || ' has been synchronized.',
    jsonb_build_object('status', new_status)
  );

  return jsonb_build_object(
    'ok', true, 'pickup_id', req.pickup_id, 'pickup_way_id', req.pickup_way_id,
    'status', req.status, 'assignment_status', req.assignment_status,
    'assigned_rider_code', req.assigned_rider_code, 'finance_status', req.finance_status, 'cod_status', req.cod_status,
    'message', 'Pickup workflow synchronized across CS, Data Entry, Supervisor, Rider, Warehouse, and Finance.'
  );
end;
$$;

commit;
