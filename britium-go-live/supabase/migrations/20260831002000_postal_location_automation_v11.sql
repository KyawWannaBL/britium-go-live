-- BRITIUM_AUTOMATIC_POSTAL_MAP_WORKFLOW_V11
alter table public.be_delivery_location_registry add column if not exists postal_code text not null default '', add column if not exists postal_match_level text not null default 'UNRESOLVED';
alter table public.be_delivery_location_registry drop constraint if exists be_delivery_location_postal_match_ck;
alter table public.be_delivery_location_registry add constraint be_delivery_location_postal_match_ck check (postal_match_level in ('EXACT_QUARTER','TOWNSHIP_ONLY','UNRESOLVED'));
create or replace function public.be_delivery_location_upsert_v11(p_payload jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id text:=nullif(trim(p_payload->>'delivery_way_id'),'');v_lat numeric:=nullif(p_payload->>'latitude','')::numeric;v_lng numeric:=nullif(p_payload->>'longitude','')::numeric;v_match text:=upper(coalesce(nullif(trim(p_payload->>'match_level'),''),'MANUAL'));v_review text:=upper(coalesce(nullif(trim(p_payload->>'review_status'),''),'ACCEPTED'));v_row public.be_delivery_location_registry;
begin
 if not private.be_location_editor_allowed_v10() then raise exception 'Location editor permission is required.';end if;
 if v_id is null then raise exception 'Delivery Way ID is required.';end if;
 if v_lat is null or v_lng is null or v_lat not between 9 and 29 or v_lng not between 92 and 102 or(v_lat=0 and v_lng=0)then raise exception 'A valid Myanmar coordinate is required.';end if;
 if v_match not in('ADDRESS_EXACT','POI_EXACT','STREET_APPROXIMATE','WARD_APPROXIMATE','MANUAL')then raise exception 'Unsupported location precision: %',v_match;end if;
 if v_review not in('ACCEPTED','MANUAL_REVIEW')then raise exception 'Unsupported review status.';end if;
 insert into public.be_delivery_location_registry(delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by,updated_at)
 values(v_id,coalesce(p_payload->>'address_original',''),coalesce(p_payload->>'address_english',''),coalesce(p_payload->>'township',''),coalesce(p_payload->>'postal_code',''),coalesce(nullif(p_payload->>'postal_match_level',''),'UNRESOLVED'),v_lat,v_lng,coalesce(p_payload->>'provider_label',''),v_match,coalesce(nullif(p_payload->>'confidence','')::numeric,1),coalesce(p_payload->>'coordinate_source','DATA_ENTRY_MANUAL_COORDINATE'),v_review,auth.uid(),now())
 on conflict(delivery_way_id)do update set address_original=excluded.address_original,address_english=excluded.address_english,township=excluded.township,postal_code=excluded.postal_code,postal_match_level=excluded.postal_match_level,latitude=excluded.latitude,longitude=excluded.longitude,provider_label=excluded.provider_label,match_level=excluded.match_level,confidence=excluded.confidence,coordinate_source=excluded.coordinate_source,review_status=excluded.review_status,updated_by=auth.uid(),updated_at=now() returning * into v_row;
 return jsonb_build_object('ok',true,'location',to_jsonb(v_row));
end;$$;
revoke all on function public.be_delivery_location_upsert_v11(jsonb) from public,anon;grant execute on function public.be_delivery_location_upsert_v11(jsonb) to authenticated;
create index if not exists be_delivery_location_manual_review_v11_idx on public.be_delivery_location_registry(updated_at desc)where review_status='MANUAL_REVIEW';
comment on column public.be_delivery_location_registry.postal_code is 'Seven-digit Myanmar quarter/village-tract postcode when an exact published match exists.';
