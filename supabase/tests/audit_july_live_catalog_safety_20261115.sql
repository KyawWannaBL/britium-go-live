-- BRITIUM EXPRESS | ISSUE #299
-- Read-only pg_catalog safety inventory for the 29 table-name overlaps
-- identified by historical April-vs-July CREATE TABLE column-text comparison.
-- No operational-table reads, no DDL, no migration-history mutations.
-- RLS enabled alone does NOT prove policy correctness.
WITH early AS (
 SELECT (regexp_match(stmt,'(?i)^CREATE TABLE(?: IF NOT EXISTS)? "public"\."([^"]+)"'))[1] AS table_name,stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version < '20260721093501'
   AND stmt ~* '^create table(?: if not exists)? "public"\.'
),
july AS (
 SELECT (regexp_match(stmt,'(?i)^CREATE TABLE "public"\."([^"]+)"'))[1] AS table_name,stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version = '20260721093501'
   AND stmt ~* '^create table "public"\.'
),
paired AS (
 SELECT e.table_name,e.stmt early_sql,j.stmt july_sql
 FROM early e JOIN july j USING(table_name)
),
early_cols AS (
 SELECT DISTINCT table_name,m[1] col
 FROM paired
 CROSS JOIN LATERAL regexp_matches(early_sql,'(?m)^\s*"([^"]+)"\s+([^,\r\n]+)','g') m
),
july_cols AS (
 SELECT DISTINCT table_name,m[1] col
 FROM paired
 CROSS JOIN LATERAL regexp_matches(july_sql,'(?m)^\s*"([^"]+)"\s+([^,\r\n]+)','g') m
),
diff AS (
 SELECT coalesce(e.table_name,j.table_name) tbl,
        CASE WHEN e.col IS NULL THEN 'july_only'
             WHEN j.col IS NULL THEN 'earlier_only' END kind
 FROM early_cols e FULL JOIN july_cols j USING(table_name,col)
 WHERE e.col IS NULL OR j.col IS NULL
),
summ AS (
 SELECT tbl,count(*) FILTER(WHERE kind='july_only') july_only,
        count(*) FILTER(WHERE kind='earlier_only') earlier_only
 FROM diff GROUP BY tbl
),
live AS (
 SELECT s.*,c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM summ s
 LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid
     AND c.relname=s.tbl AND c.relkind IN ('r','p')
)
SELECT tbl AS table_name,july_only,earlier_only,
       oid IS NOT NULL AS currently_exists,
       relrowsecurity AS rls_enabled,
       relforcerowsecurity AS force_rls,
       (SELECT count(*) FROM pg_attribute a WHERE a.attrelid=live.oid
         AND a.attnum>0 AND NOT a.attisdropped) AS current_columns,
       (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=live.oid)
         AS current_constraints,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=live.oid)
         AS current_policies,
       (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid=live.oid
         AND NOT g.tgisinternal) AS current_user_triggers
FROM live
ORDER BY july_only+earlier_only DESC,tbl;
