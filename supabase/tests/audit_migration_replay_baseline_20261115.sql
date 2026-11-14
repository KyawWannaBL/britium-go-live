-- Britium Express: Issue #299 - non-destructive Supabase migration replay audit
-- Read-only; safe on production. No history mutation, no parcel or Finance writes.
-- Findings must be compared with a disposable branch.
WITH migration_summary AS (
  SELECT version,name,coalesce(cardinality(statements),0) AS statement_count,
         coalesce(length(array_to_string(statements,E'\n')),0) AS bytes
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260412000000','20260721093501')
)
SELECT * FROM migration_summary ORDER BY version;

-- Inspect extension version / member ownership and available versions.
SELECT e.extname,e.extversion,n.nspname AS installed_schema,
       to_regprocedure('public._quote_ident_like(text,text)') IS NOT NULL AS old_helper_present
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgtap';

SELECT name,version,installed
FROM pg_available_extension_versions WHERE name='pgtap' ORDER BY version;

-- Audit historical function grants without equivalent explicit CREATE in the April snapshot.
-- Names are compared separately from overloaded signatures; review full definitions before any correction.
WITH source AS (
 SELECT ord,stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
 WHERE m.version='20260412000000'
), grant_names AS (
 SELECT DISTINCT (regexp_match(stmt,'GRANT ALL ON FUNCTION "public"\\."([^"]+)"'))[1] AS fn
 FROM source WHERE stmt LIKE 'GRANT ALL ON FUNCTION "public".%'
), created AS (
 SELECT DISTINCT (regexp_match(stmt,'(?:CREATE|REPLACE) (?:OR REPLACE )?FUNCTION "public"\\."([^"]+)"','i'))[1] AS fn
 FROM source WHERE stmt ILIKE '%FUNCTION "public".%'
), orphan_names AS (
 SELECT g.fn FROM grant_names g WHERE NOT EXISTS
 (SELECT 1 FROM created c WHERE c.fn=g.fn)
)
SELECT count(*) AS grant_names_without_explicit_create,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace
         JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid
           AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
         JOIN pg_extension e ON e.oid=d.refobjid
         WHERE n.nspname='public' AND p.proname=o.fn AND e.extname='pgtap'
       )) AS names_owned_by_pgtap
FROM orphan_names o;

-- Read-only July duplicate-type evidence. Do not delete the July migration wholesale.
SELECT ord,left(stmt,220) AS statement_preview
FROM supabase_migrations.schema_migrations m
CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
WHERE m.version='20260721093501' AND ord BETWEEN 1 AND 6 ORDER BY ord;

-- Snapshot live schema object counts for comparison with disposable branch.
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m')) AS relations,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private')) AS routines,
       (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' AND t.typtype='e') AS enums;
