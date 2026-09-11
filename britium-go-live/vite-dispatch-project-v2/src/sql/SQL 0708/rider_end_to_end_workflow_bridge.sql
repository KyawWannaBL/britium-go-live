
-- Britium Rider End-to-End Workflow Bridge
-- Safe to rerun.
-- Run with:
-- psql "postgresql://postgres:YOUR_PASSWORD@db.dltavabvjwocknkyvwgz.supabase.co:5432/postgres" -v ON_ERROR_STOP=1 -f rider_end_to_end_workflow_bridge.sql

create extension if not exists pgcrypto;

alter table public.be_portal_pickup_requests
  add column if not exists assigned_rider_id text,
  add column if not exists assigned_driver_id text,
  add column if not exists assigned_helper_id text,
  add column if not exists assigned_vehicle_id text,
  add column if not exists assigned_fleet_id text,
  add column if not exists accepted_at timestamptz,
  add column if not exists arrived_pickup_at timestamptz,
  add column if not exists pickup_collected_at timestamptz,
  add column if not exists pickup_verified_at timestamptz,
  add column if not exists field_verified_at timestamptz,
  add column if not exists field_verified_by text,
  add column if not exists pickup_proof_url text,
  add column if not exists proof_url text,
  add column if not exists rider_status text,
  add column if not exists rider_app_stage text,
  add column if not exists rider_last_action text,
  add column if not exists rider_last_action_at timestamptz,
  add column if not exists dispatch_status text,
  add column if not exists wayplan_status text,
  add column if not exists warehouse_status text,
  add column if not exists data_entry_status text,
  add column if not exists finance_status text,
  add column if not exists settlement_status text,
  add column if not exists operation_status text,
  add column if not exists workflow_stage text,
  add column if not exists supervisor_status text,
  add column if not exists delivery_status text,
  add column if not exists verified_parcels integer default 0,
  add column if not exists total_weight_kg numeric default 0,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create index if not exists be_pickup_rider_queue_idx
  on public.be_portal_pickup_requests(assigned_rider_code, assignment_status, pickup_status, updated_at desc);

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  delivery_way_id text,
  event_type text,
  status text,
  message text,
  source text,
  actor_role text,
  actor_code text,
  actor_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  title text,
  message text,
  target_role text,
  target_user_code text,
  pickup_id text,
  source_table text,
  source_key text,
  event_type text,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_proof_of_delivery (
  proof_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  delivery_way_id text,
  proof_type text,
  proof_url text,
  signature_url text,
  recipient_name text,
  recipient_phone text,
  rider_code text,
  rider_name text,
  status text default 'submitted',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_workforce_wallet_ledger (
  ledger_id uuid primary key default gen_random_uuid(),
  workforce_code text,
  workforce_name text,
  workforce_type text,
  pickup_id text,
  delivery_way_id text,
  transaction_type text,
  amount numeric default 0,
  direction text default 'credit',
  status text default 'pending',
  reference_type text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_workforce_commission_ledger (
  commission_id uuid primary key default gen_random_uuid(),
  workforce_code text,
  workforce_name text,
  workforce_type text,
  pickup_id text,
  delivery_way_id text,
  commission_type text,
  base_amount numeric default 0,
  commission_amount numeric default 0,
  commission_status text default 'earned',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function public.be_workflow_emit_event(
  p_pickup_id text,
  p_event_type text,
  p_status text,
  p_message text,
  p_source text default 'enterprise_portal',
  p_actor_role text default null,
  p_actor_code text default null,
  p_actor_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.be_portal_cargo_events (
    pickup_id, pickup_way_id, event_type, status, message, source,
    actor_role, actor_code, actor_name, metadata, created_at
  )
  values (
    p_pickup_id, p_pickup_id, p_event_type, p_status, p_message, p_source,
    p_actor_role, p_actor_code, p_actor_name, coalesce(p_metadata, '{}'::jsonb), now()
  );
exception when others then
  null;
end;
$$;

create or replace function public.be_workflow_notify(
  p_pickup_id text,
  p_target_role text,
  p_target_user_code text,
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
    title, message, target_role, target_user_code, pickup_id,
    source_table, source_key, event_type, metadata, created_at
  )
  values (
    p_title, p_message, p_target_role, p_target_user_code, p_pickup_id,
    'be_portal_pickup_requests', p_pickup_id, 'workflow_notification',
    coalesce(p_metadata, '{}'::jsonb), now()
  );
exception when others then
  null;
end;
$$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text := coalesce(nullif(v_payload ->> 'pickup_id', ''), nullif(v_payload ->> 'pickup_way_id', ''), nullif(v_payload ->> 'id', ''));
  v_rider text := coalesce(nullif(v_payload ->> 'rider_code', ''), nullif(v_payload ->> 'rider_id', ''), nullif(v_payload ->> 'assigned_rider_code', ''));
  v_rider_name text := coalesce(nullif(v_payload ->> 'rider_name', ''), nullif(v_payload ->> 'assigned_rider_name', ''));
  v_driver text := coalesce(nullif(v_payload ->> 'driver_code', ''), nullif(v_payload ->> 'driver_id', ''), nullif(v_payload ->> 'assigned_driver_code', ''));
  v_driver_name text := coalesce(nullif(v_payload ->> 'driver_name', ''), nullif(v_payload ->> 'assigned_driver_name', ''));
  v_helper text := coalesce(nullif(v_payload ->> 'helper_code', ''), nullif(v_payload ->> 'helper_id', ''), nullif(v_payload ->> 'assigned_helper_code', ''));
  v_helper_name text := coalesce(nullif(v_payload ->> 'helper_name', ''), nullif(v_payload ->> 'assigned_helper_name', ''));
  v_vehicle text := coalesce(nullif(v_payload ->> 'vehicle_code', ''), nullif(v_payload ->> 'vehicle_id', ''), nullif(v_payload ->> 'fleet_id', ''), nullif(v_payload ->> 'assigned_vehicle_code', ''));
  v_vehicle_name text := coalesce(nullif(v_payload ->> 'vehicle_name', ''), nullif(v_payload ->> 'vehicle_no', ''), nullif(v_payload ->> 'assigned_vehicle_name', ''));
  v_actor_email text := coalesce(nullif(v_payload ->> 'actor_email', ''), 'supervisor@britiumexpress.com');
  v_id uuid;
  v_pickup_id text;
  v_rec jsonb;
begin
  update public.be_portal_pickup_requests
  set
    assigned_rider_code = coalesce(v_rider, assigned_rider_code),
    assigned_rider_id = coalesce(v_rider, assigned_rider_id),
    assigned_rider_name = coalesce(v_rider_name, assigned_rider_name),
    assigned_driver_code = coalesce(v_driver, assigned_driver_code),
    assigned_driver_id = coalesce(v_driver, assigned_driver_id),
    assigned_driver_name = coalesce(v_driver_name, assigned_driver_name),
    assigned_helper_code = coalesce(v_helper, assigned_helper_code),
    assigned_helper_id = coalesce(v_helper, assigned_helper_id),
    assigned_helper_name = coalesce(v_helper_name, assigned_helper_name),
    assigned_vehicle_code = coalesce(v_vehicle, assigned_vehicle_code),
    assigned_vehicle_id = coalesce(v_vehicle, assigned_vehicle_id),
    assigned_fleet_id = coalesce(v_vehicle, assigned_fleet_id),
    assigned_vehicle_name = coalesce(v_vehicle_name, assigned_vehicle_name),
    assigned_by_email = v_actor_email,
    assigned_at = now(),
    assignment_status = 'assigned',
    pickup_status = 'ASSIGNED',
    status = 'assigned',
    supervisor_status = 'ASSIGNED',
    rider_status = 'ASSIGNED',
    rider_app_stage = 'ASSIGNED_PICKUP',
    workflow_stage = 'ASSIGNED',
    operation_status = 'assigned',
    dispatch_status = 'ASSIGNED_TO_RIDER',
    wayplan_status = coalesce(wayplan_status, 'PENDING_WAYPLAN'),
    warehouse_status = coalesce(warehouse_status, 'WAITING_DATA_ENTRY'),
    data_entry_status = coalesce(data_entry_status, 'WAITING_PICKUP'),
    finance_status = coalesce(finance_status, 'pending_finance'),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('assignment_payload', v_payload, 'assigned_at', now(), 'assigned_by_email', v_actor_email),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('assignment_payload', v_payload, 'assigned_at', now(), 'assigned_by_email', v_actor_email),
    updated_at = now()
  where pickup_id = v_lookup or pickup_way_id = v_lookup or id::text = v_lookup
  returning id, pickup_id, to_jsonb(be_portal_pickup_requests.*)
  into v_id, v_pickup_id, v_rec;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'lookup', v_lookup);
  end if;

  perform public.be_workflow_emit_event(v_pickup_id, 'pickup_assigned', 'assigned', v_pickup_id || ' assigned to field team', 'supervisor', 'supervisor', v_actor_email, v_actor_email, v_rec);
  perform public.be_workflow_notify(v_pickup_id, 'rider', v_rider, 'Pickup assigned', v_pickup_id || ' assigned to you', v_rec);
  perform public.be_workflow_notify(v_pickup_id, 'driver', v_driver, 'Driver assigned', v_pickup_id || ' assigned to your route', v_rec);
  perform public.be_workflow_notify(v_pickup_id, 'helper', v_helper, 'Helper assigned', v_pickup_id || ' assigned to your route', v_rec);
  perform public.be_workflow_notify(v_pickup_id, 'warehouse', null, 'Incoming pickup assigned', v_pickup_id || ' will proceed to warehouse after pickup', v_rec);
  perform public.be_workflow_notify(v_pickup_id, 'data_entry', null, 'Pickup awaiting verification', v_pickup_id || ' assigned and waiting pickup verification', v_rec);

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', 'assigned', 'assignment_status', 'assigned', 'rider_status', 'ASSIGNED', 'rider_app_stage', 'ASSIGNED_PICKUP', 'record', v_rec);
end;
$$;

create or replace function public.be_assign_pickup_request(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_supervisor_assign_job(p_payload); $$;

create or replace function public.be_confirm_pickup_dispatch(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_supervisor_assign_job(p_payload); $$;

create or replace function public.be_supervisor_confirm_dispatch(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_supervisor_assign_job(p_payload); $$;

update public.be_portal_pickup_requests
set
  assigned_rider_id = coalesce(assigned_rider_id, assigned_rider_code),
  assigned_driver_id = coalesce(assigned_driver_id, assigned_driver_code),
  assigned_helper_id = coalesce(assigned_helper_id, assigned_helper_code),
  assigned_vehicle_id = coalesce(assigned_vehicle_id, assigned_vehicle_code),
  assigned_fleet_id = coalesce(assigned_fleet_id, assigned_vehicle_code),
  rider_status = case when assigned_rider_code is not null and coalesce(rider_status, '') in ('', 'NOT_ASSIGNED') then 'ASSIGNED' else rider_status end,
  rider_app_stage = case when assigned_rider_code is not null and coalesce(rider_app_stage, '') = '' then 'ASSIGNED_PICKUP' else rider_app_stage end,
  supervisor_status = case when assigned_rider_code is not null and coalesce(supervisor_status, '') in ('', 'PENDING_ASSIGNMENT') then 'ASSIGNED' else supervisor_status end,
  dispatch_status = case when assigned_rider_code is not null and coalesce(dispatch_status, '') in ('', 'WAITING_WAYPLAN') then 'ASSIGNED_TO_RIDER' else dispatch_status end,
  pickup_status = case when assigned_rider_code is not null and coalesce(pickup_status, '') in ('PICKUP_REQUESTED', 'PENDING_ASSIGNMENT', 'WAITING_ASSIGNMENT') then 'ASSIGNED' else pickup_status end,
  status = case when assigned_rider_code is not null and coalesce(status, '') in ('PICKUP_REQUESTED', 'pending_assignment', 'PENDING_ASSIGNMENT', 'SUBMITTED') then 'assigned' else status end,
  updated_at = now()
where assigned_rider_code is not null;

create or replace view public.be_v_rider_pickup_queue as
select
  p.id,
  p.pickup_id,
  coalesce(p.pickup_way_id, p.pickup_id) as pickup_way_id,
  p.merchant_code,
  p.merchant_name,
  coalesce(p.pickup_address, p.address) as pickup_address,
  coalesce(p.pickup_township, p.township) as pickup_township,
  coalesce(p.pickup_city, 'Yangon') as pickup_city,
  p.pickup_date,
  coalesce(p.parcel_count, p.expected_parcel_count, p.expected_parcels, 1) as parcel_count,
  coalesce(p.expected_parcel_count, p.parcel_count, p.expected_parcels, 1) as expected_parcel_count,
  coalesce(p.total_weight_kg, 0) as total_weight_kg,
  coalesce(p.cod_amount, p.total_cod, 0) as cod_amount,
  coalesce(p.assigned_rider_code, p.assigned_rider_id, p.rider_code, p.rider_id) as rider_code,
  p.assigned_rider_name as rider_name,
  coalesce(p.assigned_driver_code, p.assigned_driver_id, p.driver_id) as driver_code,
  p.assigned_driver_name as driver_name,
  coalesce(p.assigned_helper_code, p.assigned_helper_id, p.helper_id) as helper_code,
  p.assigned_helper_name as helper_name,
  coalesce(p.assigned_vehicle_code, p.assigned_vehicle_id, p.assigned_fleet_id, p.vehicle_code) as vehicle_code,
  p.assigned_vehicle_name as vehicle_name,
  p.pickup_status,
  p.status,
  p.assignment_status,
  p.rider_status,
  p.rider_app_stage,
  p.warehouse_status,
  p.data_entry_status,
  p.finance_status,
  p.verified_parcels,
  p.pickup_proof_url,
  p.proof_url,
  p.metadata,
  p.payload,
  p.created_at,
  p.updated_at
from public.be_portal_pickup_requests p
where coalesce(p.assigned_rider_code, p.assigned_rider_id, p.rider_code, p.rider_id) is not null
  and lower(coalesce(p.status, '')) not in ('cancelled', 'closed')
  and upper(coalesce(p.pickup_status, '')) not in ('CANCELLED', 'CLOSED');

create or replace function public.be_rider_pickup_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'source', 'be_v_rider_pickup_queue',
    'rider_code', coalesce(nullif(p_payload ->> 'rider_code', ''), nullif(p_payload ->> 'rider_id', ''), nullif(p_payload ->> 'login', ''), 'RID001'),
    'jobs', coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc), '[]'::jsonb),
    'pickups', coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc), '[]'::jsonb),
    'data', coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc), '[]'::jsonb)
  )
  from public.be_v_rider_pickup_queue q
  where q.rider_code = coalesce(nullif(p_payload ->> 'rider_code', ''), nullif(p_payload ->> 'rider_id', ''), nullif(p_payload ->> 'login', ''), 'RID001');
$$;

create or replace function public.be_get_rider_pickup_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$ select public.be_rider_pickup_queue(p_payload); $$;

create or replace function public.be_mobile_rider_pickup_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$ select public.be_rider_pickup_queue(p_payload); $$;

create or replace function public.be_rider_jobs(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$ select public.be_rider_pickup_queue(p_payload); $$;

create or replace function public.be_rider_pickup_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_pickup_id text := coalesce(nullif(v_payload ->> 'pickup_id', ''), nullif(v_payload ->> 'pickup_way_id', ''));
  v_action text := lower(coalesce(nullif(v_payload ->> 'action', ''), nullif(v_payload ->> 'status', ''), 'accept'));
  v_rider text := coalesce(nullif(v_payload ->> 'rider_code', ''), nullif(v_payload ->> 'rider_id', ''), 'RID001');
  v_rider_name text := coalesce(nullif(v_payload ->> 'rider_name', ''), nullif(v_payload ->> 'user_name', ''));
  v_parcels jsonb := coalesce(v_payload -> 'parcels', '[]'::jsonb);
  v_verified_count integer := 0;
  v_weight numeric := 0;
  v_status text;
  v_pickup_status text;
  v_rec jsonb;
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;

  select coalesce(jsonb_array_length(v_parcels), 0) into v_verified_count;

  select coalesce(sum(coalesce(nullif(x ->> 'actual_weight_kg', '')::numeric, 0)), 0)
  into v_weight
  from jsonb_array_elements(v_parcels) x;

  if v_action in ('accept', 'accepted') then
    v_status := 'accepted'; v_pickup_status := 'ACCEPTED_BY_RIDER';
    update public.be_portal_pickup_requests
    set accepted_at = now(), rider_status = 'ACCEPTED', rider_app_stage = 'ACCEPTED_PICKUP',
        pickup_status = v_pickup_status, status = v_status, assignment_status = 'accepted',
        rider_last_action = 'accept', rider_last_action_at = now(), updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  elsif v_action in ('arrive', 'arrived', 'arrived_pickup') then
    v_status := 'arrived_pickup'; v_pickup_status := 'RIDER_ARRIVED';
    update public.be_portal_pickup_requests
    set arrived_pickup_at = now(), rider_status = 'ARRIVED_PICKUP', rider_app_stage = 'ARRIVED_PICKUP',
        pickup_status = v_pickup_status, status = v_status, assignment_status = 'in_progress',
        rider_last_action = 'arrived', rider_last_action_at = now(), updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  elsif v_action in ('verify', 'verified', 'verify_pickup', 'pickup_verified') then
    v_status := 'pickup_verified'; v_pickup_status := 'PICKUP_VERIFIED';
    update public.be_portal_pickup_requests
    set pickup_verified_at = now(), field_verified_at = now(), field_verified_by = v_rider,
        rider_status = 'PICKUP_VERIFIED', rider_app_stage = 'PICKUP_VERIFIED',
        pickup_status = v_pickup_status, status = v_status, assignment_status = 'pickup_verified',
        verified_parcels = greatest(coalesce(v_verified_count, 0), coalesce(verified_parcels, 0)),
        total_weight_kg = case when v_weight > 0 then v_weight else coalesce(total_weight_kg, 0) end,
        pickup_proof_url = coalesce(nullif(v_payload ->> 'proof_url', ''), pickup_proof_url),
        proof_url = coalesce(nullif(v_payload ->> 'proof_url', ''), proof_url),
        warehouse_status = 'WAITING_DATA_ENTRY', data_entry_status = 'WAITING_DATA_ENTRY',
        rider_last_action = 'verify_pickup', rider_last_action_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_rider_payload', v_payload, 'last_rider_action_at', now()),
        updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  elsif v_action in ('collect', 'collected', 'pickup_collected') then
    v_status := 'pickup_collected'; v_pickup_status := 'PICKUP_COLLECTED';
    update public.be_portal_pickup_requests
    set pickup_collected_at = now(), rider_status = 'PICKUP_COLLECTED', rider_app_stage = 'PICKUP_COLLECTED',
        pickup_status = v_pickup_status, status = v_status, assignment_status = 'collected',
        warehouse_status = 'IN_TRANSIT_TO_WAREHOUSE', data_entry_status = 'WAITING_DATA_ENTRY',
        rider_last_action = 'collected', rider_last_action_at = now(), updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  elsif v_action in ('deliver', 'delivered', 'pod') then
    v_status := 'delivered'; v_pickup_status := 'DELIVERED';
    update public.be_portal_pickup_requests
    set delivered_at = now(), delivery_verified_at = now(), delivery_status = 'DELIVERED',
        rider_status = 'DELIVERED', rider_app_stage = 'DELIVERED',
        pickup_status = v_pickup_status, status = v_status,
        rider_last_action = 'delivered', rider_last_action_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_delivery_payload', v_payload, 'last_delivery_action_at', now()),
        updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

    insert into public.be_proof_of_delivery (
      pickup_id, delivery_way_id, proof_type, proof_url, signature_url,
      recipient_name, recipient_phone, rider_code, rider_name, status, metadata
    )
    values (
      v_pickup_id, nullif(v_payload ->> 'delivery_way_id', ''), coalesce(nullif(v_payload ->> 'proof_type', ''), 'delivery'),
      nullif(v_payload ->> 'proof_url', ''), nullif(v_payload ->> 'signature_url', ''),
      nullif(v_payload ->> 'recipient_name', ''), nullif(v_payload ->> 'recipient_phone', ''),
      v_rider, v_rider_name, 'submitted', v_payload
    );

  else
    v_status := 'exception'; v_pickup_status := 'EXCEPTION';
    update public.be_portal_pickup_requests
    set exception_at = now(), exception_reason = coalesce(nullif(v_payload ->> 'reason', ''), nullif(v_payload ->> 'remarks', ''), 'Rider exception'),
        delivery_status = 'EXCEPTION', rider_status = 'EXCEPTION', rider_app_stage = 'EXCEPTION',
        pickup_status = v_pickup_status, status = v_status,
        rider_last_action = 'exception', rider_last_action_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_exception_payload', v_payload, 'last_exception_at', now()),
        updated_at = now()
    where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;
  end if;

  select to_jsonb(p.*) into v_rec
  from public.be_portal_pickup_requests p
  where p.pickup_id = v_pickup_id or p.pickup_way_id = v_pickup_id
  limit 1;

  if v_rec is null then return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'pickup_id', v_pickup_id); end if;

  perform public.be_workflow_emit_event(v_pickup_id, 'rider_' || v_action, coalesce(v_pickup_status, v_status), v_pickup_id || ' rider action: ' || v_action, 'rider_app', 'rider', v_rider, v_rider_name, v_payload);
  perform public.be_workflow_notify(v_pickup_id, 'supervisor', null, 'Rider action update', v_pickup_id || ': ' || v_action, v_payload);
  perform public.be_workflow_notify(v_pickup_id, 'warehouse', null, 'Pickup workflow update', v_pickup_id || ': ' || v_action, v_payload);
  perform public.be_workflow_notify(v_pickup_id, 'data_entry', null, 'Pickup workflow update', v_pickup_id || ': ' || v_action, v_payload);
  perform public.be_workflow_notify(v_pickup_id, 'finance', null, 'Pickup workflow update', v_pickup_id || ': ' || v_action, v_payload);

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'action', v_action, 'status', v_status, 'pickup_status', v_pickup_status, 'record', v_rec);
end;
$$;

create or replace function public.be_rider_action(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_rider_pickup_action(p_payload); $$;

create or replace function public.be_rider_update_pickup_status(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_rider_pickup_action(p_payload); $$;

create or replace function public.be_rider_save_parcel_proof(p_payload jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select public.be_rider_pickup_action(coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('action', 'verify_pickup')); $$;

create or replace function public.be_data_entry_pickup_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb), 'data', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb))
  from public.be_portal_pickup_requests p
  where upper(coalesce(p.pickup_status, '')) in ('PICKUP_VERIFIED', 'PICKUP_COLLECTED')
     or upper(coalesce(p.data_entry_status, '')) in ('WAITING_DATA_ENTRY', 'WAITING_PICKUP');
$$;

create or replace function public.be_warehouse_inbound_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb), 'data', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb))
  from public.be_portal_pickup_requests p
  where upper(coalesce(p.warehouse_status, '')) in ('WAITING_DATA_ENTRY', 'IN_TRANSIT_TO_WAREHOUSE', 'WAITING_INBOUND', 'INBOUND_READY')
     or upper(coalesce(p.pickup_status, '')) in ('PICKUP_VERIFIED', 'PICKUP_COLLECTED');
$$;

create or replace function public.be_finance_workflow_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb), 'data', coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc), '[]'::jsonb))
  from public.be_portal_pickup_requests p
  where lower(coalesce(p.finance_status, 'pending_finance')) in ('pending_finance', 'pending', 'cod_pending', 'settlement_pending')
     or upper(coalesce(p.delivery_status, '')) in ('DELIVERED', 'OUT_FOR_DELIVERY');
$$;

create or replace function public.be_workforce_generate_commission(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text := coalesce(nullif(p_payload ->> 'pickup_id', ''), nullif(p_payload ->> 'pickup_way_id', ''));
  v_base numeric := coalesce(nullif(p_payload ->> 'base_amount', '')::numeric, 0);
  v_pickup record;
  v_count integer := 0;
  v_amount numeric;
begin
  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id = v_pickup_id or pickup_way_id = v_pickup_id
  limit 1;

  if v_pickup.pickup_id is null then
    return jsonb_build_object('ok', false, 'error', 'pickup_not_found', 'pickup_id', v_pickup_id);
  end if;

  if v_base <= 0 then
    v_base := greatest(coalesce(v_pickup.parcel_count, v_pickup.expected_parcel_count, 1), 1) * 500;
  end if;

  if v_pickup.assigned_rider_code is not null then
    v_amount := v_base;
    insert into public.be_workforce_commission_ledger (workforce_code, workforce_name, workforce_type, pickup_id, commission_type, base_amount, commission_amount, metadata)
    values (v_pickup.assigned_rider_code, v_pickup.assigned_rider_name, 'rider', v_pickup.pickup_id, 'pickup_delivery', v_base, v_amount, to_jsonb(v_pickup));
    insert into public.be_workforce_wallet_ledger (workforce_code, workforce_name, workforce_type, pickup_id, transaction_type, amount, direction, status, reference_type, metadata)
    values (v_pickup.assigned_rider_code, v_pickup.assigned_rider_name, 'rider', v_pickup.pickup_id, 'commission_credit', v_amount, 'credit', 'pending', 'pickup', to_jsonb(v_pickup));
    v_count := v_count + 1;
  end if;

  if v_pickup.assigned_driver_code is not null then
    v_amount := round(v_base * 0.5, 0);
    insert into public.be_workforce_commission_ledger (workforce_code, workforce_name, workforce_type, pickup_id, commission_type, base_amount, commission_amount, metadata)
    values (v_pickup.assigned_driver_code, v_pickup.assigned_driver_name, 'driver', v_pickup.pickup_id, 'route_support', v_base, v_amount, to_jsonb(v_pickup));
    insert into public.be_workforce_wallet_ledger (workforce_code, workforce_name, workforce_type, pickup_id, transaction_type, amount, direction, status, reference_type, metadata)
    values (v_pickup.assigned_driver_code, v_pickup.assigned_driver_name, 'driver', v_pickup.pickup_id, 'commission_credit', v_amount, 'credit', 'pending', 'pickup', to_jsonb(v_pickup));
    v_count := v_count + 1;
  end if;

  if v_pickup.assigned_helper_code is not null then
    v_amount := round(v_base * 0.3, 0);
    insert into public.be_workforce_commission_ledger (workforce_code, workforce_name, workforce_type, pickup_id, commission_type, base_amount, commission_amount, metadata)
    values (v_pickup.assigned_helper_code, v_pickup.assigned_helper_name, 'helper', v_pickup.pickup_id, 'route_support', v_base, v_amount, to_jsonb(v_pickup));
    insert into public.be_workforce_wallet_ledger (workforce_code, workforce_name, workforce_type, pickup_id, transaction_type, amount, direction, status, reference_type, metadata)
    values (v_pickup.assigned_helper_code, v_pickup.assigned_helper_name, 'helper', v_pickup.pickup_id, 'commission_credit', v_amount, 'credit', 'pending', 'pickup', to_jsonb(v_pickup));
    v_count := v_count + 1;
  end if;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup.pickup_id, 'ledger_rows_created', v_count);
end;
$$;

create or replace function public.be_workforce_wallet_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'wallets', coalesce(jsonb_agg(to_jsonb(x) order by x.workforce_code), '[]'::jsonb))
  from (
    select workforce_code, workforce_name, workforce_type,
           coalesce(sum(case when direction = 'credit' then amount else -amount end), 0) as balance,
           coalesce(sum(case when status = 'pending' and direction = 'credit' then amount else 0 end), 0) as pending_credit,
           count(*) as ledger_count
    from public.be_workforce_wallet_ledger
    where nullif(p_payload ->> 'workforce_code', '') is null or workforce_code = p_payload ->> 'workforce_code'
    group by workforce_code, workforce_name, workforce_type
  ) x;
$$;

alter table public.be_portal_cargo_events enable row level security;
alter table public.be_app_notifications enable row level security;
alter table public.be_proof_of_delivery enable row level security;
alter table public.be_workforce_wallet_ledger enable row level security;
alter table public.be_workforce_commission_ledger enable row level security;

drop policy if exists be_pod_read_all on public.be_proof_of_delivery;
drop policy if exists be_pod_write_all on public.be_proof_of_delivery;
drop policy if exists be_wallet_read_all on public.be_workforce_wallet_ledger;
drop policy if exists be_wallet_write_all on public.be_workforce_wallet_ledger;
drop policy if exists be_commission_read_all on public.be_workforce_commission_ledger;
drop policy if exists be_commission_write_all on public.be_workforce_commission_ledger;

create policy be_pod_read_all on public.be_proof_of_delivery for select to anon, authenticated using (true);
create policy be_pod_write_all on public.be_proof_of_delivery for all to anon, authenticated using (true) with check (true);
create policy be_wallet_read_all on public.be_workforce_wallet_ledger for select to anon, authenticated using (true);
create policy be_wallet_write_all on public.be_workforce_wallet_ledger for all to anon, authenticated using (true) with check (true);
create policy be_commission_read_all on public.be_workforce_commission_ledger for select to anon, authenticated using (true);
create policy be_commission_write_all on public.be_workforce_commission_ledger for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.be_v_rider_pickup_queue to anon, authenticated;
grant select, insert, update, delete on public.be_portal_pickup_requests to anon, authenticated;
grant select, insert, update, delete on public.be_portal_cargo_events to anon, authenticated;
grant select, insert, update, delete on public.be_app_notifications to anon, authenticated;
grant select, insert, update, delete on public.be_proof_of_delivery to anon, authenticated;
grant select, insert, update, delete on public.be_workforce_wallet_ledger to anon, authenticated;
grant select, insert, update, delete on public.be_workforce_commission_ledger to anon, authenticated;

grant execute on function public.be_supervisor_assign_job(jsonb) to anon, authenticated;
grant execute on function public.be_assign_pickup_request(jsonb) to anon, authenticated;
grant execute on function public.be_confirm_pickup_dispatch(jsonb) to anon, authenticated;
grant execute on function public.be_supervisor_confirm_dispatch(jsonb) to anon, authenticated;
grant execute on function public.be_rider_pickup_queue(jsonb) to anon, authenticated;
grant execute on function public.be_get_rider_pickup_queue(jsonb) to anon, authenticated;
grant execute on function public.be_mobile_rider_pickup_queue(jsonb) to anon, authenticated;
grant execute on function public.be_rider_jobs(jsonb) to anon, authenticated;
grant execute on function public.be_rider_pickup_action(jsonb) to anon, authenticated;
grant execute on function public.be_rider_action(jsonb) to anon, authenticated;
grant execute on function public.be_rider_update_pickup_status(jsonb) to anon, authenticated;
grant execute on function public.be_rider_save_parcel_proof(jsonb) to anon, authenticated;
grant execute on function public.be_data_entry_pickup_queue(jsonb) to anon, authenticated;
grant execute on function public.be_warehouse_inbound_queue(jsonb) to anon, authenticated;
grant execute on function public.be_finance_workflow_queue(jsonb) to anon, authenticated;
grant execute on function public.be_workforce_generate_commission(jsonb) to anon, authenticated;
grant execute on function public.be_workforce_wallet_snapshot(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
