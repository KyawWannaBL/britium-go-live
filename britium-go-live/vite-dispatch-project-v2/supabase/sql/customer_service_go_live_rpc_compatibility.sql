-- Customer Service go-live RPC compatibility patch.
-- Purpose:
-- - Provides the missing Customer Service snapshot RPC used by the portal.
-- - Keeps pickup creation working even when older Customer Service SQL was applied.
-- - Avoids demo/mock rows and keeps requests in the canonical pickup queue.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_date text,
  add column if not exists requester_type text default 'customer_service',
  add column if not exists source text default 'customer_service',
  add column if not exists source_portal text default 'customer_service',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists pickup_township text,
  add column if not exists city_region text,
  add column if not exists pickup_city text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists total_cod numeric default 0,
  add column if not exists estimated_tariff numeric default 0,
  add column if not exists status text default 'DATA_ENTRY_IN_PROGRESS',
  add column if not exists operation_status text default 'submitted',
  add column if not exists data_entry_status text default 'pending',
  add column if not exists assignment_status text default 'pending_assignment',
  add column if not exists finance_status text default 'pending_finance',
  add column if not exists assigned_branch text,
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_id text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_id text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_id text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists rider_code text,
  add column if not exists driver_code text,
  add column if not exists helper_code text,
  add column if not exists vehicle_plate text,
  add column if not exists supervisor_note text,
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text,
  add column if not exists priority text default 'Normal',
  add column if not exists special_instructions text,
  add column if not exists pickup_time text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.cs_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text,
  subject text,
  description text,
  priority text default 'Medium',
  status text default 'OPEN',
  merchant_code text,
  merchant_name text,
  customer_name text,
  customer_phone text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists tracking_no text,
  add column if not exists line_no integer,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists status text,
  add column if not exists source_module text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists branch_code text,
  add column if not exists pickup_date text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_township text,
  add column if not exists pickup_city text,
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists recipient_town text,
  add column if not exists delivery_township text,
  add column if not exists receiver_township text,
  add column if not exists receiver_address text,
  add column if not exists delivery_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists item_value numeric default 0,
  add column if not exists deli_fee_os numeric default 0,
  add column if not exists delivery_fee_os numeric default 0,
  add column if not exists cod_os numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists surcharge numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists remarks text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists event_key text,
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists message text,
  add column if not exists target_role text,
  add column if not exists target_branch text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists notification_type text,
  add column if not exists category text,
  add column if not exists status text default 'unread',
  add column if not exists is_read boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

drop function if exists public.be_customer_service_pickup_requests(integer);
create or replace function public.be_customer_service_pickup_requests(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests p
    where lower(coalesce(p.status, '')) not in ('mock','sample','demo','archived_test_data')
    order by p.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) p;
$$;

drop function if exists public.be_customer_service_create_pickup(jsonb);
create or replace function public.be_customer_service_create_pickup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text;
  v_branch text;
  v_inserted public.be_portal_pickup_requests;
begin
  if nullif(trim(coalesce(p_payload->>'pickup_address', '')), '') is null then
    raise exception 'Pickup address is required.';
  end if;

  v_branch := coalesce(nullif(p_payload->>'assigned_branch',''), nullif(p_payload->>'branch_code',''), 'YGN');
  v_pickup_id := coalesce(
    nullif(p_payload->>'pickup_way_id', ''),
    nullif(p_payload->>'pickup_id', ''),
    'P' || to_char(now(), 'MMDD') || '-' || upper(regexp_replace(coalesce(nullif(p_payload->>'merchant_code',''), 'CS'), '[^A-Za-z0-9]', '', 'g')) || '-' || lpad(greatest(coalesce(nullif(p_payload->>'parcel_count','')::int, 1), 1)::text, 3, '0')
  );

  insert into public.be_portal_pickup_requests (
    pickup_id, pickup_way_id, pickup_date, source, source_portal, requester_type,
    merchant_code, merchant_name, sender_name, sender_phone, customer_name, customer_phone,
    pickup_address, township, pickup_township, city_region, pickup_city, branch_code,
    parcel_count, cod_amount, total_cod, estimated_tariff,
    status, operation_status, finance_status, payment_terms, tariff_code, priority,
    special_instructions, pickup_time, payload, created_by, created_by_name, updated_at
  )
  values (
    v_pickup_id, v_pickup_id, coalesce(nullif(p_payload->>'pickup_date',''), to_char(current_date, 'YYYY-MM-DD')),
    'customer_service', 'customer_service', coalesce(nullif(p_payload->>'requester_type',''), 'customer_service'),
    p_payload->>'merchant_code', p_payload->>'merchant_name',
    coalesce(nullif(p_payload->>'sender_name',''), p_payload->>'merchant_name'),
    coalesce(nullif(p_payload->>'sender_phone',''), p_payload->>'customer_phone'),
    coalesce(nullif(p_payload->>'customer_name',''), p_payload->>'sender_name', p_payload->>'merchant_name'),
    coalesce(nullif(p_payload->>'customer_phone',''), p_payload->>'sender_phone'),
    p_payload->>'pickup_address',
    coalesce(nullif(p_payload->>'township',''), p_payload->>'pickup_township'),
    coalesce(nullif(p_payload->>'pickup_township',''), p_payload->>'township'),
    coalesce(nullif(p_payload->>'city_region',''), p_payload->>'pickup_city'),
    coalesce(nullif(p_payload->>'pickup_city',''), p_payload->>'city_region'),
    v_branch,
    greatest(coalesce(nullif(p_payload->>'parcel_count','')::integer, 1), 1),
    coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0),
    coalesce(nullif(p_payload->>'total_cod','')::numeric, coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0)),
    coalesce(nullif(p_payload->>'estimated_tariff','')::numeric, 0),
    'DATA_ENTRY_IN_PROGRESS', 'submitted', 'pending_finance',
    coalesce(nullif(p_payload->>'payment_terms',''), 'COD'),
    p_payload->>'tariff_code',
    coalesce(nullif(p_payload->>'priority',''), 'Normal'),
    p_payload->>'special_instructions',
    p_payload->>'pickup_time',
    p_payload,
    p_payload->>'created_by',
    coalesce(nullif(p_payload->>'created_by_name',''), 'Customer Service'),
    now()
  )
  returning * into v_inserted;

  insert into public.be_portal_cargo_events (
    pickup_id, pickup_way_id, event_type, event_status, status, source_module,
    source_table, source_key, branch_code, pickup_date, merchant_code, merchant_name,
    sender_name, sender_phone, pickup_address, pickup_township, pickup_city,
    remarks, payload, metadata, created_at, updated_at
  )
  values (
    v_pickup_id, v_pickup_id, 'PICKUP_SUBMITTED', 'submitted', 'submitted', 'customer_service',
    'be_portal_pickup_requests', v_pickup_id || ':pickup_submitted', v_branch,
    coalesce(nullif(p_payload->>'pickup_date',''), to_char(current_date, 'YYYY-MM-DD')),
    p_payload->>'merchant_code', p_payload->>'merchant_name',
    coalesce(nullif(p_payload->>'sender_name',''), p_payload->>'merchant_name'),
    coalesce(nullif(p_payload->>'sender_phone',''), p_payload->>'customer_phone'),
    p_payload->>'pickup_address',
    coalesce(nullif(p_payload->>'pickup_township',''), p_payload->>'township'),
    coalesce(nullif(p_payload->>'pickup_city',''), p_payload->>'city_region'),
    'Customer Service submitted pickup and synchronized downstream workflow queues.',
    p_payload,
    jsonb_build_object('downstream_sync', true, 'created_by_rpc', 'be_customer_service_create_pickup'),
    now(), now()
  );

  insert into public.be_app_notifications (
    event_key, pickup_id, pickup_way_id, title, body, message, target_role, target_branch,
    source_table, source_key, notification_type, category, status, is_read, payload, metadata, created_at, updated_at
  )
  select
    v_pickup_id || ':pickup_submitted:' || role_name,
    v_pickup_id,
    v_pickup_id,
    'New pickup request',
    'Pickup ' || v_pickup_id || ' requires workflow action.',
    'Pickup ' || v_pickup_id || ' requires workflow action.',
    role_name,
    v_branch,
    'be_portal_pickup_requests',
    v_pickup_id || ':pickup_submitted:' || role_name,
    'pickup_submitted',
    'pickup_submitted',
    'unread',
    false,
    p_payload,
    jsonb_build_object('downstream_sync', true, 'target_role', role_name),
    now(),
    now()
  from unnest(array[
    'customer_service',
    'data_entry',
    'supervisor',
    'operation_manager',
    'dispatch',
    'warehouse',
    'branch_office'
  ]) as role_name
  on conflict do nothing;

  return to_jsonb(v_inserted) || jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'pickup_way_id', v_pickup_id, 'branch_code', v_branch);
end;
$$;

drop function if exists public.be_customer_service_create_ticket(jsonb);
create or replace function public.be_customer_service_create_ticket(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_ticket public.cs_tickets;
begin
  insert into public.cs_tickets (
    ticket_no, subject, description, priority, status,
    merchant_code, merchant_name, customer_name, customer_phone, payload, updated_at
  )
  values (
    'CS-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
    coalesce(nullif(p_payload->>'subject',''), 'Customer Service Ticket'),
    p_payload->>'description',
    coalesce(nullif(p_payload->>'priority',''), 'Medium'),
    'OPEN',
    p_payload->>'merchant_code',
    p_payload->>'merchant_name',
    p_payload->>'customer_name',
    p_payload->>'customer_phone',
    p_payload,
    now()
  )
  returning * into v_ticket;

  return jsonb_build_object('ok', true, 'ticket', to_jsonb(v_ticket), 'ticket_no', v_ticket.ticket_no);
end;
$$;

drop function if exists public.be_customer_service_go_live_snapshot(jsonb);
create or replace function public.be_customer_service_go_live_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_limit integer := greatest(coalesce(nullif(p_payload->>'limit','')::integer, 100), 1);
  v_pickups jsonb := '[]'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
  v_tickets jsonb := '[]'::jsonb;
begin
  begin
    select public.be_customer_service_pickup_requests(v_limit) into v_pickups;
  exception when others then
    v_pickups := '[]'::jsonb;
  end;

  begin
    if to_regprocedure('public.be_customer_service_merchant_options(integer)') is not null then
      execute 'select public.be_customer_service_merchant_options($1)' into v_merchants using 1000;
    end if;
  exception when others then
    v_merchants := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_tickets
    from (select * from public.cs_tickets order by created_at desc limit 100) t;
  exception when others then
    v_tickets := '[]'::jsonb;
  end;

  return jsonb_build_object(
    'ok', true,
    'kpis', jsonb_build_object(
      'total_tickets', jsonb_array_length(v_tickets),
      'open_requests', (
        select count(*)
        from jsonb_to_recordset(v_pickups) as p(status text)
        where lower(coalesce(p.status,'')) not in ('completed','delivered','cancelled','failed')
      ),
      'pickup_requests', jsonb_array_length(v_pickups),
      'urgent_open', (
        select count(*)
        from jsonb_to_recordset(v_pickups) as p(priority text, status text)
        where lower(coalesce(p.priority,'')) = 'urgent'
          and lower(coalesce(p.status,'')) not in ('completed','delivered','cancelled','failed')
      ),
      'merchant_options', jsonb_array_length(v_merchants)
    ),
    'merchants', v_merchants,
    'recent_pickups', v_pickups,
    'tickets', v_tickets
  );
end;
$$;

drop function if exists public.be_customer_service_recent_pickup_requests(integer);
create or replace function public.be_customer_service_recent_pickup_requests(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select public.be_customer_service_pickup_requests(p_limit);
$$;

drop function if exists public.be_pickup_request_dropdown_options(integer);
create or replace function public.be_pickup_request_dropdown_options(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'value', coalesce(p.pickup_way_id, p.pickup_id),
    'label', coalesce(p.pickup_way_id, p.pickup_id) || ' - ' || coalesce(p.merchant_name, p.sender_name, p.merchant_code, 'Merchant'),
    'pickup_id', coalesce(p.pickup_id, p.pickup_way_id),
    'pickup_way_id', coalesce(p.pickup_way_id, p.pickup_id),
    'pickup_request_id', coalesce(p.pickup_id, p.pickup_way_id),
    'merchant_code', p.merchant_code,
    'merchant_name', p.merchant_name,
    'sender_name', p.sender_name,
    'sender_phone', p.sender_phone,
    'pickup_address', p.pickup_address,
    'township', coalesce(p.township, p.pickup_township),
    'parcel_count', p.parcel_count,
    'branch_code', p.branch_code,
    'assigned_branch', coalesce(p.assigned_branch, p.branch_code),
    'status', p.status,
    'assignment_status', coalesce(p.assignment_status, 'pending_assignment'),
    'created_at', p.created_at
  ) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests
    where coalesce(pickup_id, pickup_way_id, '') <> ''
      and lower(coalesce(status, '')) not in ('cancelled','completed','delivered','failed','mock','sample','demo','archived_test_data')
    order by created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) p;
$$;

drop function if exists public.be_pending_pickup_assignment_list(text, integer);
create or replace function public.be_pending_pickup_assignment_list(p_search text default '', p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'raw_uuid', p.id,
    'value', coalesce(p.pickup_way_id, p.pickup_id),
    'label', coalesce(p.pickup_way_id, p.pickup_id) || ' - ' || coalesce(p.merchant_name, p.sender_name, p.merchant_code, 'Merchant'),
    'pickup_id', coalesce(p.pickup_id, p.pickup_way_id),
    'pickup_way_id', coalesce(p.pickup_way_id, p.pickup_id),
    'pickup_request_id', coalesce(p.pickup_id, p.pickup_way_id),
    'way_id', coalesce(p.pickup_way_id, p.pickup_id),
    'merchant_code', p.merchant_code,
    'merchant_name', p.merchant_name,
    'sender_name', p.sender_name,
    'sender_phone', p.sender_phone,
    'pickup_address', p.pickup_address,
    'township', coalesce(p.township, p.pickup_township),
    'pickup_time', p.pickup_time,
    'cod_amount', coalesce(p.cod_amount, p.total_cod, 0),
    'parcel_count', p.parcel_count,
    'status', p.status,
    'operation_status', p.operation_status,
    'assignment_status', coalesce(p.assignment_status, 'pending_assignment'),
    'assigned_branch', coalesce(p.assigned_branch, p.branch_code),
    'created_at', p.created_at
  ) order by p.created_at desc), '[]'::jsonb)
  from (
    select *
    from public.be_portal_pickup_requests
    where coalesce(pickup_id, pickup_way_id, '') <> ''
      and lower(coalesce(status, '')) not in ('cancelled','completed','delivered','failed','mock','sample','demo','archived_test_data')
      and lower(coalesce(assignment_status, 'pending_assignment')) not in ('assigned','pickup_assigned','dispatched')
      and (
        coalesce(p_search, '') = ''
        or coalesce(pickup_id, '') ilike '%' || p_search || '%'
        or coalesce(pickup_way_id, '') ilike '%' || p_search || '%'
        or coalesce(merchant_name, '') ilike '%' || p_search || '%'
        or coalesce(merchant_code, '') ilike '%' || p_search || '%'
        or coalesce(sender_name, '') ilike '%' || p_search || '%'
        or coalesce(sender_phone, '') ilike '%' || p_search || '%'
        or coalesce(township, pickup_township, '') ilike '%' || p_search || '%'
      )
    order by created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) p;
$$;

drop function if exists public.be_supervisor_pickup_assignment_queue(integer);
create or replace function public.be_supervisor_pickup_assignment_queue(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select public.be_pending_pickup_assignment_list('', p_limit);
$$;

drop function if exists public.be_data_entry_accept_pickup_request(text);
create or replace function public.be_data_entry_accept_pickup_request(p_pickup_request_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(coalesce(p_pickup_request_id, ''));
  v_row public.be_portal_pickup_requests;
begin
  update public.be_portal_pickup_requests
  set status = 'DATA_ENTRY_IN_PROGRESS',
      operation_status = 'data_entry_in_progress',
      data_entry_status = 'in_progress',
      updated_at = now()
  where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Pickup request % not found', p_pickup_request_id;
  end if;

  insert into public.be_portal_cargo_events (
    pickup_id, pickup_way_id, event_type, event_status, status, source_module,
    source_table, source_key, branch_code, remarks, payload, created_at, updated_at
  )
  values (
    coalesce(v_row.pickup_id, v_row.pickup_way_id), coalesce(v_row.pickup_way_id, v_row.pickup_id),
    'DATA_ENTRY_ACCEPTED', 'data_entry_in_progress', 'data_entry_in_progress', 'data_entry',
    'be_portal_pickup_requests', coalesce(v_row.pickup_id, v_row.pickup_way_id) || ':data_entry_accepted',
    coalesce(v_row.branch_code, v_row.assigned_branch),
    'Pickup accepted by Data Entry.',
    to_jsonb(v_row), now(), now()
  );

  return jsonb_build_object('ok', true, 'pickup_id', coalesce(v_row.pickup_id, v_row.pickup_way_id), 'status', 'DATA_ENTRY_IN_PROGRESS');
end;
$$;

drop function if exists public.be_data_entry_prepare_pickup_template(text);
create or replace function public.be_data_entry_prepare_pickup_template(p_pickup_request_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(coalesce(p_pickup_request_id, ''));
  v_row public.be_portal_pickup_requests;
  v_count integer;
  v_i integer;
  v_delivery_id text;
  v_prefix text;
  v_rows jsonb;
begin
  select * into v_row
  from public.be_portal_pickup_requests
  where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id
  order by created_at desc
  limit 1;

  if v_row.id is null then
    raise exception 'Pickup request % not found', p_pickup_request_id;
  end if;

  v_count := greatest(coalesce(v_row.parcel_count, 1), 1);
  v_prefix := replace(coalesce(v_row.pickup_way_id, v_row.pickup_id), 'P', 'D');

  for v_i in 1..v_count loop
    v_delivery_id := regexp_replace(v_prefix, '-[0-9]{3}$', '') || '-' || lpad(v_i::text, 3, '0');

    if not exists (
      select 1 from public.be_portal_cargo_events
      where pickup_id = coalesce(v_row.pickup_id, v_row.pickup_way_id)
        and coalesce(delivery_way_id, deliver_way_id, tracking_no) = v_delivery_id
    ) then
      insert into public.be_portal_cargo_events (
        pickup_id, pickup_way_id, deliver_way_id, delivery_way_id, tracking_no, line_no,
        event_type, event_status, status, source_module, source_table, source_key,
        branch_code, pickup_date, merchant_code, merchant_name, merchant,
        sender_name, sender_phone, pickup_address, pickup_township, pickup_city,
        item_price, item_value, deli_fee_os, delivery_fee_os, cod_os, cod_amount, weight_kg, surcharge, final_cod,
        payload, metadata, created_at, updated_at
      )
      values (
        coalesce(v_row.pickup_id, v_row.pickup_way_id),
        coalesce(v_row.pickup_way_id, v_row.pickup_id),
        v_delivery_id, v_delivery_id, v_delivery_id, v_i,
        'data_entry_waybill', 'draft', 'draft', 'data_entry', 'be_portal_cargo_events', v_delivery_id,
        coalesce(v_row.branch_code, v_row.assigned_branch),
        v_row.pickup_date,
        v_row.merchant_code, v_row.merchant_name, coalesce(v_row.merchant_name, v_row.merchant_code),
        v_row.sender_name, v_row.sender_phone, v_row.pickup_address, coalesce(v_row.pickup_township, v_row.township), v_row.pickup_city,
        0, 0, 0, 0, 0, 0, 0, 0, 0,
        jsonb_build_object('source', 'data_entry_template', 'pickup_id', coalesce(v_row.pickup_id, v_row.pickup_way_id), 'delivery_way_id', v_delivery_id),
        '{}'::jsonb, now(), now()
      );
    end if;
  end loop;

  update public.be_portal_pickup_requests
  set status = 'DATA_ENTRY_IN_PROGRESS',
      operation_status = 'data_entry_in_progress',
      data_entry_status = 'template_ready',
      updated_at = now()
  where id = v_row.id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.line_no), '[]'::jsonb)
  into v_rows
  from public.be_portal_cargo_events x
  where x.pickup_id = coalesce(v_row.pickup_id, v_row.pickup_way_id)
    and x.event_type = 'data_entry_waybill';

  return jsonb_build_object(
    'ok', true,
    'pickup_id', coalesce(v_row.pickup_id, v_row.pickup_way_id),
    'pickup_request_id', coalesce(v_row.pickup_id, v_row.pickup_way_id),
    'pickup_way_id', coalesce(v_row.pickup_way_id, v_row.pickup_id),
    'parcel_count', v_count,
    'rows', v_rows
  );
end;
$$;

drop function if exists public.be_data_entry_fetch_parcels(text);
create or replace function public.be_data_entry_fetch_parcels(p_pickup_request_id text)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.line_no nulls last, x.created_at), '[]'::jsonb)
  from public.be_portal_cargo_events x
  where (x.pickup_id = trim(coalesce(p_pickup_request_id, '')) or x.pickup_way_id = trim(coalesce(p_pickup_request_id, '')))
    and coalesce(x.event_type, '') = 'data_entry_waybill';
$$;

drop function if exists public.be_data_entry_save_parcel(uuid, jsonb);
create or replace function public.be_data_entry_save_parcel(p_parcel_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row public.be_portal_cargo_events;
begin
  update public.be_portal_cargo_events
  set receiver_name = coalesce(nullif(p_payload->>'receiver_name',''), receiver_name),
      receiver_phone = coalesce(nullif(p_payload->>'receiver_phone',''), receiver_phone),
      receiver_township = coalesce(nullif(coalesce(p_payload->>'receiver_township', p_payload->>'recipient_town', p_payload->>'delivery_township'), ''), receiver_township),
      recipient_town = coalesce(nullif(coalesce(p_payload->>'recipient_town', p_payload->>'receiver_township', p_payload->>'delivery_township'), ''), recipient_town),
      delivery_township = coalesce(nullif(coalesce(p_payload->>'delivery_township', p_payload->>'receiver_township', p_payload->>'recipient_town'), ''), delivery_township),
      receiver_address = coalesce(nullif(coalesce(p_payload->>'receiver_address', p_payload->>'delivery_address'), ''), receiver_address),
      delivery_address = coalesce(nullif(coalesce(p_payload->>'delivery_address', p_payload->>'receiver_address'), ''), delivery_address),
      item_value = coalesce(nullif(p_payload->>'item_value','')::numeric, item_value, 0),
      item_price = coalesce(nullif(coalesce(p_payload->>'item_price', p_payload->>'item_value'),'')::numeric, item_price, 0),
      delivery_fee_os = coalesce(nullif(p_payload->>'delivery_fee_os','')::numeric, delivery_fee_os, 0),
      deli_fee_os = coalesce(nullif(coalesce(p_payload->>'deli_fee_os', p_payload->>'delivery_fee_os'),'')::numeric, deli_fee_os, 0),
      surcharge = coalesce(nullif(p_payload->>'surcharge','')::numeric, surcharge, 0),
      weight_kg = coalesce(nullif(p_payload->>'weight_kg','')::numeric, weight_kg, 0),
      final_cod = coalesce(nullif(p_payload->>'final_cod','')::numeric, nullif(p_payload->>'item_value','')::numeric + nullif(p_payload->>'delivery_fee_os','')::numeric + nullif(p_payload->>'surcharge','')::numeric, final_cod, 0),
      cod_amount = coalesce(nullif(p_payload->>'final_cod','')::numeric, cod_amount, 0),
      remarks = coalesce(nullif(coalesce(p_payload->>'data_entry_note', p_payload->>'remarks'), ''), remarks),
      status = 'draft',
      payload = coalesce(payload, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb),
      updated_at = now()
  where id = p_parcel_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Parcel row % not found', p_parcel_id;
  end if;

  return to_jsonb(v_row);
end;
$$;

drop function if exists public.be_data_entry_submit_pickup_parcels(text);
create or replace function public.be_data_entry_submit_pickup_parcels(p_pickup_request_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(coalesce(p_pickup_request_id, ''));
  v_count integer := 0;
begin
  update public.be_portal_cargo_events
  set event_status = 'pending_supervisor_assignment',
      status = case when coalesce(status, '') in ('draft','data_entry_in_progress') then 'pending_supervisor_assignment' else status end,
      updated_at = now()
  where pickup_id = v_pickup_id
    and event_type = 'data_entry_waybill';

  get diagnostics v_count = row_count;

  update public.be_portal_pickup_requests
  set status = 'pending',
      operation_status = 'pending_supervisor_assignment',
      data_entry_status = 'submitted',
      assignment_status = 'pending_assignment',
      updated_at = now()
  where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  insert into public.be_app_notifications (
    event_key, pickup_id, pickup_way_id, title, body, message, target_role,
    source_table, source_key, notification_type, category, status, is_read, payload, metadata, created_at, updated_at
  )
  select
    v_pickup_id || ':data_entry_submitted:' || role_name,
    v_pickup_id,
    v_pickup_id,
    'Pickup ready for assignment',
    'Pickup ' || v_pickup_id || ' is ready for Supervisor assignment.',
    'Pickup ' || v_pickup_id || ' is ready for Supervisor assignment.',
    role_name,
    'be_portal_pickup_requests',
    v_pickup_id || ':data_entry_submitted:' || role_name,
    'data_entry_submitted',
    'data_entry_submitted',
    'unread',
    false,
    jsonb_build_object('pickup_id', v_pickup_id, 'event', 'data_entry_submitted'),
    '{}'::jsonb,
    now(),
    now()
  from unnest(array['supervisor','operation_manager','dispatch']) as role_name
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'pickup_request_id', v_pickup_id, 'parcel_count', v_count, 'status', 'pending_supervisor_assignment');
end;
$$;

alter table public.be_portal_pickup_requests enable row level security;
alter table public.cs_tickets enable row level security;
alter table public.be_portal_cargo_events enable row level security;
alter table public.be_app_notifications enable row level security;

drop policy if exists be_portal_pickup_requests_all_auth on public.be_portal_pickup_requests;
create policy be_portal_pickup_requests_all_auth
on public.be_portal_pickup_requests for all to authenticated using (true) with check (true);

drop policy if exists cs_tickets_all_auth on public.cs_tickets;
create policy cs_tickets_all_auth
on public.cs_tickets for all to authenticated using (true) with check (true);

drop policy if exists be_portal_cargo_events_all_auth on public.be_portal_cargo_events;
create policy be_portal_cargo_events_all_auth
on public.be_portal_cargo_events for all to authenticated using (true) with check (true);

drop policy if exists be_app_notifications_all_auth on public.be_app_notifications;
create policy be_app_notifications_all_auth
on public.be_app_notifications for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.be_portal_pickup_requests to authenticated;
grant select, insert, update, delete on public.cs_tickets to authenticated;
grant select, insert, update, delete on public.be_portal_cargo_events to authenticated;
grant select, insert, update, delete on public.be_app_notifications to authenticated;
grant execute on function public.be_customer_service_pickup_requests(integer) to authenticated;
grant execute on function public.be_customer_service_create_pickup(jsonb) to authenticated;
grant execute on function public.be_customer_service_create_ticket(jsonb) to authenticated;
grant execute on function public.be_customer_service_go_live_snapshot(jsonb) to authenticated;
grant execute on function public.be_customer_service_recent_pickup_requests(integer) to authenticated;
grant execute on function public.be_pickup_request_dropdown_options(integer) to authenticated;
grant execute on function public.be_pending_pickup_assignment_list(text, integer) to authenticated;
grant execute on function public.be_supervisor_pickup_assignment_queue(integer) to authenticated;
grant execute on function public.be_data_entry_accept_pickup_request(text) to authenticated;
grant execute on function public.be_data_entry_prepare_pickup_template(text) to authenticated;
grant execute on function public.be_data_entry_fetch_parcels(text) to authenticated;
grant execute on function public.be_data_entry_save_parcel(uuid, jsonb) to authenticated;
grant execute on function public.be_data_entry_submit_pickup_parcels(text) to authenticated;
