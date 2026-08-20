
-- Britium Ops - Unified Operational Workflow Sync
-- Purpose: make Dispatch, Dispatch Center, Live Dispatch, Delivery Dispatch,
-- Ops Command, Ops Manager, and Executive Ops read the same canonical backend state.

rollback;

begin;

create extension if not exists pgcrypto;

-- Compatibility columns used by the unified views/RPCs.
alter table if exists public.be_wayplans
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
  add column if not exists branch_code text,
  add column if not exists driver_email text,
  add column if not exists helper_email text,
  add column if not exists rider_email text,
  add column if not exists vehicle_id text,
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
  add column if not exists assigned_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.be_wayplan_batches
  add column if not exists upload_code text,
  add column if not exists wayplan_code text,
  add column if not exists wayplan_no text,
  add column if not exists wayplan_id text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists parcel_count integer default 0,
  add column if not exists status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.be_wayplan_items
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
  add column if not exists recipient_phone_2 text,
  add column if not exists recipient_address text,
  add column if not exists delivery_township text,
  add column if not exists destination_city text,
  add column if not exists remark text,
  add column if not exists remarks text,
  add column if not exists special_instruction text,
  add column if not exists weight_kg numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_charges numeric default 0,
  add column if not exists total_collected_amount numeric default 0,
  add column if not exists warehouse_status text,
  add column if not exists wayplan_status text,
  add column if not exists dispatch_status text,
  add column if not exists delivery_status text,
  add column if not exists status text,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.be_large_shipment_rows
  add column if not exists upload_code text,
  add column if not exists source_file text,
  add column if not exists tracking_no text,
  add column if not exists waybill_no text,
  add column if not exists pickup_id text,
  add column if not exists delivery_way_id text,
  add column if not exists item_no integer,
  add column if not exists parcel_sequence integer,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_address text,
  add column if not exists delivery_township text,
  add column if not exists remark text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists status text,
  add column if not exists updated_at timestamptz default now();

-- Normalize legacy wayplan identifiers.
update public.be_wayplans
set
  wayplan_code = coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, '')),
  wayplan_no = coalesce(nullif(wayplan_no, ''), nullif(wayplan_code, ''), nullif(wayplan_id, '')),
  wayplan_id = coalesce(nullif(wayplan_id, ''), nullif(wayplan_code, ''), nullif(wayplan_no, '')),
  upload_code = coalesce(nullif(upload_code, ''), nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, '')),
  parcel_count = greatest(coalesce(parcel_count, 0), coalesce(total_parcels, 0)),
  total_parcels = greatest(coalesce(total_parcels, 0), coalesce(parcel_count, 0)),
  status = coalesce(nullif(status, ''), lower(coalesce(wayplan_status, 'assigned'))),
  wayplan_status = coalesce(nullif(wayplan_status, ''), 'ASSIGNED'),
  dispatch_status = coalesce(nullif(dispatch_status, ''), 'READY_FOR_DISPATCH'),
  updated_at = now()
where wayplan_code is null
   or wayplan_no is null
   or wayplan_id is null
   or upload_code is null
   or status is null
   or wayplan_status is null
   or dispatch_status is null;

-- Canonical operational wayplan header view.
drop view if exists public.be_v_operational_wayplans cascade;

create or replace view public.be_v_operational_wayplans as
with item_counts as (
  select
    coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, ''), upload_code) as wayplan_key,
    max(waybill_no) as item_waybill_no,
    max(pickup_id) as item_pickup_id,
    count(*)::integer as item_count,
    coalesce(sum(weight_kg), 0) as item_weight_kg,
    coalesce(sum(cod_amount), 0) as item_cod_amount,
    coalesce(sum(total_collected_amount), 0) as item_collect_amount
  from public.be_wayplan_items
  group by coalesce(nullif(wayplan_code, ''), nullif(wayplan_no, ''), nullif(wayplan_id, ''), upload_code)
)
select
  coalesce(nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, ''), nullif(w.upload_code, '')) as wayplan_code,
  coalesce(nullif(w.wayplan_no, ''), nullif(w.wayplan_code, ''), nullif(w.wayplan_id, ''), nullif(w.upload_code, '')) as wayplan_no,
  coalesce(nullif(w.wayplan_id, ''), nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.upload_code, '')) as wayplan_id,
  coalesce(nullif(w.upload_code, ''), nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, '')) as upload_code,
  coalesce(nullif(w.waybill_no, ''), i.item_waybill_no) as waybill_no,
  coalesce(nullif(w.pickup_id, ''), i.item_pickup_id) as pickup_id,
  w.merchant_code,
  w.merchant_name,
  w.route_code,
  w.route_name,
  w.branch_code,
  w.driver_email,
  w.helper_email,
  w.rider_email,
  w.vehicle_id,
  greatest(coalesce(w.parcel_count, 0), coalesce(w.total_parcels, 0), coalesce(i.item_count, 0))::integer as parcel_count,
  greatest(coalesce(w.total_parcels, 0), coalesce(w.parcel_count, 0), coalesce(i.item_count, 0))::integer as total_parcels,
  coalesce(w.pickup_count, 1)::integer as pickup_count,
  coalesce(w.total_waybills, 1)::integer as total_waybills,
  greatest(coalesce(w.total_weight_kg, 0), coalesce(i.item_weight_kg, 0)) as total_weight_kg,
  greatest(coalesce(w.total_cod_amount, 0), coalesce(i.item_cod_amount, 0)) as total_cod_amount,
  greatest(coalesce(w.total_actual_collect, 0), coalesce(i.item_collect_amount, 0)) as total_actual_collect,
  coalesce(nullif(w.status, ''), lower(coalesce(w.wayplan_status, 'assigned'))) as status,
  coalesce(nullif(w.wayplan_status, ''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(w.dispatch_status, ''), 'READY_FOR_DISPATCH') as dispatch_status,
  w.assigned_at,
  w.dispatched_at,
  w.completed_at,
  coalesce(w.updated_at, w.assigned_at, w.dispatched_at, w.completed_at, now()) as updated_at
from public.be_wayplans w
left join item_counts i
  on i.wayplan_key = coalesce(nullif(w.wayplan_code, ''), nullif(w.wayplan_no, ''), nullif(w.wayplan_id, ''), nullif(w.upload_code, ''));

-- Canonical item view used by Dispatch / Live Dispatch / Delivery Workflow.
drop view if exists public.be_v_operational_wayplan_items cascade;

create or replace view public.be_v_operational_wayplan_items as
select
  coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, ''), nullif(i.upload_code, '')) as wayplan_code,
  coalesce(nullif(i.wayplan_no, ''), nullif(i.wayplan_code, ''), nullif(i.wayplan_id, ''), nullif(i.upload_code, '')) as wayplan_no,
  coalesce(nullif(i.wayplan_id, ''), nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.upload_code, '')) as wayplan_id,
  coalesce(nullif(i.upload_code, ''), nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) as upload_code,
  i.tracking_no,
  i.waybill_no,
  i.pickup_id,
  i.delivery_way_id,
  coalesce(i.parcel_sequence, i.item_no, 0) as parcel_sequence,
  coalesce(i.item_no, i.parcel_sequence, 0) as item_no,
  i.recipient_name,
  coalesce(nullif(i.recipient_phone, ''), nullif(i.recipient_phone_2, '')) as phone_number,
  i.recipient_address,
  i.delivery_township,
  i.destination_city,
  coalesce(nullif(i.remarks, ''), nullif(i.remark, ''), nullif(i.special_instruction, '')) as remarks,
  coalesce(i.weight_kg, 0) as weight_kg,
  coalesce(i.cod_amount, 0) as cod_amount,
  coalesce(i.delivery_charges, 0) as delivery_charges,
  coalesce(i.total_collected_amount, 0) as total_collected_amount,
  coalesce(nullif(i.warehouse_status, ''), 'RECEIVED') as warehouse_status,
  coalesce(nullif(i.wayplan_status, ''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(i.dispatch_status, ''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(i.delivery_status, ''), nullif(i.status, ''), 'assigned') as delivery_status,
  coalesce(i.updated_at, now()) as updated_at
from public.be_wayplan_items i;

-- Unified snapshot consumed by all operational screens.
create or replace function public.be_unified_ops_workflow_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with
  ready_queue as (
    select coalesce(jsonb_agg(to_jsonb(q) order by q.pickup_id, q.parcel_sequence), '[]'::jsonb) as rows
    from public.be_v_wayplan_queue q
    where q.warehouse_status = 'RECEIVED'
      and q.wayplan_status in ('READY_FOR_WAYPLAN', 'READY', 'ASSIGNED')
  ),
  wayplans as (
    select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc), '[]'::jsonb) as rows
    from public.be_v_operational_wayplans w
  ),
  dispatch_ready as (
    select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc), '[]'::jsonb) as rows
    from public.be_v_operational_wayplans w
    where w.dispatch_status in ('READY_FOR_DISPATCH', 'PENDING_DISPATCH')
       or w.wayplan_status in ('ASSIGNED', 'READY_FOR_DISPATCH')
  ),
  live_items as (
    select coalesce(jsonb_agg(to_jsonb(i) order by i.wayplan_code, i.parcel_sequence), '[]'::jsonb) as rows
    from public.be_v_operational_wayplan_items i
  ),
  stats as (
    select jsonb_build_object(
      'ready_wayplan_rows', coalesce((select jsonb_array_length(rows) from ready_queue), 0),
      'wayplan_headers', (select count(*) from public.be_v_operational_wayplans),
      'wayplan_items', (select count(*) from public.be_v_operational_wayplan_items),
      'dispatch_ready_wayplans', (select count(*) from public.be_v_operational_wayplans where dispatch_status in ('READY_FOR_DISPATCH','PENDING_DISPATCH') or wayplan_status in ('ASSIGNED','READY_FOR_DISPATCH')),
      'out_for_delivery_wayplans', (select count(*) from public.be_v_operational_wayplans where dispatch_status in ('OUT_FOR_DELIVERY','DISPATCHED') or wayplan_status in ('DISPATCHED')),
      'completed_items', (select count(*) from public.be_v_operational_wayplan_items where delivery_status in ('DELIVERED','COMPLETED')),
      'failed_items', (select count(*) from public.be_v_operational_wayplan_items where delivery_status in ('FAILED','ATTEMPTED_FAILED','RETURN_PENDING'))
    ) as payload
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'stats', (select payload from stats),
    'ready_queue', (select rows from ready_queue),
    'wayplans', (select rows from wayplans),
    'dispatch_ready', (select rows from dispatch_ready),
    'items', (select rows from live_items)
  );
$$;

-- Backward-compatible RPC aliases for legacy pages.
create or replace function public.be_dispatch_workflow_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_dispatch_center_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_live_dispatch_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_delivery_dispatch_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_ops_command_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_ops_manager_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

create or replace function public.be_executive_ops_snapshot()
returns jsonb language sql security definer set search_path = public as $$
  select public.be_unified_ops_workflow_snapshot();
$$;

grant execute on function public.be_unified_ops_workflow_snapshot() to authenticated, anon;
grant execute on function public.be_dispatch_workflow_snapshot() to authenticated, anon;
grant execute on function public.be_dispatch_center_snapshot() to authenticated, anon;
grant execute on function public.be_live_dispatch_snapshot() to authenticated, anon;
grant execute on function public.be_delivery_dispatch_snapshot() to authenticated, anon;
grant execute on function public.be_ops_command_snapshot() to authenticated, anon;
grant execute on function public.be_ops_manager_snapshot() to authenticated, anon;
grant execute on function public.be_executive_ops_snapshot() to authenticated, anon;

commit;

notify pgrst, 'reload schema';
