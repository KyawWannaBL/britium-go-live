# Hosted UAT recovery — verified migration and operational dependency gap

Date: 2026-11-20. Read-only Supabase MCP comparisons between production `dltavabvjwocknkyvwgz` and hosted UAT `hgijdyfwmvskchsruknp`.

## Migration history

| Comparison | Count |
| --- | ---: |
| Production migration versions | 505 |
| Hosted UAT migration versions | 30 |
| Versions present in both | 24 |
| Production versions absent in hosted UAT | **481** |
| Hosted UAT versions absent in production | **6** |
| Shared-version name mismatches | **0** |

First missing production migration: `20260721093501_remote_schema`.

**Hosted UAT-only migrations (preserve and inspect, not blindly replay):**
- `20261115200316_uat_restore_quote_ident_like_dependency`
- `20261115201408_uat_secure_approval_and_branch_directory_reads_v1`
- `20261115201526_uat_profile_column_privilege_hardening_v1`
- `20261119183133_uat_branch_login_registry_territory_v1`
- `20261119184035_uat_superadmin_global_access_v1`
- `20261119184936_uat_sai_superadmin_global_access_v1`

## Required application-object inventory

Read-only catalog checks of 25 targeted public application objects found **24 present in production but missing in hosted UAT**. The one currently present in hosted UAT is `public.be_user_account_registry`.

Missing hosted UAT **tables (14)**:
- `be_branch_intake_manifests_v1`
- `be_branch_intake_parcels_v1`
- `be_branch_offices`
- `be_branch_user_provisioning_requests`
- `be_data_entry_financial_v2_runtime_v58`
- `be_data_entry_parcel_details`
- `be_delivery_finance_outbox_v1`
- `be_dispatch_scans_v39`
- `be_merchant_master`
- `be_parcel_tariffs_v2`
- `be_warehouse_return_scans_v39`
- `be_waybill_ledger`
- `be_wayplan_dispatch_stops`
- `be_wayplan_dispatches`

Missing hosted UAT **functions (10)**:
- `be_branch_account_request_v1`
- `be_branch_intake_snapshot_v1`
- `be_branch_team_directory_v1`
- `be_cs_parcel_support_queue`
- `be_cs_thirdparty_queue_v1`
- `be_data_entry_financial_v2_schema`
- `be_get_merchants_dropdown`
- `be_role_dashboard_v1`
- `be_warehouse_scan_lifecycle_snapshot_v164`
- `be_warehouse_scan_lifecycle_snapshot_v211`

This is a targeted sample only, not an exhaustive schema diff. Other tables, sequences, triggers, indexes, extensions, views, functions, grants and RLS policies also need inventory. **A function's presence does not prove its access or behavior is correct.**

## Preservation and implementation gates

Hosted UAT contains **18 auth users and 18 registered accounts**, and has **244 public ordinary tables, seven public views and 1,248 public functions**. Do not reset, delete, or overwrite it based on an assumption that `with_data=false` means empty.

The passing local GitHub Actions #174 uses a **disposable reconstruction baseline** and generated CI-only adjustments. It establishes a useful dependency-compatibility milestone but is **not** authoritative historical provenance or a hosted-UAT operational pass.

**Next implementation requirements:**
1. Produce a recoverable full UAT backup and verify that the existing 18 accounts survive a restore rehearsal.
2. Audit object definitions, dependencies, sequences, schema ownership, RLS and grants, and reconcile the six UAT-only migration records before writing migrations.
3. Reconstruct a non-destructive schema-delta migration plan, preferably against a copy of UAT. Do not mark the 481 versions as applied without recreating the actual schema.
4. Validate the exact schema changes, migration provenance, and authenticated UAT workflows before hosted deployment.
5. Only after UAT acceptance, consider production deployment.

**Do not run the full eight-RPC SQL now**: the target core tables are absent.

## Read-only SQL for branch preflight

```sql
SELECT count(*) AS migration_count, max(version) AS max_version
FROM supabase_migrations.schema_migrations;

SELECT to_regclass('public.be_data_entry_parcel_details') AS parcels,
       to_regclass('public.be_waybill_ledger') AS waybills,
       to_regclass('public.be_branch_offices') AS branch_offices,
       to_regprocedure('public.be_role_dashboard_v1()') AS dashboard;

SELECT (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.be_user_account_registry) AS accounts;
```

No remote schema/data mutations were performed during this gap audit.
