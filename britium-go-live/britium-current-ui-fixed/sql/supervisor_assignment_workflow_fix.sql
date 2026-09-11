-- Supervisor assignment workflow fix.
-- Order Picking requires Rider only.
-- Delivery assignment requires Driver + Helper + Fleet.
-- Full job requires all resources.
-- Existing values are preserved when a partial assignment is saved.

create extension if not exists pgcrypto;

create table if not exists public.be_supervisor_job_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  rider_id text,
  rider_name text,
  driver_id text,
  driver_name text,
  helper_id text,
  helper_name text,
  fleet_id text,
  fleet_label text,
  supervisor_note text,
  assignment_type text default 'both',
  status text default 'assigned',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists be_supervisor_job_assignments_pickup_uidx
on public.be_supervisor_job_assignments (pickup_id);

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
  v_assignment_type text := coalesce(nullif(trim(p_payload->>'assignment_type'), ''), 'both');
  v_status text;
begin
  if v_pickup_id is null then
    raise exception 'pickup_id is required';
  end if;

  if v_assignment_type = 'order_picking' and nullif(trim(coalesce(p_payload->>'rider_id', '')), '') is null then
    raise exception 'rider_id is required for order picking assignment';
  end if;

  if v_assignment_type = 'delivery'
     and (
       nullif(trim(coalesce(p_payload->>'driver_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'helper_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'fleet_id', '')), '') is null
     )
  then
    raise exception 'driver_id, helper_id and fleet_id are required for delivery assignment';
  end if;

  if v_assignment_type = 'both'
     and (
       nullif(trim(coalesce(p_payload->>'rider_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'driver_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'helper_id', '')), '') is null
       or nullif(trim(coalesce(p_payload->>'fleet_id', '')), '') is null
     )
  then
    raise exception 'rider_id, driver_id, helper_id and fleet_id are required for full assignment';
  end if;

  v_status := case
    when v_assignment_type = 'order_picking' then 'order_picking_assigned'
    when v_assignment_type = 'delivery' then 'delivery_resources_assigned'
    else 'assigned'
  end;

  insert into public.be_supervisor_job_assignments (
    pickup_id,
    rider_id,
    rider_name,
    driver_id,
    driver_name,
    helper_id,
    helper_name,
    fleet_id,
    fleet_label,
    supervisor_note,
    assignment_type,
    status,
    payload,
    updated_at
  )
  values (
    v_pickup_id,
    nullif(p_payload->>'rider_id', ''),
    nullif(p_payload->>'rider_name', ''),
    nullif(p_payload->>'driver_id', ''),
    nullif(p_payload->>'driver_name', ''),
    nullif(p_payload->>'helper_id', ''),
    nullif(p_payload->>'helper_name', ''),
    nullif(p_payload->>'fleet_id', ''),
    nullif(p_payload->>'fleet_label', ''),
    nullif(p_payload->>'supervisor_note', ''),
    v_assignment_type,
    v_status,
    p_payload,
    now()
  )
  on conflict (pickup_id) do update set
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

  -- Sync pickup request status if the table is available.
  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute 'update public.be_portal_pickup_requests set status = $2, updated_at = now() where pickup_id = $1'
      using v_pickup_id, v_status;
    exception when others then
      null;
    end;
  end if;

  -- Optional app notification if table exists and has flexible columns.
  if to_regclass('public.be_app_notifications') is not null then
    begin
      insert into public.be_app_notifications (title, message, status, payload, created_at)
      values (
        'Supervisor Assignment',
        'Pickup ' || v_pickup_id || ' updated: ' || v_status,
        'unread',
        p_payload,
        now()
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'assignment_type', v_assignment_type,
    'status', v_status
  );
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

notify pgrst, 'reload schema';

-- Test after selecting real ids:
-- select public.be_supervisor_assign_job('{
--   "pickup_id":"P0521-APA-001",
--   "assignment_type":"order_picking",
--   "rider_id":"RID001",
--   "rider_name":"Ko Kyaw Zin Khant"
-- }'::jsonb);
