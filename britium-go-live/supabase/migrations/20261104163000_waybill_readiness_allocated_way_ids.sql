-- Fix Data Entry waybill readiness after the November D#### canonical allocator rollout.
-- Existing verified D#### way IDs are authoritative: NEVER rewrite them to P####.
-- Replaces two backend functions only; does not publish waybills or alter COD.
-- All original access checks, proof gates, audit trails and idempotency remain intact.

CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_ready_sequences_v137(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_pickup_id,'')), '');
  v_access jsonb;
  v_sequences integer[] := '{}'::integer[];
  v_total integer := 0;
  v_non_ok_financial integer := 0;
  v_noncanonical integer := 0;
  v_missing_ok_parcels integer := 0;
  v_missing_required_fields integer := 0;
begin
  v_access := public.be_data_entry_require_access_v57('update', true);

  if v_pickup_id is null then
    raise exception 'pickup_id is required' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.be_portal_pickup_requests p
    where p.pickup_id = v_pickup_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'pickup_id', v_pickup_id,
      'ready_sequences', '[]'::jsonb,
      'ready_count', 0,
      'code', 'PICKUP_NOT_FOUND',
      'message', 'Canonical production pickup was not found.',
      'access', v_access
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(d.financial_validation_status,'')) <> 'OK'
    )::integer,
    count(*) filter (
      where not exists (
        select 1 from public.parcels authoritative
        where upper(btrim(coalesce(authoritative.way_id,'')))=upper(btrim(coalesce(d.delivery_way_id,'')))
          and authoritative.parcel_sequence=d.parcel_sequence
          and upper(coalesce(authoritative.validation_status,''))='OK'
      )
    )::integer,
    count(*) filter (
      where not exists (
        select 1
        from public.parcels p
        where upper(btrim(coalesce(p.way_id,''))) = upper(btrim(coalesce(d.delivery_way_id,'')))
          and upper(coalesce(p.validation_status,'')) = 'OK'
      )
    )::integer,
    count(*) filter (
      where nullif(btrim(d.recipient_name),'') is null
         or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null
         or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township)) = 'unknown'
    )::integer
  into
    v_total,
    v_non_ok_financial,
    v_noncanonical,
    v_missing_ok_parcels,
    v_missing_required_fields
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id;

  select coalesce(array_agg(d.parcel_sequence order by d.parcel_sequence), '{}'::integer[])
  into v_sequences
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id
    and d.saved_at is not null
    and upper(coalesce(d.financial_validation_status,''))='OK'
    and nullif(btrim(d.recipient_name),'') is not null
    and nullif(btrim(d.contact_no_1),'') is not null
    and nullif(btrim(d.recipient_address),'') is not null
    and nullif(btrim(d.township),'') is not null
    and lower(btrim(d.township)) <> 'unknown'
    and exists (
      select 1 from public.parcels canonical
      where upper(btrim(coalesce(canonical.way_id,'')))=upper(btrim(coalesce(d.delivery_way_id,'')))
        and canonical.parcel_sequence=d.parcel_sequence
        and upper(coalesce(canonical.validation_status,''))='OK'
    )
    and exists (
      select 1
      from public.parcels p
      where upper(btrim(coalesce(p.way_id,''))) = upper(btrim(d.delivery_way_id))
        and upper(coalesce(p.validation_status,'')) = 'OK'
    );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'ready_sequences', to_jsonb(v_sequences),
    'ready_count', cardinality(v_sequences),
    'total_detail_rows', v_total,
    'diagnostics', jsonb_build_object(
      'non_ok_financial_rows', v_non_ok_financial,
      'noncanonical_way_ids', v_noncanonical,
      'missing_ok_parcels', v_missing_ok_parcels,
      'missing_required_fields', v_missing_required_fields
    ),
    'message', case
      when cardinality(v_sequences) > 0 then 'Backend-authoritative waybill-ready parcel sequences resolved.'
      else 'No canonical parcel rows currently satisfy the backend waybill readiness gate.'
    end,
    'access', v_access
  );
end
$function$


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
  v_superadmin_bulkload boolean := false;
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

  v_superadmin_bulkload := public.be_superadmin_bulkload_waybill_bypass_v34(v_pickup_id);

  if v_actor_id is not null
     and not v_superadmin_bulkload
     and nullif(v_pickup ->> 'assigned_rider_id','')=v_actor_id::text then
    return jsonb_build_object('ok',false,'operation','CREATE_WAYBILL','errors',jsonb_build_array(jsonb_build_object(
      'code','SEGREGATION_OF_DUTIES','message','The Rider who submitted pickup proof cannot approve and create the waybill.'
    )),'access',v_access);
  end if;

  v_os_evidence := private.be_ready_waybill_os_evidence_v1(v_pickup_id,v_sequences);
  if v_os_evidence then perform public.be_data_entry_require_access_v57('upload',false); end if;

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

  select
    count(*)::integer,
    count(*) filter (where upper(coalesce(d.financial_validation_status,''))<>'OK' or d.saved_at is null)::integer,
    count(*) filter (where not exists (select 1 from public.parcels canonical where upper(btrim(coalesce(canonical.way_id,'')))=upper(btrim(coalesce(d.delivery_way_id,''))) and canonical.parcel_sequence=d.parcel_sequence and upper(coalesce(canonical.validation_status,''))='OK'))::integer,
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
    nullif(nullif(v_pickup ->> 'verified_parcels',''),'0'),
    nullif(v_pickup ->> 'expected_parcels',''),
    nullif(v_pickup ->> 'expected_parcel_count',''),
    nullif(v_pickup ->> 'parcel_count','')
  );
  if v_expected_text ~ '^[0-9]+$' then
    v_expected := greatest(v_expected_text::integer,1);
  end if;

  if v_detail_count=0 or v_detail_count<>cardinality(v_sequences) or v_detail_count>v_expected
     or exists (select 1 from unnest(v_sequences) s where s<1 or s>v_expected)
     or exists (select 1 from public.be_data_entry_parcel_details d
       where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences)
       and (nullif(btrim(d.recipient_name),'') is null or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township))='unknown'))
     or v_bad_way_ids<>0 or v_missing_parcels<>0 or v_bad_financial<>0 then
    return jsonb_build_object(
      'ok',false,'operation','CREATE_WAYBILL','pickup_id',v_pickup_id,
      'readiness',jsonb_build_object(
        'expected_parcels',v_expected,'saved_details',v_detail_count,
        'non_ok_financial_rows',v_bad_financial,'noncanonical_way_ids',v_bad_way_ids,
        'missing_ok_parcels',v_missing_parcels
      ),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','WAYBILL_READINESS_FAILED',
        'message','Selected parcels must exist with canonical Way IDs and required recipient, phone, township, and address details.'
      )),'access',v_access
    );
  end if;

  if not v_os_evidence and not v_superadmin_bulkload and nullif(v_pickup ->> 'pickup_proof_url','') is null
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
    'canonical_pickup_preserved',true,'evidence_mode',case when v_os_evidence then 'OS_SOFTCOPY' when v_superadmin_bulkload then 'SUPERADMIN_BULKLOAD_BYPASS' else 'RIDER_PROOF' end,'rider_verification_bypassed',v_superadmin_bulkload,'pending_parcels',v_expected-v_detail_count,'parcel_sequences',to_jsonb(v_sequences),'access',v_access
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


-- Preserve RPC grants to authenticated staff; no new public access is given.
