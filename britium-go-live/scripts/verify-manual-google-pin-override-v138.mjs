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

const disabledBranchStart = editor.indexOf("if (!enabled && !manualOpen)");
assert.ok(disabledBranchStart >= 0, "manual override gate must exist");
const disabledBranch = editor.slice(disabledBranchStart, disabledBranchStart + 4200);
assert.match(
  disabledBranch,
  /openRelocationMap\(\)/,
  "The map-not-required panel must offer an operator button to open the manual Google pin editor.",
);
assert.match(
  disabledBranch,
  /OPEN MANUAL MAP|SET PIN MANUALLY|EDIT PIN/i,
  "The manual-map override control must be visibly labelled.",
);

const effectStart = editor.indexOf("useEffect(() => {", editor.indexOf("async function openRelocationMap"));
const effectBlock = editor.slice(effectStart, effectStart + 3600);
assert.match(
  effectBlock,
  /\(!enabled\s*&&\s*!manualOpen\)/,
  "Interactive Google Maps loading must be allowed after a manual override even when mapping is not routing-required.",
);

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
