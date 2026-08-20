-- Britium Enterprise Portal Patch 2P
-- COD Settlement Center backend wiring
-- Safe for existing schemas: uses additive tables/columns and JSON column picking.

begin;

create extension if not exists pgcrypto;

-- Generic JSON column picker used by several go-live patches.
create or replace function public.be_json_pick(p_json jsonb, variadic p_keys text[])
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

-- Extend shipments with COD settlement tracking columns.
alter table public.shipments
  add column if not exists cod_settlement_status text default 'pending',
  add column if not exists cod_settlement_batch_id uuid,
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_settled_at timestamptz,
  add column if not exists cod_settlement_note text,
  add column if not exists updated_at timestamptz default now();

-- Core settlement batches.
create table if not exists public.cod_settlement_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text unique not null default ('COD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  batch_name text,
  status text not null default 'draft',
  total_deliveries int not null default 0,
  total_amount numeric not null default 0,
  selected_amount numeric not null default 0,
  created_by uuid default auth.uid(),
  reviewed_by uuid,
  approved_by uuid,
  paid_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  note text,
  head_office_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cod_settlement_batches_status
on public.cod_settlement_batches(status);

create index if not exists idx_cod_settlement_batches_created
on public.cod_settlement_batches(created_at desc);

-- Batch delivery items.
create table if not exists public.cod_settlement_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.cod_settlement_batches(id) on delete cascade,
  shipment_id uuid,
  tracking_no text not null,
  receiver_name text,
  receiver_phone text,
  rider_name text,
  cod_amount numeric not null default 0,
  item_status text not null default 'pending',
  collected_at timestamptz,
  settled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, tracking_no)
);

create index if not exists idx_cod_settlement_items_batch
on public.cod_settlement_batch_items(batch_id);

create index if not exists idx_cod_settlement_items_tracking
on public.cod_settlement_batch_items(tracking_no);

-- Flags specific to COD settlement.
create table if not exists public.cod_settlement_flags (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid,
  batch_id uuid,
  tracking_no text,
  reason text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  note text,
  created_by uuid default auth.uid(),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cod_settlement_flags_status
on public.cod_settlement_flags(status);

create index if not exists idx_cod_settlement_flags_tracking
on public.cod_settlement_flags(tracking_no);

-- Normalize a text value into numeric amount safely.
create or replace function public.be_cod_text_to_numeric(p_value text)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_value, '') ~ '^[0-9]+(\.[0-9]+)?$' then p_value::numeric
    else 0
  end;
$$;

-- Snapshot for COD Settlement page.
create or replace function public.be_cod_settlement_snapshot(p_search text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
with ship as (
  select
    s.id,
    to_jsonb(s.*) as j
  from public.shipments s
),
normalized as (
  select
    id,
    coalesce(public.be_json_pick(j, 'tracking_no', 'tracking_number', 'waybill_no', 'way_id'), id::text) as tracking_no,
    coalesce(public.be_json_pick(j, 'receiver_name', 'recipient_name', 'customer_name', 'receiver'), 'N/A') as receiver_name,
    coalesce(public.be_json_pick(j, 'receiver_phone', 'recipient_phone', 'customer_phone', 'phone'), 'N/A') as receiver_phone,
    coalesce(public.be_json_pick(j, 'assigned_rider_name', 'rider_name', 'rider', 'driver_name'), 'Unassigned') as rider_name,
    public.be_cod_text_to_numeric(coalesce(public.be_json_pick(j, 'cod_amount', 'cod', 'total_cod', 'collect_amount', 'item_price'), '0')) as cod_amount,
    lower(coalesce(public.be_json_pick(j, 'cod_settlement_status', 'cod_status', 'payment_status'), 'pending')) as cod_status,
    public.be_json_pick(j, 'cod_collected_at', 'collected_at', 'delivery_completed_at', 'delivered_at') as collected_at,
    public.be_json_pick(j, 'cod_settlement_note', 'finance_note', 'remarks') as note,
    coalesce(public.be_json_pick(j, 'cod_settlement_batch_id'), '') as batch_id
  from ship
),
filtered_pending as (
  select *
  from normalized
  where cod_amount > 0
    and coalesce(batch_id, '') = ''
    and cod_status not in ('settled', 'paid', 'reconciled', 'approved')
    and (
      p_search is null
      or p_search = ''
      or lower(tracking_no || ' ' || receiver_name || ' ' || receiver_phone || ' ' || rider_name) like '%' || lower(p_search) || '%'
    )
  order by tracking_no
  limit 1000
),
batches as (
  select
    b.id::text,
    b.batch_no,
    coalesce(b.batch_name, b.batch_no) as batch_name,
    b.status,
    coalesce(b.total_deliveries, 0) as total_deliveries,
    coalesce(b.total_amount, 0) as total_amount,
    coalesce(b.selected_amount, 0) as selected_amount,
    b.note,
    b.head_office_note,
    b.reviewed_at,
    b.approved_at,
    b.paid_at,
    b.created_at,
    b.updated_at
  from public.cod_settlement_batches b
  where p_search is null
     or p_search = ''
     or lower(b.batch_no || ' ' || coalesce(b.batch_name, '') || ' ' || coalesce(b.status, '')) like '%' || lower(p_search) || '%'
  order by b.created_at desc
  limit 300
),
items as (
  select
    i.id::text,
    i.batch_id::text,
    i.shipment_id::text,
    i.tracking_no,
    i.receiver_name,
    i.receiver_phone,
    i.rider_name,
    i.cod_amount,
    i.item_status,
    i.collected_at,
    i.settled_at,
    i.note,
    i.created_at,
    i.updated_at
  from public.cod_settlement_batch_items i
  order by i.created_at desc
  limit 1500
),
flags as (
  select
    f.id::text,
    f.shipment_id::text,
    f.batch_id::text,
    f.tracking_no,
    f.reason,
    f.severity,
    f.status,
    f.note,
    f.created_at,
    f.updated_at,
    f.resolved_at
  from public.cod_settlement_flags f
  where coalesce(f.status, 'open') <> 'closed'
  order by f.created_at desc
  limit 300
),
summary as (
  select
    (select count(*) from normalized where cod_amount > 0 and coalesce(batch_id, '') = '' and cod_status not in ('settled','paid','reconciled','approved')) as pending_deliveries,
    (select coalesce(sum(cod_amount), 0) from normalized where cod_amount > 0 and coalesce(batch_id, '') = '' and cod_status not in ('settled','paid','reconciled','approved')) as pending_amount,
    (select count(*) from public.cod_settlement_batches where status in ('draft','submitted','review','approved')) as open_batches,
    (select coalesce(sum(total_amount), 0) from public.cod_settlement_batches where status in ('draft','submitted','review','approved')) as batch_amount,
    (select count(*) from public.cod_settlement_flags where status in ('open','review')) as open_flags
)
select jsonb_build_object(
  'summary', (select to_jsonb(summary.*) from summary),
  'pending', coalesce((select jsonb_agg(to_jsonb(filtered_pending.*)) from filtered_pending), '[]'::jsonb),
  'batches', coalesce((select jsonb_agg(to_jsonb(batches.*)) from batches), '[]'::jsonb),
  'items', coalesce((select jsonb_agg(to_jsonb(items.*)) from items), '[]'::jsonb),
  'flags', coalesce((select jsonb_agg(to_jsonb(flags.*)) from flags), '[]'::jsonb),
  'generated_at', now()
);
$$;

-- Create a settlement batch from selected shipment IDs.
create or replace function public.be_cod_create_settlement_batch(
  p_shipment_ids uuid[],
  p_batch_name text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_batch_no text;
  v_total_count int;
  v_total_amount numeric;
begin
  if p_shipment_ids is null or array_length(p_shipment_ids, 1) is null then
    raise exception 'No deliveries selected';
  end if;

  insert into public.cod_settlement_batches (
    batch_name,
    status,
    note
  )
  values (
    nullif(p_batch_name, ''),
    'submitted',
    nullif(p_note, '')
  )
  returning id, batch_no into v_batch_id, v_batch_no;

  insert into public.cod_settlement_batch_items (
    batch_id,
    shipment_id,
    tracking_no,
    receiver_name,
    receiver_phone,
    rider_name,
    cod_amount,
    item_status,
    collected_at,
    note
  )
  select
    v_batch_id,
    n.id,
    n.tracking_no,
    n.receiver_name,
    n.receiver_phone,
    n.rider_name,
    n.cod_amount,
    'submitted',
    case
      when n.collected_at is null or n.collected_at = '' then null
      else n.collected_at::timestamptz
    end,
    n.note
  from (
    select
      s.id,
      coalesce(public.be_json_pick(to_jsonb(s.*), 'tracking_no', 'tracking_number', 'waybill_no', 'way_id'), s.id::text) as tracking_no,
      coalesce(public.be_json_pick(to_jsonb(s.*), 'receiver_name', 'recipient_name', 'customer_name', 'receiver'), 'N/A') as receiver_name,
      coalesce(public.be_json_pick(to_jsonb(s.*), 'receiver_phone', 'recipient_phone', 'customer_phone', 'phone'), 'N/A') as receiver_phone,
      coalesce(public.be_json_pick(to_jsonb(s.*), 'assigned_rider_name', 'rider_name', 'rider', 'driver_name'), 'Unassigned') as rider_name,
      public.be_cod_text_to_numeric(coalesce(public.be_json_pick(to_jsonb(s.*), 'cod_amount', 'cod', 'total_cod', 'collect_amount', 'item_price'), '0')) as cod_amount,
      public.be_json_pick(to_jsonb(s.*), 'cod_collected_at', 'collected_at', 'delivery_completed_at', 'delivered_at') as collected_at,
      public.be_json_pick(to_jsonb(s.*), 'cod_settlement_note', 'finance_note', 'remarks') as note
    from public.shipments s
    where s.id = any(p_shipment_ids)
  ) n
  where n.cod_amount > 0;

  select count(*), coalesce(sum(cod_amount), 0)
  into v_total_count, v_total_amount
  from public.cod_settlement_batch_items
  where batch_id = v_batch_id;

  if coalesce(v_total_count, 0) = 0 then
    delete from public.cod_settlement_batches where id = v_batch_id;
    raise exception 'Selected deliveries have no COD amount';
  end if;

  update public.cod_settlement_batches
  set
    total_deliveries = v_total_count,
    total_amount = v_total_amount,
    selected_amount = v_total_amount,
    updated_at = now()
  where id = v_batch_id;

  update public.shipments
  set
    cod_settlement_status = 'submitted',
    cod_settlement_batch_id = v_batch_id,
    updated_at = now()
  where id = any(p_shipment_ids);

  return jsonb_build_object(
    'id', v_batch_id,
    'batch_no', v_batch_no,
    'total_deliveries', v_total_count,
    'total_amount', v_total_amount
  );
end;
$$;

-- Set delivery COD status.
create or replace function public.be_cod_set_delivery_status(
  p_shipment_id uuid,
  p_status text,
  p_collected_at timestamptz default null,
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
  update public.shipments
  set
    cod_settlement_status = p_status,
    cod_collected_at = case when p_status in ('collected','submitted','settled','paid') then coalesce(p_collected_at, cod_collected_at, now()) else cod_collected_at end,
    cod_settlement_note = coalesce(nullif(p_note, ''), cod_settlement_note),
    updated_at = now()
  where id = p_shipment_id
  returning to_jsonb(public.shipments.*) into v_row;

  update public.cod_settlement_batch_items
  set
    item_status = p_status,
    collected_at = case when p_status in ('collected','submitted','settled','paid') then coalesce(p_collected_at, collected_at, now()) else collected_at end,
    note = coalesce(nullif(p_note, ''), note),
    updated_at = now()
  where shipment_id = p_shipment_id;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

-- Batch review workflow.
create or replace function public.be_cod_set_batch_status(
  p_batch_id uuid,
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
  update public.cod_settlement_batches
  set
    status = p_status,
    head_office_note = coalesce(nullif(p_note, ''), head_office_note),
    reviewed_by = case when p_status in ('review','approved','rejected','paid') then auth.uid() else reviewed_by end,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    paid_by = case when p_status = 'paid' then auth.uid() else paid_by end,
    reviewed_at = case when p_status in ('review','approved','rejected','paid') then coalesce(reviewed_at, now()) else reviewed_at end,
    approved_at = case when p_status = 'approved' then now() else approved_at end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    updated_at = now()
  where id = p_batch_id
  returning to_jsonb(public.cod_settlement_batches.*) into v_row;

  update public.cod_settlement_batch_items
  set
    item_status = case
      when p_status = 'paid' then 'paid'
      when p_status = 'approved' then 'approved'
      when p_status = 'rejected' then 'rejected'
      else item_status
    end,
    settled_at = case when p_status in ('paid','approved') then coalesce(settled_at, now()) else settled_at end,
    updated_at = now()
  where batch_id = p_batch_id;

  update public.shipments s
  set
    cod_settlement_status = case
      when p_status = 'paid' then 'paid'
      when p_status = 'approved' then 'approved'
      when p_status = 'rejected' then 'pending'
      else s.cod_settlement_status
    end,
    cod_settled_at = case when p_status in ('paid','approved') then coalesce(s.cod_settled_at, now()) else s.cod_settled_at end,
    cod_settlement_batch_id = case when p_status = 'rejected' then null else s.cod_settlement_batch_id end,
    updated_at = now()
  where s.cod_settlement_batch_id = p_batch_id;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

-- Flag a delivery or batch.
create or replace function public.be_cod_create_flag(
  p_shipment_id uuid default null,
  p_batch_id uuid default null,
  p_reason text default 'COD mismatch',
  p_severity text default 'medium',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text;
  v_flag jsonb;
begin
  if p_shipment_id is not null then
    select coalesce(public.be_json_pick(to_jsonb(s.*), 'tracking_no', 'tracking_number', 'waybill_no', 'way_id'), s.id::text)
    into v_tracking
    from public.shipments s
    where s.id = p_shipment_id;
  end if;

  insert into public.cod_settlement_flags (
    shipment_id,
    batch_id,
    tracking_no,
    reason,
    severity,
    status,
    note
  )
  values (
    p_shipment_id,
    p_batch_id,
    v_tracking,
    coalesce(nullif(p_reason, ''), 'COD mismatch'),
    coalesce(nullif(p_severity, ''), 'medium'),
    'open',
    nullif(p_note, '')
  )
  returning to_jsonb(public.cod_settlement_flags.*) into v_flag;

  if p_shipment_id is not null then
    update public.shipments
    set cod_settlement_status = 'flagged', cod_settlement_note = coalesce(nullif(p_note,''), p_reason), updated_at = now()
    where id = p_shipment_id;
  end if;

  return coalesce(v_flag, '{}'::jsonb);
end;
$$;

create or replace function public.be_cod_resolve_flag(
  p_flag_id uuid,
  p_status text default 'resolved',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag jsonb;
begin
  update public.cod_settlement_flags
  set
    status = p_status,
    note = coalesce(nullif(p_note, ''), note),
    resolved_by = auth.uid(),
    resolved_at = now(),
    updated_at = now()
  where id = p_flag_id
  returning to_jsonb(public.cod_settlement_flags.*) into v_flag;

  return coalesce(v_flag, '{}'::jsonb);
end;
$$;

grant execute on function public.be_cod_settlement_snapshot(text) to authenticated;
grant execute on function public.be_cod_create_settlement_batch(uuid[], text, text) to authenticated;
grant execute on function public.be_cod_set_delivery_status(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.be_cod_set_batch_status(uuid, text, text) to authenticated;
grant execute on function public.be_cod_create_flag(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.be_cod_resolve_flag(uuid, text, text) to authenticated;

commit;

select 'COD Settlement Center backend wired for go-live readiness' as status;
