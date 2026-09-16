import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pagePath = path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx");
const source = fs.readFileSync(pagePath, "utf8");

const requiredMarkers = [
  'from "@/lib/wayplanQueueFilters"',
  'data-wayplan-queue-filters="true"',
  'Township<select',
  'Merchant<select',
  'Service Provider<select',
  'Status<select',
  'Group By<select',
  'placeholder="Waybill, recipient, address..."',
  'filterWayplanQueueRows(readyRows',
  'groupWayplanQueueRows(filteredReadyRows, groupBy)',
  'toggleVisibleWayplanSelection(prev, filteredReadyRows)',
  'rows={filteredSelectedRows.length ? filteredSelectedRows : filteredReadyRows}',
  'groupedReadyRows.map((group)',
  'filteredReadyRows.length} filtered / {readyRows.length} ready stops',
  'No ways match the current filters.',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length) {
  console.error("Wayplan queue filter UI contract FAILED:");
  for (const marker of missing) console.error(` - missing: ${marker}`);
  process.exit(1);
}

console.log("Wayplan queue filter UI contract PASS");
await import("./verify-wayplan-fleet-multitrip-v43.mjs");
