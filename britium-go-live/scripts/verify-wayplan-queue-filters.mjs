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
  { delivery_way_id: "W4", township: "Hlaing", merchant_name: "Gamma", service_provider_code: "BRITIUM", dispatch_status: "READY", warehouse_status: "WAYPLAN_READY", recipient_name: "Su Su", address: "Insein Road" },
];

const options = getWayplanQueueFilterOptions(rows);
assert.deepEqual(options.townships, ["Hlaing", "North Dagon", "Tamwe"]);
assert.deepEqual(options.merchants, ["Alpha", "Beta", "Gamma"]);
assert.deepEqual(options.providers, ["BRITIUM", "ROYAL"]);
assert.deepEqual(options.statuses, ["HOLD", "READY", "RECEIVED", "WAYPLAN_READY"]);

// Empty arrays mean no restriction for that dimension.
assert.deepEqual(filterWayplanQueueRows(rows, { townships: [], merchants: [], providers: [], statuses: [], search: "" }).map((row) => row.delivery_way_id), ["W1", "W2", "W3", "W4"]);

// Multi-select values use OR within one filter dimension.
assert.deepEqual(filterWayplanQueueRows(rows, { townships: ["North Dagon", "Tamwe"], merchants: [], providers: [], statuses: [], search: "" }).map((row) => row.delivery_way_id), ["W1", "W2", "W3"]);

// Different dimensions combine with AND while each selected list stays OR-based.
assert.deepEqual(filterWayplanQueueRows(rows, { townships: ["North Dagon", "Tamwe"], merchants: ["Alpha"], providers: [], statuses: [], search: "" }).map((row) => row.delivery_way_id), ["W1", "W3"]);
assert.deepEqual(filterWayplanQueueRows(rows, { townships: [], merchants: [], providers: ["BRITIUM"], statuses: ["READY", "RECEIVED"], search: "" }).map((row) => row.delivery_way_id), ["W1", "W2", "W4"]);
assert.deepEqual(filterWayplanQueueRows(rows, { townships: ["North Dagon", "Tamwe"], merchants: ["Alpha"], providers: [], statuses: [], search: "ward 32" }).map((row) => row.delivery_way_id), ["W1"]);

const groups = groupWayplanQueueRows(rows, "MERCHANT");
assert.deepEqual(groups.map((group) => group.label), ["Alpha", "Beta", "Gamma"]);
assert.deepEqual(groups[0].rows.map((row) => row.delivery_way_id), ["W1", "W3"]);

assert.deepEqual(toggleVisibleWayplanSelection({ HIDDEN: true, W1: true }, rows.slice(0, 2)), { HIDDEN: true, W1: true, W2: true });
assert.deepEqual(toggleVisibleWayplanSelection({ HIDDEN: true, W1: true, W2: true }, rows.slice(0, 2)), { HIDDEN: true });

console.log("Wayplan queue multi-select filter behavior verified.");
