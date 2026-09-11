ADMIN/HR LEGACY RPC LOCKDOWN V56.1
Build: ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31

Purpose
-------
The production preflight confirmed that PUBLIC, anon, and authenticated users could execute four SECURITY DEFINER employee mutation RPCs. Those functions accept a client-supplied actor email and contain no explicit authenticated-role authorization check.

This migration:
- backs up the current definitions of the four mutation RPCs and the read-only snapshot;
- revokes mutation execution from PUBLIC, anon, and authenticated;
- preserves mutation execution for service_role when that role exists;
- revokes anonymous/public access to the HR snapshot;
- preserves snapshot execution for authenticated and service_role.

Run order
---------
1. Run 20260731_admin_hr_legacy_rpc_lockdown_v56_1.sql
2. Run verify_admin_hr_legacy_rpc_lockdown_v56_1.sql

Required verifier outcome
-------------------------
- backup_rows = 5
- every mutation execute flag for public/anon/authenticated = false
- snapshot_public_execute = false
- snapshot_anon_execute = false
- snapshot_authenticated_execute = true
- service_role_mutation_execute = true (or null only if service_role does not exist)

Do not re-grant these legacy mutation functions to authenticated or anon. New HR mutations must use secured RPCs that resolve the actor from auth.uid(), enforce HR/admin permissions, and write audit/history atomically.
