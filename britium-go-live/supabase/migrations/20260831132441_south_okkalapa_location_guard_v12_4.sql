-- BRITIUM SOUTH OKKALAPA POSTAL/COORDINATE GUARD v12.4
-- Canonicalize the management-verified Ward 3 address before every write.

create or replace function private.be_enforce_verified_delivery_location_v12_4()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_text text := lower(concat_ws(' ', new.address_original, new.address_english, new.provider_label, new.township));
begin
  if v_text ~ 'south[[:space:]]+okkalapa'
     and v_text ~ 'no\.?[[:space:]]*257'
     and v_text ~ '12(th)?[[:space:]]+(street|st\.?|road)'
     and v_text ~ 'ward[[:space:]]*3'
  then
    new.township := 'South Okkalapa Township';
    new.postal_code := '1109001';
    new.postal_match_level := 'EXACT_QUARTER';
    new.latitude := 16.842034331017906;
    new.longitude := 96.17161407892635;
    new.provider_label := 'No. 257, 12th Street, Ward 3, South Okkalapa Township, Yangon 1109001, Myanmar';
    new.match_level := 'ADDRESS_EXACT';
    new.confidence := 1;
    new.coordinate_source := 'MANAGEMENT_POSTAL_VALIDATED_ADDRESS';
    new.review_status := 'ACCEPTED';
  end if;
  return new;
end;
$function$;

drop trigger if exists be_enforce_verified_delivery_location_v12_4
  on public.be_delivery_location_registry;

create trigger be_enforce_verified_delivery_location_v12_4
before insert or update on public.be_delivery_location_registry
for each row execute function private.be_enforce_verified_delivery_location_v12_4();

update public.be_delivery_location_registry
set township = 'South Okkalapa Township',
    postal_code = '1109001',
    postal_match_level = 'EXACT_QUARTER',
    latitude = 16.842034331017906,
    longitude = 96.17161407892635,
    provider_label = 'No. 257, 12th Street, Ward 3, South Okkalapa Township, Yangon 1109001, Myanmar',
    match_level = 'ADDRESS_EXACT',
    confidence = 1,
    coordinate_source = 'MANAGEMENT_POSTAL_VALIDATED_ADDRESS',
    review_status = 'ACCEPTED',
    updated_at = now()
where lower(concat_ws(' ', address_original, address_english, provider_label, township)) ~ 'south[[:space:]]+okkalapa'
  and lower(concat_ws(' ', address_original, address_english, provider_label, township)) ~ 'no\.?[[:space:]]*257'
  and lower(concat_ws(' ', address_original, address_english, provider_label, township)) ~ '12(th)?[[:space:]]+(street|st\.?|road)'
  and lower(concat_ws(' ', address_original, address_english, provider_label, township)) ~ 'ward[[:space:]]*3';

revoke all on function private.be_enforce_verified_delivery_location_v12_4() from public, anon, authenticated;

