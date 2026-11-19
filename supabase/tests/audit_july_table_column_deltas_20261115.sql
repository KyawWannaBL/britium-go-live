-- Britium Express / #299
-- July 2026 table COLUMN-NAME screening, derived from recorded migration SQL.
-- READ ONLY. Regex-based text classification ONLY; not a parsed PostgreSQL AST,
-- not a substitute for comparing pg_attribute/pg_constraint/pg_depend in a pre-July DB.
-- NEVER generate DROP COLUMN or ALTER TABLE from the output without human review.
WITH early AS (
 SELECT
   (regexp_match(stmt,'(?i)^CREATE TABLE(?: IF NOT EXISTS)? "public"\."([^"]+)"'))[1] AS tbl,
   stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version < '20260721093501'
   AND stmt ~* '^create table(?: if not exists)? "public"\.'
),
july AS (
 SELECT
   (regexp_match(stmt,'(?i)^CREATE TABLE "public"\."([^"]+)"'))[1] AS tbl,
   stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version='20260721093501'
   AND stmt ~* '^create table "public"\.'
),
paired AS (
 SELECT e.tbl,e.stmt AS early_sql,j.stmt AS july_sql
 FROM early e JOIN july j USING(tbl)
),
early_columns AS (
 SELECT tbl,m[1] AS column_name,
        lower(regexp_replace(trim(m[2]),'[[:space:]]+',' ','g')) AS definition
 FROM paired
 CROSS JOIN LATERAL
 regexp_matches(early_sql,'(?m)^\s*"([^"]+)"\s+([^,\r\n]+)','g') m
),
july_columns AS (
 SELECT tbl,m[1] AS column_name,
        lower(regexp_replace(trim(m[2]),'[[:space:]]+',' ','g')) AS definition
 FROM paired
 CROSS JOIN LATERAL
 regexp_matches(july_sql,'(?m)^\s*"([^"]+)"\s+([^,\r\n]+)','g') m
),
differences AS (
 SELECT coalesce(e.tbl,j.tbl) AS table_name,
        coalesce(e.column_name,j.column_name) AS column_name,
        CASE
          WHEN e.column_name IS NULL THEN 'ADDED_IN_JULY_TEXT'
          WHEN j.column_name IS NULL THEN 'MISSING_IN_JULY_TEXT'
          WHEN regexp_replace(e.definition,'"','','g') <>
               regexp_replace(j.definition,'"','','g')
               THEN 'DEFINITION_DIFFERS_TEXT'
          ELSE 'SAME_SIMPLE_TEXT'
        END AS comparison,
        e.definition AS early_definition,
        j.definition AS july_definition
 FROM early_columns e
 FULL JOIN july_columns j
   ON e.tbl=j.tbl AND e.column_name=j.column_name
)
SELECT comparison,
       count(*) AS parsed_column_entries,
       count(distinct table_name) AS affected_tables
FROM differences
GROUP BY comparison ORDER BY comparison;

-- Detailed review: uncomment when comparing differences individually.
-- SELECT * FROM differences WHERE comparison <> 'SAME_SIMPLE_TEXT'
-- ORDER BY table_name,column_name;
