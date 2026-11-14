-- BRITIUM_SOUTH_OKKALAPA_WARD3_CORRECTION_V12_1
-- Management-confirmed postal and coordinate correction.

update public.be_delivery_location_registry
set postal_code = '1109001',
    postal_match_level = 'EXACT_QUARTER',
    updated_at = now()
where lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%south okkalapa%'
  and (
    lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%ward 3%'
    or lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%3 ward%'
  );
update public.be_delivery_location_registry
set latitude = 16.842034331017906,
    longitude = 96.17161407892635,
    provider_label = 'No. 257, 12th Street, Ward 3, South Okkalapa Township, Yangon 1109001, Myanmar',
    postal_code = '1109001',
    postal_match_level = 'EXACT_QUARTER',
    match_level = 'ADDRESS_EXACT',
    confidence = 1,
    coordinate_source = 'MANAGEMENT_POSTAL_VALIDATED_ADDRESS',
    review_status = 'ACCEPTED',
    updated_at = now()
where lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%south okkalapa%'
  and (coalesce(address_english,'') || ' ' || coalesce(address_original,'')) ~* '(^|[^0-9])257([^0-9]|$)'
  and (coalesce(address_english,'') || ' ' || coalesce(address_original,'')) ~* '(^|[^0-9])12(th)?[[:space:]]*(street|road)([^a-z]|$)'
  and (
    lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%ward 3%'
    or lower(coalesce(address_english,'') || ' ' || coalesce(address_original,'')) like '%3 ward%'
  );
notify pgrst, 'reload schema';
