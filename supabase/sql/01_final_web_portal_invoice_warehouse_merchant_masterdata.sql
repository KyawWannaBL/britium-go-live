
-- Final web portal go-live fix: invoice number, warehouse web view, merchant portal, master data CSV upload.
drop function if exists public.be_invoice_no_from_pickup_id(text);
create or replace function public.be_invoice_no_from_pickup_id(p_pickup_id text)
returns text language plpgsql immutable as $$
declare v text := upper(trim(coalesce(p_pickup_id, '')));
begin
  if v ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$' then
    return 'I' || substring(v from 2);
  end if;
  return 'I-' || regexp_replace(v, '[^A-Z0-9]+', '-', 'g');
end $$;

alter table public.be_portal_cargo_events
  add column if not exists invoice_no text,
  add column if not exists invoice_date date,
  add column if not exists invoice_generated_at timestamptz,
  add column if not exists waybill_printed_at timestamptz,
  add column if not exists waybill_print_count integer default 0,
  add column if not exists warehouse_status text,
  add column if not exists warehouse_bin text,
  add column if not exists warehouse_checked_at timestamptz,
  add column if not exists warehouse_checked_by uuid,
  add column if not exists updated_at timestamptz default now();

drop function if exists public.be_invoice_generate_for_pickup(text,date);
create or replace function public.be_invoice_generate_for_pickup(p_pickup_id text, p_invoice_date date default null)
returns jsonb language plpgsql security definer as $$
declare
  v_pickup_id text := upper(trim(p_pickup_id));
  v_invoice_no text := public.be_invoice_no_from_pickup_id(upper(trim(p_pickup_id)));
  v_invoice_date date := coalesce(p_invoice_date, current_date);
  v_row_count integer := 0;
  v_totals jsonb;
begin
  if not exists (select 1 from public.be_portal_pickup_requests where pickup_id = v_pickup_id and coalesce(status,'') <> 'archived_test_data') then
    raise exception 'Pickup % not found or archived', p_pickup_id;
  end if;

  update public.be_portal_cargo_events
  set invoice_no = v_invoice_no, invoice_date = v_invoice_date, invoice_generated_at = now(), updated_at = now()
  where pickup_id = v_pickup_id and event_type = 'data_entry_waybill' and coalesce(status,'') <> 'archived_test_data';
  get diagnostics v_row_count = row_count;

  select jsonb_build_object(
    'parcel_count', count(*),
    'delivery_fee_total', coalesce(sum(coalesce(deli_fee_os, std_deli, 0)), 0),
    'cod_total', coalesce(sum(coalesce(cod_os, final_cod, cod_amount, 0)), 0),
    'surcharge_total', coalesce(sum(coalesce(surcharge, 0)), 0),
    'weight_total', coalesce(sum(coalesce(weight_kg, 0)), 0),
    'final_cod_total', coalesce(sum(coalesce(final_cod, cod_amount, 0)), 0)
  ) into v_totals
  from public.be_portal_cargo_events
  where pickup_id = v_pickup_id and event_type = 'data_entry_waybill' and coalesce(status,'') <> 'archived_test_data';

  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'invoice_no', v_invoice_no, 'invoice_date', v_invoice_date, 'row_count', v_row_count, 'totals', v_totals);
end $$;

drop function if exists public.be_finance_generate_invoice_for_pickup(text,date);
create or replace function public.be_finance_generate_invoice_for_pickup(p_pickup_id text, p_invoice_date date default null)
returns jsonb language sql security definer as $$
  select public.be_invoice_generate_for_pickup(p_pickup_id, p_invoice_date);
$$;

drop function if exists public.be_invoice_print_rows(text);
create or replace function public.be_invoice_print_rows(p_pickup_id text)
returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'invoice_no', coalesce(e.invoice_no, public.be_invoice_no_from_pickup_id(e.pickup_id)),
    'invoice_date', coalesce(e.invoice_date, current_date),
    'pickup_id', e.pickup_id,
    'pickup_way_id', e.pickup_id,
    'deliver_way_id', coalesce(e.deliver_way_id, e.tracking_no),
    'tracking_no', coalesce(e.tracking_no, e.deliver_way_id),
    'merchant_code', p.merchant_code,
    'merchant_name', coalesce(p.merchant_name, e.merchant),
    'sender_name', p.sender_name,
    'sender_phone', p.sender_phone,
    'pickup_address', p.pickup_address,
    'recipient_name', e.receiver_name,
    'recipient_phone', e.receiver_phone,
    'recipient_town', coalesce(e.recipient_town, e.delivery_township),
    'delivery_address', e.delivery_address,
    'item_price', coalesce(e.item_price, 0),
    'deli_fee_os', coalesce(e.deli_fee_os, e.std_deli, 0),
    'cod_os', coalesce(e.cod_os, 0),
    'weight_kg', coalesce(e.weight_kg, 0),
    'surcharge', coalesce(e.surcharge, 0),
    'final_cod', coalesce(e.final_cod, e.cod_amount, 0),
    'finance_status', coalesce(e.finance_status, 'pending'),
    'status', e.status
  ) order by e.line_no), '[]'::jsonb)
  from public.be_portal_cargo_events e
  join public.be_portal_pickup_requests p on p.pickup_id = e.pickup_id
  where e.pickup_id = p_pickup_id and e.event_type = 'data_entry_waybill' and coalesce(e.status,'') <> 'archived_test_data';
$$;

drop function if exists public.be_warehouse_dashboard_snapshot(text,integer);
create or replace function public.be_warehouse_dashboard_snapshot(p_search text default '', p_limit integer default 200)
returns jsonb language sql security definer as $$
  with rows as (
    select e.id, e.pickup_id, coalesce(e.deliver_way_id,e.tracking_no) deliver_way_id, e.line_no,
      coalesce(p.merchant_name,e.merchant,p.merchant_code) merchant_name, p.merchant_code, p.pickup_address, p.township pickup_township,
      coalesce(e.receiver_name,'-') recipient_name, coalesce(e.receiver_phone,'-') recipient_phone,
      coalesce(e.recipient_town,e.delivery_township,'-') recipient_town, coalesce(e.delivery_address,'-') delivery_address,
      coalesce(e.status,'assigned') status, coalesce(e.warehouse_status,'pending_receive') warehouse_status,
      e.warehouse_bin, coalesce(e.field_pickup_checked,false) field_pickup_checked,
      coalesce(e.data_entry_registration_checked,false) data_entry_registration_checked, e.updated_at
    from public.be_portal_cargo_events e
    join public.be_portal_pickup_requests p on p.pickup_id=e.pickup_id
    where e.event_type='data_entry_waybill' and coalesce(e.status,'') <> 'archived_test_data' and coalesce(p.status,'') <> 'archived_test_data'
      and (coalesce(p_search,'')='' or e.pickup_id ilike '%'||p_search||'%' or coalesce(e.deliver_way_id,e.tracking_no,'') ilike '%'||p_search||'%' or coalesce(p.merchant_name,'') ilike '%'||p_search||'%')
    order by e.updated_at desc nulls last, e.created_at desc
    limit coalesce(p_limit,200)
  )
  select jsonb_build_object('ok',true,'metrics',jsonb_build_object(
    'total',(select count(*) from rows),
    'pending_receive',(select count(*) from rows where warehouse_status='pending_receive'),
    'received',(select count(*) from rows where warehouse_status='received'),
    'exception',(select count(*) from rows where warehouse_status='exception')
  ), 'rows', coalesce((select jsonb_agg(to_jsonb(rows)) from rows),'[]'::jsonb));
$$;

drop function if exists public.be_warehouse_update_waybill(uuid,text,text,text);
create or replace function public.be_warehouse_update_waybill(p_event_id uuid, p_status text, p_bin text default null, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare v_row public.be_portal_cargo_events;
begin
  update public.be_portal_cargo_events
  set warehouse_status=coalesce(nullif(p_status,''), warehouse_status, 'received'), warehouse_bin=coalesce(nullif(p_bin,''), warehouse_bin),
      warehouse_checked_at=now(), warehouse_checked_by=auth.uid(),
      payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('warehouse_note',p_note,'warehouse_status',coalesce(nullif(p_status,''),warehouse_status,'received'),'warehouse_checked_at',now()),
      updated_at=now()
  where id=p_event_id returning * into v_row;
  if v_row.id is null then raise exception 'Warehouse waybill row not found'; end if;
  return jsonb_build_object('ok',true,'row',to_jsonb(v_row));
end $$;

drop function if exists public.be_merchant_portal_snapshot(text,integer);
create or replace function public.be_merchant_portal_snapshot(p_merchant_code text default null, p_limit integer default 100)
returns jsonb language sql security definer as $$
  with pickups as (
    select * from public.be_portal_pickup_requests p
    where coalesce(p.status,'') <> 'archived_test_data' and (coalesce(p_merchant_code,'')='' or upper(p.merchant_code)=upper(p_merchant_code))
    order by created_at desc limit coalesce(p_limit,100)
  ),
  jobs as (
    select e.*, p.merchant_code, p.merchant_name
    from public.be_portal_cargo_events e join pickups p on p.pickup_id=e.pickup_id
    where e.event_type='data_entry_waybill' and coalesce(e.status,'') <> 'archived_test_data'
  )
  select jsonb_build_object(
    'ok',true,
    'metrics',jsonb_build_object('pickups',(select count(*) from pickups),'waybills',(select count(*) from jobs),'cod_total',(select coalesce(sum(coalesce(final_cod,cod_amount,0)),0) from jobs),'delivered',(select count(*) from jobs where status in ('delivered','cod_collected','cod_handed_over','settled'))),
    'pickups',coalesce((select jsonb_agg(to_jsonb(pickups) order by created_at desc) from pickups),'[]'::jsonb),
    'waybills',coalesce((select jsonb_agg(jsonb_build_object('id',id,'pickup_id',pickup_id,'deliver_way_id',coalesce(deliver_way_id,tracking_no),'merchant_code',merchant_code,'merchant_name',merchant_name,'recipient_name',receiver_name,'recipient_phone',receiver_phone,'recipient_town',coalesce(recipient_town,delivery_township),'delivery_address',delivery_address,'final_cod',coalesce(final_cod,cod_amount,0),'status',status) order by created_at desc) from jobs),'[]'::jsonb)
  );
$$;

drop function if exists public.be_master_data_rows(text,text,integer);
create or replace function public.be_master_data_rows(p_master_type text, p_search text default '', p_limit integer default 200)
returns jsonb language plpgsql security definer as $$
declare v jsonb := '[]'::jsonb;
begin
  if p_master_type='merchant_master' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.merchant_name),'[]'::jsonb) into v from (
      select * from public.merchant_master
      where coalesce(p_search,'')='' or merchant_id ilike '%'||p_search||'%' or coalesce(merchant_code,'') ilike '%'||p_search||'%' or merchant_name ilike '%'||p_search||'%'
      limit coalesce(p_limit,200)
    ) x;
  elsif p_master_type in ('workforce_master','rider_master') then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.workforce_type,x.workforce_code),'[]'::jsonb) into v from (
      select * from public.be_mobile_workforce_accounts
      where coalesce(p_search,'')='' or workforce_code ilike '%'||p_search||'%' or display_name ilike '%'||p_search||'%' or email ilike '%'||p_search||'%'
      limit coalesce(p_limit,200)
    ) x;
  elsif p_master_type='tariff_master' and to_regclass('public.current_app_tariffs') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.current_app_tariffs limit $1) x' into v using coalesce(p_limit,200);
  end if;
  return v;
end $$;

drop function if exists public.be_master_data_csv_upload(text,jsonb);
create or replace function public.be_master_data_csv_upload(p_master_type text, p_rows jsonb)
returns jsonb language plpgsql security definer as $$
declare r jsonb; v_count int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be json array'; end if;
  if p_master_type <> 'merchant_master' then raise exception 'CSV upload currently enabled for merchant_master only'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.merchant_master (
      merchant_id, merchant_code, merchant_name, business_type, contact_person, phone_primary, phone_secondary, email, address_line_1, address_line_2, township, city, region_state, default_pickup_address, default_pickup_time_window, payment_terms, contract_status, is_active, standard_allowance_kg, special_allowance_kg, extra_per_kg_mmk, updated_at
    ) values (
      upper(coalesce(r->>'merchant_code', r->>'merchant_id')), upper(coalesce(r->>'merchant_code', r->>'merchant_id')), coalesce(r->>'merchant_name', r->>'display_name'), coalesce(r->>'business_type','retail'), r->>'contact_person', r->>'phone_primary', r->>'phone_secondary', r->>'email', r->>'address_line_1', r->>'address_line_2', r->>'township', coalesce(r->>'city','Yangon'), coalesce(r->>'region_state','Yangon Region'), coalesce(nullif(r->>'default_pickup_address',''), r->>'address_line_1'), r->>'default_pickup_time_window', coalesce(r->>'payment_terms','COD'), lower(coalesce(r->>'contract_status','active')), coalesce(nullif(r->>'is_active','')::boolean,true), coalesce(nullif(r->>'standard_allowance_kg','')::numeric,3), coalesce(nullif(r->>'special_allowance_kg','')::numeric,5), coalesce(nullif(r->>'extra_per_kg_mmk','')::numeric,500), now()
    )
    on conflict (merchant_id) do update set
      merchant_code=excluded.merchant_code, merchant_name=excluded.merchant_name, business_type=excluded.business_type, contact_person=excluded.contact_person, phone_primary=excluded.phone_primary, phone_secondary=excluded.phone_secondary, email=excluded.email, address_line_1=excluded.address_line_1, address_line_2=excluded.address_line_2, township=excluded.township, city=excluded.city, region_state=excluded.region_state, default_pickup_address=excluded.default_pickup_address, default_pickup_time_window=excluded.default_pickup_time_window, payment_terms=excluded.payment_terms, contract_status=excluded.contract_status, is_active=excluded.is_active, standard_allowance_kg=excluded.standard_allowance_kg, special_allowance_kg=excluded.special_allowance_kg, extra_per_kg_mmk=excluded.extra_per_kg_mmk, updated_at=now();
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok',true,'master_type',p_master_type,'upserted',v_count);
end $$;

grant execute on function public.be_invoice_no_from_pickup_id(text) to authenticated;
grant execute on function public.be_invoice_generate_for_pickup(text,date) to authenticated;
grant execute on function public.be_finance_generate_invoice_for_pickup(text,date) to authenticated;
grant execute on function public.be_invoice_print_rows(text) to authenticated;
grant execute on function public.be_warehouse_dashboard_snapshot(text,integer) to authenticated;
grant execute on function public.be_warehouse_update_waybill(uuid,text,text,text) to authenticated;
grant execute on function public.be_merchant_portal_snapshot(text,integer) to authenticated;
grant execute on function public.be_master_data_rows(text,text,integer) to authenticated;
grant execute on function public.be_master_data_csv_upload(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
