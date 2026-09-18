import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataEntryPath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
const reconciliationPath = path.join(root, "src/dataEntryPickupReconciliationEnhancer.ts");
const page = fs.readFileSync(dataEntryPath, "utf8");
const reconciliation = fs.readFileSync(reconciliationPath, "utf8");

const checks = [
  ["Data Processing Tools defaults collapsed", /const \[quickToolsOpen,setQuickToolsOpen\]=useState\(false\)/],
  ["Data Processing Tools has compact launcher", /data-quick-tools-toggle="true"/],
  ["Data Processing Tools panel is conditional", /quickToolsOpen\?\(/],
  ["Data Processing Tools has close control", /aria-label="Close Data Processing Tools"/],
  ["Pickup Reconciliation has launcher id", /RECONCILIATION_TOGGLE_ID/],
  ["Pickup Reconciliation panel defaults hidden", /panel\.style\.display\s*=\s*"none"/],
  ["Pickup Reconciliation launcher toggles panel", /toggleReconciliationPanel/],
  ["Pickup Reconciliation has close control", /Close Pickup Reconciliation/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(page + "\n" + reconciliation)).map(([name]) => name);

if (/fixed bottom-6 right-6 z-\[9999\][^\n]*w-72/.test(page) && !/quickToolsOpen\?\(/.test(page)) {
  failures.push("Data Processing Tools still mounts as an always-open fixed overlay");
}
if (/panel\.style\.cssText\s*=\s*"position:fixed/.test(reconciliation) && !/panel\.style\.display\s*=\s*"none"/.test(reconciliation)) {
  failures.push("Pickup Reconciliation still mounts as an always-open fixed overlay");
}

if (failures.length) {
  console.error("Data Entry Utility Panels V50 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Data Entry Utility Panels V50 contract PASS");
