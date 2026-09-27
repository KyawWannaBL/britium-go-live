import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const sql=fs.readFileSync(path.join(root,"supabase/migrations/20260928001000_rider_mobile_status_projection_v155.sql"),"utf8");

assert.match(sql,/RIDER_ACCEPTED/);
assert.match(sql,/ARRIVED_AT_CUSTOMER/);
assert.match(sql,/DELIVERY_STARTED/);
assert.match(sql,/READY_FOR_DELIVERY/);
assert.match(sql,/be_field_team_mobile_snapshot_delivery_v155/);
assert.match(sql,/RIDER_MOBILE_STATUS_PROJECTION_V155/);

console.log("Rider mobile status projection V155 PASS");
