import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pending=readFileSync("britium-go-live/src/pages/WarehousePendingParcelsPage.tsx","utf8");
const command=readFileSync("britium-go-live/src/pages/WayplanCommandCenterPage.tsx","utf8");
const warehouse=readFileSync("britium-go-live/src/pages/WarehousePage.tsx","utf8");

for(const term of [
  "be_warehouse_mark_delivery_ready_v150",
  "WAREHOUSE_READY",
  "NEW INBOUND",
  "RETURNED_WAITING_REPLAN",
  "physical_return_scan_count",
  "be_warehouse_scan_lifecycle_snapshot_v211",
  "be_warehouse_provider_transfer_preview_v1",
  "provider_planning_gate",
  "NEEDS_PROVIDER_TRANSFER_WAYPLAN",
  "Service provider",
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
assert.match(command,/unmatched.length/);
assert.match(command,/Outside-core third-party parcels require/);
assert.match(warehouse,/be_warehouse_return_scan_v71/);
const sql=readFileSync("britium-go-live/sql/candidates/warehouse_provider_transfer_preview_v1.sql","utf8");
assert.match(sql,/security definer/);
assert.match(sql,/revoke all on function.*from public, anon/);
assert.match(sql,/be_warehouse_assert_internal/);
assert.match(sql,/NEEDS_PROVIDER_TRANSFER_WAYPLAN/);
assert.match(sql,/PROVIDER_TRANSFER_REQUIRED/);
assert.match(warehouse,/DISPATCH_SCAN_REQUIRED/);
assert.doesNotMatch(pending,/be_warehouse_dispatch_scan\s*\(/);
assert.doesNotMatch(pending,/be_warehouse_return_scan_v71\s*\(/);
console.log("PASS: pending handoff keeps dispatch/return scans in warehouse and only stages received or verified returned parcels");
