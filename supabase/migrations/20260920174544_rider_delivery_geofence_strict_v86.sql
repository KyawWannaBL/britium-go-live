-- V86: make the legacy Rider delivery RPC honor canonical V77 route/geofence controls.
create or replace function public.be_rider_wayplan_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_role text:=lower(v_identity->>'role');
  v_action text:=lower(coalesce(p_payload->>'action',''));
  v_wayplan text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery text:=nullif(upper(btrim(p_payload->>'delivery_way_id')),'');
  v_lat text:=coalesce(nullif(btrim(p_payload->>'latitude'),''),nullif(btrim(p_payload->>'gps_lat'),''));
  v_lng text:=coalesce(nullif(btrim(p_payload->>'longitude'),''),nullif(btrim(p_payload->>'gps_lng'),''));
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;
  if v_role not in ('rider','driver','helper') then
    return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED');
  end if;
  if v_wayplan is null or v_delivery is null then
    return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required');
  end if;

  if v_role='helper' and v_action in ('deliver','delivered','complete','complete_delivery','start_delivery','out_for_delivery','arrived','arrive_customer') then
    return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only the assigned rider or driver can perform this delivery action.');
  end if;

  if v_action in ('start_delivery','out_for_delivery') then
    return public.be_field_team_delivery_action_v77(
      p_payload || jsonb_build_object(
        'action','start_delivery',
        'wayplan_id',v_wayplan,
        'delivery_way_id',v_delivery
      )
    );
  end if;

  if v_action in ('arrived','arrive_customer','arrived_at_customer') then
    if v_lat is null or v_lng is null then
      return jsonb_build_object('ok',false,'error','GPS_REQUIRED_FOR_CUSTOMER_ARRIVAL');
    end if;
    return public.be_field_team_delivery_action_v77(
      p_payload || jsonb_build_object(
        'action','arrive_customer',
        'wayplan_id',v_wayplan,
        'delivery_way_id',v_delivery,
        'latitude',v_lat,
        'longitude',v_lng
      )
    );
  end if;

  if v_action in ('failed','exception','delivery_failed') then
    return public.be_field_team_delivery_action_v77(
      p_payload || jsonb_build_object(
        'action','exception',
        'wayplan_id',v_wayplan,
        'delivery_way_id',v_delivery,
        'exception_reason',coalesce(nullif(p_payload->>'failed_reason',''),nullif(p_payload->>'exception_reason',''),nullif(p_payload->>'reason',''),nullif(p_payload->>'remark',''))
      )
    );
  end if;

  if v_action='deliver' then
    if not exists(
      select 1
      from public.be_rider_route_stop_state_v46 rs
      where rs.wayplan_id=v_wayplan
        and upper(rs.delivery_way_id)=v_delivery
        and rs.stop_status='ARRIVED'
        and (
          coalesce(rs.geo_verified,false)
          or exists(
            select 1 from public.be_rider_geofence_overrides_v50 o
            where o.wayplan_id=v_wayplan
              and upper(o.delivery_way_id)=v_delivery
              and o.used_at is not null
          )
        )
    ) then
      return jsonb_build_object('ok',false,'error','ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERED');
    end if;
  end if;

  v_result:=public.be_rider_wayplan_action_primary_guard_legacy_v101(
    p_payload || jsonb_build_object(
      'authenticated_worker_code',v_identity->>'worker_code',
      'authenticated_worker_role',v_role
    )
  );
  return v_result;
end;
$$;

revoke all on function public.be_rider_wayplan_action(jsonb) from public,anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;
