import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const resolver = read("src/lib/deliveryLocationService.ts");
const defaults = read("src/lib/locationDefaultCoordinates.ts");
const editor = read("src/components/workflow/DataEntryLocationEditor.tsx");
const recovery = read("src/lib/wayplanLocationRecovery.ts");
const migration = read("supabase/migrations/20260924072000_two_step_location_defaults_v136.sql");

assert.match(resolver, /resolvePostalCode\(addressWithPostalEvidence, input\.township, \{[\s\S]*ward: input\.ward,[\s\S]*postalCode: input\.postalCode/);
assert.match(resolver, /postal\.matchLevel === "EXACT_QUARTER"[\s\S]*postalWardDefaultCoordinate\(postal\)/);
assert.match(resolver, /postalDefault \|\| townshipDefaultCoordinate/);
assert.match(resolver, /reviewStatus: "ACCEPTED"/);
assert.match(resolver, /matchLevel: fallback\.level/);

assert.match(defaults, /POSTAL_WARD_DEFAULT_V136/);
assert.match(defaults, /TOWNSHIP_DEFAULT_V136/);
assert.match(defaults, /postalAreas: 17331, townships: 356/);
assert.match(defaults, /sort\(\(a, b\) => a\.localeCompare\(b, "en"\)\)/);

assert.match(editor, /savedDefaultCoordinate/);
assert.match(editor, /savedMatchLevel === "POSTAL_DEFAULT"/);
assert.match(editor, /savedMatchLevel === "TOWNSHIP_DEFAULT"/);

assert.match(recovery, /source === "POSTAL_WARD_DEFAULT_V136" && level === "POSTAL_DEFAULT"/);
assert.match(recovery, /source === "TOWNSHIP_DEFAULT_V136" && level === "TOWNSHIP_DEFAULT"/);

assert.match(migration, /POSTAL_WARD_DEFAULT_V136/);
assert.match(migration, /TOWNSHIP_DEFAULT_V136/);
assert.match(migration, /POSTAL_DEFAULT','TOWNSHIP_DEFAULT/);
assert.match(migration, /route_block_reason',case when route_ready then null else 'LOCATION_PENDING'/);
assert.match(migration, /WAYPLAN_VISIBLE_QUEUE_V136_GENERIC_DEFAULTS_20260924/);

console.log("two-step location defaults V136 contract PASS");
