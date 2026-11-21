-- HOSTED UAT ONLY: restore source V54 photo waiver restricted to canonical SYNTHETIC pickup records.
-- Audit events retained. Only authorized global Super Admin; no production photo rule bypass.
-- Do not run against production. Does NOT enable Save, Save All, or Waybill financial writes.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $verify$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified isolated UAT'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR to_regprocedure('public.be_data_entry_photo_waiver_v54(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'UAT waiver already exists or writes active'; END IF;
 IF (SELECT count(*) FROM public.be_pickup_parcel_verifications)<>0 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 THEN RAISE EXCEPTION 'Existing proof/waybill activity - manual review required'; END IF;
END $verify$;
CREATE FUNCTION public.be_data_entry_photo_waiver_v54(p_payload jsonb)
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
  v_expected_way_id text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_access := public.be_data_entry_require_access_v57('create',false);
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'update');
  IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton) <> 'MUTATION_SHADOW'
    OR coalesce(replace(lower(public.be_current_role()),'-','_'),'') <> 'super_admin'
    OR NOT EXISTS (
      SELECT 1 FROM public.be_employee_territory_assignments t
      WHERE t.user_id=auth.uid() AND t.active AND t.can_read AND t.scope_type='GLOBAL'
    )
    OR v_pickup_id NOT IN ('P2026-ISN-901','P2026-MDY-901')
    OR NOT EXISTS(
      SELECT 1 FROM public.be_portal_pickup_requests p
      WHERE p.pickup_id=v_pickup_id AND p.merchant_code='UAT-QA'
        AND p.pickup_address='SYNTHETIC TEST ONLY - NO ACTUAL PICKUP'
    )
  THEN RAISE EXCEPTION 'UAT_TEST_PHOTO_WAIVER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
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

  SELECT delivery_way_id INTO v_expected_way_id
  FROM public.be_delivery_way_id_registry
  WHERE pickup_id=v_pickup_id AND parcel_sequence=v_sequence;
  IF v_expected_way_id IS NULL THEN
    RAISE EXCEPTION 'UAT_TEST_CANONICAL_WAY_ID_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF v_delivery_way_id IS NOT NULL AND upper(v_delivery_way_id)<>upper(v_expected_way_id) THEN
    RAISE EXCEPTION 'UAT_TEST_WAY_ID_MISMATCH' USING ERRCODE='22023';
  END IF;
  v_delivery_way_id:=v_expected_way_id;

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
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_photo_waiver_v54(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_photo_waiver_v54(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
