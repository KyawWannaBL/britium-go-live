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

## July enum semantic classification — verified read-only on Production

Audit: `supabase/tests/audit_july_enum_semantic_delta_20261115.sql`.
The July snapshot has 22 `CREATE TYPE` statements: **19 existing public enum definitions with exactly identical labels in the same order**, **two append-only role changes**, and **one separately defined `_time_trial_type`** (not an enum label list).

The two append-only changes, **not suitable for a blanket skip**, are:

- `public.app_role`: append lowercase `rider`, `driver`, `helper` after the existing 34 ordered labels (37 labels in July snapshot).
- `public.employee_role`: append `SYS` after the existing 15 labels (16 labels in July snapshot).

The read-only audit generates these **candidate statements for a disposable branch only**:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rider';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'helper';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'SYS';
```

These changes may need their own committed transaction before downstream references because PostgreSQL forbids using newly added enum labels until commit. **Do not execute the candidate on Production; its current labels already contain all four.** The July snapshot's duplicate `CREATE TYPE` statements must be replaced only after the full migration delta and replay have been reviewed. A name-level table/function match is not proof of an equivalent definition or safe omission.

Additional audit: `supabase/tests/audit_july_function_signatures_20261115.sql` shows 694 July `CREATE FUNCTION` statements; 165 have a function name in earlier migrations, 529 do not. This is *not* an overload/signature-level comparison. July also has 868 `CREATE TABLE` statements with 192 name overlaps and 676 absent from earlier CREATE TABLE text.

## Production access-control parity checkpoint — 15 November 2026

Read-only audit: `supabase/tests/audit_july_zero_policy_acl_20261115.sql`, executed against the committed SQL.

Of the 29 historically flagged table-name overlaps, **12** current Production tables have RLS enabled but **no explicit RLS policies**. All 12 exist, all 12 grant SQL table-level SELECT/INSERT/UPDATE/DELETE to role `authenticated`, and none grant direct SELECT to `anon`. These facts are compatible with a default-deny RLS policy for ordinary authenticated requests. They **do not establish application access**: owner/service roles, SECURITY DEFINER routines, views, schema exposure, and policy roles elsewhere can alter effective access. They are **not a reason** to create blanket policies, grant anonymous access, or disable RLS.

Affected tables: `assignment_queue_2026_02_19_17_00`, `branches`, `cod_collections`, `fleet_assets`, `fleet_telemetry`, `routes`, `routes_2026_02_28_20_06`, `shipment_assignment_rules_2026_02_19_17_00`, `support_tickets`, `tariffs`, `user_branch_assignments`, and `warehouses`.

**Fresh-replay acceptance gate:** for each of these 12 tables, compare actual owner, RLS flags, policies, effective role privileges, functions/views exposing the table, and trigger/constraint dependencies with Production. Do not change current Production ACLs to make a replay succeed. Complete all 502 migrations on an isolated database and compare the resulting schema (including the remaining 17 overlapping tables) prior to merging PR #300.

**Current status:** this is a verified read-only checkpoint only, **not** proof of successful migration repair or a Production deployment.
