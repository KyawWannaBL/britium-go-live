
-- Finance Go-Live Reports + COD Settlement Wire-Up
-- Source of truth:
--   public.be_portal_pickup_requests
--   public.be_portal_cargo_events
--   public.be_app_notifications

create extension if not exists pgcrypto;

alter table public.be_portal_cargo_events
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists finance_received_by text,
  add column if not exists finance_status text default 'pending',
  add column if not exists finance_received_at timestamptz,
  add column if not exists finance_note text,
  add column if not exists cod_collection_status text default 'pending',
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_collected_by text,
  add column if not exists cod_handed_over_at timestamptz,
  add column if not exists cod_handed_over_by text,
  add column if not exists settlement_batch_id text,
  add column if not exists invoice_no text,
  add column if not exists invoice_date date,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists payload jsonb default '{}'::jsonb;

alter table public.be_portal_pickup_requests
  add column if not exists finance_status text default 'pending',
  add column if not exists finance_verified_at timestamptz,
  add column if not exists finance_verified_by text,
  add column if not exists invoice_no text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists payload jsonb default '{}'::jsonb;

alter table public.be_app_notifications
  add column if not exists event_key text,
  add column if not exists notification_type text,
  add column if not exists category text,
  add column if not exists target_role text,
  add column if not exists target_user_id uuid,
  add column if not exists pickup_id text,
  add column if not exists source_table text,
  add column if not exists source_key text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists message text,
  add column if not exists status text default 'unread',
  add column if not exists is_read boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

-- Ensure finance defaults are aligned with waybill rows.
update public.be_portal_cargo_events
set
  finance_cod = coalesce(nullif(finance_cod, 0), coalesce(final_cod, cod_amount, 0)),
  finance_deli = coalesce(nullif(finance_deli, 0), coalesce(deli_fee_os, std_deli, 0)),
  finance_status = coalesce(nullif(finance_status, ''), 'pending'),
  cod_collection_status = coalesce(nullif(cod_collection_status, ''), 
    case
      when status in ('delivered', 'cod_collected') then 'collected'
      when status in ('cod_handed_over', 'settled') then 'handed_over'
      else 'pending'
    end
  ),
  updated_at = now()
where event_type = 'data_entry_waybill';

-- Unique notification event key for finance events.
with ranked as (
  select id, event_key,
         row_number() over (partition by event_key order by created_at desc nulls last, id) rn
  from public.be_app_notifications
  where event_key is not null
)
update public.be_app_notifications n
set event_key = n.event_key || ':dup:' || left(n.id::text, 8)
from ranked r
where n.id = r.id and r.rn > 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'be_app_notifications_event_key_unique'
  ) then
    alter table public.be_app_notifications
      add constraint be_app_notifications_event_key_unique unique(event_key);
  end if;
end $$;

create or replace function public.be_finance_report_rows(
  p_from date default null,
  p_to date default null,
  p_merchant_code text default null,
  p_status text default null,
  p_limit integer default 1000
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'pickup_id', e.pickup_id,
        'pickup_way_id', e.pickup_id,
        'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
        'tracking_no', coalesce(e.tracking_no, e.deliver_way_id),
        'pickup_date', e.pickup_date,
        'invoice_date', e.invoice_date,
        'invoice_no', e.invoice_no,
        'merchant_code', p.merchant_code,
        'merchant_name', coalesce(p.merchant_name, e.merchant),
        'recipient_name', e.receiver_name,
        'recipient_phone', e.receiver_phone,
        'recipient_town', coalesce(e.recipient_town, e.delivery_township),
        'delivery_address', e.delivery_address,
        'status', e.status,
        'cod_collection_status', coalesce(e.cod_collection_status, 'pending'),
        'finance_status', coalesce(e.finance_status, 'pending'),
        'item_price', coalesce(e.item_price, 0),
        'deli_fee_os', coalesce(e.deli_fee_os, 0),
        'cod_os', coalesce(e.cod_os, 0),
        'std_deli', coalesce(e.std_deli, 0),
        'max_deli', coalesce(e.max_deli, 0),
        'weight_kg', coalesce(e.weight_kg, 0),
        'surcharge', coalesce(e.surcharge, 0),
        'final_cod', coalesce(e.final_cod, e.cod_amount, 0),
        'finance_deli', coalesce(e.finance_deli, e.deli_fee_os, e.std_deli, 0),
        'finance_cod', coalesce(e.finance_cod, e.final_cod, e.cod_amount, 0),
        'finance_received_by', e.finance_received_by,
        'finance_received_at', e.finance_received_at,
        'settlement_batch_id', e.settlement_batch_id,
        'cod_collected_by', e.cod_collected_by,
        'cod_collected_at', e.cod_collected_at,
        'cod_handed_over_by', e.cod_handed_over_by,
        'cod_handed_over_at', e.cod_handed_over_at,
        'assigned_rider_name', p.assigned_rider_name,
        'assigned_driver_name', p.assigned_driver_name,
        'assigned_helper_name', p.assigned_helper_name,
        'assigned_vehicle_plate', p.assigned_vehicle_plate,
        'created_at', e.created_at,
        'updated_at', e.updated_at
      )
      order by e.created_at desc, e.line_no asc
    ),
    '[]'::jsonb
  )
  from public.be_portal_cargo_events e
  left join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.event_type = 'data_entry_waybill'
    and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
    and (p_from is null or coalesce(e.pickup_date, e.created_at::date) >= p_from)
    and (p_to is null or coalesce(e.pickup_date, e.created_at::date) <= p_to)
    and (coalesce(p_merchant_code, '') = '' or upper(coalesce(p.merchant_code, '')) = upper(p_merchant_code))
    and (
      coalesce(p_status, '') = ''
      or lower(coalesce(e.finance_status, 'pending')) = lower(p_status)
      or lower(coalesce(e.cod_collection_status, 'pending')) = lower(p_status)
      or lower(coalesce(e.status, '')) = lower(p_status)
    )
  limit greatest(coalesce(p_limit, 1000), 1);
$$;

create or replace function public.be_finance_dashboard_snapshot(
  p_from date default null,
  p_to date default null,
  p_merchant_code text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_from date := coalesce(p_from, now()::date - interval '30 days');
  v_to date := coalesce(p_to, now()::date);
  v_summary jsonb;
  v_by_merchant jsonb;
  v_by_status jsonb;
  v_recent jsonb;
begin
  with rows as (
    select
      e.*,
      p.merchant_code,
      coalesce(p.merchant_name, e.merchant) as merchant_name,
      coalesce(e.final_cod, e.cod_amount, 0) as amount_cod,
      coalesce(e.finance_cod, e.final_cod, e.cod_amount, 0) as amount_finance_cod,
      coalesce(e.finance_deli, e.deli_fee_os, e.std_deli, 0) as amount_finance_deli
    from public.be_portal_cargo_events e
    left join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
    where e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
      and coalesce(e.pickup_date, e.created_at::date) between v_from and v_to
      and (coalesce(p_merchant_code, '') = '' or upper(coalesce(p.merchant_code, '')) = upper(p_merchant_code))
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'total_waybills', count(*),
    'total_pickups', count(distinct pickup_id),
    'total_cod', coalesce(sum(amount_cod), 0),
    'total_finance_cod', coalesce(sum(amount_finance_cod), 0),
    'total_finance_deli', coalesce(sum(amount_finance_deli), 0),
    'total_receivable', coalesce(sum(amount_finance_cod + amount_finance_deli), 0),
    'pending_count', count(*) filter (where coalesce(finance_status, 'pending') = 'pending'),
    'received_count', count(*) filter (where coalesce(finance_status, 'pending') in ('received', 'settled')),
    'pending_amount', coalesce(sum(amount_finance_cod + amount_finance_deli) filter (where coalesce(finance_status, 'pending') = 'pending'), 0),
    'received_amount', coalesce(sum(amount_finance_cod + amount_finance_deli) filter (where coalesce(finance_status, 'pending') in ('received', 'settled')), 0)
  )
  into v_summary
  from rows;

  with rows as (
    select
      p.merchant_code,
      coalesce(p.merchant_name, e.merchant, p.merchant_code, '-') as merchant_name,
      coalesce(e.finance_cod, e.final_cod, e.cod_amount, 0) as finance_cod,
      coalesce(e.finance_deli, e.deli_fee_os, e.std_deli, 0) as finance_deli,
      e.finance_status
    from public.be_portal_cargo_events e
    left join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
    where e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
      and coalesce(e.pickup_date, e.created_at::date) between v_from and v_to
      and (coalesce(p_merchant_code, '') = '' or upper(coalesce(p.merchant_code, '')) = upper(p_merchant_code))
  ),
  grouped as (
    select merchant_code, merchant_name, count(*) cnt,
           sum(finance_cod) cod_total,
           sum(finance_deli) deli_total,
           sum(finance_cod + finance_deli) receivable_total,
           count(*) filter (where coalesce(finance_status, 'pending') = 'pending') pending_count
    from rows
    group by merchant_code, merchant_name
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by receivable_total desc), '[]'::jsonb)
  into v_by_merchant
  from grouped;

  with grouped as (
    select
      coalesce(e.finance_status, 'pending') as status,
      count(*) as count,
      coalesce(sum(coalesce(e.finance_cod, e.final_cod, e.cod_amount, 0) + coalesce(e.finance_deli, e.deli_fee_os, e.std_deli, 0)), 0) as amount
    from public.be_portal_cargo_events e
    left join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
    where e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
      and coalesce(e.pickup_date, e.created_at::date) between v_from and v_to
      and (coalesce(p_merchant_code, '') = '' or upper(coalesce(p.merchant_code, '')) = upper(p_merchant_code))
    group by coalesce(e.finance_status, 'pending')
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by amount desc), '[]'::jsonb)
  into v_by_status
  from grouped;

  v_recent := public.be_finance_report_rows(v_from, v_to, p_merchant_code, null, 50);

  return jsonb_build_object(
    'ok', true,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'by_merchant', coalesce(v_by_merchant, '[]'::jsonb),
    'by_status', coalesce(v_by_status, '[]'::jsonb),
    'recent_rows', coalesce(v_recent, '[]'::jsonb)
  );
end;
$$;

create or replace function public.be_finance_cod_settlement_queue(
  p_status text default 'pending',
  p_search text default '',
  p_limit integer default 200
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(row order by row->>'created_at' desc),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    public.be_finance_report_rows(null, null, null, null, greatest(coalesce(p_limit, 200), 1))
  ) row
  where (
      coalesce(p_status, '') = ''
      or lower(coalesce(row->>'finance_status', 'pending')) = lower(p_status)
      or lower(coalesce(row->>'cod_collection_status', 'pending')) = lower(p_status)
    )
    and (
      coalesce(p_search, '') = ''
      or row->>'pickup_id' ilike '%' || p_search || '%'
      or row->>'deliver_way_id' ilike '%' || p_search || '%'
      or row->>'merchant_name' ilike '%' || p_search || '%'
      or row->>'recipient_name' ilike '%' || p_search || '%'
      or row->>'recipient_phone' ilike '%' || p_search || '%'
    );
$$;

create or replace function public.be_finance_confirm_cod_receipt(
  p_deliver_way_id text,
  p_received_by text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row public.be_portal_cargo_events;
  v_pickup_id text;
  v_event_key text;
begin
  update public.be_portal_cargo_events e
  set
    finance_status = 'received',
    finance_received_by = coalesce(nullif(p_received_by, ''), auth.uid()::text, 'finance'),
    finance_received_at = now(),
    finance_note = nullif(p_note, ''),
    finance_cod = coalesce(e.finance_cod, e.final_cod, e.cod_amount, 0),
    finance_deli = coalesce(e.finance_deli, e.deli_fee_os, e.std_deli, 0),
    cod_collection_status = case
      when coalesce(e.cod_collection_status, 'pending') = 'pending' then 'finance_received'
      else e.cod_collection_status
    end,
    payload = coalesce(e.payload, '{}'::jsonb) || jsonb_build_object(
      'finance_receipt',
      jsonb_build_object(
        'received_by', coalesce(nullif(p_received_by, ''), auth.uid()::text, 'finance'),
        'received_at', now(),
        'note', p_note
      )
    ),
    updated_at = now()
  where e.event_type = 'data_entry_waybill'
    and (e.deliver_way_id = trim(p_deliver_way_id) or e.tracking_no = trim(p_deliver_way_id) or e.id::text = trim(p_deliver_way_id))
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Finance row not found for waybill %', p_deliver_way_id;
  end if;

  v_pickup_id := v_row.pickup_id;
  v_event_key := coalesce(v_row.deliver_way_id, v_row.tracking_no) || ':finance_received';

  insert into public.be_app_notifications (
    event_key, notification_type, category, target_role, pickup_id, source_table, source_key,
    title, body, message, status, is_read, payload, metadata, created_at
  )
  values (
    v_event_key,
    'finance_cod_received',
    'finance_cod_received',
    'finance',
    v_pickup_id,
    'be_portal_cargo_events',
    coalesce(v_row.deliver_way_id, v_row.tracking_no),
    'COD Finance Receipt Confirmed',
    'Finance confirmed COD receipt for ' || coalesce(v_row.deliver_way_id, v_row.tracking_no) || '.',
    'Finance confirmed COD receipt for ' || coalesce(v_row.deliver_way_id, v_row.tracking_no) || '.',
    'unread',
    false,
    jsonb_build_object(
      'pickup_id', v_pickup_id,
      'deliver_way_id', coalesce(v_row.deliver_way_id, v_row.tracking_no),
      'event', 'finance_cod_received'
    ),
    '{}'::jsonb,
    now()
  )
  on conflict(event_key)
  do update set
    body = excluded.body,
    message = excluded.message,
    status = 'unread',
    is_read = false,
    payload = excluded.payload,
    created_at = now();

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$$;

create or replace function public.be_finance_generate_invoice_for_pickup(
  p_pickup_id text,
  p_invoice_no text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_invoice_no text;
  v_rows integer;
  v_total_cod numeric;
  v_total_deli numeric;
begin
  v_invoice_no := coalesce(nullif(p_invoice_no, ''), 'INV-' || p_pickup_id);

  update public.be_portal_cargo_events
  set
    invoice_no = v_invoice_no,
    invoice_date = current_date,
    finance_cod = coalesce(finance_cod, final_cod, cod_amount, 0),
    finance_deli = coalesce(finance_deli, deli_fee_os, std_deli, 0),
    updated_at = now()
  where pickup_id = p_pickup_id
    and event_type = 'data_entry_waybill';

  get diagnostics v_rows = row_count;

  select
    coalesce(sum(coalesce(finance_cod, final_cod, cod_amount, 0)), 0),
    coalesce(sum(coalesce(finance_deli, deli_fee_os, std_deli, 0)), 0)
  into v_total_cod, v_total_deli
  from public.be_portal_cargo_events
  where pickup_id = p_pickup_id
    and event_type = 'data_entry_waybill';

  update public.be_portal_pickup_requests
  set
    invoice_no = v_invoice_no,
    finance_status = 'invoiced',
    finance_verified_at = now(),
    updated_at = now()
  where pickup_id = p_pickup_id;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'invoice_no', v_invoice_no,
    'rows', v_rows,
    'total_cod', v_total_cod,
    'total_deli', v_total_deli,
    'total_invoice', v_total_cod + v_total_deli
  );
end;
$$;

grant execute on function public.be_finance_report_rows(date, date, text, text, integer) to authenticated;
grant execute on function public.be_finance_dashboard_snapshot(date, date, text) to authenticated;
grant execute on function public.be_finance_cod_settlement_queue(text, text, integer) to authenticated;
grant execute on function public.be_finance_confirm_cod_receipt(text, text, text) to authenticated;
grant execute on function public.be_finance_generate_invoice_for_pickup(text, text) to authenticated;

notify pgrst, 'reload schema';
