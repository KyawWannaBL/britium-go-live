-- UAT-308 disposable CI ONLY: 16 original production-catalog-verified table definitions.

-- NOT for hosted UAT/production. No rows copied; RLS enabled; no browser grants.

-- Source: read-only PostgreSQL catalog, production, 2026-11-20.

CREATE TABLE public."be_accounting_evidence_v1" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_module" text NOT NULL,
  "source_reference" text,
  "journal_reference" text,
  "file_name" text NOT NULL,
  "mime_type" text,
  "storage_bucket" text DEFAULT 'accounting-evidence'::text NOT NULL,
  "storage_path" text NOT NULL,
  "description" text,
  "uploaded_by" uuid DEFAULT auth.uid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public."be_accounting_evidence_v1" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_accounting_evidence_v1" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_accounting_manual_journal_drafts_v1" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "journal_reference" text NOT NULL,
  "journal_type" text NOT NULL,
  "transaction_date" date NOT NULL,
  "branch_code" text DEFAULT 'YGN'::text NOT NULL,
  "department_code" text,
  "cost_center_code" text,
  "merchant_code" text,
  "way_id" text,
  "waybill_no" text,
  "rider_employee_code" text,
  "source_module" text DEFAULT 'MANUAL_ACCOUNTING'::text NOT NULL,
  "description" text,
  "lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence_id" uuid,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "created_by" uuid DEFAULT auth.uid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "posted_by" uuid,
  "posted_at" timestamp with time zone,
  "posted_journal_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_accounting_manual_journal_drafts_v1" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_accounting_open_items_v1" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_type" text NOT NULL,
  "counterparty_type" text DEFAULT 'OTHER'::text NOT NULL,
  "counterparty_code" text,
  "counterparty_name" text NOT NULL,
  "document_reference" text,
  "journal_reference" text,
  "account_code" text NOT NULL,
  "offset_account_code" text,
  "amount" numeric NOT NULL,
  "outstanding_amount" numeric NOT NULL,
  "due_date" date,
  "branch_code" text DEFAULT 'YGN'::text,
  "department_code" text,
  "cost_center_code" text,
  "source_module" text,
  "way_id" text,
  "merchant_code" text,
  "status" text DEFAULT 'OPEN'::text NOT NULL,
  "evidence_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_accounting_open_items_v1" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_accounting_open_items_v1" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_cs_closure_v49" (
  "delivery_way_id" text NOT NULL,
  "wayplan_id" text NOT NULL,
  "pickup_id" text,
  "recipient_name" text,
  "recipient_phone" text,
  "township" text,
  "delivery_status" text NOT NULL,
  "delivered_at" timestamp with time zone,
  "expected_cod" numeric DEFAULT 0 NOT NULL,
  "finance_status" text DEFAULT 'NOT_SYNCED'::text NOT NULL,
  "proof_status" text DEFAULT 'MISSING'::text NOT NULL,
  "workflow_status" text DEFAULT 'READY_TO_CONTACT'::text NOT NULL,
  "contact_channel" text,
  "contact_summary" text,
  "customer_response" text,
  "outcome_message" text,
  "next_disposition" text,
  "operational_resolution_reference" text,
  "contacted_by" text,
  "contacted_at" timestamp with time zone,
  "closure_note" text,
  "closed_by" text,
  "closed_at" timestamp with time zone,
  "escalation_reason" text,
  "escalation_owner" text,
  "escalated_by" text,
  "escalated_at" timestamp with time zone,
  "last_operation_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public."be_cs_closure_v49" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_cs_closure_v49" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_cs_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "way_id" text,
  "pickup_id" text,
  "message_type" text DEFAULT 'comment'::text NOT NULL,
  "sender_role" text DEFAULT 'customer_service'::text NOT NULL,
  "sender_name" text,
  "sender_email" text,
  "target_role" text,
  "target_email" text,
  "message" text NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_cs_messages" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_cs_messages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_data_entry_financial_v2_runtime_v58" (
  "singleton" boolean DEFAULT true NOT NULL,
  "mutation_mode" text NOT NULL,
  "build" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "change_reason" text NOT NULL
);

ALTER TABLE public."be_data_entry_financial_v2_runtime_v58" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_data_entry_financial_v2_runtime_v58" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_data_entry_needs_fix_v25" (
  "pickup_id" text NOT NULL,
  "parcel_sequence" integer NOT NULL,
  "way_id" text,
  "os" text,
  "missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
  "photo_checked" boolean DEFAULT false NOT NULL,
  "row_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'needs_fix'::text NOT NULL,
  "deferred_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

ALTER TABLE public."be_data_entry_needs_fix_v25" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_data_entry_needs_fix_v25" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_delivery_team_confirmations_v176" (
  "wayplan_id" text NOT NULL,
  "delivery_way_id" text NOT NULL,
  "status" text DEFAULT 'PREPARED'::text NOT NULL,
  "prepared_by_user" uuid,
  "prepared_by_code" text,
  "prepared_by_role" text,
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "recipient_name" text,
  "recipient_phone" text,
  "proof_url" text,
  "signature_url" text,
  "cod_collected_amount" numeric DEFAULT 0 NOT NULL,
  "payment_method" text,
  "transaction_reference" text,
  "latitude" numeric,
  "longitude" numeric,
  "confirmed_by_user" uuid,
  "confirmed_by_driver_code" text,
  "confirmed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_delivery_team_confirmations_v176" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_delivery_team_confirmations_v176" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_final_sync_cases_v50" (
  "delivery_way_id" text NOT NULL,
  "wayplan_id" text NOT NULL,
  "pickup_id" text,
  "route_zone" text,
  "membership_status" text,
  "warehouse_status" text,
  "dispatch_scan_status" text,
  "review_status" text,
  "route_status" text,
  "rider_run_status" text,
  "delivery_status" text,
  "finance_status" text,
  "cs_status" text,
  "expected_cod" numeric DEFAULT 0 NOT NULL,
  "open_alert_count" integer DEFAULT 0 NOT NULL,
  "check_status" text DEFAULT 'PENDING'::text NOT NULL,
  "issue_codes" text[] DEFAULT '{}'::text[] NOT NULL,
  "open_variance_count" integer DEFAULT 0 NOT NULL,
  "source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "certification_stale" boolean DEFAULT false NOT NULL,
  "certified_by" text,
  "certified_at" timestamp with time zone,
  "certification_note" text,
  "last_refreshed_by" text,
  "last_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "recorded_pickup_id" text,
  "merchant_code" text,
  "way_merchant_code" text,
  "pickup_merchant_code" text,
  "lineage_valid" boolean DEFAULT false NOT NULL,
  "lineage_status" text DEFAULT 'UNVERIFIED'::text NOT NULL,
  "lineage_source" text DEFAULT 'UNVERIFIED'::text NOT NULL,
  "data_entry_row_id" uuid,
  "data_entry_match_count" integer DEFAULT 0 NOT NULL
);

ALTER TABLE public."be_final_sync_cases_v50" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_final_sync_cases_v50" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_final_sync_variances_v50" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "delivery_way_id" text NOT NULL,
  "wayplan_id" text NOT NULL,
  "issue_code" text NOT NULL,
  "issue_summary" text NOT NULL,
  "variance_status" text DEFAULT 'OPEN'::text NOT NULL,
  "owner" text,
  "owner_note" text,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_at" timestamp with time zone,
  "resolved_by" text,
  "resolved_at" timestamp with time zone,
  "resolution_note" text,
  "detected_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_final_sync_variances_v50" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_final_sync_variances_v50" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_finance_settlement_batches_v2" (
  "settlement_batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "parcel_count" integer DEFAULT 0 NOT NULL,
  "merchant_count" integer DEFAULT 0 NOT NULL,
  "total_customer_collection" bigint DEFAULT 0 NOT NULL,
  "total_merchant_settlement" bigint DEFAULT 0 NOT NULL,
  "total_company_delivery_revenue" bigint DEFAULT 0 NOT NULL,
  "total_company_additional_charges" bigint DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public."be_finance_settlement_batches_v2" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_finance_settlement_batches_v2" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_merchant_support_messages" (
  "message_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "merchant_code" text NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "sender_role" text NOT NULL,
  "sender_name" text,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_merchant_support_messages" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_merchant_support_messages" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_parcel_import_batches" (
  "batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "batch_no" text DEFAULT ((('PARCEL-'::text || to_char(now(), 'YYYYMMDD-HH24MISS'::text)) || '-'::text) || upper(substr(encode(gen_random_bytes(3), 'hex'::text), 1, 6))) NOT NULL,
  "source_file_name" text,
  "pickup_id" text,
  "uploaded_by" text,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "warning_rows" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'registered'::text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_parcel_import_batches" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_parcel_import_batches" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_parcel_settlement_ledger_v2" (
  "ledger_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" text NOT NULL,
  "way_id" text,
  "settlement_batch_id" uuid NOT NULL,
  "transaction_type" text NOT NULL,
  "amount" bigint NOT NULL,
  "calculation_version" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."be_parcel_settlement_ledger_v2" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_parcel_settlement_ledger_v2" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."be_rider_route_runs_v46" (
  "wayplan_id" text NOT NULL,
  "run_status" text DEFAULT 'ASSIGNED'::text NOT NULL,
  "route_version" integer DEFAULT 1 NOT NULL,
  "assigned_rider_code" text,
  "assigned_rider_name" text,
  "assigned_driver_code" text,
  "assigned_driver_name" text,
  "accepted_by" text,
  "accepted_at" timestamp with time zone,
  "started_by" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "current_stop_sequence" integer,
  "start_latitude" numeric,
  "start_longitude" numeric,
  "start_distance_m" numeric,
  "last_latitude" numeric,
  "last_longitude" numeric,
  "last_gps_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public."be_rider_route_runs_v46" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."be_rider_route_runs_v46" FROM PUBLIC,anon,authenticated;

CREATE TABLE public."upload_batches" (
  "batch_id" character varying(50) NOT NULL,
  "file_name" character varying(255) NOT NULL,
  "uploaded_by" character varying(50),
  "total_rows" integer,
  "processed_status" character varying(20) DEFAULT 'PENDING'::character varying,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public."upload_batches" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."upload_batches" FROM PUBLIC,anon,authenticated;

ALTER TABLE public."be_accounting_evidence_v1" ADD CONSTRAINT "be_accounting_evidence_v1_pkey" PRIMARY KEY (id);

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ADD CONSTRAINT "be_accounting_manual_journal_drafts_v1_journal_reference_key" UNIQUE (journal_reference);

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ADD CONSTRAINT "be_accounting_manual_journal_drafts_v1_pkey" PRIMARY KEY (id);

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ADD CONSTRAINT "be_accounting_manual_journal_drafts_v1_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'POSTED'::text, 'CANCELLED'::text])));

ALTER TABLE public."be_accounting_open_items_v1" ADD CONSTRAINT "be_accounting_open_items_v1_amount_check" CHECK ((amount >= (0)::numeric));

ALTER TABLE public."be_accounting_open_items_v1" ADD CONSTRAINT "be_accounting_open_items_v1_item_type_check" CHECK ((item_type = ANY (ARRAY['AR'::text, 'AP'::text])));

ALTER TABLE public."be_accounting_open_items_v1" ADD CONSTRAINT "be_accounting_open_items_v1_outstanding_amount_check" CHECK ((outstanding_amount >= (0)::numeric));

ALTER TABLE public."be_accounting_open_items_v1" ADD CONSTRAINT "be_accounting_open_items_v1_pkey" PRIMARY KEY (id);

ALTER TABLE public."be_accounting_open_items_v1" ADD CONSTRAINT "be_accounting_open_items_v1_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'SETTLED'::text, 'CANCELLED'::text])));

ALTER TABLE public."be_cs_closure_v49" ADD CONSTRAINT "be_cs_closure_v49_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['DELIVERED'::text, 'FAILED'::text, 'RTO'::text, 'CANCELLED'::text])));

ALTER TABLE public."be_cs_closure_v49" ADD CONSTRAINT "be_cs_closure_v49_pkey" PRIMARY KEY (delivery_way_id);

ALTER TABLE public."be_cs_closure_v49" ADD CONSTRAINT "be_cs_closure_v49_workflow_status_check" CHECK ((workflow_status = ANY (ARRAY['WAITING_FINANCE'::text, 'FINANCE_HOLD'::text, 'READY_TO_CONTACT'::text, 'CONTACTED'::text, 'CLOSED'::text, 'ESCALATED'::text])));

ALTER TABLE public."be_cs_messages" ADD CONSTRAINT "be_cs_messages_pkey" PRIMARY KEY (id);

ALTER TABLE public."be_data_entry_financial_v2_runtime_v58" ADD CONSTRAINT "be_data_entry_financial_v2_runtime_v58_mutation_mode_check" CHECK ((mutation_mode = ANY (ARRAY['MUTATION_SHADOW'::text, 'ACTIVE'::text])));

ALTER TABLE public."be_data_entry_financial_v2_runtime_v58" ADD CONSTRAINT "be_data_entry_financial_v2_runtime_v58_pkey" PRIMARY KEY (singleton);

ALTER TABLE public."be_data_entry_financial_v2_runtime_v58" ADD CONSTRAINT "be_data_entry_financial_v2_runtime_v58_singleton_check" CHECK (singleton);

ALTER TABLE public."be_data_entry_needs_fix_v25" ADD CONSTRAINT "be_data_entry_needs_fix_v25_pkey" PRIMARY KEY (pickup_id, parcel_sequence);

ALTER TABLE public."be_delivery_team_confirmations_v176" ADD CONSTRAINT "be_delivery_team_confirmations_v176_pkey" PRIMARY KEY (wayplan_id, delivery_way_id);

ALTER TABLE public."be_final_sync_cases_v50" ADD CONSTRAINT "be_final_sync_cases_v50_pkey" PRIMARY KEY (delivery_way_id);

ALTER TABLE public."be_final_sync_cases_v50" ADD CONSTRAINT "be_final_sync_cases_v50_status_check" CHECK ((check_status = ANY (ARRAY['PENDING'::text, 'VARIANCE'::text, 'READY_TO_CERTIFY'::text, 'CERTIFIED'::text, 'EXCLUDED'::text])));

ALTER TABLE public."be_final_sync_variances_v50" ADD CONSTRAINT "be_final_sync_variances_v50_pkey" PRIMARY KEY (id);

ALTER TABLE public."be_final_sync_variances_v50" ADD CONSTRAINT "be_final_sync_variances_v50_status_check" CHECK ((variance_status = ANY (ARRAY['OPEN'::text, 'ASSIGNED'::text, 'RESOLVED'::text, 'WAIVED'::text])));

ALTER TABLE public."be_finance_settlement_batches_v2" ADD CONSTRAINT "be_finance_settlement_batches_v2_pkey" PRIMARY KEY (settlement_batch_id);

ALTER TABLE public."be_finance_settlement_batches_v2" ADD CONSTRAINT "be_finance_settlement_batches_v2_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text, 'VOID'::text])));

ALTER TABLE public."be_merchant_support_messages" ADD CONSTRAINT "be_merchant_support_messages_message_check" CHECK ((length(TRIM(BOTH FROM message)) > 0));

ALTER TABLE public."be_merchant_support_messages" ADD CONSTRAINT "be_merchant_support_messages_pkey" PRIMARY KEY (message_id);

ALTER TABLE public."be_parcel_import_batches" ADD CONSTRAINT "be_parcel_import_batches_pkey" PRIMARY KEY (batch_id);

ALTER TABLE public."be_parcel_settlement_ledger_v2" ADD CONSTRAINT "be_parcel_settlement_ledger_v2_idempotent" UNIQUE (parcel_id, settlement_batch_id, transaction_type);

ALTER TABLE public."be_parcel_settlement_ledger_v2" ADD CONSTRAINT "be_parcel_settlement_ledger_v2_pkey" PRIMARY KEY (ledger_id);

ALTER TABLE public."be_parcel_settlement_ledger_v2" ADD CONSTRAINT "be_parcel_settlement_ledger_v2_type_check" CHECK ((transaction_type = ANY (ARRAY['CUSTOMER_COLLECTION'::text, 'MERCHANT_ITEM_PAYABLE'::text, 'DELIVERY_REVENUE'::text, 'DELIVERY_EXCESS_CREDIT'::text, 'DELIVERY_SHORTFALL_DEBIT'::text, 'MERCHANT_ADDITIONAL_CREDIT'::text, 'MERCHANT_OTHER_CHARGE'::text, 'COMMITMENT_REFUND'::text, 'COMPANY_ADDITIONAL_CUSTOMER_CHARGE'::text])));

ALTER TABLE public."be_rider_route_runs_v46" ADD CONSTRAINT "be_rider_route_runs_v46_pkey" PRIMARY KEY (wayplan_id);

ALTER TABLE public."be_rider_route_runs_v46" ADD CONSTRAINT "be_rider_route_runs_v46_status_check" CHECK ((run_status = ANY (ARRAY['ASSIGNED'::text, 'ACCEPTED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'COMPLETED_WITH_EXCEPTIONS'::text, 'CANCELLED'::text])));

ALTER TABLE public."upload_batches" ADD CONSTRAINT "upload_batches_pkey" PRIMARY KEY (batch_id);

-- Referential integrity constraints, after all 16 parents/children are created.

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ADD CONSTRAINT "be_accounting_manual_journal_drafts_v1_journal_type_fkey" FOREIGN KEY (journal_type) REFERENCES be_accounting_journal_type_master_v1(journal_type);

ALTER TABLE public."be_accounting_manual_journal_drafts_v1" ADD CONSTRAINT "be_accounting_manual_journal_drafts_v1_posted_journal_id_fkey" FOREIGN KEY (posted_journal_id) REFERENCES be_journal_entries(id);

ALTER TABLE public."be_cs_messages" ADD CONSTRAINT "be_cs_messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES be_cs_tickets(id) ON DELETE CASCADE;

ALTER TABLE public."be_final_sync_variances_v50" ADD CONSTRAINT "be_final_sync_variances_v50_delivery_way_id_fkey" FOREIGN KEY (delivery_way_id) REFERENCES be_final_sync_cases_v50(delivery_way_id) ON DELETE CASCADE;

ALTER TABLE public."be_merchant_support_messages" ADD CONSTRAINT "be_merchant_support_messages_sender_user_id_fkey" FOREIGN KEY (sender_user_id) REFERENCES auth.users(id);

ALTER TABLE public."be_merchant_support_messages" ADD CONSTRAINT "be_merchant_support_messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES be_merchant_support_tickets(ticket_id) ON DELETE CASCADE;

-- Original secondary indexes not already created by PK/UNIQUE constraints.

CREATE INDEX IF NOT EXISTS be_cs_closure_v49_status_idx ON public.be_cs_closure_v49 USING btree (workflow_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS be_cs_closure_v49_wayplan_idx ON public.be_cs_closure_v49 USING btree (wayplan_id, delivery_status);

CREATE INDEX IF NOT EXISTS be_cs_messages_pickup_idx ON public.be_cs_messages USING btree (pickup_id, created_at DESC);

CREATE INDEX IF NOT EXISTS be_cs_messages_ticket_idx ON public.be_cs_messages USING btree (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS be_cs_messages_way_idx ON public.be_cs_messages USING btree (way_id, created_at DESC);

CREATE INDEX IF NOT EXISTS be_data_entry_needs_fix_v25_status_idx ON public.be_data_entry_needs_fix_v25 USING btree (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS be_data_entry_needs_fix_v25_way_id_idx ON public.be_data_entry_needs_fix_v25 USING btree (way_id);

CREATE INDEX IF NOT EXISTS be_final_sync_cases_v50_lineage_idx ON public.be_final_sync_cases_v50 USING btree (lineage_valid, lineage_status, check_status);

CREATE INDEX IF NOT EXISTS be_final_sync_cases_v50_merchant_idx ON public.be_final_sync_cases_v50 USING btree (merchant_code, check_status);

CREATE INDEX IF NOT EXISTS be_final_sync_cases_v50_pickup_idx ON public.be_final_sync_cases_v50 USING btree (pickup_id, check_status);

CREATE INDEX IF NOT EXISTS be_final_sync_cases_v50_wayplan_idx ON public.be_final_sync_cases_v50 USING btree (wayplan_id, check_status);

CREATE UNIQUE INDEX IF NOT EXISTS be_final_sync_variances_v50_open_uq ON public.be_final_sync_variances_v50 USING btree (delivery_way_id, issue_code) WHERE (variance_status = ANY (ARRAY['OPEN'::text, 'ASSIGNED'::text]));

CREATE INDEX IF NOT EXISTS be_final_sync_variances_v50_status_idx ON public.be_final_sync_variances_v50 USING btree (variance_status, owner, wayplan_id);

CREATE INDEX IF NOT EXISTS be_merchant_support_messages_ticket_idx ON public.be_merchant_support_messages USING btree (ticket_id, created_at);
