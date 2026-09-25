import fs from "node:fs";

function mustRead(path) {
  if (!fs.existsSync(path)) throw new Error(`missing required file: ${path}`);
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const page = mustRead("src/pages/AccountingPortalPage.tsx");
const app = mustRead("src/App.tsx");
const sidebar = mustRead("src/components/Sidebar.tsx");

for (const marker of [
  'data-be-accounting-portal="true"',
  "ACCOUNTING ERP",
  "Daily Finance Entry",
  "Review Queue",
  "General Ledger",
  "P&L / Balance Sheet",
  "be_accounting_submit_finance_daily_v1",
  "be_accounting_review_event_v1",
]) {
  assertIncludes(page, marker, "AccountingPortalPage");
}

assertIncludes(app, 'path="/finance/accounting"', "App route");
assertIncludes(app, 'import("@/pages/AccountingPortalPage")', "App lazy import");
assertIncludes(sidebar, 'path: "/finance/accounting"', "Sidebar route");
assertIncludes(sidebar, 'name: "Accounting ERP"', "Sidebar label");

console.log("Accounting portal UI V1 contract PASS");
