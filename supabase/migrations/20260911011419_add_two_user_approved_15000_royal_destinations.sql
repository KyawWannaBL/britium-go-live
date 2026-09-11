
-- Only the two destinations explicitly approved by the user. Inspection found no existing tariff/catalog rows for either.
-- Preserve all existing aliases and rates; add only missing exact-name mappings.
do $$
declare f text;
begin
 select pg_get_functiondef('public.be_approved_tariff_lookup_key(text)'::regprocedure) into f;
 f:=replace(f,'matched:=', E'if k in (''monghsu'',''မိုင်းရှူး'') then return ''MMR014017''; end if;\nif k in (''pinlon'',''ပင်လုံ'') then return ''APPROVED:ပင်လုံ''; end if;\nmatched:=');
 execute f;
end $$;
insert into public.be_data_entry_tariff_catalog(destination_key,destination_name,original_label,standard_rate_mmk,special_rate_mmk,rack_code,provider_code,is_active,source_file,updated_at)
values ('မိုင်းရှူး','မိုင်းရှူး (Royal)','Royal Express · မိုင်းရှူး',15000,null,'R','ROYAL EXPRESS',true,'User-approved 15000 MMK 2026-09-11',now()),
('ပင်လုံ','ပင်လုံ (Royal)','Royal Express · ပင်လုံ',15000,null,'R','ROYAL EXPRESS',true,'User-approved 15000 MMK 2026-09-11',now());
insert into public.be_parcel_tariffs_v2(township,customer_tier,base_tariff,included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,tariff_zone,tariff_zone_code,status,effective_from,note)
values ('မိုင်းရှူး (Royal)','STANDARD',15000,3,500,0,0,'ROYAL','ROYAL','ACTIVE',current_date,'User-approved Mong Hsu 15000 MMK'),
('ပင်လုံ (Royal)','STANDARD',15000,3,500,0,0,'ROYAL','ROYAL','ACTIVE',current_date,'User-approved Pinlon 15000 MMK');