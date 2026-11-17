import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const commandCenter = fs.readFileSync(path.join(root, "src/pages/WayplanCommandCenterPage.tsx"), "utf8");

const checks = [
  ["Publish readiness verifies every manifest stop against current reschedule predicate", commandCenter.includes('be_delivery_schedule_allows_wayplan_v71') && commandCenter.includes('rawStops.length !== ids.length')],
  ["Publish readiness shows exact held Way IDs", commandCenter.includes('data-dispatch-reschedule-holds="true"') && commandCenter.includes('RESCHEDULE_OR_RETURN_HOLD: ')],
  ["Unverified dispatch eligibility fails closed", commandCenter.includes('DISPATCH_ELIGIBILITY_NOT_VERIFIED: ') && commandCenter.includes('issues.length === 0')],
  ["crew edits preserve below-minimum approval", planner.includes("reset(repairCrewGaps(next), true)") || planner.includes("reset(next, true)")],
  ["route reoptimization preserves approval", planner.includes("reset(plans.map((p, j) => j === index ? optimized : p), true)")],
  ["explicit readiness panel exists", planner.includes('data-wayplan-create-readiness-v56="true"')],
  ["final button exposes readiness state", planner.includes('data-create-reviewed-wayplans-v56="true"')],
  ["missing driver is explained", planner.includes("choose a Driver")],
  ["rider handling is explicit", planner.includes("choose a Rider") || planner.includes("Rider (optional)")],
  ["crew selection starts with vehicle", planner.includes("Choose vehicle first") && planner.includes("Crew is intentionally not auto-assigned")],
  ["vehicle-specific driver and rider requirements are explicit", planner.includes("choose a Driver for the selected vehicle") && planner.includes("choose a Rider for the Motor Bike/Bicycle")],
  ["button is controlled by readiness issues", planner.includes("const cannotSave = busy || readinessIssues.length > 0")],
  ["Unauthenticated roster members cannot be assigned", planner.includes('x.mobile_auth_ready !== false') && planner.includes('AUTH MAPPING REQUIRED')],
  ["Crew readiness validates availability and authentication", planner.includes('selected Rider is busy or lacks active Rider App authentication') && planner.includes('selected Driver is busy or lacks active Field App authentication')],
  ["A rejected Rider is not silently restored", !planner.includes('rider_code: plans[index]?.rider_code || ""')],
  ["Bicycle crews cannot be auto-repaired with a Driver", planner.includes('if (isRiderOnlyVehicle(plan.vehicle_code)) {') && planner.includes('driver_code: "", rider_code: rider?.id || "", helper_code: ""')],
  ["Dispatch eligibility checked before generation", planner.includes('await findDispatchHeldWays(wayIds)') && planner.indexOf('await findDispatchHeldWays(wayIds)') < planner.indexOf('supabase.rpc("be_generate_multi_van_v43"')],
  ["Dispatch preflight uses authoritative reschedule predicate", planner.includes('be_delivery_schedule_allows_wayplan_v71')],
  ["Duplicate Way IDs block create", planner.includes('const duplicate = Array.from(new Set(wayIds.filter(')],
  ["Held parcels can be excluded only with operator action", planner.includes('data-wayplan-dispatch-preflight-v221="true"') && planner.includes('onClick={excludeBlockedWays}')],

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
