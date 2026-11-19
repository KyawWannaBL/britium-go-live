-- CI-only authentic pickup verifier, pre-V140 driver-status synchronization.
-- Reconstructed from production catalog by removing exactly V140's driver status patch.
CREATE OR REPLACE FUNCTION public.be_field_team_submit_partial_pickup_verification(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickupId')),'');
  v_identity jsonb;
  v_auth_user_id uuid := auth.uid();
  v_role text;
  v_worker_code text;
  v_expected_count integer;
  v_submitted_count integer;
  v_total_weight numeric;
  v_first_proof_url text;
  v_partial boolean;
  v_extra_count integer;
  v_current_mobile_status text;
begin
  v_identity := public.be_field_team_assert_assigned_pickup(v_pickup_id);
  v_role := lower(v_identity->>'role');
  v_worker_code := upper(coalesce(v_identity->>'worker_code',''));
  select public.be_field_team_mobile_pickup_status(p.pickup_status,p.workflow_stage,p.rider_app_stage,p.warehouse_status,case v_role when 'driver' then p.driver_status when 'helper' then p.helper_status else p.rider_status end)
  into v_current_mobile_status from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id for update;
  if upper(coalesce(v_current_mobile_status,'')) in ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then raise exception 'PICKUP_ALREADY_ADVANCED: verification cannot be resubmitted after collection.'; end if;
  if upper(coalesce(v_current_mobile_status,'')) not in ('ARRIVED_AT_PICKUP','PICKUP_VERIFIED') then raise exception 'PICKUP_MUST_BE_ARRIVED_BEFORE_VERIFICATION: current status %',coalesce(v_current_mobile_status,'NULL'); end if;
  v_expected_count := public.be_rider_authoritative_expected_count_v59(v_pickup_id);
  if jsonb_typeof(coalesce(p_payload->'parcels','[]'::jsonb))='array' and jsonb_array_length(coalesce(p_payload->'parcels','[]'::jsonb))>0 then
    perform public.be_rider_save_pickup_parcel_verifications(v_pickup_id,v_worker_code,p_payload->'parcels');
  end if;
  select count(*)::integer into v_extra_count from public.be_pickup_parcel_verifications v where v.pickup_id=v_pickup_id and v.parcel_sequence>v_expected_count;
  if v_extra_count>0 then raise exception 'FIELD_TEAM_VERIFICATION_INTEGRITY_ERROR: pickup % has % verification row(s) beyond authoritative count %.',v_pickup_id,v_extra_count,v_expected_count; end if;
  select count(distinct v.parcel_sequence)::integer,coalesce(sum(v.actual_weight_kg),0),min(coalesce(v.proof_photo_url,v.proof_photo_path))
  into v_submitted_count,v_total_weight,v_first_proof_url
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup_id and v.parcel_sequence between 1 and v_expected_count and coalesce(v.actual_weight_kg,0)>0 and nullif(btrim(coalesce(v.proof_photo_url,v.proof_photo_path)),'') is not null and upper(coalesce(v.proof_check_status,'')) not in ('REJECTED','REUPLOAD_REQUIRED','SKIPPED_PARTIAL') and upper(coalesce(v.clarity_status,'LEGACY_UNCHECKED')) in ('PASS','LEGACY_UNCHECKED');
  if coalesce(v_submitted_count,0)=0 then raise exception 'Enter an actual weight and upload a clear photo for at least one parcel before Submit.'; end if;
  v_partial := v_submitted_count<v_expected_count;
  if v_partial then
    update public.be_portal_pickup_requests p set pickup_status='PICKUP_VERIFICATION_IN_PROGRESS',workflow_stage='PICKUP_VERIFICATION_IN_PROGRESS',rider_app_stage='VERIFY_PICKUP',rider_status=case when v_role='rider' then 'ARRIVED' else p.rider_status end,pickup_verified_at=null,verified_parcels=v_submitted_count,pickup_verified_total_weight=v_total_weight,pickup_proof_url=coalesce(v_first_proof_url,p.pickup_proof_url),field_verification_payload=coalesce(p.field_verification_payload,'{}'::jsonb)||jsonb_build_object('pickup_id',v_pickup_id,'submitted_by_auth_user_id',v_auth_user_id,'submitted_by_role',upper(v_role),'submitted_by_worker_code',v_worker_code,'submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',true,'submitted_at',now(),'count_authority_build','RIDER_PICKUP_COUNT_AUTHORITY_V59_3_2026_08_01'),data_entry_status='WAITING_RIDER_COMPLETION',photo_review_status='PARTIAL',last_event_at=now(),last_event_by=v_auth_user_id::text,last_event_note=upper(v_role)||' submitted partial pickup proof; verification remains incomplete',updated_at=now() where p.pickup_id=v_pickup_id;
    return jsonb_build_object('ok',true,'action','partial_verify_pickup','pickup_id',v_pickup_id,'mobile_status','ARRIVED_AT_PICKUP','submitted_count',v_submitted_count,'expected_count',v_expected_count,'partial_verification',true,'pickup_verified',false,'ready_for_collection',false,'close_verification_screen',false,'clear_verification_form',false,'message',format('%s of %s parcel proofs are ready. Complete the remaining proofs before verification.',v_submitted_count,v_expected_count));
  end if;
  update public.be_portal_pickup_requests p set pickup_status='PICKUP_VERIFIED',workflow_stage='PICKUP_VERIFIED',rider_app_stage='VERIFIED_PICKUP',rider_status=case when v_role='rider' then 'VERIFIED' else p.rider_status end,pickup_verified_at=now(),field_verified_at=coalesce(p.field_verified_at,now()),field_verified_by=v_auth_user_id::text,verified_parcels=v_expected_count,pickup_verified_total_weight=v_total_weight,pickup_proof_url=coalesce(v_first_proof_url,nullif(btrim(p_payload->>'proof_url'),''),p.pickup_proof_url),field_verification_payload=coalesce(p.field_verification_payload,'{}'::jsonb)||jsonb_build_object('pickup_id',v_pickup_id,'submitted_by_auth_user_id',v_auth_user_id,'submitted_by_role',upper(v_role),'submitted_by_worker_code',v_worker_code,'submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',false,'submitted_at',now(),'count_authority_build','RIDER_PICKUP_COUNT_AUTHORITY_V59_3_2026_08_01'),data_entry_status='PENDING_REVIEW',photo_review_status='PENDING',last_event_at=now(),last_event_by=v_auth_user_id::text,last_event_note=upper(v_role)||' fully verified authoritative pickup parcel count and proof',updated_at=now() where p.pickup_id=v_pickup_id;
  if to_regprocedure('public.be_sync_rider_proofs_to_data_entry()') is not null then perform public.be_sync_rider_proofs_to_data_entry(); end if;
  return jsonb_build_object('ok',true,'action','verify_pickup','pickup_id',v_pickup_id,'mobile_status','PICKUP_VERIFIED','submitted_count',v_submitted_count,'expected_count',v_expected_count,'total_actual_weight_kg',v_total_weight,'partial_verification',false,'pickup_verified',true,'ready_for_collection',true,'data_entry_status','PENDING_REVIEW','close_verification_screen',true,'clear_verification_form',true,'ready_for_next_pickup',true,'message',format('All %s authoritative parcel proofs submitted successfully.',v_expected_count));
end;
$function$
;
