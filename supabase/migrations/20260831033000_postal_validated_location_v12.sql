-- BRITIUM_POSTAL_VALIDATED_LOCATION_V12
-- Prevent low-precision automatic coordinates from entering live Wayplan data.

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
  v_row public.be_delivery_location_registry;
begin
  if not private.be_location_editor_allowed_v10() then
    raise exception 'Location editor permission is required.';
  end if;
  if v_id is null then raise exception 'Delivery Way ID is required.'; end if;
  if v_lat is null or v_lng is null or v_lat not between 9 and 29 or v_lng not between 92 and 102 or (v_lat = 0 and v_lng = 0) then
    raise exception 'A valid Myanmar coordinate is required.';
  end if;
  if v_match not in ('ADDRESS_EXACT','POI_EXACT','STREET_APPROXIMATE','WARD_APPROXIMATE','MANUAL') then
    raise exception 'Unsupported location precision: %', v_match;
  end if;
  if v_review not in ('ACCEPTED','MANUAL_REVIEW') then raise exception 'Unsupported review status.'; end if;
  if v_match = 'WARD_APPROXIMATE' and v_review <> 'MANUAL_REVIEW' then
    raise exception 'Ward-level coordinates require manual review and cannot be accepted automatically.';
  end if;
  if v_match = 'STREET_APPROXIMATE' and v_review = 'ACCEPTED' and v_postal_match <> 'EXACT_QUARTER' then
    raise exception 'Automatic street coordinates require an exact quarter/postal match.';
  end if;
  if v_review = 'ACCEPTED' and v_match <> 'MANUAL' and v_source not like '%POSTAL_VALIDATED%' then
    raise exception 'Automatic coordinates must pass postal validation before acceptance.';
  end if;

  insert into public.be_delivery_location_registry(
    delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,
    latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by,updated_at
  ) values (
    v_id,coalesce(p_payload->>'address_original',''),coalesce(p_payload->>'address_english',''),
    coalesce(p_payload->>'township',''),coalesce(p_payload->>'postal_code',''),v_postal_match,
    v_lat,v_lng,coalesce(p_payload->>'provider_label',''),v_match,
    coalesce(nullif(p_payload->>'confidence','')::numeric,1),v_source,v_review,auth.uid(),now()
  )
  on conflict(delivery_way_id) do update set
    address_original=excluded.address_original,address_english=excluded.address_english,
    township=excluded.township,postal_code=excluded.postal_code,
    postal_match_level=excluded.postal_match_level,latitude=excluded.latitude,
    longitude=excluded.longitude,provider_label=excluded.provider_label,
    match_level=excluded.match_level,confidence=excluded.confidence,
    coordinate_source=excluded.coordinate_source,review_status=excluded.review_status,
    updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return jsonb_build_object('ok',true,'location',to_jsonb(v_row));
end;
$$;
revoke all on function public.be_delivery_location_upsert_v11(jsonb) from public, anon;
grant execute on function public.be_delivery_location_upsert_v11(jsonb) to authenticated, service_role;
grant usage on schema private to authenticated;
revoke execute on function private.be_location_editor_allowed_v10() from public, anon;
grant execute on function private.be_location_editor_allowed_v10() to authenticated;
update public.be_delivery_location_registry
set review_status = 'MANUAL_REVIEW',
    coordinate_source = coordinate_source || '_REQUIRES_REVIEW',
    updated_at = now()
where match_level = 'WARD_APPROXIMATE'
  and review_status = 'ACCEPTED';
notify pgrst, 'reload schema';
