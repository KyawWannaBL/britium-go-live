
-- Temporary Rider pickup-photo waiver during backlog recovery.
-- Does NOT bypass actor identity, assignment, parcel count, weights,
-- pickup verified/collected timestamps, or data entry/finance RLS checks.
create schema if not exists private;
create table if not exists private.be_pickup_photo_policy_v1 (
  singleton boolean primary key default true check(singleton),
  photo_required boolean not null default true,
  reason text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create table if not exists private.be_pickup_photo_policy_audit_v1 (
  id bigint generated always as identity primary key,
  action_at timestamptz not null default now(),
  actor_user_id uuid,
  photo_required boolean not null,
  reason text not null
);
revoke all on private.be_pickup_photo_policy_v1 from public,anon,authenticated;
revoke all on private.be_pickup_photo_policy_audit_v1 from public,anon,authenticated;

create or replace function public.be_pickup_photo_required_v1()
returns boolean language sql stable security definer
set search_path=private,public,pg_temp
as $$
 select coalesce((select photo_required from private.be_pickup_photo_policy_v1 where singleton=true),true);
$$;
revoke all on function public.be_pickup_photo_required_v1() from public,anon;
grant execute on function public.be_pickup_photo_required_v1() to authenticated;

create or replace function public.be_set_pickup_photo_required_v1(p_required boolean,p_reason text)
returns jsonb language plpgsql volatile security definer
set search_path=private,public,auth,pg_temp
as $$
declare v_actor uuid:=auth.uid(); v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  if v_actor is null or not public.is_superadmin()
    or not exists(select 1 from auth.users u where u.id=v_actor and lower(u.email)='superadmin@britiumexpress.com')
  then
    raise exception 'SUPERADMIN_PHOTO_POLICY_CHANGE_DENIED' using errcode='42501';
  end if;
  if p_required is null or v_reason is null or length(v_reason)<10 then
    raise exception 'A required boolean and reason of at least 10 characters are mandatory' using errcode='22023';
  end if;
  insert into private.be_pickup_photo_policy_v1(singleton,photo_required,reason,changed_at,changed_by)
  values(true,p_required,v_reason,now(),v_actor)
  on conflict(singleton) do update set photo_required=excluded.photo_required,reason=excluded.reason,changed_at=now(),changed_by=v_actor;
  insert into private.be_pickup_photo_policy_audit_v1(actor_user_id,photo_required,reason)
  values(v_actor,p_required,v_reason);
  return jsonb_build_object('ok',true,'photo_required',p_required,'changed_by',v_actor,'changed_at',now());
end
$$;
revoke all on function public.be_set_pickup_photo_required_v1(boolean,text) from public,anon;
grant execute on function public.be_set_pickup_photo_required_v1(boolean,text) to authenticated;

insert into private.be_pickup_photo_policy_v1(singleton,photo_required,reason,changed_at,changed_by)
values(true,false,'Super Admin temporary backlog recovery: photos optional; retain pickup counts, weights and custody',now(),null)
on conflict(singleton) do update set photo_required=false,reason=excluded.reason,changed_at=now(),changed_by=null;
insert into private.be_pickup_photo_policy_audit_v1(actor_user_id,photo_required,reason)
values(null,false,'Initial Super Admin-approved temporary photo waiver for missing-parcel backlog');

-- Existing verification and waybill logic retained with photo-only guards made conditional.
CREATE OR REPLACE FUNCTION public.be_field_team_submit_partial_pickup_verification(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickupId')),'');
  v_identity jsonb;
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_worker_code text;
  v_expected_count integer;
  v_submitted_count integer;
  v_total_weight numeric;
  v_first_proof_url text;
  v_partial boolean;
  v_extra_count integer;
  v_current_mobile_status text;
begin
  v_identity := public.be_field_team_assert_assigned_pickup(v_pickup_id);
  v_role := lower(v_identity->>'role');
  v_worker_code := upper(coalesce(v_identity->>'worker_code',''));
  select public.be_field_team_mobile_pickup_status(p.pickup_status,p.workflow_stage,p.rider_app_stage,p.warehouse_status,case v_role when 'driver' then p.driver_status when 'helper' then p.helper_status else p.rider_status end)
  into v_current_mobile_status from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id for update;
  if upper(coalesce(v_current_mobile_status,'')) in ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then raise exception 'PICKUP_ALREADY_ADVANCED: verification cannot be resubmitted after collection.'; end if;
  if upper(coalesce(v_current_mobile_status,'')) not in ('ARRIVED_AT_PICKUP','PICKUP_VERIFIED') then raise exception 'PICKUP_MUST_BE_ARRIVED_BEFORE_VERIFICATION: current status %',coalesce(v_current_mobile_status,'NULL'); end if;
  v_expected_count := public.be_rider_authoritative_expected_count_v59(v_pickup_id);

  -- Temporary photo-optional policy: verify actual weights and authoritative
  -- parcel count. Assigned worker identity is still enforced above.
  if not public.be_pickup_photo_required_v1()
     and jsonb_typeof(coalesce(p_payload->'parcels','[]'::jsonb))='array'
     and jsonb_array_length(coalesce(p_payload->'parcels','[]'::jsonb))>0 then
    if exists (
      select 1 from jsonb_array_elements(p_payload->'parcels') row(value)
      where coalesce(public.be_rider_safe_positive_integer(coalesce(
        row.value->>'parcel_sequence', row.value->>'item_no', row.value->>'parcel_no'
      )),0) not between 1 and v_expected_count
        or coalesce(public.be_rider_safe_numeric(coalesce(
          row.value->>'actual_weight_kg', row.value->>'weight_kg', row.value->>'actual_weight'
        )),0)<=0
    ) then
      raise exception 'TEMP_PHOTO_WAIVER_REQUIRES_VALID_SEQUENCE_AND_ACTUAL_WEIGHT';
    end if;
    insert into public.be_pickup_parcel_verifications(
      pickup_id,pickup_way_id,parcel_sequence,actual_weight_kg,
      status,verification_status,proof_check_status,
      raw_payload,created_at,updated_at
    )
    select
      v_pickup_id,v_pickup_id,
      public.be_rider_safe_positive_integer(coalesce(
        row.value->>'parcel_sequence',row.value->>'item_no',row.value->>'parcel_no'
      )),
      public.be_rider_safe_numeric(coalesce(
        row.value->>'actual_weight_kg',row.value->>'weight_kg',row.value->>'actual_weight'
      )),
      'PENDING','PHOTO_WAIVED_TEMP','APPROVED',
      jsonb_build_object(
        'temporary_photo_waiver',true,
        'photo_waiver_reason','RIDER_TRAINING_BACKLOG',
        'photo_waiver_at',now(),
        'photo_waiver_actor',v_auth_user_id,
        'photo_waiver_worker_code',v_worker_code,
        'photo_reenable_control','SUPERADMIN'
      ),now(),now()
    from jsonb_array_elements(p_payload->'parcels') row(value)
    on conflict (pickup_id,parcel_sequence) do update
      set actual_weight_kg=excluded.actual_weight_kg,
          verification_status=case when
            nullif(btrim(coalesce(be_pickup_parcel_verifications.proof_photo_url,
                                  be_pickup_parcel_verifications.proof_photo_path)),'') is null
            then 'PHOTO_WAIVED_TEMP'
            else be_pickup_parcel_verifications.verification_status end,
          proof_check_status=case when
            nullif(btrim(coalesce(be_pickup_parcel_verifications.proof_photo_url,
                                  be_pickup_parcel_verifications.proof_photo_path)),'') is null
            then 'APPROVED'
            else be_pickup_parcel_verifications.proof_check_status end,
          raw_payload=coalesce(be_pickup_parcel_verifications.raw_payload,'{}'::jsonb)
            ||excluded.raw_payload,
          updated_at=now();
  end if;

  if jsonb_typeof(coalesce(p_payload->'parcels','[]'::jsonb))='array' and jsonb_array_length(coalesce(p_payload->'parcels','[]'::jsonb))>0 then
    perform public.be_rider_save_pickup_parcel_verifications(v_pickup_id,v_worker_code,p_payload->'parcels');
  end if;
  select count(*)::integer into v_extra_count from public.be_pickup_parcel_verifications v where v.pickup_id=v_pickup_id and v.parcel_sequence>v_expected_count;
  if v_extra_count>0 then raise exception 'FIELD_TEAM_VERIFICATION_INTEGRITY_ERROR: pickup % has % verification row(s) beyond authoritative count %.',v_pickup_id,v_extra_count,v_expected_count; end if;
  select count(distinct v.parcel_sequence)::integer,coalesce(sum(v.actual_weight_kg),0),min(coalesce(v.proof_photo_url,v.proof_photo_path))
  into v_submitted_count,v_total_weight,v_first_proof_url
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup_id and v.parcel_sequence between 1 and v_expected_count and coalesce(v.actual_weight_kg,0)>0 and (not public.be_pickup_photo_required_v1() or nullif(btrim(coalesce(v.proof_photo_url,v.proof_photo_path)),'') is not null) and upper(coalesce(v.proof_check_status,'')) not in ('REJECTED','REUPLOAD_REQUIRED','SKIPPED_PARTIAL') and upper(coalesce(v.clarity_status,'LEGACY_UNCHECKED')) in ('PASS','LEGACY_UNCHECKED');
  if coalesce(v_submitted_count,0)=0 then raise exception 'Enter the actual parcel weight before submitting verification. Photo is required only when policy is enabled.'; end if;
  v_partial := v_submitted_count<v_expected_count;
  if v_partial then
    update public.be_portal_pickup_requests p set pickup_status='PICKUP_VERIFICATION_IN_PROGRESS',workflow_stage='PICKUP_VERIFICATION_IN_PROGRESS',rider_app_stage='VERIFY_PICKUP',rider_status=case when v_role='rider' then 'ARRIVED' else p.rider_status end,pickup_verified_at=null,verified_parcels=v_submitted_count,pickup_verified_total_weight=v_total_weight,pickup_proof_url=coalesce(v_first_proof_url,p.pickup_proof_url),field_verification_payload=coalesce(p.field_verification_payload,'{}'::jsonb)||jsonb_build_object('pickup_id',v_pickup_id,'submitted_by_auth_user_id',v_auth_user_id,'submitted_by_role',upper(v_role),'submitted_by_worker_code',v_worker_code,'submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',true,'submitted_at',now(),'count_authority_build','RIDER_PICKUP_COUNT_AUTHORITY_V59_3_2026_08_01'),data_entry_status='WAITING_RIDER_COMPLETION',photo_review_status='PARTIAL',last_event_at=now(),last_event_by=v_auth_user_id::text,last_event_note=upper(v_role)||' submitted partial pickup proof; verification remains incomplete',updated_at=now() where p.pickup_id=v_pickup_id;
    return jsonb_build_object('ok',true,'action','partial_verify_pickup','pickup_id',v_pickup_id,'mobile_status','ARRIVED_AT_PICKUP','submitted_count',v_submitted_count,'expected_count',v_expected_count,'partial_verification',true,'pickup_verified',false,'ready_for_collection',false,'close_verification_screen',false,'clear_verification_form',false,'message',format('%s of %s parcel proofs are ready. Complete the remaining proofs before verification.',v_submitted_count,v_expected_count));
  end if;
  update public.be_portal_pickup_requests p set pickup_status='PICKUP_VERIFIED',workflow_stage='PICKUP_VERIFIED',rider_app_stage='VERIFIED_PICKUP',rider_status=case when v_role='rider' then 'VERIFIED' else p.rider_status end,driver_status=case when v_role='driver' then 'VERIFIED' else p.driver_status end,pickup_verified_at=now(),field_verified_at=coalesce(p.field_verified_at,now()),field_verified_by=v_auth_user_id::text,verified_parcels=v_expected_count,pickup_verified_total_weight=v_total_weight,pickup_proof_url=coalesce(v_first_proof_url,nullif(btrim(p_payload->>'proof_url'),''),p.pickup_proof_url),field_verification_payload=coalesce(p.field_verification_payload,'{}'::jsonb)||jsonb_build_object('pickup_id',v_pickup_id,'submitted_by_auth_user_id',v_auth_user_id,'submitted_by_role',upper(v_role),'submitted_by_worker_code',v_worker_code,'submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',false,'photo_policy_required',public.be_pickup_photo_required_v1(),'submitted_at',now(),'count_authority_build','RIDER_PICKUP_COUNT_AUTHORITY_V59_3_2026_08_01'),data_entry_status='PENDING_REVIEW',photo_review_status=case when public.be_pickup_photo_required_v1() then 'PENDING' else 'TEMPORARY_PHOTO_WAIVER' end,last_event_at=now(),last_event_by=v_auth_user_id::text,last_event_note=upper(v_role)||' fully verified authoritative pickup parcel count and proof',updated_at=now() where p.pickup_id=v_pickup_id;
  if to_regprocedure('public.be_sync_rider_proofs_to_data_entry()') is not null then perform public.be_sync_rider_proofs_to_data_entry(); end if;
  return jsonb_build_object('ok',true,'action','verify_pickup','pickup_id',v_pickup_id,'mobile_status','PICKUP_VERIFIED','submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',false,'pickup_verified',true,'ready_for_collection',true,'data_entry_status','PENDING_REVIEW','close_verification_screen',true,'clear_verification_form',true,'ready_for_next_pickup',true,'message',format('All %s authoritative parcel proofs submitted successfully.',v_expected_count));
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_data_entry_create_waybill_from_rows(p_pickup_id text, p_rows jsonb, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_actor_email text;
  v_waybill_no text;
  v_parcel_count integer;
  v_expected_count integer;
  v_row jsonb;
  v_sequence integer;
  v_total_cod numeric := 0;
  v_total_weight numeric := 0;
begin
  select u.email
  into v_actor_email
  from auth.users u
  where u.id = auth.uid();

  if v_actor_email is null then
    raise exception 'Authenticated Data Entry identity is required.';
  end if;

  if nullif(btrim(p_actor_email), '') is not null
     and lower(btrim(p_actor_email)) <> lower(v_actor_email) then
    raise exception 'Data Entry actor email does not match the authenticated user.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one completed parcel row is required.';
  end if;

  select *
  into v_pickup
  from public.be_portal_pickup_requests p
  where p.pickup_id = nullif(btrim(p_pickup_id), '')
  for update;

  if not found then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  if v_pickup.assigned_rider_id::text = auth.uid()::text then
    raise exception
      'Segregation of duties: the Rider who submitted proof cannot approve it.';
  end if;

  if v_pickup.pickup_verified_at is null
     or v_pickup.pickup_collected_at is null
     or not (
       upper(coalesce(v_pickup.pickup_status, '')) in (
         'PICKUP_COLLECTED',
         'DELIVERED_TO_WAREHOUSE'
       )
       or upper(coalesce(v_pickup.workflow_stage, '')) in (
         'PICKUP_COLLECTED',
         'TO_WAREHOUSE',
         'DELIVERED_TO_WAREHOUSE'
       )
       or upper(coalesce(v_pickup.rider_app_stage, '')) in (
         'COLLECTED_PICKUP',
         'WAREHOUSE_HANDOFF'
       )
     ) then
    raise exception
      'Pickup % must be field-team verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;

  if public.be_pickup_photo_required_v1() and nullif(v_pickup.pickup_proof_url, '') is null
     and not exists (
       select 1
       from jsonb_array_elements(p_rows) r(item)
       where nullif(btrim(r.item ->> 'proof_photo_path'), '') is not null
     ) then
    raise exception
      'Pickup % has no Rider proof photo to review.',
      v_pickup.pickup_id;
  end if;

  v_expected_count := greatest(
    coalesce(
      v_pickup.verified_parcels,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcels', '')::integer,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcel_count', '')::integer,
      1
    ),
    1
  );
  v_parcel_count := jsonb_array_length(p_rows);

  if v_parcel_count <> v_expected_count then
    raise exception
      'Parcel count mismatch for %. Rider verified %, Data Entry supplied %.',
      v_pickup.pickup_id,
      v_expected_count,
      v_parcel_count;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) r(item)
    where coalesce((r.item ->> 'parcel_sequence')::integer, 0) <= 0
       or nullif(btrim(r.item ->> 'recipient_name'), '') is null
       or nullif(btrim(r.item ->> 'contact_no_1'), '') is null
       or nullif(btrim(r.item ->> 'township'), '') is null
       or nullif(btrim(r.item ->> 'recipient_address'), '') is null
  ) then
    raise exception
      'Every parcel requires sequence, recipient name, phone, township, and address.';
  end if;

  if (
    select count(distinct (r.item ->> 'parcel_sequence')::integer)
    from jsonb_array_elements(p_rows) r(item)
  ) <> v_parcel_count then
    raise exception 'Parcel sequence numbers must be unique.';
  end if;

  for v_row in
    select r.item
    from jsonb_array_elements(p_rows) r(item)
    order by (r.item ->> 'parcel_sequence')::integer
  loop
    v_sequence := (v_row ->> 'parcel_sequence')::integer;
    v_total_cod := v_total_cod + coalesce(
      nullif(v_row ->> 'cod_amount', '')::numeric,
      0
    );
    v_total_weight := v_total_weight + coalesce(
      nullif(v_row ->> 'weight_kg', '')::numeric,
      0
    );

    update public.be_data_entry_parcel_details
    set
      delivery_way_id = coalesce(
        nullif(btrim(v_row ->> 'delivery_way_id'), ''),
        v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
      ),
      recipient_name = nullif(btrim(v_row ->> 'recipient_name'), ''),
      contact_no_1 = nullif(btrim(v_row ->> 'contact_no_1'), ''),
      contact_no_2 = nullif(btrim(v_row ->> 'contact_no_2'), ''),
      township = nullif(btrim(v_row ->> 'township'), ''),
      recipient_address = nullif(btrim(v_row ->> 'recipient_address'), ''),
      customer_tier = coalesce(
        nullif(btrim(v_row ->> 'customer_tier'), ''),
        'Standard'
      ),
      item_price = coalesce(nullif(v_row ->> 'item_price', '')::numeric, 0),
      weight_kg = coalesce(nullif(v_row ->> 'weight_kg', '')::numeric, 0),
      surcharge = coalesce(nullif(v_row ->> 'surcharge', '')::numeric, 0),
      delivery_fee = coalesce(nullif(v_row ->> 'delivery_fee', '')::numeric, 0),
      cod_amount = coalesce(nullif(v_row ->> 'cod_amount', '')::numeric, 0),
      actual_collect = coalesce(
        nullif(v_row ->> 'actual_collect', '')::numeric,
        0
      ),
      destination = nullif(btrim(v_row ->> 'destination'), ''),
      pickup_by = coalesce(
        nullif(btrim(v_row ->> 'pickup_by'), ''),
        'DATA_ENTRY'
      ),
      remark = nullif(btrim(v_row ->> 'remark'), ''),
      saved_by_email = v_actor_email,
      saved_at = coalesce(saved_at, now()),
      updated_at = now()
    where pickup_id = v_pickup.pickup_id
      and parcel_sequence = v_sequence;

    if not found then
      insert into public.be_data_entry_parcel_details (
        pickup_id,
        parcel_sequence,
        delivery_way_id,
        recipient_name,
        contact_no_1,
        contact_no_2,
        township,
        recipient_address,
        customer_tier,
        item_price,
        weight_kg,
        surcharge,
        delivery_fee,
        cod_amount,
        actual_collect,
        destination,
        pickup_by,
        remark,
        saved_by_email,
        saved_at,
        updated_at
      )
      values (
        v_pickup.pickup_id,
        v_sequence,
        coalesce(
          nullif(btrim(v_row ->> 'delivery_way_id'), ''),
          v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
        ),
        nullif(btrim(v_row ->> 'recipient_name'), ''),
        nullif(btrim(v_row ->> 'contact_no_1'), ''),
        nullif(btrim(v_row ->> 'contact_no_2'), ''),
        nullif(btrim(v_row ->> 'township'), ''),
        nullif(btrim(v_row ->> 'recipient_address'), ''),
        coalesce(
          nullif(btrim(v_row ->> 'customer_tier'), ''),
          'Standard'
        ),
        coalesce(nullif(v_row ->> 'item_price', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'weight_kg', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'surcharge', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'delivery_fee', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'cod_amount', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'actual_collect', '')::numeric, 0),
        nullif(btrim(v_row ->> 'destination'), ''),
        coalesce(
          nullif(btrim(v_row ->> 'pickup_by'), ''),
          'DATA_ENTRY'
        ),
        nullif(btrim(v_row ->> 'remark'), ''),
        v_actor_email,
        now(),
        now()
      );
    end if;

    update public.be_pickup_parcel_verifications
    set
      delivery_way_id = coalesce(
        nullif(btrim(v_row ->> 'delivery_way_id'), ''),
        v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
      ),
      verification_status = 'DATA_ENTRY_APPROVED',
      proof_check_status = 'APPROVED',
      reviewed_by = auth.uid()::text,
      reviewed_by_email = v_actor_email,
      reviewed_at = now(),
      review_note = nullif(btrim(v_row ->> 'remark'), ''),
      updated_at = now()
    where pickup_id = v_pickup.pickup_id
      and parcel_sequence = v_sequence;
  end loop;

  v_waybill_no := coalesce(
    nullif(v_pickup.waybill_no, ''),
    'WB-' || v_pickup.pickup_id
  );

  update public.be_portal_pickup_requests
  set
    waybill_no = v_waybill_no,
    pickup_waybill_id = coalesce(
      nullif(pickup_waybill_id, ''),
      v_waybill_no
    ),
    registered_parcel_count = v_parcel_count,
    photo_review_status = 'APPROVED',
    data_entry_status = 'WAYBILL_CREATED',
    warehouse_status = 'READY_FOR_INBOUND',
    workflow_stage = 'DATA_ENTRY_WAYBILL_CREATED',
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_entry_review',
        jsonb_build_object(
          'status', 'APPROVED',
          'reviewer_id', auth.uid()::text,
          'reviewer_email', v_actor_email,
          'reviewed_at', now(),
          'parcel_count', v_parcel_count,
          'total_cod', v_total_cod,
          'total_weight_kg', v_total_weight,
          'waybill_no', v_waybill_no
        )
      ),
    last_event_at = now(),
    last_event_by = v_actor_email,
    last_event_note = 'Data Entry approved Rider proof and created waybill',
    updated_at = now()
  where pickup_id = v_pickup.pickup_id;

  insert into public.be_app_notifications (
    recipient_role,
    recipient_email,
    target_user_id,
    notification_type,
    title,
    message,
    entity_type,
    entity_id,
    pickup_id,
    priority,
    is_read,
    payload,
    created_at
  )
  select
    'warehouse',
    null,
    null,
    'WAYBILL_READY_FOR_WAREHOUSE',
    'Waybill ready for warehouse',
    'Waybill ' || v_waybill_no || ' is ready for inbound scan.',
    'pickup',
    v_pickup.pickup_id,
    v_pickup.pickup_id,
    'HIGH',
    false,
    jsonb_build_object(
      'pickup_id', v_pickup.pickup_id,
      'waybill_no', v_waybill_no,
      'parcel_count', v_parcel_count,
      'next_action', 'WAREHOUSE_INBOUND_SCAN'
    ),
    now()
  where not exists (
    select 1
    from public.be_app_notifications n
    where n.pickup_id = v_pickup.pickup_id
      and n.notification_type = 'WAYBILL_READY_FOR_WAREHOUSE'
      and lower(coalesce(n.recipient_role, '')) = 'warehouse'
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup.pickup_id,
    'waybill_no', v_waybill_no,
    'parcel_count', v_parcel_count,
    'photo_review_status', 'APPROVED',
    'data_entry_status', 'WAYBILL_CREATED',
    'warehouse_status', 'READY_FOR_INBOUND',
    'canonical_pickup_preserved', true
  );
end
$function$;
