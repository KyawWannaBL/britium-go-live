import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919014500_wayplan_multi_van_generation_v57.sql"), "utf8");

const checks = [
  ["crew is selected explicitly", planner.includes("Crew is intentionally not auto-assigned")],
  ["vehicle mode controls required roster", planner.includes("return riderOnly ? !p.rider_code : !p.driver_code;")],
  ["crew edits preserve the reviewed route", planner.includes("reset(next, true)")],
  ["bike requires Rider and no vehicle crew", planner.includes("Motor Bike/Bicycle mode: Rider is required. Driver and Helper are disabled.")],
  ["van requires Driver with optional Helper", planner.includes("Vehicle crew mode: Driver is required, Helper is optional, and Rider is disabled.")],
  ["RPC ambiguity is fixed", migration.includes("#variable_conflict use_variable")],
  ["RPC allows empty roster Rider", migration.includes("Choose an active Rider or leave Rider empty")],
  ["RPC guards nullable Rider branch", migration.includes("rider is not null and coalesce(rider->>'branch_code'")],
  ["RPC response identifies V57", migration.includes("WAYPLAN_MULTI_VAN_GENERATE_V57")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan generation V57 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan generation V57 contract PASS");

await import("./verify-wayplan-vehicle-driven-crew-v148.mjs");
