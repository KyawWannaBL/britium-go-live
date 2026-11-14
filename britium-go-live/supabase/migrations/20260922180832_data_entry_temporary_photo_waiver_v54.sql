-- V54: temporary auditable Data Entry photo-verification waiver.
-- Intended for short-term operations when no order picker is available.
-- Does not remove the normal photo workflow and can be explicitly cleared.

create or replace function public.be_data_entry_photo_waiver_v54(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_action text := upper(btrim(coalesce(v_payload->>'action','')));
  v_pickup_id text := nullif(btrim(v_payload->>'pickup_id'),'');
  v_sequence integer := case
    when coalesce(v_payload->>'parcel_sequence','') ~ '^[1-9][0-9]*$'
      then (v_payload->>'parcel_sequence')::integer
    else null
  end;
  v_delivery_way_id text := nullif(btrim(v_payload->>'delivery_way_id'),'');
  v_reason text := nullif(btrim(v_payload->>'reason'),'');
  v_access jsonb;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_existing public.be_pickup_parcel_verifications%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_access := public.be_data_entry_require_access_v57('create',false);
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  else
    v_actor_id := auth.uid();
  end if;
  v_actor_email := coalesce(nullif(lower(btrim(v_access->>'actor_email')),''), lower(auth.jwt()->>'email'));
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  if v_action not in ('WAIVE','CLEAR') then
    return jsonb_build_object('ok',false,'error','action must be WAIVE or CLEAR');
  end if;
  if v_pickup_id is null or v_sequence is null then
    return jsonb_build_object('ok',false,'error','pickup_id and parcel_sequence are required');
  end if;
  if v_action='WAIVE' and (v_reason is null or length(v_reason)<10) then
    return jsonb_build_object('ok',false,'error','A clear temporary-waiver reason of at least 10 characters is required');
  end if;

  if not exists (
    select 1 from public.be_portal_pickup_requests p
    where coalesce(p.pickup_id,p.pickup_way_id)=v_pickup_id
  ) then
    return jsonb_build_object('ok',false,'error','Pickup not found');
  end if;

  v_delivery_way_id := coalesce(v_delivery_way_id, v_pickup_id||'-'||lpad(v_sequence::text,3,'0'));

  select *
  into v_existing
  from public.be_pickup_parcel_verifications
  where pickup_id=v_pickup_id and parcel_sequence=v_sequence
  for update;

  if v_action='WAIVE' then
    if found then
      update public.be_pickup_parcel_verifications
      set
        verification_status='TEMPORARY_PHOTO_WAIVER',
        proof_check_status='APPROVED',
        reviewed_by=coalesce(v_actor_id::text,auth.uid()::text),
        reviewed_by_email=v_actor_email,
        reviewed_at=now(),
        review_note='TEMPORARY PHOTO WAIVER: '||v_reason,
        raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
          'temporary_photo_waiver',true,
          'temporary_photo_waiver_reason',v_reason,
          'temporary_photo_waiver_at',now(),
          'temporary_photo_waiver_by',v_actor_email
        ),
        updated_at=now()
      where pickup_id=v_pickup_id and parcel_sequence=v_sequence;
    else
      insert into public.be_pickup_parcel_verifications(
        pickup_id,pickup_way_id,parcel_sequence,delivery_way_id,status,
        verification_status,proof_check_status,reviewed_by,reviewed_by_email,
        reviewed_at,review_note,raw_payload,created_at,updated_at
      ) values (
        v_pickup_id,v_pickup_id,v_sequence,v_delivery_way_id,'PENDING',
        'TEMPORARY_PHOTO_WAIVER','APPROVED',coalesce(v_actor_id::text,auth.uid()::text),v_actor_email,
        now(),'TEMPORARY PHOTO WAIVER: '||v_reason,
        jsonb_build_object(
          'temporary_photo_waiver',true,
          'temporary_photo_waiver_reason',v_reason,
          'temporary_photo_waiver_at',now(),
          'temporary_photo_waiver_by',v_actor_email
        ),now(),now()
      );
    end if;
    v_status := 'TEMPORARY_WAIVER';
  else
    if not found then
      return jsonb_build_object('ok',true,'action','CLEAR','pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'review_status','PENDING_REVIEW','message','No temporary waiver existed.');
    end if;

    update public.be_pickup_parcel_verifications
    set
      verification_status=case
        when nullif(btrim(coalesce(proof_photo_url,proof_photo_path,proof_photo_data)), '') is not null then 'RIDER_VERIFIED'
        else 'PENDING'
      end,
      proof_check_status='PENDING_REVIEW',
      reviewed_by=null,
      reviewed_by_email=null,
      reviewed_at=null,
      review_note='Temporary photo waiver cleared; normal photo verification restored.',
      raw_payload=(coalesce(raw_payload,'{}'::jsonb)
        - 'temporary_photo_waiver'
        - 'temporary_photo_waiver_reason'
        - 'temporary_photo_waiver_at'
        - 'temporary_photo_waiver_by'),
      updated_at=now()
    where pickup_id=v_pickup_id and parcel_sequence=v_sequence;
    v_status := 'PENDING_REVIEW';
  end if;

  update public.be_portal_pickup_requests p
  set
    pending_photo_count=(
      select count(*) from public.be_pickup_parcel_verifications x
      where x.pickup_id=v_pickup_id
        and upper(coalesce(x.proof_check_status,'')) in ('PENDING','PENDING_REVIEW','RIDER_SUBMITTED')
    ),
    updated_at=now()
  where coalesce(p.pickup_id,p.pickup_way_id)=v_pickup_id;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    v_actor_id,v_actor_email,v_actor_role,
    case when v_action='WAIVE' then 'DATA_ENTRY_TEMPORARY_PHOTO_WAIVER' else 'DATA_ENTRY_TEMPORARY_PHOTO_WAIVER_CLEARED' end,
    'DELIVERY_WAY',v_delivery_way_id,
    jsonb_build_object(
      'pickup_id',v_pickup_id,
      'parcel_sequence',v_sequence,
      'temporary',true,
      'reason',case when v_action='WAIVE' then v_reason else null end
    ),
    'DATA_ENTRY_TEMPORARY_PHOTO_WAIVER_V54',
    case when v_action='WAIVE' then 'DATA_ENTRY_TEMPORARY_PHOTO_WAIVER' else 'DATA_ENTRY_TEMPORARY_PHOTO_WAIVER_CLEARED' end,
    'DELIVERY_WAY',v_delivery_way_id,
    jsonb_build_object(
      'action',v_action,
      'reason',case when v_action='WAIVE' then v_reason else null end,
      'actor_user_id',v_actor_id,
      'actor_email',v_actor_email
    )
  );

  return jsonb_build_object(
    'ok',true,
    'action',v_action,
    'pickup_id',v_pickup_id,
    'parcel_sequence',v_sequence,
    'delivery_way_id',v_delivery_way_id,
    'review_status',v_status,
    'temporary_photo_waiver',v_action='WAIVE',
    'reason',case when v_action='WAIVE' then v_reason else null end
  );
end;
$function$;

grant execute on function public.be_data_entry_photo_waiver_v54(jsonb) to authenticated;
