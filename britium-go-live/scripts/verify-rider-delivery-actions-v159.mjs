import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const page=fs.readFileSync(path.join(root,"src/pages/RiderFieldPortalApp.tsx"),"utf8");

assert.match(page,/deliveryActionKey/);
assert.match(page,/deliveryActionInFlight/);
assert.match(page,/disabled=\{deliveryActionBusy\}/);
assert.match(page,/only this parcel is temporarily locked/);
assert.match(page,/accepted\. Next step: Start Delivery/);
assert.match(page,/await load\(session, true\);\s*return;/);
assert.match(page,/setDeliveryActionKey\(\(current\)/);

console.log("Rider delivery action controls V159 PASS");
