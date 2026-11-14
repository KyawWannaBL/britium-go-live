-- Pre-go-live readiness isolation v1
-- Applied production migration version: 20260901235739.
--
-- This migration does not update, delete, archive, cancel, settle, or lock any
-- operational row. It records the cutover boundary and the non-sensitive
-- operational identifiers that already existed at cutover, then excludes that
-- pre-go-live UAT scope from the primary readiness/snapshot RPCs.

create schema if not exists private;

create table if not exists private.be_golive_readiness_cutovers_v1 (
  cutover_id uuid primary key default gen_random_uuid(),
  cutover_code text not null unique,
  cutoff_at timestamptz not null default clock_timestamp(),
  reason text not null,
  target_table_count integer not null default 0,
  existing_table_count integer not null default 0,
  nonempty_table_count integer not null default 0,
  isolated_row_count bigint not null default 0,
  isolated_key_count bigint not null default 0,
  created_by text not null default current_user,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.be_golive_readiness_scope_v1 (
  cutover_id uuid not null references private.be_golive_readiness_cutovers_v1(cutover_id),
  table_schema text not null default 'public',
  table_name text not null,
  category text not null,
  row_count bigint not null default 0,
  primary key (cutover_id, table_schema, table_name)
);

create table if not exists private.be_golive_readiness_keys_v1 (
  cutover_id uuid not null references private.be_golive_readiness_cutovers_v1(cutover_id),
  key_kind text not null,
  key_value text not null,
  source_table text not null,
  primary key (cutover_id, key_kind, key_value, source_table)
);

create index if not exists be_golive_readiness_keys_v1_value_idx
  on private.be_golive_readiness_keys_v1 (key_value);

revoke all on table private.be_golive_readiness_cutovers_v1 from public, anon, authenticated;
revoke all on table private.be_golive_readiness_scope_v1 from public, anon, authenticated;
revoke all on table private.be_golive_readiness_keys_v1 from public, anon, authenticated;
grant all on table private.be_golive_readiness_cutovers_v1 to service_role;
grant all on table private.be_golive_readiness_scope_v1 to service_role;
grant all on table private.be_golive_readiness_keys_v1 to service_role;

insert into private.be_golive_readiness_cutovers_v1 (
  cutover_code,
  reason,
  metadata
)
values (
  'PRE_GOLIVE_UAT_20260901',
  'Exclude all transactional/runtime records that existed before the controlled go-live cutover',
  jsonb_build_object(
    'mode', 'READINESS_ONLY',
    'rows_updated', 0,
    'rows_deleted', 0,
    'statuses_changed', 0,
    'triggers_disabled', false,
    'rls_changed', false,
    'master_data_untouched', true,
    'workforce_auth_untouched', true,
    'configuration_untouched', true,
    'governance_audit_untouched', true,
    'existing_archives_untouched', true
  )
)
on conflict (cutover_code) do nothing;

with cutover as (
  select cutover_id
  from private.be_golive_readiness_cutovers_v1
  where cutover_code = 'PRE_GOLIVE_UAT_20260901'
)
insert into private.be_golive_readiness_scope_v1 (
  cutover_id,
  table_schema,
  table_name,
  category
)
select cutover.cutover_id, 'public', v.table_name, v.category
from cutover
cross join (values
  ('be_bulk_upload_batches', 'data_entry'),
  ('be_bulk_upload_rows', 'data_entry'),
  ('be_data_entry_parcel_details', 'data_entry'),
  ('be_data_entry_register_batches', 'data_entry'),
  ('be_data_entry_register_rows', 'data_entry'),
  ('be_data_entry_registration_lines', 'data_entry'),
  ('be_data_entry_waybills', 'data_entry'),
  ('be_data_entry_needs_fix_v25', 'data_entry'),
  ('data_entry_excel_upload_batches', 'data_entry'),
  ('data_entry_excel_upload_rows', 'data_entry'),
  ('shipments', 'parcel'),
  ('parcels', 'parcel'),
  ('pickups', 'pickup'),
  ('be_pickup_requests', 'pickup'),
  ('pickup_requests', 'pickup'),
  ('pickup_intake_requests', 'pickup'),
  ('pickup_request_parcels', 'pickup'),
  ('be_pickup_assignment_queue', 'pickup'),
  ('be_pickup_assignments', 'pickup'),
  ('be_pickup_id_reservations', 'pickup'),
  ('be_pickup_parcel_verifications', 'pickup'),
  ('be_pickup_notifications', 'pickup'),
  ('be_portal_pickup_requests', 'portal'),
  ('be_portal_pickup_request_items', 'portal'),
  ('be_portal_cargo_events', 'portal'),
  ('delivery_waybills', 'waybill'),
  ('be_waybills', 'waybill'),
  ('be_parcel_waybills', 'waybill'),
  ('be_waybill_headers', 'waybill'),
  ('be_waybill_ledger', 'waybill'),
  ('shipment_tracking', 'delivery'),
  ('delivery_process_events', 'delivery'),
  ('delivery_jobs', 'delivery'),
  ('be_dispatch_job_assignments', 'dispatch'),
  ('be_dispatch_routes', 'dispatch'),
  ('be_dispatch_scans_v39', 'dispatch'),
  ('be_dispatch_scan_events_v39', 'dispatch'),
  ('be_dispatch_wayplan_bridge', 'dispatch'),
  ('be_dispatch_wayplan_assignments', 'dispatch'),
  ('be_supervisor_job_assignments', 'dispatch'),
  ('be_wayplans', 'wayplan'),
  ('be_wayplan_items', 'wayplan'),
  ('be_wayplan_routes', 'wayplan'),
  ('be_wayplan_stops', 'wayplan'),
  ('be_wayplan_batches', 'wayplan'),
  ('be_wayplan_membership_v40', 'wayplan'),
  ('be_wayplan_inventory_bulkload', 'wayplan'),
  ('be_wayplan_dispatches', 'wayplan'),
  ('be_wayplan_dispatch_stops', 'wayplan'),
  ('be_wayplan_events_v40', 'wayplan'),
  ('be_wayplan_route_events_v45', 'wayplan'),
  ('be_wayplan_route_plans_v45', 'wayplan'),
  ('be_wayplan_review_v43', 'wayplan'),
  ('be_wayplan_review_events_v43', 'wayplan'),
  ('wayplans', 'wayplan_legacy'),
  ('wayplan_stops', 'wayplan_legacy'),
  ('be_warehouse_receipts_v36', 'warehouse'),
  ('be_warehouse_receipt_events_v36', 'warehouse'),
  ('be_warehouse_parcel_status', 'warehouse'),
  ('be_warehouse_inventory', 'warehouse'),
  ('be_warehouse_events', 'warehouse'),
  ('be_warehouse_manifests', 'warehouse'),
  ('warehouse_manifests', 'warehouse'),
  ('be_finance_calculation_projection_v4', 'finance'),
  ('be_cod_ledger', 'finance'),
  ('cod_collections', 'finance'),
  ('be_cod_settlements', 'finance'),
  ('be_customer_invoices', 'finance'),
  ('be_financial_settlements', 'finance'),
  ('invoices', 'finance'),
  ('be_invoice_print_records', 'documents'),
  ('be_invoice_reprint_requests', 'documents'),
  ('be_document_print_jobs', 'documents'),
  ('be_document_print_log', 'documents'),
  ('be_document_print_approval_requests', 'documents'),
  ('be_enterprise_workflow_events', 'workflow'),
  ('be_enterprise_workflow_jobs', 'workflow'),
  ('be_workflow_events', 'workflow'),
  ('be_logistics_workflow_events', 'workflow'),
  ('be_operational_events', 'workflow'),
  ('be_operational_alerts_v39', 'workflow'),
  ('be_branch_activity_events', 'workflow'),
  ('be_final_sync_cases_v50', 'workflow'),
  ('be_final_sync_events_v50', 'workflow'),
  ('be_final_sync_variances_v50', 'workflow'),
  ('exception_events', 'workflow'),
  ('be_parcel_status_timeline', 'workflow'),
  ('be_parcel_photo_reviews', 'workflow'),
  ('be_app_notifications', 'notifications'),
  ('app_notifications', 'notifications'),
  ('be_large_shipment_batches', 'bulk_runtime'),
  ('be_large_shipment_rows', 'bulk_runtime'),
  ('be_order_picking_workflow', 'workflow'),
  ('be_rider_gps_events', 'rider_runtime'),
  ('complaints', 'customer_service'),
  ('support_tickets', 'customer_service'),
  ('ticket_threads', 'customer_service')
) as v(table_name, category)
on conflict (cutover_id, table_schema, table_name) do nothing;

-- Count existing rows and capture only non-sensitive operational identifiers.
-- The source rows are not updated or locked.
do $readiness_scope$
declare
  v_cutover_id uuid;
  v_target record;
  v_column text;
  v_count bigint;
begin
  select cutover_id into strict v_cutover_id
  from private.be_golive_readiness_cutovers_v1
  where cutover_code = 'PRE_GOLIVE_UAT_20260901';

  for v_target in
    select s.table_schema, s.table_name
    from private.be_golive_readiness_scope_v1 s
    join pg_class c
      on c.relnamespace = to_regnamespace(s.table_schema)
     and c.relname = s.table_name
     and c.relkind in ('r', 'p')
    where s.cutover_id = v_cutover_id
  loop
    execute format('select count(*) from %I.%I', v_target.table_schema, v_target.table_name)
      into v_count;

    update private.be_golive_readiness_scope_v1
    set row_count = v_count
    where cutover_id = v_cutover_id
      and table_schema = v_target.table_schema
      and table_name = v_target.table_name;

    foreach v_column in array array[
      'delivery_way_id', 'deliver_way_id', 'way_id', 'waybill_no',
      'tracking_no', 'tracking_number', 'pickup_id', 'pickup_way_id',
      'pickup_request_id', 'request_code', 'shipment_id', 'parcel_id',
      'wayplan_id', 'wayplan_code', 'route_no', 'manifest_id'
    ]
    loop
      if exists (
        select 1
        from information_schema.columns c
        where c.table_schema = v_target.table_schema
          and c.table_name = v_target.table_name
          and c.column_name = v_column
      ) then
        execute format(
          'insert into private.be_golive_readiness_keys_v1
             (cutover_id, key_kind, key_value, source_table)
           select distinct $1, %L, btrim(%I::text), %L
           from %I.%I
           where nullif(btrim(%I::text), '''') is not null
           on conflict do nothing',
          v_column,
          v_column,
          v_target.table_name,
          v_target.table_schema,
          v_target.table_name,
          v_column
        ) using v_cutover_id;
      end if;
    end loop;

    if v_target.table_name = 'shipments' then
      execute 'insert into private.be_golive_readiness_keys_v1
        (cutover_id,key_kind,key_value,source_table)
        select $1,''shipment_id'',id::text,''shipments'' from public.shipments
        on conflict do nothing' using v_cutover_id;
    elsif v_target.table_name = 'parcels' then
      execute 'insert into private.be_golive_readiness_keys_v1
        (cutover_id,key_kind,key_value,source_table)
        select $1,''parcel_id'',id::text,''parcels'' from public.parcels
        on conflict do nothing' using v_cutover_id;
    end if;
  end loop;
end
$readiness_scope$;

update private.be_golive_readiness_cutovers_v1 c
set target_table_count = s.target_table_count,
    existing_table_count = s.existing_table_count,
    nonempty_table_count = s.nonempty_table_count,
    isolated_row_count = s.isolated_row_count,
    isolated_key_count = (
      select count(*) from private.be_golive_readiness_keys_v1 k
      where k.cutover_id = c.cutover_id
    )
from (
  select
    cutover_id,
    count(*)::integer as target_table_count,
    count(*) filter (where to_regclass(table_schema || '.' || quote_ident(table_name)) is not null)::integer as existing_table_count,
    count(*) filter (where row_count > 0)::integer as nonempty_table_count,
    coalesce(sum(row_count), 0)::bigint as isolated_row_count
  from private.be_golive_readiness_scope_v1
  group by cutover_id
) s
where c.cutover_id = s.cutover_id
  and c.cutover_code = 'PRE_GOLIVE_UAT_20260901';

create or replace function public.be_golive_live_cutoff_v1()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select cutoff_at
  from private.be_golive_readiness_cutovers_v1
  where cutover_code = 'PRE_GOLIVE_UAT_20260901';
$$;

create or replace function public.be_is_pre_golive_uat_key_v1(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(btrim(p_key), '') is null then false
    else exists (
      select 1
      from private.be_golive_readiness_keys_v1 k
      join private.be_golive_readiness_cutovers_v1 c using (cutover_id)
      where c.cutover_code = 'PRE_GOLIVE_UAT_20260901'
        and k.key_value = btrim(p_key)
    )
  end;
$$;

create or replace function public.be_is_post_golive_live_row_v1(
  p_created_at timestamptz,
  p_key text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_created_at >= public.be_golive_live_cutoff_v1(), false)
     and not public.be_is_pre_golive_uat_key_v1(p_key);
$$;

revoke all on function public.be_golive_live_cutoff_v1() from public, anon, authenticated;
revoke all on function public.be_is_pre_golive_uat_key_v1(text) from public, anon, authenticated;
revoke all on function public.be_is_post_golive_live_row_v1(timestamptz,text) from public, anon, authenticated;
grant execute on function public.be_golive_live_cutoff_v1() to service_role;
grant execute on function public.be_is_pre_golive_uat_key_v1(text) to service_role;
grant execute on function public.be_is_post_golive_live_row_v1(timestamptz,text) to service_role;

-- SECURITY DEFINER callers using this generic reader now receive only rows
-- created after cutover and not linked to a pre-cutover operational key.
create or replace function public.be_table_rows_json(p_table text, p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_sql text;
  v_order_col text;
  v_created_col text;
  v_key_col text;
  v_is_scoped boolean := false;
  v_where text := '';
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.be_table_exists(p_table) then
    return '[]'::jsonb;
  end if;

  select exists (
    select 1
    from private.be_golive_readiness_scope_v1 s
    join private.be_golive_readiness_cutovers_v1 c using (cutover_id)
    where c.cutover_code = 'PRE_GOLIVE_UAT_20260901'
      and s.table_schema = 'public'
      and s.table_name = p_table
  ) into v_is_scoped;

  if not v_is_scoped then
    v_created_col := null;
    v_key_col := null;
  end if;

  if v_is_scoped then
    select column_name into v_created_col
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and column_name = 'created_at'
  limit 1;

    select column_name into v_key_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and column_name in (
      'delivery_way_id','deliver_way_id','way_id','waybill_no','tracking_no',
      'tracking_number','pickup_id','pickup_way_id','pickup_request_id',
      'request_code','shipment_id','parcel_id','wayplan_id','wayplan_code','route_no','manifest_id'
    )
  order by case column_name
    when 'delivery_way_id' then 1 when 'deliver_way_id' then 2
    when 'way_id' then 3 when 'waybill_no' then 4 when 'tracking_no' then 5
    when 'pickup_id' then 6 when 'pickup_way_id' then 7
    when 'shipment_id' then 8 when 'parcel_id' then 9
    when 'wayplan_id' then 10 else 20 end
  limit 1;
  end if;

  if v_created_col is not null and v_key_col is not null then
    v_where := format(
      ' where public.be_is_post_golive_live_row_v1(%I, %I::text) ',
      v_created_col, v_key_col
    );
  elsif v_created_col is not null then
    v_where := format(' where %I >= public.be_golive_live_cutoff_v1() ', v_created_col);
  elsif v_key_col is not null then
    v_where := format(' where not public.be_is_pre_golive_uat_key_v1(%I::text) ', v_key_col);
  end if;

  select column_name into v_order_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and column_name in ('updated_at', 'created_at', 'id')
  order by case column_name when 'updated_at' then 1 when 'created_at' then 2 when 'id' then 3 else 9 end
  limit 1;

  if v_order_col is null then
    v_sql := format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I %s limit $1) t',
      p_table, v_where
    );
  else
    v_sql := format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.%I desc nulls last), ''[]''::jsonb)
       from (select * from public.%I %s order by %I desc nulls last limit $1) t',
      v_order_col, p_table, v_where, v_order_col
    );
  end if;

  execute v_sql into v_rows using greatest(coalesce(p_limit, 300), 1);
  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

create or replace function public.be_customer_portal_snapshot(
  p_actor_email text,
  p_phone text,
  p_tracking_no text default null::text
)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select
      upper(btrim(coalesce(p_tracking_no, ''))) as tracking_no,
      regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as phone_no
  ), matches as (
    select p.*
    from public.be_portal_pickup_requests p
    cross join input i
    where public.be_is_post_golive_live_row_v1(
            p.created_at,
            coalesce(nullif(p.delivery_way_id,''), nullif(p.tracking_no,''), nullif(p.pickup_id,''), nullif(p.request_code,''))
          )
      and length(i.tracking_no) >= 4
      and length(i.phone_no) >= 6
      and i.tracking_no = any (array[
        upper(btrim(coalesce(p.delivery_way_id, ''))),
        upper(btrim(coalesce(p.tracking_no, ''))),
        upper(btrim(coalesce(p.tracking_number, ''))),
        upper(btrim(coalesce(p.waybill_no, ''))),
        upper(btrim(coalesce(p.deliver_id, ''))),
        upper(btrim(coalesce(p.pickup_id, ''))),
        upper(btrim(coalesce(p.pickup_way_id, ''))),
        upper(btrim(coalesce(p.request_code, ''))),
        upper(btrim(coalesce(p.pickup_waybill_id, '')))
      ])
      and i.phone_no = any (array[
        regexp_replace(coalesce(p.recipient_phone, ''), '[^0-9]', '', 'g'),
        regexp_replace(coalesce(p.customer_phone, ''), '[^0-9]', '', 'g'),
        regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
      ])
    order by p.updated_at desc nulls last
    limit 10
  )
  select json_build_object(
    'shipments', coalesce(
      json_agg(json_build_object(
        'tracking_no', coalesce(
          nullif(m.delivery_way_id, ''), nullif(m.tracking_no, ''),
          nullif(m.tracking_number, ''), nullif(m.waybill_no, ''),
          nullif(m.deliver_id, ''), nullif(m.pickup_id, ''), nullif(m.request_code, '')
        ),
        'pickup_id', nullif(m.pickup_id, ''),
        'delivery_status', coalesce(
          nullif(m.delivery_status, ''), nullif(m.status, ''),
          nullif(m.operation_status, ''), nullif(m.workflow_stage, '')
        ),
        'warehouse_status', nullif(m.warehouse_status, ''),
        'dispatch_status', nullif(m.dispatch_status, ''),
        'township', coalesce(nullif(m.delivery_township, ''), nullif(m.township, '')),
        'exception_reason', nullif(m.exception_reason, ''),
        'delivered_at', m.delivered_at,
        'updated_at', m.updated_at
      ) order by m.updated_at desc nulls last),
      '[]'::json
    ),
    'stats', json_build_object('matches', count(*))
  )
  from matches m;
$$;

create or replace function public.be_warehouse_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
  select jsonb_build_object(
    'ok', true,
    'warehouse_rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from public.be_warehouse_parcel_status x
      where public.be_is_post_golive_live_row_v1(x.created_at, x.delivery_way_id)
    ), '[]'::jsonb),
    'pre_golive_uat_isolated', true
  );
$$;

create or replace function public.be_data_entry_parcel_snapshot(
  p_status text default null::text,
  p_environment text default null::text,
  p_limit integer default 300
)
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.parcels where public.be_is_post_golive_live_row_v1(created_at, way_id)),
      'registered', (select count(*) from public.parcels where public.be_is_post_golive_live_row_v1(created_at, way_id) and status='registered'),
      'ready_for_waybill', (select count(*) from public.parcels where public.be_is_post_golive_live_row_v1(created_at, way_id) and status='ready_for_waybill'),
      'waybill_created', (select count(*) from public.parcels where public.be_is_post_golive_live_row_v1(created_at, way_id) and status='waybill_created')
    ),
    'synced_at', now(),
    'pre_golive_uat_isolated', true
  )
  from (
    select id, way_id, customer_id, merchant_id, status, recipient_name,
           recipient_phone, township, delivery_address, item_price,
           delivery_charges, cod_amount, weight_kg, created_at, updated_at, environment
    from public.parcels
    where public.be_is_post_golive_live_row_v1(created_at, way_id)
      and (p_status is null or status = p_status)
      and (p_environment is null or environment = p_environment)
    order by updated_at desc
    limit least(greatest(coalesce(p_limit,300),1),1000)
  ) x;
$$;

create or replace function public.be_data_entry_register_snapshot(
  p_status text default null::text,
  p_limit integer default 300
)
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.be_data_entry_register_rows where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id)),
      'valid', (select count(*) from public.be_data_entry_register_rows where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id) and validation_status='valid'),
      'warning', (select count(*) from public.be_data_entry_register_rows where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id) and validation_status='warning'),
      'finance_pending', (select count(*) from public.be_data_entry_register_rows where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id) and finance_status='pending_finance')
    ),
    'synced_at', now(),
    'pre_golive_uat_isolated', true
  )
  from (
    select *
    from public.be_data_entry_register_rows
    where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id)
      and (p_status is null or validation_status=p_status or operation_status=p_status or finance_status=p_status)
    order by created_at desc
    limit least(greatest(coalesce(p_limit,300),1),1000)
  ) x;
$$;

create or replace function public.be_rider_route_jobs(
  p_actor_email text default null::text,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_email text := nullif(p_actor_email, '');
  v_jobs jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  into v_jobs
  from (
    select id, pickup_id, pickup_way_id, delivery_way_id, waybill_no,
           invoice_no, tracking_no,
           coalesce(assigned_to,rider_email,rider_code) as rider_email,
           rider_name, rider_code, route_code, optimized_sequence,
           coalesce(dispatch_status,stop_status,warehouse_status,'PENDING') as job_status,
           coalesce(warehouse_status,stop_status,dispatch_status,'PENDING') as warehouse_status,
           township, delivery_township, recipient_township, cod_amount,
           amount_to_collect,
           coalesce(recipient_name,receiver_name,'Customer') as recipient_name,
           coalesce(recipient_phone,receiver_phone,'') as recipient_phone,
           coalesce(delivery_address,address,'') as delivery_address,
           created_at, updated_at
    from public.be_wayplan_dispatch_stops
    where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id)
      and (v_email is null or coalesce(assigned_to,rider_email,rider_code,'')=v_email)
      and upper(coalesce(dispatch_status,stop_status,warehouse_status,'')) not in ('CANCELLED','FAILED','RETURNED')
    order by route_code desc nulls last, optimized_sequence asc nulls last,
             delivery_sequence asc nulls last, stop_sequence asc nulls last,
             delivery_way_id asc nulls last
    limit greatest(coalesce(p_limit,200),1)
  ) t;

  select jsonb_build_object(
    'total_jobs', coalesce(jsonb_array_length(v_jobs),0),
    'assigned_jobs', (select count(*) from jsonb_array_elements(v_jobs) j where coalesce(j->>'rider_email','')<>''),
    'optimized_jobs', (select count(*) from jsonb_array_elements(v_jobs) j where coalesce(j->>'route_code','')<>''),
    'pending_jobs', (select count(*) from jsonb_array_elements(v_jobs) j where upper(coalesce(j->>'job_status','')) in ('PENDING','ASSIGNED','ROUTE_OPTIMIZED','READY_FOR_DISPATCH','OUT_FOR_DELIVERY'))
  ) into v_summary;

  return jsonb_build_object(
    'ok',true,'source','be_rider_route_jobs','actor_email',v_email,
    'generated_at',now(),'summary',v_summary,'jobs',v_jobs,
    'pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_finance_rider_cod_settlement_queue(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  into v_rows
  from (
    select id,pickup_id,pickup_way_id,delivery_way_id,waybill_no,
           invoice_no,tracking_no,rider_email,rider_name,dispatch_status,
           stop_status,rider_status,cod_amount,amount_to_collect,cod_collected,
           cod_collected_at,cod_collected_by,finance_status,delivered_at,updated_at
    from public.be_wayplan_dispatch_stops
    where public.be_is_post_golive_live_row_v1(created_at, delivery_way_id)
      and coalesce(cod_collected,0)>0
      and upper(coalesce(finance_status,''))='COD_PENDING_SETTLEMENT'
    order by cod_collected_at desc nulls last,updated_at desc nulls last
    limit greatest(coalesce(p_limit,200),1)
  ) t;

  select jsonb_build_object(
    'pending_count',coalesce(jsonb_array_length(v_rows),0),
    'pending_amount',(select coalesce(sum((r->>'cod_collected')::numeric),0)
      from jsonb_array_elements(v_rows) r
      where coalesce(r->>'cod_collected','') ~ '^[0-9]+(\\.[0-9]+)?$')
  ) into v_summary;

  return jsonb_build_object(
    'ok',true,'source','be_finance_rider_cod_settlement_queue',
    'generated_at',now(),'summary',v_summary,'rows',v_rows,
    'pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $$
declare
  v_raw jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_raw := public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();

  select coalesce(jsonb_agg(e),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) e
  where not public.be_is_pre_golive_uat_key_v1(e->>'delivery_way_id');

  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null
      or upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY')),
    'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
    'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
    'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
    'rto',count(*) filter(where nullif(e->>'rto_at','') is not null or upper(coalesce(e->>'delivery_status',''))='RTO')
  ) into v_stats
  from jsonb_array_elements(v_rows) e;

  return v_raw || jsonb_build_object(
    'rows',v_rows,'stats',v_stats,'active_scope','POST_GOLIVE_ONLY',
    'pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_dispatch_rider_finance_e2e_health()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_capacity jsonb := '{}'::jsonb;
  v_rider_jobs jsonb := '{}'::jsonb;
  v_finance_queue jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select public.be_enterprise_dispatch_capacity_recommend(100) into v_capacity;
  select public.be_rider_route_jobs(null,100) into v_rider_jobs;
  select public.be_finance_rider_cod_settlement_queue(100) into v_finance_queue;

  select jsonb_build_object(
    'capacity_available_workforce',coalesce((v_capacity->'summary'->>'available_workforce')::integer,0),
    'capacity_recommendations',coalesce((v_capacity->'summary'->>'recommendations')::integer,0),
    'capacity_within_capacity',coalesce((v_capacity->'summary'->>'within_capacity')::integer,0),
    'rider_total_jobs',coalesce((v_rider_jobs->'summary'->>'total_jobs')::integer,0),
    'rider_assigned_jobs',coalesce((v_rider_jobs->'summary'->>'assigned_jobs')::integer,0),
    'rider_optimized_jobs',coalesce((v_rider_jobs->'summary'->>'optimized_jobs')::integer,0),
    'finance_pending_count',coalesce((v_finance_queue->'summary'->>'pending_count')::integer,0),
    'finance_pending_amount',coalesce((v_finance_queue->'summary'->>'pending_amount')::numeric,0),
    'delivered_count',(select count(*) from public.be_wayplan_dispatch_stops
      where public.be_is_post_golive_live_row_v1(created_at,delivery_way_id)
        and upper(coalesce(dispatch_status,stop_status,rider_status,''))='DELIVERED'),
    'cod_settled_count',(select count(*) from public.be_wayplan_dispatch_stops
      where public.be_is_post_golive_live_row_v1(created_at,delivery_way_id)
        and upper(coalesce(finance_status,''))='COD_SETTLED'),
    'cod_settled_amount',(select coalesce(sum(coalesce(cod_collected,0)),0)
      from public.be_wayplan_dispatch_stops
      where public.be_is_post_golive_live_row_v1(created_at,delivery_way_id)
        and upper(coalesce(finance_status,''))='COD_SETTLED'),
    'audit_dispatch_events',(select count(*) from public.be_governance_audit_log where module='DISPATCH'),
    'audit_rider_events',(select count(*) from public.be_governance_audit_log where module='RIDER_APP'),
    'audit_finance_cod_events',(select count(*) from public.be_governance_audit_log where module='FINANCE_COD'),
    'pre_golive_uat_isolated_rows',(select isolated_row_count from private.be_golive_readiness_cutovers_v1 where cutover_code='PRE_GOLIVE_UAT_20260901')
  ) into v_summary;

  return jsonb_build_object(
    'ok',true,'source','be_dispatch_rider_finance_e2e_health','generated_at',now(),
    'summary',v_summary,
    'status',case
      when coalesce((v_summary->>'capacity_available_workforce')::integer,0)>0
       and coalesce((v_summary->>'capacity_recommendations')::integer,0)>0
       and coalesce((v_summary->>'rider_assigned_jobs')::integer,0)>0
       and coalesce((v_summary->>'delivered_count')::integer,0)>0
       and coalesce((v_summary->>'cod_settled_count')::integer,0)>0
       and coalesce((v_summary->>'audit_rider_events')::integer,0)>0
       and coalesce((v_summary->>'audit_finance_cod_events')::integer,0)>0 then 'READY'
      when coalesce((v_summary->>'capacity_available_workforce')::integer,0)>0
       and coalesce((v_summary->>'rider_total_jobs')::integer,0)=0
       and coalesce((v_summary->>'finance_pending_count')::integer,0)=0
       and coalesce((v_summary->>'delivered_count')::integer,0)=0
       and coalesce((v_summary->>'cod_settled_count')::integer,0)=0 then 'READY_FOR_CONTROLLED_LIVE_TEST'
      else 'CHECK_REQUIRED' end,
    'capacity',v_capacity->'summary','rider_jobs',v_rider_jobs->'summary',
    'finance_queue',v_finance_queue->'summary','pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_rider_delivery_process_health_v12_10()
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
with active_dispatches as (
  select w.* from public.be_wayplan_dispatches w
  where public.be_is_post_golive_live_row_v1(w.created_at,w.wayplan_id)
    and upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY')
), active_stops as (
  select s.*,w.rider_code as dispatch_rider_code,w.driver_code as dispatch_driver_code,w.helper_code as dispatch_helper_code
  from public.be_wayplan_dispatch_stops s
  join active_dispatches w on w.wayplan_id=s.wayplan_id
  where public.be_is_post_golive_live_row_v1(s.created_at,s.delivery_way_id)
), canonical as (
  select s.* from active_stops s where s.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
), registered as (
  select c.* from canonical c where exists(
    select 1 from public.be_data_entry_parcel_details d
    where public.be_is_post_golive_live_row_v1(d.created_at,d.delivery_way_id)
      and d.delivery_way_id=c.delivery_way_id)
), assignment_codes as (
  select distinct upper(code) as code,role_source from (
    select rider_code as code,'RIDER'::text as role_source from active_dispatches
    union all select driver_code,'DRIVER' from active_dispatches
    union all select helper_code,'HELPER' from active_dispatches
  ) z where coalesce(code,'')<>''
), assignment_health as (
  select a.code,a.role_source,m.worker_code,m.auth_user_id,m.role as mapped_role,m.is_active,
    case when m.auth_user_id is null then 'UNMAPPED'
         when not coalesce(m.is_active,false) then 'INACTIVE'
         when upper(coalesce(m.role,''))<>a.role_source then 'ROLE_MISMATCH'
         else 'READY' end as status
  from assignment_codes a
  left join public.be_mobile_workforce_accounts m
    on upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),
       nullif(m.rider_code,''),nullif(m.driver_code,''),nullif(m.helper_code,'')))=a.code
), metrics as (
  select
    (select count(*) from active_dispatches)::integer as active_wayplans,
    (select count(*) from active_stops)::integer as active_stops,
    (select count(*) from canonical)::integer as canonical_delivery_stops,
    (select count(*) from registered)::integer as registered_delivery_stops,
    (select count(*) from canonical c where not exists(
      select 1 from public.be_data_entry_parcel_details d
      where public.be_is_post_golive_live_row_v1(d.created_at,d.delivery_way_id)
        and d.delivery_way_id=c.delivery_way_id))::integer as orphan_delivery_stops,
    (select count(*) from active_stops s where coalesce(s.delivery_way_id,'') !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$')::integer as noncanonical_active_stops,
    (select count(*) from registered r where exists(
      select 1 from public.be_dispatch_scans_v39 ds
      where public.be_is_post_golive_live_row_v1(ds.created_at,ds.delivery_way_id)
        and ds.delivery_way_id=r.delivery_way_id and ds.scan_status='SCANNED' and ds.wayplan_code=r.wayplan_id))::integer as scanned_delivery_stops,
    (select count(*) from registered r where not exists(
      select 1 from public.be_dispatch_scans_v39 ds
      where public.be_is_post_golive_live_row_v1(ds.created_at,ds.delivery_way_id)
        and ds.delivery_way_id=r.delivery_way_id and ds.scan_status='SCANNED' and ds.wayplan_code=r.wayplan_id))::integer as scan_pending_stops,
    (select count(*) from public.be_v_dispatch_ready_queue q
      where public.be_is_post_golive_live_row_v1(q.created_at,q.delivery_way_id))::integer as clean_ready_queue,
    exists(select 1 from storage.buckets b where b.id='rider-proofs' and b.file_size_limit>=15728640) as proof_bucket_ready,
    coalesce((select jsonb_agg(to_jsonb(a) order by a.code) from assignment_health a where a.status<>'READY'),'[]'::jsonb) as assignment_issues,
    not exists(select 1 from assignment_health where status<>'READY') as assignments_ok
)
select jsonb_build_object(
  'ok',true,'build','RIDER_DELIVERY_MOBILE_V12_12_READINESS_ISOLATION',
  'ready',assignments_ok and orphan_delivery_stops=0 and noncanonical_active_stops=0 and proof_bucket_ready,
  'status',case
    when not (assignments_ok and orphan_delivery_stops=0 and noncanonical_active_stops=0 and proof_bucket_ready) then 'CHECK_REQUIRED'
    when active_wayplans=0 then 'READY_NO_ACTIVE_ROUTE'
    when scan_pending_stops>0 then 'AWAITING_MANDATORY_DISPATCH_SCAN'
    else 'READY_ACTIVE_ROUTE' end,
  'active_wayplans',active_wayplans,'active_stops',active_stops,
  'canonical_delivery_stops',canonical_delivery_stops,'registered_delivery_stops',registered_delivery_stops,
  'orphan_delivery_stops',orphan_delivery_stops,'noncanonical_active_stops',noncanonical_active_stops,
  'scanned_delivery_stops',scanned_delivery_stops,'scan_pending_stops',scan_pending_stops,
  'clean_ready_queue',clean_ready_queue,'assignment_issues',assignment_issues,
  'proof_bucket_ready',proof_bucket_ready,'helper_optional',true,
  'mandatory_dispatch_scan',true,'data_entry_registration_required',true,
  'workforce_auth_mapping_required',true,'pre_golive_uat_isolated',true
) from metrics;
$$;

create or replace function public.be_production_readiness_dispatch_rider_finance_module()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_health jsonb := '{}'::jsonb;
begin
  select public.be_dispatch_rider_finance_e2e_health() into v_health;
  return jsonb_build_object(
    'module','Dispatch Rider Finance E2E',
    'status',coalesce(v_health->>'status','CHECK_REQUIRED'),
    'ready',coalesce(v_health->>'status','')='READY',
    'ready_for_controlled_live_test',coalesce(v_health->>'status','') in ('READY','READY_FOR_CONTROLLED_LIVE_TEST'),
    'summary',v_health->'summary','capacity',v_health->'capacity',
    'rider_jobs',v_health->'rider_jobs','finance_queue',v_health->'finance_queue',
    'checked_at',now(),'pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_wayplan_command_center(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select * from public.be_v_wayplan_command_center
    where created_at >= public.be_golive_live_cutoff_v1()
      and not public.be_is_pre_golive_uat_key_v1(wayplan_id)
    order by created_at desc
    limit greatest(coalesce(p_limit,100),1)
  ) x;
  return jsonb_build_object(
    'ok',true,'wayplans',v_rows,'count',jsonb_array_length(v_rows),
    'source','be_wayplan_command_center','pre_golive_uat_isolated',true
  );
end;
$$;

create or replace function public.be_wayplan_dashboard_snapshot(
  p_search text default ''::text,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_routes jsonb;
  v_stops jsonb;
  v_kpis jsonb;
  v_search text := lower(trim(coalesce(p_search,'')));
begin
  select jsonb_build_object(
    'pending_pickups',coalesce((select count(*) from public.be_portal_pickup_requests p
      where public.be_is_post_golive_live_row_v1(p.created_at,coalesce(p.pickup_id,p.request_code))
        and coalesce(p.status,'') not in ('archived_test_data','cancelled')
        and coalesce(p.assignment_status,'pending_assignment')<>'assigned'),0),
    'hub_processing',coalesce((select count(*) from public.be_portal_cargo_events e
      where public.be_is_post_golive_live_row_v1(e.created_at,coalesce(e.delivery_way_id,e.pickup_id))
        and e.event_type='data_entry_waybill'
        and coalesce(e.status,'') in ('draft','assigned','pickup_verified','hub_received','sorting')),0),
    'active_dispatch',coalesce((select count(*) from public.be_wayplan_routes r
      where public.be_is_post_golive_live_row_v1(r.created_at,r.route_no)
        and r.route_status in ('planned','assigned','out_for_delivery')),0),
    'success_rate',coalesce((select round(100.0*count(*) filter(where stop_status='delivered')
      /nullif(count(*) filter(where stop_status in ('delivered','failed','return')),0),1)
      from public.be_wayplan_stops s
      where public.be_is_post_golive_live_row_v1(s.created_at,coalesce(s.deliver_way_id,s.route_no))),0),
    'cod_to_collect',coalesce((select sum(cod_amount) from public.be_wayplan_stops s
      where public.be_is_post_golive_live_row_v1(s.created_at,coalesce(s.deliver_way_id,s.route_no))
        and stop_status not in ('delivered','return')),0)
  ) into v_kpis;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc),'[]'::jsonb)
  into v_routes
  from (
    select r.route_no,r.pickup_id,r.route_date,r.route_zone,r.route_status,
      r.assigned_rider_name,r.assigned_driver_name,r.assigned_helper_name,
      r.assigned_vehicle_plate,r.total_stops,r.completed_stops,r.failed_stops,
      r.total_cod,r.updated_at
    from public.be_wayplan_routes r
    where public.be_is_post_golive_live_row_v1(r.created_at,r.route_no)
      and (v_search='' or lower(r.route_no) like '%'||v_search||'%'
        or lower(r.pickup_id) like '%'||v_search||'%'
        or lower(coalesce(r.route_zone,'')) like '%'||v_search||'%'
        or lower(coalesce(r.assigned_rider_name,'')) like '%'||v_search||'%')
    order by r.updated_at desc limit coalesce(p_limit,200)
  ) r;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.route_no desc,s.stop_sequence),'[]'::jsonb)
  into v_stops
  from (
    select s.id,s.route_no,s.pickup_id,s.deliver_way_id,s.stop_sequence,
      s.township,s.recipient_name,s.recipient_phone,s.delivery_address,
      s.cod_amount,s.weight_kg,s.stop_status,s.scan_status,s.updated_at
    from public.be_wayplan_stops s
    where public.be_is_post_golive_live_row_v1(s.created_at,coalesce(s.deliver_way_id,s.route_no))
      and (v_search='' or lower(s.route_no) like '%'||v_search||'%'
        or lower(s.pickup_id) like '%'||v_search||'%'
        or lower(s.deliver_way_id) like '%'||v_search||'%'
        or lower(coalesce(s.recipient_name,'')) like '%'||v_search||'%'
        or lower(coalesce(s.recipient_phone,'')) like '%'||v_search||'%'
        or lower(coalesce(s.township,'')) like '%'||v_search||'%')
    order by s.updated_at desc limit coalesce(p_limit,200)
  ) s;

  return jsonb_build_object(
    'ok',true,'kpis',v_kpis,'routes',v_routes,'stops',v_stops,
    'server_time',now(),'pre_golive_uat_isolated',true
  );
end;
$$;

-- Disable the two broad legacy cleanup RPCs. Neither function is needed by
-- readiness isolation, and both previously allowed unsafe production writes.
create or replace function public.be_go_live_archive_mock_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode='0A000',
    message='DISABLED_UNSAFE_CLEANUP: use audited readiness isolation';
end;
$$;

create or replace function public.execute_golive_runtime_cleanup(p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode='0A000',
    message='DISABLED_UNSAFE_CLEANUP: destructive runtime cleanup is not permitted';
end;
$$;

create or replace function public.be_go_live_readiness_isolation_report_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok',true,'mode','READINESS_ONLY','cutover_code',c.cutover_code,
    'cutoff_at',c.cutoff_at,'target_tables',c.target_table_count,
    'existing_tables',c.existing_table_count,'nonempty_tables',c.nonempty_table_count,
    'isolated_rows',c.isolated_row_count,'isolated_keys',c.isolated_key_count,
    'rows_updated',0,'rows_deleted',0,'statuses_changed',0,
    'master_data_untouched',true,
    'by_category',coalesce((select jsonb_object_agg(category,total order by category)
      from (select category,sum(row_count) total
            from private.be_golive_readiness_scope_v1 s
            where s.cutover_id=c.cutover_id group by category) x),'{}'::jsonb)
  )
  from private.be_golive_readiness_cutovers_v1 c
  where c.cutover_code='PRE_GOLIVE_UAT_20260901';
$$;

create or replace function public.be_go_live_isolation_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.be_go_live_readiness_isolation_report_v1();
$$;

revoke all on function public.be_go_live_archive_mock_operational_data() from public,anon,authenticated;
revoke all on function public.execute_golive_runtime_cleanup(uuid) from public,anon,authenticated;
revoke all on function public.be_go_live_readiness_isolation_report_v1() from public,anon,authenticated;
revoke all on function public.be_go_live_isolation_report() from public,anon,authenticated;
grant execute on function public.be_go_live_readiness_isolation_report_v1() to service_role;
grant execute on function public.be_go_live_isolation_report() to service_role;

comment on table private.be_golive_readiness_cutovers_v1 is
  'Readiness-only cutover boundary. Existing operational rows remain unchanged.';
