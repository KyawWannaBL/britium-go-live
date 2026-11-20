# Hosted Mandalay / Insein UAT recovery assessment — 2026-11-20

## Scope and evidence

Read-only catalog checks performed against Supabase production `dltavabvjwocknkyvwgz` and existing hosted UAT `hgijdyfwmvskchsruknp`. All observations are time-specific; refresh before mutation.

- CI workflow #174 (`44718943919`), commit `99111e8`, **passed** disposable July-snapshot-first replay and application-object checks. CI includes generated schema fixtures and targeted historical assertion exceptions. It is **not** a clean original historical replay.
- Production database: **505** records in `supabase_migrations.schema_migrations`, last recorded version `20261116154736`. Core operational parcel, waybill, branch tables and Dashboard/branch snapshot RPCs exist.
- Hosted UAT database: **30** recorded migrations, last recorded version `20261119184936`; six November 15/19 UAT-specific records are outside the production history. Most operational migrations are absent.
- Hosted UAT still reports `MIGRATIONS_FAILED` even though its preview project infrastructure reports `ACTIVE_HEALTHY`.
- Hosted UAT: `public` has **244** ordinary tables, **7** views and **1248** functions; `private` has **2** ordinary tables. `auth.users` has **18** rows, `public.be_user_account_registry` has **18** rows, and `storage.objects` has **0**.
- Hosted UAT core objects currently absent: `public.be_data_entry_parcel_details`, `public.be_waybill_ledger`, `public.be_branch_offices`, `public.be_role_dashboard_v1()`, `public.be_branch_intake_snapshot_v1(text)`.

## Safety controls

1. **DO NOT reset or delete hosted UAT.** Existing auth users and branch account setup must be preserved. `with_data=false` at creation does **not** imply an empty database now.
2. **DO NOT run the eight-RPC restoration script** against production or current hosted UAT. The script cannot replace the missing core schema; its preflight intentionally blocks unsafe use.
3. **DO NOT copy all 505 migration history entries** into hosted UAT by editing `supabase_migrations`. A history marker does not create the corresponding objects.
4. **DO NOT bulk overwrite the 1248 existing UAT functions**, disable RLS, or fabricate warehouse/finance data.
5. Before any hosted write: obtain a recoverable database backup; inventory UAT-only migrations and function bodies; compare exact DDL and schema ownership with production; confirm the target project ref; prepare reversible, dependency-ordered, reviewed migrations.
6. Rehearse the same non-destructive delta against a **copy of hosted UAT with the 18 user/account rows appropriately protected**. Validate RLS, login, and branch territory boundaries as well as operational tables.
7. Deploy repaired migrations to hosted UAT **only after** rehearsal; verify branch sign-in, inbound intake, waybill generation, warehouse/dispatch scan, wayplan, rider evidence, third-party/Royal and gate-drop custody, Finance, and RTO.
8. Production release only after hosted UAT functional acceptance. CI #174 is a schema-object milestone, not go-live sign-off.

## Concrete next engineering deliverables

- A production-versus-hosted schema dependency manifest for every missing operational table, view, type, index, trigger and RPC, including source migration file, expected version and PostgreSQL ownership/grants.
- A version-mapping and conflict audit of all 30 UAT history entries against the 505 production records (particularly November 15/19 UAT-only migrations).
- Backup/recovery evidence for the existing 18 UAT users before branch rebuild or schema merge.
- A staged, additive hosted UAT migration set that preserves pre-existing branch accounts, does not duplicate enumerated types, and has automated verification/rollback tests.
- Evidence of real authenticated application workflow tests (not just function-presence assertions).

## Read-only verification

```sql
SELECT count(*) AS migration_rows, max(version) AS newest_version
FROM supabase_migrations.schema_migrations;

SELECT to_regclass('public.be_data_entry_parcel_details') AS parcels,
       to_regclass('public.be_waybill_ledger') AS waybills,
       to_regclass('public.be_branch_offices') AS branches,
       to_regprocedure('public.be_role_dashboard_v1()') AS dashboard;

SELECT (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.be_user_account_registry) AS account_registry_rows,
       (SELECT count(*) FROM storage.objects) AS storage_objects;
```

No production or hosted UAT schema changes were made as part of this assessment.
