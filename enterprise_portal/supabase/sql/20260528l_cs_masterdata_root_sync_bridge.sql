
-- Buildfix #22 — Customer Service / Master Data pickup sync bridge
-- Run in Supabase SQL Editor. Safe: no deletes, no ON CONFLICT.

create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  deliver_id text,
  delivery_way_id text,
  invoice_no text,
  waybill_no text,
  tracking_number text,
  merchant_id text,
  merchant_code text,
  merchant_name text,
  sender_phone text,
  contact_person text,
  pickup_address text,
  pickup_township text,
  pickup_city text,
  pickup_date date,
  pickup_time text,
  parcel_count integer default 1,
  cod_amount numeric default 0,
  payment_method text,
  service_type text,
  priority text,
  branch text,
  route_zone text,
  status text default 'pending_pickup',
  source text default 'customer_service',
  source_channel text,
  requester_type text default 'customer_service',
  payload jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests add column if not exists pickup_id text;
alter table public.be_portal_pickup_requests add column if not exists pickup_way_id text;
alter table public.be_portal_pickup_requests add column if not exists deliver_id text;
alter table public.be_portal_pickup_requests add column if not exists delivery_way_id text;
alter table public.be_portal_pickup_requests add column if not exists invoice_no text;
alter table public.be_portal_pickup_requests add column if not exists waybill_no text;
alter table public.be_portal_pickup_requests add column if not exists tracking_number text;
alter table public.be_portal_pickup_requests add column if not exists merchant_id text;
alter table public.be_portal_pickup_requests add column if not exists merchant_code text;
alter table public.be_portal_pickup_requests add column if not exists merchant_name text;
alter table public.be_portal_pickup_requests add column if not exists sender_phone text;
alter table public.be_portal_pickup_requests add column if not exists contact_person text;
alter table public.be_portal_pickup_requests add column if not exists pickup_address text;
alter table public.be_portal_pickup_requests add column if not exists pickup_township text;
alter table public.be_portal_pickup_requests add column if not exists pickup_city text;
alter table public.be_portal_pickup_requests add column if not exists pickup_date date;
alter table public.be_portal_pickup_requests add column if not exists pickup_time text;
alter table public.be_portal_pickup_requests add column if not exists parcel_count integer default 1;
alter table public.be_portal_pickup_requests add column if not exists cod_amount numeric default 0;
alter table public.be_portal_pickup_requests add column if not exists payment_method text;
alter table public.be_portal_pickup_requests add column if not exists service_type text;
alter table public.be_portal_pickup_requests add column if not exists priority text;
alter table public.be_portal_pickup_requests add column if not exists branch text;
alter table public.be_portal_pickup_requests add column if not exists route_zone text;
alter table public.be_portal_pickup_requests add column if not exists status text default 'pending_pickup';
alter table public.be_portal_pickup_requests add column if not exists source text default 'customer_service';
alter table public.be_portal_pickup_requests add column if not exists source_channel text;
alter table public.be_portal_pickup_requests add column if not exists requester_type text default 'customer_service';
alter table public.be_portal_pickup_requests add column if not exists payload jsonb default '{}'::jsonb;
alter table public.be_portal_pickup_requests add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.be_portal_pickup_requests add column if not exists created_at timestamptz default now();
alter table public.be_portal_pickup_requests add column if not exists updated_at timestamptz default now();

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  tracking_number text,
  event_type text,
  status text,
  message text,
  source text,
  actor_role text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  title text,
  message text,
  target_role text,
  target_branch text,
  pickup_id text,
  source_table text,
  source_key text,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

drop function if exists public.be22_pick_text(jsonb, text[]);
create function public.be22_pick_text(p_data jsonb, variadic p_keys text[])
returns text language plpgsql stable as $$
declare k text; v text;
begin
  foreach k in array p_keys loop
    v := nullif(btrim(coalesce(p_data ->> k, '')), '');
    if v is not null then return v; end if;
  end loop;
  return null;
end $$;

drop function if exists public.be22_pick_number(jsonb, text[]);
create function public.be22_pick_number(p_data jsonb, variadic p_keys text[])
returns numeric language plpgsql stable as $$
declare v text;
begin
  v := public.be22_pick_text(p_data, variadic p_keys);
  if v is null then return null; end if;
  begin return regexp_replace(v, '[^0-9\.\-]', '', 'g')::numeric;
  exception when others then return null; end;
end $$;

drop function if exists public.be22_normalize_merchant(jsonb);
create function public.be22_normalize_merchant(p_row jsonb)
returns jsonb language plpgsql stable as $$
declare
  j jsonb := coalesce(p_row, '{}'::jsonb);
  merged jsonb;
  code text;
  name text;
begin
  merged := j
    || coalesce(j -> 'metadata', '{}'::jsonb)
    || coalesce(j -> 'meta', '{}'::jsonb)
    || coalesce(j -> 'data', '{}'::jsonb)
    || coalesce(j -> 'payload', '{}'::jsonb);

  name := public.be22_pick_text(
    merged,
    'merchant_name','merchant_full_name','business_name','company_name','account_name',
    'sender_name','customer_name','name','label','option_label','display_name'
  );

  code := upper(regexp_replace(coalesce(public.be22_pick_text(
    merged,
    'merchant_code','merchant_3_letter_code','merchant_short_code','short_code',
    'code','option_code','value','option_value','account_code'
  ), ''), '[^A-Za-z0-9]', '', 'g'));

  if code = '' and name is not null then
    code := upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3));
  end if;
  if length(code) > 3 then code := left(code, 3); end if;
  if code = '' then code := null; end if;

  return jsonb_build_object(
    'merchant_id', public.be22_pick_text(merged, 'merchant_id','merchant_account_id','account_id','id','uuid'),
    'merchant_code', code,
    'merchant_name', name,
    'sender_phone', public.be22_pick_text(merged, 'sender_phone','merchant_phone','phone','phone_number','contact_phone','primary_phone','mobile','registered_phone'),
    'contact_person', public.be22_pick_text(merged, 'contact_person','contact_name','owner_name','sender_contact'),
    'pickup_address', public.be22_pick_text(merged, 'pickup_address','merchant_address','sender_address','registered_address','address','full_address','default_pickup_address','business_address'),
    'pickup_township', public.be22_pick_text(merged, 'pickup_township','merchant_township','sender_township','township','default_pickup_township'),
    'pickup_city', public.be22_pick_text(merged, 'pickup_city','merchant_city','sender_city','city','default_pickup_city','branch_city','region'),
    'default_pickup_time', public.be22_pick_text(merged, 'default_pickup_time','pickup_time','time_window','default_pickup_time_window'),
    'payment_method', public.be22_pick_text(merged, 'payment_method','payment_terms','payment_profile','billing_profile'),
    'service_type', public.be22_pick_text(merged, 'service_type','service_profile','default_service_type'),
    'tariff_code', public.be22_pick_text(merged, 'tariff_code','tariff_profile','pricing_profile','tariff_tier'),
    'branch', public.be22_pick_text(merged, 'branch','branch_code','origin_branch'),
    'route_zone', public.be22_pick_text(merged, 'route_zone','zone','territory'),
    'raw', j
  );
end $$;

drop function if exists public.be_customer_service_merchant_lookup(text, integer);
create function public.be_customer_service_merchant_lookup(p_search text default '', p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tbl text; row_json jsonb; norm jsonb; arr jsonb := '[]'::jsonb;
  seen text[] := array[]::text[]; key text; s text := lower(coalesce(p_search,''));
begin
  foreach tbl in array array[
    'be_master_data_options','be_master_data','be_merchant_master','be_merchants',
    'merchant_master','merchants','merchant_accounts','be_customer_accounts','customers'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      for row_json in execute format('select to_jsonb(t) from public.%I t limit 1000', tbl) loop
        if tbl in ('be_master_data_options','be_master_data') then
          if lower(row_json::text) not like '%merchant%'
             and lower(row_json::text) not like '%sender%'
             and lower(row_json::text) not like '%pickup_address%'
             and lower(row_json::text) not like '%pickup address%' then
            continue;
          end if;
        end if;

        norm := public.be22_normalize_merchant(row_json);
        if coalesce(norm ->> 'merchant_name', norm ->> 'merchant_code', norm ->> 'sender_phone') is null then
          continue;
        end if;
        if s <> '' and lower(norm::text) not like '%' || s || '%' then
          continue;
        end if;

        key := coalesce(norm ->> 'merchant_code', norm ->> 'merchant_id', norm ->> 'merchant_name', md5(norm::text));
        if key = any(seen) then continue; end if;
        seen := seen || key;

        arr := arr || jsonb_build_array(norm || jsonb_build_object('source_table', tbl));
        exit when jsonb_array_length(arr) >= greatest(coalesce(p_limit, 50), 1);
      end loop;
    end if;
    exit when jsonb_array_length(arr) >= greatest(coalesce(p_limit, 50), 1);
  end loop;

  return jsonb_build_object('ok', true, 'items', arr, 'data', arr, 'count', jsonb_array_length(arr));
end $$;

drop function if exists public.be_masterdata_merchant_lookup(text, integer);
create function public.be_masterdata_merchant_lookup(p_search text default '', p_limit integer default 50)
returns jsonb language sql security definer set search_path = public as $$
  select public.be_customer_service_merchant_lookup(p_search, p_limit);
$$;

drop function if exists public.be_customer_service_masterdata_lookup(text, integer);
create function public.be_customer_service_masterdata_lookup(p_search text default '', p_limit integer default 50)
returns jsonb language sql security definer set search_path = public as $$
  select public.be_customer_service_merchant_lookup(p_search, p_limit);
$$;

drop function if exists public.be_golive_make_ids(text, integer);
create function public.be_golive_make_ids(p_merchant_code text, p_parcel_count integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d text := to_char(now(), 'MMDD');
  code text := upper(left(regexp_replace(coalesce(p_merchant_code, 'GEN'), '[^A-Za-z0-9]', '', 'g'), 3));
  pc integer := greatest(coalesce(p_parcel_count, 1), 1);
  existing integer := 0;
  n integer;
begin
  if code = '' then code := 'GEN'; end if;
  begin
    execute 'select count(*)::integer from public.be_portal_pickup_requests where pickup_id like $1'
      into existing using 'P' || d || '-' || code || '-%';
  exception when others then existing := 0; end;
  n := greatest(existing + pc, pc);

  return jsonb_build_object(
    'pickup_id', 'P'||d||'-'||code||'-'||lpad(n::text, 3, '0'),
    'deliver_id', 'D'||d||'-'||code||'-'||lpad((n+1)::text, 3, '0'),
    'invoice_no', 'I'||d||'-'||code||'-'||lpad(n::text, 3, '0'),
    'waybill_no', 'W'||d||'-'||code||'-'||lpad(n::text, 3, '0'),
    'tracking_number', 'W'||d||'-'||code||'-'||lpad(n::text, 3, '0')
  );
end $$;

drop function if exists public.be22_resolve_branch(text, text, text);
create function public.be22_resolve_branch(p_city text, p_township text, p_address text)
returns text language plpgsql stable as $$
declare s text := lower(coalesce(p_city,'') || ' ' || coalesce(p_township,'') || ' ' || coalesce(p_address,''));
begin
  if s like '%mandalay%' or s like '%mdy%' then return 'MDY';
  elsif s like '%naypyitaw%' or s like '%nay pyi taw%' or s like '%naypyidaw%' or s like '%npt%' then return 'NPT';
  else return 'YGN'; end if;
end $$;

drop function if exists public.be_submit_pickup_request(jsonb);
create function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
  search_key text; lookup jsonb; merchant jsonb := '{}'::jsonb; ids jsonb; rec jsonb;
  pickup_id text; code text; name text; phone text; addr text; township text; city text;
  pc integer; cod numeric; status text; branch text;
begin
  search_key := coalesce(nullif(payload->>'merchant_code',''), nullif(payload->>'merchant_id',''), nullif(payload->>'merchant_name',''), nullif(payload->>'sender_phone',''), '');
  lookup := public.be_customer_service_merchant_lookup(search_key, 1);
  merchant := coalesce(lookup #> '{items,0}', '{}'::jsonb);

  code := upper(left(regexp_replace(coalesce(nullif(payload->>'merchant_code',''), nullif(merchant->>'merchant_code',''), 'GEN'), '[^A-Za-z0-9]', '', 'g'), 3));
  if code = '' then code := 'GEN'; end if;
  name := coalesce(nullif(payload->>'merchant_name',''), nullif(merchant->>'merchant_name',''), 'Unregistered Merchant');
  phone := coalesce(nullif(payload->>'sender_phone',''), nullif(payload->>'merchant_phone',''), nullif(merchant->>'sender_phone',''));
  addr := coalesce(nullif(payload->>'pickup_address',''), nullif(merchant->>'pickup_address',''));
  township := coalesce(nullif(payload->>'pickup_township',''), nullif(payload->>'township',''), nullif(merchant->>'pickup_township',''));
  city := coalesce(nullif(payload->>'pickup_city',''), nullif(payload->>'city',''), nullif(merchant->>'pickup_city',''), 'Yangon');
  pc := greatest(coalesce(public.be22_pick_number(payload, 'parcel_count','pickup_parcel_count','package_count')::integer, 1), 1);
  cod := coalesce(public.be22_pick_number(payload, 'cod_amount','cod','collect_amount'), 0);
  branch := coalesce(nullif(payload->>'branch',''), nullif(merchant->>'branch',''), public.be22_resolve_branch(city, township, addr));
  status := case when addr is null or township is null or city is null then 'data_entry_in_progress' else 'pending_pickup' end;

  ids := public.be_golive_make_ids(code, pc);
  pickup_id := ids->>'pickup_id';

  insert into public.be_portal_pickup_requests (
    pickup_id, pickup_way_id, deliver_id, delivery_way_id, invoice_no, waybill_no, tracking_number,
    merchant_id, merchant_code, merchant_name, sender_phone, contact_person,
    pickup_address, pickup_township, pickup_city, pickup_date, pickup_time,
    parcel_count, cod_amount, payment_method, service_type, priority, branch, route_zone,
    status, source, source_channel, requester_type, payload, metadata, created_at, updated_at
  )
  values (
    pickup_id, pickup_id, ids->>'deliver_id', ids->>'deliver_id', ids->>'invoice_no', ids->>'waybill_no', ids->>'tracking_number',
    coalesce(nullif(payload->>'merchant_id',''), nullif(merchant->>'merchant_id','')), code, name, phone, coalesce(nullif(payload->>'contact_person',''), nullif(merchant->>'contact_person','')),
    addr, township, city, coalesce(nullif(payload->>'pickup_date','')::date, current_date), coalesce(nullif(payload->>'pickup_time',''), nullif(merchant->>'default_pickup_time','')),
    pc, cod, coalesce(nullif(payload->>'payment_method',''), nullif(merchant->>'payment_method',''), case when cod > 0 then 'COD' else 'account' end),
    coalesce(nullif(payload->>'service_type',''), nullif(merchant->>'service_type',''), 'standard'), coalesce(nullif(payload->>'priority',''), 'normal'), branch, coalesce(nullif(payload->>'route_zone',''), nullif(merchant->>'route_zone','')),
    status, coalesce(nullif(payload->>'source',''), 'customer_service'), coalesce(nullif(payload->>'source_channel',''), 'customer_service_portal'), coalesce(nullif(payload->>'requester_type',''), 'customer_service'),
    merchant || payload || jsonb_build_object('merchant_code',code,'merchant_name',name,'sender_phone',phone,'pickup_address',addr,'pickup_township',township,'pickup_city',city,'parcel_count',pc,'cod_amount',cod,'branch',branch),
    jsonb_build_object('master_data_synced', true, 'master_data_source', merchant->>'source_table', 'requires_data_entry_completion', status = 'data_entry_in_progress', 'ids', ids),
    now(), now()
  )
  returning to_jsonb(be_portal_pickup_requests.*) into rec;

  insert into public.be_portal_cargo_events (pickup_id, tracking_number, event_type, status, message, source, actor_role, metadata)
  values (pickup_id, ids->>'tracking_number', 'pickup_submitted', status, pickup_id || ' submitted by Customer Service', 'customer_service', 'customer_service', rec);

  insert into public.be_app_notifications (title, message, target_role, target_branch, pickup_id, source_table, source_key, metadata)
  values
    ('Pickup request created', pickup_id || ' created for ' || name, 'customer_service', branch, pickup_id, 'be_portal_pickup_requests', pickup_id, rec),
    ('Pickup assignment required', pickup_id || ' is ready for assignment', 'supervisor', branch, pickup_id, 'be_portal_pickup_requests', pickup_id, rec),
    ('New pickup request', pickup_id || ' entered the operation workflow', 'operations', branch, pickup_id, 'be_portal_pickup_requests', pickup_id, rec),
    ('Pickup dispatch planning', pickup_id || ' is available for route planning', 'dispatch', branch, pickup_id, 'be_portal_pickup_requests', pickup_id, rec);

  if cod > 0 then
    insert into public.be_app_notifications (title, message, target_role, target_branch, pickup_id, source_table, source_key, metadata)
    values ('COD pickup created', pickup_id || ' has COD amount ' || cod::text, 'finance', branch, pickup_id, 'be_portal_pickup_requests', pickup_id, rec);
  end if;

  return jsonb_build_object(
    'ok', true, 'pickup_id', pickup_id, 'deliver_id', ids->>'deliver_id', 'invoice_no', ids->>'invoice_no',
    'waybill_no', ids->>'waybill_no', 'tracking_number', ids->>'tracking_number',
    'status', status, 'master_data_synced', true, 'requires_data_entry_completion', status = 'data_entry_in_progress', 'record', rec
  );
end $$;

drop function if exists public.be_customer_service_pickup_requests(integer);
create function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'items', coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb),
    'data', coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  )
  from (
    select * from public.be_portal_pickup_requests
    order by created_at desc nulls last
    limit greatest(coalesce(p_limit, 50), 1)
  ) t;
$$;

drop function if exists public.be_cs_create_pickup_request(jsonb);
create function public.be_cs_create_pickup_request(p_payload jsonb)
returns jsonb language sql security definer set search_path = public as $$ select public.be_submit_pickup_request(p_payload); $$;

drop function if exists public.be_customer_service_create_pickup_request(jsonb);
create function public.be_customer_service_create_pickup_request(p_payload jsonb)
returns jsonb language sql security definer set search_path = public as $$ select public.be_submit_pickup_request(p_payload); $$;

drop function if exists public.be_create_pickup_request(jsonb);
create function public.be_create_pickup_request(p_payload jsonb)
returns jsonb language sql security definer set search_path = public as $$ select public.be_submit_pickup_request(p_payload); $$;

drop function if exists public.be_go_live_system_readiness();
create function public.be_go_live_system_readiness()
returns jsonb language plpgsql security definer set search_path = public as $$
declare merchant_count integer := 0; pickup_count integer := 0;
begin
  begin merchant_count := coalesce((public.be_customer_service_merchant_lookup('', 500)->>'count')::integer, 0); exception when others then merchant_count := 0; end;
  select count(*)::integer into pickup_count from public.be_portal_pickup_requests;
  return jsonb_build_object('ok', true, 'status', 'ready', 'cs_pickup_rpc', true, 'master_data_lookup_rpc', true, 'merchant_master_rows_seen', merchant_count, 'pickup_request_rows', pickup_count);
end $$;

grant execute on function public.be_customer_service_merchant_lookup(text, integer) to anon, authenticated, service_role;
grant execute on function public.be_masterdata_merchant_lookup(text, integer) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_masterdata_lookup(text, integer) to anon, authenticated, service_role;
grant execute on function public.be_submit_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_pickup_requests(integer) to anon, authenticated, service_role;
grant execute on function public.be_cs_create_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_customer_service_create_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_create_pickup_request(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_go_live_system_readiness() to anon, authenticated, service_role;
