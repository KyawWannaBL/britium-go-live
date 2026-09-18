import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (relative) => {
  const target = path.join(root, relative);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
};

const page = read("src/pages/DataEntryFinancialV2Page.tsx");
const access = read("src/lib/accessControl.ts");
const migration = read("supabase/migrations/20260919003000_data_entry_draft_submission_v53.sql");

const checks = [
  ["draft save RPC is wired", page.includes('be_data_entry_save_draft_v53')],
  ["draft list RPC is wired", page.includes('be_data_entry_list_drafts_v53')],
  ["multi-merchant submit RPC is wired", page.includes('be_data_entry_submit_drafts_v53')],
  ["Save Draft control exists", page.includes('SAVE DRAFT')],
  ["submission queue exists", page.includes('data-draft-submission-queue-v53="true"')],
  ["Submit Ready Drafts control exists", page.includes('SUBMIT READY DRAFTS')],
  ["draft save does not use live save batch", /async function saveDraft[\\s\\S]{0,5000}be_data_entry_financial_v2_save_batch_v22/.test(page) === false],
  ["single-pickup Create & Generate control removed", page.includes('CREATE & GENERATE WAYBILL') === false],
  ["invoice studio is explicitly finance/superadmin only", access.includes("const INVOICE_ROLES") && access.includes("['finance', 'super-admin', 'superadmin']")],
  ["invoice paths use sensitive access check before elevated bypass", access.includes("isInvoicePath(path)") && access.indexOf("isInvoicePath(path)") < access.indexOf("ELEVATED_ROLES.has(role)")],
  ["draft table migration exists", migration.includes("create table if not exists public.be_data_entry_drafts_v53")],
  ["draft save RPC migration exists", migration.includes("be_data_entry_save_draft_v53")],
  ["draft list RPC migration exists", migration.includes("be_data_entry_list_drafts_v53")],
  ["draft submit RPC migration exists", migration.includes("be_data_entry_submit_drafts_v53")],
  ["invoice list is finance/superadmin guarded", migration.includes("create or replace function public.be_invoice_list") && migration.includes("FINANCE_INVOICE_ACCESS_REQUIRED")],
  ["invoice approval is finance/superadmin guarded", migration.includes("create or replace function public.be_invoice_approve") && migration.includes("FINANCE_INVOICE_ACCESS_REQUIRED")],
  ["invoice snapshot is finance/superadmin guarded", migration.includes("create or replace function public.be_invoice_studio_snapshot") && migration.includes("FINANCE_INVOICE_ACCESS_REQUIRED")],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Data Entry Draft Submission V53 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Data Entry Draft Submission V53 contract PASS");
