import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["pickup eligibility helper exists", /function dataEntryPickupEligible\(pickup: Pickup\): boolean/],
  ["eligible stages include collected and warehouse states", /PICKUP_COLLECTED[\s\S]{0,500}DELIVERED_TO_WAREHOUSE[\s\S]{0,500}WAREHOUSE_ACCEPTED/],
  ["waiting rider stages are not eligible", /function dataEntryPickupEligible[\s\S]{0,500}return false/],
  ["startup selects first eligible pickup", /withRegisteredCounts\.find\(dataEntryPickupEligible\)/],
  ["normal pickup selector disables ineligible pickups", /disabled=\{!dataEntryPickupEligible\(pickup\)\}/],
  ["ineligible pickup label explains upstream stage", /WAITING FOR RIDER WORKFLOW/],
  ["calculate is disabled for ineligible normal pickup", /CALCULATE ALL[\s\S]{0,600}dataEntrySelectedEligible/],
  ["save all is disabled for ineligible normal pickup", /SAVE ALL[\s\S]{0,600}dataEntrySelectedEligible/],
  ["waybill generation is disabled for ineligible normal pickup", /GENERATE COMPLETED WAYBILLS[\s\S]{0,700}dataEntrySelectedEligible/],
  ["selected ineligible pickup shows stage guidance", /Complete Rider Accept → Start → Arrive → Verify → Collect before Data Entry can proceed/],
  ["single-row save no longer hard-blocks unsynced map location", !/must be synchronized in Google Location Details before saving/.test(page)],
  ["location remains visible as downstream review warning", /Location review is still required before Wayplan \/ dispatch/],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Operation stage gating V114 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("Operation stage gating V114 contract PASS");
