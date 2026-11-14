-- Wayplan test-data isolation V25
-- Archives every Wayplan transactional row that exists at this controlled
-- cutover, then removes only those archived rows from active runtime tables.
-- Master data, auth, parcels, Data Entry, Warehouse and Finance are untouched.

create schema if not exists private;

create table if not exists private.be_wayplan_test_isolation_batches_v25 (
  batch_id uuid primary key default gen_random_uuid(),
  cutover_code text not null unique,
  cutoff_at timestamptz not null default clock_timestamp(),
  reason text not null,
  archived_row_count bigint not null default 0,
  completed_at timestamptz,
  created_by text not null default current_user,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.be_wayplan_test_isolation_rows_v25 (
  archive_id bigint generated always as identity primary key,
  batch_id uuid not null references private.be_wayplan_test_isolation_batches_v25(batch_id),
  source_schema text not null default 'public',
  source_table text not null,
  source_row jsonb not null,
  archived_at timestamptz not null default clock_timestamp()
);

create table if not exists private.be_wayplan_test_isolation_counts_v25 (
  batch_id uuid not null references private.be_wayplan_test_isolation_batches_v25(batch_id),
  source_table text not null,
  archived_rows bigint not null,
  primary key (batch_id, source_table)
);

create index if not exists be_wayplan_test_isolation_rows_v25_batch_table_idx
  on private.be_wayplan_test_isolation_rows_v25(batch_id, source_table);

revoke all on table private.be_wayplan_test_isolation_batches_v25 from public, anon, authenticated;
revoke all on table private.be_wayplan_test_isolation_rows_v25 from public, anon, authenticated;
revoke all on table private.be_wayplan_test_isolation_counts_v25 from public, anon, authenticated;
grant all on table private.be_wayplan_test_isolation_batches_v25 to service_role;
grant all on table private.be_wayplan_test_isolation_rows_v25 to service_role;
grant all on table private.be_wayplan_test_isolation_counts_v25 to service_role;

insert into private.be_wayplan_test_isolation_batches_v25 (
  cutover_code, reason, metadata
)
values (
  'WAYPLAN_TEST_CUTOVER_20260905',
  'Isolate all Wayplan testing data existing before the 2026-09-05 production cutover',
  jsonb_build_object(
    'mode', 'ARCHIVE_THEN_REMOVE_FROM_ACTIVE_RUNTIME',
    'recoverable', true,
    'master_data_untouched', true,
    'auth_untouched', true,
    'parcels_untouched', true,
    'data_entry_untouched', true,
    'warehouse_untouched', true,
    'finance_untouched', true
  )
)
on conflict (cutover_code) do nothing;

do $wayplan_isolation$
declare
  v_batch_id uuid;
  v_cutoff_at timestamptz;
  v_completed_at timestamptz;
  v_table text;
  v_has_created_at boolean;
  v_archived bigint;
begin
  select batch_id, cutoff_at, completed_at
    into strict v_batch_id, v_cutoff_at, v_completed_at
  from private.be_wayplan_test_isolation_batches_v25
  where cutover_code = 'WAYPLAN_TEST_CUTOVER_20260905'
  for update;

  if v_completed_at is not null then
    return;
  end if;

  -- Child/runtime tables precede their parents. Configuration/master tables
  -- such as zones, rules, aliases, service locations and fleet assets are
  -- intentionally absent from this list.
  foreach v_table in array array[
    'be_wayplan_review_events_v43',
    'be_wayplan_route_events_v45',
    'be_wayplan_events_v40',
    'be_wayplan_cod_settlements',
    'be_wayplan_command_rows',
    'be_wayplan_dispatch_stops',
    'be_wayplan_membership_v40',
    'be_dispatch_wayplan_assignments',
    'be_dispatch_wayplan_bridge',
    'be_supervisor_wayplan_pickups',
    'be_supervisor_wayplan_sheets',
    'be_v32_wayplan_stops',
    'be_wayplan_stops_v25',
    'be_wayplan_items',
    'be_dedicated_wayplan_items',
    'wayplan_stops',
    'be_wayplan_stops',
    'be_dispatch_route_stops',
    'be_wayplan_review_v43',
    'be_wayplan_route_plans_v45',
    'be_wayplan_dispatches',
    'be_wayplan_inventory_bulkload',
    'be_dedicated_wayplans',
    'be_supervisor_wayplans',
    'be_v32_wayplans',
    'be_wayplans_v25',
    'be_wayplan_routes',
    'be_dispatch_routes',
    'wayplan_routes',
    'be_wayplans',
    'wayplans',
    'be_wayplan_batches'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind in ('r', 'p')
    ) then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'created_at'
    ) into v_has_created_at;

    execute format(
      'with moved as (
         delete from public.%1$I as source
         where %2$s
         returning to_jsonb(source) as source_row
       ), saved as (
         insert into private.be_wayplan_test_isolation_rows_v25
           (batch_id, source_schema, source_table, source_row)
         select $1, ''public'', %3$L, source_row from moved
         returning 1
       )
       select count(*) from saved',
      v_table,
      case when v_has_created_at
        then '(source.created_at is null or source.created_at < $2)'
        else 'true'
      end,
      v_table
    ) into v_archived using v_batch_id, v_cutoff_at;

    insert into private.be_wayplan_test_isolation_counts_v25
      (batch_id, source_table, archived_rows)
    values (v_batch_id, v_table, v_archived)
    on conflict (batch_id, source_table)
    do update set archived_rows = excluded.archived_rows;
  end loop;

  update private.be_wayplan_test_isolation_batches_v25 b
  set archived_row_count = (
        select coalesce(sum(c.archived_rows), 0)
        from private.be_wayplan_test_isolation_counts_v25 c
        where c.batch_id = v_batch_id
      ),
      completed_at = clock_timestamp()
  where b.batch_id = v_batch_id;
end
$wayplan_isolation$;

comment on table private.be_wayplan_test_isolation_rows_v25 is
  'Recoverable JSON archive of Wayplan test rows removed from active runtime at the 2026-09-05 cutover.';
