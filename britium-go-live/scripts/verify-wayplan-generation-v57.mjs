import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919014500_wayplan_multi_van_generation_v57.sql"), "utf8");

const checks = [
  ["Rider dropdown can be cleared", planner.includes('No rider — Driver only')],
  ["Rider is explicitly optional", planner.includes('data-rider-optional-v57="true"') && planner.includes("Rider (optional)")],
  ["normal roster readiness requires Driver only", planner.includes(': !p.driver_code);') && !planner.includes(': !p.driver_code || !p.rider_code);')],
  ["crew edits do not auto-refill Rider", planner.includes("Do not auto-fill Rider") && planner.includes("reset(next, true)")],
  ["route preview leaves Rider and Helper unassigned by default", planner.includes("assignCrews(strategic, drivers, [], []")],
  ["crew repair preserves intentional empty Rider", planner.includes("An empty rider_code is an intentional Driver-only route") && planner.includes("if (!plan.rider_code) rider = undefined")],
  ["auto repair targets Driver", planner.includes("Auto-assign missing Driver")],
  ["readiness explains Rider optional", planner.includes("Rider and Helper are optional")],
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
