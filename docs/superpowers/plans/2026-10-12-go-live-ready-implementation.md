# Go-Live Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair remaining launch blockers and add a reviewed, recoverable cutover that isolates approved test transactions across the Enterprise Portal and delivery apps while preserving master data and financial evidence.

**Architecture:** Extend the existing GoLiveControlPanel with a read-only preview, explicit readiness gates, audited isolation and recovery. A server-owned scope registry classifies tables and linked records; a dataset boundary and write guards prevent archived work from reappearing through reports, background jobs or offline clients. No cutover is enabled until the dependency inventory and synthetic test/live acceptance pass.

**Tech Stack:** React/TypeScript, existing Supabase Postgres/Auth/Storage, existing verification scripts, Android Capacitor apps.

**Spec:** ../specs/2026-10-12-go-live-ready-design.md (approved by user on 12 October 2026).

## Global Constraints

- Preserve master data, tariffs, account access and configuration.
- Preserve audit history, evidence objects and security logs.
- Preserve Mapbox monthly usage and budget reservations; a go-live cutover must not reset billing counters.
- Do not reuse historical parcel or payment identifiers.
- Preview does not mutate data.
- Browser visibility is not authorization; privileged permissions are revocable and checked on the server.
- Changed records require a new preview. Double-clicks and retries reuse one idempotency key.
- Report PENDING or BLOCKED on missing evidence; never infer readiness from empty tables.
- Do not truncate tables, disable triggers/RLS, cascade-delete masters, publicly expose receipts or reset accounting/Mapbox controls.
- Real Android 8+ phone/tablet evidence is required; no browser or code test can substitute for camera/audio/GPS/offline acceptance.

## Review Focus

- A mixed live/test batch must block isolation until its relationship is resolved; Task 2 tests this.
- A new dependent row arriving after preview invalidates its hash; Tasks 2 and 3 test this.
- A queued mutation prepared before cutover cannot recreate archived work; Tasks 4 and 5 test this.
- A retried activation after a lost response returns the same audited result; Task 3 tests this.
- Rollback after new production activity restores only the selected archive without removing new live records; Task 3 tests this.

## Task 1: Close and classify launch blockers

**Files:** Existing britium-go-live/scripts/verify-*.mjs and *.cjs; supabase/tests/rto_three_attempts.sql, merchant_settlement_v200.sql, merchant_settlement_receipt_upload.sql; Rider-App/docs/golive-blocker-repair-20261012.md; create docs/golive/blocker-register.md.

**Interfaces:** Produce a blocker register with ID, reproduction, confirmed product defect versus obsolete harness, affected build, root cause, fix and verification result. Missing evidence remains PENDING.

- [ ] Reproduce each remaining Portal failure sequentially; preserve approved V136 location and V148 vehicle-crew policy instead of restoring obsolete behavior to satisfy text assertions.
- [ ] Add failing behavior tests for confirmed defects, then implement the smallest root-cause repair and rerun the relevant tests.
- [ ] Make Finance fixtures repeatable inside rollback transactions or a disposable isolated database. Verify six collection types, COD gate, independent approval, partial/split/bulk payment, duplicate/overpayment prevention, immutable receipts and shared Merchant/Finance history.
- [ ] Reconcile the legacy RTO counter against audited events; classify duplicate submissions explicitly rather than inventing failure attempts. Restore direct physical-return assertions in the regression.
- [ ] Audit five unmapped legacy/demo identities. Map only identities with a uniquely verified worker; disable a demo only after recording the intended access decision. Run Rider, Driver, Helper and remaining department role tests using valid principals.
- [ ] Run registered verification scripts, builds and lint; record failures and warnings by name. Commit each verified repair separately.

## Task 2: Complete scope classification and read-only preview

**Files:** Create scripts/inventory-go-live-dependencies.mjs, docs/golive/scope-registry.json, britium-go-live/src/lib/goLiveCutover.ts, supabase/tests/go_live_cutover_preview_v2.sql. Generate the scope migration with `supabase migration new go_live_cutover_scope_v2`; use its returned path.

**Interfaces:** `be_go_live_cutover_preview_v2(p_cutoff_at timestamptz, p_root_keys jsonb) -> jsonb` returns `{ok, mode: PREVIEW, manifest_hash, source_epoch, cutoff_at, table_counts, preserved_counts, financial_exceptions, blockers, gates, expires_at}`. It performs no INSERT, UPDATE or DELETE. `GoLivePreview` mirrors those fields in the TypeScript client. Scope entries explicitly declare schema/table/primary key, protected-master or transactional category, root and dependency keys, active readers/writers and archival strategy.

- [ ] Inventory all current tables, foreign keys, logical source references, active client RPC/table calls, triggers, Realtime subscriptions, jobs and storage references. The observed schema has 1,018 public tables, 15 private tables, 350 foreign keys and 1,157 public be_* functions; these are inventory totals, not a cleanup allowlist.
- [ ] Write failing preview tests: unauthorized users denied; protected masters never selected; linked children included; unknown references and mixed live/test batches blocked; hashes change for inserted/edited dependencies; preview leaves all data and balances unchanged.
- [ ] Implement the explicit registry and read-only preview with authorization from trusted account/permission records. Reject wildcard or unclassified table selection; never treat creation time alone as proof of UAT status.
- [ ] Include private settlement receipts, payments, commissions, wallet and accounting source links. Preserve every proof object reference with ownership; do not expose bucket contents.
- [ ] Run preview tests in a synthetic disposable fixture and inspect the production preview read-only. Commit after the reviewed registry has no unclassified active transaction paths.

## Task 3: Atomic audited isolation and recovery

**Files:** Generate a migration with `supabase migration new go_live_cutover_execute_v2`; create supabase/tests/go_live_cutover_execute_v2.sql and supabase/tests/go_live_cutover_concurrency_v2.sql.

**Interfaces:** Private cutover manifest, immutable archive and evidence tables; `be_go_live_cutover_execute_v2(p_preview_hash text, p_expected_epoch bigint, p_idempotency_key uuid, p_confirmation text) -> jsonb`; `be_go_live_cutover_restore_v2(p_cutover_id uuid, p_expected_epoch bigint, p_idempotency_key uuid) -> jsonb`. Results include cutover_id, status, epoch, preserved_checksums and counts. Errors do not report READY.

- [ ] Write failing tests for revoked authority, missing/stale evidence, stale preview/epoch, double-click and lost-response replay, concurrent writers, archive completeness, protected hashes and failed activation rollback.
- [ ] Implement exact-manifest revalidation, one database cutover lock, write fencing, immutable snapshots/checksums, archival visibility changes and one audited idempotent result. Do not use the disabled legacy cleanup functions.
- [ ] Verify every preserved dataset checksum before committing. Recompute active counters and worker availability without zeroing real liabilities or editing workforce master identity.
- [ ] Implement restoration of the selected archive, including balances, without duplicating transactions or removing production rows created after activation.
- [ ] Run concurrency and recovery tests with both selected UAT and retained live fixtures. Keep execution disabled until Tasks 4–7 pass; commit.

## Task 4: Enforce the boundary throughout backend consumers

**Files:** The exact RPC/view/job/trigger files listed by Task 2 in docs/golive/scope-registry.json; create supabase/tests/go_live_cutover_consumers_v2.sql. Record each changed definition in a generated migration.

**Interfaces:** `be_go_live_runtime_epoch_v2() -> bigint`; authorized status reader returns the current epoch. Transaction writers take/validate their dataset context and reject archived identifiers with STALE_DATASET. Active readers return only live records; audited historical views keep TEST-labeled archive access under existing permissions.

- [ ] Add a synthetic selected test parcel and an unchanged live parcel with pickup, scans, route, proof, COD, commissions, wallet, settlement, accounting, CS and notification dependencies.
- [ ] Write failing checks for every registered active consumer: test parcel absent, live parcel present, production balances exclude only test work, private historical evidence remains permission-limited.
- [ ] Apply the registry's explicit filtering/write guards to every listed consumer, including rebuilding jobs; test that refresh/reconciliation cannot resurrect archived rows.
- [ ] Verify stale queued requests fail before creating records, including callers using compatibility RPCs or direct-table mutations. Commit only when every active path has evidence.

## Task 5: Portal and delivery-app data context

**Files:** Create Rider-App/src/lib/runtimeDataset.ts; modify Rider-App/src/lib/riderOperations.ts, src/lib/riderEnterpriseApi.ts, src/hooks/useRiderRealtime.ts and every write adapter inventoried in Task 2; modify the corresponding Portal adapters. Create scripts/verify-runtime-dataset.cjs in each repo.

**Interfaces:** `readRuntimeDataset(): Promise<{epoch: number}>`; `requireCurrentDataset(preparedEpoch: number): Promise<void>` rejects STALE_DATASET. Preserve the original epoch on any locally queued operation.

- [ ] Write failing tests for old queued writes, network reconnect after cutover, preserved auth/account state, cache refresh and new live workflow completion.
- [ ] Integrate the server-owned epoch with existing write and refresh paths; refresh task lists on change without clearing login, configuration or master data. Show an actionable stale-data message, not silent retry.
- [ ] Verify portal and app consumers against the same synthetic boundary, run builds and existing regressions, then commit.

## Task 6: Go-Live Ready user flow

**Files:** Modify britium-go-live/src/pages/GoLiveControlPanel.tsx and UATGoLiveCommandCenterPage.tsx; create britium-go-live/scripts/verify-go-live-ready-ui.cjs; use the Task 2 goLiveCutover client.

**Interfaces:** Existing /go-live-control remains the primary route. Go-Live Ready opens preview; it does not immediately archive. Execution displays cutoff, selected department counts, preserved counts, exceptions, gates and typed confirmation. Use PENDING, BLOCKED, ACTIVATING, READY and RESTORED states from backend results.

- [ ] Write failing UI tests: preview does not execute; blockers/missing evidence disable activation; changed preview invalidates confirmation; repeated click uses one key; server errors cannot become READY; unauthorized users cannot execute.
- [ ] Implement the approved preview/review/confirm flow and history/download evidence controls. Route other cleanup entry points to this one flow so an old screen cannot bypass its gates.
- [ ] Test successful synthetic isolation and restoration through the UI, including unavailable RPCs and ambiguous network responses. Commit.

## Task 7: Release evidence and staged cutover rehearsal

**Files:** Create docs/golive/release-evidence.md; use the existing Android release workflows and recorded read-only deployment metadata.

**Interfaces:** Readiness evidence identifies exact Portal/Rider commits, APK version, test ID, outcome, authorized reviewer and timestamp. A new build invalidates dependent evidence. Device outcomes are entered from actual phone/tablet tests.

- [ ] Verify workflow and deployment results, then run the full new-production synthetic round-trip: pickup -> registration -> warehouse -> dispatch -> delivery/failure -> COD/commission -> independent approval -> settlement -> Merchant history.
- [ ] Record Android 8+ phone/tablet camera, audio after first interaction, GPS, offline retry and Finish Assignments results. Missing device access remains PENDING.
- [ ] Rehearse isolation and recovery in the disposable environment; confirm master/configuration hashes and that new live work survives recovery. Record explicit residual limitations.
- [ ] Release the button only after independent code review and complete acceptance evidence. Leave production activation for its reviewed preview/confirm action; commit the evidence without credentials or personal screenshots.
