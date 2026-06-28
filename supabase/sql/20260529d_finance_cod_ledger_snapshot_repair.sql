-- Buildfix #32: Finance COD ledger schema and snapshot repair.
begin;
create extension if not exists pgcrypto;

create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  tracking_number text,
  merchant_code text,
  merchant_name text,
  rider_code text,
  rider_name text,
  cod_expected numeric default 0,
  cod_collected numeric default 0,
  cod_handed_over numeric default 0,
  cod_status text default 'pending_collection',
  status text default 'pending_collection',
  settlement_batch text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_cod_ledger
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists deliver_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists tracking_number text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists rider_code text,
  add column if not exists rider_name text,
  add column if not exists cod_expected numeric default 0,
  add column if not exists cod_collected numeric default 0,
  add column if not exists cod_handed_over numeric default 0,
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists status text default 'pending_collection',
  add column if not exists settlement_batch text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.be_portal_pickup_requests
  add column if not exists finance_status text default 'pending',
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists settlement_status text default 'pending',
  add column if not exists settlement_batch text;

update public.be_cod_ledger
set
  cod_expected = coalesce(cod_expected, 0),
  cod_collected = coalesce(cod_collected, 0),
  cod_handed_over = coalesce(cod_handed_over, 0),
  cod_status = coalesce(cod_status, status, 'pending_collection'),
  status = coalesce(status, cod_status, 'pending_collection'),
  updated_at = now();

insert into public.be_cod_ledger (
  pickup_id, pickup_way_id, deliver_id, invoice_no, waybill_no, tracking_number,
  merchant_code, merchant_name, rider_code, rider_name,
  cod_expected, cod_collected, cod_handed_over, cod_status, status,
  settlement_batch, payload, created_at, updated_at
)
select
  p.pickup_id, p.pickup_way_id, p.deliver_id, p.invoice_no, p.waybill_no, p.tracking_number,
  p.merchant_code, p.merchant_name, p.assigned_rider_code, p.assigned_rider_name,
  coalesce(p.cod_amount, 0),
  case when lower(coalesce(p.status, '')) = 'delivered' then coalesce(p.cod_amount, 0) else 0 end,
  0,
  case when coalesce(p.cod_amount, 0) > 0 then 'pending_collection' else 'not_applicable' end,
  case when coalesce(p.cod_amount, 0) > 0 then 'pending_collection' else 'not_applicable' end,
  p.settlement_batch,
  jsonb_build_object('source', 'pickup_request_sync'),
  now(), now()
from public.be_portal_pickup_requests p
where coalesce(p.cod_amount, 0) > 0
  and not exists (
    select 1 from public.be_cod_ledger c
    where c.pickup_id = p.pickup_id
       or c.pickup_way_id = p.pickup_way_id
       or c.waybill_no = p.waybill_no
  );

create or replace function public.be_finance_workflow_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pickup_count int := 0;
  cod_expected_total numeric := 0;
  cod_collected_total numeric := 0;
  cod_handed_over_total numeric := 0;
  pending_handover_total numeric := 0;
  pending_cod_count int := 0;
  awaiting_handover_count int := 0;
  finance_ready_count int := 0;
begin
  select count(*) into pickup_count from public.be_portal_pickup_requests;

  select
    coalesce(sum(coalesce(cod_expected, 0)), 0),
    coalesce(sum(coalesce(cod_collected, 0)), 0),
    coalesce(sum(coalesce(cod_handed_over, 0)), 0),
    coalesce(sum(greatest(coalesce(cod_collected, 0) - coalesce(cod_handed_over, 0), 0)), 0),
    count(*) filter (where coalesce(cod_expected, 0) > 0 and coalesce(cod_collected, 0) = 0),
    count(*) filter (where coalesce(cod_collected, 0) > coalesce(cod_handed_over, 0))
  into cod_expected_total, cod_collected_total, cod_handed_over_total,
       pending_handover_total, pending_cod_count, awaiting_handover_count
  from public.be_cod_ledger;

  select count(*) into finance_ready_count
  from public.be_portal_pickup_requests
  where lower(coalesce(status, '')) in ('delivered', 'finance_pending', 'closed')
     or lower(coalesce(finance_status, '')) in ('ready_for_settlement', 'finance_pending');

  return jsonb_build_object(
    'ok', true,
    'pickup_count', pickup_count,
    'cod_expected_total', cod_expected_total,
    'cod_collected_total', cod_collected_total,
    'cod_handed_over_total', cod_handed_over_total,
    'pending_handover_total', pending_handover_total,
    'pending_cod_count', pending_cod_count,
    'awaiting_handover_count', awaiting_handover_count,
    'finance_ready_count', finance_ready_count,
    'ledgers', jsonb_build_object(
      'cod_ledger', true,
      'rider_handover_ledger', true,
      'merchant_settlement_ledger', true,
      'invoice_ledger', true,
      'waybill_ledger', true
    )
  );
end;
$$;
commit;
