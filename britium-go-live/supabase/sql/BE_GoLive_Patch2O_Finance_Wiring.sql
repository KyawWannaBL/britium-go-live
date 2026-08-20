-- BE Go-Live Patch 2O
-- Finance Command Center wiring: COD reconciliation, settlements, invoices, fraud/mismatch controls.
begin;

create extension if not exists pgcrypto;

create or replace function public.be_finance_json_pick(p_json jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(p_json ->> k, '');
    if v is not null then
      return v;
    end if;
  end loop;
  return null;
end;
$$;

create table if not exists public.finance_cod_reconciliation (
  id uuid primary key default gen_random_uuid(),
  tracking_no text not null unique,
  source_shipment_id text,
  merchant_name text,
  rider_name text,
  amount numeric not null default 0,
  status text not null default 'pending',
  collected_at timestamptz,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  reconciled_by uuid,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_cod_reconciliation
  add column if not exists source_shipment_id text,
  add column if not exists merchant_name text,
  add column if not exists rider_name text,
  add column if not exists amount numeric not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists collected_at timestamptz,
  add column if not exists notes text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists reconciled_by uuid,
  add column if not exists reconciled_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_finance_cod_reconciliation_status
on public.finance_cod_reconciliation(status);

create index if not exists idx_finance_cod_reconciliation_tracking
on public.finance_cod_reconciliation(tracking_no);

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  merchant_name text,
  period_label text,
  amount numeric not null default 0,
  status text not null default 'draft',
  note text,
  created_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_invoices
  add column if not exists invoice_no text,
  add column if not exists merchant_name text,
  add column if not exists period_label text,
  add column if not exists amount numeric not null default 0,
  add column if not exists status text not null default 'draft',
  add column if not exists note text,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.finance_invoices
set
  invoice_no = coalesce(invoice_no, 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  period_label = coalesce(period_label, to_char(current_date, 'Mon YYYY')),
  status = coalesce(nullif(status, ''), 'draft'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists idx_finance_invoices_invoice_no
on public.finance_invoices(invoice_no);

create index if not exists idx_finance_invoices_status
on public.finance_invoices(status);

create table if not exists public.finance_fraud_flags (
  id uuid primary key default gen_random_uuid(),
  flag_no text unique,
  reference_type text not null default 'cod',
  reference_id text,
  tracking_no text,
  merchant_name text,
  amount numeric default 0,
  severity text not null default 'medium',
  status text not null default 'open',
  reason text,
  note text,
  resolution_note text,
  created_by uuid default auth.uid(),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_fraud_flags
  add column if not exists flag_no text,
  add column if not exists reference_type text not null default 'cod',
  add column if not exists reference_id text,
  add column if not exists tracking_no text,
  add column if not exists merchant_name text,
  add column if not exists amount numeric default 0,
  add column if not exists severity text not null default 'medium',
  add column if not exists status text not null default 'open',
  add column if not exists reason text,
  add column if not exists note text,
  add column if not exists resolution_note text,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists resolved_by uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.finance_fraud_flags
set
  flag_no = coalesce(flag_no, 'FRD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  status = coalesce(nullif(status, ''), 'open'),
  severity = coalesce(nullif(severity, ''), 'medium'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists idx_finance_fraud_flags_flag_no
on public.finance_fraud_flags(flag_no);

create index if not exists idx_finance_fraud_flags_status
on public.finance_fraud_flags(status);

create table if not exists public.merchant_settlement_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text,
  merchant_name text,
  period_label text,
  amount numeric default 0,
  status text default 'pending',
  requested_by uuid,
  approved_by uuid,
  paid_at timestamptz,
  note text,
  head_office_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.merchant_settlement_requests
  add column if not exists request_no text,
  add column if not exists merchant_name text,
  add column if not exists period_label text,
  add column if not exists amount numeric default 0,
  add column if not exists status text default 'pending',
  add column if not exists requested_by uuid,
  add column if not exists approved_by uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists note text,
  add column if not exists head_office_note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.merchant_settlement_requests
set
  request_no = coalesce(request_no, 'MSR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  period_label = coalesce(period_label, to_char(current_date, 'Mon YYYY')),
  amount = coalesce(amount, 0),
  status = coalesce(nullif(status, ''), 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists idx_merchant_settlement_requests_request_no
on public.merchant_settlement_requests(request_no);

create or replace function public.be_finance_sync_cod_from_shipments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if to_regclass('public.shipments') is null then
    return 0;
  end if;

  with src as (
    select
      coalesce(
        public.be_finance_json_pick(to_jsonb(s), 'tracking_no', 'tracking_number', 'waybill_no', 'way_id'),
        s.id::text
      ) as tracking_no,
      s.id::text as source_shipment_id,
      coalesce(public.be_finance_json_pick(to_jsonb(s), 'merchant_name', 'merchant', 'sender_name'), '-') as merchant_name,
      coalesce(public.be_finance_json_pick(to_jsonb(s), 'rider_name', 'assigned_rider_name', 'rider', 'driver_name'), '-') as rider_name,
      case
        when coalesce(public.be_finance_json_pick(to_jsonb(s), 'cod_amount', 'cod', 'total_cod', 'collect_amount', 'actual_collect'), '0') ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(public.be_finance_json_pick(to_jsonb(s), 'cod_amount', 'cod', 'total_cod', 'collect_amount', 'actual_collect'), '0')::numeric
        else 0
      end as amount,
      case
        when public.be_finance_json_pick(to_jsonb(s), 'collected_at', 'delivery_completed_at', 'delivered_at') is null then null
        when public.be_finance_json_pick(to_jsonb(s), 'collected_at', 'delivery_completed_at', 'delivered_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then public.be_finance_json_pick(to_jsonb(s), 'collected_at', 'delivery_completed_at', 'delivered_at')::timestamptz
        else null
      end as collected_at
    from public.shipments s
  ),
  upserted as (
    insert into public.finance_cod_reconciliation (
      tracking_no,
      source_shipment_id,
      merchant_name,
      rider_name,
      amount,
      collected_at,
      status,
      created_at,
      updated_at
    )
    select
      tracking_no,
      source_shipment_id,
      merchant_name,
      rider_name,
      amount,
      collected_at,
      'pending',
      now(),
      now()
    from src
    where tracking_no is not null
      and amount > 0
    on conflict (tracking_no) do update
    set
      source_shipment_id = excluded.source_shipment_id,
      merchant_name = coalesce(nullif(excluded.merchant_name, '-'), finance_cod_reconciliation.merchant_name),
      rider_name = coalesce(nullif(excluded.rider_name, '-'), finance_cod_reconciliation.rider_name),
      amount = case when excluded.amount > 0 then excluded.amount else finance_cod_reconciliation.amount end,
      collected_at = coalesce(excluded.collected_at, finance_cod_reconciliation.collected_at),
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from upserted;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.be_finance_snapshot(p_search text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_search text := lower(coalesce(p_search, ''));
begin
  perform public.be_finance_sync_cod_from_shipments();

  with cod as (
    select
      id::text,
      tracking_no,
      coalesce(merchant_name, '-') as merchant_name,
      coalesce(rider_name, '-') as rider_name,
      coalesce(amount,0) as amount,
      coalesce(status,'pending') as status,
      collected_at,
      notes,
      updated_at
    from public.finance_cod_reconciliation
    where v_search = ''
      or lower(coalesce(tracking_no,'') || ' ' || coalesce(merchant_name,'') || ' ' || coalesce(rider_name,'') || ' ' || coalesce(status,'')) like '%' || v_search || '%'
    order by updated_at desc nulls last, created_at desc
    limit 500
  ),
  settlements as (
    select
      id::text,
      request_no,
      merchant_name,
      period_label,
      coalesce(amount,0) as amount,
      coalesce(status,'pending') as status,
      note,
      head_office_note,
      paid_at,
      created_at,
      updated_at
    from public.merchant_settlement_requests
    where v_search = ''
      or lower(coalesce(request_no,'') || ' ' || coalesce(merchant_name,'') || ' ' || coalesce(period_label,'') || ' ' || coalesce(status,'')) like '%' || v_search || '%'
    order by updated_at desc nulls last, created_at desc
    limit 300
  ),
  invoices as (
    select
      id::text,
      invoice_no,
      merchant_name,
      period_label,
      coalesce(amount,0) as amount,
      coalesce(status,'draft') as status,
      note,
      paid_at,
      created_at,
      updated_at
    from public.finance_invoices
    where v_search = ''
      or lower(coalesce(invoice_no,'') || ' ' || coalesce(merchant_name,'') || ' ' || coalesce(period_label,'') || ' ' || coalesce(status,'')) like '%' || v_search || '%'
    order by updated_at desc nulls last, created_at desc
    limit 300
  ),
  flags as (
    select
      id::text,
      flag_no,
      reference_type,
      reference_id,
      tracking_no,
      merchant_name,
      coalesce(amount,0) as amount,
      severity,
      status,
      reason,
      note,
      resolution_note,
      created_at,
      updated_at,
      resolved_at
    from public.finance_fraud_flags
    where v_search = ''
      or lower(coalesce(flag_no,'') || ' ' || coalesce(tracking_no,'') || ' ' || coalesce(merchant_name,'') || ' ' || coalesce(reason,'') || ' ' || coalesce(status,'')) like '%' || v_search || '%'
    order by created_at desc
    limit 300
  ),
  summary as (
    select jsonb_build_object(
      'cod_total', coalesce((select sum(amount) from public.finance_cod_reconciliation),0),
      'settlement_due', coalesce((select sum(amount) from public.merchant_settlement_requests where coalesce(status,'pending') in ('pending','review','approved','due')),0),
      'invoice_total', coalesce((select sum(amount) from public.finance_invoices where coalesce(status,'draft') not in ('void','cancelled')),0),
      'open_fraud_flags', coalesce((select count(*) from public.finance_fraud_flags where coalesce(status,'open') in ('open','review')),0),
      'pending_cod', coalesce((select count(*) from public.finance_cod_reconciliation where coalesce(status,'pending')='pending'),0),
      'approved_cod', coalesce((select count(*) from public.finance_cod_reconciliation where coalesce(status,'') in ('approved','reconciled','paid')),0)
    ) as j
  )
  select jsonb_build_object(
    'summary', (select j from summary),
    'cod', coalesce((select jsonb_agg(to_jsonb(cod.*)) from cod), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(settlements.*)) from settlements), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(invoices.*)) from invoices), '[]'::jsonb),
    'fraud_flags', coalesce((select jsonb_agg(to_jsonb(flags.*)) from flags), '[]'::jsonb),
    'generated_at', now()
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.be_finance_set_cod_status(
  p_tracking_no text,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  insert into public.finance_cod_reconciliation (
    tracking_no,
    status,
    notes,
    approved_by,
    approved_at,
    reconciled_by,
    reconciled_at,
    created_at,
    updated_at
  )
  values (
    p_tracking_no,
    p_status,
    p_note,
    case when p_status in ('approved','reconciled','paid') then auth.uid() else null end,
    case when p_status in ('approved','reconciled','paid') then now() else null end,
    case when p_status in ('reconciled','paid') then auth.uid() else null end,
    case when p_status in ('reconciled','paid') then now() else null end,
    now(),
    now()
  )
  on conflict (tracking_no) do update
  set
    status = p_status,
    notes = coalesce(nullif(p_note,''), finance_cod_reconciliation.notes),
    approved_by = case when p_status in ('approved','reconciled','paid') then auth.uid() else finance_cod_reconciliation.approved_by end,
    approved_at = case when p_status in ('approved','reconciled','paid') then now() else finance_cod_reconciliation.approved_at end,
    reconciled_by = case when p_status in ('reconciled','paid') then auth.uid() else finance_cod_reconciliation.reconciled_by end,
    reconciled_at = case when p_status in ('reconciled','paid') then now() else finance_cod_reconciliation.reconciled_at end,
    updated_at = now()
  returning to_jsonb(finance_cod_reconciliation.*) into v_row;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_finance_create_fraud_flag(
  p_reference_type text,
  p_reference_id text,
  p_tracking_no text,
  p_merchant_name text,
  p_amount numeric,
  p_reason text,
  p_note text default null,
  p_severity text default 'medium'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  insert into public.finance_fraud_flags (
    flag_no,
    reference_type,
    reference_id,
    tracking_no,
    merchant_name,
    amount,
    severity,
    status,
    reason,
    note,
    created_by,
    created_at,
    updated_at
  )
  values (
    'FRD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
    coalesce(nullif(p_reference_type,''), 'cod'),
    p_reference_id,
    p_tracking_no,
    p_merchant_name,
    coalesce(p_amount,0),
    coalesce(nullif(p_severity,''), 'medium'),
    'open',
    p_reason,
    p_note,
    auth.uid(),
    now(),
    now()
  )
  returning to_jsonb(finance_fraud_flags.*) into v_row;

  if p_reference_type = 'cod' and p_tracking_no is not null then
    perform public.be_finance_set_cod_status(p_tracking_no, 'flagged', coalesce(p_reason,'Flagged') || ' - ' || coalesce(p_note,''));
  end if;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_finance_update_fraud_flag(
  p_flag_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  update public.finance_fraud_flags
  set
    status = p_status,
    resolution_note = coalesce(nullif(p_resolution_note,''), resolution_note),
    resolved_by = case when p_status in ('resolved','closed','rejected') then auth.uid() else resolved_by end,
    resolved_at = case when p_status in ('resolved','closed','rejected') then now() else resolved_at end,
    updated_at = now()
  where id = p_flag_id
  returning to_jsonb(finance_fraud_flags.*) into v_row;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_finance_create_invoice(
  p_merchant_name text,
  p_period_label text,
  p_amount numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  insert into public.finance_invoices (
    invoice_no,
    merchant_name,
    period_label,
    amount,
    status,
    note,
    created_by,
    created_at,
    updated_at
  )
  values (
    'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
    p_merchant_name,
    coalesce(nullif(p_period_label,''), to_char(current_date,'Mon YYYY')),
    coalesce(p_amount,0),
    'draft',
    p_note,
    auth.uid(),
    now(),
    now()
  )
  returning to_jsonb(finance_invoices.*) into v_row;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_finance_set_invoice_status(
  p_invoice_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  update public.finance_invoices
  set
    status = p_status,
    note = coalesce(nullif(p_note,''), note),
    approved_by = case when p_status in ('approved','paid') then auth.uid() else approved_by end,
    approved_at = case when p_status in ('approved','paid') then now() else approved_at end,
    paid_at = case when p_status='paid' then now() else paid_at end,
    updated_at = now()
  where id = p_invoice_id
  returning to_jsonb(finance_invoices.*) into v_row;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

create or replace function public.be_finance_settlement_action(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  update public.merchant_settlement_requests
  set
    status = p_status,
    head_office_note = coalesce(nullif(p_note,''), head_office_note),
    approved_by = case when p_status in ('approved','paid') then auth.uid() else approved_by end,
    paid_at = case when p_status='paid' then now() else paid_at end,
    updated_at = now()
  where id = p_request_id
  returning to_jsonb(merchant_settlement_requests.*) into v_row;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

grant execute on function public.be_finance_sync_cod_from_shipments() to authenticated;
grant execute on function public.be_finance_snapshot(text) to authenticated;
grant execute on function public.be_finance_set_cod_status(text,text,text) to authenticated;
grant execute on function public.be_finance_create_fraud_flag(text,text,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.be_finance_update_fraud_flag(uuid,text,text) to authenticated;
grant execute on function public.be_finance_create_invoice(text,text,numeric,text) to authenticated;
grant execute on function public.be_finance_set_invoice_status(uuid,text,text) to authenticated;
grant execute on function public.be_finance_settlement_action(uuid,text,text) to authenticated;

commit;

select 'Finance Command Center backend wired for go-live readiness' as status;
