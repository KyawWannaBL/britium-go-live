import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/WayplanCommandCenterPage.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919023000_wayplan_lifecycle_v61.sql"), "utf8");

const checks = [
  ["lifecycle controls marker exists", page.includes('data-wayplan-lifecycle-controls-v61="true"')],
  ["Complete is limited to DISPATCHED", page.includes('String(activeWayplan.wayplan_status || "").toUpperCase() !== "DISPATCHED"')],
  ["Reopen is limited to ON_HOLD", page.includes('String(activeWayplan.wayplan_status || "").toUpperCase() !== "ON_HOLD"')],
  ["CREATED lifecycle note points to Supervisor", page.includes("CREATED Wayplans must go to") && page.includes("Supervisor Wayplan")],
  ["backend blocks premature completion", migration.includes("PREMATURE_COMPLETE_BLOCKED_V61")],
  ["backend checks terminal stops", migration.includes("WAYPLAN_NOT_FINISHED_V61") && migration.includes("active_stops")],
  ["dispatch still uses integrity guard", migration.includes("be_dispatch_wayplan_integrity_v12_11")],
  ["new CREATED plans get DRAFT review", migration.includes("be_wayplan_ensure_review_v61") && migration.includes("'DRAFT'")],
  ["known 67-stop plan repair exists", migration.includes("WP-20260918-1420f02f-071c-4e80-aed6-0119c21fd188-1")],
  ["repair restores CREATED state", migration.includes("lifecycle_repair") && migration.includes("PREMATURE_COMPLETED_TO_CREATED")],
  ["repair preserves audit", migration.includes("WAYPLAN_LIFECYCLE_REPAIRED_V61")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan lifecycle V61 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan lifecycle V61 contract PASS");
