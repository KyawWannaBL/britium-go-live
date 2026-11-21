-- BRITIUM UAT ONLY: core Save/Waybill infrastructure tables, structure-only + synthetic branch config.
-- NO operational write functions enabled, NO historical business data copied, NO trigger bypass to apps.
-- Partial structure recovery: original trigger bodies and non-constraint indexes deferred to functional write stage.
BEGIN;
SET LOCAL statement_timeout = '65s';
DO $verify_target$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'UAT identity count mismatch or wrong project'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Refuse schema change while writes active'; END IF;
IF (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 OR (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 THEN RAISE EXCEPTION 'Unexpected UAT fixture state'; END IF;
IF to_regclass('public.be_audit_events') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_audit_events'; END IF;
IF to_regclass('public.be_branch_offices') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_branch_offices'; END IF;
IF to_regclass('public.be_data_entry_financial_v2_requests_v58') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_data_entry_financial_v2_requests_v58'; END IF;
IF to_regclass('public.be_data_entry_pending_drafts') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_data_entry_pending_drafts'; END IF;
IF to_regclass('public.be_data_entry_register_batches') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_data_entry_register_batches'; END IF;
IF to_regclass('public.be_data_entry_register_rows') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_data_entry_register_rows'; END IF;
IF to_regclass('public.be_delivery_location_registry') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_delivery_location_registry'; END IF;
IF to_regclass('public.be_delivery_way_id_aliases_v33') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_delivery_way_id_aliases_v33'; END IF;
IF to_regclass('public.be_delivery_way_id_registry') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_delivery_way_id_registry'; END IF;
IF to_regclass('public.be_pickup_parcel_verifications') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_pickup_parcel_verifications'; END IF;
IF to_regclass('public.be_waybill_ledger') IS NOT NULL THEN RAISE EXCEPTION 'Refuse to overwrite public.be_waybill_ledger'; END IF;
END $verify_target$;
CREATE TABLE public."be_audit_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid,
  "actor_email" text,
  "actor_role" text,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "upload_code" text,
  "event_type" text,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "be_audit_events_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."be_audit_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_audit_events" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_branch_offices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "branch_code" text NOT NULL,
  "branch_name" text NOT NULL,
  "city" text NOT NULL,
  "region" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "opening_date" date,
  "manager_name" text,
  "manager_phone" text,
  "address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "authority_scope" text DEFAULT 'REGIONAL'::text,
  "region_name" text,
  "node_code" text,
  "ho_royalty_rate" numeric DEFAULT 10,
  "authority_level" text DEFAULT 'regional'::text,
  "can_edit_finance" boolean DEFAULT false,
  "can_approve_finance" boolean DEFAULT false,
  "can_edit_master_data" boolean DEFAULT false,
  "can_override_hq_rules" boolean DEFAULT false,
  "region_state" text,
  "phone" text,
  "permissions" jsonb DEFAULT '{}'::jsonb,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "email" text,
  "authority_status" text DEFAULT 'pending'::text,
  "decision_reason" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "rejected_by" text,
  "rejected_at" timestamp with time zone,
  "abolished_by" text,
  "abolished_at" timestamp with time zone,
  "manager_email" text,
  "created_by_email" text,
  "updated_by_email" text,
  "branch_type" text DEFAULT 'BRANCH'::text,
  "lat" double precision,
  "lng" double precision,
  "is_head_office" boolean DEFAULT false,
  "active" boolean DEFAULT true,
  CONSTRAINT "be_branch_offices_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_branch_offices_branch_code_key" UNIQUE (branch_code),
  CONSTRAINT "be_branch_offices_branch_name_key" UNIQUE (branch_name)
);
ALTER TABLE public."be_branch_offices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_branch_offices" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_financial_v2_requests_v58" (
  "request_id" text NOT NULL,
  "operation" text NOT NULL,
  "actor_id" uuid,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL,
  "response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "be_data_entry_financial_v2_requests_v58_operation_check" CHECK (operation = ANY (ARRAY['SAVE'::text, 'IMPORT'::text, 'CREATE_WAYBILL'::text, 'ADD_REGISTRATIONS'::text, 'SAVE_ALL'::text, 'SAVE_BATCH_V22'::text])),
  CONSTRAINT "be_data_entry_financial_v2_requests_v58_status_check" CHECK (status = ANY (ARRAY['IN_PROGRESS'::text, 'COMPLETE'::text])),
  CONSTRAINT "be_data_entry_financial_v2_requests_v58_pkey" PRIMARY KEY (request_id)
);
ALTER TABLE public."be_data_entry_financial_v2_requests_v58" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_financial_v2_requests_v58" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_pending_drafts" (
  "owner_id" uuid DEFAULT auth.uid() NOT NULL,
  "pickup_id" text NOT NULL,
  "parcel_sequence" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "skipped" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_data_entry_pending_drafts_parcel_sequence_check" CHECK (parcel_sequence > 0),
  CONSTRAINT "be_data_entry_pending_drafts_snapshot_check" CHECK (jsonb_typeof(snapshot) = 'object'::text),
  CONSTRAINT "be_data_entry_pending_drafts_pkey" PRIMARY KEY (owner_id, pickup_id, parcel_sequence)
);
ALTER TABLE public."be_data_entry_pending_drafts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_pending_drafts" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_register_batches" (
  "batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "batch_no" text DEFAULT ((('DER-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(encode(gen_random_bytes(4), 'hex'::text), 1, 8))),
  "source_file_name" text,
  "source_module" text DEFAULT 'data_entry_excel_register'::text,
  "uploaded_by" text,
  "uploaded_by_name" text,
  "total_rows" integer DEFAULT 0,
  "valid_rows" integer DEFAULT 0,
  "rejected_rows" integer DEFAULT 0,
  "status" text DEFAULT 'draft'::text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "be_data_entry_register_batches_pkey" PRIMARY KEY (batch_id)
);
ALTER TABLE public."be_data_entry_register_batches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_register_batches" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_register_rows" (
  "row_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid,
  "row_no" integer,
  "source_file_name" text,
  "overall_status" text DEFAULT 'registered'::text,
  "operation_status" text DEFAULT 'data_entry_registered'::text,
  "financial_status" text DEFAULT 'pending_finance'::text,
  "pickup_date" date,
  "pickup_way_id" text,
  "delivery_way_id" text,
  "merchant_code" text,
  "merchant_name" text,
  "recipient_name" text,
  "recipient_phone" text,
  "recipient_township" text,
  "recipient_address" text,
  "item_price" numeric DEFAULT 0,
  "delivery_fee_os" numeric DEFAULT 0,
  "cod_os" numeric DEFAULT 0,
  "std_deli" numeric DEFAULT 0,
  "max_deli" numeric DEFAULT 0,
  "weight_kg" numeric DEFAULT 0,
  "surcharge" numeric DEFAULT 0,
  "final_cod" numeric DEFAULT 0,
  "destination" text,
  "pickup_by_1" text,
  "pickup_by_2" text,
  "general_remarks" text,
  "driver_rider" text,
  "helper" text,
  "plate_no" text,
  "delivery_remarks" text,
  "finance_deli" numeric DEFAULT 0,
  "finance_cod" numeric DEFAULT 0,
  "finance_received_by" text,
  "finance_status" text DEFAULT 'pending_finance'::text,
  "validation_status" text DEFAULT 'valid'::text,
  "validation_errors" jsonb DEFAULT '[]'::jsonb,
  "raw_row" jsonb DEFAULT '{}'::jsonb,
  "created_by" text,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "deli_fee_os" numeric DEFAULT 0,
  CONSTRAINT "be_data_entry_register_rows_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES be_data_entry_register_batches(batch_id) ON DELETE SET NULL,
  CONSTRAINT "be_data_entry_register_rows_pkey" PRIMARY KEY (row_id),
  CONSTRAINT "be_data_entry_register_rows_delivery_way_id_bulk_key" UNIQUE (delivery_way_id)
);
ALTER TABLE public."be_data_entry_register_rows" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_register_rows" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_delivery_location_registry" (
  "delivery_way_id" text NOT NULL,
  "address_original" text DEFAULT ''::text NOT NULL,
  "address_english" text DEFAULT ''::text NOT NULL,
  "township" text DEFAULT ''::text NOT NULL,
  "latitude" numeric(11,8),
  "longitude" numeric(11,8),
  "provider_label" text DEFAULT ''::text NOT NULL,
  "match_level" text DEFAULT 'UNRESOLVED'::text NOT NULL,
  "confidence" numeric(5,4) DEFAULT 0 NOT NULL,
  "coordinate_source" text DEFAULT 'UNRESOLVED'::text NOT NULL,
  "review_status" text DEFAULT 'MANUAL_REVIEW'::text NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "postal_code" text DEFAULT ''::text NOT NULL,
  "postal_match_level" text DEFAULT 'UNRESOLVED'::text NOT NULL,
  CONSTRAINT "be_delivery_location_lat_ck" CHECK (latitude IS NULL OR latitude >= 9::numeric AND latitude <= 29::numeric),
  CONSTRAINT "be_delivery_location_lng_ck" CHECK (longitude IS NULL OR longitude >= 92::numeric AND longitude <= 102::numeric),
  CONSTRAINT "be_delivery_location_postal_match_ck" CHECK (postal_match_level = ANY (ARRAY['EXACT_QUARTER'::text, 'TOWNSHIP_ONLY'::text, 'UNRESOLVED'::text])),
  CONSTRAINT "be_delivery_location_review_ck" CHECK (review_status = ANY (ARRAY['ACCEPTED'::text, 'MANUAL_REVIEW'::text])),
  CONSTRAINT "be_delivery_location_registry_pkey" PRIMARY KEY (delivery_way_id)
);
ALTER TABLE public."be_delivery_location_registry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_delivery_location_registry" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_delivery_way_id_aliases_v33" (
  "alias_way_id" text NOT NULL,
  "canonical_way_id" text NOT NULL,
  "pickup_id" text,
  "parcel_sequence" integer,
  "merchant_code" text,
  "source_kind" text DEFAULT 'CONSOLIDATED_OS_IMPORT'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_delivery_way_id_aliases_v33_distinct_ck" CHECK (upper(alias_way_id) <> upper(canonical_way_id)),
  CONSTRAINT "be_delivery_way_id_aliases_v33_pkey" PRIMARY KEY (alias_way_id)
);
ALTER TABLE public."be_delivery_way_id_aliases_v33" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_delivery_way_id_aliases_v33" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_delivery_way_id_registry" (
  "delivery_way_id" text NOT NULL,
  "pickup_id" text NOT NULL,
  "parcel_sequence" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_be_delivery_way_parcel_sequence" CHECK (parcel_sequence > 0),
  CONSTRAINT "be_delivery_way_id_registry_pkey" PRIMARY KEY (delivery_way_id),
  CONSTRAINT "uq_be_delivery_way_pickup_sequence" UNIQUE (pickup_id, parcel_sequence)
);
ALTER TABLE public."be_delivery_way_id_registry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_delivery_way_id_registry" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_pickup_parcel_verifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pickup_id" text NOT NULL,
  "pickup_way_id" text,
  "merchant_code" text,
  "parcel_sequence" integer NOT NULL,
  "delivery_way_id" text NOT NULL,
  "parcel_weight_kg" numeric(10,2),
  "proof_photo_path" text,
  "proof_photo_url" text,
  "verified_by_email" text,
  "verified_at" timestamp with time zone,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "qr_payload" text,
  "qr_printed_at" timestamp with time zone,
  "save_count" integer DEFAULT 0,
  "photo_taken_at" timestamp with time zone,
  "actor_email" text,
  "proof_photo_data" text,
  "raw_payload" jsonb DEFAULT '{}'::jsonb,
  "verification_status" text DEFAULT 'RIDER_VERIFIED'::text,
  "proof_check_status" text DEFAULT 'PENDING_REVIEW'::text,
  "submitted_by" text,
  "submitted_at" timestamp with time zone DEFAULT now(),
  "reviewed_by" text,
  "reviewed_by_email" text,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "actual_weight_kg" numeric,
  "tracking_no" text,
  "waybill_no" text,
  "remarks" text,
  "proof_file_name" text,
  "signature_url" text,
  "photo_sha256" text,
  "clarity_score" numeric,
  "clarity_status" text,
  "image_width" integer,
  "image_height" integer,
  "file_size_bytes" bigint,
  "original_file_name" text,
  "upload_attempt_count" integer DEFAULT 0 NOT NULL,
  "last_rejected_at" timestamp with time zone,
  "submission_batch_id" uuid,
  "is_skipped" boolean DEFAULT false NOT NULL,
  CONSTRAINT "be_pickup_parcel_verifications_sequence_chk" CHECK (parcel_sequence > 0),
  CONSTRAINT "be_pickup_parcel_verifications_weight_chk" CHECK (parcel_weight_kg IS NULL OR parcel_weight_kg > 0::numeric),
  CONSTRAINT "be_pickup_parcel_verifications_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."be_pickup_parcel_verifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_pickup_parcel_verifications" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_waybill_ledger" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "waybill_no" text,
  "pickup_id" text,
  "deliver_id" text,
  "invoice_no" text,
  "merchant_code" text,
  "merchant_name" text,
  "parcel_count" integer DEFAULT 0,
  "cod_amount" numeric DEFAULT 0,
  "status" text DEFAULT 'printed'::text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "delivery_way_id" text,
  "recipient_name" text,
  "recipient_phone" text,
  "contact_no_1" text,
  "recipient_address" text,
  "delivery_address" text,
  "township" text,
  "customer_name" text,
  "item_price" numeric DEFAULT 0,
  "delivery_fee" numeric DEFAULT 0,
  "weight_kg" numeric DEFAULT 0,
  "parcel_weight_kg" numeric DEFAULT 0,
  "total_weight_kg" numeric DEFAULT 0,
  "dispatch_status" text DEFAULT 'READY_FOR_DISPATCH'::text,
  "wayplan_status" text DEFAULT 'NOT_PLANNED'::text,
  "wayplan_id" text,
  "warehouse_status" text DEFAULT 'READY_FOR_DISPATCH'::text,
  "rider_status" text DEFAULT 'PENDING'::text,
  "delivered_at" timestamp with time zone,
  "failed_reason" text,
  "cod_collected" numeric DEFAULT 0,
  "rider_proof_url" text,
  "loaded_to_vehicle_at" timestamp with time zone,
  "handed_over_to_rider_at" timestamp with time zone,
  "warehouse_actor" text,
  "warehouse_notes" text,
  "pickup_way_id" text,
  "tracking_no" text,
  "parcel_sequence" integer,
  "pickup_status" text,
  "data_entry_status" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "finance_status" text,
  "cod_settled_at" timestamp with time zone,
  "cod_settled_by" text,
  "settlement_ref" text,
  CONSTRAINT "be_waybill_ledger_pkey" PRIMARY KEY (id),
  CONSTRAINT "be_waybill_ledger_waybill_no_key" UNIQUE (waybill_no)
);
ALTER TABLE public."be_waybill_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_waybill_ledger" FROM PUBLIC, anon, authenticated;
INSERT INTO public.be_branch_offices(branch_code,branch_name,city,region,authority_status,decision_reason,active,status)
 VALUES
 ('ISN','Insein UAT Branch','Yangon','Yangon','approved','SYNTHETIC UAT BRANCH PROFILE',true,'active'),
 ('MDY','Mandalay UAT Branch','Mandalay','Mandalay','approved','SYNTHETIC UAT BRANCH PROFILE',true,'active');
DO $post$
DECLARE c integer;
BEGIN
 SELECT count(*) INTO c FROM public.be_branch_offices WHERE branch_code IN ('ISN','MDY') AND active AND lower(authority_status)='approved';
 IF c<>2 THEN RAISE EXCEPTION 'Two UAT branches not provisioned correctly'; END IF;
 IF (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_data_entry_register_rows)<>0 THEN RAISE EXCEPTION 'Unexpected write rows'; END IF;
END $post$;
NOTIFY pgrst, 'reload schema';
COMMIT;
