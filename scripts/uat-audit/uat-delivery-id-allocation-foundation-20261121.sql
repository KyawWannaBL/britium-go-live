-- HOSTED UAT only: canonical portal-cargo-events structure and original internal way-ID allocator.
-- Uses original production source; no client EXECUTE, no direct table access, no historical data.
-- Production cargo-event triggers and app write grants remain deferred.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not intended hosted UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 THEN RAISE EXCEPTION 'Unsafe financial or fixture state'; END IF;
IF to_regclass('public.be_portal_cargo_events') IS NOT NULL THEN RAISE EXCEPTION 'Cargo events already restored'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_delivery_way_stem') THEN RAISE EXCEPTION 'Existing way ID function be_delivery_way_stem'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_allocate_delivery_way_id_legacy_v33') THEN RAISE EXCEPTION 'Existing way ID function be_allocate_delivery_way_id_legacy_v33'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_allocate_delivery_way_id') THEN RAISE EXCEPTION 'Existing way ID function be_allocate_delivery_way_id'; END IF;
END $gate$;
CREATE TABLE public.be_portal_cargo_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pickup_id" text NOT NULL,
  "event_type" text NOT NULL,
  "description" text,
  "actor_role" text,
  "photo_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pickup_way_id" text,
  "delivery_way_id" text,
  "event_status" text,
  "actor_id" text,
  "actor_name" text,
  "source_module" text,
  "branch_code" text,
  "remarks" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "wayplan_route_no" text,
  "wayplan_stop_sequence" integer,
  "wayplan_status" text,
  "wayplan_generated_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now(),
  "source_table" text,
  "source_key" text,
  "event_note" text,
  "actor_type" text,
  "actor_code" text,
  "actor_email" text,
  "proof_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "event_name" text,
  "status" text,
  "notes" text,
  "tracking_no" text,
  "deliver_way_id" text,
  "line_no" integer,
  "event_title" text DEFAULT 'Cargo event'::text,
  "event_description" text DEFAULT 'Cargo event'::text,
  "pickup_date" date,
  "merchant" text,
  "sender_name" text,
  "sender_phone" text,
  "pickup_address" text,
  "pickup_township" text,
  "pickup_city" text,
  "receiver_name" text,
  "receiver_phone" text,
  "recipient_town" text,
  "delivery_township" text,
  "delivery_city" text,
  "delivery_address" text,
  "item_price" numeric DEFAULT 0,
  "deli_fee_os" numeric DEFAULT 0,
  "cod_os" numeric DEFAULT 0,
  "std_deli" numeric DEFAULT 0,
  "max_deli" numeric DEFAULT 0,
  "weight_kg" numeric DEFAULT 1,
  "surcharge" numeric DEFAULT 0,
  "final_cod" numeric DEFAULT 0,
  "cod_amount" numeric DEFAULT 0,
  "destination" text,
  "pickup_by_1" text,
  "pickup_by_2" text,
  "general_remarks" text,
  "driver_rider" text,
  "helper" text,
  "plate_no" text,
  "delivery_remarks" text,
  "column_37" text,
  "finance_deli" numeric DEFAULT 0,
  "finance_cod" numeric DEFAULT 0,
  "finance_received_by" text,
  "finance_status" text,
  "package_type" text DEFAULT 'parcel'::text,
  "service_type" text DEFAULT 'standard'::text,
  "item_description" text,
  "field_pickup_checked" boolean DEFAULT false,
  "field_pickup_checked_at" timestamp with time zone,
  "field_pickup_checked_by" text,
  "field_pickup_photo_url" text,
  "field_pickup_weight_kg" numeric,
  "pickup_verification_status" text DEFAULT 'pending'::text,
  "pickup_verification_note" text,
  "data_entry_registration_checked" boolean DEFAULT false,
  "data_entry_registration_checked_at" timestamp with time zone,
  "data_entry_registration_checked_by" uuid,
  "assigned_rider_code" text,
  "assigned_rider_name" text,
  "assigned_driver_code" text,
  "assigned_driver_name" text,
  "assigned_helper_code" text,
  "assigned_helper_name" text,
  "assigned_vehicle_plate" text,
  "deliver_id" text,
  "invoice_no" text,
  "waybill_no" text,
  "tracking_number" text,
  "route_zone" text,
  "message" text,
  "source" text,
  CONSTRAINT "be_portal_cargo_events_deliver_way_id_unique" UNIQUE (deliver_way_id),
  CONSTRAINT "be_portal_cargo_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_portal_cargo_events_tracking_no_unique" UNIQUE (tracking_no)
);
ALTER TABLE public.be_portal_cargo_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_portal_cargo_events FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_delivery_way_stem(p_pickup_id text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pickup_id text := upper(nullif(btrim(p_pickup_id), ''));
  v_parts text[];
begin
  if v_pickup_id is null then
    raise exception 'pickup_id is required.';
  end if;

  v_parts := regexp_split_to_array(v_pickup_id, '-');

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and left(v_parts[1], 1) = 'P' then
    return 'D' || substr(v_parts[1], 2) || '-' || v_parts[2] || '-';
  end if;

  return 'D' || regexp_replace(v_pickup_id, '^P', '') || '-';
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_delivery_way_stem(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_allocate_delivery_way_id_legacy_v33(p_pickup_id text, p_parcel_sequence integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_pickup text:=upper(nullif(btrim(p_pickup_id),''));
 v_stem text;
 v_day text;
 v_existing text;
 v_next integer;
 v_id text;
BEGIN
 IF v_pickup IS NULL OR coalesce(p_parcel_sequence,0)<1 THEN
   RAISE EXCEPTION 'pickup_id and a positive parcel_sequence are required';
 END IF;
 SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry
  WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 v_stem:=public.be_delivery_way_stem(v_pickup);
 v_day:=substring(v_stem FROM '^D[0-9]{4}');
 IF v_day IS NULL THEN RAISE EXCEPTION 'Invalid pickup date stem: %',v_stem; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('BE_DELIVERY_DAILY:'||v_day,0));
 SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry
  WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 SELECT upper(btrim(v.delivery_way_id)) INTO v_existing
 FROM public.be_pickup_parcel_verifications v
 WHERE upper(v.pickup_id)=v_pickup AND v.parcel_sequence=p_parcel_sequence
   AND v.delivery_way_id IS NOT NULL
 ORDER BY v.updated_at DESC NULLS LAST,v.created_at DESC NULLS LAST,v.id LIMIT 1;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 SELECT coalesce(max(right(q.way_id,4)::integer),0)+1 INTO v_next
 FROM (
    SELECT upper(btrim(delivery_way_id)) way_id FROM public.be_delivery_way_id_registry
    UNION ALL SELECT upper(btrim(canonical_way_id)) FROM public.be_delivery_way_id_aliases_v33
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_pickup_parcel_verifications
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_data_entry_register_rows
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_data_entry_parcel_details
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_portal_cargo_events
    UNION ALL SELECT upper(btrim(deliver_way_id)) FROM public.be_portal_cargo_events
 ) q WHERE q.way_id ~ ('^'||v_day||'-[A-Z0-9]+-[0-9]{3,4}$');
 LOOP
   IF v_next>9999 THEN RAISE EXCEPTION 'DAILY_DELIVERY_ID_CAPACITY_REACHED: %',v_day USING errcode='54000'; END IF;
   v_id:=v_stem||lpad(v_next::text,4,'0');
   IF NOT EXISTS (
    SELECT 1 FROM public.be_delivery_way_id_registry WHERE delivery_way_id=v_id
    UNION ALL SELECT 1 FROM public.be_delivery_way_id_aliases_v33 WHERE upper(btrim(canonical_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_pickup_parcel_verifications WHERE upper(btrim(delivery_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_data_entry_register_rows WHERE upper(btrim(delivery_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_data_entry_parcel_details WHERE upper(btrim(delivery_way_id))=v_id
   ) THEN
    INSERT INTO public.be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence)
    VALUES (v_id,v_pickup,p_parcel_sequence) ON CONFLICT DO NOTHING;
    IF FOUND THEN RETURN v_id; END IF;
   END IF;
   SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
   IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
   v_next:=v_next+1;
 END LOOP;
END;
$function$
;
REVOKE ALL ON FUNCTION public.be_allocate_delivery_way_id_legacy_v33(text,integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_allocate_delivery_way_id(p_pickup_id text, p_parcel_sequence integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_known text;
BEGIN
  SELECT a.canonical_way_id INTO v_known
    FROM public.be_delivery_way_id_aliases_v33 a
   WHERE upper(a.pickup_id)=upper(btrim(coalesce(p_pickup_id,'')))
     AND a.parcel_sequence=p_parcel_sequence
   LIMIT 1;
  IF v_known IS NOT NULL THEN RETURN v_known; END IF;
  RETURN public.be_allocate_delivery_way_id_legacy_v33(p_pickup_id,p_parcel_sequence);
END;
$function$
;
REVOKE ALL ON FUNCTION public.be_allocate_delivery_way_id(text,integer) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
