-- STAGED STRUCTURE-ONLY RESTORATION: BRITIUM HOSTED UAT 2026-11-21
-- Sourced from read-only production column, constraint and index catalogs.
-- Does NOT restore data, triggers, RLS policies, or user-facing permissions.
-- NOT a complete operational migration. Do not execute against production.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $target_gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL THEN RAISE EXCEPTION 'This is not the intended hosted UAT schema (roster missing)'; END IF;
IF (SELECT count(*) FROM auth.users) <> 18 OR (SELECT count(*) FROM public.be_user_account_registry) <> 18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116) <> 16 THEN RAISE EXCEPTION 'UAT identity preservation preflight mismatch'; END IF;
IF to_regclass('public.be_data_entry_parcel_details') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_data_entry_parcel_details'; END IF;
IF to_regclass('public.be_dispatch_scans_v39') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_dispatch_scans_v39'; END IF;
IF to_regclass('public.be_superadmin_delegations_v65') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_superadmin_delegations_v65'; END IF;
IF to_regclass('public.be_wayplan_dispatch_stops') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_wayplan_dispatch_stops'; END IF;
IF to_regclass('public.be_wayplan_membership_v40') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_wayplan_membership_v40'; END IF;
IF to_regclass('public.be_wayplan_review_v43') IS NOT NULL THEN RAISE EXCEPTION 'Target table already exists: public.be_wayplan_review_v43'; END IF;
END $target_gate$;
CREATE TABLE public."be_data_entry_parcel_details" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pickup_id" text NOT NULL,
  "parcel_sequence" integer NOT NULL,
  "delivery_way_id" text NOT NULL,
  "recipient_name" text,
  "contact_no_1" text,
  "contact_no_2" text,
  "township" text,
  "township_key" text,
  "city" text,
  "region_state" text,
  "recipient_address" text,
  "customer_tier" text DEFAULT 'Standard'::text,
  "item_price" numeric DEFAULT 0,
  "weight_kg" numeric DEFAULT 0,
  "surcharge" numeric DEFAULT 0,
  "delivery_fee" numeric DEFAULT 0,
  "cod_amount" numeric DEFAULT 0,
  "actual_collect" numeric DEFAULT 0,
  "destination" text,
  "pickup_by" text,
  "remark" text,
  "saved_by_email" text,
  "saved_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "proof_photo_path" text,
  "is_printed" boolean DEFAULT false,
  "template_id" text,
  "way_id" text,
  "customer_id" text,
  "merchant_id" text,
  "parcel_status" text,
  "source_created_at" text,
  "source_updated_at" text,
  "environment" text,
  "print_status" text DEFAULT 'Ready'::text,
  "printed_at" timestamp with time zone,
  "printed_by" text,
  "warehouse_status" text DEFAULT 'PENDING_PRINT'::text,
  "way_management_status" text DEFAULT 'PENDING_PRINT'::text,
  "finance_status" text DEFAULT 'PENDING_INVOICE'::text,
  "assigned_rider_id" text,
  "assigned_rider_name" text,
  "supervisor_status" text DEFAULT 'READY'::text,
  "inbound_scanned_at" timestamp with time zone,
  "dispatch_scanned_at" timestamp with time zone,
  "return_scanned_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "close_locked_by" text,
  "amount_entry_type" text,
  "delivery_charges" bigint,
  "merchant_stated_total_amount" bigint,
  "additional_customer_charge" bigint DEFAULT 0 NOT NULL,
  "cbm_surcharge" bigint DEFAULT 0 NOT NULL,
  "other_surcharge" bigint DEFAULT 0 NOT NULL,
  "merchant_payable_charges" bigint DEFAULT 0 NOT NULL,
  "other_merchant_credits" bigint DEFAULT 0 NOT NULL,
  "base_tariff" bigint,
  "included_kg" numeric(10,3),
  "chargeable_weight_kg" numeric(10,3),
  "extra_kg" numeric(10,3),
  "weight_surcharge" bigint,
  "gross_system_delivery_charge" bigint,
  "commitment_refund" bigint,
  "net_system_delivery_charge" bigint,
  "effective_declared_delivery_charge" bigint,
  "delivery_difference" bigint,
  "settlement_direction" text,
  "merchant_settlement_adjustment" bigint,
  "merchant_final_settlement_amount" bigint,
  "financial_validation_status" text,
  "financial_validation_message" text,
  "financial_calculation_version" text,
  "financial_calculated_at" timestamp with time zone,
  "financial_quote" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "service_type" text DEFAULT 'STANDARD'::text NOT NULL,
  "source_file_name" text,
  "source_row_number" integer,
  "source_row_count" integer,
  "photo_evidence_mode" text DEFAULT 'PICKER_PHOTO'::text NOT NULL,
  "photo_bypass_reason" text,
  "os_imported_at" timestamp with time zone,
  "os_imported_by" uuid,
  "delivery_region" text,
  "delivery_route_mode" text,
  "location_required" boolean DEFAULT true NOT NULL,
  "handoff_station_code" text,
  "handoff_station_name" text,
  "cod_service_fee_rate" numeric DEFAULT 0 NOT NULL,
  "cod_service_fee_amount" numeric DEFAULT 0 NOT NULL,
  "cod_fee_policy_status" text DEFAULT 'NOT_EVALUATED'::text NOT NULL,
  CONSTRAINT "be_data_entry_delivery_mode_v19_ck" CHECK (delivery_route_mode IS NULL OR (delivery_route_mode = ANY (ARRAY['DOORSTEP_MAP'::text, 'ROYAL_EXPRESS'::text, 'HIGHWAY_BUS_STATION'::text]))),
  CONSTRAINT "be_data_entry_delivery_region_v19_ck" CHECK (delivery_region IS NULL OR (delivery_region = ANY (ARRAY['YANGON'::text, 'MANDALAY'::text, 'NAYPYITAW'::text, 'OUTSIDE_CORE'::text]))),
  CONSTRAINT "be_data_entry_handoff_station_v19_ck" CHECK (delivery_route_mode IS NULL OR delivery_route_mode = 'DOORSTEP_MAP'::text AND location_required AND handoff_station_code IS NULL AND handoff_station_name IS NULL OR delivery_route_mode = 'ROYAL_EXPRESS'::text AND NOT location_required AND handoff_station_code IS NULL AND handoff_station_name IS NULL OR delivery_route_mode = 'HIGHWAY_BUS_STATION'::text AND NOT location_required AND (handoff_station_code = ANY (ARRAY['AUNG_MINGALAR'::text, 'DAGON_AYAR_THIRI'::text, 'OTHER'::text])) AND length(btrim(COALESCE(handoff_station_name, ''::text))) >= 3),
  CONSTRAINT "be_data_entry_parcel_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_data_entry_photo_evidence_v15_ck" CHECK ((photo_evidence_mode = ANY (ARRAY['PICKER_PHOTO'::text, 'OS_SOFTCOPY'::text])) AND (photo_evidence_mode <> 'OS_SOFTCOPY'::text OR length(btrim(COALESCE(photo_bypass_reason, ''::text))) >= 10)),
  CONSTRAINT "be_data_entry_service_type_v15_ck" CHECK (service_type = ANY (ARRAY['STANDARD'::text, 'EXPRESS'::text, 'SAME_DAY'::text, 'NEXT_DAY'::text, 'ECONOMY'::text])),
  CONSTRAINT "be_data_entry_source_row_v15_ck" CHECK (source_row_number IS NULL AND source_row_count IS NULL OR source_row_number IS NOT NULL AND source_row_count IS NOT NULL AND source_row_number > 0 AND source_row_count > 0 AND source_row_number <= (source_row_count + 25))
);
CREATE INDEX be_data_entry_pickup_way_upper_v197_idx ON public.be_data_entry_parcel_details USING btree (upper(btrim(pickup_id)), upper(btrim(delivery_way_id)));
CREATE INDEX be_data_entry_parcel_details_delivery_way_idx ON public.be_data_entry_parcel_details USING btree (delivery_way_id);
CREATE UNIQUE INDEX ux_be_data_entry_parcel_details_pickup_sequence ON public.be_data_entry_parcel_details USING btree (pickup_id, parcel_sequence);
CREATE INDEX idx_be_data_entry_pickup_id ON public.be_data_entry_parcel_details USING btree (pickup_id);
CREATE INDEX idx_be_data_entry_is_printed ON public.be_data_entry_parcel_details USING btree (is_printed);
CREATE INDEX idx_be_data_entry_township ON public.be_data_entry_parcel_details USING btree (township);
CREATE INDEX be_data_entry_wayplan_ready_v67_idx ON public.be_data_entry_parcel_details USING btree (delivery_region, delivery_route_mode, location_required, updated_at DESC) WHERE ((upper(COALESCE(financial_validation_status, ''::text)) = ANY (ARRAY['VALID'::text, 'OK'::text])) AND (upper(COALESCE(parcel_status, ''::text)) <> ALL (ARRAY['DELIVERED'::text, 'RTO'::text, 'CANCELLED'::text, 'CLOSED'::text, 'SETTLED'::text])));
CREATE INDEX ix_be_data_entry_parcel_details_pickup ON public.be_data_entry_parcel_details USING btree (pickup_id, parcel_sequence);
CREATE INDEX be_data_entry_delivery_way_upper_v132_idx ON public.be_data_entry_parcel_details USING btree (upper(delivery_way_id)) WHERE (NULLIF(btrim(delivery_way_id), ''::text) IS NOT NULL);
CREATE INDEX be_data_entry_os_imported_at_v15_idx ON public.be_data_entry_parcel_details USING btree (os_imported_at DESC) WHERE (os_imported_at IS NOT NULL);
CREATE INDEX be_data_entry_delivery_region_v19_idx ON public.be_data_entry_parcel_details USING btree (delivery_region, delivery_route_mode, way_management_status);
CREATE INDEX be_data_entry_source_waybill_upper_v64_idx ON public.be_data_entry_parcel_details USING btree (upper((financial_quote ->> 'source_waybill_no'::text))) WHERE (NULLIF((financial_quote ->> 'source_waybill_no'::text), ''::text) IS NOT NULL);
CREATE INDEX be_data_entry_way_trim_upper_v194_idx ON public.be_data_entry_parcel_details USING btree (upper(btrim(delivery_way_id))) WHERE (NULLIF(btrim(delivery_way_id), ''::text) IS NOT NULL);
CREATE INDEX be_finance_daily_parcel_way_upper_idx ON public.be_data_entry_parcel_details USING btree (upper(delivery_way_id));
CREATE INDEX be_data_entry_provider_upper_way_pickup_updated_v230_idx ON public.be_data_entry_parcel_details USING btree (upper(delivery_way_id), upper(pickup_id), updated_at DESC NULLS LAST);
ALTER TABLE public."be_data_entry_parcel_details" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_data_entry_parcel_details" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_data_entry_parcel_details" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
CREATE TABLE public."be_dispatch_scans_v39" (
  "delivery_way_id" text NOT NULL,
  "pickup_id" text,
  "parcel_sequence" integer,
  "wayplan_code" text,
  "scan_status" text DEFAULT 'SCANNED'::text NOT NULL,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scanned_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_dispatch_scans_v39_pkey" PRIMARY KEY (delivery_way_id),
  CONSTRAINT "be_dispatch_scans_v39_status_check" CHECK (scan_status = ANY (ARRAY['SCANNED'::text, 'REVERSED'::text]))
);
CREATE INDEX be_dispatch_scans_v39_pickup_idx ON public.be_dispatch_scans_v39 USING btree (pickup_id, scanned_at DESC);
CREATE INDEX be_dispatch_scans_v39_wayplan_status_idx ON public.be_dispatch_scans_v39 USING btree (wayplan_code, scan_status, delivery_way_id);
CREATE INDEX be_dispatch_scans_way_upper_v194_idx ON public.be_dispatch_scans_v39 USING btree (upper(delivery_way_id));
ALTER TABLE public."be_dispatch_scans_v39" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_dispatch_scans_v39" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_dispatch_scans_v39" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
CREATE TABLE public."be_superadmin_delegations_v65" (
  "target_email" text NOT NULL,
  "target_auth_user_id" uuid NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "granted_at" timestamp with time zone,
  "granted_by" text,
  "grant_reason" text,
  "revoked_at" timestamp with time zone,
  "revoked_by" text,
  "revoke_reason" text,
  "original_account_registry" jsonb,
  "original_user_registry_role" text,
  "original_user_role" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_superadmin_delegations_v65_pkey" PRIMARY KEY (target_email)
);
ALTER TABLE public."be_superadmin_delegations_v65" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_superadmin_delegations_v65" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_superadmin_delegations_v65" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
CREATE TABLE public."be_wayplan_dispatch_stops" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "wayplan_id" text NOT NULL,
  "stop_sequence" integer DEFAULT 1 NOT NULL,
  "pickup_id" text,
  "pickup_way_id" text,
  "delivery_way_id" text,
  "waybill_no" text,
  "recipient_name" text,
  "recipient_phone" text,
  "township" text,
  "address" text,
  "cod_amount" numeric DEFAULT 0,
  "delivery_fee" numeric DEFAULT 0,
  "parcel_weight_kg" numeric DEFAULT 0,
  "stop_status" text DEFAULT 'READY_FOR_DISPATCH'::text,
  "proof_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "rider_status" text DEFAULT 'PENDING'::text,
  "rider_action_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_reason" text,
  "cod_collected" numeric DEFAULT 0,
  "rider_proof_url" text,
  "receiver_name" text,
  "receiver_phone" text,
  "receiver_signature_url" text,
  "loaded_to_vehicle_at" timestamp with time zone,
  "handed_over_to_rider_at" timestamp with time zone,
  "warehouse_actor" text,
  "warehouse_notes" text,
  "warehouse_status" text,
  "warehouse_action" text,
  "warehouse_hold_reason" text,
  "warehouse_exception_status" text,
  "warehouse_exception_reason" text,
  "warehouse_received_at" timestamp with time zone,
  "data_entry_completed_at" timestamp with time zone,
  "ready_for_dispatch_at" timestamp with time zone,
  "warehouse_actor_email" text,
  "warehouse_batch_id" text,
  "scan_count" integer DEFAULT 0 NOT NULL,
  "warehouse_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "invoice_no" text,
  "tracking_no" text,
  "route_code" text,
  "optimized_sequence" integer,
  "delivery_township" text,
  "recipient_township" text,
  "amount_to_collect" numeric,
  "assigned_to" text,
  "rider_email" text,
  "rider_code" text,
  "rider_name" text,
  "dispatch_status" text,
  "branch_code" text,
  "delivery_address" text,
  "delivery_sequence" integer,
  "cod_collected_at" timestamp with time zone,
  "cod_collected_by" text,
  "finance_status" text,
  CONSTRAINT "be_wayplan_dispatch_stops_pkey" PRIMARY KEY (id)
);
CREATE INDEX be_wayplan_dispatch_stops_wayplan_idx ON public.be_wayplan_dispatch_stops USING btree (wayplan_id, stop_sequence);
CREATE INDEX be_wayplan_dispatch_stops_wayplan_status_idx ON public.be_wayplan_dispatch_stops USING btree (wayplan_id, stop_status);
CREATE INDEX be_wayplan_dispatch_stops_route_code_idx ON public.be_wayplan_dispatch_stops USING btree (route_code);
CREATE INDEX be_wayplan_dispatch_stops_assigned_route_idx ON public.be_wayplan_dispatch_stops USING btree (assigned_to, route_code);
CREATE INDEX be_wayplan_dispatch_stops_rider_email_route_idx ON public.be_wayplan_dispatch_stops USING btree (rider_email, route_code);
ALTER TABLE public."be_wayplan_dispatch_stops" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_wayplan_dispatch_stops" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_wayplan_dispatch_stops" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
CREATE TABLE public."be_wayplan_membership_v40" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "wayplan_id" text NOT NULL,
  "delivery_way_id" text NOT NULL,
  "pickup_id" text,
  "route_zone" text,
  "membership_status" text DEFAULT 'PLANNED'::text NOT NULL,
  "vehicle_type" text,
  "vehicle_code" text,
  "vehicle_name" text,
  "rider_code" text,
  "rider_name" text,
  "driver_code" text,
  "driver_name" text,
  "helper_code" text,
  "helper_name" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "be_wayplan_membership_v40_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_wayplan_membership_v40_status_check" CHECK (membership_status = ANY (ARRAY['PLANNED'::text, 'READY_FOR_DISPATCH'::text, 'DISPATCHED'::text, 'COMPLETED'::text, 'ON_HOLD'::text, 'CANCELLED'::text, 'RTO'::text])),
  CONSTRAINT "be_wayplan_membership_v40_vehicle_type_check" CHECK (vehicle_type IS NULL OR (vehicle_type = ANY (ARRAY['van'::text, 'delivery_van'::text, 'bike'::text, 'bicycle'::text]))),
  CONSTRAINT "be_wayplan_membership_v40_wayplan_id_delivery_way_id_key" UNIQUE (wayplan_id, delivery_way_id)
);
CREATE UNIQUE INDEX be_wayplan_membership_v40_active_way_idx ON public.be_wayplan_membership_v40 USING btree (delivery_way_id) WHERE (membership_status = ANY (ARRAY['PLANNED'::text, 'READY_FOR_DISPATCH'::text, 'DISPATCHED'::text]));
CREATE INDEX be_wayplan_membership_v40_wayplan_idx ON public.be_wayplan_membership_v40 USING btree (wayplan_id, membership_status);
CREATE INDEX be_wayplan_membership_v40_pickup_idx ON public.be_wayplan_membership_v40 USING btree (pickup_id, route_zone);
ALTER TABLE public."be_wayplan_membership_v40" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_wayplan_membership_v40" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_wayplan_membership_v40" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
CREATE TABLE public."be_wayplan_review_v43" (
  "wayplan_id" text NOT NULL,
  "review_status" text DEFAULT 'DRAFT'::text NOT NULL,
  "revision_no" integer DEFAULT 1 NOT NULL,
  "submitted_by" text,
  "submitted_at" timestamp with time zone,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "rejection_reason" text,
  "approval_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dispatch_ready_at" timestamp with time zone,
  "dispatched_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_wayplan_review_v43_pkey" PRIMARY KEY (wayplan_id),
  CONSTRAINT "be_wayplan_review_v43_status_check" CHECK (review_status = ANY (ARRAY['DRAFT'::text, 'PENDING_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text, 'DISPATCH_READY'::text, 'DISPATCHED'::text, 'CANCELLED'::text]))
);
CREATE INDEX be_wayplan_review_v43_status_idx ON public.be_wayplan_review_v43 USING btree (review_status, updated_at DESC);
ALTER TABLE public."be_wayplan_review_v43" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."be_wayplan_review_v43" FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public."be_wayplan_review_v43" IS 'UAT structure-only recovery stage; intentionally no app grants, policies, or triggers until dependencies reviewed';
COMMIT;
