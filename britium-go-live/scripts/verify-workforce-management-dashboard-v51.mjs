import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const sidebar = fs.readFileSync("src/components/Sidebar.tsx", "utf8");
const dashboard = fs.existsSync("src/pages/WorkforceManagementPage.tsx")
  ? fs.readFileSync("src/pages/WorkforceManagementPage.tsx", "utf8")
  : "";

const checks = [
  ["workforce route import", app.includes('WorkforceManagementPage')],
  ["workforce route path", app.includes('path="/workforce-management"')],
  ["workforce sidebar link", sidebar.includes('path: "/workforce-management"')],
  ["active workforce source", dashboard.includes('be_active_workforce_view')],
  ["rider/helper/driver summary", dashboard.includes('"RIDER"') && dashboard.includes('"HELPER"') && dashboard.includes('"DRIVER"')],
  ["search/type/branch filters", dashboard.includes("typeFilter") && dashboard.includes("branchFilter") && dashboard.includes("search")],
  ["profile detail", dashboard.includes("selected") && dashboard.includes("Workforce Profile")],
  ["audit history source", dashboard.includes("be_workforce_audit_logs")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  throw new Error(`Workforce Management V51 contract failed: ${failed} check(s)`);
}

console.log("Workforce Management V51 contract PASS");
