import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editor = readFileSync(resolve(root, "src/components/workflow/DataEntryLocationEditor.tsx"), "utf8");
const service = readFileSync(resolve(root, "src/lib/deliveryLocationService.ts"), "utf8");
const page = readFileSync(resolve(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");
assert.match(page, /deliveryWayId=\{row\.delivery_way_id \|\| \(row\.pickup_id && row\.parcel_sequence > 0 \? canonicalWayId\(row\.pickup_id, row\.parcel_sequence\) : ""\)\}/, "New parcels need canonical Way ID for location save before registration");


const selection = editor.slice(editor.indexOf("function setPinAtMapCenter()"), editor.indexOf("function moveMapByPixels("));
assert.match(selection, /manualPinTargetRef\.current === "PIN"/, "A dragged/tapped marker must be honored before the map center");
assert.match(selection, /const center = selectedMarker\s*\?/, "Use selected marker when last interaction was a pin");
assert.match(editor, /map\.on\("dragstart",/, "Panning must switch to map center mode");
assert.match(editor, /manualPinTargetRef\.current = "PIN"/, "Dragging/tapping a marker must select pin mode");
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

assert.doesNotMatch(editor, /disabled=\{busy \|\| tileLoadState === "ERROR"\}/, "A tile failure must not disable manual pin confirmation");
assert.doesNotMatch(editor, /absolute inset-0 z-20 grid place-items-center bg-slate-100\/92/, "A tile failure must not cover the interactive map");

console.log("PASS Location pin commit V220 save/readback contract");
