import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["bulk skip handler", /async function skipPendingClarificationAll\s*\(/],
  ["bulk pending draft upsert", /be_data_entry_pending_drafts/],
  ["bulk skip button label", /SKIP PENDING CLARIFICATION FOR ALL/],
  ["pending clarification count", /pendingClarificationRows/],
  ["batch location patch helper", /function patchImportedLocationsBatch\s*\(/],
  ["bounded validation batch size", /LOCATION_VALIDATION_BATCH_SIZE\s*=\s*\d+/],
  ["browser yield between location batches", /await\s+yieldToBrowser\s*\(\s*\)/],
  ["single batch state application marker", /DATA_ENTRY_PERFORMANCE_V40/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source));
if (failures.length) {
  console.error("Data Entry Performance V40 contract FAILED:");
  for (const [name] of failures) console.error(` - ${name}`);
  process.exit(1);
}

console.log("Data Entry Performance V40 contract PASS");
