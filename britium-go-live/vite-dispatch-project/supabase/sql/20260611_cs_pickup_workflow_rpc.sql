create extension if not exists pgcrypto;

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists merchant_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists contact_phone text,
  add column if not exists sender_phone text,
  add column if not exists branch_code text,
  add column if not exists pickup_address text,
  add column if not exists pickup_township text,
  add column if not exists pickup_city text,
  add column if not exists requested_date date,
  add column if not exists pickup_date date,
  add column if not exists pickup_time text,
  add column if not exists time_window text,
  add column if not exists payment_method text,
  add column if not exists tariff_tier text,
  add column if not exists priority text,
  add column if not exists service_type text,
  add column if not exists parcel_count integer default 1,
  add column if not exists number_of_parcels integer default 1,
  add column if not exists total_parcels integer default 1,
  add column if not exists delivery_way_count integer default 1,
  add column if not exists status text default 'PICKUP_REQUESTED',
  add column if not exists process_status text default 'PICKUP_REQUESTED',
  add column if not exists data_entry_status text default 'PENDING',
  add column if not exists source_portal text default 'CS_PORTAL',
  add column if not exists requester_type text default 'CUSTOMER_SERVICE',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_be_portal_pickup_requests_pickup_id
  on public.be_portal_pickup_requests(pickup_id);

create index if not exists idx_be_portal_pickup_requests_status
  on public.be_portal_pickup_requests(status);

create index if not exists idx_be_portal_pickup_requests_data_entry_status
  on public.be_portal_pickup_requests(data_entry_status);

create table if not exists public.be_portal_pickup_request_items (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  line_no integer,
  tracking_no text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  delivery_township text,
  cod_amount numeric default 0,
  item_value numeric default 0,
  weight_kg numeric default 0,
  payment_method text default 'COD',
  parcel_count integer default 1,
  item_status text default 'DATA_ENTRY_REGISTERED',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_be_pickup_request_items_pickup_id
  on public.be_portal_pickup_request_items(pickup_id);

create or replace function public.be_safe_insert_json(
  p_table_schema text,
  p_table_name text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_payload jsonb;
begin
  if to_regclass(format('%I.%I', p_table_schema, p_table_name)) is null then
    return;
  end if;

  select jsonb_object_agg(e.key, e.value)
    into clean_payload
  from jsonb_each(p_payload) as e(key, value)
  where exists (
    select 1
    from information_schema.columns c
    where c.table_schema = p_table_schema
      and c.table_name = p_table_name
      and c.column_name = e.key
  );

  if clean_payload is null then
    return;
  end if;

  execute format(
    'insert into %I.%I select * from jsonb_populate_record(null::%I.%I, $1)',
    p_table_schema,
    p_table_name,
    p_table_schema,
    p_table_name
  )
  using clean_payload;
end;
$$;

create or replace function public.be_cs_submit_pickup_request(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req_date date;
  raw_count text;
  parcel_count_int integer;
  raw_code text;
  code3 text;
  pickup_id_generated text;
  full_payload jsonb;
  clean_payload jsonb;
  inserted_row jsonb;
  role_name text;
  branch_code text;
  payment_method text;
begin
  req_date := coalesce(nullif(p_request->>'requested_date', '')::date, current_date);

  raw_count := coalesce(
    nullif(p_request->>'delivery_way_count', ''),
    nullif(p_request->>'parcel_count', ''),
    nullif(p_request->>'number_of_parcels', ''),
    nullif(p_request->>'total_parcels', ''),
    '1'
  );

  if raw_count !~ '^[0-9]+$' then
    parcel_count_int := 1;
  else
    parcel_count_int := greatest(1, least(500, raw_count::integer));
  end if;

  raw_code := upper(regexp_replace(
    coalesce(
      nullif(p_request->>'merchant_code', ''),
      nullif(p_request->>'merchantName', ''),
      nullif(p_request->>'merchant_name', ''),
      'GEN'
    ),
    '[^A-Z0-9]',
    '',
    'g'
  ));

  code3 := substring((raw_code || 'XXX') from 1 for 3);

  pickup_id_generated := format(
    'P%s-%s-%s',
    to_char(req_date, 'MMDD'),
    code3,
    lpad(parcel_count_int::text, 3, '0')
  );

  branch_code := coalesce(nullif(p_request->>'branch_code', ''), 'YGN');
  payment_method := coalesce(nullif(p_request->>'payment_method', ''), 'COD');

  full_payload := p_request || jsonb_build_object(
    'pickup_id', pickup_id_generated,
    'merchant_code', coalesce(nullif(p_request->>'merchant_code', ''), code3),
    'merchant_name', coalesce(nullif(p_request->>'merchant_name', ''), nullif(p_request->>'merchantName', '')),
    'contact_phone', coalesce(nullif(p_request->>'contact_phone', ''), nullif(p_request->>'sender_phone', '')),
    'sender_phone', coalesce(nullif(p_request->>'sender_phone', ''), nullif(p_request->>'contact_phone', '')),
    'branch_code', branch_code,
    'requested_date', req_date,
    'pickup_date', req_date,
    'payment_method', payment_method,
    'parcel_count', parcel_count_int,
    'number_of_parcels', parcel_count_int,
    'total_parcels', parcel_count_int,
    'delivery_way_count', parcel_count_int,
    'status', 'PICKUP_REQUESTED',
    'process_status', 'PICKUP_REQUESTED',
    'data_entry_status', 'PENDING',
    'source_portal', 'CS_PORTAL',
    'requester_type', 'CUSTOMER_SERVICE',
    'created_at', now(),
    'updated_at', now()
  );

  select jsonb_object_agg(e.key, e.value)
    into clean_payload
  from jsonb_each(full_payload) as e(key, value)
  where exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'be_portal_pickup_requests'
      and c.column_name = e.key
  );

  execute
    'with ins as (
       insert into public.be_portal_pickup_requests
       select * from jsonb_populate_record(null::public.be_portal_pickup_requests, $1)
       returning *
     )
     select to_jsonb(ins.*) from ins'
    into inserted_row
    using clean_payload;

  perform public.be_safe_insert_json(
    'public',
    'be_portal_cargo_events',
    jsonb_build_object(
      'pickup_id', pickup_id_generated,
      'event_type', 'PICKUP_REQUESTED',
      'process_status', 'PICKUP_REQUESTED',
      'status_code', 'PICKUP_REQUESTED',
      'description', 'Customer Service submitted pickup request ' || pickup_id_generated,
      'actor_role', 'customer_service',
      'created_at', now(),
      'metadata', full_payload
    )
  );

  foreach role_name in array array['customer_service', 'supervisor', 'operation_manager', 'dispatch']
  loop
    perform public.be_safe_insert_json(
      'public',
      'be_app_notifications',
      jsonb_build_object(
        'title', 'New pickup request',
        'message', 'Pickup ' || pickup_id_generated || ' requires workflow action.',
        'notification_type', 'PICKUP_REQUESTED',
        'target_role', role_name,
        'source_table', 'be_portal_pickup_requests',
        'source_key', pickup_id_generated,
        'pickup_id', pickup_id_generated,
        'is_read', false,
        'created_at', now(),
        'updated_at', now(),
        'metadata', full_payload
      )
    );
  end loop;

  if upper(payment_method) = 'COD' then
    perform public.be_safe_insert_json(
      'public',
      'be_app_notifications',
      jsonb_build_object(
        'title', 'COD pickup request',
        'message', 'Pickup ' || pickup_id_generated || ' is COD and requires finance visibility.',
        'notification_type', 'COD_PICKUP_REQUESTED',
        'target_role', 'finance',
        'source_table', 'be_portal_pickup_requests',
        'source_key', pickup_id_generated,
        'pickup_id', pickup_id_generated,
        'is_read', false,
        'created_at', now(),
        'updated_at', now(),
        'metadata', full_payload
      )
    );
  end if;

  if upper(branch_code) in ('MDY', 'NPT') then
    perform public.be_safe_insert_json(
      'public',
      'be_app_notifications',
      jsonb_build_object(
        'title', 'Branch pickup request',
        'message', 'Pickup ' || pickup_id_generated || ' assigned to branch ' || branch_code || '.',
        'notification_type', 'BRANCH_PICKUP_REQUESTED',
        'target_role', 'branch_office',
        'target_branch', branch_code,
        'source_table', 'be_portal_pickup_requests',
        'source_key', pickup_id_generated,
        'pickup_id', pickup_id_generated,
        'is_read', false,
        'created_at', now(),
        'updated_at', now(),
        'metadata', full_payload
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', pickup_id_generated,
    'status', 'PICKUP_REQUESTED',
    'data_entry_status', 'PENDING',
    'delivery_way_count', parcel_count_int,
    'row', inserted_row
  );
end;
$$;

grant execute on function public.be_cs_submit_pickup_request(jsonb) to authenticated;
grant execute on function public.be_safe_insert_json(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
