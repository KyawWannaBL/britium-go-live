-- Buildfix #30: Complete Enterprise Workflow Wireup
-- Master Data -> CS/Merchant/Customer Pickup -> IDs -> Supervisor -> Rider -> Warehouse -> Finance.
-- Safe to rerun in Supabase SQL Editor.

begin;
create extension if not exists pgcrypto;

create table if not exists public.be_portal_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  requester_type text not null default 'merchant',
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  pickup_township text,
  pickup_city text,
  assigned_branch text default 'YGN',
  payment_terms text default 'COD',
  tariff_code text default 'Standard',
  parcel_count integer default 1,
  cod_amount numeric default 0,
  status text default 'data_entry_in_progress',
  source text default 'customer_service',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_portal_pickup_requests
  add column if not exists pickup_way_id text,
  add column if not exists requester_type text,
  add column if not exists deliver_id text,
  add column if not exists invoice_no text,
  add column if not exists waybill_no text,
  add column if not exists assignment_status text,
  add column if not exists assigned_rider_code text,
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_code text,
  add column if not exists assigned_helper_code text,
  add column if not exists assigned_by text,
  add column if not exists assigned_at timestamptz,
  add column if not exists route_zone text,
  add column if not exists warehouse_status text,
  add column if not exists rider_status text,
  add column if not exists cod_status text,
  add column if not exists finance_status text,
  add column if not exists pickup_proof jsonb,
  add column if not exists delivery_proof jsonb;

alter table public.be_portal_pickup_requests alter column requester_type set default 'merchant';
update public.be_portal_pickup_requests
set requester_type = coalesce(nullif(requester_type,''),'merchant'),
    payload = coalesce(payload, '{}'::jsonb),
    updated_at = coalesce(updated_at, now())
where requester_type is null or requester_type = '' or payload is null or updated_at is null;

create table if not exists public.be_portal_cargo_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  event_type text,
  status text,
  actor_role text,
  actor_code text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_app_notifications (
  id uuid primary key default gen_random_uuid(),
  target_role text,
  target_branch text,
  pickup_id text,
  title text,
  message text,
  source_table text default 'be_portal_pickup_requests',
  source_key text,
  is_read boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_mobile_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  task_type text not null default 'pickup',
  assignee_role text not null default 'rider',
  assignee_code text,
  assignee_name text,
  status text not null default 'assigned',
  route_zone text,
  branch_code text,
  payload jsonb default '{}'::jsonb,
  assigned_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists be30_mobile_task_uidx on public.be_mobile_workflow_tasks(pickup_id, task_type, assignee_role, assignee_code);

create table if not exists public.be_warehouse_scans (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  waybill_no text,
  scan_type text,
  warehouse_branch text,
  operator_code text,
  bag_code text,
  route_zone text,
  expected_parcel_count integer,
  scanned_parcel_count integer,
  status text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_invoice_ledger (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  pickup_id text,
  deliver_id text,
  waybill_no text,
  merchant_code text,
  merchant_name text,
  shipment_count integer default 0,
  cod_collected numeric default 0,
  delivery_charges numeric default 0,
  net_payable numeric default 0,
  status text default 'draft',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_waybill_ledger (
  id uuid primary key default gen_random_uuid(),
  waybill_no text unique,
  pickup_id text,
  deliver_id text,
  invoice_no text,
  merchant_code text,
  merchant_name text,
  parcel_count integer default 0,
  cod_amount numeric default 0,
  status text default 'printed',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique,
  deliver_id text,
  invoice_no text,
  waybill_no text,
  rider_code text,
  merchant_code text,
  cod_expected numeric default 0,
  cod_collected numeric default 0,
  cod_handed_over numeric default 0,
  status text default 'pending_collection',
  settlement_ref text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_rider_handover_ledger (
  id uuid primary key default gen_random_uuid(),
  settlement_ref text unique,
  rider_code text,
  shift_date date default current_date,
  route_zone text,
  merchant_code text,
  total_delivered_parcels integer default 0,
  total_cod_expected numeric default 0,
  total_cash_received numeric default 0,
  shortage_excess numeric default 0,
  verified_by text,
  verification_time timestamptz,
  status text default 'submitted',
  notes text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists zzzzz_force_unique_pickup_way_id on public.be_portal_pickup_requests;
drop trigger if exists zzzzz_force_canonical_pickup_id on public.be_portal_pickup_requests;
drop trigger if exists zzzzz_be30_force_canonical_ids on public.be_portal_pickup_requests;
drop function if exists public.zzzz_force_unique_pickup_way_id();
drop function if exists public.zzzz_force_canonical_pickup_id();
drop function if exists public.zzzz_be30_force_canonical_ids();
drop function if exists public.be_next_cs_pickup_id(text);
drop function if exists public.be_next_cs_pickup_id(text,date);
drop function if exists public.be_next_cs_pickup_id(text,date,integer);
drop function if exists public.be_submit_pickup_request(jsonb);
drop function if exists public.be_customer_service_snapshot();
drop function if exists public.be_customer_service_pickup_requests(integer);
drop function if exists public.be_supervisor_pickup_queue(integer);
drop function if exists public.be_supervisor_snapshot();
drop function if exists public.be_supervisor_assign_job(jsonb);
drop function if exists public.be_mobile_go_live_snapshot(text,text,integer);
drop function if exists public.be_rider_update_job_status(jsonb);
drop function if exists public.be_mobile_update_job_status(jsonb);
drop function if exists public.be_warehouse_scan(jsonb);
drop function if exists public.be_cod_handover_submit(jsonb);
drop function if exists public.be_finance_verify_handover(jsonb);
drop function if exists public.be_finance_workflow_snapshot();
drop function if exists public.be_go_live_system_readiness();
drop function if exists public.be_go_live_readiness_snapshot();
drop function if exists public.be_process_router(text,jsonb);

create or replace function public.be30_clean(p text)
returns text language plpgsql immutable as $$
declare v text;
begin
  v := nullif(btrim(coalesce(p,'')), '');
  if v is null or lower(v) in ('null','undefined','none','n/a','na','unknown','missing','no pickup address','no address','not set','-') then return null; end if;
  return v;
end; $$;

create or replace function public.be_clean_text(p text)
returns text language sql immutable as $$ select public.be30_clean(p); $$;

create or replace function public.be30_jtext(j jsonb, keys text[])
returns text language plpgsql immutable as $$
declare k text; v text;
begin
  foreach k in array keys loop
    v := public.be30_clean(j->>k);
    if v is not null then return v; end if;
  end loop;
  return null;
end; $$;

create or replace function public.be_json_first_text(j jsonb, keys text[])
returns text language sql immutable as $$ select public.be30_jtext(j, keys); $$;

create or replace function public.be_resolve_branch_from_location(city text, township text, addr text, fallback text default 'YGN')
returns text language plpgsql immutable as $$
declare h text := lower(coalesce(city,'')||' '||coalesce(township,'')||' '||coalesce(addr,''));
begin
  if h like '%mandalay%' or h like '%မန္တလေး%' then return 'MDY'; end if;
  if h like '%naypyitaw%' or h like '%nay pyi taw%' or h like '%naypyidaw%' or h like '%နေပြည်တော်%' then return 'NPT'; end if;
  return coalesce(public.be30_clean(fallback), 'YGN');
end; $$;

create or replace function public.be30_pickup_date(payload jsonb)
returns date language plpgsql immutable as $$
declare d text;
begin
  d := public.be30_clean(coalesce(payload->>'pickup_date', payload->>'request_date', payload->>'scheduled_pickup_date'));
  if d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return d::date; end if;
  if d ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then return to_date(d,'MM/DD/YYYY'); end if;
  return current_date;
exception when others then return current_date;
end; $$;

create or replace function public.be_pickup_request_date(payload jsonb)
returns date language sql immutable as $$ select public.be30_pickup_date(coalesce(payload,'{}'::jsonb)); $$;

create or replace function public.be30_count(payload jsonb)
returns integer language plpgsql immutable as $$
declare raw text; n int;
begin
  raw := regexp_replace(coalesce(payload->>'parcel_count', payload->>'pickup_parcel_count', payload->>'package_count', '1'), '[^0-9]', '', 'g');
  n := coalesce(nullif(raw,'')::int,1);
  return greatest(1, least(n,999));
exception when others then return 1;
end; $$;

create or replace function public.be_customer_service_merchant_lookup(p_search text default null, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q text := lower(coalesce(p_search,'')); lim int := greatest(1,least(coalesce(p_limit,50),200)); master jsonb := '[]'::jsonb; hist jsonb := '[]'::jsonb; dyn text;
begin
  if to_regclass('public.be_master_data_options') is not null then
    dyn := $SQL$
      with raw as (select to_jsonb(t) j from public.be_master_data_options t),
      n as (
        select
          public.be30_jtext(j,array['merchant_code_3','merchant_3_letter_code','pickup_prefix','pickup_code','merchant_prefix','merchant_short_code','short_code','merchant_code','code','value','id']) merchant_code,
          public.be30_jtext(j,array['merchant_name','business_name','shop_name','customer_name','name','label','display_name']) merchant_name,
          public.be30_jtext(j,array['sender_name','contact_name','owner_name','person_in_charge','pic_name','merchant_name','name']) sender_name,
          public.be30_jtext(j,array['sender_phone','phone','mobile','contact_phone','merchant_phone','primary_phone']) sender_phone,
          public.be30_jtext(j,array['pickup_address','merchant_address','customer_address','address','full_address','store_address']) pickup_address,
          public.be30_jtext(j,array['pickup_township','township','merchant_township','customer_township']) pickup_township,
          public.be30_jtext(j,array['pickup_city','city','region','merchant_city','customer_city']) pickup_city,
          public.be30_jtext(j,array['assigned_branch','branch','branch_code','home_branch']) assigned_branch,
          public.be30_jtext(j,array['payment_terms','payment_term','payment_type']) payment_terms,
          public.be30_jtext(j,array['tariff_code','tariff','service_tier','tier']) tariff_code,
          j raw
        from raw
        where public.be30_jtext(j,array['merchant_name','business_name','shop_name','customer_name','name']) is not null
      )
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'merchant_code', merchant_code, 'merchant_name', merchant_name, 'sender_name', coalesce(sender_name,merchant_name),
        'sender_phone', sender_phone, 'pickup_address', pickup_address, 'pickup_township', pickup_township,
        'pickup_city', coalesce(pickup_city,'Yangon'), 'assigned_branch', public.be_resolve_branch_from_location(pickup_city,pickup_township,pickup_address,coalesce(assigned_branch,'YGN')),
        'payment_terms', coalesce(payment_terms,'COD'), 'tariff_code', coalesce(tariff_code,'Standard'), 'source', 'master_data', 'raw', raw
      ))), '[]'::jsonb)
      from n
      where $1 = '' or lower(coalesce(merchant_code,'')||' '||coalesce(merchant_name,'')||' '||coalesce(sender_phone,'')||' '||coalesce(pickup_address,'')||' '||coalesce(pickup_township,'')) like '%'||$1||'%'
      limit $2
    $SQL$;
    execute dyn using q, lim into master;
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'merchant_code', public.be30_clean(merchant_code),
    'merchant_name', public.be30_clean(merchant_name),
    'sender_name', coalesce(public.be30_clean(sender_name), public.be30_clean(merchant_name)),
    'sender_phone', public.be30_clean(sender_phone),
    'pickup_address', public.be30_clean(pickup_address),
    'pickup_township', public.be30_clean(pickup_township),
    'pickup_city', coalesce(public.be30_clean(pickup_city),'Yangon'),
    'assigned_branch', public.be_resolve_branch_from_location(pickup_city,pickup_township,pickup_address,coalesce(assigned_branch,'YGN')),
    'payment_terms', coalesce(public.be30_clean(payment_terms),'COD'),
    'tariff_code', coalesce(public.be30_clean(tariff_code),'Standard'),
    'pickup_prefix_from_history', case when pickup_id ~ '^P[0-9]{4}-[A-Z]{3}-[0-9]{3}$' then split_part(pickup_id,'-',2) else null end,
    'source','pickup_history'
  ))), '[]'::jsonb)
  into hist
  from (
    select distinct on (coalesce(merchant_code,merchant_name,sender_phone)) *
    from public.be_portal_pickup_requests
    where q = '' or lower(coalesce(merchant_code,'')||' '||coalesce(merchant_name,'')||' '||coalesce(sender_phone,'')||' '||coalesce(pickup_address,'')||' '||coalesce(pickup_township,'')) like '%'||q||'%'
    order by coalesce(merchant_code,merchant_name,sender_phone), created_at desc nulls last
    limit lim
  ) h;

  return jsonb_build_object('ok',true,'count',jsonb_array_length(master||hist),'merchants',master||hist,'items',master||hist);
end; $$;

create or replace function public.be30_resolve_merchant(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q text; res jsonb; item jsonb;
begin
  q := coalesce(public.be30_clean(payload->>'merchant_code'), public.be30_clean(payload->>'merchant_name'), public.be30_clean(payload->>'sender_phone'), '');
  res := public.be_customer_service_merchant_lookup(q,20);
  select value into item from jsonb_array_elements(coalesce(res->'merchants','[]'::jsonb)) value
  order by case when lower(value->>'merchant_code')=lower(coalesce(payload->>'merchant_code','')) then 0 when lower(value->>'merchant_name')=lower(coalesce(payload->>'merchant_name','')) then 1 else 2 end
  limit 1;
  return coalesce(item,'{}'::jsonb);
end; $$;

create or replace function public.be30_prefix(payload jsonb, merchant jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare raw jsonb := coalesce(merchant->'raw','{}'::jsonb); v text;
begin
  foreach v in array array[
    payload->>'pickup_prefix', payload->>'pickup_code', payload->>'merchant_code_3', payload->>'merchant_3_letter_code', payload->>'merchant_prefix', payload->>'short_code',
    merchant->>'pickup_prefix', merchant->>'pickup_code', merchant->>'merchant_code_3', merchant->>'merchant_3_letter_code', merchant->>'merchant_prefix', merchant->>'short_code', merchant->>'pickup_prefix_from_history',
    raw->>'pickup_prefix', raw->>'pickup_code', raw->>'merchant_code_3', raw->>'merchant_3_letter_code', raw->>'merchant_short_code', raw->>'merchant_prefix', raw->>'short_code',
    payload->>'merchant_code', merchant->>'merchant_code'
  ] loop
    v := upper(regexp_replace(coalesce(public.be30_clean(v),''),'[^A-Za-z0-9]+','','g'));
    if v ~ '^[A-Z]{3}$' then return v; end if;
  end loop;

  select split_part(pickup_id,'-',2) into v
  from public.be_portal_pickup_requests
  where pickup_id ~ '^P[0-9]{4}-[A-Z]{3}-[0-9]{3}$'
    and (lower(coalesce(merchant_name,''))=lower(coalesce(payload->>'merchant_name',merchant->>'merchant_name',''))
      or lower(coalesce(sender_phone,''))=lower(coalesce(payload->>'sender_phone',merchant->>'sender_phone','')))
  order by created_at desc nulls last
  limit 1;

  if v ~ '^[A-Z]{3}$' then return v; end if;

  raise exception 'Master Data missing required 3-letter merchant code. Add pickup_prefix / merchant_code_3 / short_code for merchant %.', coalesce(payload->>'merchant_name', merchant->>'merchant_name', payload->>'merchant_code');
end; $$;

create or replace function public.be_pickup_id_prefix(payload jsonb default '{}'::jsonb, merchant jsonb default '{}'::jsonb, fallback text default 'GEN')
returns text language sql security definer set search_path=public as $$ select public.be30_prefix(coalesce(payload,'{}'::jsonb), coalesce(merchant,'{}'::jsonb)); $$;

create or replace function public.be30_ids(payload jsonb, merchant jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pfx text; d date; cnt int; suffix text; dsuffix text;
begin
  pfx := public.be30_prefix(payload,merchant);
  d := public.be30_pickup_date(payload);
  cnt := public.be30_count(payload);
  suffix := lpad(cnt::text,3,'0');
  dsuffix := lpad(least(cnt+1,999)::text,3,'0');
  return jsonb_build_object(
    'pickup_prefix',pfx,'pickup_date',d,'parcel_count',cnt,
    'pickup_id','P'||to_char(d,'MMDD')||'-'||pfx||'-'||suffix,
    'deliver_id','D'||to_char(d,'MMDD')||'-'||pfx||'-'||dsuffix,
    'invoice_no','I'||to_char(d,'MMDD')||'-'||pfx||'-'||suffix,
    'waybill_no','W'||to_char(d,'MMDD')||'-'||pfx||'-'||suffix
  );
end; $$;

create or replace function public.be_next_cs_pickup_id(pfx text, pdate date, parcels integer)
returns text language sql security definer set search_path=public as $$
  select public.be30_ids(jsonb_build_object('pickup_prefix',pfx,'pickup_date',pdate,'parcel_count',parcels),'{}'::jsonb)->>'pickup_id';
$$;

create or replace function public.be_next_cs_pickup_id(merchant_code text)
returns text language plpgsql security definer set search_path=public as $$
declare merchant jsonb; ids jsonb;
begin
  merchant := public.be30_resolve_merchant(jsonb_build_object('merchant_code',merchant_code));
  ids := public.be30_ids(jsonb_build_object('merchant_code',merchant_code,'parcel_count',1),merchant);
  return ids->>'pickup_id';
end; $$;

create or replace function public.be30_event(pid text, typ text, st text, role text default null, code text default null, meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.be_portal_cargo_events(pickup_id,event_type,status,actor_role,actor_code,metadata,created_at)
  values(pid,typ,st,role,code,coalesce(meta,'{}'::jsonb),now());
exception when others then null;
end; $$;

create or replace function public.be30_notify(role text, branch text, pid text, title text, msg text, meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.be_app_notifications(target_role,target_branch,pickup_id,title,message,source_key,metadata,created_at)
  values(role,branch,pid,title,msg,pid,coalesce(meta,'{}'::jsonb),now());
exception when others then null;
end; $$;

create or replace function public.be30_after_pickup(pid text, evt text default 'pickup_submitted')
returns void language plpgsql security definer set search_path=public as $$
declare r record; meta jsonb;
begin
  select * into r from public.be_portal_pickup_requests where pickup_id=pid limit 1;
  if not found then return; end if;
  meta := jsonb_build_object('pickup_id',r.pickup_id,'deliver_id',r.deliver_id,'invoice_no',r.invoice_no,'waybill_no',r.waybill_no,'merchant_code',r.merchant_code,'parcel_count',r.parcel_count,'status',r.status);
  perform public.be30_event(r.pickup_id,evt,r.status,coalesce(r.source,'system'),null,meta);
  perform public.be30_notify('customer_service',r.assigned_branch,r.pickup_id,'Pickup request created',coalesce(r.merchant_name,r.pickup_id)||' pickup created.',meta);
  perform public.be30_notify('supervisor',r.assigned_branch,r.pickup_id,'Pickup requires assignment',r.pickup_id||' waiting for assignment.',meta);
  perform public.be30_notify('operation_manager',r.assigned_branch,r.pickup_id,'New pickup in operations queue',r.pickup_id||' entered workflow.',meta);
  perform public.be30_notify('dispatch',r.assigned_branch,r.pickup_id,'Pickup ready for dispatch planning',r.pickup_id||' can be planned after assignment.',meta);
  if r.status='data_entry_in_progress' then perform public.be30_notify('data_entry',r.assigned_branch,r.pickup_id,'Pickup needs Data Entry completion',r.pickup_id||' missing address/township.',meta); end if;
  if coalesce(r.cod_amount,0)>0 or lower(coalesce(r.payment_terms,''))='cod' then perform public.be30_notify('finance',r.assigned_branch,r.pickup_id,'COD pickup created',r.pickup_id||' requires COD tracking.',meta); end if;

  insert into public.be_waybill_ledger(waybill_no,pickup_id,deliver_id,invoice_no,merchant_code,merchant_name,parcel_count,cod_amount,status,payload,updated_at)
  values(r.waybill_no,r.pickup_id,r.deliver_id,r.invoice_no,r.merchant_code,r.merchant_name,coalesce(r.parcel_count,1),coalesce(r.cod_amount,0),'printed',meta,now())
  on conflict(waybill_no) do update set pickup_id=excluded.pickup_id, deliver_id=excluded.deliver_id, invoice_no=excluded.invoice_no, parcel_count=excluded.parcel_count, cod_amount=excluded.cod_amount, updated_at=now();

  insert into public.be_invoice_ledger(invoice_no,pickup_id,deliver_id,waybill_no,merchant_code,merchant_name,shipment_count,status,payload,updated_at)
  values(r.invoice_no,r.pickup_id,r.deliver_id,r.waybill_no,r.merchant_code,r.merchant_name,coalesce(r.parcel_count,1),'draft',meta,now())
  on conflict(invoice_no) do update set pickup_id=excluded.pickup_id, deliver_id=excluded.deliver_id, waybill_no=excluded.waybill_no, shipment_count=excluded.shipment_count, updated_at=now();

  if coalesce(r.cod_amount,0)>0 or lower(coalesce(r.payment_terms,''))='cod' then
    insert into public.be_cod_ledger(pickup_id,deliver_id,invoice_no,waybill_no,merchant_code,cod_expected,status,payload,updated_at)
    values(r.pickup_id,r.deliver_id,r.invoice_no,r.waybill_no,r.merchant_code,coalesce(r.cod_amount,0),'pending_collection',meta,now())
    on conflict(pickup_id) do update set cod_expected=excluded.cod_expected, deliver_id=excluded.deliver_id, invoice_no=excluded.invoice_no, waybill_no=excluded.waybill_no, updated_at=now();
  end if;
end; $$;

create or replace function public.be_submit_pickup_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare payload jsonb := coalesce(p_payload,'{}'::jsonb); merchant jsonb; ids jsonb; pid text; existing uuid;
  requester text; mcode text; mname text; sname text; sphone text; addr text; township text; city text; branch text; terms text; tariff text; parcels int; cod numeric; st text; rid uuid;
begin
  merchant := public.be30_resolve_merchant(payload);
  ids := public.be30_ids(payload,merchant);
  pid := ids->>'pickup_id';
  parcels := (ids->>'parcel_count')::int;

  select id into existing from public.be_portal_pickup_requests where pickup_id=pid or pickup_way_id=pid limit 1;
  if existing is not null then
    return jsonb_build_object('ok',true,'duplicate',true,'id',existing,'pickup_id',pid,'pickup_way_id',pid,'deliver_id',ids->>'deliver_id','invoice_no',ids->>'invoice_no','waybill_no',ids->>'waybill_no','message','Existing canonical pickup returned for same merchant/date/parcel count.');
  end if;

  requester := coalesce(public.be30_clean(payload->>'requester_type'),'merchant');
  mcode := ids->>'pickup_prefix';
  mname := coalesce(public.be30_clean(payload->>'merchant_name'),public.be30_clean(payload->>'customer_name'),public.be30_clean(merchant->>'merchant_name'),public.be30_clean(payload->>'sender_name'));
  sname := coalesce(public.be30_clean(payload->>'sender_name'),public.be30_clean(merchant->>'sender_name'),mname);
  sphone := coalesce(public.be30_clean(payload->>'sender_phone'),public.be30_clean(payload->>'phone'),public.be30_clean(merchant->>'sender_phone'));
  addr := coalesce(public.be30_clean(payload->>'pickup_address'),public.be30_clean(payload->>'address'),public.be30_clean(merchant->>'pickup_address'));
  township := coalesce(public.be30_clean(payload->>'pickup_township'),public.be30_clean(payload->>'township'),public.be30_clean(merchant->>'pickup_township'));
  city := coalesce(public.be30_clean(payload->>'pickup_city'),public.be30_clean(payload->>'city'),public.be30_clean(merchant->>'pickup_city'),'Yangon');
  branch := public.be_resolve_branch_from_location(city,township,addr,coalesce(public.be30_clean(payload->>'assigned_branch'),public.be30_clean(merchant->>'assigned_branch'),'YGN'));
  terms := coalesce(public.be30_clean(payload->>'payment_terms'),public.be30_clean(merchant->>'payment_terms'),'COD');
  tariff := coalesce(public.be30_clean(payload->>'tariff_code'),public.be30_clean(merchant->>'tariff_code'),'Standard');
  cod := coalesce(nullif(regexp_replace(coalesce(payload->>'cod_amount','0'),'[^0-9.]','','g'),'')::numeric,0);
  st := case when addr is null or township is null then 'data_entry_in_progress' else 'pending_pickup' end;

  insert into public.be_portal_pickup_requests(pickup_id,pickup_way_id,deliver_id,invoice_no,waybill_no,requester_type,merchant_code,merchant_name,sender_name,sender_phone,pickup_address,pickup_township,pickup_city,assigned_branch,payment_terms,tariff_code,parcel_count,cod_amount,status,assignment_status,source,payload,created_at,updated_at)
  values(pid,pid,ids->>'deliver_id',ids->>'invoice_no',ids->>'waybill_no',requester,mcode,mname,sname,sphone,addr,township,city,branch,terms,tariff,parcels,cod,st,'pending_assignment',coalesce(public.be30_clean(payload->>'source'),'customer_service'),payload||jsonb_build_object('master_data_match',merchant,'pickup_prefix',ids->>'pickup_prefix','pickup_date',ids->>'pickup_date','parcel_count',parcels),now(),now())
  returning id into rid;

  perform public.be30_after_pickup(pid,'pickup_submitted');

  return jsonb_build_object('ok',true,'id',rid,'pickup_id',pid,'pickup_way_id',pid,'deliver_id',ids->>'deliver_id','invoice_no',ids->>'invoice_no','waybill_no',ids->>'waybill_no','status',st,'assignment_status','pending_assignment','merchant_code',mcode,'merchant_name',mname,'pickup_address',addr,'pickup_township',township,'pickup_city',city,'assigned_branch',branch,'parcel_count',parcels);
end; $$;

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
returns jsonb language sql security definer set search_path=public as $$
  with r as (
    select jsonb_strip_nulls(jsonb_build_object('id',id,'pickup_id',pickup_id,'pickup_way_id',pickup_way_id,'deliver_id',deliver_id,'invoice_no',invoice_no,'waybill_no',waybill_no,'merchant_code',merchant_code,'merchant_name',merchant_name,'sender_name',sender_name,'sender_phone',sender_phone,'pickup_address',pickup_address,'pickup_township',pickup_township,'pickup_city',pickup_city,'assigned_branch',assigned_branch,'parcel_count',parcel_count,'cod_amount',cod_amount,'status',status,'assignment_status',assignment_status,'assigned_rider_code',assigned_rider_code,'created_at',created_at)) item
    from public.be_portal_pickup_requests order by created_at desc nulls last limit greatest(1,least(coalesce(p_limit,50),200))
  ), a as (select coalesce(jsonb_agg(item),'[]'::jsonb) items from r)
  select jsonb_build_object('ok',true,'pickups',items,'items',items) from a;
$$;

create or replace function public.be_customer_service_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
declare merchants jsonb; pickups jsonb; open_count int; urgent int;
begin
  merchants := public.be_customer_service_merchant_lookup('',200);
  pickups := public.be_customer_service_pickup_requests(100);
  select count(*) into open_count from public.be_portal_pickup_requests where coalesce(status,'') not in ('closed','cancelled','delivered');
  select count(*) into urgent from public.be_portal_pickup_requests where lower(coalesce(payload->>'priority','')) in ('urgent','high');
  return jsonb_build_object('ok',true,'status','ready','total_tickets',0,'open_requests',open_count,'pickup_requests',open_count,'urgent_open',urgent,'merchant_options',coalesce((merchants->>'count')::int,0),'stats',jsonb_build_object('open_requests',open_count,'pickup_requests',open_count,'urgent_open',urgent,'merchant_options',coalesce((merchants->>'count')::int,0)),'merchants',merchants->'merchants','pickups',pickups->'pickups','recent_pickups',pickups->'pickups');
end; $$;

create or replace function public.be_supervisor_pickup_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path=public as $$
  with r as (
    select jsonb_strip_nulls(jsonb_build_object('id',id,'pickup_id',pickup_id,'pickup_way_id',pickup_way_id,'deliver_id',deliver_id,'invoice_no',invoice_no,'waybill_no',waybill_no,'merchant_code',merchant_code,'merchant_name',merchant_name,'sender_phone',sender_phone,'pickup_address',pickup_address,'pickup_township',pickup_township,'pickup_city',pickup_city,'assigned_branch',assigned_branch,'route_zone',route_zone,'parcel_count',parcel_count,'cod_amount',cod_amount,'status',status,'assignment_status',assignment_status,'assigned_rider_code',assigned_rider_code,'assigned_rider_name',assigned_rider_name,'created_at',created_at)) item
    from public.be_portal_pickup_requests
    where coalesce(status,'') in ('data_entry_in_progress','pending_pickup','pending_assignment','assigned','picked_up','received','in_warehouse','sorting') or coalesce(assignment_status,'') in ('pending_assignment','assigned')
    order by created_at desc nulls last limit greatest(1,least(coalesce(p_limit,100),500))
  ), a as (select coalesce(jsonb_agg(item),'[]'::jsonb) items from r)
  select jsonb_build_object('ok',true,'pickups',items,'items',items) from a;
$$;

create or replace function public.be_supervisor_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
declare q jsonb; pending int; assigned int;
begin
  q := public.be_supervisor_pickup_queue(200);
  select count(*) into pending from public.be_portal_pickup_requests where coalesce(assignment_status,'pending_assignment')='pending_assignment';
  select count(*) into assigned from public.be_portal_pickup_requests where coalesce(assignment_status,'')='assigned';
  return jsonb_build_object('ok',true,'status','ready','pending_assignment',pending,'assigned',assigned,'queue',q->'pickups','pickups',q->'pickups');
end; $$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pid text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id'); rider text := public.be30_clean(coalesce(p_payload->>'rider_code',p_payload->>'assignee_code')); rname text := public.be30_clean(coalesce(p_payload->>'rider_name',p_payload->>'assignee_name')); zone text := public.be30_clean(coalesce(p_payload->>'route_zone',p_payload->>'zone')); r record;
begin
  select * into r from public.be_portal_pickup_requests where pickup_id=pid or pickup_way_id=pid limit 1;
  if not found then raise exception 'Pickup % not found',pid; end if;
  update public.be_portal_pickup_requests set assigned_rider_code=coalesce(rider,assigned_rider_code),assigned_rider_name=coalesce(rname,assigned_rider_name),assigned_by=coalesce(p_payload->>'assigned_by','supervisor'),assigned_at=now(),assignment_status='assigned',status=case when status='data_entry_in_progress' then status else 'assigned' end,route_zone=coalesce(zone,route_zone),updated_at=now() where id=r.id;
  if rider is not null then
    insert into public.be_mobile_workflow_tasks(pickup_id,task_type,assignee_role,assignee_code,assignee_name,status,route_zone,branch_code,payload,assigned_at,updated_at)
    values(r.pickup_id,'pickup','rider',rider,rname,'assigned',zone,r.assigned_branch,p_payload,now(),now())
    on conflict(pickup_id,task_type,assignee_role,assignee_code) do update set status='assigned',route_zone=excluded.route_zone,payload=excluded.payload,updated_at=now();
  end if;
  perform public.be30_event(r.pickup_id,'pickup_assigned','assigned','supervisor',p_payload->>'assigned_by',p_payload);
  perform public.be30_notify('rider',r.assigned_branch,r.pickup_id,'New pickup assigned',r.pickup_id||' assigned to '||coalesce(rname,rider,'rider'),p_payload);
  return jsonb_build_object('ok',true,'pickup_id',r.pickup_id,'assignment_status','assigned','rider_code',rider,'route_zone',zone);
end; $$;

create or replace function public.be_mobile_go_live_snapshot(p_worker_code text default null, p_status text default null, p_limit integer default 100)
returns jsonb language sql security definer set search_path=public as $$
  with r as (
    select jsonb_strip_nulls(jsonb_build_object('task_id',t.id,'pickup_id',p.pickup_id,'deliver_id',p.deliver_id,'invoice_no',p.invoice_no,'waybill_no',p.waybill_no,'merchant_code',p.merchant_code,'merchant_name',p.merchant_name,'pickup_address',p.pickup_address,'pickup_township',p.pickup_township,'pickup_city',p.pickup_city,'parcel_count',p.parcel_count,'cod_amount',p.cod_amount,'payment_terms',p.payment_terms,'job_status',t.status,'pickup_status',p.status,'route_zone',coalesce(t.route_zone,p.route_zone),'branch_code',coalesce(t.branch_code,p.assigned_branch),'assigned_at',t.assigned_at)) item
    from public.be_mobile_workflow_tasks t join public.be_portal_pickup_requests p on p.pickup_id=t.pickup_id
    where (p_worker_code is null or t.assignee_code=p_worker_code) and (p_status is null or t.status=p_status or p.status=p_status)
    order by t.assigned_at desc nulls last limit greatest(1,least(coalesce(p_limit,100),500))
  ), a as (select coalesce(jsonb_agg(item),'[]'::jsonb) items from r)
  select jsonb_build_object('ok',true,'jobs',items,'tasks',items,'items',items) from a;
$$;

create or replace function public.be_rider_update_job_status(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pid text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id'); st text := lower(coalesce(p_payload->>'status',p_payload->>'job_status','updated')); worker text := public.be30_clean(coalesce(p_payload->>'rider_code',p_payload->>'worker_code')); mapped text; r record;
begin
  select * into r from public.be_portal_pickup_requests where pickup_id=pid or pickup_way_id=pid limit 1;
  if not found then raise exception 'Pickup % not found',pid; end if;
  mapped := case when st in ('accepted','accept') then 'accepted' when st in ('picked_up','pickup_completed') then 'picked_up' when st in ('delivered','completed','complete') then 'delivered' when st in ('failed','failed_attempt') then 'failed_attempt' else st end;
  update public.be_portal_pickup_requests set status=mapped,rider_status=mapped,cod_status=case when mapped='delivered' and coalesce(cod_amount,0)>0 then 'awaiting_handover' else cod_status end,finance_status=case when mapped='delivered' and coalesce(cod_amount,0)>0 then 'cod_pending_handover' when mapped='delivered' then 'finance_pending' else finance_status end,updated_at=now() where id=r.id;
  update public.be_mobile_workflow_tasks set status=mapped,payload=coalesce(payload,'{}'::jsonb)||p_payload,updated_at=now() where pickup_id=r.pickup_id and (worker is null or assignee_code=worker);
  if mapped='delivered' and coalesce(r.cod_amount,0)>0 then update public.be_cod_ledger set rider_code=coalesce(worker,rider_code),cod_collected=coalesce(r.cod_amount,0),status='awaiting_handover',updated_at=now() where pickup_id=r.pickup_id; end if;
  perform public.be30_event(r.pickup_id,'rider_status_update',mapped,'rider',worker,p_payload);
  perform public.be30_notify('customer_service',r.assigned_branch,r.pickup_id,'Delivery status update',r.pickup_id||' status: '||mapped,p_payload);
  return jsonb_build_object('ok',true,'pickup_id',r.pickup_id,'status',mapped);
end; $$;

create or replace function public.be_mobile_update_job_status(p_payload jsonb)
returns jsonb language sql security definer set search_path=public as $$ select public.be_rider_update_job_status(p_payload); $$;

create or replace function public.be_warehouse_scan(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pid text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id'); scan text := lower(coalesce(p_payload->>'scan_type','inbound')); st text; r record;
begin
  select * into r from public.be_portal_pickup_requests where pickup_id=pid or pickup_way_id=pid limit 1;
  if not found then raise exception 'Pickup % not found',pid; end if;
  st := case when scan in ('inbound','received','receive') then 'received' when scan in ('warehouse','in_warehouse') then 'in_warehouse' when scan in ('sort','sorting') then 'sorting' when scan in ('bag','bagged') then 'bagged' when scan in ('dispatch','dispatched') then 'dispatched' else scan end;
  insert into public.be_warehouse_scans(pickup_id,waybill_no,scan_type,warehouse_branch,operator_code,bag_code,route_zone,expected_parcel_count,scanned_parcel_count,status,metadata,created_at)
  values(r.pickup_id,r.waybill_no,scan,coalesce(p_payload->>'warehouse_branch',r.assigned_branch),p_payload->>'operator_code',p_payload->>'bag_code',coalesce(p_payload->>'route_zone',r.route_zone),r.parcel_count,coalesce(nullif(p_payload->>'scanned_parcel_count','')::int,r.parcel_count),st,p_payload,now());
  update public.be_portal_pickup_requests set status=st,warehouse_status=st,updated_at=now() where id=r.id;
  update public.be_waybill_ledger set status=st,updated_at=now() where waybill_no=r.waybill_no;
  perform public.be30_event(r.pickup_id,'warehouse_scan',st,'warehouse',p_payload->>'operator_code',p_payload);
  return jsonb_build_object('ok',true,'pickup_id',r.pickup_id,'warehouse_status',st);
end; $$;

create or replace function public.be_cod_handover_submit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rider text := public.be30_clean(coalesce(p_payload->>'rider_code',p_payload->>'worker_code')); merchant text := public.be30_clean(p_payload->>'merchant_code'); total numeric := coalesce(nullif(regexp_replace(coalesce(p_payload->>'total_cash_received','0'),'[^0-9.]','','g'),'')::numeric,0); ref text;
begin
  if rider is null then raise exception 'rider_code required'; end if;
  ref := 'RH'||to_char(current_date,'MMDD')||'-'||rider||'-'||coalesce(merchant,'GEN')||'-'||lpad((1+coalesce((select max(right(settlement_ref,3)::int) from public.be_rider_handover_ledger where settlement_ref like 'RH'||to_char(current_date,'MMDD')||'-'||rider||'-'||coalesce(merchant,'GEN')||'-___'),0))::text,3,'0');
  insert into public.be_rider_handover_ledger(settlement_ref,rider_code,route_zone,merchant_code,total_delivered_parcels,total_cod_expected,total_cash_received,status,notes,payload,created_at,updated_at)
  values(ref,rider,p_payload->>'route_zone',merchant,coalesce(nullif(p_payload->>'total_delivered_parcels','')::int,0),coalesce(nullif(regexp_replace(coalesce(p_payload->>'total_cod_expected','0'),'[^0-9.]','','g'),'')::numeric,total),total,'submitted',p_payload->>'notes',p_payload,now(),now());
  update public.be_cod_ledger set status='submitted',settlement_ref=ref,cod_handed_over=case when total>0 then total else cod_handed_over end,updated_at=now() where rider_code=rider and status in ('awaiting_handover','collected');
  return jsonb_build_object('ok',true,'settlement_ref',ref,'status','submitted');
end; $$;

create or replace function public.be_finance_verify_handover(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ref text := public.be30_clean(p_payload->>'settlement_ref'); st text := lower(coalesce(p_payload->>'status','verified'));
begin
  update public.be_rider_handover_ledger set status=st,verified_by=p_payload->>'verified_by',verification_time=now(),updated_at=now(),payload=coalesce(payload,'{}'::jsonb)||p_payload where settlement_ref=ref;
  update public.be_cod_ledger set status=case when st in ('verified','handed_over') then 'handed_over' else st end,updated_at=now() where settlement_ref=ref;
  return jsonb_build_object('ok',true,'settlement_ref',ref,'status',st);
end; $$;

create or replace function public.be_finance_workflow_snapshot()
returns jsonb language plpgsql security definer set search_path=public as $$
declare cod_today numeric; pending numeric; verify numeric; invoices int; waybills int;
begin
  select coalesce(sum(cod_collected),0) into cod_today from public.be_cod_ledger where date(created_at)=current_date;
  select coalesce(sum(cod_collected-cod_handed_over),0) into pending from public.be_cod_ledger where status in ('awaiting_handover','collected','submitted');
  select coalesce(sum(total_cash_received),0) into verify from public.be_rider_handover_ledger where status in ('submitted','under_verification');
  select count(*) into invoices from public.be_invoice_ledger where status in ('draft','under_review','issued');
  select count(*) into waybills from public.be_waybill_ledger where status in ('delivered','finance_pending','issued');
  return jsonb_build_object('ok',true,'cod_collected_today',cod_today,'pending_rider_handover',pending,'awaiting_operation_verification',verify,'pending_invoices',invoices,'waybills_finance_pending',waybills);
end; $$;

create or replace function public.zzzz_be30_force_canonical_ids()
returns trigger language plpgsql security definer set search_path=public as $$
declare ids jsonb; merchant jsonb;
begin
  new.requester_type := coalesce(nullif(new.requester_type,''),'merchant');
  new.payload := coalesce(new.payload,'{}'::jsonb);
  merchant := coalesce(new.payload->'master_data_match','{}'::jsonb);
  ids := public.be30_ids(new.payload||jsonb_build_object('merchant_code',new.merchant_code,'merchant_name',new.merchant_name,'pickup_date',coalesce(new.payload->>'pickup_date',to_char(coalesce(new.created_at,now())::date,'YYYY-MM-DD')),'parcel_count',coalesce(new.parcel_count,public.be30_count(new.payload))),merchant);
  new.pickup_id := ids->>'pickup_id';
  new.pickup_way_id := ids->>'pickup_id';
  new.deliver_id := coalesce(new.deliver_id,ids->>'deliver_id');
  new.invoice_no := coalesce(new.invoice_no,ids->>'invoice_no');
  new.waybill_no := coalesce(new.waybill_no,ids->>'waybill_no');
  new.merchant_code := ids->>'pickup_prefix';
  new.parcel_count := (ids->>'parcel_count')::int;
  new.updated_at := now();
  return new;
end; $$;

create trigger zzzzz_be30_force_canonical_ids before insert or update of pickup_id,pickup_way_id,merchant_code,merchant_name,requester_type,parcel_count,payload
on public.be_portal_pickup_requests for each row execute function public.zzzz_be30_force_canonical_ids();

create or replace function public.be_go_live_system_readiness()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return jsonb_build_object('ok',true,'status','ready','workflow','master_data -> cs/merchant/customer -> pickup ids -> supervisor -> rider -> warehouse -> finance');
end; $$;

create or replace function public.be_go_live_readiness_snapshot()
returns jsonb language sql security definer set search_path=public as $$ select public.be_go_live_system_readiness(); $$;

create or replace function public.be_process_router(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a text := lower(coalesce(p_action,'')); p jsonb := coalesce(p_payload,'{}'::jsonb);
begin
  case a
    when 'be_customer_service_snapshot','customer_service_snapshot','cs_snapshot' then return public.be_customer_service_snapshot();
    when 'be_customer_service_merchant_lookup','customer_service_merchant_lookup','merchant_lookup' then return public.be_customer_service_merchant_lookup(coalesce(p->>'search',p->>'q',p->>'merchant_name',p->>'merchant_code',''),coalesce(nullif(p->>'limit','')::int,50));
    when 'be_submit_pickup_request','submit_pickup_request','create_pickup','customer_service_create_pickup','merchant_create_pickup','customer_create_pickup' then return public.be_submit_pickup_request(p);
    when 'be_customer_service_pickup_requests','customer_service_pickup_requests' then return public.be_customer_service_pickup_requests(coalesce(nullif(p->>'limit','')::int,50));
    when 'be_supervisor_pickup_queue','supervisor_pickup_queue' then return public.be_supervisor_pickup_queue(coalesce(nullif(p->>'limit','')::int,100));
    when 'be_supervisor_snapshot','supervisor_snapshot' then return public.be_supervisor_snapshot();
    when 'be_supervisor_assign_job','supervisor_assign_job','assign_pickup','assign_rider' then return public.be_supervisor_assign_job(p);
    when 'be_mobile_go_live_snapshot','mobile_go_live_snapshot','rider_snapshot' then return public.be_mobile_go_live_snapshot(p->>'worker_code',p->>'status',coalesce(nullif(p->>'limit','')::int,100));
    when 'be_rider_update_job_status','be_mobile_update_job_status','rider_update_job_status','mobile_update_status' then return public.be_rider_update_job_status(p);
    when 'be_warehouse_scan','warehouse_scan' then return public.be_warehouse_scan(p);
    when 'be_cod_handover_submit','cod_handover_submit' then return public.be_cod_handover_submit(p);
    when 'be_finance_verify_handover','finance_verify_handover' then return public.be_finance_verify_handover(p);
    when 'be_finance_workflow_snapshot','finance_workflow_snapshot','finance_snapshot' then return public.be_finance_workflow_snapshot();
    when 'be_go_live_system_readiness','be_go_live_readiness_snapshot','go_live_readiness' then return public.be_go_live_system_readiness();
    else return jsonb_build_object('ok',false,'error','Unknown workflow action','action',p_action);
  end case;
end; $$;

commit;
