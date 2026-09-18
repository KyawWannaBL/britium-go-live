import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");

const checks = [
  ["crew edits preserve below-minimum approval", planner.includes("reset(repairCrewGaps(next), true)") || planner.includes("reset(next, true)")],
  ["route reoptimization preserves approval", planner.includes("reset(plans.map((p, j) => j === index ? optimized : p), true)")],
  ["explicit readiness panel exists", planner.includes('data-wayplan-create-readiness-v56="true"')],
  ["final button exposes readiness state", planner.includes('data-create-reviewed-wayplans-v56="true"')],
  ["missing driver is explained", planner.includes("choose a Driver")],
  ["rider handling is explicit", planner.includes("choose a Rider") || planner.includes("Rider (optional)")],
  ["auto crew repair exists", planner.includes("Auto-assign missing Driver / Rider") || planner.includes("Auto-assign missing Driver")],
  ["driver requirement and rider role are explicit", planner.includes("Driver *") && (planner.includes("Rider *") || planner.includes("Rider (optional)"))],
  ["button is controlled by readiness issues", planner.includes("const cannotSave = busy || readinessIssues.length > 0")],
  ["below-50 approval is explicit", planner.includes("Approve the one route below 50 parcels")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan create readiness V56 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan create readiness V56 contract PASS");
