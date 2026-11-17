import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editor = readFileSync(resolve(root, "src/components/workflow/DataEntryLocationEditor.tsx"), "utf8");
const service = readFileSync(resolve(root, "src/lib/deliveryLocationService.ts"), "utf8");

const selection = editor.slice(editor.indexOf("function setPinAtMapCenter()"), editor.indexOf("function moveMapByPixels("));
assert.match(selection, /const center = leafletCenter\s*\?/, "Map pan should use center before stale marker");
assert.match(selection, /leafletMarkerRef\.current\?\.setLatLng\?\.\(\[center\.latitude, center\.longitude\]\)/, "Confirming a center should move the marker");

const edits = editor.slice(editor.indexOf("function setManualMapCoordinate("), editor.indexOf("function setMapFocus("));
assert.match(edits, /requestSequence\.current \+= 1/, "Manual pin must invalidate stale geocoder results");
assert.doesNotMatch(edits, /autoPersistManualPin|saveDeliveryLocation\(/, "Editing the pin should not start background writes");

const apply = editor.slice(editor.indexOf("async function apply()"), editor.indexOf("async function skipReview()"));
assert.match(apply, /await saveDeliveryLocation\(supabase, next\)/, "Apply must save a verified manual point");
assert.match(apply, /be_delivery_location_get_v10/, "Apply must reload persisted coordinates");
assert.match(apply, /persisted\.review_status !== "ACCEPTED"/, "Apply must verify backend acceptance");
assert.match(apply, /Math\.abs\(Number\(persisted\.latitude\) - Number\(lat\)\)/, "Apply must verify latitude");
assert.match(apply, /Math\.abs\(Number\(persisted\.longitude\) - Number\(lng\)\)/, "Apply must verify longitude");
assert.ok(apply.indexOf('reportResolution("SYNCED")') > apply.indexOf("be_delivery_location_get_v10"), "SYNCED only after verification");
assert.match(apply, /coordinateMatchesTownship\(/, "Retain township protection");

const save = service.slice(service.indexOf("export async function saveDeliveryLocation("), service.indexOf("export function googleMapsLocationUrl("));
assert.match(save, /if \(!data \|\| data\.ok === false\)/, "Reject false-success RPC responses");

console.log("PASS Location pin commit V220 save/readback contract");
