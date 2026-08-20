import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] || ".");
const dist = path.join(root, "dist");
if (!fs.existsSync(dist)) throw new Error("dist folder is missing. Run npm run build first.");
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/i.test(entry.name)) files.push(full);
  }
}
walk(dist);
const combined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const required = [
  "WAYPLAN_COMMAND_ROUTE_OPTIMIZATION_TRACKING_V62_2026_08_02",
  "WAYPLAN_ROUTE_OPTIMIZATION_AND_ETA_V62_2026_08_02",
  "WAYPLAN_RIDER_TRACKING_MAP_V62_2026_08_02",
  "RIDER_LIVE_TRACKING_SECURE_RPC_V62_2026_08_02",
  "Save Sequence + ETA",
  "LIVE RIDER ROUTE TRACKING V62",
  "Leg Distance",
  "be_wayplan_route_snapshot_v45",
  "be_wayplan_save_mapbox_route_v45",
  "be_rider_update_live_location",
  "RIDER_ROUTE_WATCH_V62"
];
const missing = required.filter((marker) => !combined.includes(marker));
const forbidden = ["DIRECT_RIDER_LOCATION_TABLE_WRITE_V62", "SYNTHETIC_RIDER_GPS_V62"].filter((marker) => combined.includes(marker));
const ok = missing.length === 0 && forbidden.length === 0;
console.log(JSON.stringify({
  ok,
  build: "WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_DIST_VERIFY_2026_08_02",
  scanned_files: files.length,
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_found: forbidden,
  route_optimization_present: combined.includes("Save Sequence + ETA"),
  live_rider_tracking_present: combined.includes("LIVE RIDER ROUTE TRACKING V62"),
  secured_gps_rpc_present: combined.includes("be_rider_update_live_location"),
  deploy_performed: false
}, null, 2));
if (!ok) process.exit(1);
