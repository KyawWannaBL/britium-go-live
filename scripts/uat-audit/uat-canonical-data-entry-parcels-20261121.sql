-- BRITIUM HOSTED UAT ONLY: original Data Entry parcel canonical table structure, no live records.
-- SECURITY: RLS enabled and all client DML closed. Original operational triggers require separate review.
BEGIN;
SET LOCAL statement_timeout='40s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not hosted isolated UAT'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 THEN RAISE EXCEPTION 'UAT state not suitable for structural repair'; END IF;
 IF to_regclass('public.be_data_entry_parcels') IS NOT NULL THEN RAISE EXCEPTION 'Canonical table already exists'; END IF;
END $gate$;
CREATE TABLE public.be_data_entry_parcels (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pickup_request_id" text NOT NULL,
  "line_no" integer DEFAULT 1 NOT NULL,
  "tracking_no" text DEFAULT 'PENDING-TRACKING'::text NOT NULL,
  "sender_name" text,
  "sender_phone" text,
  "pickup_address" text,
  "pickup_township" text,
  "pickup_city" text,
  "receiver_name" text,
  "receiver_phone" text,
  "delivery_address" text,
  "delivery_township" text,
  "delivery_city" text,
  "cod_amount" numeric DEFAULT 0 NOT NULL,
  "weight_kg" numeric DEFAULT 1 NOT NULL,
  "service_type" text DEFAULT 'standard'::text NOT NULL,
  "package_type" text DEFAULT 'parcel'::text NOT NULL,
  "item_description" text,
  "remarks" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pickup_id" text,
  "pickup_way_id" text,
  "row_no" integer DEFAULT 1,
  "waybill_no" text,
  "tracking_number" text,
  "recipient_name" text,
  "recipient_phone" text,
  "parcel_description" text,
  "parcel_weight" numeric DEFAULT 0,
  "photo_url" text,
  "photo_status" text DEFAULT 'pending_photo_check'::text,
  "order_picking_status" text DEFAULT 'pending_order_picking'::text,
  "data_entry_status" text DEFAULT 'draft'::text,
  "delivery_way_id" text,
  "deliver_id" text,
  "cargo_photo_url" text,
  "cargo_photo_data_url" text,
  "cargo_photo_name" text,
  "cargo_photo_captured_at" timestamp with time zone,
  "temp_qr_code" text,
  "temp_qr_payload" jsonb DEFAULT '{}'::jsonb,
  "temp_qr_generated_at" timestamp with time zone,
  "warehouse_status" text DEFAULT 'inbound'::text,
  "package_condition" text,
  "exception_code" text,
  "exception_note" text,
  "warehouse_location" text,
  "shelf_bin" text,
  "handover_to" text,
  "warehouse_staff" text,
  "evidence_url" text,
  "warehouse_photo_url" text,
  "warehouse_remarks" text,
  "received_at" timestamp with time zone,
  "sorted_at" timestamp with time zone,
  "putaway_at" timestamp with time zone,
  "handover_ready_at" timestamp with time zone,
  "exception_at" timestamp with time zone,
  "warehouse_updated_at" timestamp with time zone,
  CONSTRAINT "be_data_entry_parcels_pickup_request_id_line_no_key" UNIQUE (pickup_request_id, line_no),
  CONSTRAINT "be_data_entry_parcels_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_data_entry_parcels_tracking_no_key" UNIQUE (tracking_no)
);
ALTER TABLE public.be_data_entry_parcels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_data_entry_parcels FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.be_data_entry_parcels IS 'UAT staged Data Entry parcel schema; no client writes, missing production triggers pending release review';
NOTIFY pgrst,'reload schema';
COMMIT;
