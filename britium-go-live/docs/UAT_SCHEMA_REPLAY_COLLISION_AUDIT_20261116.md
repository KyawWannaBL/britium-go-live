# Isolated MDY + Insein UAT — schema replay collision analysis
Date: 2026-11-16
Target only: Supabase branch `branch-uat-mdy-insein-20261116` / `hgijdyfwmvskchsruknp`
Source: `britium-go-live/supabase/migrations/20260721093501_remote_schema.sql` at GitHub branch `uat/mdy-insein-isolated-20261116`.
Status: **analysis only — NOT applied**.

## Measured findings
- Full snapshot source: 3,881,952 characters / 106,405 lines; about 26,003 SQL statements per earlier recovery investigation.
- Snapshot unique public CREATE TABLE names: **867**.
- Existing UAT `public` base table names from `information_schema.tables`: **242** (249 public table-like objects reported by broader query).
- Overlap between snapshot and UAT base tables: **235**.
- Missing snapshot base tables: **632**.
- Snapshot keyword counts (not a full SQL parser): CREATE TABLE 870, CREATE FUNCTION 694, CREATE POLICY 635, CREATE TYPE 22, ALTER TABLE 2,972, GRANT 18,225, VIEW 84.
- `public.app_role` exists already; source attempts to CREATE TYPE a second time at the beginning.
- Zero Auth users, 27 migration ledger entries. Development branch status `MIGRATIONS_FAILED`.
- `be_user_account_registry`, `be_branch_offices`, `be_role_authority_matrix`, `be_branch_intake_parcels_v1`, and `be_login_access_profile` are absent.
- The snapshot **does contain** CREATE TABLE statements for `be_user_account_registry`, `be_branch_offices`, and `be_role_authority_matrix`. It **does not contain** the more recent `be_branch_intake_parcels_v1` table or `be_login_access_profile` RPC; subsequent migrations are indispensable.
- Snapshot also contains policies granting anon access to proof-media storage bucket. This merits dedicated security review before replay and must not be copied blindly.

## Supabase security advisor findings
- 99 tables with RLS enabled but no policies (INFO; may represent intended deny-all).
- 118 functions with mutable search_path (WARN).
- 71 SECURITY DEFINER functions executable by anon and 72 by authenticated (WARN).
- 236 tables exposed to pg_graphql anon and 238 to pg_graphql authenticated (WARN).
- 1 extension in public (WARN).
- Health advisor returned no notices.
Reference: https://supabase.com/docs/guides/database/database-linter

## Required safe repair procedure
1. Make a source-controlled inventory of every local migration version, source SHA, and dependencies. Identify whether the July remote-schema snapshot is meant to *replace* the April baseline or be *applied after* it. It is currently incompatible with replay-after-baseline.
2. Prepare a fresh **schema-only** isolated rehearsal, with no copy of production business records or Auth users.
3. Choose one canonical migration baseline, eliminate duplicate DDL at the source, and preserve every subsequent migration including current auth/branch-intake logic. Never solve this by simply marking the 3.8 MB snapshot applied or dropping app_role.
4. Replay the **entire** ordered migration sequence into the empty rehearsal. Resolve object dependencies and review all RLS, function privileges, triggers, storage policies and grants. Verify checksums and migration ledger.
5. Run read-only schema gate in `sql/audits/uat_mdy_insein_schema_gate_readonly.sql` plus app-specific RPC smoke tests and branch isolation tests. The gate must reject missing five core objects and `MIGRATIONS_FAILED`.
6. Only once rehearsal is green, apply the reviewed correction to isolated UAT. Do not reset or mutate the current branch automatically.
7. Only after schema and login RPC pass, invite individually verified employees via server-side Auth-admin or Supabase Dashboard. No shared passwords and no direct inserts into auth.users; validate cross-branch denial.

## Release decision
**BLOCKED.** A Vercel READY deployment means the frontend built; it does not establish schema, permissions, user login, or operational UAT readiness. No account was created by this audit; no SQL migration was applied.
