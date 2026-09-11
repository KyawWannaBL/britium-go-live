-- 20260509_field_pickup_verification_rider_driver.sql
-- Field Pickup Verification for Rider + Driver:
-- - pickup batch selectable/searchable
-- - parcel weight capture
-- - mobile camera/local upload proof
-- - automatic image quality rejection evidence
-- - accepted proof syncs back to large shipment rows and shipments

insert into storage.buckets (id, name, public)
values ('pickup-verification-evidence', 'pickup-verification-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists "pickup_verification_evidence_authenticated_insert" on storage.objects;
create policy "pickup_verification_evidence_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'pickup-verification-evidence');

drop policy if exists "pickup_verification_evidence_authenticated_select" on storage.objects;
create policy "pickup_verification_evidence_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'pickup-verification-evidence');

alter table public.be_large_shipment_rows
add column if not exists pickup_id text,
add column if not exists pickup_verification_status text default 'pending',
add column if not exists pickup_photo_count integer default 0,
add column if not exists rejected_photo_count integer default 0,
add column if not exists pickup_verified_by text,
add column if not exists pickup_verified_role text,
add column if not exists pickup_verified_at timestamptz,
add column if not exists last_photo_quality text,
add column if not exists last_photo_score numeric,
add column if not exists pickup_verification_note text;

create table if not exists public.field_pickup_photo_evidence (
  id uuid primary key default gen_random_uuid(),
  upload_code text,
  pickup_id text,
  tracking_no text not null,
  merchant_name text,
  customer_name text,
  actor_role text not null default 'rider',
  actor_name text,
  weight_kg numeric,
  photo_path text not null,
  photo_url text,
  quality_status text not null check (quality_status in ('accepted','rejected')),
  quality_score numeric,
  rejection_reason text,
  evidence_note text,
  device_info jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_field_pickup_photo_evidence_tracking
on public.field_pickup_photo_evidence(tracking_no, created_at desc);

create index if not exists idx_field_pickup_photo_evidence_pickup
on public.field_pickup_photo_evidence(pickup_id, created_at desc);

create or replace function public.be_field_pickup_batches(
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
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_created desc nulls last), '[]'::jsonb)
  into result
  from (
    select
      coalesce(nullif(r.pickup_id, ''), r.upload_code, 'UNASSIGNED') as pickup_id,
      r.upload_code,
      min(r.merchant_name) as merchant_name,
      count(*)::integer as parcel_count,
      count(*) filter (where coalesce(r.pickup_verification_status, 'pending') = 'verified')::integer as verified_count,
      count(*) filter (where coalesce(r.pickup_verification_status, 'pending') <> 'verified')::integer as pending_count,
      coalesce(sum(coalesce(r.actual_collect, 0)), 0)::numeric as total_collect,
      max(r.created_at) as last_created
    from public.be_large_shipment_rows r
    where (
      p_search is null
      or r.tracking_no ilike '%' || p_search || '%'
      or r.upload_code ilike '%' || p_search || '%'
      or r.pickup_id ilike '%' || p_search || '%'
      or r.merchant_name ilike '%' || p_search || '%'
      or r.customer_name ilike '%' || p_search || '%'
      or r.customer_phone ilike '%' || p_search || '%'
    )
    group by coalesce(nullif(r.pickup_id, ''), r.upload_code, 'UNASSIGNED'), r.upload_code
    limit 200
  ) x;

  return result;
end;
$$;

create or replace function public.be_field_pickup_parcels(
  p_pickup_id text,
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
    raise exception 'Pickup ID is required.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.tracking_no), '[]'::jsonb)
  into result
  from (
    select
      r.upload_code,
      coalesce(nullif(r.pickup_id, ''), r.upload_code, 'UNASSIGNED') as pickup_id,
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
      coalesce(r.pickup_verification_status, 'pending') as pickup_verification_status,
      coalesce(r.pickup_photo_count, 0) as pickup_photo_count,
      coalesce(r.rejected_photo_count, 0) as rejected_photo_count,
      r.last_photo_quality,
      r.last_photo_score,
      r.pickup_verified_by,
      r.pickup_verified_role,
      r.pickup_verified_at,
      r.pickup_verification_note
    from public.be_large_shipment_rows r
    where (
      coalesce(nullif(r.pickup_id, ''), r.upload_code, 'UNASSIGNED') = p_pickup_id
      or r.upload_code = p_pickup_id
      or r.pickup_id = p_pickup_id
    )
    and (
      p_search is null
      or r.tracking_no ilike '%' || p_search || '%'
      or r.merchant_name ilike '%' || p_search || '%'
      or r.customer_name ilike '%' || p_search || '%'
      or r.customer_phone ilike '%' || p_search || '%'
      or r.township ilike '%' || p_search || '%'
    )
    limit 500
  ) x;

  return result;
end;
$$;

create or replace function public.be_submit_field_pickup_photo(
  p_tracking_no text,
  p_weight_kg numeric,
  p_photo_path text,
  p_photo_url text default null,
  p_quality_status text default 'accepted',
  p_quality_score numeric default null,
  p_rejection_reason text default null,
  p_actor_role text default 'rider',
  p_actor_name text default null,
  p_evidence_note text default null,
  p_device_info jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record;
  evidence_id uuid;
  normalized_status text := lower(coalesce(p_quality_status, 'accepted'));
begin
  if p_tracking_no is null or btrim(p_tracking_no) = '' then
    raise exception 'Way ID / tracking number is required.';
  end if;

  if p_weight_kg is null or p_weight_kg <= 0 then
    raise exception 'Actual parcel weight must be greater than 0.';
  end if;

  if p_photo_path is null or btrim(p_photo_path) = '' then
    raise exception 'Photo evidence path is required.';
  end if;

  if normalized_status not in ('accepted','rejected') then
    raise exception 'Photo quality status must be accepted or rejected.';
  end if;

  select *
  into row_data
  from public.be_large_shipment_rows
  where tracking_no = p_tracking_no
  limit 1;

  if row_data.tracking_no is null then
    raise exception 'Way ID % was not found in pickup verification rows.', p_tracking_no;
  end if;

  insert into public.field_pickup_photo_evidence (
    upload_code,
    pickup_id,
    tracking_no,
    merchant_name,
    customer_name,
    actor_role,
    actor_name,
    weight_kg,
    photo_path,
    photo_url,
    quality_status,
    quality_score,
    rejection_reason,
    evidence_note,
    device_info
  )
  values (
    row_data.upload_code,
    coalesce(nullif(row_data.pickup_id, ''), row_data.upload_code),
    row_data.tracking_no,
    row_data.merchant_name,
    row_data.customer_name,
    p_actor_role,
    p_actor_name,
    p_weight_kg,
    p_photo_path,
    p_photo_url,
    normalized_status,
    p_quality_score,
    p_rejection_reason,
    p_evidence_note,
    coalesce(p_device_info, '{}'::jsonb)
  )
  returning id into evidence_id;

  if normalized_status = 'accepted' then
    update public.be_large_shipment_rows
    set
      weight_kg = p_weight_kg,
      pickup_verification_status = 'verified',
      pickup_photo_count = coalesce(pickup_photo_count, 0) + 1,
      pickup_verified_by = p_actor_name,
      pickup_verified_role = p_actor_role,
      pickup_verified_at = now(),
      last_photo_quality = normalized_status,
      last_photo_score = p_quality_score,
      pickup_verification_note = p_evidence_note
    where tracking_no = p_tracking_no;

    update public.shipments
    set
      weight_kg = p_weight_kg,
      operation_notes = concat_ws(
        E'\n',
        nullif(operation_notes, ''),
        '[FIELD_PICKUP_VERIFIED] Photo accepted and weight saved at ' || now()
      ),
      updated_at = now()
    where tracking_no = p_tracking_no;
  else
    update public.be_large_shipment_rows
    set
      weight_kg = p_weight_kg,
      pickup_verification_status = 'photo_rejected',
      rejected_photo_count = coalesce(rejected_photo_count, 0) + 1,
      last_photo_quality = normalized_status,
      last_photo_score = p_quality_score,
      pickup_verification_note = p_rejection_reason
    where tracking_no = p_tracking_no;

    update public.shipments
    set
      operation_notes = concat_ws(
        E'\n',
        nullif(operation_notes, ''),
        '[FIELD_PICKUP_REJECTED_PHOTO] Blur/quality rejection evidence kept at ' || now() || ': ' || coalesce(p_rejection_reason, '')
      ),
      updated_at = now()
    where tracking_no = p_tracking_no;
  end if;

  return jsonb_build_object(
    'ok', true,
    'evidence_id', evidence_id,
    'tracking_no', p_tracking_no,
    'quality_status', normalized_status,
    'weight_kg', p_weight_kg,
    'message',
      case when normalized_status = 'accepted'
        then 'Parcel pickup proof accepted.'
        else 'Photo rejected and kept as evidence. Please retake a clearer photo.'
      end
  );
end;
$$;

grant execute on function public.be_field_pickup_batches(text) to anon, authenticated;
grant execute on function public.be_field_pickup_parcels(text, text) to anon, authenticated;
grant execute on function public.be_submit_field_pickup_photo(text, numeric, text, text, text, numeric, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
