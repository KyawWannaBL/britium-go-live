-- Britium Merchant Portal Go-Live Backend
-- Creates live backend APIs for the Merchant Portal and removes obvious mock/sample rows.
-- Run this whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.be_merchant_portal_clean_code(p_code text, p_name text default null)
returns text language plpgsql immutable as $$
declare
  v text := upper(regexp_replace(coalesce(nullif(trim(p_code), ''), ''), '[^A-Z0-9]', '', 'g'));
  w text;
  initials text := '';
begin
  if v <> '' then return left(v, 12); end if;
  for w in select unnest(regexp_split_to_array(upper(regexp_replace(coalesce(p_name,''), '[^A-Z0-9 ]', ' ', 'g')), '\s+')) loop
    if length(w) > 0 then initials := initials || left(w,1); end if;
  end loop;
  return left(coalesce(nullif(initials,''),'GEN'), 12);
end;
$$;

create or replace function public.be_merchant_portal_make_pickup_id(p_payload jsonb)
returns text language plpgsql stable as $$
declare
  v_date date := current_date;
  v_code text;
  v_name text;
  v_count integer := 1;
begin
  begin
    v_date := coalesce(nullif(left(trim(coalesce(p_payload->>'pickup_date', p_payload->>'pickupDate', p_payload->>'requested_pickup_date', p_payload->>'created_at')),10),'')::date, current_date);
  exception when others then v_date := current_date;
  end;
  v_code := coalesce(p_payload->>'merchant_code', p_payload->>'merchantCode', p_payload->>'merchant_id', p_payload->>'merchantId');
  v_name := coalesce(p_payload->>'merchant_name', p_payload->>'merchantName', p_payload->>'sender_name', p_payload->>'senderName');
  begin
    v_count := greatest(coalesce(floor(nullif(coalesce(p_payload->>'parcel_count', p_payload->>'parcelCount', p_payload->>'way_count', p_payload->>'wayCount'), '')::numeric)::integer, 1), 1);
  exception when others then v_count := 1;
  end;
  return 'P' || to_char(v_date, 'MMDD') || '-' || public.be_merchant_portal_clean_code(v_code, v_name) || '-' || lpad(v_count::text, 3, '0');
end;
$$;

create table if not exists public.be_merchant_portal_pickup_requests (
  request_id uuid primary key default gen_random_uuid(),
  pickup_id text unique not null,
  merchant_code text,
  merchant_name text,
  contact_person text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  township text,
  city text,
  region text,
  parcel_count integer default 1,
  cod_amount numeric default 0,
  payment_terms text default 'COD',
  pickup_date date,
  pickup_time text,
  priority text default 'Normal',
  special_instructions text,
  status text default 'merchant_submitted',
  submitted_by_email text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists be_merchant_portal_pickup_requests_merchant_idx on public.be_merchant_portal_pickup_requests (merchant_code, created_at desc);

create table if not exists public.be_merchant_support_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  merchant_code text,
  merchant_name text,
  subject text not null,
  description text,
  priority text default 'Medium',
  status text default 'open',
  submitted_by_email text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists be_merchant_support_tickets_merchant_idx on public.be_merchant_support_tickets (merchant_code, status, created_at desc);

-- Remove only obvious mock/sample/demo rows. Real operational records are not touched.
do $$
begin
  delete from public.be_merchant_portal_pickup_requests
  where lower(coalesce(status,'')) in ('mock','sample','demo')
     or pickup_id ilike 'MOCK%'
     or pickup_id ilike 'SAMPLE%'
     or lower(coalesce(merchant_name,'')) like '%demo%'
     or lower(coalesce(merchant_name,'')) like '%sample%';

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $q$
        delete from public.be_portal_pickup_requests
        where pickup_id ilike 'MOCK%'
           or pickup_id ilike 'SAMPLE%'
           or lower(coalesce(status,'')) in ('mock','sample','demo')
           or lower(coalesce(merchant_name,'')) like '%demo%'
           or lower(coalesce(merchant_name,'')) like '%sample%'
      $q$;
    exception when others then null;
    end;
  end if;
end $$;

create or replace function public.be_merchant_options()
returns jsonb language plpgsql security definer as $$
declare
  v_options jsonb := '[]'::jsonb;
begin
  if to_regclass('public.merchant_master') is not null then
    execute $q$
      select coalesce(jsonb_agg(opt order by opt->>'label'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'value', coalesce(j->>'merchant_code', j->>'merchant_id', j->>'customer_code', j->>'code', j->>'id'),
          'label', concat_ws(' — ', coalesce(j->>'merchant_name', j->>'business_name', j->>'company_name', j->>'sender_name', j->>'name'), coalesce(j->>'merchant_code', j->>'merchant_id', j->>'customer_code', j->>'code', j->>'id')),
          'name', coalesce(j->>'merchant_name', j->>'business_name', j->>'company_name', j->>'sender_name', j->>'name'),
          'phone', coalesce(j->>'phone', j->>'contact_phone', j->>'sender_phone', j->>'mobile'),
          'township', coalesce(j->>'township', j->>'pickup_township'),
          'pickup_address', coalesce(j->>'pickup_address', j->>'default_pickup_address', j->>'address')
        ) as opt
        from (select to_jsonb(m) as j from public.merchant_master m) s
        where coalesce(j->>'merchant_code', j->>'merchant_id', j->>'customer_code', j->>'code', j->>'id') is not null
          and lower(coalesce(j->>'status', j->>'approval_status', 'active')) not in ('inactive','deleted','rejected')
      ) x
    $q$ into v_options;
  end if;

  if jsonb_array_length(v_options) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object('value', merchant_code, 'label', concat_ws(' — ', merchant_name, merchant_code), 'name', merchant_name) order by merchant_name), '[]'::jsonb)
    into v_options
    from (select distinct merchant_code, merchant_name from public.be_merchant_portal_pickup_requests where merchant_code is not null) d;
  end if;

  return jsonb_build_object('options', coalesce(v_options, '[]'::jsonb), 'warnings', '[]'::jsonb);
end;
$$;

create or replace function public.be_merchant_portal_resolve_code(p_merchant_code text default null, p_user_email text default null)
returns text language plpgsql security definer as $$
declare
  v_code text := nullif(trim(coalesce(p_merchant_code,'')), '');
  v_email text := lower(nullif(trim(coalesce(p_user_email,'')), ''));
begin
  if v_code is not null then return upper(v_code); end if;
  if v_email is not null and to_regclass('public.merchant_master') is not null then
    begin
      execute $q$
        select upper(coalesce(j->>'merchant_code', j->>'merchant_id', j->>'customer_code', j->>'code', j->>'id'))
        from (select to_jsonb(m) as j from public.merchant_master m) s
        where lower(coalesce(j->>'email', j->>'contact_email', j->>'login_email', j->>'owner_email', '')) = $1
        limit 1
      $q$ into v_code using v_email;
    exception when others then null;
    end;
  end if;
  return v_code;
end;
$$;

create or replace function public.be_merchant_snapshot(p_merchant_code text default null, p_user_email text default null, p_limit integer default 200)
returns jsonb language plpgsql security definer as $$
declare
  v_code text := public.be_merchant_portal_resolve_code(p_merchant_code, p_user_email);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_merchant jsonb := '{}'::jsonb;
  v_pickups jsonb := '[]'::jsonb;
  v_waybills jsonb := '[]'::jsonb;
  v_cod jsonb := '[]'::jsonb;
  v_settlements jsonb := '[]'::jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_code is not null and to_regclass('public.merchant_master') is not null then
    begin
      execute $q$
        select coalesce(j, '{}'::jsonb)
        from (select to_jsonb(m) j from public.merchant_master m) s
        where upper(coalesce(j->>'merchant_code', j->>'merchant_id', j->>'customer_code', j->>'code', j->>'id')) = upper($1)
        limit 1
      $q$ into v_merchant using v_code;
    exception when others then v_warnings := v_warnings || to_jsonb('merchant_master read failed');
    end;
  end if;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(j order by coalesce(j->>'created_at', j->>'updated_at') desc), '[]'::jsonb)
        from (
          select to_jsonb(p) j
          from public.be_portal_pickup_requests p
          where $1 is null or upper(coalesce(to_jsonb(p)->>'merchant_code', to_jsonb(p)->>'merchant_id', to_jsonb(p)->>'customer_code')) = upper($1)
          limit $2
        ) x
      $q$ into v_pickups using v_code, v_limit;
    exception when others then v_warnings := v_warnings || to_jsonb('be_portal_pickup_requests read failed');
    end;
  end if;

  if jsonb_array_length(v_pickups) = 0 then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
    into v_pickups
    from public.be_merchant_portal_pickup_requests p
    where v_code is null or upper(p.merchant_code) = upper(v_code)
    limit v_limit;
  end if;

  if to_regclass('public.be_delivery_waybill_rows') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(j), '[]'::jsonb)
        from (
          select to_jsonb(w) j
          from public.be_delivery_waybill_rows w
          where $1 is null or upper(coalesce(to_jsonb(w)->>'merchant_code', to_jsonb(w)->>'merchant_id', to_jsonb(w)->>'customer_code')) = upper($1)
          limit $2
        ) x
      $q$ into v_waybills using v_code, v_limit;
    exception when others then v_warnings := v_warnings || to_jsonb('be_delivery_waybill_rows read failed');
    end;
  elsif to_regclass('public.be_large_shipment_rows') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(j), '[]'::jsonb)
        from (
          select to_jsonb(w) j
          from public.be_large_shipment_rows w
          where $1 is null or upper(coalesce(to_jsonb(w)->>'merchant_code', to_jsonb(w)->>'merchant_id', to_jsonb(w)->>'customer_code')) = upper($1)
          limit $2
        ) x
      $q$ into v_waybills using v_code, v_limit;
    exception when others then v_warnings := v_warnings || to_jsonb('be_large_shipment_rows read failed');
    end;
  end if;

  if to_regclass('public.be_cod_ledger') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(j), '[]'::jsonb)
        from (
          select to_jsonb(c) j
          from public.be_cod_ledger c
          where $1 is null or upper(coalesce(to_jsonb(c)->>'merchant_code', to_jsonb(c)->>'merchant_id', to_jsonb(c)->>'customer_code')) = upper($1)
          limit $2
        ) x
      $q$ into v_cod using v_code, v_limit;
    exception when others then v_warnings := v_warnings || to_jsonb('COD ledger read failed'); end;
  end if;

  if to_regclass('public.be_financial_settlements') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(j), '[]'::jsonb)
        from (
          select to_jsonb(f) j
          from public.be_financial_settlements f
          where $1 is null or upper(coalesce(to_jsonb(f)->>'merchant_code', to_jsonb(f)->>'merchant_id', to_jsonb(f)->>'customer_code')) = upper($1)
          limit $2
        ) x
      $q$ into v_settlements using v_code, v_limit;
    exception when others then v_warnings := v_warnings || to_jsonb('financial settlements read failed'); end;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_tickets
  from public.be_merchant_support_tickets t
  where v_code is null or upper(t.merchant_code) = upper(v_code)
  limit v_limit;

  return jsonb_build_object(
    'merchant_code', v_code,
    'merchant', coalesce(v_merchant, '{}'::jsonb),
    'pickups', coalesce(v_pickups, '[]'::jsonb),
    'waybills', coalesce(v_waybills, '[]'::jsonb),
    'cod', coalesce(v_cod, '[]'::jsonb),
    'settlements', coalesce(v_settlements, '[]'::jsonb),
    'tickets', coalesce(v_tickets, '[]'::jsonb),
    'metrics', jsonb_build_object(
      'pickups', jsonb_array_length(coalesce(v_pickups, '[]'::jsonb)),
      'waybills', jsonb_array_length(coalesce(v_waybills, '[]'::jsonb)),
      'cod_total', (select coalesce(sum(coalesce(nullif(x->>'final_cod','')::numeric, nullif(x->>'cod_amount','')::numeric, 0)), 0) from jsonb_array_elements(coalesce(v_waybills,'[]'::jsonb)) x),
      'cod_pending', (select coalesce(sum(coalesce(nullif(x->>'cod_amount','')::numeric, 0)), 0) from jsonb_array_elements(coalesce(v_cod,'[]'::jsonb)) x where lower(coalesce(x->>'cod_status', x->>'status','')) not in ('finance_settled','settled','paid')),
      'delivered', (select count(*) from jsonb_array_elements(coalesce(v_waybills,'[]'::jsonb)) x where lower(coalesce(x->>'status', x->>'delivery_status','')) in ('delivered','delivery_completed','completed')),
      'open_tickets', (select count(*) from jsonb_array_elements(coalesce(v_tickets,'[]'::jsonb)) x where lower(coalesce(x->>'status','open')) not in ('closed','resolved'))
    ),
    'warnings', coalesce(v_warnings, '[]'::jsonb),
    'synced_at', now()
  );
end;
$$;

create or replace function public.be_merchant_create_pickup_request(p_payload jsonb, p_user_email text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_pickup_id text;
  v_code text;
  v_name text;
  v_count integer;
  v_cod numeric := 0;
  v_created jsonb := '{}'::jsonb;
begin
  v_pickup_id := coalesce(nullif(v_payload->>'pickup_id',''), public.be_merchant_portal_make_pickup_id(v_payload));
  v_code := public.be_merchant_portal_clean_code(coalesce(v_payload->>'merchant_code', v_payload->>'merchantCode'), coalesce(v_payload->>'merchant_name', v_payload->>'merchantName'));
  v_name := coalesce(v_payload->>'merchant_name', v_payload->>'merchantName', v_payload->>'sender_name', v_payload->>'senderName');
  begin v_count := greatest(coalesce(nullif(coalesce(v_payload->>'parcel_count', v_payload->>'parcelCount'), '')::integer, 1), 1); exception when others then v_count := 1; end;
  begin v_cod := coalesce(nullif(coalesce(v_payload->>'cod_amount', v_payload->>'codAmount'), '')::numeric, 0); exception when others then v_cod := 0; end;

  insert into public.be_merchant_portal_pickup_requests (
    pickup_id, merchant_code, merchant_name, contact_person, sender_name, sender_phone,
    pickup_address, township, city, region, parcel_count, cod_amount, payment_terms,
    pickup_date, pickup_time, priority, special_instructions, status, submitted_by_email, payload, updated_at
  ) values (
    v_pickup_id, v_code, v_name,
    nullif(coalesce(v_payload->>'contact_person', v_payload->>'contactPerson'), ''),
    nullif(coalesce(v_payload->>'sender_name', v_payload->>'senderName', v_name), ''),
    nullif(coalesce(v_payload->>'sender_phone', v_payload->>'senderPhone', v_payload->>'phone'), ''),
    nullif(coalesce(v_payload->>'pickup_address', v_payload->>'pickupAddress', v_payload->>'address'), ''),
    nullif(coalesce(v_payload->>'township', v_payload->>'pickup_township', v_payload->>'pickupTownship'), ''),
    nullif(coalesce(v_payload->>'city', v_payload->>'pickup_city'), ''),
    nullif(coalesce(v_payload->>'region', v_payload->>'pickup_region'), ''),
    v_count, v_cod,
    coalesce(nullif(coalesce(v_payload->>'payment_terms', v_payload->>'paymentTerms'), ''), 'COD'),
    coalesce(nullif(coalesce(v_payload->>'pickup_date', v_payload->>'pickupDate'), '')::date, current_date),
    nullif(coalesce(v_payload->>'pickup_time', v_payload->>'pickupTime'), ''),
    coalesce(nullif(v_payload->>'priority', ''), 'Normal'),
    nullif(coalesce(v_payload->>'special_instructions', v_payload->>'specialInstructions'), ''),
    'merchant_submitted', p_user_email, v_payload, now()
  ) on conflict (pickup_id) do update set
    merchant_code = excluded.merchant_code,
    merchant_name = excluded.merchant_name,
    sender_name = excluded.sender_name,
    sender_phone = excluded.sender_phone,
    pickup_address = excluded.pickup_address,
    township = excluded.township,
    parcel_count = excluded.parcel_count,
    cod_amount = excluded.cod_amount,
    payment_terms = excluded.payment_terms,
    pickup_date = excluded.pickup_date,
    pickup_time = excluded.pickup_time,
    priority = excluded.priority,
    special_instructions = excluded.special_instructions,
    status = 'merchant_submitted',
    payload = public.be_merchant_portal_pickup_requests.payload || excluded.payload,
    updated_at = now()
  returning to_jsonb(public.be_merchant_portal_pickup_requests.*) into v_created;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $q$
        insert into public.be_portal_pickup_requests (
          pickup_id, merchant_code, merchant_name, sender_name, sender_phone,
          pickup_address, township, city, region, parcel_count, cod_amount,
          payment_terms, pickup_date, pickup_time, priority, special_instructions,
          status, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'merchant_submitted',now(),now()
        )
        on conflict (pickup_id) do update set
          merchant_code = excluded.merchant_code,
          merchant_name = excluded.merchant_name,
          sender_name = excluded.sender_name,
          sender_phone = excluded.sender_phone,
          pickup_address = excluded.pickup_address,
          township = excluded.township,
          parcel_count = excluded.parcel_count,
          cod_amount = excluded.cod_amount,
          status = 'merchant_submitted',
          updated_at = now()
      $q$ using
        v_pickup_id, v_code, v_name,
        coalesce(v_payload->>'sender_name', v_payload->>'senderName', v_name),
        coalesce(v_payload->>'sender_phone', v_payload->>'senderPhone', v_payload->>'phone'),
        coalesce(v_payload->>'pickup_address', v_payload->>'pickupAddress', v_payload->>'address'),
        coalesce(v_payload->>'township', v_payload->>'pickup_township', v_payload->>'pickupTownship'),
        coalesce(v_payload->>'city', v_payload->>'pickup_city'),
        coalesce(v_payload->>'region', v_payload->>'pickup_region'),
        v_count, v_cod,
        coalesce(nullif(coalesce(v_payload->>'payment_terms', v_payload->>'paymentTerms'), ''), 'COD'),
        coalesce(nullif(coalesce(v_payload->>'pickup_date', v_payload->>'pickupDate'), '')::date, current_date),
        nullif(coalesce(v_payload->>'pickup_time', v_payload->>'pickupTime'), ''),
        coalesce(nullif(v_payload->>'priority', ''), 'Normal'),
        nullif(coalesce(v_payload->>'special_instructions', v_payload->>'specialInstructions'), '');
    exception when others then v_created := v_created || jsonb_build_object('queue_warning', sqlerrm);
    end;
  end if;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'request', v_created, 'status', 'merchant_submitted');
end;
$$;

create or replace function public.be_merchant_create_support_ticket(p_payload jsonb, p_user_email text default null)
returns jsonb language plpgsql security definer as $$
declare v_ticket jsonb;
begin
  insert into public.be_merchant_support_tickets (merchant_code, merchant_name, subject, description, priority, status, submitted_by_email, payload, updated_at)
  values (
    public.be_merchant_portal_clean_code(coalesce(p_payload->>'merchant_code', p_payload->>'merchantCode'), coalesce(p_payload->>'merchant_name', p_payload->>'merchantName')),
    coalesce(p_payload->>'merchant_name', p_payload->>'merchantName'),
    coalesce(nullif(p_payload->>'subject',''), 'Merchant Support Request'),
    nullif(p_payload->>'description',''),
    coalesce(nullif(p_payload->>'priority',''), 'Medium'),
    'open', p_user_email, p_payload, now()
  ) returning to_jsonb(be_merchant_support_tickets.*) into v_ticket;
  return jsonb_build_object('ok', true, 'ticket', v_ticket);
end;
$$;

alter table public.be_merchant_portal_pickup_requests enable row level security;
alter table public.be_merchant_support_tickets enable row level security;

drop policy if exists be_merchant_portal_pickup_requests_all_auth on public.be_merchant_portal_pickup_requests;
drop policy if exists be_merchant_support_tickets_all_auth on public.be_merchant_support_tickets;
create policy be_merchant_portal_pickup_requests_all_auth on public.be_merchant_portal_pickup_requests for all to authenticated using (true) with check (true);
create policy be_merchant_support_tickets_all_auth on public.be_merchant_support_tickets for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.be_merchant_portal_pickup_requests to authenticated;
grant select, insert, update, delete on public.be_merchant_support_tickets to authenticated;
grant execute on function public.be_merchant_options() to authenticated;
grant execute on function public.be_merchant_snapshot(text,text,integer) to authenticated;
grant execute on function public.be_merchant_create_pickup_request(jsonb,text) to authenticated;
grant execute on function public.be_merchant_create_support_ticket(jsonb,text) to authenticated;
grant execute on function public.be_merchant_portal_make_pickup_id(jsonb) to authenticated;

notify pgrst, 'reload schema';
