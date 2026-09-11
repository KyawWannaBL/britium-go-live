-- Supervisor Portal Go-Live Backend Wiring
-- Active test source: 8.5.2026 pick up list1.xlsx
-- Active upload code: FULL-PICKUP-LIST-20260508

create or replace function public.be_pickup_id_from_tracking(p_tracking_no text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  if p_tracking_no is null or btrim(p_tracking_no) = '' then
    return null;
  end if;

  parts := string_to_array(p_tracking_no, '-');

  if array_length(parts, 1) >= 3 and left(parts[1], 1) = 'D' then
    return ('P' || substring(parts[1] from 2) || '-' || parts[2]);
  end if;

  return null;
end;
$$;

alter table public.be_large_shipment_rows
add column if not exists picker_status text default 'pending',
add column if not exists picker_weight_kg numeric default 0,
add column if not exists picker_photo_paths jsonb default '[]'::jsonb,
add column if not exists picker_photo_urls jsonb default '[]'::jsonb,
add column if not exists picker_note text,
add column if not exists picked_by text,
add column if not exists picked_at timestamptz,
add column if not exists evidence_status text default 'pending',
add column if not exists evidence_quality_results jsonb default '[]'::jsonb,
add column if not exists qr_payload text,
add column if not exists sender_approval_status text default 'pending',
add column if not exists sender_approved_by text,
add column if not exists sender_approved_phone text,
add column if not exists sender_signature_path text,
add column if not exists sender_signature_url text,
add column if not exists sender_acknowledgement text,
add column if not exists sender_signed_at timestamptz,
add column if not exists ground_proof_status text default 'pending',
add column if not exists data_entry_status text default 'draft',
add column if not exists data_entry_note text,
add column if not exists assigned_rider_id text,
add column if not exists assigned_rider_name text,
add column if not exists assigned_driver_id text,
add column if not exists assigned_driver_name text,
add column if not exists assigned_helper_id text,
add column if not exists assigned_helper_name text,
add column if not exists assigned_fleet_id text,
add column if not exists assigned_vehicle_no text,
add column if not exists supervisor_status text default 'pending',
add column if not exists supervisor_note text,
add column if not exists supervisor_updated_at timestamptz;

create index if not exists idx_be_large_rows_upload_tracking
on public.be_large_shipment_rows(upload_code, tracking_no);

create table if not exists public.be_supervisor_pickup_assignments (
  pickup_id text primary key,
  upload_code text not null default 'FULL-PICKUP-LIST-20260508',
  merchant_code text,
  merchant_name text,
  assigned_fleet_id text,
  assigned_vehicle_no text,
  assigned_rider_id text,
  assigned_rider_name text,
  assigned_driver_id text,
  assigned_driver_name text,
  supervisor_note text,
  status text not null default 'assigned',
  assigned_by text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_wayplans (
  wayplan_code text primary key,
  upload_code text not null default 'FULL-PICKUP-LIST-20260508',
  group_by text,
  group_key text,
  township text,
  route_name text,
  total_parcels integer default 0,
  total_cod numeric default 0,
  total_actual_collect numeric default 0,
  total_weight_kg numeric default 0,
  status text not null default 'registered',
  assigned_rider_id text,
  assigned_rider_name text,
  assigned_driver_id text,
  assigned_driver_name text,
  assigned_helper_id text,
  assigned_helper_name text,
  assigned_fleet_id text,
  assigned_vehicle_no text,
  supervisor_note text,
  generated_by text,
  generated_at timestamptz default now(),
  dispatched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_wayplans
add column if not exists upload_code text default 'FULL-PICKUP-LIST-20260508',
add column if not exists group_by text,
add column if not exists group_key text,
add column if not exists township text,
add column if not exists route_name text,
add column if not exists total_parcels integer default 0,
add column if not exists total_cod numeric default 0,
add column if not exists total_actual_collect numeric default 0,
add column if not exists total_weight_kg numeric default 0,
add column if not exists status text default 'registered',
add column if not exists assigned_rider_id text,
add column if not exists assigned_rider_name text,
add column if not exists assigned_driver_id text,
add column if not exists assigned_driver_name text,
add column if not exists assigned_helper_id text,
add column if not exists assigned_helper_name text,
add column if not exists assigned_fleet_id text,
add column if not exists assigned_vehicle_no text,
add column if not exists supervisor_note text,
add column if not exists generated_by text,
add column if not exists generated_at timestamptz default now(),
add column if not exists dispatched_at timestamptz,
add column if not exists created_at timestamptz default now(),
add column if not exists updated_at timestamptz default now();

create table if not exists public.be_wayplan_items (
  id bigserial primary key,
  wayplan_code text not null,
  upload_code text not null default 'FULL-PICKUP-LIST-20260508',
  sort_order integer,
  pickup_id text,
  tracking_no text,
  merchant_name text,
  customer_name text,
  customer_phone text,
  township text,
  delivery_address text,
  cod_amount numeric default 0,
  delivery_fee_os numeric default 0,
  actual_collect numeric default 0,
  weight_kg numeric default 0,
  status text default 'planned',
  assigned_rider_id text,
  assigned_rider_name text,
  assigned_driver_id text,
  assigned_driver_name text,
  assigned_helper_id text,
  assigned_helper_name text,
  assigned_fleet_id text,
  assigned_vehicle_no text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_wayplan_items
add column if not exists upload_code text default 'FULL-PICKUP-LIST-20260508',
add column if not exists sort_order integer,
add column if not exists pickup_id text,
add column if not exists tracking_no text,
add column if not exists merchant_name text,
add column if not exists customer_name text,
add column if not exists customer_phone text,
add column if not exists township text,
add column if not exists delivery_address text,
add column if not exists cod_amount numeric default 0,
add column if not exists delivery_fee_os numeric default 0,
add column if not exists actual_collect numeric default 0,
add column if not exists weight_kg numeric default 0,
add column if not exists status text default 'planned',
add column if not exists assigned_rider_id text,
add column if not exists assigned_rider_name text,
add column if not exists assigned_driver_id text,
add column if not exists assigned_driver_name text,
add column if not exists assigned_helper_id text,
add column if not exists assigned_helper_name text,
add column if not exists assigned_fleet_id text,
add column if not exists assigned_vehicle_no text,
add column if not exists created_at timestamptz default now(),
add column if not exists updated_at timestamptz default now();

create index if not exists idx_be_wayplans_upload_status
on public.be_wayplans(upload_code, status);

create index if not exists idx_be_wayplan_items_wayplan_sort
on public.be_wayplan_items(wayplan_code, sort_order);

create index if not exists idx_be_wayplan_items_upload_tracking
on public.be_wayplan_items(upload_code, tracking_no);

create or replace function public.be_supervisor_portal_snapshot(
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_code text := 'FULL-PICKUP-LIST-20260508';
  v_pickups jsonb := '[]'::jsonb;
  v_wayplans jsonb := '[]'::jsonb;
  v_fleet jsonb := '[]'::jsonb;
  v_riders jsonb := '[]'::jsonb;
  v_drivers jsonb := '[]'::jsonb;
  v_helpers jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pickup_id), '[]'::jsonb)
  into v_pickups
  from (
    select
      s.pickup_id,
      s.pickup_id as pickup_request_code,
      split_part(s.pickup_id, '-', 2) as merchant_code,
      max(s.merchant_name) as merchant_name,
      max(s.merchant_name) as sender_name,
      count(*)::integer as parcel_count,
      coalesce(sum(coalesce(s.cod_amount, 0)), 0) as total_cod,
      coalesce(sum(coalesce(s.actual_collect, 0)), 0) as total_actual_collect,
      coalesce(sum(coalesce(s.weight_kg, 0)), 0) as total_weight_kg,
      count(*) filter (where coalesce(s.picker_status, '') = 'picked')::integer as picked_count,
      count(*) filter (
        where coalesce(jsonb_array_length(coalesce(s.picker_photo_paths, '[]'::jsonb)), 0) > 0
           or coalesce(jsonb_array_length(coalesce(s.picker_photo_urls, '[]'::jsonb)), 0) > 0
      )::integer as photo_count,
      count(*) filter (
        where coalesce(s.sender_approval_status, '') = 'approved'
           or nullif(s.sender_signature_path, '') is not null
           or nullif(s.sender_signature_url, '') is not null
      )::integer as signature_count,
      max(a.assigned_fleet_id) as assigned_fleet_id,
      max(a.assigned_vehicle_no) as assigned_vehicle_no,
      coalesce(max(a.status), 'new') as assignment_status,
      case
        when count(*) filter (where coalesce(s.data_entry_status, '') in ('saved','uploaded','finalized','edited')) = count(*)
        then 'ready_for_wayplan'
        when count(*) filter (where coalesce(s.picker_status, '') = 'picked') > 0
        then 'proof_in_progress'
        else 'new'
      end as status,
      v_upload_code as upload_code
    from (
      select
        public.be_pickup_id_from_tracking(r.tracking_no) as pickup_id,
        r.*
      from public.be_large_shipment_rows r
      where r.upload_code = v_upload_code
        and r.tracking_no is not null
    ) s
    left join public.be_supervisor_pickup_assignments a
      on a.pickup_id = s.pickup_id
    where s.pickup_id is not null
      and (
        p_search is null
        or s.pickup_id ilike '%' || p_search || '%'
        or s.tracking_no ilike '%' || p_search || '%'
        or s.merchant_name ilike '%' || p_search || '%'
        or s.customer_name ilike '%' || p_search || '%'
        or s.customer_phone ilike '%' || p_search || '%'
        or s.township ilike '%' || p_search || '%'
      )
    group by s.pickup_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc nulls last, w.wayplan_code), '[]'::jsonb)
  into v_wayplans
  from public.be_wayplans w
  where w.upload_code = v_upload_code
    and (
      p_search is null
      or w.wayplan_code ilike '%' || p_search || '%'
      or w.group_key ilike '%' || p_search || '%'
      or w.route_name ilike '%' || p_search || '%'
      or w.township ilike '%' || p_search || '%'
    );

  if to_regclass('public.fleet_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(f)), ''[]''::jsonb) from public.fleet_master f'
    into v_fleet;
  end if;

  if to_regclass('public.rider_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.rider_master r'
    into v_riders;
  end if;

  if to_regclass('public.driver_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(d)), ''[]''::jsonb) from public.driver_master d'
    into v_drivers;
  end if;

  if to_regclass('public.helper_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(h)), ''[]''::jsonb) from public.helper_master h'
    into v_helpers;
  end if;

  select jsonb_build_object(
    'active_upload_code', v_upload_code,
    'pickup_batches', coalesce(jsonb_array_length(v_pickups), 0),
    'new_pickups', (
      select count(*) from jsonb_to_recordset(v_pickups) as p(status text)
      where p.status in ('new','proof_in_progress','ready_for_wayplan')
    ),
    'wayplans', coalesce(jsonb_array_length(v_wayplans), 0),
    'wayplanned', (
      select count(*) from jsonb_to_recordset(v_wayplans) as w(status text)
      where w.status in ('wayplanned','assigned','dispatched')
    ),
    'total_parcels', (
      select coalesce(sum((p.parcel_count)::integer), 0)
      from jsonb_to_recordset(v_pickups) as p(parcel_count integer)
    ),
    'total_cod', (
      select coalesce(sum((p.total_cod)::numeric), 0)
      from jsonb_to_recordset(v_pickups) as p(total_cod numeric)
    )
  )
  into v_summary;

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'rule', 'Supervisor portal uses active go-live scope only: 8.5.2026 pick up list1.xlsx',
    'summary', v_summary,
    'pickup_batches', v_pickups,
    'wayplans', v_wayplans,
    'fleet', v_fleet,
    'riders', v_riders,
    'drivers', v_drivers,
    'helpers', v_helpers
  );
end;
$$;

create or replace function public.be_supervisor_assign_pickup_batch(
  p_pickup_id text,
  p_fleet_id text default null,
  p_vehicle_no text default null,
  p_rider_id text default null,
  p_rider_name text default null,
  p_driver_id text default null,
  p_driver_name text default null,
  p_note text default null,
  p_actor text default 'supervisor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_code text := 'FULL-PICKUP-LIST-20260508';
  v_merchant text;
  v_code text;
begin
  if p_pickup_id is null or btrim(p_pickup_id) = '' then
    raise exception 'Pickup ID is required.';
  end if;

  select max(merchant_name), split_part(p_pickup_id, '-', 2)
  into v_merchant, v_code
  from public.be_large_shipment_rows
  where upload_code = v_upload_code
    and public.be_pickup_id_from_tracking(tracking_no) = p_pickup_id;

  if v_merchant is null then
    raise exception 'Pickup ID % was not found in active go-live upload.', p_pickup_id;
  end if;

  insert into public.be_supervisor_pickup_assignments (
    pickup_id,
    upload_code,
    merchant_code,
    merchant_name,
    assigned_fleet_id,
    assigned_vehicle_no,
    assigned_rider_id,
    assigned_rider_name,
    assigned_driver_id,
    assigned_driver_name,
    supervisor_note,
    status,
    assigned_by,
    updated_at
  )
  values (
    p_pickup_id,
    v_upload_code,
    v_code,
    v_merchant,
    p_fleet_id,
    p_vehicle_no,
    p_rider_id,
    p_rider_name,
    p_driver_id,
    p_driver_name,
    p_note,
    'assigned',
    p_actor,
    now()
  )
  on conflict (pickup_id) do update set
    assigned_fleet_id = excluded.assigned_fleet_id,
    assigned_vehicle_no = excluded.assigned_vehicle_no,
    assigned_rider_id = excluded.assigned_rider_id,
    assigned_rider_name = excluded.assigned_rider_name,
    assigned_driver_id = excluded.assigned_driver_id,
    assigned_driver_name = excluded.assigned_driver_name,
    supervisor_note = excluded.supervisor_note,
    status = 'assigned',
    assigned_by = excluded.assigned_by,
    updated_at = now();

  update public.be_large_shipment_rows
  set
    assigned_fleet_id = p_fleet_id,
    assigned_vehicle_no = p_vehicle_no,
    assigned_rider_id = p_rider_id,
    assigned_rider_name = p_rider_name,
    assigned_driver_id = p_driver_id,
    assigned_driver_name = p_driver_name,
    supervisor_status = 'pickup_assigned',
    supervisor_note = p_note,
    supervisor_updated_at = now()
  where upload_code = v_upload_code
    and public.be_pickup_id_from_tracking(tracking_no) = p_pickup_id;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'merchant_name', v_merchant,
    'status', 'assigned',
    'fleet_id', p_fleet_id,
    'vehicle_no', p_vehicle_no,
    'assigned_at', now()
  );
end;
$$;

create or replace function public.be_supervisor_generate_wayplans(
  p_upload_code text default 'FULL-PICKUP-LIST-20260508',
  p_group_by text default 'township',
  p_actor text default 'supervisor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_count integer := 0;
  item_count integer := 0;
begin
  if p_upload_code is null or btrim(p_upload_code) = '' then
    p_upload_code := 'FULL-PICKUP-LIST-20260508';
  end if;

  create temp table if not exists pg_temp.be_supervisor_wp_groups (
    group_key text,
    wayplan_code text
  ) on commit drop;

  delete from pg_temp.be_supervisor_wp_groups;

  insert into pg_temp.be_supervisor_wp_groups(group_key, wayplan_code)
  select
    g.group_key,
    'WP-0508-' || lpad(row_number() over (order by g.group_key)::text, 3, '0') as wayplan_code
  from (
    select distinct
      case
        when lower(coalesce(p_group_by, 'township')) = 'merchant' then coalesce(nullif(merchant_name, ''), 'UNKNOWN_MERCHANT')
        when lower(coalesce(p_group_by, 'township')) = 'pickup' then coalesce(public.be_pickup_id_from_tracking(tracking_no), 'UNKNOWN_PICKUP')
        else coalesce(nullif(township, ''), 'UNKNOWN_TOWNSHIP')
      end as group_key
    from public.be_large_shipment_rows
    where upload_code = p_upload_code
      and tracking_no is not null
  ) g;

  insert into public.be_wayplans (
    wayplan_code,
    upload_code,
    group_by,
    group_key,
    township,
    route_name,
    total_parcels,
    total_cod,
    total_actual_collect,
    total_weight_kg,
    status,
    generated_by,
    generated_at,
    updated_at
  )
  select
    g.wayplan_code,
    p_upload_code,
    coalesce(p_group_by, 'township'),
    g.group_key,
    case when lower(coalesce(p_group_by, 'township')) = 'township' then g.group_key else null end,
    case
      when lower(coalesce(p_group_by, 'township')) = 'township' then g.group_key || ' Delivery Zone'
      when lower(coalesce(p_group_by, 'township')) = 'merchant' then g.group_key || ' Merchant Batch'
      else g.group_key || ' Pickup Batch'
    end,
    count(*)::integer,
    coalesce(sum(coalesce(r.cod_amount, 0)), 0),
    coalesce(sum(coalesce(r.actual_collect, 0)), 0),
    coalesce(sum(coalesce(r.weight_kg, 0)), 0),
    'wayplanned',
    p_actor,
    now(),
    now()
  from public.be_large_shipment_rows r
  join pg_temp.be_supervisor_wp_groups g
    on g.group_key = case
      when lower(coalesce(p_group_by, 'township')) = 'merchant' then coalesce(nullif(r.merchant_name, ''), 'UNKNOWN_MERCHANT')
      when lower(coalesce(p_group_by, 'township')) = 'pickup' then coalesce(public.be_pickup_id_from_tracking(r.tracking_no), 'UNKNOWN_PICKUP')
      else coalesce(nullif(r.township, ''), 'UNKNOWN_TOWNSHIP')
    end
  where r.upload_code = p_upload_code
    and r.tracking_no is not null
  group by g.wayplan_code, g.group_key
  on conflict (wayplan_code) do update set
    upload_code = excluded.upload_code,
    group_by = excluded.group_by,
    group_key = excluded.group_key,
    township = excluded.township,
    route_name = excluded.route_name,
    total_parcels = excluded.total_parcels,
    total_cod = excluded.total_cod,
    total_actual_collect = excluded.total_actual_collect,
    total_weight_kg = excluded.total_weight_kg,
    status = 'wayplanned',
    generated_by = excluded.generated_by,
    generated_at = excluded.generated_at,
    updated_at = now();

  get diagnostics generated_count = row_count;

  delete from public.be_wayplan_items
  where upload_code = p_upload_code;

  insert into public.be_wayplan_items (
    wayplan_code,
    upload_code,
    sort_order,
    pickup_id,
    tracking_no,
    merchant_name,
    customer_name,
    customer_phone,
    township,
    delivery_address,
    cod_amount,
    delivery_fee_os,
    actual_collect,
    weight_kg,
    status,
    created_at,
    updated_at
  )
  select
    g.wayplan_code,
    p_upload_code,
    row_number() over (partition by g.wayplan_code order by r.township, r.tracking_no)::integer,
    public.be_pickup_id_from_tracking(r.tracking_no),
    r.tracking_no,
    r.merchant_name,
    r.customer_name,
    r.customer_phone,
    r.township,
    r.delivery_address,
    coalesce(r.cod_amount, 0),
    coalesce(r.delivery_fee_os, 0),
    coalesce(r.actual_collect, 0),
    coalesce(r.weight_kg, 0),
    'planned',
    now(),
    now()
  from public.be_large_shipment_rows r
  join pg_temp.be_supervisor_wp_groups g
    on g.group_key = case
      when lower(coalesce(p_group_by, 'township')) = 'merchant' then coalesce(nullif(r.merchant_name, ''), 'UNKNOWN_MERCHANT')
      when lower(coalesce(p_group_by, 'township')) = 'pickup' then coalesce(public.be_pickup_id_from_tracking(r.tracking_no), 'UNKNOWN_PICKUP')
      else coalesce(nullif(r.township, ''), 'UNKNOWN_TOWNSHIP')
    end
  where r.upload_code = p_upload_code
    and r.tracking_no is not null;

  get diagnostics item_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'upload_code', p_upload_code,
    'group_by', p_group_by,
    'wayplans_generated', (select count(*) from public.be_wayplans where upload_code = p_upload_code),
    'wayplan_items', item_count,
    'generated_at', now()
  );
end;
$$;

create or replace function public.be_supervisor_assign_wayplan_team(
  p_wayplan_code text,
  p_rider_id text default null,
  p_rider_name text default null,
  p_driver_id text default null,
  p_driver_name text default null,
  p_helper_id text default null,
  p_helper_name text default null,
  p_fleet_id text default null,
  p_vehicle_no text default null,
  p_note text default null,
  p_actor text default 'supervisor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_wayplan_code is null or btrim(p_wayplan_code) = '' then
    raise exception 'Wayplan code is required.';
  end if;

  update public.be_wayplans
  set
    assigned_rider_id = p_rider_id,
    assigned_rider_name = p_rider_name,
    assigned_driver_id = p_driver_id,
    assigned_driver_name = p_driver_name,
    assigned_helper_id = p_helper_id,
    assigned_helper_name = p_helper_name,
    assigned_fleet_id = p_fleet_id,
    assigned_vehicle_no = p_vehicle_no,
    supervisor_note = p_note,
    status = 'assigned',
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  update public.be_wayplan_items
  set
    assigned_rider_id = p_rider_id,
    assigned_rider_name = p_rider_name,
    assigned_driver_id = p_driver_id,
    assigned_driver_name = p_driver_name,
    assigned_helper_id = p_helper_id,
    assigned_helper_name = p_helper_name,
    assigned_fleet_id = p_fleet_id,
    assigned_vehicle_no = p_vehicle_no,
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  update public.be_large_shipment_rows r
  set
    assigned_rider_id = p_rider_id,
    assigned_rider_name = p_rider_name,
    assigned_driver_id = p_driver_id,
    assigned_driver_name = p_driver_name,
    assigned_helper_id = p_helper_id,
    assigned_helper_name = p_helper_name,
    assigned_fleet_id = p_fleet_id,
    assigned_vehicle_no = p_vehicle_no,
    supervisor_status = 'wayplan_assigned',
    supervisor_note = p_note,
    supervisor_updated_at = now()
  where exists (
    select 1
    from public.be_wayplan_items i
    where i.wayplan_code = p_wayplan_code
      and i.tracking_no = r.tracking_no
  );

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'status', 'assigned',
    'assigned_vehicle_no', p_vehicle_no,
    'assigned_at', now()
  );
end;
$$;

create or replace function public.be_supervisor_dispatch_wayplan(
  p_wayplan_code text,
  p_actor text default 'supervisor'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items integer := 0;
begin
  update public.be_wayplans
  set
    status = 'dispatched',
    dispatched_at = now(),
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  if not found then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  update public.be_wayplan_items
  set
    status = 'dispatched',
    updated_at = now()
  where wayplan_code = p_wayplan_code;

  get diagnostics v_items = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'status', 'dispatched',
    'items', v_items,
    'dispatched_at', now()
  );
end;
$$;

create or replace function public.be_supervisor_wayplan_manifest(
  p_wayplan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan jsonb;
  v_items jsonb;
begin
  select to_jsonb(w)
  into v_wayplan
  from public.be_wayplans w
  where w.wayplan_code = p_wayplan_code;

  if v_wayplan is null then
    raise exception 'Wayplan % not found.', p_wayplan_code;
  end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order nulls last, i.tracking_no), '[]'::jsonb)
  into v_items
  from public.be_wayplan_items i
  where i.wayplan_code = p_wayplan_code;

  return jsonb_build_object(
    'ok', true,
    'wayplan', v_wayplan,
    'items', v_items,
    'generated_at', now()
  );
end;
$$;

grant execute on function public.be_pickup_id_from_tracking(text) to anon, authenticated;
grant execute on function public.be_supervisor_portal_snapshot(text) to anon, authenticated;
grant execute on function public.be_supervisor_assign_pickup_batch(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.be_supervisor_generate_wayplans(text, text, text) to anon, authenticated;
grant execute on function public.be_supervisor_assign_wayplan_team(text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.be_supervisor_dispatch_wayplan(text, text) to anon, authenticated;
grant execute on function public.be_supervisor_wayplan_manifest(text) to anon, authenticated;

notify pgrst, 'reload schema';
