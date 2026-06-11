-- Data Entry Parcel Photo Checking Area + Order Picker Photo Upload Bridge
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- 1) Order pickers/riders upload one or more photos per parcel during pickup/order picking.
-- 2) Data Entry staff see those photos on the Data Entry / Database registration screen.
-- 3) Data Entry can approve, reject, or request retake before final registration.

create extension if not exists pgcrypto;

create table if not exists public.be_parcel_photo_verifications (
  photo_id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  waybill_id text,
  tracking_no text,
  parcel_no text,
  parcel_index integer default 1,
  photo_url text not null,
  photo_path text,
  photo_type text default 'pickup_parcel',
  uploaded_by text,
  uploaded_by_name text,
  rider_id text,
  rider_name text,
  weight_kg numeric,
  declared_weight_kg numeric,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  receiver_township text,
  merchant_name text,
  pickup_address text,
  verification_status text default 'pending_review',
  data_entry_status text default 'pending_review',
  data_entry_note text,
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_parcel_photo_verifications
  add column if not exists photo_id uuid default gen_random_uuid(),
  add column if not exists pickup_id text,
  add column if not exists waybill_id text,
  add column if not exists tracking_no text,
  add column if not exists parcel_no text,
  add column if not exists parcel_index integer default 1,
  add column if not exists photo_url text,
  add column if not exists photo_path text,
  add column if not exists photo_type text default 'pickup_parcel',
  add column if not exists uploaded_by text,
  add column if not exists uploaded_by_name text,
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists weight_kg numeric,
  add column if not exists declared_weight_kg numeric,
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists receiver_address text,
  add column if not exists receiver_township text,
  add column if not exists merchant_name text,
  add column if not exists pickup_address text,
  add column if not exists verification_status text default 'pending_review',
  add column if not exists data_entry_status text default 'pending_review',
  add column if not exists data_entry_note text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_parcel_photo_verifications
set
  photo_id = coalesce(photo_id, gen_random_uuid()),
  photo_type = coalesce(nullif(photo_type, ''), 'pickup_parcel'),
  verification_status = coalesce(nullif(verification_status, ''), 'pending_review'),
  data_entry_status = coalesce(nullif(data_entry_status, ''), verification_status, 'pending_review'),
  parcel_index = coalesce(parcel_index, 1),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where photo_id is null
   or nullif(photo_type, '') is null
   or nullif(verification_status, '') is null
   or nullif(data_entry_status, '') is null
   or parcel_index is null
   or metadata is null
   or created_at is null
   or updated_at is null;

create index if not exists be_parcel_photo_verifications_pickup_idx
on public.be_parcel_photo_verifications (pickup_id, data_entry_status, created_at desc);

create index if not exists be_parcel_photo_verifications_waybill_idx
on public.be_parcel_photo_verifications (waybill_id, tracking_no, data_entry_status);

create index if not exists be_parcel_photo_verifications_rider_idx
on public.be_parcel_photo_verifications (rider_id, created_at desc);

-- Keep one row per exact photo path/url for same pickup/parcel.
create unique index if not exists be_parcel_photo_verifications_unique_photo_idx
on public.be_parcel_photo_verifications (
  pickup_id,
  coalesce(nullif(waybill_id, ''), nullif(tracking_no, ''), ''),
  coalesce(nullif(parcel_no, ''), parcel_index::text, '1'),
  coalesce(nullif(photo_path, ''), nullif(photo_url, ''))
);

create or replace function public.be_order_picker_upload_parcel_photo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(coalesce(p_payload->>'pickup_id', p_payload->>'pickupId')), '');
  v_waybill_id text := nullif(trim(coalesce(p_payload->>'waybill_id', p_payload->>'waybillId', p_payload->>'way_id', p_payload->>'wayId')), '');
  v_tracking_no text := nullif(trim(coalesce(p_payload->>'tracking_no', p_payload->>'trackingNo')), '');
  v_parcel_no text := nullif(trim(coalesce(p_payload->>'parcel_no', p_payload->>'parcelNo')), '');
  v_photo_url text := nullif(trim(coalesce(p_payload->>'photo_url', p_payload->>'photoUrl', p_payload->>'url')), '');
  v_photo_path text := nullif(trim(coalesce(p_payload->>'photo_path', p_payload->>'photoPath', p_payload->>'path')), '');
  v_photo_id uuid;
begin
  if v_pickup_id is null then
    raise exception 'pickup_id is required';
  end if;

  if v_photo_url is null and v_photo_path is null then
    raise exception 'photo_url or photo_path is required';
  end if;

  if v_photo_url is null then
    v_photo_url := v_photo_path;
  end if;

  insert into public.be_parcel_photo_verifications (
    pickup_id,
    waybill_id,
    tracking_no,
    parcel_no,
    parcel_index,
    photo_url,
    photo_path,
    photo_type,
    uploaded_by,
    uploaded_by_name,
    rider_id,
    rider_name,
    weight_kg,
    declared_weight_kg,
    receiver_name,
    receiver_phone,
    receiver_address,
    receiver_township,
    merchant_name,
    pickup_address,
    verification_status,
    data_entry_status,
    metadata,
    updated_at
  )
  values (
    v_pickup_id,
    v_waybill_id,
    v_tracking_no,
    v_parcel_no,
    coalesce(nullif(p_payload->>'parcel_index', '')::integer, 1),
    v_photo_url,
    v_photo_path,
    coalesce(nullif(p_payload->>'photo_type', ''), 'pickup_parcel'),
    nullif(p_payload->>'uploaded_by', ''),
    nullif(p_payload->>'uploaded_by_name', ''),
    nullif(coalesce(p_payload->>'rider_id', p_payload->>'order_picker_id'), ''),
    nullif(coalesce(p_payload->>'rider_name', p_payload->>'order_picker_name'), ''),
    nullif(p_payload->>'weight_kg', '')::numeric,
    nullif(p_payload->>'declared_weight_kg', '')::numeric,
    nullif(p_payload->>'receiver_name', ''),
    nullif(p_payload->>'receiver_phone', ''),
    nullif(p_payload->>'receiver_address', ''),
    nullif(p_payload->>'receiver_township', ''),
    nullif(p_payload->>'merchant_name', ''),
    nullif(p_payload->>'pickup_address', ''),
    'pending_review',
    'pending_review',
    p_payload,
    now()
  )
  on conflict (
    pickup_id,
    coalesce(nullif(waybill_id, ''), nullif(tracking_no, ''), ''),
    coalesce(nullif(parcel_no, ''), parcel_index::text, '1'),
    coalesce(nullif(photo_path, ''), nullif(photo_url, ''))
  )
  do update set
    photo_url = excluded.photo_url,
    photo_path = excluded.photo_path,
    weight_kg = coalesce(excluded.weight_kg, public.be_parcel_photo_verifications.weight_kg),
    declared_weight_kg = coalesce(excluded.declared_weight_kg, public.be_parcel_photo_verifications.declared_weight_kg),
    receiver_name = coalesce(excluded.receiver_name, public.be_parcel_photo_verifications.receiver_name),
    receiver_phone = coalesce(excluded.receiver_phone, public.be_parcel_photo_verifications.receiver_phone),
    receiver_address = coalesce(excluded.receiver_address, public.be_parcel_photo_verifications.receiver_address),
    receiver_township = coalesce(excluded.receiver_township, public.be_parcel_photo_verifications.receiver_township),
    merchant_name = coalesce(excluded.merchant_name, public.be_parcel_photo_verifications.merchant_name),
    pickup_address = coalesce(excluded.pickup_address, public.be_parcel_photo_verifications.pickup_address),
    verification_status = 'pending_review',
    data_entry_status = 'pending_review',
    metadata = public.be_parcel_photo_verifications.metadata || excluded.metadata,
    updated_at = now()
  returning photo_id into v_photo_id;

  -- Sync current supervisor assignment payload so rider/data-entry screens see same proof metadata.
  if to_regclass('public.be_supervisor_job_assignments') is not null then
    begin
      update public.be_supervisor_job_assignments
      set
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'latest_parcel_photo_id', v_photo_id,
          'latest_parcel_photo_url', v_photo_url,
          'parcel_photo_uploaded_at', now()
        ),
        updated_at = now()
      where pickup_id = v_pickup_id;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo_id,
    'pickup_id', v_pickup_id,
    'status', 'pending_review'
  );
end;
$$;

create or replace function public.be_data_entry_photo_review_snapshot(
  p_pickup_id text default null,
  p_status text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := nullif(trim(coalesce(p_pickup_id, '')), '');
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      pv.photo_id::text,
      pv.pickup_id,
      pv.waybill_id,
      pv.tracking_no,
      pv.parcel_no,
      pv.parcel_index,
      pv.photo_url,
      pv.photo_path,
      pv.photo_type,
      pv.uploaded_by,
      pv.uploaded_by_name,
      pv.rider_id,
      pv.rider_name,
      pv.weight_kg,
      pv.declared_weight_kg,
      case
        when pv.weight_kg is null or pv.declared_weight_kg is null then null
        else round((pv.weight_kg - pv.declared_weight_kg)::numeric, 2)
      end as weight_difference_kg,
      pv.receiver_name,
      pv.receiver_phone,
      pv.receiver_address,
      pv.receiver_township,
      coalesce(pv.merchant_name, pr.merchant_name, a.payload->>'merchant_name') as merchant_name,
      coalesce(pv.pickup_address, pr.pickup_address, a.payload->>'pickup_address') as pickup_address,
      pv.verification_status,
      pv.data_entry_status,
      pv.data_entry_note,
      pv.reviewed_by,
      pv.reviewed_by_name,
      pv.reviewed_at,
      pv.metadata,
      pv.created_at,
      pv.updated_at,
      coalesce(pr.status, a.status) as operational_status,
      a.job_id,
      a.assignment_type,
      a.status as assignment_status
    from public.be_parcel_photo_verifications pv
    left join public.be_portal_pickup_requests pr on pr.pickup_id = pv.pickup_id
    left join public.be_supervisor_job_assignments a on a.pickup_id = pv.pickup_id
    where (v_pickup_id is null or pv.pickup_id = v_pickup_id or pv.waybill_id = v_pickup_id or pv.tracking_no = v_pickup_id)
      and (v_status is null or pv.data_entry_status = v_status or pv.verification_status = v_status)
    order by pv.created_at desc
    limit v_limit
  ) x;

  select jsonb_build_object(
    'total', count(*),
    'pending_review', count(*) filter (where coalesce(data_entry_status, verification_status) = 'pending_review'),
    'approved', count(*) filter (where coalesce(data_entry_status, verification_status) = 'approved'),
    'rejected', count(*) filter (where coalesce(data_entry_status, verification_status) = 'rejected'),
    'needs_retake', count(*) filter (where coalesce(data_entry_status, verification_status) = 'needs_retake')
  )
  into v_summary
  from public.be_parcel_photo_verifications pv
  where (v_pickup_id is null or pv.pickup_id = v_pickup_id or pv.waybill_id = v_pickup_id or pv.tracking_no = v_pickup_id)
    and (v_status is null or pv.data_entry_status = v_status or pv.verification_status = v_status);

  return jsonb_build_object(
    'photos', coalesce(v_rows, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb),
    'filters', jsonb_build_object('pickup_id', p_pickup_id, 'status', p_status),
    'synced_at', now()
  );
end;
$$;

create or replace function public.be_data_entry_review_parcel_photo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_photo_id uuid := nullif(p_payload->>'photo_id', '')::uuid;
  v_status text := lower(nullif(trim(coalesce(p_payload->>'status', p_payload->>'data_entry_status')), ''));
  v_note text := nullif(trim(coalesce(p_payload->>'note', p_payload->>'data_entry_note')), '');
  v_pickup_id text;
begin
  if v_photo_id is null then
    raise exception 'photo_id is required';
  end if;

  if v_status not in ('approved', 'rejected', 'needs_retake', 'pending_review') then
    raise exception 'status must be approved, rejected, needs_retake, or pending_review';
  end if;

  update public.be_parcel_photo_verifications
  set
    verification_status = v_status,
    data_entry_status = v_status,
    data_entry_note = v_note,
    reviewed_by = nullif(p_payload->>'reviewed_by', ''),
    reviewed_by_name = nullif(p_payload->>'reviewed_by_name', ''),
    reviewed_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || p_payload,
    updated_at = now()
  where photo_id = v_photo_id
  returning pickup_id into v_pickup_id;

  if v_pickup_id is null then
    raise exception 'photo_id not found';
  end if;

  if to_regclass('public.be_supervisor_job_assignments') is not null then
    begin
      update public.be_supervisor_job_assignments
      set
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'latest_data_entry_photo_review', v_status,
          'latest_data_entry_photo_review_note', v_note,
          'latest_data_entry_photo_reviewed_at', now()
        ),
        updated_at = now()
      where pickup_id = v_pickup_id;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'photo_id', v_photo_id,
    'pickup_id', v_pickup_id,
    'status', v_status
  );
end;
$$;

alter table public.be_parcel_photo_verifications enable row level security;

drop policy if exists be_parcel_photo_verifications_select_auth on public.be_parcel_photo_verifications;
drop policy if exists be_parcel_photo_verifications_insert_auth on public.be_parcel_photo_verifications;
drop policy if exists be_parcel_photo_verifications_update_auth on public.be_parcel_photo_verifications;
drop policy if exists be_parcel_photo_verifications_delete_auth on public.be_parcel_photo_verifications;

create policy be_parcel_photo_verifications_select_auth
on public.be_parcel_photo_verifications for select to authenticated using (true);

create policy be_parcel_photo_verifications_insert_auth
on public.be_parcel_photo_verifications for insert to authenticated with check (true);

create policy be_parcel_photo_verifications_update_auth
on public.be_parcel_photo_verifications for update to authenticated using (true) with check (true);

create policy be_parcel_photo_verifications_delete_auth
on public.be_parcel_photo_verifications for delete to authenticated using (true);

grant select, insert, update, delete on public.be_parcel_photo_verifications to authenticated;
grant execute on function public.be_order_picker_upload_parcel_photo(jsonb) to authenticated;
grant execute on function public.be_data_entry_photo_review_snapshot(text, text, integer) to authenticated;
grant execute on function public.be_data_entry_review_parcel_photo(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Verify:
-- select public.be_data_entry_photo_review_snapshot(null, 'pending_review', 50);
