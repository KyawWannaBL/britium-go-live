CREATE OR REPLACE FUNCTION private.be_data_entry_create_ready_waybill_rows_v1(p_pickup_id text, p_rows jsonb, p_actor_email text)
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
  v_os_evidence boolean := false;
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

  v_os_evidence := private.be_ready_waybill_os_evidence_v1(v_pickup.pickup_id,
    array(select (r.item->>'parcel_sequence')::integer from jsonb_array_elements(p_rows) r(item)));
  if v_os_evidence then perform public.be_data_entry_require_access_v57('upload',false); end if;

  if not v_os_evidence and (v_pickup.pickup_verified_at is null
     or v_pickup.pickup_collected_at is null
     or upper(coalesce(v_pickup.rider_status, '')) not in (
       'COLLECTED',
       'TO_WAREHOUSE'
     )) then
    raise exception
      'Pickup % must be Rider-verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;

  if not v_os_evidence and nullif(v_pickup.pickup_proof_url, '') is null
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
      case when v_os_evidence then nullif(v_pickup.verified_parcels,0) else v_pickup.verified_parcels end,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcels', '')::integer,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcel_count', '')::integer,
      1
    ),
    1
  );
  v_parcel_count := jsonb_array_length(p_rows);

  if v_parcel_count > v_expected_count then
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
       or (r.item ->> 'parcel_sequence')::integer > v_expected_count
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
      and parcel_sequence = v_sequence and not v_os_evidence;
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
    registered_parcel_count = greatest(coalesce(registered_parcel_count,0),v_parcel_count),
    photo_review_status = case when v_parcel_count = v_expected_count and not v_os_evidence then 'APPROVED' else photo_review_status end,
    data_entry_status = case when v_parcel_count = v_expected_count then 'WAYBILL_CREATED' else data_entry_status end,
    warehouse_status = case when v_parcel_count = v_expected_count then 'READY_FOR_INBOUND' else warehouse_status end,
    workflow_stage = case when v_parcel_count = v_expected_count then 'DATA_ENTRY_WAYBILL_CREATED' else workflow_stage end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_entry_review',
        jsonb_build_object(
          'status', case when v_parcel_count=v_expected_count then 'APPROVED' else 'PARTIAL' end,
          'pending_count', v_expected_count-v_parcel_count,
          'evidence_mode',case when v_os_evidence then 'OS_SOFTCOPY' else 'RIDER_PROOF' end,
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
    'photo_review_status', case when v_os_evidence then 'OS_SOFTCOPY_AUTHORIZED' else 'APPROVED' end,
    'data_entry_status', 'WAYBILL_CREATED',
    'warehouse_status', 'READY_FOR_INBOUND',
    'canonical_pickup_preserved', true
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_create_ready_waybill(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_access jsonb;
  v_mode text;
  v_dry_run boolean := lower(coalesce(p_payload ->> 'dry_run','false')) in ('true','1','yes','on');
  v_request_id text := nullif(btrim(coalesce(p_payload ->> 'request_id','')), '');
  v_pickup_id text := nullif(btrim(coalesce(p_payload ->> 'pickup_id','')), '');
  v_actor_id uuid;
  v_actor_email text;
  v_pickup jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_detail_count integer := 0;
  v_bad_financial integer := 0;
  v_missing_parcels integer := 0;
  v_bad_way_ids integer := 0;
  v_expected integer := 1;
  v_expected_text text;
  v_payload_hash text;
  v_inserted integer;
  v_request public.be_data_entry_financial_v2_requests_v58%rowtype;
  v_legacy jsonb;
  v_locked integer := 0;
  v_response jsonb;
  v_sequences integer[];
  v_sync jsonb;
  v_os_evidence boolean := false;
begin
  v_access := public.be_data_entry_require_access_v57('update', true);
  if nullif(v_access ->> 'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access ->> 'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access ->> 'actor_email')), '');

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;

  if coalesce(v_mode,'MUTATION_SHADOW') <> 'ACTIVE' and not v_dry_run then
    return jsonb_build_object(
      'ok',false,'build','DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
      'generated_at',now(),'operation','CREATE_WAYBILL',
      'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','MUTATION_NOT_ACTIVE','message','Financial V2 mutation RPCs are deployed in shadow mode. Use dry_run=true until activation.'
      )),'access',v_access
    );
  end if;

  if v_request_id is null or v_pickup_id is null then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','REQUEST_AND_PICKUP_REQUIRED','message','request_id and canonical pickup_id are required.'
    )),'access',v_access);
  end if;

  if jsonb_typeof(v_payload->'parcel_sequences') is distinct from 'array' then
    raise exception 'Select completed parcel sequences.' using errcode='22023';
  end if;
  select array_agg(distinct value::integer order by value::integer) into v_sequences
  from jsonb_array_elements_text(v_payload->'parcel_sequences');
  if coalesce(cardinality(v_sequences),0)=0 or cardinality(v_sequences)>5000 then
    raise exception 'Select between 1 and 5000 completed parcels.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('WAYBILL:' || v_pickup_id, 0));
  perform 1 from public.be_data_entry_parcel_details where pickup_id=v_pickup_id and parcel_sequence=any(v_sequences) for update;
  select to_jsonb(p) into v_pickup
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id;
  if v_pickup is null then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.'
    )),'access',v_access);
  end if;

  if v_actor_id is not null
     and nullif(v_pickup ->> 'assigned_rider_id','')=v_actor_id::text then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','SEGREGATION_OF_DUTIES','message','The Rider who submitted pickup proof cannot approve and create the waybill.'
    )),'access',v_access);
  end if;

  v_os_evidence := private.be_ready_waybill_os_evidence_v1(v_pickup_id,v_sequences);
  if v_os_evidence then perform public.be_data_entry_require_access_v57('upload',false); end if;

  if not v_os_evidence and (nullif(v_pickup ->> 'pickup_verified_at','') is null
     or nullif(v_pickup ->> 'pickup_collected_at','') is null
     or upper(coalesce(v_pickup ->> 'rider_status','')) not in ('COLLECTED','TO_WAREHOUSE')) then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','RIDER_COLLECTION_NOT_VERIFIED','message','Pickup must be Rider-verified and collected before waybill creation.'
    )),'access',v_access);
  end if;

  select
    count(*)::integer,
    count(*) filter (where upper(coalesce(d.financial_validation_status,''))<>'OK')::integer,
    count(*) filter (where d.delivery_way_id <> (v_pickup_id || '-' || lpad(d.parcel_sequence::text,3,'0')))::integer,
    count(*) filter (where not exists (
      select 1 from public.parcels p
      where upper(btrim(coalesce(p.way_id,'')))=upper(btrim(d.delivery_way_id))
        and upper(coalesce(p.validation_status,''))='OK'
    ))::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'parcel_sequence',d.parcel_sequence,
      'delivery_way_id',d.delivery_way_id,
      'recipient_name',d.recipient_name,
      'contact_no_1',d.contact_no_1,
      'contact_no_2',d.contact_no_2,
      'township',d.township,
      'recipient_address',d.recipient_address,
      'customer_tier',d.customer_tier,
      'item_price',d.item_price,
      'weight_kg',d.weight_kg,
      'surcharge',d.surcharge,
      'delivery_fee',d.delivery_fee,
      'cod_amount',d.cod_amount,
      'actual_collect',d.actual_collect,
      'destination',d.destination,
      'pickup_by','DATA_ENTRY_FINANCIAL_V2',
      'remark',d.remark,
      'proof_photo_path',d.proof_photo_path
    ) order by d.parcel_sequence),'[]'::jsonb)
  into v_detail_count,v_bad_financial,v_bad_way_ids,v_missing_parcels,v_rows
  from public.be_data_entry_parcel_details d
  where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences);

  v_expected_text := coalesce(
    case when v_os_evidence then nullif(nullif(v_pickup ->> 'verified_parcels',''),'0') else nullif(v_pickup ->> 'verified_parcels','') end,
    nullif(v_pickup ->> 'expected_parcels',''),
    nullif(v_pickup ->> 'expected_parcel_count','')
  );
  if v_expected_text ~ '^[0-9]+$' then
    v_expected := greatest(v_expected_text::integer,1);
  end if;

  if v_detail_count=0 or v_detail_count<>cardinality(v_sequences) or v_detail_count>v_expected
     or exists (select 1 from unnest(v_sequences) s where s<1 or s>v_expected)
     or exists (select 1 from public.be_data_entry_parcel_details d
       where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences)
       and (d.saved_at is null or nullif(btrim(d.recipient_name),'') is null or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township))='unknown'
         or (coalesce(d.location_required,true) and not exists (
           select 1 from public.be_delivery_location_registry l where l.delivery_way_id=d.delivery_way_id
             and l.review_status='ACCEPTED' and l.latitude is not null and l.longitude is not null
             and l.address_original=d.recipient_address and l.township=d.township))))
     or v_bad_financial<>0 or v_bad_way_ids<>0 or v_missing_parcels<>0 then
    return jsonb_build_object(
      'ok',false,'operation','CREATE_WAYBILL','pickup_id',v_pickup_id,
      'readiness',jsonb_build_object(
        'expected_parcels',v_expected,'saved_details',v_detail_count,
        'non_ok_financial_rows',v_bad_financial,'noncanonical_way_ids',v_bad_way_ids,
        'missing_ok_parcels',v_missing_parcels
      ),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','WAYBILL_READINESS_FAILED',
        'message','Selected parcels must have saved, valid financial details and approved delivery locations. Incomplete parcels remain pending.'
      )),'access',v_access
    );
  end if;

  if not v_os_evidence and nullif(v_pickup ->> 'pickup_proof_url','') is null
     and not exists (
       select 1 from public.be_data_entry_parcel_details d
       where d.pickup_id=v_pickup_id and nullif(btrim(d.proof_photo_path),'') is not null
     ) then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','PICKUP_PROOF_REQUIRED','message','Rider pickup proof or parcel proof is required before waybill creation.'
    )),'access',v_access);
  end if;

  v_response := jsonb_build_object(
    'ok',true,'build','DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
    'generated_at',now(),'operation','CREATE_WAYBILL','dry_run',v_dry_run,
    'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),'request_id',v_request_id,
    'pickup_id',v_pickup_id,'expected_parcels',v_expected,'ready_parcels',v_detail_count,
    'canonical_pickup_preserved',true,'evidence_mode',case when v_os_evidence then 'OS_SOFTCOPY' else 'RIDER_PROOF' end,'pending_parcels',v_expected-v_detail_count,'parcel_sequences',to_jsonb(v_sequences),'access',v_access
  );

  if v_dry_run then
    return v_response || jsonb_build_object(
      'persisted',false,'waybill_created',false,'financial_rows_locked',0
    );
  end if;

  if v_actor_email is null then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','ACTOR_EMAIL_REQUIRED','message','An authenticated Data Entry user email is required for waybill creation.'
    )),'access',v_access);
  end if;

  v_payload_hash := md5((v_payload - 'dry_run')::text);
  insert into public.be_data_entry_financial_v2_requests_v58(
    request_id,operation,actor_id,payload_hash,status
  ) values (v_request_id,'CREATE_WAYBILL',v_actor_id,v_payload_hash,'IN_PROGRESS')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted=0 then
    select * into v_request
    from public.be_data_entry_financial_v2_requests_v58
    where request_id=v_request_id;
    if v_request.operation<>'CREATE_WAYBILL' or v_request.payload_hash<>v_payload_hash then
      return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
        'code','IDEMPOTENCY_CONFLICT','message','request_id was already used with a different operation or payload.'
      )),'access',v_access);
    end if;
    if v_request.status='COMPLETE' and v_request.response is not null then
      return v_request.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','REQUEST_IN_PROGRESS','message','An identical waybill request is already in progress.'
    )),'access',v_access);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('WAYBILL:' || v_pickup_id, 0));
  v_legacy := private.be_data_entry_create_ready_waybill_rows_v1(v_pickup_id,v_rows,v_actor_email);
  if not coalesce((v_legacy ->> 'ok')::boolean,false) then
    raise exception using
      errcode='P0001',
      message='Legacy waybill workflow did not confirm success.',
      detail=v_legacy::text;
  end if;

  update public.parcels p set
    authorized_by=v_actor_id,
    financial_locked_at=now(),
    financial_locked_by=v_actor_id,
    financial_lock_reason='WAYBILL_CREATED:' || v_request_id,
    updated_at=now()
  where exists (
    select 1 from public.be_data_entry_parcel_details d
    where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences)
      and upper(btrim(d.delivery_way_id))=upper(btrim(p.way_id))
  );
  get diagnostics v_locked = row_count;
  if v_locked <> v_detail_count then
    raise exception using
      errcode='P0001',
      message='Waybill was created but not every Financial V2 parcel row was locked.',
      detail=jsonb_build_object('pickup_id',v_pickup_id,'expected_locks',v_detail_count,'actual_locks',v_locked)::text;
  end if;

  v_sync := private.be_data_entry_waybill_sync_ready_v1(v_pickup_id,v_sequences,null,null);
  v_response := v_response || jsonb_build_object(
    'printable_count',v_sync->'printable_count',
    'persisted',true,'waybill_created',coalesce((v_legacy ->> 'ok')::boolean,false),
    'waybill_no',v_legacy ->> 'waybill_no','financial_rows_locked',v_locked,
    'legacy_workflow_result',v_legacy
  );

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    v_actor_id,v_actor_email,v_access ->> 'actor_role',
    'DATA_ENTRY_FINANCIAL_V2_WAYBILL_CREATED','PICKUP',v_pickup_id,
    jsonb_build_object(
      'request_id',v_request_id,'before_value',jsonb_build_object('waybill_created',false),
      'after_value',jsonb_build_object('waybill_no',v_legacy ->> 'waybill_no','locked_rows',v_locked),
      'reason','FINANCIAL_V2_WAYBILL_CREATION'
    ),
    'DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
    'DATA_ENTRY_FINANCIAL_V2_CREATE_WAYBILL','PICKUP',v_pickup_id,v_response
  );

  update public.be_data_entry_financial_v2_requests_v58
  set status='COMPLETE',response=v_response,completed_at=now()
  where request_id=v_request_id;

  return v_response;
end
$function$
;