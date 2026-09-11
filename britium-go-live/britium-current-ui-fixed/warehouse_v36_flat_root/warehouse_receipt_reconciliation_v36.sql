-- Britium Warehouse V36
-- Canonical Data Entry Waybill -> Warehouse receipt, physical count reconciliation,
-- label scan QA and non-blocking exception queue.
-- Safe to run after Data Entry V33 and Waybill Studio V35.

begin;

create extension if not exists pgcrypto;

create table if not exists public.be_warehouse_exception_codes_v36 (
  code text primary key,
  label text not null,
  parcel_condition text not null default 'HOLD',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.be_warehouse_exception_codes_v36(code, label, parcel_condition)
values
  ('WAYBILL_MISMATCH', 'Waybill / system information mismatch', 'MISMATCH'),
  ('DAMAGED_PARCEL', 'Damaged parcel', 'DAMAGED'),
  ('MISSING_PARCEL', 'Parcel shown in system but physically missing', 'MISSING'),
  ('EXTRA_PARCEL', 'Physical parcel has no matching system row', 'EXTRA'),
  ('WEIGHT_MISMATCH', 'Actual weight differs from declared weight', 'MISMATCH'),
  ('UNSCANNABLE_LABEL', 'QR / barcode cannot be scanned', 'UNSCANNABLE'),
  ('PACKAGING_ISSUE', 'Packaging requires correction', 'DAMAGED'),
  ('OTHER_WAREHOUSE_HOLD', 'Other warehouse hold', 'HOLD')
on conflict (code) do update
set label = excluded.label,
    parcel_condition = excluded.parcel_condition,
    active = true,
    updated_at = now();

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

create index if not exists be_warehouse_receipts_v36_way_idx
  on public.be_warehouse_receipts_v36(delivery_way_id);
create index if not exists be_warehouse_receipts_v36_status_idx
  on public.be_warehouse_receipts_v36(pickup_id, warehouse_status);

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

create index if not exists be_warehouse_receipt_events_v36_pickup_idx
  on public.be_warehouse_receipt_events_v36(pickup_id, created_at desc);

alter table public.be_warehouse_receipts_v36 enable row level security;
alter table public.be_warehouse_receipt_events_v36 enable row level security;
alter table public.be_warehouse_exception_codes_v36 enable row level security;

-- The browser uses SECURITY DEFINER RPCs. Direct table mutation remains unavailable.
revoke all on public.be_warehouse_receipts_v36 from anon, authenticated;
revoke all on public.be_warehouse_receipt_events_v36 from anon, authenticated;
revoke all on public.be_warehouse_exception_codes_v36 from anon, authenticated;

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

grant select on public.be_v_warehouse_receipt_v36 to authenticated;

create or replace function public.be_warehouse_receipt_snapshot_v36(
  p_pickup_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text;
  v_pickups jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_exceptions jsonb := '[]'::jsonb;
begin
  v_pickup_id := nullif(btrim(coalesce(p_pickup_id, '')), '');

  if v_pickup_id is null then
    select x.pickup_id
    into v_pickup_id
    from (
      select w.pickup_id, coalesce(w.updated_at, w.created_at) as activity_at
      from public.be_parcel_waybills w
      where exists (
        select 1 from public.be_data_entry_parcel_details d where d.pickup_id = w.pickup_id
      )
      union all
      select d.pickup_id, max(coalesce(d.updated_at, d.saved_at)) as activity_at
      from public.be_data_entry_parcel_details d
      group by d.pickup_id
    ) x
    order by x.activity_at desc nulls last
    limit 1;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.activity_at desc nulls last), '[]'::jsonb)
  into v_pickups
  from (
    select
      d.pickup_id,
      wb.waybill_no,
      count(*)::integer as expected_parcels,
      count(*) filter (where coalesce(r.warehouse_status, 'PENDING') <> 'PENDING')::integer as scanned_parcels,
      count(*) filter (where r.warehouse_status = 'WAREHOUSE_READY')::integer as ready_parcels,
      count(*) filter (where r.warehouse_status = 'WAREHOUSE_EXCEPTION')::integer as exception_parcels,
      max(coalesce(wb.updated_at, wb.created_at, d.updated_at, d.saved_at)) as activity_at,
      max(coalesce(wb.created_at, d.saved_at)) as created_at
    from public.be_data_entry_parcel_details d
    left join public.be_warehouse_receipts_v36 r
      on r.pickup_id = d.pickup_id and r.parcel_sequence = d.parcel_sequence
    left join lateral (
      select w.waybill_no, w.created_at, w.updated_at
      from public.be_parcel_waybills w
      where w.pickup_id = d.pickup_id
      order by w.updated_at desc nulls last, w.created_at desc nulls last
      limit 1
    ) wb on true
    group by d.pickup_id, wb.waybill_no
  ) p;

  if v_pickup_id is not null then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.parcel_sequence), '[]'::jsonb)
    into v_rows
    from public.be_v_warehouse_receipt_v36 v
    where v.pickup_id = v_pickup_id;

    select jsonb_build_object(
      'expected', count(*)::integer,
      'scanned', count(*) filter (where v.warehouse_status <> 'PENDING')::integer,
      'ready', count(*) filter (where v.warehouse_status = 'WAREHOUSE_READY')::integer,
      'exceptions', count(*) filter (where v.warehouse_status = 'WAREHOUSE_EXCEPTION')::integer,
      'remaining', count(*) filter (where v.warehouse_status = 'PENDING')::integer,
      'label_qa_passed', count(*) filter (where v.label_scan_passed)::integer,
      'label_qa_pending', count(*) filter (where v.warehouse_status <> 'PENDING' and not v.label_scan_passed)::integer,
      'total_collect', coalesce(sum(v.actual_collect), 0)
    )
    into v_stats
    from public.be_v_warehouse_receipt_v36 v
    where v.pickup_id = v_pickup_id;
  else
    v_stats := jsonb_build_object(
      'expected', 0, 'scanned', 0, 'ready', 0, 'exceptions', 0,
      'remaining', 0, 'label_qa_passed', 0, 'label_qa_pending', 0,
      'total_collect', 0
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', e.code,
    'label', e.label,
    'condition', e.parcel_condition
  ) order by e.code), '[]'::jsonb)
  into v_exceptions
  from public.be_warehouse_exception_codes_v36 e
  where e.active;

  return jsonb_build_object(
    'build', 'WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30',
    'selected_pickup_id', v_pickup_id,
    'pickups', v_pickups,
    'stats', coalesce(v_stats, '{}'::jsonb),
    'rows', v_rows,
    'exceptions', v_exceptions
  );
end;
$$;

create or replace function public.be_warehouse_receive_scan_v36(
  p_pickup_id text,
  p_way_id text,
  p_action text default 'RECEIVE',
  p_condition text default 'GOOD',
  p_exception_code text default null,
  p_remark text default null,
  p_actual_weight_kg numeric default null,
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_pickup_id, '')), '');
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_action text := upper(nullif(btrim(coalesce(p_action, '')), ''));
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_sequence integer;
  v_declared numeric := 0;
  v_previous text;
  v_new text;
  v_exception text := nullif(btrim(coalesce(p_exception_code, '')), '');
  v_condition text := upper(coalesce(nullif(btrim(coalesce(p_condition, '')), ''), 'GOOD'));
  v_result jsonb;
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_way_id is null then raise exception 'parcel Way ID is required'; end if;

  select d.parcel_sequence, coalesce(d.weight_kg, 0)
  into v_sequence, v_declared
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id
    and d.delivery_way_id = v_way_id
  order by d.parcel_sequence
  limit 1;

  if v_sequence is null then
    raise exception 'Way ID % does not belong to pickup %', v_way_id, v_pickup_id;
  end if;

  insert into public.be_warehouse_receipts_v36(
    pickup_id, parcel_sequence, delivery_way_id, warehouse_status,
    parcel_condition, warehouse_code, staging_zone, declared_weight_kg,
    created_at, updated_at
  ) values (
    v_pickup_id, v_sequence, v_way_id, 'PENDING',
    'UNINSPECTED', nullif(p_warehouse_code, ''), nullif(p_staging_zone, ''), v_declared,
    now(), now()
  )
  on conflict (pickup_id, parcel_sequence) do nothing;

  select warehouse_status into v_previous
  from public.be_warehouse_receipts_v36
  where pickup_id = v_pickup_id and parcel_sequence = v_sequence
  for update;

  if v_action = 'RECEIVE' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'RECEIVED',
        parcel_condition = coalesce(nullif(v_condition, ''), 'GOOD'),
        discrepancy_code = null,
        discrepancy_remark = null,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'INTAKE'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'READY' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_READY',
        parcel_condition = 'GOOD',
        discrepancy_code = null,
        discrepancy_remark = null,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'READY_FOR_DISPATCH'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        ready_at = now(),
        ready_by = v_actor,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'EXCEPTION' then
    if v_exception is null then raise exception 'exception code is required'; end if;
    if not exists (select 1 from public.be_warehouse_exception_codes_v36 where code = v_exception and active) then
      raise exception 'Unknown warehouse exception code: %', v_exception;
    end if;
    if nullif(btrim(coalesce(p_remark, '')), '') is null then
      raise exception 'Warehouse exception remark is required';
    end if;

    select parcel_condition into v_condition
    from public.be_warehouse_exception_codes_v36 where code = v_exception;

    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_EXCEPTION',
        parcel_condition = coalesce(v_condition, 'HOLD'),
        discrepancy_code = v_exception,
        discrepancy_remark = p_remark,
        warehouse_code = coalesce(nullif(p_warehouse_code, ''), warehouse_code, 'YGN-MAIN'),
        staging_zone = coalesce(nullif(p_staging_zone, ''), 'QUARANTINE'),
        actual_weight_kg = coalesce(p_actual_weight_kg, actual_weight_kg),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        ready_at = null,
        ready_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'LABEL_PASS' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = case when warehouse_status = 'PENDING' then 'RECEIVED' else warehouse_status end,
        parcel_condition = case when parcel_condition = 'UNINSPECTED' then 'GOOD' else parcel_condition end,
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        label_scan_attempts = coalesce(label_scan_attempts, 0) + 1,
        label_scan_passed = true,
        qa_approved_at = now(),
        qa_approved_by = v_actor,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'LABEL_FAIL' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'WAREHOUSE_EXCEPTION',
        parcel_condition = 'UNSCANNABLE',
        discrepancy_code = 'UNSCANNABLE_LABEL',
        discrepancy_remark = coalesce(nullif(p_remark, ''), 'Physical QR / barcode scan failed'),
        scanned_at = coalesce(scanned_at, now()),
        scanned_by = coalesce(scanned_by, v_actor),
        label_scan_attempts = coalesce(label_scan_attempts, 0) + 1,
        label_scan_passed = false,
        qa_approved_at = null,
        qa_approved_by = null,
        staging_zone = 'QUARANTINE',
        ready_at = null,
        ready_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  elsif v_action = 'RESET' then
    update public.be_warehouse_receipts_v36
    set warehouse_status = 'PENDING',
        parcel_condition = 'UNINSPECTED',
        discrepancy_code = null,
        discrepancy_remark = null,
        actual_weight_kg = null,
        scanned_at = null,
        scanned_by = null,
        ready_at = null,
        ready_by = null,
        label_scan_attempts = 0,
        label_scan_passed = false,
        qa_approved_at = null,
        qa_approved_by = null,
        updated_at = now()
    where pickup_id = v_pickup_id and parcel_sequence = v_sequence;
  else
    raise exception 'Unsupported warehouse action: %', v_action;
  end if;

  select warehouse_status into v_new
  from public.be_warehouse_receipts_v36
  where pickup_id = v_pickup_id and parcel_sequence = v_sequence;

  insert into public.be_warehouse_receipt_events_v36(
    pickup_id, parcel_sequence, delivery_way_id, action,
    previous_status, new_status, exception_code, remark,
    warehouse_code, staging_zone, actor_email
  ) values (
    v_pickup_id, v_sequence, v_way_id, v_action,
    v_previous, v_new, v_exception, p_remark,
    p_warehouse_code, p_staging_zone, v_actor
  );

  select to_jsonb(v) into v_result
  from public.be_v_warehouse_receipt_v36 v
  where v.pickup_id = v_pickup_id and v.parcel_sequence = v_sequence;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'way_id', v_way_id,
    'status', v_new,
    'row', v_result
  );
end;
$$;

create or replace function public.be_warehouse_receive_batch_v36(
  p_pickup_id text,
  p_way_ids text[],
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default 'INTAKE',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way_id text;
  v_accepted integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    raise exception 'At least one Way ID is required';
  end if;

  foreach v_way_id in array p_way_ids loop
    begin
      v_results := v_results || jsonb_build_array(
        public.be_warehouse_receive_scan_v36(
          p_pickup_id,
          v_way_id,
          'RECEIVE',
          'GOOD',
          null,
          null,
          null,
          p_warehouse_code,
          p_staging_zone,
          p_actor_email
        )
      );
      v_accepted := v_accepted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'way_id', v_way_id,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'accepted', v_accepted,
    'failed', v_failed,
    'results', v_results
  );
end;
$$;

create or replace function public.be_warehouse_mark_scanned_ready_v36(
  p_pickup_id text,
  p_staging_zone text default 'READY_FOR_DISPATCH',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(nullif(btrim(coalesce(p_actor_email, '')), ''), 'authenticated-user');
  v_count integer := 0;
begin
  insert into public.be_warehouse_receipt_events_v36(
    pickup_id, parcel_sequence, delivery_way_id, action,
    previous_status, new_status, warehouse_code, staging_zone, actor_email
  )
  select
    r.pickup_id, r.parcel_sequence, r.delivery_way_id, 'BATCH_READY',
    r.warehouse_status, 'WAREHOUSE_READY', r.warehouse_code,
    coalesce(nullif(p_staging_zone, ''), r.staging_zone), v_actor
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id = p_pickup_id
    and r.warehouse_status = 'RECEIVED';

  update public.be_warehouse_receipts_v36
  set warehouse_status = 'WAREHOUSE_READY',
      parcel_condition = case when parcel_condition = 'UNINSPECTED' then 'GOOD' else parcel_condition end,
      staging_zone = coalesce(nullif(p_staging_zone, ''), staging_zone, 'READY_FOR_DISPATCH'),
      ready_at = now(),
      ready_by = v_actor,
      updated_at = now()
  where pickup_id = p_pickup_id
    and warehouse_status = 'RECEIVED';

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'ready_count', v_count,
    'exceptions_left_on_hold', (
      select count(*)::integer from public.be_warehouse_receipts_v36
      where pickup_id = p_pickup_id and warehouse_status = 'WAREHOUSE_EXCEPTION'
    )
  );
end;
$$;

revoke all on function public.be_warehouse_receipt_snapshot_v36(text) from public, anon;
revoke all on function public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text) from public, anon;
revoke all on function public.be_warehouse_receive_batch_v36(text,text[],text,text,text) from public, anon;
revoke all on function public.be_warehouse_mark_scanned_ready_v36(text,text,text) from public, anon;

grant execute on function public.be_warehouse_receipt_snapshot_v36(text) to authenticated;
grant execute on function public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.be_warehouse_receive_batch_v36(text,text[],text,text,text) to authenticated;
grant execute on function public.be_warehouse_mark_scanned_ready_v36(text,text,text) to authenticated;

commit;

select
  to_regprocedure('public.be_warehouse_receipt_snapshot_v36(text)')::text as snapshot_rpc,
  to_regprocedure('public.be_warehouse_receive_scan_v36(text,text,text,text,text,text,numeric,text,text,text)')::text as scan_rpc,
  to_regprocedure('public.be_warehouse_receive_batch_v36(text,text[],text,text,text)')::text as batch_rpc,
  to_regprocedure('public.be_warehouse_mark_scanned_ready_v36(text,text,text)')::text as ready_rpc,
  to_regclass('public.be_v_warehouse_receipt_v36')::text as receipt_view,
  'PENDING -> RECEIVED -> WAREHOUSE_READY; exceptions remain non-blocking'::text as workflow;
