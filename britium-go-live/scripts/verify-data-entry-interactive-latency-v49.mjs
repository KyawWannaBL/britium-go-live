import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

const checks = [
  ["V49 build marker", /DATA_ENTRY_INTERACTIVE_LATENCY_V49/],
  ["township debounce state", /debouncedTownshipQuery/],
  ["township debounce timer", /TOWNSHIP_SEARCH_DEBOUNCE_MS/],
  ["master location search uses debounced query", /searchMasterLocations\(debouncedTownshipQuery\)/],
  ["photo rejection note uses buffered input", /BufferedDataEntryInput[\s\S]{0,260}value=\{row\.photoRejectionNote\}[\s\S]{0,180}onCommit=/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);

if (/searchMasterLocations\(query\)/.test(source)) {
  failures.push("township master search still runs directly from the live keystroke query");
}
if (/value=\{row\.photoRejectionNote\}[\s\S]{0,180}onChange=\{\(e\)\s*=>\s*updateRow/.test(source)) {
  failures.push("photo rejection note still updates the full row on every keystroke");
}

if (failures.length) {
  console.error("Data Entry Interactive Latency V49 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Data Entry Interactive Latency V49 contract PASS");
