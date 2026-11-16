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


## Follow-up enum reconciliation
- Compared 21 named enum CREATE TYPE statements in the July snapshot with actual `pg_type/pg_enum` metadata from UAT: **all 21 enum types already exist**. The duplicate `app_role` at statement 2 is therefore the first visible failure, not the only type collision.
- The snapshot and UAT enum labels agree for 20 of the 21 enums.
- `public.employee_role` contains an extra `branch-office` value in UAT (17 labels) absent from the July snapshot (16 labels). This is additive schema evolution; any repair that drops/recreates enums would risk losing it and breaking dependencies.
- The current container has no PostgreSQL server, Docker, Supabase CLI, or PGlite installed, and outbound GitHub DNS is unavailable; a full isolated replay **was not executed** here. Do not treat static analysis as a passing rehearsal.


## SQL replay run #8 and pgtap duplicate analysis — 2026-11-16
- GitHub Actions run `43836590574` **reached SQL migration execution** after correcting legacy CLI `[inbucket]` config in disposable checkout.
- BOTH full and snapshot-first strategies failed on July snapshot `20260721093501_remote_schema.sql`, statement **5946**: `create type "public"."_time_trial_type" as ("a_time" numeric);` — SQLSTATE **42710**, already exists.
- Queried `pg_depend` in Production and operational UAT **read-only**: `public._time_trial_type` is a composite type owned by extension `pgtap`. The July snapshot first creates `pgtap` and later duplicates this extension-owned type.
- Diagnostic-only draft PR #311, branch `diagnostic/uat-migration-replay-evidence-20261116`, contains `scripts/uat-snapshot-remove-pgtap-duplicate.mjs`: exact one-occurrence omission of duplicate declaration **only in temporary GitHub CI checkout**, never in hosted database.
- New CI run `43838205386` tests both approaches after the scoped omission; do not claim success until the jobs finish and any subsequent errors are examined.
- **Never drop extension-owned objects**, blanket-ignore duplicate definitions, merge diagnostic branch into Production, or mark migration applied despite failure. Hosted UAT still requires full historical reconciliation and Auth/RLS validation.

## Diagnostic PR #311 results through run #13 — 2026-11-16
- Two real local PostgreSQL/Supabase CLI replays successfully passed initial setup. Both strategies (April baseline and July snapshot-first) first failed at July snapshot statement 5946: `public._time_trial_type` already exists. Production and UAT `pg_depend` show that this type is owned by extension `pgtap`.
- On draft, **unmerged** PR #311, a disposable-worktree-only script suppresses exactly one extension-owned duplicate type declaration. The complete July snapshot then replayed further.
- Both strategies next failed on missing `be_wayplan_assignment_options_v44_legacy_20260826()` during the `20260826042244` REVOKE. Production holds the historical definition, but it is absent from the replayable source history.
- Diagnostic-only fixture from the read-only Production function definition was prepended to the August REVOKE migration in the CI checkout, ensuring the REVOKE operates on a real function. This advanced both strategies past August 26.
- Run `43838766931` / #13: both strategies failed on **20260827070905_fix_declared_delivery_settlement_v61_8_2.sql**, SQLSTATE P0001: `Target financial calculation function was not found`. It expects `public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)`.
- Read-only production migration-ledger search found references to this function beginning in the August 27 patch, with later September-November patches; no earlier ledger entry containing its name was found. The replay source thus lacks a required preexisting production function, and importing the **current** definition as an August historical baseline risks mixing later financial policies into older migrations.
- **Stop ad-hoc replay patches here.** Restore canonical historical migration sources/snapshot dependencies with checksum-controlled lineage and finance behavior tests. The disposable CI-only fixtures are NOT approval to change the operational UAT database.
- No changes to Production, hosted operational UAT, Auth users, or financial ledgers were made by these CI diagnostics. Do not merge diagnostic branch to main or UAT without thorough review.

## Historical Financial V2 gap — confirmed 2026-11-16
- Diagnostic run `43839900427` confirmed BOTH migration-order strategies proceed past earlier August 26 blocker after restoring the authentic `20260804` V61.8.1 function from `britium-current-ui-fixed/data_entry_payment_settlement_v61_8_1_patch/sql/20260804_financial_v2_payment_settlement_v61_8_1.sql` in a disposable CI checkout.
- Both then failed in `20260827070905` SQLSTATE **42P01**: relation `public.be_parcel_tariffs_v2` does not exist. This is a missing finance-foundation object, not a syntax/quoting failure.
- A direct read-only Production-vs-UAT inventory confirms ALL six finance prerequisites below exist in Production but are absent in operational UAT: `be_parcel_tariffs_v2`, `be_merchant_financial_profiles_v2`, `be_data_entry_financial_v2_runtime_v58`, `be_financial_v2_township_key_v61_4_1(text)`, `be_tariff_catalog_v61_7()`, `be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)`.
- The July remote-schema snapshot contains **none of those** objects. Repository retains the historical July 31 foundation at `britium-current-ui-fixed/parcel_financial_v2_backend.sql` and August 4 V61.8.1 patch (above), plus other V61.x compatibility patches; these were never represented as replayable historical migrations before the Aug 27 modifier.
- Draft PR #311 adds CI-only diagnostic overlays for the original July 31 foundation and August 4 V61.8.1 function, with **no hosted database changes**. Run `43840435430` tests whether replay advances. This is not permission to adopt any historic tariff seeds or mutate production.
- Before making an actual UAT recovery migration, reconstruct and review the full V58-V61.x historical dependencies, compare DDL and exact financial behavior with Production, avoid seeding real tariff data from legacy fixtures, and validate RLS, settlement modes, COD, and branch roles.

## Replay progress into September — 2026-11-16
- PR #311 diagnostic run `43842194120` advanced both approaches past the July snapshot, July 31 Financial V2 foundation, Aug 27 Financial patch, Aug 28 fleet reconciliation, and Aug 30 primary field verification.
- The first unreplayed required object became `public.be_current_field_team_identity()`; the CI-only fixture preserved production's authenticated-user / active-workforce checks. It did NOT stub permissions or open access.
- Both approaches then failed on September 1 migration `20260901111809_rider_delivery_health_v12_10c.sql`: **SQLSTATE 42P01**, `public.be_dispatch_scans_v39` missing.
- Production read-only inspection confirms that table exists with 9 columns. It is absent in hosted UAT. Historical source exists at `britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql`, including five original V39 ledgers.
- Draft diagnostic branch commit `7611984f` introduces CI-only extraction of precisely five V39 ledger CREATE TABLE definitions into an ephemeral migration (plus fail-closed RLS) from the original V39 source; run `43843142196` tests it.
- **None** of these diagnostics have been applied to operational UAT or production. The draft PR stays unmerged; staff Auth users remain unprovisioned. A complete migration replay and mandatory security/finance regression tests are required before deployment.

## Confirmed transition into September & remaining source-history gap — 2026-11-16
- Diagnostic PR #311 CI run `43843142196` advanced BOTH full-order and snapshot-first disposable replay through the original V39 warehouse/dispatch ledger tables, then failed in `20260901145928_dispatch_queue_auth_and_helper_optional_v12_11.sql`.
- Failing statement begins `CREATE OR REPLACE VIEW public.be_v_dispatch_ready_queue AS ...`; PostgreSQL SQLSTATE **42703**: column `d.financial_validation_status` does not exist. This field belongs to `public.be_data_entry_parcel_details`.
- Production read-only schema confirms `be_data_entry_parcel_details.financial_validation_status` exists as nullable TEXT. The isolated operational UAT query returned no matching columns. Historical migration replay is still missing Data Entry state schema before September 1.
- Earlier run `43842649364` failed on absent `public.be_dispatch_scans_v39`, which was restored in disposable CI from original source `britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql` (no production data imported).
- Do not silently fill missing columns in hosted UAT or flag the reconciliation as deployment-ready; examine full Data Entry schema history and permissions before introducing a permanent baseline. All changes described in this section are source-only diagnostics on unmerged draft PR #311.


## User-requested full UAT repair: latest validated boundary (2026-11-16)
- Diagnostic-only branch PR #311 commit `97b87b9`: inserted production-typed nullable TEXT `financial_validation_status` before September dispatch-ready view. Local GitHub replay run `43844713429` progressed beyond the prior `20260901145928` failure.
- Next CI failure on BOTH modes at `20260901152007_warehouse_dispatch_gate_sync_v12_12.sql`: missing `public.be_v_warehouse_receipt_v39` (SQLSTATE 42P01).
- PR #311 commits `11184b7` and `aec641a` staged ORIGINAL source V39 receipt/lifecycle view definitions plus operational settings metadata in disposable CI checkout. Run `43845205580` found the next preexisting dependency missing: `public.be_v_warehouse_receipt_v36` (SQLSTATE 42P01), before September migrations.
- Original V36 source exists in `britium-current-ui-fixed/warehouse_receipt_reconciliation_v36.sql` but is NOT in replayable migration history; it depends on canonical Data Entry, Waybill and Warehouse receipt tables. This is a **systemic incomplete historical baseline**, not one missing column.
- Operational branch `hgijdyfwmvskchsruknp` remains `MIGRATIONS_FAILED` with 27 recorded migrations; 8/8 operational prerequisite tables absent and zero Auth users. Do not deploy a sparse eight-table placeholder or run the August patch individually.
- Recommended structural remediation: reconstruct **schema-only** canonical baseline with authentic V33/V35/V36/V39 and Financial V2 V58-V61 definitions, compare against read-only Production catalogs, validate on a disposable DB, then restore the intended empty UAT (no production parcel or Auth records), and test branch RLS plus COD/waybill/dispatch flows. No hosted UAT/production changes have been made by PR #311.
