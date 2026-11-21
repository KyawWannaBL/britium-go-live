-- Britium HOSTED UAT ONLY: restore original review-parcel-photo RPC with extra evidence/role/QA scope guards.
-- Function restricted to synthetic pickup records; no real field photos, no real riders assigned.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified UAT identity state'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_pickup_parcel_verifications)<>0 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 THEN RAISE EXCEPTION 'Unexpected UAT proof/finance state'; END IF;
 IF to_regclass('public.be_parcel_photo_reviews') IS NOT NULL OR to_regprocedure('public.be_review_parcel_photo(jsonb)') IS NOT NULL OR to_regprocedure('public.be_rider_safe_positive_integer(text)') IS NOT NULL THEN RAISE EXCEPTION 'Photo review components already exist'; END IF;
END $gate$;
CREATE TABLE public.be_parcel_photo_reviews (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pickup_id" text,
  "tracking_no" text,
  "photo_url" text,
  "review_status" text DEFAULT 'PENDING'::text,
  "rejection_reason" text,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "uploaded_by" text,
  "uploaded_role" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "parcel_sequence" integer,
  "delivery_way_id" text,
  "current_photo_url" text,
  "previous_photo_url" text,
  "actual_weight_kg" numeric,
  "rejection_note" text,
  "reupload_count" integer DEFAULT 0,
  "remarks" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "be_parcel_photo_reviews_pkey" PRIMARY KEY (id)
);
ALTER TABLE public.be_parcel_photo_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_parcel_photo_reviews FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_rider_safe_positive_integer(p_value text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_value integer;
begin
  if nullif(btrim(p_value), '') is null
     or btrim(p_value) !~ '^[0-9]+$' then
    return null;
  end if;

  begin
    v_value := btrim(p_value)::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      return null;
  end;

  if v_value < 1 then
    return null;
  end if;

  return v_value;
end;
$function$
;
ALTER FUNCTION public.be_rider_safe_positive_integer(text) SET search_path TO pg_catalog,public,pg_temp;
REVOKE ALL ON FUNCTION public.be_rider_safe_positive_integer(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_review_parcel_photo(p_payload jsonb)
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
  IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton) <> 'MUTATION_SHADOW'
    OR replace(lower(coalesce(public.be_current_role(),'')),'-','_') <> 'super_admin'
    OR NOT EXISTS (SELECT 1 FROM public.be_employee_territory_assignments t WHERE t.user_id=auth.uid() AND t.active AND t.can_read AND t.scope_type='GLOBAL')
    OR v_pickup_id NOT IN ('P2026-ISN-901','P2026-MDY-901')
    OR NOT EXISTS (
      SELECT 1 FROM public.be_portal_pickup_requests p
      WHERE p.pickup_id=v_pickup_id AND p.merchant_code='UAT-QA'
       AND p.pickup_address='SYNTHETIC TEST ONLY - NO ACTUAL PICKUP'
    )
  THEN RAISE EXCEPTION 'UAT_PHOTO_REVIEW_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  v_reviewer := auth.uid()::text;
  SELECT lower(email) INTO v_reviewer_email FROM public.be_user_account_registry
   WHERE auth_user_id=auth.uid() AND lower(status) IN ('active','enabled') AND coalesce(active,true) AND coalesce(is_active,true) LIMIT 1;

  if v_action not in ('APPROVE', 'REJECT') then
    return jsonb_build_object('ok', false, 'error', 'action must be APPROVE or REJECT');
  end if;

  if v_pickup_id is null or coalesce(v_sequence, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'pickup_id and parcel_sequence are required');
  end if;

  if v_action = 'REJECT' and nullif(v_reason, '') is null then
    return jsonb_build_object('ok', false, 'error', 'rejection_reason is required');
  end if;

  IF v_action='APPROVE' AND NOT EXISTS(
    SELECT 1 FROM public.be_pickup_parcel_verifications v
    WHERE v.pickup_id=v_pickup_id AND v.parcel_sequence=v_sequence
      AND nullif(btrim(coalesce(v.proof_photo_path,v.proof_photo_url,v.proof_photo_data,'')),'') IS NOT NULL
      AND coalesce((v.raw_payload->>'photo_skipped')::boolean,false)=false
  ) THEN
    RETURN jsonb_build_object('ok',false,'error','UAT_PHOTO_EVIDENCE_REQUIRED','pickup_id',v_pickup_id,'parcel_sequence',v_sequence);
  END IF;
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
$function$
;
REVOKE ALL ON FUNCTION public.be_review_parcel_photo(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_review_parcel_photo(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
