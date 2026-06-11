
-- 20260510_pickup_verification_batch_qr_signature_scope.sql
-- Active scope + rider/driver pickup verification: per-way photo/weight/QR/save/upload,
-- batch upload, sender signature, and acknowledgement.

insert into storage.buckets (id, name, public)
values
  ('parcel-photos', 'parcel-photos', false),
  ('sender-signatures', 'sender-signatures', false)
on conflict (id) do update set public = false;

drop policy if exists "parcel_photos_authenticated_insert" on storage.objects;
create policy "parcel_photos_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'parcel-photos');

drop policy if exists "parcel_photos_authenticated_select" on storage.objects;
create policy "parcel_photos_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'parcel-photos');

drop policy if exists "sender_signatures_authenticated_insert" on storage.objects;
create policy "sender_signatures_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'sender-signatures');

drop policy if exists "sender_signatures_authenticated_select" on storage.objects;
create policy "sender_signatures_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'sender-signatures');

alter table if exists public.be_large_shipment_rows
add column if not exists picker_status text default 'pending',
add column if not exists picker_weight_kg numeric default 0,
add column if not exists picker_photo_paths jsonb default '[]'::jsonb,
add column if not exists picker_photo_urls jsonb default '[]'::jsonb,
add column if not exists picker_photo_quality jsonb default '{}'::jsonb,
add column if not exists picker_note text,
add column if not exists picked_by text,
add column if not exists picked_at timestamptz,
add column if not exists qr_payload text,
add column if not exists qr_generated_at timestamptz,
add column if not exists evidence_status text default 'pending',
add column if not exists sender_approval_status text default 'pending',
add column if not exists sender_approved_by text,
add column if not exists sender_approved_phone text,
add column if not exists sender_signature_path text,
add column if not exists sender_signature_url text,
add column if not exists sender_acknowledgement text,
add column if not exists sender_signed_at timestamptz,
add column if not exists ground_proof_status text default 'pending',
add column if not exists verification_updated_at timestamptz;

create table if not exists public.be_active_test_scope_control (
  upload_code text primary key,
  expected_file text not null,
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.be_active_test_scope_control(upload_code, expected_file, is_active, notes)
values (
  'FULL-PICKUP-LIST-20260508',
  '8.5.2026 pick up list1.xlsx',
  true,
  'Go-live active scope. Old 1,725 imported cases are temporarily closed/job done and excluded from active pickup verification.'
)
on conflict (upload_code) do update set
  is_active = true,
  expected_file = excluded.expected_file,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.be_pickup_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  upload_code text not null default 'FULL-PICKUP-LIST-20260508',
  pickup_id text not null,
  tracking_no text not null,
  actor_role text not null default 'rider',
  weight_kg numeric,
  photo_paths jsonb not null default '[]'::jsonb,
  photo_urls jsonb not null default '[]'::jsonb,
  photo_quality jsonb not null default '{}'::jsonb,
  evidence_status text not null default 'pending',
  qr_payload text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_be_pve_upload_pickup
on public.be_pickup_verification_evidence(upload_code, pickup_id, tracking_no);

create table if not exists public.be_pickup_batch_sender_confirmations (
  id uuid primary key default gen_random_uuid(),
  upload_code text not null default 'FULL-PICKUP-LIST-20260508',
  pickup_id text not null,
  actor_role text not null default 'rider',
  sender_name text not null,
  sender_phone text,
  parcel_count integer not null default 0,
  total_weight_kg numeric not null default 0,
  total_cod numeric not null default 0,
  signature_path text not null,
  signature_url text,
  acknowledgement text not null,
  signed_at timestamptz not null default now()
);

create index if not exists idx_be_pbsc_upload_pickup
on public.be_pickup_batch_sender_confirmations(upload_code, pickup_id);

create or replace function public.be_active_test_shipments(
  p_upload_code text default 'FULL-PICKUP-LIST-20260508',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.tracking_no), '[]'::jsonb)
  into result
  from (
    select
      r.upload_code,
      r.pickup_id,
      r.tracking_no,
      r.merchant_name,
      r.customer_name,
      r.customer_phone,
      r.township,
      r.delivery_address,
      r.cod_amount,
      r.delivery_fee_os,
      r.actual_collect,
      r.weight_kg,
      r.picker_status,
      r.evidence_status,
      r.ground_proof_status,
      r.sender_approval_status,
      s.status,
      s.created_at,
      s.updated_at
    from public.be_large_shipment_rows r
    left join public.shipments s on s.tracking_no = r.tracking_no
    where r.upload_code = p_upload_code
      and (
        p_search is null
        or r.tracking_no ilike '%' || p_search || '%'
        or r.merchant_name ilike '%' || p_search || '%'
        or r.customer_name ilike '%' || p_search || '%'
        or r.customer_phone ilike '%' || p_search || '%'
        or r.pickup_id ilike '%' || p_search || '%'
      )
  ) x;

  return result;
end;
$$;

create or replace function public.be_pickup_verification_batches(
  p_actor_role text default 'rider',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pickup_id), '[]'::jsonb)
  into result
  from (
    select
      r.upload_code,
      r.pickup_id,
      split_part(r.pickup_id, '-', 2) as merchant_code,
      max(r.merchant_name) as merchant_name,
      count(*)::integer as parcel_count,
      coalesce(sum(r.cod_amount), 0)::numeric as total_cod,
      count(*) filter (where coalesce(r.ground_proof_status, 'pending') = 'completed')::integer as completed_count,
      count(*) filter (where coalesce(r.evidence_status, 'pending') = 'retake_required')::integer as retake_count
    from public.be_large_shipment_rows r
    join public.be_active_test_scope_control c
      on c.upload_code = r.upload_code
     and c.is_active = true
    where (
      p_search is null
      or r.pickup_id ilike '%' || p_search || '%'
      or r.tracking_no ilike '%' || p_search || '%'
      or r.merchant_name ilike '%' || p_search || '%'
      or r.customer_name ilike '%' || p_search || '%'
      or r.customer_phone ilike '%' || p_search || '%'
    )
    group by r.upload_code, r.pickup_id
  ) x;

  return result;
end;
$$;

create or replace function public.be_pickup_verification_parcels(
  p_pickup_id text,
  p_actor_role text default 'rider',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_pickup_id is null or btrim(p_pickup_id) = '' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.tracking_no), '[]'::jsonb)
  into result
  from (
    select
      r.upload_code,
      r.pickup_id,
      r.tracking_no,
      r.merchant_name,
      r.customer_name,
      r.customer_phone,
      r.township,
      r.delivery_address,
      r.cod_amount,
      r.delivery_fee_os,
      r.actual_collect,
      r.weight_kg,
      r.picker_weight_kg,
      r.picker_status,
      r.picker_photo_paths,
      r.picker_photo_urls,
      r.picker_photo_quality,
      r.picker_note,
      r.qr_payload,
      r.evidence_status,
      r.ground_proof_status,
      r.sender_approval_status,
      r.picked_at
    from public.be_large_shipment_rows r
    join public.be_active_test_scope_control c
      on c.upload_code = r.upload_code
     and c.is_active = true
    where r.pickup_id = p_pickup_id
      and (
        p_search is null
        or r.tracking_no ilike '%' || p_search || '%'
        or r.customer_name ilike '%' || p_search || '%'
        or r.customer_phone ilike '%' || p_search || '%'
      )
  ) x;

  return result;
end;
$$;

create or replace function public.be_pickup_verification_save_parcel(
  p_tracking_no text,
  p_pickup_id text,
  p_weight_kg numeric,
  p_photo_paths jsonb default '[]'::jsonb,
  p_photo_urls jsonb default '[]'::jsonb,
  p_photo_quality jsonb default '{}'::jsonb,
  p_evidence_status text default 'accepted',
  p_qr_payload text default null,
  p_note text default null,
  p_actor_role text default 'rider'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  resolved_upload_code text := 'FULL-PICKUP-LIST-20260508';
begin
  if p_tracking_no is null or btrim(p_tracking_no) = '' then
    raise exception 'Way ID is required.';
  end if;

  if p_weight_kg is null or p_weight_kg <= 0 then
    raise exception 'Actual weight must be greater than zero.';
  end if;

  if coalesce(jsonb_array_length(coalesce(p_photo_paths, '[]'::jsonb)), 0) = 0 then
    raise exception 'At least one parcel photo is required.';
  end if;

  select upload_code
  into resolved_upload_code
  from public.be_large_shipment_rows
  where tracking_no = p_tracking_no
  limit 1;

  insert into public.be_pickup_verification_evidence (
    upload_code, pickup_id, tracking_no, actor_role, weight_kg,
    photo_paths, photo_urls, photo_quality, evidence_status, qr_payload, note
  )
  values (
    coalesce(resolved_upload_code, 'FULL-PICKUP-LIST-20260508'),
    p_pickup_id,
    p_tracking_no,
    coalesce(p_actor_role, 'rider'),
    p_weight_kg,
    coalesce(p_photo_paths, '[]'::jsonb),
    coalesce(p_photo_urls, '[]'::jsonb),
    coalesce(p_photo_quality, '{}'::jsonb),
    coalesce(p_evidence_status, 'accepted'),
    p_qr_payload,
    p_note
  );

  update public.be_large_shipment_rows
  set
    weight_kg = p_weight_kg,
    picker_weight_kg = p_weight_kg,
    picker_photo_paths = coalesce(p_photo_paths, '[]'::jsonb),
    picker_photo_urls = coalesce(p_photo_urls, '[]'::jsonb),
    picker_photo_quality = coalesce(p_photo_quality, '{}'::jsonb),
    picker_note = p_note,
    picked_by = p_actor_role,
    picked_at = now(),
    picker_status = case when p_evidence_status = 'accepted' then 'picked' else 'retake_required' end,
    evidence_status = coalesce(p_evidence_status, 'accepted'),
    qr_payload = p_qr_payload,
    qr_generated_at = case when p_qr_payload is not null then now() else qr_generated_at end,
    ground_proof_status = case when p_evidence_status = 'accepted' then 'photo_weight_saved' else 'retake_required' end,
    verification_updated_at = now()
  where tracking_no = p_tracking_no;

  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'Way ID % was not found in active pickup verification rows.', p_tracking_no;
  end if;

  update public.shipments
  set
    weight_kg = p_weight_kg,
    operation_notes = concat_ws(
      E'\n',
      nullif(operation_notes, ''),
      '[PICKUP_VERIFICATION] ' || p_actor_role || ' saved weight/photo. Evidence status=' || coalesce(p_evidence_status, 'accepted') || ' at ' || now()
    ),
    updated_at = now()
  where tracking_no = p_tracking_no;

  return jsonb_build_object(
    'ok', true,
    'tracking_no', p_tracking_no,
    'pickup_id', p_pickup_id,
    'weight_kg', p_weight_kg,
    'photo_count', coalesce(jsonb_array_length(coalesce(p_photo_paths, '[]'::jsonb)), 0),
    'evidence_status', coalesce(p_evidence_status, 'accepted')
  );
end;
$$;

create or replace function public.be_pickup_verification_submit_batch(
  p_pickup_id text,
  p_actor_role text,
  p_sender_name text,
  p_sender_phone text,
  p_signature_path text,
  p_signature_url text,
  p_acknowledgement text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  upload_code_value text := 'FULL-PICKUP-LIST-20260508';
  parcel_count_value integer := 0;
  completed_count integer := 0;
  total_weight numeric := 0;
  total_cod numeric := 0;
begin
  if p_pickup_id is null or btrim(p_pickup_id) = '' then
    raise exception 'Pickup ID is required.';
  end if;

  if p_sender_name is null or btrim(p_sender_name) = '' then
    raise exception 'Sender name is required.';
  end if;

  if p_signature_path is null or btrim(p_signature_path) = '' then
    raise exception 'Sender signature is required.';
  end if;

  select
    max(upload_code),
    count(*)::integer,
    count(*) filter (where coalesce(evidence_status, 'pending') = 'accepted')::integer,
    coalesce(sum(coalesce(picker_weight_kg, weight_kg, 0)), 0),
    coalesce(sum(coalesce(cod_amount, 0)), 0)
  into upload_code_value, parcel_count_value, completed_count, total_weight, total_cod
  from public.be_large_shipment_rows
  where pickup_id = p_pickup_id;

  if parcel_count_value = 0 then
    raise exception 'Pickup ID % has no parcels.', p_pickup_id;
  end if;

  if completed_count < parcel_count_value then
    raise exception 'Only % of % parcels have accepted weight/photo proof. Complete all parcels before sender signature.', completed_count, parcel_count_value;
  end if;

  insert into public.be_pickup_batch_sender_confirmations (
    upload_code, pickup_id, actor_role, sender_name, sender_phone,
    parcel_count, total_weight_kg, total_cod, signature_path, signature_url, acknowledgement
  )
  values (
    coalesce(upload_code_value, 'FULL-PICKUP-LIST-20260508'),
    p_pickup_id,
    coalesce(p_actor_role, 'rider'),
    p_sender_name,
    p_sender_phone,
    parcel_count_value,
    total_weight,
    total_cod,
    p_signature_path,
    p_signature_url,
    p_acknowledgement
  );

  update public.be_large_shipment_rows
  set
    sender_approval_status = 'approved',
    sender_approved_by = p_sender_name,
    sender_approved_phone = p_sender_phone,
    sender_signature_path = p_signature_path,
    sender_signature_url = p_signature_url,
    sender_acknowledgement = p_acknowledgement,
    sender_signed_at = now(),
    ground_proof_status = 'completed',
    verification_updated_at = now()
  where pickup_id = p_pickup_id;

  update public.shipments s
  set
    operation_notes = concat_ws(
      E'\n',
      nullif(s.operation_notes, ''),
      '[SENDER_SIGNATURE] Pickup ' || p_pickup_id || ' confirmed by ' || p_sender_name || ' for ' || parcel_count_value || ' parcels at ' || now()
    ),
    updated_at = now()
  where exists (
    select 1
    from public.be_large_shipment_rows r
    where r.pickup_id = p_pickup_id
      and r.tracking_no = s.tracking_no
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'parcel_count', parcel_count_value,
    'total_weight_kg', total_weight,
    'total_cod', total_cod,
    'sender_approval_status', 'approved',
    'ground_proof_status', 'completed'
  );
end;
$$;

grant execute on function public.be_active_test_shipments(text, text) to anon, authenticated;
grant execute on function public.be_pickup_verification_batches(text, text) to anon, authenticated;
grant execute on function public.be_pickup_verification_parcels(text, text, text) to anon, authenticated;
grant execute on function public.be_pickup_verification_save_parcel(text, text, numeric, jsonb, jsonb, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function public.be_pickup_verification_submit_batch(text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
