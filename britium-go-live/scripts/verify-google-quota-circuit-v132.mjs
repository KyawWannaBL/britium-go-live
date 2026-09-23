import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const source = fs.readFileSync(path.join(root, "src/lib/deliveryLocationService.ts"), "utf8");

assert.match(source, /GOOGLE_LOCATION_CIRCUIT_OPEN_UNTIL/);
assert.match(source, /RESOURCE_EXHAUSTED[\s\S]{0,80}quota[\s\S]{0,80}rate[\s\S]{0,40}limit[\s\S]{0,40}429/i);
assert.match(source, /googleLocationCircuitOpen\(\)[\s\S]{0,220}googleGeocode\(query\)/);
assert.match(source, /noteGoogleLocationFailure\(googleOutcome\.reason\)/);
assert.match(source, /GOOGLE_LOCATION_CIRCUIT_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);

console.log("google quota circuit V132 contract PASS");
