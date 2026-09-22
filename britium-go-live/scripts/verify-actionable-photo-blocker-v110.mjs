import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["photo-blocked waybill errors are detected", /const photoApprovalBlocked\s*=\s*waybillMessageKind==="ERROR"[\s\S]{0,300}Photo approval required/],
  ["error banner exposes direct batch photo recovery", /photoApprovalBlocked[\s\S]{0,900}TEMPORARILY SKIP PHOTO REVIEW FOR ALL \(\{pendingPhotoWaiverRows\.length\}\)/],
  ["banner recovery uses the audited batch waiver handler", /photoApprovalBlocked[\s\S]{0,900}onClick=\{\(\)=>void skipPhotoReviewAll\(\)\}/],
  ["successful batch waiver clears stale waybill error", /Temporary photo-verification waiver recorded for[\s\S]{0,500}setWaybillMessage\(""\)/],
  ["successful batch waiver tells operator the exact next steps", /Run Calculate All, then Save All, then Generate Completed Waybills/],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Actionable photo blocker V110 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Actionable photo blocker V110 contract PASS");
