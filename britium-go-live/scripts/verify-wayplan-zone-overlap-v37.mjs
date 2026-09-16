import assert from "node:assert/strict";
import { buildBaselineBuckets } from "../api/wayplan-zone-plan.mjs";

function rows(township, count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    delivery_way_id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    township,
  }));
}

const input = [
  ...rows("Mayangone", 15, "MAY"),
  ...rows("Insein", 8, "INS"),
  ...rows("Mingaladon", 11, "MGL"),
];

const buckets = buildBaselineBuckets(input);
const assignedIds = buckets.flatMap((bucket) => bucket.rows.map((row) => row.delivery_way_id));

assert.equal(assignedIds.length, input.length, "V37 must assign each parcel exactly once across expansion buckets");
assert.equal(new Set(assignedIds).size, input.length, "V37 must not duplicate Insein parcels across overlapping expansion groups");
assert.ok(
  buckets.some((bucket) => bucket.townships.includes("Mayangone") && bucket.townships.includes("Insein") && bucket.rows.length === 23),
  "existing expansion priority must keep Mayangone + Insein together",
);
assert.ok(
  buckets.some((bucket) => bucket.townships.length === 1 && bucket.townships[0] === "Mingaladon" && bucket.rows.length === 11),
  "Mingaladon must remain a standalone low-volume route after Insein is already allocated",
);

console.log("Wayplan V37 overlapping expansion-group regression PASS");
