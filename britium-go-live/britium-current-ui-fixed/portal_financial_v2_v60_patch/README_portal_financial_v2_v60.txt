BRITIUM PORTAL FINANCIAL V2 V60
Production remediation package - 2026-08-02

PURPOSE
- Replace the active legacy Data Entry route with a backend-authoritative Financial V2 page.
- Use be_data_entry_financial_v2_schema, snapshot, calculate, save, import and create_waybill contracts.
- Make server-controlled financial and identity fields read-only.
- Remove the browser-side legacy tariff and Data Entry hard-wire bootstraps from the active entry point.
- Replace the 15-field parcel template with the canonical 50-field workbook.
- Add production-named Data Entry, Merchant/Customer and Warehouse templates.
- Remove public UAT routes/assets and visible production UAT branding.

SAFETY
- This package does not change Supabase SQL, data or RLS.
- This package does not enable Financial V2 writes.
- VITE_FINANCIAL_V2_WRITES_ENABLED remains false by default.
- Keep the backend in MUTATION_SHADOW until a separately approved activation gate.
- The installer performs no build and no deployment.
- The installer creates a timestamped backup under production_backups/.
- The installer refuses to write if the reviewed source files no longer match the collector snapshot.

APPLY FROM THE MAIN PORTAL REPOSITORY
  node ./portal_financial_v2_v60_patch/apply_portal_financial_v2_v60.mjs .

VERIFY SOURCE
  node ./portal_financial_v2_v60_patch/verify_portal_financial_v2_v60.mjs .

BUILD
  rm -rf dist node_modules/.vite
  npm run build

VERIFY DIST
  node ./portal_financial_v2_v60_patch/verify_dist_portal_financial_v2_v60.mjs .

REQUIRED GATES
- Installer output: ok true
- Source verifier: 26/26 checks pass
- npm run build: successful
- Dist verifier: ok true
- Browser smoke test on /#/data-entry:
  * no UAT badge
  * backend schema shows 50 fields
  * Way ID is read-only/server-controlled
  * no local tariff assumption is displayed
  * calculation comes from the backend RPC
  * mutation gate says Shadow / dry-run only
  * no production save is performed during smoke testing

DEPLOYMENT
Do not deploy until both verifiers pass. Use the already-linked Vercel project from the main portal repository. After deployment, verify the exact deployment and the custom production domain. This package does not prove browser rendering until that smoke test is completed.

ROLLBACK
Restore the affected files from the timestamped production_backups/portal_financial_v2_v60_* directory. Do not roll back or modify production database records as part of this frontend rollback.

SCOPE LIMIT
This package remediates the production Data Entry contract, templates and UAT presentation shown in the reported screenshot. It does not claim completion of every module in the 177-page V5.2 master specification. Network fulfillment, Accounts, Admin/HR, BD, Marketing and remaining activation decisions require their own gated workstreams.
