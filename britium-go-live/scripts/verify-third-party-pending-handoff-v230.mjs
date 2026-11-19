import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pending=readFileSync("britium-go-live/src/pages/WarehousePendingParcelsPage.tsx","utf8");
const command=readFileSync("britium-go-live/src/pages/WayplanCommandCenterPage.tsx","utf8");
const warehouse=readFileSync("britium-go-live/src/pages/WarehousePage.tsx","utf8");

for(const term of [
  "be_warehouse_mark_delivery_ready_v150",
  "WAREHOUSE_READY",
  "NEW INBOUND",
  "Select / clear eligible",
  "handoffBusy",
  "selectedIds.slice(0,100)",
  "be_wayplan_handoff_ids_v150",
  "Open Wayplan Command",
  "Mark Ready for Wayplan"
])assert.ok(pending.includes(term),"Pending handoff missing: "+term);

assert.match(command,/be_wayplan_visible_queue_v124/);
assert.match(command,/be_warehouse_ack_wayplan_handoff_v150/);
assert.match(command,/be_wayplan_handoff_ids_v150/);
assert.match(warehouse,/be_warehouse_return_scan_v71/);
assert.match(warehouse,/DISPATCH_SCAN_REQUIRED/);
assert.doesNotMatch(pending,/be_warehouse_dispatch_scan\s*\(/);
assert.doesNotMatch(pending,/be_warehouse_return_scan_v71\s*\(/);
console.log("PASS: pending handoff keeps dispatch/return scans in warehouse and only stages physically received parcels");
