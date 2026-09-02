-- Pre-go-live readiness isolation boundary fix v1.1
-- Applied production migration version: 20260902000817.
--
-- Readiness-only: no public operational row is updated, deleted, archived,
-- cancelled, dispatched, delivered, or settled. This tightens the visibility
-- predicate for rows without a canonical operational key and refreshes the
-- private cutover ledger after the original migration completed.

select pg_advisory_xact_lock(hashtext('britium:pre_golive_readiness_isolation'));

do $readiness_guard$
declare
  v_cutover private.be_golive_readiness_cutovers_v1%rowtype;
begin
  select *
  into v_cutover
  from private.be_golive_readiness_cutovers_v1
  where cutover_code = 'PRE_GOLIVE_UAT_20260901';

  if not found then
    raise exception 'READINESS_CUTOVER_NOT_FOUND';
  end if;

  if coalesce(v_cutover.metadata->>'mode', '') <> 'READINESS_ONLY' then
    raise exception 'READINESS_MODE_REQUIRED';
  end if;
end;
$readiness_guard$;

-- An operational row without a canonical identifier is not safe to route into
-- a clean live workflow. Treat a blank key as pre-go-live/unroutable.
create or replace function public.be_is_pre_golive_uat_key_v1(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(btrim(p_key), '') is null then true
    else exists (
      select 1
      from private.be_golive_readiness_keys_v1 k
      join private.be_golive_readiness_cutovers_v1 c using (cutover_id)
      where c.cutover_code = 'PRE_GOLIVE_UAT_20260901'
        and k.key_value = btrim(p_key)
    )
  end;
$$;

revoke all on function public.be_is_pre_golive_uat_key_v1(text)
  from public, anon, authenticated;
grant execute on function public.be_is_pre_golive_uat_key_v1(text)
  to service_role;

-- Re-capture non-sensitive identifiers in case audit/notification triggers
-- wrote rows while the original migration was installing its RPC definitions.
do $readiness_keys$
declare
  r record;
begin
  for r in
    select s.cutover_id, s.table_name, c.column_name
    from private.be_golive_readiness_scope_v1 s
    join information_schema.columns c
      on c.table_schema = s.table_schema
     and c.table_name = s.table_name
     and c.column_name in (
       'delivery_way_id', 'deliver_way_id', 'way_id', 'waybill_no',
       'tracking_no', 'tracking_number', 'pickup_id', 'pickup_way_id',
       'pickup_request_id', 'request_code', 'shipment_id', 'parcel_id',
       'wayplan_id', 'wayplan_code', 'route_no', 'manifest_id'
     )
    join private.be_golive_readiness_cutovers_v1 x
      on x.cutover_id = s.cutover_id
     and x.cutover_code = 'PRE_GOLIVE_UAT_20260901'
  loop
    execute format(
      'insert into private.be_golive_readiness_keys_v1
         (cutover_id, key_kind, key_value, source_table)
       select $1, $2, btrim(%1$I::text), $3
       from public.%2$I
       where nullif(btrim(%1$I::text), '''') is not null
       on conflict do nothing',
      r.column_name,
      r.table_name
    )
    using r.cutover_id, r.column_name, r.table_name;
  end loop;
end;
$readiness_keys$;

-- Refresh exact private counts and move the readiness boundary to the final
-- statement of this corrective transaction.
do $readiness_counts$
declare
  r record;
  v_count bigint;
begin
  for r in
    select s.cutover_id, s.table_schema, s.table_name
    from private.be_golive_readiness_scope_v1 s
    join private.be_golive_readiness_cutovers_v1 x
      on x.cutover_id = s.cutover_id
     and x.cutover_code = 'PRE_GOLIVE_UAT_20260901'
  loop
    execute format('select count(*) from %I.%I', r.table_schema, r.table_name)
      into v_count;

    update private.be_golive_readiness_scope_v1
    set row_count = v_count
    where cutover_id = r.cutover_id
      and table_schema = r.table_schema
      and table_name = r.table_name;
  end loop;

  update private.be_golive_readiness_cutovers_v1 c
  set
    cutoff_at = clock_timestamp(),
    target_table_count = s.target_table_count,
    existing_table_count = s.existing_table_count,
    nonempty_table_count = s.nonempty_table_count,
    isolated_row_count = s.isolated_row_count,
    isolated_key_count = (
      select count(*)
      from private.be_golive_readiness_keys_v1 k
      where k.cutover_id = c.cutover_id
    ),
    metadata = c.metadata || jsonb_build_object(
      'boundary_fix', 'V1_1',
      'boundary_refreshed_at', clock_timestamp(),
      'unkeyed_rows_isolated', true
    )
  from (
    select
      cutover_id,
      count(*)::integer as target_table_count,
      count(*) filter (
        where to_regclass(table_schema || '.' || quote_ident(table_name)) is not null
      )::integer as existing_table_count,
      count(*) filter (where row_count > 0)::integer as nonempty_table_count,
      coalesce(sum(row_count), 0)::bigint as isolated_row_count
    from private.be_golive_readiness_scope_v1
    group by cutover_id
  ) s
  where c.cutover_id = s.cutover_id
    and c.cutover_code = 'PRE_GOLIVE_UAT_20260901';
end;
$readiness_counts$;

comment on function public.be_is_pre_golive_uat_key_v1(text) is
  'True for captured pre-go-live identifiers and for blank operational keys.';
