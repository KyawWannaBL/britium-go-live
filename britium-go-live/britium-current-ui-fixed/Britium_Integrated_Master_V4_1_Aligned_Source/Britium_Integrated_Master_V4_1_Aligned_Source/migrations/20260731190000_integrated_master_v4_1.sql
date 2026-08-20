-- BRITIUM INTEGRATED MASTER SPECIFICATION V4.1 - COORDINATED BACKEND MIGRATION
-- Generated 2026-07-31. Apply after parcel_financial_v2_backend.sql and parcel_financial_v2_2_ui_finance_bridge.sql.
-- This migration is additive and does not delete historical records.

begin;
create extension if not exists pgcrypto;

create table if not exists public.be_integrated_user_permissions_v41 (
  permission_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  permission_code text not null,
  branch_code text,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists be_integrated_user_permissions_v41_uidx
  on public.be_integrated_user_permissions_v41(user_id,permission_code,coalesce(branch_code,''));

create table if not exists public.be_audit_events (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  action_code text not null,
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid,
  actor_employee_id text,
  branch_code text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists be_audit_events_request_action_uidx
  on public.be_audit_events(request_id, action_code, entity_type, entity_id)
  where request_id is not null;

create or replace function public.be_integrated_has_permission_v41(p_permission text, p_branch text default null)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select
    current_user in ('postgres','service_role')
    or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('superadmin','admin','finance_admin','security_admin')
    or exists (
      select 1 from public.be_integrated_user_permissions_v41 p
      where p.user_id=auth.uid() and p.permission_code=p_permission and p.is_active
        and p.effective_from<=current_date and (p.effective_to is null or p.effective_to>=current_date)
        and (p.branch_code is null or p_branch is null or p.branch_code=p_branch)
    );
$$;

create or replace function public.be_integrated_require_permission_v41(p_permission text, p_branch text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null and current_user not in ('postgres','service_role') then
    raise exception 'Authenticated actor is required';
  end if;
  if not public.be_integrated_has_permission_v41(p_permission,p_branch) then
    raise exception 'Permission % is required for branch %', p_permission, coalesce(p_branch,'ALL');
  end if;
end $$;

create or replace function public.be_integrated_audit_v41(
  p_module text,p_action text,p_entity_type text,p_entity_id text,p_branch text,
  p_before jsonb,p_after jsonb,p_reason text,p_request_id text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  insert into public.be_audit_events(module_code,action_code,entity_type,entity_id,actor_user_id,branch_code,before_value,after_value,reason,request_id)
  values(p_module,p_action,p_entity_type,p_entity_id,auth.uid(),p_branch,p_before,p_after,p_reason,p_request_id)
  on conflict (request_id,action_code,entity_type,entity_id) where request_id is not null do update set after_value=excluded.after_value
  returning id into v_id;
  return v_id;
end $$;

-- Highway station drop-off tariff master.
create table if not exists public.be_highway_station_tariffs_v41 (
  station_code text primary key,
  station_name text not null,
  aliases text[] not null default '{}',
  base_rate_mmk bigint not null check(base_rate_mmk>=0),
  extra_per_kg_mmk bigint not null default 500 check(extra_per_kg_mmk>=0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  effective_from date not null,
  effective_to date,
  version_code text not null,
  created_at timestamptz not null default now()
);
insert into public.be_highway_station_tariffs_v41(station_code,station_name,aliases,base_rate_mmk,extra_per_kg_mmk,status,effective_from,version_code) values
('HW_DOWNTOWN','Highway Station Drop Off (Downtown)',array['Downtown Highway Station','Downtown Drop Off'],4000,500,'ACTIVE',date '2026-07-31','HW_DROPOFF_V41'),
('HW_BAYINTNAUNG','Bayintnaung Drop Off',array['Bayintnaung Highway Station','Bayintnaung Bus Station'],4000,500,'ACTIVE',date '2026-07-31','HW_DROPOFF_V41'),
('HW_DAGON_THIRI','Hlaing Thar Yar - Dagon Thiri Highway Station Drop Off',array['Dagon Thiri','Dagon Ayar','Hlaing Thar Yar Highway Station'],4000,500,'ACTIVE',date '2026-07-31','HW_DROPOFF_V41'),
('HW_AUNG_MINGALAR','North Okkalapa - Aung Mingalar Highway Station Drop Off',array['Aung Mingalar','Aung Mingalar Highway','North Okkalapa Highway Station'],3000,500,'ACTIVE',date '2026-07-31','HW_DROPOFF_V41'),
('HW_PARAMI','Parami Highway Station Drop Off',array['Parami Bus Compound','Parami Highway Station'],3000,500,'ACTIVE',date '2026-07-31','HW_DROPOFF_V41')
on conflict(station_code) do update set station_name=excluded.station_name,aliases=excluded.aliases,base_rate_mmk=excluded.base_rate_mmk,extra_per_kg_mmk=excluded.extra_per_kg_mmk,status=excluded.status,effective_from=excluded.effective_from,version_code=excluded.version_code;

-- Fulfillment providers, coverage and contracts.
create table if not exists public.be_fulfillment_providers_v55 (
  provider_code text primary key,
  provider_name text not null,
  provider_type text not null check(provider_type in ('INTERNAL','BRANCH','THIRD_PARTY')),
  cod_capable boolean not null default false,
  pod_required boolean not null default true,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.be_fulfillment_providers_v55(provider_code,provider_name,provider_type,cod_capable,pod_required,status,metadata) values
('BRITIUM','Britium Express','INTERNAL',true,true,'ACTIVE','{}'),
('BRITIUM_NPT_BRANCH','Britium Naypyitaw Branch','BRANCH',true,true,'ACTIVE','{"branch_code":"NPT"}'),
('BRITIUM_MDY_BRANCH','Britium Mandalay Managing Office','BRANCH',true,true,'ACTIVE','{"branch_code":"MDY"}'),
('DK_DELIVERY','DK Delivery Service Mandalay','THIRD_PARTY',true,true,'ACTIVE','{"operating_area":"Mandalay","surcharge_trigger_status":"PENDING_CONFIRMATION"}'),
('ROYAL_EXPRESS','Royal Express Services Limited','THIRD_PARTY',true,true,'ACTIVE','{"quotation":"Q-019-05-2026"}'),
('ARLU_POST','Arlu Post','THIRD_PARTY',true,true,'INACTIVE','{"rate_status":"PENDING"}'),
('NINJA_VAN','Ninja Van','THIRD_PARTY',true,true,'INACTIVE','{"rate_status":"PENDING"}'),
('SAFE_DELIVERY_SERVICES','Safe Delivery Services','THIRD_PARTY',true,true,'INACTIVE','{"rate_status":"PENDING"}')
on conflict(provider_code) do update set provider_name=excluded.provider_name,provider_type=excluded.provider_type,cod_capable=excluded.cod_capable,pod_required=excluded.pod_required,status=excluded.status,metadata=excluded.metadata;

create table if not exists public.be_partner_contracts_v55 (
  contract_code text primary key,
  provider_code text not null references public.be_fulfillment_providers_v55(provider_code),
  contract_name text not null,
  status text not null check(status in ('ACTIVE','RATE_PENDING','SUSPENDED','INACTIVE')),
  effective_from date not null,
  effective_to date,
  customer_rate_policy text not null,
  partner_cost_policy text not null,
  cod_remittance_days integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.be_partner_contracts_v55(contract_code,provider_code,contract_name,status,effective_from,customer_rate_policy,partner_cost_policy,cod_remittance_days,metadata) values
('DK_MANDALAY_2026','DK_DELIVERY','DK Mandalay Last-Mile Partnership','ACTIVE',date '2026-07-31','BRITIUM_YGN_MDY_6000_PLUS_SURCHARGES','HIGHWAY_COST_PLUS_DK_AREA_RATE_PLUS_APPROVED_SURCHARGES',null,'{"surcharge_trigger_status":"PENDING_CONFIRMATION"}'),
('ROYAL_Q019_2026','ROYAL_EXPRESS','Royal Express Quotation Q-019-05-2026','ACTIVE',date '2026-05-22','ROYAL_NORMAL_RATE','ROYAL_DISCOUNT_RATE_PLUS_COD_FEE_MINUS_CONFIRMED_REBATE',3,'{"discount_pct":15,"rebate_base_status":"PENDING_CONFIRMATION"}')
on conflict(contract_code) do update set status=excluded.status,effective_from=excluded.effective_from,customer_rate_policy=excluded.customer_rate_policy,partner_cost_policy=excluded.partner_cost_policy,cod_remittance_days=excluded.cod_remittance_days,metadata=excluded.metadata;

create table if not exists public.be_partner_rate_cards_v55 (
  rate_id bigserial primary key,
  contract_code text not null references public.be_partner_contracts_v55(contract_code),
  state_division text,
  source_row_no integer,
  from_city text not null,
  to_city text not null,
  zone text,
  normal_price_mmk bigint not null,
  partner_base_rate_mmk bigint not null,
  next_1kg_mmk bigint not null default 0,
  routing_eligible boolean not null default true,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  unique(contract_code,from_city,to_city,effective_from)
);
insert into public.be_partner_rate_cards_v55(contract_code,state_division,source_row_no,from_city,to_city,zone,normal_price_mmk,partner_base_rate_mmk,next_1kg_mmk,routing_eligible,effective_from,effective_to,status) values
  ('ROYAL_Q019_2026','AYA',1,'Yangon','Hinthada','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',2,'Yangon','Maubin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',3,'Yangon','Mawlamyinegyun','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',4,'Yangon','Myaungmya','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',5,'Yangon','Nyaungtone','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',6,'Yangon','Pathein','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',7,'Yangon','Pyapon','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',8,'Yangon','Wakema','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',9,'Yangon','Kyaiklat','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',10,'Yangon','Pantanaw','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',11,'Yangon','Zalun','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',12,'Yangon','Bogale','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',13,'Yangon','Labutta','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',14,'Yangon','Danubyu','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',15,'Yangon','Ngathaingchaung','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',16,'Yangon','Yegyi','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',17,'Yangon','Kyonpyaw','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',18,'Yangon','Ahtaung','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',19,'Yangon','Kyaunggon','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',20,'Yangon','Thabaung','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',21,'Yangon','Chaung Thar','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',22,'Yangon','Myanaung','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',23,'Yangon','Kyangin','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',24,'Yangon','Einme','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',25,'Yangon','Dedaye','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',26,'Yangon','Kangyidaunt','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',27,'Yangon','Ngapudaw','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',28,'Yangon','Ingapu','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',29,'Yangon','Lemyethna','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',30,'Yangon','Kyonemangay','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',31,'Yangon','Htugyi','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',32,'Yangon','Pyinywa','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',33,'Yangon','Darka','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',34,'Yangon','Ngwesaung','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',35,'Yangon','Atthoke','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',36,'Yangon','Sar Ma Lauk','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','AYA',37,'Yangon','KwinKauk','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',38,'Yangon','Bago','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',39,'Yangon','Nyaunglebin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',40,'Yangon','Daik-U','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',41,'Yangon','Phyu','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',42,'Yangon','Pyay','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',43,'Yangon','Taungoo','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',44,'Yangon','Tharyarwaddy','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',45,'Yangon','Thonese','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',46,'Yangon','Paungde','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',47,'Yangon','Gyobingauk','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',48,'Yangon','Nattalin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',49,'Yangon','Yae Ni','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',50,'Yangon','Letpadan','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',51,'Yangon','Thanatpin','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',52,'Yangon','Lower MinHla','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',53,'Yangon','Kaytumaddy','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',54,'Yangon','ShweDaung','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',55,'Yangon','Inntakaw','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',56,'Yangon','Waw','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',57,'Yangon','Kyauktaga','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',58,'Yangon','Yedashay','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',59,'Yangon','Zigon','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',60,'Yangon','Oktwin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',61,'Yangon','OkeShitPin','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',62,'Yangon','Penwegon','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',63,'Yangon','HpaYarGyi','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',64,'Yangon','Monyo','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',65,'Yangon','Paungtale','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',66,'Yangon','Okpho','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',67,'Yangon','Thegon','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',68,'Yangon','Shwegyin','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',69,'Yangon','Pyuntasa','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',70,'Yangon','Innma','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',71,'Yangon','Kanyutkwin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',72,'Yangon','Tharkaya','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',73,'Yangon','Myohla','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',74,'Yangon','Kawa','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',75,'Yangon','Sitkwin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',76,'Yangon','Oaethaekone','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',77,'Yangon','Shwelaung','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',78,'Yangon','NyaungChayHtauk','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','BGO',79,'Yangon','Swar','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','CHIN',80,'Yangon','Hakha','G',8500,7225,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',81,'Yangon','Myitkyina','I',10000,8500,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',82,'Yangon','Mogaung','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',83,'Yangon','Mohnyin','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',84,'Yangon','Hpakan','I',10000,8500,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',85,'Yangon','Bhamaw','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',86,'Yangon','Waingmaw','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',87,'Yangon','Danai','I',10000,8500,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',88,'Yangon','Namti','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KACHIN',89,'Yangon','Momauk','H',9500,8075,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYAR',90,'Yangon','Loikaw','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYIN',91,'Yangon','Hpa-An','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYIN',92,'Yangon','Myawaddy','F',8000,6800,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYIN',93,'Yangon','Kawkareik','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYIN',94,'Yangon','Hlaingbwe','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','KAYIN',95,'Yangon','Myaingkalay','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',96,'Yangon','Bagan','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',97,'Yangon','Nyaung-U','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',98,'Yangon','Kyaukse','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',99,'Yangon','Mandalay','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',100,'Yangon','Meiktila','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',101,'Yangon','Wundwin','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',102,'Yangon','Mahlaing','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',103,'Yangon','Myingyan','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',104,'Yangon','Pyawbwe','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',105,'Yangon','Pyin Oo Lwin','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',106,'Yangon','Yamethin','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',107,'Yangon','Kyaukpadaung','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',108,'Yangon','Sintgaing','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',109,'Yangon','Kume','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',110,'Yangon','Thazi','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',111,'Yangon','Madaya','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',112,'Yangon','Myitthar','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',113,'Yangon','Paukkhaung','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',114,'Yangon','Ohn Chaw','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',115,'Yangon','Taungtha','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',116,'Yangon','Anesakhan','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',117,'Yangon','Amarapura','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',118,'Yangon','Myintnge','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',119,'Yangon','Natoegyi','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',120,'Yangon','Han Myint Mo','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',121,'Yangon','Tada-U','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',122,'Yangon','Zeepingyi','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',123,'Yangon','Patheingyi','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',124,'Yangon','Padaung','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',125,'Yangon','Palaik','B',5000,4250,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',126,'Yangon','Pyinyaung','C',5500,4675,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MDY',127,'Yangon','Mogok','E',7000,5950,2125,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',128,'Yangon','Aunglan','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',129,'Yangon','Chauk','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',130,'Yangon','Magway','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',131,'Yangon','Minbu','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',132,'Yangon','Pakokku','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',133,'Yangon','Yesagyo','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',134,'Yangon','Taungtwingyi','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',135,'Yangon','Thayed','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',136,'Yangon','Yenanchaung','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',137,'Yangon','Pwintbyu','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',138,'Yangon','NatMauk','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',139,'Yangon','Salin','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',140,'Yangon','SinHpyuKyun','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',141,'Yangon','Satthwar','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',142,'Yangon','Myothit','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',143,'Yangon','Kamma','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',144,'Yangon','Mindone','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',145,'Yangon','Ngape','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',146,'Yangon','Upper Minhla','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',147,'Yangon','Saku','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',148,'Yangon','Salay','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',149,'Yangon','Seik Phyu','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',150,'Yangon','Kamma (Pakokku)','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',151,'Yangon','SinBaungWe','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MGY',152,'Yangon','ThitYarGyauk','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',153,'Yangon','Mawlamyine','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',154,'Yangon','Bilin','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',155,'Yangon','Mudon','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',156,'Yangon','Thaton','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',157,'Yangon','Ye','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',158,'Yangon','Thanbyuzayat','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',159,'Yangon','Kyaikto','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',160,'Yangon','Paung','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',161,'Yangon','Mottama','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',162,'Yangon','Kyaikmaraw','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',163,'Yangon','Kyaikkhami','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',164,'Yangon','Kyaikkaw','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',165,'Yangon','Chaungzone','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',166,'Yangon','Thein Za Yat','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','MON',167,'Yangon','ZinKyaik','A',4500,3825,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','NPW',168,'Yangon','Naypyidaw','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','NPW',169,'Yangon','Tatkon','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','NPW',170,'Yangon','Tharwuthti','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','NPW',171,'Yangon','Zeyawaddy','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',172,'Yangon','Sittwe','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',173,'Yangon','Toungup','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',174,'Yangon','Thandwe','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',175,'Yangon','Kyaukpyu','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',176,'Yangon','Min Pyar','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',177,'Yangon','Ann','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',178,'Yangon','Kyauktaw','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',179,'Yangon','Mrauk-U','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','RKE',180,'Yangon','Ramree','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',181,'Yangon','Kalay','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',182,'Yangon','Monywa','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',183,'Yangon','Sagaing','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',184,'Yangon','Shwebo','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',185,'Yangon','Tamu','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',186,'Yangon','Katha','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',187,'Yangon','Kawlin','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',188,'Yangon','Tigyaing','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',189,'Yangon','Myinmu','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',190,'Yangon','Seikkhun','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SGG',191,'Yangon','Indaw','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',192,'Yangon','Aungpan','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',193,'Yangon','Kalaw','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',194,'Yangon','Lashio','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',195,'Yangon','Kyaukme','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',196,'Yangon','Hsipaw','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',197,'Yangon','Muse','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',198,'Yangon','Taunggyi','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',199,'Yangon','Yatsauk','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',200,'Yangon','Pinlaung','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',201,'Yangon','Kengtung','J',10500,8925,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',202,'Yangon','Tachileik','J',10500,8925,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',203,'Yangon','Nyaungshwe','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',204,'Yangon','Ayetharyar','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',205,'Yangon','Hopong','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',206,'Yangon','Pindaya','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',207,'Yangon','Loilem','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',208,'Yangon','HeHoe','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',209,'Yangon','Ywangan','C',5500,4675,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',210,'Yangon','Namhkam','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',211,'Yangon','Namtu','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',212,'Yangon','Kutkai','D',6000,5100,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',213,'Yangon','Shwenyaung','B',5000,4250,1700,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','SHAN',214,'Yangon','Nawnghkio','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','TNT',215,'Yangon','Dawei','E',7000,5950,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','TNT',216,'Yangon','Myeik','F',8000,6800,2125,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','TNT',217,'Yangon','Kawthoung','I',10000,8500,2550,true,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',218,'Yangon','Yangon','0',4000,3400,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',219,'Yangon','Hlegu','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',220,'Yangon','Thongwa','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',221,'Yangon','Hmawbi','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',222,'Yangon','Taikkyi','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',223,'Yangon','Twantay','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',224,'Yangon','Kyauktan','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',225,'Yangon','Kungyangone','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',226,'Yangon','Ahpyauk','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE'),
  ('ROYAL_Q019_2026','YGN',227,'Yangon','Kawhmu','A',4500,3825,1700,false,date '2026-05-22',null,'ACTIVE')
on conflict(contract_code,from_city,to_city,effective_from) do update set state_division=excluded.state_division,source_row_no=excluded.source_row_no,zone=excluded.zone,normal_price_mmk=excluded.normal_price_mmk,partner_base_rate_mmk=excluded.partner_base_rate_mmk,next_1kg_mmk=excluded.next_1kg_mmk,routing_eligible=excluded.routing_eligible,status=excluded.status;

create table if not exists public.be_dk_area_rates_v55 (
  rate_band text primary key,
  base_charge_mmk bigint not null,
  description text not null,
  status text not null check(status in ('ACTIVE','PENDING_CONFIRMATION','INACTIVE')),
  effective_from date not null default date '2026-07-31',
  metadata jsonb not null default '{}'::jsonb
);
insert into public.be_dk_area_rates_v55(rate_band,base_charge_mmk,description,status,metadata) values
('INNER_MANDALAY',2000,'DK inner Mandalay last-mile band','ACTIVE','{}'),
('OUTER_MANDALAY',2500,'DK outer Mandalay last-mile band','ACTIVE','{}'),
('EXTENDED_LISTED_AREA',3000,'DK listed extended-area last-mile band','ACTIVE','{}'),
('WEIGHT_SIZE_SURCHARGE_500',500,'Conditional DK surcharge; exact trigger requires signed confirmation','PENDING_CONFIRMATION','{}'),
('WEIGHT_SIZE_SURCHARGE_1000',1000,'Conditional DK surcharge; exact trigger requires signed confirmation','PENDING_CONFIRMATION','{}')
on conflict(rate_band) do update set base_charge_mmk=excluded.base_charge_mmk,description=excluded.description,status=excluded.status,metadata=excluded.metadata;

create table if not exists public.be_partner_cod_fee_rules_v55 (
  rule_code text primary key,
  contract_code text not null references public.be_partner_contracts_v55(contract_code),
  threshold_mmk bigint,
  flat_fee_mmk bigint,
  percentage_rate numeric(12,8),
  billing_party text not null default 'BRITIUM' check(billing_party in ('BRITIUM','CUSTOMER','MERCHANT')),
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE'
);
insert into public.be_partner_cod_fee_rules_v55(rule_code,contract_code,threshold_mmk,flat_fee_mmk,percentage_rate,billing_party,effective_from,status) values
('ROYAL_COD_UP_TO_300K','ROYAL_Q019_2026',300000,195,null,'BRITIUM',date '2026-05-22','ACTIVE'),
('ROYAL_COD_ABOVE_300K','ROYAL_Q019_2026',300000,null,0.002,'BRITIUM',date '2026-05-22','ACTIVE')
on conflict(rule_code) do update set threshold_mmk=excluded.threshold_mmk,flat_fee_mmk=excluded.flat_fee_mmk,percentage_rate=excluded.percentage_rate,billing_party=excluded.billing_party,effective_from=excluded.effective_from,status=excluded.status;

create table if not exists public.be_partner_rebate_tiers_v55 (
  contract_code text not null references public.be_partner_contracts_v55(contract_code),
  min_completed_ways integer not null,
  max_completed_ways integer,
  rebate_rate numeric(8,6) not null,
  rebate_base_status text not null default 'PENDING_CONFIRMATION',
  effective_from date not null,
  status text not null default 'ACTIVE',
  primary key(contract_code,min_completed_ways,effective_from)
);
insert into public.be_partner_rebate_tiers_v55(contract_code,min_completed_ways,max_completed_ways,rebate_rate,rebate_base_status,effective_from,status) values
('ROYAL_Q019_2026',1000,1999,0.05,'PENDING_CONFIRMATION',date '2026-05-22','ACTIVE'),
('ROYAL_Q019_2026',2000,2999,0.10,'PENDING_CONFIRMATION',date '2026-05-22','ACTIVE'),
('ROYAL_Q019_2026',3000,null,0.15,'PENDING_CONFIRMATION',date '2026-05-22','ACTIVE')
on conflict do nothing;

create table if not exists public.be_network_coverage_rules_v55 (
  coverage_rule_id uuid primary key default gen_random_uuid(),
  destination_key text not null,
  zone_code text,
  direct_reachable boolean not null default false,
  managing_branch_code text not null,
  fulfillment_mode text not null check(fulfillment_mode in ('BRITIUM_DIRECT','BRANCH_DIRECT','THIRD_PARTY_OUTSOURCED','BRANCH_THIRD_PARTY')),
  preferred_provider_code text not null references public.be_fulfillment_providers_v55(provider_code),
  fallback_provider_codes text[] not null default '{}',
  cod_capable boolean not null default true,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  unique(destination_key,effective_from)
);
insert into public.be_network_coverage_rules_v55(destination_key,zone_code,direct_reachable,managing_branch_code,fulfillment_mode,preferred_provider_code,fallback_provider_codes,cod_capable,effective_from,status) values
('ZONE:YGN','YGN',true,'YGN','BRITIUM_DIRECT','BRITIUM',array[]::text[],true,date '2026-07-31','ACTIVE'),
('ZONE:NPT','NPT',false,'NPT','BRANCH_DIRECT','BRITIUM_NPT_BRANCH',array[]::text[],true,date '2026-07-31','ACTIVE'),
('ZONE:MDY','MDY',false,'MDY','BRANCH_THIRD_PARTY','DK_DELIVERY',array['ROYAL_EXPRESS'],true,date '2026-07-31','ACTIVE'),
('ZONE:OTHER','OTHER',false,'YGN','THIRD_PARTY_OUTSOURCED','ROYAL_EXPRESS',array['ARLU_POST','NINJA_VAN','SAFE_DELIVERY_SERVICES'],true,date '2026-07-31','ACTIVE')
on conflict(destination_key,effective_from) do update set direct_reachable=excluded.direct_reachable,managing_branch_code=excluded.managing_branch_code,fulfillment_mode=excluded.fulfillment_mode,preferred_provider_code=excluded.preferred_provider_code,fallback_provider_codes=excluded.fallback_provider_codes,cod_capable=excluded.cod_capable,status=excluded.status;

create table if not exists public.be_parcel_fulfillment_v55 (
  delivery_way_id text primary key,
  pickup_id text,
  merchant_code text,
  destination_township text,
  zone_code text,
  service_type text not null default 'STANDARD_DELIVERY',
  highway_station_code text references public.be_highway_station_tariffs_v41(station_code),
  fulfillment_mode text not null,
  managing_branch_code text not null,
  provider_code text not null references public.be_fulfillment_providers_v55(provider_code),
  provider_tracking_id text,
  normalized_status text not null default 'ROUTING_PENDING',
  pod_status text not null default 'NOT_SUBMITTED',
  cod_custody_status text not null default 'NOT_APPLICABLE',
  cod_amount bigint not null default 0,
  britium_delivery_revenue_mmk bigint not null default 0,
  partner_payable_mmk bigint,
  linehaul_cost_mmk bigint,
  fulfillment_margin_mmk bigint,
  sla_due_at timestamptz,
  sla_status text not null default 'ON_TIME',
  financial_status text not null default 'NOT_READY',
  route_snapshot jsonb not null default '{}'::jsonb,
  tariff_snapshot jsonb not null default '{}'::jsonb,
  partner_cost_snapshot jsonb not null default '{}'::jsonb,
  pod_snapshot jsonb not null default '{}'::jsonb,
  calculation_version text not null default 'NETWORK_FULFILLMENT_V55',
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_linehaul_manifests_v55 (
  manifest_id uuid primary key default gen_random_uuid(),
  manifest_number text not null unique,
  origin_branch_code text not null,
  destination_branch_code text not null,
  transport_provider text not null,
  total_transport_cost_mmk bigint not null default 0,
  allocation_method text not null check(allocation_method in ('EQUAL_PER_WAY','ACTUAL_WEIGHT','CHARGEABLE_WEIGHT','VOLUMETRIC_WEIGHT','MANUAL_APPROVED')),
  status text not null default 'DRAFT',
  handover_at timestamptz,
  accepted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.be_linehaul_manifest_items_v55 (
  manifest_id uuid not null references public.be_linehaul_manifests_v55(manifest_id),
  delivery_way_id text not null references public.be_parcel_fulfillment_v55(delivery_way_id),
  allocation_weight numeric(14,4),
  allocated_cost_mmk bigint,
  accepted boolean not null default false,
  primary key(manifest_id,delivery_way_id)
);

create table if not exists public.be_partner_tracking_events_v55 (
  event_id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  delivery_way_id text not null,
  provider_tracking_id text,
  provider_event_code text not null,
  normalized_status text not null,
  event_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  unique(provider_code,delivery_way_id,provider_event_code,event_at)
);

create table if not exists public.be_partner_settlement_batches_v55 (
  batch_id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  provider_code text not null,
  period_from date not null,
  period_to date not null,
  status text not null default 'DRAFT',
  payment_status text not null default 'UNPAID',
  parcel_count integer not null default 0,
  gross_cod_mmk bigint not null default 0,
  partner_service_payable_mmk bigint not null default 0,
  confirmed_rebate_mmk bigint not null default 0,
  penalties_mmk bigint not null default 0,
  credits_mmk bigint not null default 0,
  net_payable_mmk bigint not null default 0,
  remitted_cod_mmk bigint not null default 0,
  outstanding_mmk bigint not null default 0,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.be_partner_settlement_lines_v55 (
  batch_id uuid not null references public.be_partner_settlement_batches_v55(batch_id),
  delivery_way_id text not null references public.be_parcel_fulfillment_v55(delivery_way_id),
  gross_cod_mmk bigint not null default 0,
  partner_payable_mmk bigint not null default 0,
  confirmed_rebate_mmk bigint not null default 0,
  penalty_mmk bigint not null default 0,
  credit_mmk bigint not null default 0,
  final_payable_mmk bigint not null default 0,
  pod_verified boolean not null default false,
  primary key(batch_id,delivery_way_id),
  unique(delivery_way_id)
);

-- Naypyitaw branch settlement.
create table if not exists public.be_branch_settlement_rules_v1 (
  rule_code text primary key,
  branch_code text not null,
  sender_share_rate numeric(8,6) not null,
  last_mile_share_rate numeric(8,6) not null,
  management_fee_rate numeric(8,6) not null,
  management_fee_basis text not null,
  remittance_method text not null,
  effective_from date not null,
  effective_to date,
  status text not null,
  approved_by uuid,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
insert into public.be_branch_settlement_rules_v1(rule_code,branch_code,sender_share_rate,last_mile_share_rate,management_fee_rate,management_fee_basis,remittance_method,effective_from,status,metadata) values
('NPT_INTEROFFICE_55_45_MGMT10_V1','NPT',0.55,0.45,0.10,'NPT_ALLOCATED_GROSS_SHARE','GROSS_COD_SEPARATE_BRANCH_PAYMENT',date '2026-07-31','ACTIVE','{"scope":"NPT_ONLY"}')
on conflict(rule_code) do update set sender_share_rate=excluded.sender_share_rate,last_mile_share_rate=excluded.last_mile_share_rate,management_fee_rate=excluded.management_fee_rate,management_fee_basis=excluded.management_fee_basis,remittance_method=excluded.remittance_method,status=excluded.status,metadata=excluded.metadata;

create table if not exists public.be_branch_settlement_batches_v1 (
  batch_id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  branch_code text not null,
  rule_code text not null references public.be_branch_settlement_rules_v1(rule_code),
  period_from date not null,
  period_to date not null,
  status text not null default 'DRAFT',
  payment_status text not null default 'UNPAID',
  parcel_count integer not null default 0,
  shareable_revenue_mmk bigint not null default 0,
  branch_gross_share_mmk bigint not null default 0,
  management_fee_mmk bigint not null default 0,
  penalties_mmk bigint not null default 0,
  credits_mmk bigint not null default 0,
  deductions_mmk bigint not null default 0,
  branch_net_share_mmk bigint not null default 0,
  gross_cod_mmk bigint not null default 0,
  cod_remitted_mmk bigint not null default 0,
  cod_outstanding_mmk bigint not null default 0,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.be_branch_settlement_lines_v1 (
  batch_id uuid not null references public.be_branch_settlement_batches_v1(batch_id),
  delivery_way_id text not null,
  sender_entity text not null check(sender_entity in ('HQ','NPT')),
  last_mile_entity text not null check(last_mile_entity in ('HQ','NPT')),
  shareable_revenue_mmk bigint not null,
  sender_gross_mmk bigint not null,
  last_mile_gross_mmk bigint not null,
  npt_gross_mmk bigint not null,
  management_fee_mmk bigint not null,
  penalty_mmk bigint not null default 0,
  credit_mmk bigint not null default 0,
  deduction_mmk bigint not null default 0,
  npt_net_mmk bigint not null,
  cod_amount_mmk bigint not null default 0,
  primary key(batch_id,delivery_way_id),
  unique(delivery_way_id)
);
create table if not exists public.be_branch_cod_remittances_v1 (
  remittance_id uuid primary key default gen_random_uuid(),
  branch_code text not null,
  batch_id uuid references public.be_branch_settlement_batches_v1(batch_id),
  amount_mmk bigint not null,
  reference text not null,
  remitted_at timestamptz not null,
  status text not null default 'SUBMITTED',
  proof jsonb not null default '{}'::jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  request_id text unique,
  created_at timestamptz not null default now()
);
create table if not exists public.be_branch_settlement_adjustments_v1 (
  adjustment_id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_branch_settlement_batches_v1(batch_id),
  delivery_way_id text,
  adjustment_type text not null,
  amount_mmk bigint not null,
  responsible_entity text not null,
  reason text not null,
  status text not null default 'PENDING',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.be_branch_settlement_payments_v1 (
  payment_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.be_branch_settlement_batches_v1(batch_id),
  amount_mmk bigint not null,
  payment_reference text not null,
  paid_at timestamptz not null,
  status text not null default 'RECORDED',
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Merchant referral commission.
create table if not exists public.be_employee_commission_eligibility_v41 (
  employee_id text not null,
  employee_user_id uuid,
  effective_from date not null,
  effective_to date,
  employment_status text not null default 'ACTIVE',
  primary key(employee_id,effective_from)
);
create table if not exists public.be_merchant_referral_assignments_v41 (
  assignment_id uuid primary key default gen_random_uuid(),
  merchant_id text not null,
  employee_id text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  approved_by uuid,
  approved_at timestamptz,
  unique(merchant_id,effective_from)
);
create table if not exists public.be_merchant_referral_commission_events_v41 (
  event_id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  merchant_id text not null,
  employee_id text not null,
  delivered_date date not null,
  rate_mmk bigint not null default 100,
  commission_mmk bigint not null default 100,
  status text not null default 'EARNED',
  settlement_batch_id uuid,
  created_at timestamptz not null default now(),
  unique(delivery_way_id,employee_id)
);

-- Data Entry additions.
do $$ begin
  if to_regclass('public.be_data_entry_parcel_details') is not null then
    alter table public.be_data_entry_parcel_details
      add column if not exists service_type text not null default 'STANDARD_DELIVERY',
      add column if not exists highway_station_code text,
      add column if not exists zone_code text,
      add column if not exists managing_branch_code text,
      add column if not exists fulfillment_mode text,
      add column if not exists provider_code text,
      add column if not exists provider_tracking_id text,
      add column if not exists route_quote jsonb not null default '{}'::jsonb;
  end if;
end $$;

create or replace function public.be_fulfillment_route_resolve_v55(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  v_zone text:=upper(coalesce(nullif(btrim(p_payload->>'zone_code'),''),'OTHER'));
  v_destination text:=lower(coalesce(p_payload->>'township',p_payload->>'destination',''));
  v_service text:=upper(coalesce(p_payload->>'service_type','STANDARD_DELIVERY'));
  v_mode text; v_branch text; v_provider text; v_reason text;
begin
  if v_service='HIGHWAY_STATION_DROP_OFF' then v_mode:='BRITIUM_DIRECT';v_branch:='YGN';v_provider:='BRITIUM';v_reason:='Highway station drop-off precedence';
  elsif v_zone='YGN' or v_destination like '%yangon%' then v_mode:='BRITIUM_DIRECT';v_branch:='YGN';v_provider:='BRITIUM';v_reason:='Yangon direct-service precedence';
  elsif v_zone='NPT' or v_destination like '%naypy%' or v_destination like '%nay pyi%' then v_mode:='BRANCH_DIRECT';v_branch:='NPT';v_provider:='BRITIUM_NPT_BRANCH';v_reason:='Naypyitaw branch precedence';
  elsif v_zone='MDY' or v_destination like '%mandalay%' then v_mode:='BRANCH_THIRD_PARTY';v_branch:='MDY';v_provider:='DK_DELIVERY';v_reason:='Mandalay DK Delivery precedence';
  else v_mode:='THIRD_PARTY_OUTSOURCED';v_branch:='YGN';v_provider:='ROYAL_EXPRESS';v_reason:='Royal Express default for other supported areas'; end if;
  return jsonb_build_object('fulfillment_mode',v_mode,'managing_branch_code',v_branch,'provider_code',v_provider,'routing_reason',v_reason,'build','NETWORK_ROUTING_V55');
end $$;

create or replace function public.be_partner_quote_calculate_v55(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  v_provider text:=upper(coalesce(p_payload->>'provider_code',''));
  v_weight numeric:=greatest(coalesce(nullif(p_payload->>'actual_weight_kg','')::numeric,0),0);
  v_extra numeric:=greatest(ceil(v_weight)-3,0);
  v_product bigint:=greatest(coalesce(nullif(p_payload->>'product_amount_mmk','')::bigint,0),0);
  v_rate public.be_partner_rate_cards_v55%rowtype;
  v_dk bigint; v_highway bigint; v_surcharge bigint; v_other bigint; v_credits bigint; v_penalties bigint;
  v_cod_fee bigint; v_rebate bigint; v_payable bigint; v_customer bigint;
begin
  if v_provider='DK_DELIVERY' then
    select base_charge_mmk into v_dk from public.be_dk_area_rates_v55 where rate_band=upper(p_payload->>'dk_rate_band') and status='ACTIVE';
    if v_dk is null then return jsonb_build_object('validation_status','ERROR','validation_message','DK area rate is missing or unresolved','partner_payable_mmk',null); end if;
    v_highway:=coalesce(nullif(p_payload->>'linehaul_cost_mmk','')::bigint,0);
    if v_highway<=0 then return jsonb_build_object('validation_status','REVIEW','validation_message','Allocated Yangon-Mandalay highway cost is required','partner_payable_mmk',null); end if;
    v_surcharge:=coalesce(nullif(p_payload->>'dk_weight_size_surcharge_mmk','')::bigint,0);
    v_other:=coalesce(nullif(p_payload->>'other_partner_charges_mmk','')::bigint,0);
    v_credits:=coalesce(nullif(p_payload->>'partner_credits_mmk','')::bigint,0);
    v_penalties:=coalesce(nullif(p_payload->>'partner_penalties_mmk','')::bigint,0);
    v_payable:=greatest(v_dk+v_surcharge+v_other-v_credits-v_penalties,0);
    return jsonb_build_object('validation_status','OK','provider_code',v_provider,'dk_base_charge_mmk',v_dk,'linehaul_cost_mmk',v_highway,'partner_payable_mmk',v_payable,'total_fulfillment_cost_mmk',v_highway+v_payable,'build','PARTNER_QUOTE_V55');
  elsif v_provider='ROYAL_EXPRESS' then
    select * into v_rate from public.be_partner_rate_cards_v55 r where r.contract_code='ROYAL_Q019_2026' and lower(r.to_city)=lower(p_payload->>'destination') and r.status='ACTIVE' order by r.effective_from desc limit 1;
    if not found then return jsonb_build_object('validation_status','ERROR','validation_message','Royal Express destination rate was not found'); end if;
    if not v_rate.routing_eligible then return jsonb_build_object('validation_status','ERROR','validation_message','Royal rate exists for reference but routing is excluded by Britium precedence'); end if;
    v_cod_fee:=case when v_product<=300000 then 195 else round(v_product*0.002)::bigint end;
    v_rebate:=greatest(coalesce(nullif(p_payload->>'confirmed_rebate_mmk','')::bigint,0),0);
    v_other:=greatest(coalesce(nullif(p_payload->>'other_partner_charges_mmk','')::bigint,0),0);
    v_credits:=greatest(coalesce(nullif(p_payload->>'partner_credits_mmk','')::bigint,0),0);
    v_payable:=greatest(v_rate.partner_base_rate_mmk+(v_extra*v_rate.next_1kg_mmk)::bigint+v_cod_fee+v_other-v_credits-v_rebate,0);
    v_customer:=v_rate.normal_price_mmk+(v_extra*v_rate.next_1kg_mmk)::bigint;
    return jsonb_build_object('validation_status','OK','provider_code',v_provider,'normal_base_rate_mmk',v_rate.normal_price_mmk,'discounted_base_rate_mmk',v_rate.partner_base_rate_mmk,'next_1kg_mmk',v_rate.next_1kg_mmk,'extra_kg',v_extra,'customer_delivery_charge_mmk',v_customer,'cod_fee_mmk',v_cod_fee,'immediate_discount_margin_mmk',v_rate.normal_price_mmk-v_rate.partner_base_rate_mmk,'confirmed_rebate_mmk',v_rebate,'partner_payable_mmk',v_payable,'fulfillment_margin_mmk',v_customer-v_payable,'build','PARTNER_QUOTE_V55');
  end if;
  return jsonb_build_object('validation_status','ERROR','validation_message','Unsupported provider');
end $$;

create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  v_route jsonb:=public.be_fulfillment_route_resolve_v55(p_payload);
  v_service text:=upper(coalesce(p_payload->>'service_type','STANDARD_DELIVERY'));
  v_quote jsonb; v_station public.be_highway_station_tariffs_v41%rowtype;
  v_tier text:=upper(coalesce(p_payload->>'customer_tier','STANDARD'));
  v_included numeric; v_chargeable numeric; v_extra numeric; v_weight_surcharge bigint; v_gross bigint; v_refund bigint:=0; v_net bigint;
  v_type text:=upper(coalesce(p_payload->>'amount_entry_type','ITEM_PRICE_PLUS_DECLARED_DELIVERY'));
  v_item bigint:=greatest(coalesce(nullif(p_payload->>'item_price','')::bigint,0),0); v_declared bigint; v_total bigint; v_additional bigint:=greatest(coalesce(nullif(p_payload->>'additional_customer_charge','')::bigint,0),0); v_cod bigint; v_effective bigint; v_difference bigint; v_settlement bigint;
begin
  if v_service<>'HIGHWAY_STATION_DROP_OFF' then
    if to_regprocedure('public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric)') is null then
      return jsonb_build_object('ok',false,'validation_status','ERROR','validation_message','Base Financial V2 quote function is not installed')||v_route;
    end if;
    execute 'select public.be_data_entry_financial_quote_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)'
      into v_quote using p_payload->>'merchant_id',p_payload->>'township',v_tier,v_type,v_item,nullif(p_payload->>'delivery_charges','')::bigint,nullif(p_payload->>'merchant_stated_total_amount','')::bigint,v_additional,greatest(coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0),0),greatest(coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0),0),greatest(coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0),0),greatest(coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0),0),greatest(coalesce(nullif(p_payload->>'actual_weight_kg','')::numeric,0),0);
    return jsonb_build_object('ok',true,'build','FINANCIAL_V2_SCHEMA_2026_07_31','generated_at',now(),'data',v_quote||v_route||jsonb_build_object('service_type',v_service));
  end if;
  select * into v_station from public.be_highway_station_tariffs_v41 where station_code=p_payload->>'highway_station_code' and status='ACTIVE' and effective_from<=current_date and (effective_to is null or effective_to>=current_date);
  if not found then return jsonb_build_object('ok',false,'build','FINANCIAL_V2_SCHEMA_2026_07_31','data',jsonb_build_object('validation_status','ERROR','validation_message','Select a valid active highway station')||v_route); end if;
  v_included:=case when v_tier='STANDARD' then 3 else 5 end; v_chargeable:=ceil(greatest(coalesce(nullif(p_payload->>'actual_weight_kg','')::numeric,0),0)); v_extra:=greatest(v_chargeable-v_included,0); v_weight_surcharge:=(v_extra*v_station.extra_per_kg_mmk)::bigint; v_gross:=v_station.base_rate_mmk+v_weight_surcharge+greatest(coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0),0)+greatest(coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0),0); v_net:=greatest(v_gross-v_refund,0);
  v_declared:=nullif(p_payload->>'delivery_charges','')::bigint; v_total:=nullif(p_payload->>'merchant_stated_total_amount','')::bigint;
  if v_type='ITEM_PRICE_PLUS_DECLARED_DELIVERY' then if v_declared is null then return jsonb_build_object('ok',false,'data',jsonb_build_object('validation_status','ERROR','validation_message','Merchant-declared delivery is required')||v_route); end if; v_effective:=v_declared;v_cod:=v_item+v_declared+v_additional;
  elsif v_type='TOTAL_AMOUNT_INCLUDING_DELIVERY' then if v_total is null or v_total<v_item+v_additional then return jsonb_build_object('ok',false,'data',jsonb_build_object('validation_status','ERROR','validation_message','Merchant total must cover item price and additional charge')||v_route); end if;v_effective:=v_total-v_item-v_additional;v_cod:=v_total;
  elsif v_type='DELIVERY_CHARGE_ONLY' then if v_declared is null then return jsonb_build_object('ok',false,'data',jsonb_build_object('validation_status','ERROR','validation_message','Merchant-declared delivery is required')||v_route); end if;v_effective:=v_declared;v_cod:=v_declared+v_additional;
  elsif v_type='EXACT_COLLECTION_AMOUNT' then if v_total is null then return jsonb_build_object('ok',false,'data',jsonb_build_object('validation_status','ERROR','validation_message','Exact collection total is required')||v_route); end if;return jsonb_build_object('ok',true,'build','FINANCIAL_V2_SCHEMA_2026_07_31','generated_at',now(),'data',jsonb_build_object('validation_status','REVIEW','validation_message','Authorized breakdown is required before settlement','base_tariff',v_station.base_rate_mmk,'included_kg',v_included,'chargeable_weight_kg',v_chargeable,'extra_kg',v_extra,'weight_surcharge',v_weight_surcharge,'gross_system_delivery_charge',v_gross,'commitment_refund',v_refund,'net_system_delivery_charge',v_net,'cod_amount',v_total,'delivery_difference',null,'merchant_final_settlement_amount',null,'settlement_direction','BREAKDOWN_REQUIRED','service_type',v_service,'highway_station_code',v_station.station_code)||v_route);
  elsif v_type='ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then v_effective:=0;v_cod:=v_item+v_additional; else return jsonb_build_object('ok',false,'data',jsonb_build_object('validation_status','ERROR','validation_message','Invalid amount entry type')||v_route); end if;
  v_difference:=v_effective-v_net;v_settlement:=v_item+v_difference+greatest(coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0),0)-greatest(coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0),0);
  v_quote:=jsonb_build_object('validation_status','OK','validation_message','Ready for collection and settlement','base_tariff',v_station.base_rate_mmk,'included_kg',v_included,'chargeable_weight_kg',v_chargeable,'extra_kg',v_extra,'weight_surcharge',v_weight_surcharge,'gross_system_delivery_charge',v_gross,'commitment_refund',v_refund,'net_system_delivery_charge',v_net,'effective_declared_delivery_charge',v_effective,'cod_amount',v_cod,'delivery_difference',v_difference,'merchant_settlement_adjustment',v_difference,'merchant_final_settlement_amount',v_settlement,'settlement_direction',case when v_difference>0 then 'CREDIT_TO_MERCHANT' when v_difference<0 then 'DEDUCT_FROM_MERCHANT' else 'NO_ADJUSTMENT' end,'calculation_version','FINANCIAL_V2_SCHEMA_2026_07_31','calculated_at',now(),'service_type',v_service,'highway_station_code',v_station.station_code);
  return jsonb_build_object('ok',true,'build','FINANCIAL_V2_SCHEMA_2026_07_31','generated_at',now(),'data',v_quote||v_route);
end $$;

create or replace function public.be_data_entry_financial_v2_save(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb; v_quote jsonb; v_updated integer; v_audit uuid;
begin
  perform public.be_integrated_require_permission_v41('DATA_ENTRY_FINANCIAL_SAVE',coalesce(p_payload->>'managing_branch_code',p_payload->>'zone_code'));
  v_result:=public.be_data_entry_financial_v2_calculate(p_payload);v_quote:=v_result->'data';
  if coalesce(v_quote->>'validation_status','ERROR')='ERROR' then raise exception '%',coalesce(v_quote->>'validation_message','Financial validation failed'); end if;
  update public.be_data_entry_parcel_details d set
    customer_tier=coalesce(v_quote->>'resolved_customer_tier',p_payload->>'customer_tier'),amount_entry_type=p_payload->>'amount_entry_type',item_price=coalesce(nullif(p_payload->>'item_price','')::bigint,0),weight_kg=coalesce(nullif(p_payload->>'actual_weight_kg','')::numeric,0),delivery_charges=nullif(p_payload->>'delivery_charges','')::bigint,merchant_stated_total_amount=nullif(p_payload->>'merchant_stated_total_amount','')::bigint,additional_customer_charge=coalesce(nullif(p_payload->>'additional_customer_charge','')::bigint,0),cbm_surcharge=coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0),other_surcharge=coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0),merchant_payable_charges=coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0),other_merchant_credits=coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0),delivery_fee=nullif(v_quote->>'net_system_delivery_charge','')::bigint,cod_amount=nullif(v_quote->>'cod_amount','')::bigint,actual_collect=nullif(v_quote->>'cod_amount','')::bigint,base_tariff=nullif(v_quote->>'base_tariff','')::bigint,included_kg=nullif(v_quote->>'included_kg','')::numeric,chargeable_weight_kg=nullif(v_quote->>'chargeable_weight_kg','')::numeric,extra_kg=nullif(v_quote->>'extra_kg','')::numeric,weight_surcharge=nullif(v_quote->>'weight_surcharge','')::bigint,gross_system_delivery_charge=nullif(v_quote->>'gross_system_delivery_charge','')::bigint,commitment_refund=coalesce(nullif(v_quote->>'commitment_refund','')::bigint,0),net_system_delivery_charge=nullif(v_quote->>'net_system_delivery_charge','')::bigint,effective_declared_delivery_charge=nullif(v_quote->>'effective_declared_delivery_charge','')::bigint,delivery_difference=nullif(v_quote->>'delivery_difference','')::bigint,settlement_direction=v_quote->>'settlement_direction',merchant_settlement_adjustment=nullif(v_quote->>'merchant_settlement_adjustment','')::bigint,merchant_final_settlement_amount=nullif(v_quote->>'merchant_final_settlement_amount','')::bigint,financial_validation_status=v_quote->>'validation_status',financial_validation_message=v_quote->>'validation_message',financial_calculation_version=coalesce(v_quote->>'calculation_version','FINANCIAL_V2_SCHEMA_2026_07_31'),financial_calculated_at=now(),financial_quote=v_quote,service_type=coalesce(p_payload->>'service_type','STANDARD_DELIVERY'),highway_station_code=nullif(p_payload->>'highway_station_code',''),zone_code=p_payload->>'zone_code',managing_branch_code=v_quote->>'managing_branch_code',fulfillment_mode=v_quote->>'fulfillment_mode',provider_code=v_quote->>'provider_code',route_quote=v_quote,updated_at=now()
  where d.pickup_id=p_payload->>'pickup_id' and d.parcel_sequence=coalesce(nullif(p_payload->>'parcel_sequence','')::integer,1) and d.delivery_way_id=p_payload->>'delivery_way_id';
  get diagnostics v_updated=row_count;if v_updated<>1 then raise exception 'Exact Data Entry row was not found';end if;
  insert into public.be_parcel_fulfillment_v55(delivery_way_id,pickup_id,merchant_code,destination_township,zone_code,service_type,highway_station_code,fulfillment_mode,managing_branch_code,provider_code,normalized_status,cod_amount,britium_delivery_revenue_mmk,route_snapshot,tariff_snapshot,calculation_version,updated_at)
  values(p_payload->>'delivery_way_id',p_payload->>'pickup_id',p_payload->>'merchant_code',p_payload->>'township',p_payload->>'zone_code',coalesce(p_payload->>'service_type','STANDARD_DELIVERY'),nullif(p_payload->>'highway_station_code',''),v_quote->>'fulfillment_mode',v_quote->>'managing_branch_code',v_quote->>'provider_code','ROUTED',coalesce(nullif(v_quote->>'cod_amount','')::bigint,0),coalesce(nullif(v_quote->>'net_system_delivery_charge','')::bigint,0),v_quote,v_quote,'NETWORK_FULFILLMENT_V55',now())
  on conflict(delivery_way_id) do update set pickup_id=excluded.pickup_id,merchant_code=excluded.merchant_code,destination_township=excluded.destination_township,zone_code=excluded.zone_code,service_type=excluded.service_type,highway_station_code=excluded.highway_station_code,fulfillment_mode=excluded.fulfillment_mode,managing_branch_code=excluded.managing_branch_code,provider_code=excluded.provider_code,cod_amount=excluded.cod_amount,britium_delivery_revenue_mmk=excluded.britium_delivery_revenue_mmk,route_snapshot=excluded.route_snapshot,tariff_snapshot=excluded.tariff_snapshot,updated_at=now();
  v_audit:=public.be_integrated_audit_v41('DATA_ENTRY','FINANCIAL_V2_SAVE','DELIVERY_WAY',p_payload->>'delivery_way_id',v_quote->>'managing_branch_code',null,v_quote,p_payload->>'remarks',p_request_id);
  return jsonb_build_object('ok',true,'build','FINANCIAL_V2_SCHEMA_2026_07_31','generated_at',now(),'data',jsonb_build_object('quote',v_quote,'audit_event_id',v_audit,'request_id',p_request_id));
end $$;

create or replace function public.be_data_entry_financial_v2_create_waybill(p_pickup_id text,p_way_ids text[],p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows jsonb; v_result jsonb;
begin
  perform public.be_integrated_require_permission_v41('DATA_ENTRY_WAYBILL_CREATE',null);
  select jsonb_agg(jsonb_build_object('စဉ်',d.parcel_sequence,'Status',coalesce(d.status,'registered'),'Way ID',d.delivery_way_id,'OS',coalesce(d.customer_tier,'STANDARD'),'လက်ခံမည့်သူအမည်',coalesce(d.recipient_name,''),'ဖုန်း',coalesce(d.recipient_phone,''),'မြို့နယ်',coalesce(d.township,''),'လိပ်စာ',coalesce(d.delivery_address,''),'ပစ္စည်းတန်ဖိုး',coalesce(d.item_price,0),'ပို့ဆောင်ခ',coalesce(d.delivery_charges,0),'ကီလို',coalesce(d.weight_kg,0),'ကီလိုအပိုကြေး',coalesce(d.weight_surcharge,0),'ငွေကောက်ရန်',coalesce(d.cod_amount,0),'Destination',coalesce(d.destination,''),'Remarks',coalesce(d.remark,'')) order by d.parcel_sequence) into v_rows from public.be_data_entry_parcel_details d where d.pickup_id=p_pickup_id and d.delivery_way_id=any(p_way_ids) and d.financial_validation_status<>'ERROR';
  if v_rows is null or jsonb_array_length(v_rows)=0 then raise exception 'No financially valid rows were selected'; end if;
  if to_regprocedure('public.be_data_entry_confirm_waybill_v24(text,jsonb,text)') is null then raise exception 'Waybill bridge V24 is not installed'; end if;
  execute 'select public.be_data_entry_confirm_waybill_v24($1,$2,$3)' into v_result using p_pickup_id,v_rows,coalesce(auth.jwt()->>'email',auth.uid()::text);
  perform public.be_integrated_audit_v41('DATA_ENTRY','WAYBILL_CREATE','PICKUP',p_pickup_id,null,null,v_result,'Financial V2 waybill creation',p_request_id);
  return jsonb_build_object('ok',true,'build','FINANCIAL_V2_SCHEMA_2026_07_31','data',v_result);
end $$;

create or replace function public.be_network_fulfillment_snapshot_v55(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','generated_at',now(),'data',jsonb_build_object(
    'build','NETWORK_FULFILLMENT_V55','generated_at',now(),
    'summary',jsonb_build_object(
      'total_ways',count(*),'britium_direct',count(*) filter(where fulfillment_mode='BRITIUM_DIRECT'),'branch_managed',count(*) filter(where fulfillment_mode in ('BRANCH_DIRECT','BRANCH_THIRD_PARTY')),'royal_express',count(*) filter(where provider_code='ROYAL_EXPRESS'),'dk_delivery',count(*) filter(where provider_code='DK_DELIVERY'),'cod_outstanding_mmk',coalesce(sum(cod_amount) filter(where cod_custody_status not in ('REMITTED_CONFIRMED','NOT_APPLICABLE')),0),'partner_payable_mmk',coalesce(sum(partner_payable_mmk),0),'exception_count',count(*) filter(where sla_status='BREACHED' or financial_status like '%HOLD%' or pod_status in ('REJECTED','MISSING')),'customer_collection_mmk',coalesce(sum(cod_amount),0),'britium_delivery_revenue_mmk',coalesce(sum(britium_delivery_revenue_mmk),0),'merchant_settlement_mmk',0,'outsource_margin_mmk',coalesce(sum(fulfillment_margin_mmk),0)),
    'rows',coalesce(jsonb_agg(to_jsonb(f) order by f.updated_at desc),'[]'::jsonb),
    'exceptions',coalesce((select jsonb_agg(to_jsonb(x)) from public.be_parcel_fulfillment_v55 x where x.sla_status='BREACHED' or x.financial_status like '%HOLD%' or x.pod_status in ('REJECTED','MISSING')),'[]'::jsonb),
    'partner_batches',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.be_partner_settlement_batches_v55 b),'[]'::jsonb),
    'branch_reconciliations',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.be_branch_settlement_batches_v1 b),'[]'::jsonb),
    'rate_status',coalesce((select jsonb_agg(jsonb_build_object('provider_code',c.provider_code,'contract_code',c.contract_code,'status',c.status,'effective_version',c.effective_from,'message',c.metadata)) from public.be_partner_contracts_v55 c),'[]'::jsonb)))
  from public.be_parcel_fulfillment_v55 f;
$$;

create or replace function public.be_network_fulfillment_assign_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_route jsonb; v_before jsonb; v_after jsonb; v_audit uuid;
begin
  perform public.be_integrated_require_permission_v41('NETWORK_ASSIGN',p_payload->>'managing_branch_code');
  v_route:=public.be_fulfillment_route_resolve_v55(p_payload);
  select to_jsonb(f) into v_before from public.be_parcel_fulfillment_v55 f where delivery_way_id=p_payload->>'delivery_way_id';
  insert into public.be_parcel_fulfillment_v55(delivery_way_id,pickup_id,merchant_code,destination_township,zone_code,service_type,highway_station_code,fulfillment_mode,managing_branch_code,provider_code,provider_tracking_id,normalized_status,cod_amount,britium_delivery_revenue_mmk,route_snapshot,updated_at)
  values(p_payload->>'delivery_way_id',p_payload->>'pickup_id',p_payload->>'merchant_code',p_payload->>'township',p_payload->>'zone_code',coalesce(p_payload->>'service_type','STANDARD_DELIVERY'),nullif(p_payload->>'highway_station_code',''),v_route->>'fulfillment_mode',v_route->>'managing_branch_code',v_route->>'provider_code',nullif(p_payload->>'provider_tracking_id',''),'ASSIGNED',coalesce(nullif(p_payload->>'cod_amount','')::bigint,0),coalesce(nullif(p_payload->>'britium_delivery_revenue_mmk','')::bigint,0),v_route,now())
  on conflict(delivery_way_id) do update set fulfillment_mode=excluded.fulfillment_mode,managing_branch_code=excluded.managing_branch_code,provider_code=excluded.provider_code,provider_tracking_id=excluded.provider_tracking_id,normalized_status='ASSIGNED',route_snapshot=excluded.route_snapshot,updated_at=now();
  select to_jsonb(f) into v_after from public.be_parcel_fulfillment_v55 f where delivery_way_id=p_payload->>'delivery_way_id';
  v_audit:=public.be_integrated_audit_v41('NETWORK_FULFILLMENT','ASSIGN','DELIVERY_WAY',p_payload->>'delivery_way_id',v_route->>'managing_branch_code',v_before,v_after,p_payload->>'reason',p_request_id);
  return jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','data',v_after||jsonb_build_object('audit_event_id',v_audit));
end $$;

create or replace function public.be_network_fulfillment_reassign_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if nullif(p_payload->>'reason','') is null then raise exception 'Reassignment reason is required'; end if;
  return public.be_network_fulfillment_assign_v55(p_payload,p_request_id);
end $$;

create or replace function public.be_network_manifest_create_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=gen_random_uuid(); v_number text:=coalesce(nullif(p_payload->>'manifest_number',''),'LH-'||to_char(now(),'YYYYMMDD-HH24MISS')); v_way text; v_count int:=0;
begin
  perform public.be_integrated_require_permission_v41('NETWORK_MANIFEST_CREATE',p_payload->>'origin_branch_code');
  insert into public.be_linehaul_manifests_v55(manifest_id,manifest_number,origin_branch_code,destination_branch_code,transport_provider,total_transport_cost_mmk,allocation_method,status,created_by,metadata) values(v_id,v_number,p_payload->>'origin_branch_code',p_payload->>'destination_branch_code',p_payload->>'transport_provider',coalesce(nullif(p_payload->>'total_transport_cost_mmk','')::bigint,0),coalesce(p_payload->>'allocation_method','EQUAL_PER_WAY'),'DRAFT',auth.uid(),p_payload);
  for v_way in select jsonb_array_elements_text(coalesce(p_payload->'way_ids','[]'::jsonb)) loop insert into public.be_linehaul_manifest_items_v55(manifest_id,delivery_way_id) values(v_id,v_way) on conflict do nothing;v_count:=v_count+1;end loop;
  if v_count>0 and coalesce(nullif(p_payload->>'total_transport_cost_mmk','')::bigint,0)>0 and coalesce(p_payload->>'allocation_method','EQUAL_PER_WAY')='EQUAL_PER_WAY' then update public.be_linehaul_manifest_items_v55 set allocated_cost_mmk=round(coalesce(nullif(p_payload->>'total_transport_cost_mmk','')::numeric,0)/v_count)::bigint where manifest_id=v_id; end if;
  perform public.be_integrated_audit_v41('NETWORK_FULFILLMENT','MANIFEST_CREATE','LINEHAUL_MANIFEST',v_id::text,p_payload->>'origin_branch_code',null,to_jsonb((select m from public.be_linehaul_manifests_v55 m where m.manifest_id=v_id)),p_payload->>'reason',p_request_id);
  return jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','data',jsonb_build_object('manifest_id',v_id,'manifest_number',v_number,'parcel_count',v_count));
end $$;

create or replace function public.be_network_manifest_accept_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.be_integrated_require_permission_v41('NETWORK_MANIFEST_ACCEPT',p_payload->>'destination_branch_code');
  update public.be_linehaul_manifests_v55 set status='ACCEPTED',accepted_at=now() where manifest_id=(p_payload->>'manifest_id')::uuid and status<>'ACCEPTED';
  update public.be_linehaul_manifest_items_v55 set accepted=true where manifest_id=(p_payload->>'manifest_id')::uuid;
  update public.be_parcel_fulfillment_v55 f set linehaul_cost_mmk=i.allocated_cost_mmk,normalized_status='LINEHAUL_ACCEPTED',updated_at=now() from public.be_linehaul_manifest_items_v55 i where i.manifest_id=(p_payload->>'manifest_id')::uuid and i.delivery_way_id=f.delivery_way_id;
  perform public.be_integrated_audit_v41('NETWORK_FULFILLMENT','MANIFEST_ACCEPT','LINEHAUL_MANIFEST',p_payload->>'manifest_id',p_payload->>'destination_branch_code',null,p_payload,p_payload->>'reason',p_request_id);
  return jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','data',jsonb_build_object('manifest_id',p_payload->>'manifest_id','status','ACCEPTED'));
end $$;

create or replace function public.be_network_tracking_event_ingest_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=gen_random_uuid();
begin
  insert into public.be_partner_tracking_events_v55(event_id,provider_code,delivery_way_id,provider_tracking_id,provider_event_code,normalized_status,event_at,raw_payload,request_id) values(v_id,p_payload->>'provider_code',p_payload->>'delivery_way_id',p_payload->>'provider_tracking_id',p_payload->>'provider_event_code',p_payload->>'normalized_status',coalesce(nullif(p_payload->>'event_at','')::timestamptz,now()),p_payload,p_request_id) on conflict do nothing;
  update public.be_parcel_fulfillment_v55 set provider_tracking_id=coalesce(nullif(p_payload->>'provider_tracking_id',''),provider_tracking_id),normalized_status=p_payload->>'normalized_status',updated_at=now() where delivery_way_id=p_payload->>'delivery_way_id';
  return jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','data',jsonb_build_object('event_id',v_id,'delivery_way_id',p_payload->>'delivery_way_id'));
end $$;

create or replace function public.be_network_pod_submit_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.be_integrated_require_permission_v41('NETWORK_POD_SUBMIT',p_payload->>'managing_branch_code');
  update public.be_parcel_fulfillment_v55 set pod_status='SUBMITTED',pod_snapshot=p_payload,updated_at=now() where delivery_way_id=p_payload->>'delivery_way_id';
  perform public.be_integrated_audit_v41('NETWORK_FULFILLMENT','POD_SUBMIT','DELIVERY_WAY',p_payload->>'delivery_way_id',p_payload->>'managing_branch_code',null,p_payload,p_payload->>'reason',p_request_id);
  return jsonb_build_object('ok',true,'data',jsonb_build_object('delivery_way_id',p_payload->>'delivery_way_id','pod_status','SUBMITTED'));
end $$;
create or replace function public.be_network_pod_review_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text:=case when coalesce((p_payload->>'approved')::boolean,false) then 'VERIFIED' else 'REJECTED' end;
begin perform public.be_integrated_require_permission_v41('NETWORK_POD_REVIEW',p_payload->>'managing_branch_code');update public.be_parcel_fulfillment_v55 set pod_status=v_status,pod_snapshot=pod_snapshot||p_payload,financial_status=case when v_status='VERIFIED' then financial_status else 'POD_HOLD' end,updated_at=now() where delivery_way_id=p_payload->>'delivery_way_id';perform public.be_integrated_audit_v41('NETWORK_FULFILLMENT','POD_REVIEW','DELIVERY_WAY',p_payload->>'delivery_way_id',p_payload->>'managing_branch_code',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('delivery_way_id',p_payload->>'delivery_way_id','pod_status',v_status));end $$;

create or replace function public.be_network_cod_handover_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.be_integrated_require_permission_v41('NETWORK_COD_HANDOVER',p_payload->>'managing_branch_code');update public.be_parcel_fulfillment_v55 set cod_custody_status=p_payload->>'cod_custody_status',updated_at=now() where delivery_way_id=p_payload->>'delivery_way_id';perform public.be_integrated_audit_v41('NETWORK_FULFILLMENT','COD_HANDOVER','DELIVERY_WAY',p_payload->>'delivery_way_id',p_payload->>'managing_branch_code',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('delivery_way_id',p_payload->>'delivery_way_id','cod_custody_status',p_payload->>'cod_custody_status'));end $$;

create or replace function public.be_partner_settlement_snapshot_v55(p_provider_code text default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$ select jsonb_build_object('ok',true,'build','PARTNER_SETTLEMENT_V55','generated_at',now(),'data',jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc) filter(where p_provider_code is null or b.provider_code=p_provider_code),'[]'::jsonb),'summary',jsonb_build_object('batch_count',count(*) filter(where p_provider_code is null or b.provider_code=p_provider_code),'net_payable_mmk',coalesce(sum(b.net_payable_mmk) filter(where p_provider_code is null or b.provider_code=p_provider_code),0),'gross_cod_mmk',coalesce(sum(b.gross_cod_mmk) filter(where p_provider_code is null or b.provider_code=p_provider_code),0),'outstanding_mmk',coalesce(sum(b.outstanding_mmk) filter(where p_provider_code is null or b.provider_code=p_provider_code),0)))) from public.be_partner_settlement_batches_v55 b $$;

create or replace function public.be_partner_settlement_batch_create_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=gen_random_uuid();v_number text:=coalesce(nullif(p_payload->>'batch_number',''),'PARTNER-'||to_char(now(),'YYYYMMDD-HH24MISS'));v_way text;v_count int:=0;v_cod bigint:=0;v_pay bigint:=0;
begin perform public.be_integrated_require_permission_v41('PARTNER_SETTLEMENT_CREATE',null);insert into public.be_partner_settlement_batches_v55(batch_id,batch_number,provider_code,period_from,period_to,status,created_by,metadata) values(v_id,v_number,p_payload->>'provider_code',(p_payload->>'period_from')::date,(p_payload->>'period_to')::date,'DRAFT',auth.uid(),p_payload);
for v_way in select jsonb_array_elements_text(coalesce(p_payload->'way_ids','[]'::jsonb)) loop insert into public.be_partner_settlement_lines_v55(batch_id,delivery_way_id,gross_cod_mmk,partner_payable_mmk,final_payable_mmk,pod_verified) select v_id,f.delivery_way_id,f.cod_amount,coalesce(f.partner_payable_mmk,0),coalesce(f.partner_payable_mmk,0),f.pod_status='VERIFIED' from public.be_parcel_fulfillment_v55 f where f.delivery_way_id=v_way and f.provider_code=p_payload->>'provider_code' and f.pod_status='VERIFIED' on conflict do nothing;end loop;
select count(*),coalesce(sum(gross_cod_mmk),0),coalesce(sum(final_payable_mmk),0) into v_count,v_cod,v_pay from public.be_partner_settlement_lines_v55 where batch_id=v_id;update public.be_partner_settlement_batches_v55 set parcel_count=v_count,gross_cod_mmk=v_cod,partner_service_payable_mmk=v_pay,net_payable_mmk=v_pay,outstanding_mmk=v_pay where batch_id=v_id;perform public.be_integrated_audit_v41('PARTNER_SETTLEMENT','BATCH_CREATE','PARTNER_BATCH',v_id::text,null,null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'build','PARTNER_SETTLEMENT_V55','data',jsonb_build_object('batch_id',v_id,'batch_number',v_number,'parcel_count',v_count,'net_payable_mmk',v_pay));end $$;

create or replace function public.be_partner_settlement_batch_submit_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('PARTNER_SETTLEMENT_SUBMIT',null);update public.be_partner_settlement_batches_v55 set status='PENDING_APPROVAL' where batch_id=(p_payload->>'batch_id')::uuid and status='DRAFT';perform public.be_integrated_audit_v41('PARTNER_SETTLEMENT','BATCH_SUBMIT','PARTNER_BATCH',p_payload->>'batch_id',null,null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('batch_id',p_payload->>'batch_id','status','PENDING_APPROVAL'));end $$;
create or replace function public.be_partner_settlement_batch_approve_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('PARTNER_SETTLEMENT_APPROVE',null);update public.be_partner_settlement_batches_v55 set status='APPROVED',approved_by=auth.uid(),approved_at=now() where batch_id=(p_payload->>'batch_id')::uuid and status='PENDING_APPROVAL' and created_by is distinct from auth.uid();if not found then raise exception 'Batch not found, invalid status, or maker-checker violation';end if;perform public.be_integrated_audit_v41('PARTNER_SETTLEMENT','BATCH_APPROVE','PARTNER_BATCH',p_payload->>'batch_id',null,null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('batch_id',p_payload->>'batch_id','status','APPROVED'));end $$;
create or replace function public.be_partner_settlement_record_remittance_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('PARTNER_REMITTANCE_RECORD',null);update public.be_partner_settlement_batches_v55 set remitted_cod_mmk=remitted_cod_mmk+greatest(coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),0),outstanding_mmk=greatest(gross_cod_mmk-(remitted_cod_mmk+greatest(coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),0)),0),metadata=metadata||jsonb_build_object('last_remittance',p_payload) where batch_id=(p_payload->>'batch_id')::uuid;perform public.be_integrated_audit_v41('PARTNER_SETTLEMENT','REMITTANCE_RECORD','PARTNER_BATCH',p_payload->>'batch_id',null,null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('batch_id',p_payload->>'batch_id'));end $$;
create or replace function public.be_partner_settlement_payment_record_v55(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('PARTNER_PAYMENT_RECORD',null);update public.be_partner_settlement_batches_v55 set payment_status=case when greatest(coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),0)>=net_payable_mmk then 'PAID' else 'PARTIALLY_PAID' end,status=case when greatest(coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),0)>=net_payable_mmk then 'PAID' else status end,metadata=metadata||jsonb_build_object('last_payment',p_payload) where batch_id=(p_payload->>'batch_id')::uuid and status='APPROVED';perform public.be_integrated_audit_v41('PARTNER_SETTLEMENT','PAYMENT_RECORD','PARTNER_BATCH',p_payload->>'batch_id',null,null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('batch_id',p_payload->>'batch_id'));end $$;

create or replace function public.be_branch_settlement_calculate_parcel_v1(p_payload jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_revenue bigint:=greatest(coalesce(nullif(p_payload->>'shareable_delivery_revenue_mmk','')::bigint,0),0);v_sender text:=upper(p_payload->>'sender_entity');v_last text:=upper(p_payload->>'last_mile_entity');v_sender_gross bigint;v_last_gross bigint;v_npt_gross bigint;v_fee bigint;v_penalty bigint:=greatest(coalesce(nullif(p_payload->>'penalties_mmk','')::bigint,0),0);v_credit bigint:=greatest(coalesce(nullif(p_payload->>'credits_mmk','')::bigint,0),0);v_deduction bigint:=greatest(coalesce(nullif(p_payload->>'deductions_mmk','')::bigint,0),0);v_net bigint;
begin if v_sender=v_last or v_sender not in ('HQ','NPT') or v_last not in ('HQ','NPT') then return jsonb_build_object('validation_status','ERROR','validation_message','Sender and last-mile entities must be different HQ/NPT values');end if;v_sender_gross:=round(v_revenue*0.55);v_last_gross:=v_revenue-v_sender_gross;v_npt_gross:=case when v_sender='NPT' then v_sender_gross else v_last_gross end;v_fee:=round(v_npt_gross*0.10);v_net:=v_npt_gross-v_fee-v_penalty-v_deduction+v_credit;return jsonb_build_object('validation_status','OK','sender_gross_mmk',v_sender_gross,'last_mile_gross_mmk',v_last_gross,'npt_gross_mmk',v_npt_gross,'management_fee_mmk',v_fee,'npt_net_mmk',v_net,'hq_operational_share_mmk',case when v_sender='HQ' then v_sender_gross else v_last_gross end,'hq_total_revenue_mmk',(case when v_sender='HQ' then v_sender_gross else v_last_gross end)+v_fee,'calculation_version','NPT_INTEROFFICE_55_45_MGMT10_V1');end $$;

create or replace function public.be_branch_settlement_snapshot_v1(p_branch_code text default 'NPT',p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_data jsonb;
begin if upper(p_branch_code)<>'NPT' then return jsonb_build_object('ok',false,'build','NPT_BRANCH_SETTLEMENT_V1','errors',jsonb_build_array(jsonb_build_object('code','BRANCH_RULE_NOT_CONFIGURED','message','Only Naypyitaw is active for this contract')));end if;
select jsonb_build_object('build','NPT_BRANCH_SETTLEMENT_V1','generated_at',now(),'summary',jsonb_build_object('eligible_ways',(select count(*) from public.be_parcel_fulfillment_v55 f where f.managing_branch_code='NPT' and f.normalized_status='DELIVERED' and f.pod_status='VERIFIED' and not exists(select 1 from public.be_branch_settlement_lines_v1 l where l.delivery_way_id=f.delivery_way_id)),'shareable_revenue_mmk',coalesce(sum(b.shareable_revenue_mmk),0),'npt_gross_share_mmk',coalesce(sum(b.branch_gross_share_mmk),0),'management_fee_mmk',coalesce(sum(b.management_fee_mmk),0),'penalties_mmk',coalesce(sum(b.penalties_mmk),0),'npt_net_share_mmk',coalesce(sum(b.branch_net_share_mmk),0),'cod_outstanding_mmk',coalesce(sum(b.cod_outstanding_mmk),0),'exception_count',count(*) filter(where b.status in ('DISPUTED','REJECTED'))),'eligible_parcels',coalesce((select jsonb_agg(to_jsonb(f)) from public.be_parcel_fulfillment_v55 f where f.managing_branch_code='NPT' and f.normalized_status='DELIVERED' and f.pod_status='VERIFIED' and not exists(select 1 from public.be_branch_settlement_lines_v1 l where l.delivery_way_id=f.delivery_way_id)),'[]'::jsonb),'batches',coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]'::jsonb),'remittances',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.be_branch_cod_remittances_v1 r where r.branch_code='NPT'),'[]'::jsonb),'adjustments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.be_branch_settlement_adjustments_v1 a),'[]'::jsonb),'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.be_branch_settlement_payments_v1 p),'[]'::jsonb),'disputes','[]'::jsonb,'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.be_audit_events a where a.module_code='BRANCH_SETTLEMENT' and a.branch_code='NPT' limit 500),'[]'::jsonb)) into v_data from public.be_branch_settlement_batches_v1 b where b.branch_code='NPT';return jsonb_build_object('ok',true,'build','NPT_BRANCH_SETTLEMENT_V1','generated_at',now(),'data',v_data);end $$;

create or replace function public.be_branch_settlement_create_batch_v1(p_payload jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=gen_random_uuid();v_number text:=coalesce(nullif(p_payload->>'batch_number',''),'NPT-SET-'||to_char(now(),'YYYYMMDD-HH24MISS'));v_way text;v_calc jsonb;v_count int;v_revenue bigint;v_gross bigint;v_fee bigint;v_net bigint;v_cod bigint;
begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_CREATE','NPT');insert into public.be_branch_settlement_batches_v1(batch_id,batch_number,branch_code,rule_code,period_from,period_to,status,created_by,metadata) values(v_id,v_number,'NPT','NPT_INTEROFFICE_55_45_MGMT10_V1',(p_payload->>'period_from')::date,(p_payload->>'period_to')::date,'DRAFT',auth.uid(),p_payload);
for v_way in select jsonb_array_elements_text(coalesce(p_payload->'way_ids','[]'::jsonb)) loop select public.be_branch_settlement_calculate_parcel_v1(jsonb_build_object('shareable_delivery_revenue_mmk',f.britium_delivery_revenue_mmk,'sender_entity',coalesce(p_payload->>'sender_entity','HQ'),'last_mile_entity',coalesce(p_payload->>'last_mile_entity','NPT'),'penalties_mmk',0,'credits_mmk',0,'deductions_mmk',0)) into v_calc from public.be_parcel_fulfillment_v55 f where f.delivery_way_id=v_way and f.managing_branch_code='NPT' and f.normalized_status='DELIVERED' and f.pod_status='VERIFIED';if v_calc->>'validation_status'='OK' then insert into public.be_branch_settlement_lines_v1(batch_id,delivery_way_id,sender_entity,last_mile_entity,shareable_revenue_mmk,sender_gross_mmk,last_mile_gross_mmk,npt_gross_mmk,management_fee_mmk,npt_net_mmk,cod_amount_mmk) select v_id,f.delivery_way_id,coalesce(p_payload->>'sender_entity','HQ'),coalesce(p_payload->>'last_mile_entity','NPT'),f.britium_delivery_revenue_mmk,(v_calc->>'sender_gross_mmk')::bigint,(v_calc->>'last_mile_gross_mmk')::bigint,(v_calc->>'npt_gross_mmk')::bigint,(v_calc->>'management_fee_mmk')::bigint,(v_calc->>'npt_net_mmk')::bigint,f.cod_amount from public.be_parcel_fulfillment_v55 f where f.delivery_way_id=v_way on conflict do nothing;end if;end loop;
select count(*),coalesce(sum(shareable_revenue_mmk),0),coalesce(sum(npt_gross_mmk),0),coalesce(sum(management_fee_mmk),0),coalesce(sum(npt_net_mmk),0),coalesce(sum(cod_amount_mmk),0) into v_count,v_revenue,v_gross,v_fee,v_net,v_cod from public.be_branch_settlement_lines_v1 where batch_id=v_id;update public.be_branch_settlement_batches_v1 set parcel_count=v_count,shareable_revenue_mmk=v_revenue,branch_gross_share_mmk=v_gross,management_fee_mmk=v_fee,branch_net_share_mmk=v_net,gross_cod_mmk=v_cod,cod_outstanding_mmk=v_cod where batch_id=v_id;perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','BATCH_CREATE','BRANCH_BATCH',v_id::text,'NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'build','NPT_BRANCH_SETTLEMENT_V1','data',jsonb_build_object('batch_id',v_id,'batch_number',v_number,'parcel_count',v_count,'branch_net_share_mmk',v_net,'gross_cod_mmk',v_cod));end $$;

create or replace function public.be_branch_settlement_submit_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_SUBMIT','NPT');update public.be_branch_settlement_batches_v1 set status='PENDING_BRANCH_CONFIRMATION' where batch_id=(p_payload->>'batch_id')::uuid and status='DRAFT';perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','BATCH_SUBMIT','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('status','PENDING_BRANCH_CONFIRMATION'));end $$;
create or replace function public.be_branch_settlement_branch_confirm_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_CONFIRM','NPT');update public.be_branch_settlement_batches_v1 set status='PENDING_HQ_APPROVAL' where batch_id=(p_payload->>'batch_id')::uuid and status='PENDING_BRANCH_CONFIRMATION';perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','BRANCH_CONFIRM','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('status','PENDING_HQ_APPROVAL'));end $$;
create or replace function public.be_branch_settlement_hq_approve_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_APPROVE','NPT');update public.be_branch_settlement_batches_v1 set status='APPROVED',approved_by=auth.uid(),approved_at=now() where batch_id=(p_payload->>'batch_id')::uuid and status='PENDING_HQ_APPROVAL' and created_by is distinct from auth.uid();if not found then raise exception 'Maker-checker violation or invalid batch status';end if;perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','HQ_APPROVE','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('status','APPROVED'));end $$;
create or replace function public.be_branch_settlement_record_cod_remittance_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid:=gen_random_uuid();v_amount bigint:=greatest(coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),0);begin perform public.be_integrated_require_permission_v41('BRANCH_COD_REMITTANCE_RECORD','NPT');insert into public.be_branch_cod_remittances_v1(remittance_id,branch_code,batch_id,amount_mmk,reference,remitted_at,status,proof,request_id) values(v_id,'NPT',(p_payload->>'batch_id')::uuid,v_amount,p_payload->>'reference',coalesce(nullif(p_payload->>'remitted_at','')::timestamptz,now()),'SUBMITTED',coalesce(p_payload->'proof','{}'::jsonb),p_request_id);update public.be_branch_settlement_batches_v1 set cod_remitted_mmk=cod_remitted_mmk+v_amount,cod_outstanding_mmk=greatest(gross_cod_mmk-(cod_remitted_mmk+v_amount),0) where batch_id=(p_payload->>'batch_id')::uuid;perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','COD_REMITTANCE_RECORD','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('remittance_id',v_id));end $$;
create or replace function public.be_branch_settlement_confirm_cod_remittance_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.be_integrated_require_permission_v41('BRANCH_COD_REMITTANCE_CONFIRM','NPT');update public.be_branch_cod_remittances_v1 set status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=now() where remittance_id=(p_payload->>'remittance_id')::uuid and status='SUBMITTED';perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','COD_REMITTANCE_CONFIRM','REMITTANCE',p_payload->>'remittance_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('status','CONFIRMED'));end $$;
create or replace function public.be_branch_settlement_add_adjustment_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid:=gen_random_uuid();begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_ADJUST','NPT');insert into public.be_branch_settlement_adjustments_v1(adjustment_id,batch_id,delivery_way_id,adjustment_type,amount_mmk,responsible_entity,reason,status,created_by) values(v_id,(p_payload->>'batch_id')::uuid,p_payload->>'delivery_way_id',p_payload->>'adjustment_type',coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),p_payload->>'responsible_entity',p_payload->>'reason','APPROVED',auth.uid());update public.be_branch_settlement_batches_v1 set penalties_mmk=penalties_mmk+case when p_payload->>'adjustment_type' like '%PENALTY%' then coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0) else 0 end,credits_mmk=credits_mmk+case when p_payload->>'adjustment_type' like '%CREDIT%' then coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0) else 0 end,branch_net_share_mmk=branch_net_share_mmk-case when p_payload->>'adjustment_type' like '%PENALTY%' then coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0) else 0 end+case when p_payload->>'adjustment_type' like '%CREDIT%' then coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0) else 0 end where batch_id=(p_payload->>'batch_id')::uuid;perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','ADJUSTMENT_ADD','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('adjustment_id',v_id));end $$;
create or replace function public.be_branch_settlement_record_payment_v1(p_payload jsonb,p_request_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_id uuid:=gen_random_uuid();begin perform public.be_integrated_require_permission_v41('BRANCH_SETTLEMENT_PAYMENT','NPT');insert into public.be_branch_settlement_payments_v1(payment_id,batch_id,amount_mmk,payment_reference,paid_at,status,evidence,created_by) values(v_id,(p_payload->>'batch_id')::uuid,coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0),p_payload->>'payment_reference',coalesce(nullif(p_payload->>'paid_at','')::timestamptz,now()),'RECORDED',coalesce(p_payload->'evidence','{}'::jsonb),auth.uid());update public.be_branch_settlement_batches_v1 set payment_status=case when coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0)>=branch_net_share_mmk then 'PAID' else 'PARTIALLY_PAID' end,status=case when coalesce(nullif(p_payload->>'amount_mmk','')::bigint,0)>=branch_net_share_mmk then 'SETTLED' else status end where batch_id=(p_payload->>'batch_id')::uuid;perform public.be_integrated_audit_v41('BRANCH_SETTLEMENT','PAYMENT_RECORD','BRANCH_BATCH',p_payload->>'batch_id','NPT',null,p_payload,p_payload->>'reason',p_request_id);return jsonb_build_object('ok',true,'data',jsonb_build_object('payment_id',v_id));end $$;

create or replace function public.be_merchant_referral_commission_rebuild_v41(p_from date,p_to date,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_inserted integer:=0;
begin perform public.be_integrated_require_permission_v41('WORKFORCE_COMMISSION_REBUILD',null);if to_regclass('public.parcels') is null then raise exception 'public.parcels is required';end if;
insert into public.be_merchant_referral_commission_events_v41(delivery_way_id,merchant_id,employee_id,delivered_date,rate_mmk,commission_mmk,status)
select p.way_id::text,p.merchant_id::text,a.employee_id,coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date),100,100,'EARNED'
from public.parcels p join public.be_merchant_referral_assignments_v41 a on a.merchant_id=p.merchant_id::text and a.status='ACTIVE' and coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date)>=a.effective_from and (a.effective_to is null or coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date)<=a.effective_to)
join public.be_employee_commission_eligibility_v41 e on e.employee_id=a.employee_id and e.employment_status='ACTIVE' and coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date)>=e.effective_from and (e.effective_to is null or coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date)<=e.effective_to)
where upper(coalesce(p.status,'')) in ('DELIVERED','DROP_OFF','COMPLETED') and coalesce(p.delivered_at::date,p.updated_at::date,p.created_at::date) between p_from and p_to
on conflict(delivery_way_id,employee_id) do nothing;get diagnostics v_inserted=row_count;perform public.be_integrated_audit_v41('WORKFORCE_COMMISSION','MERCHANT_REFERRAL_REBUILD','DATE_RANGE',p_from||':'||p_to,null,null,jsonb_build_object('inserted',v_inserted),'100 MMK per eligible delivered way',p_request_id);return jsonb_build_object('ok',true,'build','MERCHANT_REFERRAL_V41','data',jsonb_build_object('inserted',v_inserted,'rate_mmk',100));end $$;

-- Compatibility aliases from the master specification.
create or replace function public.be_network_fulfillment_route_quote_v55(p_payload jsonb) returns jsonb language sql stable security invoker as $$ select jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','generated_at',now(),'data',public.be_fulfillment_route_resolve_v55(p_payload)) $$;
create or replace function public.be_network_tracking_sync_v55(p_payload jsonb,p_request_id text) returns jsonb language sql security definer as $$ select jsonb_build_object('ok',true,'build','NETWORK_FULFILLMENT_V55','data',jsonb_build_object('status','SYNC_REQUEST_ACCEPTED','provider_code',p_payload->>'provider_code','request_id',p_request_id)) $$;
create or replace function public.be_partner_tariff_quote_v55(p_payload jsonb) returns jsonb language sql stable security invoker as $$ select jsonb_build_object('ok',true,'build','PARTNER_QUOTE_V55','generated_at',now(),'data',public.be_partner_quote_calculate_v55(p_payload)) $$;

-- Privileges. RLS remains the primary table boundary; mutation RPCs enforce permissions and audit.
grant select on public.be_highway_station_tariffs_v41,public.be_fulfillment_providers_v55,public.be_partner_contracts_v55,public.be_partner_rate_cards_v55,public.be_dk_area_rates_v55,public.be_partner_cod_fee_rules_v55,public.be_partner_rebate_tiers_v55,public.be_network_coverage_rules_v55 to authenticated;
grant execute on function public.be_fulfillment_route_resolve_v55(jsonb),public.be_partner_quote_calculate_v55(jsonb),public.be_data_entry_financial_v2_calculate(jsonb),public.be_network_fulfillment_snapshot_v55(jsonb),public.be_partner_settlement_snapshot_v55(text),public.be_branch_settlement_calculate_parcel_v1(jsonb),public.be_branch_settlement_snapshot_v1(text,jsonb),public.be_network_fulfillment_route_quote_v55(jsonb),public.be_partner_tariff_quote_v55(jsonb) to authenticated;
grant execute on function public.be_data_entry_financial_v2_save(jsonb,text),public.be_data_entry_financial_v2_create_waybill(text,text[],text),public.be_network_fulfillment_assign_v55(jsonb,text),public.be_network_fulfillment_reassign_v55(jsonb,text),public.be_network_manifest_create_v55(jsonb,text),public.be_network_manifest_accept_v55(jsonb,text),public.be_network_tracking_event_ingest_v55(jsonb,text),public.be_network_tracking_sync_v55(jsonb,text),public.be_network_pod_submit_v55(jsonb,text),public.be_network_pod_review_v55(jsonb,text),public.be_network_cod_handover_v55(jsonb,text),public.be_partner_settlement_batch_create_v55(jsonb,text),public.be_partner_settlement_batch_submit_v55(jsonb,text),public.be_partner_settlement_batch_approve_v55(jsonb,text),public.be_partner_settlement_record_remittance_v55(jsonb,text),public.be_partner_settlement_payment_record_v55(jsonb,text),public.be_branch_settlement_create_batch_v1(jsonb,text),public.be_branch_settlement_submit_v1(jsonb,text),public.be_branch_settlement_branch_confirm_v1(jsonb,text),public.be_branch_settlement_hq_approve_v1(jsonb,text),public.be_branch_settlement_record_cod_remittance_v1(jsonb,text),public.be_branch_settlement_confirm_cod_remittance_v1(jsonb,text),public.be_branch_settlement_add_adjustment_v1(jsonb,text),public.be_branch_settlement_record_payment_v1(jsonb,text),public.be_merchant_referral_commission_rebuild_v41(date,date,text) to authenticated;

commit;

select jsonb_build_object('ok',true,'build','BRITIUM_INTEGRATED_MASTER_V4_1_2026_07_31','highway_stations',(select count(*) from public.be_highway_station_tariffs_v41),'royal_rate_rows',(select count(*) from public.be_partner_rate_cards_v55 where contract_code='ROYAL_Q019_2026'),'providers',(select count(*) from public.be_fulfillment_providers_v55)) as installation_result;
