import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const wh=fs.readFileSync(path.join(root,"src/pages/WarehousePage.tsx"),"utf8");
const rider=fs.readFileSync(path.join(root,"src/pages/RiderFieldPortalApp.tsx"),"utf8");
const sql=fs.readFileSync(path.join(root,"supabase/migrations/20260928004500_warehouse_rider_delivery_v158.sql"),"utf8");

assert.match(wh,/be_warehouse_scan_lifecycle_snapshot_v158/);
assert.match(sql,/review_status='DISPATCH_READY' and membership_status='READY_FOR_DISPATCH'/);
assert.match(sql,/dispatch_scan_required',stage='DISPATCH_SCAN_REQUIRED'/);
assert.match(sql,/RIDER_ACCEPTED/);
assert.match(sql,/receiver_signature_url/);
assert.match(sql,/RECIPIENT_SIGNATURE_REQUIRED/);
assert.match(rider,/DeliveryJourney/);
assert.match(rider,/Assignment Received/);
assert.match(rider,/COD \/ Payment Confirmation/);
assert.match(rider,/Proof Photo \+ Recipient Signature/);
assert.match(rider,/Required recipient signature evidence/);
assert.match(rider,/APPROVE SIGNATURE/);
assert.doesNotMatch(rider,/window\.location\.hash = navHash\(next\)/);

console.log("Warehouse + Rider delivery V158 contract PASS");
