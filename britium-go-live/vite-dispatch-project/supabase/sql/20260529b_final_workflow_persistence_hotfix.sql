-- Buildfix #31: persist final complete workflow hotfixes after Buildfix #30.
-- Purpose:
-- 1) Preserve canonical Pickup ID rule: P{MMDD}-{MERCHANT_CODE_3}-{PICKUP_PARCEL_COUNT_3}
--    Example: P0528-SMH-100 for 100 parcels.
-- 2) Ensure Customer Service / Merchant / Customer pickup submission creates one canonical backend record.
-- 3) Allow Supervisor assignment when assigned_by is either a UUID or a label such as "supervisor".
-- Safe to rerun after Buildfix #30. Does not delete operational data.

begin;

alter table public.be_portal_pickup_requests
  alter column requester_type set default 'merchant';

update public.be_portal_pickup_requests
set requester_type = coalesce(nullif(requester_type, ''), 'merchant')
where requester_type is null or requester_type = '';

drop trigger if exists zzzzz_force_unique_pickup_way_id on public.be_portal_pickup_requests;
drop trigger if exists zzzzz_force_canonical_pickup_id on public.be_portal_pickup_requests;

drop function if exists public.be_next_cs_pickup_id(text);
drop function if exists public.be_next_cs_pickup_id(text, date);
drop function if exists public.be_next_cs_pickup_id(text, date, integer);

create or replace function public.be_next_cs_pickup_id(
  p_pickup_prefix text,
  p_pickup_date date,
  p_parcel_count integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  suffix_no int;
  candidate text;
begin
  code := upper(regexp_replace(coalesce(nullif(p_pickup_prefix, ''), 'GEN'), '[^A-Za-z0-9]+', '', 'g'));

  if code = '' then
    code := 'GEN';
  end if;

  suffix_no := greatest(1, least(coalesce(p_parcel_count, 1), 999));

  candidate :=
    'P' ||
    to_char(coalesce(p_pickup_date, current_date), 'MMDD') ||
    '-' ||
    code ||
    '-' ||
    lpad(suffix_no::text, 3, '0');

  if exists (
    select 1
    from public.be_portal_pickup_requests
    where pickup_id = candidate
       or pickup_way_id = candidate
  ) then
    raise exception 'Pickup ID % already exists. This means a pickup for the same date, merchant prefix, and parcel count already exists.', candidate;
  end if;

  return candidate;
end;
$$;

-- Compatibility wrapper. Production pickup creation must call the 3-argument version.
create or replace function public.be_next_cs_pickup_id(
  p_merchant_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.be_next_cs_pickup_id(p_merchant_code, current_date, 1);
end;
$$;

create or replace function public.zzzz_force_canonical_pickup_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_prefix text;
  wanted_date date;
  wanted_parcels int;
  candidate text;
  raw_parcel_text text;
begin
  if new.requester_type is null or new.requester_type = '' then
    new.requester_type := 'merchant';
  end if;

  wanted_prefix := public.be_pickup_id_prefix(
    coalesce(new.payload, '{}'::jsonb),
    coalesce(new.payload->'master_data_match', '{}'::jsonb),
    coalesce(new.merchant_code, new.merchant_name, 'GEN')
  );

  wanted_date := public.be_pickup_request_date(coalesce(new.payload, '{}'::jsonb));

  raw_parcel_text := regexp_replace(coalesce(new.payload->>'parcel_count', new.parcel_count::text, '1'), '[^0-9]', '', 'g');

  wanted_parcels := greatest(
    1,
    least(
      coalesce(nullif(raw_parcel_text, '')::int, new.parcel_count, 1),
      999
    )
  );

  -- If the ID already matches the canonical parcel-count suffix and is not duplicated, keep it.
  if new.pickup_id is not null
     and new.pickup_way_id is not null
     and new.pickup_way_id = new.pickup_id
     and new.pickup_id ~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
     and split_part(new.pickup_id, '-', 2) = wanted_prefix
     and right(new.pickup_id, 3) = lpad(wanted_parcels::text, 3, '0')
     and not exists (
       select 1
       from public.be_portal_pickup_requests x
       where (x.pickup_id = new.pickup_id or x.pickup_way_id = new.pickup_way_id)
         and x.id is distinct from new.id
     )
  then
    return new;
  end if;

  candidate := public.be_next_cs_pickup_id(wanted_prefix, wanted_date, wanted_parcels);
  new.pickup_id := candidate;
  new.pickup_way_id := candidate;

  return new;
end;
$$;

create trigger zzzzz_force_canonical_pickup_id
before insert or update of pickup_id, pickup_way_id, merchant_code, merchant_name, requester_type, parcel_count, payload
on public.be_portal_pickup_requests
for each row
execute function public.zzzz_force_canonical_pickup_id();

create or replace function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  lookup_result jsonb := '{}'::jsonb;
  merchant jsonb := '{}'::jsonb;

  pickup text;
  request_uuid uuid;

  requester text;
  m_code text;
  m_name text;
  s_name text;
  s_phone text;
  addr text;
  township text;
  city text;
  branch text;
  terms text;
  tariff text;
  parcels int;
  cod numeric;
  request_status text;

  pickup_prefix text;
  pickup_date date;
begin
  requester := coalesce(public.be_clean_text(v_payload->>'requester_type'), 'merchant');

  m_code := public.be_clean_text(coalesce(
    v_payload->>'merchant_code',
    v_payload->>'customer_code',
    v_payload->>'code'
  ));

  m_name := public.be_clean_text(coalesce(
    v_payload->>'merchant_name',
    v_payload->>'customer_name',
    v_payload->>'sender_name',
    v_payload->>'name'
  ));

  lookup_result := public.be_customer_service_merchant_lookup(coalesce(m_code, m_name, ''), 10);
  merchant := coalesce(lookup_result->'merchants'->0, lookup_result->'items'->0, '{}'::jsonb);

  m_code := coalesce(m_code, public.be_clean_text(merchant->>'merchant_code'));
  m_name := coalesce(m_name, public.be_clean_text(merchant->>'merchant_name'));

  s_name := coalesce(
    public.be_clean_text(v_payload->>'sender_name'),
    public.be_clean_text(merchant->>'sender_name'),
    m_name
  );

  s_phone := coalesce(
    public.be_clean_text(v_payload->>'sender_phone'),
    public.be_clean_text(v_payload->>'phone'),
    public.be_clean_text(merchant->>'sender_phone')
  );

  addr := coalesce(
    public.be_clean_text(v_payload->>'pickup_address'),
    public.be_clean_text(v_payload->>'address'),
    public.be_clean_text(merchant->>'pickup_address')
  );

  township := coalesce(
    public.be_clean_text(v_payload->>'pickup_township'),
    public.be_clean_text(v_payload->>'township'),
    public.be_clean_text(merchant->>'pickup_township')
  );

  city := coalesce(
    public.be_clean_text(v_payload->>'pickup_city'),
    public.be_clean_text(v_payload->>'city'),
    public.be_clean_text(merchant->>'pickup_city'),
    'Yangon'
  );

  branch := public.be_resolve_branch_from_location(
    city,
    township,
    addr,
    coalesce(
      public.be_clean_text(v_payload->>'assigned_branch'),
      public.be_clean_text(merchant->>'assigned_branch'),
      'YGN'
    )
  );

  terms := coalesce(
    public.be_clean_text(v_payload->>'payment_terms'),
    public.be_clean_text(merchant->>'payment_terms'),
    'COD'
  );

  tariff := coalesce(
    public.be_clean_text(v_payload->>'tariff_code'),
    public.be_clean_text(merchant->>'tariff_code'),
    'Standard'
  );

  parcels := greatest(
    1,
    least(
      coalesce(
        nullif(regexp_replace(coalesce(v_payload->>'parcel_count', '1'), '[^0-9]', '', 'g'), '')::int,
        1
      ),
      999
    )
  );

  cod := coalesce(
    nullif(regexp_replace(coalesce(v_payload->>'cod_amount', '0'), '[^0-9]', '', 'g'), '')::numeric,
    0
  );

  request_status := case
    when addr is null or township is null then 'data_entry_in_progress'
    else 'pending_pickup'
  end;

  pickup_prefix := public.be_pickup_id_prefix(
    v_payload,
    merchant,
    coalesce(m_code, m_name, 'GEN')
  );

  pickup_date := public.be_pickup_request_date(v_payload);

  pickup := public.be_next_cs_pickup_id(pickup_prefix, pickup_date, parcels);

  insert into public.be_portal_pickup_requests (
    pickup_id,
    pickup_way_id,
    requester_type,
    merchant_code,
    merchant_name,
    sender_name,
    sender_phone,
    pickup_address,
    pickup_township,
    pickup_city,
    assigned_branch,
    payment_terms,
    tariff_code,
    parcel_count,
    cod_amount,
    status,
    source,
    payload,
    created_at,
    updated_at
  )
  values (
    pickup,
    pickup,
    requester,
    m_code,
    m_name,
    s_name,
    s_phone,
    addr,
    township,
    city,
    branch,
    terms,
    tariff,
    parcels,
    cod,
    request_status,
    coalesce(public.be_clean_text(v_payload->>'source'), 'customer_service'),
    v_payload || jsonb_build_object(
      'master_data_match', merchant,
      'pickup_prefix', pickup_prefix,
      'pickup_date', pickup_date,
      'parcel_count', parcels
    ),
    now(),
    now()
  )
  returning id into request_uuid;

  return jsonb_build_object(
    'ok', true,
    'id', request_uuid,
    'pickup_id', pickup,
    'pickup_way_id', pickup,
    'status', request_status,
    'merchant_code', m_code,
    'merchant_name', m_name,
    'sender_phone', s_phone,
    'pickup_address', addr,
    'pickup_township', township,
    'pickup_city', city,
    'assigned_branch', branch,
    'parcel_count', parcels,
    'message', case
      when request_status = 'data_entry_in_progress'
      then 'Pickup created and sent to Data Entry for missing address/township completion.'
      else 'Pickup created and ready for Supervisor assignment.'
    end
  );

exception
  when unique_violation then
    raise exception 'Pickup ID % already exists. Check if this merchant/date/parcel-count pickup was already created.', pickup;
end;
$$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pickup text;
  rider text;
  rname text;
  zone text;
  actor_text text;
  actor_uuid uuid;
  req record;
begin
  pickup := coalesce(
    public.be_clean_text(p_payload->>'pickup_id'),
    public.be_clean_text(p_payload->>'pickup_way_id'),
    public.be_clean_text(p_payload->>'tracking_number')
  );

  rider := public.be_clean_text(p_payload->>'rider_code');
  rname := public.be_clean_text(p_payload->>'rider_name');
  zone := public.be_clean_text(p_payload->>'route_zone');
  actor_text := public.be_clean_text(p_payload->>'assigned_by');

  if actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    actor_uuid := actor_text::uuid;
  else
    actor_uuid := null;
  end if;

  select *
  into req
  from public.be_portal_pickup_requests
  where pickup_id = pickup
     or pickup_way_id = pickup
     or tracking_number = pickup
     or id::text = pickup
  order by created_at desc nulls last
  limit 1;

  if req.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'pickup_not_found',
      'pickup_id', pickup
    );
  end if;

  update public.be_portal_pickup_requests
  set
    assigned_rider_code = coalesce(rider, assigned_rider_code),
    assigned_rider_name = coalesce(rname, assigned_rider_name),
    assigned_by = coalesce(actor_uuid, assigned_by),
    assigned_at = now(),
    assignment_status = 'assigned',
    status = case
      when status = 'data_entry_in_progress' then status
      else 'assigned'
    end,
    route_zone = coalesce(zone, route_zone),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'assigned_by_label', coalesce(actor_text, 'supervisor'),
      'assigned_rider_code', rider,
      'assigned_rider_name', rname,
      'route_zone', zone,
      'assigned_at', now()
    ),
    updated_at = now()
  where id = req.id;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', req.pickup_id,
    'pickup_way_id', req.pickup_way_id,
    'assigned_rider_code', rider,
    'assigned_rider_name', rname,
    'route_zone', zone,
    'status', case
      when req.status = 'data_entry_in_progress' then 'data_entry_in_progress'
      else 'assigned'
    end
  );
end;
$$;

commit;
