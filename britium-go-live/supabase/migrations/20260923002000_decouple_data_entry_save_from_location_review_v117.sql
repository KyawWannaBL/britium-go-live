-- V117: keep Data Entry save/waybill readiness independent from pending Google location review.
-- Core-region parcels still require a receiver address. Missing/stale pins remain marked for later review.

do $migration$
declare
  v_def text;
  v_old text := $old$
  if v_map_required then
    if v_payload_address='' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_REQUIRED','field','delivery_address','message','A receiver address is required for Yangon, Mandalay, and Naypyitaw Google location validation.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    select r.address_original into v_location_address
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id
      and r.review_status='ACCEPTED'
      and upper(coalesce(r.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
      and r.latitude between 9 and 29
      and r.longitude between 92 and 102
    limit 1;
    if not found then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_NOT_SYNCED','field','delivery_address','message','Synchronize the Google drop point or Apply corrected coordinates before saving this core-region parcel.')),
        'access',v_access,'upload_access',v_upload_access,'delivery_route',v_route
      );
    end if;
    v_payload_address_key := lower(regexp_replace(v_payload_address,'[[:space:][:punct:]]+','','g'));
    v_location_address_key := lower(regexp_replace(btrim(coalesce(v_location_address,'')),'[[:space:][:punct:]]+','','g'));
    if v_payload_address_key='' or v_location_address_key<>v_payload_address_key then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_MISMATCH','field','delivery_address','message','The accepted Google pin belongs to a different address. Check or Apply coordinates for the current address.')),
        'access',v_access,'upload_access',v_upload_access,'delivery_route',v_route
      );
    end if;
  else
    v_location_address := 'MAP_NOT_REQUIRED:'||v_mode;
  end if;
$old$;
  v_new text := $new$
  if v_map_required then
    if v_payload_address='' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_REQUIRED','field','delivery_address','message','A receiver address is required for Yangon, Mandalay, and Naypyitaw Google location validation.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    select r.address_original into v_location_address
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id
      and r.review_status='ACCEPTED'
      and upper(coalesce(r.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
      and r.latitude between 9 and 29
      and r.longitude between 92 and 102
    limit 1;
    if not found then
      v_location_address := 'REVIEW_DEFERRED';
    else
      v_payload_address_key := lower(regexp_replace(v_payload_address,'[[:space:][:punct:]]+','','g'));
      v_location_address_key := lower(regexp_replace(btrim(coalesce(v_location_address,'')),'[[:space:][:punct:]]+','','g'));
      if v_payload_address_key='' or v_location_address_key<>v_payload_address_key then
        v_location_address := 'REVIEW_DEFERRED_ADDRESS_CHANGED';
      end if;
    end if;
  else
    v_location_address := 'MAP_NOT_REQUIRED:'||v_mode;
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_data_entry_financial_v2_save_legacy_v33'
  limit 1;

  if v_def is null then
    raise exception 'be_data_entry_financial_v2_save_legacy_v33 was not found';
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'Expected legacy location gate was not found; aborting V117 patch';
  end if;

  execute replace(v_def,v_old,v_new);
end
$migration$;

comment on function public.be_data_entry_financial_v2_save_legacy_v33(jsonb)
is 'V117: Data Entry save requires a valid address but no longer blocks on unresolved Google coordinates; location review remains pending for downstream correction.';
