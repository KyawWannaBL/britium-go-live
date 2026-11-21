-- Britium Express HOSTED UAT ONLY: canonical pickup schema, supervisor view, branch-scoped read list.
-- UAT test fixture only; no historical data or pickup/waybill write RPCs enabled.
BEGIN;
SET LOCAL statement_timeout = '55s';
DO $guard$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified hosted UAT'; END IF;
 IF (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'Existing UAT test fixture count changed'; END IF;
 IF to_regclass('public.be_portal_pickup_requests') IS NOT NULL THEN RAISE EXCEPTION 'Table already exists: be_portal_pickup_requests'; END IF;
 IF to_regclass('public.be_app_notifications') IS NOT NULL THEN RAISE EXCEPTION 'Table already exists: be_app_notifications'; END IF;
 IF to_regclass('public.be_v_supervisor_pickup_queue') IS NOT NULL THEN RAISE EXCEPTION 'View already exists'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('be_data_entry_pickup_safe_numeric_v16','be_data_entry_pickup_list_web_v16')) THEN RAISE EXCEPTION 'Pickup list functions already exist'; END IF;
END $guard$;
CREATE TABLE public."be_portal_pickup_requests" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "pickup_id" text NOT NULL,
 "deliver_id" text,
 "invoice_no" text,
 "waybill_no" text,
 "merchant_id" text,
 "merchant_code" text,
 "merchant_name" text,
 "sender_phone" text,
 "pickup_address" text,
 "pickup_township" text,
 "pickup_city" text,
 "recipient_name" text,
 "recipient_phone" text,
 "delivery_township" text,
 "delivery_address" text,
 "service_tier" text DEFAULT 'Standard'::text,
 "priority" text DEFAULT 'NORMAL'::text,
 "payment_method" text DEFAULT 'COD'::text,
 "cod_amount" numeric DEFAULT 0,
 "weight_kg" numeric DEFAULT 0,
 "delivery_fee" numeric DEFAULT 0,
 "status" text DEFAULT 'SUBMITTED'::text NOT NULL,
 "exception_reason" text,
 "branch_code" text DEFAULT 'YGN'::text,
 "requester_type" text DEFAULT 'merchant'::text,
 "created_by" uuid,
 "assigned_rider_id" text,
 "assigned_rider_name" text,
 "route_label" text,
 "warehouse_location" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "pickup_status" text DEFAULT 'PICKUP_REQUESTED'::text,
 "workflow_stage" text DEFAULT 'PICKUP_REQUESTED'::text,
 "supervisor_status" text DEFAULT 'PENDING_ASSIGNMENT'::text,
 "rider_status" text DEFAULT 'NOT_ASSIGNED'::text,
 "data_entry_status" text DEFAULT 'WAITING_PICKUP'::text,
 "warehouse_status" text DEFAULT 'WAITING_DATA_ENTRY'::text,
 "pickup_proof_url" text,
 "expected_parcels" integer DEFAULT 1,
 "pickup_way_id" text,
 "pickup_date" date DEFAULT CURRENT_DATE,
 "source_portal" text DEFAULT 'enterprise'::text,
 "customer_name" text,
 "customer_phone" text,
 "parcel_count" integer DEFAULT 1,
 "total_cod" numeric DEFAULT 0,
 "estimated_tariff" numeric DEFAULT 0,
 "operation_status" text DEFAULT 'submitted'::text,
 "finance_status" text DEFAULT 'pending_finance'::text,
 "assigned_driver_id" text,
 "assigned_helper_id" text,
 "assigned_fleet_id" text,
 "payload" jsonb DEFAULT '{}'::jsonb,
 "created_by_name" text,
 "assigned_rider_code" text,
 "assigned_driver_code" text,
 "assigned_driver_name" text,
 "assigned_helper_code" text,
 "assigned_helper_name" text,
 "assigned_vehicle_plate" text,
 "assigned_at" timestamp with time zone,
 "be_sync_uuid" uuid DEFAULT gen_random_uuid(),
 "canonical_pickup_id" text,
 "sender_name" text,
 "township" text,
 "city" text,
 "payment_terms" text,
 "payment_type" text,
 "item_price" numeric DEFAULT 0,
 "rider_cod_amount" numeric DEFAULT 0,
 "rider_cod_settlement_status" text,
 "assigned_workforce_code" text,
 "rider_id" text,
 "assigned_rider_email" text,
 "assigned_driver_email" text,
 "assigned_helper_email" text,
 "assigned_vehicle_code" text,
 "assigned_by" text,
 "accepted_at" timestamp with time zone,
 "arrived_pickup_at" timestamp with time zone,
 "pickup_verified_at" timestamp with time zone,
 "pickup_collected_at" timestamp with time zone,
 "out_for_delivery_at" timestamp with time zone,
 "delivered_at" timestamp with time zone,
 "exception_at" timestamp with time zone,
 "proof_url" text,
 "cod_collected_amount" numeric DEFAULT 0,
 "rider_last_action" text,
 "rider_last_action_at" timestamp with time zone,
 "rider_app_stage" text,
 "metadata" jsonb DEFAULT '{}'::jsonb,
 "request_code" text,
 "pickup_request_id" text,
 "pickup_time" text,
 "pickup_waybill_id" text,
 "tracking_no" text,
 "delivery_status" text,
 "rider_code" text,
 "assigned_vehicle_id" text,
 "vehicle_type" text,
 "assignment_note" text,
 "delivery_verified_at" timestamp with time zone,
 "cod_collected_at" timestamp with time zone,
 "cod_settlement_status" text,
 "delivery_count" integer,
 "total_weight_kg" numeric DEFAULT 0,
 "verified_parcels" integer DEFAULT 0,
 "wayplan_status" text DEFAULT 'PENDING_WAYPLAN'::text,
 "supervisor_note" text,
 "assigned_branch" text,
 "assignment_status" text DEFAULT 'PENDING'::text,
 "route_zone" text,
 "cod_status" text,
 "pickup_proof" jsonb,
 "delivery_proof" jsonb,
 "source" text,
 "city_region" text,
 "tariff_code" text,
 "special_instructions" text,
 "delivery_way_id" text,
 "tracking_number" text,
 "contact_person" text,
 "service_type" text,
 "branch" text,
 "source_channel" text,
 "merchant_abbr" text,
 "delivery_start_no" integer,
 "delivery_end_no" integer,
 "delivery_date_prefix" text,
 "delivery_prefix" text,
 "assigned_workforce_type" text,
 "assigned_workforce_name" text,
 "field_verified_at" timestamp with time zone,
 "field_verified_by" text,
 "pickup_verified_signature_url" text,
 "pickup_verified_total_weight" numeric DEFAULT 0,
 "field_verification_payload" jsonb DEFAULT '{}'::jsonb,
 "warehouse_branch" text,
 "last_scan_type" text,
 "last_scan_at" timestamp with time zone,
 "bag_code" text,
 "expected_parcel_count" integer,
 "scanned_parcel_count" integer,
 "settlement_status" text DEFAULT 'pending'::text,
 "settlement_batch" text,
 "driver_id" text,
 "helper_id" text,
 "vehicle_code" text,
 "dispatch_status" text DEFAULT 'WAITING_WAYPLAN'::text,
 "assigned_by_email" text,
 "required_vehicle" text,
 "remarks" text,
 "phone" text,
 "address" text,
 "assigned_vehicle_name" text,
 "wayplan_id" text,
 "cod_settled_amount" numeric DEFAULT 0,
 "cod_settled_at" timestamp with time zone,
 "cod_settled_by" text,
 "driver_status" text DEFAULT 'WAITING_ACCEPTANCE'::text,
 "helper_status" text DEFAULT 'WAITING_ACCEPTANCE'::text,
 "driver_accepted_at" timestamp with time zone,
 "helper_accepted_at" timestamp with time zone,
 "driver_rejected_at" timestamp with time zone,
 "helper_rejected_at" timestamp with time zone,
 "driver_response_note" text,
 "helper_response_note" text,
 "rider_accepted_at" timestamp with time zone,
 "rider_rejected_at" timestamp with time zone,
 "photo_review_status" text DEFAULT 'PENDING'::text,
 "registered_parcel_count" integer DEFAULT 0,
 "rejected_photo_count" integer DEFAULT 0,
 "pending_photo_count" integer DEFAULT 0,
 "team_acceptance_status" text,
 "rider_response_note" text,
 "field_team_last_response_at" timestamp with time zone,
 "last_event_at" timestamp with time zone,
 "last_event_by" text,
 "last_event_note" text,
 "declared_item_value" numeric DEFAULT 0 NOT NULL,
 "cod_policy_status" text DEFAULT 'NOT_EVALUATED'::text NOT NULL,
 "cod_service_fee_rate" numeric DEFAULT 0 NOT NULL,
 "cod_service_fee_amount" numeric DEFAULT 0 NOT NULL,
 "finance_pre_dispatch_status" text DEFAULT 'NOT_REQUIRED'::text NOT NULL,
 "finance_reviewed_by" uuid,
 "finance_reviewed_at" timestamp with time zone,
 "finance_review_note" text,
 "pickup_service_fee_amount" numeric DEFAULT 0 NOT NULL,
 "pickup_same_day_eligible" boolean DEFAULT false NOT NULL,
 "pickup_cutoff_status" text DEFAULT 'NOT_EVALUATED'::text NOT NULL,
 "pickup_policy_version" text DEFAULT 'PICKUP_2026_09_30'::text NOT NULL,
 CONSTRAINT "be_portal_pickup_requests_pickup_id_format_check" CHECK (pickup_id IS NULL OR pickup_id ~ '^P[0-9]{4}-[A-Z][A-Z0-9]{1,4}-[0-9]{3}$'::text OR pickup_id ~ '^LEGACY-DUP-[0-9A-Fa-f]{8}$'::text),
 CONSTRAINT "be_portal_pickup_requests_pkey" PRIMARY KEY (id),
 CONSTRAINT "be_portal_pickup_requests_pickup_id_key" UNIQUE (pickup_id),
 CONSTRAINT "be_portal_pickup_requests_pickup_id_unique" UNIQUE (pickup_id)
);
ALTER TABLE public."be_portal_pickup_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."be_portal_pickup_requests" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."be_portal_pickup_requests" TO authenticated;
CREATE TABLE public."be_app_notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "target_role" text,
 "target_branch" text,
 "pickup_id" text,
 "title" text,
 "message" text DEFAULT ''::text NOT NULL,
 "is_read" boolean DEFAULT false,
 "created_at" timestamp with time zone DEFAULT now(),
 "pickup_way_id" text,
 "source_table" text,
 "source_key" text,
 "notification_type" text DEFAULT 'workflow'::text,
 "metadata" jsonb DEFAULT '{}'::jsonb,
 "body" text DEFAULT ''::text,
 "target_user_code" text,
 "target_email" text,
 "read_at" timestamp with time zone,
 "target_user_id" text,
 "target_workforce_code" text,
 "target_user_email" text,
 "category" text DEFAULT 'general'::text,
 "target_branch_code" text,
 "status" text DEFAULT 'unread'::text,
 "payload" jsonb DEFAULT '{}'::jsonb,
 "event_type" text,
 "event_key" text,
 "recipient_role" text,
 "recipient_email" text,
 "entity_type" text,
 "entity_id" text,
 "waybill_no" text,
 "priority" text DEFAULT 'NORMAL'::text,
 CONSTRAINT "be_app_notifications_pkey" PRIMARY KEY (id),
 CONSTRAINT "be_app_notifications_event_key_unique" UNIQUE (event_key)
);
ALTER TABLE public."be_app_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."be_app_notifications" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public."be_app_notifications" TO authenticated;
CREATE POLICY be_portal_pickup_requests_uat_branch_read ON public.be_portal_pickup_requests FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL AND coalesce((public.be_login_access_profile()->>'authorized')::boolean,false) AND ((lower(replace(coalesce(public.be_login_access_profile()->>'role',''),'-','_'))='super_admin' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(public.be_login_access_profile()->'territories','[]'::jsonb)) AS scope WHERE scope->>'scope_type'='GLOBAL' AND scope->>'can_read'='true')) OR (lower(replace(coalesce(public.be_login_access_profile()->>'role',''),'-','_')) IN ('branch_manager','warehouse_staff') AND upper(coalesce(branch_code,'')) = upper(coalesce(public.be_login_access_profile()->>'branch_code','')) AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(public.be_login_access_profile()->'territories','[]'::jsonb)) AS scope WHERE scope->>'scope_type'='BRANCH' AND upper(coalesce(scope->>'branch_code',''))=upper(coalesce(branch_code,'')) AND scope->>'can_read'='true'))));
CREATE VIEW public.be_v_supervisor_pickup_queue WITH (security_invoker = true) AS  SELECT id,
    pickup_id,
    deliver_id,
    invoice_no,
    waybill_no,
    merchant_id,
    merchant_code,
    merchant_name,
    sender_phone,
    pickup_address,
    pickup_township,
    pickup_city,
    recipient_name,
    recipient_phone,
    delivery_township,
    delivery_address,
    service_tier,
    priority,
    payment_method,
    cod_amount,
    weight_kg,
    delivery_fee,
    status,
    exception_reason,
    branch_code,
    requester_type,
    created_by,
    assigned_rider_id,
    assigned_rider_name,
    route_label,
    warehouse_location,
    created_at,
    updated_at,
    pickup_status,
    workflow_stage,
    supervisor_status,
    rider_status,
    data_entry_status,
    warehouse_status,
    pickup_proof_url,
    expected_parcels,
    pickup_way_id,
    pickup_date,
    source_portal,
    customer_name,
    customer_phone,
    parcel_count,
    total_cod,
    estimated_tariff,
    operation_status,
    finance_status,
    assigned_driver_id,
    assigned_helper_id,
    assigned_fleet_id,
    payload,
    created_by_name,
    assigned_rider_code,
    assigned_driver_code,
    assigned_driver_name,
    assigned_helper_code,
    assigned_helper_name,
    assigned_vehicle_plate,
    assigned_at,
    be_sync_uuid,
    canonical_pickup_id,
    sender_name,
    township,
    city,
    payment_terms,
    payment_type,
    item_price,
    rider_cod_amount,
    rider_cod_settlement_status,
    assigned_workforce_code,
    rider_id,
    assigned_rider_email,
    assigned_driver_email,
    assigned_helper_email,
    assigned_vehicle_code,
    assigned_by,
    accepted_at,
    arrived_pickup_at,
    pickup_verified_at,
    pickup_collected_at,
    out_for_delivery_at,
    delivered_at,
    exception_at,
    proof_url,
    cod_collected_amount,
    rider_last_action,
    rider_last_action_at,
    rider_app_stage,
    metadata,
    request_code,
    pickup_request_id,
    pickup_time,
    pickup_waybill_id,
    tracking_no,
    delivery_status,
    rider_code,
    assigned_vehicle_id,
    vehicle_type,
    assignment_note,
    delivery_verified_at,
    cod_collected_at,
    cod_settlement_status,
    delivery_count,
    total_weight_kg,
    verified_parcels,
    wayplan_status,
    supervisor_note,
    assigned_branch,
    assignment_status,
    route_zone,
    cod_status,
    pickup_proof,
    delivery_proof,
    source,
    city_region,
    tariff_code,
    special_instructions,
    delivery_way_id,
    tracking_number,
    contact_person,
    service_type,
    branch,
    source_channel,
    merchant_abbr,
    delivery_start_no,
    delivery_end_no,
    delivery_date_prefix,
    delivery_prefix,
    assigned_workforce_type,
    assigned_workforce_name,
    field_verified_at,
    field_verified_by,
    pickup_verified_signature_url,
    pickup_verified_total_weight,
    field_verification_payload,
    warehouse_branch,
    last_scan_type,
    last_scan_at,
    bag_code,
    expected_parcel_count,
    scanned_parcel_count,
    settlement_status,
    settlement_batch,
    driver_id,
    helper_id,
    vehicle_code,
    dispatch_status,
    assigned_by_email,
    (EXISTS ( SELECT 1
           FROM be_app_notifications n
          WHERE n.pickup_id = p.pickup_id AND n.recipient_role = 'supervisor'::text AND n.notification_type = 'PICKUP_REQUESTED'::text AND n.is_read = false)) AS has_unread_notification
   FROM be_portal_pickup_requests p
  WHERE (COALESCE(pickup_status, ''::text) <> ALL (ARRAY['CANCELLED'::text, 'CLOSED'::text])) AND ((COALESCE(supervisor_status, ''::text) = ANY (ARRAY['PENDING_ASSIGNMENT'::text, 'ASSIGNED'::text])) OR (COALESCE(workflow_stage, ''::text) = ANY (ARRAY['PICKUP_REQUESTED'::text, 'RIDER_ASSIGNED'::text, 'PICKUP_COLLECTED'::text])) OR (COALESCE(pickup_status, ''::text) = ANY (ARRAY['Draft'::text, 'DRAFT'::text, 'PICKUP_REQUESTED'::text, 'RIDER_ASSIGNED'::text, 'PICKUP_COLLECTED'::text])))
  ORDER BY created_at DESC;;
REVOKE ALL ON public.be_v_supervisor_pickup_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.be_v_supervisor_pickup_queue TO authenticated;
CREATE FUNCTION public.be_data_entry_pickup_safe_numeric_v16(p_value text, p_default numeric DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_clean text;
begin
  v_clean := nullif(
    regexp_replace(coalesce(p_value, ''), '[,[:space:]]', '', 'g'),
    ''
  );

  if v_clean is null then
    return coalesce(p_default, 0);
  end if;

  begin
    return v_clean::numeric;
  exception when others then
    return coalesce(p_default, 0);
  end;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_pickup_safe_numeric_v16(text,numeric) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.be_data_entry_pickup_safe_numeric_v16(text,numeric) TO authenticated;
CREATE FUNCTION public.be_data_entry_pickup_list_web_v16(p_limit integer)
 RETURNS TABLE(pickup_id text, pickup_way_id text, merchant_code text, merchant_name text, pickup_date text, pickup_address text, township text, city text, expected_parcels numeric, verified_parcels numeric, photo_parcels numeric, total_weight_kg numeric, pickup_status text, workflow_stage text, created_at text, source_name text)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  return query
  with source_rows as (
    select to_jsonb(q) as j
    from public.be_v_supervisor_pickup_queue as q
  ),
  normalized as (
    select
      nullif(btrim(coalesce(
        j->>'pickup_id', j->>'pickup_request_id', j->>'request_id', j->>'id'
      )), '') as n_pickup_id,
      nullif(btrim(coalesce(
        j->>'pickup_way_id', j->>'pickup_waybill_id', j->>'way_id',
        j->>'pickup_id', j->>'pickup_request_id', j->>'request_id', j->>'id'
      )), '') as n_pickup_way_id,
      nullif(btrim(coalesce(
        j->>'merchant_code', j->>'merchant_id', j->>'customer_code'
      )), '') as n_merchant_code,
      nullif(btrim(coalesce(
        j->>'merchant_name', j->>'customer_name', j->>'merchant'
      )), '') as n_merchant_name,
      nullif(btrim(coalesce(
        j->>'pickup_date', j->>'scheduled_date', j->>'requested_pickup_date'
      )), '') as n_pickup_date,
      nullif(btrim(coalesce(
        j->>'pickup_address', j->>'address'
      )), '') as n_pickup_address,
      nullif(btrim(coalesce(
        j->>'township', j->>'pickup_township'
      )), '') as n_township,
      nullif(btrim(coalesce(
        j->>'city', j->>'pickup_city'
      )), '') as n_city,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'expected_parcels', j->>'parcel_count', j->>'parcels',
        j->>'requested_parcels', j->>'total_parcels'
      ), 0) as n_expected_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'verified_parcels', j->>'verified_count', j->>'verified_parcel_count'
      ), 0) as n_verified_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'photo_parcels', j->>'photo_count', j->>'proof_count',
        j->>'proof_parcels', j->>'verified_parcels', j->>'verified_count'
      ), 0) as n_photo_parcels,
      public.be_data_entry_pickup_safe_numeric_v16(coalesce(
        j->>'total_weight_kg', j->>'total_weight', j->>'weight_kg'
      ), 0) as n_total_weight_kg,
      nullif(btrim(coalesce(j->>'pickup_status', j->>'status')), '') as n_pickup_status,
      nullif(btrim(coalesce(j->>'workflow_stage', j->>'stage')), '') as n_workflow_stage,
      nullif(btrim(coalesce(
        j->>'created_at', j->>'requested_at', j->>'updated_at', j->>'pickup_date'
      )), '') as n_created_at
    from source_rows
  ),
  ranked as (
    select
      n.*,
      row_number() over (
        partition by n.n_pickup_id
        order by
          coalesce(n.n_created_at, n.n_pickup_date) desc nulls last,
          n.n_pickup_way_id desc nulls last
      ) as row_rank
    from normalized as n
    where n.n_pickup_id is not null
  )
  select
    r.n_pickup_id,
    coalesce(r.n_pickup_way_id, r.n_pickup_id),
    r.n_merchant_code,
    r.n_merchant_name,
    r.n_pickup_date,
    r.n_pickup_address,
    r.n_township,
    r.n_city,
    greatest(r.n_expected_parcels, 0),
    greatest(r.n_verified_parcels, 0),
    greatest(r.n_photo_parcels, 0),
    greatest(r.n_total_weight_kg, 0),
    r.n_pickup_status,
    r.n_workflow_stage,
    r.n_created_at,
    'be_v_supervisor_pickup_queue'::text
  from ranked as r
  where r.row_rank = 1
  -- Scoped by source table RLS and security_invoker supervisor view; no bypass.
  order by
    coalesce(r.n_created_at, r.n_pickup_date) desc nulls last,
    r.n_pickup_id desc
  limit v_limit;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_pickup_list_web_v16(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_pickup_list_web_v16(integer) TO authenticated;
CREATE FUNCTION public.be_data_entry_pickup_list_web_v16()
 RETURNS TABLE(pickup_id text, pickup_way_id text, merchant_code text, merchant_name text, pickup_date text, pickup_address text, township text, city text, expected_parcels numeric, verified_parcels numeric, photo_parcels numeric, total_weight_kg numeric, pickup_status text, workflow_stage text, created_at text, source_name text)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select *
  from public.be_data_entry_pickup_list_web_v16(200::integer);
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_pickup_list_web_v16() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_pickup_list_web_v16() TO authenticated;
INSERT INTO public.be_portal_pickup_requests (pickup_id,pickup_way_id,merchant_code,merchant_name,branch_code,pickup_township,pickup_city,pickup_address,expected_parcels,parcel_count,pickup_date,pickup_status,workflow_stage,supervisor_status)
VALUES ('P2026-ISN-901','P2026-ISN-901','UAT-QA','UAT TEST MERCHANT','ISN','Insein','Yangon','SYNTHETIC TEST ONLY - NO ACTUAL PICKUP',2,2,DATE '2026-11-21','PICKUP_REQUESTED','PICKUP_REQUESTED','PENDING_ASSIGNMENT'),
('P2026-MDY-901','P2026-MDY-901','UAT-QA','UAT TEST MERCHANT','MDY','Chanayethazan','Mandalay','SYNTHETIC TEST ONLY - NO ACTUAL PICKUP',2,2,DATE '2026-11-21','PICKUP_REQUESTED','PICKUP_REQUESTED','PENDING_ASSIGNMENT');
NOTIFY pgrst,'reload schema';
COMMIT;
