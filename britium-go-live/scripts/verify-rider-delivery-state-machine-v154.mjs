import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const page=fs.readFileSync(path.join(root,"src/pages/RiderFieldPortalApp.tsx"),"utf8");

assert.match(page,/function isDeliveryAccepted/);
assert.match(page,/"RIDER_ACCEPTED"/);
assert.match(page,/Accept Delivery/);
assert.match(page,/Parcel accepted\. Press Start Delivery/);
assert.match(page,/Next step: Start Delivery/);
assert.match(page,/Arrived at Customer \(GPS required\)/);
assert.match(page,/Delivery Verification & Proof/);
assert.match(page,/VERIFY & MARK DELIVERED/);
assert.match(page,/recipient name is required/i);
assert.match(page,/COD must be collected before delivery/);
assert.match(page,/delivery proof photo before submitting/);
assert.match(page,/Delivery Exception/);

console.log("Rider delivery state machine V154 PASS");
