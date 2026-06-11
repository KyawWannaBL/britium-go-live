-- Buildfix #33: End-to-end workflow synchronization bridge
-- Purpose:
--   Keep Customer Service, Data Entry, Supervisor, Rider/Driver/Helper, Warehouse, and Finance
--   synchronized from the same be_portal_pickup_requests record.
-- Safe to rerun. It does not delete operational data.

begin;

create extension if not exists pgcrypto;

-- 1) Ensure the canonical pickup table has the workflow columns every role needs.
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
  add column if not exists delivery_address text,
  add column if not exists delivery_township text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists assigned_branch text default 'YGN',
  add column if not exists route_zone text,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text default 'Standard',
  add column if not exists status text default 'submitted',
  add column if not exists data_entry_status text default 'pending',
  add column if not exists assignment_status text default 'pending_assignment',
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_by uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists warehouse_status text,
  add column if not exists warehouse_branch text,
  add column if not exists last_scan_type text,
  add column if not exists last_scan_at timestamptz,
  add column if not exists bag_code text,
  add column if not exists expected_parcel_count integer,
  add column if not exists scanned_parcel_count integer,
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists finance_status text default 'pending',
  add column if not exists settlement_status text default 'pending',
  add column if not exists settlement_batch text,
  add column if not exists source text default 'customer_service',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_portal_pickup_requests
set
  requester_type = coalesce(nullif(requester_type, ''), 'merchant'),
  parcel_count = greatest(1, coalesce(parcel_count, 1)),
  cod_amount = coalesce(cod_amount, 0),
  payment_terms = coalesce(nullif(payment_terms, ''), 'COD'),
  tariff_code = coalesce(nullif(tariff_code, ''), 'Standard'),
  assigned_branch = coalesce(nullif(assigned_branch, ''), 'YGN'),
  payload = coalesce(payload, '{}'::jsonb),
  updated_at = now()
where requester_type is null
   or parcel_count is null
   or cod_amount is null
   or payment_terms is null
   or tariff_code is null
   or assigned_branch is null
   or payload is null;

-- 2) Shared event stream for Customer Service, tracking, Supervisor, Warehouse, Rider App, and Finance.
create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  tracking_number text,
  event_type text not null,
  status text,
  actor_type text,
  actor_code text,
  branch_code text,
  route_zone text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists event_type text,
  add column if not exists status text,
  add column if not exists actor_type text,
  add column if not exists actor_code text,
  add column if not exists branch_code text,
  add column if not exists route_zone text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists be_portal_cargo_events_pickup_idx on public.be_portal_cargo_events(pickup_id);
create index if not exists be_portal_cargo_events_waybill_idx on public.be_portal_cargo_events(waybill_no);

-- 3) Role notification bridge.
create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  target_role text,
  target_branch text,
  title text,
  message text,
  source_table text,
  source_key text,
  pickup_id text,
  event_type text,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists target_role text,
  add column if not exists target_branch text,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists pickup_id text,
  add column if not exists event_type text,
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists be_app_notifications_role_idx on public.be_app_notifications(target_role, target_branch, read_at);

-- 4) Warehouse scan table.
create table if not exists public.be_warehouse_scans (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  waybill_no text,
  scan_type text,
  warehouse_branch text,
  operator_code text,
  bag_code text,
  route_zone text,
  expected_parcel_count integer,
  scanned_parcel_count integer,
  status text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_warehouse_scans
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists waybill_no text,
  add column if not exists scan_type text,
  add column if not exists warehouse_branch text,
  add column if not exists operator_code text,
  add column if not exists bag_code text,
  add column if not exists route_zone text,
  add column if not exists expected_parcel_count integer,
  add column if not exists scanned_parcel_count integer,
  add column if not exists status text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

-- 5) COD ledger for finance.
create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  tracking_number text,
  merchant_code text,
  merchant_name text,
  rider_code text,
  rider_name text,
  cod_expected numeric default 0,
  cod_collected numeric default 0,
  cod_handed_over numeric default 0,
  cod_status text default 'pending_collection',
  status text default 'pending_collection',
  settlement_batch text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_cod_ledger
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists rider_code text,
  add column if not exists rider_name text,
  add column if not exists cod_expected numeric default 0,
  add column if not exists cod_collected numeric default 0,
  add column if not exists cod_handed_over numeric default 0,
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists status text default 'pending_collection',
  add column if not exists settlement_batch text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists be_cod_ledger_pickup_idx on public.be_cod_ledger(pickup_id);
create index if not exists be_cod_ledger_waybill_idx on public.be_cod_ledger(waybill_no);

-- Helper: clean string safely, preserving existing behavior if Buildfix #30 already installed it.
create or replace function public.be_workflow_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '')
$$;

-- Helper: derive operational IDs from Pickup ID.
create or replace function public.be_workflow_ids_from_pickup(p_pickup_id text, p_parcel_count integer default 1)
returns jsonb
language plpgsql
stable
as $$
declare
  p text := public.be_workflow_text(p_pickup_id);
  parts text[];
  mmdd text;
  code text;
  count_no int;
  pickup_no int;
begin
  if p is null or p !~ '^P[0-9]{4}-[A-Za-z0-9]+-[0-9]{3}$' then
    return jsonb_build_object(
      'pickup_id', p,
      'pickup_way_id', p,
      'deliver_id', null,
      'invoice_no', null,
      'waybill_no', null
    );
  end if;

  parts := string_to_array(p, '-');
  mmdd := substring(parts[1] from 2);
  code := upper(parts[2]);
  count_no := greatest(1, least(coalesce(p_parcel_count, parts[3]::int, 1), 999));
  pickup_no := parts[3]::int;

  return jsonb_build_object(
    'pickup_id', p,
    'pickup_way_id', p,
    'deliver_id', 'D' || mmdd || '-' || code || '-' || lpad((pickup_no + 1)::text, 3, '0'),
    'invoice_no', 'I' || mmdd || '-' || code || '-' || lpad(count_no::text, 3, '0'),
    'waybill_no', 'W' || mmdd || '-' || code || '-' || lpad(count_no::text, 3, '0')
  );
end;
$$;

create or replace function public.be_workflow_emit_event(
  p_pickup_id text,
  p_event_type text,
  p_status text default null,
  p_actor_type text default null,
  p_actor_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
begin
  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
     or pickup_way_id = p_pickup_id
     or waybill_no = p_pickup_id
     or tracking_number = p_pickup_id
     or id::text = p_pickup_id
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return;
  end if;

  insert into public.be_portal_cargo_events (
    pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, tracking_number,
    event_type, status, actor_type, actor_code, branch_code, route_zone, metadata, created_at
  )
  values (
    req.pickup_id, req.pickup_way_id, req.deliver_id, req.invoice_no, req.waybill_no, req.tracking_number,
    coalesce(p_event_type, 'workflow_event'), coalesce(p_status, req.status),
    p_actor_type, p_actor_code, req.assigned_branch, req.route_zone, coalesce(p_metadata, '{}'::jsonb), now()
  );
end;
$$;

create or replace function public.be_workflow_notify_roles(
  p_pickup_id text,
  p_event_type text,
  p_roles text[],
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  role_name text;
begin
  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
     or pickup_way_id = p_pickup_id
     or waybill_no = p_pickup_id
     or tracking_number = p_pickup_id
     or id::text = p_pickup_id
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return;
  end if;

  foreach role_name in array p_roles loop
    insert into public.be_app_notifications (
      target_role, target_branch, title, message, source_table, source_key,
      pickup_id, event_type, metadata, created_at
    )
    values (
      role_name, req.assigned_branch, p_title, p_message, 'be_portal_pickup_requests', req.id::text,
      req.pickup_id, p_event_type, coalesce(p_metadata, '{}'::jsonb), now()
    );
  end loop;
end;
$$;

-- Core reconciliation. Run this for one pickup or all pickups.
create or replace function public.be_sync_pickup_workflow(p_lookup text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  ids jsonb;
  new_status text;
  synced int := 0;
begin
  for req in
    select *
    from public.be_portal_pickup_requests
    where p_lookup is null
       or pickup_id = p_lookup
       or pickup_way_id = p_lookup
       or waybill_no = p_lookup
       or tracking_number = p_lookup
       or id::text = p_lookup
    order by created_at desc nulls last
  loop
    ids := public.be_workflow_ids_from_pickup(coalesce(req.pickup_id, req.pickup_way_id), req.parcel_count);

    new_status := case
      when public.be_workflow_text(req.pickup_address) is null
        or public.be_workflow_text(req.pickup_township) is null
      then 'data_entry_in_progress'
      when public.be_workflow_text(req.assigned_rider_code) is not null
        or public.be_workflow_text(req.assigned_driver_code) is not null
        or public.be_workflow_text(req.assigned_helper_code) is not null
      then coalesce(nullif(req.status, 'submitted'), 'assigned')
      else 'pending_assignment'
    end;

    update public.be_portal_pickup_requests
    set
      pickup_id = coalesce(public.be_workflow_text(pickup_id), ids->>'pickup_id'),
      pickup_way_id = coalesce(public.be_workflow_text(pickup_way_id), public.be_workflow_text(pickup_id), ids->>'pickup_way_id'),
      deliver_id = coalesce(public.be_workflow_text(deliver_id), ids->>'deliver_id'),
      invoice_no = coalesce(public.be_workflow_text(invoice_no), ids->>'invoice_no'),
      waybill_no = coalesce(public.be_workflow_text(waybill_no), ids->>'waybill_no'),
      tracking_number = coalesce(public.be_workflow_text(tracking_number), public.be_workflow_text(waybill_no), ids->>'waybill_no'),
      expected_parcel_count = coalesce(expected_parcel_count, parcel_count),
      requester_type = coalesce(public.be_workflow_text(requester_type), 'merchant'),
      assigned_branch = coalesce(public.be_workflow_text(assigned_branch), 'YGN'),
      data_entry_status = case when new_status = 'data_entry_in_progress' then 'required' else 'complete' end,
      assignment_status = case
        when public.be_workflow_text(assigned_rider_code) is not null
          or public.be_workflow_text(assigned_driver_code) is not null
          or public.be_workflow_text(assigned_helper_code) is not null
        then 'assigned'
        else 'pending_assignment'
      end,
      status = case
        when lower(coalesce(status,'')) in ('delivered','failed_attempt','returned','closed','in_warehouse','sorting','bagged','dispatched','out_for_delivery')
        then status
        else new_status
      end,
      finance_status = coalesce(public.be_workflow_text(finance_status), 'pending'),
      cod_status = case
        when coalesce(cod_amount, 0) > 0 then coalesce(public.be_workflow_text(cod_status), 'pending_collection')
        else 'not_applicable'
      end,
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'workflow_synced_at', now(),
        'data_entry_required', new_status = 'data_entry_in_progress',
        'deliver_id', ids->>'deliver_id',
        'invoice_no', ids->>'invoice_no',
        'waybill_no', ids->>'waybill_no'
      ),
      updated_at = now()
    where id = req.id;

    -- Ensure COD ledger exists when COD applies.
    insert into public.be_cod_ledger (
      pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, tracking_number,
      merchant_code, merchant_name, rider_code, rider_name,
      cod_expected, cod_collected, cod_handed_over, cod_status, status, payload, created_at, updated_at
    )
    select
      p.pickup_id, p.pickup_way_id, p.deliver_id, p.invoice_no, p.waybill_no, p.tracking_number,
      p.merchant_code, p.merchant_name, p.assigned_rider_code, p.assigned_rider_name,
      coalesce(p.cod_amount,0), 0, 0,
      case when coalesce(p.cod_amount,0) > 0 then 'pending_collection' else 'not_applicable' end,
      case when coalesce(p.cod_amount,0) > 0 then 'pending_collection' else 'not_applicable' end,
      jsonb_build_object('source','workflow_sync'), now(), now()
    from public.be_portal_pickup_requests p
    where p.id = req.id
      and coalesce(p.cod_amount, 0) > 0
      and not exists (
        select 1 from public.be_cod_ledger c
        where c.pickup_id = p.pickup_id
           or c.pickup_way_id = p.pickup_way_id
           or c.waybill_no = p.waybill_no
      );

    -- Initial event + notifications if absent.
    if not exists (
      select 1 from public.be_portal_cargo_events e
      where e.pickup_id = coalesce(req.pickup_id, req.pickup_way_id)
        and e.event_type in ('pickup_submitted','workflow_synced')
    ) then
      perform public.be_workflow_emit_event(coalesce(req.pickup_id, req.pickup_way_id), 'workflow_synced', new_status, 'system', 'workflow_sync', jsonb_build_object('sync', true));
    end if;

    perform public.be_workflow_notify_roles(
      coalesce(req.pickup_id, req.pickup_way_id),
      case when new_status = 'data_entry_in_progress' then 'data_entry_required' else 'assignment_required' end,
      case when new_status = 'data_entry_in_progress'
        then array['customer_service','data_entry','operation_manager']
        else array['customer_service','supervisor','dispatch','operation_manager']
      end,
      case when new_status = 'data_entry_in_progress' then 'Pickup needs Data Entry completion' else 'Pickup ready for assignment' end,
      'Pickup ' || coalesce(req.pickup_id, req.pickup_way_id, req.id::text) || ' has been synchronized.',
      jsonb_build_object('status', new_status)
    );

    synced := synced + 1;
  end loop;

  return jsonb_build_object('ok', true, 'synced', synced, 'lookup', p_lookup);
end;
$$;

-- Keep every insert/update synchronized automatically.
create or replace function public.zzzz_sync_pickup_workflow_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.be_sync_pickup_workflow(coalesce(new.pickup_id, new.pickup_way_id, new.id::text));
  return new;
end;
$$;

drop trigger if exists zzzzz_sync_pickup_workflow_trigger on public.be_portal_pickup_requests;

create trigger zzzzz_sync_pickup_workflow_trigger
after insert or update of pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, pickup_address, pickup_township, pickup_city, parcel_count, cod_amount, assigned_rider_code, assigned_driver_code, assigned_helper_code, status
on public.be_portal_pickup_requests
for each row
execute function public.zzzz_sync_pickup_workflow_trigger();

-- Data Entry queue and completion.
create or replace function public.be_data_entry_queue(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.be_sync_pickup_workflow(null);

  return (
    select jsonb_build_object(
      'ok', true,
      'count', count(*),
      'items', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    )
    from (
      select
        id, pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no,
        merchant_code, merchant_name, sender_name, sender_phone,
        pickup_address, pickup_township, pickup_city,
        recipient_name, recipient_phone, delivery_address, delivery_township,
        parcel_count, cod_amount, payment_terms, tariff_code,
        status, data_entry_status, assignment_status, assigned_branch, route_zone, created_at, updated_at
      from public.be_portal_pickup_requests
      where status = 'data_entry_in_progress'
         or data_entry_status = 'required'
         or public.be_workflow_text(pickup_address) is null
         or public.be_workflow_text(pickup_township) is null
      order by created_at desc nulls last
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  );
end;
$$;

create or replace function public.be_data_entry_complete_pickup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lookup text;
  req record;
begin
  lookup := coalesce(
    public.be_workflow_text(p_payload->>'pickup_id'),
    public.be_workflow_text(p_payload->>'pickup_way_id'),
    public.be_workflow_text(p_payload->>'waybill_no'),
    public.be_workflow_text(p_payload->>'id')
  );

  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = lookup or pickup_way_id = lookup or waybill_no = lookup or id::text = lookup
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'lookup', lookup);
  end if;

  update public.be_portal_pickup_requests
  set
    pickup_address = coalesce(public.be_workflow_text(p_payload->>'pickup_address'), pickup_address),
    pickup_township = coalesce(public.be_workflow_text(p_payload->>'pickup_township'), public.be_workflow_text(p_payload->>'township'), pickup_township),
    pickup_city = coalesce(public.be_workflow_text(p_payload->>'pickup_city'), public.be_workflow_text(p_payload->>'city'), pickup_city, 'Yangon'),
    recipient_name = coalesce(public.be_workflow_text(p_payload->>'recipient_name'), recipient_name),
    recipient_phone = coalesce(public.be_workflow_text(p_payload->>'recipient_phone'), recipient_phone),
    delivery_address = coalesce(public.be_workflow_text(p_payload->>'delivery_address'), delivery_address),
    delivery_township = coalesce(public.be_workflow_text(p_payload->>'delivery_township'), delivery_township),
    data_entry_status = 'complete',
    status = case
      when public.be_workflow_text(coalesce(p_payload->>'pickup_address', pickup_address)) is not null
       and public.be_workflow_text(coalesce(p_payload->>'pickup_township', pickup_township)) is not null
      then 'pending_assignment'
      else 'data_entry_in_progress'
    end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('data_entry_completed_at', now(), 'data_entry_payload', p_payload),
    updated_at = now()
  where id = req.id;

  perform public.be_sync_pickup_workflow(lookup);
  perform public.be_workflow_emit_event(lookup, 'data_entry_completed', 'pending_assignment', 'data_entry', coalesce(p_payload->>'operator_code','data_entry'), p_payload);
  perform public.be_workflow_notify_roles(lookup, 'assignment_required', array['supervisor','dispatch','operation_manager'], 'Pickup ready for assignment', 'Data Entry completed pickup ' || lookup, p_payload);

  return jsonb_build_object('ok', true, 'pickup_id', lookup, 'status', 'pending_assignment');
end;
$$;

-- Supervisor queue and assignment.
create or replace function public.be_supervisor_pickup_queue(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.be_sync_pickup_workflow(null);

  return (
    select jsonb_build_object(
      'ok', true,
      'count', count(*),
      'items', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    )
    from (
      select
        id, pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no,
        merchant_code, merchant_name, sender_name, sender_phone,
        pickup_address, pickup_township, pickup_city,
        parcel_count, cod_amount, payment_terms, tariff_code,
        assigned_branch, route_zone,
        assigned_rider_code, assigned_rider_name,
        assigned_driver_code, assigned_driver_name,
        assigned_helper_code, assigned_helper_name,
        status, data_entry_status, assignment_status, warehouse_status, finance_status,
        created_at, updated_at
      from public.be_portal_pickup_requests
      where coalesce(status,'') <> 'data_entry_in_progress'
        and coalesce(data_entry_status,'complete') <> 'required'
        and lower(coalesce(status,'')) not in ('closed','cancelled')
      order by
        case when assignment_status = 'pending_assignment' then 0 else 1 end,
        created_at desc nulls last
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  );
end;
$$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lookup text;
  rider text;
  rname text;
  driver text;
  dname text;
  helper text;
  hname text;
  zone text;
  actor_text text;
  actor_uuid uuid;
  req record;
begin
  lookup := coalesce(
    public.be_workflow_text(p_payload->>'pickup_id'),
    public.be_workflow_text(p_payload->>'pickup_way_id'),
    public.be_workflow_text(p_payload->>'waybill_no'),
    public.be_workflow_text(p_payload->>'tracking_number')
  );

  rider := public.be_workflow_text(p_payload->>'rider_code');
  rname := public.be_workflow_text(p_payload->>'rider_name');
  driver := public.be_workflow_text(p_payload->>'driver_code');
  dname := public.be_workflow_text(p_payload->>'driver_name');
  helper := public.be_workflow_text(p_payload->>'helper_code');
  hname := public.be_workflow_text(p_payload->>'helper_name');
  zone := public.be_workflow_text(p_payload->>'route_zone');
  actor_text := public.be_workflow_text(p_payload->>'assigned_by');

  if actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_uuid := actor_text::uuid;
  else
    actor_uuid := null;
  end if;

  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = lookup or pickup_way_id = lookup or waybill_no = lookup or tracking_number = lookup or id::text = lookup
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'lookup', lookup);
  end if;

  if req.status = 'data_entry_in_progress' or req.data_entry_status = 'required' then
    return jsonb_build_object('ok', false, 'error', 'data_entry_required', 'pickup_id', req.pickup_id, 'message', 'Complete pickup address/township in Data Entry before assignment.');
  end if;

  update public.be_portal_pickup_requests
  set
    assigned_rider_code = coalesce(rider, assigned_rider_code),
    assigned_rider_name = coalesce(rname, assigned_rider_name),
    assigned_driver_code = coalesce(driver, assigned_driver_code),
    assigned_driver_name = coalesce(dname, assigned_driver_name),
    assigned_helper_code = coalesce(helper, assigned_helper_code),
    assigned_helper_name = coalesce(hname, assigned_helper_name),
    route_zone = coalesce(zone, route_zone),
    assigned_by = coalesce(actor_uuid, assigned_by),
    assigned_at = now(),
    assignment_status = 'assigned',
    status = 'assigned',
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'assigned_by_label', coalesce(actor_text, 'supervisor'),
      'assignment_payload', p_payload,
      'assigned_at', now()
    ),
    updated_at = now()
  where id = req.id;

  perform public.be_sync_pickup_workflow(req.pickup_id);
  perform public.be_workflow_emit_event(req.pickup_id, 'assigned', 'assigned', 'supervisor', coalesce(actor_text, 'supervisor'), p_payload);
  perform public.be_workflow_notify_roles(req.pickup_id, 'assigned_to_mobile', array['rider','driver','helper','dispatch','warehouse','finance','customer_service'], 'Pickup assigned', 'Pickup ' || req.pickup_id || ' was assigned to field workforce.', p_payload);

  return jsonb_build_object(
    'ok', true,
    'pickup_id', req.pickup_id,
    'pickup_way_id', req.pickup_way_id,
    'assigned_rider_code', coalesce(rider, req.assigned_rider_code),
    'assigned_driver_code', coalesce(driver, req.assigned_driver_code),
    'assigned_helper_code', coalesce(helper, req.assigned_helper_code),
    'route_zone', coalesce(zone, req.route_zone),
    'status', 'assigned'
  );
end;
$$;

-- Rider/Driver/Helper job snapshot.
create or replace function public.be_mobile_go_live_snapshot(
  p_worker_code text default null,
  p_role text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  worker text := public.be_workflow_text(p_worker_code);
  role_name text := lower(coalesce(public.be_workflow_text(p_role), ''));
begin
  perform public.be_sync_pickup_workflow(null);

  return (
    select jsonb_build_object(
      'ok', true,
      'worker_code', worker,
      'role', nullif(role_name, ''),
      'assigned_count', count(*),
      'jobs', coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc nulls last, x.created_at desc), '[]'::jsonb)
    )
    from (
      select
        id, pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, tracking_number,
        merchant_code, merchant_name, sender_name, sender_phone,
        pickup_address, pickup_township, pickup_city,
        recipient_name, recipient_phone, delivery_address, delivery_township,
        parcel_count, cod_amount, payment_terms, tariff_code,
        assigned_rider_code, assigned_rider_name,
        assigned_driver_code, assigned_driver_name,
        assigned_helper_code, assigned_helper_name,
        assigned_branch, route_zone,
        status, assignment_status, warehouse_status, cod_status, finance_status,
        assigned_at, created_at, updated_at
      from public.be_portal_pickup_requests
      where assignment_status = 'assigned'
        and (
          worker is null
          or assigned_rider_code = worker
          or assigned_driver_code = worker
          or assigned_helper_code = worker
        )
        and lower(coalesce(status,'')) not in ('closed','cancelled')
      order by assigned_at desc nulls last, created_at desc nulls last
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  );
end;
$$;

-- Rider status updates.
create or replace function public.be_rider_update_job_status(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lookup text;
  rider text;
  raw_status text;
  next_status text;
  req record;
begin
  lookup := coalesce(
    public.be_workflow_text(p_payload->>'pickup_id'),
    public.be_workflow_text(p_payload->>'pickup_way_id'),
    public.be_workflow_text(p_payload->>'waybill_no'),
    public.be_workflow_text(p_payload->>'tracking_number')
  );
  rider := coalesce(public.be_workflow_text(p_payload->>'rider_code'), public.be_workflow_text(p_payload->>'worker_code'), 'mobile');
  raw_status := lower(coalesce(public.be_workflow_text(p_payload->>'status'), 'picked_up'));

  next_status := case
    when raw_status in ('picked_up','pickup_complete','picked') then 'picked_up'
    when raw_status in ('in_transit','transit') then 'in_transit'
    when raw_status in ('out_for_delivery','ofd') then 'out_for_delivery'
    when raw_status in ('delivered','complete','completed') then 'delivered'
    when raw_status in ('failed','failed_attempt','ndr') then 'failed_attempt'
    when raw_status in ('returned','return') then 'returned'
    else raw_status
  end;

  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = lookup or pickup_way_id = lookup or waybill_no = lookup or tracking_number = lookup or id::text = lookup
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'job_not_found', 'lookup', lookup);
  end if;

  update public.be_portal_pickup_requests
  set
    status = next_status,
    assigned_rider_code = coalesce(assigned_rider_code, rider),
    cod_status = case
      when next_status = 'delivered' and coalesce(cod_amount,0) > 0 then 'collected'
      when coalesce(cod_amount,0) = 0 then 'not_applicable'
      else cod_status
    end,
    finance_status = case
      when next_status = 'delivered' then 'finance_pending'
      else finance_status
    end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_mobile_update', p_payload, 'last_mobile_status_at', now()),
    updated_at = now()
  where id = req.id;

  update public.be_cod_ledger
  set
    rider_code = coalesce(rider_code, rider),
    rider_name = coalesce(rider_name, req.assigned_rider_name),
    cod_collected = case when next_status = 'delivered' then greatest(coalesce(cod_collected,0), coalesce(req.cod_amount,0)) else cod_collected end,
    cod_status = case when next_status = 'delivered' and coalesce(req.cod_amount,0) > 0 then 'awaiting_handover' else cod_status end,
    status = case when next_status = 'delivered' and coalesce(req.cod_amount,0) > 0 then 'awaiting_handover' else status end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('delivery_update', p_payload),
    updated_at = now()
  where pickup_id = req.pickup_id or pickup_way_id = req.pickup_way_id or waybill_no = req.waybill_no;

  perform public.be_workflow_emit_event(req.pickup_id, 'mobile_status_update', next_status, 'rider', rider, p_payload);
  perform public.be_workflow_notify_roles(req.pickup_id, 'mobile_status_update', array['customer_service','supervisor','warehouse','finance','operation_manager'], 'Mobile status updated', 'Pickup ' || req.pickup_id || ' updated to ' || next_status, p_payload);

  return jsonb_build_object('ok', true, 'pickup_id', req.pickup_id, 'status', next_status, 'rider_code', rider);
end;
$$;

-- Warehouse scan.
create or replace function public.be_warehouse_scan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lookup text;
  scan text;
  next_status text;
  branch text;
  operator_ref text;
  scanned_count integer;
  req record;
begin
  lookup := coalesce(
    public.be_workflow_text(p_payload->>'pickup_id'),
    public.be_workflow_text(p_payload->>'pickup_way_id'),
    public.be_workflow_text(p_payload->>'waybill_no'),
    public.be_workflow_text(p_payload->>'tracking_number')
  );

  scan := lower(coalesce(public.be_workflow_text(p_payload->>'scan_type'), 'inbound'));

  next_status := case
    when scan in ('inbound', 'received', 'receive') then 'in_warehouse'
    when scan in ('sorting', 'sort') then 'sorting'
    when scan in ('bagging', 'bagged', 'bag') then 'bagged'
    when scan in ('dispatch', 'dispatched') then 'dispatched'
    when scan in ('out_for_delivery', 'ofd', 'outbound') then 'out_for_delivery'
    else scan
  end;

  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = lookup or pickup_way_id = lookup or waybill_no = lookup or tracking_number = lookup or id::text = lookup
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_or_waybill_not_found', 'lookup', lookup);
  end if;

  branch := coalesce(public.be_workflow_text(p_payload->>'warehouse_branch'), public.be_workflow_text(req.warehouse_branch), public.be_workflow_text(req.assigned_branch), 'YGN');
  operator_ref := coalesce(public.be_workflow_text(p_payload->>'operator_code'), public.be_workflow_text(p_payload->>'operator'), public.be_workflow_text(p_payload->>'scanned_by'), 'warehouse');
  scanned_count := coalesce(nullif(regexp_replace(coalesce(p_payload->>'scanned_parcel_count', ''), '[^0-9]', '', 'g'), '')::int, req.parcel_count, 1);

  insert into public.be_warehouse_scans (
    pickup_id, pickup_way_id, waybill_no, scan_type, warehouse_branch, operator_code,
    bag_code, route_zone, expected_parcel_count, scanned_parcel_count, status, metadata, created_at
  )
  values (
    req.pickup_id, req.pickup_way_id, req.waybill_no, scan, branch, operator_ref,
    public.be_workflow_text(p_payload->>'bag_code'), coalesce(public.be_workflow_text(p_payload->>'route_zone'), req.route_zone),
    req.parcel_count, scanned_count, next_status, coalesce(p_payload, '{}'::jsonb), now()
  );

  update public.be_portal_pickup_requests
  set
    warehouse_status = next_status,
    warehouse_branch = branch,
    last_scan_type = scan,
    last_scan_at = now(),
    bag_code = coalesce(public.be_workflow_text(p_payload->>'bag_code'), bag_code),
    route_zone = coalesce(public.be_workflow_text(p_payload->>'route_zone'), route_zone),
    expected_parcel_count = coalesce(parcel_count, expected_parcel_count),
    scanned_parcel_count = scanned_count,
    status = case when status = 'data_entry_in_progress' then status else next_status end,
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('last_warehouse_scan', p_payload, 'last_warehouse_status_at', now()),
    updated_at = now()
  where id = req.id;

  perform public.be_workflow_emit_event(req.pickup_id, 'warehouse_scan', next_status, 'warehouse', operator_ref, p_payload);
  perform public.be_workflow_notify_roles(req.pickup_id, 'warehouse_scan', array['customer_service','supervisor','dispatch','finance','operation_manager'], 'Warehouse status updated', 'Pickup ' || req.pickup_id || ' warehouse status is ' || next_status, p_payload);

  return jsonb_build_object('ok', true, 'pickup_id', req.pickup_id, 'scan_type', scan, 'warehouse_status', next_status, 'warehouse_branch', branch, 'operator_code', operator_ref);
end;
$$;

-- Finance snapshot.
create or replace function public.be_finance_workflow_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pickup_count int := 0;
  cod_expected_total numeric := 0;
  cod_collected_total numeric := 0;
  cod_handed_over_total numeric := 0;
  pending_handover_total numeric := 0;
  pending_cod_count int := 0;
  awaiting_handover_count int := 0;
  finance_ready_count int := 0;
begin
  perform public.be_sync_pickup_workflow(null);

  select count(*) into pickup_count from public.be_portal_pickup_requests;

  select
    coalesce(sum(coalesce(cod_expected, 0)), 0),
    coalesce(sum(coalesce(cod_collected, 0)), 0),
    coalesce(sum(coalesce(cod_handed_over, 0)), 0),
    coalesce(sum(greatest(coalesce(cod_collected, 0) - coalesce(cod_handed_over, 0), 0)), 0),
    count(*) filter (where coalesce(cod_expected, 0) > 0 and coalesce(cod_collected, 0) = 0),
    count(*) filter (where coalesce(cod_collected, 0) > coalesce(cod_handed_over, 0))
  into cod_expected_total, cod_collected_total, cod_handed_over_total, pending_handover_total, pending_cod_count, awaiting_handover_count
  from public.be_cod_ledger;

  select count(*)
  into finance_ready_count
  from public.be_portal_pickup_requests
  where lower(coalesce(status, '')) in ('delivered', 'finance_pending', 'closed')
     or lower(coalesce(finance_status, '')) in ('ready_for_settlement', 'finance_pending');

  return jsonb_build_object(
    'ok', true,
    'pickup_count', pickup_count,
    'cod_expected_total', cod_expected_total,
    'cod_collected_total', cod_collected_total,
    'cod_handed_over_total', cod_handed_over_total,
    'pending_handover_total', pending_handover_total,
    'pending_cod_count', pending_cod_count,
    'awaiting_handover_count', awaiting_handover_count,
    'finance_ready_count', finance_ready_count
  );
end;
$$;

-- CS snapshots.
create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.be_sync_pickup_workflow(null);

  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select
        id, pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no,
        merchant_code, merchant_name, sender_name, sender_phone,
        pickup_address, pickup_township, pickup_city,
        parcel_count, cod_amount, status, data_entry_status, assignment_status,
        assigned_rider_code, assigned_rider_name, warehouse_status, finance_status,
        created_at, updated_at
      from public.be_portal_pickup_requests
      order by created_at desc nulls last
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  );
end;
$$;

create or replace function public.be_customer_service_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pickups jsonb;
  de jsonb;
  sup jsonb;
  fin jsonb;
begin
  pickups := public.be_customer_service_pickup_requests(50);
  de := public.be_data_entry_queue(50);
  sup := public.be_supervisor_pickup_queue(50);
  fin := public.be_finance_workflow_snapshot();

  return jsonb_build_object(
    'ok', true,
    'pickup_count', jsonb_array_length(coalesce(pickups, '[]'::jsonb)),
    'pickups', pickups,
    'data_entry_queue', de,
    'supervisor_queue', sup,
    'finance', fin
  );
end;
$$;

-- Go-live readiness.
create or replace function public.be_go_live_system_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'canonical_pickup_table', to_regclass('public.be_portal_pickup_requests') is not null,
    'cargo_events', to_regclass('public.be_portal_cargo_events') is not null,
    'notifications', to_regclass('public.be_app_notifications') is not null,
    'warehouse_scans', to_regclass('public.be_warehouse_scans') is not null,
    'cod_ledger', to_regclass('public.be_cod_ledger') is not null,
    'data_entry_rpc', to_regprocedure('public.be_data_entry_queue(integer)') is not null,
    'supervisor_rpc', to_regprocedure('public.be_supervisor_pickup_queue(integer)') is not null,
    'mobile_rpc', to_regprocedure('public.be_mobile_go_live_snapshot(text,text,integer)') is not null,
    'finance_rpc', to_regprocedure('public.be_finance_workflow_snapshot()') is not null
  );
end;
$$;

-- Frontend router compatibility.
create or replace function public.be_process_router(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  action text := lower(coalesce(p_action, ''));
begin
  if action in ('be_go_live_system_readiness','go_live_system_readiness','readiness') then
    return public.be_go_live_system_readiness();
  elsif action in ('be_customer_service_snapshot','customer_service_snapshot','cs_snapshot') then
    return public.be_customer_service_snapshot();
  elsif action in ('be_customer_service_pickup_requests','customer_service_pickup_requests','cs_pickup_requests') then
    return jsonb_build_object('ok', true, 'items', public.be_customer_service_pickup_requests(coalesce((p_payload->>'limit')::int, 50)));
  elsif action in ('be_submit_pickup_request','submit_pickup_request','create_pickup') then
    return public.be_submit_pickup_request(p_payload);
  elsif action in ('be_sync_pickup_workflow','sync_pickup_workflow','resync_pickup') then
    return public.be_sync_pickup_workflow(coalesce(p_payload->>'pickup_id', p_payload->>'pickup_way_id', p_payload->>'waybill_no'));
  elsif action in ('be_data_entry_queue','data_entry_queue') then
    return public.be_data_entry_queue(coalesce((p_payload->>'limit')::int, 50));
  elsif action in ('be_data_entry_complete_pickup','data_entry_complete_pickup') then
    return public.be_data_entry_complete_pickup(p_payload);
  elsif action in ('be_supervisor_pickup_queue','supervisor_pickup_queue') then
    return public.be_supervisor_pickup_queue(coalesce((p_payload->>'limit')::int, 50));
  elsif action in ('be_supervisor_assign_job','supervisor_assign_job') then
    return public.be_supervisor_assign_job(p_payload);
  elsif action in ('be_mobile_go_live_snapshot','mobile_go_live_snapshot') then
    return public.be_mobile_go_live_snapshot(p_payload->>'worker_code', p_payload->>'role', coalesce((p_payload->>'limit')::int, 50));
  elsif action in ('be_rider_update_job_status','rider_update_job_status','mobile_update_status') then
    return public.be_rider_update_job_status(p_payload);
  elsif action in ('be_warehouse_scan','warehouse_scan') then
    return public.be_warehouse_scan(p_payload);
  elsif action in ('be_finance_workflow_snapshot','finance_workflow_snapshot') then
    return public.be_finance_workflow_snapshot();
  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action', 'action', p_action);
  end if;
end;
$$;

-- Run one full reconciliation now for existing records.
select public.be_sync_pickup_workflow(null);

commit;
