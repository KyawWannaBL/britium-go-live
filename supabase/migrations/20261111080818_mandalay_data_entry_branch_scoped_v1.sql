-- Mandalay Data Entry V2: approved manager authority + branch-scoped pickup, contact history,
-- progress, waybill and financial registration mutations.
-- Compiled from live production functions after scope denial tests on 2026-11-11.
-- All existing YGN pathways retain their original behavior.
BEGIN;
-- public.be_data_entry_manager_assert_pickup_v1(text,text)
CREATE OR REPLACE FUNCTION public.be_data_entry_manager_assert_pickup_v1(p_pickup_id text, p_action text DEFAULT 'read'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_branch text; v_role text:=replace(coalesce(public.be_current_role(),''),'-','_');
BEGIN
 IF v_role NOT IN ('branch_manager','data_entry','encoder','supervisor') THEN RETURN;END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
 SELECT upper(branch_code) INTO v_branch FROM public.be_user_account_registry
 WHERE auth_user_id=auth.uid() AND active AND is_active AND lower(status)='active'
 AND replace(lower(role_code),'-','_')=v_role LIMIT 1;
 IF v_role<>'branch_manager' AND v_branch IS DISTINCT FROM 'MDY' THEN RETURN; END IF;
 IF v_branch IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.be_branch_offices
      WHERE upper(branch_code)=v_branch AND active AND lower(authority_status)='approved')
   OR nullif(btrim(p_pickup_id),'') IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.be_portal_pickup_requests p
      WHERE p.pickup_id=p_pickup_id AND upper(p.branch_code)=v_branch
      AND public.be_employee_can_access_territory(null::uuid,p.branch_code,coalesce(p.pickup_township,p.delivery_township),p_action))
 THEN RAISE EXCEPTION 'BRANCH_DATA_ENTRY_SCOPE_DENIED' USING errcode='42501';END IF;
END
$function$;

-- public.be_data_entry_financial_v2_save(jsonb)
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)
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
$function$;

-- public.be_data_entry_financial_v2_save_legacy_v33(jsonb)
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save_legacy_v33(p_payload jsonb)
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
$function$;

-- public.be_data_entry_financial_v2_save_batch_v22(jsonb)
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save_batch_v22(p_payload jsonb)
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
$function$;

-- public.be_data_entry_financial_v2_add_registrations(jsonb)
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_add_registrations(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');
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

-- public.be_data_entry_financial_v2_create_ready_waybill(jsonb)
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
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');
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
$function$;

-- public.be_data_entry_financial_v2_ready_sequences_v137(text)
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
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'read');

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
$function$;

-- public.be_data_entry_registration_state_v1(text)
CREATE OR REPLACE FUNCTION public.be_data_entry_registration_state_v1(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.be_data_entry_require_access_v57('view',false);
 perform public.be_data_entry_manager_assert_pickup_v1(p_pickup_id,'read');
 select coalesce(jsonb_agg(jsonb_build_object('parcel_sequence',d.parcel_sequence,'updated_at',d.updated_at,
 'published',coalesce(d.is_printed,false) or d.printed_at is not null or upper(coalesce(d.print_status,'')) in ('PRINTED','PUBLISHED','CREATED')
 or exists(select 1 from public.parcels p where p.way_id=d.delivery_way_id and p.financial_locked_at is not null)
 or exists(select 1 from public.be_waybill_ledger w where w.delivery_way_id=d.delivery_way_id))),'[]'::jsonb) into v_rows
 from public.be_data_entry_parcel_details d where d.pickup_id=p_pickup_id;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $function$;

-- public.be_data_entry_photo_waiver_v54(jsonb)
CREATE OR REPLACE FUNCTION public.be_data_entry_photo_waiver_v54(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');
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
  if v_action='WAIVE' and v_reason is null then
    return jsonb_build_object('ok',false,'error','A reason for skipping the photo is required');
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
        verification_status='PHOTO_SKIPPED_REASON',
        proof_check_status='APPROVED',
        reviewed_by=coalesce(v_actor_id::text,auth.uid()::text),
        reviewed_by_email=v_actor_email,
        reviewed_at=now(),
        review_note='PHOTO SKIPPED — REASON: '||v_reason,
        raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
          'photo_skipped',true,
          'photo_upload_later_required',false,
          'photo_skip_reason',v_reason,
          'photo_skipped_at',now(),
          'photo_skipped_by',v_actor_email,
          'photo_skipped_by_user_id',v_actor_id
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
        'PHOTO_SKIPPED_REASON','APPROVED',coalesce(v_actor_id::text,auth.uid()::text),v_actor_email,
        now(),'PHOTO SKIPPED — REASON: '||v_reason,
        jsonb_build_object(
          'photo_skipped',true,
          'photo_upload_later_required',false,
          'photo_skip_reason',v_reason,
          'photo_skipped_at',now(),
          'photo_skipped_by',v_actor_email,
          'photo_skipped_by_user_id',v_actor_id
        ),now(),now()
      );
    end if;
    v_status := 'PHOTO_SKIPPED';
  else
    if not found then
      return jsonb_build_object('ok',true,'action','CLEAR','pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'review_status','PENDING_REVIEW','message','No photo skip existed.');
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
      review_note='Photo skip explicitly removed by the operator.',
      raw_payload=(coalesce(raw_payload,'{}'::jsonb)
        - 'temporary_photo_waiver'
        - 'temporary_photo_waiver_reason'
        - 'temporary_photo_waiver_at'
        - 'temporary_photo_waiver_by'
        - 'photo_skipped' - 'photo_skip_reason' - 'photo_skipped_at' - 'photo_skipped_by' - 'photo_upload_later_required' - 'photo_skipped_by_user_id'),
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
    case when v_action='WAIVE' then 'DATA_ENTRY_PHOTO_SKIPPED_BY_REASON' else 'DATA_ENTRY_PHOTO_SKIP_REMOVED' end,
    'DELIVERY_WAY',v_delivery_way_id,
    jsonb_build_object(
      'pickup_id',v_pickup_id,
      'parcel_sequence',v_sequence,
      'temporary',false,
      'photo_upload_later_required',false,
      'reason',case when v_action='WAIVE' then v_reason else null end
    ),
    'DATA_ENTRY_REASON_ONLY_PHOTO_SKIP_V1',
    case when v_action='WAIVE' then 'DATA_ENTRY_PHOTO_SKIPPED_BY_REASON' else 'DATA_ENTRY_PHOTO_SKIP_REMOVED' end,
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
    'photo_skipped',v_action='WAIVE',
    'photo_upload_later_required',false,
    'reason',case when v_action='WAIVE' then v_reason else null end
  );
end;
$function$;

-- public.be_review_parcel_photo(jsonb)
CREATE OR REPLACE FUNCTION public.be_review_parcel_photo(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_action text := upper(coalesce(p_payload->>'action', ''));
  v_pickup_id text := nullif(btrim(p_payload->>'pickup_id'), '');
  v_sequence integer := public.be_rider_safe_positive_integer(coalesce(
    p_payload->>'parcel_sequence',
    p_payload->>'item_no'
  ));
  v_reason text := upper(coalesce(nullif(btrim(p_payload->>'rejection_reason'), ''), 'OTHER'));
  v_note text := nullif(btrim(p_payload->>'rejection_note'), '');
  v_status text;
  v_reviewer text := coalesce(nullif(btrim(p_payload->>'reviewed_by'), ''), auth.uid()::text);
  v_reviewer_email text := nullif(btrim(p_payload->>'reviewed_by_email'), '');
  v_row public.be_pickup_parcel_verifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');

  if v_action not in ('APPROVE', 'REJECT') then
    return jsonb_build_object('ok', false, 'error', 'action must be APPROVE or REJECT');
  end if;

  if v_pickup_id is null or coalesce(v_sequence, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'pickup_id and parcel_sequence are required');
  end if;

  if v_action = 'REJECT' and nullif(v_reason, '') is null then
    return jsonb_build_object('ok', false, 'error', 'rejection_reason is required');
  end if;

  v_status := case when v_action = 'APPROVE' then 'APPROVED' else 'REUPLOAD_REQUIRED' end;

  update public.be_pickup_parcel_verifications v
  set verification_status = v_status,
      proof_check_status = v_status,
      reviewed_by = v_reviewer,
      reviewed_by_email = v_reviewer_email,
      reviewed_at = now(),
      review_note = case
        when v_action = 'REJECT' then concat_ws(': ', v_reason, v_note)
        else coalesce(v_note, 'Photo approved by Data Entry')
      end,
      last_rejected_at = case when v_action = 'REJECT' then now() else null end,
      updated_at = now()
  where v.pickup_id = v_pickup_id
    and v.parcel_sequence = v_sequence
  returning v.* into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'parcel photo verification row not found');
  end if;

  if to_regclass('public.be_parcel_photo_reviews') is not null then
    update public.be_parcel_photo_reviews r
    set review_status = v_status,
        rejection_reason = case when v_action = 'REJECT' then v_reason else null end,
        rejection_note = case when v_action = 'REJECT' then v_note else null end,
        reviewed_by = v_reviewer,
        reviewed_at = now(),
        updated_at = now()
    where r.pickup_id = v_pickup_id
      and r.parcel_sequence = v_sequence;
  end if;

  update public.be_portal_pickup_requests p
  set rejected_photo_count = (
        select count(*) from public.be_pickup_parcel_verifications x
        where x.pickup_id = v_pickup_id
          and upper(coalesce(x.proof_check_status, '')) = 'REUPLOAD_REQUIRED'
      ),
      pending_photo_count = (
        select count(*) from public.be_pickup_parcel_verifications x
        where x.pickup_id = v_pickup_id
          and upper(coalesce(x.proof_check_status, '')) in ('PENDING', 'PENDING_REVIEW', 'RIDER_SUBMITTED')
      ),
      photo_review_status = case
        when exists (
          select 1 from public.be_pickup_parcel_verifications x
          where x.pickup_id = v_pickup_id
            and upper(coalesce(x.proof_check_status, '')) = 'REUPLOAD_REQUIRED'
        ) then 'REUPLOAD_REQUIRED'
        when not exists (
          select 1 from public.be_pickup_parcel_verifications x
          where x.pickup_id = v_pickup_id
            and upper(coalesce(x.proof_check_status, '')) not in ('APPROVED', 'VERIFIED')
        ) then 'APPROVED'
        else 'PARTIAL_REVIEW'
      end,
      updated_at = now()
  where coalesce(p.pickup_id, p.pickup_way_id) = v_pickup_id;

  if v_action = 'REJECT' and to_regclass('public.be_app_notifications') is not null then
    begin
      insert into public.be_app_notifications (
        notification_type, title, message, target_role,
        target_user_code, pickup_id, is_read, created_at
      )
      select
        'PARCEL_PHOTO_REUPLOAD',
        'Photo re-upload required',
        'Parcel ' || v_sequence || ' photo was rejected: ' || v_reason,
        'rider',
        p.assigned_rider_code,
        v_pickup_id,
        false,
        now()
      from public.be_portal_pickup_requests p
      where coalesce(p.pickup_id, p.pickup_way_id) = v_pickup_id
        and nullif(p.assigned_rider_code, '') is not null;
    exception when others then
      raise notice 'Notification insert skipped: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_review_parcel_photo',
    'pickup_id', v_pickup_id,
    'parcel_sequence', v_sequence,
    'review_status', v_status,
    'rejection_reason', case when v_action = 'REJECT' then v_reason else null end
  );
end;
$function$;

-- public.be_data_entry_pickup_list_web_v16(integer)
CREATE OR REPLACE FUNCTION public.be_data_entry_pickup_list_web_v16(p_limit integer)
 RETURNS TABLE(pickup_id text, pickup_way_id text, merchant_code text, merchant_name text, pickup_date text, pickup_address text, township text, city text, expected_parcels numeric, verified_parcels numeric, photo_parcels numeric, total_weight_kg numeric, pickup_status text, workflow_stage text, created_at text, source_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET row_security TO 'off'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  return query
  with source_rows as (
    select to_jsonb(q) as j
    from public.be_v_supervisor_pickup_queue as q
  ),
  normalized as (
    select
      nullif(btrim(coalesce(
        j->>'pickup_id', j->>'pickup_request_id', j->>'request_id', j->>'id'
      )), '') as n_pickup_id,
      nullif(btrim(coalesce(
        j->>'pickup_way_id', j->>'pickup_waybill_id', j->>'way_id',
        j->>'pickup_id', j->>'pickup_request_id', j->>'request_id', j->>'id'
      )), '') as n_pickup_way_id,
      nullif(btrim(coalesce(
        j->>'merchant_code', j->>'merchant_id', j->>'customer_code'
      )), '') as n_merchant_code,
      nullif(btrim(coalesce(
        j->>'merchant_name', j->>'customer_name', j->>'merchant'
      )), '') as n_merchant_name,
      nullif(btrim(coalesce(
        j->>'pickup_date', j->>'scheduled_date', j->>'requested_pickup_date'
      )), '') as n_pickup_date,
      nullif(btrim(coalesce(
        j->>'pickup_address', j->>'address'
      )), '') as n_pickup_address,
      nullif(btrim(coalesce(
        j->>'township', j->>'pickup_township'
      )), '') as n_township,
      nullif(btrim(coalesce(
        j->>'city', j->>'pickup_city'
      )), '') as n_city,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'expected_parcels', j->>'parcel_count', j->>'parcels',
        j->>'requested_parcels', j->>'total_parcels'
      ), 0) as n_expected_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'verified_parcels', j->>'verified_count', j->>'verified_parcel_count'
      ), 0) as n_verified_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'photo_parcels', j->>'photo_count', j->>'proof_count',
        j->>'proof_parcels', j->>'verified_parcels', j->>'verified_count'
      ), 0) as n_photo_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'total_weight_kg', j->>'total_weight', j->>'weight_kg'
      ), 0) as n_total_weight_kg,
      nullif(btrim(coalesce(j->>'pickup_status', j->>'status')), '') as n_pickup_status,
      nullif(btrim(coalesce(j->>'workflow_stage', j->>'stage')), '') as n_workflow_stage,
      nullif(btrim(coalesce(
        j->>'created_at', j->>'requested_at', j->>'updated_at', j->>'pickup_date'
      )), '') as n_created_at
    from source_rows
  ),
  ranked as (
    select
      n.*,
      row_number() over (
        partition by n.n_pickup_id
        order by
          coalesce(n.n_created_at, n.n_pickup_date) desc nulls last,
          n.n_pickup_way_id desc nulls last
      ) as row_rank
    from normalized as n
    where n.n_pickup_id is not null
  )
  select
    r.n_pickup_id,
    coalesce(r.n_pickup_way_id, r.n_pickup_id),
    r.n_merchant_code,
    r.n_merchant_name,
    r.n_pickup_date,
    r.n_pickup_address,
    r.n_township,
    r.n_city,
    greatest(r.n_expected_parcels, 0),
    greatest(r.n_verified_parcels, 0),
    greatest(r.n_photo_parcels, 0),
    greatest(r.n_total_weight_kg, 0),
    r.n_pickup_status,
    r.n_workflow_stage,
    r.n_created_at,
    'be_v_supervisor_pickup_queue'::text
  from ranked as r
  where r.row_rank = 1
  and (not exists (
       select 1 from public.be_user_account_registry sc
       where sc.auth_user_id=auth.uid()
         and (replace(lower(sc.role_code),'-','_')='branch_manager'
           or (upper(sc.branch_code)='MDY'
             and replace(lower(sc.role_code),'-','_') in ('data_entry','encoder','supervisor')))
     ) or exists (
       select 1 from public.be_portal_pickup_requests p
       join public.be_user_account_registry sc on sc.auth_user_id=auth.uid()
       where p.pickup_id=r.n_pickup_id and upper(p.branch_code)=upper(sc.branch_code)
         and sc.active and sc.is_active and lower(sc.status)='active'
         and public.be_employee_can_access_territory(null::uuid,p.branch_code,p.pickup_township,'read')
     ))
  order by
    coalesce(r.n_created_at, r.n_pickup_date) desc nulls last,
    r.n_pickup_id desc
  limit v_limit;
end;
$function$;

-- public.be_data_entry_phone_history_v81(text,integer)
CREATE OR REPLACE FUNCTION public.be_data_entry_phone_history_v81(p_phone text, p_limit integer DEFAULT 3)
 RETURNS TABLE(history_rank integer, recipient_name text, recipient_phone text, secondary_phone text, township text, city text, region_state text, recipient_address text, merchant_id text, delivery_way_id text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with input as (
    select regexp_replace(coalesce(p_phone,''), '\D', '', 'g') as normalized
  ),
  matches as (
    select
      d.recipient_name,
      d.contact_no_1,
      d.contact_no_2,
      d.township,
      d.city,
      d.region_state,
      d.recipient_address,
      d.merchant_id,
      d.delivery_way_id,
      d.saved_at,
      row_number() over (
        order by d.saved_at desc nulls last, d.updated_at desc nulls last, d.created_at desc nulls last
      )::integer as history_rank
    from public.be_data_entry_parcel_details d
    cross join input i
    where length(i.normalized) >= 6
      and (not exists (
       select 1 from public.be_user_account_registry sc
       where sc.auth_user_id=auth.uid()
         and (replace(lower(sc.role_code),'-','_')='branch_manager'
           or (upper(sc.branch_code)='MDY'
             and replace(lower(sc.role_code),'-','_') in ('data_entry','encoder','supervisor')))
     ) or exists (
       select 1 from public.be_portal_pickup_requests p
       join public.be_user_account_registry sc on sc.auth_user_id=auth.uid()
       where p.pickup_id=d.pickup_id and upper(p.branch_code)=upper(sc.branch_code)
         and sc.active and sc.is_active and lower(sc.status)='active'
         and public.be_employee_can_access_territory(null::uuid,p.branch_code,p.pickup_township,'read')
     ))
      and (
        regexp_replace(coalesce(d.contact_no_1,''), '\D', '', 'g') = i.normalized
        or regexp_replace(coalesce(d.contact_no_2,''), '\D', '', 'g') = i.normalized
      )
  )
  select
    m.history_rank,
    m.recipient_name,
    coalesce(nullif(m.contact_no_1,''), nullif(m.contact_no_2,''), p_phone),
    m.contact_no_2,
    m.township,
    m.city,
    m.region_state,
    m.recipient_address,
    m.merchant_id,
    m.delivery_way_id,
    m.saved_at
  from matches m
  order by m.history_rank
  limit greatest(1,least(coalesce(p_limit,3),10));
$function$;

-- public.be_data_entry_staff_progress_v98(date,text)
CREATE OR REPLACE FUNCTION public.be_data_entry_staff_progress_v98(p_work_date date DEFAULT NULL::date, p_selected_pickup_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_date date:=coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_selected text:=nullif(btrim(coalesce(p_selected_pickup_id,'')),'');
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_branch text:='';
  v_pickups jsonb:='[]'::jsonb;
  v_staff jsonb:='[]'::jsonb;
  v_merchants jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501';
  end if;

  select upper(coalesce(r.branch_code,'')) into v_branch
  from public.be_user_account_registry r
  where r.auth_user_id=v_uid and r.active and r.is_active and lower(r.status)='active'
  limit 1;

  with relevant as (
    select
      p.pickup_id,
      p.pickup_date,
      coalesce(nullif(p.merchant_code,''),nullif(p.merchant_id,''),'UNKNOWN') merchant_code,
      coalesce(nullif(p.merchant_name,''),nullif(p.merchant_code,''),nullif(p.merchant_id,''),'Unknown Merchant') merchant_name,
      greatest(coalesce(p.expected_parcels,p.expected_parcel_count,p.parcel_count,p.registered_parcel_count,0),0)::integer expected_count,
      p.created_at
    from public.be_portal_pickup_requests p
    where nullif(btrim(coalesce(p.pickup_id,'')),'') is not null
      and (not exists (
       select 1 from public.be_user_account_registry sc
       where sc.auth_user_id=auth.uid()
         and (replace(lower(sc.role_code),'-','_')='branch_manager'
           or (upper(sc.branch_code)='MDY'
             and replace(lower(sc.role_code),'-','_') in ('data_entry','encoder','supervisor')))
     ) or (exists (
        select 1 from public.be_user_account_registry sc
         where sc.auth_user_id=auth.uid() and upper(sc.branch_code)=upper(p.branch_code)
           and sc.active and sc.is_active and lower(sc.status)='active'
           and public.be_employee_can_access_territory(null::uuid,p.branch_code,p.pickup_township,'read')
      )))
      and upper(coalesce(p.status,'')) not in ('CANCELLED','ARCHIVED_TEST_DATA')
      and (
        p.pickup_date=v_date
        or (v_selected is not null and p.pickup_id=v_selected)
        or exists (
          select 1
          from public.be_data_entry_parcel_details d
          where d.pickup_id=p.pickup_id
            and (coalesce(d.saved_at,d.updated_at,d.created_at) at time zone 'Asia/Yangon')::date=v_date
        )
        or exists (
          select 1
          from public.be_data_entry_pending_drafts d
          where d.pickup_id=p.pickup_id
            and (d.updated_at at time zone 'Asia/Yangon')::date=v_date
        )
      )
  ),
  saved as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer saved_rows,
      max(coalesce(d.saved_at,d.updated_at,d.created_at)) last_saved_at
    from public.be_data_entry_parcel_details d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN'))
  ),
  drafts as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer draft_rows,
      count(distinct d.parcel_sequence) filter (where coalesce(d.skipped,false))::integer skipped_rows,
      max(d.updated_at) last_draft_at
    from public.be_data_entry_pending_drafts d
    join relevant r on r.pickup_id=d.pickup_id
    left join auth.users u on u.id=d.owner_id
    left join public.profiles p on p.id=d.owner_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN'))
  ),
  saved_totals as (
    select d.pickup_id,count(distinct d.parcel_sequence)::integer registered_count
    from public.be_data_entry_parcel_details d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id
  ),
  draft_totals as (
    select d.pickup_id,count(distinct d.parcel_sequence)::integer draft_count
    from public.be_data_entry_pending_drafts d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id
  ),
  contributor_email as (
    select pickup_id,email from saved
    union
    select pickup_id,email from drafts
  ),
  pickup_rows as (
    select
      r.pickup_id,
      r.pickup_date,
      r.merchant_code,
      r.merchant_name,
      r.expected_count,
      coalesce(st.registered_count,0) registered_count,
      greatest(r.expected_count-coalesce(st.registered_count,0),0) remaining_count,
      coalesce(dt.draft_count,0) draft_count,
      case
        when r.expected_count>0 and coalesce(st.registered_count,0)>=r.expected_count then 'COMPLETED'
        when coalesce(st.registered_count,0)>0 then 'IN_PROGRESS'
        when coalesce(dt.draft_count,0)>0 then 'DRAFTING'
        else 'NOT_STARTED'
      end progress_status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'email',ce.email,
          'name',coalesce(
            nullif(u.raw_user_meta_data->>'full_name',''),
            nullif(u.raw_user_meta_data->>'display_name',''),
            nullif(pr.full_name,''),
            ce.email
          ),
          'saved_rows',coalesce(s.saved_rows,0),
          'draft_rows',coalesce(d.draft_rows,0),
          'skipped_rows',coalesce(d.skipped_rows,0),
          'last_activity',greatest(s.last_saved_at,d.last_draft_at)
        ) order by coalesce(s.saved_rows,0) desc,coalesce(d.draft_rows,0) desc,ce.email)
        from contributor_email ce
        left join saved s on s.pickup_id=ce.pickup_id and s.email=ce.email
        left join drafts d on d.pickup_id=ce.pickup_id and d.email=ce.email
        left join auth.users u on lower(u.email::text)=ce.email
        left join public.profiles pr on lower(pr.email)=ce.email
        where ce.pickup_id=r.pickup_id
      ),'[]'::jsonb) contributors,
      greatest(
        (select max(s.last_saved_at) from saved s where s.pickup_id=r.pickup_id),
        (select max(d.last_draft_at) from drafts d where d.pickup_id=r.pickup_id),
        r.created_at
      ) last_activity
    from relevant r
    left join saved_totals st on st.pickup_id=r.pickup_id
    left join draft_totals dt on dt.pickup_id=r.pickup_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'pickup_id',pickup_id,
    'pickup_date',pickup_date,
    'merchant_code',merchant_code,
    'merchant_name',merchant_name,
    'expected',expected_count,
    'registered',registered_count,
    'remaining',remaining_count,
    'drafts',draft_count,
    'status',progress_status,
    'contributors',contributors,
    'last_activity',last_activity,
    'selected',pickup_id=v_selected
  ) order by
    (pickup_id=v_selected) desc,
    case progress_status when 'IN_PROGRESS' then 1 when 'DRAFTING' then 2 when 'NOT_STARTED' then 3 else 4 end,
    remaining_count desc,
    pickup_id
  ),'[]'::jsonb)
  into v_pickups
  from pickup_rows;

  with relevant_ids as (
    select item->>'pickup_id' pickup_id
    from jsonb_array_elements(v_pickups) x(item)
  ),
  saved as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer saved_rows,
      max(coalesce(d.saved_at,d.updated_at,d.created_at)) last_saved_at
    from public.be_data_entry_parcel_details d
    join relevant_ids r on r.pickup_id=d.pickup_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN'))
  ),
  drafts as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer draft_rows,
      max(d.updated_at) last_draft_at
    from public.be_data_entry_pending_drafts d
    join relevant_ids r on r.pickup_id=d.pickup_id
    left join auth.users u on u.id=d.owner_id
    left join public.profiles p on p.id=d.owner_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN'))
  ),
  observed as (
    select email from saved where email<>'UNKNOWN'
    union
    select email from drafts where email<>'UNKNOWN'
  ),
  roster as (
    select
      lower(u.email::text) email,
      coalesce(
        nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'display_name',''),
        u.email::text
      ) display_name,
      upper(coalesce(u.raw_user_meta_data->>'branch_code','')) branch_code
    from auth.users u
    where lower(replace(coalesce(u.raw_user_meta_data->>'role',''),'_','-'))='data-entry'
      and (
        v_branch=''
        or upper(coalesce(u.raw_user_meta_data->>'branch_code',''))=v_branch
      )
    union
    select
      o.email,
      coalesce(
        nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'display_name',''),
        nullif(p.full_name,''),
        o.email
      ),
      upper(coalesce(u.raw_user_meta_data->>'branch_code',''))
    from observed o
    left join auth.users u on lower(u.email::text)=o.email
    left join public.profiles p on lower(p.email)=o.email
  ),
  staff_rows as (
    select
      r.email,
      max(r.display_name) display_name,
      max(r.branch_code) branch_code,
      coalesce(sum(s.saved_rows),0)::integer saved_rows,
      coalesce(sum(d.draft_rows),0)::integer draft_rows,
      count(distinct s.pickup_id) filter (where coalesce(s.saved_rows,0)>0)::integer pickups_saved,
      count(distinct coalesce(s.pickup_id,d.pickup_id)) filter (where coalesce(s.saved_rows,0)>0 or coalesce(d.draft_rows,0)>0)::integer pickups_touched,
      greatest(max(s.last_saved_at),max(d.last_draft_at)) last_activity
    from roster r
    left join saved s on s.email=r.email
    left join drafts d on d.email=r.email
    group by r.email
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'email',email,
    'name',display_name,
    'branch_code',branch_code,
    'saved_rows',saved_rows,
    'draft_rows',draft_rows,
    'pickups_saved',pickups_saved,
    'pickups_touched',pickups_touched,
    'last_activity',last_activity,
    'is_current_user',email=v_email
  ) order by
    (email=v_email) desc,
    (coalesce(saved_rows,0)+coalesce(draft_rows,0)>0) desc,
    saved_rows desc,
    draft_rows desc,
    display_name
  ),'[]'::jsonb)
  into v_staff
  from staff_rows;

  with pickup_json as (
    select value item from jsonb_array_elements(v_pickups)
  ),
  merchant_groups as (
    select
      item->>'merchant_code' merchant_code,
      max(item->>'merchant_name') merchant_name,
      sum(coalesce((item->>'expected')::integer,0)) expected,
      sum(coalesce((item->>'registered')::integer,0)) registered,
      sum(coalesce((item->>'remaining')::integer,0)) remaining,
      count(*) pickups
    from pickup_json
    group by item->>'merchant_code'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'merchant_code',merchant_code,
    'merchant_name',merchant_name,
    'pickups',pickups,
    'expected',expected,
    'registered',registered,
    'remaining',remaining,
    'status',case when expected>0 and registered>=expected then 'COMPLETED' when registered>0 then 'IN_PROGRESS' else 'NOT_STARTED' end
  ) order by remaining desc,merchant_code),'[]'::jsonb)
  into v_merchants
  from merchant_groups;

  select jsonb_build_object(
    'work_date',v_date,
    'selected_pickup_id',v_selected,
    'pickups',jsonb_array_length(v_pickups),
    'merchants',jsonb_array_length(v_merchants),
    'expected',coalesce(sum((item->>'expected')::integer),0),
    'registered',coalesce(sum((item->>'registered')::integer),0),
    'drafts',coalesce(sum((item->>'drafts')::integer),0),
    'remaining',coalesce(sum((item->>'remaining')::integer),0),
    'completed_pickups',count(*) filter (where item->>'status'='COMPLETED'),
    'in_progress_pickups',count(*) filter (where item->>'status' in ('IN_PROGRESS','DRAFTING')),
    'not_started_pickups',count(*) filter (where item->>'status'='NOT_STARTED')
  )
  into v_summary
  from jsonb_array_elements(v_pickups) x(item);

  return jsonb_build_object(
    'ok',true,
    'work_date',v_date,
    'selected_pickup_id',v_selected,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'pickups',v_pickups,
    'merchants',v_merchants,
    'staff',v_staff,
    'generated_at',now(),
    'build','DATA_ENTRY_STAFF_PROGRESS_V98'
  );
end;
$function$;

-- public.be_delivery_location_review_batch_v29(jsonb)
CREATE OR REPLACE FUNCTION public.be_delivery_location_review_batch_v29(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb := public.be_data_entry_require_access_v57('update',false);
  v_rows jsonb := coalesce(p_payload->'rows','[]'::jsonb);
  v_request_id text := nullif(btrim(coalesce(p_payload->>'request_id','')),'');
  v_source_file text := nullif(btrim(coalesce(p_payload->>'source_file_name','')),'');
  v_actor_id uuid; v_actor_email text := nullif(lower(btrim(v_access->>'actor_email')),''); v_actor_role text := nullif(btrim(v_access->>'actor_role'),'');
  v_index integer; v_item jsonb; v_delivery_way_id text; v_pickup_id text; v_sequence integer; v_action text; v_reason text;
  v_lat numeric; v_lng numeric; v_delivery_address text; v_address_english text; v_township text; v_postal_code text; v_postal_match_level text;
  v_provider_label text; v_authorized integer; v_source text; v_match_level text; v_confidence numeric; v_manual_pin_confirmed boolean;
  v_shared_location_confirmed boolean; v_previous jsonb; v_saved public.be_delivery_location_registry; v_results jsonb := '[]'::jsonb;
begin
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_actor_id := (v_access->>'actor_user_id')::uuid; end if;
  if v_request_id is null then raise exception 'request_id is required.'; end if;
  if jsonb_typeof(v_rows)<>'array' or jsonb_array_length(v_rows)<1 or jsonb_array_length(v_rows)>200 then raise exception 'Each location-review batch must contain from 1 to 200 rows.'; end if;
  if exists (select 1 from jsonb_array_elements(v_rows) item(value) group by lower(btrim(coalesce(item.value->>'delivery_way_id',''))) having count(*)>1) then raise exception 'A location-review batch cannot contain a duplicate Delivery Way ID.'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_rows) item(value)
    where nullif(btrim(coalesce(item.value->>'latitude','')),'') is not null and nullif(btrim(coalesce(item.value->>'longitude','')),'') is not null
    group by round((item.value->>'latitude')::numeric,5),round((item.value->>'longitude')::numeric,5)
    having count(distinct btrim(coalesce(item.value->>'delivery_address',''))) > 1
       and bool_and(lower(coalesce(item.value->>'shared_location_confirmed','false')) in ('true','1','yes')) is not true
  ) then raise exception 'The workbook reuses one coordinate for different addresses. Review each actual delivery pin; township-centre bulk coordinates are prohibited.'; end if;

  for v_index in 0..jsonb_array_length(v_rows)-1 loop
    v_item := v_rows->v_index;
    v_delivery_way_id := nullif(btrim(coalesce(v_item->>'delivery_way_id','')),''); v_pickup_id := nullif(btrim(coalesce(v_item->>'pickup_id','')),'');
    PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');
    v_action := upper(nullif(btrim(coalesce(v_item->>'action','')),'')); v_reason := nullif(btrim(coalesce(v_item->>'reason','')),'');
    v_delivery_address := nullif(btrim(coalesce(v_item->>'delivery_address','')),''); v_address_english := coalesce(nullif(btrim(coalesce(v_item->>'address_english','')),''),v_delivery_address);
    v_township := nullif(btrim(coalesce(v_item->>'township','')),''); v_postal_code := btrim(coalesce(v_item->>'postal_code',''));
    v_postal_match_level := upper(coalesce(nullif(btrim(coalesce(v_item->>'postal_match_level','')),''),'UNRESOLVED'));
    v_provider_label := coalesce(nullif(btrim(coalesce(v_item->>'provider_label','')),''),v_delivery_address);
    v_lat := nullif(btrim(coalesce(v_item->>'latitude','')),'')::numeric; v_lng := nullif(btrim(coalesce(v_item->>'longitude','')),'')::numeric;
    v_match_level := upper(coalesce(nullif(btrim(coalesce(v_item->>'match_level','')),''),case when v_action='APPLY_CORRECTION' then 'MANUAL' else '' end));
    v_confidence := coalesce(nullif(btrim(coalesce(v_item->>'confidence','')),'')::numeric,0); v_source := upper(coalesce(nullif(btrim(coalesce(v_item->>'coordinate_source','')),''),''));
    v_manual_pin_confirmed := lower(coalesce(v_item->>'manual_pin_confirmed','false')) in ('true','1','yes','y');
    v_shared_location_confirmed := lower(coalesce(v_item->>'shared_location_confirmed','false')) in ('true','1','yes','y');
    if coalesce(v_item->>'parcel_sequence','') !~ '^[1-9][0-9]*$' then raise exception 'Row % requires a positive parcel_sequence.',v_index+1; end if;
    v_sequence := (v_item->>'parcel_sequence')::integer;
    if v_delivery_way_id is null or v_pickup_id is null then
      raise exception 'Row % requires both pickup_id and Delivery Way ID.',v_index+1;
    end if;
    if exists (
      select 1 from public.be_delivery_way_id_registry r
      where r.delivery_way_id=v_delivery_way_id
    ) then
      if not exists (
        select 1 from public.be_delivery_way_id_registry r
        where r.delivery_way_id=v_delivery_way_id
          and r.pickup_id=v_pickup_id
          and r.parcel_sequence=v_sequence
      ) then
        raise exception 'Row % does not match the canonical Delivery Way registry mapping.',v_index+1;
      end if;
    elsif not exists (
      select 1 from public.be_data_entry_parcel_details d
      where d.delivery_way_id=v_delivery_way_id
        and d.pickup_id=v_pickup_id
        and d.parcel_sequence=v_sequence
    ) and v_delivery_way_id<>(v_pickup_id||'-'||lpad(v_sequence::text,3,'0')) then
      raise exception 'Row % does not match its pickup and Delivery Way mapping.',v_index+1;
    end if;
    if v_action is null or v_action not in ('APPLY_CORRECTION','SKIP_REVIEW') then raise exception 'Row % action must be APPLY_CORRECTION or SKIP_REVIEW.',v_index+1; end if;
    if length(coalesce(v_reason,''))<10 then raise exception 'Row % requires an audit reason of at least 10 characters.',v_index+1; end if;
    if v_delivery_address is null or length(v_delivery_address)<3 then raise exception 'Row % requires the current delivery address.',v_index+1; end if;
    if v_township is null or length(v_township)<2 then raise exception 'Row % requires the current township.',v_index+1; end if;
    if v_postal_match_level not in ('EXACT_QUARTER','TOWNSHIP_ONLY','UNRESOLVED') then raise exception 'Row % has an unsupported postal match level.',v_index+1; end if;
    if v_lat is null or v_lng is null or v_lat not between 9 and 29 or v_lng not between 92 and 102 or (v_lat=0 and v_lng=0) then raise exception 'Row % requires valid Myanmar coordinates.',v_index+1; end if;
    if round(v_lat,5)=16.80000 and round(v_lng,5)=96.15000 then raise exception 'Row % uses the retired generic Yangon fallback 16.800000,96.150000. Select the actual delivery pin.',v_index+1; end if;
    if exists (select 1 from public.be_delivery_location_registry q where q.coordinate_source='QUARANTINED_BULK_COORDINATE_V30' and round(q.latitude::numeric,5)=round(v_lat,5) and round(q.longitude::numeric,5)=round(v_lng,5) and btrim(coalesce(q.address_original,''))<>v_delivery_address) and not v_shared_location_confirmed then raise exception 'Row % uses a quarantined shared township/default coordinate. Select the actual address pin.',v_index+1; end if;
    if v_action='SKIP_REVIEW' then
      if v_match_level not in ('ADDRESS_EXACT','POI_EXACT') or v_confidence<0.95 then raise exception 'Row % cannot skip review: only ADDRESS_EXACT/POI_EXACT suggestions with confidence >= 0.95 are route-ready.',v_index+1; end if;
      if not (v_source like 'GOOGLE\_%' escape '\' or v_source in ('MERCHANT_LOCATION_ALIAS_V28','MANAGEMENT_POSTAL_VALIDATED_ADDRESS')) then raise exception 'Row % cannot skip review because its coordinate source is not trusted address-level evidence.',v_index+1; end if;
    else
      if not v_manual_pin_confirmed then raise exception 'Row % correction requires Manual Pin Confirmed = YES after the operator verifies the actual point on the map.',v_index+1; end if;
      v_match_level := 'MANUAL'; v_confidence := 1; v_source := 'DATA_ENTRY_MANUAL_PIN_V30';
    end if;
    select greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),coalesce(p.parcel_count,0),coalesce(p.verified_parcels,0),0) into v_authorized from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id;
    if not found or v_sequence>v_authorized then raise exception 'Row % is outside the authorized pickup parcel range.',v_index+1; end if;
    select to_jsonb(r) into v_previous from public.be_delivery_location_registry r where r.delivery_way_id=v_delivery_way_id;
    insert into public.be_delivery_location_registry(delivery_way_id,address_original,address_english,township,postal_code,postal_match_level,latitude,longitude,provider_label,match_level,confidence,coordinate_source,review_status,updated_by,updated_at)
    values(v_delivery_way_id,v_delivery_address,v_address_english,v_township,v_postal_code,v_postal_match_level,v_lat,v_lng,v_provider_label,v_match_level,v_confidence,v_source,'ACCEPTED',v_actor_id,now())
    on conflict(delivery_way_id) do update set address_original=excluded.address_original,address_english=excluded.address_english,township=excluded.township,postal_code=excluded.postal_code,postal_match_level=excluded.postal_match_level,latitude=excluded.latitude,longitude=excluded.longitude,provider_label=excluded.provider_label,match_level=excluded.match_level,confidence=excluded.confidence,coordinate_source=excluded.coordinate_source,review_status='ACCEPTED',updated_by=v_actor_id,updated_at=now() returning * into v_saved;
    insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details,upload_code,event_type,entity_type,entity_id,payload)
    values(v_actor_id,v_actor_email,v_actor_role,case when v_action='SKIP_REVIEW' then 'DATA_ENTRY_LOCATION_EXACT_SUGGESTION_ACCEPTED' else 'DATA_ENTRY_LOCATION_MANUAL_PIN_CONFIRMED' end,'DELIVERY_WAY',v_delivery_way_id,
      jsonb_build_object('request_id',v_request_id,'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'reason',v_reason,'source_file_name',coalesce(v_source_file,v_item->>'source_file_name'),'source_row_number',v_item->>'source_row_number','latitude',v_lat,'longitude',v_lng,'match_level',v_match_level,'confidence',v_confidence,'coordinate_source',v_source,'manual_pin_confirmed',v_manual_pin_confirmed,'previous_address',v_previous->>'address_original','previous_township',v_previous->>'township','current_address',v_delivery_address,'current_township',v_township),
      'DATA_ENTRY_LOCATION_QUALITY_V30_20260913',case when v_action='SKIP_REVIEW' then 'DATA_ENTRY_LOCATION_EXACT_SUGGESTION_ACCEPTED' else 'DATA_ENTRY_LOCATION_MANUAL_PIN_CONFIRMED' end,'DELIVERY_WAY',v_delivery_way_id,jsonb_build_object('location',to_jsonb(v_saved),'previous_location',v_previous,'access',v_access));
    v_results := v_results||jsonb_build_array(jsonb_build_object('delivery_way_id',v_delivery_way_id,'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'delivery_address',v_delivery_address,'township',v_township,'latitude',v_lat,'longitude',v_lng,'action',v_action,'match_level',v_match_level,'confidence',v_confidence,'coordinate_source',v_source));
  end loop;
  return jsonb_build_object('ok',true,'persisted',true,'request_id',v_request_id,'saved_count',jsonb_array_length(v_results),'rows',v_results,'build','DATA_ENTRY_LOCATION_QUALITY_V30_20260913');
end
$function$;
REVOKE ALL ON FUNCTION public.be_data_entry_manager_assert_pickup_v1(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_data_entry_manager_assert_pickup_v1(text,text) TO authenticated;
INSERT INTO public.be_role_authority_matrix
 (role_id,role_name,authority_level,user_type,default_landing_path,can_access_portal,can_access_mobile,rights,is_active,module_rights)
 SELECT 'branch_manager','Regional Branch Manager',72,'PORTAL','/branch-office',true,false,
 jsonb_build_object('portals',jsonb_build_array('enterprise'),'modules',
   jsonb_build_object(
     'data_entry',jsonb_build_object('view',true,'create',true,'update',true,'upload',true,'export',true),
     'waybill',jsonb_build_object('view',true,'create',true,'update',true,'upload',true,'export',true))),
 true,'{}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.be_role_authority_matrix WHERE role_id='branch_manager');
INSERT INTO public.be_governance_audit_log
 (module,action,ref_table,ref_id,actor_email,after_data,metadata)
 SELECT 'BRANCH_OFFICE','MDY_DATA_ENTRY_SCOPED_ACCESS_ENABLED',
 'be_role_authority_matrix','branch_manager',null,
 jsonb_build_object('role_id','branch_manager','data_entry_scope','assigned_branches_only','effective_branch','MDY'),
 jsonb_build_object('approval','Managing Director requested Mandalay Data Entry V2','date','2026-11-11','scope_guards',14)
 WHERE NOT EXISTS (
  SELECT 1 FROM public.be_governance_audit_log
  WHERE module='BRANCH_OFFICE' AND action='MDY_DATA_ENTRY_SCOPED_ACCESS_ENABLED'
    AND ref_id='branch_manager');
COMMIT;
