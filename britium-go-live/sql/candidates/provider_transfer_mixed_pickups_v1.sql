-- Controlled UAT candidate: attach verified pickup stops to a third-party transfer DRAFT.
-- Pickup stops are NOT parcel memberships; no pickup collection/dispatch event is created.
CREATE TABLE IF NOT EXISTS public.be_provider_transfer_pickup_stops_v1 (
  wayplan_id text NOT NULL REFERENCES public.be_wayplan_dispatches(wayplan_id),
  pickup_id text NOT NULL,
  pickup_way_id text NOT NULL,
  stop_sequence integer NOT NULL CHECK (stop_sequence > 0),
  latitude numeric NOT NULL CHECK (latitude BETWEEN 9 AND 29),
  longitude numeric NOT NULL CHECK (longitude BETWEEN 92 AND 102),
  address text NOT NULL CHECK (length(btrim(address)) >= 8),
  location_evidence_ref text NOT NULL CHECK (length(btrim(location_evidence_ref)) >= 8),
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  pickup_stage text NOT NULL DEFAULT 'PLANNED'
    CHECK (pickup_stage IN ('PLANNED','CANCELLED','COLLECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wayplan_id,pickup_id),
  UNIQUE (pickup_id)
);
ALTER TABLE public.be_provider_transfer_pickup_stops_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_provider_transfer_pickup_stops_v1 FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_provider_transfer_add_pickups_v1(
 p_wayplan_id text,p_pickup_stops jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $body$
DECLARE
 v_actor uuid:=auth.uid();
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_plan public.be_wayplan_dispatches%rowtype;
 v_stop jsonb;
 v_id text;
 v_pickup public.be_portal_pickup_requests%rowtype;
 v_seq integer;
 v_lat numeric;
 v_lon numeric;
 v_address text;
 v_evidence text;
 v_count integer:=0;
 v_total integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.be_provider_transfer_release_control_v1
  WHERE control_key='PROVIDER_TRANSFER_V1' AND mixed_trip_enabled) THEN
  RAISE EXCEPTION 'Mixed provider trips not yet enabled';
 END IF;
 IF v_actor IS NULL OR v_role NOT IN
 ('superadmin','super_admin','operation_manager','operations_manager') THEN
  RAISE EXCEPTION 'Management authorization required for mixed-trip planning';
 END IF;
 IF length(btrim(coalesce(p_reason,'')))<8 THEN
  RAISE EXCEPTION 'Planning reason must contain at least eight characters';
 END IF;
 IF jsonb_typeof(p_pickup_stops)<>'array' THEN
  RAISE EXCEPTION 'Pickup stops must be a JSON array';
 END IF;
 v_total:=jsonb_array_length(p_pickup_stops);
 IF v_total NOT BETWEEN 1 AND 30 THEN
  RAISE EXCEPTION 'Select between 1 and 30 verified pickup stops';
 END IF;
 SELECT * INTO v_plan FROM public.be_wayplan_dispatches
  WHERE wayplan_id=p_wayplan_id FOR UPDATE;
 IF NOT FOUND OR v_plan.metadata->>'plan_type'<>'THIRD_PARTY_PROVIDER_TRANSFER'
   OR upper(coalesce(v_plan.wayplan_status,'')) NOT IN ('CREATED','DRAFT') THEN
  RAISE EXCEPTION 'An unreleased provider transfer DRAFT is required';
 END IF;
 PERFORM public.be_branch_scope_v1(v_plan.branch_code);
 IF NOT EXISTS (SELECT 1 FROM public.be_wayplan_review_v43
   WHERE wayplan_id=p_wayplan_id AND review_status='DRAFT') THEN
  RAISE EXCEPTION 'Pickup stops cannot be changed after Supervisor submission';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mixed-provider-trip:'||p_wayplan_id,0));
 IF EXISTS (SELECT 1 FROM public.be_provider_transfer_pickup_stops_v1
    WHERE wayplan_id=p_wayplan_id) THEN
  RAISE EXCEPTION 'Pickup stops already staged; do not append to a reviewed manifest';
 END IF;
 FOR v_stop IN SELECT value FROM jsonb_array_elements(p_pickup_stops) LOOP
  v_id:=upper(btrim(coalesce(v_stop->>'pickup_id','')));
  IF v_id='' THEN RAISE EXCEPTION 'Pickup ID is required'; END IF;
  IF coalesce(v_stop->>'sequence','') NOT SIMILAR TO '[0-9]{1,3}' THEN
   RAISE EXCEPTION 'Pickup % has invalid sequence',v_id;
  END IF;
  v_seq:=(v_stop->>'sequence')::integer;
  IF v_seq<=0 THEN RAISE EXCEPTION 'Pickup sequence must be positive'; END IF;
  IF (v_stop->>'latitude') IS NULL OR (v_stop->>'longitude') IS NULL THEN
   RAISE EXCEPTION 'Pickup % needs verified latitude/longitude',v_id;
  END IF;
  v_lat:=(v_stop->>'latitude')::numeric;
  v_lon:=(v_stop->>'longitude')::numeric;
  IF v_lat NOT BETWEEN 9 AND 29 OR v_lon NOT BETWEEN 92 AND 102 THEN
   RAISE EXCEPTION 'Pickup % coordinates outside supported Myanmar range',v_id;
  END IF;
  v_evidence:=btrim(coalesce(v_stop->>'location_evidence_ref',''));
  IF length(v_evidence)<8 THEN
   RAISE EXCEPTION 'Pickup % requires location verification evidence',v_id;
  END IF;
  SELECT * INTO v_pickup FROM public.be_portal_pickup_requests
   WHERE upper(pickup_id)=v_id
    AND upper(coalesce(branch_code,assigned_branch,''))=upper(v_plan.branch_code)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pickup % not found in the origin branch',v_id; END IF;
  IF upper(coalesce(v_pickup.pickup_status,v_pickup.status,'')) IN
   ('CANCELLED','COLLECTED','DELIVERED_TO_WAREHOUSE','COMPLETED','CLOSED')
   OR upper(coalesce(v_pickup.workflow_stage,'')) IN
   ('TO_WAREHOUSE','PICKUP_COMPLETED','CANCELLED') THEN
   RAISE EXCEPTION 'Pickup % is already closed, collected or cancelled',v_id;
  END IF;
  IF coalesce(nullif(upper(v_pickup.assigned_driver_code),''),upper(v_plan.driver_code))
    <> upper(v_plan.driver_code) THEN
   RAISE EXCEPTION 'Pickup % assigned to a different driver',v_id;
  END IF;
  IF coalesce(nullif(upper(v_pickup.assigned_vehicle_code),''),upper(v_plan.vehicle_code))
    <> upper(v_plan.vehicle_code) THEN
   RAISE EXCEPTION 'Pickup % assigned to a different vehicle',v_id;
  END IF;
  v_address:=btrim(coalesce(v_pickup.pickup_address,''));
  IF length(v_address)<8 THEN RAISE EXCEPTION 'Pickup % has no valid pickup address',v_id; END IF;
  INSERT INTO public.be_provider_transfer_pickup_stops_v1(
    wayplan_id,pickup_id,pickup_way_id,stop_sequence,latitude,longitude,
    address,location_evidence_ref,verified_by
  ) VALUES (
    p_wayplan_id,v_id,coalesce(nullif(v_pickup.pickup_way_id,''),v_id),
    v_seq,v_lat,v_lon,v_address,v_evidence,v_actor
  );
  v_count:=v_count+1;
 END LOOP;
 IF (SELECT count(distinct stop_sequence)
     FROM public.be_provider_transfer_pickup_stops_v1
     WHERE wayplan_id=p_wayplan_id) <> v_count THEN
   RAISE EXCEPTION 'Duplicate pickup physical stop sequence';
 END IF;
 UPDATE public.be_wayplan_dispatches
 SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'physical_trip_type','MIXED_PICKUP_AND_PROVIDER_TRANSFER',
  'pickup_stop_count',v_count,'pickup_manifest_separate_from_parcel_membership',true,
  'mixed_trip_route_optimization_pending',true,'pickup_scan_required',true
 ),updated_at=now() WHERE wayplan_id=p_wayplan_id;
 INSERT INTO public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
 VALUES(v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
  'MIXED_TRIP_PICKUPS_STAGED_V1','WAYPLAN',p_wayplan_id,
  jsonb_build_object('pickup_count',v_count,'reason',p_reason,
   'pickup_scans_created',false,'dispatch_scans_created',false,
   'provider_handover_confirmed',false));
 RETURN jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,
  'pickup_stop_count',v_count,'physical_trip_type','MIXED_PICKUP_AND_PROVIDER_TRANSFER',
  'pickup_collection_confirmed',false,'provider_transfer_confirmed',false,
  'route_optimization_pending',true);
END;
$body$;
REVOKE ALL ON FUNCTION public.be_provider_transfer_add_pickups_v1(text,jsonb,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.be_provider_transfer_add_pickups_v1(text,jsonb,text) TO authenticated;
