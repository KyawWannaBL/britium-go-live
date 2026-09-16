import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

const requiredBufferedFields = [
  "item_price",
  "delivery_charges",
  "merchant_stated_total_amount",
  "cbm_surcharge",
  "other_surcharge",
  "handoffStationName",
];

const failures = [];
for (const field of requiredBufferedFields) {
  const directPattern = new RegExp(`<input[^>]*value=\\{row\\.${field}\\}[^>]*onChange=\\{[^}]*updateRow`, "s");
  if (directPattern.test(source)) failures.push(`${field} still commits on every keystroke`);
}

if (!source.includes("DATA_ENTRY_INPUT_LATENCY_V42")) failures.push("V42 build marker missing");

if (failures.length) {
  console.error("Data Entry Input Latency V42 contract FAILED:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("Data Entry Input Latency V42 contract PASS");
