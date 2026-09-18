import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919005500_data_entry_temporary_photo_waiver_v54.sql"), "utf8");

const checks = [
  ["temporary waiver field exists", page.includes("photoTemporaryWaiver: boolean")],
  ["waiver reason field exists", page.includes("photoTemporaryWaiverReason: string")],
  ["waiver control exists", page.includes('data-photo-waiver-control-v54="true"')],
  ["waiver active banner exists", page.includes('data-temporary-photo-waiver-v54="true"')],
  ["waiver RPC is called", page.includes('be_data_entry_photo_waiver_v54')],
  ["normal photo verification can be restored", page.includes("Restore normal photo verification")],
  ["waiver requires reason", page.includes("at least 10 characters")],
  ["save gate uses approved waiver status", migration.includes("proof_check_status='APPROVED'")],
  ["waiver is audit recorded", migration.includes("DATA_ENTRY_TEMPORARY_PHOTO_WAIVER")],
  ["waiver is reversible", migration.includes("DATA_ENTRY_TEMPORARY_PHOTO_WAIVER_CLEARED")],
  ["normal workflow restored on clear", migration.includes("proof_check_status='PENDING_REVIEW'")],
  ["authentication is mandatory", migration.includes("if auth.uid() is null")],
  ["Data Entry access check remains enforced", migration.includes("be_data_entry_require_access_v57('create',false)")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Data Entry temporary photo waiver V54 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Data Entry temporary photo waiver V54 contract PASS");
