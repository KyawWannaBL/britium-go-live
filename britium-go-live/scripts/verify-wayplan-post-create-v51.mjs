import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const planner = fs.readFileSync(path.join(root, "src", "components", "MultiVanPlanner.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx"), "utf8");

const checks = [
  ["creation shows progress", planner.includes('Creating reviewed Wayplans…')],
  ["creation has bounded timeout", planner.includes('No response from Wayplan creation after 60 seconds')],
  ["creation returns created IDs", planner.includes('created_wayplan_ids: createdIds')],
  ["parent handles created IDs", page.includes("async function handleMultiVanSaved(result: any)")],
  ["newly created Wayplan is preferred after refresh", page.includes("await loadAll(firstId)")],
  ["post-create scroll target exists", page.includes('id="generated-wayplans"')],
  ["next-process guidance exists", page.includes('data-wayplan-next-process-v51="true"')],
  ["supervisor approval guidance exists", page.includes("Complete Supervisor approval")],
  ["mandatory dispatch scan guidance exists", page.includes("mandatory Dispatch parcel scan")],
  ["dispatch error surfaces backend next step", page.includes('data?.next_step')],
  ["legacy single-wayplan button removed by V50 build patch", !page.includes("Generate from {selectedRows.length} selected")],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Wayplan post-create V51 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("Wayplan post-create V51 contract PASS");
