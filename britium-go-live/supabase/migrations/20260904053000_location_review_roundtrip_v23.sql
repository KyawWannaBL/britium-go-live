begin;

create or replace function public.be_delivery_location_review_batch_v23(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_access jsonb := public.be_data_entry_require_access_v57('update',false);
  v_rows jsonb := coalesce(p_payload->'rows','[]'::jsonb);
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_source_file text := nullif(btrim(coalesce(p_payload->>'source_file_name','')),'');
  v_actor_id uuid;
  v_actor_email text := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role text := nullif(btrim(v_access->>'actor_role'),'');
  v_index integer;
  v_item jsonb;
  v_delivery_way_id text;
  v_pickup_id text;
  v_sequence integer;
  v_action text;
  v_reason text;
  v_lat numeric;
  v_lng numeric;
  v_authorized integer;
  v_source text;
  v_existing public.be_delivery_location_registry;
  v_saved public.be_delivery_location_registry;
  v_results jsonb := '[]'::jsonb;
begin
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  if v_request_id is null then raise exception 'request_id is required.'; end if;
  if jsonb_typeof(v_rows)<>'array' or jsonb_array_length(v_rows)<1 or jsonb_array_length(v_rows)>200 then
    raise exception 'Each location-review batch must contain from 1 to 200 rows.';
  end if;

  for v_index in 0..jsonb_array_length(v_rows)-1 loop
    v_item := v_rows->v_index;
    v_delivery_way_id := nullif(btrim(coalesce(v_item->>'delivery_way_id','')),'');
    v_pickup_id := nullif(btrim(coalesce(v_item->>'pickup_id','')),'');
    v_action := upper(nullif(btrim(coalesce(v_item->>'action','')),''));
    v_reason := nullif(btrim(coalesce(v_item->>'reason','')),'');
    v_lat := nullif(btrim(coalesce(v_item->>'latitude','')),'')::numeric;
    v_lng := nullif(btrim(coalesce(v_item->>'longitude','')),'')::numeric;
    if coalesce(v_item->>'parcel_sequence','') !~ '^[1-9][0-9]*$' then
      raise exception 'Row % requires a positive parcel_sequence.',v_index+1;
    end if;
    v_sequence := (v_item->>'parcel_sequence')::integer;
    if v_delivery_way_id is null or v_pickup_id is null
       or v_delivery_way_id<>(v_pickup_id||'-'||lpad(v_sequence::text,3,'0')) then
      raise exception 'Row % does not match its canonical pickup and Delivery Way ID.',v_index+1;
    end if;
    if v_action not in ('APPLY_CORRECTION','SKIP_REVIEW') then
      raise exception 'Row % action must be APPLY_CORRECTION or SKIP_REVIEW.',v_index+1;
    end if;
    if length(coalesce(v_reason,''))<10 then
      raise exception 'Row % requires an audit reason of at least 10 characters.',v_index+1;
    end if;
    if v_lat is null or v_lng is null or v_lat not between 9 and 29 or v_lng not between 92 and 102
       or (v_lat=0 and v_lng=0) then
      raise exception 'Row % requires valid Myanmar coordinates.',v_index+1;
    end if;

    select greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),
                    coalesce(p.parcel_count,0),coalesce(p.verified_parcels,0),0)
    into v_authorized
    from public.be_portal_pickup_requests p
    where p.pickup_id=v_pickup_id;
    if not found or v_sequence>v_authorized then
      raise exception 'Row % is outside the authorized pickup parcel range.',v_index+1;
    end if;

    select * into v_existing
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id;
    v_source := case when v_action='SKIP_REVIEW'
      then 'DATA_ENTRY_MANUAL_REVIEW_SKIPPED'
      else 'DATA_ENTRY_MANUAL_BULK_CORRECTION' end;

    insert into public.be_delivery_location_registry(
      delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,
      latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,
      updated_by,updated_at
    ) values (
      v_delivery_way_id,
      coalesce(nullif(v_existing.address_original,''),v_item->>'delivery_address',''),
      coalesce(nullif(v_existing.address_english,''),v_item->>'delivery_address',''),
      coalesce(nullif(v_existing.township,''),v_item->>'township',''),
      coalesce(v_existing.postal_code,''),coalesce(v_existing.postal_match_level,'UNRESOLVED'),
      v_lat,v_lng,coalesce(nullif(v_existing.provider_label,''),v_item->>'delivery_address',''),
      'MANUAL',1,v_source,'ACCEPTED',v_actor_id,now()
    )
    on conflict(delivery_way_id) do update set
      latitude=excluded.latitude,longitude=excluded.longitude,match_level='MANUAL',confidence=1,
      coordinate_source=excluded.coordinate_source,review_status='ACCEPTED',updated_by=v_actor_id,updated_at=now()
    returning * into v_saved;

    insert into public.be_audit_events(
      actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
      upload_code,event_type,entity_type,entity_id,payload
    ) values (
      v_actor_id,v_actor_email,v_actor_role,
      case when v_action='SKIP_REVIEW' then 'DATA_ENTRY_LOCATION_REVIEW_SKIPPED' else 'DATA_ENTRY_LOCATION_BULK_CORRECTED' end,
      'DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object('request_id',v_request_id,'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,
        'reason',v_reason,'source_file_name',coalesce(v_source_file,v_item->>'source_file_name'),
        'source_row_number',v_item->>'source_row_number','latitude',v_lat,'longitude',v_lng),
      'DATA_ENTRY_LOCATION_REVIEW_ROUNDTRIP_V23_20260904',
      case when v_action='SKIP_REVIEW' then 'DATA_ENTRY_LOCATION_REVIEW_SKIPPED' else 'DATA_ENTRY_LOCATION_BULK_CORRECTED' end,
      'DELIVERY_WAY',v_delivery_way_id,jsonb_build_object('location',to_jsonb(v_saved),'access',v_access)
    );
    v_results := v_results||jsonb_build_array(jsonb_build_object(
      'delivery_way_id',v_delivery_way_id,'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,
      'latitude',v_lat,'longitude',v_lng,'action',v_action,'coordinate_source',v_source
    ));
  end loop;

  return jsonb_build_object('ok',true,'persisted',true,'request_id',v_request_id,
    'saved_count',jsonb_array_length(v_results),'rows',v_results,
    'build','DATA_ENTRY_LOCATION_REVIEW_ROUNDTRIP_V23_20260904');
end
$function$;

revoke all on function public.be_delivery_location_review_batch_v23(jsonb) from public,anon;
grant execute on function public.be_delivery_location_review_batch_v23(jsonb) to authenticated,service_role;

comment on function public.be_delivery_location_review_batch_v23(jsonb) is
  'V23 permission-checked and audited location-review skip/correction batches; 1-200 rows per transaction and continuous workbook uploads supported.';

notify pgrst,'reload schema';

commit;
