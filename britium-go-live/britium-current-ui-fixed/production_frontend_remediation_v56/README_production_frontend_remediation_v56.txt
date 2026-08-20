BRITIUM PRODUCTION FRONTEND REMEDIATION V56
Build date: 2026-07-31
Target: production React/Vite portal

THIS PACKAGE CHANGES
1. Final Synchronization now consumes be_final_sync_snapshot_v50 V55 fields.
   - Displays canonical Pickup separately from recorded audit-only Pickup.
   - Uses server lineage_valid and lineage_status.
   - Blocks manual resolution of canonical lineage variances.
   - Adds lineage filters, metrics, details, and CSV fields.
2. Retired UAT modules are removed from the active route registry.
   - /data-entry-uat redirects to /data-entry.
   - /warehouse-uat redirects to /warehouse.
   - /go-live-readiness uses ProductionReadinessPage.
3. /mobile-operations is separated from /rider-app.
   - Rider App remains the field application.
   - Mobile Operations is read-only and uses be_mobile_operations_snapshot_v54.
4. Admin/HR no longer displays fallback employees.
   - The page remains read-only until secured HR mutations are deployed.
5. Accounts no longer displays HARDCODED_EMPLOYEES or fake controls.
   - Only the authenticated self-session is shown.
   - Privileged browser actions are disabled.
6. Active Business Development, Marketing, and Marketing Portal pages no longer
   use zero-filled KPIs, generic control-tower data, static leads, or daily tasks.
   They call their required V54 snapshot contracts and show explicit RPC error or
   real empty states when the contracts are not yet deployed.

THIS PACKAGE DOES NOT CLAIM TO COMPLETE
- Financial V2 Data Entry backend or page replacement.
- Mobile mutation RPCs.
- Secured HR mutation RPCs.
- Trusted account-admin Edge Function and account mutation RPCs.
- Business Development or Marketing backend snapshot/mutation deployment.

INSTALL
From the portal repository root in Git Bash:

  tar -xzf britium_production_frontend_remediation_v56_20260731.tgz
  node production_frontend_remediation_v56/apply_production_frontend_remediation_v56.mjs
  node production_frontend_remediation_v56/verify_production_frontend_remediation_v56.mjs

The installer creates timestamped .bak-production-v56-* backups.

BUILD

  rm -rf dist node_modules/.vite
  npm run build
  node production_frontend_remediation_v56/verify_dist_production_v56.mjs

Do not deploy when either verifier exits with an error.

NEXT BACKEND INVENTORY
Run inventory_remaining_backend_v56.sql in the production Supabase SQL editor.
It is read-only. Export all result sets and upload them before creating the
Financial V2, HR, Accounts, Mobile, Business Development, or Marketing SQL.
