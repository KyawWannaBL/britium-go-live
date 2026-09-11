
-- 20260509 Data Entry Template + Rider/Driver Active Queue Sync Fix
-- Purpose:
-- 1) Keep old 1,725 temporary closed cases hidden from Rider/Driver pickup verification.
-- 2) Expose only active/current upload rows to Rider App and Enterprise Portal.
-- 3) Provide Pickup ID autofill RPC for Data Entry / Merchant / Customer web forms.
-- 4) Enable Supabase Realtime for the operational tables used by both apps.

-- ---------------------------------------------------------------------------
-- A. Visibility control table: do not delete old cases; hide them from active queues
-- ---------------------------------------------------------------------------
create table if not exists public.be_case_visibility_control (
  case_key text primary key,
  case_type text not null default 'shipment',
  visibility_status text not null default 'active',
  reason text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_be_case_visibility_status
on public.be_case_visibility_control(visibility_status, case_type);

-- Mark legacy/temp-closed shipments as hidden from Rider/Driver active queues.
insert into public.be_case_visibility_control (
  case_key,
  case_type,
  visibility_status,
  reason,
  source,
  updated_at
)
select
  s.tracking_no,
  'shipment',
  'temp_closed',
  'Hidden from Rider/Driver active pickup verification. Legacy cases were temporarily closed for current go-live test.',
  'TEMP_CLOSE_OR_PRE_CURRENT_UPLOAD',
  now()
from public.shipments s
where s.tracking_no is not null
  and s.tracking_no <> ''
  and (
    coalesce(s.operation_notes, '') ilike '%TEMP_CLOSE%'
    or not exists (
      select 1
      from public.be_large_shipment_rows r
      where r.upload_code = 'FULL-PICKUP-LIST-20260508'
        and r.tracking_no = s.tracking_no
    )
  )
on conflict (case_key) do update set
  visibility_status = excluded.visibility_status,
  reason = excluded.reason,
  source = excluded.source,
  updated_at = now();

-- Mark legacy pickup batches as hidden. We use pickup_request_code/pickup_id as case keys.
insert into public.be_case_visibility_control (
  case_key,
  case_type,
  visibility_status,
  reason,
  source,
  updated_at
)
select
  coalesce(p.pickup_id, p.pickup_request_code),
  'pickup_batch',
  'temp_closed',
  'Hidden from Rider/Driver pickup verification. Not part of FULL-PICKUP-LIST-20260508 active workflow.',
  'LEGACY_PICKUP_BATCH',
  now()
from public.britium_pickup_request_master p
where coalesce(p.pickup_id, p.pickup_request_code) is not null
  and coalesce(p.pickup_id, p.pickup_request_code) <> ''
  and not exists (
    select 1
    from public.be_large_shipment_rows r
    where r.upload_code = 'FULL-PICKUP-LIST-20260508'
      and (
        r.merchant_name = p.merchant_name
        or r.tracking_no ilike replace(coalesce(p.pickup_id, p.pickup_request_code), 'P', 'D') || '%'
      )
  )
on conflict (case_key) do update set
  visibility_status = excluded.visibility_status,
  reason = excluded.reason,
  source = excluded.source,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- B. Helper functions for deriving active Pickup ID from Way ID
-- ---------------------------------------------------------------------------
create or replace function public.be_pickup_id_from_tracking_no(p_tracking_no text)
returns text
language sql
immutable
as $$
  select case
    when p_tracking_no ~ '^D[0-9]{4}-[A-Za-z0-9]+-[0-9]+$'
      then 'P' || substring(p_tracking_no from 2 for 4) || '-' || split_part(p_tracking_no, '-', 2)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- C. Active pickup batches for Rider/Driver app and Enterprise Portal
-- ---------------------------------------------------------------------------
create or replace function public.be_active_pickup_batches_v2(
  p_search text default null,
  p_upload_code text default 'FULL-PICKUP-LIST-20260508'
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
      public.be_pickup_id_from_tracking_no(r.tracking_no) as pickup_id,
      p_upload_code as upload_code,
      coalesce(r.merchant_code, split_part(r.tracking_no, '-', 2)) as merchant_code,
      r.merchant_name,
      coalesce(mm.contact_person, r.merchant_name) as sender_name,
      coalesce(mm.phone_primary, '') as sender_phone,
      coalesce(mm.default_pickup_address, mm.address_line_1, '') as pickup_address,
      coalesce(mm.township, '') as pickup_township,
      count(*)::integer as parcel_count,
      coalesce(sum(coalesce(r.cod_amount, 0)), 0) as cod_total,
      coalesce(sum(coalesce(r.actual_collect, 0)), 0) as actual_collect_total,
      count(*) filter (where coalesce(r.ground_proof_status, 'pending') = 'completed')::integer as completed_proofs,
      count(*) filter (where coalesce(r.picker_status, 'pending') = 'picked')::integer as picked_count,
      'active' as visibility_status
    from public.be_large_shipment_rows r
    left join public.merchant_master mm
      on mm.merchant_name = r.merchant_name
    where r.upload_code = p_upload_code
      and r.tracking_no is not null
      and public.be_pickup_id_from_tracking_no(r.tracking_no) is not null
      and not exists (
        select 1
        from public.be_case_visibility_control vc
        where vc.case_key = r.tracking_no
          and vc.visibility_status in ('temp_closed', 'closed', 'hidden')
      )
      and not exists (
        select 1
        from public.be_case_visibility_control vc
        where vc.case_key = public.be_pickup_id_from_tracking_no(r.tracking_no)
          and vc.visibility_status in ('temp_closed', 'closed', 'hidden')
      )
      and (
        p_search is null
        or r.tracking_no ilike '%' || p_search || '%'
        or r.merchant_name ilike '%' || p_search || '%'
        or public.be_pickup_id_from_tracking_no(r.tracking_no) ilike '%' || p_search || '%'
        or coalesce(r.customer_phone, '') ilike '%' || p_search || '%'
      )
    group by
      public.be_pickup_id_from_tracking_no(r.tracking_no),
      coalesce(r.merchant_code, split_part(r.tracking_no, '-', 2)),
      r.merchant_name,
      coalesce(mm.contact_person, r.merchant_name),
      coalesce(mm.phone_primary, ''),
      coalesce(mm.default_pickup_address, mm.address_line_1, ''),
      coalesce(mm.township, '')
  ) x;

  return result;
end;
$$;

-- Backward-compatible alias expected by Rider pickup verification pages.
create or replace function public.be_field_pickup_batches(p_search text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_active_pickup_batches_v2(p_search, 'FULL-PICKUP-LIST-20260508');
$$;

-- ---------------------------------------------------------------------------
-- D. Active parcels for selected Pickup ID
-- ---------------------------------------------------------------------------
create or replace function public.be_active_pickup_parcels_v2(
  p_pickup_id text,
  p_search text default null,
  p_upload_code text default 'FULL-PICKUP-LIST-20260508'
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
      r.tracking_no,
      public.be_pickup_id_from_tracking_no(r.tracking_no) as pickup_id,
      r.upload_code,
      r.merchant_name,
      coalesce(r.customer_name, r.recipient_name) as customer_name,
      r.customer_phone,
      r.township,
      r.delivery_address,
      r.item_value,
      r.delivery_fee_os,
      r.cod_amount,
      r.actual_collect,
      r.weight_kg,
      coalesce(r.picker_status, 'pending') as picker_status,
      coalesce(r.picker_weight_kg, 0) as picker_weight_kg,
      coalesce(r.picker_photo_paths, '[]'::jsonb) as picker_photo_paths,
      coalesce(r.picker_photo_urls, '[]'::jsonb) as picker_photo_urls,
      coalesce(r.sender_approval_status, 'pending') as sender_approval_status,
      coalesce(r.ground_proof_status, 'pending') as ground_proof_status,
      r.picked_at,
      r.sender_signed_at
    from public.be_large_shipment_rows r
    where r.upload_code = p_upload_code
      and public.be_pickup_id_from_tracking_no(r.tracking_no) = p_pickup_id
      and not exists (
        select 1
        from public.be_case_visibility_control vc
        where vc.case_key = r.tracking_no
          and vc.visibility_status in ('temp_closed', 'closed', 'hidden')
      )
      and (
        p_search is null
        or r.tracking_no ilike '%' || p_search || '%'
        or r.merchant_name ilike '%' || p_search || '%'
        or coalesce(r.customer_name, '') ilike '%' || p_search || '%'
        or coalesce(r.customer_phone, '') ilike '%' || p_search || '%'
      )
  ) x;

  return result;
end;
$$;

-- Backward-compatible alias expected by Rider pickup verification pages.
create or replace function public.be_field_pickup_parcels(
  p_pickup_id text,
  p_search text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.be_active_pickup_parcels_v2(p_pickup_id, p_search, 'FULL-PICKUP-LIST-20260508');
$$;

-- ---------------------------------------------------------------------------
-- E. Pickup ID autofill for Data Entry / Merchant / Customer registration form
-- ---------------------------------------------------------------------------
create or replace function public.be_pickup_autofill_by_pickup_id(
  p_pickup_id text
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

  select to_jsonb(x)
  into result
  from (
    select
      p_pickup_id as pickup_id,
      min(r.upload_code) as upload_code,
      min(coalesce(r.merchant_code, split_part(r.tracking_no, '-', 2))) as merchant_code,
      min(r.merchant_name) as merchant_name,
      min(coalesce(mm.contact_person, r.merchant_name)) as sender_name,
      min(coalesce(mm.phone_primary, '')) as sender_phone,
      min(coalesce(mm.default_pickup_address, mm.address_line_1, '')) as pickup_address,
      min(coalesce(mm.township, '')) as pickup_township,
      min(coalesce(mm.city, '')) as pickup_city,
      count(*)::integer as parcel_count,
      coalesce(sum(coalesce(r.cod_amount, 0)), 0) as cod_total,
      coalesce(sum(coalesce(r.actual_collect, 0)), 0) as actual_collect_total
    from public.be_large_shipment_rows r
    left join public.merchant_master mm
      on mm.merchant_name = r.merchant_name
    where public.be_pickup_id_from_tracking_no(r.tracking_no) = p_pickup_id
      and not exists (
        select 1
        from public.be_case_visibility_control vc
        where vc.case_key = r.tracking_no
          and vc.visibility_status in ('temp_closed', 'closed', 'hidden')
      )
  ) x;

  if result is null then
    return jsonb_build_object('ok', false, 'message', 'Pickup ID not found or is closed.', 'pickup_id', p_pickup_id);
  end if;

  return result || jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.be_pickup_id_from_tracking_no(text) to anon, authenticated;
grant execute on function public.be_active_pickup_batches_v2(text, text) to anon, authenticated;
grant execute on function public.be_field_pickup_batches(text) to anon, authenticated;
grant execute on function public.be_active_pickup_parcels_v2(text, text, text) to anon, authenticated;
grant execute on function public.be_field_pickup_parcels(text, text) to anon, authenticated;
grant execute on function public.be_pickup_autofill_by_pickup_id(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- F. Realtime sync for Enterprise Portal and Rider App
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.be_large_shipment_rows;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.shipments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.be_case_visibility_control;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- G. Quick checks
-- ---------------------------------------------------------------------------
-- select public.be_field_pickup_batches(null);
-- select public.be_field_pickup_parcels('P0508-BBG', null);
-- select public.be_pickup_autofill_by_pickup_id('P0508-BBG');
