
-- 51_masterdata_pickupid_rider_dropoff_golive.sql
create extension if not exists pgcrypto;

create table if not exists public.be_master_data_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null,
  value text not null,
  label text,
  sort_order integer default 0,
  is_active boolean default true,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_be_master_data_options_unique
on public.be_master_data_options(option_type, value);

create or replace function public.be_master_data_combobox(
  p_kind text,
  p_search text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
as $$
declare
  normalized_kind text := lower(regexp_replace(coalesce(p_kind,''), '\s+', '_', 'g'));
  search_text text := lower(coalesce(p_search,''));
  result jsonb;
begin
  if normalized_kind in ('merchant','merchant_master') then normalized_kind := 'merchants'; end if;
  if normalized_kind in ('customer','customer_master') then normalized_kind := 'customers'; end if;
  if normalized_kind in ('township','township_master') then normalized_kind := 'townships'; end if;
  if normalized_kind in ('route','routes') then normalized_kind := 'route_group'; end if;
  if normalized_kind in ('branch','branches') then normalized_kind := 'branch_node'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'value', o.value,
      'label', coalesce(o.label, o.value),
      'meta', coalesce(o.meta, '{}'::jsonb) || jsonb_build_object('option_type', o.option_type, 'is_active', o.is_active)
    )
    order by o.sort_order, coalesce(o.label,o.value)
  ), '[]'::jsonb)
  into result
  from public.be_master_data_options o
  where lower(o.option_type) = normalized_kind
    and coalesce(o.is_active, true) = true
    and (
      p_search is null or p_search = ''
      or lower(coalesce(o.value,'')) like '%' || search_text || '%'
      or lower(coalesce(o.label,'')) like '%' || search_text || '%'
      or lower(coalesce(o.meta::text,'')) like '%' || search_text || '%'
    );

  return (select coalesce(jsonb_agg(x), '[]'::jsonb)
          from (select value from jsonb_array_elements(result) value limit greatest(coalesce(p_limit,50),1)) x);
end;
$$;

create table if not exists public.be_pickup_id_aliases (
  id uuid primary key default gen_random_uuid(),
  legacy_pickup_id text not null,
  canonical_pickup_id text not null,
  source text default 'go_live_migration',
  reason text,
  created_at timestamptz default now(),
  created_by text default 'system'
);

create unique index if not exists idx_be_pickup_id_aliases_legacy
on public.be_pickup_id_aliases(legacy_pickup_id);

create index if not exists idx_be_pickup_id_aliases_canonical
on public.be_pickup_id_aliases(canonical_pickup_id);

create or replace function public.be_is_legacy_cs_pickup_id(p_pickup_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_pickup_id, '') ~ '^D[0-9]{4}-[A-Za-z0-9]+-[0-9]+$';
$$;

create or replace function public.be_resolve_pickup_id(p_pickup_id text)
returns text
language sql
stable
as $$
  select coalesce(
    (select a.canonical_pickup_id
     from public.be_pickup_id_aliases a
     where a.legacy_pickup_id = p_pickup_id
     limit 1),
    p_pickup_id
  );
$$;

create or replace function public.be_register_pickup_id_alias(
  p_legacy_pickup_id text,
  p_canonical_pickup_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
as $$
begin
  if coalesce(p_legacy_pickup_id, '') = '' or coalesce(p_canonical_pickup_id, '') = '' then
    raise exception 'legacy and canonical pickup IDs are required';
  end if;

  insert into public.be_pickup_id_aliases(legacy_pickup_id, canonical_pickup_id, reason)
  values (p_legacy_pickup_id, p_canonical_pickup_id, p_reason)
  on conflict (legacy_pickup_id) do update set
    canonical_pickup_id = excluded.canonical_pickup_id,
    reason = coalesce(excluded.reason, public.be_pickup_id_aliases.reason);

  return jsonb_build_object('ok', true, 'legacy_pickup_id', p_legacy_pickup_id, 'canonical_pickup_id', p_canonical_pickup_id);
end;
$$;

create or replace function public.be_go_live_pickup_id_audit()
returns table (
  table_name text,
  column_name text,
  legacy_d_count bigint,
  p_count bigint,
  sample_legacy_ids jsonb,
  sample_p_ids jsonb
)
language plpgsql
as $$
declare
  r record;
  q text;
begin
  for r in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and lower(column_name) in (
        'pickup_id','pickupid','pickup_no','pickupno','pickup_request_id',
        'pickup_request_code','cs_pickup_id','data_entry_pickup_id',
        'canonical_pickup_id','operational_pickup_id'
      )
    order by table_name, column_name
  loop
    q := format($f$
      select %L::text, %L::text,
        count(*) filter (where (%I)::text ~ '^D[0-9]{4}-[A-Za-z0-9]+-[0-9]+$')::bigint,
        count(*) filter (where (%I)::text ~ '^P[0-9]{4}-[A-Za-z0-9]+')::bigint,
        coalesce(jsonb_agg(distinct (%I)::text) filter (where (%I)::text ~ '^D[0-9]{4}-[A-Za-z0-9]+-[0-9]+$'), '[]'::jsonb),
        coalesce(jsonb_agg(distinct (%I)::text) filter (where (%I)::text ~ '^P[0-9]{4}-[A-Za-z0-9]+'), '[]'::jsonb)
      from %I.%I
      where (%I)::text is not null
    $f$, r.table_name, r.column_name, r.column_name, r.column_name, r.column_name, r.column_name, r.column_name, r.column_name, r.table_schema, r.table_name, r.column_name);
    return query execute q;
  end loop;
end;
$$;

create or replace function public.be_go_live_backfill_pickup_aliases_same_row()
returns jsonb
language plpgsql
as $$
declare
  r record;
  before_count integer := 0;
  after_count integer := 0;
  q text;
begin
  select count(*) into before_count from public.be_pickup_id_aliases;

  for r in
    select c1.table_schema, c1.table_name
    from information_schema.columns c1
    join information_schema.columns c2 on c1.table_schema = c2.table_schema and c1.table_name = c2.table_name
    where c1.table_schema = 'public'
      and lower(c1.column_name) = 'pickup_id'
      and lower(c2.column_name) in ('data_entry_pickup_id','canonical_pickup_id','operational_pickup_id')
    group by c1.table_schema, c1.table_name
  loop
    q := format($f$
      insert into public.be_pickup_id_aliases(legacy_pickup_id, canonical_pickup_id, source, reason)
      select distinct
        (pickup_id)::text,
        coalesce(
          nullif((to_jsonb(t)->>'canonical_pickup_id'), ''),
          nullif((to_jsonb(t)->>'data_entry_pickup_id'), ''),
          nullif((to_jsonb(t)->>'operational_pickup_id'), '')
        )::text,
        'same_row_backfill',
        'Mapped because legacy and canonical IDs existed in the same row'
      from %I.%I t
      where (pickup_id)::text ~ '^D[0-9]{4}-[A-Za-z0-9]+-[0-9]+$'
        and coalesce(
          nullif((to_jsonb(t)->>'canonical_pickup_id'), ''),
          nullif((to_jsonb(t)->>'data_entry_pickup_id'), ''),
          nullif((to_jsonb(t)->>'operational_pickup_id'), '')
        ) ~ '^P[0-9]{4}-[A-Za-z0-9]+'
      on conflict (legacy_pickup_id) do update set
        canonical_pickup_id = excluded.canonical_pickup_id,
        source = excluded.source,
        reason = excluded.reason
    $f$, r.table_schema, r.table_name);
    execute q;
  end loop;

  select count(*) into after_count from public.be_pickup_id_aliases;
  return jsonb_build_object('ok', true, 'inserted_or_updated', after_count - before_count, 'total_aliases', after_count);
end;
$$;

create or replace function public.be_wayplan_is_dropoff_route(p_route_label text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_route_label,'') not ilike '%pickup%'
     and coalesce(p_route_label,'') not ilike '%Aung Mingalar Highway%'
     and coalesce(p_route_label,'') not ilike '%Hlaing Thar Yar Highway%';
$$;

create or replace function public.be_go_live_wireup_healthcheck()
returns jsonb
language plpgsql
stable
as $$
declare
  out jsonb;
begin
  select jsonb_build_object(
    'master_options', (select count(*) from public.be_master_data_options),
    'merchant_options', (select count(*) from public.be_master_data_options where option_type='merchants' and is_active),
    'route_groups', (select public.be_master_data_combobox('route_group', null, 20)),
    'pickup_aliases', (select count(*) from public.be_pickup_id_aliases),
    'legacy_pickup_audit', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.be_go_live_pickup_id_audit() x)
  ) into out;
  return out;
end;
$$;
