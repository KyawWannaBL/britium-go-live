
-- BRITIUM UNIFIED GO-LIVE WIRE-UP
-- Based on SPEC-12 operational workflow:
-- Merchant/Customer/CS -> one backend pickup -> one Pickup ID -> notifications
-- -> supervisor assignment -> rider/driver/helper app -> cargo events -> finance/COD.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Helper functions. Drop first to avoid PostgreSQL 42P13 parameter-name errors.
-- ---------------------------------------------------------------------------

drop function if exists public.be_gl_num(text, numeric) cascade;
drop function if exists public.be_gl_code(text, text) cascade;
drop function if exists public.be_gl_pickup_id(date, text, integer) cascade;
drop function if exists public.be_gl_pickup_id(date, text, bigint) cascade;
drop function if exists public.be_gl_pickup_id(date, text, numeric) cascade;

create function public.be_gl_num(p_value text, p_default numeric default 0)
returns numeric language plpgsql immutable as $$
declare
  v_result numeric;
begin
  begin
    v_result := nullif(regexp_replace(coalesce(p_value, ''), '[^0-9.-]', '', 'g'), '')::numeric;
  exception when others then
    v_result := p_default;
  end;
  return coalesce(v_result, p_default);
end;
$$;

create function public.be_gl_code(p_value text, p_default text default 'GEN')
returns text language sql immutable as $$
  select left(
    coalesce(nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g')), ''), p_default),
    12
  );
$$;

create function public.be_gl_pickup_id(p_pickup_date date, p_merchant_code text, p_parcel_count integer)
returns text language sql stable as $$
  select 'P' || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
      || '-' || public.be_gl_code(p_merchant_code, 'GEN')
      || '-' || lpad(greatest(coalesce(p_parcel_count, 1), 1)::text, 3, '0');
$$;

create function public.be_gl_pickup_id(p_pickup_date date, p_merchant_code text, p_parcel_count bigint)
returns text language sql stable as $$
  select public.be_gl_pickup_id(p_pickup_date, p_merchant_code, greatest(coalesce(p_parcel_count, 1), 1)::integer);
$$;

create function public.be_gl_pickup_id(p_pickup_date date, p_merchant_code text, p_parcel_count numeric)
returns text language sql stable as $$
  select public.be_gl_pickup_id(p_pickup_date, p_merchant_code, greatest(coalesce(floor(p_parcel_count), 1), 1)::integer);
$$;

-- ---------------------------------------------------------------------------
-- 1) Canonical tables
-- ---------------------------------------------------------------------------

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  pickup_date date default current_date,
  requester_type text default 'customer_service',
  source_portal text default 'enterprise',
  merchant_code text,
  merchant_name text,
  customer_name text,
  customer_phone text,
  pickup_address text,
  pickup_city text,
  pickup_township text,
  branch_code text default 'YGN',
  parcel_count integer default 1,
  total_cod numeric default 0,
  estimated_tariff numeric default 0,
  status text default 'submitted',
  operation_status text default 'submitted',
  finance_status text default 'pending_finance',
  assigned_rider_id text,
  assigned_driver_id text,
  assigned_helper_id text,
  assigned_fleet_id text,
  payload jsonb default '{}'::jsonb,
  created_by text,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_date date default current_date,
  add column if not exists requester_type text default 'customer_service',
  add column if not exists source_portal text default 'enterprise',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_city text,
  add column if not exists pickup_township text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists parcel_count integer default 1,
  add column if not exists total_cod numeric default 0,
  add column if not exists estimated_tariff numeric default 0,
  add column if not exists status text default 'submitted',
  add column if not exists operation_status text default 'submitted',
  add column if not exists finance_status text default 'pending_finance',
  add column if not exists assigned_rider_id text,
  add column if not exists assigned_driver_id text,
  add column if not exists assigned_helper_id text,
  add column if not exists assigned_fleet_id text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- De-duplicate pickup_way_id before normal unique index.
with ranked as (
  select ctid, row_number() over (partition by pickup_way_id order by updated_at desc nulls last, created_at desc nulls last) rn
  from public.be_portal_pickup_requests
  where pickup_way_id is not null and pickup_way_id <> ''
)
delete from public.be_portal_pickup_requests t using ranked r
where t.ctid = r.ctid and r.rn > 1;

drop index if exists public.be_portal_pickup_requests_pickup_way_uidx;
create unique index if not exists be_portal_pickup_requests_pickup_way_uidx
on public.be_portal_pickup_requests(pickup_way_id);

create table if not exists public.be_pickup_id_reservations (
  pickup_id text primary key,
  request_id uuid,
  merchant_code text,
  pickup_date date,
  parcel_count integer,
  source_portal text,
  created_at timestamptz default now()
);

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  title text,
  message text,
  target_role text,
  target_branch text,
  source_table text,
  source_key text,
  notification_type text default 'workflow',
  is_read boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists target_role text,
  add column if not exists target_branch text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists notification_type text default 'workflow',
  add column if not exists is_read boolean default false,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  event_type text,
  event_status text,
  actor_id text,
  actor_name text,
  actor_role text,
  source_module text,
  branch_code text,
  remarks text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists actor_id text,
  add column if not exists actor_name text,
  add column if not exists actor_role text,
  add column if not exists source_module text,
  add column if not exists branch_code text,
  add column if not exists remarks text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create table if not exists public.be_mobile_workforce_accounts (
  id uuid primary key default gen_random_uuid(),
  workforce_code text,
  account text,
  email text,
  phone text,
  phone_e164 text,
  display_name text,
  role text,
  role_label text,
  branch_code text default 'YGN',
  zone text,
  active boolean default true,
  auth_user_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_mobile_workforce_accounts
  add column if not exists workforce_code text,
  add column if not exists account text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists phone_e164 text,
  add column if not exists display_name text,
  add column if not exists role text,
  add column if not exists role_label text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists zone text,
  add column if not exists active boolean default true,
  add column if not exists auth_user_id uuid,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists be_mobile_workforce_accounts_code_uidx
on public.be_mobile_workforce_accounts(workforce_code)
where workforce_code is not null and workforce_code <> '';

create table if not exists public.be_supervisor_job_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_key text,
  job_no text,
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  job_type text default 'order_picking',
  assignment_type text default 'order_picking',
  status text default 'assigned',
  rider_id text,
  rider_name text,
  rider_phone text,
  driver_id text,
  driver_name text,
  driver_phone text,
  helper_id text,
  helper_name text,
  helper_phone text,
  fleet_id text,
  fleet_label text,
  branch_code text default 'YGN',
  merchant_code text,
  merchant_name text,
  pickup_address text,
  parcel_count integer default 1,
  supervisor_note text,
  payload jsonb default '{}'::jsonb,
  assigned_by text,
  assigned_by_name text,
  assigned_at timestamptz default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.be_supervisor_job_assignments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists assignment_key text,
  add column if not exists job_no text,
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists job_type text default 'order_picking',
  add column if not exists assignment_type text default 'order_picking',
  add column if not exists status text default 'assigned',
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists rider_phone text,
  add column if not exists driver_id text,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists helper_id text,
  add column if not exists helper_name text,
  add column if not exists helper_phone text,
  add column if not exists fleet_id text,
  add column if not exists fleet_label text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists pickup_address text,
  add column if not exists parcel_count integer default 1,
  add column if not exists supervisor_note text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists assigned_by text,
  add column if not exists assigned_by_name text,
  add column if not exists assigned_at timestamptz default now(),
  add column if not exists accepted_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

update public.be_supervisor_job_assignments a
set
  id = coalesce(id, gen_random_uuid()),
  assignment_key = coalesce(nullif(assignment_key,''), nullif(pickup_way_id,''), nullif(pickup_id,''), nullif(delivery_way_id,''), id::text),
  job_no = coalesce(nullif(job_no,''), to_jsonb(a)->>'job_id', 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 8))),
  updated_at = coalesce(updated_at, now())
where id is null or assignment_key is null or assignment_key = '' or job_no is null or job_no = '';

with ranked as (
  select id, row_number() over (partition by assignment_key order by updated_at desc nulls last, assigned_at desc nulls last, id desc) rn
  from public.be_supervisor_job_assignments
  where assignment_key is not null and assignment_key <> ''
)
delete from public.be_supervisor_job_assignments t using ranked r
where t.id = r.id and r.rn > 1;

drop index if exists public.be_supervisor_job_assignments_pickup_uidx;
drop index if exists public.be_supervisor_job_assignments_assignment_key_uidx;
create unique index be_supervisor_job_assignments_assignment_key_uidx
on public.be_supervisor_job_assignments(assignment_key);

-- Finance/COD minimal tables.
create table if not exists public.delivery_waybills (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text,
  pickup_way_id text,
  pickup_id text,
  operation_status text default 'data_entry_registered',
  finance_status text default 'pending_finance',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_waybills
  add column if not exists delivery_way_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_id text,
  add column if not exists operation_status text default 'data_entry_registered',
  add column if not exists finance_status text default 'pending_finance',
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  rider_id text,
  rider_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  handover_amount numeric default 0,
  cod_status text default 'pending_collection',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_financial_settlements (
  settlement_id text primary key default ('SET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  gross_cod numeric default 0,
  handover_amount numeric default 0,
  settlement_status text default 'pending_finance',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2) RPCs
-- ---------------------------------------------------------------------------

drop function if exists public.be_resolve_branch_code(text, text, text) cascade;
create function public.be_resolve_branch_code(p_city text, p_township text, p_address text)
returns text language sql stable as $$
  select case
    when lower(coalesce(p_city,'') || ' ' || coalesce(p_township,'') || ' ' || coalesce(p_address,'')) ~ 'mandalay|mdy' then 'MDY'
    when lower(coalesce(p_city,'') || ' ' || coalesce(p_township,'') || ' ' || coalesce(p_address,'')) ~ 'naypyitaw|naypyidaw|npt' then 'NPT'
    else 'YGN'
  end;
$$;

drop function if exists public.be_submit_pickup_request(jsonb) cascade;
create function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb
language plpgsql security definer as $$
declare
  v_id uuid;
  v_pickup_date date := coalesce(nullif(p_payload->>'pickup_date','')::date, current_date);
  v_mcode text := public.be_gl_code(coalesce(p_payload->>'merchant_code', p_payload->>'merchant_id', p_payload->>'merchant', p_payload->>'merchant_name'), 'GEN');
  v_parcel_count integer := greatest(coalesce(nullif(regexp_replace(coalesce(p_payload->>'parcel_count', p_payload->>'delivery_way_count', p_payload->>'delivery_ways', '1'), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  v_pickup_id text;
  v_branch text;
begin
  v_pickup_id := coalesce(nullif(p_payload->>'pickup_way_id',''), nullif(p_payload->>'pickup_id',''), public.be_gl_pickup_id(v_pickup_date, v_mcode, v_parcel_count));
  v_branch := public.be_resolve_branch_code(p_payload->>'pickup_city', p_payload->>'pickup_township', p_payload->>'pickup_address');

  insert into public.be_portal_pickup_requests (
    pickup_id, pickup_way_id, pickup_date, requester_type, source_portal,
    merchant_code, merchant_name, customer_name, customer_phone, pickup_address, pickup_city, pickup_township,
    branch_code, parcel_count, total_cod, status, operation_status, finance_status, payload, created_by, created_by_name, updated_at
  )
  values (
    v_pickup_id, v_pickup_id, v_pickup_date,
    coalesce(nullif(p_payload->>'requester_type',''), 'customer_service'),
    coalesce(nullif(p_payload->>'source_portal',''), 'enterprise'),
    v_mcode,
    coalesce(nullif(p_payload->>'merchant_name',''), nullif(p_payload->>'merchant',''), v_mcode),
    nullif(p_payload->>'customer_name',''),
    nullif(p_payload->>'customer_phone',''),
    nullif(p_payload->>'pickup_address',''),
    nullif(p_payload->>'pickup_city',''),
    nullif(p_payload->>'pickup_township',''),
    v_branch,
    v_parcel_count,
    public.be_gl_num(p_payload->>'total_cod', 0),
    'submitted','submitted','pending_finance',
    p_payload,
    nullif(p_payload->>'created_by',''),
    nullif(p_payload->>'created_by_name',''),
    now()
  )
  on conflict (pickup_way_id) do update set
    payload = coalesce(public.be_portal_pickup_requests.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning id into v_id;

  insert into public.be_pickup_id_reservations(pickup_id, request_id, merchant_code, pickup_date, parcel_count, source_portal)
  values (v_pickup_id, v_id, v_mcode, v_pickup_date, v_parcel_count, coalesce(nullif(p_payload->>'source_portal',''), 'enterprise'))
  on conflict (pickup_id) do nothing;

  insert into public.be_portal_cargo_events(pickup_id, pickup_way_id, event_type, event_status, actor_id, actor_name, actor_role, source_module, branch_code, remarks, payload)
  values (v_pickup_id, v_pickup_id, 'PICKUP_SUBMITTED', 'submitted', nullif(p_payload->>'created_by',''), nullif(p_payload->>'created_by_name',''), coalesce(nullif(p_payload->>'requester_type',''), 'customer_service'), coalesce(nullif(p_payload->>'source_portal',''), 'enterprise'), v_branch, 'Pickup request submitted', p_payload);

  insert into public.be_app_notifications(pickup_id, pickup_way_id, title, message, target_role, target_branch, source_table, source_key, notification_type, metadata)
  select v_pickup_id, v_pickup_id, 'New pickup request', 'Pickup ' || v_pickup_id || ' requires workflow action.', role_name,
         case when role_name = 'branch_office' then v_branch else null end,
         'be_portal_pickup_requests', v_id::text, 'pickup_submitted', p_payload
  from unnest(array['customer_service','supervisor','operation_manager','dispatch','warehouse','finance','superadmin']::text[]) role_name;

  if v_branch in ('MDY','NPT') then
    insert into public.be_app_notifications(pickup_id, pickup_way_id, title, message, target_role, target_branch, source_table, source_key, notification_type, metadata)
    values (v_pickup_id, v_pickup_id, 'Branch pickup assigned', 'Pickup ' || v_pickup_id || ' assigned to ' || v_branch, 'branch_office', v_branch, 'be_portal_pickup_requests', v_id::text, 'branch_pickup', p_payload);
  end if;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'pickup_way_id', v_pickup_id, 'request_id', v_id, 'branch_code', v_branch);
end;
$$;

drop function if exists public.be_supervisor_assign_job(jsonb) cascade;
create function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql security definer as $$
declare
  v_pickup text := nullif(coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id', p_payload->>'delivery_way_id'), '');
  v_job_type text := coalesce(nullif(p_payload->>'job_type',''), nullif(p_payload->>'assignment_type',''), 'order_picking');
  v_job_no text;
  v_row public.be_supervisor_job_assignments;
begin
  if v_pickup is null then
    raise exception 'pickup_way_id, pickup_id, or delivery_way_id is required';
  end if;

  v_job_no := coalesce(nullif(p_payload->>'job_no',''), 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 8)));

  insert into public.be_supervisor_job_assignments(
    assignment_key, job_no, pickup_id, pickup_way_id, delivery_way_id,
    job_type, assignment_type, status,
    rider_id, rider_name, rider_phone, driver_id, driver_name, driver_phone, helper_id, helper_name, helper_phone,
    fleet_id, fleet_label, branch_code, merchant_code, merchant_name, pickup_address, parcel_count,
    supervisor_note, payload, assigned_by, assigned_by_name, assigned_at, updated_at
  )
  values (
    v_pickup, v_job_no,
    coalesce(nullif(p_payload->>'pickup_id',''), v_pickup),
    coalesce(nullif(p_payload->>'pickup_way_id',''), v_pickup),
    nullif(p_payload->>'delivery_way_id',''),
    v_job_type, v_job_type, coalesce(nullif(p_payload->>'status',''), 'assigned'),
    nullif(p_payload->>'rider_id',''), nullif(p_payload->>'rider_name',''), nullif(p_payload->>'rider_phone',''),
    nullif(p_payload->>'driver_id',''), nullif(p_payload->>'driver_name',''), nullif(p_payload->>'driver_phone',''),
    nullif(p_payload->>'helper_id',''), nullif(p_payload->>'helper_name',''), nullif(p_payload->>'helper_phone',''),
    nullif(p_payload->>'fleet_id',''), nullif(p_payload->>'fleet_label',''), coalesce(nullif(p_payload->>'branch_code',''), 'YGN'),
    nullif(p_payload->>'merchant_code',''), nullif(p_payload->>'merchant_name',''), nullif(p_payload->>'pickup_address',''),
    greatest(coalesce(nullif(p_payload->>'parcel_count','')::integer, 1), 1),
    nullif(p_payload->>'supervisor_note',''), p_payload, nullif(p_payload->>'assigned_by',''), nullif(p_payload->>'assigned_by_name',''), now(), now()
  )
  on conflict (assignment_key) do update set
    job_type = excluded.job_type,
    assignment_type = excluded.assignment_type,
    status = excluded.status,
    rider_id = coalesce(excluded.rider_id, public.be_supervisor_job_assignments.rider_id),
    rider_name = coalesce(excluded.rider_name, public.be_supervisor_job_assignments.rider_name),
    rider_phone = coalesce(excluded.rider_phone, public.be_supervisor_job_assignments.rider_phone),
    driver_id = coalesce(excluded.driver_id, public.be_supervisor_job_assignments.driver_id),
    driver_name = coalesce(excluded.driver_name, public.be_supervisor_job_assignments.driver_name),
    driver_phone = coalesce(excluded.driver_phone, public.be_supervisor_job_assignments.driver_phone),
    helper_id = coalesce(excluded.helper_id, public.be_supervisor_job_assignments.helper_id),
    helper_name = coalesce(excluded.helper_name, public.be_supervisor_job_assignments.helper_name),
    helper_phone = coalesce(excluded.helper_phone, public.be_supervisor_job_assignments.helper_phone),
    fleet_id = coalesce(excluded.fleet_id, public.be_supervisor_job_assignments.fleet_id),
    fleet_label = coalesce(excluded.fleet_label, public.be_supervisor_job_assignments.fleet_label),
    branch_code = coalesce(excluded.branch_code, public.be_supervisor_job_assignments.branch_code),
    merchant_code = coalesce(excluded.merchant_code, public.be_supervisor_job_assignments.merchant_code),
    merchant_name = coalesce(excluded.merchant_name, public.be_supervisor_job_assignments.merchant_name),
    pickup_address = coalesce(excluded.pickup_address, public.be_supervisor_job_assignments.pickup_address),
    parcel_count = coalesce(excluded.parcel_count, public.be_supervisor_job_assignments.parcel_count),
    supervisor_note = coalesce(excluded.supervisor_note, public.be_supervisor_job_assignments.supervisor_note),
    payload = coalesce(public.be_supervisor_job_assignments.payload, '{}'::jsonb) || excluded.payload,
    updated_at = now()
  returning * into v_row;

  update public.be_portal_pickup_requests
  set assigned_rider_id = coalesce(v_row.rider_id, assigned_rider_id),
      assigned_driver_id = coalesce(v_row.driver_id, assigned_driver_id),
      assigned_helper_id = coalesce(v_row.helper_id, assigned_helper_id),
      assigned_fleet_id = coalesce(v_row.fleet_id, assigned_fleet_id),
      operation_status = coalesce(v_row.status, 'assigned'),
      updated_at = now()
  where pickup_way_id = v_pickup or pickup_id = v_pickup;

  insert into public.be_portal_cargo_events(pickup_id, pickup_way_id, delivery_way_id, event_type, event_status, actor_id, actor_name, actor_role, source_module, branch_code, remarks, payload)
  values (v_row.pickup_id, v_row.pickup_way_id, v_row.delivery_way_id, 'SUPERVISOR_ASSIGNMENT', v_row.status, v_row.assigned_by, v_row.assigned_by_name, 'supervisor', 'supervisor_portal', v_row.branch_code, 'Assignment created for rider/driver/helper', row_to_json(v_row)::jsonb);

  insert into public.be_app_notifications(pickup_id, pickup_way_id, title, message, target_role, target_branch, source_table, source_key, notification_type, metadata)
  values
    (v_row.pickup_id, v_row.pickup_way_id, 'New assignment', 'Pickup ' || v_pickup || ' assigned.', 'rider', v_row.branch_code, 'be_supervisor_job_assignments', v_row.id::text, 'assignment', jsonb_build_object('assignment', row_to_json(v_row)::jsonb)),
    (v_row.pickup_id, v_row.pickup_way_id, 'New assignment', 'Pickup ' || v_pickup || ' assigned.', 'driver', v_row.branch_code, 'be_supervisor_job_assignments', v_row.id::text, 'assignment', jsonb_build_object('assignment', row_to_json(v_row)::jsonb)),
    (v_row.pickup_id, v_row.pickup_way_id, 'New assignment', 'Pickup ' || v_pickup || ' assigned.', 'helper', v_row.branch_code, 'be_supervisor_job_assignments', v_row.id::text, 'assignment', jsonb_build_object('assignment', row_to_json(v_row)::jsonb));

  return jsonb_build_object('ok', true, 'assignment_key', v_row.assignment_key, 'assignment', row_to_json(v_row)::jsonb);
end;
$$;

drop function if exists public.be_mobile_go_live_snapshot(text, text, integer) cascade;
create function public.be_mobile_go_live_snapshot(p_workforce_code text default null, p_phone text default null, p_limit integer default 100)
returns jsonb
language plpgsql security definer as $$
declare
  v_code text := nullif(trim(coalesce(p_workforce_code, '')), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_worker jsonb;
  v_assignments jsonb;
  v_notifications jsonb;
begin
  select row_to_json(w)::jsonb into v_worker
  from public.be_mobile_workforce_accounts w
  where (v_code is not null and w.workforce_code = v_code)
     or (v_phone <> '' and regexp_replace(coalesce(w.phone, w.phone_e164, ''), '[^0-9+]', '', 'g') = v_phone)
  order by w.updated_at desc nulls last
  limit 1;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_assignments
  from (
    select
      a.id::text as id,
      coalesce(nullif(a.job_no,''), a.assignment_key) as job_no,
      a.assignment_key, a.pickup_id, a.pickup_way_id, a.delivery_way_id,
      a.job_type, a.assignment_type, a.status,
      a.rider_id, a.rider_name, a.rider_phone,
      a.driver_id, a.driver_name, a.driver_phone,
      a.helper_id, a.helper_name, a.helper_phone,
      a.fleet_id, a.fleet_label, a.branch_code,
      a.merchant_code, a.merchant_name, a.pickup_address, a.parcel_count,
      a.supervisor_note, a.assigned_at, a.accepted_at, a.started_at, a.completed_at, a.updated_at
    from public.be_supervisor_job_assignments a
    where (v_code is null or a.rider_id = v_code or a.driver_id = v_code or a.helper_id = v_code)
      and (v_phone = '' or regexp_replace(coalesce(a.rider_phone, a.driver_phone, a.helper_phone, ''), '[^0-9+]', '', 'g') = v_phone or v_code is not null)
    order by a.updated_at desc nulls last
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(n)::jsonb order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from (
    select *
    from public.be_app_notifications n
    where target_role in ('rider','driver','helper')
    order by created_at desc
    limit v_limit
  ) n;

  return jsonb_build_object(
    'ok', true,
    'identity', coalesce(v_worker, jsonb_build_object('workforce_code', v_code, 'phone', v_phone)),
    'assigned_pickups', coalesce(v_assignments, '[]'::jsonb),
    'delivery_jobs', '[]'::jsonb,
    'notifications', coalesce(v_notifications, '[]'::jsonb),
    'kpis', jsonb_build_object(
      'assigned', jsonb_array_length(coalesce(v_assignments, '[]'::jsonb)),
      'delivery_jobs', 0,
      'pending', (select count(*) from public.be_supervisor_job_assignments a where a.status in ('assigned','order_picking_assigned','accepted','started') and (v_code is null or a.rider_id = v_code or a.driver_id = v_code or a.helper_id = v_code)),
      'completed', (select count(*) from public.be_supervisor_job_assignments a where a.status in ('completed','pickup_verified','delivered') and (v_code is null or a.rider_id = v_code or a.driver_id = v_code or a.helper_id = v_code))
    ),
    'synced_at', now()
  );
end;
$$;

drop function if exists public.be_mobile_update_job_status(jsonb) cascade;
create function public.be_mobile_update_job_status(p_payload jsonb)
returns jsonb
language plpgsql security definer as $$
declare
  v_pickup text := nullif(coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id', p_payload->>'delivery_way_id', p_payload->>'assignment_key'), '');
  v_action text := lower(coalesce(p_payload->>'action', p_payload->>'status', 'accepted'));
  v_status text;
  v_row public.be_supervisor_job_assignments;
begin
  if v_pickup is null then raise exception 'pickup_way_id, pickup_id, delivery_way_id, or assignment_key is required'; end if;

  v_status := case v_action
    when 'acknowledge' then 'accepted'
    when 'accept' then 'accepted'
    when 'start' then 'started'
    when 'start_order_picking' then 'started'
    when 'verify_pickup' then 'pickup_verified'
    when 'complete' then 'completed'
    when 'delivered' then 'delivered'
    when 'fail' then 'failed'
    else v_action
  end;

  update public.be_supervisor_job_assignments
  set status = v_status,
      accepted_at = case when v_status = 'accepted' then now() else accepted_at end,
      started_at = case when v_status = 'started' then now() else started_at end,
      completed_at = case when v_status in ('pickup_verified','completed','delivered') then now() else completed_at end,
      payload = coalesce(payload, '{}'::jsonb) || p_payload,
      updated_at = now()
  where assignment_key = v_pickup or pickup_way_id = v_pickup or pickup_id = v_pickup or delivery_way_id = v_pickup
  returning * into v_row;

  if v_row.id is null then raise exception 'assignment not found for %', v_pickup; end if;

  update public.be_portal_pickup_requests
  set operation_status = v_status, updated_at = now()
  where pickup_way_id = coalesce(v_row.pickup_way_id, v_row.pickup_id, v_row.delivery_way_id)
     or pickup_id = coalesce(v_row.pickup_way_id, v_row.pickup_id, v_row.delivery_way_id);

  insert into public.be_portal_cargo_events(pickup_id, pickup_way_id, delivery_way_id, event_type, event_status, actor_id, actor_name, actor_role, source_module, branch_code, remarks, payload)
  values (v_row.pickup_id, v_row.pickup_way_id, v_row.delivery_way_id, 'MOBILE_STATUS_UPDATE', v_status, coalesce(nullif(p_payload->>'workforce_code',''), v_row.rider_id, v_row.driver_id, v_row.helper_id), nullif(p_payload->>'name',''), 'mobile_workforce', 'rider_driver_helper_app', v_row.branch_code, 'Mobile workforce updated job status', p_payload);

  return jsonb_build_object('ok', true, 'status', v_status, 'assignment', row_to_json(v_row)::jsonb);
end;
$$;

drop function if exists public.be_role_portal_snapshot(text, text, text, integer) cascade;
create function public.be_role_portal_snapshot(p_role text, p_branch text default null, p_workforce_code text default null, p_limit integer default 100)
returns jsonb
language plpgsql security definer as $$
declare
  v_role text := lower(coalesce(p_role, 'superadmin'));
  v_branch text := nullif(upper(coalesce(p_branch, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_pickups jsonb;
  v_assignments jsonb;
  v_notifications jsonb;
  v_events jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb) into v_pickups
  from (select * from public.be_portal_pickup_requests p where v_branch is null or p.branch_code = v_branch order by p.updated_at desc nulls last limit v_limit) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb) into v_assignments
  from (select * from public.be_supervisor_job_assignments a where (v_branch is null or a.branch_code = v_branch) and (p_workforce_code is null or a.rider_id = p_workforce_code or a.driver_id = p_workforce_code or a.helper_id = p_workforce_code) order by a.updated_at desc nulls last limit v_limit) x;

  select coalesce(jsonb_agg(row_to_json(n)::jsonb order by n.created_at desc), '[]'::jsonb) into v_notifications
  from (select * from public.be_app_notifications n where n.target_role in (v_role, 'all', 'superadmin') or (v_role = 'operation_manager' and n.target_role in ('operations','operation_manager','dispatch','warehouse','supervisor')) order by n.created_at desc limit v_limit) n;

  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.created_at desc), '[]'::jsonb) into v_events
  from (select * from public.be_portal_cargo_events e where v_branch is null or e.branch_code = v_branch order by e.created_at desc limit v_limit) e;

  return jsonb_build_object(
    'ok', true,
    'role', v_role,
    'branch', v_branch,
    'pickups', coalesce(v_pickups, '[]'::jsonb),
    'assignments', coalesce(v_assignments, '[]'::jsonb),
    'notifications', coalesce(v_notifications, '[]'::jsonb),
    'cargo_events', coalesce(v_events, '[]'::jsonb),
    'finance', jsonb_build_object('cod_rows','[]'::jsonb,'settlements','[]'::jsonb),
    'kpis', jsonb_build_object('pickups', jsonb_array_length(coalesce(v_pickups,'[]'::jsonb)), 'assignments', jsonb_array_length(coalesce(v_assignments,'[]'::jsonb)), 'notifications', jsonb_array_length(coalesce(v_notifications,'[]'::jsonb)), 'events', jsonb_array_length(coalesce(v_events,'[]'::jsonb))),
    'synced_at', now()
  );
end;
$$;

drop function if exists public.be_go_live_system_readiness() cascade;
create function public.be_go_live_system_readiness()
returns jsonb language sql security definer as $$
  with checks as (
    select 'pickup_single_backend' check_code, to_regclass('public.be_portal_pickup_requests') is not null passed, 'Unified pickup request table exists' message
    union all select 'canonical_pickup_id', to_regprocedure('public.be_submit_pickup_request(jsonb)') is not null, 'Submit pickup RPC creates canonical Pickup ID'
    union all select 'notifications', to_regclass('public.be_app_notifications') is not null, 'Role notifications table exists'
    union all select 'cargo_events', to_regclass('public.be_portal_cargo_events') is not null, 'Cargo event tracking table exists'
    union all select 'workforce_accounts', to_regclass('public.be_mobile_workforce_accounts') is not null, 'Rider/Driver/Helper workforce accounts table exists'
    union all select 'assignment_rpc', to_regprocedure('public.be_supervisor_assign_job(jsonb)') is not null, 'Supervisor assignment RPC exists'
    union all select 'mobile_snapshot', to_regprocedure('public.be_mobile_go_live_snapshot(text,text,integer)') is not null, 'Mobile app snapshot RPC exists'
    union all select 'mobile_status_update', to_regprocedure('public.be_mobile_update_job_status(jsonb)') is not null, 'Mobile status update RPC exists'
    union all select 'role_snapshot', to_regprocedure('public.be_role_portal_snapshot(text,text,text,integer)') is not null, 'Role portal snapshot RPC exists'
  )
  select jsonb_build_object(
    'passed', bool_and(passed),
    'checks', coalesce(jsonb_agg(row_to_json(checks)::jsonb), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'pickups', (select count(*) from public.be_portal_pickup_requests),
      'assignments', (select count(*) from public.be_supervisor_job_assignments),
      'cargo_events', (select count(*) from public.be_portal_cargo_events),
      'notifications', (select count(*) from public.be_app_notifications),
      'workforce_accounts', (select count(*) from public.be_mobile_workforce_accounts)
    ),
    'synced_at', now()
  )
  from checks;
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS and grants
-- ---------------------------------------------------------------------------

alter table public.be_portal_pickup_requests enable row level security;
alter table public.be_pickup_id_reservations enable row level security;
alter table public.be_app_notifications enable row level security;
alter table public.be_portal_cargo_events enable row level security;
alter table public.be_mobile_workforce_accounts enable row level security;
alter table public.be_supervisor_job_assignments enable row level security;

drop policy if exists be_portal_pickup_requests_all_auth on public.be_portal_pickup_requests;
drop policy if exists be_pickup_id_reservations_all_auth on public.be_pickup_id_reservations;
drop policy if exists be_app_notifications_all_auth on public.be_app_notifications;
drop policy if exists be_portal_cargo_events_all_auth on public.be_portal_cargo_events;
drop policy if exists be_mobile_workforce_accounts_all_auth on public.be_mobile_workforce_accounts;
drop policy if exists be_supervisor_job_assignments_all_auth on public.be_supervisor_job_assignments;

create policy be_portal_pickup_requests_all_auth on public.be_portal_pickup_requests for all to authenticated using (true) with check (true);
create policy be_pickup_id_reservations_all_auth on public.be_pickup_id_reservations for all to authenticated using (true) with check (true);
create policy be_app_notifications_all_auth on public.be_app_notifications for all to authenticated using (true) with check (true);
create policy be_portal_cargo_events_all_auth on public.be_portal_cargo_events for all to authenticated using (true) with check (true);
create policy be_mobile_workforce_accounts_all_auth on public.be_mobile_workforce_accounts for all to authenticated using (true) with check (true);
create policy be_supervisor_job_assignments_all_auth on public.be_supervisor_job_assignments for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.be_portal_pickup_requests to authenticated;
grant select, insert, update, delete on public.be_pickup_id_reservations to authenticated;
grant select, insert, update, delete on public.be_app_notifications to authenticated;
grant select, insert, update, delete on public.be_portal_cargo_events to authenticated;
grant select, insert, update, delete on public.be_mobile_workforce_accounts to authenticated;
grant select, insert, update, delete on public.be_supervisor_job_assignments to authenticated;

grant execute on function public.be_gl_num(text,numeric) to anon, authenticated;
grant execute on function public.be_gl_code(text,text) to anon, authenticated;
grant execute on function public.be_gl_pickup_id(date,text,integer) to anon, authenticated;
grant execute on function public.be_gl_pickup_id(date,text,bigint) to anon, authenticated;
grant execute on function public.be_gl_pickup_id(date,text,numeric) to anon, authenticated;
grant execute on function public.be_submit_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to authenticated;
grant execute on function public.be_mobile_go_live_snapshot(text,text,integer) to anon, authenticated;
grant execute on function public.be_mobile_update_job_status(jsonb) to anon, authenticated;
grant execute on function public.be_role_portal_snapshot(text,text,text,integer) to anon, authenticated;
grant execute on function public.be_go_live_system_readiness() to anon, authenticated;

notify pgrst, 'reload schema';
