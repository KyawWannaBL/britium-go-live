# UAT migration recovery — issue #308

**Scope:** isolated Mandalay + Insein UAT only. **Do not merge this audit-only branch to production or use it as an automatic Supabase preview deployment.**

## Verified cause
- Preview branch `hgijdyfwmvskchsruknp` reports `MIGRATIONS_FAILED`.
- Supabase workflow showed `42883` (`public._quote_ident_like(text,text)` missing), followed by `42710` (`public.app_role` already exists).
- Production's `supabase_migrations.schema_migrations` retains 26,003 statements (~3.8MB) for version `20260721093501` (`remote_schema`): 22 CREATE TYPE, 868 CREATE TABLE, 635 CREATE POLICY statements.
- The version-matched GitHub file contains the large full snapshot (confirmed via direct contents retrieval and local GitHub Actions); certain connector file-read responses inaccurately show it as empty due to its size. The actual blocker is duplicate schema definitions during replay.
- The snapshot begins with `drop extension if exists pg_net` and recreates previously defined enums and tables. Replaying it after earlier historical migrations is not safe.

## Do not
- Drop `public.app_role`, other enums or dependent tables.
- Edit or delete production migration history to force green status.
- Run `reset_branch` or `merge_branch` before baseline replay is proven.
- Paste a production schema dump into a preview connected to real users.
- Provision Auth users by manually inserting password hashes into `auth.users`.

## Read-only checks
```bash
node scripts/uat-audit/migration-content-provenance.mjs
```
This inspects the real on-disk snapshot file size and consistency; it is **not** a migration replay or deployment fix.

Run `supabase/ops/uat-308-readonly-audit.sql` **only in the UAT SQL editor** to validate the schema state. Keep actual SQL results and workflow timestamps in issue #308.

## Recovery procedure
1. Preserve a non-destructive export of the UAT-only branch directory entries, UAT security patches and current migration list. Keep production untouched.
2. On a disposable LOCAL database, run the full repository migration history using the current Supabase CLI and supported local Docker engine, record the **first** failing migration and full SQLSTATE. Test `supabase db reset` locally, never against production/UAT.
3. Reconcile historical snapshot `20260721093501`: decide whether the archived snapshot should be a baseline starting point **or** excluded from replay because its objects were built by earlier migrations. Preserve the already-applied production version identity. Document and test a clean, version-controlled, reproducible sequence.
4. Reconcile root/nested migration files, as well as remote ledger `statements`; do not assume empty GitHub SQL implies the server applies nothing.
5. Restore UAT security hardening in version-controlled migrations. Branch JWT authorization must read admin-controlled `app_metadata.branch_id`, not user-editable `user_metadata`. Confirm profile-column UPDATE grants prevent `role` and `branch_id` changes.
6. After replay succeeds **locally**, choose a safe UAT-only re-establishment method, preserving branch records `MDY_UAT` and `INSEIN_UAT`. Any new paid Supabase instance needs separate cost confirmation.
7. Verify Supabase branch status, table/function signatures, security advisors, and application workflows, then provision test Auth users through supported admin APIs.
8. Test cross-branch denials and pickup -> QR -> transfer -> warehouse -> wayplan -> delivery -> COD/finance; do not approve UAT before these pass.

**Current stage:** diagnostic package only. No production writes, no UAT reset, no new Supabase projects. See https://github.com/KyawWannaBL/britium-go-live/issues/308 .
