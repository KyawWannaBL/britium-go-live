-- Secure Britium master-data CRUD functions.
-- Caller-supplied actor emails are retained in signatures for compatibility
-- but are deliberately ignored.

begin;

create or replace function public.be_master_data_actor_email()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    nullif(lower(auth.jwt() ->> 'email'), ''),
    nullif(lower(auth.jwt() #>> '{user_metadata,email}'), ''),
    nullif(lower(auth.jwt() #>> '{app_metadata,email}'), ''),
    case when auth.uid() is not null then auth.uid()::text end,
    case when auth.role() = 'service_role' then 'service-role' end,
    'unknown'
  );
$$;

create or replace function public.be_master_data_can_write()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    coalesce(auth.role() = 'service_role', false)
    or coalesce(
      (
        select lower(replace(coalesce(nullif(trim(p.role), ''), ''), '-', '_'))
        from public.profiles p
        where p.id = auth.uid()
      ),
      lower(replace(coalesce(
        nullif(auth.jwt() #>> '{app_metadata,role}', ''),
        nullif(auth.jwt() #>> '{user_metadata,role}', ''),
        nullif(auth.jwt() ->> 'app_role', ''),
        ''
      ), '-', '_'))
    ) = any(array[
      'superadmin',
      'super_admin',
      'admin',
      'master_data_admin',
      'master_data_manager',
      'master_data',
      'md_admin'
    ]);
$$;

create or replace function public.be_master_data_require_write()
returns void
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required for master-data changes';
  end if;

  if not public.be_master_data_can_write() then
    raise exception using
      errcode = '42501',
      message = 'Your role is not authorized to modify master data';
  end if;
end;
$$;

create or replace function public.be_master_data_upsert_column(
  p_dataset_key text,
  p_field_key text,
  p_label_en text default null,
  p_label_mm text default null,
  p_data_type text default 'text',
  p_required boolean default false,
  p_editable boolean default true,
  p_visible boolean default true,
  p_options jsonb default '[]'::jsonb,
  p_sort_order integer default 999
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.be_master_data_require_write();

  if nullif(trim(coalesce(p_dataset_key, '')), '') is null then
    raise exception 'dataset_key is required';
  end if;

  if nullif(trim(coalesce(p_field_key, '')), '') is null then
    raise exception 'field_key is required';
  end if;

  insert into public.be_master_data_columns (
    dataset_key,
    field_key,
    label_en,
    label_mm,
    data_type,
    required,
    editable,
    visible,
    options,
    sort_order,
    updated_at
  )
  values (
    trim(p_dataset_key),
    trim(p_field_key),
    coalesce(
      nullif(trim(p_label_en), ''),
      initcap(replace(trim(p_field_key), '_', ' '))
    ),
    coalesce(
      nullif(trim(p_label_mm), ''),
      nullif(trim(p_label_en), ''),
      initcap(replace(trim(p_field_key), '_', ' '))
    ),
    coalesce(nullif(trim(p_data_type), ''), 'text'),
    coalesce(p_required, false),
    coalesce(p_editable, true),
    coalesce(p_visible, true),
    coalesce(p_options, '[]'::jsonb),
    coalesce(p_sort_order, 999),
    now()
  )
  on conflict (dataset_key, field_key) do update set
    label_en = excluded.label_en,
    label_mm = excluded.label_mm,
    data_type = excluded.data_type,
    required = excluded.required,
    editable = excluded.editable,
    visible = excluded.visible,
    options = excluded.options,
    sort_order = excluded.sort_order,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'dataset_key', trim(p_dataset_key),
    'field_key', trim(p_field_key),
    'actor_email', public.be_master_data_actor_email()
  );
end;
$$;

create or replace function public.be_master_data_upsert_record(
  p_dataset_key text,
  p_record_key text,
  p_payload jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_primary_key text;
  v_record_key text;
  v_actor_email text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_row public.be_master_data_rows;
begin
  perform public.be_master_data_require_write();

  if nullif(trim(coalesce(p_dataset_key, '')), '') is null then
    raise exception 'dataset_key is required';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_actor_email := public.be_master_data_actor_email();

  select primary_key
  into v_primary_key
  from public.be_master_data_tabs
  where dataset_key = trim(p_dataset_key)
    and active = true;

  if v_primary_key is null then
    raise exception 'Unknown or inactive master dataset: %', p_dataset_key;
  end if;

  v_record_key := nullif(trim(coalesce(p_record_key, '')), '');

  if v_record_key is null then
    v_record_key :=
      nullif(trim(coalesce(v_payload ->> v_primary_key, '')), '');
  end if;

  if v_record_key is null then
    v_record_key :=
      upper(substr(md5(clock_timestamp()::text || random()::text), 1, 12));

    v_payload := jsonb_set(
      v_payload,
      array[v_primary_key],
      to_jsonb(v_record_key),
      true
    );
  end if;

  insert into public.be_master_data_rows (
    dataset_key,
    record_key,
    payload,
    status,
    updated_by_email,
    updated_at,
    deleted_at
  )
  values (
    trim(p_dataset_key),
    v_record_key,
    v_payload,
    coalesce(nullif(v_payload ->> 'status', ''), 'ACTIVE'),
    v_actor_email,
    now(),
    null
  )
  on conflict (dataset_key, record_key) do update set
    payload = excluded.payload,
    status = coalesce(
      nullif(excluded.payload ->> 'status', ''),
      public.be_master_data_rows.status,
      'ACTIVE'
    ),
    updated_by_email = v_actor_email,
    updated_at = now(),
    deleted_at = null
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'dataset_key', v_row.dataset_key,
    'record_key', v_row.record_key,
    'actor_email', v_actor_email,
    'row', jsonb_build_object(
      'id', v_row.id,
      'dataset_key', v_row.dataset_key,
      'record_key', v_row.record_key,
      'payload', v_row.payload,
      'status', v_row.status,
      'updated_at', v_row.updated_at
    )
  );
end;
$$;

create or replace function public.be_master_data_delete_record(
  p_dataset_key text,
  p_record_key text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer;
  v_actor_email text;
begin
  perform public.be_master_data_require_write();

  if nullif(trim(coalesce(p_dataset_key, '')), '') is null then
    raise exception 'dataset_key is required';
  end if;

  if nullif(trim(coalesce(p_record_key, '')), '') is null then
    raise exception 'record_key is required';
  end if;

  v_actor_email := public.be_master_data_actor_email();

  update public.be_master_data_rows
  set deleted_at = now(),
      status = 'DELETED',
      updated_by_email = v_actor_email,
      updated_at = now()
  where dataset_key = trim(p_dataset_key)
    and record_key = trim(p_record_key)
    and deleted_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', v_count > 0,
    'dataset_key', trim(p_dataset_key),
    'record_key', trim(p_record_key),
    'deleted', v_count,
    'actor_email', v_actor_email
  );
end;
$$;

create or replace function public.be_master_data_bulk_upsert_records(
  p_dataset_key text,
  p_rows jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_primary_key text;
  v_record_key text;
begin
  perform public.be_master_data_require_write();

  if nullif(trim(coalesce(p_dataset_key, '')), '') is null then
    raise exception 'dataset_key is required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Bulk upload is limited to 5000 rows';
  end if;

  select primary_key
  into v_primary_key
  from public.be_master_data_tabs
  where dataset_key = trim(p_dataset_key)
    and active = true;

  if v_primary_key is null then
    raise exception 'Unknown or inactive master dataset: %', p_dataset_key;
  end if;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Every bulk row must be a JSON object';
    end if;

    v_record_key := nullif(trim(coalesce(v_row ->> v_primary_key, '')), '');

    perform public.be_master_data_upsert_record(
      trim(p_dataset_key),
      v_record_key,
      v_row,
      null
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'dataset_key', trim(p_dataset_key),
    'upserted', v_count,
    'actor_email', public.be_master_data_actor_email()
  );
end;
$$;

-- Prevent direct browser access to the backing tables.
alter table if exists public.be_master_data_tabs enable row level security;
alter table if exists public.be_master_data_columns enable row level security;
alter table if exists public.be_master_data_rows enable row level security;

revoke all on table public.be_master_data_tabs
  from public, anon, authenticated;
revoke all on table public.be_master_data_columns
  from public, anon, authenticated;
revoke all on table public.be_master_data_rows
  from public, anon, authenticated;

-- Snapshot is readable only through an authenticated session.
revoke all on function public.be_master_data_page_snapshot()
  from public, anon;
grant execute on function public.be_master_data_page_snapshot()
  to authenticated, service_role;

-- Writes are callable by authenticated users, but each function performs
-- its own role authorization before changing data.
revoke all on function public.be_master_data_upsert_column(
  text, text, text, text, text, boolean, boolean, boolean, jsonb, integer
) from public, anon;

revoke all on function public.be_master_data_upsert_record(
  text, text, jsonb, text
) from public, anon;

revoke all on function public.be_master_data_delete_record(
  text, text, text
) from public, anon;

revoke all on function public.be_master_data_bulk_upsert_records(
  text, jsonb, text
) from public, anon;

grant execute on function public.be_master_data_upsert_column(
  text, text, text, text, text, boolean, boolean, boolean, jsonb, integer
) to authenticated, service_role;

grant execute on function public.be_master_data_upsert_record(
  text, text, jsonb, text
) to authenticated, service_role;

grant execute on function public.be_master_data_delete_record(
  text, text, text
) to authenticated, service_role;

grant execute on function public.be_master_data_bulk_upsert_records(
  text, jsonb, text
) to authenticated, service_role;

-- Internal authorization helpers must not be invoked by browser roles.
revoke all on function public.be_master_data_actor_email()
  from public, anon, authenticated;
revoke all on function public.be_master_data_can_write()
  from public, anon, authenticated;
revoke all on function public.be_master_data_require_write()
  from public, anon, authenticated;

commit;
