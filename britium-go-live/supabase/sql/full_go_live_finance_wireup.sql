
-- Britium Enterprise Full Go-Live Finance Wire-Up
-- Data Entry -> delivery_waybills -> COD -> Finance Settlement -> Journal/Reports
-- Run this entire file in Supabase SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

create or replace function public.be_gl_num(v text, d numeric default 0)
returns numeric language plpgsql immutable as $$
declare n numeric;
begin
  begin n := nullif(regexp_replace(coalesce(v,''),'[^0-9.-]','','g'),'')::numeric;
  exception when others then n := d;
  end;
  return coalesce(n,d);
end $$;

create or replace function public.be_gl_code(v text, d text default 'GEN')
returns text language sql immutable as $$
  select left(coalesce(nullif(upper(regexp_replace(coalesce(v,''),'[^A-Z0-9]','','g')),''),d),12)
$$;

create or replace function public.be_gl_pickup_id(p_date date, p_code text, p_count int)
returns text language sql stable as $$
  select 'P'||to_char(coalesce(p_date,current_date),'MMDD')||'-'||public.be_gl_code(p_code,'GEN')||'-'||lpad(greatest(coalesce(p_count,1),1)::text,3,'0')
$$;

create or replace function public.be_gl_delivery_id(p_date date, p_code text, p_seq int)
returns text language sql stable as $$
  select 'D'||to_char(coalesce(p_date,current_date),'MMDD')||'-'||public.be_gl_code(p_code,'GEN')||'-'||lpad(greatest(coalesce(p_seq,1),1)::text,3,'0')
$$;

-- 1) delivery_waybills must support the Excel Data Entry + Finance schema.
create table if not exists public.delivery_waybills (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text,
  pickup_way_id text,
  pickup_id text,
  pickup_date date,
  merchant text,
  merchant_code text,
  merchant_name text,
  recipient_name text,
  recipient_phone text,
  recipient_township text,
  recipient_address text,
  item_price numeric default 0,
  deli_fee_os numeric default 0,
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
  operation_status text default 'data_entry_registered',
  overall_status text default 'registered',
  financial_status text default 'pending_finance',
  validation_status text default 'valid',
  validation_errors jsonb default '[]'::jsonb,
  raw_row jsonb default '{}'::jsonb,
  created_by text,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.delivery_waybills
  add column if not exists delivery_way_id text,
  add column if not exists pickup_way_id text,
  add column if not exists pickup_id text,
  add column if not exists pickup_date date,
  add column if not exists merchant text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_township text,
  add column if not exists recipient_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists deli_fee_os numeric default 0,
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
  add column if not exists operation_status text default 'data_entry_registered',
  add column if not exists overall_status text default 'registered',
  add column if not exists financial_status text default 'pending_finance',
  add column if not exists validation_status text default 'valid',
  add column if not exists validation_errors jsonb default '[]'::jsonb,
  add column if not exists raw_row jsonb default '{}'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists delivery_waybills_delivery_way_id_uidx
on public.delivery_waybills(delivery_way_id) where delivery_way_id is not null and delivery_way_id <> '';
create index if not exists delivery_waybills_finance_status_idx on public.delivery_waybills(finance_status, created_at desc);

-- 2) Finance live tables.
create table if not exists public.be_enterprise_workflow_events (
  event_id uuid primary key default gen_random_uuid(),
  pickup_id text, pickup_way_id text, delivery_way_id text,
  event_type text not null, event_status text,
  actor_id text, actor_name text, actor_role text,
  source_module text, target_module text,
  amount numeric default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_cod_ledger (
  cod_id uuid primary key default gen_random_uuid(),
  pickup_id text, pickup_way_id text, delivery_way_id text,
  merchant_code text, merchant_name text, recipient_name text,
  rider_id text, rider_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  cod_status text default 'pending_collection',
  collected_at timestamptz, handed_over_at timestamptz,
  received_by text, received_by_name text,
  settlement_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.be_cod_ledger
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists collected_amount numeric default 0,
  add column if not exists handover_amount numeric default 0,
  add column if not exists variance_amount numeric default 0,
  add column if not exists cod_status text default 'pending_collection',
  add column if not exists collected_at timestamptz,
  add column if not exists handed_over_at timestamptz,
  add column if not exists received_by text,
  add column if not exists received_by_name text,
  add column if not exists settlement_id text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
create unique index if not exists be_cod_ledger_delivery_way_uidx on public.be_cod_ledger(delivery_way_id) where delivery_way_id is not null and delivery_way_id <> '';

create table if not exists public.be_financial_settlements (
  settlement_id text primary key default ('SET-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  pickup_id text, pickup_way_id text, delivery_way_id text,
  cod_id uuid,
  merchant_code text, merchant_name text, recipient_name text,
  delivery_fee numeric default 0,
  gross_cod numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  finance_deli numeric default 0,
  finance_cod numeric default 0,
  settlement_status text default 'pending_finance',
  finance_note text, closed_by text, closed_by_name text, closed_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.be_financial_settlements
  add column if not exists pickup_id text,
  add column if not exists pickup_way_id text,
  add column if not exists delivery_way_id text,
  add column if not exists cod_id uuid,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists recipient_name text,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists gross_cod numeric default 0,
  add column if not exists handover_amount numeric default 0,
  add column if not exists variance_amount numeric default 0,
  add column if not exists finance_deli numeric default 0,
  add column if not exists finance_cod numeric default 0,
  add column if not exists settlement_status text default 'pending_finance',
  add column if not exists finance_note text,
  add column if not exists closed_by text,
  add column if not exists closed_by_name text,
  add column if not exists closed_at timestamptz,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
create unique index if not exists be_financial_settlements_delivery_way_uidx on public.be_financial_settlements(delivery_way_id) where delivery_way_id is not null and delivery_way_id <> '';

create table if not exists public.be_finance_journal_entries (
  journal_id uuid primary key default gen_random_uuid(),
  journal_no text default ('JRN-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  source_module text, source_id text,
  delivery_way_id text, pickup_way_id text,
  account_code text, account_description text,
  debit numeric default 0, credit numeric default 0,
  branch text default 'YGN', zone text default 'Yangon',
  journal_status text default 'posted',
  payload jsonb default '{}'::jsonb,
  posted_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.be_customer_invoices (
  invoice_id text primary key default ('INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  merchant_code text, merchant_name text,
  pickup_way_id text, delivery_way_id text,
  invoice_date date default current_date,
  invoice_amount numeric default 0,
  delivery_fee numeric default 0,
  cod_amount numeric default 0,
  invoice_status text default 'issued',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists be_customer_invoices_delivery_way_uidx on public.be_customer_invoices(delivery_way_id) where delivery_way_id is not null and delivery_way_id <> '';

-- 3) Normalize waybill fields before save.
create or replace function public.be_delivery_waybill_normalize_biu()
returns trigger language plpgsql security definer as $$
declare fee numeric; item numeric; sur numeric;
begin
  fee := coalesce(nullif(new.deli_fee_os,0), nullif(new.delivery_fee_os,0), nullif(new.std_deli,0), 0);
  item := coalesce(new.item_price,0);
  sur := coalesce(new.surcharge,0);

  new.pickup_date := coalesce(new.pickup_date,current_date);
  new.merchant_code := public.be_gl_code(coalesce(new.merchant_code,new.merchant,new.merchant_name),'GEN');
  new.merchant_name := coalesce(nullif(new.merchant_name,''), nullif(new.merchant,''), new.merchant_code);
  new.pickup_way_id := coalesce(nullif(new.pickup_way_id,''), nullif(new.pickup_id,''), public.be_gl_pickup_id(new.pickup_date,new.merchant_code,1));
  new.pickup_id := coalesce(nullif(new.pickup_id,''), new.pickup_way_id);
  new.delivery_way_id := coalesce(nullif(new.delivery_way_id,''), public.be_gl_delivery_id(new.pickup_date,new.merchant_code,1));

  new.deli_fee_os := fee;
  new.delivery_fee_os := fee;
  new.std_deli := coalesce(nullif(new.std_deli,0), fee, 0);
  new.max_deli := coalesce(nullif(new.max_deli,0), fee, 0);
  new.cod_os := coalesce(nullif(new.cod_os,0), item + fee, 0);
  new.final_cod := coalesce(nullif(new.final_cod,0), item + fee + sur, 0);
  new.finance_deli := coalesce(nullif(new.finance_deli,0), fee, 0);
  new.finance_cod := coalesce(nullif(new.finance_cod,0), new.final_cod, 0);
  new.overall_status := coalesce(nullif(new.overall_status,''),'registered');
  new.operation_status := coalesce(nullif(new.operation_status,''),'data_entry_registered');
  new.financial_status := coalesce(nullif(new.financial_status,''),'pending_finance');
  new.finance_status := coalesce(nullif(new.finance_status,''),'pending_finance');
  new.validation_status := coalesce(nullif(new.validation_status,''),'valid');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists be_delivery_waybill_normalize_biu on public.delivery_waybills;
create trigger be_delivery_waybill_normalize_biu before insert or update on public.delivery_waybills
for each row execute function public.be_delivery_waybill_normalize_biu();

-- 4) Sync every waybill into COD, settlement, invoice and workflow event.
create or replace function public.be_sync_waybill_to_finance_aiu()
returns trigger language plpgsql security definer as $$
declare v_cod_id uuid; v_settlement_id text; v_invoice_id text;
begin
  insert into public.be_cod_ledger(
    pickup_id,pickup_way_id,delivery_way_id,merchant_code,merchant_name,recipient_name,
    cod_amount,cod_status,payload,updated_at
  )
  values(
    new.pickup_id,new.pickup_way_id,new.delivery_way_id,new.merchant_code,new.merchant_name,new.recipient_name,
    coalesce(new.finance_cod,new.final_cod,0),
    case when coalesce(new.finance_cod,new.final_cod,0) > 0 then 'pending_collection' else 'not_required' end,
    to_jsonb(new),now()
  )
  on conflict(delivery_way_id) do update set
    pickup_id=excluded.pickup_id,
    pickup_way_id=excluded.pickup_way_id,
    merchant_code=excluded.merchant_code,
    merchant_name=excluded.merchant_name,
    recipient_name=excluded.recipient_name,
    cod_amount=excluded.cod_amount,
    cod_status=case when public.be_cod_ledger.cod_status in ('handed_over_to_finance','finance_settled') then public.be_cod_ledger.cod_status else excluded.cod_status end,
    payload=coalesce(public.be_cod_ledger.payload,'{}'::jsonb)||excluded.payload,
    updated_at=now()
  returning cod_id into v_cod_id;

  insert into public.be_financial_settlements(
    pickup_id,pickup_way_id,delivery_way_id,cod_id,merchant_code,merchant_name,recipient_name,
    delivery_fee,gross_cod,finance_deli,finance_cod,settlement_status,payload,updated_at
  )
  values(
    new.pickup_id,new.pickup_way_id,new.delivery_way_id,v_cod_id,new.merchant_code,new.merchant_name,new.recipient_name,
    coalesce(new.finance_deli,new.deli_fee_os,0),
    coalesce(new.finance_cod,new.final_cod,0),
    coalesce(new.finance_deli,new.deli_fee_os,0),
    coalesce(new.finance_cod,new.final_cod,0),
    coalesce(new.finance_status,'pending_finance'),
    to_jsonb(new),now()
  )
  on conflict(delivery_way_id) do update set
    pickup_id=excluded.pickup_id,
    pickup_way_id=excluded.pickup_way_id,
    cod_id=excluded.cod_id,
    merchant_code=excluded.merchant_code,
    merchant_name=excluded.merchant_name,
    recipient_name=excluded.recipient_name,
    delivery_fee=excluded.delivery_fee,
    gross_cod=excluded.gross_cod,
    finance_deli=excluded.finance_deli,
    finance_cod=excluded.finance_cod,
    settlement_status=case when public.be_financial_settlements.settlement_status='finance_settled' then 'finance_settled' else excluded.settlement_status end,
    payload=coalesce(public.be_financial_settlements.payload,'{}'::jsonb)||excluded.payload,
    updated_at=now()
  returning settlement_id into v_settlement_id;

  update public.be_cod_ledger set settlement_id=coalesce(settlement_id,v_settlement_id) where cod_id=v_cod_id;

  insert into public.be_customer_invoices(
    merchant_code,merchant_name,pickup_way_id,delivery_way_id,invoice_amount,delivery_fee,cod_amount,invoice_status,payload,updated_at
  )
  values(
    new.merchant_code,new.merchant_name,new.pickup_way_id,new.delivery_way_id,
    coalesce(new.finance_deli,new.deli_fee_os,0),
    coalesce(new.finance_deli,new.deli_fee_os,0),
    coalesce(new.finance_cod,new.final_cod,0),
    'issued',to_jsonb(new),now()
  )
  on conflict(delivery_way_id) do update set
    merchant_code=excluded.merchant_code,
    merchant_name=excluded.merchant_name,
    pickup_way_id=excluded.pickup_way_id,
    invoice_amount=excluded.invoice_amount,
    delivery_fee=excluded.delivery_fee,
    cod_amount=excluded.cod_amount,
    payload=coalesce(public.be_customer_invoices.payload,'{}'::jsonb)||excluded.payload,
    updated_at=now()
  returning invoice_id into v_invoice_id;

  insert into public.be_enterprise_workflow_events(
    pickup_id,pickup_way_id,delivery_way_id,event_type,event_status,source_module,target_module,amount,payload
  )
  values(
    new.pickup_id,new.pickup_way_id,new.delivery_way_id,'DATA_ENTRY_TO_FINANCE_SYNC',
    coalesce(new.finance_status,'pending_finance'),'data_entry','finance',
    coalesce(new.finance_cod,new.final_cod,0),
    jsonb_build_object('cod_id',v_cod_id,'settlement_id',v_settlement_id,'invoice_id',v_invoice_id)
  );

  return new;
end $$;

drop trigger if exists be_delivery_waybill_finance_aiu on public.delivery_waybills;
create trigger be_delivery_waybill_finance_aiu after insert or update on public.delivery_waybills
for each row execute function public.be_sync_waybill_to_finance_aiu();

-- 5) Replace Data Entry bulk RPC so it writes delivery_waybills and auto-syncs finance.
create table if not exists public.be_data_entry_register_batches(
  batch_id uuid primary key default gen_random_uuid(),
  batch_no text default ('DER-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  source_file_name text, uploaded_by text, uploaded_by_name text,
  total_rows int default 0, valid_rows int default 0, rejected_rows int default 0,
  status text default 'registered', payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.be_data_entry_register_rows(
  row_id uuid primary key default gen_random_uuid(),
  batch_id uuid, row_no int, source_file_name text,
  pickup_date date, pickup_way_id text, delivery_way_id text,
  merchant_code text, merchant_name text,
  recipient_name text, recipient_phone text, recipient_township text, recipient_address text,
  item_price numeric default 0, deli_fee_os numeric default 0, delivery_fee_os numeric default 0,
  cod_os numeric default 0, std_deli numeric default 0, max_deli numeric default 0, weight_kg numeric default 0,
  surcharge numeric default 0, final_cod numeric default 0,
  destination text, pickup_by_1 text, pickup_by_2 text, general_remarks text, driver_rider text, helper text, plate_no text, delivery_remarks text,
  finance_deli numeric default 0, finance_cod numeric default 0, finance_received_by text, finance_status text default 'pending_finance',
  operation_status text default 'data_entry_registered', overall_status text default 'registered', financial_status text default 'pending_finance',
  validation_status text default 'valid', validation_errors jsonb default '[]'::jsonb, raw_row jsonb default '{}'::jsonb,
  created_by text, created_by_name text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists be_data_entry_register_rows_delivery_way_uidx on public.be_data_entry_register_rows(delivery_way_id) where delivery_way_id is not null and delivery_way_id <> '';

create or replace function public.be_data_entry_register_bulk(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_batch uuid := gen_random_uuid();
  v_rows jsonb := coalesce(p_payload->'rows','[]'::jsonb);
  v_total int := jsonb_array_length(v_rows);
  v_upserted int := 0;
begin
  insert into public.be_data_entry_register_batches(batch_id,source_file_name,uploaded_by,uploaded_by_name,total_rows,status,payload)
  values(v_batch,p_payload->>'source_file_name',p_payload->>'uploaded_by',p_payload->>'uploaded_by_name',v_total,'registered',p_payload);

  create temp table if not exists __gl_rows(row_no int, raw jsonb) on commit drop;
  truncate __gl_rows;
  insert into __gl_rows
  select ordinality::int, value from jsonb_array_elements(v_rows) with ordinality;

  create temp table if not exists __gl_prepared as select * from public.delivery_waybills limit 0;
  truncate __gl_prepared;

  insert into __gl_prepared(
    pickup_date,pickup_way_id,pickup_id,delivery_way_id,merchant,merchant_code,merchant_name,
    recipient_name,recipient_phone,recipient_township,recipient_address,
    item_price,deli_fee_os,delivery_fee_os,cod_os,std_deli,max_deli,weight_kg,surcharge,final_cod,
    destination,pickup_by_1,pickup_by_2,general_remarks,driver_rider,helper,plate_no,delivery_remarks,
    finance_deli,finance_cod,finance_received_by,finance_status,operation_status,overall_status,financial_status,
    validation_status,validation_errors,raw_row,created_by,created_by_name
  )
  with n as (
    select
      row_no, raw,
      coalesce(nullif(raw->>'pickup_date','')::date,current_date) as pickup_date,
      public.be_gl_code(coalesce(raw->>'merchant_code',raw->>'merchant_id',raw->>'merchant',raw->>'merchant_name'),'GEN') as mcode,
      coalesce(nullif(raw->>'merchant_name',''),nullif(raw->>'merchant',''),'Merchant') as mname,
      nullif(raw->>'recipient_name','') as rname,
      nullif(raw->>'recipient_phone','') as rphone,
      coalesce(nullif(raw->>'recipient_township',''),nullif(raw->>'township','')) as rtown,
      nullif(raw->>'recipient_address','') as raddr,
      public.be_gl_num(coalesce(raw->>'item_price',raw->>'itemPrice'),0) as item,
      public.be_gl_num(coalesce(raw->>'weight_kg',raw->>'weight'),0) as wt,
      coalesce(nullif(raw->>'destination',''),nullif(raw->>'recipient_township',''),nullif(raw->>'township','')) as dest
    from __gl_rows
  ),
  g as (
    select n.*, count(*) over(partition by pickup_date,mcode) as parcel_count,
           row_number() over(partition by pickup_date,mcode order by row_no) as seq
    from n
  ),
  c as (
    select *,
      coalesce(nullif(public.be_gl_num(coalesce(raw->>'deli_fee_os',raw->>'delivery_fee_os',raw->>'delivery_fee'),0),0), case when dest is not null and lower(dest) not in ('','-','yangon') then 3000 else 4000 end)::numeric as fee,
      case when wt > 5 then ceil(wt-5)*500 else 0 end::numeric as sur
    from g
  )
  select
    pickup_date,
    coalesce(nullif(raw->>'pickup_way_id',''),public.be_gl_pickup_id(pickup_date,mcode,parcel_count)),
    coalesce(nullif(raw->>'pickup_way_id',''),public.be_gl_pickup_id(pickup_date,mcode,parcel_count)),
    coalesce(nullif(raw->>'delivery_way_id',''),public.be_gl_delivery_id(pickup_date,mcode,seq)),
    mname,mcode,mname,
    rname,rphone,rtown,raddr,
    item,fee,fee,item+fee,fee,fee,wt,sur,item+fee+sur,
    dest,raw->>'pickup_by_1',raw->>'pickup_by_2',raw->>'general_remarks',raw->>'driver_rider',raw->>'helper',raw->>'plate_no',raw->>'delivery_remarks',
    fee,item+fee+sur,raw->>'finance_received_by','pending_finance','data_entry_registered','registered','pending_finance',
    case when rname is null or rphone is null or rtown is null or raddr is null then 'warning' else 'valid' end,
    (
      select coalesce(jsonb_agg(err),'[]'::jsonb)
      from (
        select 'recipient_name missing' err where rname is null
        union all select 'recipient_phone missing' where rphone is null
        union all select 'recipient_township missing' where rtown is null
        union all select 'recipient_address missing' where raddr is null
      ) e
    ),
    raw,p_payload->>'uploaded_by',p_payload->>'uploaded_by_name'
  from c;

  insert into public.delivery_waybills(
    pickup_date,pickup_way_id,pickup_id,delivery_way_id,merchant,merchant_code,merchant_name,
    recipient_name,recipient_phone,recipient_township,recipient_address,
    item_price,deli_fee_os,delivery_fee_os,cod_os,std_deli,max_deli,weight_kg,surcharge,final_cod,
    destination,pickup_by_1,pickup_by_2,general_remarks,driver_rider,helper,plate_no,delivery_remarks,
    finance_deli,finance_cod,finance_received_by,finance_status,operation_status,overall_status,financial_status,
    validation_status,validation_errors,raw_row,created_by,created_by_name
  )
  select
    pickup_date,pickup_way_id,pickup_id,delivery_way_id,merchant,merchant_code,merchant_name,
    recipient_name,recipient_phone,recipient_township,recipient_address,
    item_price,deli_fee_os,delivery_fee_os,cod_os,std_deli,max_deli,weight_kg,surcharge,final_cod,
    destination,pickup_by_1,pickup_by_2,general_remarks,driver_rider,helper,plate_no,delivery_remarks,
    finance_deli,finance_cod,finance_received_by,finance_status,operation_status,overall_status,financial_status,
    validation_status,validation_errors,raw_row,created_by,created_by_name
  from __gl_prepared
  on conflict(delivery_way_id) do update set
    pickup_date=excluded.pickup_date,pickup_way_id=excluded.pickup_way_id,pickup_id=excluded.pickup_id,
    merchant=excluded.merchant,merchant_code=excluded.merchant_code,merchant_name=excluded.merchant_name,
    recipient_name=excluded.recipient_name,recipient_phone=excluded.recipient_phone,recipient_township=excluded.recipient_township,recipient_address=excluded.recipient_address,
    item_price=excluded.item_price,deli_fee_os=excluded.deli_fee_os,delivery_fee_os=excluded.delivery_fee_os,cod_os=excluded.cod_os,std_deli=excluded.std_deli,max_deli=excluded.max_deli,weight_kg=excluded.weight_kg,surcharge=excluded.surcharge,final_cod=excluded.final_cod,
    destination=excluded.destination,pickup_by_1=excluded.pickup_by_1,pickup_by_2=excluded.pickup_by_2,general_remarks=excluded.general_remarks,driver_rider=excluded.driver_rider,helper=excluded.helper,plate_no=excluded.plate_no,delivery_remarks=excluded.delivery_remarks,
    finance_deli=excluded.finance_deli,finance_cod=excluded.finance_cod,finance_received_by=excluded.finance_received_by,finance_status=excluded.finance_status,
    validation_status=excluded.validation_status,validation_errors=excluded.validation_errors,raw_row=excluded.raw_row,updated_at=now();

  get diagnostics v_upserted = row_count;

  insert into public.be_data_entry_register_rows(
    batch_id,row_no,source_file_name,pickup_date,pickup_way_id,delivery_way_id,merchant_code,merchant_name,
    recipient_name,recipient_phone,recipient_township,recipient_address,item_price,deli_fee_os,delivery_fee_os,cod_os,std_deli,max_deli,weight_kg,surcharge,final_cod,
    destination,pickup_by_1,pickup_by_2,general_remarks,driver_rider,helper,plate_no,delivery_remarks,
    finance_deli,finance_cod,finance_received_by,finance_status,operation_status,overall_status,financial_status,validation_status,validation_errors,raw_row,created_by,created_by_name
  )
  select
    v_batch,row_number() over(order by delivery_way_id),p_payload->>'source_file_name',pickup_date,pickup_way_id,delivery_way_id,merchant_code,merchant_name,
    recipient_name,recipient_phone,recipient_township,recipient_address,item_price,deli_fee_os,delivery_fee_os,cod_os,std_deli,max_deli,weight_kg,surcharge,final_cod,
    destination,pickup_by_1,pickup_by_2,general_remarks,driver_rider,helper,plate_no,delivery_remarks,
    finance_deli,finance_cod,finance_received_by,finance_status,operation_status,overall_status,financial_status,validation_status,validation_errors,raw_row,created_by,created_by_name
  from __gl_prepared
  on conflict(delivery_way_id) do update set
    batch_id=excluded.batch_id, item_price=excluded.item_price, deli_fee_os=excluded.deli_fee_os, finance_cod=excluded.finance_cod, raw_row=excluded.raw_row, updated_at=now();

  update public.be_data_entry_register_batches
  set valid_rows=(select count(*) from public.be_data_entry_register_rows where batch_id=v_batch and validation_status='valid'),
      rejected_rows=(select count(*) from public.be_data_entry_register_rows where batch_id=v_batch and validation_status<>'valid'),
      updated_at=now()
  where batch_id=v_batch;

  return jsonb_build_object('ok',true,'batch_id',v_batch,'total_rows',v_total,'upserted_rows',v_upserted,'synced_to_delivery_waybills',true,'synced_to_finance',true);
end $$;

-- 6) Finance actions and dashboards.
create or replace function public.be_go_live_finance_backfill()
returns jsonb language plpgsql security definer as $$
declare c int;
begin
  update public.delivery_waybills set updated_at=now() where delivery_way_id is not null;
  get diagnostics c = row_count;
  return jsonb_build_object('ok',true,'delivery_waybills_touched',c,'cod_ledger_rows',(select count(*) from public.be_cod_ledger),'settlement_rows',(select count(*) from public.be_financial_settlements),'invoice_rows',(select count(*) from public.be_customer_invoices));
end $$;

create or replace function public.be_cod_mark_collected(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_way text := nullif(coalesce(p_payload->>'delivery_way_id',p_payload->>'way_id'),''); v_amt numeric := coalesce(nullif(p_payload->>'amount','')::numeric,nullif(p_payload->>'collected_amount','')::numeric,0); v_id uuid;
begin
  update public.be_cod_ledger
  set collected_amount=case when v_amt>0 then v_amt else cod_amount end,
      variance_amount=(case when v_amt>0 then v_amt else cod_amount end)-cod_amount,
      cod_status='collected',
      collected_at=now(),
      rider_id=coalesce(nullif(p_payload->>'rider_id',''),rider_id),
      rider_name=coalesce(nullif(p_payload->>'rider_name',''),rider_name),
      payload=coalesce(payload,'{}'::jsonb)||p_payload,
      updated_at=now()
  where delivery_way_id=v_way
  returning cod_id into v_id;
  if v_id is null then raise exception 'COD ledger row not found for %', v_way; end if;
  return jsonb_build_object('ok',true,'cod_id',v_id,'status','collected');
end $$;

create or replace function public.be_cod_mark_handover(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_way text := nullif(coalesce(p_payload->>'delivery_way_id',p_payload->>'way_id'),''); v_amt numeric := coalesce(nullif(p_payload->>'amount','')::numeric,nullif(p_payload->>'handover_amount','')::numeric,0); v_id uuid; v_set text;
begin
  update public.be_cod_ledger
  set handover_amount=case when v_amt>0 then v_amt else coalesce(nullif(collected_amount,0),cod_amount) end,
      variance_amount=(case when v_amt>0 then v_amt else coalesce(nullif(collected_amount,0),cod_amount) end)-cod_amount,
      cod_status='handed_over_to_finance',
      handed_over_at=now(),
      received_by=coalesce(nullif(p_payload->>'received_by',''),received_by),
      received_by_name=coalesce(nullif(p_payload->>'received_by_name',''),received_by_name),
      payload=coalesce(payload,'{}'::jsonb)||p_payload,
      updated_at=now()
  where delivery_way_id=v_way
  returning cod_id, settlement_id into v_id, v_set;
  if v_id is null then raise exception 'COD ledger row not found for %', v_way; end if;

  update public.be_financial_settlements s
  set handover_amount=c.handover_amount, variance_amount=c.variance_amount, settlement_status='pending_finance', updated_at=now(), payload=coalesce(s.payload,'{}'::jsonb)||p_payload
  from public.be_cod_ledger c
  where s.delivery_way_id=c.delivery_way_id and c.cod_id=v_id
  returning s.settlement_id into v_set;

  return jsonb_build_object('ok',true,'cod_id',v_id,'settlement_id',v_set,'status','pending_finance');
end $$;

create or replace function public.be_finance_close_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_set text := nullif(p_payload->>'settlement_id',''); v_way text := nullif(coalesce(p_payload->>'delivery_way_id',p_payload->>'way_id'),''); v_final_way text; v_amt numeric;
begin
  update public.be_financial_settlements
  set settlement_status='finance_settled',
      finance_note=nullif(p_payload->>'finance_note',''),
      closed_by=nullif(p_payload->>'closed_by',''),
      closed_by_name=nullif(p_payload->>'closed_by_name',''),
      closed_at=now(),
      payload=coalesce(payload,'{}'::jsonb)||p_payload,
      updated_at=now()
  where (v_set is not null and settlement_id=v_set) or (v_way is not null and delivery_way_id=v_way)
  returning delivery_way_id, gross_cod into v_final_way, v_amt;
  if v_final_way is null then raise exception 'Settlement not found'; end if;

  update public.be_cod_ledger set cod_status='finance_settled', updated_at=now() where delivery_way_id=v_final_way;
  update public.delivery_waybills set finance_status='finance_settled', financial_status='finance_settled', finance_received_by=coalesce(p_payload->>'closed_by_name',finance_received_by), updated_at=now() where delivery_way_id=v_final_way;

  insert into public.be_finance_journal_entries(source_module,source_id,delivery_way_id,account_code,account_description,debit,credit,payload)
  values
    ('finance_settlement',coalesce(v_set,v_final_way),v_final_way,'1001','Cash / Bank Received',coalesce(v_amt,0),0,p_payload),
    ('finance_settlement',coalesce(v_set,v_final_way),v_final_way,'4001','Delivery / COD Revenue Settlement',0,coalesce(v_amt,0),p_payload);

  return jsonb_build_object('ok',true,'delivery_way_id',v_final_way,'status','finance_settled');
end $$;

create or replace function public.be_finance_snapshot(p_status text default null, p_limit int default 300)
returns jsonb language plpgsql security definer as $$
declare v_status text := nullif(trim(coalesce(p_status,'')),''); v_limit int := least(greatest(coalesce(p_limit,300),1),1000); cod jsonb; settlements jsonb; invoices jsonb; journal jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb) into cod from (select * from public.be_cod_ledger where v_status is null or cod_status=v_status order by updated_at desc limit v_limit) x;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb) into settlements from (select * from public.be_financial_settlements where v_status is null or settlement_status=v_status order by updated_at desc limit v_limit) x;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb) into invoices from (select * from public.be_customer_invoices order by updated_at desc limit v_limit) x;
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc),'[]'::jsonb) into journal from (select * from public.be_finance_journal_entries order by created_at desc limit v_limit) x;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'waybills',(select count(*) from public.delivery_waybills),
      'cod_pending',(select count(*) from public.be_cod_ledger where cod_status in ('pending_collection','collected')),
      'cod_handed_over',(select count(*) from public.be_cod_ledger where cod_status='handed_over_to_finance'),
      'finance_pending',(select count(*) from public.be_financial_settlements where settlement_status='pending_finance'),
      'finance_settled',(select count(*) from public.be_financial_settlements where settlement_status='finance_settled'),
      'total_receivable',(select coalesce(sum(gross_cod),0) from public.be_financial_settlements),
      'total_handover',(select coalesce(sum(handover_amount),0) from public.be_financial_settlements),
      'variance',(select coalesce(sum(variance_amount),0) from public.be_financial_settlements),
      'delivery_fee_income',(select coalesce(sum(finance_deli),0) from public.be_financial_settlements)
    ),
    'cod_rows', cod,
    'settlements', settlements,
    'invoices', invoices,
    'journal', journal,
    'reports', jsonb_build_object(
      'cashBookSummary', jsonb_build_array(jsonb_build_object('branch','YGN','zone','Yangon','report_date',current_date,'account_description','Cash / COD Handover','received',(select coalesce(sum(handover_amount),0) from public.be_cod_ledger),'payment',0,'opening_balance',0,'closing_balance',(select coalesce(sum(handover_amount),0) from public.be_cod_ledger))),
      'incomeStatement', jsonb_build_array(jsonb_build_object('code_no','4001','description','Delivery Fee Income','category','income','amount',(select coalesce(sum(finance_deli),0) from public.be_financial_settlements)),jsonb_build_object('code_no','4002','description','COD Settlement','category','income','amount',(select coalesce(sum(finance_cod),0) from public.be_financial_settlements))),
      'profitAndLoss', jsonb_build_array(jsonb_build_object('code_no','4000','description','Operating Revenue','category','income','amount',(select coalesce(sum(finance_deli),0) from public.be_financial_settlements),'cumulative_year_to_date',(select coalesce(sum(finance_deli),0) from public.be_financial_settlements)))
    ),
    'synced_at', now()
  );
end $$;

create or replace function public.be_go_live_readiness_snapshot()
returns jsonb language sql security definer as $$
  with checks as (
    select 'delivery_waybills_schema' check_code,
           exists(select 1 from information_schema.columns where table_schema='public' and table_name='delivery_waybills' and column_name='deli_fee_os')
           and exists(select 1 from information_schema.columns where table_schema='public' and table_name='delivery_waybills' and column_name='finance_status') passed,
           'delivery_waybills has Excel and Finance columns' message
    union all
    select 'finance_tables',
           to_regclass('public.be_cod_ledger') is not null and to_regclass('public.be_financial_settlements') is not null and to_regclass('public.be_finance_journal_entries') is not null,
           'COD, settlement and journal tables exist'
    union all
    select 'finance_rpc',
           to_regprocedure('public.be_finance_snapshot(text,integer)') is not null and to_regprocedure('public.be_finance_close_settlement(jsonb)') is not null,
           'Finance RPCs exist'
    union all
    select 'data_entry_to_finance_sync',
           (select count(*) from public.delivery_waybills where delivery_way_id is not null)=0 or
           (select count(*) from public.be_financial_settlements) >= (select count(*) from public.delivery_waybills where delivery_way_id is not null),
           'Every delivery waybill should have a settlement row'
  )
  select jsonb_build_object('checks',coalesce(jsonb_agg(row_to_json(checks)::jsonb),'[]'::jsonb),'passed',bool_and(passed),'kpis',public.be_finance_snapshot(null,50)->'kpis','synced_at',now()) from checks;
$$;

create or replace function public.be_go_live_purge_mock_data()
returns jsonb language plpgsql security definer as $$
declare d jsonb := '[]'::jsonb; c int;
begin
  delete from public.delivery_waybills where lower(coalesce(raw_row->>'source','')) in ('mock','sample','demo') or upper(coalesce(delivery_way_id,'')) like 'MOCK%' or upper(coalesce(delivery_way_id,'')) like 'SAMPLE%';
  get diagnostics c=row_count; d:=d||jsonb_build_object('table','delivery_waybills','rows',c);
  delete from public.be_cod_ledger where lower(coalesce(payload->>'source','')) in ('mock','sample','demo') or upper(coalesce(delivery_way_id,'')) like 'MOCK%' or upper(coalesce(delivery_way_id,'')) like 'SAMPLE%';
  get diagnostics c=row_count; d:=d||jsonb_build_object('table','be_cod_ledger','rows',c);
  delete from public.be_financial_settlements where lower(coalesce(payload->>'source','')) in ('mock','sample','demo') or upper(coalesce(delivery_way_id,'')) like 'MOCK%' or upper(coalesce(delivery_way_id,'')) like 'SAMPLE%';
  get diagnostics c=row_count; d:=d||jsonb_build_object('table','be_financial_settlements','rows',c);
  return jsonb_build_object('ok',true,'deleted',d);
end $$;

-- 7) Permissions and schema reload.
alter table public.delivery_waybills enable row level security;
alter table public.be_enterprise_workflow_events enable row level security;
alter table public.be_cod_ledger enable row level security;
alter table public.be_financial_settlements enable row level security;
alter table public.be_finance_journal_entries enable row level security;
alter table public.be_customer_invoices enable row level security;
alter table public.be_data_entry_register_batches enable row level security;
alter table public.be_data_entry_register_rows enable row level security;

drop policy if exists delivery_waybills_all_auth on public.delivery_waybills;
drop policy if exists be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events;
drop policy if exists be_cod_ledger_all_auth on public.be_cod_ledger;
drop policy if exists be_financial_settlements_all_auth on public.be_financial_settlements;
drop policy if exists be_finance_journal_entries_all_auth on public.be_finance_journal_entries;
drop policy if exists be_customer_invoices_all_auth on public.be_customer_invoices;
drop policy if exists be_data_entry_register_batches_all_auth on public.be_data_entry_register_batches;
drop policy if exists be_data_entry_register_rows_all_auth on public.be_data_entry_register_rows;

create policy delivery_waybills_all_auth on public.delivery_waybills for all to authenticated using (true) with check (true);
create policy be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events for all to authenticated using (true) with check (true);
create policy be_cod_ledger_all_auth on public.be_cod_ledger for all to authenticated using (true) with check (true);
create policy be_financial_settlements_all_auth on public.be_financial_settlements for all to authenticated using (true) with check (true);
create policy be_finance_journal_entries_all_auth on public.be_finance_journal_entries for all to authenticated using (true) with check (true);
create policy be_customer_invoices_all_auth on public.be_customer_invoices for all to authenticated using (true) with check (true);
create policy be_data_entry_register_batches_all_auth on public.be_data_entry_register_batches for all to authenticated using (true) with check (true);
create policy be_data_entry_register_rows_all_auth on public.be_data_entry_register_rows for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.delivery_waybills to authenticated;
grant select, insert, update, delete on public.be_enterprise_workflow_events to authenticated;
grant select, insert, update, delete on public.be_cod_ledger to authenticated;
grant select, insert, update, delete on public.be_financial_settlements to authenticated;
grant select, insert, update, delete on public.be_finance_journal_entries to authenticated;
grant select, insert, update, delete on public.be_customer_invoices to authenticated;
grant select, insert, update, delete on public.be_data_entry_register_batches to authenticated;
grant select, insert, update, delete on public.be_data_entry_register_rows to authenticated;

grant execute on function public.be_data_entry_register_bulk(jsonb) to authenticated;
grant execute on function public.be_go_live_finance_backfill() to authenticated;
grant execute on function public.be_cod_mark_collected(jsonb) to authenticated;
grant execute on function public.be_cod_mark_handover(jsonb) to authenticated;
grant execute on function public.be_finance_close_settlement(jsonb) to authenticated;
grant execute on function public.be_finance_snapshot(text,integer) to authenticated;
grant execute on function public.be_go_live_readiness_snapshot() to authenticated;
grant execute on function public.be_go_live_purge_mock_data() to authenticated;

select public.be_go_live_finance_backfill();

notify pgrst, 'reload schema';
