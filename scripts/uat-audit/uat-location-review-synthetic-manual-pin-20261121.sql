-- BRITIUM HOSTED UAT: original location review V29 + V23 wrapper with strict synthetic/territory scope.
-- Manual pin test only. SKIP_REVIEW requires existing trusted stored suggestion, not client-supplied claim.
-- No production records copied. No Save/Waybill/Finance mutation mode activation.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified hosted UAT'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'Unexpected UAT baseline'; END IF;
 IF to_regprocedure('public.be_delivery_location_review_batch_v23(jsonb)') IS NOT NULL OR to_regprocedure('public.be_delivery_location_review_batch_v29(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Location review function already exists'; END IF;
END $guard$;
CREATE FUNCTION public.be_delivery_location_review_batch_v29(p_payload jsonb)
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
  IF auth.uid() IS NULL OR
      (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton) <> 'MUTATION_SHADOW'
      OR replace(lower(coalesce(public.be_current_role(),'')),'-','_') <> 'super_admin'
      OR NOT EXISTS (SELECT 1 FROM public.be_employee_territory_assignments t
           WHERE t.user_id=auth.uid() AND t.active AND t.can_update AND t.scope_type='GLOBAL')
  THEN RAISE EXCEPTION 'UAT_QA_LOCATION_REVIEW_DENIED' USING ERRCODE='42501'; END IF;
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
    IF v_pickup_id NOT IN ('P2026-ISN-901','P2026-MDY-901')
       OR NOT EXISTS(
        SELECT 1 FROM public.be_portal_pickup_requests p
        JOIN public.be_delivery_way_id_registry r ON r.pickup_id=p.pickup_id
        WHERE p.pickup_id=v_pickup_id AND p.merchant_code='UAT-QA'
          AND p.pickup_address='SYNTHETIC TEST ONLY - NO ACTUAL PICKUP'
          AND r.parcel_sequence=v_sequence AND r.delivery_way_id=v_delivery_way_id
       )
    THEN RAISE EXCEPTION 'UAT_QA_LOCATION_WAY_ID_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
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
      IF NOT EXISTS (
        SELECT 1 FROM public.be_delivery_location_registry prior
        WHERE prior.delivery_way_id=v_delivery_way_id
          AND prior.latitude=v_lat AND prior.longitude=v_lng
          AND prior.address_original=v_delivery_address
          AND upper(coalesce(prior.match_level,'')) IN ('ADDRESS_EXACT','POI_EXACT')
          AND coalesce(prior.confidence,0)>=0.95
          AND prior.coordinate_source LIKE 'GOOGLE_%'
      ) THEN RAISE EXCEPTION 'UAT_SKIP_REVIEW_REQUIRES_STORED_TRUSTED_SUGGESTION' USING ERRCODE='42501'; END IF;
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
$function$
;
REVOKE ALL ON FUNCTION public.be_delivery_location_review_batch_v29(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_delivery_location_review_batch_v29(jsonb) TO authenticated;
CREATE FUNCTION public.be_delivery_location_review_batch_v23(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select public.be_delivery_location_review_batch_v29(p_payload);
$function$
;
REVOKE ALL ON FUNCTION public.be_delivery_location_review_batch_v23(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_delivery_location_review_batch_v23(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
