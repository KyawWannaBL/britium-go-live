import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const editor = fs.readFileSync(path.join(root, "src/components/workflow/DataEntryLocationEditor.tsx"), "utf8");

const checks = [
  ["operator edit guard exists", /const operatorEditedRef\s*=\s*useRef\(false\)/],
  ["identity reset does not depend on external candidate", /\}, \[deliveryWayId, address, township, ward, postalCode, enabled, disabledReason, reloadToken, deferAutomaticResolution\]\);/],
  ["external candidate hydration has its own guarded effect", /useEffect\(\(\) => \{[\s\S]{0,900}if \(!deferAutomaticResolution \|\| operatorEditedRef\.current\)/],
  ["manual latitude input marks operator edit", /aria-label="Latitude"[\s\S]{0,300}operatorEditedRef\.current=true/],
  ["manual longitude input marks operator edit", /aria-label="Longitude"[\s\S]{0,300}operatorEditedRef\.current=true/],
  ["map click or drag marks operator edit before syncing", /function setManualMapCoordinate[\s\S]{0,300}operatorEditedRef\.current = true/],
  ["operator edits are not cleared by parent location status echoes", !/externalResolutionStatus, externalCandidate\]/.test(editor)],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Google pin/manual coordinate sync V111 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Google pin/manual coordinate sync V111 contract PASS");
