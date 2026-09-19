import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DispatchCommandCenterPage.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919113000_dispatch_command_v63.sql"), "utf8");

const checks = [
  ["V63 snapshot RPC used", page.includes("be_dispatch_command_snapshot_v63")],
  ["legacy snapshot removed", !page.includes("be_enterprise_dispatch_snapshot")],
  ["guarded dispatch start used", page.includes("be_dispatch_start_wayplan")],
  ["legacy publish RPC removed", !page.includes("be_publish_wayplan_to_dispatch")],
  ["publish button requires publish_ready", page.includes("selectedPlan?.publish_ready")],
  ["progress panel exists", page.includes('data-dispatch-wayplan-progress-v63="true"')],
  ["polling fallback exists", page.includes("setInterval(() => { void loadAll(true); }, 15000)")],
  ["realtime fallback label is polling", page.includes('"POLLING"')],
  ["canonical V40/V43 source marker exists", migration.includes("CANONICAL_WAYPLAN_V40_V43")],
  ["snapshot exposes supervisor next step", migration.includes("Supervisor approval required")],
  ["snapshot exposes mandatory scan count", migration.includes("scan_remaining") && migration.includes("scanned_count")],
  ["dispatch scan index added", migration.includes("be_dispatch_scans_v39_wayplan_status_idx")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Dispatch Command V63 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Dispatch Command V63 contract PASS");
