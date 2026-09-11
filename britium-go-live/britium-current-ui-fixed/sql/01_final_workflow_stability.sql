
-- Final CS -> Data Entry -> Supervisor -> Rider stability patch
-- Source of truth:
--   be_portal_pickup_requests
--   be_portal_cargo_events
--   be_mobile_workforce_accounts
--   be_app_notifications
-- Operational ID format:
--   Pickup Way ID   = P0518-MEL-010
--   Delivery Way ID = D0518-MEL-001

create extension if not exists pgcrypto;

-- =========================================================
-- 0) Drop RPCs that may have incompatible signatures/returns
-- =========================================================
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'be_known_merchant_code',
        'be_resolve_merchant_meta',
        'be_customer_service_merchant_options',
        'be_next_go_live_pickup_batch',
        'be_submit_portal_pickup_request',
        'be_create_pickup_request_and_notify',
        'be_customer_service_recent_pickup_requests',
        'be_pickup_request_options',
        'be_pickup_request_dropdown_options',
        'be_pending_pickup_assignment_list',
        'be_supervisor_pickup_assignment_queue',
        'be_data_entry_prepare_pickup_template',
        'be_data_entry_fetch_parcels',
        'be_data_entry_save_parcel',
        'be_data_entry_submit_pickup_parcels',
        'be_data_entry_toggle_registration_check',
        'be_mobile_workforce_options',
        'be_upsert_field_assignment_notification',
        'be_assign_pickup_field_team',
        'be_mobile_go_live_resolve_workforce',
        'be_mobile_go_live_snapshot'
      )
  loop
    execute format('drop function if exists %I.%I(%s)', r.schema_name, r.function_name, r.args);
  end loop;
end $$;

-- =========================================================
-- 1) Tables / columns
-- =========================================================
create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  created_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists canonical_pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_date date,
  add column if not exists merchant_abbr text,
  add column if not exists delivery_start_no integer,
  add column if not exists delivery_end_no integer,
  add column if not exists delivery_date_prefix text,
  add column if not exists delivery_prefix text,

  add column if not exists source text default 'customer_service',
  add column if not exists requester_type text default 'Merchant',
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists township text,
  add column if not exists city text,
  add column if not exists pickup_address text,
  add column if not exists payment_terms text default 'COD',
  add column if not exists tariff_code text,
  add column if not exists assigned_branch text default 'YGN',
  add column if not exists pickup_time timestamptz,
  add column if not exists parcel_count integer default 1,
  add column if not exists cod_amount numeric default 0,
  add column if not exists priority text default 'normal',
  add column if not exists special_instructions text,
  add column if not exists status text default 'pending_assignment',
  add column if not exists assignment_status text default 'pending_assignment',

  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists assigned_workforce_type text,
  add column if not exists assigned_workforce_code text,
  add column if not exists assigned_workforce_name text,
  add column if not exists supervisor_note text,
  add column if not exists assigned_at timestamptz,

  add column if not exists field_verified_at timestamptz,
  add column if not exists field_verified_by text,
  add column if not exists pickup_verified_signature_url text,
  add column if not exists pickup_verified_total_weight numeric default 0,
  add column if not exists field_verification_payload jsonb default '{}'::jsonb,

  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  event_type text,
  created_at timestamptz default now()
);

alter table public.be_portal_cargo_events
  add column if not exists tracking_no text,
  add column if not exists deliver_way_id text,
  add column if not exists line_no integer,
  add column if not exists event_title text default 'Cargo event',
  add column if not exists event_description text default 'Cargo event',
  add column if not exists status text default 'draft',
  add column if not exists source_key text,
  add column if not exists source_table text default 'be_portal_cargo_events',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists pickup_date date,
  add column if not exists merchant text,

  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_township text,
  add column if not exists pickup_city text,

  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists recipient_town text,
  add column if not exists delivery_township text,
  add column if not exists delivery_city text,
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

  add column if not exists pickup_by_1 text,
  add column if not exists pickup_by_2 text,
  add column if not exists general_remarks text,
  add column if not exists driver_rider text,
  add column if not exists helper text,
  add column if not exists plate_no text,
  add column if not exists delivery_remarks text,
  add column if not exists column_37 text,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists finance_received_by text,
  add column if not exists finance_status text,

  add column if not exists package_type text default 'parcel',
  add column if not exists service_type text default 'standard',
  add column if not exists item_description text,
  add column if not exists remarks text,
  add column if not exists photo_url text,

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

  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,

  add column if not exists updated_at timestamptz default now();

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text,
  created_at timestamptz default now()
);

alter table public.be_app_notifications
  add column if not exists notification_type text default 'general',
  add column if not exists category text default 'general',
  add column if not exists target_role text default 'general',
  add column if not exists target_branch_code text,
  add column if not exists target_user_id uuid,
  add column if not exists pickup_id text,
  add column if not exists source_table text default 'be_app_notifications',
  add column if not exists source_key text,
  add column if not exists title text default 'Notification',
  add column if not exists body text default 'Notification',
  add column if not exists message text default 'Notification',
  add column if not exists status text default 'unread',
  add column if not exists is_read boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists read_at timestamptz;

-- =========================================================
-- 2) Constraints / normalizers
-- =========================================================
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'be_portal_pickup_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%pickup_id%'
  loop
    execute format('alter table public.be_portal_pickup_requests drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.be_portal_pickup_requests
add constraint be_portal_pickup_requests_pickup_id_format_check
check (
  pickup_id is null
  or pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
  or pickup_id ~ '^LEGACY-DUP-[0-9A-Fa-f]{8}$'
);

with ranked as (
  select p.id, p.pickup_id,
         row_number() over (partition by p.pickup_id order by p.created_at nulls last, p.id) rn
  from public.be_portal_pickup_requests p
  where p.pickup_id is not null
)
update public.be_portal_pickup_requests p
set
  canonical_pickup_id = coalesce(p.canonical_pickup_id, p.pickup_id),
  pickup_way_id = coalesce(p.pickup_way_id, p.pickup_id),
  pickup_id = 'LEGACY-DUP-' || left(p.id::text, 8),
  status = 'archived_test_data',
  assignment_status = 'archived_test_data',
  payload = coalesce(p.payload, '{}'::jsonb) || jsonb_build_object(
    'previous_duplicate_pickup_id', p.pickup_id,
    'repair_reason', 'dedupe_before_unique_constraint'
  ),
  updated_at = now()
from ranked r
where p.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'be_portal_pickup_requests_pickup_id_unique') then
    alter table public.be_portal_pickup_requests
      add constraint be_portal_pickup_requests_pickup_id_unique unique (pickup_id);
  end if;
end $$;

with ranked as (
  select e.id, e.tracking_no,
         row_number() over (partition by e.tracking_no order by e.created_at nulls last, e.id) rn
  from public.be_portal_cargo_events e
  where e.tracking_no is not null
)
update public.be_portal_cargo_events e
set tracking_no = e.tracking_no || '-DUP-' || left(e.id::text, 8)
from ranked r
where e.id = r.id
  and r.rn > 1;

with ranked as (
  select e.id, e.deliver_way_id,
         row_number() over (partition by e.deliver_way_id order by e.created_at nulls last, e.id) rn
  from public.be_portal_cargo_events e
  where e.deliver_way_id is not null
)
update public.be_portal_cargo_events e
set deliver_way_id = e.deliver_way_id || '-DUP-' || left(e.id::text, 8)
from ranked r
where e.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'be_portal_cargo_events_tracking_no_unique') then
    alter table public.be_portal_cargo_events
      add constraint be_portal_cargo_events_tracking_no_unique unique (tracking_no);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'be_portal_cargo_events_deliver_way_id_unique') then
    alter table public.be_portal_cargo_events
      add constraint be_portal_cargo_events_deliver_way_id_unique unique (deliver_way_id);
  end if;
end $$;

update public.be_app_notifications
set
  event_key = coalesce(nullif(event_key, ''), coalesce(pickup_id, 'general') || ':' || coalesce(target_role, 'general') || ':' || id::text),
  source_key = coalesce(nullif(source_key, ''), nullif(event_key, ''), id::text),
  notification_type = coalesce(nullif(notification_type, ''), 'general'),
  category = coalesce(nullif(category, ''), notification_type, 'general'),
  target_role = coalesce(nullif(target_role, ''), 'general'),
  source_table = coalesce(nullif(source_table, ''), 'be_app_notifications'),
  title = coalesce(nullif(title, ''), 'Notification'),
  body = coalesce(nullif(body, ''), nullif(message, ''), title, 'Notification'),
  message = coalesce(nullif(message, ''), nullif(body, ''), title, 'Notification'),
  status = coalesce(nullif(status, ''), 'unread'),
  is_read = coalesce(is_read, false),
  payload = coalesce(payload, '{}'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now());

with ranked as (
  select id, event_key,
         row_number() over (partition by event_key order by created_at desc nulls last, id) rn
  from public.be_app_notifications
  where event_key is not null
)
update public.be_app_notifications n
set event_key = n.event_key || ':dup:' || left(n.id::text, 8)
from ranked r
where n.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'be_app_notifications_event_key_unique') then
    alter table public.be_app_notifications
      add constraint be_app_notifications_event_key_unique unique (event_key);
  end if;
end $$;

create or replace function public.be_normalize_app_notification()
returns trigger
language plpgsql
as $$
begin
  new.notification_type := coalesce(nullif(new.notification_type, ''), 'general');
  new.category := coalesce(nullif(new.category, ''), new.notification_type, 'general');
  new.target_role := coalesce(nullif(new.target_role, ''), 'general');
  new.source_table := coalesce(nullif(new.source_table, ''), 'be_app_notifications');
  new.source_key := coalesce(nullif(new.source_key, ''), nullif(new.event_key, ''), coalesce(new.pickup_id, 'general') || ':' || new.target_role || ':' || gen_random_uuid()::text);
  new.event_key := coalesce(nullif(new.event_key, ''), new.notification_type || ':' || new.target_role || ':' || new.source_table || ':' || new.source_key);
  new.title := coalesce(nullif(new.title, ''), 'Notification');
  new.body := coalesce(nullif(new.body, ''), nullif(new.message, ''), new.title, 'Notification');
  new.message := coalesce(nullif(new.message, ''), new.body, new.title, 'Notification');
  new.status := coalesce(nullif(new.status, ''), 'unread');
  new.is_read := coalesce(new.is_read, false);
  new.payload := coalesce(new.payload, '{}'::jsonb);
  new.metadata := coalesce(new.metadata, '{}'::jsonb);
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

drop trigger if exists trg_be_normalize_app_notification on public.be_app_notifications;
create trigger trg_be_normalize_app_notification
before insert or update on public.be_app_notifications
for each row execute function public.be_normalize_app_notification();

-- =========================================================
-- 3) Merchant resolver / dropdown
-- =========================================================
create or replace function public.be_known_merchant_code(
  p_code text,
  p_name text
)
returns text
language plpgsql
security definer
as $$
declare
  v_candidate text;
  v_code text;
begin
  v_candidate := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_candidate ~ '^[A-Z][A-Z0-9]{1,4}$' and v_candidate !~ '^[0-9]+$' then
    return left(v_candidate, 3);
  end if;

  if to_regclass('public.merchant_master') is not null then
    execute $q$
      with rows as (select to_jsonb(m) j from public.merchant_master m)
      select upper(coalesce(j->>'merchant_code', j->>'merchant_id', j->>'record_key'))
      from rows
      where lower(coalesce(j->>'merchant_name', j->>'display_name', j->>'name', '')) = lower(coalesce($1, ''))
         or lower(coalesce(j->>'merchant_code', j->>'merchant_id', j->>'record_key', '')) = lower(coalesce($2, ''))
      limit 1
    $q$ into v_code using p_name, p_code;

    if v_code ~ '^[A-Z][A-Z0-9]{1,4}$' and v_code !~ '^[0-9]+$' then
      return left(v_code, 3);
    end if;
  end if;

  select a.code into v_code
  from (
    values
      ('ALN','Alnoor'), ('APA','APAC'), ('APS','Aung Pyae Sone'), ('BBG','Baby Genius'),
      ('BBK','Baby Kyaw'), ('BBR','Best Buy in Rangoon'), ('BBT','BabyTop'), ('CUY','Curvy'),
      ('DDC','DDC BC'), ('DSD','Daw Sanda'), ('ETE','Ei Tone'), ('HAM','HAIM'), ('HMS','လှမေတ္တာရှင်'),
      ('JLS','July Sis'), ('KKK','ကိုကျော် အထည်'), ('LOS','Lady OS'), ('MBO','MaBel OS'),
      ('MDY','မန္တလေး ရုံးခွဲ'), ('MEL','Mee Lay'), ('NDN','NDN'), ('NFS','နွယ် Fashion'),
      ('NFT','Nfinity'), ('NHT','နန်းထိုက်တန်'), ('NPT','နေပြည်တော် ရုံးခွဲ'), ('PLE','Pleasure'),
      ('POC','PO Clothing'), ('PPL','Poe Poe Lay'), ('PRE','PREMIER'), ('PSO','Phyu Sin OS'),
      ('PTB','ပီတိစာပေ'), ('PTP','ပန်းသရဖီ'), ('PYT','ပုရစ်'), ('SEN','ရွှေအိမ့်'),
      ('SHS','Shwe Sin'), ('SMH','ရွှေမဟာ'), ('SSF','Su Su Fashion World'), ('STZ','ဆောင်းသဇင်'),
      ('SYE','Shwe Yee'), ('TGK','သင်္ဃန်းကျွန်း ရုံးခွဲ'), ('UQD','Unique/Diva')
  ) as a(code, name)
  where lower(a.code) = lower(coalesce(p_code, ''))
     or lower(a.name) = lower(coalesce(p_name, ''))
  limit 1;

  if v_code is null then
    raise exception 'Valid merchant code not found for merchant "%". Update merchant_master merchant_code.', coalesce(p_name, p_code);
  end if;

  return v_code;
end;
$$;

create or replace function public.be_resolve_merchant_meta(
  p_merchant_code text,
  p_merchant_name text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text;
  v_result jsonb := '{}'::jsonb;
begin
  v_code := public.be_known_merchant_code(p_merchant_code, p_merchant_name);

  if to_regclass('public.merchant_master') is not null then
    execute $q$
      with rows as (select to_jsonb(m) j from public.merchant_master m)
      select j || jsonb_build_object(
        'merchant_code', $1,
        'merchant_id', $1,
        'default_pickup_address',
          coalesce(
            nullif(j->>'default_pickup_address', ''),
            array_to_string(array_remove(array[j->>'address_line_1', j->>'address_line_2'], null), ', ')
          )
      )
      from rows
      where upper(coalesce(j->>'merchant_code', j->>'merchant_id', j->>'record_key', '')) = upper($1)
         or lower(coalesce(j->>'merchant_name', j->>'display_name', j->>'name', '')) = lower(coalesce($2, ''))
      limit 1
    $q$ into v_result using v_code, p_merchant_name;
  end if;

  if v_result is null or v_result = '{}'::jsonb then
    v_result := jsonb_build_object('merchant_code', v_code, 'merchant_id', v_code, 'merchant_name', coalesce(p_merchant_name, v_code), 'payment_terms', 'COD');
  end if;

  return v_result;
end;
$$;

create or replace function public.be_customer_service_merchant_options()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if to_regclass('public.merchant_master') is not null then
    execute $q$
      with aliases(code, fallback_name) as (
        values
          ('ALN','Alnoor'), ('APA','APAC'), ('APS','Aung Pyae Sone'), ('BBG','Baby Genius'),
          ('BBK','Baby Kyaw'), ('BBR','Best Buy in Rangoon'), ('BBT','BabyTop'), ('CUY','Curvy'),
          ('DDC','DDC BC'), ('DSD','Daw Sanda'), ('ETE','Ei Tone'), ('HAM','HAIM'), ('HMS','လှမေတ္တာရှင်'),
          ('JLS','July Sis'), ('KKK','ကိုကျော် အထည်'), ('LOS','Lady OS'), ('MBO','MaBel OS'),
          ('MDY','မန္တလေး ရုံးခွဲ'), ('MEL','Mee Lay'), ('NDN','NDN'), ('NFS','နွယ် Fashion'),
          ('NFT','Nfinity'), ('NHT','နန်းထိုက်တန်'), ('NPT','နေပြည်တော် ရုံးခွဲ'), ('PLE','Pleasure'),
          ('POC','PO Clothing'), ('PPL','Poe Poe Lay'), ('PRE','PREMIER'), ('PSO','Phyu Sin OS'),
          ('PTB','ပီတိစာပေ'), ('PTP','ပန်းသရဖီ'), ('PYT','ပုရစ်'), ('SEN','ရွှေအိမ့်'),
          ('SHS','Shwe Sin'), ('SMH','ရွှေမဟာ'), ('SSF','Su Su Fashion World'), ('STZ','ဆောင်းသဇင်'),
          ('SYE','Shwe Yee'), ('TGK','သင်္ဃန်းကျွန်း ရုံးခွဲ'), ('UQD','Unique/Diva')
      ),
      master_rows as (
        select upper(coalesce(to_jsonb(m)->>'merchant_code', to_jsonb(m)->>'merchant_id', to_jsonb(m)->>'record_key')) code,
               to_jsonb(m) j
        from public.merchant_master m
      ),
      rows as (
        select a.code, a.fallback_name, coalesce(m.j, jsonb_build_object('merchant_code', a.code, 'merchant_name', a.fallback_name)) j
        from aliases a left join master_rows m on m.code = a.code
      )
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'value', code,
          'label', coalesce(j->>'merchant_name', j->>'display_name', fallback_name),
          'merchant_code', code,
          'merchant_id', code,
          'merchant_name', coalesce(j->>'merchant_name', j->>'display_name', fallback_name),
          'phone_primary', coalesce(j->>'phone_primary', j->>'phone', j->>'contact_phone', j->>'mobile'),
          'phone_secondary', j->>'phone_secondary',
          'address_line_1', j->>'address_line_1',
          'address_line_2', j->>'address_line_2',
          'township', j->>'township',
          'city', j->>'city',
          'default_pickup_address', coalesce(nullif(j->>'default_pickup_address', ''), array_to_string(array_remove(array[j->>'address_line_1', j->>'address_line_2'], null), ', ')),
          'payment_terms', coalesce(j->>'payment_terms', 'COD'),
          'standard_allowance_kg', j->>'standard_allowance_kg',
          'special_allowance_kg', j->>'special_allowance_kg',
          'extra_per_kg_mmk', j->>'extra_per_kg_mmk',
          'payload', j
        )
        order by coalesce(j->>'merchant_name', j->>'display_name', fallback_name)
      ), '[]'::jsonb)
      from rows
    $q$ into v_result;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- =========================================================
-- 4) CS pickup creation / queues
-- =========================================================
create or replace function public.be_next_go_live_pickup_batch(
  p_pickup_date date,
  p_merchant_code text,
  p_parcel_count integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_date date := coalesce(p_pickup_date, now()::date);
  v_count integer := greatest(coalesce(p_parcel_count, 1), 1);
  v_code text;
  v_mmdd text;
  v_d_prefix text;
  v_p_prefix text;
  v_max_no integer := 0;
  v_start_no integer;
  v_end_no integer;
  v_pickup_id text;
begin
  v_code := upper(regexp_replace(coalesce(p_merchant_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code !~ '^[A-Z][A-Z0-9]{1,4}$' or v_code ~ '^[0-9]+$' then
    raise exception 'Invalid merchant abbreviation "%". Must be like MEL, NFS, HAM, SSF.', p_merchant_code;
  end if;

  v_code := left(v_code, 3);
  v_mmdd := to_char(v_date, 'MMDD');
  v_d_prefix := 'D' || v_mmdd;
  v_p_prefix := 'P' || v_mmdd;

  perform pg_advisory_xact_lock(hashtext(v_d_prefix));

  select greatest(
    coalesce((select max(delivery_end_no) from public.be_portal_pickup_requests where pickup_date = v_date and pickup_id ~ ('^P' || v_mmdd || '-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$')), 0),
    coalesce((select max(substring(deliver_way_id from '[0-9]{3}$')::int) from public.be_portal_cargo_events where deliver_way_id ~ ('^' || v_d_prefix || '-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$')), 0),
    coalesce((select max(substring(pickup_id from '[0-9]{3}$')::int) from public.be_portal_pickup_requests where pickup_id ~ ('^' || v_p_prefix || '-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$')), 0)
  ) into v_max_no;

  v_start_no := v_max_no + 1;
  v_end_no := v_max_no + v_count;
  v_pickup_id := v_p_prefix || '-' || v_code || '-' || lpad(v_end_no::text, 3, '0');

  return jsonb_build_object(
    'pickup_id', v_pickup_id,
    'pickup_way_id', v_pickup_id,
    'merchant_abbr', v_code,
    'pickup_date', v_date,
    'date_code', v_mmdd,
    'delivery_prefix', v_d_prefix || '-' || v_code,
    'delivery_start_no', v_start_no,
    'delivery_end_no', v_end_no,
    'parcel_count', v_count
  );
end;
$$;

create or replace function public.be_submit_portal_pickup_request(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_merchant jsonb;
  v_pickup_time timestamptz;
  v_pickup_date date;
  v_merchant_code text;
  v_merchant_name text;
  v_sender_phone text;
  v_township text;
  v_city text;
  v_pickup_address text;
  v_payment_terms text;
  v_count integer;
  v_batch jsonb;
  v_pickup_id text;
  v_row public.be_portal_pickup_requests;
begin
  v_merchant := public.be_resolve_merchant_meta(
    coalesce(p_payload->>'merchant_code', p_payload->>'merchant_id'),
    coalesce(p_payload->>'merchant_name', p_payload->>'sender_name')
  );

  v_merchant_code := public.be_known_merchant_code(
    coalesce(v_merchant->>'merchant_code', p_payload->>'merchant_code', p_payload->>'merchant_id'),
    coalesce(v_merchant->>'merchant_name', p_payload->>'merchant_name', p_payload->>'sender_name')
  );

  v_merchant_name := coalesce(nullif(v_merchant->>'merchant_name', ''), nullif(v_merchant->>'display_name', ''), nullif(p_payload->>'merchant_name', ''), v_merchant_code);
  v_sender_phone := coalesce(nullif(p_payload->>'sender_phone', ''), nullif(v_merchant->>'phone_primary', ''));
  v_township := coalesce(nullif(p_payload->>'township', ''), nullif(v_merchant->>'township', ''));
  v_city := coalesce(nullif(p_payload->>'city', ''), nullif(v_merchant->>'city', ''), 'Yangon');
  v_pickup_address := coalesce(nullif(p_payload->>'pickup_address', ''), nullif(v_merchant->>'default_pickup_address', ''), nullif(v_merchant->>'address_line_1', ''), array_to_string(array_remove(array[v_merchant->>'address_line_1', v_merchant->>'address_line_2'], null), ', '));

  if v_pickup_address is null or trim(v_pickup_address) = '' then
    raise exception 'Merchant % has no pickup address. Update merchant_master address_line_1/default_pickup_address first.', v_merchant_code;
  end if;

  v_payment_terms := coalesce(nullif(p_payload->>'payment_terms', ''), nullif(v_merchant->>'payment_terms', ''), 'COD');
  v_pickup_time := nullif(p_payload->>'pickup_time', '')::timestamptz;
  v_pickup_date := coalesce(v_pickup_time::date, now()::date);
  v_count := greatest(coalesce(nullif(p_payload->>'parcel_count', '')::int, 1), 1);

  v_batch := public.be_next_go_live_pickup_batch(v_pickup_date, v_merchant_code, v_count);
  v_pickup_id := v_batch->>'pickup_id';

  insert into public.be_portal_pickup_requests (
    pickup_id, canonical_pickup_id, pickup_way_id, pickup_date, merchant_abbr,
    delivery_start_no, delivery_end_no, delivery_date_prefix, delivery_prefix,
    source, requester_type, merchant_code, merchant_name, sender_name, sender_phone,
    township, city, pickup_address, payment_terms, tariff_code, assigned_branch,
    pickup_time, parcel_count, cod_amount, priority, special_instructions,
    status, assignment_status, payload, created_at, updated_at
  )
  values (
    v_pickup_id, v_pickup_id, v_pickup_id, v_pickup_date, v_merchant_code,
    (v_batch->>'delivery_start_no')::int, (v_batch->>'delivery_end_no')::int,
    'D' || to_char(v_pickup_date, 'MMDD'), v_batch->>'delivery_prefix',
    coalesce(p_payload->>'source', 'customer_service'), coalesce(p_payload->>'requester_type', 'Merchant'),
    v_merchant_code, v_merchant_name, coalesce(nullif(p_payload->>'sender_name', ''), v_merchant_name), v_sender_phone,
    v_township, v_city, v_pickup_address, v_payment_terms, p_payload->>'tariff_code', coalesce(nullif(p_payload->>'assigned_branch', ''), 'YGN'),
    v_pickup_time, v_count, coalesce(nullif(p_payload->>'cod_amount', '')::numeric, 0), coalesce(p_payload->>'priority', 'normal'), p_payload->>'special_instructions',
    'pending_assignment', 'pending_assignment',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('pickup_id', v_pickup_id, 'pickup_way_id', v_pickup_id, 'canonical_pickup_id', v_pickup_id, 'merchant_code', v_merchant_code, 'merchant_name', v_merchant_name, 'merchant_payload', v_merchant, 'id_generation', v_batch),
    now(), now()
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'pickup_request_id', v_pickup_id, 'pickup_way_id', v_pickup_id, 'merchant_code', v_merchant_code, 'merchant_name', v_merchant_name, 'pickup_address', v_pickup_address, 'delivery_start_no', v_row.delivery_start_no, 'delivery_end_no', v_row.delivery_end_no, 'request', to_jsonb(v_row));
end;
$$;

create or replace function public.be_create_pickup_request_and_notify(p_payload jsonb)
returns jsonb
language sql
security definer
as $$ select public.be_submit_portal_pickup_request(p_payload); $$;

create or replace function public.be_customer_service_recent_pickup_requests(p_limit integer default 50)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('pickup_request_id', x.pickup_id, 'pickup_way_id', x.pickup_id, 'way_id', x.pickup_id) order by x.created_at desc), '[]'::jsonb)
  from (
    select * from public.be_portal_pickup_requests
    where pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
      and coalesce(status, '') <> 'archived_test_data'
    order by created_at desc
    limit coalesce(p_limit, 50)
  ) x;
$$;

create or replace function public.be_pickup_request_options(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'value', pickup_id,
    'label', pickup_id || ' — [' || coalesce(merchant_name, merchant_code, sender_name, '-') || '] — Count: ' || coalesce(parcel_count, 1)::text,
    'pickup_id', pickup_id, 'pickup_request_id', pickup_id, 'pickup_way_id', pickup_id, 'way_id', pickup_id,
    'merchant_code', merchant_code, 'merchant_name', merchant_name, 'sender_name', sender_name, 'sender_phone', sender_phone,
    'township', township, 'city', city, 'pickup_address', pickup_address, 'payment_terms', payment_terms, 'tariff_code', tariff_code,
    'assigned_branch', assigned_branch, 'pickup_time', pickup_time, 'parcel_count', parcel_count, 'cod_amount', cod_amount,
    'status', status, 'assignment_status', assignment_status, 'payload', payload
  ) order by created_at desc), '[]'::jsonb)
  from (
    select * from public.be_portal_pickup_requests
    where pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
      and coalesce(status, '') not in ('cancelled', 'archived_test_data')
    order by created_at desc
    limit coalesce(p_limit, 100)
  ) r;
$$;

create or replace function public.be_pickup_request_dropdown_options(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$ select public.be_pickup_request_options(p_limit); $$;

create or replace function public.be_pending_pickup_assignment_list(p_search text default '', p_limit integer default 100)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'raw_uuid', pickup_id, 'pickup_id', pickup_id, 'pickup_request_id', pickup_id, 'pickup_way_id', pickup_id, 'way_id', pickup_id,
    'sender_name', sender_name, 'sender_phone', sender_phone, 'merchant_name', merchant_name, 'merchant_code', merchant_code,
    'township', township, 'pickup_address', pickup_address, 'pickup_time', pickup_time, 'cod_amount', cod_amount,
    'parcel_count', parcel_count, 'status', status, 'assignment_status', coalesce(assignment_status, 'pending_assignment'),
    'assigned_branch', assigned_branch, 'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  from public.be_portal_pickup_requests
  where pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'
    and coalesce(status, '') not in ('cancelled', 'archived_test_data')
    and coalesce(assignment_status, 'pending_assignment') <> 'assigned'
    and (
      coalesce(p_search, '') = ''
      or pickup_id ilike '%' || p_search || '%'
      or sender_name ilike '%' || p_search || '%'
      or sender_phone ilike '%' || p_search || '%'
      or merchant_name ilike '%' || p_search || '%'
      or township ilike '%' || p_search || '%'
    )
  limit coalesce(p_limit, 100);
$$;

create or replace function public.be_supervisor_pickup_assignment_queue(p_limit integer default 100)
returns jsonb
language sql
security definer
as $$ select public.be_pending_pickup_assignment_list('', p_limit); $$;

-- =========================================================
-- 5) Data Entry RPCs
-- =========================================================
create or replace function public.be_data_entry_prepare_pickup_template(p_pickup_request_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(p_pickup_request_id);
  v_req public.be_portal_pickup_requests;
  v_count integer;
  v_i integer;
  v_suffix integer;
  v_deliver_way_id text;
  v_rows jsonb;
begin
  select * into v_req
  from public.be_portal_pickup_requests
  where pickup_id = v_pickup_id or canonical_pickup_id = v_pickup_id or pickup_way_id = v_pickup_id;

  if v_req.pickup_id is null then
    raise exception 'Pickup request % not found', p_pickup_request_id;
  end if;

  v_count := greatest(coalesce(v_req.parcel_count, 1), 1);

  if v_req.delivery_start_no is null or v_req.delivery_end_no is null then
    raise exception 'Pickup % has no delivery sequence. Create it again from Customer Service.', v_req.pickup_id;
  end if;

  for v_i in 1..v_count loop
    v_suffix := v_req.delivery_start_no + v_i - 1;
    v_deliver_way_id := coalesce(v_req.delivery_prefix, 'D' || to_char(coalesce(v_req.pickup_date, now()::date), 'MMDD') || '-' || v_req.merchant_code) || '-' || lpad(v_suffix::text, 3, '0');

    insert into public.be_portal_cargo_events (
      pickup_id, tracking_no, deliver_way_id, line_no, event_type, event_title, event_description, status, source_table, source_key,
      pickup_date, merchant, sender_name, sender_phone, pickup_address, pickup_township, pickup_city,
      item_price, deli_fee_os, cod_os, std_deli, max_deli, weight_kg, surcharge, final_cod, cod_amount,
      package_type, service_type, pickup_verification_status, payload, metadata, created_at, updated_at
    )
    values (
      v_req.pickup_id, v_deliver_way_id, v_deliver_way_id, v_i, 'data_entry_waybill',
      'Data Entry Waybill', 'Delivery waybill generated from pickup ' || v_req.pickup_id, 'draft',
      'be_portal_cargo_events', v_deliver_way_id,
      coalesce(v_req.pickup_date, v_req.created_at::date, now()::date), coalesce(v_req.merchant_name, v_req.merchant_code),
      v_req.sender_name, v_req.sender_phone, v_req.pickup_address, v_req.township, v_req.city,
      0, 0, 0, 0, 0, 1, 0, 0, 0,
      'parcel', 'standard', 'pending',
      jsonb_build_object('source', 'data_entry_template', 'pickup_id', v_req.pickup_id, 'pickup_way_id', v_req.pickup_id, 'deliver_way_id', v_deliver_way_id, 'delivery_suffix', v_suffix),
      '{}'::jsonb, now(), now()
    )
    on conflict (tracking_no)
    do update set
      deliver_way_id = excluded.deliver_way_id,
      pickup_id = excluded.pickup_id,
      line_no = excluded.line_no,
      event_type = 'data_entry_waybill',
      pickup_date = excluded.pickup_date,
      merchant = excluded.merchant,
      sender_name = excluded.sender_name,
      sender_phone = excluded.sender_phone,
      pickup_address = excluded.pickup_address,
      pickup_township = excluded.pickup_township,
      pickup_city = excluded.pickup_city,
      updated_at = now();
  end loop;

  update public.be_portal_pickup_requests
  set status = 'data_entry_in_progress', updated_at = now()
  where pickup_id = v_req.pickup_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.line_no), '[]'::jsonb)
  into v_rows
  from public.be_portal_cargo_events x
  where x.pickup_id = v_req.pickup_id
    and x.event_type = 'data_entry_waybill';

  return jsonb_build_object('ok', true, 'pickup_id', v_req.pickup_id, 'pickup_request_id', v_req.pickup_id, 'pickup_way_id', v_req.pickup_id, 'parcel_count', v_count, 'rows', v_rows);
end;
$$;

create or replace function public.be_data_entry_fetch_parcels(p_pickup_request_id text)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.line_no), '[]'::jsonb)
  from public.be_portal_cargo_events x
  where x.pickup_id = trim(p_pickup_request_id)
    and x.event_type = 'data_entry_waybill';
$$;

create or replace function public.be_data_entry_save_parcel(p_parcel_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row public.be_portal_cargo_events;
  v_item numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'item_price','0'), '[,\s]', '', 'g'), '')::numeric, 0);
  v_deli numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'deli_fee_os','0'), '[,\s]', '', 'g'), '')::numeric, 0);
  v_surcharge numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'surcharge','0'), '[,\s]', '', 'g'), '')::numeric, 0);
  v_weight numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'weight_kg','1'), '[,\s]', '', 'g'), '')::numeric, 1);
  v_cod_os numeric;
  v_final numeric;
begin
  v_cod_os := coalesce(nullif(regexp_replace(coalesce(p_payload->>'cod_os',''), '[,\s]', '', 'g'), '')::numeric, v_item + v_deli);
  v_final := coalesce(nullif(regexp_replace(coalesce(p_payload->>'final_cod',''), '[,\s]', '', 'g'), '')::numeric, v_cod_os + v_surcharge);

  update public.be_portal_cargo_events
  set
    pickup_date = coalesce(nullif(p_payload->>'pickup_date', '')::date, pickup_date),
    deliver_way_id = coalesce(nullif(p_payload->>'deliver_way_id', ''), deliver_way_id),
    merchant = coalesce(nullif(p_payload->>'merchant', ''), merchant),
    receiver_name = nullif(p_payload->>'receiver_name', ''),
    receiver_phone = nullif(p_payload->>'receiver_phone', ''),
    recipient_town = nullif(coalesce(p_payload->>'recipient_town', p_payload->>'delivery_township'), ''),
    delivery_township = nullif(coalesce(p_payload->>'delivery_township', p_payload->>'recipient_town'), ''),
    delivery_address = nullif(p_payload->>'delivery_address', ''),
    item_price = v_item,
    deli_fee_os = v_deli,
    cod_os = v_cod_os,
    std_deli = coalesce(nullif(regexp_replace(coalesce(p_payload->>'std_deli','0'), '[,\s]', '', 'g'), '')::numeric, 0),
    max_deli = coalesce(nullif(regexp_replace(coalesce(p_payload->>'max_deli','0'), '[,\s]', '', 'g'), '')::numeric, 0),
    weight_kg = v_weight,
    surcharge = v_surcharge,
    final_cod = v_final,
    cod_amount = v_final,
    destination = nullif(p_payload->>'destination', ''),
    pickup_by_1 = nullif(p_payload->>'pickup_by_1', ''),
    pickup_by_2 = nullif(p_payload->>'pickup_by_2', ''),
    general_remarks = nullif(p_payload->>'general_remarks', ''),
    driver_rider = nullif(p_payload->>'driver_rider', ''),
    helper = nullif(p_payload->>'helper', ''),
    plate_no = nullif(p_payload->>'plate_no', ''),
    delivery_remarks = nullif(p_payload->>'delivery_remarks', ''),
    column_37 = nullif(p_payload->>'column_37', ''),
    finance_deli = coalesce(nullif(regexp_replace(coalesce(p_payload->>'finance_deli','0'), '[,\s]', '', 'g'), '')::numeric, 0),
    finance_cod = coalesce(nullif(regexp_replace(coalesce(p_payload->>'finance_cod','0'), '[,\s]', '', 'g'), '')::numeric, 0),
    finance_received_by = nullif(p_payload->>'finance_received_by', ''),
    finance_status = nullif(p_payload->>'finance_status', ''),
    item_description = nullif(p_payload->>'item_description', ''),
    remarks = nullif(p_payload->>'remarks', ''),
    status = case when coalesce(status, '') in ('draft','data_entry_in_progress') then 'draft' else status end,
    payload = coalesce(payload, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb),
    updated_at = now()
  where id = p_parcel_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Parcel row not found';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_data_entry_submit_pickup_parcels(p_pickup_request_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(p_pickup_request_id);
  v_count integer;
begin
  select count(*) into v_count
  from public.be_portal_cargo_events
  where pickup_id = v_pickup_id
    and event_type = 'data_entry_waybill';

  if v_count = 0 then
    raise exception 'No parcel rows found. Prepare parcel template first.';
  end if;

  update public.be_portal_cargo_events
  set status = case when coalesce(status, '') = 'draft' then 'ready_for_operations' else status end,
      updated_at = now()
  where pickup_id = v_pickup_id
    and event_type = 'data_entry_waybill';

  update public.be_portal_pickup_requests
  set status = 'data_entry_completed',
      updated_at = now()
  where pickup_id = v_pickup_id;

  insert into public.be_app_notifications (
    event_key, notification_type, category, target_role, pickup_id, source_table, source_key,
    title, body, message, status, is_read, payload, metadata, created_at
  )
  values (
    v_pickup_id || ':data_entry_completed:operation_supervisor',
    'data_entry_completed', 'data_entry_completed', 'operation_supervisor',
    v_pickup_id, 'be_portal_pickup_requests', v_pickup_id || ':data_entry_completed',
    'Data Entry Completed',
    'Pickup ' || v_pickup_id || ' has completed parcel data entry.',
    'Pickup ' || v_pickup_id || ' has completed parcel data entry.',
    'unread', false,
    jsonb_build_object('pickup_id', v_pickup_id, 'event', 'data_entry_completed'),
    '{}'::jsonb, now()
  )
  on conflict (event_key)
  do update set body = excluded.body, message = excluded.message, status = 'unread', is_read = false, payload = excluded.payload, created_at = now();

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'pickup_request_id', v_pickup_id, 'parcel_count', v_count, 'status', 'data_entry_completed');
end;
$$;

create or replace function public.be_data_entry_toggle_registration_check(p_event_id uuid, p_checked boolean)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row public.be_portal_cargo_events;
begin
  update public.be_portal_cargo_events
  set
    data_entry_registration_checked = coalesce(p_checked, false),
    data_entry_registration_checked_at = case when coalesce(p_checked, false) then now() else null end,
    data_entry_registration_checked_by = case when coalesce(p_checked, false) then auth.uid() else null end,
    updated_at = now()
  where id = p_event_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Parcel row not found';
  end if;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'deliver_way_id', coalesce(v_row.deliver_way_id, v_row.tracking_no), 'data_entry_registration_checked', v_row.data_entry_registration_checked);
end;
$$;

-- =========================================================
-- 6) Supervisor / workforce
-- =========================================================
create or replace function public.be_mobile_workforce_options(p_workforce_type text default null)
returns jsonb
language sql
security definer
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'value', workforce_code,
    'label', coalesce(display_name, workforce_code) || ' — ' || workforce_code,
    'workforce_code', workforce_code,
    'display_name', display_name,
    'workforce_type', workforce_type,
    'email', email,
    'phone', coalesce(phone, phone_e164),
    'assigned_zone', assigned_zone,
    'assigned_branch', coalesce(assigned_branch, branch_code)
  ) order by workforce_type, display_name), '[]'::jsonb)
  from public.be_mobile_workforce_accounts
  where lower(coalesce(status, 'active')) = 'active'
    and (p_workforce_type is null or p_workforce_type = '' or lower(workforce_type) = lower(p_workforce_type));
$$;

create or replace function public.be_upsert_field_assignment_notification(
  p_pickup_id text,
  p_role text,
  p_target_user_id uuid,
  p_workforce_code text,
  p_workforce_name text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_event_key text;
  v_message text;
  v_row public.be_app_notifications;
begin
  if p_workforce_code is null or trim(p_workforce_code) = '' then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  v_event_key := p_pickup_id || ':assigned:' || p_role || ':' || p_workforce_code;
  v_message := 'Pickup ' || p_pickup_id || ' assigned to ' || coalesce(p_workforce_name, p_workforce_code) || '.';

  insert into public.be_app_notifications (
    notification_type, category, target_role, target_user_id, pickup_id, source_table, source_key,
    event_key, title, body, message, status, is_read, payload, metadata, created_at
  )
  values (
    'field_assignment', 'field_assignment', p_role, p_target_user_id, p_pickup_id, 'be_portal_pickup_requests', v_event_key,
    v_event_key, 'Pickup Assigned', v_message, v_message, 'unread', false,
    jsonb_build_object('pickup_id', p_pickup_id, 'pickup_request_id', p_pickup_id, 'event', 'assigned', 'workforce_code', p_workforce_code, 'workforce_name', p_workforce_name, 'workforce_type', p_role),
    '{}'::jsonb, now()
  )
  on conflict (event_key)
  do update set
    target_user_id = excluded.target_user_id,
    body = excluded.body,
    message = excluded.message,
    status = 'unread',
    is_read = false,
    payload = excluded.payload,
    created_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_assign_pickup_field_team(
  p_pickup_id text,
  p_rider_code text default null,
  p_driver_code text default null,
  p_helper_code text default null,
  p_vehicle_plate text default null,
  p_supervisor_note text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pickup_id text := trim(p_pickup_id);
  v_rider public.be_mobile_workforce_accounts;
  v_driver public.be_mobile_workforce_accounts;
  v_helper public.be_mobile_workforce_accounts;
begin
  if nullif(trim(coalesce(p_rider_code, '')), '') is not null then
    select * into v_rider
    from public.be_mobile_workforce_accounts
    where lower(coalesce(status, 'active')) = 'active'
      and lower(workforce_type) = 'rider'
      and (lower(workforce_code) = lower(trim(p_rider_code)) or lower(display_name) = lower(trim(p_rider_code)))
    limit 1;
    if v_rider.workforce_code is null then raise exception 'Rider % not found or inactive', p_rider_code; end if;
  end if;

  if nullif(trim(coalesce(p_driver_code, '')), '') is not null then
    select * into v_driver
    from public.be_mobile_workforce_accounts
    where lower(coalesce(status, 'active')) = 'active'
      and lower(workforce_type) = 'driver'
      and (lower(workforce_code) = lower(trim(p_driver_code)) or lower(display_name) = lower(trim(p_driver_code)))
    limit 1;
    if v_driver.workforce_code is null then raise exception 'Driver % not found or inactive', p_driver_code; end if;
  end if;

  if nullif(trim(coalesce(p_helper_code, '')), '') is not null then
    select * into v_helper
    from public.be_mobile_workforce_accounts
    where lower(coalesce(status, 'active')) = 'active'
      and lower(workforce_type) = 'helper'
      and (lower(workforce_code) = lower(trim(p_helper_code)) or lower(display_name) = lower(trim(p_helper_code)))
    limit 1;
    if v_helper.workforce_code is null then raise exception 'Helper % not found or inactive', p_helper_code; end if;
  end if;

  update public.be_portal_pickup_requests
  set
    status = 'assigned',
    assignment_status = 'assigned',
    assigned_rider_code = v_rider.workforce_code,
    assigned_rider_name = v_rider.display_name,
    assigned_driver_code = v_driver.workforce_code,
    assigned_driver_name = v_driver.display_name,
    assigned_helper_code = v_helper.workforce_code,
    assigned_helper_name = v_helper.display_name,
    assigned_workforce_type = coalesce(v_rider.workforce_type, v_driver.workforce_type, v_helper.workforce_type),
    assigned_workforce_code = coalesce(v_rider.workforce_code, v_driver.workforce_code, v_helper.workforce_code),
    assigned_workforce_name = coalesce(v_rider.display_name, v_driver.display_name, v_helper.display_name),
    assigned_vehicle_plate = nullif(trim(coalesce(p_vehicle_plate, '')), ''),
    supervisor_note = nullif(trim(coalesce(p_supervisor_note, '')), ''),
    assigned_at = now(),
    updated_at = now()
  where pickup_id = v_pickup_id;

  if not found then raise exception 'Pickup % not found', p_pickup_id; end if;

  update public.be_portal_cargo_events
  set
    status = case when event_type = 'data_entry_waybill' and coalesce(status, '') in ('draft','ready_for_operations','pickup_verified') then 'assigned' else status end,
    assigned_rider_code = v_rider.workforce_code,
    assigned_rider_name = v_rider.display_name,
    assigned_driver_code = v_driver.workforce_code,
    assigned_driver_name = v_driver.display_name,
    assigned_helper_code = v_helper.workforce_code,
    assigned_helper_name = v_helper.display_name,
    assigned_vehicle_plate = nullif(trim(coalesce(p_vehicle_plate, '')), ''),
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'assigned_rider_code', v_rider.workforce_code,
      'assigned_rider_name', v_rider.display_name,
      'assigned_driver_code', v_driver.workforce_code,
      'assigned_driver_name', v_driver.display_name,
      'assigned_helper_code', v_helper.workforce_code,
      'assigned_helper_name', v_helper.display_name,
      'assigned_vehicle_plate', nullif(trim(coalesce(p_vehicle_plate, '')), '')
    ),
    updated_at = now()
  where pickup_id = v_pickup_id
    and event_type = 'data_entry_waybill';

  perform public.be_upsert_field_assignment_notification(v_pickup_id, 'rider', v_rider.auth_user_id, v_rider.workforce_code, v_rider.display_name);
  perform public.be_upsert_field_assignment_notification(v_pickup_id, 'driver', v_driver.auth_user_id, v_driver.workforce_code, v_driver.display_name);
  perform public.be_upsert_field_assignment_notification(v_pickup_id, 'helper', v_helper.auth_user_id, v_helper.workforce_code, v_helper.display_name);

  return jsonb_build_object(
    'ok', true, 'pickup_id', v_pickup_id, 'pickup_request_id', v_pickup_id,
    'assigned_rider_code', v_rider.workforce_code, 'assigned_rider_name', v_rider.display_name,
    'assigned_driver_code', v_driver.workforce_code, 'assigned_driver_name', v_driver.display_name,
    'assigned_helper_code', v_helper.workforce_code, 'assigned_helper_name', v_helper.display_name,
    'vehicle_plate', p_vehicle_plate
  );
end;
$$;

-- =========================================================
-- 7) Mobile snapshot
-- =========================================================
create or replace function public.be_mobile_go_live_resolve_workforce(
  p_workforce_code text default null,
  p_workforce_type text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_code text;
  v_type text;
  v_tmp text;
  v_account public.be_mobile_workforce_accounts;
begin
  select email into v_email from auth.users where id = v_auth_user_id;

  v_code := lower(trim(coalesce(p_workforce_code, '')));
  v_type := lower(trim(coalesce(p_workforce_type, '')));

  if v_code in ('rider', 'driver', 'helper') and v_type not in ('rider','driver','helper') and v_type <> '' then
    v_tmp := v_code; v_code := v_type; v_type := v_tmp;
  end if;

  if v_type = '' then
    v_type := case when v_code like 'driver_%' then 'driver' when v_code like 'helper_%' then 'helper' else 'rider' end;
  end if;

  if v_code = '' then
    v_code := lower(split_part(coalesce(v_email, ''), '@', 1));
  end if;

  select * into v_account
  from public.be_mobile_workforce_accounts a
  where lower(a.workforce_code) = v_code
     or a.auth_user_id = v_auth_user_id
     or lower(coalesce(a.email, '')) = lower(coalesce(v_email, ''))
  order by case when lower(a.workforce_code) = v_code then 0 else 1 end, a.updated_at desc nulls last
  limit 1;

  if v_account.id is null then
    return jsonb_build_object('email', v_email, 'auth_user_id', v_auth_user_id, 'workforce_code', v_code, 'workforce_type', v_type, 'display_name', v_code, 'status', 'active', 'resolved_workforce_code', v_code, 'resolved_workforce_type', v_type);
  end if;

  return to_jsonb(v_account) || jsonb_build_object('resolved_workforce_code', lower(v_account.workforce_code), 'resolved_workforce_type', lower(v_account.workforce_type));
end;
$$;

create or replace function public.be_mobile_go_live_snapshot(
  p_workforce_code text default null,
  p_workforce_type text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_account jsonb;
  v_code text;
  v_type text;
  v_name text;
  v_pickup_ids text[] := array[]::text[];
  v_pickups jsonb := '[]'::jsonb;
  v_jobs jsonb := '[]'::jsonb;
  v_cod jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
begin
  v_account := public.be_mobile_go_live_resolve_workforce(p_workforce_code, p_workforce_type);
  v_code := lower(v_account->>'resolved_workforce_code');
  v_type := lower(v_account->>'resolved_workforce_type');
  v_name := lower(coalesce(v_account->>'display_name', ''));

  select coalesce(array_agg(p.pickup_id), array[]::text[])
  into v_pickup_ids
  from public.be_portal_pickup_requests p
  where coalesce(p.status, '') not in ('cancelled', 'archived_test_data')
    and (
      (v_type = 'rider' and (lower(coalesce(p.assigned_rider_code, '')) = v_code or lower(coalesce(p.assigned_rider_name, '')) = v_name or lower(coalesce(p.assigned_workforce_code, '')) = v_code))
      or
      (v_type = 'driver' and (lower(coalesce(p.assigned_driver_code, '')) = v_code or lower(coalesce(p.assigned_driver_name, '')) = v_name or lower(coalesce(p.assigned_workforce_code, '')) = v_code))
      or
      (v_type = 'helper' and (lower(coalesce(p.assigned_helper_code, '')) = v_code or lower(coalesce(p.assigned_helper_name, '')) = v_name or lower(coalesce(p.assigned_workforce_code, '')) = v_code))
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'pickup_id', p.pickup_id, 'pickup_way_id', p.pickup_id,
    'merchant_code', p.merchant_code, 'merchant_name', p.merchant_name,
    'sender_name', p.sender_name, 'sender_phone', p.sender_phone,
    'pickup_address', p.pickup_address, 'township', p.township, 'city', p.city,
    'parcel_count', coalesce(p.parcel_count, 1),
    'status', p.status, 'assignment_status', p.assignment_status,
    'assigned_rider_name', p.assigned_rider_name, 'assigned_driver_name', p.assigned_driver_name,
    'assigned_helper_name', p.assigned_helper_name, 'assigned_vehicle_plate', p.assigned_vehicle_plate,
    'assigned_at', p.assigned_at
  ) order by p.assigned_at desc nulls last, p.created_at desc), '[]'::jsonb)
  into v_pickups
  from public.be_portal_pickup_requests p
  where p.pickup_id = any(v_pickup_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'pickup_id', e.pickup_id,
    'pickup_way_id', e.pickup_id,
    'job_id', coalesce(e.deliver_way_id, e.tracking_no),
    'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
    'tracking_no', coalesce(e.tracking_no, e.deliver_way_id),
    'trackingNumber', coalesce(e.deliver_way_id, e.tracking_no),
    'recipientName', coalesce(e.receiver_name, '-'),
    'recipientPhone', e.receiver_phone,
    'township', coalesce(e.recipient_town, e.delivery_township),
    'address', e.delivery_address,
    'status', coalesce(e.status, 'assigned'),
    'codAmount', coalesce(e.final_cod, e.cod_amount, 0),
    'weight', coalesce(e.field_pickup_weight_kg, e.weight_kg, 1),
    'field_pickup_checked', coalesce(e.field_pickup_checked, false),
    'pickup_verification_status', coalesce(e.pickup_verification_status, 'pending'),
    'data_entry_registration_checked', coalesce(e.data_entry_registration_checked, false),
    'merchantName', coalesce(p.merchant_name, p.merchant_code, e.merchant, '-'),
    'createdAt', e.created_at, 'updatedAt', e.updated_at
  ) order by e.pickup_id, e.line_no), '[]'::jsonb)
  into v_jobs
  from public.be_portal_cargo_events e
  join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.pickup_id = any(v_pickup_ids)
    and e.event_type = 'data_entry_waybill'
    and coalesce(e.status, '') not in ('cancelled', 'archived_test_data')
  limit coalesce(p_limit, 100);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'pickup_id', e.pickup_id,
    'trackingNumber', coalesce(e.deliver_way_id, e.tracking_no),
    'recipientName', coalesce(e.receiver_name, '-'),
    'amount', coalesce(e.final_cod, e.cod_amount, 0),
    'status', e.status,
    'collected', e.status in ('delivered','cod_collected'),
    'handedOver', e.status in ('cod_handed_over','settled'),
    'createdAt', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into v_cod
  from public.be_portal_cargo_events e
  where e.pickup_id = any(v_pickup_ids)
    and e.event_type = 'data_entry_waybill'
    and coalesce(e.final_cod, e.cod_amount, 0) > 0;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.be_app_notifications n
  where n.target_user_id = v_auth_user_id
     or lower(coalesce(n.payload->>'workforce_code', '')) = v_code
     or (lower(coalesce(n.target_role, '')) = v_type and n.pickup_id = any(v_pickup_ids))
     or n.pickup_id = any(v_pickup_ids)
  limit 100;

  return jsonb_build_object(
    'ok', true, 'server_time', now(), 'account', v_account,
    'workforce_code', v_code, 'workforce_type', v_type,
    'pickup_ids', coalesce(to_jsonb(v_pickup_ids), '[]'::jsonb),
    'pickups', coalesce(v_pickups, '[]'::jsonb),
    'assignments', coalesce(v_pickups, '[]'::jsonb),
    'jobs', coalesce(v_jobs, '[]'::jsonb),
    'cod_records', coalesce(v_cod, '[]'::jsonb),
    'notifications', coalesce(v_notifications, '[]'::jsonb)
  );
end;
$$;

-- =========================================================
-- 8) Branch notification trigger compatibility
-- =========================================================
create or replace function public.be_notify_branch_office_for_portal_pickup()
returns trigger
language plpgsql
security definer
as $$
declare
  v_branch text;
  v_pickup_id text;
  v_event_key text;
  v_message text;
begin
  v_branch := coalesce(nullif(new.assigned_branch, ''), 'YGN');
  v_pickup_id := new.pickup_id;

  if v_pickup_id is null then
    return new;
  end if;

  v_event_key := 'branch_pickup_request_created:branch_office:be_portal_pickup_requests:' || new.id::text;
  v_message := 'Pickup ' || v_pickup_id || ' is assigned to branch ' || v_branch || '.';

  insert into public.be_app_notifications (
    notification_type, category, target_role, target_branch_code, title, body, message, pickup_id,
    source_table, source_key, event_key, metadata, payload, status, is_read, created_at
  )
  values (
    'branch_pickup_request_created', 'branch_pickup_request_created', 'branch_office', v_branch,
    'New Branch Pickup Request', v_message, v_message, v_pickup_id,
    'be_portal_pickup_requests', new.id::text, v_event_key,
    jsonb_build_object('assigned_branch', v_branch, 'merchant_name', new.merchant_name, 'sender_name', new.sender_name, 'township', new.township, 'city', new.city),
    jsonb_build_object('pickup_id', v_pickup_id, 'event', 'branch_pickup_request_created', 'assigned_branch', v_branch),
    'unread', false, now()
  )
  on conflict (event_key)
  do update set
    target_branch_code = excluded.target_branch_code,
    pickup_id = excluded.pickup_id,
    body = excluded.body,
    message = excluded.message,
    metadata = excluded.metadata,
    payload = excluded.payload,
    status = 'unread',
    is_read = false,
    created_at = now(),
    read_at = null;

  return new;
end;
$$;

-- =========================================================
-- 9) Grants / schema reload
-- =========================================================
grant execute on function public.be_known_merchant_code(text, text) to authenticated;
grant execute on function public.be_resolve_merchant_meta(text, text) to authenticated;
grant execute on function public.be_customer_service_merchant_options() to authenticated;
grant execute on function public.be_next_go_live_pickup_batch(date, text, integer) to authenticated;
grant execute on function public.be_submit_portal_pickup_request(jsonb) to authenticated;
grant execute on function public.be_create_pickup_request_and_notify(jsonb) to authenticated;
grant execute on function public.be_customer_service_recent_pickup_requests(integer) to authenticated;
grant execute on function public.be_pickup_request_options(integer) to authenticated;
grant execute on function public.be_pickup_request_dropdown_options(integer) to authenticated;
grant execute on function public.be_pending_pickup_assignment_list(text, integer) to authenticated;
grant execute on function public.be_supervisor_pickup_assignment_queue(integer) to authenticated;
grant execute on function public.be_data_entry_prepare_pickup_template(text) to authenticated;
grant execute on function public.be_data_entry_fetch_parcels(text) to authenticated;
grant execute on function public.be_data_entry_save_parcel(uuid, jsonb) to authenticated;
grant execute on function public.be_data_entry_submit_pickup_parcels(text) to authenticated;
grant execute on function public.be_data_entry_toggle_registration_check(uuid, boolean) to authenticated;
grant execute on function public.be_mobile_workforce_options(text) to authenticated;
grant execute on function public.be_upsert_field_assignment_notification(text, text, uuid, text, text) to authenticated;
grant execute on function public.be_assign_pickup_field_team(text, text, text, text, text, text) to authenticated;
grant execute on function public.be_mobile_go_live_resolve_workforce(text, text) to authenticated;
grant execute on function public.be_mobile_go_live_snapshot(text, text, integer) to authenticated;

notify pgrst, 'reload schema';
