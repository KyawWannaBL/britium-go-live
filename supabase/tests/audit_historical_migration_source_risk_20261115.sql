-- Issue #299: historical statement recovery risk inventory.
-- READ ONLY. Aggregate counts only; intentionally does not emit SQL bodies,
-- literals, credentials, user records, or function source code.
-- Heuristic matches are review flags, not proven secrets or destructive behavior.
WITH statements AS (
 SELECT m.version,u.ord,u.stmt
 FROM supabase_migrations.schema_migrations m
 CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY u(stmt,ord)
 WHERE m.version IN ('20260412000000','20260721093501')
),
classified AS (
 SELECT version,ord,length(stmt) AS sql_characters,
  stmt ~* '\m(create\s+or\s+replace\s+function|create\s+function|security\s+definer)\M' AS privileged_function_candidate,
  stmt ~* '\m(password|secret|token|api_key|apikey|private_key|credential)\M' AS sensitive_keyword,
  stmt ~* '(^|\s)(insert\s+into|update\s+|delete\s+from|copy\s+|create\s+role|alter\s+role|set\s+role)(\s|$)' AS data_or_role_operation,
  stmt ~* '\m(drop\s+(table|function|type|schema|extension)|truncate|alter\s+table.+drop)\M' AS destructive_candidate,
  stmt ~* '\m(grant|revoke)\M' AS privilege_candidate
 FROM statements
)
SELECT version,
       count(*) AS total_statements,
       sum(sql_characters) AS total_sql_characters,
       max(sql_characters) AS max_statement_characters,
       count(*) FILTER(WHERE privileged_function_candidate) AS privileged_function_candidate,
       count(*) FILTER(WHERE sensitive_keyword) AS sensitive_keyword,
       count(*) FILTER(WHERE data_or_role_operation) AS data_or_role_operation,
       count(*) FILTER(WHERE destructive_candidate) AS destructive_candidate,
       count(*) FILTER(WHERE privilege_candidate) AS privilege_candidate
FROM classified
GROUP BY version ORDER BY version;
