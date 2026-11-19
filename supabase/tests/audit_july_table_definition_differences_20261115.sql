-- Issue #299: identify overlapping July CREATE TABLE names that require structural review.
-- READ ONLY: textual differences do not establish schema incompatibility.
WITH earlier AS (
 SELECT m.version,t.stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE m.version<'20260721093501'
),
july AS (
 SELECT t.ord,t.stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY t(stmt,ord)
 WHERE m.version='20260721093501'
),
e AS (
 SELECT version,stmt,(regexp_match(stmt,'(?i)^create table(?: if not exists)? "public"\."([^"]+)"'))[1] AS object_name
 FROM earlier WHERE stmt ~* '^create table(?: if not exists)? "public"\.'
),
j AS (
 SELECT ord,stmt,(regexp_match(stmt,'(?i)^create table "public"\."([^"]+)"'))[1] AS object_name
 FROM july WHERE stmt ~* '^create table "public"\.'
)
SELECT j.object_name,e.version AS earlier_version,j.ord AS july_statement,
       md5(e.stmt) AS earlier_sql_hash,md5(j.stmt) AS july_sql_hash,
       left(e.stmt,250) AS earlier_sql_preview,left(j.stmt,250) AS july_sql_preview
FROM j JOIN e USING(object_name)
WHERE regexp_replace(regexp_replace(lower(e.stmt),'if not exists','','g'),'[[:space:]]+','','g')
   <> regexp_replace(regexp_replace(lower(j.stmt),'if not exists','','g'),'[[:space:]]+','','g')
ORDER BY j.object_name,e.version;
