-- Customer Service pickup time fix
-- Fixes:
-- ERROR: invalid input syntax for type timestamp with time zone: "15:36"
--
-- Cause:
-- The CS form sends pickup_time from <input type="time"> as HH:MM.
-- Your existing pickup_time column is/was timestamptz, which cannot accept time-only text.
--
-- This patch stores pickup_time as TIME WITHOUT TIME ZONE and recreates the CS RPC safely.
-- Safe to run repeatedly. No mock/sample rows are inserted.

create extension if not exists pgcrypto;

-- Drop compatibility view before changing table column types, if it exists as a view.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'cs_pickup_requests'
      and c.relkind = 'v'
  ) then
    execute 'drop view public.cs_pickup_requests';
  end if;
end $$;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists source text,
  add column if not exists requester_type text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists township text,
  add column if not exists city_region text,
  add column if not exists branch_code text,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists status text default 'DATA_ENTRY_IN_PROGRESS',
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text,
  add column if not exists priority text default 'Normal',
  add column if not exists special_instructions text,
  add column if not exists pickup_date date,
  add column if not exists updated_at timestamptz default now();

-- Ensure pickup_time exists and is TIME, not TIMESTAMPTZ.
do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'be_portal_pickup_requests'
    and a.attname = 'pickup_time'
    and a.attisdropped = false;

  if v_type is null then
    execute 'alter table public.be_portal_pickup_requests add column pickup_time time without time zone';
  elsif v_type = 'time without time zone' then
    null;
  elsif v_type in ('timestamp with time zone', 'timestamp without time zone') then
    execute 'alter table public.be_portal_pickup_requests alter column pickup_time drop default';
    execute 'alter table public.be_portal_pickup_requests alter column pickup_time type time without time zone using pickup_time::time';
  elsif v_type = 'date' then
    execute 'alter table public.be_portal_pickup_requests alter column pickup_time drop default';
    execute 'alter table public.be_portal_pickup_requests alter column pickup_time type time without time zone using null';
  else
    execute $cmd$
      alter table public.be_portal_pickup_requests
      alter column pickup_time drop default
    $cmd$;

    execute $cmd$
      alter table public.be_portal_pickup_requests
      alter column pickup_time type time without time zone
      using case
        when nullif(trim(pickup_time::text), '') is null then null
        when trim(pickup_time::text) ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$'
          then trim(pickup_time::text)::time
        when trim(pickup_time::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          then trim(pickup_time::text)::timestamptz::time
        else null
      end
    $cmd$;
  end if;
end $$;

-- Keep pickup_date as DATE if an old migration made it timestamptz/text.
do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'be_portal_pickup_requests'
    and a.attname = 'pickup_date'
    and a.attisdropped = false;

  if v_type is null then
    execute 'alter table public.be_portal_pickup_requests add column pickup_date date';
  elsif v_type = 'date' then
    null;
  elsif v_type in ('timestamp with time zone', 'timestamp without time zone') then
    execute 'alter table public.be_portal_pickup_requests alter column pickup_date drop default';
    execute 'alter table public.be_portal_pickup_requests alter column pickup_date type date using pickup_date::date';
  else
    execute 'alter table public.be_portal_pickup_requests alter column pickup_date drop default';
    execute $cmd$
      alter table public.be_portal_pickup_requests
      alter column pickup_date type date
      using case
        when nullif(trim(pickup_date::text), '') is null then null
        when trim(pickup_date::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then trim(pickup_date::text)::date
        else null
      end
    $cmd$;
  end if;
end $$;

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
  from (
    select
      id,
      pickup_id,
      source,
      requester_type,
      merchant_code,
      merchant_name,
      sender_name,
      sender_phone,
      pickup_address,
      township,
      city_region,
      branch_code,
      parcel_count,
      cod_amount,
      status,
      payment_terms,
      tariff_code,
      priority,
      special_instructions,
      pickup_date,
      case when pickup_time is null then null else to_char(pickup_time, 'HH24:MI') end as pickup_time,
      created_at,
      updated_at
    from public.be_portal_pickup_requests
    order by created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) p;
$$;

create or replace function public.be_customer_service_create_pickup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text;
  v_pickup_date date;
  v_pickup_time time without time zone;
  v_inserted public.be_portal_pickup_requests;
begin
  if nullif(trim(coalesce(p_payload->>'pickup_address', '')), '') is null then
    raise exception 'Pickup address is required from merchant master data.';
  end if;

  v_pickup_id := coalesce(
    nullif(p_payload->>'pickup_id', ''),
    'P' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(coalesce(nullif(p_payload->>'merchant_code',''), 'CS'))
  );

  v_pickup_date := case
    when nullif(trim(coalesce(p_payload->>'pickup_date', '')), '') is null then null
    else (p_payload->>'pickup_date')::date
  end;

  v_pickup_time := case
    when nullif(trim(coalesce(p_payload->>'pickup_time', '')), '') is null then null
    else (p_payload->>'pickup_time')::time
  end;

  insert into public.be_portal_pickup_requests (
    pickup_id,
    source,
    requester_type,
    merchant_code,
    merchant_name,
    sender_name,
    sender_phone,
    pickup_address,
    township,
    city_region,
    branch_code,
    parcel_count,
    cod_amount,
    status,
    payment_terms,
    tariff_code,
    priority,
    special_instructions,
    pickup_date,
    pickup_time,
    updated_at
  )
  values (
    v_pickup_id,
    'customer_service',
    coalesce(nullif(p_payload->>'requester_type', ''), 'Merchant'),
    p_payload->>'merchant_code',
    p_payload->>'merchant_name',
    coalesce(nullif(p_payload->>'sender_name', ''), p_payload->>'merchant_name'),
    p_payload->>'sender_phone',
    p_payload->>'pickup_address',
    p_payload->>'township',
    coalesce(nullif(p_payload->>'city_region', ''), p_payload->>'city'),
    coalesce(nullif(p_payload->>'assigned_branch', ''), nullif(p_payload->>'branch_code', ''), 'YGN'),
    coalesce(nullif(p_payload->>'parcel_count','')::integer, 1),
    coalesce(nullif(p_payload->>'cod_amount','')::numeric, 0),
    'DATA_ENTRY_IN_PROGRESS',
    coalesce(nullif(p_payload->>'payment_terms',''), 'COD'),
    p_payload->>'tariff_code',
    coalesce(nullif(p_payload->>'priority',''), 'Normal'),
    p_payload->>'special_instructions',
    v_pickup_date,
    v_pickup_time,
    now()
  )
  returning * into v_inserted;

  return (
    select to_jsonb(x)
    from (
      select
        v_inserted.*,
        case when v_inserted.pickup_time is null then null else to_char(v_inserted.pickup_time, 'HH24:MI') end as pickup_time_text
    ) x
  );
end;
$$;

-- Recreate compatibility view for old deployed builds.
do $$
begin
  if to_regclass('public.cs_pickup_requests') is null then
    execute 'create view public.cs_pickup_requests as
      select
        id,
        pickup_id,
        source,
        requester_type,
        merchant_code,
        merchant_name,
        sender_name,
        sender_phone,
        pickup_address,
        township,
        city_region,
        branch_code,
        parcel_count,
        cod_amount,
        status,
        payment_terms,
        tariff_code,
        priority,
        special_instructions,
        pickup_date,
        case when pickup_time is null then null else to_char(pickup_time, ''HH24:MI'') end as pickup_time,
        created_at,
        updated_at
      from public.be_portal_pickup_requests';
  end if;
end $$;

alter table public.be_portal_pickup_requests enable row level security;

drop policy if exists be_portal_pickup_requests_select_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_insert_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_update_auth on public.be_portal_pickup_requests;
drop policy if exists be_portal_pickup_requests_delete_auth on public.be_portal_pickup_requests;

create policy be_portal_pickup_requests_select_auth
on public.be_portal_pickup_requests for select to authenticated using (true);

create policy be_portal_pickup_requests_insert_auth
on public.be_portal_pickup_requests for insert to authenticated with check (true);

create policy be_portal_pickup_requests_update_auth
on public.be_portal_pickup_requests for update to authenticated using (true) with check (true);

create policy be_portal_pickup_requests_delete_auth
on public.be_portal_pickup_requests for delete to authenticated using (true);

grant select, insert, update, delete on public.be_portal_pickup_requests to authenticated;
grant execute on function public.be_customer_service_pickup_requests(integer) to authenticated;
grant execute on function public.be_customer_service_create_pickup(jsonb) to authenticated;
grant select on public.cs_pickup_requests to authenticated;

notify pgrst, 'reload schema';

-- Verification
select
  column_name,
  data_type,
  udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'be_portal_pickup_requests'
  and column_name in ('pickup_date', 'pickup_time')
order by column_name;
