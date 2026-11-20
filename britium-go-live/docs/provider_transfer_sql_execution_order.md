# Britium Express — Provider Transfer Go-Live SQL Execution Order

**As of 20 November 2026 — Development branch, not yet approved for production activation.**

## Step 0 — Execute now (read-only)
Run `sql/candidates/00_provider_backlog_readonly_preflight.sql` against the intended database.
Confirm the parcel, warehouse, dispatch, review and return tables exist. Do not update the pending records to make the count smaller.

## Step 1 — Reconstruct isolated UAT before installation
The former Mandalay/Insein UAT project is missing core business objects. Restore the full operational schema and role/branch mappings from reviewed, ordered migrations into isolated UAT first. Do **not** run the install SQL against that incomplete schema; it will refuse the installation.

## Step 2 — Execute installation in *complete isolated UAT only*
Run `sql/candidates/10_provider_transfer_install_UAT_only.sql` as one SQL script.
It installs eight components: approved-site registry, site approval, default-OFF release control, provider preview, draft Wayplan creator, evidence-based custody ledger, mixed pickup staging and mixed itinerary approval gate.

No parcels, Wayplans, scans, custody records, COD balances, RTO or customer delivery statuses are created by installation. The release control row begins with all three capabilities OFF.

## Step 3 — Verify real physical locations
In the Warehouse Pending Management panel, an authorized manager must select an existing, active physical service-location code, verify the coordinates and receiving personnel, and record the verification note. Do not seed invented provider locations or use recipient addresses as provider depots.

## Step 4 — Run *positive* UAT with staff accounts and test parcels
- Create a transfer draft, verify membership, provider, finance, Way ID and crew.
- Attach an uncollected pickup to the same physical vehicle plan, with verified pickup location and signed route itinerary.
- Test missing coordinates, mismatched provider, duplicate Way ID, future reschedule, prior dispatch without return and invalid staff/vehicle rejection.
- Verify Supervisor approval cannot proceed without the complete pickup+provider physical itinerary.
- Physically scan each parcel for dispatch. Check proof and provider signed acceptance at the approved site.
- Confirm handover is NOT customer Delivered and COD is NOT settled.
- Test customer delivery, provider refusal, physical warehouse return scan, second transfer attempt and RTO according to actual evidence.
- Verify the Operation Manager / delegated Super Admin roles and branch access.

## Step 5 — Enable approved capabilities through Super Admin UI
Only after actual end-to-end UAT and site signoff, use the Management Release Control panel and provide a 20+ character approved test/rollback evidence reference.
The server validates permissions and verified sites and records the approval in Audit Events.
Do not edit browser globals to enable features or grant table permissions directly.

## Step 6 — Production release
Require a passed current branch build, reviewed PR, latest database backup and a dry-run migration replay. Apply the reviewed installation in production with the feature switches OFF, validate `90_provider_transfer_readonly_postflight.sql`, then approve capabilities and deploy/verify the exact tested frontend version.

Production rollback: disable all three flags using the authorized Super Admin release control, keep the custody audit records intact, and roll back the frontend if needed. Never drop active custody or historical wayplan data to simulate a rollback.

## Step 7 — Reconcile warehouse backlog
Run `sql/candidates/90_provider_transfer_readonly_postflight.sql` after installation. Group by provider and origin branch. Clear cases **only** through physical Warehouse→Supervisor→Dispatch Scan→signed provider receipt→customer confirmation or Warehouse Return Scan→RTO workflows. Do not mass-update the 574 ready/unplanned parcels to DISPATCHED, DELIVERED or RTO.

## Individual SQL components (for review)
- `provider_handover_sites_v1.sql`
- `provider_handover_site_approve_v1.sql`
- `provider_transfer_release_control_v1.sql`
- `warehouse_provider_transfer_preview_v1.sql`
- `provider_transfer_wayplan_draft_v1.sql`
- `provider_transfer_custody_v1.sql`
- `provider_transfer_mixed_pickups_v1.sql`
- `provider_transfer_mixed_route_gate_v1.sql`
