import fs from "node:fs";
import path from "node:path";

const BUILD = "FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30";
const root = process.cwd();
const activePage = path.join(root, "src", "pages", "UnifiedOperationsWorkflowPage.tsx");
const versionedPage = path.join(root, "src", "pages", "UnifiedOperationsWorkflowPage.V50.tsx");
const component = path.join(root, "src", "components", "operations", "FinalSynchronizationV50.tsx");
const sqlFile = path.join(root, "final_synchronization_v50.sql");

function requireFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${path.relative(root, file)}`);
}

requireFile(activePage, "Active Ops Workflow page");
requireFile(component, "V50 final synchronization component");
requireFile(sqlFile, "V50 backend SQL");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${activePage}.bak-v50-${stamp}`;
fs.copyFileSync(activePage, backup);

let source = fs.readFileSync(activePage, "utf8");
const importLine = 'import FinalSynchronizationV50 from "@/components/operations/FinalSynchronizationV50";';

if (!source.includes(importLine)) {
  const imports = [...source.matchAll(/^import .*;\s*$/gm)];
  if (!imports.length) throw new Error("Unable to find the import section in UnifiedOperationsWorkflowPage.tsx");
  const lastImport = imports[imports.length - 1];
  const position = lastImport.index + lastImport[0].length;
  source = `${source.slice(0, position)}\n${importLine}\n${source.slice(position)}`;
}

if (!source.includes("<FinalSynchronizationV50 />")) {
  const preferredAnchor = '<div className="space-y-5 text-[#c8dff0]">';
  if (source.includes(preferredAnchor)) {
    source = source.replace(preferredAnchor, `${preferredAnchor}\n      <FinalSynchronizationV50 />`);
  } else {
    const returnIndex = source.indexOf("return (");
    if (returnIndex < 0) throw new Error("Unable to find the component return block");
    const divMatch = /<div\b[^>]*>/.exec(source.slice(returnIndex));
    if (!divMatch) throw new Error("Unable to find the root div in UnifiedOperationsWorkflowPage.tsx");
    const position = returnIndex + divMatch.index + divMatch[0].length;
    source = `${source.slice(0, position)}\n      <FinalSynchronizationV50 />${source.slice(position)}`;
  }
}

fs.writeFileSync(activePage, source);
fs.copyFileSync(activePage, versionedPage);

const activeText = fs.readFileSync(activePage, "utf8");
const componentText = fs.readFileSync(component, "utf8");
const sqlText = fs.readFileSync(sqlFile, "utf8");

for (const [label, content, tokens] of [
  ["active page", activeText, ["FinalSynchronizationV50", "<FinalSynchronizationV50 />"]],
  ["component", componentText, [BUILD, "be_final_sync_snapshot_v50", "be_final_sync_certify_v50"]],
  ["SQL", sqlText, [BUILD, "be_final_sync_refresh_v50", "be_final_sync_variances_v50"]],
]) {
  for (const token of tokens) {
    if (!content.includes(token)) throw new Error(`${label} is missing ${token}`);
  }
}

console.log(`Installed V50 component: ${path.relative(root, component)}`);
console.log(`Patched active page: ${path.relative(root, activePage)}`);
console.log(`Saved versioned page: ${path.relative(root, versionedPage)}`);
console.log(`Backup: ${path.relative(root, backup)}`);
console.log(`PASS installer ${BUILD}`);
console.log("Next: run final_synchronization_v50.sql, clear dist/node_modules/.vite, build, then verify.");
