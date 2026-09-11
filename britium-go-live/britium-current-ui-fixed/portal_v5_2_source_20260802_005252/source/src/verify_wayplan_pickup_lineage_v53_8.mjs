import fs from "node:fs";

const target = "src/pages/WayplanCommandCenterPage.tsx";
if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found.`);
  process.exit(1);
}

const source = fs.readFileSync(target, "utf8");

const required = [
  'WAYPLAN_V53_8_CANONICAL_PICKUP_LINEAGE_GUARD_2026-07-31',
  'function pickupId(row: Row)',
  'row.pickup_way_id || row.pickup_id || row.request_code',
  'function hasValidPickupDeliveryLineage(row: Row)',
  'if (!hasValidPickupDeliveryLineage(row)) return false;',
  'canonicalPickupId !== normalizedPickup',
  'key={`${pickupId(row)}-${id}`}',
  '{pickupId(row) || "-"}',
];

const forbidden = [
  'if (selectedPickup && text(row.pickup_id) !== selectedPickup) return false;',
  'key={`${row.pickup_id}-${id}`}',
  '{text(row.pickup_id, "-")}',
];

const missing = required.filter((item) => !source.includes(item));
const stale = forbidden.filter((item) => source.includes(item));

if (missing.length || stale.length) {
  console.error("WAYPLAN V53.8 VERIFICATION FAILED");
  if (missing.length) {
    console.error("Missing required contracts:");
    for (const item of missing) console.error(`  - ${item}`);
  }
  if (stale.length) {
    console.error("Stale unsafe contracts still present:");
    for (const item of stale) console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log("WAYPLAN V53.8 SOURCE VERIFICATION PASSED");
console.log("Canonical field priority: pickup_way_id -> pickup_id -> request_code");
console.log("Pickup filter: exact canonical ID");
console.log("Lineage guard: Pickup core must equal Delivery core");
console.log("Table rendering: row canonical Pickup ID");
console.log("Selection: scoped to canonical Pickup lineage");
console.log("SAFE TO BUILD AND TEST WAYPLAN V53.8");
