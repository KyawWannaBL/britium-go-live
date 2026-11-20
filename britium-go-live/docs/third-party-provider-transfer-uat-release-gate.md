# Third-party Provider Transfer - UAT and Production Release Gate

Status: **BLOCKED / NOT PRODUCTION READY** (2026-11-20)

## Scope
Warehouse-ready ways belonging to Royal Express, DK Delivery, MDY/NPT branch transfer and highway terminal drop-off. Existing original Way ID, merchant, COD, and customer destination must remain unchanged. Pickup-route planning and provider-transfer routing may be coordinated operationally, but **this PR does not yet create a combined pickup-plus-transfer Wayplan**.

## Current evidence
- GitHub build validates frontend integration and static safety contracts, NOT live workflow.
- Schema-only rollback rehearsal compiles five candidate SQL files on production database and rolls back all changes. It is **not** end-to-end validation.
- Existing isolated Mandalay/Insein UAT project reports missing parcel, warehouse receipt and wayplan tables. It cannot validate real Wayplan creation.
- No approved Royal Express handover site has been installed, seeded or verified.
- The runtime gate `window.__BRITIUM_FEATURES?.providerTransferDraft === true` defaults OFF and must not be enabled until database UAT and approval. Server-side role and parcel validation remain mandatory independently of this client-side flag.
- Production shipment statuses, dispatch scans, custody evidence and finance are unchanged.

## Candidate SQL execution order on rebuilt isolated UAT only
1. `sql/candidates/provider_handover_sites_v1.sql`
2. `sql/candidates/provider_handover_site_approve_v1.sql`
3. `sql/candidates/warehouse_provider_transfer_preview_v1.sql`
4. `sql/candidates/provider_transfer_wayplan_draft_v1.sql`
5. `sql/candidates/provider_transfer_custody_v1.sql`

Apply only after migration replay and database permissions/security review. Do not apply to the production database or to the currently incomplete isolated branch.

## Required acceptance tests
1. An unauthenticated or unauthorized user cannot approve a site, draft a transfer Wayplan or record custody.
2. An unverified or deactivated site is rejected, even with valid coordinates.
3. Provider, origin branch and location must match an actual approved site; never use the recipient address as a local handover site.
4. Different providers, mismatched branches, duplicate IDs, archived/terminal ways, COD/finance-invalid ways, missing receipts, future-date holds, and existing active wayplans are rejected.
5. Driver must belong to an active workforce roster with auth mapping; selected vehicle must belong to origin branch and not be busy.
6. A previously dispatched parcel without a newer physical return scan is rejected from replanning.
7. Valid draft creation writes a Wayplan, membership, stops, deferred route version and audit event; it must NOT create dispatch scans, custody or delivery confirmations.
8. The draft enters Supervisor review; review rejects missing roster auth or invalid route, and can approve a correctly reviewed route.
9. Prior to Supervisor DISPATCH_READY release, Warehouse Dispatch Scan must reject the parcel. After authorized release and membership READY_FOR_DISPATCH, an actual physical scan creates the dispatch event.
10. Custody confirmation rejects a parcel lacking the dispatch scan, supervisor release, provider receipt reference, receiver name, manifest and evidence.
11. Custody rejects duplicate confirmation and a parcel whose return scan is later than dispatch.
12. Provider handover must be distinct from customer DELIVERED; it must not post COD settlement.
13. Royal/DK/branch/terminal outcomes must be confirmed with original provider proof. Failed, postponed and RTO paths must retain physical return-scan and Finance review controls.
14. Region/branch RLS and role segregation must hold. Failed bulk operations must be atomic and auditable.
15. Run a 10-20 parcel rehearsal for a verified provider plus at least one failure, return and replan; compare physical manifests and system histories.
16. Reconcile the original 574 finance-valid/warehouse-ready/unplanned ways by provider to ensure no duplicates and that statuses transition with evidence, not bulk overrides.
17. Confirm end-to-end route pairing with pickup ways on the same dispatch vehicle, including route order and separate custody scans. This is **not yet implemented**.

## Release decision
Only release after all tests pass, verified site(s) exist, CI and protected preview pass, and the database migration is reproducible in UAT. Deploy backend before enabling the frontend feature flag. Promote a tested production build; verify existing Warehouse and CS flows plus production error logs. Keep rollback plan for both app and database.

**Never mark pending parcels as DISPATCH_SCANNED, DELIVERED, HANDED_TO_PARTNER, RETURN_SCANNED or RTO without the corresponding physical evidence.**
