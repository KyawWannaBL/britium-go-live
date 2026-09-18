import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/WayplanCommandCenterPage.tsx"), "utf8");
const filter = fs.readFileSync(path.join(root, "src/components/MultiSelectQueueFilter.tsx"), "utf8");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const revision = fs.readFileSync(path.join(root, "src/components/CreatedWayplanRevisionPlanner.tsx"), "utf8");
const allocation = fs.readFileSync(path.join(root, "src/lib/multiVanPlanner.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260918174500_wayplan_whole_chain_v52.sql"), "utf8");

const checks = [
  ["prominent Select All Filtered exists", page.includes('data-wayplan-select-all-filtered-v52="true"')],
  ["planner keeps all selected rows", page.includes("const plannerRows = selectedRows;")],
  ["filter panel can collapse", page.includes("filtersExpanded") && page.includes("Hide Filters") && page.includes("Show Filters")],
  ["filter summary exists", page.includes('data-wayplan-filter-summary-v52="true"')],
  ["select-all collapses filter panel", page.includes("if (selecting) setFiltersExpanded(false)")],
  ["dropdown supports Apply & Close", filter.includes("Apply & Close")],
  ["dropdown closes outside", filter.includes('document.addEventListener("mousedown", outside)')],
  ["pickup resolver supports pickup_id", planner.includes("pickupBatchId") && planner.includes("pickup_id")],
  ["pickup resolver supports pickup_way_id", planner.includes("pickup_way_id")],
  ["pickup selection summary exists", planner.includes('data-wayplan-selection-summary-v52="true"')],
  ["planner uses 50 minimum", allocation.includes("NORMAL_MIN_PARCELS_PER_VAN = 50")],
  ["planner uses 75 maximum", allocation.includes("PRACTICAL_MAX_PARCELS_PER_VAN = 75")],
  ["revision accepts road fallback", !revision.includes("fallback routing is not accepted")],
  ["review gate reads operational route store", migration.includes("OPERATIONAL_ROUTE_V1") && migration.includes("be_wayplan_route_versions_v1")],
  ["multi-township Wayplan review is supported", migration.includes("ROAD_ROUTE:") && migration.includes("route_zone_count")],
  ["review wording uses reviewed road route", migration.includes("complete reviewed road route")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan whole-chain V52 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan whole-chain V52 contract PASS");
