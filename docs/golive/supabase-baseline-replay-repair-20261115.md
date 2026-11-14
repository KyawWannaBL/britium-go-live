# Issue #299 — Supabase fresh-branch migration repair

**Status: PARTIAL — April replay compatibility reproduced; July snapshot still blocks a complete fresh replay.** No Production schema, parcel, COD, finance, or migration-history records have been changed during this investigation.

## Verified facts (15 Nov 2026)

- Production database migration history has **502** records.
- `20260412000000_emergency_restore` contains **7,480** recorded SQL statements (~959 KB).
- Statement **16** installs `pgtap` without a version; statements **2708–2711** grant on `public._quote_ident_like(text,text)` but that function is not explicitly declared in the migration.
- The April snapshot grants permissions on **342 distinct public function names** without an explicit `CREATE FUNCTION` for those names; **all 342 are pgTAP extension members on Production**. These span 4,288 grant statements by the replay preparation method (verify actual source formatting before changing history).
- Production pgTAP version: **1.2.0**. New isolated preview branch has available pgTAP **1.3.1, 1.3.2, 1.3.3** only; `CREATE EXTENSION` installs **1.3.3**, in which `public._quote_ident_like(text,text)` no longer exists.
- On isolated branch `baseline-pgtap-diagnostic-20261115`, replay of the April snapshot using conditional guards for **missing pgTAP function grants only** succeeded in 19 bounded chunks; no other snapshot SQL was ignored. The first 16 subsequent April/May migrations through `20260422040000` also passed.
- Second blocker: `20260721093501_remote_schema` in **Production migration history** contains **26,003 statements (~3.84 MB)** and begins by recreating enum `public.app_role`. Replay fails with `type "app_role" already exists`. The checked-in `supabase/migrations/20260721093501_remote_schema.sql` is empty, so the repository does not accurately represent remote historical statements.
- Pre-July branch (after April/May replay) had **248** public/private relations and **1,245** routines; Production has **1,221** relations and **2,616** routines. Counts differ because of later migrations too. Do not assume July snapshot is redundant or simply replace it with `select 1`.
- Diagnostic paid branch was deleted after tests.

## Included artifacts
- `supabase/tests/audit_migration_replay_baseline_20261115.sql` — read-only inspection.
- `scripts/prepare-pgtap-compat-replay.mjs` — generates a *separate* candidate April SQL file from an already fetched migration file; dry-run by default; never modifies the live project.

## Required full repair protocol
1. Use an authorized developer workstation with Supabase CLI, and run `supabase --help`, `supabase migration --help`, `supabase db --help` to confirm current syntax. Link to the correct project. Back up Production schema and migration metadata **without data/secrets**. Never commit credentials or parcel data.
2. Fetch the **remote** migration statements via supported CLI and compare their checksums against repository files; in particular reconcile the 959 KB April snapshot and 3.84 MB July snapshot.
3. Stage the April pgTAP compatibility candidate on a disposable local DB. Verify it skips only functions dropped between pgTAP 1.2 and 1.3 and never masks unrelated grant failures. Review old pgTAP privilege exposures explicitly.
4. Diff the July historical snapshot against the *schema at July 21*, not today's Production schema. Prepare a **delta** which preserves unique objects and excludes duplicate `CREATE TYPE/TABLE` statements; do not replace with blank migration unless a clean replay proves it safe.
5. Run all 502 migrations end to end on a fresh local database with branch-equivalent PostgreSQL and extensions; diff tables, views, types, functions, ACL, RLS, dependencies, triggers and indexes. Check FIN, CS, Branch and Rider auth, including read-only reconciliation.
6. Only after replay and independent review, choose a supervised, backed-up migration-history reconciliation plan. Treat production migration-history writes as a separate high-risk release requiring a reversible and audited procedure.
7. Create a fresh Supabase Preview Branch; confirm full replay, no `MIGRATIONS_FAILED`, authenticated E2E and relevant security advisors. Delete the temporary branch once done.

## Important release constraints
- No blind `IF NOT EXISTS` on every statement.
- No direct `UPDATE/DELETE` to `supabase_migrations.schema_migrations` without verified full baseline, backup, audit and specific release approval.
- Do not mutate parcel/Finance records.
- The Royal reconciliation UI is already in Production under PR #298; this repair is solely the **future fresh-branch reproducibility** blocker.
