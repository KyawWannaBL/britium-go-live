
-- ============================================================
-- Britium CS Pickup + Supervisor Assignment Bridge Fix
-- Safe to rerun.
--
-- Do NOT run the full production_go_live_master.sql again.
-- Run this focused patch only:
--
-- psql "postgresql://postgres:Sh2nstar2101280@db.dltavabvjwocknkyvwgz.supabase.co:5432/postgres" -v ON_ERROR_STOP=1 -f cs_supervisor_pickup_bridge_fix.sql
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) Table compatibility columns
-- ============================================================

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_id text,
  add column if not exists delivery_way_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists merchant_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists pickup_address text,
  add column if not exists address text,
  add column if not exists township text,
  add column if not exists pickup_township text,
  add column if not exists pickup_city text,
  add column if not exists pickup_date date,
  add column if not exists pickup_time text,
  add column if not exists parcel_count integer default 1,
  add column if not exists expected_parcel_count integer,
  add column if not exists required_vehicle text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists payment_method text,
  add column if not exists payment_terms text default 'COD',
  add column if not exists service_type text,
  add column if not exists priority text,
  add column if not exists branch text,
  add column if not exists assigned_branch text default 'YGN',
  add column if not exists route_zone text,
  add column if not exists pickup_status text,
  add column if not exists status text default 'pending_assignment',
  add column if not exists data_entry_status text default 'complete',
  add column if not exists assignment_status text default 'pending_assignment',
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_code text,
  add column if not exists assigned_vehicle_name text,
  add column if not exists assigned_by uuid,
  add column if not exists assigned_by_email text,
  add column if not exists assigned_at timestamptz,
  add column if not exists warehouse_status text,
  add column if not exists finance_status text default 'pending',
  add column if not exists remarks text,
  add column if not exists source text default 'customer_service',
  add column if not exists source_channel text,
  add column if not exists requester_type text default 'customer_service',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists be_portal_pickup_requests_pickup_id_uidx
  on public.be_portal_pickup_requests(pickup_id)
  where pickup_id is not null and pickup_id <> '';

create index if not exists be_portal_pickup_requests_assignment_idx
  on public.be_portal_pickup_requests(assignment_status, status, created_at desc);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  waybill_no text,
  tracking_number text,
  event_type text,
  status text,
  message text,
  source text,
  actor_role text,
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
  add column if not exists delivery_way_id text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists event_type text,
  add column if not exists status text,
  add column if not exists message text,
  add column if not exists source text,
  add column if not exists actor_role text,
  add column if not exists actor_type text,
  add column if not exists actor_code text,
  add column if not exists branch_code text,
  add column if not exists route_zone text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  title text,
  message text,
  target_role text,
  target_branch text,
  pickup_id text,
  source_table text,
  source_key text,
  event_type text,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists target_role text,
  add column if not exists target_branch text,
  add column if not exists pickup_id text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists event_type text,
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

-- ============================================================
-- 2) Helpers
-- ============================================================

create or replace function public.be_workflow_text(p_value text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '')
$$;

create or replace function public.be_pickup_clean_code(p_value text, p_default text default 'GEN')
returns text
language sql
immutable
as $$
  select left(coalesce(nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g')), ''), p_default), 6)
$$;

create or replace function public.be_pickup_next_id(p_pickup_date date, p_merchant_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mmdd text := to_char(coalesce(p_pickup_date, current_date), 'MMDD');
  v_code text := left(public.be_pickup_clean_code(p_merchant_code, 'GEN'), 3);
  v_next integer := 1;
begin
  select coalesce(max(nullif(split_part(pickup_id, '-', 3), '')::integer), 0) + 1
  into v_next
  from public.be_portal_pickup_requests
  where pickup_id ~ ('^P' || v_mmdd || '-' || v_code || '-[0-9]{3}$');

  return 'P' || v_mmdd || '-' || v_code || '-' || lpad(v_next::text, 3, '0');
exception when others then
  return 'P' || v_mmdd || '-' || v_code || '-' || lpad(floor(random() * 900 + 100)::int::text, 3, '0');
end;
$$;

create or replace function public.be_pickup_emit_event(
  p_pickup_id text,
  p_event_type text,
  p_status text,
  p_message text,
  p_source text default 'enterprise_portal',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_portal_cargo_events (
    pickup_id,
    pickup_way_id,
    event_type,
    status,
    message,
    source,
    actor_role,
    metadata,
    created_at
  )
  values (
    p_pickup_id,
    p_pickup_id,
    p_event_type,
    p_status,
    p_message,
    p_source,
    p_source,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  );
exception when others then
  null;
end;
$$;

create or replace function public.be_pickup_notify(
  p_pickup_id text,
  p_role text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_app_notifications (
    title,
    message,
    target_role,
    pickup_id,
    source_table,
    source_key,
    event_type,
    metadata,
    created_at
  )
  values (
    p_title,
    p_message,
    p_role,
    p_pickup_id,
    'be_portal_pickup_requests',
    p_pickup_id,
    'pickup_workflow',
    coalesce(p_metadata, '{}'::jsonb),
    now()
  );
exception when others then
  null;
end;
$$;

-- ============================================================
-- 3) CS Pickup Submit RPCs
-- ============================================================

create or replace function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_pickup_id text;
  v_pickup_date date := current_date;
  v_merchant_code text;
  v_merchant_name text;
  v_phone text;
  v_contact_person text;
  v_address text;
  v_township text;
  v_city text;
  v_expected_parcels integer := 1;
  v_required_vehicle text;
  v_payment_terms text;
  v_status text := 'pending_assignment';
  v_rec jsonb;
begin
  begin
    v_pickup_date := coalesce(
      nullif(v_payload ->> 'pickup_date', '')::date,
      nullif(v_payload ->> 'date', '')::date,
      current_date
    );
  exception when others then
    v_pickup_date := current_date;
  end;

  v_merchant_code := public.be_pickup_clean_code(
    coalesce(
      v_payload ->> 'merchant_code',
      v_payload ->> 'merchant_id',
      v_payload ->> 'merchant',
      v_payload ->> 'merchant_name',
      'GEN'
    ),
    'GEN'
  );

  v_merchant_name := coalesce(
    public.be_workflow_text(v_payload ->> 'merchant_name'),
    public.be_workflow_text(v_payload ->> 'merchant'),
    v_merchant_code
  );

  v_phone := coalesce(
    public.be_workflow_text(v_payload ->> 'phone'),
    public.be_workflow_text(v_payload ->> 'sender_phone'),
    public.be_workflow_text(v_payload ->> 'merchant_phone'),
    public.be_workflow_text(v_payload ->> 'contact_phone')
  );

  v_contact_person := coalesce(
    public.be_workflow_text(v_payload ->> 'contact_person'),
    public.be_workflow_text(v_payload ->> 'sender_name'),
    public.be_workflow_text(v_payload ->> 'merchant_contact')
  );

  v_address := coalesce(
    public.be_workflow_text(v_payload ->> 'address'),
    public.be_workflow_text(v_payload ->> 'pickup_address'),
    public.be_workflow_text(v_payload ->> 'default_pickup_address')
  );

  v_township := coalesce(
    public.be_workflow_text(v_payload ->> 'township'),
    public.be_workflow_text(v_payload ->> 'pickup_township')
  );

  v_city := coalesce(
    public.be_workflow_text(v_payload ->> 'city'),
    public.be_workflow_text(v_payload ->> 'pickup_city'),
    'Yangon'
  );

  begin
    v_expected_parcels := greatest(
      coalesce(
        nullif(v_payload ->> 'expected_parcels', '')::integer,
        nullif(v_payload ->> 'parcel_count', '')::integer,
        nullif(v_payload ->> 'delivery_count', '')::integer,
        1
      ),
      1
    );
  exception when others then
    v_expected_parcels := 1;
  end;

  v_required_vehicle := coalesce(
    public.be_workflow_text(v_payload ->> 'required_vehicle'),
    public.be_workflow_text(v_payload ->> 'vehicle_type'),
    'Bike'
  );

  v_payment_terms := coalesce(
    public.be_workflow_text(v_payload ->> 'payment_terms'),
    public.be_workflow_text(v_payload ->> 'payment_method'),
    'COD'
  );

  if v_address is null or v_township is null then
    v_status := 'data_entry_in_progress';
  end if;

  v_pickup_id := public.be_pickup_next_id(v_pickup_date, v_merchant_code);

  insert into public.be_portal_pickup_requests (
    pickup_id,
    pickup_way_id,
    merchant_code,
    merchant_name,
    sender_name,
    sender_phone,
    contact_person,
    phone,
    pickup_address,
    address,
    township,
    pickup_township,
    pickup_city,
    pickup_date,
    parcel_count,
    expected_parcel_count,
    required_vehicle,
    payment_method,
    payment_terms,
    branch,
    assigned_branch,
    pickup_status,
    status,
    data_entry_status,
    assignment_status,
    remarks,
    source,
    source_channel,
    requester_type,
    payload,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_pickup_id,
    v_pickup_id,
    v_merchant_code,
    v_merchant_name,
    v_contact_person,
    v_phone,
    v_contact_person,
    v_phone,
    v_address,
    v_address,
    v_township,
    v_township,
    v_city,
    v_pickup_date,
    v_expected_parcels,
    v_expected_parcels,
    v_required_vehicle,
    v_payment_terms,
    v_payment_terms,
    coalesce(public.be_workflow_text(v_payload ->> 'branch'), 'YGN'),
    coalesce(public.be_workflow_text(v_payload ->> 'branch'), 'YGN'),
    'PICKUP_REQUESTED',
    v_status,
    case when v_status = 'data_entry_in_progress' then 'required' else 'complete' end,
    'pending_assignment',
    coalesce(public.be_workflow_text(v_payload ->> 'remarks'), public.be_workflow_text(v_payload ->> 'remark'), public.be_workflow_text(v_payload ->> 'special_instructions')),
    'pickup_request_form',
    'enterprise_portal',
    'customer_service',
    v_payload,
    v_payload || jsonb_build_object(
      'source', 'pickup_request_form',
      'pickup_id', v_pickup_id,
      'submitted_at', now()
    ),
    now(),
    now()
  )
  returning to_jsonb(be_portal_pickup_requests.*) into v_rec;

  perform public.be_pickup_emit_event(v_pickup_id, 'pickup_submitted', v_status, v_pickup_id || ' submitted from Pickup Request Form', 'customer_service', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'supervisor', 'Pickup assignment required', v_pickup_id || ' is ready for assignment', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'operations', 'New pickup request', v_pickup_id || ' entered the operation workflow', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'dispatch', 'Pickup dispatch planning', v_pickup_id || ' is available for route planning', v_rec);

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'pickup_way_id', v_pickup_id,
    'pickup_status', 'PICKUP_REQUESTED',
    'status', v_status,
    'assignment_status', 'pending_assignment',
    'record', v_rec
  );
end;
$$;

create or replace function public.be_cs_create_pickup_request(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_submit_pickup_request(p_payload);
$$;

create or replace function public.be_customer_service_create_pickup_request(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_submit_pickup_request(p_payload);
$$;

create or replace function public.be_create_pickup_request(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_submit_pickup_request(p_payload);
$$;

-- ============================================================
-- 4) Supervisor queue and workforce options
-- ============================================================

create or replace function public.be_supervisor_pickup_queue(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'count', count(*),
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb),
    'data', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb),
    'queue', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  )
  from (
    select
      id,
      pickup_id,
      pickup_way_id,
      merchant_code,
      merchant_name,
      sender_name,
      sender_phone,
      contact_person,
      pickup_address,
      address,
      township,
      pickup_township,
      pickup_city,
      pickup_date,
      parcel_count,
      expected_parcel_count,
      required_vehicle,
      branch,
      assigned_branch,
      route_zone,
      assigned_rider_code,
      assigned_rider_name,
      assigned_driver_code,
      assigned_driver_name,
      assigned_helper_code,
      assigned_helper_name,
      assigned_vehicle_code,
      assigned_vehicle_name,
      pickup_status,
      status,
      data_entry_status,
      assignment_status,
      warehouse_status,
      finance_status,
      remarks,
      payload,
      metadata,
      created_at,
      updated_at
    from public.be_portal_pickup_requests
    where lower(coalesce(status, '')) not in ('closed', 'cancelled', 'pickup_cancelled')
      and lower(coalesce(assignment_status, 'pending_assignment')) in ('pending_assignment', 'pending', 'requested', 'pickup_requested', 'assigned')
    order by
      case when lower(coalesce(assignment_status, 'pending_assignment')) in ('pending_assignment', 'pending', 'requested', 'pickup_requested') then 0 else 1 end,
      created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) x;
$$;

create or replace function public.be_pickup_assignment_queue(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_pickup_queue(p_limit);
$$;

create or replace function public.be_supervisor_assignment_queue(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_pickup_queue(p_limit);
$$;

create or replace function public.be_supervisor_workforce_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'riders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', record_key,
        'label', coalesce(payload ->> 'rider_name', payload ->> 'name', record_key),
        'code', record_key,
        'name', coalesce(payload ->> 'rider_name', payload ->> 'name', record_key),
        'phone', payload ->> 'phone_primary'
      ) order by record_key)
      from public.be_master_data_rows
      where dataset_key = 'rider_master'
        and deleted_at is null
        and lower(coalesce(payload ->> 'status', status, 'active')) <> 'inactive'
    ), '[]'::jsonb),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', record_key,
        'label', coalesce(payload ->> 'driver_name', payload ->> 'name', record_key),
        'code', record_key,
        'name', coalesce(payload ->> 'driver_name', payload ->> 'name', record_key),
        'phone', payload ->> 'phone_primary'
      ) order by record_key)
      from public.be_master_data_rows
      where dataset_key = 'driver_master'
        and deleted_at is null
        and lower(coalesce(payload ->> 'status', status, 'active')) <> 'inactive'
    ), '[]'::jsonb),
    'helpers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', record_key,
        'label', coalesce(payload ->> 'helper_name', payload ->> 'name', record_key),
        'code', record_key,
        'name', coalesce(payload ->> 'helper_name', payload ->> 'name', record_key),
        'phone', payload ->> 'phone_primary'
      ) order by record_key)
      from public.be_master_data_rows
      where dataset_key = 'helper_master'
        and deleted_at is null
        and lower(coalesce(payload ->> 'status', status, 'active')) <> 'inactive'
    ), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', record_key,
        'label', coalesce(payload ->> 'vehicle_no', payload ->> 'vehicle_name', payload ->> 'fleet_id', record_key),
        'code', record_key,
        'name', coalesce(payload ->> 'vehicle_no', payload ->> 'vehicle_name', record_key),
        'vehicle_type', payload ->> 'vehicle_type',
        'capacity_kg', payload ->> 'capacity_kg'
      ) order by record_key)
      from public.be_master_data_rows
      where dataset_key in ('fleet_master', 'vehicle_capacity')
        and deleted_at is null
        and lower(coalesce(payload ->> 'status', status, 'active')) not in ('inactive', 'disabled')
    ), '[]'::jsonb)
  );
$$;

create or replace function public.be_pickup_assignment_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.be_supervisor_workforce_options();
$$;

-- ============================================================
-- 5) Supervisor assignment RPCs
-- ============================================================

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text;
  v_rider text;
  v_rider_name text;
  v_driver text;
  v_driver_name text;
  v_helper text;
  v_helper_name text;
  v_vehicle text;
  v_vehicle_name text;
  v_actor_email text;
  v_id uuid;
  v_pickup_id text;
  v_rec jsonb;
begin
  v_lookup := coalesce(
    public.be_workflow_text(v_payload ->> 'pickup_id'),
    public.be_workflow_text(v_payload ->> 'pickup_way_id'),
    public.be_workflow_text(v_payload ->> 'id')
  );

  v_rider := coalesce(
    public.be_workflow_text(v_payload ->> 'rider_code'),
    public.be_workflow_text(v_payload ->> 'rider_id'),
    public.be_workflow_text(v_payload ->> 'assigned_rider_code'),
    public.be_workflow_text(v_payload ->> 'field_rider')
  );

  v_rider_name := coalesce(
    public.be_workflow_text(v_payload ->> 'rider_name'),
    public.be_workflow_text(v_payload ->> 'assigned_rider_name')
  );

  v_driver := coalesce(
    public.be_workflow_text(v_payload ->> 'driver_code'),
    public.be_workflow_text(v_payload ->> 'driver_id'),
    public.be_workflow_text(v_payload ->> 'assigned_driver_code')
  );

  v_driver_name := coalesce(
    public.be_workflow_text(v_payload ->> 'driver_name'),
    public.be_workflow_text(v_payload ->> 'assigned_driver_name')
  );

  v_helper := coalesce(
    public.be_workflow_text(v_payload ->> 'helper_code'),
    public.be_workflow_text(v_payload ->> 'helper_id'),
    public.be_workflow_text(v_payload ->> 'assigned_helper_code')
  );

  v_helper_name := coalesce(
    public.be_workflow_text(v_payload ->> 'helper_name'),
    public.be_workflow_text(v_payload ->> 'assigned_helper_name')
  );

  v_vehicle := coalesce(
    public.be_workflow_text(v_payload ->> 'vehicle_code'),
    public.be_workflow_text(v_payload ->> 'vehicle_id'),
    public.be_workflow_text(v_payload ->> 'fleet_id'),
    public.be_workflow_text(v_payload ->> 'assigned_vehicle_code')
  );

  v_vehicle_name := coalesce(
    public.be_workflow_text(v_payload ->> 'vehicle_name'),
    public.be_workflow_text(v_payload ->> 'vehicle_no'),
    public.be_workflow_text(v_payload ->> 'assigned_vehicle_name')
  );

  v_actor_email := coalesce(
    public.be_workflow_text(v_payload ->> 'actor_email'),
    public.be_workflow_text(v_payload ->> 'assigned_by_email'),
    'supervisor@britiumexpress.com'
  );

  update public.be_portal_pickup_requests
  set
    assigned_rider_code = coalesce(v_rider, assigned_rider_code),
    assigned_rider_name = coalesce(v_rider_name, assigned_rider_name),
    assigned_driver_code = coalesce(v_driver, assigned_driver_code),
    assigned_driver_name = coalesce(v_driver_name, assigned_driver_name),
    assigned_helper_code = coalesce(v_helper, assigned_helper_code),
    assigned_helper_name = coalesce(v_helper_name, assigned_helper_name),
    assigned_vehicle_code = coalesce(v_vehicle, assigned_vehicle_code),
    assigned_vehicle_name = coalesce(v_vehicle_name, assigned_vehicle_name),
    assigned_by_email = v_actor_email,
    assigned_at = now(),
    assignment_status = 'assigned',
    pickup_status = 'ASSIGNED',
    status = 'assigned',
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'assignment_payload', v_payload,
      'assigned_at', now(),
      'assigned_by_email', v_actor_email
    ),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'assignment_payload', v_payload,
      'assigned_at', now(),
      'assigned_by_email', v_actor_email
    ),
    updated_at = now()
  where pickup_id = v_lookup
     or pickup_way_id = v_lookup
     or id::text = v_lookup
  returning id, pickup_id, to_jsonb(be_portal_pickup_requests.*)
  into v_id, v_pickup_id, v_rec;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'lookup', v_lookup);
  end if;

  perform public.be_pickup_emit_event(v_pickup_id, 'pickup_assigned', 'assigned', v_pickup_id || ' assigned by supervisor', 'supervisor', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'rider', 'Pickup assigned', v_pickup_id || ' assigned to field rider', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'dispatch', 'Pickup assigned', v_pickup_id || ' assigned and ready for dispatch tracking', v_rec);
  perform public.be_pickup_notify(v_pickup_id, 'warehouse', 'Incoming pickup assigned', v_pickup_id || ' will proceed to warehouse after pickup', v_rec);

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'status', 'assigned',
    'assignment_status', 'assigned',
    'assigned_rider_code', v_rider,
    'assigned_driver_code', v_driver,
    'assigned_helper_code', v_helper,
    'assigned_vehicle_code', v_vehicle,
    'record', v_rec
  );
end;
$$;

create or replace function public.be_assign_pickup_request(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_assign_job(p_payload);
$$;

create or replace function public.be_confirm_pickup_dispatch(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_assign_job(p_payload);
$$;

create or replace function public.be_supervisor_confirm_dispatch(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_supervisor_assign_job(p_payload);
$$;

-- ============================================================
-- 6) Grants / RLS
-- ============================================================

alter table public.be_portal_pickup_requests enable row level security;
alter table public.be_portal_cargo_events enable row level security;
alter table public.be_app_notifications enable row level security;

drop policy if exists be_portal_pickup_requests_read_all on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_write_all on public.be_portal_pickup_requests;
drop policy if exists be_portal_cargo_events_read_all on public.be_portal_cargo_events;
drop policy if exists be_portal_cargo_events_write_all on public.be_portal_cargo_events;
drop policy if exists be_app_notifications_read_all on public.be_app_notifications;
drop policy if exists be_app_notifications_write_all on public.be_app_notifications;

create policy be_portal_pickup_requests_read_all
  on public.be_portal_pickup_requests for select
  to anon, authenticated
  using (true);

create policy be_portal_pickup_requests_write_all
  on public.be_portal_pickup_requests for all
  to anon, authenticated
  using (true)
  with check (true);

create policy be_portal_cargo_events_read_all
  on public.be_portal_cargo_events for select
  to anon, authenticated
  using (true);

create policy be_portal_cargo_events_write_all
  on public.be_portal_cargo_events for all
  to anon, authenticated
  using (true)
  with check (true);

create policy be_app_notifications_read_all
  on public.be_app_notifications for select
  to anon, authenticated
  using (true);

create policy be_app_notifications_write_all
  on public.be_app_notifications for all
  to anon, authenticated
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.be_portal_pickup_requests to anon, authenticated;
grant select, insert, update, delete on public.be_portal_cargo_events to anon, authenticated;
grant select, insert, update, delete on public.be_app_notifications to anon, authenticated;

grant execute on function public.be_submit_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_cs_create_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_customer_service_create_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_create_pickup_request(jsonb) to anon, authenticated;

grant execute on function public.be_supervisor_pickup_queue(integer) to anon, authenticated;
grant execute on function public.be_pickup_assignment_queue(integer) to anon, authenticated;
grant execute on function public.be_supervisor_assignment_queue(integer) to anon, authenticated;
grant execute on function public.be_supervisor_workforce_options() to anon, authenticated;
grant execute on function public.be_pickup_assignment_options() to anon, authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to anon, authenticated;
grant execute on function public.be_assign_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_confirm_pickup_dispatch(jsonb) to anon, authenticated;
grant execute on function public.be_supervisor_confirm_dispatch(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- Verification after running:
--
-- select public.be_create_pickup_request(jsonb_build_object(
--   'merchant_code','NFT',
--   'merchant_name','Nfinity',
--   'pickup_date',current_date,
--   'phone','09794908400',
--   'address','Block 14(B), Ayar Chan Thar Condo, Dagon Seikkan Township',
--   'township','South Dagon',
--   'expected_parcels',3,
--   'required_vehicle','Bike',
--   'remarks','test pickup request'
-- ));
--
-- select public.be_supervisor_pickup_queue(20);
-- select public.be_supervisor_workforce_options();
-- select public.be_supervisor_assign_job(jsonb_build_object(
--   'pickup_id','PASTE_PICKUP_ID_HERE',
--   'rider_code','RID001',
--   'rider_name','Ko Kyaw Zin Khant',
--   'vehicle_code','FLT001',
--   'vehicle_name','6H-7397',
--   'actor_email','supervisor@britiumexpress.com'
-- ));
-- ============================================================
