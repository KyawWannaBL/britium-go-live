
-- Britium Dispatch Command Unified Enterprise Sync
-- Purpose:
--   Keep only ONE dispatch screen and make Dispatch / Dispatch Center / Live Dispatch /
--   Delivery Dispatch / Delivery Workflow / Ops dashboards read the same backend source.
--
-- Run once in Supabase SQL Editor, then deploy the TSX patch.

rollback;

begin;

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 1) Compatibility columns for canonical wayplan header
-- -------------------------------------------------------------------------
create table if not exists public.be_wayplans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_wayplans
  add column if not exists upload_code text,
  add column if not exists wayplan_code text,
  add column if not exists wayplan_no text,
  add column if not exists wayplan_id text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists route_code text,
  add column if not exists route_name text,
  add column if not exists branch_code text default 'YGN',
  add column if not exists vehicle_id text,
  add column if not exists vehicle_code text,
  add column if not exists vehicle_plate text,
  add column if not exists rider_email text,
  add column if not exists driver_email text,
  add column if not exists helper_email text,
  add column if not exists parcel_count integer default 0,
  add column if not exists total_parcels integer default 0,
  add column if not exists pickup_count integer default 0,
  add column if not exists total_waybills integer default 0,
  add column if not exists total_weight_kg numeric default 0,
  add column if not exists total_cod_amount numeric default 0,
  add column if not exists total_actual_collect numeric default 0,
  add column if not exists status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists delivery_status text,
  add column if not exists dispatch_date date default current_date,
  add column if not exists assigned_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists dispatched_by_email text,
  add column if not exists created_by_email text,
  add column if not exists updated_at timestamptz default now();

-- -------------------------------------------------------------------------
-- 2) Compatibility columns for canonical wayplan/jobs item table
-- -------------------------------------------------------------------------
create table if not exists public.be_wayplan_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_wayplan_items
  add column if not exists upload_code text,
  add column if not exists wayplan_code text,
  add column if not exists wayplan_no text,
  add column if not exists wayplan_id text,
  add column if not exists tracking_no text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists delivery_way_id text,
  add column if not exists parcel_sequence integer,
  add column if not exists item_no integer,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists phone_number text,
  add column if not exists recipient_phone_2 text,
  add column if not exists recipient_address text,
  add column if not exists delivery_township text,
  add column if not exists destination_city text,
  add column if not exists remarks text,
  add column if not exists remark text,
  add column if not exists special_instruction text,
  add column if not exists special_instructions text,
  add column if not exists weight_kg numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_charges numeric default 0,
  add column if not exists total_collected_amount numeric default 0,
  add column if not exists warehouse_status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists delivery_status text,
  add column if not exists proof_photo_url text,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists driver_note text,
  add column if not exists status text,
  add column if not exists updated_at timestamptz default now();

-- -------------------------------------------------------------------------
-- 3) Canonical operational views
-- -------------------------------------------------------------------------
-- Drop dependent views first to avoid 2BP01 dependency errors.
drop view if exists public.be_v_rider_dispatch_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_wayplans cascade;

create or replace view public.be_v_enterprise_dispatch_wayplans as
select
  coalesce(nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, '')) as wayplan_code,
  coalesce(nullif(w.wayplan_no, ''), nullif(w.wayplan_code, ''), nullif(w.wayplan_id, '')) as wayplan_no,
  coalesce(nullif(w.wayplan_id, ''), nullif(w.wayplan_code, ''), nullif(w.wayplan_no, '')) as wayplan_id,
  w.upload_code,
  w.waybill_no,
  w.pickup_id,
  w.merchant_code,
  w.merchant_name,
  coalesce(nullif(w.route_code, ''), 'YGN-R1') as route_code,
  coalesce(nullif(w.route_name, ''), 'YGN Route 1') as route_name,
  coalesce(nullif(w.branch_code, ''), 'YGN') as branch_code,
  w.vehicle_id,
  w.vehicle_code,
  w.vehicle_plate,
  w.rider_email,
  w.driver_email,
  w.helper_email,
  coalesce(w.parcel_count, w.total_parcels, 0) as parcel_count,
  coalesce(w.total_parcels, w.parcel_count, 0) as total_parcels,
  coalesce(w.total_weight_kg, 0) as total_weight_kg,
  coalesce(w.total_cod_amount, 0) as total_cod_amount,
  coalesce(w.total_actual_collect, 0) as total_actual_collect,
  coalesce(nullif(w.status, ''), lower(coalesce(nullif(w.wayplan_status, ''), 'assigned'))) as status,
  coalesce(nullif(w.wayplan_status, ''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(w.dispatch_status, ''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(w.delivery_status, ''), 'PENDING') as delivery_status,
  coalesce(w.dispatch_date, current_date) as dispatch_date,
  w.assigned_at,
  w.dispatched_at,
  w.completed_at,
  w.dispatched_by_email,
  w.created_by_email,
  coalesce(w.updated_at, w.created_at, now()) as updated_at
from public.be_wayplans w
where coalesce(nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, '')) is not null;

create or replace view public.be_v_enterprise_dispatch_jobs as
select
  coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, ''), wp.wayplan_code) as wayplan_code,
  coalesce(nullif(i.wayplan_no, ''), nullif(i.wayplan_code, ''), nullif(i.wayplan_id, ''), wp.wayplan_no) as wayplan_no,
  coalesce(nullif(i.wayplan_id, ''), nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), wp.wayplan_id) as wayplan_id,
  coalesce(nullif(i.tracking_no, ''), nullif(i.delivery_way_id, ''), concat_ws('-', i.waybill_no, lpad(coalesce(i.parcel_sequence, i.item_no, 0)::text, 3, '0'))) as tracking_no,
  i.waybill_no,
  i.pickup_id,
  i.delivery_way_id,
  coalesce(i.parcel_sequence, i.item_no, 0) as parcel_sequence,
  coalesce(i.item_no, i.parcel_sequence, 0) as item_no,
  i.recipient_name,
  coalesce(nullif(i.phone_number, ''), nullif(i.recipient_phone, ''), nullif(i.recipient_phone_2, '')) as phone_number,
  i.recipient_phone,
  i.recipient_phone_2,
  i.recipient_address,
  i.delivery_township,
  i.destination_city,
  coalesce(nullif(i.remarks, ''), nullif(i.remark, ''), nullif(i.special_instruction, ''), nullif(i.special_instructions, '')) as remarks,
  coalesce(i.weight_kg, 0) as weight_kg,
  coalesce(i.cod_amount, 0) as cod_amount,
  coalesce(i.delivery_charges, 0) as delivery_charges,
  coalesce(i.total_collected_amount, coalesce(i.cod_amount, 0) + coalesce(i.delivery_charges, 0)) as total_collected_amount,
  coalesce(nullif(i.warehouse_status, ''), 'RECEIVED') as warehouse_status,
  coalesce(nullif(i.wayplan_status, ''), wp.wayplan_status, 'ASSIGNED') as wayplan_status,
  coalesce(nullif(i.dispatch_status, ''), wp.dispatch_status, 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(i.delivery_status, ''), 'PENDING') as delivery_status,
  coalesce(nullif(i.status, ''), 'assigned') as status,
  i.proof_photo_url,
  i.delivered_at,
  i.failed_at,
  i.driver_note,
  wp.route_code,
  wp.route_name,
  wp.vehicle_id,
  wp.vehicle_code,
  wp.vehicle_plate,
  wp.rider_email,
  wp.driver_email,
  wp.helper_email,
  coalesce(i.updated_at, i.created_at, now()) as updated_at
from public.be_wayplan_items i
left join public.be_v_enterprise_dispatch_wayplans wp
  on wp.wayplan_code = coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, ''));

create or replace view public.be_v_rider_dispatch_jobs as
select *
from public.be_v_enterprise_dispatch_jobs
where dispatch_status in ('OUT_FOR_DELIVERY', 'READY_FOR_DISPATCH')
  and delivery_status in ('PENDING', 'OUT_FOR_DELIVERY', 'ATTEMPTED_FAILED');

-- -------------------------------------------------------------------------
-- 4) Unified snapshot consumed by ALL dispatch/ops screens
-- -------------------------------------------------------------------------
create or replace function public.be_enterprise_dispatch_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with w as (
    select * from public.be_v_enterprise_dispatch_wayplans
  ),
  j as (
    select * from public.be_v_enterprise_dispatch_jobs
  )
  select jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'wayplans', (select count(*) from w),
      'ready_for_dispatch', (select count(*) from w where dispatch_status = 'READY_FOR_DISPATCH'),
      'out_for_delivery', (select count(*) from w where dispatch_status = 'OUT_FOR_DELIVERY'),
      'delivered_wayplans', (select count(*) from w where dispatch_status in ('DELIVERED','COMPLETED')),
      'jobs', (select count(*) from j),
      'pending_jobs', (select count(*) from j where delivery_status in ('PENDING','OUT_FOR_DELIVERY')),
      'delivered_jobs', (select count(*) from j where delivery_status in ('DELIVERED','COMPLETED')),
      'failed_jobs', (select count(*) from j where delivery_status in ('FAILED','DELIVERY_FAILED','ATTEMPTED_FAILED')),
      'cod_total', coalesce((select sum(total_collected_amount) from j), 0)
    ),
    'wayplans', coalesce((select jsonb_agg(to_jsonb(w) order by updated_at desc) from w), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by wayplan_code, parcel_sequence) from j), '[]'::jsonb)
  );
$$;

-- Compatibility aliases so old pages/RPC calls can still use same source
create or replace function public.be_dispatch_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_dispatch_center_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_live_dispatch_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_delivery_dispatch_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_delivery_workflow_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_ops_command_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_ops_manager_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;
create or replace function public.be_executive_ops_snapshot() returns jsonb language sql security definer set search_path = public as $$ select public.be_enterprise_dispatch_snapshot(); $$;

-- -------------------------------------------------------------------------
-- 5) Publish a wayplan to field/rider app
-- -------------------------------------------------------------------------
create or replace function public.be_publish_wayplan_to_dispatch(
  p_wayplan_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_wayplan_code, ''));
  v_jobs integer := 0;
begin
  if v_code = '' then
    raise exception 'wayplan_code is required';
  end if;

  update public.be_wayplans
  set
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = 'OUT_FOR_DELIVERY',
    status = 'out_for_delivery',
    dispatched_at = now(),
    dispatched_by_email = coalesce(p_actor_email, dispatched_by_email),
    updated_at = now()
  where coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, '')) = v_code;

  update public.be_wayplan_items
  set
    dispatch_status = 'OUT_FOR_DELIVERY',
    delivery_status = case
      when delivery_status in ('DELIVERED','COMPLETED') then delivery_status
      else 'OUT_FOR_DELIVERY'
    end,
    status = case
      when status in ('delivered','completed') then status
      else 'out_for_delivery'
    end,
    updated_at = now()
  where coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, '')) = v_code;

  get diagnostics v_jobs = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', v_code,
    'published_jobs', v_jobs,
    'dispatch_status', 'OUT_FOR_DELIVERY'
  );
end;
$$;

-- -------------------------------------------------------------------------
-- 6) Rider/driver app status update API
-- -------------------------------------------------------------------------
create or replace function public.be_driver_update_delivery_status(
  p_tracking_no text,
  p_status text,
  p_actor_email text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no, ''));
  v_action text := upper(trim(coalesce(p_status, '')));
  v_delivery_status text;
  v_item_wayplan text;
  v_updated integer := 0;
begin
  if v_tracking = '' then
    raise exception 'tracking_no is required';
  end if;

  if v_action in ('DONE','DELIVERED','COMPLETE','COMPLETED') then
    v_delivery_status := 'DELIVERED';
  elsif v_action in ('FAIL','FAILED','DELIVERY_FAILED','ATTEMPTED_FAILED') then
    v_delivery_status := 'DELIVERY_FAILED';
  else
    v_delivery_status := v_action;
  end if;

  update public.be_wayplan_items
  set
    delivery_status = v_delivery_status,
    dispatch_status = case when v_delivery_status = 'DELIVERED' then 'DELIVERED' else dispatch_status end,
    status = lower(v_delivery_status),
    delivered_at = case when v_delivery_status = 'DELIVERED' then now() else delivered_at end,
    failed_at = case when v_delivery_status = 'DELIVERY_FAILED' then now() else failed_at end,
    driver_note = coalesce(nullif(p_note, ''), driver_note),
    updated_at = now()
  where coalesce(nullif(tracking_no, ''), nullif(delivery_way_id, '')) = v_tracking
  returning coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, ''))
  into v_item_wayplan;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'reason', 'TRACKING_NOT_FOUND', 'tracking_no', v_tracking);
  end if;

  -- If all jobs in that wayplan are delivered, close header. Otherwise keep it out for delivery.
  update public.be_wayplans w
  set
    dispatch_status = case
      when not exists (
        select 1
        from public.be_wayplan_items i
        where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_item_wayplan
          and coalesce(i.delivery_status, 'PENDING') not in ('DELIVERED','COMPLETED')
      ) then 'DELIVERED'
      else 'OUT_FOR_DELIVERY'
    end,
    delivery_status = case
      when not exists (
        select 1
        from public.be_wayplan_items i
        where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_item_wayplan
          and coalesce(i.delivery_status, 'PENDING') not in ('DELIVERED','COMPLETED')
      ) then 'DELIVERED'
      else 'OUT_FOR_DELIVERY'
    end,
    completed_at = case
      when not exists (
        select 1
        from public.be_wayplan_items i
        where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_item_wayplan
          and coalesce(i.delivery_status, 'PENDING') not in ('DELIVERED','COMPLETED')
      ) then now()
      else completed_at
    end,
    updated_at = now()
  where coalesce(nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, '')) = v_item_wayplan;

  return jsonb_build_object(
    'ok', true,
    'tracking_no', v_tracking,
    'wayplan_code', v_item_wayplan,
    'delivery_status', v_delivery_status,
    'updated_by', p_actor_email
  );
end;
$$;

grant execute on function public.be_enterprise_dispatch_snapshot() to authenticated;
grant execute on function public.be_dispatch_snapshot() to authenticated;
grant execute on function public.be_dispatch_center_snapshot() to authenticated;
grant execute on function public.be_live_dispatch_snapshot() to authenticated;
grant execute on function public.be_delivery_dispatch_snapshot() to authenticated;
grant execute on function public.be_delivery_workflow_snapshot() to authenticated;
grant execute on function public.be_ops_command_snapshot() to authenticated;
grant execute on function public.be_ops_manager_snapshot() to authenticated;
grant execute on function public.be_executive_ops_snapshot() to authenticated;
grant execute on function public.be_publish_wayplan_to_dispatch(text, text) to authenticated;
grant execute on function public.be_driver_update_delivery_status(text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';


begin;


-- -------------------------------------------------------------------------
-- 7) Optional utility used by the unified board for future drag/drop reassignment
-- -------------------------------------------------------------------------
create or replace function public.be_assign_dispatch_job_to_wayplan(
  p_tracking_no text,
  p_wayplan_code text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text := trim(coalesce(p_tracking_no, ''));
  v_wayplan text := trim(coalesce(p_wayplan_code, ''));
  v_updated integer := 0;
begin
  if v_tracking = '' then
    raise exception 'tracking_no is required';
  end if;
  if v_wayplan = '' then
    raise exception 'wayplan_code is required';
  end if;

  update public.be_wayplan_items i
  set
    wayplan_code = v_wayplan,
    wayplan_no = v_wayplan,
    wayplan_id = v_wayplan,
    dispatch_status = coalesce(nullif(i.dispatch_status, ''), 'READY_FOR_DISPATCH'),
    delivery_status = coalesce(nullif(i.delivery_status, ''), 'PENDING'),
    status = coalesce(nullif(i.status, ''), 'assigned'),
    updated_at = now()
  where coalesce(nullif(i.tracking_no, ''), nullif(i.delivery_way_id, '')) = v_tracking;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'ok', v_updated > 0,
    'tracking_no', v_tracking,
    'wayplan_code', v_wayplan,
    'updated', v_updated,
    'actor_email', p_actor_email
  );
end;
$$;

grant execute on function public.be_assign_dispatch_job_to_wayplan(text,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
