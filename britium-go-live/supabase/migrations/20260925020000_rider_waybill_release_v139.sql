-- V139: Rider pickup claim + canonical waybill release
-- Lets authenticated Riders claim an unassigned same-branch pickup, complete
-- verification/collection, and lets Financial V2 recognize canonical collected state
-- without depending on one legacy rider_status field.

create or replace function public.be_rider_available_pickups_v139(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity jsonb;
  v_role text;
  v_branch text;
  v_rows jsonb;
begin
  v_identity := public.be_current_field_team_identity();
  v_role := lower(coalesce(v_identity->>'role',''));
  v_branch := upper(coalesce(v_identity->>'branch_code',''));

  if v_role <> 'rider' then
    raise exception 'RIDER_ROLE_REQUIRED: only an authenticated Rider can browse available pickup requests.'
      using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      p.pickup_id,
      p.merchant_name,
      p.merchant_id,
      p.pickup_address,
      p.township,
      p.branch_code,
      p.expected_parcels,
      p.verified_parcels,
      p.status,
      p.assignment_status,
      p.pickup_status,
      p.workflow_stage,
      p.created_at
    from public.be_portal_pickup_requests p
    where p.pickup_id ~ '^P[0-9]{4}-[A-Z0-9]{2,5}-[0-9]{3}$'
      and coalesce(upper(p.status),'') not in ('CANCELLED','ARCHIVED_TEST_DATA')
      and coalesce(upper(p.assignment_status),'PENDING') in ('PENDING','PENDING_ASSIGNMENT','WAITING_ASSIGNMENT','')
      and p.assigned_rider_id is null
      and nullif(btrim(coalesce(p.assigned_rider_code,'')),'') is null
      and nullif(btrim(coalesce(p.assigned_rider_email,'')),'') is null
      and (
        v_branch = ''
        or upper(coalesce(p.branch_code,p.assigned_branch,'')) = v_branch
      )
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit,50),200))
  ) x;

  return jsonb_build_object(
    'ok',true,
    'role',v_role,
    'branch_code',nullif(v_branch,''),
    'pickups',v_rows
  );
end
$function$;

revoke execute on function public.be_rider_available_pickups_v139(integer) from public, anon;
grant execute on function public.be_rider_available_pickups_v139(integer) to authenticated;

comment on function public.be_rider_available_pickups_v139(integer) is
'V139 authenticated Rider same-branch queue for unassigned pickup requests.';

create or replace function public.be_rider_claim_pickup_v139(p_pickup_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity jsonb;
  v_uid uuid;
  v_code text;
  v_email text;
  v_name text;
  v_role text;
  v_branch text;
  v_pickup_branch text;
  v_assignment_status text;
  v_current_rider uuid;
  v_current_code text;
  v_current_email text;
begin
  v_identity := public.be_current_field_team_identity();
  v_role := lower(coalesce(v_identity->>'role',''));
  if v_role <> 'rider' then
    raise exception 'RIDER_ROLE_REQUIRED: only an authenticated Rider can claim a pickup.'
      using errcode='42501';
  end if;

  v_uid := (v_identity->>'auth_user_id')::uuid;
  v_code := upper(coalesce(v_identity->>'worker_code',''));
  v_email := lower(coalesce(v_identity->>'email',''));
  v_name := coalesce(nullif(btrim(v_identity->>'display_name'),''),v_code);
  v_branch := upper(coalesce(v_identity->>'branch_code',''));

  select
    upper(coalesce(p.branch_code,p.assigned_branch,'')),
    upper(coalesce(p.assignment_status,'PENDING')),
    p.assigned_rider_id,
    upper(coalesce(p.assigned_rider_code,'')),
    lower(coalesce(p.assigned_rider_email,''))
  into
    v_pickup_branch,
    v_assignment_status,
    v_current_rider,
    v_current_code,
    v_current_email
  from public.be_portal_pickup_requests p
  where p.pickup_id = btrim(p_pickup_id)
  for update;

  if not found then
    raise exception 'PICKUP_NOT_FOUND: %', btrim(p_pickup_id) using errcode='P0002';
  end if;

  if v_current_rider = v_uid or (v_code<>'' and v_current_code=v_code) or (v_email<>'' and v_current_email=v_email) then
    return jsonb_build_object(
      'ok',true,
      'pickup_id',btrim(p_pickup_id),
      'claimed',true,
      'already_owned',true,
      'rider_status','ACCEPTED',
      'team_acceptance_status','TEAM_READY'
    );
  end if;

  if v_current_rider is not null or v_current_code<>'' or v_current_email<>'' or v_assignment_status='ASSIGNED' then
    raise exception 'PICKUP_ALREADY_ASSIGNED: % is already owned by another field worker.', btrim(p_pickup_id)
      using errcode='55000';
  end if;

  if v_branch<>'' and v_pickup_branch<>'' and v_pickup_branch<>v_branch then
    raise exception 'PICKUP_BRANCH_MISMATCH: rider branch % cannot claim pickup branch %.', v_branch, v_pickup_branch
      using errcode='42501';
  end if;

  update public.be_portal_pickup_requests
  set
    assigned_rider_id = v_uid,
    assigned_rider_code = v_code,
    assigned_rider_name = v_name,
    assigned_rider_email = nullif(v_email,''),
    assignment_status = 'ASSIGNED',
    supervisor_status = 'ASSIGNED',
    pickup_status = 'RIDER_ACCEPTED',
    workflow_stage = 'RIDER_ACCEPTED',
    rider_app_stage = 'ACCEPTED_PICKUP',
    team_acceptance_status = 'TEAM_READY',
    rider_status = 'ACCEPTED',
    rider_accepted_at = coalesce(rider_accepted_at,now()),
    assigned_at = coalesce(assigned_at,now()),
    last_event_at = now(),
    last_event_by = v_uid::text,
    last_event_note = 'Rider self-claimed available same-branch pickup in Rider App',
    updated_at = now()
  where pickup_id = btrim(p_pickup_id);

  insert into public.be_app_notifications(
    recipient_role,recipient_email,target_user_id,notification_type,title,message,
    entity_type,entity_id,pickup_id,priority,is_read,payload,created_at
  )
  values(
    'rider',nullif(v_email,''),v_uid::text,'PICKUP_SELF_CLAIMED',
    'Pickup claimed','You claimed pickup '||btrim(p_pickup_id)||'.',
    'pickup',btrim(p_pickup_id),btrim(p_pickup_id),'NORMAL',false,
    jsonb_build_object('pickup_id',btrim(p_pickup_id),'worker_code',v_code,'next_action','ARRIVE_AT_PICKUP'),
    now()
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok',true,
    'pickup_id',btrim(p_pickup_id),
    'claimed',true,
    'already_owned',false,
    'rider_status','ACCEPTED',
    'pickup_status','RIDER_ACCEPTED',
    'team_acceptance_status','TEAM_READY'
  );
end
$function$;

revoke execute on function public.be_rider_claim_pickup_v139(text) from public, anon;
grant execute on function public.be_rider_claim_pickup_v139(text) to authenticated;

comment on function public.be_rider_claim_pickup_v139(text) is
'V139 Rider-only same-branch self-claim for unassigned pickups. Identity comes from auth session; no browser-supplied Rider identity is trusted.';

-- Align the existing Financial V2 waybill gate with canonical field-team state.
-- Verification and collection remain mandatory, but either Rider or Driver may
-- be the primary worker and canonical pickup/workflow state is authoritative.
do $$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$
  if not v_os_evidence and not v_superadmin_bulkload and (nullif(v_pickup ->> 'pickup_verified_at','') is null
     or nullif(v_pickup ->> 'pickup_collected_at','') is null
     or upper(coalesce(v_pickup ->> 'rider_status','')) not in ('COLLECTED','TO_WAREHOUSE')) then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','RIDER_COLLECTION_NOT_VERIFIED','message','Pickup must be Rider-verified and collected before waybill creation.'
    )),'access',v_access);
  end if;
$old$;
  v_new text := $new$
  if not v_os_evidence and not v_superadmin_bulkload and (
       nullif(v_pickup ->> 'pickup_verified_at','') is null
       or nullif(v_pickup ->> 'pickup_collected_at','') is null
       or not (
         upper(coalesce(v_pickup ->> 'pickup_status','')) in ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED')
         or upper(coalesce(v_pickup ->> 'workflow_stage','')) in ('PICKUP_COLLECTED','TO_WAREHOUSE','WAREHOUSE_ACCEPTED')
         or upper(coalesce(v_pickup ->> 'rider_status','')) in ('COLLECTED','TO_WAREHOUSE')
         or upper(coalesce(v_pickup ->> 'driver_status','')) in ('COLLECTED','TO_WAREHOUSE')
       )
     ) then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','FIELD_COLLECTION_NOT_VERIFIED','message','Pickup must be field-team verified and collected before waybill creation. In Rider App: Verify Pickup, then Release to Data Entry.'
    )),'access',v_access);
  end if;
$new$;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_data_entry_financial_v2_create_ready_waybill'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  if v_oid is null then
    raise exception 'be_data_entry_financial_v2_create_ready_waybill(jsonb) was not found';
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'Expected legacy Rider collection gate was not found; refusing to patch an unexpected function';
  end if;

  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end
$$;

comment on function public.be_data_entry_financial_v2_create_ready_waybill(jsonb) is
'V139: pickup must still be field-team verified and collected before waybill creation, but canonical pickup/workflow state is authoritative and Driver-primary collection is supported.';
