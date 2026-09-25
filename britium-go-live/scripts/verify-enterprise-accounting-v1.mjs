import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "src/lib/accountingApi.ts",
  "src/types/accounting.ts",
  "src/pages/EnterpriseAccountingPage.tsx",
  "src/pages/AdminHRAccountingPage.tsx",
  "src/pages/AccountingControlPage.tsx",
  "src/lib/accountingExports.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing deployed accounting module: ${file}`);
}

const app = readFileSync("src/App.tsx", "utf8");
const access = readFileSync("src/lib/accessControl.ts", "utf8");
const finance = readFileSync("src/pages/EnterpriseAccountingPage.tsx", "utf8");
const admin = readFileSync("src/pages/AdminHRAccountingPage.tsx", "utf8");
const control = readFileSync("src/pages/AccountingControlPage.tsx", "utf8");
const exportsSource = readFileSync("src/lib/accountingExports.ts", "utf8");

for (const route of ["/finance/accounting", "/admin-hr/accounting", "/accounting-control"]) {
  if (!app.includes(route)) throw new Error(`Missing deployed ERP route: ${route}`);
  if (!access.includes(route)) throw new Error(`Missing access-control rule: ${route}`);
}

for (const text of ["Daily Finance Entry", "Finance Review Queue", "General Ledger", "Financial Reports"]) {
  if (!finance.includes(text)) throw new Error(`Finance ERP screen missing: ${text}`);
}

for (const text of ["Assets & HR Costs", "Asset Register"]) {
  if (!admin.includes(text)) throw new Error(`Admin/HR ERP screen missing: ${text}`);
}

for (const text of ["Accounting Control", "Rollout Gates", "Audit Ledger"]) {
  if (!control.includes(text)) throw new Error(`Accounting control screen missing: ${text}`);
}

for (const text of ["buildFinancialWorkbook", "downloadFinancialWorkbook", "printFinancialStatement", "PROVISIONAL", "CLOSED"]) {
  if (!exportsSource.includes(text)) throw new Error(`Accounting export contract missing: ${text}`);
}

console.log("Enterprise accounting deployed-root contract PASS");
