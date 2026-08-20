import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const requireFromRepo = createRequire(path.join(root, "package.json"));
const ts = requireFromRepo("typescript");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("src/App.tsx");
const sidebar = read("src/components/Sidebar.tsx");
const finalSync = read("src/components/operations/FinalSynchronizationV50.tsx");
const adminHr = read("src/pages/AdminHRPage.tsx");
const accounts = read("src/pages/AccountsPage.tsx");
const bizDev = read("src/pages/BizDevPage.tsx");
const marketing = read("src/pages/MarketingPage.tsx");
const marketingPortal = read("src/pages/MarketingPortalPage.tsx");
const readiness = read("src/pages/ProductionReadinessPage.tsx");
const mobile = read("src/pages/MobileOperationsPage.tsx");

const syntaxFiles = [
  "src/App.tsx",
  "src/components/Sidebar.tsx",
  "src/components/operations/FinalSynchronizationV50.tsx",
  "src/pages/AdminHRPage.tsx",
  "src/pages/AccountsPage.tsx",
  "src/pages/BizDevPage.tsx",
  "src/pages/MarketingPage.tsx",
  "src/pages/MarketingPortalPage.tsx",
  "src/pages/ProductionReadinessPage.tsx",
  "src/pages/MobileOperationsPage.tsx",
];

const syntaxErrors = [];
for (const relative of syntaxFiles) {
  const source = read(relative);
  const output = ts.transpileModule(source, {
    fileName: relative,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  for (const diagnostic of output.diagnostics || []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      syntaxErrors.push(`${relative}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
    }
  }
}

const activeText = [app, sidebar, finalSync, adminHr, accounts, bizDev, marketing, marketingPortal, readiness, mobile].join("\n");
const checks = {
  syntax_ok: syntaxErrors.length === 0,
  final_sync_v55_build_marker: finalSync.includes("FINAL_SYNC_CANONICAL_DATA_ENTRY_LINEAGE_V55_2026_07_31"),
  final_sync_uses_v50_snapshot: finalSync.includes('rpc("be_final_sync_snapshot_v50"'),
  final_sync_v54_wrapper_removed: !finalSync.includes("be_final_sync_snapshot_v54"),
  final_sync_uses_server_lineage_valid: finalSync.includes("selected?.lineage_valid !== true"),
  final_sync_shows_recorded_pickup_audit: finalSync.includes("Recorded Pickup") && finalSync.includes("recorded_pickup_id"),
  lineage_variance_manual_resolve_blocked: finalSync.includes("Canonical lineage variances cannot be manually resolved"),
  active_uat_modules_removed: !/UATGoLiveCommandCenterPage|DataEntryUATUploadPage|WarehouseUATUploadPage/.test(app),
  retired_uat_routes_redirect: app.includes('<Route path="/data-entry-uat" element={<Navigate to="/data-entry" replace />} />') && app.includes('<Route path="/warehouse-uat" element={<Navigate to="/warehouse" replace />} />'),
  production_readiness_route_active: app.includes("ProductionReadinessPage") && app.includes('<Route path="/go-live-readiness" element={<ProductionReadinessPage />} />'),
  mobile_operations_route_separate: app.includes('<Route path="/mobile-operations" element={<MobileOperationsPage />} />') && app.includes('<Route path="/rider-app" element={<RiderAppPage />} />'),
  sidebar_mobile_operations_path: sidebar.includes('{ name: "Mobile Operations", path: "/mobile-operations", icon: Smartphone },'),
  admin_hr_fallback_removed: !adminHr.includes("FALLBACK_EMPLOYEES") && adminHr.includes("No local or invented employee records are displayed"),
  accounts_hardcoded_employees_removed: !accounts.includes("HARDCODED_EMPLOYEES") && accounts.includes("Privileged operations are disabled"),
  bizdev_live_rpc: bizDev.includes("be_business_development_command_v54") && !bizDev.includes("setTimeout"),
  marketing_live_rpc: marketing.includes("be_live_marketing_snapshot_v54") && !marketing.includes("be_enterprise_control_tower"),
  marketing_portal_live_rpc: marketingPortal.includes("be_marketing_portal_snapshot_v54"),
  marketing_demo_names_removed: !marketingPortal.includes("Shwe Mart") && !marketingPortal.includes("Daw Mya"),
  mobile_snapshot_rpc: mobile.includes("be_mobile_operations_snapshot_v54"),
  no_prohibited_active_labels: !/BRITIUM GO-LIVE UAT|Mobile Sandbox|UAT \/ Go-Live Version|Required UAT Screens/.test(activeText),
};

console.log(JSON.stringify({ ...checks, syntax_errors: syntaxErrors }, null, 2));
const failed = Object.entries(checks).filter(([, value]) => value !== true);
if (failed.length) {
  console.error(`\nFAILED: ${failed.map(([key]) => key).join(", ")}`);
  process.exit(1);
}
console.log("\nPASS: production frontend remediation V56 source verification completed.");
