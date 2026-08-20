create extension if not exists pgcrypto;

create table if not exists public.be_report_catalog (
  id uuid primary key default gen_random_uuid(),
  report_name text not null,
  report_label_en text not null,
  report_label_mm text,
  module_code text not null,
  source_schema text not null default 'public',
  source_table text not null,
  date_column text not null default 'created_at',
  description text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_report_catalog
  add column if not exists id uuid,
  add column if not exists report_name text,
  add column if not exists report_label_en text,
  add column if not exists report_label_mm text,
  add column if not exists module_code text,
  add column if not exists source_schema text default 'public',
  add column if not exists source_table text,
  add column if not exists date_column text default 'created_at',
  add column if not exists description text,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_report_catalog set id = gen_random_uuid() where id is null;
alter table public.be_report_catalog alter column id set default gen_random_uuid();
create unique index if not exists be_report_catalog_name_module_uidx
on public.be_report_catalog(lower(report_name), lower(module_code));

create table if not exists public.be_report_download_events (
  id uuid primary key default gen_random_uuid(),
  module_code text,
  report_name text,
  actor_email text,
  date_from date,
  date_to date,
  filter_payload jsonb default '{}'::jsonb,
  row_count integer default 0,
  created_at timestamptz default now()
);

-- idempotent catalog seed without ON CONFLICT
create temporary table if not exists tmp_be_report_seed (
  report_name text,
  report_label_en text,
  report_label_mm text,
  module_code text,
  source_table text,
  date_column text,
  description text
) on commit drop;

truncate tmp_be_report_seed;

insert into tmp_be_report_seed values
('pickup_requests','Pickup Request Report','Pickup တောင်းဆိုမှု အစီရင်ခံစာ','dashboard','be_portal_pickup_requests','created_at','Submitted pickup requests and current operational status'),
('pickup_requests','Pickup Request Report','Pickup တောင်းဆိုမှု အစီရင်ခံစာ','create_delivery','be_portal_pickup_requests','created_at','Pickup requests submitted from create delivery'),
('customer_service_pickups','Customer Service Pickup Report','Customer Service Pickup အစီရင်ခံစာ','customer_service','be_portal_pickup_requests','created_at','Customer service submitted pickup/request records'),
('bulk_upload_batches','Bulk Upload Batch Report','Bulk Upload Batch အစီရင်ခံစာ','data_entry','be_bulk_upload_batches','created_at','Data Entry upload batches by template/source/status'),
('bulk_upload_rows','Bulk Upload Row Report','Bulk Upload Row အစီရင်ခံစာ','data_entry','be_bulk_upload_rows','created_at','Data Entry uploaded/staged webform rows'),
('template_sync_events','Template Auto Fill Report','Template Auto Fill အစီရင်ခံစာ','data_entry','be_template_sync_events','created_at','Rows synchronized by pickup/masterdata/tariff'),
('warehouse_scans','Warehouse Scan Report','Warehouse Scan အစီရင်ခံစာ','warehouse','be_warehouse_parcel_scans','created_at','Warehouse intake/sort/dispatch/exception scans'),
('warehouse_bulk_rows','Warehouse Bulk Row Report','Warehouse Bulk Row အစီရင်ခံစာ','warehouse','be_bulk_upload_rows','created_at','Warehouse uploaded/staged inventory rows'),
('workflow_events','Workflow Event Report','Workflow Event အစီရင်ခံစာ','workflow','be_logistics_workflow_events','created_at','Pickup, warehouse, delivery and return workflow events'),
('workflow_events','Exception / Process Report','Exception / Process အစီရင်ခံစာ','exceptions','be_logistics_workflow_events','created_at','Workflow status changes and exception events'),
('rider_pickup_verification','Rider Pickup Verification Report','Rider Pickup Verification အစီရင်ခံစာ','rider_ops','be_rider_field_verification_events','created_at','Rider field pickup/delivery verification activity'),
('parcel_proof_media','Proof Media Report','Proof Media အစီရင်ခံစာ','rider_ops','be_parcel_proof_media','created_at','Photo/signature proof records'),
('tariff_calculations','Delivery Charge Calculation Report','Delivery Charge Calculation အစီရင်ခံစာ','finance','be_delivery_charge_calculation_events','created_at','Background delivery charge calculation audit'),
('tariff_calculations','COD / Charge Report','COD / Charge အစီရင်ခံစာ','cod_settlement','be_delivery_charge_calculation_events','created_at','COD and delivery charge calculations'),
('finance_uploads','Finance Upload Report','Finance Upload အစီရင်ခံစာ','finance','be_bulk_upload_rows','created_at','Finance/COD imported rows'),
('branch_pickups','Branch Pickup Report','Branch Pickup အစီရင်ခံစာ','branch_office','be_portal_pickup_requests','created_at','Branch office pickup and delivery status'),
('way_management_events','Way Management Report','Way Management အစီရင်ခံစာ','way_management','be_logistics_workflow_events','created_at','Way/route workflow events'),
('dispatch_events','Dispatch Center Report','Dispatch Center အစီရင်ခံစာ','dispatch','be_logistics_workflow_events','created_at','Dispatch related workflow events'),
('supervisor_events','Supervisor Assignment Report','Supervisor Assignment အစီရင်ခံစာ','supervisor','be_logistics_workflow_events','created_at','Supervisor pickup assignment and wayplan events'),
('merchant_pickups','Merchant Portal Report','Merchant Portal အစီရင်ခံစာ','merchant','be_portal_pickup_requests','created_at','Merchant submitted pickup/shipment activity'),
('customer_pickups','Customer Portal Report','Customer Portal အစီရင်ခံစာ','customer','be_portal_pickup_requests','created_at','Customer submitted pickup/shipment activity'),
('masterdata_branches','Branch Masterdata Report','Branch Masterdata အစီရင်ခံစာ','master_data','be_branch_nodes','created_at','Branch and hub masterdata'),
('settings_rules','Workflow Rules Report','Workflow Rules အစီရင်ခံစာ','settings','be_logistics_process_status_master','created_at','Workflow status rules and process master'),
('all_submitted_data','All Submitted Data Report','Submitted Data အားလုံး','reporting','be_logistics_workflow_events','created_at','All workflow/audit submitted data by timeline');

update public.be_report_catalog c
set
  report_label_en = s.report_label_en,
  report_label_mm = s.report_label_mm,
  source_table = s.source_table,
  date_column = s.date_column,
  description = s.description,
  active = true,
  updated_at = now()
from tmp_be_report_seed s
where lower(c.report_name) = lower(s.report_name)
  and lower(c.module_code) = lower(s.module_code);

insert into public.be_report_catalog (
  report_name,
  report_label_en,
  report_label_mm,
  module_code,
  source_schema,
  source_table,
  date_column,
  description,
  active,
  created_at,
  updated_at
)
select
  s.report_name,
  s.report_label_en,
  s.report_label_mm,
  s.module_code,
  'public',
  s.source_table,
  s.date_column,
  s.description,
  true,
  now(),
  now()
from tmp_be_report_seed s
where not exists (
  select 1
  from public.be_report_catalog c
  where lower(c.report_name) = lower(s.report_name)
    and lower(c.module_code) = lower(s.module_code)
);

create or replace function public.be_get_report_catalog(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := lower(coalesce(p_payload->>'module_code', p_payload->>'module', ''));
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(c) order by c.report_label_en), '[]'::jsonb)
  into v_rows
  from public.be_report_catalog c
  where coalesce(c.active, true) = true
    and (
      v_module = ''
      or lower(c.module_code) = v_module
      or lower(c.module_code) = 'workflow'
      or lower(c.module_code) = 'reporting'
    );

  return jsonb_build_object('ok', true, 'module_code', v_module, 'reports', v_rows);
end;
$$;

create or replace function public.be_get_report_download_data(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := lower(coalesce(p_payload->>'module_code', p_payload->>'module', ''));
  v_report_name text := lower(coalesce(p_payload->>'report_name', ''));
  v_actor_email text := coalesce(p_payload->>'actor_email', '');
  v_date_from date := nullif(p_payload->>'date_from', '')::date;
  v_date_to date := nullif(p_payload->>'date_to', '')::date;
  v_month text := coalesce(p_payload->>'month', '');
  v_year text := coalesce(p_payload->>'year', '');
  v_limit integer := least(greatest(coalesce(nullif(p_payload->>'limit', '')::integer, 5000), 1), 50000);
  v_rows jsonb := '[]'::jsonb;
  v_piece jsonb := '[]'::jsonb;
  v_sql text;
  v_where text;
  v_order text;
  v_count integer := 0;
  v_total integer := 0;
  c record;
begin
  if v_month <> '' and v_date_from is null then
    v_date_from := (v_month || '-01')::date;
    v_date_to := (v_date_from + interval '1 month' - interval '1 day')::date;
  end if;

  if v_year <> '' and v_date_from is null then
    v_date_from := (v_year || '-01-01')::date;
    v_date_to := (v_date_from + interval '1 year' - interval '1 day')::date;
  end if;

  if v_date_from is null then
    v_date_from := current_date;
  end if;

  if v_date_to is null then
    v_date_to := v_date_from;
  end if;

  for c in
    select *
    from public.be_report_catalog
    where coalesce(active, true) = true
      and (v_report_name = '' or lower(report_name) = v_report_name or v_report_name = 'all')
      and (
        v_module = ''
        or lower(module_code) = v_module
        or lower(module_code) = 'workflow'
        or lower(module_code) = 'reporting'
      )
    order by module_code, report_name
  loop
    if to_regclass(format('%I.%I', c.source_schema, c.source_table)) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = c.source_schema
        and table_name = c.source_table
        and column_name = c.date_column
    ) then
      v_where := format(
        'where %I >= %L::date and %I < (%L::date + interval ''1 day'')',
        c.date_column,
        v_date_from,
        c.date_column,
        v_date_to
      );
      v_order := format('order by %I desc nulls last', c.date_column);
    else
      v_where := '';
      v_order := '';
    end if;

    v_sql := format(
      'select coalesce(jsonb_agg(jsonb_build_object(''report_name'', %L, ''report_label_en'', %L, ''report_label_mm'', %L, ''module_code'', %L, ''source_table'', %L, ''record'', to_jsonb(q))), ''[]''::jsonb) from (select * from %I.%I %s %s limit %s) q',
      c.report_name,
      c.report_label_en,
      coalesce(c.report_label_mm, c.report_label_en),
      c.module_code,
      c.source_table,
      c.source_schema,
      c.source_table,
      v_where,
      v_order,
      v_limit
    );

    begin
      execute v_sql into v_piece;
      v_rows := v_rows || coalesce(v_piece, '[]'::jsonb);
    exception when others then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'report_name', c.report_name,
        'module_code', c.module_code,
        'source_table', c.source_table,
        'error', SQLERRM
      ));
    end;
  end loop;

  v_total := jsonb_array_length(v_rows);

  insert into public.be_report_download_events (
    module_code,
    report_name,
    actor_email,
    date_from,
    date_to,
    filter_payload,
    row_count
  ) values (
    v_module,
    v_report_name,
    v_actor_email,
    v_date_from,
    v_date_to,
    p_payload,
    v_total
  );

  return jsonb_build_object(
    'ok', true,
    'module_code', v_module,
    'report_name', v_report_name,
    'date_from', v_date_from,
    'date_to', v_date_to,
    'row_count', v_total,
    'rows', v_rows
  );
end;
$$;

grant execute on function public.be_get_report_catalog(jsonb) to anon, authenticated;
grant execute on function public.be_get_report_download_data(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
