-- Historical V39 warehouse receipt/lifecycle views extracted from original source.
-- RLS enforced on settings; new views use invoker security and remain inaccessible directly to end users pending scoped policy verification.
create table if not exists public.be_operational_settings_v39 (
  setting_key text primary key,
  bool_value boolean,
  numeric_value numeric,
  text_value text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.be_operational_settings_v39 enable row level security;
revoke all on public.be_operational_settings_v39 from public, anon, authenticated;
alter table public.be_warehouse_receipts_v36
  add column if not exists receipt_method text not null default 'SCAN',
  add column if not exists receiving_scan_skipped boolean not null default false,
  add column if not exists receiving_scan_skipped_at timestamptz,
  add column if not exists receiving_scan_skipped_by text,
  add column if not exists receiving_scan_skip_reason text,
  add column if not exists warehouse_entered_at timestamptz;

create or replace view public.be_v_warehouse_receipt_v39 as
select
  v.*,
  case
    when r.pickup_id is null then 'NOT_PROCESSED'
    when coalesce(r.receiving_scan_skipped, false) then 'SCAN_SKIPPED'
    else coalesce(r.receipt_method, 'SCAN')
  end as receipt_method,
  coalesce(r.receiving_scan_skipped, false) as receiving_scan_skipped,
  r.receiving_scan_skipped_at,
  r.receiving_scan_skipped_by,
  r.receiving_scan_skip_reason,
  coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at) as warehouse_entered_at,
  round((extract(epoch from (now() - coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at))) / 3600.0)::numeric, 1) as dwell_hours,
  (
    v.warehouse_status in ('RECEIVED', 'WAREHOUSE_READY')
    and coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at) is not null
    and coalesce(r.warehouse_entered_at, r.scanned_at, r.ready_at, r.created_at)
      <= now() - make_interval(hours => greatest(1, coalesce((
        select numeric_value::integer
        from public.be_operational_settings_v39
        where setting_key = 'warehouse_dwell_alert_hours'
      ), 48)))
    and not exists (
      select 1
      from public.be_dispatch_scans_v39 ds
      where ds.delivery_way_id = v.delivery_way_id
        and ds.scan_status = 'SCANNED'
    )
  ) as dwell_alert,
  coalesce(ds.scan_status = 'SCANNED', false) as dispatch_scanned,
  ds.scanned_at as dispatch_scanned_at,
  ds.scanned_by as dispatch_scanned_by,
  coalesce(a.consecutive_failures, 0) as consecutive_delivery_failures,
  a.last_status as delivery_attempt_status,
  a.rto_at
from public.be_v_warehouse_receipt_v36 v
left join public.be_warehouse_receipts_v36 r
  on r.pickup_id = v.pickup_id
 and r.parcel_sequence = v.parcel_sequence
left join public.be_dispatch_scans_v39 ds
  on ds.delivery_way_id = v.delivery_way_id
left join public.be_delivery_attempt_state_v39 a
  on a.delivery_way_id = v.delivery_way_id;

create or replace view public.be_v_warehouse_lifecycle_v39 as
select
  v.delivery_way_id as waybill_no,
  v.delivery_way_id,
  v.pickup_id,
  v.batch_waybill_no,
  v.merchant_name,
  v.recipient_name,
  v.recipient_phone,
  v.township as delivery_township,
  v.recipient_address,
  v.actual_collect as cod_amount,
  v.declared_weight_kg as weight_kg,
  case
    when v.delivery_attempt_status = 'RTO' then 'RETURN_TO_SENDER'
    when v.delivery_attempt_status = 'ATTEMPTED_FAILED' then 'DELIVERY_FAILED'
    when v.warehouse_status = 'WAREHOUSE_EXCEPTION' then 'WAREHOUSE_EXCEPTION'
    when v.warehouse_status = 'WAREHOUSE_READY' then 'READY_FOR_DELIVERY'
    when v.warehouse_status = 'RECEIVED' then 'WAREHOUSE_RECEIVED'
    else 'SUBMITTED'
  end as item_status,
  v.consecutive_delivery_failures as delivery_attempts,
  v.receipt_method,
  v.receiving_scan_skipped,
  v.warehouse_entered_at,
  v.dwell_hours,
  v.dwell_alert,
  v.dispatch_scanned,
  v.dispatch_scanned_at,
  v.updated_at,
  coalesce(v.warehouse_entered_at, v.updated_at, now()) as created_at
from public.be_v_warehouse_receipt_v39 v;
alter view public.be_v_warehouse_receipt_v39 set (security_invoker = true);
revoke all on public.be_v_warehouse_receipt_v39 from public, anon, authenticated;
alter view public.be_v_warehouse_lifecycle_v39 set (security_invoker = true);
revoke all on public.be_v_warehouse_lifecycle_v39 from public, anon, authenticated;
