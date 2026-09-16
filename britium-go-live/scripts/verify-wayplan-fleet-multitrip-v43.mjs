import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignCrews,
  scheduleSequentialRouteWaves,
} from "../src/lib/multiVanPlanner.ts";

const vehicles = [
  { id: "FLT011", name: "1H-6033", capacity_kg: 700, available: true },
  { id: "FLT003", name: "2Q-6524", capacity_kg: 850, available: true },
  { id: "FLT002", name: "4S-1626", capacity_kg: 850, available: true },
  { id: "FLT001", name: "6H-7397", capacity_kg: 700, available: true },
  { id: "FLT006", name: "7K-1890", capacity_kg: 1500, available: true },
  { id: "FLT004", name: "7R-1473", capacity_kg: 780, available: true },
  { id: "FLT005", name: "9R-4431", capacity_kg: 300, available: true },
];

const routes = Array.from({ length: 19 }, (_, index) => ({
  id: `R${index + 1}`,
  weight_kg: index === 0 ? 1200 : 200,
}));

const assignments = scheduleSequentialRouteWaves(routes, vehicles);
assert.equal(assignments.length, 19, "every route must be scheduled");
assert.equal(Math.max(...assignments.map((x) => x.wave_no)), 3, "19 routes across 7 delivery fleets should require 3 sequential waves");
assert.equal(assignments[0].vehicle_code, "FLT006", "the 1200kg route must use the 1500kg Box Truck");
for (const wave of new Set(assignments.map((x) => x.wave_no))) {
  const inWave = assignments.filter((x) => x.wave_no === wave);
  assert.equal(new Set(inWave.map((x) => x.vehicle_code)).size, inWave.length, `a vehicle cannot appear twice in wave ${wave}`);
}
assert.ok(new Set(assignments.map((x) => x.vehicle_code)).size < assignments.length, "vehicles must be reusable on later waves");

const planRows = assignments.slice(0, 10).map((assignment, index) => ({
  vehicle_code: assignment.vehicle_code,
  driver_code: "",
  rider_code: "",
  helper_code: "",
  wave_no: assignment.wave_no,
  trip_no: assignment.trip_no,
  rows: [{ delivery_way_id: `D0916-TST-${String(index + 1).padStart(3, "0")}`, township: "Dagon" }],
}));
const drivers = Array.from({ length: 7 }, (_, index) => ({ id: `DRV${index + 1}`, name: `Driver ${index + 1}`, available: true }));
const riders = Array.from({ length: 7 }, (_, index) => ({ id: `RID${index + 1}`, name: `Rider ${index + 1}`, available: true }));
const crewed = assignCrews(planRows, drivers, riders, [], (town) => town);
assert.ok(crewed.every((plan) => plan.driver_code && plan.rider_code), "later waves may reuse roster crew after the earlier wave");
for (const wave of new Set(crewed.map((x) => x.wave_no))) {
  const sameWave = crewed.filter((x) => x.wave_no === wave);
  assert.equal(new Set(sameWave.map((x) => x.driver_code)).size, sameWave.length, `drivers must be unique inside wave ${wave}`);
  assert.equal(new Set(sameWave.map((x) => x.rider_code)).size, sameWave.length, `riders must be unique inside wave ${wave}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const plannerSource = fs.readFileSync(path.join(root, "src", "components", "MultiVanPlanner.tsx"), "utf8");
assert.ok(plannerSource.includes("scheduleSequentialRouteWaves"), "Yangon planner must use sequential route waves");
assert.ok(plannerSource.includes('supabase.rpc("be_generate_multi_van_v43"'), "Wayplan UI must save through the V43 RPC");
assert.ok(plannerSource.includes("wave_no: p.wave_no"), "saved Wayplans must carry wave number");
assert.ok(plannerSource.includes("trip_no: p.trip_no"), "saved Wayplans must carry vehicle trip number");

const migrationPath = path.join(root, "supabase", "migrations", "20260916143000_wayplan_fleet_multitrip_v43.sql");
assert.ok(fs.existsSync(migrationPath), "V43 fleet/multi-trip migration must exist");
const migration = fs.readFileSync(migrationPath, "utf8");
for (const marker of [
  "1H-6033", "2M-7017", "2Q-6524", "4N-3169", "4S-1626", "6H-7397", "7K-1890", "7R-1473", "9R-4431",
  "be_generate_multi_van_v43",
  "be_multi_trip_dispatch_ready_v43",
  "wayplan_status in ('DISPATCHED','ON_HOLD')",
]) assert.ok(migration.includes(marker), `migration missing V43 marker: ${marker}`);

console.log("Wayplan V43 fleet multi-trip behavior PASS");
