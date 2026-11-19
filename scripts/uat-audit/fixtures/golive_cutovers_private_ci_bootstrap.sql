-- CI disposable database ONLY. Original private go-live cutover audit table.
-- No cutover, cutoff, archival, isolation, or cleanup records are created.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.be_golive_readiness_cutovers_v1 (
 cutover_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cutover_code text NOT NULL UNIQUE,
 cutoff_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 target_table_count integer NOT NULL DEFAULT 0,
 existing_table_count integer NOT NULL DEFAULT 0,
 nonempty_table_count integer NOT NULL DEFAULT 0,
 isolated_row_count bigint NOT NULL DEFAULT 0,
 isolated_key_count bigint NOT NULL DEFAULT 0,
 created_by text NOT NULL DEFAULT CURRENT_USER,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE private.be_golive_readiness_cutovers_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.be_golive_readiness_cutovers_v1 FROM PUBLIC,anon,authenticated;
