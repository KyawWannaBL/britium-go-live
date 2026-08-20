import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] || ".");
const dist = path.join(root, "dist");
if (!fs.existsSync(dist)) {
  throw new Error("dist folder is missing. Run npm run build first.");
}

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

// Build-only exported constants can be removed by Vite/Rolldown tree-shaking when
// they are not used at runtime. Dist verification therefore checks durable
// operational markers and a compound secured-GPS contract instead of requiring
// the unused source-only constant RIDER_LIVE_TRACKING_SECURE_RPC_V62_2026_08_02.
const literalChecks = [
  "WAYPLAN_COMMAND_ROUTE_OPTIMIZATION_TRACKING_V62_2026_08_02",
  "WAYPLAN_ROUTE_OPTIMIZATION_AND_ETA_V62_2026_08_02",
  "WAYPLAN_RIDER_TRACKING_MAP_V62_2026_08_02",
  "Save Sequence + ETA",
  "LIVE RIDER ROUTE TRACKING V62",
  "Leg Distance",
  "be_wayplan_route_snapshot_v45",
  "be_wayplan_save_mapbox_route_v45",
  "be_rider_update_live_location",
  "RIDER_ROUTE_WATCH_V62",
].map((marker) => ({ name: marker, pass: combined.includes(marker) }));

const forbiddenMarkers = [
  "DIRECT_RIDER_LOCATION_TABLE_WRITE_V62",
  "SYNTHETIC_RIDER_GPS_V62",
];
const forbidden = forbiddenMarkers.filter((marker) => combined.includes(marker));

const securedGpsContract = {
  name: "SECURED_GPS_COMPOUND_CONTRACT",
  pass:
    combined.includes("be_rider_update_live_location") &&
    combined.includes("RIDER_ROUTE_WATCH_V62") &&
    forbidden.length === 0,
};

const checks = [...literalChecks, securedGpsContract];
const missing = checks.filter((check) => !check.pass).map((check) => check.name);
const ok = missing.length === 0 && forbidden.length === 0;

console.log(JSON.stringify({
  ok,
  build: "WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_0_1_DIST_VERIFY_2026_08_03",
  scanned_files: files.length,
  required_markers_present: checks.length - missing.length,
  required_markers_total: checks.length,
  missing,
  forbidden_found: forbidden,
  route_optimization_present: combined.includes("Save Sequence + ETA"),
  live_rider_tracking_present: combined.includes("LIVE RIDER ROUTE TRACKING V62"),
  secured_gps_rpc_present: combined.includes("be_rider_update_live_location"),
  secured_gps_source_present: combined.includes("RIDER_ROUTE_WATCH_V62"),
  secured_gps_compound_contract_passed: securedGpsContract.pass,
  unused_source_build_marker_required_in_dist: false,
  verifier_only_correction: true,
  application_source_changed: false,
  rebuild_required: false,
  deploy_performed: false,
}, null, 2));

if (!ok) process.exit(1);
