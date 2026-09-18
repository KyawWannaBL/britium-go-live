import fs from "node:fs";

const portal = fs.readFileSync("src/pages/SuperAdminPortal.tsx", "utf8");
const dashboard = fs.existsSync("src/pages/WorkforceManagementView.tsx")
  ? fs.readFileSync("src/pages/WorkforceManagementView.tsx", "utf8")
  : "";

const checks = [
  ["workforce nav item", portal.includes('key: "workforce"')],
  ["workforce view registration", portal.includes('workforce:') && portal.includes("<WorkforceManagementView")],
  ["active workforce source", dashboard.includes('be_active_workforce_view')],
  ["rider/helper/driver counts", dashboard.includes('RIDER') && dashboard.includes('HELPER') && dashboard.includes('DRIVER')],
  ["workforce filters", dashboard.includes('typeFilter') && dashboard.includes('branchFilter')],
  ["profile detail", dashboard.includes('selected') && dashboard.includes('Workforce profile')],
  ["audit visibility", dashboard.includes('be_workforce_audit_logs')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) {
  throw new Error(`Workforce dashboard contract failed: ${failed.map(([name]) => name).join(", ")}`);
}
