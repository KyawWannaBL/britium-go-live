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
const accessControl = mustRead("src/lib/accessControl.ts");
const pickup = mustRead("src/pages/PickupFormPage.tsx");
const codSettlement = mustRead("src/pages/CODSettlementPage.tsx");
const financeCodCenter = mustRead("src/pages/FinanceCodCenterPage.tsx");
const workforce = mustRead("src/pages/WorkforceCommissionPage.tsx");
const riderField = mustRead("src/pages/RiderFieldPortalApp.tsx");

for (const marker of [
  'data-be-accounting-portal="true"',
  "ACCOUNTING ERP",
  "Daily Finance Entry",
  "Review Queue",
  "General Ledger",
  "Periodical Finance Reports",
  "Finance Data Entry Template",
  "Download Excel Template",
  "Pre-Dispatch Finance",
  "be_finance_predispatch_queue_v1",
  "be_finance_predispatch_review_v1",
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
assertIncludes(accessControl, "['/finance/accounting', rule('finance', 'finance-user', 'accountant', 'management', 'director')]", "Accounting ERP management route access");

for (const marker of [
  'setTab("reports")',
  'item.id === "ledger" || item.id === "reports"',
  'Read-only management view · Reports, audit and posted ledger',
]) {
  assertIncludes(page, marker, "Accounting read-only management UX");
}

console.log("Accounting ERP production contract PASS");

assertIncludes(pickup, "Payment Type", "Pickup payment type label");
assertIncludes(pickup, "declaredItemValue", "Pickup declared item value");
assertIncludes(pickup, 'option value="COD"', "Pickup COD payment option");
assertIncludes(pickup, 'option value="CASH"', "Pickup Cash payment option");
assertIncludes(pickup, 'option value="KBZ_PAY"', "Pickup KBZ Pay payment option");
assertIncludes(pickup, 'option value="MMQR"', "Pickup MMQR payment option");
assertIncludes(pickup, 'option value="BANK_TRANSFER"', "Pickup Bank Transfer payment option");
assertIncludes(pickup, "200,000 MMK", "Pickup COD threshold guidance");

assertIncludes(codSettlement, "FinanceCodCenterPage", "COD Settlement live finance center route");
assertIncludes(financeCodCenter, "be_finance_cod_sync_v48", "COD delivered-state synchronization");
assertIncludes(financeCodCenter, "be_finance_wayplan_cod_center_v92", "COD Wayplan settlement center");
assertIncludes(workforce, "be_workforce_commission_sync_v198", "Workforce delivered-stop commission synchronization");
assertIncludes(riderField, "Verify Delivery / Delivered", "Rider delivery verification UI");
assertIncludes(riderField, "COD must be collected before delivery", "Rider COD collection guard");
assertIncludes(riderField, "delivery proof photo", "Rider delivery proof guard");
console.log("Finance Rider-to-Settlement production contract PASS");
