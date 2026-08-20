-- Britium Data Entry V25
-- Partial Waybill creation plus a durable Needed-to-Fix queue.
-- Run after data_entry_waybill_bridge_v24.sql.
-- This script does not drop or replace application views.

create table if not exists public.be_data_entry_needs_fix_v25 (
  pickup_id text not null,
  parcel_sequence integer not null,
  way_id text null,
  os text null,
  missing_fields text[] not null default '{}'::text[],
  photo_checked boolean not null default false,
  row_data jsonb not null default '{}'::jsonb,
  status text not null default 'needs_fix',
  deferred_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  primary key (pickup_id, parcel_sequence)
);

create index if not exists be_data_entry_needs_fix_v25_status_idx
  on public.be_data_entry_needs_fix_v25 (status, updated_at desc);

create index if not exists be_data_entry_needs_fix_v25_way_id_idx
  on public.be_data_entry_needs_fix_v25 (way_id);

alter table public.be_data_entry_needs_fix_v25 enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'be_data_entry_needs_fix_v25'
      and policyname = 'authenticated_read_needs_fix_v25'
  ) then
    create policy authenticated_read_needs_fix_v25
      on public.be_data_entry_needs_fix_v25
      for select to authenticated
      using (true);
  end if;
end;
$$;

grant select on public.be_data_entry_needs_fix_v25 to authenticated;
grant all on public.be_data_entry_needs_fix_v25 to service_role;

create or replace function public.be_data_entry_confirm_partial_waybill_v25(
  p_pickup_id text,
  p_ready_rows jsonb,
  p_deferred_rows jsonb default '[]'::jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_ready_count integer := 0;
  v_deferred_count integer := 0;
  v_resolved_count integer := 0;
begin
  if nullif(btrim(coalesce(p_pickup_id, '')), '') is null then
    raise exception 'pickup_id is required';
  end if;

  if jsonb_typeof(coalesce(p_ready_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'p_ready_rows must be a JSON array';
  end if;

  if jsonb_typeof(coalesce(p_deferred_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'p_deferred_rows must be a JSON array';
  end if;

  v_ready_count := jsonb_array_length(coalesce(p_ready_rows, '[]'::jsonb));
  v_deferred_count := jsonb_array_length(coalesce(p_deferred_rows, '[]'::jsonb));

  if v_ready_count = 0 then
    raise exception 'At least one ready parcel row is required';
  end if;

  -- Consolidate incomplete/unchecked/deferred rows into one durable queue.
  insert into public.be_data_entry_needs_fix_v25 (
    pickup_id,
    parcel_sequence,
    way_id,
    os,
    missing_fields,
    photo_checked,
    row_data,
    status,
    deferred_by,
    updated_at,
    resolved_at
  )
  select
    p_pickup_id,
    coalesce(
      nullif(regexp_replace(coalesce(x.value->>'စဉ်', x.value->>'parcel_sequence', ''), '[^0-9-]+', '', 'g'), '')::integer,
      x.ordinality::integer
    ),
    nullif(btrim(coalesce(x.value->>'Way ID', x.value->>'way_id', '')), ''),
    nullif(btrim(coalesce(x.value->>'OS', x.value->>'os', '')), ''),
    case
      when jsonb_typeof(x.value->'missing_fields') = 'array'
        then array(select jsonb_array_elements_text(x.value->'missing_fields'))
      else '{}'::text[]
    end,
    coalesce((x.value->>'photo_checked')::boolean, false),
    x.value,
    'needs_fix',
    p_actor_email,
    now(),
    null
  from jsonb_array_elements(coalesce(p_deferred_rows, '[]'::jsonb)) with ordinality as x(value, ordinality)
  on conflict (pickup_id, parcel_sequence) do update set
    way_id = excluded.way_id,
    os = excluded.os,
    missing_fields = excluded.missing_fields,
    photo_checked = excluded.photo_checked,
    row_data = excluded.row_data,
    status = 'needs_fix',
    deferred_by = coalesce(excluded.deferred_by, be_data_entry_needs_fix_v25.deferred_by),
    updated_at = now(),
    resolved_at = null;

  -- Rows included in the current Waybill are no longer pending fixes.
  update public.be_data_entry_needs_fix_v25 n
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where n.pickup_id = p_pickup_id
    and exists (
      select 1
      from jsonb_array_elements(p_ready_rows) r(value)
      where nullif(btrim(coalesce(r.value->>'Way ID', r.value->>'way_id', '')), '') = n.way_id
         or coalesce(
              nullif(regexp_replace(coalesce(r.value->>'စဉ်', r.value->>'parcel_sequence', ''), '[^0-9-]+', '', 'g'), '')::integer,
              -1
            ) = n.parcel_sequence
    );
  get diagnostics v_resolved_count = row_count;

  -- Use the installed V24 bridge for the ready subset only. This allows complete
  -- parcels to flow to Waybill Studio, Print Room, and Warehouse while the rest
  -- remain visible in the Needed-to-Fix queue.
  select public.be_data_entry_confirm_waybill_v24(
    p_pickup_id,
    p_ready_rows,
    p_actor_email
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'partial_waybill', true,
    'ready_count', v_ready_count,
    'deferred_count', v_deferred_count,
    'resolved_needs_fix_count', v_resolved_count,
    'needs_fix_table', 'be_data_entry_needs_fix_v25'
  );
end;
$$;

grant execute on function public.be_data_entry_confirm_partial_waybill_v25(text, jsonb, jsonb, text) to authenticated;
grant execute on function public.be_data_entry_confirm_partial_waybill_v25(text, jsonb, jsonb, text) to service_role;

notify pgrst, 'reload schema';

select
  to_regprocedure('public.be_data_entry_confirm_partial_waybill_v25(text,jsonb,jsonb,text)')::text as partial_waybill_signature,
  to_regclass('public.be_data_entry_needs_fix_v25')::text as needs_fix_table,
  to_regprocedure('public.be_data_entry_confirm_waybill_v24(text,jsonb,text)')::text as v24_bridge_signature;
