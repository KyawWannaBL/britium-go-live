-- Issue #299: compare July enum definitions with pre-July recorded definitions.
-- READ ONLY. This generates candidate ALTER TYPE statements; it does not execute them.
-- The generated SQL is intended for an ISOLATED replay plan only.
WITH prior AS (
 SELECT stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE version < '20260721093501'
   AND stmt ~* '^create type "public"\.'
), july AS (
 SELECT stmt FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) t(stmt)
 WHERE version='20260721093501'
   AND stmt ~* '^create type "public"\.'
), b AS (
 SELECT (regexp_match(stmt,'(?i)^create type "public"\."([^"]+)"'))[1] AS typ,
        ARRAY(SELECT x[1] FROM regexp_matches(stmt,'''([^'']+)''','g') x) AS labels
 FROM prior
), j AS (
 SELECT (regexp_match(stmt,'(?i)^create type "public"\."([^"]+)"'))[1] AS typ,
        ARRAY(SELECT x[1] FROM regexp_matches(stmt,'''([^'']+)''','g') x) AS labels
 FROM july
), review AS (
 SELECT j.typ, b.labels AS previous_labels, j.labels AS july_labels,
        b.typ IS NOT NULL AS exists_before_july,
        (b.labels = j.labels) AS same_ordered_labels,
        (b.labels = j.labels[1:cardinality(b.labels)]) AS previous_is_exact_prefix,
        cardinality(b.labels) AS previous_count
 FROM j LEFT JOIN b USING (typ)
)
SELECT typ, exists_before_july, same_ordered_labels, previous_is_exact_prefix,
       ARRAY(
         SELECT u.label FROM unnest(july_labels) WITH ORDINALITY u(label,position)
         WHERE position > COALESCE(previous_count,0) ORDER BY position
       ) AS appended_values,
       CASE
         WHEN NOT exists_before_july
           THEN 'NEW_TYPE_REVIEW_DEFINITION'
         WHEN same_ordered_labels
           THEN 'IDENTICAL_DUPLICATE_CREATION'
         WHEN previous_is_exact_prefix
           THEN 'APPEND_ONLY_REQUIRES_PRELUDE_MIGRATION'
         ELSE 'UNSAFE_NON_ADDITIVE_CHANGE_MANUAL_REVIEW'
       END AS classification,
       CASE WHEN exists_before_july AND previous_is_exact_prefix
                 AND NOT same_ordered_labels THEN
         (SELECT string_agg(
             format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L;',
                    typ,u.label),E'\n' ORDER BY u.position)
          FROM unnest(july_labels) WITH ORDINALITY u(label,position)
          WHERE u.position > previous_count)
       ELSE NULL END AS generated_candidate_sql
FROM review ORDER BY typ;
