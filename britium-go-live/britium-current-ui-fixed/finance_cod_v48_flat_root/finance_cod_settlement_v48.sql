-- Britium Express Finance COD Settlement V48
-- Rider V46 delivered stops -> COD reconciliation -> remittance/proof review
-- -> variance hold or settlement -> audit and legacy finance synchronization.

begin;

create extension if not exists pgcrypto;

create table if not exists public.be_finance_cod_settlements_v48 (
  delivery_way_id text primary key,
  wayplan_id text not null,
  pickup_id text,
  batch_waybill_no text,
  rider_code text,
  rider_name text,
  driver_code text,
  driver_name text,
  recipient_name text,
  recipient_phone text,
  township text,
  expected_cod numeric not null default 0,
  reported_collected numeric not null default 0,
  rider_remittance numeric not null default 0,
  settled_amount numeric not null default 0,
  delivery_fee numeric not null default 0,
  item_value numeric not null default 0,
  payment_mode text not null default 'UNSPECIFIED',
  proof_status text not null default 'MISSING',
  proof_reference text,
  settlement_status text not null default 'PENDING_REMITTANCE',
  variance_type text not null default 'MISSING_REMITTANCE',
  variance_amount numeric not null default 0,
  remittance_reference text,
  remittance_receiver text,
  remitted_at timestamptz,
  hold_code text,
  hold_note text,
  held_by text,
  held_at timestamptz,
  settlement_reference text,
  settlement_receiver text,
  settlement_note text,
  settled_by text,
  settled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_finance_cod_settlements_v48_status_check check (
    settlement_status in (
      'PENDING_REMITTANCE','PENDING_PROOF','READY_TO_SETTLE',
      'ON_HOLD','SETTLED','NOT_REQUIRED','VOID'
    )
  ),
  constraint be_finance_cod_settlements_v48_proof_check check (
    proof_status in ('MISSING','AVAILABLE','VERIFIED','WAIVED')
  ),
  constraint be_finance_cod_settlements_v48_variance_check check (
    variance_type in (
      'NONE','SHORTAGE','OVERAGE','MISSING_REMITTANCE',
      'MISSING_PROOF','PAYMENT_MISMATCH','DUPLICATE_POSTING','OTHER'
    )
  )
);

create table if not exists public.be_finance_cod_events_v48 (
  id bigint generated always as identity primary key,
  delivery_way_id text not null,
  wayplan_id text,
  event_type text not null,
  operation_id text,
  actor text,
  event_at timestamptz not null default now(),
  amount numeric,
  reference text,
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists be_finance_cod_events_v48_operation_uidx
  on public.be_finance_cod_events_v48(operation_id)
  where operation_id is not null;
create index if not exists be_finance_cod_events_v48_wayplan_idx
  on public.be_finance_cod_events_v48(wayplan_id, event_at desc);
create index if not exists be_finance_cod_settlements_v48_status_idx
  on public.be_finance_cod_settlements_v48(settlement_status, delivered_at desc);

create table if not exists public.be_finance_cod_hold_codes_v48 (
  code text primary key,
  label text not null,
  active boolean not null default true
);

insert into public.be_finance_cod_hold_codes_v48(code, label)
values
  ('SHORTAGE', 'Rider remittance is lower than expected COD'),
  ('OVERAGE', 'Rider remittance is higher than expected COD'),
  ('MISSING_PROOF', 'Delivery or payment evidence is missing'),
  ('PAYMENT_MISMATCH', 'Payment mode or reference does not match'),
  ('DUPLICATE_POSTING', 'Possible duplicate settlement posting'),
  ('OTHER', 'Other Finance review issue')
on conflict (code) do update set label = excluded.label, active = true;

alter table public.be_finance_cod_settlements_v48 enable row level security;
alter table public.be_finance_cod_events_v48 enable row level security;
alter table public.be_finance_cod_hold_codes_v48 enable row level security;
revoke all on public.be_finance_cod_settlements_v48 from public, anon, authenticated;
revoke all on public.be_finance_cod_events_v48 from public, anon, authenticated;
revoke all on public.be_finance_cod_hold_codes_v48 from public, anon, authenticated;

create or replace function public.be_finance_try_numeric_v48(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := nullif(regexp_replace(coalesce(p_value, ''), '[,[:space:]]', '', 'g'), '');
begin
  if v is null then return null; end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.be_finance_actor_v48(p_actor text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_actor), ''),
    nullif(auth.jwt() ->> 'email', ''),
    auth.uid()::text,
    session_user
  );
$$;

create or replace function public.be_finance_cod_sync_v48(p_wayplan_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
begin
  if to_regclass('public.be_rider_route_stop_state_v46') is null
     or to_regclass('public.be_wayplan_membership_v40') is null
     or to_regclass('public.be_v_warehouse_receipt_v39') is null then
    raise exception 'Rider V46, Wayplan V40, and Warehouse V39 are required before Finance V48';
  end if;

  with source as (
    select
      s.delivery_way_id,
      s.wayplan_id,
      m.pickup_id,
      w.batch_waybill_no,
      m.rider_code,
      m.rider_name,
      m.driver_code,
      m.driver_name,
      coalesce(nullif(s.recipient_name, ''), w.recipient_name) as recipient_name,
      coalesce(nullif(s.recipient_phone, ''), w.recipient_phone) as recipient_phone,
      coalesce(nullif(s.township, ''), w.township) as township,
      greatest(coalesce(w.actual_collect, 0), 0)::numeric as expected_cod,
      greatest(coalesce(w.delivery_fee, 0), 0)::numeric as delivery_fee,
      greatest(coalesce(w.item_price, 0), 0)::numeric as item_value,
      coalesce(
        public.be_finance_try_numeric_v48(s.result_payload ->> 'collected_amount'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'cod_collected'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'amount_received'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'received_amount'),
        0
      ) as reported_collected,
      coalesce(
        public.be_finance_try_numeric_v48(s.result_payload ->> 'rider_remittance'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'remitted_amount'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'handover_amount'),
        0
      ) as rider_remittance,
      upper(coalesce(
        nullif(s.result_payload ->> 'payment_mode', ''),
        nullif(s.result_payload ->> 'payment_type', ''),
        nullif(s.result_payload ->> 'cod_payment_mode', ''),
        'UNSPECIFIED'
      )) as payment_mode,
      coalesce(
        nullif(s.result_payload ->> 'proof_reference', ''),
        nullif(s.result_payload ->> 'proof_url', ''),
        nullif(s.result_payload ->> 'photo_url', ''),
        nullif(s.result_payload ->> 'signature_url', ''),
        nullif(s.result_payload ->> 'otp_reference', ''),
        nullif(s.result_payload #>> '{proof,url}', '')
      ) as proof_reference,
      (
        coalesce(
          nullif(s.result_payload ->> 'proof_reference', ''),
          nullif(s.result_payload ->> 'proof_url', ''),
          nullif(s.result_payload ->> 'photo_url', ''),
          nullif(s.result_payload ->> 'signature_url', ''),
          nullif(s.result_payload ->> 'otp_reference', ''),
          nullif(s.result_payload #>> '{proof,url}', '')
        ) is not null
        or coalesce(s.result_payload ? 'signature', false)
        or coalesce(s.result_payload ? 'photo', false)
        or coalesce(s.result_payload ? 'otp', false)
      ) as proof_available,
      s.result_at as delivered_at,
      s.result_payload
    from public.be_rider_route_stop_state_v46 s
    join public.be_wayplan_membership_v40 m
      on m.wayplan_id = s.wayplan_id and m.delivery_way_id = s.delivery_way_id
    left join public.be_v_warehouse_receipt_v39 w
      on w.delivery_way_id = s.delivery_way_id
    where s.stop_status = 'DELIVERED'
      and (v_wayplan is null or s.wayplan_id = v_wayplan)
  ), normalized as (
    select
      source.*,
      (rider_remittance - expected_cod)::numeric as calculated_variance,
      case
        when expected_cod <= 0 then 'NOT_REQUIRED'
        when not proof_available then 'PENDING_PROOF'
        when rider_remittance <= 0 then 'PENDING_REMITTANCE'
        when abs(rider_remittance - expected_cod) > 0.01 then 'ON_HOLD'
        else 'READY_TO_SETTLE'
      end as calculated_status,
      case
        when expected_cod <= 0 then 'NONE'
        when not proof_available then 'MISSING_PROOF'
        when rider_remittance <= 0 then 'MISSING_REMITTANCE'
        when rider_remittance < expected_cod - 0.01 then 'SHORTAGE'
        when rider_remittance > expected_cod + 0.01 then 'OVERAGE'
        else 'NONE'
      end as calculated_variance_type
    from source
  )
  insert into public.be_finance_cod_settlements_v48(
    delivery_way_id, wayplan_id, pickup_id, batch_waybill_no,
    rider_code, rider_name, driver_code, driver_name,
    recipient_name, recipient_phone, township,
    expected_cod, reported_collected, rider_remittance,
    delivery_fee, item_value, payment_mode,
    proof_status, proof_reference, settlement_status,
    variance_type, variance_amount, delivered_at, metadata
  )
  select
    delivery_way_id, wayplan_id, pickup_id, batch_waybill_no,
    rider_code, rider_name, driver_code, driver_name,
    recipient_name, recipient_phone, township,
    expected_cod, reported_collected, rider_remittance,
    delivery_fee, item_value, payment_mode,
    case when proof_available then 'AVAILABLE' else 'MISSING' end,
    proof_reference, calculated_status,
    calculated_variance_type, calculated_variance,
    delivered_at,
    jsonb_build_object(
      'source', 'RIDER_V46',
      'rider_result_payload', result_payload,
      'build', 'FINANCE_COD_V48_RECONCILIATION_2026-07-30'
    )
  from normalized
  on conflict (delivery_way_id) do update set
    wayplan_id = excluded.wayplan_id,
    pickup_id = coalesce(excluded.pickup_id, public.be_finance_cod_settlements_v48.pickup_id),
    batch_waybill_no = coalesce(excluded.batch_waybill_no, public.be_finance_cod_settlements_v48.batch_waybill_no),
    rider_code = coalesce(excluded.rider_code, public.be_finance_cod_settlements_v48.rider_code),
    rider_name = coalesce(excluded.rider_name, public.be_finance_cod_settlements_v48.rider_name),
    driver_code = coalesce(excluded.driver_code, public.be_finance_cod_settlements_v48.driver_code),
    driver_name = coalesce(excluded.driver_name, public.be_finance_cod_settlements_v48.driver_name),
    recipient_name = coalesce(excluded.recipient_name, public.be_finance_cod_settlements_v48.recipient_name),
    recipient_phone = coalesce(excluded.recipient_phone, public.be_finance_cod_settlements_v48.recipient_phone),
    township = coalesce(excluded.township, public.be_finance_cod_settlements_v48.township),
    expected_cod = excluded.expected_cod,
    reported_collected = case
      when excluded.reported_collected > 0 then excluded.reported_collected
      else public.be_finance_cod_settlements_v48.reported_collected
    end,
    rider_remittance = case
      when public.be_finance_cod_settlements_v48.rider_remittance > 0
        then public.be_finance_cod_settlements_v48.rider_remittance
      else excluded.rider_remittance
    end,
    delivery_fee = excluded.delivery_fee,
    item_value = excluded.item_value,
    payment_mode = case
      when public.be_finance_cod_settlements_v48.payment_mode <> 'UNSPECIFIED'
        then public.be_finance_cod_settlements_v48.payment_mode
      else excluded.payment_mode
    end,
    proof_status = case
      when public.be_finance_cod_settlements_v48.proof_status in ('VERIFIED','WAIVED')
        then public.be_finance_cod_settlements_v48.proof_status
      else excluded.proof_status
    end,
    proof_reference = coalesce(public.be_finance_cod_settlements_v48.proof_reference, excluded.proof_reference),
    settlement_status = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.settlement_status
      else excluded.settlement_status
    end,
    variance_type = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.variance_type
      else excluded.variance_type
    end,
    variance_amount = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.variance_amount
      else excluded.variance_amount
    end,
    delivered_at = coalesce(excluded.delivered_at, public.be_finance_cod_settlements_v48.delivered_at),
    metadata = coalesce(public.be_finance_cod_settlements_v48.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'synced_rows', v_count,
    'workflow', 'DELIVERED -> COD RECONCILIATION -> READY/ON_HOLD -> SETTLED'
  );
end;
$$;

create or replace function public.be_finance_cod_stop_sync_trigger_v48()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stop_status = 'DELIVERED' then
    perform public.be_finance_cod_sync_v48(new.wayplan_id);
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.be_rider_route_stop_state_v46') is not null then
    execute 'drop trigger if exists be_finance_cod_stop_sync_v48 on public.be_rider_route_stop_state_v46';
    execute 'create trigger be_finance_cod_stop_sync_v48 after insert or update of stop_status, result_payload on public.be_rider_route_stop_state_v46 for each row execute function public.be_finance_cod_stop_sync_trigger_v48()';
  end if;
end;
$$;

create or replace function public.be_finance_cod_snapshot_v48(
  p_status text default 'OPEN',
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(nullif(btrim(coalesce(p_status, 'OPEN')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_rows jsonb;
  v_summary jsonb;
  v_holds jsonb;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Finance user is required';
  end if;

  perform public.be_finance_cod_sync_v48(null);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.delivered_at desc nulls last, q.delivery_way_id), '[]'::jsonb)
  into v_rows
  from (
    select *
    from public.be_finance_cod_settlements_v48 s
    where
      case v_status
        when 'ALL' then true
        when 'OPEN' then s.settlement_status not in ('SETTLED','NOT_REQUIRED','VOID')
        when 'READY' then s.settlement_status = 'READY_TO_SETTLE'
        when 'HOLD' then s.settlement_status = 'ON_HOLD'
        when 'SETTLED' then s.settlement_status = 'SETTLED'
        when 'PENDING' then s.settlement_status in ('PENDING_REMITTANCE','PENDING_PROOF')
        else s.settlement_status = v_status
      end
    order by s.delivered_at desc nulls last, s.delivery_way_id
    limit v_limit
  ) q;

  select jsonb_build_object(
    'rows', count(*)::integer,
    'pending', count(*) filter (where settlement_status in ('PENDING_REMITTANCE','PENDING_PROOF'))::integer,
    'ready', count(*) filter (where settlement_status = 'READY_TO_SETTLE')::integer,
    'on_hold', count(*) filter (where settlement_status = 'ON_HOLD')::integer,
    'settled', count(*) filter (where settlement_status = 'SETTLED')::integer,
    'not_required', count(*) filter (where settlement_status = 'NOT_REQUIRED')::integer,
    'expected_total', coalesce(sum(expected_cod), 0),
    'remitted_total', coalesce(sum(rider_remittance), 0),
    'settled_total', coalesce(sum(settled_amount), 0),
    'open_variance', coalesce(sum(variance_amount) filter (where settlement_status <> 'SETTLED'), 0)
  ) into v_summary
  from public.be_finance_cod_settlements_v48;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label) order by code), '[]'::jsonb)
  into v_holds
  from public.be_finance_cod_hold_codes_v48 where active;

  return jsonb_build_object(
    'ok', true,
    'build', 'FINANCE_COD_V48_RECONCILIATION_2026-07-30',
    'filter', v_status,
    'summary', v_summary,
    'rows', v_rows,
    'hold_codes', v_holds,
    'workflow', 'DELIVERED -> REMITTANCE + PROOF -> VARIANCE REVIEW -> SETTLED',
    'synced_at', now()
  );
end;
$$;

create or replace function public.be_finance_cod_record_remittance_v48(
  p_delivery_way_id text,
  p_remitted_amount numeric,
  p_payment_mode text,
  p_reference text,
  p_receiver text,
  p_received_at timestamptz default now(),
  p_proof_reference text default null,
  p_note text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(btrim(coalesce(p_delivery_way_id, '')), '');
  v_amount numeric := coalesce(p_remitted_amount, 0);
  v_actor text := public.be_finance_actor_v48(p_receiver);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(coalesce(v_way, '') || '|REMIT|' || clock_timestamp()::text, 'sha256'), 'hex'));
  v_row public.be_finance_cod_settlements_v48;
  v_status text;
  v_variance numeric;
  v_variance_type text;
  v_proof_status text;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Finance user is required';
  end if;
  if v_way is null then raise exception 'Way ID is required'; end if;
  if v_amount < 0 then raise exception 'Remittance amount cannot be negative'; end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then raise exception 'Remittance reference is required'; end if;
  if nullif(btrim(coalesce(p_receiver, '')), '') is null then raise exception 'Finance receiver is required'; end if;

  if exists (select 1 from public.be_finance_cod_events_v48 where operation_id = v_operation) then
    select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  perform public.be_finance_cod_sync_v48(null);
  select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way for update;
  if v_row.delivery_way_id is null then raise exception 'Delivered COD record % was not found', v_way; end if;
  if v_row.settlement_status = 'SETTLED' then raise exception 'COD record % is already settled', v_way; end if;

  v_variance := v_amount - v_row.expected_cod;
  v_proof_status := case
    when nullif(btrim(coalesce(p_proof_reference, '')), '') is not null then 'VERIFIED'
    when v_row.proof_status in ('AVAILABLE','VERIFIED','WAIVED') then v_row.proof_status
    else 'MISSING'
  end;

  if v_row.expected_cod <= 0 then
    v_status := 'NOT_REQUIRED';
    v_variance_type := 'NONE';
  elsif v_proof_status = 'MISSING' then
    v_status := 'PENDING_PROOF';
    v_variance_type := 'MISSING_PROOF';
  elsif v_amount <= 0 then
    v_status := 'PENDING_REMITTANCE';
    v_variance_type := 'MISSING_REMITTANCE';
  elsif v_variance < -0.01 then
    v_status := 'ON_HOLD';
    v_variance_type := 'SHORTAGE';
  elsif v_variance > 0.01 then
    v_status := 'ON_HOLD';
    v_variance_type := 'OVERAGE';
  else
    v_status := 'READY_TO_SETTLE';
    v_variance_type := 'NONE';
  end if;

  update public.be_finance_cod_settlements_v48
  set rider_remittance = v_amount,
      reported_collected = case when reported_collected <= 0 then v_amount else reported_collected end,
      payment_mode = upper(coalesce(nullif(btrim(p_payment_mode), ''), payment_mode, 'UNSPECIFIED')),
      proof_status = v_proof_status,
      proof_reference = coalesce(nullif(btrim(p_proof_reference), ''), proof_reference),
      remittance_reference = btrim(p_reference),
      remittance_receiver = btrim(p_receiver),
      remitted_at = coalesce(p_received_at, now()),
      settlement_status = v_status,
      variance_type = v_variance_type,
      variance_amount = v_variance,
      hold_code = case when v_status = 'ON_HOLD' then v_variance_type else null end,
      hold_note = case when v_status = 'ON_HOLD' then coalesce(nullif(btrim(p_note), ''), 'Automatic variance hold') else null end,
      held_by = case when v_status = 'ON_HOLD' then v_actor else null end,
      held_at = case when v_status = 'ON_HOLD' then now() else null end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('remittance_note', p_note),
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_finance_cod_events_v48(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, amount, reference, payload
  ) values (
    v_way, v_row.wayplan_id, 'REMITTANCE_RECORDED', v_operation, v_actor, v_amount, p_reference,
    jsonb_build_object('payment_mode', p_payment_mode, 'proof_reference', p_proof_reference, 'status', v_status, 'variance', v_variance, 'note', p_note)
  );

  if to_regclass('public.be_cod_ledger') is not null then
    execute 'update public.be_cod_ledger set collected_amount=$1, handover_amount=$1, variance_amount=$2, cod_status=$3, handed_over_at=$4, received_by_name=$5, payload=coalesce(payload,''{}''::jsonb)||$6::jsonb, updated_at=now() where delivery_way_id=$7'
    using v_amount, v_variance,
      case when v_status = 'READY_TO_SETTLE' then 'handed_over_to_finance' else lower(v_status) end,
      coalesce(p_received_at, now()), p_receiver,
      jsonb_build_object('v48_reference', p_reference, 'v48_status', v_status), v_way;
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

create or replace function public.be_finance_cod_hold_v48(
  p_delivery_way_id text,
  p_hold_code text,
  p_note text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(btrim(coalesce(p_delivery_way_id, '')), '');
  v_code text := upper(nullif(btrim(coalesce(p_hold_code, '')), ''));
  v_actor text := public.be_finance_actor_v48(p_actor);
  v_row public.be_finance_cod_settlements_v48;
begin
  if auth.uid() is null and session_user <> 'postgres' then raise exception 'Authenticated Finance user is required'; end if;
  if v_way is null then raise exception 'Way ID is required'; end if;
  if v_code is null or not exists (select 1 from public.be_finance_cod_hold_codes_v48 where code = v_code and active) then
    raise exception 'Valid hold code is required';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Hold note is required'; end if;

  update public.be_finance_cod_settlements_v48
  set settlement_status = 'ON_HOLD',
      variance_type = case when v_code in ('SHORTAGE','OVERAGE','MISSING_PROOF','PAYMENT_MISMATCH','DUPLICATE_POSTING') then v_code else 'OTHER' end,
      hold_code = v_code,
      hold_note = btrim(p_note),
      held_by = v_actor,
      held_at = now(),
      updated_at = now()
  where delivery_way_id = v_way and settlement_status <> 'SETTLED'
  returning * into v_row;

  if v_row.delivery_way_id is null then raise exception 'Open COD record % was not found', v_way; end if;

  insert into public.be_finance_cod_events_v48(delivery_way_id, wayplan_id, event_type, actor, payload)
  values (v_way, v_row.wayplan_id, 'SETTLEMENT_HELD', v_actor, jsonb_build_object('hold_code', v_code, 'note', p_note));

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

create or replace function public.be_finance_cod_settle_v48(
  p_delivery_way_id text,
  p_settled_amount numeric,
  p_reference text,
  p_receiver text,
  p_settled_at timestamptz default now(),
  p_note text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text := nullif(btrim(coalesce(p_delivery_way_id, '')), '');
  v_actor text := public.be_finance_actor_v48(p_receiver);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(coalesce(v_way, '') || '|SETTLE|' || coalesce(p_reference, ''), 'sha256'), 'hex'));
  v_row public.be_finance_cod_settlements_v48;
  v_amount numeric;
begin
  if auth.uid() is null and session_user <> 'postgres' then raise exception 'Authenticated Finance user is required'; end if;
  if v_way is null then raise exception 'Way ID is required'; end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then raise exception 'Settlement reference is required'; end if;
  if nullif(btrim(coalesce(p_receiver, '')), '') is null then raise exception 'Settlement receiver is required'; end if;

  if exists (select 1 from public.be_finance_cod_events_v48 where operation_id = v_operation) then
    select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way for update;
  if v_row.delivery_way_id is null then raise exception 'COD record % was not found', v_way; end if;
  if v_row.settlement_status = 'SETTLED' then
    return jsonb_build_object('ok', true, 'already_settled', true, 'row', to_jsonb(v_row));
  end if;
  if v_row.settlement_status <> 'READY_TO_SETTLE' then
    raise exception 'COD record % is %, not READY_TO_SETTLE', v_way, v_row.settlement_status;
  end if;
  if v_row.proof_status not in ('AVAILABLE','VERIFIED','WAIVED') or nullif(btrim(coalesce(v_row.proof_reference, '')), '') is null then
    raise exception 'Delivery/payment proof is required before settlement';
  end if;

  v_amount := coalesce(p_settled_amount, v_row.rider_remittance);
  if abs(v_amount - v_row.expected_cod) > 0.01 then
    raise exception 'Settlement amount % does not match expected COD %', v_amount, v_row.expected_cod;
  end if;
  if abs(v_row.rider_remittance - v_row.expected_cod) > 0.01 then
    raise exception 'Rider remittance % does not match expected COD %', v_row.rider_remittance, v_row.expected_cod;
  end if;

  update public.be_finance_cod_settlements_v48
  set settled_amount = v_amount,
      settlement_status = 'SETTLED',
      variance_type = 'NONE',
      variance_amount = 0,
      settlement_reference = btrim(p_reference),
      settlement_receiver = btrim(p_receiver),
      settlement_note = nullif(btrim(coalesce(p_note, '')), ''),
      settled_by = v_actor,
      settled_at = coalesce(p_settled_at, now()),
      hold_code = null,
      hold_note = null,
      held_by = null,
      held_at = null,
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_finance_cod_events_v48(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, amount, reference, payload
  ) values (
    v_way, v_row.wayplan_id, 'COD_SETTLED', v_operation, v_actor, v_amount, p_reference,
    jsonb_build_object('receiver', p_receiver, 'note', p_note, 'payment_mode', v_row.payment_mode)
  );

  if to_regclass('public.be_cod_ledger') is not null then
    execute 'update public.be_cod_ledger set collected_amount=$1, handover_amount=$1, variance_amount=0, cod_status=''finance_settled'', handed_over_at=coalesce(handed_over_at,$2), received_by_name=$3, settlement_id=coalesce(settlement_id,$4), payload=coalesce(payload,''{}''::jsonb)||$5::jsonb, updated_at=now() where delivery_way_id=$6'
    using v_amount, coalesce(p_settled_at, now()), p_receiver, p_reference,
      jsonb_build_object('v48_operation_id', v_operation, 'v48_settlement_reference', p_reference), v_way;
  end if;

  if to_regclass('public.be_financial_settlements') is not null then
    execute 'insert into public.be_financial_settlements(delivery_way_id,pickup_id,recipient_name,delivery_fee,gross_cod,handover_amount,variance_amount,finance_deli,finance_cod,settlement_status,finance_note,closed_by_name,closed_at,payload,updated_at) values($1,$2,$3,$4,$5,$5,0,$4,$5,''finance_settled'',$6,$7,$8,$9::jsonb,now()) on conflict(delivery_way_id) do update set handover_amount=excluded.handover_amount, variance_amount=0, finance_deli=excluded.finance_deli, finance_cod=excluded.finance_cod, settlement_status=''finance_settled'', finance_note=excluded.finance_note, closed_by_name=excluded.closed_by_name, closed_at=excluded.closed_at, payload=coalesce(public.be_financial_settlements.payload,''{}''::jsonb)||excluded.payload, updated_at=now()'
    using v_way, v_row.pickup_id, v_row.recipient_name, v_row.delivery_fee, v_amount, p_note, p_receiver,
      coalesce(p_settled_at, now()), jsonb_build_object('v48_operation_id', v_operation, 'settlement_reference', p_reference);
  end if;

  if to_regclass('public.delivery_waybills') is not null then
    execute 'update public.delivery_waybills set finance_status=''finance_settled'', financial_status=''finance_settled'', finance_received_by=$1, updated_at=now() where delivery_way_id=$2'
    using p_receiver, v_way;
  end if;

  if to_regclass('public.be_finance_journal_entries') is not null then
    execute 'insert into public.be_finance_journal_entries(source_module,source_id,delivery_way_id,account_code,account_description,debit,credit,payload) values(''finance_cod_v48'',$1,$2,''1001'',''Cash / Bank Received'',$3,0,$4::jsonb),(''finance_cod_v48'',$1,$2,''4002'',''COD Settlement'',0,$3,$4::jsonb)'
    using p_reference, v_way, v_amount, jsonb_build_object('v48_operation_id', v_operation, 'receiver', p_receiver);
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

create or replace function public.be_finance_cod_settle_batch_v48(
  p_delivery_way_ids text[],
  p_batch_reference text,
  p_receiver text,
  p_note text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_way text;
  v_index integer := 0;
  v_ok integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_row public.be_finance_cod_settlements_v48;
  v_ref text;
  v_op text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(coalesce(p_batch_reference, '') || '|BATCH|' || clock_timestamp()::text, 'sha256'), 'hex'));
begin
  if auth.uid() is null and session_user <> 'postgres' then raise exception 'Authenticated Finance user is required'; end if;
  if coalesce(array_length(p_delivery_way_ids, 1), 0) = 0 then raise exception 'At least one Way ID is required'; end if;
  if nullif(btrim(coalesce(p_batch_reference, '')), '') is null then raise exception 'Batch settlement reference is required'; end if;

  foreach v_way in array p_delivery_way_ids loop
    v_index := v_index + 1;
    begin
      select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = btrim(v_way);
      v_ref := btrim(p_batch_reference) || '-' || lpad(v_index::text, 3, '0');
      perform public.be_finance_cod_settle_v48(
        btrim(v_way), v_row.rider_remittance, v_ref, p_receiver, now(), p_note, v_op || '-' || v_index
      );
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('delivery_way_id', btrim(v_way), 'ok', true, 'reference', v_ref));
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('delivery_way_id', btrim(v_way), 'ok', false, 'error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('ok', v_failed = 0, 'settled', v_ok, 'failed', v_failed, 'results', v_results);
end;
$$;

create or replace function public.be_finance_cod_status_v48(p_delivery_way_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(s) || jsonb_build_object(
      'events', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.event_at desc)
        from public.be_finance_cod_events_v48 e
        where e.delivery_way_id = s.delivery_way_id
      ), '[]'::jsonb)
    ) from public.be_finance_cod_settlements_v48 s where s.delivery_way_id = btrim(p_delivery_way_id)),
    jsonb_build_object('delivery_way_id', p_delivery_way_id, 'settlement_status', 'NOT_FOUND')
  );
$$;

revoke all on function public.be_finance_cod_sync_v48(text) from public, anon;
revoke all on function public.be_finance_cod_snapshot_v48(text,integer) from public, anon;
revoke all on function public.be_finance_cod_record_remittance_v48(text,numeric,text,text,text,timestamptz,text,text,text) from public, anon;
revoke all on function public.be_finance_cod_hold_v48(text,text,text,text) from public, anon;
revoke all on function public.be_finance_cod_settle_v48(text,numeric,text,text,timestamptz,text,text) from public, anon;
revoke all on function public.be_finance_cod_settle_batch_v48(text[],text,text,text,text) from public, anon;
revoke all on function public.be_finance_cod_status_v48(text) from public, anon;

grant execute on function public.be_finance_cod_sync_v48(text) to authenticated;
grant execute on function public.be_finance_cod_snapshot_v48(text,integer) to authenticated;
grant execute on function public.be_finance_cod_record_remittance_v48(text,numeric,text,text,text,timestamptz,text,text,text) to authenticated;
grant execute on function public.be_finance_cod_hold_v48(text,text,text,text) to authenticated;
grant execute on function public.be_finance_cod_settle_v48(text,numeric,text,text,timestamptz,text,text) to authenticated;
grant execute on function public.be_finance_cod_settle_batch_v48(text[],text,text,text,text) to authenticated;
grant execute on function public.be_finance_cod_status_v48(text) to authenticated;

-- Initial synchronization of already delivered Rider V46 stops.
select public.be_finance_cod_sync_v48(null);

commit;

select jsonb_build_object(
  'snapshot_rpc', to_regprocedure('public.be_finance_cod_snapshot_v48(text,integer)')::text,
  'sync_rpc', to_regprocedure('public.be_finance_cod_sync_v48(text)')::text,
  'record_remittance_rpc', to_regprocedure('public.be_finance_cod_record_remittance_v48(text,numeric,text,text,text,timestamptz,text,text,text)')::text,
  'hold_rpc', to_regprocedure('public.be_finance_cod_hold_v48(text,text,text,text)')::text,
  'settle_rpc', to_regprocedure('public.be_finance_cod_settle_v48(text,numeric,text,text,timestamptz,text,text)')::text,
  'batch_settle_rpc', to_regprocedure('public.be_finance_cod_settle_batch_v48(text[],text,text,text,text)')::text,
  'status_rpc', to_regprocedure('public.be_finance_cod_status_v48(text)')::text,
  'settlement_table', to_regclass('public.be_finance_cod_settlements_v48')::text,
  'workflow', 'DELIVERED -> remittance/proof reconciliation -> variance hold or READY_TO_SETTLE -> SETTLED'
) as finance_cod_v48;
