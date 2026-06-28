
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Britium Enterprise Portal Full Sync Patch
-- Purpose:
--   Wire Supervisor, Supervisor Pickup, Supervisor Wayplan, Finance, Invoice,
--   COD Settlement, Rider Settlement, Customer Portal and Branch Office screens
--   to the same live workflow backend used by Data Entry -> Warehouse ->
--   Wayplan -> Dispatch -> Rider App.
--   No demo/mock/hardcoded operational rows are created.
-- ---------------------------------------------------------------------------

-- 1) Compatibility columns ---------------------------------------------------
alter table if exists public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists request_code text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant_email text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists contact_no text,
  add column if not exists phone text,
  add column if not exists parcel_count integer default 0,
  add column if not exists assigned_rider_email text,
  add column if not exists assigned_driver_email text,
  add column if not exists assigned_helper_email text,
  add column if not exists assigned_fleet_id text,
  add column if not exists supervisor_note text,
  add column if not exists pickup_status text,
  add column if not exists workflow_stage text,
  add column if not exists status text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.be_wayplan_items
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant_email text,
  add column if not exists phone_number text,
  add column if not exists remarks text,
  add column if not exists delivery_status text,
  add column if not exists dispatch_status text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_charges numeric default 0,
  add column if not exists total_collected_amount numeric default 0,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.be_dispatch_job_assignments
  add column if not exists tracking_no text,
  add column if not exists wayplan_code text,
  add column if not exists asset_code text,
  add column if not exists published_to_rider boolean default false,
  add column if not exists delivery_status text,
  add column if not exists dispatch_status text,
  add column if not exists failed_attempts integer default 0,
  add column if not exists failed_reason text,
  add column if not exists updated_by_email text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Branch compatibility is included because branch-office page was added later.
create table if not exists public.be_branch_offices (
  id uuid primary key default gen_random_uuid(),
  branch_code text unique,
  branch_name text,
  city text,
  region_state text,
  address text,
  phone text,
  manager_name text,
  manager_phone text,
  manager_email text,
  status text default 'ACTIVE',
  created_by_email text,
  updated_by_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_branch_offices
  add column if not exists branch_code text,
  add column if not exists branch_name text,
  add column if not exists city text,
  add column if not exists region_state text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists manager_name text,
  add column if not exists manager_phone text,
  add column if not exists manager_email text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by_email text,
  add column if not exists updated_by_email text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists be_branch_offices_branch_code_uidx
  on public.be_branch_offices(branch_code);

create table if not exists public.be_branch_merchant_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text unique,
  branch_code text,
  merchant_code text,
  merchant_name text,
  merchant_email text,
  merchant_phone text,
  contact_person text,
  township text,
  pickup_address text,
  business_type text,
  status text default 'PENDING',
  requested_by_email text,
  reviewed_by_email text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_branch_merchant_onboarding_requests
  add column if not exists request_no text,
  add column if not exists branch_code text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists merchant_email text,
  add column if not exists merchant_phone text,
  add column if not exists contact_person text,
  add column if not exists township text,
  add column if not exists pickup_address text,
  add column if not exists business_type text,
  add column if not exists status text default 'PENDING',
  add column if not exists requested_by_email text,
  add column if not exists reviewed_by_email text,
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_branch_service_areas (
  id uuid primary key default gen_random_uuid(),
  branch_code text,
  township text,
  city text default 'Yangon',
  status text default 'ACTIVE',
  created_at timestamptz default now()
);

alter table public.be_branch_service_areas
  add column if not exists branch_code text,
  add column if not exists township text,
  add column if not exists city text default 'Yangon',
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_at timestamptz default now();

-- 2) Canonical live workflow view -------------------------------------------
drop view if exists public.be_v_portal_live_jobs cascade;

create or replace view public.be_v_portal_live_jobs as
select
  x.id,
  x.tracking_no,
  coalesce(nullif(x.delivery_way_id,''), nullif(x.tracking_no,'')) as delivery_way_id,
  x.waybill_no,
  x.pickup_id,
  x.wayplan_code,
  coalesce(nullif(x.merchant_code,''), 'UNKNOWN') as merchant_code,
  coalesce(nullif(x.merchant_name,''), 'Unknown Merchant') as merchant_name,
  x.merchant_email,
  x.recipient_name,
  coalesce(nullif(x.phone_number,''), nullif(x.recipient_phone,''), nullif(x.recipient_phone_2,'')) as phone_number,
  x.recipient_address,
  x.delivery_township as township,
  x.destination_city,
  x.asset_code,
  x.asset_name,
  x.asset_type,
  x.vehicle_plate,
  x.driver_email,
  x.rider_email,
  x.helper_email,
  coalesce(nullif(x.warehouse_status,''), 'RECEIVED') as warehouse_status,
  coalesce(nullif(x.wayplan_status,''), 'ASSIGNED') as wayplan_status,
  coalesce(nullif(x.dispatch_status,''), 'READY_FOR_DISPATCH') as dispatch_status,
  coalesce(nullif(x.delivery_status,''), 'PENDING') as delivery_status,
  coalesce(x.return_attempt_count,0) as return_attempt_count,
  coalesce(x.next_attempt_priority,false) as next_attempt_priority,
  x.exception_status,
  x.last_exception_code,
  x.last_exception_reason,
  x.inbound_scan_at,
  x.dispatch_scan_at,
  x.dropoff_at,
  x.rto_at,
  coalesce(x.weight_kg,0)::numeric as weight_kg,
  coalesce(x.cod_amount,0)::numeric as cod_amount,
  coalesce(x.delivery_charges,0)::numeric as delivery_charges,
  coalesce(x.total_collected_amount,0)::numeric as total_collected_amount,
  x.updated_at
from public.be_v_warehouse_scan_lifecycle x;

-- Drop all overloaded versions of the portal snapshot RPCs.
-- Existing UAT databases may already have old snapshot functions with default arguments.
-- If they remain, PostgREST/PostgreSQL cannot choose the best candidate function.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'be_enterprise_portal_healthcheck',
        'be_supervisor_portal_snapshot',
        'be_supervisor_pickup_snapshot',
        'be_supervisor_wayplan_snapshot',
        'be_finance_portal_snapshot',
        'be_invoice_studio_snapshot',
        'be_cod_settlement_snapshot',
        'be_rider_settlement_snapshot',
        'be_customer_portal_snapshot',
        'be_branch_office_portal_snapshot',
        'be_portal_sync_smoke_test'
      )
  loop
    execute 'drop function if exists ' || r.fn || ' cascade';
  end loop;
end $$;

-- 3) Healthcheck -------------------------------------------------------------
create function public.be_enterprise_portal_healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'ok', true,
    'objects', jsonb_build_object(
      'warehouse_lifecycle_view', to_regclass('public.be_v_warehouse_scan_lifecycle') is not null,
      'dispatch_jobs_view', to_regclass('public.be_v_enterprise_dispatch_jobs') is not null,
      'rider_jobs_view', to_regclass('public.be_v_rider_dispatch_jobs') is not null,
      'exception_board_view', to_regclass('public.be_v_exception_board') is not null,
      'portal_live_jobs_view', to_regclass('public.be_v_portal_live_jobs') is not null,
      'branch_offices_table', to_regclass('public.be_branch_offices') is not null
    ),
    'counts', jsonb_build_object(
      'live_jobs', (select count(*) from public.be_v_portal_live_jobs),
      'rider_visible_jobs', (select count(*) from public.be_v_rider_dispatch_jobs),
      'exceptions', (select count(*) from public.be_v_exception_board),
      'pickup_requests', (select count(*) from public.be_portal_pickup_requests),
      'branch_offices', (select count(*) from public.be_branch_offices)
    )
  )
  into v;
  return v;
end;
$$;

-- 4) Supervisor snapshots ----------------------------------------------------
create function public.be_supervisor_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc nulls last, q.pickup_id), '[]'::jsonb)
  into v_queue
  from (
    select
      p.pickup_id,
      coalesce(nullif(p.pickup_way_id,''), p.pickup_id) as pickup_way_id,
      p.request_code,
      p.merchant_code,
      p.merchant_name,
      coalesce(nullif(p.pickup_address,''), '') as pickup_address,
      p.township,
      coalesce(nullif(p.contact_no,''), nullif(p.phone,'')) as phone,
      coalesce(p.parcel_count,0) as parcel_count,
      p.assigned_rider_email,
      p.assigned_driver_email,
      p.assigned_helper_email,
      p.assigned_fleet_id,
      p.supervisor_note,
      coalesce(nullif(p.pickup_status,''), nullif(p.workflow_stage,''), nullif(p.status,''), 'PICKUP_REQUESTED') as status,
      p.created_at,
      p.updated_at
    from public.be_portal_pickup_requests p
    where coalesce(nullif(p.pickup_status,''), nullif(p.workflow_stage,''), nullif(p.status,''), 'PICKUP_REQUESTED')
      not in ('CANCELLED','PICKUP_CANCELLED','PICKUP_COMPLETED','WAREHOUSE_RECEIVED','WAYBILL_CREATED')
    order by p.updated_at desc nulls last
    limit 300
  ) q;

  select jsonb_build_object(
    'queue', jsonb_array_length(v_queue),
    'unassigned', (select count(*) from public.be_portal_pickup_requests p where coalesce(p.assigned_rider_email,p.assigned_driver_email,p.assigned_fleet_id) is null),
    'assigned', (select count(*) from public.be_portal_pickup_requests p where coalesce(p.assigned_rider_email,p.assigned_driver_email,p.assigned_fleet_id) is not null),
    'requires_cs', (select count(*) from public.be_portal_pickup_requests p where coalesce(p.pickup_status,p.workflow_stage,p.status,'') in ('CS_HOLD','ADDRESS_CORRECTION_REQUIRED','PICKUP_FAILED'))
  )
  into v_stats;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'queue', v_queue);
end;
$$;

create function public.be_supervisor_pickup_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_assets jsonb;
begin
  v_base := public.be_supervisor_portal_snapshot();

  select coalesce(jsonb_agg(to_jsonb(a) order by a.asset_type, a.asset_code), '[]'::jsonb)
  into v_assets
  from (
    select asset_code, asset_name, asset_type, vehicle_plate, driver_email, rider_email, helper_email
    from public.be_v_portal_live_jobs
    where nullif(asset_code,'') is not null
    group by asset_code, asset_name, asset_type, vehicle_plate, driver_email, rider_email, helper_email
  ) a;

  return v_base || jsonb_build_object('assets', v_assets);
end;
$$;

create function public.be_supervisor_wayplan_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplans jsonb;
  v_jobs jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc nulls last, w.wayplan_code), '[]'::jsonb)
  into v_wayplans
  from (
    select
      wayplan_code,
      max(waybill_no) as waybill_no,
      max(pickup_id) as pickup_id,
      count(*) as parcels,
      count(*) filter (where next_attempt_priority) as priority_returns,
      sum(cod_amount) as cod_amount,
      sum(delivery_charges) as delivery_fee,
      max(asset_code) as asset_code,
      max(asset_name) as asset_name,
      max(driver_email) as driver_email,
      max(rider_email) as rider_email,
      max(dispatch_status) as dispatch_status,
      max(wayplan_status) as wayplan_status,
      max(updated_at) as updated_at
    from public.be_v_portal_live_jobs
    group by wayplan_code
  ) w;

  select coalesce(jsonb_agg(to_jsonb(j) order by j.next_attempt_priority desc, j.tracking_no), '[]'::jsonb)
  into v_jobs
  from public.be_v_portal_live_jobs j;

  select jsonb_build_object(
    'wayplans', jsonb_array_length(v_wayplans),
    'rows_in_plan', jsonb_array_length(v_jobs),
    'priority_returns', (select count(*) from public.be_v_portal_live_jobs where next_attempt_priority),
    'out_for_delivery', (select count(*) from public.be_v_portal_live_jobs where delivery_status = 'OUT_FOR_DELIVERY')
  )
  into v_stats;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'wayplans', v_wayplans, 'jobs', v_jobs);
end;
$$;

-- 5) Finance / invoice / settlement snapshots --------------------------------
create function public.be_finance_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.waybill_no, r.tracking_no), '[]'::jsonb)
  into v_rows
  from (
    select
      tracking_no,
      waybill_no,
      pickup_id,
      merchant_code,
      merchant_name,
      recipient_name,
      township,
      phone_number,
      delivery_status,
      dispatch_status,
      cod_amount,
      delivery_charges,
      total_collected_amount,
      asset_code,
      rider_email,
      driver_email,
      updated_at
    from public.be_v_portal_live_jobs
  ) r;

  select jsonb_build_object(
    'total_cod', coalesce(sum(cod_amount),0),
    'collectable_cod', coalesce(sum(cod_amount) filter (where delivery_status in ('DELIVERED','DROP_OFF')),0),
    'pending_cod', coalesce(sum(cod_amount) filter (where delivery_status not in ('DELIVERED','DROP_OFF','RTO')),0),
    'rto_cod', coalesce(sum(cod_amount) filter (where delivery_status = 'RTO'),0),
    'delivery_fee', coalesce(sum(delivery_charges),0),
    'rows', count(*)
  )
  into v_stats
  from public.be_v_portal_live_jobs;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows);
end;
$$;

create function public.be_invoice_studio_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoices jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(i) order by i.waybill_no), '[]'::jsonb)
  into v_invoices
  from (
    select
      waybill_no,
      merchant_code,
      merchant_name,
      count(*) as parcel_count,
      sum(cod_amount) as cod_amount,
      sum(delivery_charges) as delivery_fee,
      sum(total_collected_amount) as total_amount,
      case
        when count(*) filter (where delivery_status in ('DELIVERED','DROP_OFF','RTO')) = count(*) then 'READY_FOR_INVOICE'
        else 'UNDER_REVIEW'
      end as invoice_status,
      max(updated_at) as updated_at
    from public.be_v_portal_live_jobs
    group by waybill_no, merchant_code, merchant_name
  ) i;

  select jsonb_build_object(
    'draft', (select count(*) from jsonb_array_elements(v_invoices) x where x->>'invoice_status' = 'UNDER_REVIEW'),
    'ready', (select count(*) from jsonb_array_elements(v_invoices) x where x->>'invoice_status' = 'READY_FOR_INVOICE'),
    'total', jsonb_array_length(v_invoices)
  )
  into v_stats;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'invoices', v_invoices);
end;
$$;

create function public.be_cod_settlement_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.delivery_status, r.updated_at desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      tracking_no,
      waybill_no,
      merchant_code,
      merchant_name,
      recipient_name,
      phone_number,
      township,
      cod_amount,
      delivery_charges,
      total_collected_amount,
      delivery_status,
      asset_code,
      rider_email,
      driver_email,
      updated_at
    from public.be_v_portal_live_jobs
    where cod_amount > 0
  ) r;

  select jsonb_build_object(
    'total_cod', coalesce(sum(cod_amount),0),
    'settle_ready', coalesce(sum(cod_amount) filter (where delivery_status in ('DELIVERED','DROP_OFF')),0),
    'pending', count(*) filter (where delivery_status not in ('DELIVERED','DROP_OFF','RTO')),
    'rto', count(*) filter (where delivery_status = 'RTO'),
    'rows', count(*)
  )
  into v_stats
  from public.be_v_portal_live_jobs
  where cod_amount > 0;

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows);
end;
$$;

create function public.be_rider_settlement_snapshot(
  p_rider_email text default null,
  p_work_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_stats jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.asset_code, r.tracking_no), '[]'::jsonb)
  into v_rows
  from (
    select
      tracking_no,
      waybill_no,
      recipient_name,
      township,
      phone_number,
      cod_amount,
      delivery_charges,
      total_collected_amount,
      delivery_status,
      asset_code,
      rider_email,
      driver_email,
      dispatch_scan_at,
      dropoff_at,
      updated_at
    from public.be_v_portal_live_jobs
    where (p_rider_email is null or rider_email = p_rider_email or driver_email = p_rider_email or asset_code = p_rider_email)
  ) r;

  select jsonb_build_object(
    'jobs', count(*),
    'delivered_jobs', count(*) filter (where delivery_status in ('DELIVERED','DROP_OFF')),
    'collected_cod', coalesce(sum(cod_amount) filter (where delivery_status in ('DELIVERED','DROP_OFF')),0),
    'pending_cod', coalesce(sum(cod_amount) filter (where delivery_status not in ('DELIVERED','DROP_OFF','RTO')),0),
    'rto_jobs', count(*) filter (where delivery_status = 'RTO')
  )
  into v_stats
  from public.be_v_portal_live_jobs
  where (p_rider_email is null or rider_email = p_rider_email or driver_email = p_rider_email or asset_code = p_rider_email);

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows);
end;
$$;

-- 6) Customer / branch snapshots --------------------------------------------
create function public.be_customer_portal_snapshot(
  p_tracking_no text default null,
  p_phone text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      tracking_no,
      waybill_no,
      pickup_id,
      merchant_name,
      recipient_name,
      phone_number,
      township,
      recipient_address,
      warehouse_status,
      wayplan_status,
      dispatch_status,
      delivery_status,
      exception_status,
      last_exception_code,
      last_exception_reason,
      inbound_scan_at,
      dispatch_scan_at,
      dropoff_at,
      rto_at,
      updated_at
    from public.be_v_portal_live_jobs
    where
      (p_tracking_no is null or p_tracking_no = '' or tracking_no = p_tracking_no or delivery_way_id = p_tracking_no or waybill_no = p_tracking_no)
      and (p_phone is null or p_phone = '' or phone_number ilike '%' || p_phone || '%')
    limit 100
  ) r;

  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object('rows', jsonb_array_length(v_rows)),
    'shipments', v_rows
  );
end;
$$;

create function public.be_branch_office_portal_snapshot(
  p_branch_code text default 'YGN',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch jsonb;
  v_merchants jsonb;
  v_areas jsonb;
  v_stats jsonb;
begin
  select to_jsonb(b)
  into v_branch
  from public.be_branch_offices b
  where b.branch_code = p_branch_code
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc nulls last), '[]'::jsonb)
  into v_merchants
  from public.be_branch_merchant_onboarding_requests m
  where m.branch_code = p_branch_code
  limit 300;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.township), '[]'::jsonb)
  into v_areas
  from public.be_branch_service_areas a
  where a.branch_code = p_branch_code
    and coalesce(a.status,'ACTIVE') = 'ACTIVE';

  select jsonb_build_object(
    'pending_merchants', (select count(*) from public.be_branch_merchant_onboarding_requests where branch_code = p_branch_code and status = 'PENDING'),
    'approved_merchants', (select count(*) from public.be_branch_merchant_onboarding_requests where branch_code = p_branch_code and status = 'APPROVED'),
    'service_areas', jsonb_array_length(v_areas),
    'locked', false
  )
  into v_stats;

  return jsonb_build_object('ok', true, 'branch', v_branch, 'stats', v_stats, 'merchants', v_merchants, 'service_areas', v_areas);
end;
$$;

-- 7) Smoke test wrapper ------------------------------------------------------
create function public.be_portal_sync_smoke_test()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'health', public.be_enterprise_portal_healthcheck(),
    'supervisor', (public.be_supervisor_portal_snapshot())->'stats',
    'supervisor_wayplan', (public.be_supervisor_wayplan_snapshot())->'stats',
    'finance', (public.be_finance_portal_snapshot())->'stats',
    'invoice', (public.be_invoice_studio_snapshot())->'stats',
    'cod', (public.be_cod_settlement_snapshot())->'stats',
    'rider_settlement', (public.be_rider_settlement_snapshot(null,current_date))->'stats',
    'customer', (public.be_customer_portal_snapshot(null,null,null))->'stats',
    'branch', (public.be_branch_office_portal_snapshot('YGN','system'))->'stats'
  );
end;
$$;

grant execute on function public.be_enterprise_portal_healthcheck() to authenticated;
grant execute on function public.be_supervisor_portal_snapshot() to authenticated;
grant execute on function public.be_supervisor_pickup_snapshot() to authenticated;
grant execute on function public.be_supervisor_wayplan_snapshot() to authenticated;
grant execute on function public.be_finance_portal_snapshot() to authenticated;
grant execute on function public.be_invoice_studio_snapshot() to authenticated;
grant execute on function public.be_cod_settlement_snapshot() to authenticated;
grant execute on function public.be_rider_settlement_snapshot(text,date) to authenticated;
grant execute on function public.be_customer_portal_snapshot(text,text,text) to authenticated;
grant execute on function public.be_branch_office_portal_snapshot(text,text) to authenticated;
grant execute on function public.be_portal_sync_smoke_test() to authenticated;

commit;
notify pgrst, 'reload schema';
