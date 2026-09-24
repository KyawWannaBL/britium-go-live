-- V140: reliable Rider/Driver verification finalization and Data Entry release
-- Root cause addressed:
-- 1) helper-uploaded evidence could exist while the assigned Rider/Driver had no one-tap finalization path;
-- 2) canonical pickup state advanced, but role-specific rider_status/driver_status could remain stale;
-- 3) Data Entry therefore kept surfacing the field-team verified/collected blocker.

create or replace function public.be_field_team_verify_and_release_v140(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_role text := lower(coalesce(v_identity->>'role',''));
  v_worker_code text := upper(coalesce(v_identity->>'worker_code',''));
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id')),'');
  v_mobile_status text;
  v_verify jsonb;
  v_collect jsonb;
  v_verified_at timestamptz;
  v_collected_at timestamptz;
  v_verified integer;
  v_expected integer;
  v_data_entry_status text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;

  if v_role not in ('rider','driver') then
    return jsonb_build_object(
      'ok',false,
      'error','PRIMARY_FIELD_WORKER_REQUIRED',
      'message','Helper evidence is welcome, but only the assigned Rider or Driver can verify and release a pickup to Data Entry.'
    );
  end if;

  if v_pickup_id is null then
    return jsonb_build_object('ok',false,'error','PICKUP_ID_REQUIRED');
  end if;

  perform public.be_field_team_assert_assigned_pickup(v_pickup_id);

  select public.be_field_team_mobile_pickup_status(
           p.pickup_status,
           p.workflow_stage,
           p.rider_app_stage,
           p.warehouse_status,
           case v_role when 'driver' then p.driver_status else p.rider_status end
         )
  into v_mobile_status
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;

  if v_mobile_status in ('WAITING_ACCEPTANCE','ASSIGNED','NOT_ASSIGNED') then
    return jsonb_build_object(
      'ok',false,
      'error','FIELD_ASSIGNMENT_NOT_ACCEPTED',
      'message','Accept the pickup assignment first.'
    );
  end if;

  if v_mobile_status='ACCEPTED' then
    return jsonb_build_object(
      'ok',false,
      'error','FIELD_WORKER_NOT_AT_PICKUP',
      'message','Tap Arrived at Pickup before verification and release.'
    );
  end if;

  if v_mobile_status in ('ARRIVED_AT_PICKUP','PICKUP_VERIFIED') then
    if v_mobile_status='ARRIVED_AT_PICKUP' then
      v_verify := public.be_field_team_submit_partial_pickup_verification(
        coalesce(p_payload,'{}'::jsonb)
        || jsonb_build_object(
          'pickup_id',v_pickup_id,
          'pickup_way_id',v_pickup_id,
          'authenticated_worker_code',v_worker_code,
          'authenticated_worker_role',v_role
        )
      );

      if coalesce((v_verify->>'pickup_verified')::boolean,false)=false then
        return jsonb_build_object(
          'ok',false,
          'error','PICKUP_VERIFICATION_INCOMPLETE',
          'message',coalesce(v_verify->>'message','Complete all required parcel weights and clear pickup photos before release.'),
          'submitted_count',coalesce((v_verify->>'submitted_count')::integer,0),
          'expected_count',coalesce((v_verify->>'expected_count')::integer,0),
          'verification',v_verify
        );
      end if;
    end if;

    update public.be_portal_pickup_requests p
    set
      driver_status = case when v_role='driver' then 'VERIFIED' else p.driver_status end,
      rider_status = case when v_role='rider' then 'VERIFIED' else p.rider_status end,
      last_event_at=now(),
      last_event_by=auth.uid()::text,
      last_event_note=upper(v_role)||' synchronized primary-worker VERIFIED status before Data Entry release',
      updated_at=now()
    where p.pickup_id=v_pickup_id;

    v_collect := public.be_field_team_pickup_action(
      coalesce(p_payload,'{}'::jsonb)
      || jsonb_build_object(
        'pickup_id',v_pickup_id,
        'pickup_way_id',v_pickup_id,
        'action','collect',
        'source_action','PICKUP_COLLECTED',
        'remark',coalesce(nullif(btrim(p_payload->>'remark'),''),'Verified pickup released to Data Entry'),
        'remarks',coalesce(nullif(btrim(p_payload->>'remarks'),''),'Verified pickup released to Data Entry')
      )
    );

    if coalesce((v_collect->>'ok')::boolean,false)=false then
      return v_collect;
    end if;
  elsif v_mobile_status not in ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then
    return jsonb_build_object(
      'ok',false,
      'error','PICKUP_NOT_READY_FOR_RELEASE',
      'mobile_status',v_mobile_status,
      'message','Pickup is not ready for Data Entry release. Complete arrival and verification first.'
    );
  end if;

  update public.be_portal_pickup_requests p
  set
    driver_status = case when v_role='driver' then 'COLLECTED' else p.driver_status end,
    rider_status = case when v_role='rider' then 'COLLECTED' else p.rider_status end,
    data_entry_status='READY_FOR_DATA_ENTRY',
    last_event_at=now(),
    last_event_by=auth.uid()::text,
    last_event_note=upper(v_role)||' released verified and collected pickup to Data Entry',
    updated_at=now()
  where p.pickup_id=v_pickup_id;

  select p.pickup_verified_at,p.pickup_collected_at,p.verified_parcels,p.expected_parcels,p.data_entry_status
  into v_verified_at,v_collected_at,v_verified,v_expected,v_data_entry_status
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id;

  if v_verified_at is null or v_collected_at is null then
    return jsonb_build_object(
      'ok',false,
      'error','FIELD_RELEASE_INTEGRITY_ERROR',
      'message','Pickup release did not produce both canonical verification and collection timestamps.',
      'pickup_verified_at',v_verified_at,
      'pickup_collected_at',v_collected_at
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'pickup_id',v_pickup_id,
    'role',upper(v_role),
    'worker_code',v_worker_code,
    'pickup_verified_at',v_verified_at,
    'pickup_collected_at',v_collected_at,
    'verified_parcels',v_verified,
    'expected_parcels',v_expected,
    'data_entry_status',v_data_entry_status,
    'mobile_status','PICKUP_COLLECTED',
    'waybill_ready',true,
    'message','Pickup verified and collected. Released to Data Entry; waybill generation is unlocked.'
  );
end
$function$;

revoke execute on function public.be_field_team_verify_and_release_v140(jsonb) from public, anon;
grant execute on function public.be_field_team_verify_and_release_v140(jsonb) to authenticated;

comment on function public.be_field_team_verify_and_release_v140(jsonb) is
'V140 authenticated assigned Rider/Driver finalizer. Reuses authoritative pickup verification and collection, synchronizes role status, and releases pickup to Data Entry only when pickup_verified_at and pickup_collected_at both exist.';

-- Keep legacy action paths semantically synchronized as well.
-- This prevents future screens or integrations from seeing stale primary-worker statuses.
do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid,pg_get_functiondef(p.oid)
  into v_oid,v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_field_team_submit_partial_pickup_verification'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  if v_oid is null then
    raise exception 'be_field_team_submit_partial_pickup_verification(jsonb) not found';
  end if;

  v_old := 'rider_status=case when v_role=''rider'' then ''VERIFIED'' else p.rider_status end,pickup_verified_at=now()';
  v_new := 'rider_status=case when v_role=''rider'' then ''VERIFIED'' else p.rider_status end,driver_status=case when v_role=''driver'' then ''VERIFIED'' else p.driver_status end,pickup_verified_at=now()';

  if position(v_old in v_def)=0 then
    raise exception 'Expected V140 verification synchronization patch point not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$$;

do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid,pg_get_functiondef(p.oid)
  into v_oid,v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_field_team_pickup_action'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  if v_oid is null then
    raise exception 'be_field_team_pickup_action(jsonb) not found';
  end if;

  v_old := 'set pickup_status=''PICKUP_COLLECTED'',workflow_stage=''PICKUP_COLLECTED'',rider_app_stage=''COLLECTED_PICKUP'',pickup_collected_at=coalesce(p.pickup_collected_at,now()),data_entry_status=''READY_FOR_DATA_ENTRY''';
  v_new := 'set pickup_status=''PICKUP_COLLECTED'',workflow_stage=''PICKUP_COLLECTED'',rider_app_stage=''COLLECTED_PICKUP'',rider_status=case when v_role=''rider'' then ''COLLECTED'' else p.rider_status end,driver_status=case when v_role=''driver'' then ''COLLECTED'' else p.driver_status end,pickup_collected_at=coalesce(p.pickup_collected_at,now()),data_entry_status=''READY_FOR_DATA_ENTRY''';

  if position(v_old in v_def)=0 then
    raise exception 'Expected V140 collection synchronization patch point not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$$;
