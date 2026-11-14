begin;

-- V18 aligns the location-registry acceptance boundary with the current
-- Google-only resolver. Exact Google address/POI results are already checked
-- against the requested township twice in the browser: administrative boundary
-- containment plus an independent reverse-geocode. The previous RPC rejected
-- those exact results unless Google's label also repeated the internal postal
-- quarter, leaving large OS imports permanently stuck at LOCATION REVIEW.
-- Approximate results remain review-only and manual corrections still require
-- an explicit Apply coordinates action.
create or replace function public.be_delivery_location_upsert_v11(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(trim(p_payload->>'delivery_way_id'), '');
  v_lat numeric := nullif(p_payload->>'latitude', '')::numeric;
  v_lng numeric := nullif(p_payload->>'longitude', '')::numeric;
  v_match text := upper(coalesce(nullif(trim(p_payload->>'match_level'), ''), 'MANUAL'));
  v_review text := upper(coalesce(nullif(trim(p_payload->>'review_status'), ''), 'ACCEPTED'));
  v_postal_match text := upper(coalesce(nullif(trim(p_payload->>'postal_match_level'), ''), 'UNRESOLVED'));
  v_source text := upper(coalesce(p_payload->>'coordinate_source', 'DATA_ENTRY_MANUAL_COORDINATE'));
  v_confidence numeric := coalesce(nullif(p_payload->>'confidence', '')::numeric, 0);
  v_address text := btrim(coalesce(p_payload->>'address_original', ''));
  v_township text := btrim(coalesce(p_payload->>'township', ''));
  v_trusted_google_exact boolean :=
    v_match in ('ADDRESS_EXACT','POI_EXACT')
    and v_confidence >= 0.95
    and v_address <> ''
    and v_township <> ''
    and v_source ~ '^GOOGLE_(PLACES|GEOCODING)_TOWNSHIP(_EXACT)?_VALIDATED_(ADDRESS_EXACT|POI_EXACT)$'
    and v_source like '%' || v_match;
  v_row public.be_delivery_location_registry;
begin
  if not private.be_location_editor_allowed_v10() then
    raise exception 'Location editor permission is required.';
  end if;
  if v_id is null then
    raise exception 'Delivery Way ID is required.';
  end if;
  if v_lat is null or v_lng is null
     or v_lat not between 9 and 29
     or v_lng not between 92 and 102
     or (v_lat = 0 and v_lng = 0) then
    raise exception 'A valid Myanmar coordinate is required.';
  end if;
  if v_match not in ('ADDRESS_EXACT','POI_EXACT','STREET_APPROXIMATE','WARD_APPROXIMATE','MANUAL') then
    raise exception 'Unsupported location precision: %', v_match;
  end if;
  if v_review not in ('ACCEPTED','MANUAL_REVIEW') then
    raise exception 'Unsupported review status.';
  end if;
  if v_match = 'WARD_APPROXIMATE' and v_review <> 'MANUAL_REVIEW' then
    raise exception 'Ward-level coordinates require manual review and cannot be accepted automatically.';
  end if;
  if v_match = 'STREET_APPROXIMATE' and v_review = 'ACCEPTED' and v_postal_match <> 'EXACT_QUARTER' then
    raise exception 'Automatic street coordinates require an exact quarter/postal match.';
  end if;
  if v_review = 'ACCEPTED'
     and v_match <> 'MANUAL'
     and v_source not like '%POSTAL_VALIDATED%'
     and not v_trusted_google_exact then
    raise exception 'Automatic coordinates must pass postal validation or the exact Google township validation contract before acceptance.';
  end if;

  insert into public.be_delivery_location_registry(
    delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,
    latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by,updated_at
  ) values (
    v_id,v_address,coalesce(p_payload->>'address_english',''),v_township,
    coalesce(p_payload->>'postal_code',''),v_postal_match,v_lat,v_lng,
    coalesce(p_payload->>'provider_label',''),v_match,v_confidence,v_source,v_review,auth.uid(),now()
  )
  on conflict(delivery_way_id) do update set
    address_original=excluded.address_original,
    address_english=excluded.address_english,
    township=excluded.township,
    postal_code=excluded.postal_code,
    postal_match_level=excluded.postal_match_level,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    provider_label=excluded.provider_label,
    match_level=excluded.match_level,
    confidence=excluded.confidence,
    coordinate_source=excluded.coordinate_source,
    review_status=excluded.review_status,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'build','DATA_ENTRY_GOOGLE_LOCATION_CONTRACT_V18_20260903',
    'location',to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.be_delivery_location_upsert_v11(jsonb) from public, anon;
grant execute on function public.be_delivery_location_upsert_v11(jsonb) to authenticated, service_role;

comment on function public.be_delivery_location_upsert_v11(jsonb) is
  'V18: accepts postal-validated automatic pins or high-confidence exact Google pins with explicit township-boundary/reverse-geocode lineage; approximate pins remain review-only.';

notify pgrst, 'reload schema';

commit;
