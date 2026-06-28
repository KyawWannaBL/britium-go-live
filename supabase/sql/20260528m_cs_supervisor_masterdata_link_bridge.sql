-- Buildfix #27: CS <-> Master Data <-> Supervisor/Rider live bridge
-- Purpose:
--   1) Remove "Customer Service snapshot RPC unavailable" fallback mode.
--   2) Normalize Merchant Master data for Customer Service auto-fill.
--   3) Ensure one CS pickup creates a canonical Pickup ID visible to Supervisor and Rider flows.
--   4) Keep the bridge independent of fragile legacy table shapes while mirroring when possible.

create extension if not exists pgcrypto;

create table if not exists public.be_golive_pickup_bridge (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique not null,
  source text not null default 'customer_service',
  requester_type text not null default 'merchant',
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text,
  assigned_branch text default 'YGN',
  route_zone text,
  payment_terms text default 'COD',
  tariff_code text,
  parcel_count integer not null default 1,
  cod_amount numeric not null default 0,
  priority text default 'Normal',
  status text not null default 'data_entry_in_progress',
  workflow_stage text not null default 'customer_service_submitted',
  rider_code text,
  rider_name text,
  driver_code text,
  driver_name text,
  helper_code text,
  helper_name text,
  assigned_by text,
  assigned_at timestamptz,
  pickup_date date,
  pickup_time text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_golive_events_bridge (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  actor text,
  target_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_golive_notifications_bridge (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  title text not null,
  body text,
  target_role text not null,
  target_branch text,
  status text not null default 'unread',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.be_golive_assignment_bridge (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  rider_code text,
  rider_name text,
  driver_code text,
  driver_name text,
  helper_code text,
  helper_name text,
  route_zone text,
  branch_code text,
  assigned_by text,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists be_golive_pickup_bridge_merchant_code_idx on public.be_golive_pickup_bridge (merchant_code);
create index if not exists be_golive_pickup_bridge_status_idx on public.be_golive_pickup_bridge (status);
create index if not exists be_golive_pickup_bridge_created_at_idx on public.be_golive_pickup_bridge (created_at desc);
create index if not exists be_golive_assignment_bridge_rider_idx on public.be_golive_assignment_bridge (rider_code);
create index if not exists be_golive_events_bridge_pickup_idx on public.be_golive_events_bridge (pickup_id, created_at desc);
create index if not exists be_golive_notifications_bridge_role_idx on public.be_golive_notifications_bridge (target_role, status, created_at desc);

drop function if exists public.be_golive_jtext(jsonb, text[]);
create or replace function public.be_golive_jtext(p_obj jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  if p_obj is null then
    return null;
  end if;

  foreach k in array p_keys loop
    v := nullif(trim(coalesce(p_obj ->> k, '')), '');
    if v is not null then
      return v;
    end if;

    v := nullif(trim(coalesce(p_obj #>> array['payload', k], '')), '');
    if v is not null then
      return v;
    end if;

    v := nullif(trim(coalesce(p_obj #>> array['metadata', k], '')), '');
    if v is not null then
      return v;
    end if;

    v := nullif(trim(coalesce(p_obj #>> array['raw_payload', k], '')), '');
    if v is not null then
      return v;
    end if;
  end loop;

  return null;
end;
$$;

drop function if exists public.be_golive_next_pickup_id(text);
create or replace function public.be_golive_next_pickup_id(p_merchant_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_prefix text;
  v_seq integer;
  v_pickup_id text;
begin
  v_code := upper(regexp_replace(coalesce(nullif(p_merchant_code, ''), 'GEN'), '[^A-Z0-9]+', '', 'g'));
  if v_code = '' then
    v_code := 'GEN';
  end if;
  v_code := left(v_code, 6);
  v_prefix := 'P' || to_char(now(), 'MMDD') || '-' || v_code || '-';

  select count(*) + 1
    into v_seq
  from public.be_golive_pickup_bridge
  where pickup_id like v_prefix || '%';

  loop
    v_pickup_id := v_prefix || lpad(v_seq::text, 3, '0');
    exit when not exists (
      select 1 from public.be_golive_pickup_bridge where pickup_id = v_pickup_id
    );
    v_seq := v_seq + 1;
  end loop;

  return v_pickup_id;
end;
$$;

drop function if exists public.be_golive_event(text, text, jsonb, text, text);
create or replace function public.be_golive_event(
  p_pickup_id text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_actor text default null,
  p_target_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_golive_events_bridge(pickup_id, event_type, event_payload, actor, target_role)
  values (p_pickup_id, p_event_type, coalesce(p_payload, '{}'::jsonb), p_actor, p_target_role);

  if p_target_role is not null then
    insert into public.be_golive_notifications_bridge(pickup_id, title, body, target_role, target_branch, metadata)
    select
      p_pickup_id,
      replace(initcap(replace(p_event_type, '_', ' ')), 'Cs', 'CS'),
      coalesce(p_payload ->> 'message', 'Pickup ' || coalesce(p_pickup_id, '') || ' updated.'),
      p_target_role,
      coalesce(p_payload ->> 'assigned_branch', p_payload ->> 'branch', p_payload ->> 'branch_code'),
      coalesce(p_payload, '{}'::jsonb);
  end if;
end;
$$;

drop function if exists public.be_customer_service_merchant_lookup(text, integer);
create or replace function public.be_customer_service_merchant_lookup(
  p_query text default '',
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_rows jsonb := '[]'::jsonb;
  v_bridge_rows jsonb := '[]'::jsonb;
  v_raw jsonb;
  v_norm jsonb := '[]'::jsonb;
  v_obj jsonb;
  v_code text;
  v_name text;
  v_phone text;
  v_address text;
  v_township text;
  v_city text;
  v_branch text;
  v_payment_terms text;
  v_tariff_code text;
begin
  -- Source 1: official Master Data table, if present.
  if to_regclass('public.be_master_data_options') is not null then
    begin
      execute
        'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)
           from (
             select *
             from public.be_master_data_options m
             where $1 = ''''
                or lower(to_jsonb(m)::text) like lower(''%'' || $1 || ''%'')
             limit $2
           ) x'
      into v_rows
      using v_query, v_limit;
    exception when others then
      v_rows := '[]'::jsonb;
    end;
  end if;

  for v_raw in select value from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) loop
    v_code := public.be_golive_jtext(v_raw,
      'merchant_code', 'merchantCode', 'customer_code', 'customerCode', 'code', 'resource_code', 'value', 'id'
    );
    v_name := public.be_golive_jtext(v_raw,
      'merchant_name', 'merchantName', 'customer_name', 'customerName', 'name', 'label', 'display_name', 'title'
    );
    v_phone := public.be_golive_jtext(v_raw,
      'sender_phone', 'merchant_phone', 'phone', 'mobile', 'contact_phone', 'phone_number'
    );
    v_address := public.be_golive_jtext(v_raw,
      'pickup_address', 'pickupAddress', 'merchant_address', 'customer_address', 'address', 'full_address'
    );
    v_township := public.be_golive_jtext(v_raw,
      'pickup_township', 'pickupTownship', 'township', 'merchant_township', 'customer_township'
    );
    v_city := public.be_golive_jtext(v_raw,
      'pickup_city', 'pickupCity', 'city', 'region', 'merchant_city', 'customer_city'
    );
    v_branch := public.be_golive_jtext(v_raw,
      'assigned_branch', 'branch', 'branch_code', 'branchCode', 'hub_code'
    );
    v_payment_terms := public.be_golive_jtext(v_raw,
      'payment_terms', 'paymentTerms', 'payment_type', 'paymentType'
    );
    v_tariff_code := public.be_golive_jtext(v_raw,
      'tariff_code', 'tariffCode', 'tariff', 'tier'
    );

    if v_code is not null or v_name is not null then
      v_obj := jsonb_build_object(
        'source', 'master_data',
        'merchant_code', v_code,
        'merchantCode', v_code,
        'code', v_code,
        'merchant_name', v_name,
        'merchantName', v_name,
        'name', v_name,
        'sender_name', coalesce(public.be_golive_jtext(v_raw, 'sender_name', 'senderName'), v_name),
        'sender_phone', v_phone,
        'phone', v_phone,
        'pickup_address', v_address,
        'pickupAddress', v_address,
        'address', v_address,
        'pickup_township', v_township,
        'township', v_township,
        'pickup_city', coalesce(v_city, 'Yangon'),
        'city', coalesce(v_city, 'Yangon'),
        'assigned_branch', coalesce(v_branch, 'YGN'),
        'branch', coalesce(v_branch, 'YGN'),
        'payment_terms', coalesce(v_payment_terms, 'COD'),
        'tariff_code', v_tariff_code,
        'raw', v_raw
      );

      if v_query = ''
         or lower(coalesce(v_code, '') || ' ' || coalesce(v_name, '') || ' ' || coalesce(v_phone, '') || ' ' || coalesce(v_address, '')) like '%' || v_query || '%'
      then
        v_norm := v_norm || jsonb_build_array(v_obj);
      end if;
    end if;
  end loop;

  -- Source 2: latest live pickups, useful when master lacks pickup address.
  begin
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      into v_bridge_rows
    from (
      select distinct on (coalesce(merchant_code, merchant_name))
        merchant_code,
        merchant_name,
        sender_name,
        sender_phone,
        pickup_address,
        pickup_township,
        pickup_city,
        assigned_branch,
        route_zone,
        payment_terms,
        tariff_code,
        created_at
      from public.be_golive_pickup_bridge
      where (v_query = ''
          or lower(coalesce(merchant_code, '') || ' ' || coalesce(merchant_name, '') || ' ' || coalesce(sender_phone, '') || ' ' || coalesce(pickup_address, '')) like '%' || v_query || '%')
      order by coalesce(merchant_code, merchant_name), created_at desc
      limit v_limit
    ) x;
  exception when others then
    v_bridge_rows := '[]'::jsonb;
  end;

  for v_raw in select value from jsonb_array_elements(coalesce(v_bridge_rows, '[]'::jsonb)) loop
    v_obj := jsonb_build_object(
      'source', 'recent_pickup',
      'merchant_code', v_raw ->> 'merchant_code',
      'merchantCode', v_raw ->> 'merchant_code',
      'code', v_raw ->> 'merchant_code',
      'merchant_name', v_raw ->> 'merchant_name',
      'merchantName', v_raw ->> 'merchant_name',
      'name', v_raw ->> 'merchant_name',
      'sender_name', coalesce(v_raw ->> 'sender_name', v_raw ->> 'merchant_name'),
      'sender_phone', v_raw ->> 'sender_phone',
      'phone', v_raw ->> 'sender_phone',
      'pickup_address', v_raw ->> 'pickup_address',
      'pickupAddress', v_raw ->> 'pickup_address',
      'address', v_raw ->> 'pickup_address',
      'pickup_township', v_raw ->> 'pickup_township',
      'township', v_raw ->> 'pickup_township',
      'pickup_city', coalesce(v_raw ->> 'pickup_city', 'Yangon'),
      'city', coalesce(v_raw ->> 'pickup_city', 'Yangon'),
      'assigned_branch', coalesce(v_raw ->> 'assigned_branch', 'YGN'),
      'branch', coalesce(v_raw ->> 'assigned_branch', 'YGN'),
      'route_zone', v_raw ->> 'route_zone',
      'payment_terms', coalesce(v_raw ->> 'payment_terms', 'COD'),
      'tariff_code', v_raw ->> 'tariff_code',
      'raw', v_raw
    );
    v_norm := v_norm || jsonb_build_array(v_obj);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_master_data_options + live_pickup_bridge',
    'count', jsonb_array_length(v_norm),
    'merchants', v_norm,
    'merchant_options', v_norm,
    'merchantOptions', v_norm,
    'master_data', v_norm
  );
end;
$$;

drop function if exists public.be_golive_try_mirror_pickup(jsonb);
create or replace function public.be_golive_try_mirror_pickup(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.be_portal_pickup_requests') is null then
    return;
  end if;

  begin
    alter table public.be_portal_pickup_requests add column if not exists pickup_id text;
    alter table public.be_portal_pickup_requests add column if not exists merchant_code text;
    alter table public.be_portal_pickup_requests add column if not exists merchant_name text;
    alter table public.be_portal_pickup_requests add column if not exists sender_name text;
    alter table public.be_portal_pickup_requests add column if not exists sender_phone text;
    alter table public.be_portal_pickup_requests add column if not exists pickup_address text;
    alter table public.be_portal_pickup_requests add column if not exists pickup_township text;
    alter table public.be_portal_pickup_requests add column if not exists pickup_city text;
    alter table public.be_portal_pickup_requests add column if not exists assigned_branch text;
    alter table public.be_portal_pickup_requests add column if not exists route_zone text;
    alter table public.be_portal_pickup_requests add column if not exists parcel_count integer;
    alter table public.be_portal_pickup_requests add column if not exists cod_amount numeric;
    alter table public.be_portal_pickup_requests add column if not exists status text;
    alter table public.be_portal_pickup_requests add column if not exists workflow_stage text;
    alter table public.be_portal_pickup_requests add column if not exists raw_payload jsonb;
    alter table public.be_portal_pickup_requests add column if not exists created_at timestamptz default now();
    alter table public.be_portal_pickup_requests add column if not exists updated_at timestamptz default now();
  exception when others then
    null;
  end;

  begin
    execute
      'insert into public.be_portal_pickup_requests
       (pickup_id, merchant_code, merchant_name, sender_name, sender_phone, pickup_address, pickup_township, pickup_city,
        assigned_branch, route_zone, parcel_count, cod_amount, status, workflow_stage, raw_payload, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
       on conflict do nothing'
    using
      p_record ->> 'pickup_id',
      p_record ->> 'merchant_code',
      p_record ->> 'merchant_name',
      p_record ->> 'sender_name',
      p_record ->> 'sender_phone',
      p_record ->> 'pickup_address',
      p_record ->> 'pickup_township',
      p_record ->> 'pickup_city',
      p_record ->> 'assigned_branch',
      p_record ->> 'route_zone',
      nullif(p_record ->> 'parcel_count', '')::integer,
      nullif(p_record ->> 'cod_amount', '')::numeric,
      p_record ->> 'status',
      p_record ->> 'workflow_stage',
      p_record;
  exception when others then
    -- Legacy table may have unrelated NOT NULL constraints. The bridge remains source of truth.
    null;
  end;
end;
$$;

drop function if exists public.be_submit_pickup_request(jsonb);
create or replace function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup jsonb;
  v_merchant jsonb;
  v_pickup_id text;
  v_id uuid;
  v_record jsonb;
  v_merchant_code text;
  v_merchant_name text;
  v_sender_name text;
  v_sender_phone text;
  v_address text;
  v_township text;
  v_city text;
  v_branch text;
  v_route_zone text;
  v_payment_terms text;
  v_tariff_code text;
  v_parcel_count integer;
  v_cod_amount numeric;
  v_priority text;
begin
  v_merchant_code := public.be_golive_jtext(v_payload, 'merchant_code', 'merchantCode', 'code');
  v_merchant_name := public.be_golive_jtext(v_payload, 'merchant_name', 'merchantName', 'name');
  v_sender_name := public.be_golive_jtext(v_payload, 'sender_name', 'senderName');
  v_sender_phone := public.be_golive_jtext(v_payload, 'sender_phone', 'senderPhone', 'phone');
  v_address := public.be_golive_jtext(v_payload, 'pickup_address', 'pickupAddress', 'address');
  v_township := public.be_golive_jtext(v_payload, 'pickup_township', 'pickupTownship', 'township');
  v_city := public.be_golive_jtext(v_payload, 'pickup_city', 'pickupCity', 'city');
  v_branch := public.be_golive_jtext(v_payload, 'assigned_branch', 'assignedBranch', 'branch', 'branch_code');
  v_route_zone := public.be_golive_jtext(v_payload, 'route_zone', 'routeZone', 'zone');
  v_payment_terms := public.be_golive_jtext(v_payload, 'payment_terms', 'paymentTerms', 'payment_type');
  v_tariff_code := public.be_golive_jtext(v_payload, 'tariff_code', 'tariffCode', 'tariff');
  v_priority := coalesce(public.be_golive_jtext(v_payload, 'priority'), 'Normal');

  v_parcel_count := greatest(1, coalesce(nullif(v_payload ->> 'parcel_count', '')::integer, nullif(v_payload ->> 'parcelCount', '')::integer, 1));
  v_cod_amount := greatest(0, coalesce(nullif(v_payload ->> 'cod_amount', '')::numeric, nullif(v_payload ->> 'codAmount', '')::numeric, 0));

  -- Fill missing CS fields from Master Data / latest pickup history.
  v_lookup := public.be_customer_service_merchant_lookup(coalesce(v_merchant_code, v_merchant_name, v_sender_phone, ''), 1);
  v_merchant := (v_lookup -> 'merchants') -> 0;

  v_merchant_code := coalesce(v_merchant_code, v_merchant ->> 'merchant_code', v_merchant ->> 'code');
  v_merchant_name := coalesce(v_merchant_name, v_merchant ->> 'merchant_name', v_merchant ->> 'name');
  v_sender_name := coalesce(v_sender_name, v_merchant ->> 'sender_name', v_merchant_name);
  v_sender_phone := coalesce(v_sender_phone, v_merchant ->> 'sender_phone', v_merchant ->> 'phone');
  v_address := coalesce(v_address, v_merchant ->> 'pickup_address', v_merchant ->> 'address');
  v_township := coalesce(v_township, v_merchant ->> 'pickup_township', v_merchant ->> 'township');
  v_city := coalesce(v_city, v_merchant ->> 'pickup_city', v_merchant ->> 'city', 'Yangon');
  v_branch := coalesce(v_branch, v_merchant ->> 'assigned_branch', v_merchant ->> 'branch', 'YGN');
  v_route_zone := coalesce(v_route_zone, v_merchant ->> 'route_zone');
  v_payment_terms := coalesce(v_payment_terms, v_merchant ->> 'payment_terms', 'COD');
  v_tariff_code := coalesce(v_tariff_code, v_merchant ->> 'tariff_code');

  v_pickup_id := coalesce(public.be_golive_jtext(v_payload, 'pickup_id', 'pickupId'), public.be_golive_next_pickup_id(v_merchant_code));

  insert into public.be_golive_pickup_bridge (
    pickup_id, source, requester_type, merchant_code, merchant_name, sender_name, sender_phone,
    pickup_address, pickup_township, pickup_city, assigned_branch, route_zone, payment_terms, tariff_code,
    parcel_count, cod_amount, priority, status, workflow_stage, pickup_date, pickup_time, notes, raw_payload
  )
  values (
    v_pickup_id,
    coalesce(public.be_golive_jtext(v_payload, 'source'), 'customer_service'),
    coalesce(public.be_golive_jtext(v_payload, 'requester_type', 'requesterType'), 'merchant'),
    v_merchant_code, v_merchant_name, v_sender_name, v_sender_phone,
    v_address, v_township, v_city, v_branch, v_route_zone, v_payment_terms, v_tariff_code,
    v_parcel_count, v_cod_amount, v_priority,
    'data_entry_in_progress',
    'customer_service_submitted',
    coalesce(nullif(v_payload ->> 'pickup_date', '')::date, null),
    public.be_golive_jtext(v_payload, 'pickup_time', 'pickupTime'),
    public.be_golive_jtext(v_payload, 'notes', 'special_instructions', 'specialInstructions'),
    v_payload
  )
  on conflict (pickup_id) do update set
    merchant_code = excluded.merchant_code,
    merchant_name = excluded.merchant_name,
    sender_name = excluded.sender_name,
    sender_phone = excluded.sender_phone,
    pickup_address = excluded.pickup_address,
    pickup_township = excluded.pickup_township,
    pickup_city = excluded.pickup_city,
    assigned_branch = excluded.assigned_branch,
    route_zone = excluded.route_zone,
    payment_terms = excluded.payment_terms,
    tariff_code = excluded.tariff_code,
    parcel_count = excluded.parcel_count,
    cod_amount = excluded.cod_amount,
    priority = excluded.priority,
    status = excluded.status,
    workflow_stage = excluded.workflow_stage,
    raw_payload = public.be_golive_pickup_bridge.raw_payload || excluded.raw_payload,
    updated_at = now()
  returning id into v_id;

  select to_jsonb(b)
    into v_record
  from public.be_golive_pickup_bridge b
  where b.id = v_id;

  perform public.be_golive_event(
    v_pickup_id,
    'customer_service_pickup_submitted',
    v_record || jsonb_build_object('message', 'New pickup request submitted by Customer Service.'),
    public.be_golive_jtext(v_payload, 'actor', 'created_by', 'createdBy'),
    'supervisor'
  );

  perform public.be_golive_event(
    v_pickup_id,
    'assignment_required',
    v_record || jsonb_build_object('message', 'Pickup is ready for supervisor assignment.'),
    public.be_golive_jtext(v_payload, 'actor', 'created_by', 'createdBy'),
    'dispatch'
  );

  if v_cod_amount > 0 or upper(coalesce(v_payment_terms, '')) = 'COD' then
    perform public.be_golive_event(
      v_pickup_id,
      'cod_pickup_created',
      v_record || jsonb_build_object('message', 'COD pickup created for finance visibility.'),
      public.be_golive_jtext(v_payload, 'actor', 'created_by', 'createdBy'),
      'finance'
    );
  end if;

  perform public.be_golive_try_mirror_pickup(v_record);

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'pickupId', v_pickup_id,
    'record', v_record,
    'status', 'data_entry_in_progress',
    'workflow_stage', 'customer_service_submitted',
    'message', 'Pickup created and linked to Supervisor assignment queue.'
  );
end;
$$;

drop function if exists public.be_customer_service_pickup_requests(integer);
create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_pickups jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_pickups
  from (
    select *
    from public.be_golive_pickup_bridge
    order by created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', jsonb_array_length(v_pickups),
    'pickups', v_pickups,
    'pickup_requests', v_pickups,
    'pickupRequests', v_pickups,
    'queue', v_pickups
  );
end;
$$;

drop function if exists public.be_supervisor_pickup_queue(integer);
create or replace function public.be_supervisor_pickup_queue(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_queue jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_queue
  from (
    select *
    from public.be_golive_pickup_bridge
    where coalesce(rider_code, '') = ''
       or status in ('data_entry_in_progress', 'submitted', 'pickup_requested', 'assignment_required', 'ready_for_assignment')
    order by created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'count', jsonb_array_length(v_queue),
    'pickups', v_queue,
    'pickup_requests', v_queue,
    'assignment_queue', v_queue,
    'supervisor_queue', v_queue
  );
end;
$$;

drop function if exists public.be_supervisor_snapshot();
create or replace function public.be_supervisor_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'source', 'be_golive_pickup_bridge',
    'queue', public.be_supervisor_pickup_queue(200) -> 'assignment_queue',
    'assignment_queue', public.be_supervisor_pickup_queue(200) -> 'assignment_queue',
    'notifications', (
      select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
      from (
        select *
        from public.be_golive_notifications_bridge
        where target_role in ('supervisor', 'dispatch', 'operation_manager')
        order by created_at desc
        limit 100
      ) n
    )
  );
$$;

drop function if exists public.be_supervisor_assign_job(jsonb);
create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_pickup_id text;
  v_id uuid;
  v_record jsonb;
  v_rider_code text;
  v_rider_name text;
  v_driver_code text;
  v_driver_name text;
  v_helper_code text;
  v_helper_name text;
  v_route_zone text;
  v_branch text;
  v_actor text;
begin
  v_pickup_id := public.be_golive_jtext(v_payload, 'pickup_id', 'pickupId', 'id');
  if v_pickup_id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_id_required');
  end if;

  v_rider_code := public.be_golive_jtext(v_payload, 'rider_code', 'riderCode', 'assigned_rider_code');
  v_rider_name := public.be_golive_jtext(v_payload, 'rider_name', 'riderName', 'assigned_rider_name');
  v_driver_code := public.be_golive_jtext(v_payload, 'driver_code', 'driverCode');
  v_driver_name := public.be_golive_jtext(v_payload, 'driver_name', 'driverName');
  v_helper_code := public.be_golive_jtext(v_payload, 'helper_code', 'helperCode');
  v_helper_name := public.be_golive_jtext(v_payload, 'helper_name', 'helperName');
  v_route_zone := public.be_golive_jtext(v_payload, 'route_zone', 'routeZone', 'zone');
  v_branch := public.be_golive_jtext(v_payload, 'branch', 'branch_code', 'assigned_branch');
  v_actor := public.be_golive_jtext(v_payload, 'actor', 'assigned_by', 'assignedBy');

  update public.be_golive_pickup_bridge
     set rider_code = coalesce(v_rider_code, rider_code),
         rider_name = coalesce(v_rider_name, rider_name),
         driver_code = coalesce(v_driver_code, driver_code),
         driver_name = coalesce(v_driver_name, driver_name),
         helper_code = coalesce(v_helper_code, helper_code),
         helper_name = coalesce(v_helper_name, helper_name),
         route_zone = coalesce(v_route_zone, route_zone),
         assigned_branch = coalesce(v_branch, assigned_branch),
         assigned_by = v_actor,
         assigned_at = now(),
         status = 'assigned',
         workflow_stage = 'supervisor_assigned',
         updated_at = now()
   where pickup_id = v_pickup_id
   returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'pickup_id', v_pickup_id);
  end if;

  insert into public.be_golive_assignment_bridge (
    pickup_id, rider_code, rider_name, driver_code, driver_name, helper_code, helper_name,
    route_zone, branch_code, assigned_by, metadata
  )
  values (
    v_pickup_id, v_rider_code, v_rider_name, v_driver_code, v_driver_name, v_helper_code, v_helper_name,
    v_route_zone, v_branch, v_actor, v_payload
  );

  select to_jsonb(b)
    into v_record
  from public.be_golive_pickup_bridge b
  where b.id = v_id;

  perform public.be_golive_event(
    v_pickup_id,
    'supervisor_assigned',
    v_record || jsonb_build_object('message', 'Pickup assigned by Supervisor and visible in Rider App.'),
    v_actor,
    'rider'
  );

  perform public.be_golive_try_mirror_pickup(v_record);

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'record', v_record,
    'assignment', v_payload,
    'message', 'Assignment linked to Rider App queue.'
  );
end;
$$;

drop function if exists public.be_mobile_go_live_snapshot(text, text, integer);
create or replace function public.be_mobile_go_live_snapshot(
  p_worker_code text default null,
  p_branch text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_worker text := nullif(trim(coalesce(p_worker_code, '')), '');
  v_branch text := nullif(trim(coalesce(p_branch, '')), '');
  v_jobs jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_jobs
  from (
    select *
    from public.be_golive_pickup_bridge
    where status in ('assigned', 'picked_up', 'in_transit', 'delivery_attempted')
      and (v_worker is null or rider_code = v_worker or driver_code = v_worker or helper_code = v_worker)
      and (v_branch is null or assigned_branch = v_branch)
    order by assigned_at desc nulls last, created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'worker_code', v_worker,
    'branch', v_branch,
    'count', jsonb_array_length(v_jobs),
    'jobs', v_jobs,
    'assignments', v_jobs,
    'pickups', v_jobs
  );
end;
$$;

drop function if exists public.be_customer_service_snapshot();
create or replace function public.be_customer_service_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickups jsonb := public.be_customer_service_pickup_requests(100);
  v_merchants jsonb := public.be_customer_service_merchant_lookup('', 200);
  v_supervisor jsonb := public.be_supervisor_pickup_queue(100);
  v_notifications jsonb;
  v_total integer;
  v_open integer;
  v_urgent integer;
begin
  select count(*),
         count(*) filter (where status not in ('delivered', 'cancelled', 'closed')),
         count(*) filter (where lower(coalesce(priority, '')) in ('urgent', 'high'))
    into v_total, v_open, v_urgent
  from public.be_golive_pickup_bridge;

  select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
    into v_notifications
  from (
    select *
    from public.be_golive_notifications_bridge
    order by created_at desc
    limit 100
  ) n;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'source', 'be_golive_cs_supervisor_masterdata_bridge',
    'message', 'Customer Service snapshot RPC active and linked to Master Data, Supervisor, and Rider queues.',
    'stats', jsonb_build_object(
      'total_tickets', 0,
      'open_requests', v_open,
      'pickup_requests', v_total,
      'urgent_open', v_urgent,
      'merchant_options', jsonb_array_length(v_merchants -> 'merchants')
    ),
    'pickups', v_pickups -> 'pickups',
    'pickup_requests', v_pickups -> 'pickups',
    'pickupRequests', v_pickups -> 'pickups',
    'queue', v_pickups -> 'pickups',
    'merchants', v_merchants -> 'merchants',
    'merchant_options', v_merchants -> 'merchants',
    'merchantOptions', v_merchants -> 'merchants',
    'supervisor_queue', v_supervisor -> 'assignment_queue',
    'assignment_queue', v_supervisor -> 'assignment_queue',
    'notifications', v_notifications
  );
end;
$$;

drop function if exists public.be_process_router(text, jsonb);
create or replace function public.be_process_router(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  case v_action
    when 'be_customer_service_snapshot' then
      return public.be_customer_service_snapshot();
    when 'customer_service_snapshot' then
      return public.be_customer_service_snapshot();
    when 'cs_snapshot' then
      return public.be_customer_service_snapshot();

    when 'be_customer_service_merchant_lookup' then
      return public.be_customer_service_merchant_lookup(coalesce(v_payload ->> 'query', v_payload ->> 'search', v_payload ->> 'merchant_code', ''), coalesce(nullif(v_payload ->> 'limit', '')::integer, 50));
    when 'merchant_lookup' then
      return public.be_customer_service_merchant_lookup(coalesce(v_payload ->> 'query', v_payload ->> 'search', v_payload ->> 'merchant_code', ''), coalesce(nullif(v_payload ->> 'limit', '')::integer, 50));

    when 'be_submit_pickup_request' then
      return public.be_submit_pickup_request(v_payload);
    when 'submit_pickup_request' then
      return public.be_submit_pickup_request(v_payload);
    when 'customer_service_create_pickup' then
      return public.be_submit_pickup_request(v_payload);

    when 'be_customer_service_pickup_requests' then
      return public.be_customer_service_pickup_requests(coalesce(nullif(v_payload ->> 'limit', '')::integer, 50));

    when 'be_supervisor_pickup_queue' then
      return public.be_supervisor_pickup_queue(coalesce(nullif(v_payload ->> 'limit', '')::integer, 100));
    when 'be_supervisor_snapshot' then
      return public.be_supervisor_snapshot();
    when 'supervisor_snapshot' then
      return public.be_supervisor_snapshot();

    when 'be_supervisor_assign_job' then
      return public.be_supervisor_assign_job(v_payload);
    when 'supervisor_assign_job' then
      return public.be_supervisor_assign_job(v_payload);
    when 'assign_pickup' then
      return public.be_supervisor_assign_job(v_payload);

    when 'be_mobile_go_live_snapshot' then
      return public.be_mobile_go_live_snapshot(
        coalesce(v_payload ->> 'worker_code', v_payload ->> 'rider_code', v_payload ->> 'code'),
        coalesce(v_payload ->> 'branch', v_payload ->> 'branch_code'),
        coalesce(nullif(v_payload ->> 'limit', '')::integer, 50)
      );

    else
      return jsonb_build_object(
        'ok', false,
        'error', 'unknown_process',
        'action', p_action,
        'message', 'Process router bridge is installed, but this action is not mapped.'
      );
  end case;
end;
$$;

-- Convenience aliases used by older pages.
drop function if exists public.be_customer_service_create_pickup_request(jsonb);
create or replace function public.be_customer_service_create_pickup_request(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_submit_pickup_request(p_payload);
$$;

drop function if exists public.be_supervisor_assignment_snapshot();
create or replace function public.be_supervisor_assignment_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_snapshot();
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.be_golive_pickup_bridge to anon, authenticated, service_role;
grant select, insert, update on public.be_golive_events_bridge to anon, authenticated, service_role;
grant select, insert, update on public.be_golive_notifications_bridge to anon, authenticated, service_role;
grant select, insert, update on public.be_golive_assignment_bridge to anon, authenticated, service_role;

grant execute on function public.be_golive_jtext(jsonb, text[]) to anon, authenticated, service_role;
grant execute on function public.be_golive_next_pickup_id(text) to anon, authenticated, service_role;
grant execute on function public.be_golive_event(text, text, jsonb, text, text) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_merchant_lookup(text, integer) to anon, authenticated, service_role;
grant execute on function public.be_submit_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_pickup_requests(integer) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_snapshot() to anon, authenticated, service_role;
grant execute on function public.be_supervisor_pickup_queue(integer) to anon, authenticated, service_role;
grant execute on function public.be_supervisor_snapshot() to anon, authenticated, service_role;
grant execute on function public.be_supervisor_assign_job(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_mobile_go_live_snapshot(text, text, integer) to anon, authenticated, service_role;
grant execute on function public.be_process_router(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_create_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_supervisor_assignment_snapshot() to anon, authenticated, service_role;

-- Smoke test targets:
-- select public.be_customer_service_snapshot();
-- select public.be_customer_service_merchant_lookup('AK', 10);
-- select public.be_submit_pickup_request('{"merchant_code":"AK","merchant_name":"A&K Collection","sender_phone":"09-978939591","parcel_count":1}'::jsonb);
-- select public.be_supervisor_pickup_queue(20);
-- select public.be_supervisor_assign_job('{"pickup_id":"PASTE_PICKUP_ID","rider_code":"RD009","rider_name":"Default Rider","route_zone":"YGN-A"}'::jsonb);
-- select public.be_mobile_go_live_snapshot('RD009', null, 20);
