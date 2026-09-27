import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260927220000_wayplan_vehicle_driven_crew_v148.sql"), "utf8");

assert.match(planner, /RIDER_ONLY_VEHICLE_CODES = new Set\(\["MOTORBIKE", "BICYCLE"\]\)/);
assert.match(planner, /name: "Motor Bike"/);
assert.match(planner, /name: "Bicycle"/);
assert.match(planner, /Choose vehicle first/);
assert.match(planner, /Motor Bike\/Bicycle mode: Rider is required\. Driver and Helper are disabled\./);
assert.match(planner, /Vehicle crew mode: Driver is required, Helper is optional, and Rider is disabled\./);
assert.match(planner, /driver_code: "",\s*rider_code: "",\s*helper_code: "",\s*crew_mode: "ROSTER"/s);
assert.doesNotMatch(planner, /const riderPool = riders\.filter/);
assert.match(planner, /Crew is intentionally not auto-assigned/);
assert.match(planner, /choose a Rider for the Motor Bike\/Bicycle/i);
assert.match(planner, /choose a Driver for the selected vehicle/i);

assert.match(migration, /'MOTORBIKE','name','Motor Bike'/);
assert.match(migration, /'BICYCLE','name','Bicycle'/);
assert.match(migration, /vehicle_mode','RIDER_ONLY'/);
assert.match(migration, /Motor Bike\/Bicycle uses Rider only; Driver and Helper must be empty/);
assert.match(migration, /Van\/car\/truck routes do not use a Rider/);
assert.match(migration, /Choose a Rider for the Motor Bike\/Bicycle/);
assert.match(migration, /Choose an active Driver/);

console.log("Wayplan vehicle-driven crew V148 contract PASS");
