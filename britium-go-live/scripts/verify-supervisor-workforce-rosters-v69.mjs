import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [
  "src/pages/SupervisorPickupAssignmentGoLivePage.tsx",
  "src/pages/SupervisorPortalPage.tsx",
  "src/pages/SupervisorPickupPage.tsx",
].map((p) => fs.readFileSync(path.join(root, p), "utf8"));

const checks = [
  ["all Supervisor assignment surfaces use approved V68 roster RPC", files.every((s) => s.includes('be_wayplan_assignment_options_v44'))],
  ["legacy nonexistent be_drivers source removed from live Supervisor assignment page", !files[0].includes('"be_drivers"')],
  ["Supervisor pickup assignment shows roster login readiness", files[0].includes("no mobile login") && files[0].includes("mobileAuthReady")],
  ["Supervisor Portal selects by workforce code", files[1].includes("return worker.code || worker.email")],
  ["Supervisor Pickup selects by workforce code", files[2].includes("return worker.code || worker.email")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Supervisor workforce roster V69 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Supervisor workforce roster V69 contract PASS");
