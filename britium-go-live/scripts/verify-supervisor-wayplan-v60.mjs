import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/SupervisorWayplanReviewPage.tsx"), "utf8");

const checks = [
  ["live supervisor snapshot RPC used", page.includes("be_wayplan_supervisor_snapshot_v43")],
  ["legacy empty snapshot RPC removed", !page.includes("be_supervisor_wayplan_snapshot")],
  ["wayplans render dynamically", page.includes("wayplans.map")],
  ["stops render dynamically", page.includes("stops.map")],
  ["submit review wired", page.includes("be_wayplan_submit_review_v45")],
  ["supervisor approval wired", page.includes("be_wayplan_supervisor_decide_v43")],
  ["dispatch preparation wired", page.includes("be_wayplan_prepare_dispatch_v43")],
  ["errors visible", page.includes("setError") && page.includes("Wayplan confirmation failed")],
  ["dispatch next step shown", page.includes("mandatory parcel scan")],
  ["V60 marker present", page.includes('data-supervisor-wayplan-v60="true"')],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Supervisor Wayplan review V60 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Supervisor Wayplan review V60 contract PASS");
