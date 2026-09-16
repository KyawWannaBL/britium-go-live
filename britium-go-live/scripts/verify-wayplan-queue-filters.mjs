import assert from "node:assert/strict";
import {
  filterWayplanQueueRows,
  getWayplanQueueFilterOptions,
  groupWayplanQueueRows,
  toggleVisibleWayplanSelection,
} from "../src/lib/wayplanQueueFilters.ts";

const rows = [
  { delivery_way_id: "W1", township: "North Dagon", merchant_name: "Alpha", service_provider_code: "BRITIUM", dispatch_status: "READY", warehouse_status: "WAYPLAN_READY", recipient_name: "Aye Aye", address: "Ward 32" },
  { delivery_way_id: "W2", township: "North Dagon", merchant_name: "Beta", service_provider_code: "BRITIUM", dispatch_status: "READY", warehouse_status: "WAYPLAN_READY", recipient_name: "Ko Ko", address: "Ward 41" },
  { delivery_way_id: "W3", township: "Tamwe", merchant_name: "Alpha", service_provider_code: "ROYAL", dispatch_status: "HOLD", warehouse_status: "RECEIVED", recipient_name: "Mya Mya", address: "Ocean" },
];

const options = getWayplanQueueFilterOptions(rows);
assert.deepEqual(options.townships, ["North Dagon", "Tamwe"]);
assert.deepEqual(options.merchants, ["Alpha", "Beta"]);
assert.deepEqual(options.providers, ["BRITIUM", "ROYAL"]);
assert.deepEqual(options.statuses, ["HOLD", "READY", "RECEIVED", "WAYPLAN_READY"]);

assert.deepEqual(filterWayplanQueueRows(rows, { township: "North Dagon", merchant: "ALL", provider: "ALL", status: "ALL", search: "" }).map((row) => row.delivery_way_id), ["W1", "W2"]);
assert.deepEqual(filterWayplanQueueRows(rows, { township: "ALL", merchant: "Alpha", provider: "ALL", status: "ALL", search: "ward 32" }).map((row) => row.delivery_way_id), ["W1"]);
assert.deepEqual(filterWayplanQueueRows(rows, { township: "ALL", merchant: "ALL", provider: "ALL", status: "RECEIVED", search: "" }).map((row) => row.delivery_way_id), ["W3"]);

const groups = groupWayplanQueueRows(rows, "MERCHANT");
assert.deepEqual(groups.map((group) => group.label), ["Alpha", "Beta"]);
assert.deepEqual(groups[0].rows.map((row) => row.delivery_way_id), ["W1", "W3"]);

assert.deepEqual(toggleVisibleWayplanSelection({ HIDDEN: true, W1: true }, rows.slice(0, 2)), { HIDDEN: true, W1: true, W2: true });
assert.deepEqual(toggleVisibleWayplanSelection({ HIDDEN: true, W1: true, W2: true }, rows.slice(0, 2)), { HIDDEN: true });

console.log("Wayplan queue filter behavior verified.");
