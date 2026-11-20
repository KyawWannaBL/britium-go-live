# Hosted UAT catalog delta — 2026-11-20

Read-only catalog inventory of PostgreSQL ordinary/partitioned tables, views, materialized views and sequences in `public` and `private`. Source production `dltavabvjwocknkyvwgz` and target hosted UAT `hgijdyfwmvskchsruknp`. Names compared as `schema.relkind.relname`.

| Metric | Count |
| --- | ---: |
| Production objects | 1303 |
| Hosted UAT objects | 254 |
| Production objects absent in UAT | 1059 |
| UAT-only objects | 10 |

Absent from UAT by namespace and PostgreSQL relation kind:
- `public`: 813 ordinary tables, 99 views, 73 sequences
- `private`: 66 ordinary tables, 7 views, 1 sequence

## UAT-only objects — retain or reconcile explicitly

- `private.uat_branch_account_roster_20261116` (table)
- `public.role_permissions_2026_02_28_20_06` (table)
- `public.route_optimizations_2026_02_18_18_00` (table)
- `public.warehouse_manifest_items` (table)
- `public.warehouse_outbound_batches` (table)
- `public.warehouse_storage_events` (table)
- `public.warehouse_storage_locations` (table)
- `public.warehouse_storage_records` (table)
- `public.finance_cod_pending_v` (view)
- `public.finance_cod_reconciliation_v` (view)

**Important limitation:** These are *catalog presence* comparisons only. They do not prove compatible definitions for objects present in both databases. Function signatures, type definitions, dependencies, ownership, GRANTs, SECURITY DEFINER functions, row-level policies, triggers, and migration-history provenance must be reconciled separately before executing restoration SQL.

Hosted UAT pre-recovery backup was executed locally by the operator as `/f/Britium-UAT-Recovery/hosted-uat-complete.dump`; `pg_dump`, `pg_restore --list`, and `pg_restore --file` each returned exit code 0. This indicates readable backup, **not a tested restore**, and private files must not be committed or uploaded.

### Recovery gate

1. Preserve the 18 existing UAT users and 18 account-registry entries, and ten UAT-only relations.
2. Restore and inspect archive in an isolated rehearsal database and confirm user/account consistency.
3. Inventory and compare missing types/functions/security policies as well as 1059 relations; identify the minimal dependency-ordered additions.
4. Do not apply the full production `public_schema.sql` or `private_schema.sql` to hosted UAT: `CREATE OR REPLACE FUNCTION` and existing tables may conflict with UAT-specific definitions.
5. Validate additive delta against rehearsal, then hosted UAT, and run full workflow tests before any production release.

No remote schema/data modifications were made in this catalog comparison.
