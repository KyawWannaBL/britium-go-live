import fs from "node:fs";

const target = "src/pages/WayplanCommandCenterPage.tsx";
if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found.`);
  process.exit(1);
}

const source = fs.readFileSync(target, "utf8");

const required = [
  'WAYPLAN_V53_9_ROUTE_GROUP_MULTI_PICKUP_SCOPE_2026-07-31',
  'setSelectedPickup((current) => current && nextPickups.includes(current) ? current : "");',
  'All pickups in selected route group',
  'Pickup Scope',
  'Delivery Way ID',
  'Parent Pickup ID',
  'hasValidPickupDeliveryLineage(row)',
];

const forbidden = [
  'setSelectedPickup((current) => current || nextPickups[0] || "");',
  '(!normalizedPickup || pickupId(row) === normalizedPickup)',
  '<option value="">All pickups</option>',
];

const missing = required.filter((item) => !source.includes(item));
const stale = forbidden.filter((item) => source.includes(item));

if (missing.length || stale.length) {
  console.error("WAYPLAN V53.9 VERIFICATION FAILED");
  if (missing.length) {
    console.error("Missing required contracts:");
    missing.forEach((item) => console.error(`  - ${item}`));
  }
  if (stale.length) {
    console.error("Stale contracts still present:");
    stale.forEach((item) => console.error(`  - ${item}`));
  }
  process.exit(1);
}

console.log("WAYPLAN V53.9 SOURCE VERIFICATION PASSED");
console.log("Default scope: All pickups");
console.log("Route group can include multiple parent Pickup IDs");
console.log("Optional Pickup scope still filters exact parent Pickup ID");
console.log("Pickup-to-Delivery core lineage guard remains active");
console.log("SAFE TO BUILD AND TEST WAYPLAN V53.9");
