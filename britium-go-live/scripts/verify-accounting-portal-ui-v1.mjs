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
  "Periodical Finance Reports",
  "Finance Data Entry Template",
  "Download Excel Template",
  "MMQR",
  "09897447722",
  "KBZ Pay",
  "09897447733",
  "be_accounting_submit_finance_daily_v2",
  "be_accounting_review_event_v1",
  "be_accounting_post_approved_event_v2",
  "be_accounting_raise_fraud_flag_v2",
  "be_accounting_general_ledger_v1",
  "be_accounting_periodic_report_v2",
  "be_accounting_audit_report_v2",
]) {
  assertIncludes(page, marker, "AccountingPortalPage");
}

assertIncludes(app, 'path="/finance/accounting"', "App route");
assertIncludes(app, 'import("@/pages/AccountingPortalPage")', "App lazy import");
assertIncludes(app, 'path="/finance"', "Existing Finance route");
assertIncludes(app, 'path="/finance/data-entry-review"', "Existing Finance review route");
assertIncludes(sidebar, 'path: "/finance/accounting"', "Sidebar route");
assertIncludes(sidebar, 'name: "Accounting ERP"', "Sidebar label");

console.log("Accounting ERP production contract PASS");
