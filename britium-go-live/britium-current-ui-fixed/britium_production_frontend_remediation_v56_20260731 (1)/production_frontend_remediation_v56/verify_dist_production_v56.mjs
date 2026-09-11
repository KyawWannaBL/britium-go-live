import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
if (!fs.existsSync(dist)) throw new Error("dist does not exist. Run npm run build first.");

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(dist);

let bundle = "";
for (const file of files) {
  try { bundle += fs.readFileSync(file, "utf8") + "\n"; } catch {}
}

const forbidden = [
  "BRITIUM GO-LIVE UAT",
  "Mobile Sandbox",
  "UAT / Go-Live Version",
  "Required UAT Screens",
  "Shwe Mart",
  "Daw Mya",
  "Local emergency fallback",
];
const forbiddenFound = forbidden.filter((value) => bundle.includes(value));
const checks = {
  dist_exists: true,
  no_forbidden_production_text: forbiddenFound.length === 0,
  final_sync_v55_marker_bundled: bundle.includes("FINAL_SYNC_CANONICAL_DATA_ENTRY_LINEAGE_V55_2026_07_31"),
  final_sync_v50_snapshot_bundled: bundle.includes("be_final_sync_snapshot_v50"),
  final_sync_v54_snapshot_not_bundled: !bundle.includes("be_final_sync_snapshot_v54"),
  production_readiness_bundled: bundle.includes("PRODUCTION_READINESS_NO_UAT_V56_2026_07_31"),
  mobile_operations_bundled: bundle.includes("MOBILE_OPERATIONS_READ_ONLY_V56_2026_07_31"),
  accounts_safe_boundary_bundled: bundle.includes("ACCOUNTS_TRUSTED_ADMIN_BOUNDARY_NO_DEMO_V56_2026_07_31"),
  admin_hr_no_fallback_bundled: bundle.includes("ADMIN_HR_READ_ONLY_NO_FALLBACK_V56_2026_07_31"),
  bizdev_live_contract_bundled: bundle.includes("be_business_development_command_v54"),
  marketing_live_contract_bundled: bundle.includes("be_live_marketing_snapshot_v54"),
  marketing_portal_contract_bundled: bundle.includes("be_marketing_portal_snapshot_v54"),
};
console.log(JSON.stringify({ ...checks, forbidden_found: forbiddenFound }, null, 2));
const failed = Object.entries(checks).filter(([, value]) => value !== true);
if (failed.length) {
  console.error(`\nBLOCKED: ${failed.map(([key]) => key).join(", ")}`);
  process.exit(1);
}
console.log("\nPASS: production dist verification V56 completed.");
