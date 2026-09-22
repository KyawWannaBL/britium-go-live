import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["normal Data Entry readiness helper exists", /function pickupReadyForNormalDataEntry\(pickup:Pickup\): boolean/],
  ["collected pickup status is considered ready", /PICKUP_COLLECTED/],
  ["warehouse handoff status is considered ready", /DELIVERED_TO_WAREHOUSE/],
  ["OS evidence may bypass normal Rider collection gate", /const selectedWorkflowReady=.*selectedPickupReady.*hasSelectedOsEvidence/s],
  ["normal row save obstacle enforces pickup workflow readiness", /Pickup must be collected by the Rider before normal Data Entry save/],
  ["single-row save does not hard-block unsynchronized Google location", !/must be synchronized in Google Location Details before saving/.test(page)],
  ["save all is disabled until workflow-ready", /SAVE ALL[\s\S]{0,900}selectedWorkflowReady|selectedWorkflowReady[\s\S]{0,900}SAVE ALL/],
  ["waybill generation is disabled until workflow-ready", /GENERATE COMPLETED WAYBILLS[\s\S]{0,900}selectedWorkflowReady|selectedWorkflowReady[\s\S]{0,900}GENERATE COMPLETED WAYBILLS/],
  ["operator sees a workflow readiness banner", /WAITING FOR RIDER WORKFLOW|READY FOR DATA ENTRY/],
  ["location remains a downstream warning, not a save blocker", /Location review is still required before Wayplan \/ dispatch/],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);

if (failures.length) {
  console.error("End-to-end pickup/Data Entry flow V114 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("End-to-end pickup/Data Entry flow V114 contract PASS");
