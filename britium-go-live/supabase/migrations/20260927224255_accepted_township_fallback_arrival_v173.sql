do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_arrive_customer_v77'
  limit 1;

  v_def := replace(
    v_def,
    '  v_geo_verified boolean:=false;',
    '  v_geo_verified boolean:=false;
  v_location_source text;
  v_location_review text;
  v_location_match text;
  v_fallback_accepted boolean:=false;'
  );

  v_def := replace(
    v_def,
    '  v_distance:=public.be_rider_distance_m_v46(p_latitude,p_longitude,v_stop_lat,v_stop_lng);

  if v_distance is null then raise exception ''DESTINATION_COORDINATES_REQUIRED'' using errcode=''22023''; end if;
  v_geo_verified:=v_distance<=v_radius;

  if not v_geo_verified then',
    '  v_distance:=public.be_rider_distance_m_v46(p_latitude,p_longitude,v_stop_lat,v_stop_lng);

  select upper(coalesce(loc.coordinate_source,'''')),
         upper(coalesce(loc.review_status,'''')),
         upper(coalesce(loc.match_level,''''))
    into v_location_source,v_location_review,v_location_match
  from public.be_delivery_location_registry loc
  where upper(loc.delivery_way_id)=v_way
  limit 1;

  v_fallback_accepted :=
    v_location_review=''ACCEPTED''
    and (
      v_location_match=''TOWNSHIP_DEFAULT''
      or v_location_source in (''TOWNSHIP_DEFAULT_V136'',''TOWNSHIP_DEFAULT_RETRY_V168'')
    );

  if v_distance is null and not v_fallback_accepted then
    raise exception ''DESTINATION_COORDINATES_REQUIRED'' using errcode=''22023'';
  end if;

  v_geo_verified := case
    when v_fallback_accepted then true
    else coalesce(v_distance<=v_radius,false)
  end;

  if not v_geo_verified then'
  );

  v_def := replace(
    v_def,
    '''geo_verified'',v_geo_verified,''verification_radius_m'',v_radius,
      ''override_id'',v_override_id,''source'',''V77_1_VERSIONED_STOP''',
    '''geo_verified'',v_geo_verified,''verification_radius_m'',v_radius,
      ''location_source'',v_location_source,''location_review'',v_location_review,
      ''location_match'',v_location_match,''township_fallback_accepted'',v_fallback_accepted,
      ''override_id'',v_override_id,''source'',''V173_ACCEPTED_TOWNSHIP_FALLBACK'''
  );

  v_def := replace(
    v_def,
    '''inside_geofence'',v_geo_verified,''geo_verified'',v_geo_verified,
    ''override_used'',v_override_id is not null,''override_id'',v_override_id,
    ''build'',''RIDER_ARRIVE_CUSTOMER_V77_1''',
    '''inside_geofence'',case when v_fallback_accepted then null else v_geo_verified end,
    ''geo_verified'',v_geo_verified,
    ''township_fallback_accepted'',v_fallback_accepted,
    ''location_source'',v_location_source,
    ''location_review'',v_location_review,
    ''location_match'',v_location_match,
    ''override_used'',v_override_id is not null,''override_id'',v_override_id,
    ''build'',''RIDER_ARRIVE_CUSTOMER_V173'''
  );

  execute v_def;
end $$;