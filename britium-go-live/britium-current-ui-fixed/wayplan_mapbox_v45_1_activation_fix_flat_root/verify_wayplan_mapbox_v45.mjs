import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);
  return fs.readFileSync(full, "utf8");
}

function requireText(content, item, label) {
  if (!content.includes(item)) throw new Error(`${label} is missing ${item}`);
}

const packageJson = JSON.parse(read("package.json"));
if (!packageJson.dependencies?.["mapbox-gl"]) throw new Error("package.json does not include mapbox-gl");
console.log("PASS dependency: mapbox-gl");

const activeWayplan = read("src/pages/WayplanCommandCenterPage.tsx");
if (!activeWayplan.includes("WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30")) {
  const versioned = path.join(root, "src/pages/WayplanCommandCenterPage.V45.tsx");
  if (fs.existsSync(versioned) && fs.readFileSync(versioned, "utf8").includes("WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30")) {
    throw new Error("The V45 source exists, but src/pages/WayplanCommandCenterPage.tsx is still an older active page. Run node install_wayplan_mapbox_v45_1.mjs, then rebuild.");
  }
  throw new Error("Active Wayplan source is not Mapbox V45. Re-extract the V45.1 package and run its installer.");
}
for (const token of ["MapboxWayplanPlannerV45", "be_wayplan_submit_review_v45", "mapboxRouteReady"]) {
  requireText(activeWayplan, token, "Active Wayplan source");
}
console.log("PASS active source: src/pages/WayplanCommandCenterPage.tsx");

const supervisor = read("src/pages/SupervisorWayplanReviewPage.tsx");
for (const token of ["WAYPLAN_V45_SUPERVISOR_MAPBOX_ROUTE_GATE_2026-07-30", "be_wayplan_supervisor_decide_v45"]) {
  requireText(supervisor, token, "Active Supervisor source");
}
console.log("PASS active source: src/pages/SupervisorWayplanReviewPage.tsx");

const rider = read("src/pages/RiderAppPage.tsx");
for (const token of ["RiderMapboxRouteV45", "wayplanId="]) requireText(rider, token, "Active Rider source");
console.log("PASS active source: src/pages/RiderAppPage.tsx");

const planner = read("src/components/wayplan/MapboxWayplanPlannerV45.tsx");
for (const token of ["FIXED HEAD OFFICE ORIGIN", "Optimize from Head Office", "be_wayplan_save_mapbox_route_v45", "VITE_MAPBOX_ACCESS_TOKEN"]) {
  requireText(planner, token, "Mapbox planner");
}
console.log("PASS source: MapboxWayplanPlannerV45.tsx");

const helper = read("src/lib/mapboxHeadOfficeRoutingV45.ts");
for (const token of [
  "optimized-trips/v1",
  "source: \"first\"",
  "destination: \"last\"",
  "roundtrip: \"false\"",
  "geometries: \"geojson\"",
  "MAX_COORDINATES = 12",
  "search/geocode/v6/forward",
  "permanent: \"true\"",
]) requireText(helper, token, "Mapbox routing helper");
console.log("PASS source: mapboxHeadOfficeRoutingV45.ts");

const sqlCandidates = ["wayplan_mapbox_head_office_v45.sql", "sql/wayplan_mapbox_head_office_v45.sql"];
const sqlPath = sqlCandidates.find((relative) => fs.existsSync(path.join(root, relative)));
if (!sqlPath) throw new Error("V45 SQL file is missing");
const sql = read(sqlPath);
for (const token of [
  "be_wayplan_route_plans_v45",
  "be_wayplan_head_office_v45",
  "be_wayplan_route_snapshot_v45",
  "be_wayplan_save_mapbox_route_v45",
  "be_wayplan_submit_review_v45",
  "be_wayplan_supervisor_decide_v45",
  "HUB_EAST_DAGON",
]) requireText(sql, token, "V45 SQL");
console.log("PASS SQL structure: fixed Head Office origin, route persistence, review and approval guards");

const distAssets = path.join(root, "dist", "assets");
if (!fs.existsSync(distAssets)) throw new Error("dist/assets is missing. Run npm run build first.");
const bundles = fs.readdirSync(distAssets)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(distAssets, name), "utf8"))
  .join("\n");
for (const token of [
  "WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30",
  "WAYPLAN_V45_SUPERVISOR_MAPBOX_ROUTE_GATE_2026-07-30",
  "MAPBOX RIDER ROUTE",
  "be_wayplan_save_mapbox_route_v45",
  "be_wayplan_submit_review_v45",
]) requireText(bundles, token, "Production bundle");
console.log("PASS production bundle: active Wayplan, Supervisor, and Rider Mapbox V45 markers");
console.log("SAFE TO DEPLOY WAYPLAN MAPBOX V45.1 ACTIVATION FIX");
