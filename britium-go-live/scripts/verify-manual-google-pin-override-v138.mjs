import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const editorPath = path.join(root, "src/components/workflow/DataEntryLocationEditor.tsx");
const pagePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");

const editor = fs.readFileSync(editorPath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

assert.match(
  editor,
  /if\s*\(!enabled\s*&&\s*!manualOpen\)\s*\{/,
  "A route where mapping is not required must stay compact only until the operator explicitly opens manual map mode.",
);

const disabledBranchStart = editor.indexOf('if (!enabled && !manualOpen) {\n    return <div data-location-details="true"');
assert.ok(disabledBranchStart >= 0, "manual override gate must exist");
const disabledBranch = editor.slice(disabledBranchStart, disabledBranchStart + 4200);
assert.match(
  disabledBranch,
  /openRelocationMap\(\)/,
  "The map-not-required panel must offer an operator button to open the manual Google pin editor.",
);
assert.match(
  disabledBranch,
  /OPEN MANUAL MAP|SET PIN MANUALLY|EDIT PIN|STREET MAP VIEW|EDIT DROP-OFF PIN/i,
  "The manual-map override control must be visibly labelled, including the optional STREET MAP VIEW caption.",
);

const keylessEditorStart = editor.indexOf("function handleFallbackPointerDown");
const realInteractiveEditorStart = editor.indexOf("new mapboxgl.Map");
const domTileEditorStart = editor.indexOf("function handleDomMapPointerDown");
const leafletEditorStart = editor.indexOf("loadLeafletRuntime");
assert.ok(
  keylessEditorStart >= 0
    || realInteractiveEditorStart >= 0
    || domTileEditorStart >= 0
    || leafletEditorStart >= 0
    || /\(!enabled\s*&&\s*!manualOpen\)/.test(editor),
  "Manual map mode must remain available even when mapping is not routing-required.",
);
if (leafletEditorStart >= 0) {
  assert.match(editor, /L\.map\(/, "Leaflet editor must initialize a real interactive map.");
  assert.match(editor, /L\.tileLayer\(/, "Leaflet editor must use a raster tile layer.");
  assert.match(editor, /map\.on\(["']moveend["']/, "Leaflet editor must track pan movement.");
  assert.match(editor, /map\.on\(["']click["']/, "Leaflet editor must support tap-to-recenter.");
  assert.match(editor, /SET PIN HERE/, "Leaflet editor must expose explicit pin confirmation.");
  assert.match(editor, /setManualMapCoordinate/, "Confirmed Leaflet center must copy into Data Entry coordinates.");
} else if (domTileEditorStart >= 0) {
  const domTileBlock = editor.slice(domTileEditorStart, domTileEditorStart + 7600);
  assert.match(domTileBlock, /handleDomMapPointerMove/, "DOM tile editor must pan continuously while dragging.");
  assert.match(domTileBlock, /handleDomMapPointerUp/, "DOM tile editor must support tap-to-recenter.");
  assert.match(domTileBlock, /handleDomMapWheel/, "DOM tile editor must support wheel zoom.");
  assert.match(editor, /SET PIN HERE/, "DOM tile editor must expose explicit pin confirmation.");
  assert.match(editor, /setManualMapCoordinate/, "Confirmed center must copy into Data Entry coordinates.");
} else if (realInteractiveEditorStart >= 0) {
  const interactiveBlock = editor.slice(realInteractiveEditorStart, realInteractiveEditorStart + 6200);
  assert.match(interactiveBlock, /map\.on\(["']move["']/, "Interactive map must update its center while the user drags.");
  assert.match(interactiveBlock, /map\.on\(["']click["']/, "Interactive map must support tap-to-recenter.");
  assert.match(editor, /SET PIN HERE/, "Interactive map must expose an explicit SET PIN HERE confirmation.");
  assert.match(editor, /setManualMapCoordinate/, "Confirmed map center must copy into Data Entry coordinates.");
} else if (keylessEditorStart >= 0) {
  const keylessEditorBlock = editor.slice(keylessEditorStart, keylessEditorStart + 5200);
  assert.match(keylessEditorBlock, /handleFallbackPointerUp/);
  assert.match(keylessEditorBlock, /setManualMapCoordinate/);
}

const applyStart = editor.indexOf("async function apply()");
const applyBlock = editor.slice(applyStart, applyStart + 2600);
assert.match(
  applyBlock,
  /if\s*\(!enabled\s*&&\s*!manualOpen\)/,
  "Manual coordinates must be applicable after the operator explicitly opens the map on a non-required route.",
);

assert.match(
  page,
  /enabled=\{route\.mapRequired\}/,
  "Routing policy should continue to decide whether location is automatically required; the editor itself must separate that from manual availability.",
);

console.log("Manual Google pin override V138 contract PASS");
