-- Issue #308: UAT-only audit of changes already applied 2026-11-16.
-- Target hgijdyfwmvskchsruknp. NOT FOR PRODUCTION PROMOTION.
-- Unchecked SECURITY DEFINER functions allowed privileged changes:
-- (1) recreate audit triggers, (2) archive broadcasts,
-- (3) void cash vouchers, (4) deactivate delivery workers.
-- The former browser-client permissions were intentionally revoked.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.enable_audit_triggers_all_public_tables() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_archive_broadcast_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_archive_cash_voucher(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_archive_deliveryman(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;

SELECT p.proname,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
  'enable_audit_triggers_all_public_tables',
  'rpc_archive_broadcast_message',
  'rpc_archive_cash_voucher',
  'rpc_archive_deliveryman')
ORDER BY p.proname;
-- Expect 4 rows with both exec flags false.
