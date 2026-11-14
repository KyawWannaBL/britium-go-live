begin;

create or replace function public.be_data_entry_financial_v2_save_batch_v22(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb := public.be_data_entry_require_access_v57('create',false);
  v_mode text;
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_rows jsonb := coalesce(p_payload->'rows','[]'::jsonb);
  v_reason text := coalesce(nullif(btrim(p_payload->>'reason'),''),'DATA_ENTRY_FINANCIAL_V2_SAVE_BATCH_V22');
  v_actor_id uuid;
  v_actor_email text := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role text := nullif(btrim(v_access->>'actor_role'),'');
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_row_count integer := 0;
  v_first_sequence integer := 0;
  v_last_sequence integer := 0;
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
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  select mutation_mode into v_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton;
  if coalesce(v_mode,'MUTATION_SHADOW')<>'ACTIVE' then
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'errors',jsonb_build_array(jsonb_build_object('code','MUTATION_NOT_ACTIVE','message','Data Entry mutations are not active.')),
      'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),'access',v_access);
  end if;

  if v_request_id is null or v_pickup_id is null or jsonb_typeof(v_rows)<>'array' then
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_PAYLOAD_REQUIRED','message','request_id, pickup_id, and a rows array are required.')),'access',v_access);
  end if;
  v_row_count := jsonb_array_length(v_rows);
  if v_row_count<1 or v_row_count>200 then
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_SIZE_INVALID','message','Each upload batch must contain from 1 to 200 parcels.')),'access',v_access);
  end if;

  select greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),coalesce(p.parcel_count,0),0),
         greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id for update;
  if not found then
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'errors',jsonb_build_array(jsonb_build_object('code','PICKUP_NOT_FOUND','message','Canonical production pickup was not found.')),'access',v_access);
  end if;
  v_authorized_count := greatest(v_requested_count,v_verified_count);

  for v_index in 0..v_row_count-1 loop
    v_row := v_rows->v_index;
    if coalesce(v_row->>'parcel_sequence','') !~ '^[1-9][0-9]*$'
       or btrim(coalesce(v_row->>'pickup_id',''))<>v_pickup_id then
      return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
        'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_SEQUENCE_INVALID','row_index',v_index,'message','Every row needs a positive parcel sequence and the selected pickup ID.')),'access',v_access);
    end if;
    v_sequence := (v_row->>'parcel_sequence')::integer;
    if v_index=0 then v_first_sequence:=v_sequence; end if;
    if v_sequence<>v_first_sequence+v_index then
      return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
        'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_NOT_CONTIGUOUS','row_index',v_index,'message','Rows in one upload must have ordered contiguous parcel sequences.')),'access',v_access);
    end if;
    v_last_sequence:=v_sequence;
  end loop;
  if v_last_sequence>v_authorized_count then
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'authorized_parcels',v_authorized_count,'last_sequence',v_last_sequence,
      'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_NOT_AUTHORIZED','message','Authorize the additional parcel registrations before saving this batch.')),'access',v_access);
  end if;

  v_payload_hash:=md5(v_payload::text);
  insert into public.be_data_entry_financial_v2_requests_v58(request_id,operation,actor_id,payload_hash,status)
  values(v_request_id,'SAVE_BATCH_V22',v_actor_id,v_payload_hash,'IN_PROGRESS') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    select * into v_request from public.be_data_entry_financial_v2_requests_v58 where request_id=v_request_id;
    if v_request.operation<>'SAVE_BATCH_V22' or v_request.payload_hash<>v_payload_hash then
      return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
        'errors',jsonb_build_array(jsonb_build_object('code','IDEMPOTENCY_CONFLICT','message','request_id was already used with a different operation or payload.')),'access',v_access);
    end if;
    if v_request.status='COMPLETE' and v_request.response is not null then return v_request.response||jsonb_build_object('idempotent_replay',true); end if;
    return jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,
      'errors',jsonb_build_array(jsonb_build_object('code','REQUEST_IN_PROGRESS','message','The same upload batch is already in progress.')),'access',v_access);
  end if;

  begin
    for v_index in 0..v_row_count-1 loop
      v_sequence:=(v_rows->v_index->>'parcel_sequence')::integer;
      v_row := (v_rows->v_index)||jsonb_build_object(
        'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,
        'request_id',v_request_id||':PARCEL:'||lpad(v_sequence::text,3,'0'),
        'dry_run',false,'source_file_name','PORTAL_FINANCIAL_V2_SAVE_BATCH_V22','reason',v_reason);
      v_row_result:=public.be_data_entry_financial_v2_save(v_row);
      if not coalesce((v_row_result->>'ok')::boolean,false) or not coalesce((v_row_result->>'persisted')::boolean,false) then
        v_failure:=coalesce(v_row_result#>>'{errors,0,message}',v_row_result->>'message','Parcel '||v_sequence||' was not persisted.');
        raise exception using errcode='P0001',message=v_failure;
      end if;
      v_results:=v_results||jsonb_build_array(v_row_result);
    end loop;
  exception when others then
    v_failure:=coalesce(v_failure,sqlerrm,'Upload batch save failed.');
    v_response:=jsonb_build_object('ok',false,'operation','SAVE_BATCH_V22','persisted',false,'rolled_back',true,
      'request_id',v_request_id,'pickup_id',v_pickup_id,'saved_count',0,
      'errors',jsonb_build_array(jsonb_build_object('code','SAVE_BATCH_ROLLED_BACK','message',v_failure)),
      'mutation_mode',v_mode,'access',v_access);
    update public.be_data_entry_financial_v2_requests_v58 set status='COMPLETE',response=v_response,completed_at=now() where request_id=v_request_id;
    return v_response;
  end;

  v_response:=jsonb_build_object('ok',true,'operation','SAVE_BATCH_V22','persisted',true,'rolled_back',false,
    'request_id',v_request_id,'pickup_id',v_pickup_id,'saved_count',v_row_count,'rows',v_results,
    'first_sequence',v_first_sequence,'last_sequence',v_last_sequence,'authorized_parcels',v_authorized_count,
    'more_batches_allowed',true,'mutation_mode',v_mode,'access',v_access);
  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details,upload_code,event_type,entity_type,entity_id,payload)
  values(v_actor_id,v_actor_email,v_actor_role,'DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED','PICKUP',v_pickup_id,
    jsonb_build_object('request_id',v_request_id,'saved_count',v_row_count,'first_sequence',v_first_sequence,'last_sequence',v_last_sequence,'reason',v_reason),
    'DATA_ENTRY_CONTINUOUS_BULK_V22_20260904','DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED','PICKUP',v_pickup_id,v_response);
  update public.be_data_entry_financial_v2_requests_v58 set status='COMPLETE',response=v_response,completed_at=now() where request_id=v_request_id;
  return v_response;
end
$function$;

revoke all on function public.be_data_entry_financial_v2_save_batch_v22(jsonb) from public,anon;
grant execute on function public.be_data_entry_financial_v2_save_batch_v22(jsonb) to authenticated,service_role;
comment on function public.be_data_entry_financial_v2_save_batch_v22(jsonb) is
  'V22 atomic consecutive Data Entry upload: 1-200 contiguous rows per batch, arbitrary authorized sequence range, idempotent and audited.';

commit;
