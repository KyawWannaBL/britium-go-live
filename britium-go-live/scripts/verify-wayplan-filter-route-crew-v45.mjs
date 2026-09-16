import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const page = fs.readFileSync(path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx"), "utf8");
const planner = fs.readFileSync(path.join(root, "src", "components", "MultiVanPlanner.tsx"), "utf8");

assert.ok(page.includes("Select All Filtered"), "V45 must expose Select All Filtered in the queue filter area");
assert.ok(page.includes("Clear Filtered"), "V45 must expose Clear Filtered in the queue filter area");
assert.ok(page.includes("const plannerRows = filteredSelectedRows;"), "V45 planner input must contain only selected filtered rows");
assert.ok(page.includes("rows={plannerRows}"), "V45 must pass selected filtered rows to the route planner");
assert.ok(!page.includes("filteredSelectedRows.length ? filteredSelectedRows : filteredReadyRows"), "V45 must not silently optimize every filtered row when nothing is selected");
assert.ok(page.includes("Britium Ventures Head Office"), "V45 must show the approved Yangon routing origin to operators");
assert.ok(page.includes("Driver / Rider / Helper"), "V45 must tell operators that selected filtered ways receive roster assignment");

assert.ok(planner.includes("const origin = context?.route_origins?.[region];"), "V45 must keep routing tied to the configured branch origin");
assert.ok(planner.includes("assignCrews(strategic, drivers, riders, helpers"), "V45 must auto-assign Driver/Rider/Helper after filtered route allocation");
assert.ok(planner.includes('fetch("/api/wayplan-route"'), "V45 must keep actual road optimization through the production road-routing endpoint");
assert.ok(planner.includes("driver_code"), "V45 must preserve Driver assignment in route plans");
assert.ok(planner.includes("rider_code"), "V45 must preserve Rider assignment in route plans");
assert.ok(planner.includes("helper_code"), "V45 must preserve Helper assignment in route plans");

console.log("Wayplan V45 filtered route + crew workflow PASS");
