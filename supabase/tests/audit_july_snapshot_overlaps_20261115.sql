-- Britium Express - Issue #299 July snapshot classification (READ ONLY)
-- Compare SQL statements from versions before 20260721093501 against July snapshot.
-- An overlapping name is NOT proof of identical structure; requires schema diff and dependency audit.
-- Never execute a rewritten July snapshot in Production without fresh-branch verification.
WITH before_july AS (
 SELECT m.version,t.stmt
 FROM supabase_migrations.schema_migrations AS m
 CROSS JOIN LATERAL unnest(m.statements) AS t(stmt)
 WHERE m.version<'20260721093501'
),
july AS (
 SELECT t.ord,t.stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY AS t(stmt,ord)
 WHERE m.version='20260721093501'
),
prior_objects AS (
 SELECT DISTINCT
 CASE
 WHEN stmt ~* '^create\s+type\s+"public"\.' THEN 'TYPE'
 WHEN stmt ~* '^create\s+table\s+(if\s+not\s+exists\s+)?"public"\.' THEN 'TABLE'
 END kind,
 (regexp_match(stmt,'(?i)^create\s+(?:type|table)\s+(?:if\s+not\s+exists\s+)?"public"\."([^"]+)"'))[1] object_name
 FROM before_july
 WHERE stmt ~* '^create\s+(type|table)'
),
july_objects AS (
 SELECT ord,stmt,
 CASE
 WHEN stmt ~* '^create\s+type\s+"public"\.' THEN 'TYPE'
 WHEN stmt ~* '^create\s+table\s+"public"\.' THEN 'TABLE'
 END kind,
 (regexp_match(stmt,'(?i)^create\s+(?:type|table)\s+(?:if\s+not\s+exists\s+)?"public"\."([^"]+)"'))[1] object_name
 FROM july
 WHERE stmt ~* '^create\s+(type|table)'
)
SELECT j.kind,
 count(*) total_july_definitions,
 count(*) FILTER (WHERE p.object_name IS NOT NULL) named_in_earlier_migrations,
 count(*) FILTER (WHERE p.object_name IS NULL) not_named_in_earlier_migrations
FROM july_objects j
LEFT JOIN prior_objects p ON p.kind=j.kind AND p.object_name=j.object_name
WHERE j.kind IS NOT NULL
GROUP BY j.kind ORDER BY j.kind;

-- Individually inspect all July enum definitions and the live matching types.
WITH july_types AS (
 SELECT ord, (regexp_match(stmt,'(?i)^create\s+type\s+"public"\."([^"]+)"'))[1] AS object_name,
        stmt AS original_create_statement
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
 WHERE m.version='20260721093501' AND stmt ~* '^create\s+type\s+"public"\.'
)
SELECT j.ord,j.object_name,
  to_regtype(format('public.%I',j.object_name)) IS NOT NULL AS exists_in_current_production,
  left(j.original_create_statement,400) AS sql_preview
FROM july_types j ORDER BY ord;

-- Look for broad July schema patterns; this summarizes but does not perform a repair.
WITH july AS (
 SELECT stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version='20260721093501'
)
SELECT
 count(*) total_statements,
 count(*) FILTER(WHERE stmt ~* '^create\s+table') create_tables,
 count(*) FILTER(WHERE stmt ~* '^create\s+(or\s+replace\s+)?function') create_functions,
 count(*) FILTER(WHERE stmt ~* '^create\s+policy') create_policies,
 count(*) FILTER(WHERE stmt ~* '^grant') grants,
 count(*) FILTER(WHERE stmt ~* '^alter\s+table') alter_tables
FROM july;
