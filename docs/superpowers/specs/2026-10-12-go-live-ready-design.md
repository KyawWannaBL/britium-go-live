# Go-Live Ready: reviewed design proposal

Status: PROPOSED. No cutover has been executed. No readiness or device sign-off is implied.

## Purpose
Fix verified launch blockers, then give authorized administrators one controlled flow to isolate all approved testing transactions from Enterprise Portal, Merchant Portal and Rider/Driver/Helper apps. Preserve master data, tariffs, account access and configuration. Existing operational records are not automatically assumed to be test data.

## Current findings
The production source is Portal 7456b504fe336747df6ab2753574f992a00ca375. GoLiveControlPanel currently generates a dry-run report. The September isolation migration covers a historical boundary only. Destructive cleanup functions are disabled. Re-enabling the legacy cleanup is not an acceptable implementation.

Rider baseline had an inconsistent dependency lockfile, 14 lint errors and suppressed type checking. Corrected code passed TypeScript checking and an intermediate lint run had zero errors; final build and clean-install evidence must be attached to the change. The three-attempt RTO regression passed after resetting later historical return scans inside its rollback transaction. The legacy zero-counter RTO row has historical failure events, including repeated submissions, so it requires reconciliation rather than inventing three attempts. Remaining Portal failures and full Finance/role/device acceptance remain launch gates.

## Preserved data
Never select for isolation: users, authentication sessions and credentials, role/permission grants, workforce profiles, vehicles, merchants/customers, partner companies, branches/hubs, township/postal/ward dictionaries, approved address aliases and saved master coordinates, tariff tables and versions, collection types, commission rates/caps, chart of accounts, accounting periods, settlement configuration, templates, numbering history, settings and integration configuration. Preserve audit history, evidence objects and security logs. Preserve Mapbox monthly usage and budget reservations; a go-live cutover must not reset billing counters. Do not reuse historical parcel or payment identifiers.

## Selected test-data scope
The preview produces an explicit manifest of approved UAT roots and every dependent transaction: registrations, bulk rows, pickup requests/verifications/photos, waybills, warehouse intake/returns/pending/aging alerts, wayplans/routes/assignments/scans, delivery outcomes/proof, COD remittances, settlement batches/items/payments/disputes, commission events, wallet entries, accounting source events/journal lines, CS cases/history and notifications. Database foreign keys and source references must be inventoried; unclassified references block activation. Include private financial tables and storage references, not just the September allowlist.

The operator may select an approved pre-launch cutoff, but timestamp alone is not evidence that a record is a test. The preview must flag real or ambiguous financial obligations, posted journals, partially settled batches and mixed test/live relationships. Resolve or explicitly classify them before activation. Master relationships are retained. Production opening balances require Finance reconciliation; a reset never creates fake payments to make wallets zero.

## User flow
Settings -> Go-Live Control opens Go-Live Ready. The button opens a preview: cutoff, record counts by department, preserved counts, financial exceptions and remaining readiness gates. Preview does not mutate data. Superadmin executes the reviewed manifest with a typed confirmation; Operation Manager may act only with an explicit revocable cutover permission checked on the server. Browser visibility is not authorization.

Before execution, backend revalidates the exact manifest hash, source/build identities, approval, expected current epoch and every readiness gate. Changed records require a new preview. Double-clicks and retries reuse one idempotency key. A green READY result is possible only after successful isolation, preserved-data verification and all required test evidence. Report PENDING or BLOCKED on missing evidence; never infer readiness from empty tables.

## Isolation and recovery
Use a dedicated test archive with immutable row snapshots, original primary keys, source table, manifest ID, actor, timestamp and checksums. Archive proof objects privately and preserve their links. Exclude the approved test dataset from every active read and write path, including direct tables, views, RPCs, reports, Realtime and background jobs. An explicit production epoch travels with offline work; old queued mutations are rejected with a refresh/review instruction. Audit records remain accessible with a TEST label in historical views and do not contribute to production balances.

Acquire a database cutover lock and temporarily fence operational writes. Snapshot the selected dependency graph and verify completeness before changing visibility. Activation is atomic; failure restores prior visibility. Master row counts and hashes must match before/after. Recompute availability and operational counters from the active dataset; do not edit profile masters arbitrarily. Keep an audited rollback operation for the same manifest. Do not truncate tables, disable triggers/RLS, cascade-delete masters, publicly expose receipts or reset accounting/Mapbox controls.

## Required acceptance evidence
1. Non-admin and revoked users cannot preview sensitive scope or execute cutover.
2. Preview cannot change rows or balances; stale preview cannot execute.
3. Selected test records disappear from all departmental queues, app tasks, reports and production wallets; a seeded live record remains visible and unchanged.
4. All preserved master/configuration hashes match before/after.
5. Archived receipts and complete financial/audit history remain accessible only to permitted users.
6. Double-click, concurrent execution, network retry and interrupted execution produce one atomic result.
7. New production transactions work end-to-end after cutover; archived IDs cannot be reused or mutated by offline clients.
8. Rollback restores the selected dataset and balances without duplicate commissions/payments.
9. Finance acceptance covers six collection types, partial/split/bulk payment, maker-checker, duplicate/overpayment prevention, receipt access and Finance/Merchant parity.
10. Real Android 8+ phone/tablet installation, camera, notification audio, GPS, offline retry and Finish Assignments round-trip have recorded evidence against the release build.

## Implementation sequence after design review
Inventory current dependencies and all active readers/writers; fix and classify remaining launch failures. Add failing DB and UI tests for the gates above. Add audited manifest/archive/epoch and permission functions with RLS, server-side write fencing and restore checks. Extend the existing GoLiveControlPanel and route other cleanup controls into this one preview. Apply filtering to every affected consumer. Run rollback-only tests first, then a staged synthetic test/live dataset. Release the button only after review and verification. Production data-isolation execution is a separate reviewed button action.
