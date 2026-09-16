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
assert.ok(page.includes("filteredSelectedRows"), "V45 planning input must be derived from selected filtered rows");
assert.ok(page.includes("plannerRows={filteredSelectedRows}"), "V45 must pass only selected filtered rows to the route planner");
assert.ok(!page.includes("filteredSelectedRows.length ? filteredSelectedRows : filteredReadyRows"), "V45 must not silently optimize every filtered row when nothing is selected");

assert.ok(planner.includes("Britium Ventures Head Office"), "V45 must label Yangon routing origin as Britium Ventures Head Office");
assert.ok(planner.includes("16.8409"), "V45 must pin the approved Yangon Head Office latitude");
assert.ok(planner.includes("96.1735"), "V45 must pin the approved Yangon Head Office longitude");
assert.ok(planner.includes("Optimize selected routes + assign crew"), "V45 must expose the combined route optimization and roster assignment task");
assert.ok(planner.includes("Auto-assign Driver / Rider / Helper"), "V45 must expose crew reassignment for generated routes");
assert.ok(planner.includes("assignCrews(plans"), "V45 crew task must reuse the roster assignment engine");
assert.ok(planner.includes("driver_code"), "V45 must preserve Driver assignment in route plans");
assert.ok(planner.includes("rider_code"), "V45 must preserve Rider assignment in route plans");
assert.ok(planner.includes("helper_code"), "V45 must preserve Helper assignment in route plans");

console.log("Wayplan V45 filtered route + crew workflow PASS");
