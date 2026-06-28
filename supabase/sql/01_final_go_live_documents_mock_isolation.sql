
-- Britium Final Go-Live Document/Finance/Print/QR + Mock Isolation Patch
-- Source of truth:
--   be_portal_pickup_requests
--   be_portal_cargo_events
--   be_mobile_workforce_accounts
--   be_app_notifications
-- Master data and tariff tables are preserved.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Safe operational columns
-- ---------------------------------------------------------------------------
alter table public.be_portal_pickup_requests
  add column if not exists pickup_way_id text,
  add column if not exists canonical_pickup_id text,
  add column if not exists merchant_abbr text,
  add column if not exists pickup_date date,
  add column if not exists delivery_prefix text,
  add column if not exists delivery_date_prefix text,
  add column if not exists delivery_start_no integer,
  add column if not exists delivery_end_no integer,
  add column if not exists invoice_no text,
  add column if not exists invoice_status text default 'not_generated',
  add column if not exists invoice_generated_at timestamptz,
  add column if not exists invoice_payload jsonb default '{}'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.be_portal_cargo_events
  add column if not exists deliver_way_id text,
  add column if not exists tracking_no text,
  add column if not exists line_no integer,
  add column if not exists pickup_date date,
  add column if not exists merchant text,
  add column if not exists event_type text default 'data_entry_waybill',
  add column if not exists event_title text default 'Data Entry Waybill',
  add column if not exists event_description text default 'Delivery waybill row',
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists recipient_town text,
  add column if not exists delivery_township text,
  add column if not exists delivery_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists deli_fee_os numeric default 0,
  add column if not exists cod_os numeric default 0,
  add column if not exists std_deli numeric default 0,
  add column if not exists max_deli numeric default 0,
  add column if not exists weight_kg numeric default 1,
  add column if not exists surcharge numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists destination text,
  add column if not exists field_pickup_checked boolean default false,
  add column if not exists field_pickup_checked_at timestamptz,
  add column if not exists field_pickup_checked_by text,
  add column if not exists field_pickup_photo_url text,
  add column if not exists field_pickup_weight_kg numeric,
  add column if not exists pickup_verification_status text default 'pending',
  add column if not exists pickup_verification_note text,
  add column if not exists data_entry_registration_checked boolean default false,
  add column if not exists data_entry_registration_checked_at timestamptz,
  add column if not exists data_entry_registration_checked_by uuid,
  add column if not exists waybill_printed_at timestamptz,
  add column if not exists waybill_print_count integer default 0,
  add column if not exists invoice_no text,
  add column if not exists invoice_status text default 'not_invoiced',
  add column if not exists invoice_generated_at timestamptz,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists finance_received_by text,
  add column if not exists finance_received_at timestamptz,
  add column if not exists finance_status text default 'pending',
  add column if not exists qr_payload jsonb default '{}'::jsonb,
  add column if not exists source_key text,
  add column if not exists source_table text default 'be_portal_cargo_events',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.be_app_notifications
  add column if not exists event_key text,
  add column if not exists notification_type text,
  add column if not exists category text,
  add column if not exists target_role text,
  add column if not exists target_user_id uuid,
  add column if not exists target_branch_code text,
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
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz default now();

-- Event-key idempotency for all document/print/invoice notifications.
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
      add constraint be_app_notifications_event_key_unique unique (event_key);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.be_go_live_pickup_options(
  p_limit integer default 100
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'value', p.pickup_id,
        'label', p.pickup_id || ' — ' || coalesce(p.merchant_name, p.merchant_code, p.sender_name, '-') || ' — Count: ' || coalesce(p.parcel_count, 1)::text,
        'pickup_id', p.pickup_id,
        'pickup_way_id', coalesce(p.pickup_way_id, p.pickup_id),
        'merchant_code', p.merchant_code,
        'merchant_name', p.merchant_name,
        'parcel_count', p.parcel_count,
        'status', p.status,
        'assignment_status', p.assignment_status,
        'created_at', p.created_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.be_portal_pickup_requests
    where pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
      and coalesce(status, '') not in ('archived_test_data', 'cancelled')
    order by created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) p;
$$;

grant execute on function public.be_go_live_pickup_options(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Waybill printing
-- ---------------------------------------------------------------------------
create or replace function public.be_waybill_print_rows(
  p_pickup_id text,
  p_limit integer default 500
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'pickup_id', p.pickup_id,
        'pickup_way_id', p.pickup_id,
        'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
        'tracking_no', coalesce(e.tracking_no, e.deliver_way_id),
        'line_no', e.line_no,
        'merchant_code', p.merchant_code,
        'merchant_name', p.merchant_name,
        'sender_name', p.sender_name,
        'sender_phone', p.sender_phone,
        'pickup_address', p.pickup_address,
        'pickup_township', p.township,
        'pickup_city', p.city,
        'recipient_name', e.receiver_name,
        'recipient_phone', e.receiver_phone,
        'recipient_town', coalesce(e.recipient_town, e.delivery_township),
        'delivery_address', e.delivery_address,
        'destination', e.destination,
        'item_price', coalesce(e.item_price, 0),
        'deli_fee_os', coalesce(e.deli_fee_os, 0),
        'cod_os', coalesce(e.cod_os, 0),
        'surcharge', coalesce(e.surcharge, 0),
        'final_cod', coalesce(e.final_cod, e.cod_amount, 0),
        'weight_kg', coalesce(e.field_pickup_weight_kg, e.weight_kg, 1),
        'status', e.status,
        'field_pickup_checked', coalesce(e.field_pickup_checked, false),
        'data_entry_registration_checked', coalesce(e.data_entry_registration_checked, false),
        'waybill_printed_at', e.waybill_printed_at,
        'waybill_print_count', coalesce(e.waybill_print_count, 0),
        'qr_payload', coalesce(nullif(e.qr_payload, '{}'::jsonb), jsonb_build_object(
          'type', 'delivery_waybill',
          'pickup_id', p.pickup_id,
          'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
          'merchant_code', p.merchant_code,
          'merchant_name', p.merchant_name
        ))
      )
      order by e.line_no, coalesce(e.deliver_way_id, e.tracking_no)
    ),
    '[]'::jsonb
  )
  from public.be_portal_cargo_events e
  join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.pickup_id = p_pickup_id
    and e.event_type = 'data_entry_waybill'
    and coalesce(e.status, '') not in ('archived_test_data', 'cancelled')
  limit greatest(coalesce(p_limit, 500), 1);
$$;

grant execute on function public.be_waybill_print_rows(text, integer) to authenticated;

create or replace function public.be_waybill_mark_printed(
  p_pickup_id text,
  p_deliver_way_ids text[] default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
begin
  update public.be_portal_cargo_events e
  set
    waybill_printed_at = now(),
    waybill_print_count = coalesce(e.waybill_print_count, 0) + 1,
    qr_payload = coalesce(nullif(e.qr_payload, '{}'::jsonb), jsonb_build_object(
      'type', 'delivery_waybill',
      'pickup_id', e.pickup_id,
      'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no)
    )),
    updated_at = now()
  where e.pickup_id = p_pickup_id
    and e.event_type = 'data_entry_waybill'
    and (p_deliver_way_ids is null or coalesce(e.deliver_way_id, e.tracking_no) = any(p_deliver_way_ids));

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'pickup_id', p_pickup_id, 'printed_rows', v_count);
end;
$$;

grant execute on function public.be_waybill_mark_printed(text, text[]) to authenticated;

-- Compatibility with older wayplan/print pages.
create or replace function public.be_wayplan_manifest_rows(
  p_pickup_id text,
  p_route_code text default null
)
returns jsonb
language sql
security definer
as $$
  select public.be_waybill_print_rows(p_pickup_id, 500);
$$;

grant execute on function public.be_wayplan_manifest_rows(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) QR payloads
-- ---------------------------------------------------------------------------
create or replace function public.be_waybill_qr_payloads(
  p_pickup_id text
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'pickup_id', p.pickup_id,
        'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
        'label', coalesce(e.deliver_way_id, e.tracking_no),
        'payload', jsonb_build_object(
          'type', 'britium_delivery_waybill',
          'pickup_id', p.pickup_id,
          'pickup_way_id', p.pickup_id,
          'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
          'merchant_code', p.merchant_code,
          'merchant_name', p.merchant_name,
          'recipient_phone', e.receiver_phone,
          'recipient_town', coalesce(e.recipient_town, e.delivery_township),
          'cod_amount', coalesce(e.final_cod, e.cod_amount, 0)
        )::text
      )
      order by e.line_no
    ),
    '[]'::jsonb
  )
  from public.be_portal_cargo_events e
  join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.pickup_id = p_pickup_id
    and e.event_type = 'data_entry_waybill'
    and coalesce(e.status, '') not in ('archived_test_data', 'cancelled');
$$;

grant execute on function public.be_waybill_qr_payloads(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Invoice issuing and reporting
-- ---------------------------------------------------------------------------
create or replace function public.be_invoice_generate_for_pickup(
  p_pickup_id text,
  p_invoice_no text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_invoice_no text;
  v_pickup public.be_portal_pickup_requests;
  v_totals jsonb;
  v_count integer;
begin
  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id;

  if v_pickup.pickup_id is null then
    raise exception 'Pickup % not found', p_pickup_id;
  end if;

  v_invoice_no := coalesce(nullif(p_invoice_no, ''), 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || replace(p_pickup_id, '-', ''));

  select jsonb_build_object(
    'parcel_count', count(*),
    'delivery_fee_total', coalesce(sum(coalesce(e.deli_fee_os, e.std_deli, 0)), 0),
    'cod_total', coalesce(sum(coalesce(e.final_cod, e.cod_amount, 0)), 0),
    'surcharge_total', coalesce(sum(coalesce(e.surcharge, 0)), 0),
    'weight_total', coalesce(sum(coalesce(e.field_pickup_weight_kg, e.weight_kg, 0)), 0)
  )
  into v_totals
  from public.be_portal_cargo_events e
  where e.pickup_id = p_pickup_id
    and e.event_type = 'data_entry_waybill'
    and coalesce(e.status, '') not in ('archived_test_data', 'cancelled');

  update public.be_portal_cargo_events
  set
    invoice_no = v_invoice_no,
    invoice_status = 'generated',
    invoice_generated_at = now(),
    finance_status = coalesce(nullif(finance_status, ''), 'pending'),
    updated_at = now()
  where pickup_id = p_pickup_id
    and event_type = 'data_entry_waybill'
    and coalesce(status, '') not in ('archived_test_data', 'cancelled');

  get diagnostics v_count = row_count;

  update public.be_portal_pickup_requests
  set
    invoice_no = v_invoice_no,
    invoice_status = 'generated',
    invoice_generated_at = now(),
    invoice_payload = jsonb_build_object(
      'invoice_no', v_invoice_no,
      'pickup_id', p_pickup_id,
      'merchant_code', merchant_code,
      'merchant_name', merchant_name,
      'totals', v_totals,
      'generated_at', now()
    ),
    updated_at = now()
  where pickup_id = p_pickup_id;

  insert into public.be_app_notifications (
    event_key,
    notification_type,
    category,
    target_role,
    pickup_id,
    source_table,
    source_key,
    title,
    body,
    message,
    status,
    is_read,
    payload,
    metadata,
    created_at
  )
  values (
    p_pickup_id || ':invoice_generated:' || v_invoice_no,
    'invoice_generated',
    'finance',
    'finance',
    p_pickup_id,
    'be_portal_pickup_requests',
    v_invoice_no,
    'Invoice Generated',
    'Invoice ' || v_invoice_no || ' generated for pickup ' || p_pickup_id || '.',
    'Invoice ' || v_invoice_no || ' generated for pickup ' || p_pickup_id || '.',
    'unread',
    false,
    jsonb_build_object('pickup_id', p_pickup_id, 'invoice_no', v_invoice_no, 'event', 'invoice_generated'),
    '{}'::jsonb,
    now()
  )
  on conflict (event_key)
  do update set
    body = excluded.body,
    message = excluded.message,
    status = 'unread',
    is_read = false,
    payload = excluded.payload,
    created_at = now();

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'invoice_no', v_invoice_no,
    'row_count', v_count,
    'totals', v_totals
  );
end;
$$;

grant execute on function public.be_invoice_generate_for_pickup(text, text) to authenticated;

create or replace function public.be_invoice_print_rows(
  p_pickup_id text
)
returns jsonb
language sql
security definer
as $$
  with pickup as (
    select *
    from public.be_portal_pickup_requests
    where pickup_id = p_pickup_id
  ),
  rows as (
    select e.*
    from public.be_portal_cargo_events e
    where e.pickup_id = p_pickup_id
      and e.event_type = 'data_entry_waybill'
      and coalesce(e.status, '') not in ('archived_test_data', 'cancelled')
  )
  select jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object(
      'name', 'Britium Express Delivery Service',
      'phone', '+95-9-897 44 77 44',
      'email', 'info@britiumexpress.com',
      'address', 'No.277, Corner of Anawrahta Road & Bo Moe Gyo Street, East Dagon Township, Yangon'
    ),
    'pickup', (select to_jsonb(p) from pickup p),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'pickup_id', r.pickup_id,
          'deliver_way_id', coalesce(r.deliver_way_id, r.tracking_no),
          'recipient_name', r.receiver_name,
          'recipient_phone', r.receiver_phone,
          'recipient_town', coalesce(r.recipient_town, r.delivery_township),
          'delivery_address', r.delivery_address,
          'item_price', coalesce(r.item_price, 0),
          'deli_fee_os', coalesce(r.deli_fee_os, 0),
          'cod_os', coalesce(r.cod_os, 0),
          'surcharge', coalesce(r.surcharge, 0),
          'final_cod', coalesce(r.final_cod, r.cod_amount, 0),
          'finance_status', r.finance_status,
          'invoice_no', r.invoice_no
        )
        order by r.line_no
      )
      from rows r
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'parcel_count', (select count(*) from rows),
      'delivery_fee_total', (select coalesce(sum(coalesce(deli_fee_os, std_deli, 0)), 0) from rows),
      'cod_total', (select coalesce(sum(coalesce(final_cod, cod_amount, 0)), 0) from rows),
      'surcharge_total', (select coalesce(sum(coalesce(surcharge, 0)), 0) from rows)
    )
  );
$$;

grant execute on function public.be_invoice_print_rows(text) to authenticated;

-- Compatibility alias for finance patch.
create or replace function public.be_finance_generate_invoice_for_pickup(
  p_pickup_id text,
  p_invoice_no text default null
)
returns jsonb
language sql
security definer
as $$
  select public.be_invoice_generate_for_pickup(p_pickup_id, p_invoice_no);
$$;

grant execute on function public.be_finance_generate_invoice_for_pickup(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Master data backend page helpers. No localStorage mock data.
-- ---------------------------------------------------------------------------
alter table public.merchant_master
  add column if not exists merchant_code text,
  add column if not exists merchant_id text,
  add column if not exists merchant_name text,
  add column if not exists business_type text,
  add column if not exists contact_person text,
  add column if not exists phone_primary text,
  add column if not exists phone_secondary text,
  add column if not exists email text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists township text,
  add column if not exists city text,
  add column if not exists region_state text,
  add column if not exists default_pickup_address text,
  add column if not exists default_pickup_time_window text,
  add column if not exists payment_terms text,
  add column if not exists contract_status text,
  add column if not exists is_active boolean default true,
  add column if not exists standard_allowance_kg numeric default 3,
  add column if not exists special_allowance_kg numeric default 5,
  add column if not exists extra_per_kg_mmk numeric default 500,
  add column if not exists updated_at timestamptz default now();

alter table public.be_mobile_workforce_accounts
  add column if not exists workforce_code text,
  add column if not exists workforce_type text,
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists status text default 'active',
  add column if not exists assigned_branch text,
  add column if not exists assigned_zone text,
  add column if not exists updated_at timestamptz default now();

create or replace function public.be_master_data_control_catalog()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'merchant_master', 'label', 'Merchant Master', 'source', 'merchant_master'),
    jsonb_build_object('id', 'rider_master', 'label', 'Rider Master', 'source', 'be_mobile_workforce_accounts'),
    jsonb_build_object('id', 'driver_master', 'label', 'Driver Master', 'source', 'be_mobile_workforce_accounts'),
    jsonb_build_object('id', 'helper_master', 'label', 'Helper Master', 'source', 'be_mobile_workforce_accounts'),
    jsonb_build_object('id', 'tariff_master', 'label', 'Tariff Master', 'source', 'tariff/master_data_records'),
    jsonb_build_object('id', 'township_master', 'label', 'Township / Zone Master', 'source', 'township/master_data_records')
  );
$$;

grant execute on function public.be_master_data_control_catalog() to authenticated;

create or replace function public.be_master_data_control_rows(
  p_master_type text,
  p_search text default '',
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_type text := lower(coalesce(p_master_type, 'merchant_master'));
  v_search text := lower(coalesce(p_search, ''));
  v_result jsonb := '[]'::jsonb;
begin
  if v_type = 'merchant_master' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', coalesce(m.merchant_id, m.merchant_code, m.merchant_name),
        'master_type', 'merchant_master',
        'record_key', coalesce(m.merchant_code, m.merchant_id),
        'display_name', m.merchant_name,
        'status', case when coalesce(m.is_active, true) then 'ACTIVE' else 'SUSPENDED' end,
        'validation_status', case when coalesce(m.merchant_code, m.merchant_id) is not null and m.merchant_name is not null then 'VALID' else 'PENDING' end,
        'payload', to_jsonb(m),
        'updated_at', m.updated_at
      )
      order by m.merchant_name
    ), '[]'::jsonb)
    into v_result
    from public.merchant_master m
    where v_search = ''
       or lower(coalesce(m.merchant_code, m.merchant_id, '')) like '%' || v_search || '%'
       or lower(coalesce(m.merchant_name, '')) like '%' || v_search || '%'
       or lower(coalesce(m.township, '')) like '%' || v_search || '%';
    return v_result;
  end if;

  if v_type in ('rider_master', 'driver_master', 'helper_master') then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'master_type', v_type,
        'record_key', a.workforce_code,
        'display_name', a.display_name,
        'status', upper(coalesce(a.status, 'active')),
        'validation_status', case when a.workforce_code is not null and a.display_name is not null then 'VALID' else 'PENDING' end,
        'payload', to_jsonb(a),
        'updated_at', a.updated_at
      )
      order by a.workforce_code
    ), '[]'::jsonb)
    into v_result
    from public.be_mobile_workforce_accounts a
    where lower(coalesce(a.workforce_type, '')) = replace(v_type, '_master', '')
      and (
        v_search = ''
        or lower(coalesce(a.workforce_code, '')) like '%' || v_search || '%'
        or lower(coalesce(a.display_name, '')) like '%' || v_search || '%'
        or lower(coalesce(a.email, '')) like '%' || v_search || '%'
      );
    return v_result;
  end if;

  if v_type = 'tariff_master' then
    if to_regclass('public.tariff_master') is not null then
      execute $q$
        with rows as (
          select to_jsonb(t) j from public.tariff_master t
        )
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', coalesce(j->>'id', j->>'tariff_code', j->>'record_key', j->>'township', gen_random_uuid()::text),
            'master_type', 'tariff_master',
            'record_key', coalesce(j->>'tariff_code', j->>'record_key', j->>'township', j->>'destination'),
            'display_name', coalesce(j->>'display_name', j->>'township', j->>'destination', j->>'tariff_name'),
            'status', coalesce(j->>'status', 'ACTIVE'),
            'validation_status', 'VALID',
            'payload', j,
            'updated_at', coalesce(j->>'updated_at', '')
          )
        ), '[]'::jsonb)
        from rows
        where $1 = ''
           or lower(j::text) like '%' || $1 || '%'
      $q$ into v_result using v_search;
      return v_result;
    end if;

    if to_regclass('public.master_data_records') is not null then
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'master_type', 'tariff_master',
          'record_key', record_key,
          'display_name', display_name,
          'status', case when coalesce(is_active, true) then 'ACTIVE' else 'SUSPENDED' end,
          'validation_status', 'VALID',
          'payload', payload,
          'updated_at', updated_at
        )
      ), '[]'::jsonb)
      into v_result
      from public.master_data_records
      where lower(category) in ('tariff', 'delivery_tariff', 'current_app_tariffs')
        and (v_search = '' or lower(coalesce(record_key, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(payload::text, '')) like '%' || v_search || '%');
      return v_result;
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

grant execute on function public.be_master_data_control_rows(text, text, integer) to authenticated;

create or replace function public.be_master_data_control_upsert(
  p_master_type text,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_type text := lower(coalesce(p_master_type, ''));
  v_code text;
  v_name text;
  v_row jsonb;
begin
  if v_type = 'merchant_master' then
    v_code := upper(coalesce(p_record->>'merchant_code', p_record->>'merchant_id', p_record->>'record_key'));
    v_name := coalesce(p_record->>'merchant_name', p_record->>'display_name', v_code);

    if v_code is null or v_code = '' or v_name is null or v_name = '' then
      raise exception 'merchant_code and merchant_name are required';
    end if;

    insert into public.merchant_master (
      merchant_code, merchant_id, merchant_name, business_type, contact_person,
      phone_primary, phone_secondary, email, address_line_1, address_line_2,
      township, city, region_state, default_pickup_address, default_pickup_time_window,
      payment_terms, contract_status, is_active, standard_allowance_kg, special_allowance_kg,
      extra_per_kg_mmk, updated_at
    )
    values (
      v_code, v_code, v_name, p_record->>'business_type', p_record->>'contact_person',
      p_record->>'phone_primary', p_record->>'phone_secondary', p_record->>'email',
      p_record->>'address_line_1', p_record->>'address_line_2', p_record->>'township',
      p_record->>'city', p_record->>'region_state',
      coalesce(nullif(p_record->>'default_pickup_address', ''), p_record->>'address_line_1'),
      p_record->>'default_pickup_time_window',
      coalesce(nullif(p_record->>'payment_terms', ''), 'COD'),
      lower(coalesce(nullif(p_record->>'contract_status', ''), 'active')),
      coalesce((p_record->>'is_active')::boolean, true),
      coalesce(nullif(p_record->>'standard_allowance_kg', '')::numeric, 3),
      coalesce(nullif(p_record->>'special_allowance_kg', '')::numeric, 5),
      coalesce(nullif(p_record->>'extra_per_kg_mmk', '')::numeric, 500),
      now()
    )
    on conflict (merchant_id)
    do update set
      merchant_code = excluded.merchant_code,
      merchant_name = excluded.merchant_name,
      business_type = excluded.business_type,
      contact_person = excluded.contact_person,
      phone_primary = excluded.phone_primary,
      phone_secondary = excluded.phone_secondary,
      email = excluded.email,
      address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2,
      township = excluded.township,
      city = excluded.city,
      region_state = excluded.region_state,
      default_pickup_address = excluded.default_pickup_address,
      default_pickup_time_window = excluded.default_pickup_time_window,
      payment_terms = excluded.payment_terms,
      contract_status = excluded.contract_status,
      is_active = excluded.is_active,
      standard_allowance_kg = excluded.standard_allowance_kg,
      special_allowance_kg = excluded.special_allowance_kg,
      extra_per_kg_mmk = excluded.extra_per_kg_mmk,
      updated_at = now()
    returning to_jsonb(merchant_master.*) into v_row;

    return jsonb_build_object('ok', true, 'row', v_row);
  end if;

  if v_type in ('rider_master', 'driver_master', 'helper_master') then
    v_code := lower(coalesce(p_record->>'workforce_code', p_record->>'record_key'));
    v_name := coalesce(p_record->>'display_name', p_record->>'workforce_name', v_code);

    if v_code is null or v_code = '' then
      raise exception 'workforce_code is required';
    end if;

    insert into public.be_mobile_workforce_accounts (
      workforce_code, workforce_type, display_name, email, phone, status,
      assigned_branch, assigned_zone, payload, updated_at
    )
    values (
      v_code,
      replace(v_type, '_master', ''),
      v_name,
      p_record->>'email',
      coalesce(p_record->>'phone', p_record->>'phone_primary'),
      lower(coalesce(p_record->>'status', 'active')),
      p_record->>'assigned_branch',
      p_record->>'assigned_zone',
      coalesce(p_record, '{}'::jsonb),
      now()
    )
    on conflict (workforce_code)
    do update set
      display_name = excluded.display_name,
      email = excluded.email,
      phone = excluded.phone,
      status = excluded.status,
      assigned_branch = excluded.assigned_branch,
      assigned_zone = excluded.assigned_zone,
      payload = excluded.payload,
      updated_at = now()
    returning to_jsonb(be_mobile_workforce_accounts.*) into v_row;

    return jsonb_build_object('ok', true, 'row', v_row);
  end if;

  raise exception 'Unsupported master type %', p_master_type;
end;
$$;

grant execute on function public.be_master_data_control_upsert(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Mock/sample/test-data isolation for operational tables only.
-- ---------------------------------------------------------------------------
create or replace function public.be_go_live_isolation_report()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'ok', true,
    'active_invalid_pickup_ids', coalesce((
      select jsonb_agg(jsonb_build_object('pickup_id', pickup_id, 'status', status, 'assignment_status', assignment_status, 'merchant_code', merchant_code, 'created_at', created_at))
      from public.be_portal_pickup_requests
      where coalesce(status, '') <> 'archived_test_data'
        and (
          pickup_id is null
          or pickup_id !~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
          or lower(coalesce(merchant_code, merchant_name, sender_name, '')) ~ '(mock|demo|sample|test)'
        )
    ), '[]'::jsonb),
    'active_invalid_waybills', coalesce((
      select jsonb_agg(jsonb_build_object('pickup_id', pickup_id, 'deliver_way_id', coalesce(deliver_way_id, tracking_no), 'status', status, 'created_at', created_at))
      from public.be_portal_cargo_events
      where coalesce(status, '') <> 'archived_test_data'
        and event_type = 'data_entry_waybill'
        and (
          coalesce(deliver_way_id, tracking_no, '') !~ '^D[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
          or lower(coalesce(receiver_name, delivery_address, payload::text, '')) ~ '(mock|demo|sample|test)'
        )
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.be_go_live_isolation_report() to authenticated;

create or replace function public.be_go_live_archive_mock_operational_data()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickups integer := 0;
  v_waybills integer := 0;
begin
  update public.be_portal_pickup_requests
  set
    status = 'archived_test_data',
    assignment_status = 'archived_test_data',
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'archived_reason', 'go_live_mock_sample_test_isolation',
      'archived_at', now()
    ),
    updated_at = now()
  where coalesce(status, '') <> 'archived_test_data'
    and (
      pickup_id is null
      or pickup_id !~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
      or lower(coalesce(merchant_code, merchant_name, sender_name, payload::text, '')) ~ '(mock|demo|sample|test|pending)'
    );

  get diagnostics v_pickups = row_count;

  update public.be_portal_cargo_events
  set
    status = 'archived_test_data',
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'archived_reason', 'go_live_mock_sample_test_isolation',
      'archived_at', now()
    ),
    updated_at = now()
  where coalesce(status, '') <> 'archived_test_data'
    and event_type = 'data_entry_waybill'
    and (
      pickup_id is null
      or coalesce(deliver_way_id, tracking_no, '') !~ '^D[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
      or lower(coalesce(receiver_name, delivery_address, payload::text, '')) ~ '(mock|demo|sample|test|pending)'
    );

  get diagnostics v_waybills = row_count;

  return jsonb_build_object('ok', true, 'archived_pickups', v_pickups, 'archived_waybills', v_waybills);
end;
$$;

grant execute on function public.be_go_live_archive_mock_operational_data() to authenticated;

notify pgrst, 'reload schema';
