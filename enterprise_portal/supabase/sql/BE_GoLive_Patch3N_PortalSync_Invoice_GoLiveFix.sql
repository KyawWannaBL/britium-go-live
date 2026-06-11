
begin;
create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.shipments') is not null then
    execute 'alter table public.shipments add column if not exists waybill_no text';
    execute $q$update public.shipments set waybill_no = coalesce(waybill_no, nullif(tracking_no::text,''), nullif(delivery_id::text,''), nullif(way_id::text,''), nullif(payload->>'way_id',''), nullif(payload->>'waybill_id',''), nullif(payload->>'tracking','')) where waybill_no is null$q$;
    execute 'create index if not exists idx_shipments_waybill_no on public.shipments(waybill_no)';
  end if;
  if to_regclass('public.deliveries') is not null then
    execute 'alter table public.deliveries add column if not exists waybill_no text';
    execute $q$update public.deliveries set waybill_no = coalesce(waybill_no, nullif(tracking_no::text,''), nullif(delivery_id::text,''), nullif(way_id::text,'')) where waybill_no is null$q$;
    execute 'create index if not exists idx_deliveries_waybill_no on public.deliveries(waybill_no)';
  end if;
  if to_regclass('public.be_masterdata_delivery_records') is not null then
    execute 'alter table public.be_masterdata_delivery_records add column if not exists waybill_no text';
    execute 'alter table public.be_masterdata_delivery_records add column if not exists assigned_to text';
    execute 'alter table public.be_masterdata_delivery_records add column if not exists status text default ''assigned''';
    execute 'alter table public.be_masterdata_delivery_records add column if not exists recipient_address text';
    execute 'alter table public.be_masterdata_delivery_records add column if not exists updated_at timestamptz default now()';
    execute 'update public.be_masterdata_delivery_records set waybill_no = coalesce(waybill_no, way_id) where waybill_no is null';
    execute 'create index if not exists idx_be_master_delivery_waybill_no on public.be_masterdata_delivery_records(waybill_no)';
  end if;
end $$;

create table if not exists public.be_field_assignments (
  id uuid primary key default gen_random_uuid(),
  waybill_no text not null,
  pickup_id text,
  role text not null default 'rider',
  assigned_to text,
  assigned_to_name text,
  assigned_by uuid,
  status text not null default 'assigned',
  priority text not null default 'normal',
  eta_date date,
  eta_at timestamptz,
  route_group text,
  city text,
  township text,
  cod_amount numeric(14,2) default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(waybill_no, role)
);
create index if not exists idx_be_field_assignments_role_assigned_to on public.be_field_assignments(role, assigned_to);
create index if not exists idx_be_field_assignments_waybill_no on public.be_field_assignments(waybill_no);

insert into public.be_field_assignments(waybill_no,pickup_id,role,status,eta_date,city,township,cod_amount,payload)
select coalesce(r.waybill_no,r.way_id), r.pickup_id, 'rider', coalesce(nullif(r.status,''),'assigned'), current_date, r.city, r.township, coalesce(r.cod_amount,0),
jsonb_build_object('source','be_masterdata_delivery_records','merchant_name',r.merchant_name,'merchant_code',r.merchant_code,'recipient_name',r.recipient_name,'recipient_phone',r.recipient_phone,'address',r.recipient_address)
from public.be_masterdata_delivery_records r
where coalesce(r.waybill_no,r.way_id) is not null
on conflict(waybill_no, role) do update set pickup_id=excluded.pickup_id, city=excluded.city, township=excluded.township, cod_amount=excluded.cod_amount, payload=public.be_field_assignments.payload||excluded.payload, updated_at=now();

insert into public.be_field_assignments(waybill_no,pickup_id,role,status,eta_date,city,township,cod_amount,payload)
select coalesce(r.waybill_no,r.way_id), r.pickup_id, 'driver', coalesce(nullif(r.status,''),'assigned'), current_date, r.city, r.township, coalesce(r.cod_amount,0),
jsonb_build_object('source','be_masterdata_delivery_records','merchant_name',r.merchant_name,'merchant_code',r.merchant_code,'recipient_name',r.recipient_name,'recipient_phone',r.recipient_phone,'address',r.recipient_address)
from public.be_masterdata_delivery_records r
where coalesce(r.waybill_no,r.way_id) is not null
on conflict(waybill_no, role) do update set pickup_id=excluded.pickup_id, city=excluded.city, township=excluded.township, cod_amount=excluded.cod_amount, payload=public.be_field_assignments.payload||excluded.payload, updated_at=now();

create or replace view public.be_field_jobs_live_v as
select a.id as assignment_id, a.role, a.assigned_to, a.assigned_to_name,
coalesce(a.waybill_no,r.waybill_no,r.way_id) as waybill_no, coalesce(r.way_id,a.waybill_no) as way_id,
coalesce(a.pickup_id,r.pickup_id) as pickup_id, r.merchant_code, coalesce(r.merchant_name,a.payload->>'merchant_name') as merchant_name,
coalesce(r.recipient_name,a.payload->>'recipient_name') as receiver_name, coalesce(r.recipient_phone,a.payload->>'recipient_phone') as receiver_phone,
coalesce(r.city,a.city) as city, coalesce(r.township,a.township) as township, coalesce(r.recipient_address,a.payload->>'address') as address,
coalesce(r.cod_amount,a.cod_amount,0) as cod_amount, coalesce(a.status,r.status,'assigned') as status, a.priority, a.eta_date, a.eta_at, a.route_group,
a.payload || jsonb_build_object('item_price',coalesce(r.item_price,0),'delivery_fee_os',coalesce(r.delivery_fee_os,0)) as payload,
a.created_at, greatest(coalesce(a.updated_at,a.created_at), coalesce(r.updated_at,a.updated_at,a.created_at)) as updated_at
from public.be_field_assignments a
left join public.be_masterdata_delivery_records r on coalesce(r.waybill_no,r.way_id)=a.waybill_no;
grant select on public.be_field_jobs_live_v to authenticated, anon;

drop function if exists public.be_field_portal_snapshot(text,text);
create or replace function public.be_field_portal_snapshot(p_role text default 'rider', p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text:=lower(coalesce(p_role,'rider')); v_search text:=lower(trim(coalesce(p_search,''))); v_jobs jsonb;
begin
select coalesce(jsonb_agg(to_jsonb(j) order by j.eta_date nulls last, j.waybill_no),'[]'::jsonb) into v_jobs
from (
  select assignment_id::text, role, waybill_no, way_id, pickup_id, merchant_code, merchant_name, receiver_name, receiver_phone, city, township, address, cod_amount, status, priority, eta_date, eta_at, route_group, payload
  from public.be_field_jobs_live_v
  where role=v_role and (v_search='' or lower(coalesce(waybill_no,'')) like '%'||v_search||'%' or lower(coalesce(merchant_name,'')) like '%'||v_search||'%' or lower(coalesce(receiver_name,'')) like '%'||v_search||'%' or lower(coalesce(receiver_phone,'')) like '%'||v_search||'%' or lower(coalesce(township,'')) like '%'||v_search||'%')
  limit 500
) j;
return jsonb_build_object('ok',true,'role',v_role,'summary',jsonb_build_object('assigned_jobs',jsonb_array_length(v_jobs),'active_jobs',coalesce((select count(*) from jsonb_array_elements(v_jobs) x where x->>'status' in ('assigned','active','on_way','pending')),0),'delivered_today',coalesce((select count(*) from jsonb_array_elements(v_jobs) x where x->>'status' in ('delivered','successful')),0),'pending_cod',coalesce((select sum((x->>'cod_amount')::numeric) from jsonb_array_elements(v_jobs) x where coalesce(x->>'status','') not in ('delivered','successful','paid')),0)),'jobs',v_jobs,'generated_at',now());
end $$;
grant execute on function public.be_field_portal_snapshot(text,text) to authenticated, anon;

drop function if exists public.be_rider_portal_snapshot(text);
create or replace function public.be_rider_portal_snapshot(p_search text default null) returns jsonb language sql security definer set search_path=public as $$select public.be_field_portal_snapshot('rider',p_search);$$;
grant execute on function public.be_rider_portal_snapshot(text) to authenticated, anon;

drop function if exists public.be_driver_portal_snapshot(text);
create or replace function public.be_driver_portal_snapshot(p_search text default null) returns jsonb language sql security definer set search_path=public as $$select public.be_field_portal_snapshot('driver',p_search);$$;
grant execute on function public.be_driver_portal_snapshot(text) to authenticated, anon;

create table if not exists public.be_finance_invoices (
  id uuid primary key default gen_random_uuid(), invoice_no text unique not null, merchant_code text, merchant_name text not null,
  period_start date, period_end date, gross_cod numeric(14,2) not null default 0, delivery_fees numeric(14,2) not null default 0,
  weight_surcharges numeric(14,2) not null default 0, rebates numeric(14,2) not null default 0, net_payout numeric(14,2) not null default 0,
  status text not null default 'pending', bank_reference text, pdf_url text, payload jsonb default '{}'::jsonb, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.be_finance_invoice_lines (
  id uuid primary key default gen_random_uuid(), invoice_id uuid references public.be_finance_invoices(id) on delete cascade, waybill_no text, pickup_id text,
  recipient_name text, township text, item_price numeric(14,2) default 0, cod_amount numeric(14,2) default 0, delivery_fee numeric(14,2) default 0,
  weight_surcharge numeric(14,2) default 0, rebate numeric(14,2) default 0, net_line_amount numeric(14,2) default 0, status text default 'pending', created_at timestamptz not null default now()
);
create table if not exists public.be_finance_gl_entries (
  id uuid primary key default gen_random_uuid(), entry_no text unique not null, waybill_no text, merchant_code text, account_code text not null,
  debit numeric(14,2) default 0, credit numeric(14,2) default 0, memo text, source_type text, source_id uuid, created_at timestamptz not null default now(), created_by uuid, payload jsonb default '{}'::jsonb
);

drop function if exists public.be_finance_generate_invoice(text,date,date,uuid);
create or replace function public.be_finance_generate_invoice(p_merchant_code text, p_period_start date default null, p_period_end date default null, p_created_by uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_start date:=coalesce(p_period_start,current_date-30); v_end date:=coalesce(p_period_end,current_date); v_code text:=upper(trim(coalesce(p_merchant_code,''))); v_invoice_id uuid; v_invoice_no text; v_merchant_name text; v_gross numeric:=0; v_fees numeric:=0; v_net numeric:=0;
begin
 if v_code='' then raise exception 'merchant_code is required'; end if;
 select coalesce(max(merchant_name),v_code) into v_merchant_name from public.be_masterdata_delivery_records where upper(coalesce(merchant_code,''))=v_code;
 v_invoice_no := 'INV-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||v_code;
 insert into public.be_finance_invoices(invoice_no,merchant_code,merchant_name,period_start,period_end,created_by) values(v_invoice_no,v_code,v_merchant_name,v_start,v_end,p_created_by) returning id into v_invoice_id;
 insert into public.be_finance_invoice_lines(invoice_id,waybill_no,pickup_id,recipient_name,township,item_price,cod_amount,delivery_fee,weight_surcharge,rebate,net_line_amount,status)
 select v_invoice_id, coalesce(waybill_no,way_id), pickup_id, recipient_name, township, coalesce(item_price,0), coalesce(cod_amount,0), coalesce(delivery_fee_os,0), 0, 0, coalesce(cod_amount,0)-coalesce(delivery_fee_os,0), coalesce(status,'pending')
 from public.be_masterdata_delivery_records where upper(coalesce(merchant_code,''))=v_code and coalesce(updated_at::date,current_date) between v_start and v_end;
 select coalesce(sum(cod_amount),0), coalesce(sum(delivery_fee),0), coalesce(sum(net_line_amount),0) into v_gross,v_fees,v_net from public.be_finance_invoice_lines where invoice_id=v_invoice_id;
 update public.be_finance_invoices set gross_cod=v_gross, delivery_fees=v_fees, net_payout=v_net, payload=jsonb_build_object('line_count',(select count(*) from public.be_finance_invoice_lines where invoice_id=v_invoice_id)), updated_at=now() where id=v_invoice_id;
 insert into public.be_finance_gl_entries(entry_no,merchant_code,account_code,debit,credit,memo,source_type,source_id,created_by) values('GL-'||replace(v_invoice_no,'INV-',''),v_code,'MERCHANT_PAYABLE',v_net,0,'Merchant invoice generated '||v_invoice_no,'invoice',v_invoice_id,p_created_by) on conflict(entry_no) do nothing;
 return jsonb_build_object('ok',true,'invoice_id',v_invoice_id,'invoice_no',v_invoice_no,'merchant_code',v_code,'merchant_name',v_merchant_name,'gross_cod',v_gross,'delivery_fees',v_fees,'net_payout',v_net,'status','pending');
end $$;
grant execute on function public.be_finance_generate_invoice(text,date,date,uuid) to authenticated, anon;

drop function if exists public.be_finance_mark_invoice_status(uuid,text,text);
create or replace function public.be_finance_mark_invoice_status(p_invoice_id uuid, p_status text, p_bank_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.be_finance_invoices%rowtype;
begin
 update public.be_finance_invoices set status=lower(coalesce(p_status,status)), bank_reference=coalesce(p_bank_reference,bank_reference), updated_at=now() where id=p_invoice_id returning * into v_row;
 if v_row.id is null then raise exception 'invoice not found'; end if;
 return jsonb_build_object('ok',true,'invoice',to_jsonb(v_row));
end $$;
grant execute on function public.be_finance_mark_invoice_status(uuid,text,text) to authenticated, anon;

drop function if exists public.be_finance_snapshot_safe(text);
create or replace function public.be_finance_snapshot_safe(p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_search text:=lower(trim(coalesce(p_search,''))); v_cod jsonb:='[]'::jsonb; v_settlements jsonb:='[]'::jsonb; v_invoices jsonb:='[]'::jsonb; v_flags jsonb:='[]'::jsonb; v_gl jsonb:='[]'::jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(x) order by x.waybill_no),'[]'::jsonb) into v_cod from (select waybill_no,pickup_id,merchant_name,receiver_name,receiver_phone,township,cod_amount,status from public.be_field_jobs_live_v where v_search='' or lower(coalesce(waybill_no,'')) like '%'||v_search||'%' or lower(coalesce(merchant_name,'')) like '%'||v_search||'%' or lower(coalesce(receiver_name,'')) like '%'||v_search||'%' limit 500) x;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]'::jsonb) into v_invoices from (select id::text, invoice_no, merchant_code, merchant_name, period_start, period_end, gross_cod, delivery_fees, weight_surcharges, rebates, net_payout, status, bank_reference, pdf_url, created_at from public.be_finance_invoices where v_search='' or lower(coalesce(invoice_no,'')) like '%'||v_search||'%' or lower(coalesce(merchant_name,'')) like '%'||v_search||'%' or lower(coalesce(merchant_code,'')) like '%'||v_search||'%' order by created_at desc limit 200) i;
 select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc),'[]'::jsonb) into v_gl from (select id::text, entry_no, waybill_no, merchant_code, account_code, debit, credit, memo, source_type, source_id::text, created_at from public.be_finance_gl_entries order by created_at desc limit 200) g;
 return jsonb_build_object('ok',true,'summary',jsonb_build_object('cod_total',coalesce((select sum((e->>'cod_amount')::numeric) from jsonb_array_elements(v_cod) e),0),'settlement_due',coalesce((select sum((e->>'net_payout')::numeric) from jsonb_array_elements(v_invoices) e where e->>'status'<>'paid'),0),'invoice_total',coalesce((select sum((e->>'net_payout')::numeric) from jsonb_array_elements(v_invoices) e),0),'open_fraud_flags',jsonb_array_length(v_flags),'cash_balance',coalesce((select sum((e->>'cod_amount')::numeric) from jsonb_array_elements(v_cod) e),0)),'cod_reconciliation',v_cod,'settlements',v_settlements,'invoices',v_invoices,'fraud_flags',v_flags,'gl_entries',v_gl,'generated_at',now());
end $$;
grant execute on function public.be_finance_snapshot_safe(text) to authenticated, anon;

drop function if exists public.be_finance_snapshot(text);
create or replace function public.be_finance_snapshot(p_search text default null) returns jsonb language sql security definer set search_path=public as $$select public.be_finance_snapshot_safe(p_search);$$;
grant execute on function public.be_finance_snapshot(text) to authenticated, anon;

drop function if exists public.be_golive_patch3n_status();
create or replace function public.be_golive_patch3n_status()
returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object('ok',true,'waybill_compatibility',jsonb_build_object('masterdata_records',(select count(*) from public.be_masterdata_delivery_records where waybill_no is not null),'field_assignments',(select count(*) from public.be_field_assignments),'live_field_jobs',(select count(*) from public.be_field_jobs_live_v)),'rider_driver_sync',jsonb_build_object('rider_jobs',(select count(*) from public.be_field_jobs_live_v where role='rider'),'driver_jobs',(select count(*) from public.be_field_jobs_live_v where role='driver')),'finance_invoice',jsonb_build_object('invoices',(select count(*) from public.be_finance_invoices),'invoice_lines',(select count(*) from public.be_finance_invoice_lines),'gl_entries',(select count(*) from public.be_finance_gl_entries)),'status','Patch 3N ready: finance, rider portal, driver portal and invoice APIs are wired to live backend');
$$;
grant execute on function public.be_golive_patch3n_status() to authenticated, anon;

notify pgrst,'reload schema';
commit;
select 'Patch 3N finance/rider/driver sync + invoice go-live fixes installed' as status;
