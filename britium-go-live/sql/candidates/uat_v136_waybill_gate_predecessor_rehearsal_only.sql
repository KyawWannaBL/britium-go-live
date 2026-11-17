-- CI-only historical V136 predecessor reconstructed from Production after exact gate reversal.
-- V136 migration will reapply canonical field-team gate. Never deploy directly.
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
     or upper(coalesce(v_pickup.rider_status, '')) not in (
       'COLLECTED',
       'TO_WAREHOUSE'
     ) then
    raise exception
      'Pickup % must be Rider-verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;

  if nullif(v_pickup.pickup_proof_url, '') is null
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
