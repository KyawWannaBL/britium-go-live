-- supervisor_to_rider_driver_wireup.sql
-- Purpose:
-- 1) CS pickup requests appear in Supervisor queue with unread notification.
-- 2) Supervisor assignment writes assigned rider/driver/helper EMAIL + CODE.
-- 3) Rider/Driver/Helper apps can read assigned jobs from be_v_mobile_workforce_jobs / be_v_rider_jobs.
-- 4) Assignment creates mobile notifications.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------
-- Notification table safety
-- -----------------------------------------------------
create table if not exists public.be_app_notifications (
  notification_id uuid primary key default gen_random_uuid()
);

alter table public.be_app_notifications
  add column if not exists recipient_role text,
  add column if not exists recipient_email text,
  add column if not exists notification_type text,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists pickup_id text,
  add column if not exists waybill_no text,
  add column if not exists is_read boolean default false,
  add column if not exists priority text default 'NORMAL',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists read_at timestamptz;

create unique index if not exists ux_be_app_notifications_role_email_type_pickup
on public.be_app_notifications (
  coalesce(recipient_role, ''),
  coalesce(recipient_email, ''),
  coalesce(notification_type, ''),
  coalesce(pickup_id, '')
)
where pickup_id is not null;

-- -----------------------------------------------------
-- Pickup/workforce table safety
-- -----------------------------------------------------
alter table public.be_portal_pickup_requests
  add column if not exists workflow_stage text default 'PICKUP_REQUESTED',
  add column if not exists pickup_status text default 'PICKUP_REQUESTED',
  add column if not exists supervisor_status text default 'PENDING_ASSIGNMENT',
  add column if not exists rider_status text default 'NOT_ASSIGNED',
  add column if not exists data_entry_status text default 'WAITING_PICKUP',
  add column if not exists warehouse_status text default 'WAITING_DATA_ENTRY',
  add column if not exists wayplan_status text default 'WAITING_WAREHOUSE',
  add column if not exists dispatch_status text default 'WAITING_WAYPLAN',
  add column if not exists finance_status text default 'NOT_READY',
  add column if not exists assigned_rider_email text,
  add column if not exists assigned_driver_email text,
  add column if not exists assigned_helper_email text,
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_vehicle_id text,
  add column if not exists assigned_fleet_id text,
  add column if not exists assigned_by_email text,
  add column if not exists assigned_at timestamptz,
  add column if not exists supervisor_note text,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_mobile_workforce_accounts (
  id uuid primary key default gen_random_uuid()
);

alter table public.be_mobile_workforce_accounts
  add column if not exists auth_user_id uuid,
  add column if not exists email text,
  add column if not exists workforce_code text,
  add column if not exists name text,
  add column if not exists full_name text,
  add column if not exists role text,
  add column if not exists status text default 'Active',
  add column if not exists branch_code text default 'YGN',
  add column if not exists assigned_zone text,
  add column if not exists phone_primary text,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

-- -----------------------------------------------------
-- Normalize existing pending pickups and backfill Supervisor notification
-- -----------------------------------------------------
update public.be_portal_pickup_requests
set
  pickup_status = 'PICKUP_REQUESTED',
  workflow_stage = 'PICKUP_REQUESTED',
  supervisor_status = 'PENDING_ASSIGNMENT',
  rider_status = coalesce(nullif(rider_status, ''), 'NOT_ASSIGNED'),
  data_entry_status = coalesce(nullif(data_entry_status, ''), 'WAITING_PICKUP'),
  warehouse_status = coalesce(nullif(warehouse_status, ''), 'WAITING_DATA_ENTRY'),
  wayplan_status = coalesce(nullif(wayplan_status, ''), 'WAITING_WAREHOUSE'),
  dispatch_status = coalesce(nullif(dispatch_status, ''), 'WAITING_WAYPLAN'),
  finance_status = coalesce(nullif(finance_status, ''), 'NOT_READY'),
  updated_at = now()
where pickup_id is not null
  and assigned_rider_email is null
  and assigned_rider_code is null
  and coalesce(pickup_status, '') in ('', 'Draft', 'DRAFT', 'Pending', 'PENDING', 'Submitted', 'SUBMITTED', 'REQUESTED', 'PICKUP_REQUESTED');

insert into public.be_app_notifications (
  recipient_role,
  recipient_email,
  notification_type,
  title,
  message,
  entity_type,
  entity_id,
  pickup_id,
  priority,
  is_read,
  payload,
  created_at
)
select
  'supervisor',
  null,
  'PICKUP_REQUESTED',
  'New pickup request',
  'New pickup request received: ' || p.pickup_id,
  'pickup',
  p.pickup_id,
  p.pickup_id,
  'HIGH',
  false,
  jsonb_build_object(
    'pickup_id', p.pickup_id,
    'merchant_code', p.merchant_code,
    'merchant_name', p.merchant_name,
    'pickup_status', p.pickup_status,
    'workflow_stage', p.workflow_stage,
    'supervisor_status', p.supervisor_status
  ),
  now()
from public.be_portal_pickup_requests p
where p.pickup_id is not null
  and p.supervisor_status = 'PENDING_ASSIGNMENT'
  and p.pickup_status = 'PICKUP_REQUESTED'
on conflict do nothing;

update public.be_app_notifications n
set is_read = false, read_at = null
from public.be_portal_pickup_requests p
where n.pickup_id = p.pickup_id
  and n.recipient_role = 'supervisor'
  and n.notification_type = 'PICKUP_REQUESTED'
  and p.supervisor_status = 'PENDING_ASSIGNMENT'
  and p.pickup_status = 'PICKUP_REQUESTED';

-- -----------------------------------------------------
-- Helper: resolve workforce identifier from either email or code
-- -----------------------------------------------------
create or replace function public.be_resolve_workforce_identifier(
  p_identifier text,
  p_role text
)
returns table (
  resolved_email text,
  resolved_code text,
  resolved_name text,
  resolved_role text
)
language sql
stable
as $$
  select
    nullif(email, '') as resolved_email,
    nullif(workforce_code, '') as resolved_code,
    coalesce(nullif(full_name, ''), nullif(name, ''), nullif(email, ''), nullif(workforce_code, '')) as resolved_name,
    upper(coalesce(role, p_role)) as resolved_role
  from public.be_mobile_workforce_accounts
  where p_identifier is not null
    and coalesce(is_active, true) = true
    and upper(coalesce(role, p_role)) = upper(p_role)
    and (
      lower(coalesce(email, '')) = lower(p_identifier)
      or lower(coalesce(workforce_code, '')) = lower(p_identifier)
      or lower(coalesce(full_name, '')) = lower(p_identifier)
      or lower(coalesce(name, '')) = lower(p_identifier)
    )
  order by
    case when lower(coalesce(email, '')) = lower(p_identifier) then 0 else 1 end,
    case when lower(coalesce(workforce_code, '')) = lower(p_identifier) then 0 else 1 end
  limit 1;
$$;

-- -----------------------------------------------------
-- Replace Supervisor assignment RPC with email/code safe version
-- -----------------------------------------------------
drop function if exists public.be_supervisor_assign_pickup(text,text,text,text,text,text);
drop function if exists public.be_supervisor_assign_pickup(text,text,text,text,text);
drop function if exists public.be_supervisor_assign_pickup(text,text,text,text,text,text,text);

create or replace function public.be_supervisor_assign_pickup(
  p_pickup_id text,
  p_rider_email text,
  p_driver_email text default null,
  p_helper_email text default null,
  p_vehicle_id text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_rider_email text;
  v_driver_email text;
  v_helper_email text;
  v_rider_code text;
  v_driver_code text;
  v_helper_code text;
  v_rider_name text;
  v_driver_name text;
  v_helper_name text;
begin
  select pickup_status
  into v_old_status
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
  limit 1;

  if v_old_status is null then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  select resolved_email, resolved_code, resolved_name
  into v_rider_email, v_rider_code, v_rider_name
  from public.be_resolve_workforce_identifier(p_rider_email, 'RIDER');

  if v_rider_email is null and v_rider_code is null then
    raise exception 'Active Rider not found by email/code: %', p_rider_email;
  end if;

  if p_driver_email is not null and btrim(p_driver_email) <> '' then
    select resolved_email, resolved_code, resolved_name
    into v_driver_email, v_driver_code, v_driver_name
    from public.be_resolve_workforce_identifier(p_driver_email, 'DRIVER');
  end if;

  if p_helper_email is not null and btrim(p_helper_email) <> '' then
    select resolved_email, resolved_code, resolved_name
    into v_helper_email, v_helper_code, v_helper_name
    from public.be_resolve_workforce_identifier(p_helper_email, 'HELPER');
  end if;

  update public.be_portal_pickup_requests
  set
    workflow_stage = 'RIDER_ASSIGNED',
    pickup_status = 'RIDER_ASSIGNED',
    supervisor_status = 'ASSIGNED',
    rider_status = 'ASSIGNED',
    data_entry_status = 'WAITING_PICKUP',
    warehouse_status = 'WAITING_DATA_ENTRY',
    wayplan_status = 'WAITING_WAREHOUSE',
    dispatch_status = 'WAITING_WAYPLAN',
    assigned_rider_email = v_rider_email,
    assigned_driver_email = v_driver_email,
    assigned_helper_email = v_helper_email,
    assigned_rider_code = coalesce(v_rider_code, p_rider_email),
    assigned_driver_code = v_driver_code,
    assigned_helper_code = v_helper_code,
    assigned_vehicle_id = p_vehicle_id,
    assigned_fleet_id = p_vehicle_id,
    assigned_by_email = p_actor_email,
    assigned_at = now(),
    supervisor_note = nullif(coalesce(supervisor_note, ''), ''),
    last_event_at = now(),
    last_event_by = p_actor_email,
    last_event_note = 'Supervisor assigned pickup workforce',
    updated_at = now()
  where pickup_id = p_pickup_id;

  update public.be_app_notifications
  set is_read = true, read_at = now()
  where pickup_id = p_pickup_id
    and recipient_role = 'supervisor'
    and notification_type = 'PICKUP_REQUESTED';

  insert into public.be_app_notifications (
    recipient_role,
    recipient_email,
    notification_type,
    title,
    message,
    entity_type,
    entity_id,
    pickup_id,
    priority,
    is_read,
    payload,
    created_at
  )
  values
    (
      'rider',
      v_rider_email,
      'PICKUP_ASSIGNED',
      'Pickup assigned',
      'Pickup assigned to rider: ' || p_pickup_id,
      'pickup',
      p_pickup_id,
      p_pickup_id,
      'HIGH',
      false,
      jsonb_build_object('pickup_id', p_pickup_id, 'role', 'RIDER', 'workforce_code', v_rider_code, 'workforce_name', v_rider_name),
      now()
    ),
    (
      'driver',
      v_driver_email,
      'PICKUP_ASSIGNED',
      'Pickup assigned',
      'Pickup assigned to driver: ' || p_pickup_id,
      'pickup',
      p_pickup_id,
      p_pickup_id,
      'HIGH',
      false,
      jsonb_build_object('pickup_id', p_pickup_id, 'role', 'DRIVER', 'workforce_code', v_driver_code, 'workforce_name', v_driver_name),
      now()
    ),
    (
      'helper',
      v_helper_email,
      'PICKUP_ASSIGNED',
      'Pickup assigned',
      'Pickup assigned to helper: ' || p_pickup_id,
      'pickup',
      p_pickup_id,
      p_pickup_id,
      'NORMAL',
      false,
      jsonb_build_object('pickup_id', p_pickup_id, 'role', 'HELPER', 'workforce_code', v_helper_code, 'workforce_name', v_helper_name),
      now()
    )
  on conflict do nothing;

  delete from public.be_app_notifications
  where pickup_id = p_pickup_id
    and notification_type = 'PICKUP_ASSIGNED'
    and (
      (recipient_role = 'driver' and recipient_email is null)
      or (recipient_role = 'helper' and recipient_email is null)
    );

  perform public.be_log_operational_event(
    'pickup',
    p_pickup_id,
    p_pickup_id,
    null,
    null,
    v_old_status,
    'RIDER_ASSIGNED',
    p_actor_email,
    'supervisor',
    'Supervisor assigned rider/driver/helper',
    jsonb_build_object(
      'rider_email', v_rider_email,
      'rider_code', v_rider_code,
      'driver_email', v_driver_email,
      'driver_code', v_driver_code,
      'helper_email', v_helper_email,
      'helper_code', v_helper_code,
      'vehicle_id', p_vehicle_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'status', 'RIDER_ASSIGNED',
    'assigned_rider_email', v_rider_email,
    'assigned_driver_email', v_driver_email,
    'assigned_helper_email', v_helper_email,
    'assigned_rider_code', v_rider_code,
    'assigned_driver_code', v_driver_code,
    'assigned_helper_code', v_helper_code,
    'assigned_vehicle_id', p_vehicle_id
  );
end;
$$;

grant execute on function public.be_supervisor_assign_pickup(text,text,text,text,text,text) to authenticated;

-- -----------------------------------------------------
-- Queue views
-- -----------------------------------------------------
create or replace view public.be_v_supervisor_pickup_queue as
select
  p.*,
  exists (
    select 1
    from public.be_app_notifications n
    where n.pickup_id = p.pickup_id
      and n.recipient_role = 'supervisor'
      and n.notification_type = 'PICKUP_REQUESTED'
      and n.is_read = false
  ) as has_unread_notification
from public.be_portal_pickup_requests p
where coalesce(p.pickup_status, '') not in ('CANCELLED', 'CLOSED')
  and (
    coalesce(p.supervisor_status, '') in ('PENDING_ASSIGNMENT', 'ASSIGNED')
    or coalesce(p.workflow_stage, '') in ('PICKUP_REQUESTED', 'RIDER_ASSIGNED', 'PICKUP_COLLECTED')
    or coalesce(p.pickup_status, '') in ('Draft', 'DRAFT', 'PICKUP_REQUESTED', 'RIDER_ASSIGNED', 'PICKUP_COLLECTED')
  )
order by p.created_at desc;

create or replace view public.be_v_supervisor_notifications as
select *
from public.be_app_notifications
where recipient_role = 'supervisor'
order by created_at desc;

create or replace view public.be_v_mobile_workforce_jobs as
select
  p.*,
  'RIDER'::text as workforce_role,
  p.assigned_rider_email as workforce_email,
  p.assigned_rider_code as workforce_code,
  p.rider_status as workforce_job_status
from public.be_portal_pickup_requests p
where p.assigned_rider_email is not null
  and coalesce(p.pickup_status, '') not in ('CANCELLED', 'CLOSED')

union all

select
  p.*,
  'DRIVER'::text as workforce_role,
  p.assigned_driver_email as workforce_email,
  p.assigned_driver_code as workforce_code,
  p.rider_status as workforce_job_status
from public.be_portal_pickup_requests p
where p.assigned_driver_email is not null
  and coalesce(p.pickup_status, '') not in ('CANCELLED', 'CLOSED')

union all

select
  p.*,
  'HELPER'::text as workforce_role,
  p.assigned_helper_email as workforce_email,
  p.assigned_helper_code as workforce_code,
  p.rider_status as workforce_job_status
from public.be_portal_pickup_requests p
where p.assigned_helper_email is not null
  and coalesce(p.pickup_status, '') not in ('CANCELLED', 'CLOSED');

create or replace view public.be_v_rider_jobs as
select *
from public.be_v_mobile_workforce_jobs
where workforce_role = 'RIDER'
order by assigned_at desc nulls last, created_at desc;

create or replace view public.be_v_driver_jobs as
select *
from public.be_v_mobile_workforce_jobs
where workforce_role = 'DRIVER'
order by assigned_at desc nulls last, created_at desc;

create or replace view public.be_v_helper_jobs as
select *
from public.be_v_mobile_workforce_jobs
where workforce_role = 'HELPER'
order by assigned_at desc nulls last, created_at desc;

grant select on public.be_v_supervisor_pickup_queue to authenticated;
grant select on public.be_v_supervisor_notifications to authenticated;
grant select on public.be_v_mobile_workforce_jobs to authenticated;
grant select on public.be_v_rider_jobs to authenticated;
grant select on public.be_v_driver_jobs to authenticated;
grant select on public.be_v_helper_jobs to authenticated;
grant select, insert, update on public.be_app_notifications to authenticated;

-- -----------------------------------------------------
-- Realtime
-- -----------------------------------------------------
alter table public.be_portal_pickup_requests replica identity full;
alter table public.be_app_notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'be_portal_pickup_requests'
    ) then
      execute 'alter publication supabase_realtime add table public.be_portal_pickup_requests';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'be_app_notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.be_app_notifications';
    end if;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
