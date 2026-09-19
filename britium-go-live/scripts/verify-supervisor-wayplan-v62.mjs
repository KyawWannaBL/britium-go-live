import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/SupervisorWayplanReviewPage.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919105500_supervisor_wayplan_fast_v62.sql"), "utf8");

const checks = [
  ["fast list RPC used", page.includes("be_wayplan_supervisor_list_v62")],
  ["fast detail RPC used", page.includes("be_wayplan_supervisor_detail_v62")],
  ["legacy heavy snapshot removed from page", !page.includes("be_wayplan_supervisor_snapshot_v43")],
  ["detail loads only for selected Wayplan", page.includes("useEffect(() => {\n    void loadDetail(selectedId)")],
  ["selected detail loading state exists", page.includes("Loading selected Wayplan details")],
  ["wayplan stop index added", migration.includes("be_wayplan_dispatch_stops_wayplan_idx")],
  ["fast list avoids warehouse receipt view", !migration.includes("be_v_warehouse_receipt_v39")],
  ["fast detail uses indexed dispatch stops", migration.includes("from public.be_wayplan_dispatch_stops s")],
  ["fast list build marker exists", migration.includes("SUPERVISOR_WAYPLAN_V62_FAST_LIST")],
  ["fast detail build marker exists", migration.includes("SUPERVISOR_WAYPLAN_V62_FAST_DETAIL")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Supervisor Wayplan V62 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Supervisor Wayplan V62 contract PASS");
