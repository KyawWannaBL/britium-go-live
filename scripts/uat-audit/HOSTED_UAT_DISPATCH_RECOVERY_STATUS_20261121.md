# Britium hosted UAT dispatch recovery — 2026-11-21

Target: hosted UAT `hgijdyfwmvskchsruknp`. Production `dltavabvjwocknkyvwgz` was not modified.

## Applied, verified
- `public.be_wayplan_dispatches`: existing staged structure, 37 columns, zero rows.
- Six missing tables staged from production metadata: `be_data_entry_parcel_details` (92 columns), `be_dispatch_scans_v39` (9), `be_superadmin_delegations_v65` (13), `be_wayplan_dispatch_stops` (62), `be_wayplan_membership_v40` (19), `be_wayplan_review_v43` (14).
- Table structures have production-matching columns, constraints, default expressions and indexes. RLS is enabled, and `anon` and `authenticated` cannot directly read or write them. Triggers and RLS policies have deliberately NOT been restored.
- Original six helper functions staged with EXECUTE revoked from PUBLIC/anon/authenticated: `be_current_role`, `be_branch_scope_v1`, `be_branch_department_scope_v1`, `be_branch_warehouse_scope_v1`, `be_branch_wayplan_allowed_v1`, `be_operational_way_id_v70`.
- `be_dispatch_command_snapshot_v63()` installed and hardened with active account + role + territory checks. Only `authenticated` has EXECUTE (not `anon`). Runs using SECURITY DEFINER with verified branch checks; underlying table grants remain closed.
- PostgREST notification `NOTIFY pgrst, 'reload schema'` requested on install.
- Transactional rollback rehearsal: two synthetic ISN/MDY wayplans, ISN/MDY branch manager isolation, ISN warehouse-staff isolation, Super Admin global access, and driver denial all passed. The authenticated PostgreSQL role also passed ISN branch filtering against temporary rows; all temporary rows rolled back.
- Post-checks: auth.users = 18; public.be_user_account_registry = 18; private.uat_branch_account_roster_20261116 = 16; dispatch and all six staged tables = 0 rows.
- `public.app_role` enum already has 37 identical labels/order in production and UAT; no enum DDL was applied.

## Security/release gates still open
1. Restore and inspect production triggers, RLS policies, GRANTs and any remaining operational dependencies for parcel registration, review/wayplan lifecycle, dispatch scanning, warehouse, rider and finance workflows.
2. Do not copy production's broad `USING (true)` authenticated policy to UAT. Review branch/rider scope explicitly.
3. Verify the browser UI invokes the UAT project and has refreshed its PostgREST function metadata. Database-level presence does not prove browser UX.
4. Conduct end-to-end UAT with isolated, synthetic data before production release.
5. Do not run the earlier create-table scripts again: they intentionally raise if the table is already present.

## Source and change files
- `scripts/uat-audit/uat-staged-snapshot-dependency-tables-20261121.sql`
- `scripts/uat-audit/uat-staged-dispatch-rpc-definitions-20261121.sql`
- `scripts/uat-audit/uat-enable-hardened-dispatch-snapshot-20261121.sql`

**Status:** Dispatch snapshot DB-level RPC and schema restored/secured in hosted UAT, but write workflows are **NOT** signed off. Production unchanged.
