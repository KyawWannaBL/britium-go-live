import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["financial route readiness does not require map sync", !/function routeReady[\s\S]{0,400}locationStatus/.test(page)],
  ["row save obstacle does not hard-block location review", !/return "Location needs synchronization or review"/.test(page)],
  ["location readiness remains separately visible", /const locationReady = Boolean\(!route\.mapRequired \|\| row\.locationStatus==="SYNCED"\)/.test(page)],
  ["save still requires provider and station readiness", /function routeReady[\s\S]{0,300}providerCode[\s\S]{0,300}handoffStationReady/.test(page)],
  ["operator warning says location is downstream, not a save blocker", /Location review is still required before Wayplan \/ dispatch; Data Entry save and waybill creation can proceed\./.test(page)],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Waybill/location decoupling V113 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Waybill/location decoupling V113 contract PASS");
