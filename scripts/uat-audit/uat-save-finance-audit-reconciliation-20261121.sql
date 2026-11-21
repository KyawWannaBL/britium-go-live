-- HOSTED UAT only: final finance audit, way-ID reconciliation archive and projection foundations.
-- Structure, checks and keys copied from read-only production. No data, triggers, or application grants.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Wrong UAT target'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_delivery_way_id_registry)<>0 THEN RAISE EXCEPTION 'Unsafe UAT audit baseline'; END IF;
IF to_regclass('public.be_parcel_financial_audit_v2') IS NOT NULL THEN RAISE EXCEPTION 'Table exists: be_parcel_financial_audit_v2'; END IF;
IF to_regclass('public.be_way_id_reconciliation_archive_v33') IS NOT NULL THEN RAISE EXCEPTION 'Table exists: be_way_id_reconciliation_archive_v33'; END IF;
IF to_regclass('public.be_finance_calculation_projection_v4') IS NOT NULL THEN RAISE EXCEPTION 'Table exists: be_finance_calculation_projection_v4'; END IF;
END $preflight$;
CREATE TABLE public."be_parcel_financial_audit_v2" (
  "audit_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "parcel_id" text NOT NULL,
  "way_id" text,
  "previous_input_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "new_input_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "previous_calculated_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "new_calculated_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "employee_id" uuid,
  "authorization_employee_id" uuid,
  "reason" text,
  "calculation_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_parcel_financial_audit_v2_pkey" PRIMARY KEY (audit_id)
);
ALTER TABLE public."be_parcel_financial_audit_v2" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_parcel_financial_audit_v2" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_way_id_reconciliation_archive_v33" (
  "archive_id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "original_detail_id" uuid NOT NULL,
  "canonical_way_id" text NOT NULL,
  "replacement_pickup_id" text NOT NULL,
  "replacement_parcel_sequence" integer NOT NULL,
  "reason" text NOT NULL,
  "archived_row" jsonb NOT NULL,
  "archived_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_way_id_reconciliation_archive_v33_original_detail_id_key" UNIQUE (original_detail_id),
  CONSTRAINT "be_way_id_reconciliation_archive_v33_pkey" PRIMARY KEY (archive_id)
);
ALTER TABLE public."be_way_id_reconciliation_archive_v33" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_way_id_reconciliation_archive_v33" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_finance_calculation_projection_v4" (
  "parcel_id" uuid NOT NULL,
  "source_kind" text NOT NULL,
  "source_row_id" uuid NOT NULL,
  "delivery_way_id" text NOT NULL,
  "amount_entry_type" text NOT NULL,
  "customer_tier" text NOT NULL,
  "calculation" jsonb NOT NULL,
  "input_fingerprint" text NOT NULL,
  "source_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_finance_calculation_projection_source_kind_source_row_id_key" UNIQUE (source_kind, source_row_id),
  CONSTRAINT "be_finance_calculation_projection_v4_delivery_way_id_key" UNIQUE (delivery_way_id),
  CONSTRAINT "be_finance_calculation_projection_v4_pkey" PRIMARY KEY (parcel_id),
  CONSTRAINT "be_finance_calculation_projection_v4_source_kind_check" CHECK (source_kind = ANY (ARRAY['PARCEL'::text, 'DELIVERY_WAYBILL'::text]))
);
ALTER TABLE public."be_finance_calculation_projection_v4" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_finance_calculation_projection_v4" FROM PUBLIC, anon, authenticated;
COMMIT;
