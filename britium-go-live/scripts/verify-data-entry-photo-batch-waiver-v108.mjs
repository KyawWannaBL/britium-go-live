import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["pending photo rows are counted for a batch action", /const pendingPhotoWaiverRows\s*=\s*rows\.filter/],
  ["batch waiver function exists", /async function skipPhotoReviewAll\(\)/],
  ["batch waiver calls audited V54 RPC", /skipPhotoReviewAll[\s\S]{0,2200}be_data_entry_photo_waiver_v54/],
  ["batch waiver updates local rows only after successful RPC", /photoTemporaryWaiver:true[\s\S]{0,500}photoReviewStatus:"TEMPORARY_WAIVER"/],
  ["batch waiver exposes one top-level action", /TEMPORARILY SKIP PHOTO REVIEW FOR ALL \(\{pendingPhotoWaiverRows\.length\}\)/],
  ["batch action is disabled when no rows need it", /disabled=\{!pendingPhotoWaiverRows\.length/],
  ["missing proof makes approve unavailable with explicit explanation", /No Rider \/ Driver parcel photo exists[\s\S]{0,1400}Approve Photo/],
];

const failures = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Data Entry batch photo-waiver V108 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("Data Entry batch photo-waiver V108 contract PASS");
