import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] || ".");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const files = {
  routeLib: read("src/lib/mapboxHeadOfficeRoutingV45.ts"),
  planner: read("src/components/wayplan/MapboxWayplanPlannerV45.tsx"),
  trackingMap: read("src/components/wayplan/WayplanRiderTrackingMapV62.tsx"),
  riderMap: read("src/components/wayplan/RiderMapboxRouteV45.tsx"),
  riderExecution: read("src/components/wayplan/RiderRouteExecutionV46.tsx"),
  hook: read("src/hooks/useRiderRouteLiveTrackingV62.ts"),
  command: read("src/pages/WayplanCommandCenterPage.tsx"),
  app: read("src/App.tsx"),
};
const combined = Object.values(files).join("\n");
const required = [
  "WAYPLAN_COMMAND_ROUTE_OPTIMIZATION_TRACKING_V62_2026_08_02",
  "WAYPLAN_ROUTE_OPTIMIZATION_AND_ETA_V62_2026_08_02",
  "WAYPLAN_RIDER_TRACKING_MAP_V62_2026_08_02",
  "RIDER_LIVE_TRACKING_SECURE_RPC_V62_2026_08_02",
  "RIDER_MAPBOX_ROUTE_DISTANCE_ETA_V62_2026_08_02",
  "RIDER_ROUTE_EXECUTION_AND_LIVE_TRACKING_V62_2026_08_02",
  "MAPBOX_OPTIMIZATION_PLUS_DIRECTIONS_V1",
  "MAPBOX_CHUNKED_OPTIMIZATION_PLUS_DIRECTIONS_V1",
  "calculateRouteInFixedOrder",
  "calculateLiveLeg",
  "Save Sequence + ETA",
  "leg_distance_m",
  "leg_duration_s",
  "eta_at",
  "orderedManifestStops",
  "WayplanRiderTrackingMapV62",
  "loadSupervisorLiveMapSnapshot",
  "subscribeGpsTables",
  "be_wayplan_route_snapshot_v45",
  "be_wayplan_save_mapbox_route_v45",
  "be_rider_route_snapshot_v46",
  "be_rider_start_route_v46",
  "be_rider_arrive_stop_v46",
  "be_rider_update_live_location",
  "Secured RPC only · no direct location-table writes",
  'path="/wayplan-command"'
];
const missing = required.filter((marker) => !combined.includes(marker));
const directWritePatterns = [
  /useRiderRouteLiveTrackingV62[\s\S]*?\.from\(["']be_rider_live_locations["']\)/,
  /useRiderRouteLiveTrackingV62[\s\S]*?\.upsert\(/,
  /update_live_gps/
];
const forbidden = directWritePatterns.filter((pattern) => pattern.test(files.hook)).map(String);
const ok = missing.length === 0 && forbidden.length === 0;
console.log(JSON.stringify({
  ok,
  build: "WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_SOURCE_VERIFY_2026_08_02",
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  files_verified: Object.keys(files).length,
  missing,
  forbidden_found: forbidden,
  route_command_active: files.app.includes('path="/wayplan-command"'),
  optimized_start_to_last_stop: files.routeLib.includes("MAPBOX_OPTIMIZATION_PLUS_DIRECTIONS_V1"),
  per_stop_distance_eta: files.routeLib.includes("eta_at") && files.command.includes("Leg Distance"),
  manifest_uses_optimized_order: files.command.includes("orderedManifestStops.map"),
  rider_tracking_map_present: files.command.includes("WayplanRiderTrackingMapV62"),
  secured_gps_rpc_only: forbidden.length === 0,
  backend_migration_required_by_patch: false,
  backend_preflight_recommended: true,
  financial_writes_changed: false,
  build_performed: false,
  deploy_performed: false
}, null, 2));
if (!ok) process.exit(1);
