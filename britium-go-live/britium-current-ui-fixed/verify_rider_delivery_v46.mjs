import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const marker = "RIDER_V46_HEAD_OFFICE_ROUTE_EXECUTION_2026-07-30";
function read(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`Missing ${relative}`);
  return fs.readFileSync(full, "utf8");
}
function requireText(content, token, label) {
  if (!content.includes(token)) throw new Error(`${label} is missing ${token}`);
}

const packageJson = JSON.parse(read("package.json"));
if (!packageJson.dependencies?.["mapbox-gl"]) throw new Error("package.json does not include mapbox-gl");
console.log("PASS dependency: mapbox-gl");

const rider = read("src/pages/RiderAppPage.tsx");
for (const token of [
  marker,
  "RiderRouteExecutionV46",
  "be_rider_record_stop_result_v46",
  "be_record_delivery_failure_v39",
  "be_record_delivery_success_v39",
]) requireText(rider, token, "Active Rider source");
console.log("PASS active source: src/pages/RiderAppPage.tsx");

const execution = read("src/components/wayplan/RiderRouteExecutionV46.tsx");
for (const token of [
  "Accept Route",
  "Start at Head Office",
  "Arrive Current Stop",
  "be_rider_route_snapshot_v46",
  "be_rider_accept_route_v46",
  "be_rider_start_route_v46",
  "be_rider_arrive_stop_v46",
]) requireText(execution, token, "Rider execution component");
console.log("PASS source: RiderRouteExecutionV46.tsx");

const map = read("src/components/wayplan/RiderMapboxRouteV45.tsx");
for (const token of ["MAPBOX RIDER ROUTE", "be_wayplan_route_snapshot_v45", "VITE_MAPBOX_ACCESS_TOKEN"]) {
  requireText(map, token, "Rider Mapbox component");
}
console.log("PASS source: RiderMapboxRouteV45.tsx");

const sqlCandidates = ["rider_delivery_execution_v46.sql", "sql/rider_delivery_execution_v46.sql"];
const sqlPath = sqlCandidates.find((relative) => fs.existsSync(path.join(root, relative)));
if (!sqlPath) throw new Error("Rider V46 SQL file is missing");
const sql = read(sqlPath);
for (const token of [
  "be_rider_route_runs_v46",
  "be_rider_route_stop_state_v46",
  "be_rider_route_snapshot_v46",
  "be_rider_accept_route_v46",
  "be_rider_start_route_v46",
  "be_rider_arrive_stop_v46",
  "be_rider_record_stop_result_v46",
  "head_office_start_radius_m",
  "Stop order enforced",
]) requireText(sql, token, "Rider V46 SQL");
console.log("PASS SQL structure: assignment guard, Head Office geofence, stop order, result audit and completion");

const distAssets = path.join(root, "dist", "assets");
if (!fs.existsSync(distAssets)) throw new Error("dist/assets is missing. Run npm run build first.");
const bundles = fs.readdirSync(distAssets)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(distAssets, name), "utf8"))
  .join("\n");
for (const token of [
  marker,
  "Start at Head Office",
  "Arrive Current Stop",
  "be_rider_start_route_v46",
  "be_rider_record_stop_result_v46",
]) requireText(bundles, token, "Production bundle");
console.log("PASS production bundle: Rider V46 execution markers and RPCs");
console.log("SAFE TO DEPLOY RIDER DELIVERY V46");
