-- Final production guard for non-live operational rows.
-- Scope is intentionally limited to workflow/runtime tables. Master data,
-- tariff master, township lists, merchant master, and workforce master are not
-- updated here.

create or replace function public.be_go_live_is_non_live_payload(p_row jsonb)
returns boolean
language sql
immutable
as $$
  with fields as (
    select
      lower(coalesce(p_row::text, '')) as full_text,
      lower(concat_ws(' ',
        p_row->>'source',
        p_row->>'source_portal',
        p_row->>'sync_source',
        p_row->>'data_source',
        p_row->>'record_source',
        p_row->>'origin',
        p_row->>'environment',
        p_row->>'dataset',
        p_row->>'seed_source',
        p_row->>'status',
        p_row->>'record_status',
        p_row->>'validation_status',
        p_row->>'assignment_status'
      )) as source_text,
      lower(concat_ws(' ',
        p_row->>'id',
        p_row->>'pickup_id',
        p_row->>'pickup_way_id',
        p_row->>'request_id',
        p_row->>'delivery_id',
        p_row->>'deliver_way_id',
        p_row->>'delivery_way_id',
        p_row->>'waybill_id',
        p_row->>'waybill_no',
        p_row->>'tracking_no',
        p_row->>'invoice_no',
        p_row->>'settlement_id',
        p_row->>'batch_id'
      )) as id_text
  )
  select
    full_text ~ '(archived_test_data|archived_uploaded_sample_removed_for_production|sample_operational|mock_operational|demo_operational|test_operational|placeholder\.co)'
    or source_text ~ '\m(sample|mock|demo|dummy|fake|faker|test|training|sandbox)\M'
    or id_text ~ '(^|\s)(sample|mock|demo|dummy|test|sandbox)[-_:/]'
  from fields;
$$;

revoke all on function public.be_go_live_is_non_live_payload(jsonb) from public;
grant execute on function public.be_go_live_is_non_live_payload(jsonb) to authenticated;

create or replace function public.be_go_live_isolation_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_schema text;
  v_name text;
  v_exists boolean;
  v_count integer;
  v_examples jsonb;
  v_tables jsonb := '[]'::jsonb;
  v_invalid_pickups jsonb := '[]'::jsonb;
  v_invalid_waybills jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to inspect go-live isolation.';
  end if;

  foreach v_table in array array[
    'public.be_portal_pickup_requests',
    'public.be_portal_cargo_events',
    'public.shipments',
    'public.deliveries',
    'public.delivery_waybills',
    'public.be_delivery_jobs',
    'public.be_data_entry_parcels',
    'public.cod_collections',
    'public.cod_settlement_batches',
    'public.be_supervisor_wayplans',
    'public.be_supervisor_job_assignments',
    'public.be_wayplans',
    'public.be_wayplan_items',
    'public.be_finance_events',
    'public.be_employee_wallet_transactions'
  ] loop
    v_schema := split_part(v_table, '.', 1);
    v_name := split_part(v_table, '.', 2);

    select exists (
      select 1
      from information_schema.tables
      where table_schema = v_schema
        and table_name = v_name
    ) into v_exists;

    if not v_exists then
      continue;
    end if;

    execute format(
      'select count(*) from %I.%I t where coalesce(to_jsonb(t)->>''status'', '''') <> ''archived_test_data'' and public.be_go_live_is_non_live_payload(to_jsonb(t))',
      v_schema,
      v_name
    ) into v_count;

    execute format(
      'select coalesce(jsonb_agg(row_payload), ''[]''::jsonb)
       from (
         select to_jsonb(t) - ''payload'' - ''metadata'' - ''source_payload'' as row_payload
         from %I.%I t
         where coalesce(to_jsonb(t)->>''status'', '''') <> ''archived_test_data''
           and public.be_go_live_is_non_live_payload(to_jsonb(t))
         limit 5
       ) examples',
      v_schema,
      v_name
    ) into v_examples;

    v_tables := v_tables || jsonb_build_array(jsonb_build_object(
      'table', v_table,
      'non_live_rows', coalesce(v_count, 0),
      'examples', coalesce(v_examples, '[]'::jsonb)
    ));
  end loop;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'pickup_id', pickup_id,
      'status', status,
      'assignment_status', assignment_status,
      'merchant_code', merchant_code,
      'created_at', created_at
    )), '[]'::jsonb)
    into v_invalid_pickups
    from public.be_portal_pickup_requests
    where coalesce(status, '') <> 'archived_test_data'
      and (
        pickup_id is null
        or pickup_id !~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
        or public.be_go_live_is_non_live_payload(to_jsonb(be_portal_pickup_requests))
      );
  end if;

  if to_regclass('public.be_portal_cargo_events') is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'pickup_id', pickup_id,
      'deliver_way_id', coalesce(deliver_way_id, tracking_no),
      'status', status,
      'created_at', created_at
    )), '[]'::jsonb)
    into v_invalid_waybills
    from public.be_portal_cargo_events
    where coalesce(status, '') <> 'archived_test_data'
      and event_type = 'data_entry_waybill'
      and (
        coalesce(deliver_way_id, tracking_no, '') !~ '^D[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
        or public.be_go_live_is_non_live_payload(to_jsonb(be_portal_cargo_events))
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'master_data_untouched', true,
    'operational_tables', v_tables,
    'active_invalid_pickup_ids', v_invalid_pickups,
    'active_invalid_waybills', v_invalid_waybills
  );
end;
$$;

revoke all on function public.be_go_live_isolation_report() from public;
grant execute on function public.be_go_live_isolation_report() to authenticated;

create or replace function public.be_go_live_archive_mock_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_schema text;
  v_name text;
  v_exists boolean;
  v_has_status boolean;
  v_has_assignment_status boolean;
  v_has_payload boolean;
  v_has_metadata boolean;
  v_has_updated_at boolean;
  v_set text[];
  v_sql text;
  v_updated integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to archive non-live operational rows.';
  end if;

  foreach v_table in array array[
    'public.be_portal_pickup_requests',
    'public.be_portal_cargo_events',
    'public.shipments',
    'public.deliveries',
    'public.delivery_waybills',
    'public.be_delivery_jobs',
    'public.be_data_entry_parcels',
    'public.cod_collections',
    'public.cod_settlement_batches',
    'public.be_supervisor_wayplans',
    'public.be_supervisor_job_assignments',
    'public.be_wayplans',
    'public.be_wayplan_items',
    'public.be_finance_events',
    'public.be_employee_wallet_transactions'
  ] loop
    v_schema := split_part(v_table, '.', 1);
    v_name := split_part(v_table, '.', 2);

    select exists (
      select 1
      from information_schema.tables
      where table_schema = v_schema
        and table_name = v_name
    ) into v_exists;

    if not v_exists then
      continue;
    end if;

    select exists (select 1 from information_schema.columns where table_schema = v_schema and table_name = v_name and column_name = 'status') into v_has_status;
    select exists (select 1 from information_schema.columns where table_schema = v_schema and table_name = v_name and column_name = 'assignment_status') into v_has_assignment_status;
    select exists (select 1 from information_schema.columns where table_schema = v_schema and table_name = v_name and column_name = 'payload' and udt_name = 'jsonb') into v_has_payload;
    select exists (select 1 from information_schema.columns where table_schema = v_schema and table_name = v_name and column_name = 'metadata' and udt_name = 'jsonb') into v_has_metadata;
    select exists (select 1 from information_schema.columns where table_schema = v_schema and table_name = v_name and column_name = 'updated_at') into v_has_updated_at;

    v_set := array[]::text[];
    if v_has_status then
      v_set := v_set || 'status = ''archived_test_data''';
    end if;
    if v_has_assignment_status then
      v_set := v_set || 'assignment_status = ''archived_test_data''';
    end if;
    if v_has_payload then
      v_set := v_set || 'payload = coalesce(payload, ''{}''::jsonb) || jsonb_build_object(''archived_reason'', ''go_live_mock_sample_test_isolation'', ''archived_at'', now())';
    end if;
    if v_has_metadata then
      v_set := v_set || 'metadata = coalesce(metadata, ''{}''::jsonb) || jsonb_build_object(''archived_reason'', ''go_live_mock_sample_test_isolation'', ''archived_at'', now())';
    end if;
    if v_has_updated_at then
      v_set := v_set || 'updated_at = now()';
    end if;

    if array_length(v_set, 1) is null then
      continue;
    end if;

    v_sql := format(
      'update %I.%I t set %s where coalesce(to_jsonb(t)->>''status'', '''') <> ''archived_test_data'' and public.be_go_live_is_non_live_payload(to_jsonb(t))',
      v_schema,
      v_name,
      array_to_string(v_set, ', ')
    );

    begin
      execute v_sql;
      get diagnostics v_updated = row_count;
      v_total := v_total + v_updated;
      v_results := v_results || jsonb_build_array(jsonb_build_object('table', v_table, 'archived_rows', v_updated));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object('table', v_table, 'error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'master_data_untouched', true,
    'archived_total', v_total,
    'tables', v_results
  );
end;
$$;

revoke all on function public.be_go_live_archive_mock_operational_data() from public;
grant execute on function public.be_go_live_archive_mock_operational_data() to authenticated;

notify pgrst, 'reload schema';
