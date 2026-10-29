# Branch waybill and workforce process implementation plan

Goal: let branch managers print first-release waybills in their custody and monitor their own crew and commissions; retain HQ Finance review and separate payout.
Architecture: reuse the existing print studio and audited release function with an explicit branch-manager path. Add guarded read-only branch workforce/report RPCs. Attribute commissions to pickup/dispatch source branch, never the worker's current branch.
Tech stack: existing React, Postgres, PGlite.
Authorization: user requested completion and delegated routine choices; proceed in the existing isolated checkout.

1. Write failing database tests for branch custody, mixed branch print requests, reprints, inactive accounts, role denial, commission source attribution after worker transfer, date bounds and zero/missing records. Use minimal synthetic tables and the versioned public print-release SQL for tests.
2. Add exact branch snapshot/release guards and read-only workforce/commission functions; run database tests. Keep all existing non-branch printing behavior and Finance permissions.
3. Write UI tests and add branch print entry and crew/commission panel, with business date, current rate policy, pending approval and payout distinction. Reuse print layouts/barcodes and preserve source Way ID and declared charges. Deny invoice/document operations for branch managers.
4. Run relevant regressions, full tests and build; independent review; fix important findings. Apply SQL, publish PR, merge and verify production deployment.

Review focus: stale data after branch/date changes; reassigned workers' historical earnings; transit custody; first print consumed even if dialog cancelled; pending Yangon trip must not be reassigned.

Execution: implemented all four steps. Baseline Mandalay tests passed. New database and UI tests observed failing before implementation, then passed. Independent review identified transfer/print custody serialization; added a failing lock-order regression and shared sorted parcel row locks, then verified green. Final npm test and npm run build passed. SQL migration 20261029200306 applied; anonymous access to new RPCs denied and existing workforce/asset allocation checked. No cash, payment, crew transfer or dispatched van state changed.

Publication review: removed live-derived schema/function test snapshots. Tests now use minimal synthetic tables and existing public migration definitions.
