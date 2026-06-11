-- Britium Enterprise Portal + Rider App Go-Live Wire-Up Patch 4A
-- Adds rider/mobile compatibility RPCs, COD/finance/warehouse/timeline tables,
-- and a JSONB bulk-load receiver for web Excel upload workflows.

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  way_id text,
  delivery_id text,
  event_type text not null default 'event',
  status text,
  source text default 'portal',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  delivery_id text,
  rider_id text,
  rider_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  status text default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_financial_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_ref text unique default ('SET-' || to_char(now(), 'YYYYMMDDHH24MISSMS')),
  pickup_id text,
  delivery_id text,
  rider_id text,
  finance_user text,
  cod_amount numeric default 0,
  received_amount numeric default 0,
  variance numeric generated always as (coalesce(received_amount,0) - coalesce(cod_amount,0)) stored,
  status text default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_warehouse_parcel_status (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  delivery_id text,
  warehouse_code text,
  status text default 'warehouse_received',
  scan_status text,
  bag_id text,
  shelf_code text,
  actor_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_parcel_status_timeline (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  delivery_id text,
  status text not null,
  department text,
  actor_name text,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.be_bulk_upload_batches (
  id uuid primary key default gen_random_uuid(),
  batch_type text not null default 'data_entry',
  pickup_id text,
  file_name text,
  uploaded_by text,
  row_count integer default 0,
  status text default 'uploaded',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_bulk_upload_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_bulk_upload_batches(id) on delete cascade,
  pickup_id text,
  delivery_id text,
  row_number integer,
  row_status text default 'draft',
  row_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.be_delivery_app_action(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text := coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id', p_payload->>'way_id', p_payload->>'id');
  v_delivery_id text := coalesce(p_payload->>'delivery_id', p_payload->>'deliver_way_id', p_payload->>'tracking_no');
  v_status text := case p_action
    when 'accept' then 'accepted'
    when 'start_order_picking' then 'order_picking_started'
    when 'start_delivery' then 'delivery_started'
    when 'delivered' then 'delivered'
    when 'fail' then 'failed'
    else p_action
  end;
begin
  insert into public.be_portal_cargo_events(pickup_id, pickup_way_id, way_id, delivery_id, event_type, status, source, payload)
  values (v_pickup_id, v_pickup_id, v_pickup_id, v_delivery_id, p_action, v_status, 'be_delivery_app_action', p_payload);

  insert into public.be_parcel_status_timeline(pickup_id, delivery_id, status, department, actor_name, note, payload)
  values (v_pickup_id, v_delivery_id, v_status, coalesce(p_payload->>'role', 'rider'), coalesce(p_payload->>'rider_name', p_payload->>'driver_name', p_payload->>'helper_name', p_payload->>'action_by'), p_action, p_payload);

  return jsonb_build_object('ok', true, 'action', p_action, 'status', v_status, 'pickup_id', v_pickup_id, 'delivery_id', v_delivery_id);
end;
$$;

create or replace function public.be_mobile_update_job_status(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.be_delivery_app_action(coalesce(p_payload->>'action', p_payload->>'status', 'status_update'), p_payload);
end;
$$;

create or replace function public.be_rider_save_verification(p_stage text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text := coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id', p_payload->>'way_id');
  v_delivery_id text := coalesce(p_payload->>'delivery_id', p_payload->>'deliver_way_id', p_payload->>'tracking_no');
  v_status text := case when p_stage = 'pickup' then 'pickup_verified' else 'delivery_verified' end;
begin
  insert into public.be_portal_cargo_events(pickup_id, pickup_way_id, way_id, delivery_id, event_type, status, source, payload)
  values (v_pickup_id, v_pickup_id, v_pickup_id, v_delivery_id, p_stage || '_verification', v_status, 'be_rider_save_verification', p_payload);

  insert into public.be_parcel_status_timeline(pickup_id, delivery_id, status, department, actor_name, note, payload)
  values (v_pickup_id, v_delivery_id, v_status, coalesce(p_payload->>'role', 'rider'), coalesce(p_payload->>'rider_name', p_payload->>'action_by'), coalesce(p_payload->>'acknowledgement_note', p_stage || ' saved'), p_payload);

  if p_stage = 'delivery' and coalesce((p_payload->>'chargeable_weight_kg')::numeric, 0) >= 0 then
    insert into public.be_warehouse_parcel_status(pickup_id, delivery_id, status, scan_status, actor_name, payload)
    values (v_pickup_id, v_delivery_id, 'out_for_delivery', 'mobile_verified', coalesce(p_payload->>'rider_name', p_payload->>'action_by'), p_payload)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'stage', p_stage, 'status', v_status, 'pickup_id', v_pickup_id, 'delivery_id', v_delivery_id);
end;
$$;


create or replace function public.be_rider_enterprise_finance_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cod_ledger', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.be_cod_ledger c limit 200), '[]'::jsonb),
    'financial_settlements', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.be_financial_settlements f limit 200), '[]'::jsonb),
    'pending_cod', coalesce((select sum(cod_amount) from public.be_cod_ledger where status not in ('handed_over','settled')), 0),
    'payload', p_payload
  );
$$;

create or replace function public.be_mobile_go_live_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := lower(nullif(p_payload->>'search', ''));
  v_jobs jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(t) order by coalesce(t.created_at, now()) desc), '[]'::jsonb)
      from (
        select * from public.be_portal_pickup_requests limit 250
      ) t
    $q$ into v_jobs;
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from public.be_portal_cargo_events e
  where v_search is null or lower(coalesce(e.pickup_id,'') || ' ' || coalesce(e.delivery_id,'') || ' ' || e.event_type || ' ' || coalesce(e.status,'')) like '%' || v_search || '%'
  limit 500;

  if v_search is not null then
    v_jobs := coalesce((
      select jsonb_agg(job)
      from jsonb_array_elements(v_jobs) job
      where lower(job::text) like '%' || v_search || '%'
    ), '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'source', 'be_mobile_go_live_snapshot',
    'jobs', v_jobs,
    'events', v_events,
    'finance', public.be_rider_enterprise_finance_snapshot(p_payload),
    'warehouse_statuses', (select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb) from public.be_warehouse_parcel_status w limit 300),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from public.be_parcel_status_timeline t limit 500)
  );
end;
$$;

create or replace function public.be_rider_enterprise_finance_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cod_ledger', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.be_cod_ledger c limit 200), '[]'::jsonb),
    'financial_settlements', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.be_financial_settlements f limit 200), '[]'::jsonb),
    'pending_cod', coalesce((select sum(cod_amount) from public.be_cod_ledger where status not in ('handed_over','settled')), 0),
    'payload', p_payload
  );
$$;

create or replace function public.be_rider_cod_finance_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := coalesce(p_payload->>'action', 'collect_cod');
  v_pickup_id text := coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id');
  v_delivery_id text := coalesce(p_payload->>'delivery_id', p_payload->>'deliver_way_id');
  v_amount numeric := coalesce(nullif(p_payload->>'amount','')::numeric, nullif(p_payload->>'cod_amount','')::numeric, 0);
begin
  if v_action in ('collect_cod','collect') then
    insert into public.be_cod_ledger(pickup_id, delivery_id, rider_id, rider_name, cod_amount, collected_amount, status, payload)
    values (v_pickup_id, v_delivery_id, p_payload->>'rider_id', p_payload->>'rider_name', v_amount, v_amount, 'collected', p_payload);
  elsif v_action in ('handover_to_finance','handover') then
    insert into public.be_financial_settlements(pickup_id, delivery_id, rider_id, finance_user, cod_amount, received_amount, status, payload)
    values (v_pickup_id, v_delivery_id, p_payload->>'rider_id', p_payload->>'finance_user', v_amount, v_amount, 'received', p_payload);
    update public.be_cod_ledger set status = 'handed_over', updated_at = now() where pickup_id = v_pickup_id and (v_delivery_id is null or delivery_id = v_delivery_id);
  end if;

  return jsonb_build_object('ok', true, 'action', v_action, 'pickup_id', v_pickup_id, 'delivery_id', v_delivery_id, 'amount', v_amount);
end;
$$;

create or replace function public.be_rider_parcel_status_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(p_payload->>'status', p_payload->>'action', 'status_update');
  v_pickup_id text := coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id');
  v_delivery_id text := coalesce(p_payload->>'delivery_id', p_payload->>'deliver_way_id');
begin
  insert into public.be_parcel_status_timeline(pickup_id, delivery_id, status, department, actor_name, note, payload)
  values (v_pickup_id, v_delivery_id, v_status, coalesce(p_payload->>'department', 'warehouse'), coalesce(p_payload->>'actor_name', p_payload->>'rider_name'), p_payload->>'note', p_payload);

  if v_status in ('picked_from_merchant','warehouse_received','sorting','bagged','out_for_delivery','delivered') then
    insert into public.be_warehouse_parcel_status(pickup_id, delivery_id, warehouse_code, status, scan_status, bag_id, shelf_code, actor_name, payload)
    values (v_pickup_id, v_delivery_id, p_payload->>'warehouse_code', v_status, p_payload->>'scan_status', p_payload->>'bag_id', p_payload->>'shelf_code', coalesce(p_payload->>'actor_name', p_payload->>'rider_name'), p_payload);
  end if;

  return jsonb_build_object('ok', true, 'status', v_status, 'pickup_id', v_pickup_id, 'delivery_id', v_delivery_id);
end;
$$;

create or replace function public.be_bulk_load_data_entry(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_index integer := 0;
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_pickup_id text := coalesce(p_payload->>'pickup_way_id', p_payload->>'pickup_id');
begin
  insert into public.be_bulk_upload_batches(batch_type, pickup_id, file_name, uploaded_by, row_count, status, payload)
  values (coalesce(p_payload->>'batch_type', 'data_entry'), v_pickup_id, p_payload->>'file_name', p_payload->>'uploaded_by', jsonb_array_length(v_rows), 'uploaded', p_payload - 'rows')
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_index := v_index + 1;
    insert into public.be_bulk_upload_rows(batch_id, pickup_id, delivery_id, row_number, row_status, row_payload)
    values (v_batch_id, coalesce(v_row->>'pickup_way_id', v_row->>'pickup_id', v_pickup_id), coalesce(v_row->>'deliver_way_id', v_row->>'delivery_id'), v_index, coalesce(v_row->>'status', 'draft'), v_row);
  end loop;

  return jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'row_count', v_index, 'pickup_id', v_pickup_id);
end;
$$;

comment on function public.be_mobile_go_live_snapshot(jsonb) is 'Go-live rider/mobile snapshot. Returns jobs, events, finance, warehouse and status timeline JSON.';
comment on function public.be_delivery_app_action(text,jsonb) is 'Rider app action endpoint: accept, start_order_picking, start_delivery, delivered, fail.';
comment on function public.be_rider_save_verification(text,jsonb) is 'Persists pickup/delivery photo, QR, weight, volume, GPS and signature evidence.';
comment on function public.be_bulk_load_data_entry(jsonb) is 'Accepts parsed Excel bulk-load rows from the Data Entry Registration Workspace.';
