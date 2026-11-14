DO $patch$
DECLARE f text;
BEGIN
 f:=pg_get_functiondef('private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text)'::regprocedure);
 IF strpos(f,'v_photo_exception')=0 THEN
  IF strpos(f,'v_superadmin_bulkload boolean := false;')=0 OR strpos(f,'if not v_os_evidence and not v_superadmin_bulkload and nullif(v_pickup.pickup_proof_url')=0 THEN RAISE EXCEPTION 'Unexpected ready-waybill definition'; END IF;
  f:=replace(f,'v_superadmin_bulkload boolean := false;','v_superadmin_bulkload boolean := false; v_photo_exception boolean := false;');
  f:=replace(f,'if v_os_evidence then perform public.be_data_entry_require_access_v57(''upload'',false); end if;',
  $body$if v_os_evidence then perform public.be_data_entry_require_access_v57('upload',false); end if;
  v_photo_exception := exists(select 1 from jsonb_array_elements(p_rows) r(item)
    where private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,(r.item->>'parcel_sequence')::integer))
   and not exists(select 1 from jsonb_array_elements(p_rows) r(item)
    where not exists(select 1 from public.be_pickup_parcel_verifications v
      where v.pickup_id=v_pickup.pickup_id and v.parcel_sequence=(r.item->>'parcel_sequence')::integer
      and v.proof_check_status='APPROVED'
      and (private.be_reason_only_photo_skip_valid_v1(v.pickup_id,v.parcel_sequence)
       or nullif(btrim(coalesce(v.proof_photo_url,v.proof_photo_path,v.proof_photo_data)), '') is not null)));
  $body$);
  f:=replace(f,'if not v_os_evidence and not v_superadmin_bulkload and nullif(v_pickup.pickup_proof_url',
    'if not v_os_evidence and not v_superadmin_bulkload and not v_photo_exception and nullif(v_pickup.pickup_proof_url');
  f:=replace(f,'photo_review_status = case when','photo_review_status = case when v_photo_exception then ''PHOTO_SKIPPED'' when');
  f:=replace(f,'''evidence_mode'',case when v_os_evidence','''evidence_mode'',case when v_photo_exception then ''REASON_ONLY_PHOTO_SKIP'' when v_os_evidence');
  f:=replace(f,'''photo_review_status'', case when v_os_evidence','''photo_review_status'', case when v_photo_exception then ''PHOTO_SKIPPED'' when v_os_evidence');
  f:=replace(f,'last_event_note = case when v_superadmin_bulkload','last_event_note = case when v_photo_exception then ''Data Entry created waybill with an audited reason-only photo skip; no later photo required'' when v_superadmin_bulkload');
  f:=replace(f,'verification_status = ''DATA_ENTRY_APPROVED'',','verification_status = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then verification_status else ''DATA_ENTRY_APPROVED'' end,');
  f:=replace(f,'reviewed_by = auth.uid()::text,','reviewed_by = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_by else auth.uid()::text end,');
  f:=replace(f,'reviewed_by_email = v_actor_email,','reviewed_by_email = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_by_email else v_actor_email end,');
  f:=replace(f,'reviewed_at = now(),','reviewed_at = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_at else now() end,');
  f:=replace(f,'review_note = nullif(btrim(v_row ->> ''remark''), ''''),','review_note = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then review_note else nullif(btrim(v_row ->> ''remark''), '''') end,');
  EXECUTE f;
 END IF;
 f:=pg_get_functiondef('public.be_dispatch_ready_queue_v19(integer,text)'::regprocedure);
 IF strpos(f,'be_reason_only_photo_skip_valid_v1')=0 THEN
  IF strpos(f,'and d.photo_evidence_mode=''OS_SOFTCOPY''')=0 THEN RAISE EXCEPTION 'Unexpected dispatch queue definition'; END IF;
  f:=replace(f,$old$and d.photo_evidence_mode='OS_SOFTCOPY'
          and d.os_imported_at is not null
          and nullif(d.source_file_name,'') is not null$old$,
    $new$and ((d.photo_evidence_mode='OS_SOFTCOPY' and d.os_imported_at is not null and nullif(d.source_file_name,'') is not null)
       or private.be_reason_only_photo_skip_valid_v1(d.pickup_id,d.parcel_sequence))$new$);
  EXECUTE f;
 END IF;
END $patch$;

