-- Data Entry Excel Register go-live backend
-- Excel-like data entry form based on BE_MasterData_April.xlsx / MasterInbound format.
--
-- Yellow columns = system generated.
-- Green columns  = dropdown values from master data.
-- Blue columns   = manual data input.
--
-- Run this whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.be_data_entry_register_batches (
  batch_id uuid primary key default gen_random_uuid(),
  batch_no text default ('DER-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  source_file_name text,
  source_module text default 'data_entry_excel_register',
  uploaded_by text,
  uploaded_by_name text,
  total_rows integer default 0,
  valid_rows integer default 0,
  rejected_rows integer default 0,
  status text default 'draft',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_data_entry_register_rows (
  row_id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_data_entry_register_batches(batch_id) on delete set null,
  row_no integer,
  source_file_name text,

  overall_status text default 'registered',
  operation_status text default 'data_entry_registered',
  financial_status text default 'pending_finance',

  pickup_date date,
  pickup_way_id text,
  delivery_way_id text,

  merchant_code text,
  merchant_name text,

  recipient_name text,
  recipient_phone text,
  recipient_township text,
  recipient_address text,

  item_price numeric default 0,
  delivery_fee_os numeric default 0,
  cod_os numeric default 0,
  std_deli numeric default 0,
  max_deli numeric default 0,
  weight_kg numeric default 0,
  surcharge numeric default 0,
  final_cod numeric default 0,

  destination text,
  pickup_by_1 text,
  pickup_by_2 text,
  general_remarks text,
  driver_rider text,
  helper text,
  plate_no text,
  delivery_remarks text,

  finance_deli numeric default 0,
  finance_cod numeric default 0,
  finance_received_by text,
  finance_status text default 'pending_finance',

  validation_status text default 'valid',
  validation_errors jsonb default '[]'::jsonb,
  raw_row jsonb default '{}'::jsonb,

  created_by text,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_data_entry_register_batches
  add column if not exists batch_no text default ('DER-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  add column if not exists source_file_name text,
  add column if not exists source_module text default 'data_entry_excel_register',
  add column if not exists uploaded_by text,
  add column if not exists uploaded_by_name text,
  add column if not exists total_rows integer default 0,
  add column if not exists valid_rows integer default 0,
  add column if not exists rejected_rows integer default 0,
  add column if not exists status text default 'draft',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.be_data_entry_register_rows
  add column if not exists batch_id uuid,
  add column if not exists row_no integer,
  add column if not exists source_file_name text,
  add column if not exists overall_status text default 'registered',
  add column if not exists operation_status text default 'data_entry_registered',
  add column if not exists financial_status text default 'pending_finance',
  add column if not exists pickup_date date,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_township text,
  add column if not exists recipient_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists delivery_fee_os numeric default 0,
  add column if not exists cod_os numeric default 0,
  add column if not exists std_deli numeric default 0,
  add column if not exists max_deli numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists surcharge numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists destination text,
  add column if not exists pickup_by_1 text,
  add column if not exists pickup_by_2 text,
  add column if not exists general_remarks text,
  add column if not exists driver_rider text,
  add column if not exists helper text,
  add column if not exists plate_no text,
  add column if not exists delivery_remarks text,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists finance_received_by text,
  add column if not exists finance_status text default 'pending_finance',
  add column if not exists validation_status text default 'valid',
  add column if not exists validation_errors jsonb default '[]'::jsonb,
  add column if not exists raw_row jsonb default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists be_data_entry_register_rows_pickup_idx
on public.be_data_entry_register_rows (pickup_way_id, delivery_way_id, pickup_date desc);

create index if not exists be_data_entry_register_rows_merchant_idx
on public.be_data_entry_register_rows (merchant_code, merchant_name, pickup_date desc);

create unique index if not exists be_data_entry_register_rows_delivery_way_uidx
on public.be_data_entry_register_rows (delivery_way_id)
where delivery_way_id is not null and delivery_way_id <> '';

-- Conservative mock/sample cleanup for this new data-entry table only.
delete from public.be_data_entry_register_rows
where lower(coalesce(raw_row->>'source', '')) in ('mock', 'sample', 'demo')
   or upper(coalesce(delivery_way_id, '')) like 'MOCK%'
   or upper(coalesce(delivery_way_id, '')) like 'SAMPLE%'
   or upper(coalesce(pickup_way_id, '')) like 'MOCK%'
   or upper(coalesce(pickup_way_id, '')) like 'SAMPLE%';

create or replace function public.be_data_entry_excel_template_schema()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'version', '2026-05-go-live',
    'title', 'Data Entry Register',
    'legend', jsonb_build_array(
      jsonb_build_object('type', 'system', 'label', 'Yellow columns are generated by system', 'color', '#FFF2CC'),
      jsonb_build_object('type', 'dropdown', 'label', 'Green columns use predefined master-data dropdowns', 'color', '#D9EAD3'),
      jsonb_build_object('type', 'manual', 'label', 'Blue columns are manual user input', 'color', '#D9EAF7')
    ),
    'columns', '[
      {"field":"overall_status","header":"Overall Status","type":"system","width":150},
      {"field":"operation_status","header":"Operation Status","type":"system","width":165},
      {"field":"financial_status","header":"Financial Status","type":"system","width":165},
      {"field":"pickup_date","header":"Pickup Date","type":"dropdown","dropdownKey":"pickupDates","width":130},
      {"field":"pickup_way_id","header":"Pickup Way ID","type":"system","width":165},
      {"field":"delivery_way_id","header":"Deliver Way ID","type":"system","width":165},
      {"field":"merchant","header":"Merchant","type":"dropdown","dropdownKey":"merchants","width":180},
      {"field":"recipient_name","header":"Recipient name","type":"manual","width":180},
      {"field":"recipient_phone","header":"Recipient phone","type":"manual","width":150},
      {"field":"recipient_township","header":"Recipient Town","type":"dropdown","dropdownKey":"townships","width":160},
      {"field":"recipient_address","header":"Recipient address","type":"manual","width":320},
      {"field":"item_price","header":"Item price","type":"manual_number","width":130},
      {"field":"delivery_fee_os","header":"Deli Fee (OS)","type":"system","width":135},
      {"field":"cod_os","header":"COD (OS)","type":"system","width":135},
      {"field":"std_deli","header":"Std Deli","type":"system","width":120},
      {"field":"max_deli","header":"Max Deli","type":"system","width":120},
      {"field":"weight_kg","header":"Weight","type":"manual_number","width":105},
      {"field":"surcharge","header":"Surcharge","type":"system","width":120},
      {"field":"final_cod","header":"Final COD","type":"system","width":135},
      {"field":"destination","header":"Destination","type":"dropdown","dropdownKey":"destinations","width":160},
      {"field":"pickup_by_1","header":"Pickup By 1","type":"dropdown","dropdownKey":"riders","width":170},
      {"field":"pickup_by_2","header":"Pickup By 2","type":"dropdown","dropdownKey":"helpers","width":170},
      {"field":"general_remarks","header":"General Remarks","type":"manual","width":230},
      {"field":"driver_rider","header":"Driver / Rider","type":"dropdown","dropdownKey":"drivers","width":170},
      {"field":"helper","header":"Helper","type":"dropdown","dropdownKey":"helpers","width":170},
      {"field":"plate_no","header":"Plate No.","type":"dropdown","dropdownKey":"fleets","width":155},
      {"field":"delivery_remarks","header":"Delivery Remarks","type":"manual","width":220},
      {"field":"finance_deli","header":"Finance Deli","type":"system","width":130},
      {"field":"finance_cod","header":"Finance COD","type":"system","width":130},
      {"field":"finance_received_by","header":"Finance Received By","type":"system","width":180},
      {"field":"finance_status","header":"Finance Status","type":"system","width":160}
    ]'::jsonb
  );
$$;

create or replace function public.be_data_entry_dropdown_snapshot()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_master jsonb := '{}'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
  v_townships jsonb := '[]'::jsonb;
  v_destinations jsonb := '[]'::jsonb;
  v_riders jsonb := '[]'::jsonb;
  v_drivers jsonb := '[]'::jsonb;
  v_helpers jsonb := '[]'::jsonb;
  v_fleets jsonb := '[]'::jsonb;
begin
  begin
    select public.be_master_data_dropdown_snapshot() into v_master;
  exception when others then
    v_master := '{}'::jsonb;
  end;

  v_merchants := coalesce(v_master->'merchants', '[]'::jsonb);
  v_townships := coalesce(v_master->'townships', v_master->'township', v_master->'zones', '[]'::jsonb);
  v_destinations := coalesce(v_master->'destinations', v_master->'branches', v_master->'townships', '[]'::jsonb);
  v_riders := coalesce(v_master->'riders', '[]'::jsonb);
  v_drivers := coalesce(v_master->'drivers', '[]'::jsonb);
  v_helpers := coalesce(v_master->'helpers', '[]'::jsonb);
  v_fleets := coalesce(v_master->'fleets', '[]'::jsonb);

  -- Fallback from merchant_master.
  if jsonb_array_length(v_merchants) = 0 and to_regclass('public.merchant_master') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'value', coalesce(merchant_code, merchant_id, merchant_name),
          'id', coalesce(merchant_code, merchant_id, merchant_name),
          'code', coalesce(merchant_code, merchant_id),
          'name', merchant_name,
          'label', coalesce(merchant_code, merchant_id, '') || ' • ' || merchant_name
        ) order by merchant_name), '[]'::jsonb)
        from public.merchant_master
      $q$ into v_merchants;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'merchants', v_merchants,
    'townships', v_townships,
    'destinations', v_destinations,
    'riders', v_riders,
    'drivers', v_drivers,
    'helpers', v_helpers,
    'fleets', v_fleets,
    'pickupDates', jsonb_build_array(
      jsonb_build_object('value', to_char(current_date, 'YYYY-MM-DD'), 'label', to_char(current_date, 'YYYY-MM-DD')),
      jsonb_build_object('value', to_char(current_date + 1, 'YYYY-MM-DD'), 'label', to_char(current_date + 1, 'YYYY-MM-DD'))
    ),
    'statuses', jsonb_build_array('registered', 'data_entry_registered', 'pending_finance')
  );
end;
$$;

create or replace function public.be_data_entry_safe_numeric(p_value text, p_default numeric default 0)
returns numeric
language plpgsql
immutable
as $$
declare
  v numeric;
begin
  begin
    v := nullif(regexp_replace(coalesce(p_value, ''), '[^0-9.-]', '', 'g'), '')::numeric;
  exception when others then
    v := p_default;
  end;
  return coalesce(v, p_default);
end;
$$;

create or replace function public.be_data_entry_clean_code(p_value text, p_fallback text default 'GEN')
returns text
language sql
immutable
as $$
  select left(coalesce(nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g')), ''), p_fallback), 12);
$$;

create or replace function public.be_data_entry_make_pickup_id(
  p_pickup_date date,
  p_merchant_code text,
  p_parcel_count integer
)
returns text
language sql
stable
as $$
  select 'P' || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
      || '-' || public.be_data_entry_clean_code(p_merchant_code, 'GEN')
      || '-' || lpad(greatest(coalesce(p_parcel_count, 1), 1)::text, 3, '0');
$$;

create or replace function public.be_data_entry_make_delivery_id(
  p_pickup_date date,
  p_merchant_code text,
  p_row_seq integer
)
returns text
language sql
stable
as $$
  select 'D' || to_char(coalesce(p_pickup_date, current_date), 'MMDD')
      || '-' || public.be_data_entry_clean_code(p_merchant_code, 'GEN')
      || '-' || lpad(greatest(coalesce(p_row_seq, 1), 1)::text, 3, '0');
$$;

create or replace function public.be_data_entry_register_bulk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_source_file text := nullif(p_payload->>'source_file_name', '');
  v_uploaded_by text := nullif(p_payload->>'uploaded_by', '');
  v_uploaded_by_name text := nullif(p_payload->>'uploaded_by_name', '');
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_total integer := jsonb_array_length(v_rows);
  v_inserted integer := 0;
begin
  insert into public.be_data_entry_register_batches (
    batch_id, source_file_name, uploaded_by, uploaded_by_name, total_rows, status, payload
  )
  values (
    v_batch_id, v_source_file, v_uploaded_by, v_uploaded_by_name, v_total, 'registered', p_payload
  );

  create temp table if not exists __be_data_entry_upload_rows (
    row_no integer,
    raw jsonb
  ) on commit drop;

  truncate table __be_data_entry_upload_rows;

  insert into __be_data_entry_upload_rows (row_no, raw)
  select ordinality::integer, value
  from jsonb_array_elements(v_rows) with ordinality;

  with normalized as (
    select
      row_no,
      raw,
      coalesce(nullif(raw->>'pickup_date', '')::date, current_date) as pickup_date,
      public.be_data_entry_clean_code(coalesce(raw->>'merchant_code', raw->>'merchant_id', raw->>'merchant'), 'GEN') as merchant_code,
      coalesce(nullif(raw->>'merchant_name', ''), nullif(raw->>'merchant', ''), 'Merchant') as merchant_name,
      nullif(raw->>'recipient_name', '') as recipient_name,
      nullif(raw->>'recipient_phone', '') as recipient_phone,
      coalesce(nullif(raw->>'recipient_township', ''), nullif(raw->>'township', '')) as recipient_township,
      nullif(raw->>'recipient_address', '') as recipient_address,
      public.be_data_entry_safe_numeric(coalesce(raw->>'item_price', raw->>'itemPrice'), 0) as item_price,
      public.be_data_entry_safe_numeric(coalesce(raw->>'weight_kg', raw->>'weight'), 0) as weight_kg,
      coalesce(nullif(raw->>'destination', ''), nullif(raw->>'recipient_township', ''), nullif(raw->>'township', '')) as destination,
      nullif(raw->>'pickup_by_1', '') as pickup_by_1,
      nullif(raw->>'pickup_by_2', '') as pickup_by_2,
      nullif(raw->>'general_remarks', '') as general_remarks,
      nullif(raw->>'driver_rider', '') as driver_rider,
      nullif(raw->>'helper', '') as helper,
      nullif(raw->>'plate_no', '') as plate_no,
      nullif(raw->>'delivery_remarks', '') as delivery_remarks
    from __be_data_entry_upload_rows
  ),
  grouped as (
    select
      n.*,
      count(*) over (partition by pickup_date, merchant_code) as parcel_count,
      row_number() over (partition by pickup_date, merchant_code order by row_no) as delivery_seq
    from normalized n
  ),
  charges as (
    select
      g.*,
      case
        when g.destination is not null and g.destination <> '' and lower(g.destination) not in ('-', 'yangon') then 3000
        when g.recipient_township is null or g.recipient_township = '' then 0
        else 4000
      end::numeric as base_delivery_fee,
      case
        when coalesce(g.weight_kg, 0) > 5 then ceil(coalesce(g.weight_kg, 0) - 5) * 500
        else 0
      end::numeric as calc_surcharge
    from grouped g
  )
  insert into public.be_data_entry_register_rows (
    batch_id, row_no, source_file_name,
    overall_status, operation_status, financial_status,
    pickup_date, pickup_way_id, delivery_way_id,
    merchant_code, merchant_name,
    recipient_name, recipient_phone, recipient_township, recipient_address,
    item_price, delivery_fee_os, cod_os, std_deli, max_deli, weight_kg, surcharge, final_cod,
    destination, pickup_by_1, pickup_by_2, general_remarks,
    driver_rider, helper, plate_no, delivery_remarks,
    finance_deli, finance_cod, finance_status,
    validation_status, validation_errors, raw_row,
    created_by, created_by_name
  )
  select
    v_batch_id, row_no, v_source_file,
    'registered', 'data_entry_registered', 'pending_finance',
    pickup_date,
    public.be_data_entry_make_pickup_id(pickup_date, merchant_code, parcel_count),
    public.be_data_entry_make_delivery_id(pickup_date, merchant_code, delivery_seq),
    merchant_code, merchant_name,
    recipient_name, recipient_phone, recipient_township, recipient_address,
    item_price,
    base_delivery_fee,
    item_price + base_delivery_fee,
    base_delivery_fee,
    base_delivery_fee,
    weight_kg,
    calc_surcharge,
    item_price + base_delivery_fee + calc_surcharge,
    destination, pickup_by_1, pickup_by_2, general_remarks,
    driver_rider, helper, plate_no, delivery_remarks,
    base_delivery_fee,
    item_price + base_delivery_fee + calc_surcharge,
    'pending_finance',
    case when recipient_name is null or recipient_phone is null or recipient_township is null or recipient_address is null then 'warning' else 'valid' end,
    (
      select coalesce(jsonb_agg(err), '[]'::jsonb)
      from (
        select 'recipient_name missing' as err where recipient_name is null
        union all select 'recipient_phone missing' where recipient_phone is null
        union all select 'recipient_township missing' where recipient_township is null
        union all select 'recipient_address missing' where recipient_address is null
      ) e
    ),
    raw,
    v_uploaded_by,
    v_uploaded_by_name
  from charges
  on conflict (delivery_way_id) do update set
    batch_id = excluded.batch_id,
    source_file_name = excluded.source_file_name,
    recipient_name = excluded.recipient_name,
    recipient_phone = excluded.recipient_phone,
    recipient_township = excluded.recipient_township,
    recipient_address = excluded.recipient_address,
    item_price = excluded.item_price,
    delivery_fee_os = excluded.delivery_fee_os,
    cod_os = excluded.cod_os,
    std_deli = excluded.std_deli,
    max_deli = excluded.max_deli,
    weight_kg = excluded.weight_kg,
    surcharge = excluded.surcharge,
    final_cod = excluded.final_cod,
    destination = excluded.destination,
    pickup_by_1 = excluded.pickup_by_1,
    pickup_by_2 = excluded.pickup_by_2,
    general_remarks = excluded.general_remarks,
    driver_rider = excluded.driver_rider,
    helper = excluded.helper,
    plate_no = excluded.plate_no,
    delivery_remarks = excluded.delivery_remarks,
    finance_deli = excluded.finance_deli,
    finance_cod = excluded.finance_cod,
    validation_status = excluded.validation_status,
    validation_errors = excluded.validation_errors,
    raw_row = excluded.raw_row,
    updated_at = now();

  get diagnostics v_inserted = row_count;

  update public.be_data_entry_register_batches
  set
    valid_rows = (select count(*) from public.be_data_entry_register_rows where batch_id = v_batch_id and validation_status = 'valid'),
    rejected_rows = (select count(*) from public.be_data_entry_register_rows where batch_id = v_batch_id and validation_status <> 'valid'),
    updated_at = now()
  where batch_id = v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'total_rows', v_total,
    'upserted_rows', v_inserted,
    'status', 'registered'
  );
end;
$$;

create or replace function public.be_data_entry_register_snapshot(p_status text default null, p_limit integer default 300)
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.be_data_entry_register_rows),
      'valid', (select count(*) from public.be_data_entry_register_rows where validation_status = 'valid'),
      'warning', (select count(*) from public.be_data_entry_register_rows where validation_status = 'warning'),
      'finance_pending', (select count(*) from public.be_data_entry_register_rows where finance_status = 'pending_finance')
    ),
    'synced_at', now()
  )
  from (
    select *
    from public.be_data_entry_register_rows
    where p_status is null or validation_status = p_status or operation_status = p_status or finance_status = p_status
    order by created_at desc
    limit least(greatest(coalesce(p_limit,300),1),1000)
  ) x;
$$;

alter table public.be_data_entry_register_batches enable row level security;
alter table public.be_data_entry_register_rows enable row level security;

drop policy if exists be_data_entry_register_batches_all_auth on public.be_data_entry_register_batches;
drop policy if exists be_data_entry_register_rows_all_auth on public.be_data_entry_register_rows;

create policy be_data_entry_register_batches_all_auth on public.be_data_entry_register_batches for all to authenticated using (true) with check (true);
create policy be_data_entry_register_rows_all_auth on public.be_data_entry_register_rows for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.be_data_entry_register_batches to authenticated;
grant select, insert, update, delete on public.be_data_entry_register_rows to authenticated;
grant execute on function public.be_data_entry_excel_template_schema() to anon, authenticated;
grant execute on function public.be_data_entry_dropdown_snapshot() to anon, authenticated;
grant execute on function public.be_data_entry_safe_numeric(text,numeric) to anon, authenticated;
grant execute on function public.be_data_entry_clean_code(text,text) to anon, authenticated;
grant execute on function public.be_data_entry_make_pickup_id(date,text,integer) to anon, authenticated;
grant execute on function public.be_data_entry_make_delivery_id(date,text,integer) to anon, authenticated;
grant execute on function public.be_data_entry_register_bulk(jsonb) to authenticated;
grant execute on function public.be_data_entry_register_snapshot(text,integer) to authenticated;

notify pgrst, 'reload schema';

-- Smoke tests:
-- select public.be_data_entry_excel_template_schema();
-- select public.be_data_entry_dropdown_snapshot();
-- select public.be_data_entry_register_bulk('{"source_file_name":"test.xlsx","rows":[{"pickup_date":"2026-05-17","merchant":"BBG","merchant_name":"Baby Genius","recipient_name":"Ma Test","recipient_phone":"09","recipient_township":"ကမာရွတ်","recipient_address":"Test address","item_price":10000,"weight_kg":1}]}'::jsonb);
-- select public.be_data_entry_register_snapshot(null, 20);
