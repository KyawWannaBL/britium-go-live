-- Issue #308: 2026-11-16 completed isolated UAT security correction.
-- Already applied and independently verified in hgijdyfwmvskchsruknp.
-- Historical operational note only: do not apply to production.
BEGIN;
ALTER VIEW public.app_identities SET (security_invoker = true);
ALTER VIEW public.dup_public_users_email_v SET (security_invoker = true);
ALTER VIEW public.finance_cod_pending_v SET (security_invoker = true);
ALTER VIEW public.finance_cod_reconciliation_v SET (security_invoker = true);
ALTER VIEW public.rpt_merchants SET (security_invoker = true);

REVOKE ALL ON TABLE
  public.app_identities,
  public.dup_public_users_email_v,
  public.finance_cod_pending_v,
  public.finance_cod_reconciliation_v,
  public.rpt_merchants
FROM PUBLIC, anon, authenticated;
COMMIT;

-- Verification: expect 5 rows, all true invoker, both select flags false.
SELECT c.relname,
       c.reloptions @> ARRAY['security_invoker=true']::text[] AS is_security_invoker,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = ANY(ARRAY[
    'app_identities', 'dup_public_users_email_v', 'finance_cod_pending_v',
    'finance_cod_reconciliation_v', 'rpt_merchants'
  ])
ORDER BY c.relname;
-- Until reviewed branch-scoped policies are deployed, these views remain
-- inaccessible from the browser. This is intentionally fail-closed.
