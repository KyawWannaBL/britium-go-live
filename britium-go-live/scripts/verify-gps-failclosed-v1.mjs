import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const content = readFileSync(new URL("../src/lib/gpsCapture.ts", import.meta.url), "utf8");
const a = content.indexOf("export async function loadSupervisorLiveMapSnapshot");
const b = content.indexOf("export function gpsAgeMinutes", a);
assert(a >= 0 && b > a, "Supervisor GPS reader section must exist");
const reader = content.slice(a, b);
assert(reader.includes('rpc("be_ops_live_fleet_positions_v1")'), "Use the authorized fleet reader");
assert(reader.includes("if (error) throw"), "An authorization denial must fail closed");
assert(reader.includes("expiry > now"), "Reject expired position data");
for (const forbidden of ["be_rider_live_map_snapshot", "be_supervisor_live_map_snapshot",
  "be_live_map_snapshot", "be_rider_live_locations", "tableRows(", "rpcRows("]) {
  assert(!reader.includes(forbidden), "Unsafe GPS fallback still present: " + forbidden);
}
console.log("PASS: supervisor fleet reader is authenticated RPC only, with no legacy fallback");
