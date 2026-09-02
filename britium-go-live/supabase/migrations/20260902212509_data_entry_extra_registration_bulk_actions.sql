begin;

-- Data Entry V14 makes merchant-requested additions explicit and auditable.
-- A parcel sequence can only be saved after it is inside the pickup's
-- authoritative requested/verified range.  Save All is one database
-- transaction, so a failing row rolls the whole batch back.

alter table public.be_data_entry_financial_v2_requests_v58
  drop constraint if exists be_data_entry_financial_v2_requests_v58_operation_check;

alter table public.be_data_entry_financial_v2_requests_v58
  add constraint be_data_entry_financial_v2_requests_v58_operation_check
  check (operation in ('SAVE','IMPORT','CREATE_WAYBILL','ADD_REGISTRATIONS','SAVE_ALL'));

alter function public.be_data_entry_financial_v2_save(jsonb)
rename to be_data_entry_financial_v2_save_v13_2_unbounded;

revoke all on function public.be_data_entry_financial_v2_save_v13_2_unbounded(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.be_data_entry_financial_v2_save(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb;
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_sequence_text text := nullif(btrim(coalesce(p_payload->>'parcel_sequence','')),'');
  v_sequence integer;
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_result jsonb;
  v_is_addition boolean := false;
begin
  v_access := public.be_data_entry_require_access_v57('create',false);

  if v_pickup_id is null then
    return jsonb_build_object(
      'ok',false,'operation','SAVE',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_REQUIRED','field','pickup_id','message','pickup_id is required.'
      )),'access',v_access
    );
  end if;

  if v_sequence_text is null or v_sequence_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PARCEL_SEQUENCE_REQUIRED','field','parcel_sequence',
        'message','parcel_sequence must be a positive integer.'
      )),'access',v_access
    );
  end if;
  v_sequence := v_sequence_text::integer;

  select
    greatest(
      coalesce(p.expected_parcels,0),
      coalesce(p.expected_parcel_count,0),
      coalesce(p.parcel_count,0),
      0
    ),
    greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,'operation','SAVE',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_NOT_FOUND','field','pickup_id',
        'message','Canonical production pickup was not found.'
      )),'access',v_access
    );
  end if;

  v_authorized_count := greatest(v_requested_count,v_verified_count);
  v_is_addition := v_sequence>v_requested_count;

  if v_sequence>v_authorized_count then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,
      'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
      'errors',jsonb_build_array(jsonb_build_object(
        'code','UNAUTHORIZED_EXTRA_REGISTRATION','field','parcel_sequence',
        'message','Authorize the merchant-requested additional registration before saving this parcel sequence.'
      )),'access',v_access
    );
  end if;

  if v_is_addition
     and not exists (
       select 1
       from public.be_audit_events a
       where a.action='DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED'
         and a.resource_type='PICKUP'
         and a.resource_id=v_pickup_id
         and coalesce(a.details#>>'{after_value,authorized_parcels}','') ~ '^[0-9]+$'
         and (a.details#>>'{after_value,authorized_parcels}')::integer>=v_sequence
     )
     and not exists (
       select 1
       from public.be_pickup_parcel_verifications v
       where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
     ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,
      'errors',jsonb_build_array(jsonb_build_object(
        'code','EXTRA_REGISTRATION_AUDIT_REQUIRED','field','parcel_sequence',
        'message','This additional parcel has no audited Data Entry authorization or Rider verification.'
      )),'access',v_access
    );
  end if;

  if not v_is_addition and not exists (
    select 1
    from public.be_pickup_parcel_verifications v
    where v.pickup_id=v_pickup_id
      and v.parcel_sequence=v_sequence
      and upper(coalesce(
        nullif(v.proof_check_status,''),
        nullif(v.verification_status,''),
        nullif(v.status,''),
        ''
      )) in ('APPROVED','APPROVED_AFTER_REUPLOAD','PHOTO_APPROVED','VERIFIED','RIDER_VERIFIED')
  ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PARCEL_PHOTO_APPROVAL_REQUIRED','field','parcel_sequence',
        'message','Approve the Rider or Driver parcel photo before saving this requested parcel.'
      )),'access',v_access
    );
  end if;

  v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);
  if coalesce((v_result->>'persisted')::boolean,false) then
    update public.be_portal_pickup_requests p
    set registered_parcel_count=(
          select count(*)::integer
          from public.be_data_entry_parcel_details d
          where d.pickup_id=v_pickup_id
        ),
        updated_at=now()
    where p.pickup_id=v_pickup_id;
  end if;
  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'registration_scope',case when v_is_addition then 'AUTHORIZED_MERCHANT_ADDITION' else 'PICKUP_REQUEST' end,
    'requested_parcels',v_requested_count,
    'authorized_parcels',v_authorized_count,
    'additional_registration',v_is_addition
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_save(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_save(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_save(jsonb) is
  'V14 bounded save. Requested parcel rows require approved proof; merchant-added rows require prior audited count authorization.';

create or replace function public.be_data_entry_financial_v2_add_registrations(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb;
  v_mode text;
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_count_text text := nullif(btrim(coalesce(p_payload->>'count','1')),'');
  v_count integer;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_detail_max integer := 0;
  v_proof_max integer := 0;
  v_current_count integer := 0;
  v_new_count integer := 0;
  v_first_sequence integer := 0;
  v_payload_hash text;
  v_inserted integer := 0;
  v_request public.be_data_entry_financial_v2_requests_v58%rowtype;
  v_sequences jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  v_access := public.be_data_entry_require_access_v57('update',false);
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;
  if coalesce(v_mode,'MUTATION_SHADOW')<>'ACTIVE' then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS','mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','MUTATION_NOT_ACTIVE','message','Data Entry mutations are not active.'
      )),'access',v_access
    );
  end if;

  if v_request_id is null or v_pickup_id is null or v_reason is null then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','ADDITION_DETAILS_REQUIRED',
        'message','request_id, pickup_id, and the merchant addition reason are required.'
      )),'access',v_access
    );
  end if;
  if v_count_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','INVALID_ADDITION_COUNT','field','count','message','Addition count must be a positive integer.'
      )),'access',v_access
    );
  end if;
  v_count := v_count_text::integer;
  if v_count>50 then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','ADDITION_COUNT_LIMIT','field','count','message','Add no more than 50 registrations in one request.'
      )),'access',v_access
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('DATA_ENTRY_ADD:'||v_pickup_id,0));

  select
    greatest(
      coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),
      coalesce(p.parcel_count,0),0
    ),
    greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.'
      )),'access',v_access
    );
  end if;

  if exists (
    select 1 from public.parcels p
    where upper(btrim(coalesce(p.way_id,''))) like upper(v_pickup_id||'-%')
      and p.financial_locked_at is not null
  ) then
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','WAYBILL_ALREADY_LOCKED','message','Additional registrations cannot be added after the pickup waybill is financially locked.'
      )),'access',v_access
    );
  end if;

  v_payload_hash := md5(v_payload::text);
  insert into public.be_data_entry_financial_v2_requests_v58(
    request_id,operation,actor_id,payload_hash,status
  ) values (v_request_id,'ADD_REGISTRATIONS',v_actor_id,v_payload_hash,'IN_PROGRESS')
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    select * into v_request
    from public.be_data_entry_financial_v2_requests_v58
    where request_id=v_request_id;
    if v_request.operation<>'ADD_REGISTRATIONS' or v_request.payload_hash<>v_payload_hash then
      return jsonb_build_object(
        'ok',false,'operation','ADD_REGISTRATIONS',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','IDEMPOTENCY_CONFLICT','message','request_id was already used with a different operation or payload.'
        )),'access',v_access
      );
    end if;
    if v_request.status='COMPLETE' and v_request.response is not null then
      return v_request.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object(
      'ok',false,'operation','ADD_REGISTRATIONS',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','REQUEST_IN_PROGRESS','message','The same registration-addition request is already in progress.'
      )),'access',v_access
    );
  end if;

  select coalesce(max(d.parcel_sequence),0) into v_detail_max
  from public.be_data_entry_parcel_details d
  where d.pickup_id=v_pickup_id;
  select coalesce(max(v.parcel_sequence),0) into v_proof_max
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup_id;

  v_current_count := greatest(v_requested_count,v_verified_count,v_detail_max,v_proof_max);
  v_first_sequence := v_current_count+1;
  v_new_count := v_current_count+v_count;

  update public.be_portal_pickup_requests p
  set verified_parcels=v_new_count,
      updated_at=now()
  where p.pickup_id=v_pickup_id;

  select coalesce(jsonb_agg(s order by s),'[]'::jsonb) into v_sequences
  from generate_series(v_first_sequence,v_new_count) as s;

  v_response := jsonb_build_object(
    'ok',true,'operation','ADD_REGISTRATIONS','persisted',true,
    'request_id',v_request_id,'pickup_id',v_pickup_id,
    'requested_parcels',v_requested_count,
    'previous_authorized_parcels',v_current_count,
    'authorized_parcels',v_new_count,
    'added_count',v_count,'sequences',v_sequences,
    'reason',v_reason,'mutation_mode',v_mode,'access',v_access
  );

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    v_actor_id,v_actor_email,v_actor_role,
    'DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED','PICKUP',v_pickup_id,
    jsonb_build_object(
      'request_id',v_request_id,
      'before_value',jsonb_build_object('authorized_parcels',v_current_count),
      'after_value',jsonb_build_object('authorized_parcels',v_new_count,'sequences',v_sequences),
      'reason',v_reason
    ),
    'DATA_ENTRY_EXTRA_REGISTRATION_V14_20260902',
    'DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED','PICKUP',v_pickup_id,v_response
  );

  update public.be_data_entry_financial_v2_requests_v58
  set status='COMPLETE',response=v_response,completed_at=now()
  where request_id=v_request_id;

  return v_response;
end
$function$;

revoke all on function public.be_data_entry_financial_v2_add_registrations(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_add_registrations(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_add_registrations(jsonb) is
  'V14 atomically authorizes merchant-requested parcel additions, advances verified count, and writes idempotency plus audit lineage.';

create or replace function public.be_data_entry_financial_v2_save_all(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb;
  v_mode text;
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_rows jsonb := coalesce(p_payload->'rows','[]'::jsonb);
  v_reason text := coalesce(nullif(btrim(p_payload->>'reason'),''),'DATA_ENTRY_FINANCIAL_V2_SAVE_ALL');
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_index integer;
  v_sequence integer;
  v_row jsonb;
  v_row_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_payload_hash text;
  v_inserted integer := 0;
  v_request public.be_data_entry_financial_v2_requests_v58%rowtype;
  v_response jsonb;
  v_failure text;
begin
  v_access := public.be_data_entry_require_access_v57('create',false);
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;
  if coalesce(v_mode,'MUTATION_SHADOW')<>'ACTIVE' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE_ALL','mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','MUTATION_NOT_ACTIVE','message','Data Entry mutations are not active.'
      )),'access',v_access
    );
  end if;

  if v_request_id is null or v_pickup_id is null or jsonb_typeof(v_rows)<>'array' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE_ALL',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SAVE_ALL_PAYLOAD_REQUIRED','message','request_id, pickup_id, and a rows array are required.'
      )),'access',v_access
    );
  end if;

  select
    greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),coalesce(p.parcel_count,0),0),
    greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok',false,'operation','SAVE_ALL',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.'
      )),'access',v_access
    );
  end if;
  v_authorized_count := greatest(v_requested_count,v_verified_count);

  if jsonb_array_length(v_rows)<>v_authorized_count or v_authorized_count<1 then
    return jsonb_build_object(
      'ok',false,'operation','SAVE_ALL','pickup_id',v_pickup_id,
      'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
      'received_rows',jsonb_array_length(v_rows),
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SAVE_ALL_ROW_COUNT_MISMATCH',
        'message','Save All requires one row for every authorized parcel in this pickup.'
      )),'access',v_access
    );
  end if;

  for v_index in 0..jsonb_array_length(v_rows)-1 loop
    v_row := v_rows->v_index;
    if coalesce(v_row->>'parcel_sequence','') !~ '^[1-9][0-9]*$'
       or (v_row->>'parcel_sequence')::integer<>v_index+1
       or btrim(coalesce(v_row->>'pickup_id',''))<>v_pickup_id then
      return jsonb_build_object(
        'ok',false,'operation','SAVE_ALL','pickup_id',v_pickup_id,
        'errors',jsonb_build_array(jsonb_build_object(
          'code','SAVE_ALL_SEQUENCE_MISMATCH','row_index',v_index,
          'message','Save All rows must be ordered, contiguous, and belong to the selected pickup.'
        )),'access',v_access
      );
    end if;
  end loop;

  v_payload_hash := md5(v_payload::text);
  insert into public.be_data_entry_financial_v2_requests_v58(
    request_id,operation,actor_id,payload_hash,status
  ) values (v_request_id,'SAVE_ALL',v_actor_id,v_payload_hash,'IN_PROGRESS')
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    select * into v_request
    from public.be_data_entry_financial_v2_requests_v58
    where request_id=v_request_id;
    if v_request.operation<>'SAVE_ALL' or v_request.payload_hash<>v_payload_hash then
      return jsonb_build_object(
        'ok',false,'operation','SAVE_ALL',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','IDEMPOTENCY_CONFLICT','message','request_id was already used with a different operation or payload.'
        )),'access',v_access
      );
    end if;
    if v_request.status='COMPLETE' and v_request.response is not null then
      return v_request.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object(
      'ok',false,'operation','SAVE_ALL',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','REQUEST_IN_PROGRESS','message','The same Save All request is already in progress.'
      )),'access',v_access
    );
  end if;

  begin
    for v_index in 0..jsonb_array_length(v_rows)-1 loop
      v_sequence := v_index+1;
      v_row := (v_rows->v_index) || jsonb_build_object(
        'pickup_id',v_pickup_id,
        'parcel_sequence',v_sequence,
        'request_id',v_request_id||':PARCEL:'||lpad(v_sequence::text,3,'0'),
        'dry_run',false,
        'source_file_name','PORTAL_FINANCIAL_V2_SAVE_ALL',
        'reason',v_reason
      );
      v_row_result := public.be_data_entry_financial_v2_save(v_row);
      if not coalesce((v_row_result->>'ok')::boolean,false)
         or not coalesce((v_row_result->>'persisted')::boolean,false) then
        v_failure := coalesce(
          v_row_result#>>'{errors,0,message}',
          v_row_result->>'message',
          'Parcel '||v_sequence||' was not persisted.'
        );
        raise exception using errcode='P0001',message=v_failure;
      end if;
      v_results := v_results || jsonb_build_array(v_row_result);
    end loop;
  exception when others then
    v_failure := coalesce(v_failure,sqlerrm,'Save All failed.');
    v_response := jsonb_build_object(
      'ok',false,'operation','SAVE_ALL','persisted',false,'rolled_back',true,
      'request_id',v_request_id,'pickup_id',v_pickup_id,'saved_count',0,
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SAVE_ALL_ROLLED_BACK','message',v_failure
      )),'mutation_mode',v_mode,'access',v_access
    );
    update public.be_data_entry_financial_v2_requests_v58
    set status='COMPLETE',response=v_response,completed_at=now()
    where request_id=v_request_id;
    return v_response;
  end;

  v_response := jsonb_build_object(
    'ok',true,'operation','SAVE_ALL','persisted',true,'rolled_back',false,
    'request_id',v_request_id,'pickup_id',v_pickup_id,
    'saved_count',jsonb_array_length(v_results),'rows',v_results,
    'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
    'mutation_mode',v_mode,'access',v_access
  );

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    v_actor_id,v_actor_email,v_actor_role,
    'DATA_ENTRY_FINANCIAL_V2_SAVE_ALL','PICKUP',v_pickup_id,
    jsonb_build_object(
      'request_id',v_request_id,'saved_count',jsonb_array_length(v_results),
      'reason',v_reason
    ),
    'DATA_ENTRY_BULK_ACTIONS_V14_20260902',
    'DATA_ENTRY_FINANCIAL_V2_SAVE_ALL','PICKUP',v_pickup_id,v_response
  );

  update public.be_data_entry_financial_v2_requests_v58
  set status='COMPLETE',response=v_response,completed_at=now()
  where request_id=v_request_id;

  return v_response;
end
$function$;

revoke all on function public.be_data_entry_financial_v2_save_all(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_save_all(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_save_all(jsonb) is
  'V14 atomic Save All. The complete contiguous authorized pickup is persisted, or every row is rolled back.';

commit;
