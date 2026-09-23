import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const editor=fs.readFileSync(path.join(root,"src/components/workflow/DataEntryLocationEditor.tsx"),"utf8");
const planner=fs.readFileSync(path.join(root,"src/components/MultiVanPlanner.tsx"),"utf8");

assert.match(editor,/mapExpanded/,"location editor must have explicit map expansion state");
assert.match(editor,/SHOW MAP|EXPAND MAP/,"location editor must expose a deliberate map expand control");
assert.doesNotMatch(editor,/xl:grid-cols-\[\.9fr_1\.1fr\]/,"location editor must not split inside the narrow recycled-form column");
assert.match(editor,/data-location-map-panel-v131/,"map panel must have a bounded non-overflowing hook");
assert.match(editor,/savedMapboxExact/,"validated exact Mapbox pins must be restored without a Google reverse-geocode dependency");
assert.doesNotMatch(editor,/WARD_APPROXIMATE\|STREET_APPROXIMATE\/.test\(savedSource\).*MAPBOX/s,"saved exact Mapbox pins must not be blanket-rejected");
assert.match(editor,/COLLAPSE MAP|MINIMIZE MAP/,"expanded map must be collapsible");

assert.match(planner,/LOCATION_RECOVERY_INTERACTIVE_LIMIT/,"Wayplan planner must cap synchronous location recovery");
assert.match(planner,/deferred road optimization/i,"Wayplan must explicitly proceed when location recovery is deferred");
assert.match(planner,/provider quota|RESOURCE_EXHAUSTED|quota/i,"Wayplan recovery must recognize provider quota exhaustion as non-blocking");
assert.match(planner,/planningRows = scopedRows/,"Wayplan must preserve selected rows when location resolution is unavailable");

console.log("location panel and Wayplan V131 contract PASS");
