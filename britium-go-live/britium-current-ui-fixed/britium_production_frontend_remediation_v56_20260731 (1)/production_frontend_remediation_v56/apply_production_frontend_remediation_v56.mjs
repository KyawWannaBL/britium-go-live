import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const required = [
  "src/App.tsx",
  "src/components/Sidebar.tsx",
  "src/components/operations/FinalSynchronizationV50.tsx",
  "src/pages/AdminHRPage.tsx",
  "src/pages/AccountsPage.tsx",
  "src/pages/BizDevPage.tsx",
  "src/pages/MarketingPage.tsx",
  "src/pages/MarketingPortalPage.tsx",
];

for (const relative of required) {
  const target = path.join(repoRoot, relative);
  if (!fs.existsSync(target)) {
    throw new Error(`Required production source file is missing: ${relative}`);
  }
}

function backup(relative) {
  const target = path.join(repoRoot, relative);
  if (!fs.existsSync(target)) return;
  const backupPath = `${target}.bak-production-v56-${stamp}`;
  fs.copyFileSync(target, backupPath);
  console.log(`Backed up: ${relative}`);
}

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Could not find ${label}. No changes were written to App.tsx.`);
  return source.replace(before, after);
}

const filesToBackup = [
  ...required,
  "src/pages/ProductionReadinessPage.tsx",
  "src/pages/MobileOperationsPage.tsx",
];
filesToBackup.forEach(backup);

let app = fs.readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
app = replaceExact(
  app,
  "const UATGoLiveCommandCenterPage = safeLazy(() => import('@/pages/UATGoLiveCommandCenterPage'));",
  "const ProductionReadinessPage = safeLazy(() => import('@/pages/ProductionReadinessPage'));",
  "the legacy readiness import",
);
app = replaceExact(
  app,
  "const RiderAppPage = safeLazy(() => import('@/pages/RiderAppPage'));",
  "const RiderAppPage = safeLazy(() => import('@/pages/RiderAppPage'));\nconst MobileOperationsPage = safeLazy(() => import('@/pages/MobileOperationsPage'));",
  "the Rider App import anchor",
);
app = app.replace(/^const DataEntryUATUploadPage = .*\r?\n/m, "");
app = app.replace(/^const WarehouseUATUploadPage = .*\r?\n/m, "");
app = replaceExact(
  app,
  '<Route path="/rider-app" element={<RiderAppPage />} />',
  '<Route path="/rider-app" element={<RiderAppPage />} />\n            <Route path="/mobile-operations" element={<MobileOperationsPage />} />',
  "the Rider App route",
);
app = replaceExact(
  app,
  '<Route path="/go-live-readiness" element={<UATGoLiveCommandCenterPage />} />',
  '<Route path="/go-live-readiness" element={<ProductionReadinessPage />} />',
  "the readiness route",
);
app = replaceExact(
  app,
  '<Route path="/data-entry-uat" element={<DataEntryUATUploadPage />} />',
  '<Route path="/data-entry-uat" element={<Navigate to="/data-entry" replace />} />',
  "the retired Data Entry route",
);
app = replaceExact(
  app,
  '<Route path="/warehouse-uat" element={<WarehouseUATUploadPage />} />',
  '<Route path="/warehouse-uat" element={<Navigate to="/warehouse" replace />} />',
  "the retired Warehouse route",
);

if (/UATGoLiveCommandCenterPage|DataEntryUATUploadPage|WarehouseUATUploadPage/.test(app)) {
  throw new Error("UAT-only modules still remain in the active App.tsx registry.");
}
fs.writeFileSync(path.join(repoRoot, "src/App.tsx"), app);
console.log("Updated: src/App.tsx");

const sidebarPath = path.join(repoRoot, "src/components/Sidebar.tsx");
let sidebar = fs.readFileSync(sidebarPath, "utf8");
sidebar = replaceExact(
  sidebar,
  '{ name: "Mobile Operations", path: "/rider-app", icon: Smartphone },',
  '{ name: "Mobile Operations", path: "/mobile-operations", icon: Smartphone },',
  "the Mobile Operations sidebar link",
);
fs.writeFileSync(sidebarPath, sidebar);
console.log("Updated: src/components/Sidebar.tsx");

const payloadRoot = path.join(packageRoot, "payload");
const payloadFiles = [
  "src/components/operations/FinalSynchronizationV50.tsx",
  "src/pages/AdminHRPage.tsx",
  "src/pages/AccountsPage.tsx",
  "src/pages/BizDevPage.tsx",
  "src/pages/MarketingPage.tsx",
  "src/pages/MarketingPortalPage.tsx",
  "src/pages/ProductionReadinessPage.tsx",
  "src/pages/MobileOperationsPage.tsx",
];

for (const relative of payloadFiles) {
  const source = path.join(payloadRoot, relative);
  const target = path.join(repoRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Package payload is missing: ${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Installed: ${relative}`);
}

console.log("\nProduction frontend remediation V56 installed.");
console.log(`Backup suffix: .bak-production-v56-${stamp}`);
console.log("Run: node verify_production_frontend_remediation_v56.mjs");
console.log("Then: rm -rf dist node_modules/.vite && npm run build");
console.log("Then: node verify_dist_production_v56.mjs");
