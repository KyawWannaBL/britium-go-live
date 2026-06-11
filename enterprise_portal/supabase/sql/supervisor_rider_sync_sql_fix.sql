
-- SUPERVISOR -> RIDER APP SYNC FIX
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- 1) Supervisor "Assign Order Picking" writes into be_supervisor_job_assignments.
-- 2) Rider app /rider/portal reads be_mobile_go_live_snapshot(...).
-- 3) This function now reads be_supervisor_job_assignments directly, so assigned pickups appear in Rider app after Sync.

create extension if not exists pgcrypto;

-- Existing function was previously created with different parameter names.
-- Drop first to avoid: cannot change name of input parameter.
drop function if exists public.be_mobile_go_live_snapshot(text, text, integer);

create table if not exists public.be_supervisor_job_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  job_id text,
  pickup_id text not null,
  job_type text not null default 'order_picking',
  rider_id text,
  rider_name text,
  driver_id text,
  driver_name text,
  helper_id text,
  helper_name text,
  fleet_id text,
  fleet_label text,
  supervisor_note text,
  assignment_type text default 'order_picking',
  status text default 'order_picking_assigned',
  payload jsonb default '{}'::jsonb,
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_supervisor_job_assignments
  add column if not exists assignment_id uuid default gen_random_uuid(),
  add column if not exists job_id text,
  add column if not exists pickup_id text,
  add column if not exists job_type text default 'order_picking',
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists driver_id text,
  add column if not exists driver_name text,
  add column if not exists helper_id text,
  add column if not exists helper_name text,
  add column if not exists fleet_id text,
  add column if not exists fleet_label text,
  add column if not exists supervisor_note text,
  add column if not exists assignment_type text default 'order_picking',
  add column if not exists status text default 'order_picking_assigned',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_supervisor_job_assignments
set
  assignment_id = coalesce(assignment_id, gen_random_uuid()),
  job_id = coalesce(nullif(job_id, ''), 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  job_type = coalesce(nullif(job_type, ''), nullif(assignment_type, ''), 'order_picking'),
  assignment_type = coalesce(nullif(assignment_type, ''), nullif(job_type, ''), 'order_picking'),
  status = coalesce(nullif(status, ''), 'order_picking_assigned'),
  payload = coalesce(payload, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where assignment_id is null
   or nullif(job_id, '') is null
   or nullif(job_type, '') is null
   or nullif(status, '') is null
   or payload is null
   or created_at is null
   or updated_at is null;

alter table public.be_supervisor_job_assignments
  alter column job_type set default 'order_picking',
  alter column job_type set not null,
  alter column job_id set default ('JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)));

with ranked as (
  select
    ctid,
    row_number() over (
      partition by pickup_id
      order by updated_at desc nulls last, created_at desc nulls last, assignment_id desc
    ) as rn
  from public.be_supervisor_job_assignments
  where pickup_id is not null
)
delete from public.be_supervisor_job_assignments t
using ranked r
where t.ctid = r.ctid
  and r.rn > 1;

drop index if exists public.be_supervisor_job_assignments_pickup_uidx;
create unique index if not exists be_supervisor_job_assignments_pickup_uidx
on public.be_supervisor_job_assignments (pickup_id);

create index if not exists be_supervisor_job_assignments_rider_status_idx
on public.be_supervisor_job_assignments (rider_id, status, updated_at desc);

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
  v_assignment_type text := coalesce(nullif(trim(p_payload->>'assignment_type'), ''), 'order_picking');
  v_status text;
  v_job_id text := 'JOB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
begin
  if v_pickup_id is null then
    raise exception 'pickup_id is required';
  end if;

  if v_assignment_type = 'order_picking'
     and nullif(trim(coalesce(p_payload->>'rider_id', '')), '') is null then
    raise exception 'rider_id is required for order picking assignment';
  end if;

  if v_assignment_type = 'delivery'
     and (
       nullif(trim(coalesce(p_payload->>'driver_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'helper_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'fleet_id', '')), '') is null
     ) then
    raise exception 'driver_id, helper_id and fleet_id are required for delivery assignment';
  end if;

  if v_assignment_type = 'both'
     and (
       nullif(trim(coalesce(p_payload->>'rider_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'driver_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'helper_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'fleet_id', '')), '') is null
     ) then
    raise exception 'rider_id, driver_id, helper_id and fleet_id are required for full assignment';
  end if;

  v_status := case
    when v_assignment_type = 'order_picking' then 'order_picking_assigned'
    when v_assignment_type = 'delivery' then 'delivery_resources_assigned'
    else 'assigned'
  end;

  insert into public.be_supervisor_job_assignments (
    job_id, pickup_id, job_type,
    rider_id, rider_name,
    driver_id, driver_name,
    helper_id, helper_name,
    fleet_id, fleet_label,
    supervisor_note, assignment_type, status, payload, updated_at
  )
  values (
    v_job_id, v_pickup_id, v_assignment_type,
    nullif(p_payload->>'rider_id', ''), nullif(p_payload->>'rider_name', ''),
    nullif(p_payload->>'driver_id', ''), nullif(p_payload->>'driver_name', ''),
    nullif(p_payload->>'helper_id', ''), nullif(p_payload->>'helper_name', ''),
    nullif(p_payload->>'fleet_id', ''), nullif(p_payload->>'fleet_label', ''),
    nullif(p_payload->>'supervisor_note', ''), v_assignment_type, v_status, p_payload, now()
  )
  on conflict (pickup_id) do update set
    job_type = excluded.job_type,
    rider_id = coalesce(excluded.rider_id, public.be_supervisor_job_assignments.rider_id),
    rider_name = coalesce(excluded.rider_name, public.be_supervisor_job_assignments.rider_name),
    driver_id = coalesce(excluded.driver_id, public.be_supervisor_job_assignments.driver_id),
    driver_name = coalesce(excluded.driver_name, public.be_supervisor_job_assignments.driver_name),
    helper_id = coalesce(excluded.helper_id, public.be_supervisor_job_assignments.helper_id),
    helper_name = coalesce(excluded.helper_name, public.be_supervisor_job_assignments.helper_name),
    fleet_id = coalesce(excluded.fleet_id, public.be_supervisor_job_assignments.fleet_id),
    fleet_label = coalesce(excluded.fleet_label, public.be_supervisor_job_assignments.fleet_label),
    supervisor_note = coalesce(excluded.supervisor_note, public.be_supervisor_job_assignments.supervisor_note),
    assignment_type = excluded.assignment_type,
    status = excluded.status,
    payload = public.be_supervisor_job_assignments.payload || excluded.payload,
    updated_at = now();

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute 'update public.be_portal_pickup_requests set status = $2, updated_at = now() where pickup_id = $1'
      using v_pickup_id, v_status;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'job_id', v_job_id,
    'assignment_type', v_assignment_type,
    'job_type', v_assignment_type,
    'status', v_status,
    'synced_to_rider', true
  );
end;
$$;

create or replace function public.be_mobile_go_live_snapshot(
  p_workforce_code text default null,
  p_phone text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(nullif(trim(coalesce(p_workforce_code, '')), ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_codes text[] := array[]::text[];
  v_assigned jsonb := '[]'::jsonb;
  v_delivery jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if v_code is not null then
    v_codes := array_append(v_codes, v_code);
  end if;

  -- Resolve phone/email to Rider ID from master data, if available.
  if to_regclass('public.be_master_data_records') is not null then
    begin
      select coalesce(array_agg(distinct upper(record_key)), v_codes)
      into v_codes
      from (
        select unnest(v_codes) as record_key
        union all
        select record_key
        from public.be_master_data_records
        where entity_code = 'riders'
          and coalesce(is_active, true) = true
          and (
            upper(record_key) = any(v_codes)
            or (v_code is not null and lower(coalesce(row_data->>'email', row_data->>'email_address', row_data->>'login_email', '')) = lower(v_code))
            or (v_phone <> '' and regexp_replace(coalesce(row_data->>'phone_primary', row_data->>'phone', row_data->>'mobile', ''), '[^0-9+]', '', 'g') = v_phone)
          )
      ) s
      where record_key is not null;
    exception when others then
      null;
    end;
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_assigned
  from (
    select
      a.assignment_id::text,
      a.job_id,
      a.pickup_id,
      coalesce(p.merchant_name, a.payload->>'merchant_name', 'Merchant') as merchant_name,
      coalesce(p.pickup_address, a.payload->>'pickup_address', 'No pickup address') as pickup_address,
      coalesce(p.parcel_count, nullif(a.payload->>'parcel_count','')::integer, 0) as parcel_count,
      coalesce(p.cod_amount, nullif(a.payload->>'cod_amount','')::numeric, 0) as cod_amount,
      coalesce(p.assigned_branch, p.branch_code, a.payload->>'assigned_branch', 'YGN') as assigned_branch,
      a.rider_id,
      a.rider_name,
      a.driver_id,
      a.driver_name,
      a.helper_id,
      a.helper_name,
      a.fleet_id,
      a.fleet_label,
      a.supervisor_note,
      a.assignment_type,
      a.job_type,
      a.status,
      a.acknowledged_at,
      a.started_at,
      a.completed_at,
      coalesce(p.created_at, a.created_at) as created_at,
      a.updated_at
    from public.be_supervisor_job_assignments a
    left join public.be_portal_pickup_requests p on p.pickup_id = a.pickup_id
    where a.status not in ('cancelled', 'completed', 'delivery_completed')
      and (
        coalesce(array_length(v_codes, 1), 0) = 0
        or upper(coalesce(a.rider_id, '')) = any(v_codes)
        or upper(coalesce(a.payload->>'rider_id', '')) = any(v_codes)
      )
    order by a.updated_at desc nulls last, a.created_at desc nulls last
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc), '[]'::jsonb)
  into v_delivery
  from (
    select
      a.assignment_id::text,
      a.job_id,
      a.pickup_id,
      coalesce(p.merchant_name, a.payload->>'merchant_name', 'Merchant') as merchant_name,
      coalesce(p.pickup_address, a.payload->>'pickup_address', 'No pickup address') as pickup_address,
      coalesce(p.parcel_count, nullif(a.payload->>'parcel_count','')::integer, 0) as parcel_count,
      coalesce(p.cod_amount, nullif(a.payload->>'cod_amount','')::numeric, 0) as cod_amount,
      coalesce(p.assigned_branch, p.branch_code, a.payload->>'assigned_branch', 'YGN') as assigned_branch,
      a.rider_id,
      a.rider_name,
      a.driver_id,
      a.driver_name,
      a.helper_id,
      a.helper_name,
      a.fleet_id,
      a.fleet_label,
      a.supervisor_note,
      a.assignment_type,
      a.job_type,
      a.status,
      a.updated_at
    from public.be_supervisor_job_assignments a
    left join public.be_portal_pickup_requests p on p.pickup_id = a.pickup_id
    where a.status in ('delivery_resources_assigned', 'assigned', 'delivery_started', 'out_for_delivery')
      and (
        coalesce(array_length(v_codes, 1), 0) = 0
        or upper(coalesce(a.rider_id, '')) = any(v_codes)
        or upper(coalesce(a.payload->>'rider_id', '')) = any(v_codes)
      )
    order by a.updated_at desc nulls last
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(n)::jsonb order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from (
    select
      a.assignment_id::text as id,
      a.pickup_id,
      case
        when a.status = 'order_picking_assigned' then 'New Order Picking Assignment'
        when a.status = 'delivery_resources_assigned' then 'New Delivery Resource Assignment'
        when a.status = 'order_picking_acknowledged' then 'Order Picking Acknowledged'
        when a.status = 'picked_up_verified' then 'Pickup Verified'
        else 'Rider Job Update'
      end as title,
      'Pickup ' || a.pickup_id || ' is ' || replace(a.status, '_', ' ') || '.' as message,
      a.status,
      a.updated_at as created_at,
      true as unread
    from public.be_supervisor_job_assignments a
    where a.status not in ('cancelled', 'completed', 'delivery_completed')
      and (
        coalesce(array_length(v_codes, 1), 0) = 0
        or upper(coalesce(a.rider_id, '')) = any(v_codes)
        or upper(coalesce(a.payload->>'rider_id', '')) = any(v_codes)
      )
    order by a.updated_at desc nulls last
    limit v_limit
  ) n;

  return jsonb_build_object(
    'assigned_pickups', coalesce(v_assigned, '[]'::jsonb),
    'delivery_jobs', coalesce(v_delivery, '[]'::jsonb),
    'notifications', coalesce(v_notifications, '[]'::jsonb),
    'kpis', jsonb_build_object(
      'assigned_pickups', jsonb_array_length(coalesce(v_assigned, '[]'::jsonb)),
      'delivery_jobs', jsonb_array_length(coalesce(v_delivery, '[]'::jsonb)),
      'verified_by_picker', (
        select count(*)
        from public.be_supervisor_job_assignments a
        where a.status in ('picked_up_verified', 'order_picking_completed')
          and (
            coalesce(array_length(v_codes, 1), 0) = 0
            or upper(coalesce(a.rider_id, '')) = any(v_codes)
            or upper(coalesce(a.payload->>'rider_id', '')) = any(v_codes)
          )
      ),
      'cod_to_handle', (
        select coalesce(sum(coalesce(p.cod_amount, 0)), 0)
        from public.be_supervisor_job_assignments a
        left join public.be_portal_pickup_requests p on p.pickup_id = a.pickup_id
        where a.status not in ('cancelled', 'completed', 'delivery_completed')
          and (
            coalesce(array_length(v_codes, 1), 0) = 0
            or upper(coalesce(a.rider_id, '')) = any(v_codes)
            or upper(coalesce(a.payload->>'rider_id', '')) = any(v_codes)
          )
      )
    ),
    'identity', jsonb_build_object('requested_workforce_code', p_workforce_code, 'phone', p_phone, 'resolved_codes', coalesce(to_jsonb(v_codes), '[]'::jsonb)),
    'sync_source', 'be_supervisor_job_assignments',
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
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_action is null then raise exception 'action is required'; end if;

  v_status := case v_action
    when 'acknowledge' then 'order_picking_acknowledged'
    when 'start_order_picking' then 'order_picking_started'
    when 'start_pickup' then 'order_picking_started'
    when 'verify_pickup' then 'picked_up_verified'
    when 'complete_order_picking' then 'order_picking_completed'
    when 'start_delivery' then 'delivery_started'
    when 'complete_delivery' then 'delivery_completed'
    else v_action
  end;

  update public.be_supervisor_job_assignments
  set
    status = v_status,
    acknowledged_at = case when v_status in ('order_picking_acknowledged','order_picking_started','picked_up_verified','order_picking_completed') then coalesce(acknowledged_at, now()) else acknowledged_at end,
    started_at = case when v_status in ('order_picking_started','delivery_started') then coalesce(started_at, now()) else started_at end,
    completed_at = case when v_status in ('order_picking_completed','delivery_completed') then coalesce(completed_at, now()) else completed_at end,
    payload = coalesce(payload, '{}'::jsonb) || p_payload,
    updated_at = now()
  where pickup_id = v_pickup_id;

  if not found then raise exception 'No assignment found for pickup_id %', v_pickup_id; end if;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute 'update public.be_portal_pickup_requests set status = $2, updated_at = now() where pickup_id = $1'
      using v_pickup_id, v_status;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', v_status);
end;
$$;

alter table public.be_supervisor_job_assignments enable row level security;

drop policy if exists be_supervisor_job_assignments_select_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_insert_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_update_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_delete_auth on public.be_supervisor_job_assignments;

create policy be_supervisor_job_assignments_select_auth on public.be_supervisor_job_assignments for select to authenticated using (true);
create policy be_supervisor_job_assignments_insert_auth on public.be_supervisor_job_assignments for insert to authenticated with check (true);
create policy be_supervisor_job_assignments_update_auth on public.be_supervisor_job_assignments for update to authenticated using (true) with check (true);
create policy be_supervisor_job_assignments_delete_auth on public.be_supervisor_job_assignments for delete to authenticated using (true);

grant select, insert, update, delete on public.be_supervisor_job_assignments to authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to authenticated;
grant execute on function public.be_mobile_go_live_snapshot(text, text, integer) to anon, authenticated;
grant execute on function public.be_rider_update_job_status(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Test after assigning RID001:
-- select public.be_mobile_go_live_snapshot('RID001', null, 100);
