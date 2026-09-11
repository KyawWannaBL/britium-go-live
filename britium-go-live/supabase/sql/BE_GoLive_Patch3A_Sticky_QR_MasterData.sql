-- Britium Patch 3A: sticky UI support, master dropdowns, multi-delivery pickup, temporary pickup QR.
begin;
create extension if not exists pgcrypto;

create table if not exists public.be_master_data_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null,
  label text not null,
  value text not null,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_be_master_data_options_unique on public.be_master_data_options(option_type, value);

insert into public.be_master_data_options(option_type,label,value,meta,source) values
('city','Yangon','Yangon','{}','patch3a_seed'),
('city','Mandalay','Mandalay','{}','patch3a_seed'),
('city','Naypyitaw','Naypyitaw','{}','patch3a_seed'),
('township','ကမာရွတ်','ကမာရွတ်','{"city":"Yangon"}','patch3a_seed'),
('township','မြောက်ဥက္ကလာပ','မြောက်ဥက္ကလာပ','{"city":"Yangon"}','patch3a_seed'),
('township','ပန်းဘဲတန်း','ပန်းဘဲတန်း','{"city":"Yangon"}','patch3a_seed'),
('township','ကျောက်တံတား','ကျောက်တံတား','{"city":"Yangon"}','patch3a_seed'),
('township','လမ်းမတော်','လမ်းမတော်','{"city":"Yangon"}','patch3a_seed'),
('township','မန္တလေး','မန္တလေး','{"city":"Mandalay"}','patch3a_seed'),
('township','နေပြည်တော်','နေပြည်တော်','{"city":"Naypyitaw"}','patch3a_seed')
on conflict (option_type,value) do update set label=excluded.label, meta=public.be_master_data_options.meta || excluded.meta, updated_at=now();

do $$
begin
  if to_regclass('public.township_tariffs') is not null then
    execute $q$
      insert into public.be_master_data_options(option_type,label,value,meta,source)
      select distinct 'township', township::text, township::text,
        jsonb_build_object('city', coalesce(city::text,''), 'delivery_fee', coalesce(delivery_fee,deli_charge,0)),
        'township_tariffs'
      from public.township_tariffs
      where township is not null and trim(township::text)<>''
      on conflict (option_type,value) do update set label=excluded.label, meta=public.be_master_data_options.meta || excluded.meta, updated_at=now()
    $q$;
    execute $q$
      insert into public.be_master_data_options(option_type,label,value,meta,source)
      select distinct 'city', city::text, city::text, '{}'::jsonb, 'township_tariffs'
      from public.township_tariffs
      where city is not null and trim(city::text)<>''
      on conflict (option_type,value) do update set updated_at=now()
    $q$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.merchant_admin_overrides') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='merchant_admin_overrides' and column_name='merchant_code') then
      execute $q$
        insert into public.be_master_data_options(option_type,label,value,meta,source)
        select distinct 'merchant', merchant_name::text, coalesce(nullif(merchant_code::text,''), merchant_name::text),
          jsonb_build_object('merchant_name',merchant_name,'merchant_code',coalesce(merchant_code::text,''),'phone',coalesce(phone::text,''),'address',coalesce(address::text,''),'township',coalesce(township::text,''),'city',coalesce(city::text,'')),
          'merchant_admin_overrides'
        from public.merchant_admin_overrides
        where merchant_name is not null and trim(merchant_name::text)<>''
        on conflict (option_type,value) do update set label=excluded.label, meta=public.be_master_data_options.meta || excluded.meta, updated_at=now()
      $q$;
    else
      execute $q$
        insert into public.be_master_data_options(option_type,label,value,meta,source)
        select distinct 'merchant', merchant_name::text, merchant_name::text, jsonb_build_object('merchant_name',merchant_name), 'merchant_admin_overrides'
        from public.merchant_admin_overrides
        where merchant_name is not null and trim(merchant_name::text)<>''
        on conflict (option_type,value) do update set label=excluded.label, meta=public.be_master_data_options.meta || excluded.meta, updated_at=now()
      $q$;
    end if;
  end if;
end $$;

create table if not exists public.pickup_delivery_form_submissions (id uuid primary key default gen_random_uuid());
alter table public.pickup_delivery_form_submissions
  add column if not exists pickup_id text,
  add column if not exists way_id text,
  add column if not exists delivery_id text,
  add column if not exists pickup_date date,
  add column if not exists party_type text,
  add column if not exists merchant_id text,
  add column if not exists customer_id text,
  add column if not exists party_code text,
  add column if not exists sender_name text,
  add column if not exists sender_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_time timestamptz,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists city text,
  add column if not exists township text,
  add column if not exists recipient_address text,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists weight_kg numeric default 0,
  add column if not exists cargo_photo_url text,
  add column if not exists qr_required boolean default true,
  add column if not exists qr_scan_status text default 'not_scanned',
  add column if not exists status text default 'submitted',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.pickup_delivery_parcels (
  id uuid primary key default gen_random_uuid(),
  way_id text not null,
  delivery_id text not null unique,
  sender_name text,
  recipient_name text,
  recipient_phone text,
  city text,
  township text,
  recipient_address text,
  cod_amount numeric default 0,
  delivery_fee numeric default 0,
  weight_kg numeric default 0,
  cargo_photo_url text,
  qr_required boolean default true,
  qr_scan_status text default 'not_scanned',
  status text default 'draft',
  payload jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_pickup_delivery_parcels_way_id on public.pickup_delivery_parcels(way_id);
create index if not exists idx_pickup_delivery_parcels_delivery_id on public.pickup_delivery_parcels(delivery_id);

drop function if exists public.be_clean_party_code(text,text,text);
drop function if exists public.be_next_way_id(date,text,text,text);
drop function if exists public.be_resolve_way_id(text,date,text,text,text);
drop function if exists public.be_next_delivery_id(text);
drop function if exists public.be_data_entry_master_options(text,text);
drop function if exists public.be_validate_city_township(text,text);
drop function if exists public.be_data_entry_history_suggest(text,text);

create or replace function public.be_clean_party_code(p_party_type text, p_party_id text default null, p_party_code text default null)
returns text language plpgsql immutable as $$
declare v text;
begin
  v := upper(regexp_replace(coalesce(nullif(p_party_code,''), nullif(p_party_id,''), ''), '[^A-Za-z0-9]+','','g'));
  if v <> '' then return left(v,8); end if;
  if lower(coalesce(p_party_type,'customer')) in ('customer','normal_customer','normal','walkin','walk_in') then return 'CU'; end if;
  return 'MER';
end $$;

create or replace function public.be_next_way_id(p_pickup_date date, p_party_type text, p_party_id text default null, p_party_code text default null)
returns text language plpgsql security definer set search_path=public as $$
declare v_code text; v_date text; v_next int;
begin
  v_date := to_char(coalesce(p_pickup_date,current_date),'MMDD');
  v_code := public.be_clean_party_code(p_party_type,p_party_id,p_party_code);
  select count(*)+1 into v_next from (
    select coalesce(way_id,pickup_id) id from public.pickup_delivery_form_submissions
    union all select way_id from public.pickup_delivery_parcels
  ) x where x.id like 'D'||v_date||'-'||v_code||'-%';
  return 'D'||v_date||'-'||v_code||'-'||lpad(v_next::text,3,'0');
end $$;

create or replace function public.be_resolve_way_id(p_existing_way_id text default null, p_pickup_date date default current_date, p_party_type text default 'customer', p_party_id text default null, p_party_code text default null)
returns text language plpgsql security definer set search_path=public as $$
begin
  if trim(coalesce(p_existing_way_id,'')) <> '' then return trim(p_existing_way_id); end if;
  return public.be_next_way_id(p_pickup_date,p_party_type,p_party_id,p_party_code);
end $$;

create or replace function public.be_next_delivery_id(p_way_id text)
returns text language plpgsql security definer set search_path=public as $$
declare v_next int; v_way text := trim(coalesce(p_way_id,''));
begin
  if v_way='' then raise exception 'way_id is required'; end if;
  select count(*)+1 into v_next from (
    select delivery_id from public.pickup_delivery_parcels
    union all select delivery_id from public.pickup_delivery_form_submissions where delivery_id is not null
  ) x where x.delivery_id like v_way || '-%';
  return v_way || '-' || lpad(v_next::text,3,'0');
end $$;

create or replace function public.be_data_entry_master_options(p_kind text, p_search text default null)
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('type',option_type,'label',label,'value',value,'meta',meta) order by label),'[]'::jsonb)
  from (
    select option_type,label,value,meta
    from public.be_master_data_options
    where status='active'
      and (p_kind is null or option_type=lower(p_kind))
      and (p_search is null or trim(p_search)='' or lower(label) like '%'||lower(p_search)||'%' or lower(value) like '%'||lower(p_search)||'%' or lower(meta::text) like '%'||lower(p_search)||'%')
    limit 50
  ) s;
$$;

create or replace function public.be_validate_city_township(p_city text, p_township text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok_city boolean; ok_township boolean; ok_pair boolean; c text:=trim(coalesce(p_city,'')); t text:=trim(coalesce(p_township,''));
begin
  select exists(select 1 from public.be_master_data_options where option_type='city' and lower(value)=lower(c) and status='active') into ok_city;
  select exists(select 1 from public.be_master_data_options where option_type='township' and lower(value)=lower(t) and status='active') into ok_township;
  select exists(select 1 from public.be_master_data_options where option_type='township' and lower(value)=lower(t) and (c='' or lower(coalesce(meta->>'city',''))=lower(c) or coalesce(meta->>'city','')='') and status='active') into ok_pair;
  return jsonb_build_object('valid',coalesce(ok_city,false) and coalesce(ok_township,false) and coalesce(ok_pair,false),'city_valid',coalesce(ok_city,false),'township_valid',coalesce(ok_township,false),'pair_valid',coalesce(ok_pair,false),'message',
    case when not coalesce(ok_city,false) then 'City must be selected from master data.' when not coalesce(ok_township,false) then 'Township must be selected from master data.' when not coalesce(ok_pair,false) then 'Selected township does not belong to selected city.' else 'OK' end);
end $$;

create or replace function public.be_data_entry_history_suggest(p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n text:=lower(trim(coalesce(p_name,''))); p text:=regexp_replace(coalesce(p_phone,''),'[^0-9]+','','g');
begin
  if n='' or p='' then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(row_to_json(x)::jsonb),'[]'::jsonb) from (
    select distinct on (recipient_address,township,city) recipient_name,recipient_phone,city,township,recipient_address,delivery_fee,cod_amount,weight_kg,updated_at
    from (
      select recipient_name,recipient_phone,city,township,recipient_address,delivery_fee,cod_amount,weight_kg,updated_at from public.pickup_delivery_parcels
      union all
      select recipient_name,recipient_phone,city,township,recipient_address,delivery_fee,cod_amount,weight_kg,updated_at from public.pickup_delivery_form_submissions
    ) h
    where lower(trim(coalesce(recipient_name,'')))=n and regexp_replace(coalesce(recipient_phone,''),'[^0-9]+','','g')=p and coalesce(recipient_address,'')<>''
    order by recipient_address,township,city,updated_at desc nulls last
    limit 10
  ) x);
end $$;

create table if not exists public.pickup_parcel_qr_labels (
  id uuid primary key default gen_random_uuid(),
  way_id text not null,
  delivery_id text not null unique,
  sender_name text not null,
  weight_kg numeric not null default 0,
  cargo_photo_url text,
  qr_payload jsonb not null,
  qr_text text not null,
  is_temporary boolean not null default true,
  status text not null default 'generated',
  generated_by uuid,
  expires_at timestamptz default (now()+interval '14 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.pickup_qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  way_id text,
  delivery_id text,
  qr_text text not null,
  scan_stage text not null,
  scan_actor text,
  scan_location text,
  note text,
  scanned_by uuid,
  scanned_at timestamptz default now(),
  payload jsonb default '{}'::jsonb
);

drop function if exists public.be_create_pickup_qr_label(text,text,numeric,text,text);
drop function if exists public.be_scan_pickup_qr(text,text,text,text,text);
drop function if exists public.be_pickup_qr_snapshot(text);

create or replace function public.be_create_pickup_qr_label(p_way_id text, p_sender_name text, p_weight_kg numeric, p_photo_url text default null, p_delivery_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_way text:=trim(coalesce(p_way_id,'')); v_delivery text:=trim(coalesce(p_delivery_id,'')); v_sender text:=trim(coalesce(p_sender_name,'')); v_weight numeric:=coalesce(p_weight_kg,0); v_payload jsonb; v_qr text; v_id uuid;
begin
  if v_way='' then raise exception 'Way ID / Pickup ID is required before QR generation'; end if;
  if v_sender='' then raise exception 'Sender name is required before QR generation'; end if;
  if v_weight<=0 then raise exception 'Parcel weight must be greater than zero before QR generation'; end if;
  if coalesce(p_photo_url,'')='' then raise exception 'Cargo photo is mandatory before QR generation'; end if;
  if v_delivery='' then v_delivery:=public.be_next_delivery_id(v_way); end if;
  v_payload:=jsonb_build_object('type','BRITIUM_TEMP_PICKUP_QR','version',1,'way_id',v_way,'delivery_id',v_delivery,'sender_name',v_sender,'weight_kg',v_weight,'temporary',true);
  v_qr:='BE-TEMP-PICKUP|v=1|way_id='||v_way||'|delivery_id='||v_delivery||'|sender='||replace(v_sender,'|',' ')||'|weight_kg='||v_weight::text;
  insert into public.pickup_delivery_parcels(way_id,delivery_id,sender_name,weight_kg,cargo_photo_url,qr_required,qr_scan_status,status,payload)
  values(v_way,v_delivery,v_sender,v_weight,p_photo_url,true,'qr_generated','pickup_qr_generated',v_payload)
  on conflict(delivery_id) do update set sender_name=excluded.sender_name, weight_kg=excluded.weight_kg, cargo_photo_url=excluded.cargo_photo_url, qr_required=true, qr_scan_status='qr_generated', status='pickup_qr_generated', payload=public.pickup_delivery_parcels.payload||excluded.payload, updated_at=now();
  insert into public.pickup_parcel_qr_labels(way_id,delivery_id,sender_name,weight_kg,cargo_photo_url,qr_payload,qr_text,generated_by)
  values(v_way,v_delivery,v_sender,v_weight,p_photo_url,v_payload,v_qr,auth.uid())
  on conflict(delivery_id) do update set sender_name=excluded.sender_name, weight_kg=excluded.weight_kg, cargo_photo_url=excluded.cargo_photo_url, qr_payload=excluded.qr_payload, qr_text=excluded.qr_text, status='generated', updated_at=now()
  returning id into v_id;
  return jsonb_build_object('id',v_id,'way_id',v_way,'delivery_id',v_delivery,'sender_name',v_sender,'weight_kg',v_weight,'qr_payload',v_payload,'qr_text',v_qr,'temporary',true);
end $$;

create or replace function public.be_scan_pickup_qr(p_qr_text text, p_scan_stage text, p_scan_actor text default null, p_scan_location text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_way text; v_delivery text; v_stage text:=lower(trim(coalesce(p_scan_stage,''))); v_event uuid;
begin
  if coalesce(p_qr_text,'')='' then raise exception 'QR text is required'; end if;
  if v_stage='' then raise exception 'scan_stage is required'; end if;
  v_way:=substring(p_qr_text from 'way_id=([^|]+)');
  v_delivery:=substring(p_qr_text from 'delivery_id=([^|]+)');
  if coalesce(v_way,'')='' or coalesce(v_delivery,'')='' then raise exception 'Invalid Britium pickup QR'; end if;
  insert into public.pickup_qr_scan_events(way_id,delivery_id,qr_text,scan_stage,scan_actor,scan_location,note,scanned_by,payload)
  values(v_way,v_delivery,p_qr_text,v_stage,p_scan_actor,p_scan_location,p_note,auth.uid(),jsonb_build_object('scan_stage',v_stage,'actor',p_scan_actor,'location',p_scan_location))
  returning id into v_event;
  update public.pickup_parcel_qr_labels set status=case when v_stage in ('warehouse_receive','warehouse_receiving','warehouse_received') then 'warehouse_received' when v_stage in ('pickup','picked_up','field_pickup') then 'picked_up' else v_stage end, updated_at=now() where delivery_id=v_delivery;
  update public.pickup_delivery_parcels set qr_scan_status=case when v_stage in ('warehouse_receive','warehouse_receiving','warehouse_received') then 'warehouse_received' when v_stage in ('pickup','picked_up','field_pickup') then 'picked_up' else v_stage end, updated_at=now() where delivery_id=v_delivery;
  return jsonb_build_object('event_id',v_event,'way_id',v_way,'delivery_id',v_delivery,'scan_stage',v_stage,'status','accepted');
end $$;

create or replace function public.be_pickup_qr_snapshot(p_search text default null)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'summary', jsonb_build_object('labels',count(*),'generated',count(*) filter(where status='generated'),'picked_up',count(*) filter(where status='picked_up'),'warehouse_received',count(*) filter(where status='warehouse_received')),
    'labels', coalesce(jsonb_agg(jsonb_build_object('id',id,'way_id',way_id,'delivery_id',delivery_id,'sender_name',sender_name,'weight_kg',weight_kg,'cargo_photo_url',cargo_photo_url,'qr_payload',qr_payload,'qr_text',qr_text,'status',status,'created_at',created_at) order by created_at desc),'[]'::jsonb),
    'generated_at', now())
  from public.pickup_parcel_qr_labels
  where p_search is null or p_search='' or way_id ilike '%'||p_search||'%' or delivery_id ilike '%'||p_search||'%' or sender_name ilike '%'||p_search||'%';
$$;

grant execute on function public.be_clean_party_code(text,text,text) to authenticated, anon;
grant execute on function public.be_next_way_id(date,text,text,text) to authenticated, anon;
grant execute on function public.be_resolve_way_id(text,date,text,text,text) to authenticated, anon;
grant execute on function public.be_next_delivery_id(text) to authenticated, anon;
grant execute on function public.be_data_entry_master_options(text,text) to authenticated, anon;
grant execute on function public.be_validate_city_township(text,text) to authenticated, anon;
grant execute on function public.be_data_entry_history_suggest(text,text) to authenticated, anon;
grant execute on function public.be_create_pickup_qr_label(text,text,numeric,text,text) to authenticated, anon;
grant execute on function public.be_scan_pickup_qr(text,text,text,text,text) to authenticated, anon;
grant execute on function public.be_pickup_qr_snapshot(text) to authenticated, anon;

notify pgrst, 'reload schema';
commit;
select 'Patch 3A sticky UI, master dropdowns, city/township validation and pickup QR chain backend ready' as status;
