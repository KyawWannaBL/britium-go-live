-- Prevent riders from approving their own pickup-verification proofs.

begin;

create or replace function public.be_rider_pickup_action(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text := coalesce(
    nullif(v_payload ->> 'pickup_id', ''),
    nullif(v_payload ->> 'pickup_way_id', '')
  );
  v_action text := lower(coalesce(nullif(v_payload ->> 'action', ''), ''));
  v_rider text := coalesce(
    nullif(v_payload ->> 'rider_code', ''),
    nullif(v_payload ->> 'rider_id', ''),
    'RID001'
  );
  v_rider_name text := coalesce(
    nullif(v_payload ->> 'rider_name', ''),
    nullif(v_payload ->> 'user_name', ''),
    'Rider'
  );
  v_remark text := coalesce(
    nullif(v_payload ->> 'remarks', ''),
    nullif(v_payload ->> 'remark', ''),
    nullif(v_payload ->> 'reason', '')
  );
  v_exception_code text := upper(coalesce(
    nullif(v_payload ->> 'exception_code', ''),
    nullif(v_payload ->> 'exception_reason', ''),
    'OTHER_EXCEPTION'
  ));
  v_process_type text := lower(coalesce(
    nullif(v_payload ->> 'workflow_area', ''),
    nullif(v_payload ->> 'process_type', ''),
    'pickup'
  ));
  v_mapped_status text := upper(coalesce(
    nullif(v_payload ->> 'mapped_status', ''),
    'EXCEPTION'
  ));
  v_parcel_count integer := 0;
  v_submitted_count integer := 0;
  v_verified_count integer := 0;
  v_weight numeric := 0;
  v_claims jsonb := case
    when nullif(current_setting('request.jwt.claims', true), '') is null then '{}'::jsonb
    else current_setting('request.jwt.claims', true)::jsonb
  end;
  v_auth_role text := lower(coalesce(auth.role(), v_claims ->> 'role', ''));
  v_auth_email text := lower(coalesce(
    nullif(v_claims ->> 'email', ''),
    nullif(v_claims #>> '{user_metadata,email}', ''),
    ''
  ));
  v_claim_worker_code text := upper(coalesce(
    nullif(v_claims #>> '{app_metadata,worker_code}', ''),
    nullif(v_claims #>> '{user_metadata,worker_code}', ''),
    nullif(v_claims #>> '{app_metadata,account_code}', ''),
    nullif(v_claims #>> '{user_metadata,account_code}', ''),
    ''
  ));
  v_business_role text := lower(coalesce(
    nullif(v_claims #>> '{app_metadata,workforce_role}', ''),
    nullif(v_claims #>> '{user_metadata,workforce_role}', ''),
    nullif(v_claims #>> '{app_metadata,role}', ''),
    nullif(v_claims #>> '{user_metadata,role}', ''),
    ''
  ));
  v_claim_display_name text := coalesce(
    nullif(v_claims #>> '{user_metadata,display_name}', ''),
    nullif(v_claims #>> '{user_metadata,full_name}', ''),
    nullif(v_claims #>> '{app_metadata,display_name}', ''),
    ''
  );
  v_assigned_rider_code text := '';
  v_assigned_rider_email text := '';
  v_is_admin boolean := false;
  v_can_review boolean := false;
  v_matches_assignment boolean := false;
  v_rec public.be_portal_pickup_requests%rowtype;
  v_record jsonb;
  v_event_status text;
  v_message text;
begin
  if v_auth_role not in ('authenticated', 'service_role') then
    return jsonb_build_object(
      'ok', false,
      'error', 'AUTHENTICATION_REQUIRED'
    );
  end if;
  if v_lookup is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_ID_REQUIRED'
    );
  end if;

  if v_action not in (
    'accept',
    'arrive',
    'verify_pickup',
    'collect',
    'delivered_to_warehouse',
    'start_delivery',
    'deliver',
    'exception'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_ACTION',
      'action', v_action
    );
  end if;


  if nullif(v_payload ->> 'proof_url', '') is not null
     and lower(v_payload ->> 'proof_url') !~ '^https?://' then
    return jsonb_build_object(
      'ok', false,
      'error', 'INVALID_PROOF_URL',
      'detail', 'Proof URL must be an uploaded http/https URL.'
    );
  end if;

  select *
  into v_rec
  from public.be_portal_pickup_requests
  where pickup_id = v_lookup
     or pickup_way_id = v_lookup
  limit 1
  for update;

  if v_rec.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_NOT_FOUND',
      'pickup_id', v_lookup
    );
  end if;

  v_record := to_jsonb(v_rec);
  v_assigned_rider_code := upper(coalesce(
    nullif(v_record ->> 'assigned_rider_code', ''),
    nullif(v_record ->> 'assigned_workforce_code', ''),
    nullif(v_record ->> 'rider_code', ''),
    ''
  ));
  v_assigned_rider_email := lower(coalesce(
    nullif(v_record ->> 'assigned_rider_email', ''),
    nullif(v_record ->> 'rider_email', ''),
    ''
  ));
  v_is_admin := v_auth_role = 'service_role'
    or v_business_role in (
      'admin',
      'super_admin',
      'operations_admin',
      'operations_manager',
      'supervisor'
    );

  v_can_review := v_auth_role = 'service_role'
    or v_business_role in (
      'admin',
      'super_admin',
      'operations_admin',
      'operations_manager',
      'supervisor'
    );
  v_matches_assignment :=
    (v_claim_worker_code <> '' and v_claim_worker_code = v_assigned_rider_code)
    or (v_auth_email <> '' and v_auth_email = v_assigned_rider_email);

  if not v_is_admin and not v_matches_assignment then
    return jsonb_build_object(
      'ok', false,
      'error', 'RIDER_NOT_AUTHORIZED_FOR_PICKUP',
      'pickup_id', coalesce(v_rec.pickup_id, v_lookup)
    );
  end if;

  if v_auth_role <> 'service_role' then
    v_rider := coalesce(
      nullif(v_claim_worker_code, ''),
      nullif(v_assigned_rider_code, ''),
      v_rider
    );
    v_rider_name := coalesce(nullif(v_claim_display_name, ''), v_rider_name);
  end if;

  if jsonb_typeof(coalesce(v_payload -> 'parcels', '[]'::jsonb)) = 'array' then
    select
      count(*)::integer,
      count(*) filter (
        where parcel_weight > 0 and has_remote_proof
      )::integer,
      count(*) filter (
        where parcel_weight > 0 and has_remote_proof and is_approved
      )::integer,
      coalesce(sum(parcel_weight) filter (
        where parcel_weight > 0 and has_remote_proof
      ), 0)
    into v_parcel_count, v_submitted_count, v_verified_count, v_weight
    from (
      select
        case
          when coalesce(x ->> 'actual_weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
            then (x ->> 'actual_weight_kg')::numeric
          else 0::numeric
        end as parcel_weight,
        lower(coalesce(x ->> 'proof_url', '')) ~ '^https?://' as has_remote_proof,
        (
          lower(coalesce(x ->> 'verified', 'false')) in ('true', 't', '1', 'yes')
          or upper(coalesce(x ->> 'review_status', '')) in (
            'APPROVED',
            'APPROVED_AFTER_REUPLOAD',
            'VERIFIED'
          )
        ) as is_approved
      from jsonb_array_elements(coalesce(v_payload -> 'parcels', '[]'::jsonb)) x
    ) parcel_rows;
  end if;

  if v_action = 'accept' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'ACCEPTED_BY_RIDER'
       or upper(coalesce(v_rec.rider_status, '')) = 'ACCEPTED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) in (
        'ASSIGNED',
        'PICKUP_ASSIGNED',
        'PICKUP_REQUESTED',
        'PENDING_ASSIGNMENT',
        'WAITING_ACCEPTANCE'
      )
      or upper(coalesce(v_rec.rider_status, '')) in (
        'ASSIGNED',
        'PENDING',
        'WAITING_ACCEPTANCE'
      )
      or upper(coalesce(v_rec.assignment_status, '')) = 'ASSIGNED'
      or lower(coalesce(v_rec.status, '')) in (
        'assigned',
        'pickup_requested',
        'pending_assignment'
      )
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'INVALID_STATUS_TRANSITION',
        'action', v_action,
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      accepted_at = now(),
      rider_status = 'ACCEPTED',
      rider_app_stage = 'ACCEPTED_PICKUP',
      pickup_status = 'ACCEPTED_BY_RIDER',
      status = 'accepted',
      assignment_status = 'accepted',
      rider_last_action = 'accept',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'accepted_by_rider_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'ACCEPTED_BY_RIDER';

  elsif v_action = 'arrive' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'RIDER_ARRIVED'
       or upper(coalesce(v_rec.rider_status, '')) = 'ARRIVED_PICKUP' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'ACCEPTED_BY_RIDER'
      or upper(coalesce(v_rec.rider_status, '')) = 'ACCEPTED'
      or lower(coalesce(v_rec.status, '')) = 'accepted'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ACCEPT_REQUIRED_BEFORE_ARRIVAL',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      arrived_pickup_at = now(),
      rider_status = 'ARRIVED_PICKUP',
      rider_app_stage = 'ARRIVED_PICKUP',
      pickup_status = 'RIDER_ARRIVED',
      status = 'arrived_pickup',
      assignment_status = 'in_progress',
      rider_last_action = 'arrived',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'rider_arrived_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'RIDER_ARRIVED';

  elsif v_action = 'verify_pickup' then
    if not v_can_review then
      return jsonb_build_object(
        'ok', false,
        'error', 'REVIEWER_APPROVAL_REQUIRED',
        'detail',
          'Riders must submit parcel proofs for Data Entry review.'
      );
    end if;
    if upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_VERIFIED'
       or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_VERIFIED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'RIDER_ARRIVED'
      or upper(coalesce(v_rec.rider_status, '')) = 'ARRIVED_PICKUP'
      or lower(coalesce(v_rec.status, '')) = 'arrived_pickup'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'ARRIVAL_REQUIRED_BEFORE_VERIFICATION',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if v_parcel_count <= 0 or v_submitted_count <= 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'PARCEL_VERIFICATION_REQUIRED',
        'parcel_count', v_parcel_count,
        'submitted_count', v_submitted_count
      );
    end if;

    if v_verified_count < v_parcel_count then
      return jsonb_build_object(
        'ok', false,
        'error', 'PARCEL_REVIEW_PENDING',
        'parcel_count', v_parcel_count,
        'submitted_count', v_submitted_count,
        'approved_count', v_verified_count
      );
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_verified_at = now(),
      field_verified_at = now(),
      field_verified_by = v_rider,
      rider_status = 'PICKUP_VERIFIED',
      rider_app_stage = 'PICKUP_VERIFIED',
      pickup_status = 'PICKUP_VERIFIED',
      status = 'pickup_verified',
      assignment_status = 'pickup_verified',
      verified_parcels = greatest(
        coalesce(v_verified_count, 0),
        coalesce(verified_parcels, 0)
      ),
      total_weight_kg = case
        when v_weight > 0 then v_weight
        else coalesce(total_weight_kg, 0)
      end,
      pickup_proof_url = coalesce(
        nullif(v_payload ->> 'proof_url', ''),
        pickup_proof_url
      ),
      proof_url = coalesce(
        nullif(v_payload ->> 'proof_url', ''),
        proof_url
      ),
      warehouse_status = 'WAITING_DATA_ENTRY',
      data_entry_status = 'WAITING_DATA_ENTRY',
      rider_last_action = 'verify_pickup',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'pickup_verified_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'PICKUP_VERIFIED';

  elsif v_action = 'collect' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_COLLECTED'
       or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_COLLECTED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_VERIFIED'
      or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_VERIFIED'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'VERIFICATION_REQUIRED_BEFORE_COLLECTION',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      pickup_collected_at = now(),
      rider_status = 'PICKUP_COLLECTED',
      rider_app_stage = 'PICKUP_COLLECTED',
      pickup_status = 'PICKUP_COLLECTED',
      status = 'pickup_collected',
      assignment_status = 'collected',
      warehouse_status = 'IN_TRANSIT_TO_WAREHOUSE',
      data_entry_status = 'WAITING_DATA_ENTRY',
      rider_last_action = 'collected',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'pickup_collected_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'PICKUP_COLLECTED';

  elsif v_action = 'delivered_to_warehouse' then
    if upper(coalesce(v_rec.pickup_status, '')) = 'DELIVERED_TO_WAREHOUSE'
       or upper(coalesce(v_rec.rider_status, '')) = 'DELIVERED_TO_WAREHOUSE'
       or upper(coalesce(v_rec.warehouse_status, '')) = 'WAITING_WAREHOUSE_ACCEPTANCE' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_COLLECTED'
      or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_COLLECTED'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'COLLECTION_REQUIRED_BEFORE_WAREHOUSE_HANDOVER',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      rider_status = 'DELIVERED_TO_WAREHOUSE',
      rider_app_stage = 'DELIVERED_TO_WAREHOUSE',
      pickup_status = 'DELIVERED_TO_WAREHOUSE',
      status = 'delivered_to_warehouse',
      assignment_status = 'awaiting_warehouse',
      warehouse_status = 'WAITING_WAREHOUSE_ACCEPTANCE',
      workflow_stage = 'DELIVERED_TO_WAREHOUSE',
      operation_status = 'warehouse_handover',
      rider_last_action = 'delivered_to_warehouse',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_rider_payload', v_payload,
          'delivered_to_warehouse_at', now(),
          'handover_remark', v_remark
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'DELIVERED_TO_WAREHOUSE';

  elsif v_action = 'start_delivery' then
    if upper(coalesce(v_rec.delivery_status, '')) = 'OUT_FOR_DELIVERY'
       or upper(coalesce(v_rec.rider_status, '')) = 'OUT_FOR_DELIVERY' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.pickup_status, '')) in (
        'READY_FOR_DELIVERY',
        'ASSIGNED_FOR_DELIVERY'
      )
      or upper(coalesce(v_rec.delivery_status, '')) in (
        'READY_FOR_DELIVERY',
        'ASSIGNED'
      )
      or upper(coalesce(v_rec.dispatch_status, '')) in (
        'ASSIGNED_TO_RIDER',
        'READY_FOR_DELIVERY'
      )
      or upper(coalesce(v_rec.warehouse_status, '')) = 'RECEIVED_AT_ORIGIN'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'DELIVERY_ASSIGNMENT_REQUIRED',
        'current_status', coalesce(v_rec.delivery_status, v_rec.pickup_status, v_rec.dispatch_status)
      );
    end if;

    update public.be_portal_pickup_requests
    set
      delivery_status = 'OUT_FOR_DELIVERY',
      rider_status = 'OUT_FOR_DELIVERY',
      rider_app_stage = 'OUT_FOR_DELIVERY',
      pickup_status = 'OUT_FOR_DELIVERY',
      status = 'out_for_delivery',
      assignment_status = 'out_for_delivery',
      rider_last_action = 'start_delivery',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_delivery_payload', v_payload,
          'out_for_delivery_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := 'OUT_FOR_DELIVERY';

  elsif v_action = 'deliver' then
    if upper(coalesce(v_rec.delivery_status, '')) = 'DELIVERED'
       or upper(coalesce(v_rec.rider_status, '')) = 'DELIVERED' then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'action', v_action,
        'pickup_id', v_rec.pickup_id
      );
    end if;

    if not (
      upper(coalesce(v_rec.delivery_status, '')) = 'OUT_FOR_DELIVERY'
      or upper(coalesce(v_rec.rider_status, '')) = 'OUT_FOR_DELIVERY'
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'START_DELIVERY_REQUIRED',
        'current_status', coalesce(v_rec.delivery_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if nullif(v_payload ->> 'recipient_name', '') is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'RECIPIENT_NAME_REQUIRED'
      );
    end if;

    if nullif(v_payload ->> 'proof_url', '') is null
       or lower(v_payload ->> 'proof_url') !~ '^https?://' then
      return jsonb_build_object(
        'ok', false,
        'error', 'DELIVERY_PROOF_REQUIRED'
      );
    end if;

    update public.be_portal_pickup_requests
    set
      delivered_at = now(),
      delivery_verified_at = now(),
      delivery_status = 'DELIVERED',
      rider_status = 'DELIVERED',
      rider_app_stage = 'DELIVERED',
      pickup_status = 'DELIVERED',
      status = 'delivered',
      rider_last_action = 'delivered',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_delivery_payload', v_payload,
          'last_delivery_action_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    insert into public.be_proof_of_delivery (
      pickup_id,
      delivery_way_id,
      proof_type,
      proof_url,
      signature_url,
      recipient_name,
      recipient_phone,
      rider_code,
      rider_name,
      status,
      metadata
    )
    values (
      v_rec.pickup_id,
      nullif(v_payload ->> 'delivery_way_id', ''),
      coalesce(nullif(v_payload ->> 'proof_type', ''), 'delivery'),
      nullif(v_payload ->> 'proof_url', ''),
      nullif(v_payload ->> 'signature_url', ''),
      nullif(v_payload ->> 'recipient_name', ''),
      nullif(v_payload ->> 'recipient_phone', ''),
      v_rider,
      v_rider_name,
      'submitted',
      v_payload
    );

    v_event_status := 'DELIVERED';

  elsif v_action = 'exception' then
    if upper(coalesce(v_rec.pickup_status, '')) in (
      'DELIVERED_TO_WAREHOUSE',
      'RECEIVED_AT_ORIGIN',
      'DELIVERED'
    )
       or upper(coalesce(v_rec.rider_status, '')) in (
         'WAREHOUSE_ACCEPTED',
         'DELIVERED'
       ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'FINAL_STATUS_CANNOT_BE_CHANGED',
        'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
      );
    end if;

    if v_remark is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'EXCEPTION_REMARK_REQUIRED'
      );
    end if;

    if v_mapped_status not in (
      'EXCEPTION',
      'PICKUP_FAILED',
      'ADDRESS_CORRECTION_REQUIRED',
      'PICKUP_ON_HOLD',
      'SPECIAL_HANDLING_REQUIRED',
      'PICKUP_REJECTED',
      'PICKUP_CANCELLED',
      'DELIVERY_ATTEMPTED',
      'CUSTOMER_REFUSED',
      'ADDRESS_ISSUE',
      'DELIVERY_RESCHEDULED',
      'DAMAGED',
      'DELIVERY_DELAYED',
      'REASSIGNMENT_REQUIRED'
    ) then
      v_mapped_status := 'EXCEPTION';
    end if;

    update public.be_portal_pickup_requests
    set
      exception_at = now(),
      exception_reason = v_remark,
      delivery_status = case
        when v_process_type = 'delivery' then v_mapped_status
        else delivery_status
      end,
      rider_status = v_mapped_status,
      rider_app_stage = 'EXCEPTION',
      pickup_status = v_mapped_status,
      status = 'exception',
      rider_last_action = 'exception',
      rider_last_action_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'last_exception_payload', v_payload,
          'exception_code', v_exception_code,
          'mapped_status', v_mapped_status,
          'exception_remark', v_remark,
          'last_exception_at', now()
        ),
      updated_at = now()
    where id = v_rec.id;

    v_event_status := v_mapped_status;
  end if;

  select to_jsonb(p.*)
  into v_record
  from public.be_portal_pickup_requests p
  where p.id = v_rec.id;

  v_message :=
    coalesce(v_rec.pickup_id, v_lookup) ||
    ': ' ||
    replace(v_action, '_', ' ') ||
    case
      when v_remark is not null then ' - ' || v_remark
      else ''
    end;

  perform public.be_workflow_emit_event(
    coalesce(v_rec.pickup_id, v_lookup),
    'rider_' || v_action,
    v_event_status,
    v_message,
    'rider_app',
    'rider',
    v_rider,
    v_rider_name,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'supervisor',
    null,
    'Rider workflow update',
    v_message,
    v_payload
  );

  if v_action in ('verify_pickup', 'collect', 'delivered_to_warehouse') then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'warehouse',
      null,
      case
        when v_action = 'delivered_to_warehouse'
          then 'Parcel waiting for warehouse acceptance'
        else 'Pickup workflow update'
      end,
      v_message,
      v_payload
    );
  end if;

  if v_action = 'verify_pickup' then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'data_entry',
      null,
      'Pickup verified by rider',
      v_message,
      v_payload
    );
  end if;

  if v_action = 'exception' then
    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'customer_service',
      null,
      'Rider exception requires review',
      v_message,
      v_payload
    );

    perform public.be_workflow_notify(
      coalesce(v_rec.pickup_id, v_lookup),
      'warehouse',
      null,
      'Rider exception update',
      v_message,
      v_payload
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', coalesce(v_rec.pickup_id, v_lookup),
    'action', v_action,
    'status', v_event_status,
    'record', v_record
  );
end;
$$;

create or replace function public.be_rider_submit_partial_pickup_verification(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_lookup text := coalesce(
    nullif(v_payload ->> 'pickup_id', ''),
    nullif(v_payload ->> 'pickup_way_id', '')
  );
  v_claims jsonb := case
    when nullif(current_setting('request.jwt.claims', true), '') is null then '{}'::jsonb
    else current_setting('request.jwt.claims', true)::jsonb
  end;
  v_auth_role text := lower(coalesce(auth.role(), v_claims ->> 'role', ''));
  v_auth_email text := lower(coalesce(
    nullif(v_claims ->> 'email', ''),
    nullif(v_claims #>> '{user_metadata,email}', ''),
    ''
  ));
  v_claim_worker_code text := upper(coalesce(
    nullif(v_claims #>> '{app_metadata,worker_code}', ''),
    nullif(v_claims #>> '{user_metadata,worker_code}', ''),
    nullif(v_claims #>> '{app_metadata,account_code}', ''),
    nullif(v_claims #>> '{user_metadata,account_code}', ''),
    ''
  ));
  v_business_role text := lower(coalesce(
    nullif(v_claims #>> '{app_metadata,workforce_role}', ''),
    nullif(v_claims #>> '{user_metadata,workforce_role}', ''),
    nullif(v_claims #>> '{app_metadata,role}', ''),
    nullif(v_claims #>> '{user_metadata,role}', ''),
    ''
  ));
  v_claim_display_name text := coalesce(
    nullif(v_claims #>> '{user_metadata,display_name}', ''),
    nullif(v_claims #>> '{user_metadata,full_name}', ''),
    nullif(v_claims #>> '{app_metadata,display_name}', ''),
    'Rider'
  );
  v_rider_code text;
  v_assigned_rider_code text;
  v_assigned_rider_email text;
  v_parcel_count integer := 0;
  v_submitted_count integer := 0;
  v_approved_count integer := 0;
  v_rejected_count integer := 0;
  v_pending_count integer := 0;
  v_total_weight numeric := 0;
  v_full_approval boolean := false;
  v_can_review boolean := false;
  v_event_status text;
  v_message text;
  v_record jsonb;
  v_rec public.be_portal_pickup_requests%rowtype;
begin
  if v_auth_role not in ('authenticated', 'service_role') then
    return jsonb_build_object(
      'ok', false,
      'error', 'AUTHENTICATION_REQUIRED'
    );
  end if;

  if v_lookup is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_ID_REQUIRED'
    );
  end if;

  if jsonb_typeof(coalesce(v_payload -> 'parcels', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'error', 'PARCELS_ARRAY_REQUIRED'
    );
  end if;

  select *
  into v_rec
  from public.be_portal_pickup_requests
  where pickup_id = v_lookup
     or pickup_way_id = v_lookup
  limit 1
  for update;

  if v_rec.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'PICKUP_NOT_FOUND',
      'pickup_id', v_lookup
    );
  end if;

  v_record := to_jsonb(v_rec);
  v_assigned_rider_code := upper(coalesce(
    nullif(v_record ->> 'assigned_rider_code', ''),
    nullif(v_record ->> 'assigned_workforce_code', ''),
    nullif(v_record ->> 'rider_code', ''),
    ''
  ));
  v_assigned_rider_email := lower(coalesce(
    nullif(v_record ->> 'assigned_rider_email', ''),
    nullif(v_record ->> 'rider_email', ''),
    ''
  ));

  if v_auth_role <> 'service_role'
     and v_business_role not in (
       'admin',
       'super_admin',
       'operations_admin',
       'operations_manager',
       'supervisor',
       'data_entry',
       'data_entry_admin'
     )
     and not (
       (v_claim_worker_code <> '' and v_claim_worker_code = v_assigned_rider_code)
       or (v_auth_email <> '' and v_auth_email = v_assigned_rider_email)
     ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'RIDER_NOT_AUTHORIZED_FOR_PICKUP',
      'pickup_id', coalesce(v_rec.pickup_id, v_lookup)
    );
  end if;

  v_can_review := v_auth_role = 'service_role'
    or v_business_role in (
      'admin',
      'super_admin',
      'operations_admin',
      'operations_manager',
      'supervisor',
      'data_entry',
      'data_entry_admin'
    );

  -- Riders may submit proofs, but may not approve their own proofs.
  if not v_can_review then
    select jsonb_set(
      v_payload,
      '{parcels}',
      coalesce(
        jsonb_agg(
          (parcel_item - 'verified' - 'review_status')
          || jsonb_build_object(
            'verified', false,
            'review_status', 'PENDING'
          )
        ),
        '[]'::jsonb
      ),
      true
    )
    into v_payload
    from jsonb_array_elements(v_payload -> 'parcels')
      as parcel_rows(parcel_item);
  end if;

  if upper(coalesce(v_rec.pickup_status, '')) = 'PICKUP_VERIFIED'
     or upper(coalesce(v_rec.rider_status, '')) = 'PICKUP_VERIFIED' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'pickup_id', coalesce(v_rec.pickup_id, v_lookup),
      'status', 'PICKUP_VERIFIED'
    );
  end if;

  if not (
    upper(coalesce(v_rec.pickup_status, '')) in (
      'RIDER_ARRIVED',
      'PICKUP_VERIFICATION_PENDING_REVIEW'
    )
    or upper(coalesce(v_rec.rider_status, '')) in (
      'ARRIVED_PICKUP',
      'PICKUP_VERIFICATION_PENDING_REVIEW'
    )
    or lower(coalesce(v_rec.status, '')) in (
      'arrived_pickup',
      'pickup_verification_pending_review'
    )
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'ARRIVAL_REQUIRED_BEFORE_VERIFICATION',
      'current_status', coalesce(v_rec.pickup_status, v_rec.rider_status, v_rec.status)
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where parcel_weight > 0 and has_remote_proof
    )::integer,
    count(*) filter (
      where parcel_weight > 0 and has_remote_proof and is_approved
    )::integer,
    count(*) filter (
      where parcel_weight > 0 and has_remote_proof and is_rejected
    )::integer,
    coalesce(sum(parcel_weight) filter (
      where parcel_weight > 0 and has_remote_proof
    ), 0)
  into
    v_parcel_count,
    v_submitted_count,
    v_approved_count,
    v_rejected_count,
    v_total_weight
  from (
    select
      case
        when coalesce(x ->> 'actual_weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (x ->> 'actual_weight_kg')::numeric
        else 0::numeric
      end as parcel_weight,
      lower(coalesce(x ->> 'proof_url', '')) ~ '^https?://' as has_remote_proof,
      (
        lower(coalesce(x ->> 'verified', 'false')) in ('true', 't', '1', 'yes')
        or upper(coalesce(x ->> 'review_status', '')) in (
          'APPROVED',
          'APPROVED_AFTER_REUPLOAD',
          'VERIFIED'
        )
      ) as is_approved,
      upper(coalesce(x ->> 'review_status', '')) in (
        'REJECTED',
        'PHOTO_REJECTED',
        'REUPLOAD_REQUIRED'
      ) as is_rejected
    from jsonb_array_elements(v_payload -> 'parcels') x
  ) parcel_rows;

  if v_parcel_count <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'PARCELS_REQUIRED'
    );
  end if;

  if v_submitted_count <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'UPLOADED_PARCEL_PROOF_REQUIRED',
      'detail', 'At least one parcel needs a positive weight and an uploaded http/https proof URL.'
    );
  end if;

  v_pending_count := greatest(v_submitted_count - v_approved_count - v_rejected_count, 0);
  v_full_approval := v_approved_count = v_parcel_count;
  v_rider_code := coalesce(
    nullif(v_claim_worker_code, ''),
    nullif(v_assigned_rider_code, ''),
    nullif(v_payload ->> 'rider_code', ''),
    nullif(v_payload ->> 'rider_id', ''),
    'RIDER'
  );
  v_event_status := case
    when v_full_approval then 'PICKUP_VERIFIED'
    else 'PICKUP_VERIFICATION_PENDING_REVIEW'
  end;

  update public.be_portal_pickup_requests
  set
    pickup_verified_at = case
      when v_full_approval then coalesce(pickup_verified_at, now())
      else pickup_verified_at
    end,
    field_verified_at = case
      when v_full_approval then coalesce(field_verified_at, now())
      else field_verified_at
    end,
    field_verified_by = case
      when v_full_approval then v_rider_code
      else field_verified_by
    end,
    rider_status = v_event_status,
    rider_app_stage = v_event_status,
    pickup_status = v_event_status,
    status = lower(v_event_status),
    assignment_status = case
      when v_full_approval then 'pickup_verified'
      else 'verification_pending_review'
    end,
    verified_parcels = greatest(coalesce(verified_parcels, 0), v_approved_count),
    total_weight_kg = case
      when v_total_weight > 0 then v_total_weight
      else coalesce(total_weight_kg, 0)
    end,
    pickup_proof_url = coalesce(
      nullif(v_payload ->> 'proof_url', ''),
      pickup_proof_url
    ),
    proof_url = coalesce(
      nullif(v_payload ->> 'proof_url', ''),
      proof_url
    ),
    warehouse_status = 'WAITING_DATA_ENTRY',
    data_entry_status = case
      when v_full_approval then 'VERIFIED'
      else 'WAITING_REVIEW'
    end,
    rider_last_action = 'submit_pickup_verification',
    rider_last_action_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'last_partial_verification_payload', v_payload,
        'parcel_count', v_parcel_count,
        'submitted_count', v_submitted_count,
        'approved_count', v_approved_count,
        'rejected_count', v_rejected_count,
        'pending_count', v_pending_count,
        'verification_submitted_at', now()
      ),
    updated_at = now()
  where id = v_rec.id;

  select to_jsonb(p.*)
  into v_record
  from public.be_portal_pickup_requests p
  where p.id = v_rec.id;

  v_message :=
    coalesce(v_rec.pickup_id, v_lookup) ||
    ': parcel proofs submitted ' ||
    v_submitted_count || '/' || v_parcel_count ||
    ', approved ' || v_approved_count ||
    ', pending ' || v_pending_count ||
    ', rejected ' || v_rejected_count;

  perform public.be_workflow_emit_event(
    coalesce(v_rec.pickup_id, v_lookup),
    'rider_submit_partial_pickup_verification',
    v_event_status,
    v_message,
    'rider_app',
    'rider',
    v_rider_code,
    v_claim_display_name,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'data_entry',
    null,
    case
      when v_full_approval then 'Pickup verification completed'
      else 'Parcel photos waiting for Data Entry review'
    end,
    v_message,
    v_payload
  );

  perform public.be_workflow_notify(
    coalesce(v_rec.pickup_id, v_lookup),
    'supervisor',
    null,
    'Rider pickup verification update',
    v_message,
    v_payload
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', coalesce(v_rec.pickup_id, v_lookup),
    'status', v_event_status,
    'parcel_count', v_parcel_count,
    'submitted_count', v_submitted_count,
    'approved_count', v_approved_count,
    'rejected_count', v_rejected_count,
    'pending_count', v_pending_count,
    'record', v_record
  );
end;
$$;

commit;
