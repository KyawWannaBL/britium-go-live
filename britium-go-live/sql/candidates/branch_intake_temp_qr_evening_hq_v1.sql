-- Candidate only. Enable after authenticated branch/HQ UAT and migration reconciliation.
-- Branches receive existing Way IDs or existing Pickup temporary QR references.
-- Full parcel registration remains an HQ activity.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_branch_intake_manifests_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code text NOT NULL,
  hq_branch_code text NOT NULL DEFAULT 'YGN',
  shift text NOT NULL DEFAULT 'EVENING' CHECK (shift='EVENING'),
  status text NOT NULL DEFAULT 'PREPARED'
    CHECK (status IN ('PREPARED','IN_TRANSIT','PARTIALLY_RECEIVED','RECEIVED','DISCREPANCY')),
  bag_code text NOT NULL,
  seal_code text NOT NULL,
  vehicle_ref text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  received_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.be_branch_intake_parcels_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code text NOT NULL,
  intake_type text NOT NULL CHECK (intake_type IN ('EXISTING_WAY','TEMP_QR')),
  parcel_reference text NOT NULL,
  pickup_id text,
  merchant_note text,
  status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED','MANIFESTED','LOADED','HQ_RECEIVED','HQ_REGISTERED','EXCEPTION')),
  manifest_id uuid REFERENCES public.be_branch_intake_manifests_v1(id),
  permanent_way_id text,
  received_by uuid NOT NULL DEFAULT auth.uid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  loaded_by uuid,
  loaded_at timestamptz,
  hq_received_by uuid,
  hq_received_at timestamptz,
  linked_by uuid,
  linked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS be_branch_active_intake_identifier_v1
 ON public.be_branch_intake_parcels_v1(branch_code,intake_type,upper(parcel_reference))
 WHERE status IN ('RECEIVED','MANIFESTED','LOADED','EXCEPTION');
CREATE INDEX IF NOT EXISTS be_branch_intake_manifest_lookup_v1
 ON public.be_branch_intake_parcels_v1(manifest_id,status);

ALTER TABLE public.be_branch_intake_manifests_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.be_branch_intake_parcels_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_branch_intake_manifests_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.be_branch_intake_parcels_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.be_branch_intake_actor_v1(p_branch text, p_hq_only boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE
 v_role text := replace(lower(coalesce(public.be_current_role(),'')),'-','_');
 v_branch text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
 IF v_role NOT IN ('superadmin','super_admin','app_owner','sys','branch_manager','branch_office_manager',
                   'branch_office','branch_staff','branch_admin','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'BRANCH_INTAKE_ROLE_DENIED' USING errcode='42501'; END IF;
 IF p_hq_only AND v_role NOT IN ('superadmin','super_admin','app_owner','sys','operation_manager','operations_manager')
 THEN RAISE EXCEPTION 'HQ_RECEIPT_AUTHORITY_REQUIRED' USING errcode='42501'; END IF;
 v_branch := public.be_branch_scope_v1(p_branch);
 IF v_branch IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.be_branch_offices b WHERE upper(b.branch_code)=v_branch AND b.active
 ) THEN RAISE EXCEPTION 'BRANCH_NOT_ACTIVE_OR_NOT_SCOPED' USING errcode='42501'; END IF;
 RETURN v_branch;
END $fn$;
REVOKE ALL ON FUNCTION public.be_branch_intake_actor_v1(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_branch_intake_actor_v1(text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.be_branch_intake_register_v1(
 p_branch text,p_type text,p_reference text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp' AS $fn$
DECLARE v_branch text; v_type text:=upper(trim(coalesce(p_type,'')));
 v_ref text:=trim(coalesce(p_reference,'')); v_id uuid;
BEGIN
 v_branch:=public.be_branch_intake_actor_v1(p_branch,false);
 IF v_type NOT IN ('EXISTING_WAY','TEMP_QR') OR length(v_ref)<3 OR length(v_ref)>220
 THEN RAISE EXCEPTION 'INVALID_INTAKE_IDENTIFIER'; END IF;
 IF v_type='EXISTING_WAY' AND NOT EXISTS (
   SELECT 1 FROM public.be_waybill_ledger w WHERE upper(w.delivery_way_id)=upper(v_ref)
     OR upper(w.waybill_no)=upper(v_ref)
 ) THEN RAISE EXCEPTION 'EXISTING_WAY_NOT_FOUND'; END IF;
 IF v_type='TEMP_QR' AND NOT EXISTS (
   SELECT 1 FROM public.pickup_temp_qr_tokens t
   WHERE (t.temp_parcel_id=v_ref OR t.pickup_id=v_ref)
     AND t.status='active'
   UNION ALL
   SELECT 1 FROM public.pickup_parcel_qr_labels q
   WHERE (q.qr_text=v_ref OR q.delivery_id=v_ref) AND q.is_temporary
 ) THEN RAISE EXCEPTION 'PICKUP_TEMP_QR_NOT_FOUND'; END IF;
 INSERT INTO public.be_branch_intake_parcels_v1
   (branch_code,intake_type,parcel_reference,merchant_note,received_by)
 VALUES(v_branch,v_type,v_ref,left(coalesce(p_note,''),500),auth.uid())
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'intake_id',v_id,'branch_code',v_branch,
   'intake_type',v_type,'parcel_reference',v_ref,'status','RECEIVED');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_branch_intake_snapshot_v1(p_branch text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE v_branch text;
BEGIN
 v_branch:=public.be_branch_intake_actor_v1(p_branch,false);
 RETURN jsonb_build_object('ok',true,'branch_code',v_branch,
 'intakes',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.received_at DESC)
     FROM (SELECT * FROM public.be_branch_intake_parcels_v1
       WHERE branch_code=v_branch ORDER BY received_at DESC LIMIT 250) i),'[]'::jsonb),
 'manifests',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC)
     FROM (SELECT * FROM public.be_branch_intake_manifests_v1
       WHERE branch_code=v_branch ORDER BY created_at DESC LIMIT 50) m),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION public.be_branch_evening_manifest_prepare_v1(
 p_branch text,p_intake_ids uuid[],p_bag_code text,p_seal_code text,p_vehicle_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE v_branch text; v_count int; v_id uuid; v_expected int;
BEGIN
 v_branch:=public.be_branch_intake_actor_v1(p_branch,false);
 v_expected:=coalesce(cardinality(p_intake_ids),0);
 IF v_expected<1 OR v_expected>500 OR v_expected<>(
   SELECT count(DISTINCT x) FROM unnest(p_intake_ids) x)
 THEN RAISE EXCEPTION 'MANIFEST_REQUIRES_UNIQUE_INTAKE_IDS'; END IF;
 IF length(trim(coalesce(p_bag_code,'')))<2 OR length(trim(coalesce(p_seal_code,'')))<2 OR
    length(trim(coalesce(p_vehicle_ref,'')))<2 THEN
   RAISE EXCEPTION 'BAG_SEAL_AND_VEHICLE_REQUIRED'; END IF;
 PERFORM 1 FROM public.be_branch_intake_parcels_v1 i
   WHERE i.id=ANY(p_intake_ids) FOR UPDATE;
 IF (SELECT count(*) FROM public.be_branch_intake_parcels_v1 i
     WHERE i.id=ANY(p_intake_ids) AND i.branch_code=v_branch AND i.status='RECEIVED')<>v_expected
 THEN RAISE EXCEPTION 'MANIFEST_HAS_FOREIGN_OR_ALREADY_ASSIGNED_INTAKE'; END IF;
 INSERT INTO public.be_branch_intake_manifests_v1
 (branch_code,bag_code,seal_code,vehicle_ref,created_by)
 VALUES(v_branch,trim(p_bag_code),trim(p_seal_code),trim(p_vehicle_ref),auth.uid())
 RETURNING id INTO v_id;
 UPDATE public.be_branch_intake_parcels_v1
 SET status='MANIFESTED',manifest_id=v_id WHERE id=ANY(p_intake_ids);
 RETURN jsonb_build_object('ok',true,'manifest_id',v_id,'parcel_count',v_expected,'status','PREPARED');
END $fn$;

CREATE OR REPLACE FUNCTION public.be_branch_intake_scan_v1(
 p_manifest_id uuid,p_reference text,p_event text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE v_manifest public.be_branch_intake_manifests_v1%ROWTYPE;
 v_id uuid; v_event text:=upper(trim(coalesce(p_event,''))); v_remain integer;
BEGIN
 SELECT * INTO v_manifest FROM public.be_branch_intake_manifests_v1
 WHERE id=p_manifest_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MANIFEST_NOT_FOUND'; END IF;
 PERFORM public.be_branch_intake_actor_v1(v_manifest.branch_code,v_event='HQ_RECEIVE');
 IF v_event NOT IN ('LOAD','HQ_RECEIVE') THEN RAISE EXCEPTION 'INVALID_SCAN_STAGE'; END IF;
 IF v_event='LOAD' THEN
   IF v_manifest.status<>'PREPARED' THEN RAISE EXCEPTION 'MANIFEST_NOT_PREPARED'; END IF;
   SELECT id INTO v_id FROM public.be_branch_intake_parcels_v1
   WHERE manifest_id=p_manifest_id AND upper(parcel_reference)=upper(trim(p_reference))
     AND status='MANIFESTED' FOR UPDATE;
   IF v_id IS NULL THEN RAISE EXCEPTION 'PARCEL_NOT_IN_MANIFEST_OR_ALREADY_LOADED'; END IF;
   UPDATE public.be_branch_intake_parcels_v1 SET status='LOADED',loaded_at=now(),loaded_by=auth.uid() WHERE id=v_id;
   SELECT count(*) INTO v_remain FROM public.be_branch_intake_parcels_v1 WHERE manifest_id=p_manifest_id AND status='MANIFESTED';
   IF v_remain=0 THEN
     UPDATE public.be_branch_intake_manifests_v1 SET status='IN_TRANSIT',dispatched_at=now() WHERE id=p_manifest_id;
   END IF;
 ELSE
   IF v_manifest.status NOT IN ('IN_TRANSIT','PARTIALLY_RECEIVED') THEN RAISE EXCEPTION 'MANIFEST_NOT_IN_TRANSIT'; END IF;
   SELECT id INTO v_id FROM public.be_branch_intake_parcels_v1 WHERE manifest_id=p_manifest_id
     AND upper(parcel_reference)=upper(trim(p_reference)) AND status='LOADED' FOR UPDATE;
   IF v_id IS NULL THEN RAISE EXCEPTION 'PARCEL_NOT_LOADED_OR_ALREADY_RECEIVED'; END IF;
   UPDATE public.be_branch_intake_parcels_v1 SET status='HQ_RECEIVED',hq_received_by=auth.uid(),hq_received_at=now() WHERE id=v_id;
   SELECT count(*) INTO v_remain FROM public.be_branch_intake_parcels_v1 WHERE manifest_id=p_manifest_id AND status='LOADED';
   UPDATE public.be_branch_intake_manifests_v1
     SET status=CASE WHEN v_remain=0 THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED' END,
         received_at=CASE WHEN v_remain=0 THEN now() ELSE received_at END
     WHERE id=p_manifest_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'intake_id',v_id,'event',v_event,
   'manifest_id',p_manifest_id,'remaining_count',v_remain);
END $fn$;

CREATE OR REPLACE FUNCTION public.be_branch_temp_qr_link_way_v1(p_intake_id uuid,p_way_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','pg_temp'
AS $fn$
DECLARE v_intake public.be_branch_intake_parcels_v1%ROWTYPE;
BEGIN
 SELECT * INTO v_intake FROM public.be_branch_intake_parcels_v1 WHERE id=p_intake_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INTAKE_NOT_FOUND'; END IF;
 PERFORM public.be_branch_intake_actor_v1(v_intake.branch_code,true);
 IF v_intake.intake_type<>'TEMP_QR' OR v_intake.status<>'HQ_RECEIVED'
 THEN RAISE EXCEPTION 'ONLY_HQ_RECEIVED_TEMP_QR_MAY_LINK'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.be_waybill_ledger
   WHERE upper(delivery_way_id)=upper(trim(p_way_id))) THEN RAISE EXCEPTION 'PERMANENT_WAY_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.be_branch_intake_parcels_v1
   WHERE permanent_way_id=trim(p_way_id) AND id<>p_intake_id)
 THEN RAISE EXCEPTION 'PERMANENT_WAY_ALREADY_LINKED'; END IF;
 UPDATE public.be_branch_intake_parcels_v1
 SET permanent_way_id=trim(p_way_id),status='HQ_REGISTERED',linked_by=auth.uid(),linked_at=now()
 WHERE id=p_intake_id;
 RETURN jsonb_build_object('ok',true,'temp_reference',v_intake.parcel_reference,
  'permanent_way_id',trim(p_way_id));
END $fn$;

REVOKE ALL ON FUNCTION public.be_branch_intake_register_v1(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.be_branch_intake_snapshot_v1(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.be_branch_evening_manifest_prepare_v1(text,uuid[],text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.be_branch_intake_scan_v1(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.be_branch_temp_qr_link_way_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_branch_intake_register_v1(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_intake_snapshot_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_evening_manifest_prepare_v1(text,uuid[],text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_intake_scan_v1(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.be_branch_temp_qr_link_way_v1(uuid,text) TO authenticated;

-- Branch manager is an intake/transfer supervisor, not a Data Entry creator.
UPDATE public.be_role_authority_matrix
SET rights=jsonb_set(
  jsonb_set(coalesce(rights,'{}'::jsonb),
    '{modules,data_entry}', '{"view":false,"create":false,"update":false,"upload":false,"export":false}'::jsonb,true),
    '{modules,waybill}', '{"view":true,"create":false,"update":false,"upload":false,"export":true}'::jsonb,true)
WHERE role_id='branch_manager';
COMMIT;
