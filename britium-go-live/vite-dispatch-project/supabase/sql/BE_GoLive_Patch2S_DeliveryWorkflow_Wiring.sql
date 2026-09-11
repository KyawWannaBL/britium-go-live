-- Britium Enterprise Portal Patch 2S
-- Delivery Workflow wiring: preview/open buttons, wayplan detail, assignment, status actions.

begin;

create extension if not exists pgcrypto;

create table if not exists public.wayplans (
  id uuid primary key default gen_random_uuid()
);

alter table public.wayplans
  add column if not exists wayplan_no text,
  add column if not exists route_name text,
  add column if not exists planned_date date default current_date,
  add column if not exists status text default 'draft',
  add column if not exists total_stops int default 0,
  add column if not exists total_cod numeric default 0,
  add column if not exists google_maps_url text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists dispatcher_note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.wayplans
set
  wayplan_no = coalesce(nullif(wayplan_no, ''), 'WP-' || to_char(coalesce(planned_date, current_date), 'YYYYMMDD') || '-' || upper(substr(id::text, 1, 6))),
  route_name = coalesce(nullif(route_name, ''), 'Unnamed Route'),
  planned_date = coalesce(planned_date, current_date),
  status = coalesce(nullif(status, ''), 'draft'),
  total_stops = coalesce(total_stops, 0),
  total_cod = coalesce(total_cod, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists idx_wayplans_wayplan_no
on public.wayplans(wayplan_no);

create index if not exists idx_wayplans_planned_date
on public.wayplans(planned_date);

create index if not exists idx_wayplans_status
on public.wayplans(status);

create table if not exists public.wayplan_stops (
  id uuid primary key default gen_random_uuid(),
  wayplan_id uuid,
  stop_seq int,
  tracking_no text,
  merchant_name text,
  receiver_name text,
  receiver_phone text,
  township text,
  address text,
  cod_amount numeric default 0,
  delivery_fee numeric default 0,
  status text default 'pending',
  rider_name text,
  actual_kg numeric default 0,
  included_kg numeric default 3,
  extra_kg_rate numeric default 500,
  weight_fee numeric default 0,
  latitude numeric,
  longitude numeric,
  google_maps_url text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.wayplan_stops
  add column if not exists wayplan_id uuid,
  add column if not exists stop_seq int,
  add column if not exists tracking_no text,
  add column if not exists merchant_name text,
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists township text,
  add column if not exists address text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists status text default 'pending',
  add column if not exists rider_name text,
  add column if not exists actual_kg numeric default 0,
  add column if not exists included_kg numeric default 3,
  add column if not exists extra_kg_rate numeric default 500,
  add column if not exists weight_fee numeric default 0,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists google_maps_url text,
  add column if not exists note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_wayplan_stops_wayplan
on public.wayplan_stops(wayplan_id);

create index if not exists idx_wayplan_stops_tracking
on public.wayplan_stops(tracking_no);

create index if not exists idx_wayplan_stops_status
on public.wayplan_stops(status);

create table if not exists public.delivery_workflow_events (
  id uuid primary key default gen_random_uuid(),
  wayplan_id uuid,
  stop_id uuid,
  action text not null,
  old_status text,
  new_status text,
  payload jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_workflow_events_wayplan
on public.delivery_workflow_events(wayplan_id);

create index if not exists idx_delivery_workflow_events_created
on public.delivery_workflow_events(created_at desc);

create or replace function public.be_delivery_workflow_snapshot(
  p_planned_date date default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with wp as (
  select
    w.id,
    coalesce(w.wayplan_no, w.id::text) as wayplan_no,
    coalesce(w.route_name, 'Unnamed Route') as route_name,
    w.planned_date,
    coalesce(w.status, 'draft') as status,
    coalesce(w.total_stops, 0) as declared_stops,
    coalesce(w.total_cod, 0) as declared_cod,
    coalesce(w.google_maps_url, '') as google_maps_url,
    coalesce(w.assigned_rider_name, '') as assigned_rider_name,
    coalesce(w.assigned_driver_name, '') as assigned_driver_name,
    coalesce(w.assigned_helper_name, '') as assigned_helper_name,
    coalesce(w.assigned_vehicle_plate, '') as assigned_vehicle_plate,
    coalesce(w.dispatcher_note, '') as dispatcher_note,
    w.updated_at
  from public.wayplans w
  where p_planned_date is null or w.planned_date = p_planned_date
),
enriched as (
  select
    wp.*,
    greatest(wp.declared_stops, coalesce(s.stop_count, 0)) as total_stops,
    greatest(wp.declared_cod, coalesce(s.stop_cod, 0)) as total_cod,
    coalesce(s.selected_stops, 0) as selected_stops
  from wp
  left join lateral (
    select
      count(*)::int as stop_count,
      coalesce(sum(coalesce(ws.cod_amount, 0)), 0) as stop_cod,
      count(*) filter (where lower(coalesce(ws.status, 'pending')) in ('selected', 'assigned', 'in_transit', 'out_for_delivery'))::int as selected_stops
    from public.wayplan_stops ws
    where ws.wayplan_id = wp.id
  ) s on true
),
summary as (
  select
    count(*)::int as routes,
    coalesce(sum(total_stops), 0)::int as stops,
    coalesce(sum(total_cod), 0) as total_cod,
    coalesce(sum(selected_stops), 0)::int as selected_stops
  from enriched
),
preview_stops as (
  select
    ws.id::text as id,
    ws.wayplan_id::text as wayplan_id,
    coalesce(ws.stop_seq, 0) as stop_seq,
    coalesce(ws.tracking_no, '') as tracking_no,
    coalesce(ws.merchant_name, '') as merchant_name,
    coalesce(ws.receiver_name, '') as receiver_name,
    coalesce(ws.receiver_phone, '') as receiver_phone,
    coalesce(ws.township, '') as township,
    coalesce(ws.address, '') as address,
    coalesce(ws.cod_amount, 0) as cod_amount,
    coalesce(ws.delivery_fee, 0) as delivery_fee,
    coalesce(ws.status, 'pending') as status,
    coalesce(ws.rider_name, '') as rider_name,
    coalesce(ws.google_maps_url, '') as google_maps_url
  from public.wayplan_stops ws
  where exists (select 1 from enriched e where e.id = ws.wayplan_id)
  order by ws.wayplan_id, ws.stop_seq nulls last, ws.created_at
  limit 200
)
select jsonb_build_object(
  'summary',
  (select to_jsonb(summary.*) from summary),
  'wayplans',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'wayplan_no', wayplan_no,
          'route_name', route_name,
          'planned_date', planned_date,
          'status', status,
          'total_stops', total_stops,
          'total_cod', total_cod,
          'google_maps_url', google_maps_url,
          'assigned_rider_name', assigned_rider_name,
          'assigned_driver_name', assigned_driver_name,
          'assigned_helper_name', assigned_helper_name,
          'assigned_vehicle_plate', assigned_vehicle_plate,
          'dispatcher_note', dispatcher_note,
          'updated_at', updated_at
        )
        order by planned_date desc nulls last, route_name
      )
      from enriched
    ),
    '[]'::jsonb
  ),
  'preview_stops',
  coalesce((select jsonb_agg(to_jsonb(preview_stops.*)) from preview_stops), '[]'::jsonb),
  'generated_at', now()
);
$$;

create or replace function public.be_delivery_wayplan_detail(
  p_wayplan_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with wp as (
  select
    w.id::text as id,
    coalesce(w.wayplan_no, w.id::text) as wayplan_no,
    coalesce(w.route_name, 'Unnamed Route') as route_name,
    w.planned_date,
    coalesce(w.status, 'draft') as status,
    coalesce(w.total_stops, 0) as declared_stops,
    coalesce(w.total_cod, 0) as declared_cod,
    coalesce(w.google_maps_url, '') as google_maps_url,
    coalesce(w.assigned_rider_name, '') as assigned_rider_name,
    coalesce(w.assigned_driver_name, '') as assigned_driver_name,
    coalesce(w.assigned_helper_name, '') as assigned_helper_name,
    coalesce(w.assigned_vehicle_plate, '') as assigned_vehicle_plate,
    coalesce(w.dispatcher_note, '') as dispatcher_note,
    w.created_at,
    w.updated_at
  from public.wayplans w
  where w.id = p_wayplan_id
),
stops as (
  select
    ws.id::text as id,
    ws.wayplan_id::text as wayplan_id,
    coalesce(ws.stop_seq, 0) as stop_seq,
    coalesce(ws.tracking_no, '') as tracking_no,
    coalesce(ws.merchant_name, '') as merchant_name,
    coalesce(ws.receiver_name, '') as receiver_name,
    coalesce(ws.receiver_phone, '') as receiver_phone,
    coalesce(ws.township, '') as township,
    coalesce(ws.address, '') as address,
    coalesce(ws.cod_amount, 0) as cod_amount,
    coalesce(ws.delivery_fee, 0) as delivery_fee,
    coalesce(ws.actual_kg, 0) as actual_kg,
    coalesce(ws.included_kg, 3) as included_kg,
    greatest(coalesce(ws.actual_kg, 0) - coalesce(ws.included_kg, 3), 0) as extra_kg,
    coalesce(ws.extra_kg_rate, 500) as extra_kg_rate,
    coalesce(ws.weight_fee, greatest(coalesce(ws.actual_kg, 0) - coalesce(ws.included_kg, 3), 0) * coalesce(ws.extra_kg_rate, 500)) as weight_fee,
    coalesce(ws.status, 'pending') as status,
    coalesce(ws.rider_name, '') as rider_name,
    ws.latitude,
    ws.longitude,
    coalesce(ws.google_maps_url, '') as google_maps_url,
    coalesce(ws.note, '') as note,
    ws.updated_at
  from public.wayplan_stops ws
  where ws.wayplan_id = p_wayplan_id
  order by ws.stop_seq nulls last, ws.created_at
),
summary as (
  select
    count(*)::int as stop_count,
    coalesce(sum(cod_amount), 0) as total_cod,
    count(*) filter (where lower(status) in ('delivered', 'completed'))::int as delivered,
    count(*) filter (where lower(status) in ('failed', 'exception', 'cancelled'))::int as exceptions
  from stops
)
select jsonb_build_object(
  'wayplan',
  (select to_jsonb(wp.*) from wp),
  'summary',
  (select to_jsonb(summary.*) from summary),
  'stops',
  coalesce((select jsonb_agg(to_jsonb(stops.*)) from stops), '[]'::jsonb),
  'events',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id::text,
          'wayplan_id', e.wayplan_id::text,
          'stop_id', e.stop_id::text,
          'action', e.action,
          'old_status', e.old_status,
          'new_status', e.new_status,
          'note', e.note,
          'payload', e.payload,
          'created_at', e.created_at
        )
        order by e.created_at desc
      )
      from public.delivery_workflow_events e
      where e.wayplan_id = p_wayplan_id
      limit 50
    ),
    '[]'::jsonb
  ),
  'generated_at', now()
);
$$;

create or replace function public.be_delivery_assign_wayplan(
  p_wayplan_id uuid,
  p_rider_name text default null,
  p_driver_name text default null,
  p_helper_name text default null,
  p_vehicle_plate text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_row jsonb;
begin
  select status into v_old_status from public.wayplans where id = p_wayplan_id;

  update public.wayplans
  set
    assigned_rider_name = coalesce(nullif(p_rider_name, ''), assigned_rider_name),
    assigned_driver_name = coalesce(nullif(p_driver_name, ''), assigned_driver_name),
    assigned_helper_name = coalesce(nullif(p_helper_name, ''), assigned_helper_name),
    assigned_vehicle_plate = coalesce(nullif(p_vehicle_plate, ''), assigned_vehicle_plate),
    dispatcher_note = coalesce(nullif(p_note, ''), dispatcher_note),
    status = 'assigned',
    updated_at = now()
  where id = p_wayplan_id
  returning to_jsonb(public.wayplans.*) into v_row;

  update public.wayplan_stops
  set
    rider_name = coalesce(nullif(p_rider_name, ''), rider_name),
    status = case when lower(coalesce(status, 'pending')) in ('pending', 'draft', 'selected') then 'assigned' else status end,
    updated_at = now()
  where wayplan_id = p_wayplan_id;

  insert into public.delivery_workflow_events (
    wayplan_id,
    action,
    old_status,
    new_status,
    note,
    payload
  )
  values (
    p_wayplan_id,
    'assign_wayplan',
    v_old_status,
    'assigned',
    p_note,
    jsonb_build_object(
      'rider_name', p_rider_name,
      'driver_name', p_driver_name,
      'helper_name', p_helper_name,
      'vehicle_plate', p_vehicle_plate
    )
  );

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_delivery_set_wayplan_status(
  p_wayplan_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_row jsonb;
begin
  select status into v_old_status from public.wayplans where id = p_wayplan_id;

  update public.wayplans
  set
    status = p_status,
    dispatcher_note = coalesce(nullif(p_note, ''), dispatcher_note),
    updated_at = now()
  where id = p_wayplan_id
  returning to_jsonb(public.wayplans.*) into v_row;

  insert into public.delivery_workflow_events (
    wayplan_id,
    action,
    old_status,
    new_status,
    note
  )
  values (
    p_wayplan_id,
    'set_wayplan_status',
    v_old_status,
    p_status,
    p_note
  );

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_delivery_update_stop_status(
  p_stop_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan_id uuid;
  v_old_status text;
  v_row jsonb;
begin
  select wayplan_id, status
  into v_wayplan_id, v_old_status
  from public.wayplan_stops
  where id = p_stop_id;

  update public.wayplan_stops
  set
    status = p_status,
    note = coalesce(nullif(p_note, ''), note),
    updated_at = now()
  where id = p_stop_id
  returning to_jsonb(public.wayplan_stops.*) into v_row;

  insert into public.delivery_workflow_events (
    wayplan_id,
    stop_id,
    action,
    old_status,
    new_status,
    note
  )
  values (
    v_wayplan_id,
    p_stop_id,
    'set_stop_status',
    v_old_status,
    p_status,
    p_note
  );

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_delivery_generate_wayplans_wrapper(
  p_planned_date date default current_date,
  p_source_file text default 'BE_MasterData_April.xlsx',
  p_replace_draft boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('public.be_generate_wayplans(date,text,boolean)') is not null then
    execute 'select * from public.be_generate_wayplans($1, $2, $3)'
    using p_planned_date, p_source_file, p_replace_draft;
  end if;

  insert into public.delivery_workflow_events (
    action,
    new_status,
    note,
    payload
  )
  values (
    'generate_wayplans',
    'generated',
    'Generated from Delivery Workflow screen',
    jsonb_build_object(
      'planned_date', p_planned_date,
      'source_file', p_source_file,
      'replace_draft', p_replace_draft
    )
  );

  return public.be_delivery_workflow_snapshot(p_planned_date);
end;
$$;

grant execute on function public.be_delivery_workflow_snapshot(date) to authenticated;
grant execute on function public.be_delivery_wayplan_detail(uuid) to authenticated;
grant execute on function public.be_delivery_assign_wayplan(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.be_delivery_set_wayplan_status(uuid, text, text) to authenticated;
grant execute on function public.be_delivery_update_stop_status(uuid, text, text) to authenticated;
grant execute on function public.be_delivery_generate_wayplans_wrapper(date, text, boolean) to authenticated;

commit;

select 'Delivery Workflow backend wired for preview/open/details/actions' as status;
