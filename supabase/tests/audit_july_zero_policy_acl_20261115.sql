-- Britium Express, Issue #299: zero-policy table ACL/RLS parity audit.
-- READ ONLY, CURRENT PRODUCTION OBSERVATION, not a proposed permissions change.
-- The authenticated role can possess table-level privileges while RLS blocks rows
-- in the absence of policies. Privileged roles or SECURITY DEFINER can bypass RLS.
-- NEVER automatically GRANT/REVOKE or create blanket USING (true) policies here.
WITH targets(relname) AS (
 VALUES
 ('assignment_queue_2026_02_19_17_00'),
 ('branches'),('cod_collections'),('fleet_assets'),('fleet_telemetry'),
 ('routes'),('routes_2026_02_28_20_06'),
 ('shipment_assignment_rules_2026_02_19_17_00'),('support_tickets'),
 ('tariffs'),('user_branch_assignments'),('warehouses')
),
tables AS (
 SELECT t.relname,c.oid,c.relrowsecurity,c.relforcerowsecurity,
        pg_get_userbyid(c.relowner) AS table_owner
 FROM targets t
 LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.relname
      AND c.relkind IN ('r','p')
)
SELECT relname,oid IS NOT NULL AS table_exists,table_owner,
       relrowsecurity AS rls_enabled,
       relforcerowsecurity AS force_rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=tbl.oid) AS policy_count,
       CASE WHEN oid IS NOT NULL THEN has_table_privilege('anon',oid,'SELECT') END AS anon_select,
       CASE WHEN oid IS NOT NULL THEN has_table_privilege('authenticated',oid,'SELECT') END AS authenticated_select,
       CASE WHEN oid IS NOT NULL THEN has_table_privilege('authenticated',oid,'INSERT') END AS authenticated_insert,
       CASE WHEN oid IS NOT NULL THEN has_table_privilege('authenticated',oid,'UPDATE') END AS authenticated_update,
       CASE WHEN oid IS NOT NULL THEN has_table_privilege('authenticated',oid,'DELETE') END AS authenticated_delete
FROM tables tbl ORDER BY relname;
