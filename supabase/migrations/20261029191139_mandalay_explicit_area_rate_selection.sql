-- Approved Mandalay area rates are explicit destinations, never inferred polygons.
-- Source SHA256: 6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb.
-- The owner excluded အုန်းချော and delegated handling of ambiguous paired prices.
-- Keep existing township fallbacks, provider economics and persisted parcels.
do $guard$
begin
 if (select count(*) from public.tariff_master where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb' and metadata->>'owner_rate_confirmation'='CONFIRMED')<>168 then
  raise exception 'Expected 168 owner-confirmed staged Mandalay rates';
 end if;
 if exists(select 1 from public.tariff_master where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb' and township_name_mm like '%အုန်းချော%') then
  raise exception 'Excluded destination must not be activated';
 end if;
end $guard$;

update public.tariff_master set
 metadata=metadata||jsonb_build_object('manual_area_code',regexp_replace(tariff_code,'-(STD|ROY|COM)$',''),'manual_destination_label',regexp_replace(tariff_code,'-(STD|ROY|COM)$','')||' · '||(metadata->>'destination_mm')||' · '||base_delivery_fee::bigint::text||' MMK','selection_mode','EXPLICIT_AREA_RATE','automatic_geographic_matching',false,'activation_basis','Owner delegated implementation; explicit labelled selection','activated_at',now()),
 status='ACTIVE_MANUAL_SELECTION',is_active=true,effective_from=coalesce(effective_from,public.be_business_date()),updated_at=now()
where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb';

-- Only fully-qualified labels and codes resolve to these rates. No bare-name aliases.
insert into public.be_tariff_location_alias_v61_7_1(normalized_alias,alias_value,location_key,township_code,location_kind,canonical_label)
select distinct public.be_financial_v2_normalize_township_text_v61_7(v.alias),v.alias,'MDY_AREA:'||(t.metadata->>'manual_area_code'),null,'SERVICE_POINT',t.metadata->>'manual_destination_label'
from public.tariff_master t cross join lateral(values(t.metadata->>'manual_destination_label'),(t.metadata->>'manual_area_code'))v(alias)
where t.metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb'
on conflict(normalized_alias) do update set alias_value=excluded.alias_value,location_key=excluded.location_key,location_kind=excluded.location_kind,canonical_label=excluded.canonical_label,updated_at=now();

insert into public.be_data_entry_tariff_catalog(destination_key,destination_name,original_label,standard_rate_mmk,special_rate_mmk,rack_code,provider_code,is_active,source_file)
select metadata->>'manual_area_code',metadata->>'manual_destination_label',metadata->>'destination_mm',base_delivery_fee,base_delivery_fee,'MDY AREA RATE','DK DELIVERY',true,'MDY_APPROVED_MANUAL_AREAS_6487f3c1'
from public.tariff_master where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb' and customer_tier='STANDARD'
on conflict(destination_key) do update set destination_name=excluded.destination_name,original_label=excluded.original_label,standard_rate_mmk=excluded.standard_rate_mmk,special_rate_mmk=excluded.special_rate_mmk,rack_code=excluded.rack_code,provider_code=excluded.provider_code,is_active=excluded.is_active,source_file=excluded.source_file,updated_at=now();

insert into public.be_parcel_tariffs_v2(township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,note,status,effective_from)
select metadata->>'manual_destination_label',customer_tier,'Mandalay explicit area rate','MDY',base_delivery_fee,included_kg,extra_per_kg,0,0,'Explicit owner-approved area/rate choice; no inferred geographic boundary. Source tariff: '||tariff_code,'ACTIVE',effective_from
from public.tariff_master where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb'
on conflict(township,customer_tier,effective_from) do update set base_tariff=excluded.base_tariff,included_kg=excluded.included_kg,extra_per_kg=excluded.extra_per_kg,tariff_zone=excluded.tariff_zone,tariff_zone_code=excluded.tariff_zone_code,note=excluded.note,status='ACTIVE',updated_at=now();

insert into public.be_delivery_tariff_master(township_key,township,branch_code,city,region_state,customer_tier,base_fee,included_kg,extra_kg_fee,tariff_area_type,source_label,is_active,effective_from)
select 'MDY_AREA:'||(t.metadata->>'manual_area_code'),t.metadata->>'manual_destination_label','MDY','Mandalay','Mandalay Region',initcap(t.customer_tier),t.base_delivery_fee,t.included_kg,t.extra_per_kg,'EXPLICIT_AREA_RATE',t.tariff_code,true,t.effective_from
from public.tariff_master t
where t.metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb'
and not exists(select 1 from public.be_delivery_tariff_master x where x.source_label=t.tariff_code and x.tariff_area_type='EXPLICIT_AREA_RATE');

-- Preserve provider and map workflow for these explicitly configured catalogue entries.
do $patch$
declare definition text; injection text;
begin
 select pg_get_functiondef('public.be_data_entry_service_provider_route_v17(text)'::regprocedure) into definition;
 if strpos(definition,'MDY_EXPLICIT_AREA_RATE_V1')>0 then return; end if;
 injection:=$inject$
  -- MDY_EXPLICIT_AREA_RATE_V1
  select t.destination_name into v_destination_name
  from public.be_data_entry_tariff_catalog t
  join public.be_data_entry_service_providers p on p.provider_code=t.provider_code and p.is_active
  where t.is_active and t.provider_code='DK DELIVERY'
    and t.source_file='MDY_APPROVED_MANUAL_AREAS_6487f3c1'
    and (public.be_data_entry_destination_key_v17(t.destination_key)=v_key or public.be_data_entry_destination_key_v17(t.destination_name)=v_key)
  limit 1;
  if found then
    return jsonb_build_object('provider_code','DK DELIVERY','reason','MANDALAY_DK_SERVICE_AREA','destination_key',v_key,'matched_destination',v_destination_name,'selection_mode','EXPLICIT_AREA_RATE');
  end if;
$inject$;
 if strpos(definition,E'begin\n')=0 then raise exception 'Expected provider-route function structure'; end if;
 execute replace(definition,E'begin\n',E'begin\n'||injection);
end $patch$;

-- Exact approved area aliases take precedence over substring township recognition.
do $lookup_patch$
declare definition text; injection text;
begin
 select pg_get_functiondef('public.be_financial_v2_tariff_location_key_v61_7_1(text)'::regprocedure) into definition;
 if strpos(definition,'MDY_EXPLICIT_ALIAS_PRIORITY_V1')>0 then return; end if;
 injection:=$inject$
  -- MDY_EXPLICIT_ALIAS_PRIORITY_V1
  select a.location_key into v_key from public.be_tariff_location_alias_v61_7_1 a
  where a.normalized_alias=v and a.location_kind='SERVICE_POINT' and a.location_key like 'MDY_AREA:%';
  if found then return v_key; end if;
$inject$;
 definition:=replace(definition,E'\r','');
 if strpos(definition,E'begin\n')=0 then raise exception 'Expected tariff alias function structure'; end if;
 execute replace(definition,E'begin\n',E'begin\n'||injection);
end $lookup_patch$;

do $verify$
begin
 if exists(select 1 from public.tariff_master t where metadata->>'source_sha256'='6487f3c11495166cdf2849113b91db0e8dc540eaf9a17a6e312c38e32dfcbcdb'
 and public.be_approved_tariff_lookup_key(metadata->>'manual_destination_label') is distinct from 'MDY_AREA:'||(metadata->>'manual_area_code')) then
  raise exception 'Mandalay explicit rate aliases must resolve uniquely';
 end if;
end $verify$;
