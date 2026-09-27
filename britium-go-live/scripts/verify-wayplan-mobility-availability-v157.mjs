import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const page=fs.readFileSync(path.join(root,"src/components/MultiVanPlanner.tsx"),"utf8");
const sql=fs.readFileSync(path.join(root,"supabase/migrations/20260928002500_wayplan_mobility_availability_v157.sql"),"utf8");

assert.match(page,/BICYCLE/);
assert.match(page,/MOTORBIKE/);
assert.match(page,/isRiderOnlyVehicle\(vehicle.id\)/);
assert.match(page,/Busy on active route/);
assert.doesNotMatch(page,/riders\.filter\(\(x\) => x\.available/);
assert.match(sql,/vehicle_mode<>''RIDER_ONLY''/);
assert.match(sql,/where b->>''rider_code''=p->>''rider_code''/);
assert.doesNotMatch(sql,/vehicle_code''=p->>''vehicle_code'' or b->>''rider_code/);

console.log("Wayplan mobility availability V157 PASS");
