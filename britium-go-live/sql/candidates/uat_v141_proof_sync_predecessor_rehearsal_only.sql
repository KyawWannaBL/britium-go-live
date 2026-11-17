-- CI-only Production-derived V141 historical predecessor; one V141 orphan-guard insertion removed from full function DDL.
-- Never use as a hosted migration. V141 migration reinstates orphan protection.
CREATE OR REPLACE FUNCTION public.be_sync_rider_proofs_to_data_entry()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_name text;
  v_source regclass;
  v_record record;
  v_json jsonb;
  v_payload jsonb;
  v_pickup_id text;
  v_sequence integer;
  v_delivery_way_id text;
  v_proof_url text;
  v_submitted_by text;
  v_source_status text;
  v_verification_status text;
  v_review_status text;
  v_changed integer := 0;
  v_inserted integer := 0;
  v_source_rows integer := 0;
  v_row_count integer;
begin
  -- The canonical Rider verification RPC stores its primary proof directly on
  -- be_portal_pickup_requests. Bridge that source first so Data Entry remains
  -- connected even when none of the optional per-parcel proof tables exists.
  for v_record in
    select
      p.pickup_id,
      coalesce(
        nullif(p.pickup_proof_url, ''),
        nullif(p.field_verification_payload ->> 'photo_url', ''),
        nullif(p.field_verification_payload ->> 'proof_url', ''),
        nullif(
          p.field_verification_payload ->> 'proof_photo_url',
          ''
        ),
        nullif(
          p.field_verification_payload ->> 'proof_photo_data_url',
          ''
        )
      ) as proof_url,
      p.assigned_rider_id::text as submitted_by,
      coalesce(p.pickup_verified_at, p.updated_at, now()) as submitted_at
    from public.be_portal_pickup_requests p
    where coalesce(
      nullif(p.pickup_proof_url, ''),
      nullif(p.field_verification_payload ->> 'photo_url', ''),
      nullif(p.field_verification_payload ->> 'proof_url', ''),
      nullif(
        p.field_verification_payload ->> 'proof_photo_url',
        ''
      ),
      nullif(
        p.field_verification_payload ->> 'proof_photo_data_url',
        ''
      )
    ) is not null
  loop
    update public.be_pickup_parcel_verifications target
    set
      delivery_way_id = coalesce(
        target.delivery_way_id,
        v_record.pickup_id || '-001'
      ),
      verification_status = case
        when upper(coalesce(target.verification_status, '')) =
             'DATA_ENTRY_APPROVED'
          then target.verification_status
        else 'RIDER_SUBMITTED'
      end,
      proof_check_status = case
        when upper(coalesce(target.proof_check_status, '')) in (
          'APPROVED',
          'REUPLOAD_REQUIRED'
        ) then target.proof_check_status
        else 'PENDING_REVIEW'
      end,
      proof_photo_path = coalesce(
        target.proof_photo_path,
        v_record.proof_url
      ),
      proof_photo_url = v_record.proof_url,
      submitted_by = coalesce(
        target.submitted_by,
        v_record.submitted_by
      ),
      submitted_at = coalesce(
        target.submitted_at,
        v_record.submitted_at
      ),
      updated_at = now()
    where target.pickup_id = v_record.pickup_id
      and target.parcel_sequence = 1
      and (
        target.delivery_way_id is null
        or target.proof_photo_url is distinct from v_record.proof_url
        or target.proof_photo_path is null
        or nullif(target.verification_status, '') is null
        or nullif(target.proof_check_status, '') is null
      );

    get diagnostics v_row_count = row_count;
    v_changed := v_changed + v_row_count;

    if not exists (
      select 1
      from public.be_pickup_parcel_verifications existing
      where existing.pickup_id = v_record.pickup_id
        and existing.parcel_sequence = 1
    ) then
      insert into public.be_pickup_parcel_verifications (
        pickup_id,
        parcel_sequence,
        delivery_way_id,
        verification_status,
        proof_check_status,
        proof_photo_path,
        proof_photo_url,
        submitted_by,
        submitted_at,
        created_at,
        updated_at
      )
      values (
        v_record.pickup_id,
        1,
        v_record.pickup_id || '-001',
        'RIDER_SUBMITTED',
        'PENDING_REVIEW',
        v_record.proof_url,
        v_record.proof_url,
        v_record.submitted_by,
        v_record.submitted_at,
        now(),
        now()
      );

      v_inserted := v_inserted + 1;
    end if;

    v_source_rows := v_source_rows + 1;
  end loop;

  -- These are the proof relations used by the deployed Rider/Data Entry
  -- clients across the current and legacy builds. Missing sources are skipped.
  foreach v_source_name in array array[
    'be_parcel_photo_reviews',
    'be_data_entry_parcels',
    'be_rider_pickup_proofs',
    'be_rider_parcel_proofs',
    'be_pickup_parcel_proofs'
  ]
  loop
    v_source := to_regclass('public.' || v_source_name);

    if v_source is null then
      continue;
    end if;

    for v_record in execute format(
      'select to_jsonb(source_row) as row_json from %s source_row',
      v_source
    )
    loop
      v_json := coalesce(v_record.row_json, '{}'::jsonb);
      v_payload := case
        when jsonb_typeof(v_json -> 'payload') = 'object'
          then v_json -> 'payload'
        else '{}'::jsonb
      end;

      v_pickup_id := coalesce(
        nullif(btrim(v_json ->> 'pickup_id'), ''),
        nullif(btrim(v_json ->> 'pickup_request_id'), ''),
        nullif(btrim(v_json ->> 'canonical_pickup_id'), ''),
        nullif(btrim(v_json ->> 'request_code'), ''),
        nullif(btrim(v_payload ->> 'pickup_id'), ''),
        nullif(btrim(v_payload ->> 'pickup_request_id'), '')
      );

      v_proof_url := coalesce(
        nullif(btrim(v_json ->> 'current_photo_url'), ''),
        nullif(btrim(v_json ->> 'photo_url'), ''),
        nullif(btrim(v_json ->> 'proof_url'), ''),
        nullif(btrim(v_json ->> 'proof_photo_url'), ''),
        nullif(btrim(v_json ->> 'proof_photo_path'), ''),
        nullif(btrim(v_json ->> 'cargo_photo_url'), ''),
        nullif(btrim(v_json ->> 'parcel_photo_url'), ''),
        nullif(btrim(v_payload ->> 'current_photo_url'), ''),
        nullif(btrim(v_payload ->> 'photo_url'), ''),
        nullif(btrim(v_payload ->> 'proof_url'), ''),
        nullif(btrim(v_payload ->> 'proof_photo_url'), ''),
        nullif(btrim(v_payload ->> 'proof_photo_data_url'), '')
      );

      if v_pickup_id is null or v_proof_url is null then
        continue;
      end if;

      v_sequence := public.be_safe_positive_integer(
        coalesce(
          nullif(v_json ->> 'parcel_sequence', ''),
          nullif(v_json ->> 'item_no', ''),
          nullif(v_json ->> 'line_no', ''),
          nullif(v_json ->> 'row_no', ''),
          nullif(v_payload ->> 'parcel_sequence', ''),
          nullif(v_payload ->> 'item_no', '')
        ),
        1
      );

      v_delivery_way_id := coalesce(
        nullif(btrim(v_json ->> 'delivery_way_id'), ''),
        nullif(btrim(v_json ->> 'tracking_no'), ''),
        nullif(btrim(v_json ->> 'tracking_number'), ''),
        nullif(btrim(v_payload ->> 'delivery_way_id'), ''),
        nullif(btrim(v_payload ->> 'tracking_no'), ''),
        v_pickup_id || '-' || lpad(v_sequence::text, 3, '0')
      );

      v_submitted_by := coalesce(
        nullif(btrim(v_json ->> 'submitted_by'), ''),
        nullif(btrim(v_json ->> 'uploaded_by'), ''),
        nullif(btrim(v_json ->> 'rider_id'), ''),
        nullif(btrim(v_json ->> 'rider_code'), ''),
        nullif(btrim(v_payload ->> 'submitted_by'), ''),
        nullif(btrim(v_payload ->> 'uploaded_by'), ''),
        nullif(btrim(v_payload ->> 'rider_id'), ''),
        nullif(btrim(v_payload ->> 'rider_code'), '')
      );

      v_source_status := upper(coalesce(
        nullif(btrim(v_json ->> 'review_status'), ''),
        nullif(btrim(v_json ->> 'photo_status'), ''),
        nullif(btrim(v_json ->> 'proof_check_status'), ''),
        nullif(btrim(v_payload ->> 'review_status'), ''),
        nullif(btrim(v_payload ->> 'photo_check_status'), ''),
        'PENDING_REVIEW'
      ));

      v_review_status := case
        when v_source_status in (
          'APPROVED',
          'APPROVED_AFTER_REUPLOAD',
          'PHOTO_APPROVED'
        ) then 'APPROVED'
        when v_source_status in (
          'PHOTO_REJECTED',
          'REUPLOAD_REQUIRED',
          'REJECTED',
          'RETURNED'
        ) then 'REUPLOAD_REQUIRED'
        else 'PENDING_REVIEW'
      end;

      v_verification_status := case
        when v_review_status = 'APPROVED'
          then 'DATA_ENTRY_APPROVED'
        when v_review_status = 'REUPLOAD_REQUIRED'
          then 'RIDER_REUPLOAD_REQUIRED'
        else 'RIDER_SUBMITTED'
      end;

      update public.be_pickup_parcel_verifications target
      set
        delivery_way_id = coalesce(
          v_delivery_way_id,
          target.delivery_way_id
        ),
        verification_status = case
          when v_review_status = 'APPROVED'
            then 'DATA_ENTRY_APPROVED'
          when v_review_status = 'REUPLOAD_REQUIRED'
            then 'RIDER_REUPLOAD_REQUIRED'
          when upper(coalesce(target.verification_status, '')) in (
            'DATA_ENTRY_APPROVED',
            'RIDER_REUPLOAD_REQUIRED'
          ) then target.verification_status
          else v_verification_status
        end,
        proof_check_status = case
          when v_review_status in (
            'APPROVED',
            'REUPLOAD_REQUIRED'
          ) then v_review_status
          when upper(coalesce(target.proof_check_status, '')) in (
            'APPROVED',
            'REUPLOAD_REQUIRED'
          ) then target.proof_check_status
          else v_review_status
        end,
        proof_photo_path = coalesce(v_proof_url, target.proof_photo_path),
        proof_photo_url = coalesce(v_proof_url, target.proof_photo_url),
        submitted_by = coalesce(target.submitted_by, v_submitted_by),
        submitted_at = coalesce(target.submitted_at, now()),
        updated_at = now()
      where target.pickup_id = v_pickup_id
        and target.parcel_sequence = v_sequence
        and (
          target.delivery_way_id is distinct from coalesce(
            v_delivery_way_id,
            target.delivery_way_id
          )
          or (
            v_review_status in (
              'APPROVED',
              'REUPLOAD_REQUIRED'
            )
            and target.proof_check_status is distinct from v_review_status
          )
          or nullif(target.verification_status, '') is null
          or nullif(target.proof_check_status, '') is null
          or target.proof_photo_path is distinct from coalesce(
            v_proof_url,
            target.proof_photo_path
          )
          or target.proof_photo_url is distinct from coalesce(
            v_proof_url,
            target.proof_photo_url
          )
        );

      get diagnostics v_row_count = row_count;
      v_changed := v_changed + v_row_count;

      if not exists (
        select 1
        from public.be_pickup_parcel_verifications existing
        where existing.pickup_id = v_pickup_id
          and existing.parcel_sequence = v_sequence
      ) then
        insert into public.be_pickup_parcel_verifications (
          pickup_id,
          parcel_sequence,
          delivery_way_id,
          verification_status,
          proof_check_status,
          proof_photo_path,
          proof_photo_url,
          submitted_by,
          submitted_at,
          created_at,
          updated_at
        )
        values (
          v_pickup_id,
          v_sequence,
          v_delivery_way_id,
          v_verification_status,
          v_review_status,
          v_proof_url,
          v_proof_url,
          v_submitted_by,
          now(),
          now(),
          now()
        );

        v_inserted := v_inserted + 1;
      end if;

      v_source_rows := v_source_rows + 1;
    end loop;
  end loop;

  -- A submitted proof opens Data Entry review. It does not make the waybill
  -- eligible until the canonical Rider state reaches COLLECTED/TO_WAREHOUSE.
  update public.be_portal_pickup_requests p
  set
    data_entry_status = case
      when upper(coalesce(p.data_entry_status, '')) in (
        '',
        'WAITING_PICKUP',
        'WAITING_DATA_ENTRY',
        'PENDING'
      ) then 'PENDING_REVIEW'
      else p.data_entry_status
    end,
    photo_review_status = case
      when upper(coalesce(p.photo_review_status, 'PENDING')) in (
        'RETURNED',
        'REJECTED'
      ) then p.photo_review_status
      else 'PENDING'
    end,
    last_event_at = coalesce(p.last_event_at, now()),
    last_event_note = case
      when nullif(p.last_event_note, '') is null
        then 'Rider parcel proof exposed to Data Entry'
      else p.last_event_note
    end,
    updated_at = now()
  where nullif(p.waybill_no, '') is null
    and exists (
      select 1
      from public.be_pickup_parcel_verifications proof
      where proof.pickup_id = p.pickup_id
        and coalesce(
          nullif(proof.proof_photo_url, ''),
          nullif(proof.proof_photo_path, '')
        ) is not null
    )
    and upper(coalesce(p.data_entry_status, '')) in (
      '',
      'WAITING_PICKUP',
      'WAITING_DATA_ENTRY',
      'PENDING'
    );

  return jsonb_build_object(
    'ok', true,
    'source_rows_with_proof', v_source_rows,
    'inserted', v_inserted,
    'updated', v_changed
  );
end
$function$;
