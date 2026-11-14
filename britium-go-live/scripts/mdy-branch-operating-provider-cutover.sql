-- Cutover of NEW Mandalay branch delivery routing only.
-- Preserve all historical Way, settlement, COD, and DK outsourced partner records.
-- Reviewed against production function shapes on 2026-11-14.
begin;
do $cutover$
declare
  v_def text;
  v_v26 text;
  v_count integer;
begin
  if not exists (select 1 from public.branch_offices where branch_code='MDY' and branch_name='Mandalay Branch Office') then
    raise exception 'Verified MDY branch office is absent';
  end if;
  if not exists (select 1 from public.be_data_entry_service_providers where provider_code='DK DELIVERY' and provider_type='OUTSOURCE') then
    raise exception 'Independent DK third-party provider record is missing';
  end if;
  select count(*) into v_count
  from public.be_data_entry_tariff_catalog
  where provider_code='DK DELIVERY' and source_file in ('MDY_APPROVED_MANUAL_AREAS_6487f3c1','data_entry_service_provider_routing_v17');
  if v_count <> 64 then
    raise exception 'Expected 64 MDY-owned tariff catalog rows, found %; aborting',v_count;
  end if;
  if exists(select 1 from public.be_data_entry_service_providers where provider_code='MDY BRANCH' and provider_type<>'BRANCH') then
    raise exception 'MDY BRANCH code collision with non-branch provider';
  end if;

  insert into public.be_data_entry_service_providers(provider_code,display_name,provider_type,is_active,updated_at)
  values('MDY BRANCH','Britium Mandalay Branch Office','BRANCH',true,now())
  on conflict(provider_code) do update set
    display_name=excluded.display_name,provider_type=excluded.provider_type,
    is_active=true,updated_at=now();

  update public.be_data_entry_tariff_catalog
  set provider_code='MDY BRANCH',updated_at=now()
  where provider_code='DK DELIVERY' and source_file in
    ('MDY_APPROVED_MANUAL_AREAS_6487f3c1','data_entry_service_provider_routing_v17');

  v_def:=pg_get_functiondef('public.be_data_entry_service_provider_route_v17(text)'::regprocedure);
  if position('MDY_EXPLICIT_AREA_RATE_V1' in v_def)=0
     or position('where t.is_active and t.provider_code=''DK DELIVERY''' in v_def)=0
     or position('v_provider_code := ''DK DELIVERY'';' in v_def)=0
     or position('v_reason := ''MANDALAY_DK_SERVICE_AREA'';' in v_def)=0 then
    raise exception 'Unexpected v17 function body. Release stopped.';
  end if;
  v_def:=replace(v_def,
    'where t.is_active and t.provider_code=''DK DELIVERY''',
    'where t.is_active and t.provider_code=''MDY BRANCH''');
  v_def:=replace(v_def,
    '''provider_code'',''DK DELIVERY'',''reason'',''MANDALAY_DK_SERVICE_AREA''',
    '''provider_code'',''MDY BRANCH'',''reason'',''MANDALAY_BRANCH_SERVICE_AREA''');
  v_def:=replace(v_def,
    'v_provider_code := ''DK DELIVERY'';',
    'v_provider_code := ''MDY BRANCH'';');
  v_def:=replace(v_def,
    'v_reason := ''MANDALAY_DK_SERVICE_AREA'';',
    'v_reason := ''MANDALAY_BRANCH_SERVICE_AREA'';');
  v_def:=replace(v_def,'when ''DK DELIVERY'' then 2',
    'when ''MDY BRANCH'' then 2' || E'\n      when ''DK DELIVERY'' then 3');
  execute v_def;

  v_v26:=pg_get_functiondef('public.be_data_entry_delivery_route_v26(text,numeric,text,text)'::regprocedure);
  if position('v_legacy_reason=''MANDALAY_DK_SERVICE_AREA''' in v_v26)=0
    or position('v_provider := ''DK DELIVERY''; v_region := ''MANDALAY'';' in v_v26)=0 then
    raise exception 'Unexpected v26 route function. Release stopped.';
  end if;
  v_v26:=replace(v_v26,
    'v_legacy_reason=''MANDALAY_DK_SERVICE_AREA''',
    'v_legacy_reason=''MANDALAY_BRANCH_SERVICE_AREA''');
  v_v26:=replace(v_v26,
    'v_provider := ''DK DELIVERY''; v_region := ''MANDALAY'';',
    'v_provider := ''MDY BRANCH''; v_region := ''MANDALAY'';');
  execute v_v26;

  if (public.be_data_entry_service_provider_route_v17('မန္တလေး')->>'provider_code') <> 'MDY BRANCH'
     or (public.be_data_entry_delivery_route_v26('မန္တလေး',10000,'Mandalay',null)->>'provider_code') <> 'MDY BRANCH' then
    raise exception 'Mandalay branch route validation failed';
  end if;
  if (public.be_data_entry_service_provider_route_v17('MDY-M01-A1')->>'provider_code') <> 'MDY BRANCH' then
    raise exception 'Mandalay explicit-area pricing route validation failed';
  end if;
  if not exists(select 1 from public.be_data_entry_service_providers where provider_code='DK DELIVERY' and provider_type='OUTSOURCE' and is_active) then
    raise exception 'DK partner was altered';
  end if;
end $cutover$;
commit;

-- Read-only post-check:
-- select provider_code, count(*) from public.be_data_entry_tariff_catalog group by 1;
-- select public.be_data_entry_delivery_route_v26('မန္တလေး', 10000, 'Mandalay', null);
-- select provider_code, provider_type from public.be_data_entry_service_providers where provider_code in ('MDY BRANCH','DK DELIVERY');
