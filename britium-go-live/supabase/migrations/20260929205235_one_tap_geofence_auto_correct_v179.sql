
do $$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_arrive_customer_v77'
  limit 1;

  f := replace(
    f,
    '    if v_override_id is null then
      raise exception ''GEOFENCE_OUTSIDE_RADIUS|distance_m=%|radius_m=%|supervisor_override_required=true'',
        round(v_distance),round(v_radius) using errcode=''22023'';
    end if;',
    '    if v_override_id is null then
      update public.be_delivery_location_registry
      set latitude=p_latitude,
          longitude=p_longitude,
          provider_label=''FIELD_AUTO_CORRECTED'',
          match_level=''MANUAL'',
          coordinate_source=''FIELD_AUTO_CORRECTED'',
          review_status=''ACCEPTED'',
          updated_by=auth.uid(),
          updated_at=now()
      where upper(delivery_way_id)=v_way;

      v_location_source:=''FIELD_AUTO_CORRECTED'';
      v_location_review:=''ACCEPTED'';
      v_location_match:=''MANUAL'';
      v_distance:=0;
      v_geo_verified:=true;
    end if;'
  );

  execute f;
end $$;
