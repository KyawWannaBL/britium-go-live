-- Britium Warehouse Portal backend support
-- Run this in Supabase SQL Editor.
-- Adds warehouse situation logging and backend RPCs used by src/pages/WarehousePage.tsx.

create extension if not exists pgcrypto;

create table if not exists public.warehouse_situation_updates (
  id uuid primary key default gen_random_uuid(),
  way_id text not null,
  row_id uuid null,
  status text not null,
  package_condition text null,
  exception_code text null,
  exception_note text null,
  warehouse_location text null,
  shelf_bin text null,
  handover_to text null,
  warehouse_staff text null,
  evidence_url text null,
  remarks text null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists warehouse_situation_updates_way_id_idx
  on public.warehouse_situation_updates (way_id);

create index if not exists warehouse_situation_updates_created_at_idx
  on public.warehouse_situation_updates (created_at desc);

create table if not exists public.warehouse_bulk_uploads (
  id uuid primary key default gen_random_uuid(),
  original_name text null,
  bucket text null,
  file_path text null,
  row_count integer not null default 0,
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'processed',
  result jsonb not null default '{}'::jsonb,
  uploaded_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists warehouse_bulk_uploads_created_at_idx
  on public.warehouse_bulk_uploads (created_at desc);

create or replace function public.be__table_exists(p_table text)
returns boolean
language sql
stable
as $$
  select to_regclass('public.' || p_table) is not null;
$$;

create or replace function public.be__column_exists(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function public.be__warehouse_update_one(
  p_table text,
  p_match_col text,
  p_match_value text,
  p_target_col text,
  p_value text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_match_value is null or btrim(p_match_value) = '' then
    return 0;
  end if;

  if not public.be__table_exists(p_table) then
    return 0;
  end if;

  if not public.be__column_exists(p_table, p_match_col) then
    return 0;
  end if;

  if not public.be__column_exists(p_table, p_target_col) then
    return 0;
  end if;

  execute format(
    'update public.%I set %I = $1 where %I::text = $2',
    p_table,
    p_target_col,
    p_match_col
  ) using p_value, p_match_value;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
exception when others then
  -- Some deployments use enum/json/timestamp columns. Ignore incompatible column writes
  -- and continue updating other compatible tables/columns.
  return 0;
end;
$$;

create or replace function public.be__warehouse_touch_table(
  p_table text,
  p_match_col text,
  p_match_value text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_match_value is null or btrim(p_match_value) = '' then
    return 0;
  end if;

  if not public.be__table_exists(p_table) then
    return 0;
  end if;

  if not public.be__column_exists(p_table, p_match_col) then
    return 0;
  end if;

  if not public.be__column_exists(p_table, 'updated_at') then
    return 0;
  end if;

  execute format(
    'update public.%I set updated_at = now() where %I::text = $1',
    p_table,
    p_match_col
  ) using p_match_value;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public.be_warehouse_update_situation(
  p_way_id text,
  p_row_id uuid default null,
  p_status text default 'warehouse_received',
  p_package_condition text default null,
  p_exception_code text default null,
  p_exception_note text default null,
  p_warehouse_location text default null,
  p_shelf_bin text default null,
  p_handover_to text default null,
  p_warehouse_staff text default null,
  p_evidence_url text default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_tables text[] := array[
    'cargo_events',
    'delivery_waybills',
    'deliveries',
    'shipments',
    'waybills',
    'pickup_delivery_rows',
    'data_entry_delivery_rows',
    'parcel_events',
    'parcels'
  ];
  v_match_cols text[] := array[
    'id',
    'deliver_way_id',
    'delivery_way_id',
    'tracking_no',
    'tracking_number',
    'awb',
    'waybill_number'
  ];
  v_table text;
  v_match_col text;
  v_match_value text;
  v_updates integer := 0;
  v_payload jsonb;
begin
  if p_way_id is null or btrim(p_way_id) = '' then
    raise exception 'p_way_id is required';
  end if;

  v_payload := jsonb_build_object(
    'way_id', p_way_id,
    'row_id', p_row_id,
    'status', p_status,
    'package_condition', p_package_condition,
    'exception_code', p_exception_code,
    'exception_note', p_exception_note,
    'warehouse_location', p_warehouse_location,
    'shelf_bin', p_shelf_bin,
    'handover_to', p_handover_to,
    'warehouse_staff', p_warehouse_staff,
    'evidence_url', p_evidence_url,
    'remarks', p_remarks,
    'updated_at', now()
  );

  insert into public.warehouse_situation_updates (
    way_id,
    row_id,
    status,
    package_condition,
    exception_code,
    exception_note,
    warehouse_location,
    shelf_bin,
    handover_to,
    warehouse_staff,
    evidence_url,
    remarks,
    payload
  ) values (
    p_way_id,
    p_row_id,
    coalesce(nullif(p_status, ''), 'warehouse_received'),
    nullif(p_package_condition, ''),
    nullif(p_exception_code, ''),
    nullif(p_exception_note, ''),
    nullif(p_warehouse_location, ''),
    nullif(p_shelf_bin, ''),
    nullif(p_handover_to, ''),
    nullif(p_warehouse_staff, ''),
    nullif(p_evidence_url, ''),
    nullif(p_remarks, ''),
    v_payload
  ) returning id into v_log_id;

  foreach v_table in array v_tables loop
    foreach v_match_col in array v_match_cols loop
      if v_match_col = 'id' then
        v_match_value := p_row_id::text;
      else
        v_match_value := p_way_id;
      end if;

      if v_match_value is null or btrim(v_match_value) = '' then
        continue;
      end if;

      -- Status/status-like columns.
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_status', p_status);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'status', p_status);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'current_status', p_status);

      -- Situation columns.
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'package_condition', p_package_condition);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_condition', p_package_condition);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'exception_code', p_exception_code);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_exception_code', p_exception_code);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'exception_note', p_exception_note);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_exception_note', p_exception_note);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_location', p_warehouse_location);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'shelf_bin', p_shelf_bin);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'bin_location', p_shelf_bin);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'shelf', p_shelf_bin);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'handover_to', p_handover_to);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_staff', p_warehouse_staff);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'received_by', p_warehouse_staff);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'evidence_url', p_evidence_url);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'photo_url', p_evidence_url);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_photo_url', p_evidence_url);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'remarks', p_remarks);
      v_updates := v_updates + public.be__warehouse_update_one(v_table, v_match_col, v_match_value, 'warehouse_remarks', p_remarks);
      v_updates := v_updates + public.be__warehouse_touch_table(v_table, v_match_col, v_match_value);
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'log_id', v_log_id,
    'way_id', p_way_id,
    'status', coalesce(nullif(p_status, ''), 'warehouse_received'),
    'target_updates', v_updates,
    'warning', case when v_updates = 0 then 'Situation was logged, but no matching operational row/table was updated. Check Way ID or schema column names.' else null end
  );
end;
$$;

create or replace function public.be_warehouse_bulk_update_rows(
  p_rows jsonb,
  p_original_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_way_id text;
  v_result jsonb;
  v_total integer := 0;
  v_updated integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
  v_upload_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_way_id := coalesce(
      v_row->>'way_id',
      v_row->>'wayId',
      v_row->>'Way ID',
      v_row->>'WayID',
      v_row->>'wayid',
      v_row->>'deliver_way_id',
      v_row->>'delivery_way_id',
      v_row->>'tracking_no'
    );

    if v_way_id is null or btrim(v_way_id) = '' then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object('row', v_total, 'error', 'Missing Way ID'));
      continue;
    end if;

    begin
      v_result := public.be_warehouse_update_situation(
        p_way_id := v_way_id,
        p_row_id := null,
        p_status := coalesce(v_row->>'status', v_row->>'warehouse_status', v_row->>'Warehouse Status', 'warehouse_received'),
        p_package_condition := coalesce(v_row->>'package_condition', v_row->>'Package Condition'),
        p_exception_code := coalesce(v_row->>'exception_code', v_row->>'Exception Code'),
        p_exception_note := coalesce(v_row->>'exception_note', v_row->>'Exception Note'),
        p_warehouse_location := coalesce(v_row->>'warehouse_location', v_row->>'Warehouse Location'),
        p_shelf_bin := coalesce(v_row->>'shelf_bin', v_row->>'Shelf / Bin', v_row->>'Shelf Bin'),
        p_handover_to := coalesce(v_row->>'handover_to', v_row->>'Handover To'),
        p_warehouse_staff := coalesce(v_row->>'warehouse_staff', v_row->>'Warehouse Staff'),
        p_evidence_url := coalesce(v_row->>'evidence_url', v_row->>'Photo / Evidence URL'),
        p_remarks := coalesce(v_row->>'remarks', v_row->>'Remarks')
      );

      v_updated := v_updated + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object('row', v_total, 'way_id', v_way_id, 'error', sqlerrm));
    end;
  end loop;

  insert into public.warehouse_bulk_uploads (
    original_name,
    row_count,
    accepted_count,
    failed_count,
    status,
    result
  ) values (
    p_original_name,
    v_total,
    v_updated,
    v_failed,
    case when v_failed = 0 then 'processed' else 'processed_with_errors' end,
    jsonb_build_object('updated', v_updated, 'failed', v_failed, 'failures', v_failures)
  ) returning id into v_upload_id;

  return jsonb_build_object(
    'ok', true,
    'upload_id', v_upload_id,
    'row_count', v_total,
    'updated', v_updated,
    'failed', v_failed,
    'failures', v_failures
  );
end;
$$;

create or replace function public.be_warehouse_bulk_update_upload(
  p_bucket text,
  p_file_path text,
  p_original_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
begin
  insert into public.warehouse_bulk_uploads (
    original_name,
    bucket,
    file_path,
    status,
    result
  ) values (
    p_original_name,
    p_bucket,
    p_file_path,
    'uploaded_pending_parser',
    jsonb_build_object(
      'message', 'File was registered. Use be_warehouse_bulk_update_rows for immediate parsed-row processing, or attach an Edge Function parser for storage files.',
      'bucket', p_bucket,
      'file_path', p_file_path
    )
  ) returning id into v_upload_id;

  return jsonb_build_object(
    'ok', true,
    'upload_id', v_upload_id,
    'status', 'uploaded_pending_parser',
    'message', 'File registered. For immediate bulk update, send parsed rows to be_warehouse_bulk_update_rows.'
  );
end;
$$;

grant execute on function public.be_warehouse_update_situation(text, uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.be_warehouse_bulk_update_rows(jsonb, text) to authenticated;
grant execute on function public.be_warehouse_bulk_update_upload(text, text, text) to authenticated;

grant select, insert on public.warehouse_situation_updates to authenticated;
grant select, insert on public.warehouse_bulk_uploads to authenticated;
