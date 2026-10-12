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
  ["crew selection starts with vehicle", planner.includes("Choose vehicle first") && planner.includes("Crew is intentionally not auto-assigned")],
  ["vehicle-specific driver and rider requirements are explicit", planner.includes("choose a Driver for the selected vehicle") && planner.includes("choose a Rider for the Motor Bike/Bicycle")],
  ["button is controlled by readiness issues", planner.includes("const cannotSave = busy || readinessIssues.length > 0")],
  ["below-50 approval is explicit for Driver/van-only routes", planner.includes("Approve one Driver/vehicle-crew route below 50 parcels")],
  ["Rider-selected route minimum exemption is explicit", planner.includes('data-rider-minimum-exempt-v84="true"') && planner.includes("Rider assignment: no minimum parcel count")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan create readiness V56 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan create readiness V56 contract PASS");

await import("./verify-wayplan-vehicle-driven-crew-v148.mjs");
