-- Disposable CI only. Original October external settlement manifest schema,
-- recovered from production catalog. Zero external settlement records are copied.
CREATE TABLE IF NOT EXISTS private.be_oct2026_external_settlement_manifest (
 source_sha256 text NOT NULL,
 delivery_way_id text NOT NULL,
 sheet_date date NOT NULL,
 source_row integer NOT NULL,
 final_cod_mmk numeric,
 cash_mmk numeric,
 kpay_mmk numeric,
 imported_at timestamptz NOT NULL DEFAULT now(),
 source_sheet text,
 source_check text,
 import_note text,
 CONSTRAINT be_oct2026_external_settlement_manifest_pkey
 PRIMARY KEY (source_sha256, delivery_way_id),
 CONSTRAINT be_oct2026_manifest_nonnegative
 CHECK (coalesce(final_cod_mmk,0)>=0 AND coalesce(cash_mmk,0)>=0 AND coalesce(kpay_mmk,0)>=0)
);
ALTER TABLE private.be_oct2026_external_settlement_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_oct2026_external_settlement_manifest FROM PUBLIC,anon,authenticated;
