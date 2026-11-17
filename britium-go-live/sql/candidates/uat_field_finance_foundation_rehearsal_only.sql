-- CI ONLY: full pre-V177 shape reconstructed from verified production pg_catalog.
-- V177 adds opening_cod_amount; no business data or client access copied.
CREATE TABLE public.be_field_finance_settlements_v1 (
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "work_date" date NOT NULL,
 "wayplan_id" text NOT NULL,
 "vehicle_code" text,
 "vehicle_name" text,
 "rider_code" text,
 "rider_name" text,
 "driver_code" text,
 "driver_name" text,
 "helper_code" text,
 "helper_name" text,
 "total_ways" integer NOT NULL DEFAULT 0,
 "delivered_ways" integer NOT NULL DEFAULT 0,
 "failed_ways" integer NOT NULL DEFAULT 0,
 "remaining_ways" integer NOT NULL DEFAULT 0,
 "expected_cod" numeric NOT NULL DEFAULT 0,
 "actual_collected" numeric NOT NULL DEFAULT 0,
 "cash_collected" numeric NOT NULL DEFAULT 0,
 "digital_collected" numeric NOT NULL DEFAULT 0,
 "variance_amount" numeric NOT NULL DEFAULT 0,
 "status" text NOT NULL DEFAULT 'OPEN'::text,
 "party_signatures" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "settlement_note" text,
 "opened_by" uuid,
 "opened_at" timestamp with time zone NOT NULL DEFAULT now(),
 "cleared_by" uuid,
 "cleared_at" timestamp with time zone,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "be_field_finance_settlements_v1_pkey" PRIMARY KEY (id),
 CONSTRAINT "be_field_finance_settlements_v1_work_date_wayplan_id_key" UNIQUE (work_date, wayplan_id)
);
ALTER TABLE public.be_field_finance_settlements_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_field_finance_settlements_v1 FROM PUBLIC,anon,authenticated;

