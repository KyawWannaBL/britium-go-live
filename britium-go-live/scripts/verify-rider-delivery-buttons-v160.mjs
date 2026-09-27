import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const page=fs.readFileSync(path.join(root,"src/pages/RiderFieldPortalApp.tsx"),"utf8");

assert.match(page,/deliveryActionKey=\{deliveryActionKey\}/);
assert.match(page,/aria-busy=\{deliveryActionBusy\}/);
assert.doesNotMatch(page,/disabled=\{deliveryActionBusy\}/);
assert.match(page,/Next action buttons remain clickable/);
assert.match(page,/repeated clicks are ignored until the save finishes/);
assert.match(page,/Start Delivery/);
assert.match(page,/Arrived at Customer/);
assert.match(page,/Verify Delivery \/ Delivered/);

console.log("Rider delivery buttons V160 PASS");
