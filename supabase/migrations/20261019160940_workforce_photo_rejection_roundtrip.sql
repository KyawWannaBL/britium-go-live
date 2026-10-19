CREATE OR REPLACE FUNCTION public.be_rider_upsert_parcel_proof(p_pickup_id text, p_parcel_sequence integer, p_actual_weight_kg numeric, p_proof_url text, p_delivery_way_id text DEFAULT NULL::text, p_tracking_no text DEFAULT NULL::text, p_waybill_no text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_proof_file_name text DEFAULT NULL::text, p_signature_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_existing_id uuid;
  v_submitted_by text := coalesce(auth.uid()::text, 'SYSTEM');
  v_expected_count integer;
  v_delivery_way_id text;
  v_review_status text;
begin
  if nullif(btrim(p_pickup_id), '') is null then
    raise exception 'pickup_id is required.';
  end if;

  if coalesce(p_parcel_sequence, 0) < 1 then
    raise exception 'A valid parcel sequence is required.';
  end if;

  v_expected_count := public.be_rider_authoritative_expected_count_v59(p_pickup_id);
  if p_parcel_sequence > v_expected_count then
    raise exception
      'RIDER_PARCEL_SEQUENCE_EXCEEDS_EXPECTED_COUNT: pickup %, sequence %, expected 1..%',
      btrim(p_pickup_id), p_parcel_sequence, v_expected_count;
  end if;

  if coalesce(p_actual_weight_kg, 0) <= 0 then
    raise exception 'Actual parcel weight must be greater than zero.';
  end if;

  if nullif(btrim(p_proof_url), '') is null then
    raise exception 'A pickup proof photo is required.';
  end if;

  v_delivery_way_id := coalesce(
    nullif(btrim(p_delivery_way_id), ''),
    public.be_allocate_delivery_way_id(btrim(p_pickup_id), p_parcel_sequence)
  );

  select v.id
    into v_existing_id
  from public.be_pickup_parcel_verifications v
  where v.pickup_id = btrim(p_pickup_id)
    and v.parcel_sequence = p_parcel_sequence
  order by v.updated_at desc nulls last, v.created_at desc nulls last, v.id
  limit 1
  for update;

  if v_existing_id is null then
    insert into public.be_pickup_parcel_verifications (
      pickup_id,
      parcel_sequence,
      delivery_way_id,
      tracking_no,
      waybill_no,
      actual_weight_kg,
      parcel_weight_kg,
      proof_photo_path,
      proof_photo_url,
      proof_file_name,
      signature_url,
      remarks,
      verification_status,
      proof_check_status,
      submitted_by,
      submitted_at,
      created_at,
      updated_at
    )
    values (
      btrim(p_pickup_id),
      p_parcel_sequence,
      v_delivery_way_id,
      nullif(btrim(p_tracking_no), ''),
      nullif(btrim(p_waybill_no), ''),
      p_actual_weight_kg,
      p_actual_weight_kg,
      btrim(p_proof_url),
      btrim(p_proof_url),
      nullif(btrim(p_proof_file_name), ''),
      nullif(btrim(p_signature_url), ''),
      nullif(btrim(p_remarks), ''),
      'RIDER_SUBMITTED',
      'PENDING_REVIEW',
      v_submitted_by,
      now(),
      now(),
      now()
    )
    returning id into v_existing_id;
  else
    update public.be_pickup_parcel_verifications v
    set
      delivery_way_id = coalesce(nullif(btrim(v_delivery_way_id), ''), v.delivery_way_id),
      tracking_no = coalesce(nullif(btrim(p_tracking_no), ''), v.tracking_no),
      waybill_no = coalesce(nullif(btrim(p_waybill_no), ''), v.waybill_no),
      actual_weight_kg = p_actual_weight_kg,
      parcel_weight_kg = p_actual_weight_kg,
      proof_photo_path = btrim(p_proof_url),
      proof_photo_url = btrim(p_proof_url),
      proof_file_name = coalesce(nullif(btrim(p_proof_file_name), ''), v.proof_file_name),
      signature_url = coalesce(nullif(btrim(p_signature_url), ''), v.signature_url),
      remarks = coalesce(nullif(btrim(p_remarks), ''), v.remarks),
      verification_status = case
        when v.proof_photo_url is not distinct from btrim(p_proof_url)
          and upper(coalesce(v.verification_status, '')) in ('APPROVED', 'VERIFIED', 'REUPLOAD_REQUIRED', 'PHOTO_REJECTED', 'REJECTED')
          then v.verification_status
        else 'RIDER_SUBMITTED'
      end,
      proof_check_status = case
        when v.proof_photo_url is not distinct from btrim(p_proof_url)
          and upper(coalesce(v.proof_check_status, '')) in ('APPROVED', 'VERIFIED', 'REUPLOAD_REQUIRED', 'PHOTO_REJECTED', 'REJECTED')
          then v.proof_check_status
        else 'PENDING_REVIEW'
      end,
      submitted_by = v_submitted_by,
      submitted_at = now(),
      reviewed_by = case when v.proof_photo_url is distinct from btrim(p_proof_url) then null else v.reviewed_by end,
      reviewed_by_email = case when v.proof_photo_url is distinct from btrim(p_proof_url) then null else v.reviewed_by_email end,
      reviewed_at = case when v.proof_photo_url is distinct from btrim(p_proof_url) then null else v.reviewed_at end,
      review_note = case when v.proof_photo_url is distinct from btrim(p_proof_url) then null else v.review_note end,
      updated_at = now()
    where v.id = v_existing_id;
  end if;

  select proof_check_status into v_review_status from public.be_pickup_parcel_verifications where id=v_existing_id;
  return jsonb_build_object(
    'ok', true,
    'pickup_id', btrim(p_pickup_id),
    'parcel_sequence', p_parcel_sequence,
    'delivery_way_id', v_delivery_way_id,
    'actual_weight_kg', p_actual_weight_kg,
    'proof_url', btrim(p_proof_url),
    'review_status', v_review_status
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.be_pickup_parcel_capture_snapshot(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_pickup text:=nullif(btrim(coalesce(p_pickup_id,'')),'');
  v_expected integer:=0;
  v_rows jsonb:='[]'::jsonb;
begin
  if v_pickup is null then raise exception 'pickup_id is required'; end if;
  perform public.be_rider_assert_assigned_pickup(v_pickup);
  v_expected:=public.be_rider_authoritative_expected_count_v59(v_pickup);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,
    'line_no',v.parcel_sequence,
    'row_no',v.parcel_sequence,
    'parcel_sequence',v.parcel_sequence,
    'waybill_no',v.waybill_no,
    'delivery_way_id',v.delivery_way_id,
    'tracking_no',v.tracking_no,
    'temp_qr_code',coalesce(v.qr_payload,'TQR-'||upper(v_pickup)||'-'||lpad(v.parcel_sequence::text,3,'0')),
    'parcel_weight',coalesce(v.actual_weight_kg,v.parcel_weight_kg),
    'remarks',v.remarks,
    'cargo_photo_url',coalesce(v.proof_photo_url,v.proof_photo_path),
    'cargo_photo_name',v.proof_file_name,
    'review_note',v.review_note,
    'photo_status',coalesce(v.proof_check_status,v.verification_status,v.status,'PENDING_REVIEW'),
    'saved',true,
    'submitted_at',v.submitted_at,
    'reviewed_at',v.reviewed_at
  ) order by v.parcel_sequence),'[]'::jsonb)
  into v_rows
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup;

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'pickup_id',v_pickup,
    'expected_count',v_expected,
    'parcels',v_rows
  );
end;
$function$
;

