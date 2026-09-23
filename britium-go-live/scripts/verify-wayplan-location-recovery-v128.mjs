import assert from "node:assert/strict";
import { recoverWayplanLocations } from "../src/lib/wayplanLocationRecovery.ts";

const rows = [
  { delivery_way_id: "D1", township: "Kamayut", address: "Exact address" },
  { delivery_way_id: "D2", township: "Kamayut", address: "Needs review" },
  { delivery_way_id: "D3", township: "Kamayut", address: "Already ready", latitude: 16.82, longitude: 96.13 },
  { delivery_way_id: "D4", township: "Kamayut", address: "Alias only" },
];

const persisted = [];
const result = await recoverWayplanLocations(rows, {
  resolve: async (row) => {
    if (row.delivery_way_id === "D1") return {
      deliveryWayId: "D1",
      latitude: 16.817,
      longitude: 96.134,
      reviewStatus: "ACCEPTED",
      matchLevel: "ADDRESS_EXACT",
      coordinateSource: "GOOGLE_GEOCODING_TOWNSHIP_VALIDATED_ADDRESS_EXACT",
    };
    if (row.delivery_way_id === "D4") return {
      deliveryWayId: "D4",
      latitude: 16.819,
      longitude: 96.136,
      reviewStatus: "ACCEPTED",
      matchLevel: "ADDRESS_EXACT",
      coordinateSource: "MERCHANT_LOCATION_ALIAS_V28",
    };
    if (row.delivery_way_id === "D2") return {
      deliveryWayId: "D2",
      latitude: 16.818,
      longitude: 96.135,
      reviewStatus: "MANUAL_REVIEW",
      matchLevel: "STREET_APPROXIMATE",
      coordinateSource: "GOOGLE_GEOCODING_STREET_APPROXIMATE",
    };
    throw new Error("already-ready rows must not be re-resolved");
  },
  persist: async (location) => persisted.push(location.deliveryWayId),
  concurrency: 2,
});

assert.deepEqual(result.rows.map((row) => row.delivery_way_id), ["D1", "D2", "D3", "D4"]);
assert.equal(result.rows[0].latitude, 16.817);
assert.equal(result.rows[0].longitude, 96.134);
assert.equal(result.rows[1].latitude, undefined);
assert.equal(result.rows[2].latitude, 16.82);
assert.equal(result.rows[3].latitude, undefined);
assert.deepEqual(persisted, ["D1"]);
assert.equal(result.recovered, 1);
assert.equal(result.unresolved, 2);
assert.deepEqual(result.unresolvedIds.sort(), ["D2", "D4"]);
console.log("wayplan location recovery v128: PASS");
