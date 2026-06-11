-- Britium Express Patch 2Y
-- Multi-delivery pickup workflow + document vault integration helpers + Rider App sync support

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Core tables: pickup batch can have many delivery parcels
-- ---------------------------------------------------------------------------

create table if not exists public.pickup_batches (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique,
  way_id text,
  pickup_date date default current_date,
  pickup_type text default 'merchant',
  merchant_id text,
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  sender_address text,
  pickup_time timestamptz,
  cod_amount numeric default 0,
  parcel_count int default 0,
  status text default 'pending_assignment',
  assigned_rider_name text,
  assigned_driver_name text,
  assigned_helper_name text,
  assigned_vehicle_plate text,
  supervisor_note text,
  source_channel text default 'customer_service',
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.pickup_batches
  add column if not exists pickup_id text,
  add column if not exists way_id text,
  add column if not exists pickup_date date default current_date,
  add column if not exists pickup_type text default 'merchant',
  add column if not exists merchant_id text,
  add column if not exists merchant_code text,
  add column if not exists merchant_name text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists sender_address text,
  add column if not exists pickup_time timestamptz,
  add column if not exists cod_amount numeric default 0,
  add column if not exists parcel_count int default 0,
  add column if not exists status text default 'pending_assignment',
  add column if not exists assigned_rider_name text,
  add column if not exists assigned_driver_name text,
  add column if not exists assigned_helper_name text,
  add column if not exists assigned_vehicle_plate text,
  add column if not exists supervisor_note text,
  add column if not exists source_channel text default 'customer_service',
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_pickup_batches_pickup_id on public.pickup_batches(pickup_id);
create index if not exists idx_pickup_batches_status on public.pickup_batches(status);
create index if not exists idx_pickup_batches_created on public.pickup_batches(created_at desc);

create table if not exists public.pickup_delivery_parcels (
  id uuid primary key default gen_random_uuid(),
  pickup_batch_id uuid,
  pickup_id text,
  delivery_id text unique,
  way_id text,
  pickup_date date,
  merchant_name text,
  merchant_code text,
  recipient_name text,
  recipient_phone text,
  city text,
  township text,
  recipient_address text,
  item_price numeric default 0,
  delivery_fee_os numeric default 0,
  cod_amount numeric default 0,
  weight numeric default 0,
  surcharge numeric default 0,
  delivery_fee_max numeric default 0,
  actual_collect numeric default 0,
  destination text,
  pickup_by text,
  remarks text,
  status text default 'draft',
  photo_urls jsonb default '[]'::jsonb,
  submitted_by_role text,
  submitted_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.pickup_delivery_parcels
  add column if not exists pickup_batch_id uuid,
  add column if not exists pickup_id text,
  add column if not exists delivery_id text,
  add column if not exists way_id text,
  add column if not exists pickup_date date,
  add column if not exists merchant_name text,
  add column if not exists merchant_code text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists city text,
  add column if not exists township text,
  add column if not exists recipient_address text,
  add column if not exists item_price numeric default 0,
  add column if not exists delivery_fee_os numeric default 0,
  add column if not exists cod_amount numeric default 0,
  add column if not exists weight numeric default 0,
  add column if not exists surcharge numeric default 0,
  add column if not exists delivery_fee_max numeric default 0,
  add column if not exists actual_collect numeric default 0,
  add column if not exists destination text,
  add column if not exists pickup_by text,
  add column if not exists remarks text,
  add column if not exists status text default 'draft',
  add column if not exists photo_urls jsonb default '[]'::jsonb,
  add column if not exists submitted_by_role text,
  add column if not exists submitted_by uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_pickup_delivery_parcels_delivery_id on public.pickup_delivery_parcels(delivery_id);
create index if not exists idx_pickup_delivery_parcels_pickup_id on public.pickup_delivery_parcels(pickup_id);
create index if not exists idx_pickup_delivery_parcels_name_phone on public.pickup_delivery_parcels(lower(recipient_name), recipient_phone);

-- ---------------------------------------------------------------------------
-- 2. Document vault and contract approval support
-- ---------------------------------------------------------------------------

create table if not exists public.document_vault (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  entity_name text,
  document_type text default 'general',
  title text not null,
  file_url text,
  file_name text,
  version_no int default 1,
  status text default 'draft',
  britium_approved_by uuid,
  britium_approved_at timestamptz,
  counterparty_approved_by uuid,
  counterparty_approved_at timestamptz,
  amendment_of uuid,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_document_vault_entity on public.document_vault(entity_type, entity_id);
create index if not exists idx_document_vault_status on public.document_vault(status);

create or replace function public.be_document_vault_snapshot(
  p_entity_type text default null,
  p_entity_id text default null,
  p_search text default null
)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'documents',
  coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb),
  'generated_at', now()
)
from public.document_vault d
where (p_entity_type is null or d.entity_type = p_entity_type)
  and (p_entity_id is null or d.entity_id = p_entity_id)
  and (
    p_search is null
    or d.title ilike '%'||p_search||'%'
    or d.entity_name ilike '%'||p_search||'%'
    or d.document_type ilike '%'||p_search||'%'
  );
$$;

create or replace function public.be_document_add_amendment(
  p_entity_type text,
  p_entity_id text,
  p_entity_name text,
  p_document_type text,
  p_title text,
  p_file_url text,
  p_file_name text,
  p_amendment_of uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_version int;
  v_row jsonb;
begin
  select coalesce(max(version_no),0)+1 into v_version
  from public.document_vault
  where entity_type = p_entity_type and entity_id = p_entity_id and document_type = p_document_type;

  insert into public.document_vault(entity_type,entity_id,entity_name,document_type,title,file_url,file_name,version_no,status,amendment_of,notes)
  values(p_entity_type,p_entity_id,p_entity_name,p_document_type,p_title,p_file_url,p_file_name,v_version,'pending_britium_approval',p_amendment_of,p_notes)
  returning to_jsonb(document_vault.*) into v_row;

  return v_row;
end;
$$;

create or replace function public.be_document_approve(
  p_document_id uuid,
  p_side text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.document_vault;
begin
  if p_side = 'britium' then
    update public.document_vault
    set britium_approved_by = auth.uid(),
        britium_approved_at = now(),
        status = case when counterparty_approved_at is not null then 'approved_locked' else 'pending_counterparty_approval' end,
        notes = coalesce(p_note, notes),
        updated_at = now()
    where id = p_document_id
    returning * into v_row;
  else
    update public.document_vault
    set counterparty_approved_by = auth.uid(),
        counterparty_approved_at = now(),
        status = case when britium_approved_at is not null then 'approved_locked' else 'pending_britium_approval' end,
        notes = coalesce(p_note, notes),
        updated_at = now()
    where id = p_document_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Way ID / Delivery ID helpers
-- ---------------------------------------------------------------------------

create or replace function public.be_clean_merchant_code(
  p_pickup_type text,
  p_merchant_name text default null,
  p_merchant_code text default null
)
returns text
language plpgsql
immutable
as $$
declare
  v_code text;
  v_words text[];
  v_word text;
begin
  if lower(coalesce(p_pickup_type,'customer')) in ('customer','normal_customer','normal','walkin','walk_in') then
    return 'CU';
  end if;
  v_code := upper(regexp_replace(coalesce(nullif(p_merchant_code,''), ''), '[^A-Za-z0-9]+', '', 'g'));
  if v_code <> '' then return left(v_code, 8); end if;
  v_words := regexp_split_to_array(coalesce(p_merchant_name,'MER'), '\s+');
  v_code := '';
  foreach v_word in array v_words loop
    if trim(v_word) <> '' then
      v_code := v_code || upper(left(regexp_replace(v_word, '[^A-Za-z0-9]+','','g'),1));
    end if;
  end loop;
  if v_code = '' then v_code := 'MER'; end if;
  return left(v_code, 8);
end;
$$;

create or replace function public.be_next_way_id(
  p_pickup_date date,
  p_pickup_type text,
  p_merchant_name text default null,
  p_merchant_code text default null
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_prefix text;
  v_date_part text;
  v_next int;
begin
  v_date_part := to_char(coalesce(p_pickup_date,current_date), 'MMDD');
  v_prefix := public.be_clean_merchant_code(p_pickup_type,p_merchant_name,p_merchant_code);

  select count(*) + 1 into v_next
  from (
    select coalesce(pickup_id,way_id,'') as code from public.pickup_batches
    union all
    select coalesce(pickup_id,way_id,'') as code from public.pickup_delivery_parcels
    union all
    select coalesce(pickup_id,way_id,'') as code from public.pickup_delivery_form_submissions
  ) x
  where code like 'D'||v_date_part||'-'||v_prefix||'-%';

  return 'D'||v_date_part||'-'||v_prefix||'-'||lpad(v_next::text,3,'0');
end;
$$;

create or replace function public.be_resolve_way_id(
  p_existing_way_id text default null,
  p_pickup_date date default current_date,
  p_pickup_type text default 'customer',
  p_merchant_name text default null,
  p_merchant_code text default null
)
returns text
language plpgsql
security definer
set search_path=public
as $$
begin
  if trim(coalesce(p_existing_way_id,'')) <> '' then
    return trim(p_existing_way_id);
  end if;
  return public.be_next_way_id(p_pickup_date,p_pickup_type,p_merchant_name,p_merchant_code);
end;
$$;

create or replace function public.be_next_delivery_id(p_pickup_id text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_next int;
begin
  select count(*) + 1 into v_next
  from public.pickup_delivery_parcels
  where pickup_id = p_pickup_id;
  return p_pickup_id || '-' || lpad(v_next::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Pickup / delivery submission and assignment
-- ---------------------------------------------------------------------------

create or replace function public.be_create_pickup_batch(
  p_existing_way_id text default null,
  p_pickup_date date default current_date,
  p_pickup_type text default 'merchant',
  p_merchant_name text default null,
  p_merchant_code text default null,
  p_sender_name text default null,
  p_sender_phone text default null,
  p_sender_address text default null,
  p_pickup_time timestamptz default null,
  p_cod_amount numeric default 0,
  p_parcel_count int default 0,
  p_source_channel text default 'customer_service'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_way_id text;
  v_row public.pickup_batches;
begin
  v_way_id := public.be_resolve_way_id(p_existing_way_id,p_pickup_date,p_pickup_type,p_merchant_name,p_merchant_code);

  insert into public.pickup_batches(
    pickup_id, way_id, pickup_date, pickup_type, merchant_name, merchant_code,
    sender_name, sender_phone, sender_address, pickup_time, cod_amount, parcel_count,
    status, source_channel
  )
  values(
    v_way_id, v_way_id, p_pickup_date, p_pickup_type, p_merchant_name, p_merchant_code,
    p_sender_name, p_sender_phone, p_sender_address, p_pickup_time, coalesce(p_cod_amount,0), coalesce(p_parcel_count,0),
    'pending_assignment', p_source_channel
  )
  on conflict (pickup_id) do update
  set sender_name=coalesce(excluded.sender_name,pickup_batches.sender_name),
      sender_phone=coalesce(excluded.sender_phone,pickup_batches.sender_phone),
      sender_address=coalesce(excluded.sender_address,pickup_batches.sender_address),
      pickup_time=coalesce(excluded.pickup_time,pickup_batches.pickup_time),
      cod_amount=coalesce(excluded.cod_amount,pickup_batches.cod_amount),
      parcel_count=greatest(coalesce(pickup_batches.parcel_count,0),coalesce(excluded.parcel_count,0)),
      updated_at=now()
  returning * into v_row;

  insert into public.app_notifications(target_role,type,title,message,link,payload)
  select r.role, 'pickup_assignment_required', 'Pickup needs supervisor assignment',
         'Pickup '||v_way_id||' requires rider/driver/helper assignment.',
         '/pickup-delivery-form',
         jsonb_build_object('pickup_id', v_way_id, 'merchant_name', p_merchant_name, 'sender_name', p_sender_name)
  from (values ('superadmin'),('super_admin'),('admin'),('operations_manager'),('operation_manager'),('operations_supervisor'),('operation_supervisor'),('finance'),('business_development_manager'),('data_entry')) r(role)
  on conflict do nothing;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_assign_pickup_batch(
  p_pickup_id text,
  p_rider_name text default null,
  p_driver_name text default null,
  p_helper_name text default null,
  p_vehicle_plate text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.pickup_batches;
begin
  update public.pickup_batches
  set assigned_rider_name = nullif(p_rider_name,''),
      assigned_driver_name = nullif(p_driver_name,''),
      assigned_helper_name = nullif(p_helper_name,''),
      assigned_vehicle_plate = nullif(p_vehicle_plate,''),
      supervisor_note = p_note,
      status = 'assigned',
      updated_at = now()
  where pickup_id = p_pickup_id
  returning * into v_row;

  insert into public.app_notifications(target_role,type,title,message,link,payload)
  values
    ('rider','pickup_assigned','Pickup assigned','Pickup '||p_pickup_id||' has been assigned.','/rider/pickups',jsonb_build_object('pickup_id',p_pickup_id,'rider',p_rider_name)),
    ('driver','pickup_assigned','Pickup assigned','Pickup '||p_pickup_id||' has been assigned.','/driver/pickups',jsonb_build_object('pickup_id',p_pickup_id,'driver',p_driver_name)),
    ('helper','pickup_assigned','Pickup assigned','Pickup '||p_pickup_id||' has been assigned.','/helper/pickups',jsonb_build_object('pickup_id',p_pickup_id,'helper',p_helper_name));

  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_submit_delivery_parcel(
  p_pickup_id text,
  p_delivery_id text default null,
  p_payload jsonb default '{}'::jsonb,
  p_photo_urls jsonb default '[]'::jsonb,
  p_submitter_role text default 'data_entry'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_delivery_id text;
  v_row public.pickup_delivery_parcels;
begin
  v_delivery_id := coalesce(nullif(p_delivery_id,''), public.be_next_delivery_id(p_pickup_id));

  insert into public.pickup_delivery_parcels(
    pickup_id, delivery_id, way_id, pickup_date, merchant_name, merchant_code,
    recipient_name, recipient_phone, city, township, recipient_address,
    item_price, delivery_fee_os, cod_amount, weight, surcharge, delivery_fee_max, actual_collect,
    destination, pickup_by, remarks, status, photo_urls, submitted_by_role
  )
  values(
    p_pickup_id, v_delivery_id, v_delivery_id, nullif(p_payload->>'pickup_date','')::date,
    p_payload->>'merchant_name', p_payload->>'merchant_code',
    p_payload->>'recipient_name', p_payload->>'recipient_phone',
    p_payload->>'city', p_payload->>'township', p_payload->>'recipient_address',
    coalesce(nullif(p_payload->>'item_price','')::numeric,0),
    coalesce(nullif(p_payload->>'delivery_fee_os','')::numeric,0),
    coalesce(nullif(p_payload->>'cod_amount','')::numeric,0),
    coalesce(nullif(p_payload->>'weight','')::numeric,0),
    coalesce(nullif(p_payload->>'surcharge','')::numeric,0),
    coalesce(nullif(p_payload->>'delivery_fee_max','')::numeric,0),
    coalesce(nullif(p_payload->>'actual_collect','')::numeric,0),
    p_payload->>'destination', p_payload->>'pickup_by', p_payload->>'remarks',
    'submitted', p_photo_urls, p_submitter_role
  )
  on conflict (delivery_id) do update
  set recipient_name=excluded.recipient_name,
      recipient_phone=excluded.recipient_phone,
      city=excluded.city,
      township=excluded.township,
      recipient_address=excluded.recipient_address,
      item_price=excluded.item_price,
      delivery_fee_os=excluded.delivery_fee_os,
      cod_amount=excluded.cod_amount,
      weight=excluded.weight,
      surcharge=excluded.surcharge,
      delivery_fee_max=excluded.delivery_fee_max,
      actual_collect=excluded.actual_collect,
      photo_urls=excluded.photo_urls,
      updated_at=now()
  returning * into v_row;

  update public.pickup_batches
  set parcel_count = (select count(*) from public.pickup_delivery_parcels where pickup_id = p_pickup_id),
      updated_at = now()
  where pickup_id = p_pickup_id;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Snapshot, master data dropdown, historical suggestions
-- ---------------------------------------------------------------------------

create or replace function public.be_pdf_snapshot(p_search text default null)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'summary', jsonb_build_object(
    'pickup_batches', (select count(*) from public.pickup_batches),
    'delivery_parcels', (select count(*) from public.pickup_delivery_parcels),
    'pending_assignment', (select count(*) from public.pickup_batches where status='pending_assignment')
  ),
  'pickup_batches', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.pickup_batches b
    where p_search is null or b.pickup_id ilike '%'||p_search||'%' or b.merchant_name ilike '%'||p_search||'%' or b.sender_name ilike '%'||p_search||'%'
    limit 200), '[]'::jsonb),
  'submissions', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.pickup_delivery_parcels p
    where p_search is null or p.pickup_id ilike '%'||p_search||'%' or p.delivery_id ilike '%'||p_search||'%' or p.recipient_name ilike '%'||p_search||'%' or p.recipient_phone ilike '%'||p_search||'%'
    limit 500), '[]'::jsonb),
  'generated_at', now()
);
$$;

create or replace function public.be_pickup_supervisor_snapshot(p_search text default null)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'pending', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.pickup_batches b where b.status in ('pending_assignment','assigned') and (p_search is null or b.pickup_id ilike '%'||p_search||'%' or b.merchant_name ilike '%'||p_search||'%')), '[]'::jsonb),
  'staff', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'email',email,'role',role,'phone',phone)) from public.profiles where lower(coalesce(role,'')) in ('rider','driver','helper')), '[]'::jsonb),
  'generated_at', now()
);
$$;

create or replace function public.be_pickup_delivery_detail(p_pickup_id text)
returns jsonb
language sql
security definer
set search_path=public
as $$
select jsonb_build_object(
  'pickup', (select to_jsonb(b) from public.pickup_batches b where b.pickup_id=p_pickup_id limit 1),
  'parcels', coalesce((select jsonb_agg(to_jsonb(p) order by p.delivery_id) from public.pickup_delivery_parcels p where p.pickup_id=p_pickup_id), '[]'::jsonb),
  'generated_at', now()
);
$$;

create or replace function public.be_data_entry_history_suggest(p_name text, p_phone text)
returns jsonb
language sql
security definer
set search_path=public
as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'recipient_name', recipient_name,
  'recipient_phone', recipient_phone,
  'city', city,
  'township', township,
  'recipient_address', recipient_address,
  'merchant_name', merchant_name,
  'last_delivery_id', delivery_id,
  'last_seen_at', created_at
) order by created_at desc), '[]'::jsonb)
from public.pickup_delivery_parcels
where lower(coalesce(recipient_name,''))=lower(coalesce(p_name,''))
  and coalesce(recipient_phone,'')=coalesce(p_phone,'')
limit 10;
$$;

create or replace function public.be_data_entry_master_options(p_type text, p_search text default null)
returns jsonb
language sql
security definer
set search_path=public
as $$
with opts as (
  select distinct 'township'::text as type, township::text as label, township::text as value from public.township_tariffs where township is not null
  union
  select distinct 'city'::text as type, city::text as label, city::text as value from public.branch_offices where city is not null
  union
  select distinct 'merchant'::text as type, merchant_name::text as label, merchant_code::text as value from public.merchant_admin_overrides where merchant_name is not null
  union
  select distinct 'staff'::text as type, full_name::text as label, id::text as value from public.profiles where full_name is not null
)
select coalesce(jsonb_agg(to_jsonb(opts) order by label), '[]'::jsonb)
from opts
where type = p_type
  and (p_search is null or label ilike '%'||p_search||'%' or value ilike '%'||p_search||'%')
limit 50;
$$;

-- ---------------------------------------------------------------------------
-- 6. Customer service -> Marketing escalation helper
-- ---------------------------------------------------------------------------

create table if not exists public.department_escalations (
  id uuid primary key default gen_random_uuid(),
  source_department text,
  target_department text,
  issue_type text,
  title text,
  description text,
  entity_type text,
  entity_name text,
  priority text default 'medium',
  status text default 'open',
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.be_create_department_escalation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.department_escalations;
begin
  insert into public.department_escalations(source_department,target_department,issue_type,title,description,entity_type,entity_name,priority,status)
  values(
    p_payload->>'source_department',
    p_payload->>'target_department',
    p_payload->>'issue_type',
    p_payload->>'title',
    p_payload->>'description',
    p_payload->>'entity_type',
    p_payload->>'entity_name',
    coalesce(p_payload->>'priority','medium'),
    'open'
  )
  returning * into v_row;

  insert into public.app_notifications(target_role,type,title,message,link,payload)
  values('marketing_manager','department_escalation',v_row.title,coalesce(v_row.description,''),'/marketing',to_jsonb(v_row)),
        ('marketing_user','department_escalation',v_row.title,coalesce(v_row.description,''),'/marketing',to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;

grant execute on all functions in schema public to authenticated;
grant execute on function public.be_pdf_snapshot(text) to anon;
notify pgrst, 'reload schema';

commit;

select 'Patch 2Y document vault integration, multi-delivery pickup, Rider App pickup sync backend ready' as status;