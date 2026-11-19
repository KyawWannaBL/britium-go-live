-- Disposable CI only. Two original 2026-10-23 ground records relations,
-- catalog verified. No outbound shipments or failure records inserted.
CREATE TABLE IF NOT EXISTS private.be_oct23_outbound_manifest_v1(
 delivery_way_id text PRIMARY KEY,
 work_date date NOT NULL DEFAULT '2026-10-23'::date,
 source_row integer NOT NULL,
 merchant_name text,
 assigned_operator text,
 assigned_helper text,
 vehicle_plate text,
 source_final_cod numeric,
 imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.be_oct23_outbound_manifest_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct23_outbound_manifest_v1 FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.be_oct23_ground_failures_v1(
 delivery_way_id text PRIMARY KEY,
 work_date date NOT NULL DEFAULT '2026-10-23'::date,
 merchant_name text,
 original_reason text NOT NULL,
 reported_worker text,
 category text NOT NULL CONSTRAINT be_oct23_category_ck CHECK(category IN ('POSTPONED','UNREACHABLE','NO_ATTEMPT','CANCELLED','CUSTOMER_SERVICE_REVIEW','ADDRESS_CHANGE_POSTPONED','BUSY_LINE')),
 redelivery_date date,
 evidence_source text NOT NULL DEFAULT 'Management provided 58-row failure table 2026-10-23',
 source_recorded_at timestamptz NOT NULL DEFAULT now(),
 prior_parcel_status text,
 prior_stop_status text,
 reconciliation_status text NOT NULL DEFAULT 'REPORTED_NOT_APPLIED'
  CONSTRAINT be_oct23_status_ck CHECK(reconciliation_status IN ('REPORTED_NOT_APPLIED','APPLIED','MISSING_MASTER','STATUS_CONFLICT','REVIEW_REQUIRED')),
 applied_at timestamptz
);
ALTER TABLE private.be_oct23_ground_failures_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct23_ground_failures_v1 FROM PUBLIC,anon,authenticated;
