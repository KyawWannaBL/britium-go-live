
create or replace function public.be_rider_dropoff_pin_v147(
  p_delivery_way_id text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','auth','private','pg_temp'
as $function$
declare
  v_way text := upper(btrim(coalesce(p_delivery_way_id,'')));
  v_role text := lower(public.be_current_user_role());
  v_identity jsonb;
  v_worker text;
  v_allowed boolean := false;
  v_stop record;
  v_old record;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication is required.';
  end if;
  if v_way = '' then
    raise exception 'Delivery Way ID is required.';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between 9 and 29
     or p_longitude not between 92 and 102 then
    raise exception 'Pin must be inside the supported Myanmar coordinate bounds.';
  end if;

  if v_role in ('superadmin','super_admin','admin','dispatch','wayplan_operator','wayplan-manager','supervisor','operations','operations_admin','operations-admin','management','director') then
    v_allowed := true;
  elsif v_role in ('rider','driver') then
    v_identity := private.be_field_primary_context_v101();
    v_worker := upper(coalesce(v_identity->>'worker_code',''));
    select exists(
      select 1
      from public.be_wayplan_dispatches d
      join public.be_wayplan_dispatch_stops s on s.wayplan_id=d.wayplan_id
      where upper(s.delivery_way_id)=v_way
        and upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
        and (
          (v_role='rider' and upper(coalesce(d.rider_code,''))=v_worker)
          or
          (v_role='driver' and upper(coalesce(d.driver_code,''))=v_worker)
        )
    ) into v_allowed;
  end if;

  if not coalesce(v_allowed,false) then
    raise exception using errcode='42501', message='Drop-off pin update is not permitted for this parcel.';
  end if;

  select s.delivery_way_id, s.address, s.township
    into v_stop
  from public.be_wayplan_dispatch_stops s
  where upper(s.delivery_way_id)=v_way
  order by s.updated_at desc nulls last
  limit 1;

  if v_stop.delivery_way_id is null then
    raise exception 'Delivery stop was not found for %', v_way;
  end if;

  select r.latitude, r.longitude
    into v_old
  from public.be_delivery_location_registry r
  where upper(r.delivery_way_id)=v_way
  limit 1;

  insert into public.be_delivery_location_registry(
    delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,
    latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by
  )
  values(
    v_way,coalesce(v_stop.address,''),'',coalesce(v_stop.township,''),'','UNRESOLVED',
    p_latitude,p_longitude,'RIDER_DROPOFF_PIN','MANUAL',
    case when p_accuracy_m is null or p_accuracy_m <= 15 then 1
         when p_accuracy_m <= 30 then .95
         when p_accuracy_m <= 60 then .85
         else .75 end,
    'RIDER_MANUAL_PIN','ACCEPTED',auth.uid()
  )
  on conflict(delivery_way_id) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    provider_label='RIDER_DROPOFF_PIN',
    match_level='MANUAL',
    confidence=excluded.confidence,
    coordinate_source='RIDER_MANUAL_PIN',
    review_status='ACCEPTED',
    updated_by=auth.uid(),
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'delivery_way_id',v_way,
    'latitude',p_latitude,
    'longitude',p_longitude,
    'accuracy_m',p_accuracy_m,
    'old_latitude',v_old.latitude,
    'old_longitude',v_old.longitude,
    'route_recalculation_required',true,
    'build','RIDER_DROPOFF_PIN_V147'
  );
end;
$function$;

revoke all on function public.be_rider_dropoff_pin_v147(text,numeric,numeric,numeric) from public;
revoke all on function public.be_rider_dropoff_pin_v147(text,numeric,numeric,numeric) from anon;
grant execute on function public.be_rider_dropoff_pin_v147(text,numeric,numeric,numeric) to authenticated;
grant execute on function public.be_rider_dropoff_pin_v147(text,numeric,numeric,numeric) to service_role;
