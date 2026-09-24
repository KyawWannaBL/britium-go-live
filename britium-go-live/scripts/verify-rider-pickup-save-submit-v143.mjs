import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const riderPath = path.join(root, "src/pages/RiderFieldPortalApp.tsx");
const rider = fs.readFileSync(riderPath, "utf8");

assert.match(
  rider,
  /SAVE PARCEL/,
  "Pickup parcel row must expose an explicit SAVE PARCEL action"
);
assert.match(
  rider,
  /SAVE ALL PARCELS/,
  "Pickup verification must expose a SAVE ALL PARCELS action"
);
assert.match(
  rider,
  /SUBMIT PICKUP VERIFICATION/,
  "Pickup verification must expose an explicit final submit action"
);
assert.match(
  rider,
  /position:\s*modal === "pickup" \? "sticky" : "static"/,
  "Pickup verification final action bar must remain visible while the modal scrolls"
);
assert.match(
  rider,
  /onClick=\{submitModal\}[\s\S]{0,1600}?SUBMIT PICKUP VERIFICATION/,
  "The visible final pickup button must call submitModal"
);

console.log("Rider pickup save/submit V143 contract PASS");
