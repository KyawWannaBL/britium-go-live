-- UAT ONLY: stage original Save and Save All code with EXECUTE closed to application roles.
-- Explicitly retains MUTATION_SHADOW, and does NOT restore production proof triggers or real shipments.
BEGIN;
SET LOCAL statement_timeout='50s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not isolated UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_delivery_way_id_registry)<>4 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.parcels)<>0 THEN RAISE EXCEPTION 'Financial baseline mismatch'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_save_legacy_v33') THEN RAISE EXCEPTION 'Already exists be_data_entry_financial_v2_save_legacy_v33'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_save') THEN RAISE EXCEPTION 'Already exists be_data_entry_financial_v2_save'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_save_batch_v22') THEN RAISE EXCEPTION 'Already exists be_data_entry_financial_v2_save_batch_v22'; END IF;
END $gate$;
CREATE FUNCTION public.be_data_entry_financial_v2_save_legacy_v33(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := public.be_normalize_prepaid_input(p_payload);
  v_access jsonb;
  v_upload_access jsonb;
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_sequence_text text := nullif(btrim(coalesce(p_payload->>'parcel_sequence','')),'');
  v_sequence integer;
  v_delivery_way_id text;
  v_service_type text := upper(coalesce(nullif(btrim(p_payload->>'service_type'),''),'STANDARD'));
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_result jsonb;
  v_is_addition boolean := false;
  v_os_import boolean := lower(coalesce(p_payload->>'os_softcopy_import','false')) in ('true','1','yes','on');
  v_photo_bypass boolean := lower(coalesce(p_payload->>'photo_bypass','false')) in ('true','1','yes','on');
  v_photo_mode text := upper(coalesce(nullif(btrim(p_payload->>'photo_evidence_mode'),''),'PICKER_PHOTO'));
  v_photo_reason text := nullif(btrim(coalesce(p_payload->>'photo_bypass_reason','')),'');
  v_source_file text := nullif(btrim(coalesce(p_payload->>'os_source_file_name',p_payload->>'source_file_name','')),'');
  v_source_row_text text := nullif(btrim(coalesce(p_payload->>'source_row_number','')),'');
  v_source_count_text text := nullif(btrim(coalesce(p_payload->>'source_row_count','')),'');
  v_source_row integer;
  v_source_count integer;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_payload_address text := btrim(coalesce(p_payload->>'delivery_address',''));
  v_payload_address_key text;
  v_location_address text;
  v_location_address_key text;
  v_item_price numeric := case
    when btrim(coalesce(p_payload->>'item_price','')) ~ '^[0-9]+([.][0-9]+)?$'
      then (p_payload->>'item_price')::numeric
    else null
  end;
  v_route jsonb := public.be_data_entry_delivery_route_v26(p_payload->>'township',v_item_price,p_payload->>'delivery_address',p_payload->>'service_provider_code');
  v_station jsonb := public.be_data_entry_handoff_station_v19(
    p_payload->>'handoff_station_code',p_payload->>'handoff_station_name'
  );
  v_provider text := nullif(v_route->>'provider_code','');
  v_region text := nullif(v_route->>'region_code','');
  v_mode text := nullif(v_route->>'delivery_mode','');
  v_map_required boolean := coalesce((v_route->>'map_required')::boolean,false);
  v_station_required boolean := coalesce((v_route->>'station_required')::boolean,false);
begin

  v_access := public.be_data_entry_require_access_v57('create',false);
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'create');
  if upper(btrim(coalesce(v_payload->>'merchant_id',''))) in ('BBB','BLK') then
    if public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name') is null then
      return jsonb_build_object('ok',false,'persisted',false,'errors',jsonb_build_array(jsonb_build_object('code','CONSOLIDATED_SOURCE_MERCHANT_REQUIRED','message','Original merchant needs a unique approved name/code mapping.')));
    end if;
    v_payload:=v_payload||jsonb_build_object('merchant_id',public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name'),'container_merchant_code',upper(btrim(coalesce(p_payload->>'merchant_id',''))));
  end if;

  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  if v_pickup_id is null then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PICKUP_REQUIRED','field','pickup_id','message','pickup_id is required.')),
      'access',v_access
    );
  end if;
  if v_sequence_text is null or v_sequence_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PARCEL_SEQUENCE_REQUIRED','field','parcel_sequence','message','parcel_sequence must be a positive integer.')),
      'access',v_access
    );
  end if;
  v_sequence := v_sequence_text::integer;
  v_delivery_way_id := public.be_allocate_delivery_way_id(v_pickup_id,v_sequence);

  if v_service_type not in ('STANDARD','EXPRESS','SAME_DAY','NEXT_DAY','ECONOMY') then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','INVALID_SERVICE_TYPE','field','service_type','message','Choose Standard, Express, Same Day, Next Day, or Economy.')),
      'access',v_access
    );
  end if;
  if v_provider is null or v_region='UNRESOLVED' or v_mode='UNRESOLVED' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','DELIVERY_ROUTE_UNRESOLVED','field','township','message','Enter a recognized township before saving.')),
      'access',v_access,'delivery_route',v_route
    );
  end if;
  if v_station_required and not coalesce((v_station->>'valid')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','HIGHWAY_HANDOFF_STATION_REQUIRED','field','handoff_station_code',
        'message','Choose Aung Mingalar, Dagon Ayar/Thiri, or enter another highway station before saving.'
      )),'access',v_access,'delivery_route',v_route
    );
  end if;

  v_payload := v_payload||jsonb_build_object(
    'delivery_way_id',v_delivery_way_id,
    'service_provider_code',v_provider,
    'delivery_region',v_region,
    'delivery_route_mode',v_mode,
    'location_required',v_map_required,
    'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
    'handoff_delivery_charge',case when v_station_required then public.be_manual_handoff_charge(v_payload,v_station->>'code') else null end, 'handoff_station_name',case when v_station_required then v_station->>'name' else null end
  );

  if v_os_import then
    v_upload_access := public.be_data_entry_require_access_v57('upload',false);
    if v_source_file is null or v_source_file !~* '^[^/\\]{1,180}\.(csv|xlsx|xls)$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_FILE_REQUIRED','field','os_source_file_name','message','A safe CSV/XLS/XLSX source filename is required for OS imports.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    if v_source_row_text is null or v_source_row_text !~ '^[1-9][0-9]*$'
       or v_source_count_text is null or v_source_count_text !~ '^[1-9][0-9]*$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_ROW_REQUIRED','field','source_row_number','message','Positive source row number and source row count are required for OS imports.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    v_source_row := v_source_row_text::integer;
    v_source_count := v_source_count_text::integer;
    if v_source_row>v_source_count+25 then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','OS_SOURCE_ROW_OUT_OF_RANGE','field','source_row_number','message','The spreadsheet row exceeds its declared row count and header allowance.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
  elsif v_photo_bypass or v_photo_mode='OS_SOFTCOPY' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PHOTO_BYPASS_REQUIRES_OS_IMPORT','field','photo_bypass','message','Photo bypass is only available for a traced OS spreadsheet import.')),
      'access',v_access
    );
  end if;

  if v_map_required then
    if v_payload_address='' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'errors',jsonb_build_array(jsonb_build_object('code','CORE_LOCATION_ADDRESS_REQUIRED','field','delivery_address','message','A receiver address is required for Yangon, Mandalay, and Naypyitaw Google location validation.')),
        'access',v_access,'upload_access',v_upload_access
      );
    end if;
    select r.address_original into v_location_address
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id
      and r.review_status='ACCEPTED'
      and upper(coalesce(r.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
      and r.latitude between 9 and 29
      and r.longitude between 92 and 102
    limit 1;
    if not found then
      v_location_address := 'REVIEW_DEFERRED';
    else
      v_payload_address_key := lower(regexp_replace(v_payload_address,'[[:space:][:punct:]]+','','g'));
      v_location_address_key := lower(regexp_replace(btrim(coalesce(v_location_address,'')),'[[:space:][:punct:]]+','','g'));
      if v_payload_address_key='' or v_location_address_key<>v_payload_address_key then
        v_location_address := 'REVIEW_DEFERRED_ADDRESS_CHANGED';
      end if;
    end if;
  else
    v_location_address := 'MAP_NOT_REQUIRED:'||v_mode;
  end if;

  if v_photo_bypass and (v_photo_mode<>'OS_SOFTCOPY' or v_photo_reason is null or length(v_photo_reason)<10) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PHOTO_BYPASS_REASON_REQUIRED','field','photo_bypass_reason','message','OS-softcopy photo bypass requires a clear reason of at least 10 characters.')),
      'access',v_access,'upload_access',v_upload_access
    );
  end if;
  if not v_photo_bypass and v_photo_mode<>'PICKER_PHOTO' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','INVALID_PHOTO_EVIDENCE_MODE','field','photo_evidence_mode','message','Use picker-photo evidence unless an explicit OS-softcopy bypass is authorized.')),
      'access',v_access,'upload_access',v_upload_access
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
      'ok',false,'operation','SAVE','build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.')),
      'access',v_access
    );
  end if;
  v_authorized_count := greatest(v_requested_count,v_verified_count);
  v_is_addition := v_sequence>v_requested_count;
  if v_sequence>v_authorized_count then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
      'errors',jsonb_build_array(jsonb_build_object('code','UNAUTHORIZED_EXTRA_REGISTRATION','field','parcel_sequence','message','Authorize the merchant-requested additional registration before saving this parcel sequence.')),
      'access',v_access
    );
  end if;

  if v_is_addition
     and not exists (
       select 1 from public.be_audit_events a
       where a.action='DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED'
         and a.resource_type='PICKUP' and a.resource_id=v_pickup_id
         and coalesce(a.details#>>'{after_value,authorized_parcels}','') ~ '^[0-9]+$'
         and (a.details#>>'{after_value,authorized_parcels}')::integer>=v_sequence
     )
     and not exists (
       select 1 from public.be_pickup_parcel_verifications v
       where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
     ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','EXTRA_REGISTRATION_AUDIT_REQUIRED','field','parcel_sequence','message','This additional parcel has no audited Data Entry authorization or Rider verification.')),
      'access',v_access
    );
  end if;

  if (not v_is_addition or v_os_import) and not v_photo_bypass and not exists (
    select 1 from public.be_pickup_parcel_verifications v
    where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
      and upper(coalesce(nullif(v.proof_check_status,''),nullif(v.verification_status,''),nullif(v.status,''),''))
        in ('APPROVED','APPROVED_AFTER_REUPLOAD','PHOTO_APPROVED','VERIFIED','RIDER_VERIFIED')
  ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object('code','PARCEL_PHOTO_APPROVAL_REQUIRED','field','parcel_sequence','message','Approve the Rider or Driver parcel photo, or explicitly authorize the traced OS-softcopy evidence option.')),
      'access',v_access
    );
  end if;

  v_payload := v_payload||jsonb_build_object(
    'service_type',v_service_type,
    'source_file_name',case when v_os_import then v_source_file else coalesce(v_source_file,'PORTAL_FINANCIAL_V2_LIVE') end
  );
  if v_station_required then v_payload := v_payload || jsonb_build_object('delivery_charges',public.be_manual_handoff_charge(v_payload,v_station->>'code')); end if; v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);

  if coalesce((v_result->>'persisted')::boolean,false) then
    update public.be_data_entry_parcel_details d
    set service_type=v_service_type,
        delivery_region=v_region,
        delivery_route_mode=v_mode,
        location_required=v_map_required,
        handoff_station_code=case when v_station_required then v_station->>'code' else null end,
        handoff_station_name=case when v_station_required then v_station->>'name' else null end,
        source_file_name=case when v_os_import then v_source_file else d.source_file_name end,
        source_row_number=case when v_os_import then v_source_row else d.source_row_number end,
        source_row_count=case when v_os_import then v_source_count else d.source_row_count end,
        photo_evidence_mode=v_photo_mode,
        photo_bypass_reason=case when v_photo_bypass then v_photo_reason else null end,
        os_imported_at=case when v_os_import then now() else d.os_imported_at end,
        os_imported_by=case when v_os_import then v_actor_id else d.os_imported_by end,
        financial_quote=coalesce(d.financial_quote,'{}'::jsonb)||jsonb_build_object(
          'service_type',v_service_type,
          'service_provider_code',v_provider,
          'delivery_region',v_region,
          'delivery_route_mode',v_mode,
          'location_required',v_map_required,
          'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
          'handoff_delivery_charge',case when v_station_required then public.be_manual_handoff_charge(v_payload,v_station->>'code') else null end, 'handoff_station_name',case when v_station_required then v_station->>'name' else null end,
          'os_softcopy_import',v_os_import,
          'os_source_file_name',case when v_os_import then v_source_file else null end,
          'source_row_number',case when v_os_import then v_source_row else null end,
          'source_row_count',case when v_os_import then v_source_count else null end,
          'photo_evidence_mode',v_photo_mode,
          'photo_bypass_reason',case when v_photo_bypass then v_photo_reason else null end
        ),
        updated_at=now()
    where d.pickup_id=v_pickup_id and d.parcel_sequence=v_sequence;

    update public.be_waybill_ledger w
    set metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object(
          'service_provider_code',v_provider,'delivery_region',v_region,
          'delivery_route_mode',v_mode,'location_required',v_map_required,
          'handoff_station_code',case when v_station_required then v_station->>'code' else null end,
          'handoff_delivery_charge',case when v_station_required then public.be_manual_handoff_charge(v_payload,v_station->>'code') else null end, 'handoff_station_name',case when v_station_required then v_station->>'name' else null end,
          'route_build','V19'
        ),updated_at=now()
    where w.delivery_way_id=v_delivery_way_id;

    update public.be_portal_pickup_requests p
    set registered_parcel_count=(
          select count(*)::integer from public.be_data_entry_parcel_details d where d.pickup_id=v_pickup_id
        ),updated_at=now()
    where p.pickup_id=v_pickup_id;

    insert into public.be_audit_events(
      actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
      upload_code,event_type,entity_type,entity_id,payload
    ) values (
      v_actor_id,v_actor_email,v_actor_role,
      'DATA_ENTRY_DELIVERY_ROUTE_ASSIGNED','DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object(
        'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'service_provider_code',v_provider,
        'delivery_region',v_region,'delivery_route_mode',v_mode,'location_required',v_map_required,
        'handoff_station',case when v_station_required then v_station else null end
      ),
      'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'DATA_ENTRY_DELIVERY_ROUTE_ASSIGNED','DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object('delivery_route',v_route,'location_address',v_location_address)
    );

    if v_os_import then
      insert into public.be_audit_events(
        actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
        upload_code,event_type,entity_type,entity_id,payload
      ) values (
        v_actor_id,v_actor_email,v_actor_role,
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object(
          'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'service_type',v_service_type,
          'source_file_name',v_source_file,'source_row_number',v_source_row,'source_row_count',v_source_count,
          'photo_evidence_mode',v_photo_mode,'location_address',v_location_address,
          'delivery_region',v_region,'delivery_route_mode',v_mode
        ),
        'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object('result',v_result,'access',v_access,'upload_access',v_upload_access)
      );
      if v_photo_bypass then
        insert into public.be_audit_events(
          actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
          upload_code,event_type,entity_type,entity_id,payload
        ) values (
          v_actor_id,v_actor_email,v_actor_role,
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object(
            'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'source_file_name',v_source_file,
            'source_row_number',v_source_row,'reason',v_photo_reason
          ),
          'DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object('reason',v_photo_reason,'actor_user_id',v_actor_id)
        );
      end if;
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
    'registration_scope',case when v_is_addition then 'AUTHORIZED_MERCHANT_ADDITION' else 'PICKUP_REQUEST' end,
    'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
    'additional_registration',v_is_addition,'os_softcopy_import',v_os_import,
    'photo_evidence_mode',v_photo_mode,'canonical_way_id',v_delivery_way_id,
    'service_provider_code',v_provider,'delivery_region',v_region,
    'delivery_route_mode',v_mode,'location_required',v_map_required,
    'handoff_station',case when v_station_required then v_station else null end
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_save_legacy_v33(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_pickup text := upper(nullif(btrim(v_payload->>'pickup_id'),''));
  v_sequence integer := CASE WHEN coalesce(v_payload->>'parcel_sequence','') ~ '^[1-9][0-9]*$' THEN (v_payload->>'parcel_sequence')::integer ELSE NULL END;
  v_temp text;
  v_source text := upper(nullif(btrim(v_payload->>'source_way_id'),''));
  v_match text[];
  v_result jsonb;
  v_moved_location integer := 0;
  v_merchant text := upper(nullif(btrim(coalesce(v_payload->>'merchant_id',v_payload->>'source_merchant_code','')),''));

BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501';END IF;
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup,'create');
  IF v_pickup IS NOT NULL AND v_sequence IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.be_data_entry_parcel_details WHERE pickup_id=v_pickup AND parcel_sequence=v_sequence) THEN PERFORM public.be_data_entry_require_access_v57('update',false);END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('WAYBILL:'||v_pickup,0));
    IF EXISTS(
      SELECT 1 FROM public.be_data_entry_parcel_details d
      WHERE d.pickup_id=v_pickup AND d.parcel_sequence=v_sequence
      AND (coalesce(d.is_printed,false) OR d.printed_at IS NOT NULL
        OR upper(coalesce(d.print_status,'')) IN ('PRINTED','PUBLISHED','CREATED')
        OR EXISTS(SELECT 1 FROM public.parcels p WHERE p.way_id=d.delivery_way_id AND p.financial_locked_at IS NOT NULL)
        OR EXISTS(SELECT 1 FROM public.be_waybill_ledger w WHERE w.delivery_way_id=d.delivery_way_id))
    ) THEN RETURN jsonb_build_object('ok',false,'persisted',false,'errors',jsonb_build_array(jsonb_build_object('code','WAYBILL_ALREADY_PUBLISHED','message','This waybill is already published. Data Entry edits are locked.')));END IF;
  END IF;
  IF v_source IS NULL THEN

    v_match := regexp_match(coalesce(v_payload->>'remarks',''),'Way ID ([A-Za-z0-9-]+)','i');
    IF v_match IS NOT NULL THEN v_source := upper(v_match[1]); END IF;
  END IF;

  IF v_pickup IS NOT NULL AND v_sequence IS NOT NULL THEN
    v_temp := v_pickup||'-'||lpad(v_sequence::text,3,'0');
  END IF;

  IF v_pickup ~ '-(BBB|BLK)-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    INSERT INTO public.be_delivery_way_id_aliases_v33(alias_way_id,canonical_way_id,pickup_id,parcel_sequence,merchant_code,source_kind,updated_at)
    VALUES(v_temp,v_source,v_pickup,v_sequence,v_merchant,'CONSOLIDATED_OS_IMPORT',now())
    ON CONFLICT (alias_way_id) DO UPDATE SET canonical_way_id=excluded.canonical_way_id,pickup_id=excluded.pickup_id,parcel_sequence=excluded.parcel_sequence,merchant_code=coalesce(excluded.merchant_code,public.be_delivery_way_id_aliases_v33.merchant_code),updated_at=now();

    -- If the UI validated a canonical source WayID before Save, temporarily expose
    -- that accepted location under the legacy generated ID inside this transaction.
    IF public.be_allocate_delivery_way_id(v_pickup,v_sequence) IS DISTINCT FROM v_source AND EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_source)
       AND NOT EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_temp) THEN
      UPDATE public.be_delivery_location_registry SET delivery_way_id=v_temp,updated_at=now() WHERE upper(delivery_way_id)=v_source;
      GET DIAGNOSTICS v_moved_location=ROW_COUNT;
    END IF;
  END IF;

  v_result := public.be_data_entry_financial_v2_save_legacy_v33(v_payload);
   IF coalesce((v_result->>'persisted')::boolean,false) THEN
    v_result:=v_result||jsonb_build_object('registration_updated_at',(SELECT updated_at FROM public.be_data_entry_parcel_details WHERE pickup_id=v_pickup AND parcel_sequence=v_sequence));
   END IF;

  IF coalesce((v_result->>'ok')::boolean,false) AND coalesce((v_result->>'persisted')::boolean,false)
     AND v_pickup ~ '-(BBB|BLK)-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    IF v_result->>'canonical_way_id' IS DISTINCT FROM v_source THEN
    PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);
  ELSIF v_moved_location>0 THEN
    UPDATE public.be_delivery_location_registry SET delivery_way_id=v_source,updated_at=now() WHERE upper(delivery_way_id)=v_temp;
  END IF;
    RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result)
      || jsonb_build_object(
           'canonical_way_id',v_source,
           'way_id',v_source,
           'server_resolution',coalesce(v_result->'server_resolution','{}'::jsonb)||jsonb_build_object(
             'canonical_way_id_source','original merchant/source WayID',
             'client_way_id_ignored',false,
             'container_pickup_id',v_pickup
           )
         );
  END IF;

  IF v_moved_location>0 THEN
    UPDATE public.be_delivery_location_registry SET delivery_way_id=v_source,updated_at=now() WHERE upper(delivery_way_id)=v_temp;
  END IF;
  RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result);
END;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_save(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_save_batch_v22(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb :=
    public.be_data_entry_require_access_v57('create',false);
  v_mode text;
  v_request_id text :=
    nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_pickup_id text :=
    nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_rows jsonb :=
    coalesce(p_payload->'rows','[]'::jsonb);
  v_reason text :=
    coalesce(
      nullif(btrim(p_payload->>'reason'),''),
      'DATA_ENTRY_FINANCIAL_V2_SAVE_BATCH_V22'
    );
  v_actor_id uuid;
  v_actor_email text :=
    nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role text :=
    nullif(btrim(v_access->>'actor_role'),'');
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

  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'create');
  if nullif(v_access->>'actor_user_id','') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;

  select mutation_mode
  into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;

  if coalesce(v_mode,'MUTATION_SHADOW') <> 'ACTIVE' then
    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','MUTATION_NOT_ACTIVE',
          'message','Data Entry mutations are not active.'
        )
      ),
      'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),
      'access',v_access
    );
  end if;

  if v_request_id is null
     or v_pickup_id is null
     or jsonb_typeof(v_rows) <> 'array'
  then
    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','SAVE_BATCH_PAYLOAD_REQUIRED',
          'message',
          'request_id, pickup_id, and a rows array are required.'
        )
      ),
      'access',v_access
    );
  end if;

  v_row_count := jsonb_array_length(v_rows);

  if v_row_count < 1 or v_row_count > 200 then
    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','SAVE_BATCH_SIZE_INVALID',
          'message',
          'Each upload batch must contain from 1 to 200 parcels.'
        )
      ),
      'access',v_access
    );
  end if;

  select
    greatest(
      coalesce(p.expected_parcels,0),
      coalesce(p.expected_parcel_count,0),
      coalesce(p.parcel_count,0),
      0
    ),
    greatest(coalesce(p.verified_parcels,0),0)
  into
    v_requested_count,
    v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id = v_pickup_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','PICKUP_NOT_FOUND',
          'message','Canonical production pickup was not found.'
        )
      ),
      'access',v_access
    );
  end if;

  v_authorized_count :=
    greatest(v_requested_count,v_verified_count);

  for v_index in 0..v_row_count-1 loop
    v_row := v_rows->v_index;

    if coalesce(v_row->>'parcel_sequence','')
         !~ '^[1-9][0-9]*$'
       or btrim(coalesce(v_row->>'pickup_id',''))
         <> v_pickup_id
    then
      return jsonb_build_object(
        'ok',false,
        'operation','SAVE_BATCH_V22',
        'persisted',false,
        'errors',jsonb_build_array(
          jsonb_build_object(
            'code','SAVE_BATCH_SEQUENCE_INVALID',
            'row_index',v_index,
            'message',
            'Every row needs a positive parcel sequence and the selected pickup ID.'
          )
        ),
        'access',v_access
      );
    end if;

    v_sequence := (v_row->>'parcel_sequence')::integer;

    if v_index = 0 then
      v_first_sequence := v_sequence;
    end if;

    if v_sequence <> v_first_sequence + v_index then
      return jsonb_build_object(
        'ok',false,
        'operation','SAVE_BATCH_V22',
        'persisted',false,
        'errors',jsonb_build_array(
          jsonb_build_object(
            'code','SAVE_BATCH_NOT_CONTIGUOUS',
            'row_index',v_index,
            'message',
            'Rows in one upload must have ordered contiguous parcel sequences.'
          )
        ),
        'access',v_access
      );
    end if;

    v_last_sequence := v_sequence;
  end loop;

  if v_last_sequence > v_authorized_count then
    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'authorized_parcels',v_authorized_count,
      'last_sequence',v_last_sequence,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','SAVE_BATCH_NOT_AUTHORIZED',
          'message',
          'Authorize the additional parcel registrations before saving this batch.'
        )
      ),
      'access',v_access
    );
  end if;

  v_payload_hash := md5(v_payload::text);

  insert into public.be_data_entry_financial_v2_requests_v58(
    request_id,
    operation,
    actor_id,
    payload_hash,
    status
  )
  values(
    v_request_id,
    'SAVE_BATCH_V22',
    v_actor_id,
    v_payload_hash,
    'IN_PROGRESS'
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select *
    into v_request
    from public.be_data_entry_financial_v2_requests_v58
    where request_id = v_request_id;

    if v_request.operation <> 'SAVE_BATCH_V22'
       or v_request.payload_hash <> v_payload_hash
    then
      return jsonb_build_object(
        'ok',false,
        'operation','SAVE_BATCH_V22',
        'persisted',false,
        'errors',jsonb_build_array(
          jsonb_build_object(
            'code','IDEMPOTENCY_CONFLICT',
            'message',
            'request_id was already used with a different operation or payload.'
          )
        ),
        'access',v_access
      );
    end if;

    if v_request.status = 'COMPLETE'
       and v_request.response is not null
    then
      return v_request.response
        || jsonb_build_object('idempotent_replay',true);
    end if;

    return jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','REQUEST_IN_PROGRESS',
          'message','The same upload batch is already in progress.'
        )
      ),
      'access',v_access
    );
  end if;

  begin
    for v_index in 0..v_row_count-1 loop
      v_sequence :=
        (v_rows->v_index->>'parcel_sequence')::integer;

      v_row :=
        (v_rows->v_index)
        || jsonb_build_object(
          'pickup_id',v_pickup_id,
          'parcel_sequence',v_sequence,
          'request_id',
            v_request_id
            || ':PARCEL:'
            || lpad(v_sequence::text,3,'0'),
          'dry_run',false,
          'source_file_name',
            'PORTAL_FINANCIAL_V2_SAVE_BATCH_V22',
          'reason',v_reason
        );

      v_row_result :=
        public.be_data_entry_financial_v2_save(v_row);

      if not coalesce(
           (v_row_result->>'ok')::boolean,
           false
         )
         or not coalesce(
           (v_row_result->>'persisted')::boolean,
           false
         )
      then
        v_failure := coalesce(
          v_row_result#>>'{errors,0,message}',
          v_row_result->>'message',
          'Parcel '||v_sequence||' was not persisted.'
        );

        raise exception
          using errcode='P0001',message=v_failure;
      end if;

      v_results :=
        v_results || jsonb_build_array(v_row_result);
    end loop;

  exception when others then
    v_failure :=
      coalesce(v_failure,sqlerrm,'Upload batch save failed.');

    v_response := jsonb_build_object(
      'ok',false,
      'operation','SAVE_BATCH_V22',
      'persisted',false,
      'rolled_back',true,
      'request_id',v_request_id,
      'pickup_id',v_pickup_id,
      'saved_count',0,
      'errors',jsonb_build_array(
        jsonb_build_object(
          'code','SAVE_BATCH_ROLLED_BACK',
          'message',v_failure
        )
      ),
      'mutation_mode',v_mode,
      'access',v_access
    );

    update public.be_data_entry_financial_v2_requests_v58
    set
      status='COMPLETE',
      response=v_response,
      completed_at=now()
    where request_id=v_request_id;

    return v_response;
  end;

  v_response := jsonb_build_object(
    'ok',true,
    'operation','SAVE_BATCH_V22',
    'persisted',true,
    'rolled_back',false,
    'request_id',v_request_id,
    'pickup_id',v_pickup_id,
    'saved_count',v_row_count,
    'rows',v_results,
    'first_sequence',v_first_sequence,
    'last_sequence',v_last_sequence,
    'authorized_parcels',v_authorized_count,
    'more_batches_allowed',true,
    'mutation_mode',v_mode,
    'access',v_access
  );

  insert into public.be_audit_events(
    actor_id,
    actor_email,
    actor_role,
    action,
    resource_type,
    resource_id,
    details,
    upload_code,
    event_type,
    entity_type,
    entity_id,
    payload
  )
  values(
    v_actor_id,
    v_actor_email,
    v_actor_role,
    'DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED',
    'PICKUP',
    v_pickup_id,
    jsonb_build_object(
      'request_id',v_request_id,
      'saved_count',v_row_count,
      'first_sequence',v_first_sequence,
      'last_sequence',v_last_sequence,
      'reason',v_reason
    ),
    'DATA_ENTRY_CONTINUOUS_BULK_V22_20260904',
    'DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED',
    'PICKUP',
    v_pickup_id,
    v_response
  );

  update public.be_data_entry_financial_v2_requests_v58
  set
    status='COMPLETE',
    response=v_response,
    completed_at=now()
  where request_id=v_request_id;

  return v_response;
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_save_batch_v22(jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
