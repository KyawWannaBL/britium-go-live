import fs from "node:fs";

const pagePath = "src/pages/FinancePortalPage.tsx";
const appPath = "src/App.tsx";

const page = fs.readFileSync(pagePath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

const requiredPageMarkers = [
  "ACCOUNTING WORKSPACE",
  "Daily Finance Entry",
  "Review Queue",
  "General Ledger",
  "Profit & Loss",
  "Balance Sheet",
  'be_accounting_submit_finance_daily_v1',
  'be_accounting_review_event_v1',
  'be_accounting_post_event_v1',
  'be_accounting_profit_loss_v1',
  'be_accounting_balance_sheet_v1',
  'be_accounting_events',
  'be_journal_entries'
];

const missing = requiredPageMarkers.filter((marker) => !page.includes(marker));
if (missing.length) {
  console.error("Accounting portal UI contract missing:", missing.join(", "));
  process.exit(1);
}

if (!app.includes('path="/finance"')) {
  console.error("Finance route /finance is missing from App.tsx");
  process.exit(1);
}

if (page.includes('export { FinancePortalLivePage as default }')) {
  console.error("FinancePortalPage is still only re-exporting the legacy Finance live page");
  process.exit(1);
}

console.log("enterprise accounting portal UI contract PASS");
