-- Britium go-live hotfix:
-- 1) Pickup Form RPC overload cleanup
-- 2) Rider App assigned pickup grouping once per pickup
--
-- Safe to rerun in Supabase SQL Editor.

-- Britium Pickup duplicate confirmation + conflict-safe pickup creation
-- Run in Supabase SQL editor.
create extension if not exists pgcrypto;

alter table public.be_portal_pickup_requests
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_date date,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists expected_parcels integer default 1,
  add column if not exists pickup_sequence_start integer,
  add column if not exists pickup_sequence_end integer,
  add column if not exists pickup_range_label text,
  add column if not exists pickup_address text,
  add column if not exists pickup_township text,
  add column if not exists township text,
  add column if not exists pickup_city text,
  add column if not exists city text,
  add column if not exists pickup_region_state text,
  add column if not exists region_state text,
  add column if not exists payment_type text,
  add column if not exists vehicle_required boolean default false,
  add column if not exists vehicle_type text,
  add column if not exists pickup_remark text,
  add column if not exists remark text,
  add column if not exists pickup_status text default 'PICKUP_REQUESTED',
  add column if not exists workflow_stage text default 'PICKUP_REQUESTED',
  add column if not exists customer_service_status text default 'PICKUP_REQUESTED',
  add column if not exists supervisor_status text default 'PENDING_ASSIGNMENT',
  add column if not exists data_entry_status text default 'WAITING_PICKUP',
  add column if not exists warehouse_status text default 'WAITING_DATA_ENTRY',
  add column if not exists wayplan_status text default 'WAITING_WAREHOUSE',
  add column if not exists assigned_rider_email text,
  add column if not exists assigned_driver_email text,
  add column if not exists assigned_helper_email text,
  add column if not exists assigned_vehicle_id text,
  add column if not exists assigned_at timestamptz,
  add column if not exists created_by_email text,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists ux_be_portal_pickup_requests_pickup_id
on public.be_portal_pickup_requests (pickup_id)
where pickup_id is not null;




-- Drop every overloaded version of the pickup RPC.
-- This fixes PostgREST/Supabase error:
-- "Could not choose the best candidate function between public.be_create_pickup_request_from_master(...)"
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_create_pickup_request_from_master'
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;


create or replace function public.be_create_pickup_request_from_master(
  p_actor_email text default null,
  p_city_override text default null,
  p_expected_parcels integer default 1,
  p_merchant_code text default null,
  p_payment_type text default null,
  p_pickup_address_override text default null,
  p_pickup_date date default current_date,
  p_pickup_remark text default null,
  p_region_state_override text default null,
  p_township_override text default null,
  p_vehicle_required text default null,
  p_duplicate_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant_code text := upper(trim(coalesce(p_merchant_code, '')));
  v_pickup_date date := coalesce(p_pickup_date, current_date);
  v_expected integer := greatest(coalesce(p_expected_parcels, 1), 1);
  v_date_code text := to_char(coalesce(p_pickup_date, current_date), 'MMDD');

  v_vehicle_input text := nullif(trim(coalesce(p_vehicle_required, '')), '');
  v_vehicle_required boolean := false;
  v_vehicle_type text := null;

  v_merchant jsonb;
  v_merchant_name text;
  v_pickup_address text;
  v_township text;
  v_city text;
  v_region_state text;

  v_existing_count integer := 0;
  v_existing jsonb := '[]'::jsonb;
  v_existing_summary text;
  v_status_phrase text := 'accepted or assigned';

  v_last_end integer := 0;
  v_sequence_start integer;
  v_sequence_end integer;
  v_pickup_id text;
  v_pickup_way_id text;
  v_range_label text;

  v_inserted_pickup_id text;
  v_try integer := 0;
begin
  if v_merchant_code = '' then
    raise exception 'merchant_code is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('pickup-create-' || v_date_code || '-' || v_merchant_code));

  if v_vehicle_input is not null then
    if lower(v_vehicle_input) in ('false', 'no', 'none', 'nil', 'n/a', 'not required', '0') then
      v_vehicle_required := false;
      v_vehicle_type := null;
    elsif lower(v_vehicle_input) in ('true', 'yes', 'required', '1') then
      v_vehicle_required := true;
      v_vehicle_type := 'Required';
    else
      v_vehicle_required := true;
      v_vehicle_type := v_vehicle_input;
    end if;
  end if;

  select to_jsonb(mm)
  into v_merchant
  from public.merchant_masters mm
  where upper(trim(mm.merchant_code::text)) = v_merchant_code
  limit 1;

  if v_merchant is null then
    raise exception 'Merchant code % not found in merchant_masters', v_merchant_code;
  end if;

  v_merchant_name := coalesce(
    nullif(v_merchant ->> 'merchant_name', ''),
    nullif(v_merchant ->> 'name', ''),
    nullif(v_merchant ->> 'business_name', ''),
    nullif(v_merchant ->> 'company_name', ''),
    v_merchant_code
  );

  v_pickup_address := coalesce(
    nullif(p_pickup_address_override, ''),
    nullif(v_merchant ->> 'pickup_address', ''),
    nullif(v_merchant ->> 'address', ''),
    nullif(v_merchant ->> 'merchant_address', ''),
    nullif(v_merchant ->> 'shop_address', '')
  );

  v_township := coalesce(
    nullif(p_township_override, ''),
    nullif(v_merchant ->> 'township', ''),
    nullif(v_merchant ->> 'pickup_township', ''),
    nullif(v_merchant ->> 'township_name', '')
  );

  v_city := coalesce(
    nullif(p_city_override, ''),
    nullif(v_merchant ->> 'city', ''),
    nullif(v_merchant ->> 'pickup_city', ''),
    'Yangon'
  );

  v_region_state := coalesce(
    nullif(p_region_state_override, ''),
    nullif(v_merchant ->> 'state', ''),
    nullif(v_merchant ->> 'region_state', ''),
    nullif(v_merchant ->> 'pickup_region_state', ''),
    'Yangon Region'
  );

  -- Check existing same merchant/date pickups that are still operationally active.
  select
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pickup_id', pickup_id,
          'pickup_way_id', pickup_way_id,
          'pickup_date', pickup_date,
          'merchant_code', merchant_code,
          'merchant_name', merchant_name,
          'expected_parcels', expected_parcels,
          'pickup_range_label', pickup_range_label,
          'pickup_status', pickup_status,
          'workflow_stage', workflow_stage,
          'supervisor_status', supervisor_status,
          'assigned_rider_email', assigned_rider_email,
          'assigned_driver_email', assigned_driver_email,
          'assigned_helper_email', assigned_helper_email,
          'assigned_vehicle_id', assigned_vehicle_id,
          'assigned_at', assigned_at
        )
        order by created_at desc nulls last
      ),
      '[]'::jsonb
    )
  into v_existing_count, v_existing
  from public.be_portal_pickup_requests
  where upper(trim(merchant_code)) = v_merchant_code
    and pickup_date = v_pickup_date
    and coalesce(pickup_status, '') not in (
      'CANCELLED',
      'REJECTED',
      'VOID',
      'DELIVERED',
      'COMPLETED',
      'CLOSED'
    );

  if v_existing_count > 0 and not coalesce(p_duplicate_confirmed, false) then
    if exists (
      select 1
      from public.be_portal_pickup_requests
      where upper(trim(merchant_code)) = v_merchant_code
        and pickup_date = v_pickup_date
        and (
          coalesce(supervisor_status, '') in ('ASSIGNED', 'RIDER_ASSIGNED', 'DRIVER_ASSIGNED')
          or coalesce(pickup_status, '') in (
            'ASSIGNED',
            'RIDER_ASSIGNED',
            'PICKUP_ASSIGNED',
            'PICKUP_COLLECTED',
            'WAYBILL_CREATED',
            'WAREHOUSE_RECEIVED'
          )
          or assigned_rider_email is not null
          or assigned_driver_email is not null
        )
    ) then
      v_status_phrase := 'already accepted and assigned';
    else
      v_status_phrase := 'already requested';
    end if;

    select string_agg(
      coalesce(pickup_id, pickup_way_id, 'UNKNOWN') || ' [' || coalesce(pickup_status, 'UNKNOWN') || ']',
      ', '
      order by created_at desc nulls last
    )
    into v_existing_summary
    from public.be_portal_pickup_requests
    where upper(trim(merchant_code)) = v_merchant_code
      and pickup_date = v_pickup_date
      and coalesce(pickup_status, '') not in (
        'CANCELLED',
        'REJECTED',
        'VOID',
        'DELIVERED',
        'COMPLETED',
        'CLOSED'
      );

    return jsonb_build_object(
      'ok', false,
      'requires_confirmation', true,
      'reason', 'ACTIVE_PICKUP_EXISTS',
      'merchant_code', v_merchant_code,
      'merchant_name', v_merchant_name,
      'pickup_date', v_pickup_date,
      'existing_count', v_existing_count,
      'existing_pickups', v_existing,
      'message',
        v_merchant_name || ' for ' || to_char(v_pickup_date, 'DD/MM/YYYY') ||
        ' order picking request has ' || v_status_phrase || '. Existing pickup: ' ||
        coalesce(v_existing_summary, '-') ||
        '. Is this another order picking request? Are you willing to move on?',
      'confirmation_message',
        v_merchant_name || ' for ' || to_char(v_pickup_date, 'DD/MM/YYYY') ||
        ' order picking request has ' || v_status_phrase || '.\n\nExisting pickup: ' ||
        coalesce(v_existing_summary, '-') ||
        '\n\nIs this another order picking request? Are you willing to move on?'
    );
  end if;

  -- Find largest parcel sequence already used by pickup_id or pickup_way_id.
  with existing_codes as (
    select pickup_id as code
    from public.be_portal_pickup_requests
    where pickup_id like ('P' || v_date_code || '-' || v_merchant_code || '-%')

    union all

    select pickup_way_id as code
    from public.be_portal_pickup_requests
    where pickup_way_id like ('P' || v_date_code || '-' || v_merchant_code || '-%')
  ),
  parsed as (
    select
      substring(code from '^P[0-9]{4}-[A-Z0-9]+-([0-9]+)$')::integer as seq_end
    from existing_codes
    where substring(code from '^P[0-9]{4}-[A-Z0-9]+-([0-9]+)$') is not null
  )
  select coalesce(max(seq_end), 0)
  into v_last_end
  from parsed;

  loop
    v_try := v_try + 1;

    if v_try > 300 then
      raise exception 'Could not generate unique pickup_way_id after 300 attempts for merchant % date %',
        v_merchant_code, v_pickup_date;
    end if;

    v_sequence_start := v_last_end + 1;
    v_sequence_end := v_last_end + v_expected;

    v_pickup_id :=
      'P' || v_date_code || '-' || v_merchant_code || '-' || lpad(v_sequence_end::text, 3, '0');

    v_pickup_way_id := v_pickup_id;

    v_range_label :=
      'P' || v_date_code || '-' || v_merchant_code || '-' || lpad(v_sequence_start::text, 3, '0')
      || ' - ' ||
      v_pickup_id;

    v_inserted_pickup_id := null;

    insert into public.be_portal_pickup_requests (
      pickup_id,
      pickup_way_id,
      pickup_date,
      merchant_code,
      merchant_name,
      expected_parcels,
      pickup_sequence_start,
      pickup_sequence_end,
      pickup_range_label,
      pickup_address,
      pickup_township,
      township,
      pickup_city,
      city,
      pickup_region_state,
      region_state,
      payment_type,
      vehicle_required,
      vehicle_type,
      pickup_remark,
      remark,
      pickup_status,
      workflow_stage,
      customer_service_status,
      supervisor_status,
      data_entry_status,
      warehouse_status,
      wayplan_status,
      created_by_email,
      created_at,
      updated_at
    )
    values (
      v_pickup_id,
      v_pickup_way_id,
      v_pickup_date,
      v_merchant_code,
      v_merchant_name,
      v_expected,
      v_sequence_start,
      v_sequence_end,
      v_range_label,
      v_pickup_address,
      v_township,
      v_township,
      v_city,
      v_city,
      v_region_state,
      v_region_state,
      coalesce(nullif(p_payment_type, ''), 'COD'),
      v_vehicle_required,
      v_vehicle_type,
      p_pickup_remark,
      p_pickup_remark,
      'PICKUP_REQUESTED',
      'PICKUP_REQUESTED',
      'PICKUP_REQUESTED',
      'PENDING_ASSIGNMENT',
      'WAITING_PICKUP',
      'WAITING_DATA_ENTRY',
      'WAITING_WAREHOUSE',
      p_actor_email,
      now(),
      now()
    )
    on conflict do nothing
    returning pickup_id into v_inserted_pickup_id;

    if v_inserted_pickup_id is not null then
      exit;
    end if;

    v_last_end := v_sequence_end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', 'PICKUP_REQUESTED',
    'pickup_id', v_pickup_id,
    'pickup_way_id', v_pickup_way_id,
    'merchant_code', v_merchant_code,
    'merchant_name', v_merchant_name,
    'expected_parcels', v_expected,
    'pickup_sequence_start', v_sequence_start,
    'pickup_sequence_end', v_sequence_end,
    'pickup_range_label', v_range_label,
    'pickup_date', v_pickup_date,
    'vehicle_required', v_vehicle_required,
    'vehicle_type', v_vehicle_type,
    'duplicate_confirmed', coalesce(p_duplicate_confirmed, false),
    'attempts', v_try
  );
end;
$$;


grant execute on function public.be_create_pickup_request_from_master(
  text, text, integer, text, text, text, date, text, text, text, text, boolean
) to anon, authenticated;


-- =====================================================================
-- Rider App: assigned pickup verification must be one card per pickup_id
-- =====================================================================

-- Rider pickup grouping final go-live hotfix
-- Purpose:
--   /rider/pickups must show ONE pickup verification card per pickup_id,
--   not one card per delivery way / parcel row.
--
-- Safe to rerun.


do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_rider_assigned_pickup_snapshot'
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;

drop view if exists public.be_v_rider_assigned_pickups_grouped;

create or replace view public.be_v_rider_assigned_pickups_grouped as
select
  coalesce(j.pickup_id, j.waybill_no, j.wayplan_code, j.tracking_no) as pickup_id,
  max(j.waybill_no) as waybill_no,
  max(coalesce(j.wayplan_code, j.wayplan_no, j.wayplan_id)) as wayplan_code,
  max(j.rider_email) as rider_email,
  max(j.driver_email) as driver_email,
  max(j.helper_email) as helper_email,
  max(j.asset_code) as asset_code,
  max(j.asset_name) as asset_name,
  max(j.vehicle_plate) as vehicle_plate,

  -- Merchant may not exist in every old view, so keep this resilient.
  max(coalesce(nullif(j.waybill_no, ''), nullif(j.pickup_id, ''), nullif(j.wayplan_code, ''))) as merchant_name,

  min(j.published_at) as assigned_at,
  max(j.updated_at) as updated_at,

  count(distinct coalesce(j.delivery_way_id, j.tracking_no))::int as delivery_way_count,
  count(*)::int as parcel_count,

  count(*) filter (
    where upper(coalesce(j.delivery_status, j.dispatch_status, '')) = 'DELIVERED'
  )::int as delivered_count,

  count(*) filter (
    where upper(coalesce(j.delivery_status, j.dispatch_status, '')) in ('RTO','RETURNED','RETURN')
  )::int as return_count,

  count(*) filter (
    where upper(coalesce(j.delivery_status, j.dispatch_status, 'PENDING')) not in ('DELIVERED','RTO','RETURNED','RETURN')
  )::int as pending_count,

  string_agg(distinct nullif(j.delivery_township, ''), ', ' order by nullif(j.delivery_township, '')) as pickup_township,
  min(nullif(coalesce(j.recipient_phone, j.phone_number), '')) as phone_number,
  min(nullif(j.recipient_address, '')) as pickup_address,

  case
    when count(*) filter (where upper(coalesce(j.delivery_status, j.dispatch_status, '')) = 'DELIVERED') = count(*) then 'DELIVERED'
    when count(*) filter (where upper(coalesce(j.delivery_status, j.dispatch_status, '')) in ('RTO','RETURNED','RETURN')) > 0 then 'RETURN / PRIORITY'
    else 'ASSIGNED'
  end as status,

  (
    count(*) filter (where upper(coalesce(j.delivery_status, j.dispatch_status, '')) = 'DELIVERED')::text
    || ' delivered / ' ||
    count(*)::text ||
    ' parcels'
  ) as status_summary

from public.be_v_rider_delivery_jobs j
where coalesce(j.pickup_id, j.waybill_no, j.wayplan_code, j.tracking_no) is not null
group by coalesce(j.pickup_id, j.waybill_no, j.wayplan_code, j.tracking_no);

create or replace function public.be_rider_assigned_pickup_snapshot(p_rider_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_email text := nullif(p_rider_email, '');
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.assigned_at desc nulls last, x.pickup_id), '[]'::jsonb)
  into v_rows
  from public.be_v_rider_assigned_pickups_grouped x
  where v_email is null
     or x.rider_email = v_email
     or x.driver_email = v_email
     or x.helper_email = v_email;

  return jsonb_build_object(
    'ok', true,
    'rider_email', v_email,
    'pickups', v_rows,
    'pickup_count', jsonb_array_length(v_rows)
  );
end;
$$;

grant select on public.be_v_rider_assigned_pickups_grouped to anon, authenticated;
grant execute on function public.be_rider_assigned_pickup_snapshot(text) to anon, authenticated;

notify pgrst, 'reload schema';


notify pgrst, 'reload schema';
