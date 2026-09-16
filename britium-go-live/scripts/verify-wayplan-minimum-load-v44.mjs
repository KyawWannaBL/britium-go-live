import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const zoneModule = await import("../api/wayplan-zone-plan.mjs");

assert.equal(
  typeof zoneModule.balanceYangonRouteRows,
  "function",
  "V44 must expose the Yangon minimum-load balancer"
);

const makeRows = (township, count, latitude, longitude, prefix) =>
  Array.from({ length: count }, (_, index) => ({
    delivery_way_id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    township,
    latitude: latitude + index * 0.00001,
    longitude: longitude + index * 0.00001,
    parcel_weight_kg: 1,
  }));

// Mirrors the live 216-parcel Yangon shape that previously produced many tiny routes.
const rows = [
  ...makeRows("Latha", 15, 16.775, 96.145, "Z1"),
  ...makeRows("Sanchaung", 17, 16.806, 96.135, "Z2"),
  ...makeRows("Thingangyun", 45, 16.828, 96.195, "Z3"),
  ...makeRows("South Dagon", 57, 16.870, 96.235, "Z4"),
  ...makeRows("Mayangone", 66, 16.875, 96.145, "Z5"),
  ...makeRows("Shwepyitha", 16, 16.965, 96.095, "Z6"),
];

const routes = zoneModule.balanceYangonRouteRows(rows);
const sizes = routes.map((route) => route.rows.length);
const shorts = routes.filter((route) => route.rows.length < 50);
const ids = routes.flatMap((route) => route.rows.map((row) => row.delivery_way_id));

assert.equal(routes.length, 4, `216 parcels should use four practical routes, got ${sizes.join(", ")}`);
assert.deepEqual([...sizes].sort((a, b) => a - b), [16, 66, 67, 67]);
assert.equal(shorts.length, 1, `Only one approved below-50 route is allowed, got ${sizes.join(", ")}`);
assert.ok(shorts[0].rows.every((row) => row.township === "Shwepyitha"), "The Hlaing-river hard fence must keep the Trans-River West residual route isolated");
assert.ok(routes.filter((route) => route.rows.length >= 50).every((route) => route.rows.length <= 75), "Normal routes must stay within the 50-75 operating band");
assert.equal(ids.length, rows.length, "Every selected parcel must appear once");
assert.equal(new Set(ids).size, rows.length, "No parcel may be duplicated across routes");
assert.ok(routes.every((route) => {
  const zones = new Set(route.rows.map((row) => row.township));
  return !(zones.has("Latha") && zones.has("South Dagon"));
}), "Downtown and East-Suburbs parcels must never share a route");

const plannerSource = fs.readFileSync(path.join(root, "src", "components", "MultiVanPlanner.tsx"), "utf8");
assert.ok(plannerSource.includes('const [pickup, setPickup] = useState("*");'), "Wayplan preview must default to All ready pickups");
assert.ok(plannerSource.includes('const short = plans.filter((p) => p.rows.length < 50);'), "Yangon must enforce the same below-50 route count guard");
assert.ok(plannerSource.includes('approve_below_minimum: approved'), "Yangon below-minimum creation must require explicit operator approval");
assert.ok(!plannerSource.includes('approve_below_minimum: isYangonMaster ? true : approved'), "Yangon must not auto-approve a below-minimum route");

console.log("Wayplan V44 minimum-load regression PASS");
