-- Issue #299: July snapshot advanced structural overlap audit
-- READ ONLY: does not modify production schema, history, operational records or ACL.
-- IMPORTANT: name-level matches are not equivalent to verified column/function signature parity.

WITH prior AS (
 SELECT version, stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE version < '20260721093501'
),
july AS (
 SELECT ord, stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
 WHERE version = '20260721093501'
),
before_funcs AS (
 SELECT DISTINCT coalesce(
   (regexp_match(stmt,'(?i)^create\s+(?:or\s+replace\s+)?function\s+(?:"public"\.|public\.)(?:"([^"]+)"|([a-z0-9_]+))\s*\('))[1],
   (regexp_match(stmt,'(?i)^create\s+(?:or\s+replace\s+)?function\s+(?:"public"\.|public\.)(?:"([^"]+)"|([a-z0-9_]+))\s*\('))[2]
 ) AS function_name FROM prior
 WHERE stmt ~* '^create\s+(or\s+replace\s+)?function\s+(public\.|"public"\.)'
),
july_funcs AS (
 SELECT ord, coalesce(
   (regexp_match(stmt,'(?i)^create\s+(?:or\s+replace\s+)?function\s+(?:"public"\.|public\.)(?:"([^"]+)"|([a-z0-9_]+))\s*\('))[1],
   (regexp_match(stmt,'(?i)^create\s+(?:or\s+replace\s+)?function\s+(?:"public"\.|public\.)(?:"([^"]+)"|([a-z0-9_]+))\s*\('))[2]
 ) AS function_name FROM july
 WHERE stmt ~* '^create\s+(or\s+replace\s+)?function\s+(public\.|"public"\.)'
)
SELECT count(*) AS july_create_function_statements,
       count(*) FILTER(WHERE p.function_name IS NOT NULL) AS same_name_in_prior_sql,
       count(*) FILTER(WHERE p.function_name IS NULL) AS no_prior_name_match
FROM july_funcs j LEFT JOIN before_funcs p USING(function_name);

-- Detect July CREATE TYPE statements by type name. This does not compare historical definitions.
WITH previous AS (
 SELECT DISTINCT (regexp_match(stmt,'(?i)^create\s+type\s+"public"\."([^"]+)"'))[1] name
 FROM supabase_migrations.schema_migrations m CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE version < '20260721093501' AND stmt ~* '^create\s+type\s+"public"\.'
), july AS (
 SELECT ord,(regexp_match(stmt,'(?i)^create\s+type\s+"public"\."([^"]+)"'))[1] name
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
 WHERE version='20260721093501' AND stmt ~* '^create\s+type\s+"public"\.'
)
SELECT j.ord,j.name,(p.name IS NOT NULL) AS already_defined_in_prior_sql
FROM july j LEFT JOIN previous p USING(name) ORDER BY j.ord;

-- Critical: compare current production enum labels to the July snapshot source separately.
-- Changes after July may legitimately alter the labels.
SELECT n.nspname,t.typname,
       string_agg(e.enumlabel,', ' ORDER BY e.enumsortorder) AS current_labels
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname='public'
GROUP BY n.nspname,t.typname ORDER BY t.typname;
