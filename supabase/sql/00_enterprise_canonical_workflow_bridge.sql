-- Britium Enterprise Canonical Workflow Bridge
-- CS -> Supervisor -> Rider/Driver/Helper -> Data Entry -> COD -> Finance
-- This avoids old partially-created legacy table constraints by using one canonical table.

create extension if not exists pgcrypto;

drop function if exists public.be_mobile_go_live_snapshot(text, text, integer);

create table if not exists public.be_enterprise_workflow_jobs (
  flow_id uuid primary key default gen_random_uuid(),
  pickup_id text not null unique,
  job_id text not null default ('JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  assignment_type text not null default 'order_picking',
  status text not null default 'pending_supervisor_assignment',

  merchant_code text,
  merchant_name text,
  pickup_address text,
  parcel_count integer default 0,
  cod_amount numeric default 0,
  delivery_fee numeric default 0,
  final_cod numeric default 0,
  assigned_branch text default 'YGN',

  rider_id text,
  rider_name text,
  driver_id text,
  driver_name text,
  helper_id text,
  helper_name text,
  fleet_id text,
  fleet_label text,
  supervisor_note text,

  cs_created_at timestamptz,
  supervisor_assigned_at timestamptz,
  rider_acknowledged_at timestamptz,
  pickup_started_at timestamptz,
  pickup_verified_at timestamptz,
  data_entry_registered_at timestamptz,
  delivery_started_at timestamptz,
  delivery_completed_at timestamptz,
  cod_collected_at timestamptz,
  cod_handover_at timestamptz,
  finance_settled_at timestamptz,

  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_enterprise_workflow_jobs
  add column if not exists flow_id uuid default gen_random_uuid(),
  add column if not exists pickup_id text,
  add column if not exists job_id text default ('JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  add column if not exists assignment_type text default 'order_picking',
  add column if not exists status text default 'pending_supervisor_assignment',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists pickup_address text,
  add column if not exists parcel_count integer default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists assigned_branch text default 'YGN',
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists driver_id text,
  add column if not exists driver_name text,
  add column if not exists helper_id text,
  add column if not exists helper_name text,
  add column if not exists fleet_id text,
  add column if not exists fleet_label text,
  add column if not exists supervisor_note text,
  add column if not exists cs_created_at timestamptz,
  add column if not exists supervisor_assigned_at timestamptz,
  add column if not exists rider_acknowledged_at timestamptz,
  add column if not exists pickup_started_at timestamptz,
  add column if not exists pickup_verified_at timestamptz,
  add column if not exists data_entry_registered_at timestamptz,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_completed_at timestamptz,
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_handover_at timestamptz,
  add column if not exists finance_settled_at timestamptz,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_enterprise_workflow_jobs
set
  flow_id = coalesce(flow_id, gen_random_uuid()),
  job_id = coalesce(nullif(job_id, ''), 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  assignment_type = coalesce(nullif(assignment_type, ''), 'order_picking'),
  status = coalesce(nullif(status, ''), 'pending_supervisor_assignment'),
  parcel_count = coalesce(parcel_count, 0),
  cod_amount = coalesce(cod_amount, 0),
  delivery_fee = coalesce(delivery_fee, 0),
  final_cod = coalesce(final_cod, cod_amount, 0),
  assigned_branch = coalesce(nullif(assigned_branch, ''), 'YGN'),
  payload = coalesce(payload, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists be_enterprise_workflow_jobs_pickup_uidx on public.be_enterprise_workflow_jobs (pickup_id);
create index if not exists be_enterprise_workflow_jobs_workforce_idx on public.be_enterprise_workflow_jobs (rider_id, driver_id, helper_id, fleet_id, status, updated_at desc);

create table if not exists public.be_enterprise_workflow_events (
  event_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  event_type text not null,
  event_status text,
  actor_id text,
  actor_name text,
  actor_role text,
  source_module text,
  target_module text,
  amount numeric default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_cod_ledger (
  cod_id uuid primary key default gen_random_uuid(),
  pickup_id text unique,
  rider_id text,
  rider_name text,
  merchant_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  cod_status text default 'pending_collection',
  collected_at timestamptz,
  handed_over_at timestamptz,
  settlement_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_financial_settlements (
  settlement_id text primary key default ('SET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  pickup_id text unique,
  cod_id uuid,
  merchant_name text,
  rider_id text,
  rider_name text,
  gross_cod numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  settlement_status text default 'pending_finance',
  finance_note text,
  closed_by text,
  closed_by_name text,
  closed_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.be_workflow_log(pickup text, type_ text, status_ text, source_ text, target_ text, payload_ jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.be_enterprise_workflow_events(pickup_id, event_type, event_status, source_module, target_module, payload)
  values (pickup, type_, status_, source_, target_, coalesce(payload_, '{}'::jsonb));
end;
$$;

create or replace function public.be_operational_master_snapshot()
returns jsonb
language plpgsql
security definer
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  begin
    select public.be_master_data_dropdown_snapshot() into v;
  exception when others then
    v := '{}'::jsonb;
  end;

  return jsonb_build_object(
    'dropdowns', coalesce(v->'dropdowns', '{}'::jsonb),
    'merchants', coalesce(v->'merchants', '[]'::jsonb),
    'riders', coalesce(v->'riders', '[]'::jsonb),
    'drivers', coalesce(v->'drivers', '[]'::jsonb),
    'helpers', coalesce(v->'helpers', '[]'::jsonb),
    'employees', coalesce(v->'employees', '[]'::jsonb),
    'fleets', coalesce(v->'fleets', '[]'::jsonb),
    'townships', coalesce(v->'townships', coalesce(v->'zones', '[]'::jsonb)),
    'destinations', coalesce(v->'destinations', coalesce(v->'branches', '[]'::jsonb))
  );
end;
$$;

create or replace function public.be_supervisor_assignment_snapshot()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickups jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      with source_rows as (
        select
          pr.pickup_id,
          pr.merchant_code,
          pr.merchant_name,
          pr.pickup_address,
          coalesce(pr.parcel_count, 0) as parcel_count,
          coalesce(pr.cod_amount, 0) as cod_amount,
          coalesce(pr.assigned_branch, pr.branch_code, 'YGN') as assigned_branch,
          coalesce(j.status, pr.status, 'pending_supervisor_assignment') as status,
          j.rider_id, j.rider_name, j.driver_id, j.driver_name, j.helper_id, j.helper_name, j.fleet_id, j.fleet_label,
          coalesce(pr.created_at, j.created_at) as created_at,
          coalesce(j.updated_at, pr.updated_at, pr.created_at) as updated_at
        from public.be_portal_pickup_requests pr
        left join public.be_enterprise_workflow_jobs j on j.pickup_id = pr.pickup_id
        where lower(coalesce(pr.status, '')) not in ('cancelled','delivery_completed','finance_settled')
        union all
        select
          j.pickup_id, j.merchant_code, j.merchant_name, j.pickup_address, coalesce(j.parcel_count,0), coalesce(j.cod_amount,0), coalesce(j.assigned_branch,'YGN'), j.status,
          j.rider_id, j.rider_name, j.driver_id, j.driver_name, j.helper_id, j.helper_name, j.fleet_id, j.fleet_label,
          j.created_at, j.updated_at
        from public.be_enterprise_workflow_jobs j
        where not exists (select 1 from public.be_portal_pickup_requests pr where pr.pickup_id = j.pickup_id)
      )
      select coalesce(jsonb_agg(row_to_json(source_rows)::jsonb order by updated_at desc nulls last), '[]'::jsonb)
      from source_rows
      limit 250
    $q$ into v_pickups;
  else
    select coalesce(jsonb_agg(row_to_json(j)::jsonb order by j.updated_at desc), '[]'::jsonb)
    into v_pickups
    from public.be_enterprise_workflow_jobs j
    limit 250;
  end if;

  return jsonb_build_object(
    'pickups', coalesce(v_pickups, '[]'::jsonb),
    'kpis', jsonb_build_object(
      'pending', jsonb_array_length(coalesce(v_pickups, '[]'::jsonb)),
      'active', (select count(*) from public.be_enterprise_workflow_jobs where status in ('order_picking_started','delivery_started')),
      'exceptions', 0,
      'fleet_ready', coalesce(jsonb_array_length(public.be_operational_master_snapshot()->'fleets'), 0)
    )
  );
end;
$$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
  v_type text := coalesce(nullif(trim(p_payload->>'assignment_type'), ''), 'order_picking');
  v_status text;
  v_job_id text := 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  v_cod numeric := coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0);
  v_fee numeric := coalesce(nullif(p_payload->>'delivery_fee','')::numeric, 0);
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_type = 'order_picking' and nullif(trim(coalesce(p_payload->>'rider_id','')), '') is null then raise exception 'rider_id is required for order picking'; end if;
  if v_type = 'delivery' and (nullif(trim(coalesce(p_payload->>'driver_id','')), '') is null or nullif(trim(coalesce(p_payload->>'helper_id','')), '') is null or nullif(trim(coalesce(p_payload->>'fleet_id','')), '') is null) then raise exception 'driver_id, helper_id and fleet_id are required for delivery'; end if;
  if v_type = 'both' and (nullif(trim(coalesce(p_payload->>'rider_id','')), '') is null or nullif(trim(coalesce(p_payload->>'driver_id','')), '') is null or nullif(trim(coalesce(p_payload->>'helper_id','')), '') is null or nullif(trim(coalesce(p_payload->>'fleet_id','')), '') is null) then raise exception 'rider_id, driver_id, helper_id and fleet_id are required for full job'; end if;

  v_status := case when v_type = 'order_picking' then 'order_picking_assigned' when v_type = 'delivery' then 'delivery_resources_assigned' else 'assigned' end;

  insert into public.be_enterprise_workflow_jobs(
    pickup_id, job_id, assignment_type, status, merchant_code, merchant_name, pickup_address, parcel_count, cod_amount, delivery_fee, final_cod, assigned_branch,
    rider_id, rider_name, driver_id, driver_name, helper_id, helper_name, fleet_id, fleet_label, supervisor_note, supervisor_assigned_at, payload, updated_at
  ) values (
    v_pickup_id, v_job_id, v_type, v_status, nullif(p_payload->>'merchant_code',''), nullif(p_payload->>'merchant_name',''), nullif(p_payload->>'pickup_address',''),
    coalesce(nullif(p_payload->>'parcel_count','')::integer,0), v_cod, v_fee, v_cod + v_fee, coalesce(nullif(p_payload->>'assigned_branch',''),'YGN'),
    nullif(p_payload->>'rider_id',''), nullif(p_payload->>'rider_name',''), nullif(p_payload->>'driver_id',''), nullif(p_payload->>'driver_name',''),
    nullif(p_payload->>'helper_id',''), nullif(p_payload->>'helper_name',''), nullif(p_payload->>'fleet_id',''), nullif(p_payload->>'fleet_label',''),
    nullif(p_payload->>'supervisor_note',''), now(), p_payload, now()
  )
  on conflict (pickup_id) do update set
    assignment_type = excluded.assignment_type,
    status = excluded.status,
    merchant_code = coalesce(excluded.merchant_code, public.be_enterprise_workflow_jobs.merchant_code),
    merchant_name = coalesce(excluded.merchant_name, public.be_enterprise_workflow_jobs.merchant_name),
    pickup_address = coalesce(excluded.pickup_address, public.be_enterprise_workflow_jobs.pickup_address),
    parcel_count = coalesce(excluded.parcel_count, public.be_enterprise_workflow_jobs.parcel_count),
    cod_amount = coalesce(excluded.cod_amount, public.be_enterprise_workflow_jobs.cod_amount),
    delivery_fee = coalesce(excluded.delivery_fee, public.be_enterprise_workflow_jobs.delivery_fee),
    final_cod = coalesce(excluded.final_cod, public.be_enterprise_workflow_jobs.final_cod),
    assigned_branch = coalesce(excluded.assigned_branch, public.be_enterprise_workflow_jobs.assigned_branch),
    rider_id = coalesce(excluded.rider_id, public.be_enterprise_workflow_jobs.rider_id),
    rider_name = coalesce(excluded.rider_name, public.be_enterprise_workflow_jobs.rider_name),
    driver_id = coalesce(excluded.driver_id, public.be_enterprise_workflow_jobs.driver_id),
    driver_name = coalesce(excluded.driver_name, public.be_enterprise_workflow_jobs.driver_name),
    helper_id = coalesce(excluded.helper_id, public.be_enterprise_workflow_jobs.helper_id),
    helper_name = coalesce(excluded.helper_name, public.be_enterprise_workflow_jobs.helper_name),
    fleet_id = coalesce(excluded.fleet_id, public.be_enterprise_workflow_jobs.fleet_id),
    fleet_label = coalesce(excluded.fleet_label, public.be_enterprise_workflow_jobs.fleet_label),
    supervisor_note = coalesce(excluded.supervisor_note, public.be_enterprise_workflow_jobs.supervisor_note),
    supervisor_assigned_at = now(),
    payload = public.be_enterprise_workflow_jobs.payload || excluded.payload,
    updated_at = now();

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute 'update public.be_portal_pickup_requests set status = $2, updated_at = now() where pickup_id = $1' using v_pickup_id, v_status;
    exception when others then null;
    end;
  end if;

  insert into public.be_cod_ledger(pickup_id, rider_id, rider_name, merchant_name, cod_amount, cod_status, payload, updated_at)
  values(v_pickup_id, nullif(p_payload->>'rider_id',''), nullif(p_payload->>'rider_name',''), nullif(p_payload->>'merchant_name',''), v_cod, case when v_cod > 0 then 'pending_collection' else 'not_required' end, p_payload, now())
  on conflict (pickup_id) do update set
    rider_id = coalesce(excluded.rider_id, public.be_cod_ledger.rider_id),
    rider_name = coalesce(excluded.rider_name, public.be_cod_ledger.rider_name),
    merchant_name = coalesce(excluded.merchant_name, public.be_cod_ledger.merchant_name),
    cod_amount = coalesce(excluded.cod_amount, public.be_cod_ledger.cod_amount),
    payload = public.be_cod_ledger.payload || excluded.payload,
    updated_at = now();

  perform public.be_workflow_log(v_pickup_id, 'SUPERVISOR_ASSIGNMENT', v_status, 'supervisor', case when v_type='order_picking' then 'rider_app' else 'dispatch' end, p_payload);

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'job_id', v_job_id, 'assignment_type', v_type, 'status', v_status, 'synced_to_rider', true, 'synced_to_cod', true);
end;
$$;

create or replace function public.be_mobile_go_live_snapshot(p_workforce_code text default null, p_phone text default null, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(nullif(trim(coalesce(p_workforce_code,'')), ''));
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  v_codes text[] := array[]::text[];
  v_assigned jsonb := '[]'::jsonb;
  v_delivery jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_limit integer := least(greatest(coalesce(p_limit,100),1),500);
begin
  if v_code is not null then v_codes := array_append(v_codes, v_code); end if;

  if to_regclass('public.be_master_data_records') is not null then
    begin
      select coalesce(array_agg(distinct upper(record_key)), v_codes) into v_codes
      from (
        select unnest(v_codes) as record_key
        union all
        select record_key
        from public.be_master_data_records
        where entity_code in ('riders','drivers','helpers','employees') and coalesce(is_active,true)=true
          and (upper(record_key)=any(v_codes)
               or (v_code is not null and lower(coalesce(row_data->>'email', row_data->>'email_address', row_data->>'login_email',''))=lower(v_code))
               or (v_phone <> '' and regexp_replace(coalesce(row_data->>'phone_primary', row_data->>'phone', row_data->>'mobile',''), '[^0-9+]', '', 'g')=v_phone))
      ) s where record_key is not null;
    exception when others then null;
    end;
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb) into v_assigned
  from (
    select * from public.be_enterprise_workflow_jobs j
    where j.status not in ('cancelled','delivery_completed','finance_settled')
      and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(j.rider_id,''))=any(v_codes) or upper(coalesce(j.driver_id,''))=any(v_codes) or upper(coalesce(j.helper_id,''))=any(v_codes))
    order by j.updated_at desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb) into v_delivery
  from (
    select * from public.be_enterprise_workflow_jobs j
    where j.status in ('delivery_resources_assigned','assigned','data_entry_registered','delivery_started')
      and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(j.rider_id,''))=any(v_codes) or upper(coalesce(j.driver_id,''))=any(v_codes) or upper(coalesce(j.helper_id,''))=any(v_codes))
    order by j.updated_at desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', flow_id, 'pickup_id', pickup_id, 'title', case when status='order_picking_assigned' then 'New Order Picking Assignment' when status='delivery_resources_assigned' then 'New Delivery Assignment' else 'Workflow Update' end, 'message', 'Pickup '||pickup_id||' is '||replace(status,'_',' ')||'.', 'status', status, 'created_at', updated_at) order by updated_at desc), '[]'::jsonb)
  into v_notifications
  from public.be_enterprise_workflow_jobs j
  where j.status not in ('cancelled','delivery_completed','finance_settled')
    and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(j.rider_id,''))=any(v_codes) or upper(coalesce(j.driver_id,''))=any(v_codes) or upper(coalesce(j.helper_id,''))=any(v_codes));

  return jsonb_build_object(
    'assigned_pickups', coalesce(v_assigned,'[]'::jsonb),
    'delivery_jobs', coalesce(v_delivery,'[]'::jsonb),
    'notifications', coalesce(v_notifications,'[]'::jsonb),
    'kpis', jsonb_build_object('assigned_pickups', jsonb_array_length(coalesce(v_assigned,'[]'::jsonb)), 'delivery_jobs', jsonb_array_length(coalesce(v_delivery,'[]'::jsonb)), 'verified_by_picker', (select count(*) from public.be_enterprise_workflow_jobs where status in ('picked_up_verified','data_entry_pending')), 'cod_to_handle', (select coalesce(sum(cod_amount),0) from public.be_cod_ledger where cod_status in ('pending_collection','collected'))),
    'identity', jsonb_build_object('requested_workforce_code', p_workforce_code, 'phone', p_phone, 'resolved_codes', coalesce(to_jsonb(v_codes),'[]'::jsonb)),
    'sync_source', 'be_enterprise_workflow_jobs',
    'synced_at', now()
  );
end;
$$;

create or replace function public.be_rider_update_job_status(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
  v_action text := lower(nullif(trim(p_payload->>'action'), ''));
  v_status text;
  v_amount numeric := coalesce(nullif(p_payload->>'cod_amount','')::numeric, nullif(p_payload->>'collected_amount','')::numeric, 0);
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_action is null then raise exception 'action is required'; end if;
  v_status := case v_action when 'acknowledge' then 'order_picking_acknowledged' when 'start_order_picking' then 'order_picking_started' when 'verify_pickup' then 'picked_up_verified' when 'send_to_data_entry' then 'data_entry_pending' when 'collect_cod' then 'cod_collected' when 'start_delivery' then 'delivery_started' when 'complete_delivery' then 'delivery_completed' else v_action end;

  update public.be_enterprise_workflow_jobs set
    status = v_status,
    rider_acknowledged_at = case when v_status in ('order_picking_acknowledged','order_picking_started','picked_up_verified','data_entry_pending') then coalesce(rider_acknowledged_at, now()) else rider_acknowledged_at end,
    pickup_started_at = case when v_status='order_picking_started' then coalesce(pickup_started_at, now()) else pickup_started_at end,
    pickup_verified_at = case when v_status in ('picked_up_verified','data_entry_pending') then coalesce(pickup_verified_at, now()) else pickup_verified_at end,
    delivery_started_at = case when v_status='delivery_started' then coalesce(delivery_started_at, now()) else delivery_started_at end,
    delivery_completed_at = case when v_status='delivery_completed' then coalesce(delivery_completed_at, now()) else delivery_completed_at end,
    cod_collected_at = case when v_status='cod_collected' then coalesce(cod_collected_at, now()) else cod_collected_at end,
    payload = coalesce(payload,'{}'::jsonb) || p_payload,
    updated_at = now()
  where pickup_id = v_pickup_id;
  if not found then raise exception 'No workflow job found for pickup_id %', v_pickup_id; end if;

  if v_status = 'cod_collected' then
    update public.be_cod_ledger set collected_amount = case when v_amount > 0 then v_amount else cod_amount end, variance_amount = (case when v_amount > 0 then v_amount else cod_amount end)-cod_amount, cod_status='collected', collected_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id;
  end if;
  perform public.be_workflow_log(v_pickup_id, 'RIDER_STATUS', v_status, 'rider_app', case when v_status='data_entry_pending' then 'data_entry' when v_status='cod_collected' then 'cod' else 'supervisor' end, p_payload);
  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', v_status);
end;
$$;

create or replace function public.be_data_entry_work_queue_snapshot(p_status text default null, p_limit integer default 200)
returns jsonb language sql security definer as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb), 'synced_at', now())
  from (select * from public.be_enterprise_workflow_jobs where status in ('picked_up_verified','data_entry_pending','data_entry_registered') and (p_status is null or status=p_status) order by updated_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x;
$$;

create or replace function public.be_data_entry_confirm_registration(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  update public.be_enterprise_workflow_jobs set status='data_entry_registered', data_entry_registered_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id;
  if not found then raise exception 'No workflow job found for pickup_id %', v_pickup_id; end if;
  perform public.be_workflow_log(v_pickup_id, 'DATA_ENTRY_REGISTRATION', 'data_entry_registered', 'data_entry', 'delivery_dispatch', p_payload);
  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', 'data_entry_registered');
end;
$$;

create or replace function public.be_cod_mark_handover(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
  v_amount numeric := coalesce(nullif(p_payload->>'handover_amount','')::numeric, nullif(p_payload->>'amount','')::numeric, 0);
  v_cod_id uuid;
  v_settlement_id text := 'SET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  update public.be_cod_ledger set handover_amount = case when v_amount>0 then v_amount else collected_amount end, variance_amount=(case when v_amount>0 then v_amount else collected_amount end)-cod_amount, cod_status='handed_over_to_finance', handed_over_at=now(), settlement_id=coalesce(settlement_id, v_settlement_id), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id returning cod_id, settlement_id into v_cod_id, v_settlement_id;
  if v_cod_id is null then raise exception 'No COD ledger found for pickup_id %', v_pickup_id; end if;
  insert into public.be_financial_settlements(settlement_id, pickup_id, cod_id, gross_cod, handover_amount, variance_amount, settlement_status, payload, updated_at)
  select v_settlement_id, pickup_id, cod_id, cod_amount, handover_amount, variance_amount, 'pending_finance', p_payload, now() from public.be_cod_ledger where cod_id=v_cod_id
  on conflict (pickup_id) do update set gross_cod=excluded.gross_cod, handover_amount=excluded.handover_amount, variance_amount=excluded.variance_amount, settlement_status='pending_finance', payload=public.be_financial_settlements.payload||excluded.payload, updated_at=now();
  update public.be_enterprise_workflow_jobs set status='cod_handover_pending', cod_handover_at=now(), updated_at=now() where pickup_id=v_pickup_id;
  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'settlement_id', v_settlement_id, 'status', 'pending_finance');
end;
$$;

create or replace function public.be_finance_close_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), ''); v_settlement_id text := nullif(trim(p_payload->>'settlement_id'), '');
begin
  if v_pickup_id is null and v_settlement_id is null then raise exception 'pickup_id or settlement_id is required'; end if;
  update public.be_financial_settlements set settlement_status='finance_settled', finance_note=nullif(p_payload->>'finance_note',''), closed_by=nullif(p_payload->>'closed_by',''), closed_by_name=nullif(p_payload->>'closed_by_name',''), closed_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where (v_pickup_id is not null and pickup_id=v_pickup_id) or (v_settlement_id is not null and settlement_id=v_settlement_id) returning pickup_id into v_pickup_id;
  if v_pickup_id is null then raise exception 'Settlement not found'; end if;
  update public.be_cod_ledger set cod_status='finance_settled', updated_at=now() where pickup_id=v_pickup_id;
  update public.be_enterprise_workflow_jobs set status='finance_settled', finance_settled_at=now(), updated_at=now() where pickup_id=v_pickup_id;
  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', 'finance_settled');
end;
$$;

create or replace function public.be_cod_settlement_snapshot(p_status text default null, p_limit integer default 200)
returns jsonb language sql security definer as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb), 'synced_at', now()) from (select * from public.be_cod_ledger where p_status is null or cod_status=p_status order by updated_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x;
$$;

create or replace function public.be_financial_settlement_snapshot(p_status text default null, p_limit integer default 200)
returns jsonb language sql security definer as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb), 'synced_at', now()) from (select * from public.be_financial_settlements where p_status is null or settlement_status=p_status order by updated_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x;
$$;

create or replace function public.be_enterprise_workflow_snapshot()
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'supervisor_active', (select count(*) from public.be_enterprise_workflow_jobs where status in ('order_picking_assigned','order_picking_acknowledged','order_picking_started','delivery_resources_assigned')),
    'rider_active', (select count(*) from public.be_enterprise_workflow_jobs where status in ('order_picking_assigned','order_picking_started','picked_up_verified')),
    'data_entry_pending', (select count(*) from public.be_enterprise_workflow_jobs where status in ('picked_up_verified','data_entry_pending')),
    'cod_pending', (select count(*) from public.be_cod_ledger where cod_status in ('pending_collection','collected','handed_over_to_finance')),
    'finance_pending', (select count(*) from public.be_financial_settlements where settlement_status='pending_finance'),
    'events', (select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.created_at desc), '[]'::jsonb) from (select * from public.be_enterprise_workflow_events order by created_at desc limit 50) e),
    'synced_at', now()
  );
$$;

alter table public.be_enterprise_workflow_jobs enable row level security;
alter table public.be_enterprise_workflow_events enable row level security;
alter table public.be_cod_ledger enable row level security;
alter table public.be_financial_settlements enable row level security;

drop policy if exists be_enterprise_workflow_jobs_all_auth on public.be_enterprise_workflow_jobs;
drop policy if exists be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events;
drop policy if exists be_cod_ledger_all_auth on public.be_cod_ledger;
drop policy if exists be_financial_settlements_all_auth on public.be_financial_settlements;

create policy be_enterprise_workflow_jobs_all_auth on public.be_enterprise_workflow_jobs for all to authenticated using (true) with check (true);
create policy be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events for all to authenticated using (true) with check (true);
create policy be_cod_ledger_all_auth on public.be_cod_ledger for all to authenticated using (true) with check (true);
create policy be_financial_settlements_all_auth on public.be_financial_settlements for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.be_enterprise_workflow_jobs to authenticated;
grant select, insert, update, delete on public.be_enterprise_workflow_events to authenticated;
grant select, insert, update, delete on public.be_cod_ledger to authenticated;
grant select, insert, update, delete on public.be_financial_settlements to authenticated;

grant execute on function public.be_workflow_log(text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.be_operational_master_snapshot() to authenticated;
grant execute on function public.be_supervisor_assignment_snapshot() to authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to authenticated;
grant execute on function public.be_mobile_go_live_snapshot(text,text,integer) to anon, authenticated;
grant execute on function public.be_rider_update_job_status(jsonb) to authenticated;
grant execute on function public.be_data_entry_work_queue_snapshot(text,integer) to authenticated;
grant execute on function public.be_data_entry_confirm_registration(jsonb) to authenticated;
grant execute on function public.be_cod_mark_handover(jsonb) to authenticated;
grant execute on function public.be_finance_close_settlement(jsonb) to authenticated;
grant execute on function public.be_cod_settlement_snapshot(text,integer) to authenticated;
grant execute on function public.be_financial_settlement_snapshot(text,integer) to authenticated;
grant execute on function public.be_enterprise_workflow_snapshot() to authenticated;

notify pgrst, 'reload schema';
