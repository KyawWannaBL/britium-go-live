-- Issue #299: ordered SHA-256 fingerprint of historical migration statements.
-- READ ONLY. Returns no SQL bodies, function definitions, literals or operational data.
-- This fingerprint can verify a privately exported ordered JSON array of statement strings.
-- DO NOT use this as proof of safe replay, schema equivalence or data sanitization.
WITH sources AS (
 SELECT m.version, u.ord, u.stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY u(stmt,ord)
 WHERE m.version IN ('20260412000000','20260721093501')
), fingerprints AS (
 SELECT version,ord,
        encode(sha256(convert_to(stmt,'UTF8')),'hex') AS statement_sha256
 FROM sources
)
SELECT version,count(*) AS statement_count,
       encode(sha256(convert_to(
         string_agg(statement_sha256,'' ORDER BY ord),'UTF8'
       )),'hex') AS ordered_statement_fingerprint
FROM fingerprints
GROUP BY version ORDER BY version;
