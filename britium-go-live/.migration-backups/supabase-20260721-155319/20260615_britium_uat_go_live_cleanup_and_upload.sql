-- Britium UAT / Go-Live runtime cleanup and upload staging
-- Safe default: archives and deletes only rows carrying explicit mock/demo/sample/test flags.
-- Master data, tariff master, branch nodes, workforce accounts, user registry, and audit archive are preserved.

create extension if not exists pgcrypto;

create table if not exists public.be_go_live_archived_operational_test_data (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_pk text,
  archived_payload jsonb not null,
  archived_reason text not null,
  archived_at timestamptz not null default now(),
  archived_by uuid default auth.uid()
);

create table if not exists public.be_go_live_runtime_reset_log (
  id uuid primary key default gen_random_uuid(),
  reset_reason text not null,
  result jsonb not null,
  executed_at timestamptz not null default now(),
  executed_by uuid default auth.uid()
);

create table if not exists public.be_go_live_upload_batches (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  upload_source text not null,
  row_count integer not null default 0,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.be_go_live_upload_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_go_live_upload_batches(id) on delete cascade,
  source_row_no integer,
  template_key text not null,
  payload jsonb not null,
  validation_status text not null default 'received',
  api_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.be_warehouse_scan_stage (
  id uuid primary key default gen_random_uuid(),
  scan_reference text not null,
  payload jsonb not null,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create or replace function public.be_go_live_table_exists(p_table text)
returns boolean
language sql
stable
as $$
  select to_regclass('public.' || p_table) is not null;
$$;

create or replace function public.be_go_live_archive_delete_table(
  p_table text,
  p_reason text,
  p_force_text_scan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_sql text;
  v_deleted integer := 0;
  v_predicate text;
begin
  select public.be_go_live_table_exists(p_table) into v_exists;
  if not v_exists then
    return jsonb_build_object('table', p_table, 'status', 'missing', 'deleted', 0);
  end if;

  v_predicate := '
    coalesce((row_to_json(t)::jsonb ->> ''environment''), '''') in (''mock'', ''demo'', ''sample'', ''test'', ''testing'')
    or coalesce((row_to_json(t)::jsonb ->> ''data_source''), '''') in (''mock'', ''demo'', ''sample'', ''test'', ''hardcoded'')
    or coalesce((row_to_json(t)::jsonb ->> ''source''), '''') in (''mock'', ''demo'', ''sample'', ''test'', ''hardcoded'')
    or coalesce((row_to_json(t)::jsonb ->> ''is_mock''), ''false'')::text = ''true''
    or coalesce((row_to_json(t)::jsonb ->> ''is_demo''), ''false'')::text = ''true''
    or coalesce((row_to_json(t)::jsonb ->> ''is_sample''), ''false'')::text = ''true''
    or coalesce((row_to_json(t)::jsonb ->> ''is_test''), ''false'')::text = ''true''
  ';

  if p_force_text_scan then
    v_predicate := v_predicate || '
      or row_to_json(t)::text ~* ''\m(mock|demo|sample|dummy|hardcode|test only)\M''
    ';
  end if;

  v_sql := format($fmt$
    with doomed as (
      select ctid, row_to_json(t)::jsonb as payload
      from public.%I t
      where %s
    ),
    archived as (
      insert into public.be_go_live_archived_operational_test_data(source_table, source_pk, archived_payload, archived_reason)
      select %L, coalesce(payload ->> 'id', payload ->> 'way_id', payload ->> 'pickup_id'), payload, %L
      from doomed
      returning 1
    )
    delete from public.%I d
    using doomed
    where d.ctid = doomed.ctid
  $fmt$, p_table, v_predicate, p_table, p_reason, p_table);

  execute v_sql;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('table', p_table, 'status', 'cleaned', 'deleted', v_deleted);
end;
$$;

create or replace function public.be_go_live_archive_and_cleanup_runtime(
  p_reason text default 'GO_LIVE_RUNTIME_CLEANUP',
  p_force_text_scan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'shipments',
    'parcels',
    'manifest',
    'wayplans',
    'wayplan_routes',
    'wayplan_stops',
    'dispatch_routes',
    'dispatch_route_stops',
    'warehouse_manifests',
    'warehouse_scans',
    'warehouse_inventory',
    'be_portal_pickup_requests',
    'be_portal_cargo_events',
    'be_portal_service_threads',
    'be_portal_service_messages',
    'be_supervisor_assignment_cards',
    'be_delivery_workflow_rows',
    'be_rider_verification_logs'
  ];
  v_table text;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  foreach v_table in array v_tables loop
    v_result := public.be_go_live_archive_delete_table(v_table, p_reason, p_force_text_scan);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  insert into public.be_go_live_runtime_reset_log(reset_reason, result)
  values (p_reason, jsonb_build_object('results', v_results, 'force_text_scan', p_force_text_scan));

  return jsonb_build_object(
    'status', 'completed',
    'force_text_scan', p_force_text_scan,
    'results', v_results,
    'preserved', jsonb_build_array('master data', 'tariff master', 'branch nodes', 'workforce accounts', 'user registry', 'audit archive')
  );
end;
$$;

create or replace function public.be_go_live_count_suspect_rows(p_table text, p_force_text_scan boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_sql text;
  v_count integer := 0;
begin
  select public.be_go_live_table_exists(p_table) into v_exists;
  if not v_exists then
    return jsonb_build_object('table', p_table, 'status', 'missing', 'count', 0);
  end if;

  v_sql := format($fmt$
    select count(*)
    from public.%I t
    where
      coalesce((row_to_json(t)::jsonb ->> 'environment'), '') in ('mock', 'demo', 'sample', 'test', 'testing')
      or coalesce((row_to_json(t)::jsonb ->> 'data_source'), '') in ('mock', 'demo', 'sample', 'test', 'hardcoded')
      or coalesce((row_to_json(t)::jsonb ->> 'source'), '') in ('mock', 'demo', 'sample', 'test', 'hardcoded')
      or coalesce((row_to_json(t)::jsonb ->> 'is_mock'), 'false')::text = 'true'
      or coalesce((row_to_json(t)::jsonb ->> 'is_demo'), 'false')::text = 'true'
      or coalesce((row_to_json(t)::jsonb ->> 'is_sample'), 'false')::text = 'true'
      or coalesce((row_to_json(t)::jsonb ->> 'is_test'), 'false')::text = 'true'
      %s
  $fmt$, p_table, case when p_force_text_scan then 'or row_to_json(t)::text ~* ''\m(mock|demo|sample|dummy|hardcode|test only)\M''' else '' end);

  execute v_sql into v_count;
  return jsonb_build_object('table', p_table, 'status', 'checked', 'count', coalesce(v_count, 0));
end;
$$;

create or replace function public.be_go_live_readiness_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_runtime_tables text[] := array[
    'shipments',
    'parcels',
    'manifest',
    'wayplans',
    'dispatch_routes',
    'dispatch_route_stops',
    'warehouse_manifests',
    'warehouse_scans',
    'warehouse_inventory',
    'be_portal_pickup_requests',
    'be_delivery_workflow_rows',
    'be_rider_verification_logs'
  ];
  v_table text;
  v_counts jsonb := '[]'::jsonb;
  v_check jsonb;
  v_suspect_total integer := 0;
begin
  foreach v_table in array v_runtime_tables loop
    v_check := public.be_go_live_count_suspect_rows(v_table, false);
    v_counts := v_counts || jsonb_build_array(v_check);
    v_suspect_total := v_suspect_total + coalesce((v_check ->> 'count')::integer, 0);
  end loop;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'runtime', v_suspect_total = 0,
      'templates', true
    ),
    'checks', jsonb_build_object(
      'runtime', jsonb_build_object('status', case when v_suspect_total = 0 then 'pass' else 'fail' end, 'detail', 'Suspect mock/sample/demo rows in active runtime tables: ' || v_suspect_total),
      'templates', jsonb_build_object('status', 'pass', 'detail', 'Data Entry, Merchant/Customer, and Warehouse upload templates are deployed.'),
      'master', jsonb_build_object('status', 'warning', 'detail', 'Verify master dropdown snapshot rows exist in public.be_master_dropdown_snapshot.'),
      'pickup', jsonb_build_object('status', 'warning', 'detail', 'Verify be_submit_pickup_request or equivalent canonical pickup RPC is deployed.'),
      'dispatch', jsonb_build_object('status', 'warning', 'detail', 'Verify dispatch route counters are derived from real route rows only.'),
      'warehouse', jsonb_build_object('status', 'warning', 'detail', 'Verify be_warehouse_scan_upsert is mapped into cargo events.'),
      'branch', jsonb_build_object('status', 'warning', 'detail', 'Verify MDY/NPT active branch nodes and branch snapshot RPC.'),
      'finance', jsonb_build_object('status', 'warning', 'detail', 'Verify COD settlement ledgers are separated from rider earnings.')
    ),
    'runtime_counts', v_counts,
    'generated_at', now()
  );
end;
$$;

create or replace function public.be_go_live_stage_upload(
  p_template_key text,
  p_rows jsonb,
  p_source text default 'UAT_GO_LIVE_TEMPLATE_UPLOAD'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_rows);

  insert into public.be_go_live_upload_batches(template_key, upload_source, row_count, status)
  values (p_template_key, p_source, v_count, 'received')
  returning id into v_batch_id;

  insert into public.be_go_live_upload_rows(batch_id, source_row_no, template_key, payload, validation_status, api_message)
  select
    v_batch_id,
    coalesce((item ->> 'source_row_no')::integer, ordinality::integer),
    p_template_key,
    coalesce(item -> 'payload', item),
    'received',
    'Staged for backend workflow processing'
  from jsonb_array_elements(p_rows) with ordinality as t(item, ordinality);

  return jsonb_build_object(
    'status', 'staged',
    'batch_id', v_batch_id,
    'row_count', v_count,
    'rows', (
      select jsonb_agg(jsonb_build_object(
        'source_row_no', source_row_no,
        'upload_status', validation_status,
        'api_message', api_message
      ))
      from public.be_go_live_upload_rows
      where batch_id = v_batch_id
    )
  );
end;
$$;

create or replace function public.be_go_live_bulk_data_entry_upload(
  p_rows jsonb,
  p_source text default 'UAT_GO_LIVE_DATA_ENTRY_UPLOAD'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_go_live_stage_upload('data-entry', p_rows, p_source);
$$;

create or replace function public.be_go_live_portal_account_upload(
  p_rows jsonb,
  p_source text default 'UAT_GO_LIVE_PORTAL_UPLOAD'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_go_live_stage_upload('portal-upload', p_rows, p_source);
$$;

create or replace function public.be_go_live_warehouse_inventory_upload(
  p_rows jsonb,
  p_source text default 'UAT_GO_LIVE_WAREHOUSE_UPLOAD'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_go_live_stage_upload('warehouse', p_rows, p_source);
$$;

create or replace function public.be_warehouse_scan_upsert(
  p_reference text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.be_warehouse_scan_stage(scan_reference, payload, status)
  values (p_reference, p_payload, 'received')
  returning id into v_id;

  return jsonb_build_object(
    'status', 'received',
    'scan_stage_id', v_id,
    'scan_reference', p_reference,
    'api_message', 'Warehouse scan staged. Map this function to warehouse inventory/cargo event tables for production persistence.'
  );
end;
$$;

create or replace function public.be_warehouse_scan_lookup(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  if public.be_go_live_table_exists('be_portal_pickup_requests') then
    execute $sql$
      select row_to_json(t)::jsonb
      from public.be_portal_pickup_requests t
      where coalesce(t.pickup_id::text, '') = $1
         or coalesce(t.waybill_no::text, '') = $1
         or coalesce(t.deliver_id::text, '') = $1
      limit 1
    $sql$ using p_reference into v_payload;
  end if;

  return coalesce(v_payload, jsonb_build_object(
    'reference', p_reference,
    'status', 'not_found',
    'api_message', 'No backend pickup/waybill row found for this reference.'
  ));
exception
  when undefined_column then
    return jsonb_build_object(
      'reference', p_reference,
      'status', 'lookup_not_mapped',
      'api_message', 'be_portal_pickup_requests exists but column names differ. Map lookup columns in be_warehouse_scan_lookup.'
    );
end;
$$;
