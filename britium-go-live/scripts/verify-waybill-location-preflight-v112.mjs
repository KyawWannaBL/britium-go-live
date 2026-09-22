import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

const checks = [
  ["batch location preflight exists", /async function synchronizePendingLocationsForWaybill\(/],
  ["preflight covers every unsynced map-required row, not only imports", /routeForRow\(row,tariffOptions\)\.mapRequired[\s\S]{0,180}row\.locationStatus!=="SYNCED"/],
  ["accepted candidates are persisted to the location registry", /synchronizePendingLocationsForWaybill[\s\S]{0,2400}saveDeliveryLocation\(supabase,accepted\)/],
  ["review-only results remain review-required", /reviewStatus==="MANUAL_REVIEW"[\s\S]{0,350}locationStatus:"REVIEW_REQUIRED"/],
  ["preflight returns updated rows for the same waybill attempt", /return nextRows;/],
  ["waybill generation runs location preflight before persistence", /createAndGenerateWaybill[\s\S]{0,900}synchronizePendingLocationsForWaybill\(rows\)[\s\S]{0,900}persistAllRows\("SAVE_ALL_BEFORE_GENERATE_WAYBILL",workingRows\)/],
  ["persistAllRows accepts the preflight row set", /async function persistAllRows\(reason:string,sourceRows:ParcelRow\[]=rows\)/],
  ["blocked rows are evaluated from the preflight row set", /const blocked=sourceRows\.filter/],
  ["pending rows are evaluated from the preflight row set", /const pendingRows=sourceRows\.filter/],
  ["pickup review selector has dedicated white-control hook", /data-pickup-review-select="true"/],
  ["pickup review selector is forced white with dark text", /html body select\[data-pickup-review-select="true"\][\s\S]{0,220}background-color:\s*#ffffff\s*!important[\s\S]{0,220}color:\s*#061524\s*!important/],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Waybill location preflight V112 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("Waybill location preflight V112 contract PASS");
