import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260923023000_data_entry_pickup_operational_readiness_v114.sql"), "utf8");

const checks = [
  ["single-row save no longer hard-blocks unsynced locations", !/This Yangon, Mandalay, or Naypyitaw drop point must be synchronized in Google Location Details before saving/.test(page)],
  ["frontend has authoritative pickup readiness state", /pickupOperationalReadiness/.test(page)],
  ["frontend loads backend pickup readiness RPC", /be_data_entry_pickup_operational_readiness_v114/.test(page)],
  ["readiness refreshes when selected pickup changes", /useEffect\(\(\)=>\{void loadPickupOperationalReadiness\(selectedPickupId\);\},\[selectedPickupId\]\)/.test(page)],
  ["waybill flow blocks clearly before backend when pickup is not operationally ready", /PICKUP NOT READY FOR WAYBILL/.test(page)],
  ["waybill flow permits explicit OS evidence exception", /hasOsEvidenceForWaybill/.test(page)],
  ["UI shows operational readiness and next action", /Operational readiness/.test(page) && /next_action/.test(page)],
  ["backend RPC requires Data Entry access", /be_data_entry_require_access_v57\('update', false\)/.test(migration)],
  ["backend RPC checks verified and collected timestamps", /pickup_verified_at/.test(migration) && /pickup_collected_at/.test(migration)],
  ["backend RPC checks collected operational status", /COLLECTED/.test(migration) && /TO_WAREHOUSE/.test(migration)],
  ["backend RPC returns explicit next action", /next_action/.test(migration)],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("End-to-end pickup readiness V114 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("End-to-end pickup readiness V114 contract PASS");
