import { supabase } from "@/integrations/supabase/client";
import { type FinanceReport, type ReportColumn } from "@/lib/financeReportExports";
import { reportTime } from "@/lib/parcelLifecycleReport";

export type ReportPeriod = { from: string; to: string };
type Row = Record<string, unknown>;
type Group = "performance" | "settlements" | "accounting";
type ReportSource = "hub" | "periodic" | "audit";
type ColumnSpec = [key: string, label: string, kind?: "number"];
type Definition = {
  id: string;
  title: string;
  group: Group;
  basis: string;
  columns: ReportColumn[];
  source: ReportSource;
  section?: string;
  note?: string;
};

export const reportGroups = [
  { id: "performance", title: "Performance & costs" },
  { id: "settlements", title: "Settlements & commissions" },
  { id: "accounting", title: "Accounts & audit" },
] as const;

const columns = (...specifications: ColumnSpec[]) =>
  specifications.map(([key, label, kind]) => ({ key, label, kind }));

const amount = (key: string, label: string): ColumnSpec => [key, label + " (MMK)", "number"];
const account = columns(["account_code", "Account code"], ["account_name", "Account"], ["account_type", "Type"],
  ["report_group", "Cost group"], amount("amount", "Posted amount"), ["line_count", "Posted lines", "number"]);

export const pnlMetrics = [
  ["revenue", "Posted revenue"], ["cogs", "Cost of goods sold"], ["gross_profit", "Gross profit"],
  ["salary", "Staff salary"], ["administration", "Administration"], ["opex", "Total operating expenses"],
  ["net_profit", "Posted net profit"],
] as const;

const pnlNote = "Based on posted MMK journal lines. Salary and administration are included in recorded costs and shown separately for review. Unposted or unrecorded expenses can affect actual profit.";
const codNote = "COD represents collections and remittances on behalf of merchants. It is excluded from posted company revenue.";
const wayNote = "Amounts are shown only where directly linked to the Way ID. Pickup-level commissions, batch-level amounts, salaries and shared administration costs have no parcel allocation.";
const posted = "Journal accounting date (Myanmar)";
const defined = (id: string, title: string, group: Group, basis: string, columns: ReportColumn[],
  source: ReportSource = "hub", section?: string, note?: string): Definition => ({ id, title, group, basis, columns, source, section, note });

export const hubReports: Definition[] = [
  defined("pnl", "Profit & loss", "performance", posted, account, "hub", undefined, pnlNote),
  defined("cogs", "Cost of goods sold", "performance", posted, account, "hub", undefined, pnlNote),
  defined("overheads", "Staff salary & administrative costs", "performance", posted, account, "hub", undefined, pnlNote),
  defined("branch", "Branch profit & loss", "performance", posted, columns(["branch", "Branch"],
    amount("revenue", "Revenue"), amount("cogs", "COGS"), amount("salary", "Salary"),
    amount("administration", "Administration"), amount("opex", "Operating expenses"), amount("net_profit", "Net profit")),
    "hub", undefined, "Uses the branch code on each posted line. Unassigned amounts appear in a separate row."),
  defined("parcel-finance", "Parcel financial register", "performance", "Data Entry registration date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["pickup_id", "Pickup ID"], ["merchant_id", "Merchant"], ["saved_at", "Registered"],
      ["delivery_route_mode", "Route"], amount("item_price", "Item value"), amount("cod_amount", "Expected COD"),
      amount("quoted_delivery_revenue", "Delivery projection"), amount("reported_collected", "COD collected"),
      amount("cod_settled", "COD settled"), ["cod_status", "COD status"], amount("merchant_receipt_amount", "Merchant receipt"),
      ["merchant_settled_at", "Merchant settlement"], amount("linked_commission", "Linked commission"),
      amount("posted_revenue", "Linked posted revenue"), amount("posted_cogs", "Linked posted COGS"),
      amount("linked_gross_margin", "Linked gross margin"), ["financial_validation_status", "Validation"]),
    "hub", undefined, "Only registered Data Entry ways are included. Linked ledger, commission and merchant receipt amounts are through the selected end date. COD uses the current recorded state. A blank amount means no linked record. The linked margin covers recorded lines only."),
  defined("operations", "Pickup requests by day", "performance", "Pickup request date (Myanmar)",
    columns(["label", "Date"], ["requests", "Pickup requests", "number"], amount("reported_fee", "Recorded delivery fee"))),
  defined("operations-status", "Pickup requests by status", "performance", "Pickup request date (Myanmar)",
    columns(["label", "Current status"], ["requests", "Pickup requests", "number"])),
  defined("operations-tier", "Pickup requests by service tier", "performance", "Pickup request date (Myanmar)",
    columns(["label", "Service tier"], ["requests", "Pickup requests", "number"], amount("reported_fee", "Recorded delivery fee"))),
  defined("warehouse", "Warehouse receiving", "performance", "First recorded warehouse receipt activity (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["pickup_id", "Pickup ID"], ["warehouse_code", "Warehouse"],
      ["warehouse_status", "Status"], ["warehouse_entered_at", "Warehouse entry"], ["scanned_at", "Inbound scan"],
      ["receiving_scan_skipped", "Scan skipped"], ["receiving_scan_skipped_at", "Skip recorded"],
      ["qa_approved_at", "QA approved"], ["ready_at", "Ready"])),
  defined("dispatch", "Dispatch and team release", "performance", "Dispatch scan, release or assignment date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["wayplan_code", "Wayplan"], ["dispatch_status", "Status"],
      ["published_at", "Released to team"], ["dispatch_scan_at", "Dispatch scan"], ["activity_at", "Activity"])),
  defined("delivery-attempts", "Delivery attempts", "performance", "Delivery attempt date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["pickup_id", "Pickup ID"], ["attempt_number", "Attempt", "number"],
      ["result_status", "Recorded outcome"], ["created_at", "Recorded"])),
  defined("provider", "Third-party & branch handovers", "performance", "Physical handover date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["provider_code", "Provider"], ["wayplan_id", "Wayplan"],
      ["handover_location_code", "Receiving site"], ["handover_manifest_ref", "Manifest"],
      ["provider_receipt_ref", "Provider receipt"], ["physically_handed_over_at", "Physically handed over"])),
  defined("returns", "Return-to-origin operations", "performance", "Recorded RTO date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["pickup_id", "Pickup ID"], ["rto_at", "RTO recorded"],
      ["last_status", "Latest status"], ["last_failure_reason", "Last failure reason"])),
  defined("cod", "Rider COD settlement", "settlements", "Latest recorded COD activity date (Myanmar)",
    columns(["delivery_way_id", "Way ID"], ["wayplan_id", "Wayplan"], ["activity_at", "Activity"], amount("expected_cod", "Expected"),
      amount("reported_collected", "Collected"), amount("rider_remittance", "Remitted"), amount("settled_amount", "Settled"),
      amount("delivery_fee", "Delivery fee"), amount("variance_amount", "Variance"), ["settlement_status", "Status"],
      ["settlement_reference", "Reference"], ["settled_at", "Settled at"]), "hub", undefined, codNote),
  defined("merchant-batches", "Merchant settlement batches", "settlements", "Batch creation date (Myanmar)",
    columns(["batch_number", "Batch"], ["merchant_id", "Merchant code"], ["merchant_name", "Merchant"], ["created_at", "Created"],
      ["status", "Batch status"], ["payment_status", "Payment status"], amount("parcel_settlement_total", "Parcel subtotal"),
      amount("batch_credits", "Credits"), amount("batch_deductions", "Deductions"), amount("rto_return_fee_deduction", "RTO deduction"),
      amount("advance_recovery", "Advance recovery"), amount("withholding_tax", "Withholding tax"),
      amount("batch_net_payable", "Net payable"), amount("paid_amount", "Paid"), amount("outstanding_amount", "Outstanding"),
      ["approved_at", "Approved at"], ["paid_at", "Paid at"]), "hub", undefined, "Shows each batch once with its current recorded payment status and balances."),
  defined("merchant-payments", "Merchant payouts", "settlements", "Payment confirmation date (Myanmar)",
    columns(["confirmed_at", "Confirmed"], ["batch_number", "Batch"], ["merchant_id", "Merchant code"],
      ["merchant_name", "Merchant"], amount("amount", "Confirmed payout"), ["payment_method", "Method"], ["payment_reference", "Reference"])),
  defined("commission", "Workforce commission", "settlements", "Commission work date (Myanmar)",
    columns(["work_date", "Work date"], ["operation_type", "Operation"], ["role_code", "Role"], ["worker", "Staff member"], ["unit_type", "Unit type"],
      ["units", "Units", "number"], ["events", "Events", "number"], ["event_status", "Status"], amount("commission_mmk", "Commission")),
    "hub", undefined, "Shows recorded commission by work date and status. Posted commission expense is already included in the applicable P&L account."),
  defined("adjustments", "Post-settlement adjustments", "settlements", "Adjustment creation date (Myanmar)",
    columns(["created_at", "Requested"], ["updated_at", "Last update"], ["adjustment_type", "Type"], ["merchant_id", "Merchant"],
      ["batch_number", "Merchant batch"], ["delivery_way_id", "Way ID"], ["status", "Status"], amount("difference", "Adjustment"), ["reference", "Adjustment batch"])),
  defined("rto-fees", "RTO fee deductions", "settlements", "Merchant settlement batch creation date (Myanmar)",
    columns(["policy_month", "Policy month"], ["delivery_way_id", "Way ID"], ["merchant_id", "Merchant"], ["batch_number", "Batch"],
      ["batch_status", "Batch status"], ["monthly_ways", "Eligible ways", "number"], ["waiver_limit", "Waiver slots", "number"],
      ["rto_position", "RTO position", "number"], amount("return_fee", "Return fee")),
    "hub", undefined, "Shows Britium-managed return fee reservations and their batch status. Third-party fees follow provider settlement."),
  defined("balance", "Balance sheet", "accounting", "Closing balance through the end date",
    columns(["account_code", "Account"], ["account_name", "Account name"], ["account_type", "Type"], amount("amount", "Closing balance"))),
  defined("trial-balance", "Trial balance", "accounting", "Cumulative posted debit and credit through the end date",
    columns(["account_code", "Account"], ["account_name", "Account name"], ["account_type", "Type"],
      amount("debit_amount", "Cumulative debit"), amount("credit_amount", "Cumulative credit"), amount("amount", "Net balance"))),
  defined("cash", "Cash flow", "accounting", posted,
    columns(["account_code", "Account"], ["account_name", "Account name"], amount("inflows", "Inflows"), amount("outflows", "Outflows"), amount("net_movement", "Net movement")),
    "periodic", "cash_flow"),
  defined("positions", "Receivables & payables", "accounting", "Closing balance through the end date",
    columns(["metric", "Ledger position"], amount("amount", "Closing balance")), "periodic", "receivables_payables"),
  defined("channels", "Payment channel activity", "accounting", "Finance submission entry date",
    columns(["payment_method", "Method"], ["submissions", "Submissions", "number"], amount("total_activity", "Recorded activity")), "periodic", "payment_channels",
    "Recorded finance activity may combine different transaction types. Use Cash Flow for posted net cash movement."),
  defined("ledger", "General ledger", "accounting", posted,
    columns(["accounting_date", "Accounting date"], ["journal_number", "Journal"], ["sequence_no", "Line", "number"],
      ["account_code", "Account"], ["account_name", "Account name"], ["branch_code", "Branch"], ["merchant_id", "Merchant"],
      ["source_reference", "Reference"], ["cost_center", "Cost centre"], amount("debit_amount", "Debit"), amount("credit_amount", "Credit"))),
  defined("journals", "Journal register", "accounting", posted,
    columns(["journal_number", "Journal"], ["accounting_date", "Accounting date"], ["description", "Description"], ["posted_at", "Posted"],
      ["source_event_id", "Source event"], ["reversal_of_journal_id", "Reversal of"], ["replacement_for_journal_id", "Replacement for"]), "periodic", "journal_register"),
  defined("audit", "Accounting audit trail", "accounting", "Audit event date",
    columns(["occurred_at", "Recorded"], ["action", "Action"], ["entity_type", "Record type"], ["entity_id", "Record"], ["actor_role", "Actor role"], ["risk_level", "Risk"]), "audit", "audit_chain"),
  defined("flags", "Accounting exceptions", "accounting", "Accounting exception date",
    columns(["created_at", "Recorded"], ["flag_no", "Flag"], ["severity", "Severity"], ["status", "Status"], ["reason", "Reason"], amount("amount", "Flag amount")), "audit", "fraud_flags"),
];

const periodLabels: Record<string, string> = {
  accounts_receivable_closing: "Accounts receivable", accounts_payable_closing: "Accounts payable",
  rider_payable_closing: "Rider payable", cod_pending_remittance_closing: "COD pending remittance",
};

const rowArray = (input: unknown): Row[] => Array.isArray(input) ? input : [];

async function rpc(name: string, args: Row, signal?: AbortSignal) {
  let query = (supabase as any).rpc(name, args);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error || !data || data.ok === false) {
    throw Error(error?.message || (data?.code === "UNAUTHORIZED" ? "Your role does not have access to this report." : data?.code || "The report is unavailable."));
  }
  return data;
}

const formatRows = (rows: Row[], fields: ReportColumn[]) => rows.map(row => Object.fromEntries(fields.map(field => {
  const value = row[field.key];
  if (typeof value === "string" && /_at$/.test(field.key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return [field.key, reportTime(value)];
  }
  return [field.key, value];
})));

export async function loadHubReport(
  definition: Definition, period: ReportPeriod, way: string, signal?: AbortSignal,
): Promise<{ report: FinanceReport; summary: Row | null }> {
  const { id, title, basis, source, section } = definition;
  const params = { p_from: period.from, p_to: period.to };
  let rows: Row[];
  let summary: Row | null = null;
  if (source === "hub") {
    const data = await rpc("be_birds_eye_finance_report_v1", {
      p_report: ["cogs", "overheads"].includes(id) ? "pnl" : id,
      ...params, p_way: id === "parcel-finance" ? way.trim() || null : null,
    }, signal);
    rows = rowArray(data.rows);
    if (id === "pnl") summary = data.summary;
    if (id === "cogs") rows = rows.filter(row => row.account_type === "COGS");
    if (id === "overheads") rows = rows.filter(row => row.account_type === "EXPENSE");
  } else if (source === "periodic") {
    const data = await rpc("be_accounting_periodic_report_v2", params, signal);
    rows = id === "positions"
      ? Object.entries(periodLabels).map(([key, metric]) => ({ metric, amount: data[section!]?.[key] }))
      : rowArray(data[section!]?.rows);
  } else {
    const data = await rpc("be_accounting_audit_report_v2", { ...params, p_limit: 1000 }, signal);
    rows = rowArray(data[section!]);
    if (rows.length >= 1000) throw Error("The audit source reached its record limit. Shorten the date range for a complete export.");
  }
  if (id === "channels") {
    const totals = new Map<string, Row>();
    for (const row of rows) {
      const method = String(row.payment_method || "Unspecified");
      const total = totals.get(method) || { payment_method: method, submissions: 0, total_activity: 0 };
      totals.set(method, { ...total, submissions: Number(total.submissions) + Number(row.submissions ?? 0),
        total_activity: Number(total.total_activity) + Number(row.total_activity ?? 0) });
    }
    rows = Array.from(totals.values());
  }
  if (summary && rows.length) rows = [
    ...pnlMetrics.map(([key, label]) => ({ account_name: label, account_type: "Summary", amount: summary?.[key] })),
    ...rows,
  ];
  return {
    summary,
    report: {
      title: `Britium Express · ${title}`, fileStem: `britium-${id}-${period.from}-to-${period.to}`,
      generatedAt: new Date(), filters: { From: period.from, Through: period.to, "Date basis": basis,
        "Exact Way ID": id === "parcel-finance" ? way.trim() || undefined : undefined },
      columns: definition.columns, rows: formatRows(rows, definition.columns),
      note: definition.note || "Source-backed internal report. Blank amounts indicate that no value was recorded.",
    },
  };
}

export async function loadWayFinance(way: string, period: ReportPeriod, signal?: AbortSignal): Promise<FinanceReport> {
  const data = await rpc("be_birds_eye_finance_report_v1", {
    p_report: "way", p_from: period.from, p_to: period.to, p_way: way,
  }, signal);
  const fields = columns(["section", "Stage"], ["recorded_at", "Recorded (Myanmar)"], ["description", "Entry"],
    ["reference", "Reference"], ["status", "Status"], amount("amount", "Amount"));
  return {
    title: `Britium Express · Financial history for ${way}`, fileStem: `britium-way-finance-${way}`,
    columns: fields, rows: formatRows(rowArray(data.rows), fields), generatedAt: new Date(),
    filters: { "Way ID": way, "Date basis": "All recorded linked financial history" }, note: wayNote,
  };
}
