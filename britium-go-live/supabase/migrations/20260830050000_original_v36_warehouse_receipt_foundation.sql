-- Historical V36 original warehouse receipt predecessor; extracted source schema only, no receipt data.
create table if not exists public.be_warehouse_exception_codes_v36 (
  code text primary key,
  label text not null,
  parcel_condition text not null default 'HOLD',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_warehouse_receipts_v36 (
  pickup_id text not null,
  parcel_sequence integer not null,
  delivery_way_id text not null,
  warehouse_status text not null default 'PENDING',
  parcel_condition text not null default 'UNINSPECTED',
  discrepancy_code text,
  discrepancy_remark text,
  warehouse_code text,
  staging_zone text,
  declared_weight_kg numeric not null default 0,
  actual_weight_kg numeric,
  scanned_at timestamptz,
  scanned_by text,
  ready_at timestamptz,
  ready_by text,
  label_printed_at timestamptz,
  label_printed_by text,
  label_scan_attempts integer not null default 0,
  label_scan_passed boolean not null default false,
  qa_approved_at timestamptz,
  qa_approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pickup_id, parcel_sequence),
  constraint be_warehouse_receipts_v36_status_check check (
    warehouse_status in ('PENDING', 'RECEIVED', 'WAREHOUSE_READY', 'WAREHOUSE_EXCEPTION')
  )
);

create table if not exists public.be_warehouse_receipt_events_v36 (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  parcel_sequence integer not null,
  delivery_way_id text not null,
  action text not null,
  previous_status text,
  new_status text,
  exception_code text,
  remark text,
  warehouse_code text,
  staging_zone text,
  actor_email text,
  created_at timestamptz not null default now()
);
alter table public.be_warehouse_exception_codes_v36 enable row level security;
revoke all on public.be_warehouse_exception_codes_v36 from public,anon,authenticated;
alter table public.be_warehouse_receipts_v36 enable row level security;
revoke all on public.be_warehouse_receipts_v36 from public,anon,authenticated;
alter table public.be_warehouse_receipt_events_v36 enable row level security;
revoke all on public.be_warehouse_receipt_events_v36 from public,anon,authenticated;
create or replace view public.be_v_warehouse_receipt_v36 as
select
  d.pickup_id,
  d.parcel_sequence,
  d.delivery_way_id,
  wb.waybill_no as batch_waybill_no,
  coalesce(nullif(lp.sender_name, ''), 'Britium Merchant') as merchant_name,
  d.recipient_name,
  d.contact_no_1 as recipient_phone,
  d.township,
  d.recipient_address,
  d.destination,
  coalesce(d.item_price, 0)::numeric as item_price,
  coalesce(d.delivery_fee, 0)::numeric as delivery_fee,
  coalesce(d.surcharge, 0)::numeric as surcharge,
  coalesce(d.actual_collect, 0)::numeric as actual_collect,
  coalesce(d.weight_kg, 0)::numeric as declared_weight_kg,
  d.remark,
  coalesce(r.warehouse_status, 'PENDING') as warehouse_status,
  coalesce(r.parcel_condition, 'UNINSPECTED') as parcel_condition,
  r.discrepancy_code,
  ec.label as discrepancy_name,
  r.discrepancy_remark,
  r.warehouse_code,
  r.staging_zone,
  r.actual_weight_kg,
  r.scanned_at,
  r.scanned_by,
  r.ready_at,
  r.ready_by,
  r.label_printed_at,
  r.label_printed_by,
  coalesce(r.label_scan_attempts, 0) as label_scan_attempts,
  coalesce(r.label_scan_passed, false) as label_scan_passed,
  r.qa_approved_at,
  r.qa_approved_by,
  coalesce(r.updated_at, d.updated_at, d.saved_at) as updated_at
from public.be_data_entry_parcel_details d
left join public.be_warehouse_receipts_v36 r
  on r.pickup_id = d.pickup_id
 and r.parcel_sequence = d.parcel_sequence
left join public.be_warehouse_exception_codes_v36 ec
  on ec.code = r.discrepancy_code
left join lateral (
  select w.waybill_no
  from public.be_parcel_waybills w
  where w.pickup_id = d.pickup_id
  order by w.updated_at desc nulls last, w.created_at desc nulls last
  limit 1
) wb on true
left join lateral (
  select p.sender_name
  from public.parcels p
  where p.tracking_code = d.delivery_way_id
     or p.way_id = d.delivery_way_id
  limit 1
) lp on true;
alter view public.be_v_warehouse_receipt_v36 set (security_invoker = true);
revoke all on public.be_v_warehouse_receipt_v36 from public,anon,authenticated;
