-- V34: Allow active SUPERADMIN to create waybills for consolidated BLK bulkloads
-- without Rider verification, while preserving all normal pickup controls.
-- Also treat V33 alias-resolved original merchant WayIDs as canonical.

CREATE OR REPLACE FUNCTION public.be_superadmin_bulkload_waybill_bypass_v34(p_pickup_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.be_user_account_registry u
    JOIN public.be_portal_pickup_requests p
      ON p.pickup_id = nullif(btrim(p_pickup_id),'')
    WHERE u.auth_user_id = auth.uid()
      AND coalesce(u.is_active,false) = true
      AND lower(coalesce(u.status,'')) = 'active'
      AND upper(coalesce(u.role,'')) = 'SUPERADMIN'
      AND upper(coalesce(p.merchant_code,p.merchant_id,'')) = 'BLK'
  );
$$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.be_data_entry_financial_v2_create_ready_waybill(jsonb)'::regprocedure)
    INTO v_def;

  IF position('v_superadmin_bulkload boolean := false;' in v_def)=0 THEN
    v_def := replace(
      v_def,
      '  v_os_evidence boolean := false;',
      '  v_os_evidence boolean := false;'||E'\n'||'  v_superadmin_bulkload boolean := false;'
    );
  END IF;

  v_def := replace(
    v_def,
    '  if v_actor_id is not null' || E'\n' ||
    '     and nullif(v_pickup ->> ''assigned_rider_id'','''')=v_actor_id::text then',
    '  v_superadmin_bulkload := public.be_superadmin_bulkload_waybill_bypass_v34(v_pickup_id);' || E'\n\n' ||
    '  if v_actor_id is not null' || E'\n' ||
    '     and not v_superadmin_bulkload' || E'\n' ||
    '     and nullif(v_pickup ->> ''assigned_rider_id'','''')=v_actor_id::text then'
  );

  v_def := replace(
    v_def,
    '  if not v_os_evidence and (nullif(v_pickup ->> ''pickup_verified_at'','''') is null',
    '  if not v_os_evidence and not v_superadmin_bulkload and (nullif(v_pickup ->> ''pickup_verified_at'','''') is null'
  );

  v_def := replace(
    v_def,
    '  if not v_os_evidence and nullif(v_pickup ->> ''pickup_proof_url'','''') is null',
    '  if not v_os_evidence and not v_superadmin_bulkload and nullif(v_pickup ->> ''pickup_proof_url'','''') is null'
  );

  v_def := replace(
    v_def,
    'count(*) filter (where d.delivery_way_id <> (v_pickup_id || ''-'' || lpad(d.parcel_sequence::text,3,''0'')))::integer,',
    'count(*) filter (where upper(btrim(coalesce(d.delivery_way_id,''''))) <> upper(btrim(coalesce(public.be_resolve_delivery_way_id(v_pickup_id || ''-'' || lpad(d.parcel_sequence::text,3,''0'')),''''))))::integer,'
  );

  v_def := replace(
    v_def,
    '''canonical_pickup_preserved'',true,''evidence_mode'',case when v_os_evidence then ''OS_SOFTCOPY'' else ''RIDER_PROOF'' end,''pending_parcels''',
    '''canonical_pickup_preserved'',true,''evidence_mode'',case when v_os_evidence then ''OS_SOFTCOPY'' when v_superadmin_bulkload then ''SUPERADMIN_BULKLOAD_BYPASS'' else ''RIDER_PROOF'' end,''rider_verification_bypassed'',v_superadmin_bulkload,''pending_parcels'''
  );

  EXECUTE v_def;

  SELECT pg_get_functiondef('private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text)'::regprocedure)
    INTO v_def;

  IF position('v_superadmin_bulkload boolean := false;' in v_def)=0 THEN
    v_def := replace(
      v_def,
      '  v_os_evidence boolean := false;',
      '  v_os_evidence boolean := false;'||E'\n'||'  v_superadmin_bulkload boolean := false;'
    );
  END IF;

  v_def := replace(
    v_def,
    '  if v_pickup.assigned_rider_id::text = auth.uid()::text then',
    '  v_superadmin_bulkload := public.be_superadmin_bulkload_waybill_bypass_v34(v_pickup.pickup_id);' || E'\n\n' ||
    '  if not v_superadmin_bulkload and v_pickup.assigned_rider_id::text = auth.uid()::text then'
  );

  v_def := replace(
    v_def,
    '  if not v_os_evidence and (v_pickup.pickup_verified_at is null',
    '  if not v_os_evidence and not v_superadmin_bulkload and (v_pickup.pickup_verified_at is null'
  );

  v_def := replace(
    v_def,
    '  if not v_os_evidence and nullif(v_pickup.pickup_proof_url, '''') is null',
    '  if not v_os_evidence and not v_superadmin_bulkload and nullif(v_pickup.pickup_proof_url, '''') is null'
  );

  v_def := replace(
    v_def,
    'photo_review_status = case when v_parcel_count = v_expected_count and not v_os_evidence then ''APPROVED'' else photo_review_status end,',
    'photo_review_status = case when v_parcel_count = v_expected_count and not v_os_evidence and not v_superadmin_bulkload then ''APPROVED'' else photo_review_status end,'
  );

  v_def := replace(
    v_def,
    '''evidence_mode'',case when v_os_evidence then ''OS_SOFTCOPY'' else ''RIDER_PROOF'' end,',
    '''evidence_mode'',case when v_os_evidence then ''OS_SOFTCOPY'' when v_superadmin_bulkload then ''SUPERADMIN_BULKLOAD_BYPASS'' else ''RIDER_PROOF'' end,'
  );

  v_def := replace(
    v_def,
    '    last_event_note = ''Data Entry approved Rider proof and created waybill'',',
    '    last_event_note = case when v_superadmin_bulkload then ''Super Admin authorized BLK bulkload Waybill creation without Rider verification'' else ''Data Entry approved Rider proof and created waybill'' end,'
  );

  v_def := replace(
    v_def,
    '''photo_review_status'', case when v_os_evidence then ''OS_SOFTCOPY_AUTHORIZED'' else ''APPROVED'' end,',
    '''photo_review_status'', case when v_os_evidence then ''OS_SOFTCOPY_AUTHORIZED'' when v_superadmin_bulkload then ''SUPERADMIN_BULKLOAD_BYPASS'' else ''APPROVED'' end,'
  );

  EXECUTE v_def;
END $$;

INSERT INTO public.be_audit_events(
  actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
  upload_code,event_type,entity_type,entity_id,payload
)
SELECT
  u.auth_user_id,u.email,u.role,
  'SUPERADMIN_BULKLOAD_WAYBILL_BYPASS_ENABLED','SYSTEM','DATA_ENTRY_BLK_BULKLOAD',
  jsonb_build_object(
    'scope','BLK consolidated pickups only',
    'bypasses',jsonb_build_array('RIDER_VERIFICATION','RIDER_COLLECTION','RIDER_PROOF'),
    'preserves',jsonb_build_array('FINANCIAL_VALIDATION','LOCATION_READINESS','PARCEL_COMPLETENESS','WAYID_CANONICAL_RESOLUTION','AUDIT_LINEAGE'),
    'migration','superadmin_bulkload_waybill_bypass_v34'
  ),
  'V34','SUPERADMIN_BULKLOAD_WAYBILL_BYPASS_ENABLED','SYSTEM','DATA_ENTRY_BLK_BULKLOAD',
  jsonb_build_object('enabled',true,'role','SUPERADMIN','merchant_code','BLK')
FROM public.be_user_account_registry u
WHERE upper(coalesce(u.role,''))='SUPERADMIN'
  AND coalesce(u.is_active,false)=true
  AND lower(coalesce(u.status,''))='active'
  AND lower(coalesce(u.email,''))='superadmin@britiumexpress.com'
LIMIT 1;
