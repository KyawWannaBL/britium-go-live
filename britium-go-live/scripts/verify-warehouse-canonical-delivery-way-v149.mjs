import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const warehouse=fs.readFileSync(path.join(root,"src/pages/WarehousePage.tsx"),"utf8");
const wayId=fs.readFileSync(path.join(root,"src/lib/wayId.ts"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20260927223000_warehouse_canonical_delivery_way_v149.sql"),"utf8");

assert.match(warehouse,/const readyWays =/);
assert.match(warehouse,/canonicalDeliveryWayId\(r\)/);
assert.match(warehouse,/be_warehouse_mark_delivery_ready_v149/);
assert.doesNotMatch(warehouse,/readyPickups/);
assert.match(wayId,/Pickup IDs and must never be surfaced as Way ID/);
assert.match(wayId,/DELIVERY_WAY_ID/);
assert.match(migration,/Canonical Delivery Way ID \(D\.\.\.\) is required/);
assert.match(migration,/upper\(delivery_way_id\)=v_way/);
assert.match(migration,/canonical_way_id_prefix','D'/);

console.log("Warehouse canonical Delivery Way V149 contract PASS");
