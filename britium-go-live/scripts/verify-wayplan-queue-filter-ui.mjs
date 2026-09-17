import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pagePath = path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx");
const source = fs.readFileSync(pagePath, "utf8");

const requiredMarkers = [
  'from "@/lib/wayplanQueueFilters"',
  'from "@/components/MultiSelectQueueFilter"',
  'data-wayplan-queue-filters="true"',
  'label="Township" allLabel="All Townships"',
  'values={townshipFilters}',
  'label="Merchant" allLabel="All Merchants"',
  'values={merchantFilters}',
  'label="Service Provider" allLabel="All Providers"',
  'values={providerFilters}',
  'label="Status" allLabel="All Statuses"',
  'values={statusFilters}',
  'Group By<select',
  'placeholder="Waybill, recipient, address..."',
  'filterWayplanQueueRows(readyRows',
  'townships: townshipFilters',
  'merchants: merchantFilters',
  'providers: providerFilters',
  'statuses: statusFilters',
  'groupWayplanQueueRows(filteredReadyRows, groupBy)',
  'toggleVisibleWayplanSelection(prev, filteredReadyRows)',
  'Select All Filtered',
  'Clear Filtered',
  'const plannerRows = filteredSelectedRows;',
  'rows={plannerRows}',
  'groupedReadyRows.map((group)',
  'filteredReadyRows.length} filtered / {readyRows.length} ready stops',
  'No ways match the current filters.',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length) {
  console.error("Wayplan queue multi-select filter UI contract FAILED:");
  for (const marker of missing) console.error(` - missing: ${marker}`);
  process.exit(1);
}

console.log("Wayplan queue multi-select filter UI contract PASS");
await import("./verify-wayplan-fleet-multitrip-v43.mjs");
await import("./verify-wayplan-zone-overlap-v37.mjs");
await import("./verify-wayplan-minimum-load-v44.mjs");
await import("./verify-wayplan-filter-route-crew-v45.mjs");
await import("./verify-wayplan-created-revision-v46.mjs");
await import("./verify-wayplan-revision-delete-v47.mjs");
await import("./verify-wayplan-revision-save-v48.mjs");
