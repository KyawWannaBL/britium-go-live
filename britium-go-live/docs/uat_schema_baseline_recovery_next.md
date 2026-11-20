# Britium Express — Recovering the UAT schema baseline safely

Verified 2026-11-20:
- Production project: `dltavabvjwocknkyvwgz`.
- Isolated Mandalay/Insein UAT branch: `hgijdyfwmvskchsruknp`, status `MIGRATIONS_FAILED`.
- UAT: 30 recorded migrations; all ten critical operational tables tested were missing.
- Production: those ten critical objects exist.
- Existing `supabase/migrations/20260721093501_remote_schema.sql` in main is EMPTY.
- Rebase logs show `type "app_role" already exists`; the UAT enum is in active use.
- A fresh rehearsal branch requested through the API was stopped for cost confirmation.

## A. Read-only before any operation
Run `sql/diagnostics/uat_operational_schema_gap_v1.sql` on BOTH databases and save results separately.
Do not modify `supabase_migrations.schema_migrations` or drop `app_role`.

## B. Capture an authoritative schema-only baseline from production

On your trusted workstation, from the Britium repository, with Supabase CLI installed:

```bash
supabase --version
supabase db dump --help
supabase migration list --remote=dltavabvjwocknkyvwgz
mkdir -p local-recovery
supabase db dump --remote=dltavabvjwocknkyvwgz --schema public,private -f local-recovery/production_schema_only.sql
```

**Important**: The command above is a schema-only export, NOT parcel-data copy and NOT a migration to execute against existing UAT. Current CLI supports `--remote` with an explicit project reference; check actual `--help` for local CLI version before running.
Store the output in a secured local directory and review any function bodies, owner grants, RLS and security-definer permissions before sharing. Do not commit an unreviewed production schema dump into a public repository.

Managed Supabase auth/storage customizations may require a separately reviewed export; do not overwrite those schemas blindly. Avoid copying production Auth user data.

## C. Rehearse against a NEW isolated database only
After explicit cost approval, provision a fresh isolated schema-only rehearsal target. Restore the reviewed baseline with the supported Supabase CLI/migration workflow; confirm extensions, roles, tables, functions, RLS, triggers and grants. Do NOT run the schema-only dump against the already-partial UAT.

Compare source vs target against the read-only audit. Confirm Warehouse, Finance, Wayplan, Rider, branch and CS functions before running any transfer SQL.

## D. Resolve migration-history collision on a clean environment
Find the actual duplicate `CREATE TYPE app_role` statement in the available migration files or generated baseline. Reconcile the migration ordering and baseline according to *actual schema state*. Never mark a migration applied merely to skip a failure.

Do not replay the empty `20260721093501_remote_schema.sql` as if it contained the missing objects.

## E. Third-party feature test
Only after baseline UAT is complete: run `sql/candidates/10_provider_transfer_install_UAT_only.sql` in isolated UAT. Keep capability flags OFF until signed physical-site verification and successful Supervisor, physical dispatch, provider custody, customer delivery/return/RTO and COD checks. See `docs/provider_transfer_sql_execution_order.md`.

## Go / no-go
No release or data changes until the clean schema rehearsal and security test pass.
