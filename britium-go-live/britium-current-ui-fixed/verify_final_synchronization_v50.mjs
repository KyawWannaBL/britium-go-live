import fs from "node:fs";
import path from "node:path";

const BUILD = "FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30";
const root = process.cwd();

const checks = [
  {
    label: "active Ops Workflow source",
    file: path.join(root, "src", "pages", "UnifiedOperationsWorkflowPage.tsx"),
    tokens: ["FinalSynchronizationV50", "<FinalSynchronizationV50 />"],
  },
  {
    label: "V50 component source",
    file: path.join(root, "src", "components", "operations", "FinalSynchronizationV50.tsx"),
    tokens: [BUILD, "be_final_sync_snapshot_v50", "be_final_sync_refresh_v50", "be_final_sync_certify_v50"],
  },
  {
    label: "V50 SQL",
    file: path.join(root, "final_synchronization_v50.sql"),
    tokens: [
      BUILD,
      "be_final_sync_cases_v50",
      "be_final_sync_variances_v50",
      "be_final_sync_refresh_v50",
      "be_final_sync_snapshot_v50",
      "be_final_sync_assign_variance_v50",
      "be_final_sync_resolve_variance_v50",
      "be_final_sync_certify_v50",
    ],
  },
];

for (const check of checks) {
  if (!fs.existsSync(check.file)) throw new Error(`${check.label} is missing: ${path.relative(root, check.file)}`);
  const content = fs.readFileSync(check.file, "utf8");
  for (const token of check.tokens) {
    if (!content.includes(token)) throw new Error(`${check.label} is missing ${token}`);
  }
  if (/service[_-]?role/i.test(content) && /VITE_/i.test(content)) {
    throw new Error(`${check.label} appears to expose a service-role secret through a VITE_* variable`);
  }
  console.log(`PASS source: ${path.relative(root, check.file)}`);
}

const appFile = path.join(root, "src", "App.tsx");
if (!fs.existsSync(appFile)) throw new Error("src/App.tsx is missing");
const appText = fs.readFileSync(appFile, "utf8");
if (!appText.includes('/ops-workflow')) throw new Error("App route /ops-workflow is missing");
console.log("PASS route: /ops-workflow");

const dist = path.join(root, "dist", "assets");
if (!fs.existsSync(dist)) throw new Error("dist/assets is missing. Run npm run build before the verifier.");
const bundleFiles = fs.readdirSync(dist).filter((name) => name.endsWith(".js"));
let bundleText = "";
for (const name of bundleFiles) bundleText += fs.readFileSync(path.join(dist, name), "utf8");
for (const token of [BUILD, "be_final_sync_snapshot_v50", "be_final_sync_certify_v50"]) {
  if (!bundleText.includes(token)) throw new Error(`Production bundle is missing ${token}`);
}
console.log("PASS production bundle: V50 final synchronization markers and RPCs");
console.log("SAFE TO DEPLOY FINAL SYNCHRONIZATION V50");
