import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileLock2,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export const ACCOUNTING_PORTAL_BUILD = "ACCOUNTING_ERP_V2_20260926";

type Row = Record<string, any>;
type Tab = "daily-entry" | "template" | "review" | "ledger" | "reports";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "daily-entry", label: "Daily Finance Entry" },
  { id: "template", label: "Finance Data Entry Template" },
  { id: "review", label: "Review Queue" },
  { id: "ledger", label: "General Ledger" },
  { id: "reports", label: "Periodical Finance Reports" },
];

const inputClass =
  "w-full rounded-lg border border-[#244967] bg-[#071b2c] px-3 py-2.5 text-sm text-[#eef8ff] outline-none focus:border-[#f6b84b]";
const cardClass = "rounded-2xl border border-[#183b58] bg-[#0b2236] p-4 shadow-lg shadow-black/10";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#315a78] bg-[#12314a] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#173d5b] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#2f9b78] bg-[#0d3b32] px-4 py-2.5 text-sm font-black text-[#79f0c5] transition hover:bg-[#114c40] disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[#9b4460] bg-[#42182a] px-4 py-2.5 text-sm font-black text-[#ff9ab9] transition hover:bg-[#542039] disabled:cursor-not-allowed disabled:opacity-50";

const money = (value: unknown) =>
  Number.isFinite(Number(value)) ? `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} MMK` : "—";
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

function statusClass(status: unknown) {
  const s = String(status || "").toUpperCase();
  if (s === "POSTED" || s === "APPROVED") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (s === "HELD" || s === "NEEDS_REVIEW") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  if (s === "REJECTED") return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  return "border-sky-500/40 bg-sky-500/10 text-sky-300";
}

function Message({ text }: { text: string }) {
  if (!text) return null;
  const bad = /fail|error|invalid|required|unauthorized|blocked|duplicate/i.test(text);
  return (
    <div className={`rounded-xl border p-3 text-sm ${bad ? "border-rose-500/35 bg-rose-500/10 text-rose-200" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"}`}>
      {text}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-bold text-[#c9ddeb]">
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-xs font-normal text-[#789ab1]">{hint}</span> : null}
    </label>
  );
}

export default function AccountingPortalPage() {
  const [tab, setTab] = useState<Tab>("daily-entry");
  const [message, setMessage] = useState("");
  const [authority, setAuthority] = useState<Row | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await (supabase as any).rpc("be_accounting_my_authority_v2");
      if (error) {
        setMessage(error.message);
        return;
      }
      setAuthority(data || null);
    })();
  }, []);

  return (
    <main
      data-be-accounting-portal="true"
      className="min-h-screen bg-[#061524] p-4 text-[#eef8ff] md:p-6"
      style={{ fontFamily: '"Poppins","Noto Sans Myanmar",system-ui,sans-serif' }}
    >
      <div className="mx-auto max-w-[1700px] space-y-4">
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-[#f6b84b]">ACCOUNTING ERP</div>
              <h1 className="mt-2 text-2xl font-black md:text-3xl">Britium Express Enterprise Accounting</h1>
              <p className="mt-2 max-w-4xl text-sm text-[#9bbbd0]">
                Double-entry Finance workspace for locked daily submissions, accounting-event review, immutable posted journals,
                and management financial statements. Existing COD operations remain available in the Finance Portal.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <b>RLS / Authority:</b> {authority ? `${authority.role || "unknown"} · Level ${authority.authority_level ?? 0}` : "checking…"}
                {authority ? (
                  <div className="mt-1 text-[11px] text-emerald-300/80">
                    Entry {authority.can_entry ? "✓" : "—"} · Review {authority.can_review ? "✓" : "—"} · Post {authority.can_post ? "✓" : "—"} · Reports {authority.can_reports ? "✓" : "—"} · Audit {authority.can_audit ? "✓" : "—"}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/finance" className={buttonClass}>Finance Portal</Link>
                <Link to="/finance/data-entry-review" className={buttonClass}>Data Entry Review</Link>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setMessage("");
                  setTab(item.id);
                }}
                className={`rounded-xl border px-4 py-2.5 text-sm font-black transition ${
                  tab === item.id
                    ? "border-[#f6b84b] bg-[#f6b84b]/15 text-[#ffd783]"
                    : "border-[#244967] bg-[#071b2c] text-[#aac5d7] hover:border-[#3c6d8d]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <Message text={message} />

        {tab === "daily-entry" ? <DailyFinanceEntry setMessage={setMessage} /> : null}
        {tab === "template" ? <FinanceDataEntryTemplate /> : null}
        {tab === "review" ? <ReviewQueue setMessage={setMessage} authority={authority} /> : null}
        {tab === "ledger" ? <GeneralLedger setMessage={setMessage} /> : null}
        {tab === "reports" ? <FinancialReports setMessage={setMessage} authority={authority} /> : null}
      </div>
    </main>
  );
}

function DailyFinanceEntry({ setMessage }: { setMessage: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Row[]>([]);
  const [form, setForm] = useState({
    entry_date: today(),
    department_code: "FINANCE",
    delivery_fees_collected: "",
    cod_handling_fees: "",
    surcharges: "",
    rider_commissions_accrued: "",
    fuel_and_tolls_spent: "",
    packaging_supplies_spent: "",
    petty_cash_expenses: "",
    cod_cash_collected_in_hand: "",
    accounts_receivable_invoiced: "",
    accounts_payable_incurred: "",
    funding_account_code: "1010",
    payment_method: "PETTY_CASH",
    payment_mobile_number: "",
    payment_reference: "",
    supporting_document_reference: "",
    petty_cash_description: "",
    ar_counterparty: "",
    ar_reference: "",
    ar_offset_account_code: "4000",
    ap_counterparty: "",
    ap_reference: "",
    ap_offset_account_code: "6700",
  });

  const numericKeys = [
    "delivery_fees_collected",
    "cod_handling_fees",
    "surcharges",
    "rider_commissions_accrued",
    "fuel_and_tolls_spent",
    "packaging_supplies_spent",
    "petty_cash_expenses",
    "cod_cash_collected_in_hand",
    "accounts_receivable_invoiced",
    "accounts_payable_incurred",
  ] as const;

  const total = useMemo(
    () => numericKeys.reduce((sum, key) => sum + Number(form[key] || 0), 0),
    [form],
  );

  async function loadHistory() {
    const { data, error } = await (supabase as any)
      .from("finance_daily_logs")
      .select("id,submission_no,entry_date,department_code,is_locked,submitted_at,accounting_event_id,version_no,metadata")
      .is("soft_deleted_at", null)
      .order("submitted_at", { ascending: false })
      .limit(30);
    if (error) {
      setMessage(error.message);
      return;
    }
    setHistory(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const params: Record<string, unknown> = {
        p_entry_date: form.entry_date,
        p_department_code: form.department_code.trim() || "FINANCE",
        p_funding_account_code: form.funding_account_code,
        p_payment_method: form.payment_method,
        p_payment_mobile_number: form.payment_mobile_number || null,
        p_payment_reference: form.payment_reference || null,
        p_metadata: {
          supporting_document_reference: form.supporting_document_reference.trim(),
          petty_cash_description: form.petty_cash_description.trim(),
          ar_counterparty: form.ar_counterparty.trim(),
          ar_reference: form.ar_reference.trim(),
          ar_offset_account_code: form.ar_offset_account_code.trim(),
          ap_counterparty: form.ap_counterparty.trim(),
          ap_reference: form.ap_reference.trim(),
          ap_offset_account_code: form.ap_offset_account_code.trim(),
          source_ui: ACCOUNTING_PORTAL_BUILD,
        },
      };
      for (const key of numericKeys) params[`p_${key}`] = Number(form[key] || 0);

      const { data, error } = await (supabase as any).rpc("be_accounting_submit_finance_daily_v2", params);
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.code || "Finance submission failed.");

      setMessage(
        data?.code === "UNCHANGED"
          ? `Existing locked submission retained: ${data.submission_no || data.source_id}`
          : `Finance entry submitted and locked. Event: ${data.event_id || "created"}`,
      );
      await loadHistory();
    } catch (error: any) {
      setMessage(error?.message || "Finance submission failed.");
    } finally {
      setBusy(false);
    }
  }

  const arEnabled = Number(form.accounts_receivable_invoiced || 0) > 0;
  const apEnabled = Number(form.accounts_payable_incurred || 0) > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2">
          <WalletCards className="text-[#68e8bd]" size={20} />
          <div>
            <h2 className="font-black">Daily Finance Entry</h2>
            <p className="text-xs text-[#82a5bb]">Manual/adjustment economic events only. Submitted records are locked.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Entry Date"><input type="date" className={inputClass} value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></Field>
          <Field label="Department"><input className={inputClass} value={form.department_code} onChange={(e) => setForm({ ...form, department_code: e.target.value })} /></Field>
          <Field label="Payment / Funding Method" hint="Select the actual channel used for the receipt or payment.">
            <select
              className={inputClass}
              value={`${form.payment_method}|${form.payment_mobile_number}|${form.funding_account_code}`}
              onChange={(e) => {
                const [payment_method, payment_mobile_number, funding_account_code] = e.target.value.split("|");
                setForm({ ...form, payment_method, payment_mobile_number, funding_account_code, payment_reference: "" });
              }}
            >
              <option value="CASH||1000">Cash on Hand · 1000</option>
              <option value="PETTY_CASH||1010">Petty Cash · 1010</option>
              <option value="BANK||1100">Bank Accounts · 1100</option>
              <option value="MMQR|09897447722|1110">MMQR · 09897447722</option>
              <option value="KBZ_PAY|09897447722|1120">KBZ Pay · 09897447722</option>
              <option value="KBZ_PAY|09897447733|1121">KBZ Pay · 09897447733</option>
            </select>
          </Field>

          {numericKeys.map((key) => {
            const labels: Record<string, string> = {
              delivery_fees_collected: "Delivery Fees Collected",
              cod_handling_fees: "COD Handling Fees",
              surcharges: "Surcharges",
              rider_commissions_accrued: "Rider Commissions Accrued",
              fuel_and_tolls_spent: "Fuel & Tolls Spent",
              packaging_supplies_spent: "Packaging Supplies Spent",
              petty_cash_expenses: "Petty Cash Expenses",
              cod_cash_collected_in_hand: "COD Cash Collected In Hand",
              accounts_receivable_invoiced: "Accounts Receivable Invoiced",
              accounts_payable_incurred: "Accounts Payable Incurred",
            };
            return (
              <Field key={key} label={labels[key]}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder="0"
                />
              </Field>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field
            label="Payment Transaction Reference"
            hint={form.payment_method === "MMQR" || form.payment_method === "KBZ_PAY" ? "Required for MMQR / KBZ Pay. Enter the transfer/transaction reference exactly." : "Optional for cash; recommended for bank transactions."}
          >
            <input
              className={inputClass}
              value={form.payment_reference}
              onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
              placeholder={form.payment_method === "MMQR" || form.payment_method === "KBZ_PAY" ? "Required transaction reference" : "Bank / receipt / voucher reference"}
            />
          </Field>
          <Field label="Supporting Document Reference" hint="Voucher, receipt, invoice, settlement batch, bank slip, or approval reference.">
            <input
              className={inputClass}
              value={form.supporting_document_reference}
              onChange={(e) => setForm({ ...form, supporting_document_reference: e.target.value })}
              placeholder="e.g. VCH-20260926-001"
            />
          </Field>
        </div>

        {(form.payment_method === "MMQR" || form.payment_method === "KBZ_PAY") ? (
          <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 text-sm text-cyan-100">
            <b>{form.payment_method === "MMQR" ? "MMQR" : "KBZ Pay"}</b> linked mobile:
            <span className="ml-2 font-black">{form.payment_mobile_number}</span>
            <span className="ml-2 text-xs text-cyan-300">· GL {form.funding_account_code}</span>
          </div>
        ) : null}

        {Number(form.petty_cash_expenses || 0) > 0 ? (
          <div className="mt-3">
            <Field label="Petty Cash Description / Supporting Reference">
              <input className={inputClass} value={form.petty_cash_description} onChange={(e) => setForm({ ...form, petty_cash_description: e.target.value })} />
            </Field>
          </div>
        ) : null}

        {arEnabled ? (
          <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3">
            <div className="mb-3 font-black text-sky-200">Manual Accounts Receivable Details</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Counterparty"><input className={inputClass} value={form.ar_counterparty} onChange={(e) => setForm({ ...form, ar_counterparty: e.target.value })} /></Field>
              <Field label="Invoice / Reference"><input className={inputClass} value={form.ar_reference} onChange={(e) => setForm({ ...form, ar_reference: e.target.value })} /></Field>
              <Field label="Offset Account Code"><input className={inputClass} value={form.ar_offset_account_code} onChange={(e) => setForm({ ...form, ar_offset_account_code: e.target.value })} /></Field>
            </div>
          </div>
        ) : null}

        {apEnabled ? (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="mb-3 font-black text-amber-200">Manual Accounts Payable Details</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Counterparty"><input className={inputClass} value={form.ap_counterparty} onChange={(e) => setForm({ ...form, ap_counterparty: e.target.value })} /></Field>
              <Field label="Invoice / Reference"><input className={inputClass} value={form.ap_reference} onChange={(e) => setForm({ ...form, ap_reference: e.target.value })} /></Field>
              <Field label="Offset Account Code"><input className={inputClass} value={form.ap_offset_account_code} onChange={(e) => setForm({ ...form, ap_offset_account_code: e.target.value })} /></Field>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#244967] bg-[#071b2c] p-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#789ab1]">Entered activity total</div>
            <div className="text-xl font-black text-[#f6b84b]">{money(total)}</div>
          </div>
          <button disabled={busy || total <= 0} onClick={() => void submit()} className={primaryButton}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Submit & Lock
          </button>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black"><FileLock2 size={19} className="text-[#f6b84b]" />Locked Submission History</div>
          <button onClick={() => void loadHistory()} className={buttonClass}><RefreshCw size={15} />Refresh</button>
        </div>
        <div className="mb-3 rounded-xl border border-[#f6b84b]/25 bg-[#f6b84b]/10 p-3 text-xs text-[#ffd98a]">
          Entry Locked & Submitted to Vault. Use the audited Superadmin correction workflow for corrections; historical submissions are not edited in place.
        </div>
        <div className="max-h-[720px] space-y-2 overflow-auto">
          {history.length === 0 ? <div className="p-6 text-center text-sm text-[#789ab1]">No Finance submissions visible for this account.</div> : null}
          {history.map((row) => (
            <div key={row.id} className="rounded-xl border border-[#1d405d] bg-[#071b2c] p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <b>{row.submission_no}</b>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${row.is_locked ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"}`}>
                  {row.is_locked ? "LOCKED" : "OPEN"}
                </span>
              </div>
              <div className="mt-2 text-xs text-[#8eafc4]">{row.entry_date} · {row.department_code} · Version {row.version_no}</div>
              <div className="mt-1 break-all text-[11px] text-[#60849b]">Event: {row.accounting_event_id || "—"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


function FinanceDataEntryTemplate() {
  const columns = [
    "Entry Date",
    "Department",
    "Payment Method",
    "Mobile Number",
    "Payment Reference",
    "Delivery Fees Collected",
    "COD Handling Fees",
    "Surcharges",
    "Rider Commissions Accrued",
    "Fuel & Tolls Spent",
    "Packaging Supplies Spent",
    "Petty Cash Expenses",
    "COD Cash Collected",
    "Accounts Receivable Invoiced",
    "Accounts Payable Incurred",
    "Petty Cash Description",
    "AR Counterparty",
    "AR Invoice / Reference",
    "AR Offset Account Code",
    "AP Counterparty",
    "AP Invoice / Reference",
    "AP Offset Account Code",
    "Supporting Document Reference",
    "Notes",
  ];

  const sampleRows = [
    ["2026-09-26","FINANCE","MMQR","09897447722","MMQR-REF-001",150000,5000,0,0,0,0,0,450000,0,0,"","","","","","","","SETTLE-0926-001","Daily MMQR collection"],
    ["2026-09-26","FINANCE","KBZ_PAY","09897447722","KBZ-REF-001",200000,7000,0,0,0,0,0,600000,0,0,"","","","","","","","SETTLE-0926-002","KBZ Pay wallet 1"],
    ["2026-09-26","FINANCE","KBZ_PAY","09897447733","KBZ-REF-002",175000,6000,0,0,0,0,0,525000,0,0,"","","","","","","","SETTLE-0926-003","KBZ Pay wallet 2"],
    ["2026-09-26","FINANCE","PETTY_CASH","","PC-0926-015",0,0,0,0,0,0,35000,0,0,0,"Office stationery","","","","","","","VCH-PC-0926-015","Petty cash expense"],
  ];

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...sampleRows]);
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!cols"] = columns.map((name) => ({ wch: Math.max(14, Math.min(30, name.length + 3)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Finance Data Entry");
    const guide = XLSX.utils.aoa_to_sheet([
      ["Britium Express Finance Data Entry Template"],
      ["Rule","Instruction"],
      ["One row","Use one row per date + department + payment channel/reference batch."],
      ["MMQR","Mobile number must be 09897447722 and transaction reference is required."],
      ["KBZ Pay","Use either 09897447722 or 09897447733; transaction reference is required."],
      ["Duplicate control","Do not re-enter the same locked transaction/reference."],
      ["Supporting evidence","Record voucher, invoice, bank slip, settlement batch, or other evidence reference."],
      ["Maker-checker","The preparer must not approve/post their own accounting event."],
    ]);
    guide["!cols"] = [{ wch: 20 }, { wch: 95 }];
    XLSX.utils.book_append_sheet(wb, guide, "Instructions");
    XLSX.writeFile(wb, `Britium_Express_Finance_Data_Entry_Template_${today()}.xlsx`);
  }

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-[#68e8bd]" />
            <h2 className="text-lg font-black">Finance Department Data Entry Template</h2>
          </div>
          <p className="mt-1 text-sm text-[#8eafc4]">
            Standard batch format for Finance staff. One row represents one date/department/payment-channel batch.
          </p>
        </div>
        <button onClick={downloadTemplate} className={primaryButton}>
          <Download size={16} />Download Excel Template
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
          <div className="text-xs font-bold text-cyan-300">MMQR</div>
          <div className="mt-1 font-black">09897447722</div>
          <div className="text-xs text-[#789ab1]">GL 1110 · transaction reference required</div>
        </div>
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3">
          <div className="text-xs font-bold text-blue-300">KBZ Pay</div>
          <div className="mt-1 font-black">09897447722</div>
          <div className="text-xs text-[#789ab1]">GL 1120 · transaction reference required</div>
        </div>
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3">
          <div className="text-xs font-bold text-blue-300">KBZ Pay</div>
          <div className="mt-1 font-black">09897447733</div>
          <div className="text-xs text-[#789ab1]">GL 1121 · transaction reference required</div>
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-xl border border-[#183b58]">
        <table className="w-full min-w-[2500px] text-left text-xs">
          <thead className="bg-[#071b2c] text-[#88abc1]">
            <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap p-3">{column}</th>)}</tr>
          </thead>
          <tbody>
            {sampleRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[#173952]">
                {row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap p-3">{String(cell || "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
        <b>Control rule:</b> Staff must record the actual payment channel, exact mobile number/reference, and supporting document reference.
        Repeated references or identical transaction fingerprints are blocked/flagged by the Accounting ERP audit controls.
      </div>
    </section>
  );
}

function ReviewQueue({ setMessage, authority }: { setMessage: (value: string) => void; authority: Row | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), status: "" });

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_review_queue_v1", {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_status: filters.status || null,
        p_limit: 1000,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.code || "Unable to load review queue.");
      const next = Array.isArray(data.rows) ? data.rows : [];
      setRows(next);
      if (selectedId && !next.some((row: Row) => row.id === selectedId)) setSelectedId("");
    } catch (error: any) {
      setMessage(error?.message || "Unable to load review queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(decision: "HOLD" | "REJECT" | "INVESTIGATE") {
    if (!selected?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_review_event_v1", {
        p_event_id: selected.id,
        p_decision: decision,
        p_note: note,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.code || "Review action failed.");
      setMessage(`Event ${selected.id} changed to ${data.review_status || data.code}.`);
      setNote("");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Review action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function approveOnly() {
    if (!selected?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_review_event_v1", {
        p_event_id: selected.id,
        p_decision: "APPROVE",
        p_note: note || "Reviewed and approved from Accounting ERP",
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.code || "Approval failed.");
      setMessage(`Event approved. A separate authorized poster must post it to the General Ledger.`);
      setNote("");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function postApproved() {
    if (!selected?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_post_approved_event_v2", {
        p_event_id: selected.id,
        p_note: note || "Posted from Accounting ERP after independent approval",
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.code || "Posting failed.");
      setMessage(`Posted successfully: ${data.journal_number || data.journal_id || selected.id}`);
      setNote("");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Posting failed.");
    } finally {
      setBusy(false);
    }
  }

  async function raiseFraudFlag() {
    if (!selected?.id) return;
    const reason = note.trim() || "Finance reviewer flagged this accounting event for investigation.";
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_raise_fraud_flag_v2", {
        p_reference_type: "ACCOUNTING_EVENT",
        p_reference_id: selected.id,
        p_amount: Number(selected.total_amount || selected.debit_total || 0),
        p_severity: "high",
        p_reason: reason,
        p_note: note || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.code || "Unable to create fraud flag.");
      setMessage(`Fraud/exception flag created: ${data.flag_no}`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to create fraud flag.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Date From"><input type="date" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="Date To"><input type="date" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="REVIEW_PENDING">Review Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="HELD">Held</option>
              <option value="NEEDS_REVIEW">Needs Review</option>
              <option value="REJECTED">Rejected</option>
              <option value="POSTED">Posted</option>
            </select>
          </Field>
          <button className={buttonClass} onClick={() => void load()}><RefreshCw size={15} />Refresh</button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-[#82a5bb]"><Loader2 className="mr-2 inline animate-spin" size={18} />Loading accounting events…</div>
        ) : (
          <div className="overflow-auto rounded-xl border border-[#183b58]">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-[#071b2c] text-[#88abc1]">
                <tr><th className="p-3">Status</th><th>Date</th><th>Event</th><th>Source</th><th>Reference</th><th className="text-right">Debit</th><th className="pr-3 text-right">Credit</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`cursor-pointer border-t border-[#173952] hover:bg-[#102d44] ${selectedId === row.id ? "bg-[#123650]" : ""}`}
                  >
                    <td className="p-3"><span className={`rounded-full border px-2 py-1 font-black ${statusClass(row.review_status)}`}>{row.review_status}</span></td>
                    <td>{row.event_date}</td>
                    <td><b>{row.event_type}</b></td>
                    <td>{row.source_system}<div className="text-[10px] text-[#668ba3]">{row.source_table}</div></td>
                    <td>{row.source_reference || row.source_record_id}</td>
                    <td className="text-right">{money(row.debit_total)}</td>
                    <td className="pr-3 text-right">{money(row.credit_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center gap-2 font-black"><ShieldCheck size={19} className="text-[#68e8bd]" />Accounting Event Review</div>
        {!selected ? (
          <div className="rounded-xl border border-dashed border-[#315a78] p-8 text-center text-sm text-[#789ab1]">Select an event from the queue.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#244967] bg-[#071b2c] p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><b>{selected.event_type}</b><span className={`rounded-full border px-2 py-1 text-xs font-black ${statusClass(selected.review_status)}`}>{selected.review_status}</span></div>
              <div className="mt-2 text-[#98b7ca]">{selected.description || "No description"}</div>
              <div className="mt-2 break-all text-xs text-[#668ba3]">Event: {selected.id}</div>
            </div>

            <div className="space-y-2">
              {(Array.isArray(selected.lines) ? selected.lines : []).map((line: Row, index: number) => (
                <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg border border-[#1b3e59] bg-[#071b2c] p-2 text-xs">
                  <div><b>{line.account_code} · {line.account_name}</b><div className="text-[#668ba3]">{line.description}</div></div>
                  <div className="text-right"><span className="text-[#668ba3]">Dr</span><br />{money(line.debit_amount)}</div>
                  <div className="text-right"><span className="text-[#668ba3]">Cr</span><br />{money(line.credit_amount)}</div>
                </div>
              ))}
            </div>

            <Field label="Review Note">
              <textarea className={`${inputClass} min-h-24`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required for Hold, Reject, or Investigation." />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                disabled={busy || !authority?.can_review || selected.review_status === "POSTED" || selected.review_status === "REJECTED"}
                onClick={() => void approveOnly()}
                className={primaryButton}
              >
                <CheckCircle2 size={16} />Approve
              </button>
              <button
                disabled={busy || !authority?.can_post || selected.review_status !== "APPROVED"}
                onClick={() => void postApproved()}
                className={primaryButton}
              >
                <ShieldCheck size={16} />Post Approved Event
              </button>
              <button disabled={busy || !authority?.can_review} onClick={() => void review("INVESTIGATE")} className={buttonClass}><AlertTriangle size={16} />Investigate</button>
              <button disabled={busy || !authority?.can_review} onClick={() => void review("HOLD")} className={buttonClass}>Hold</button>
              <button disabled={busy || !authority?.can_review} onClick={() => void review("REJECT")} className={dangerButton}>Reject</button>
              <button disabled={busy || !authority?.can_review} onClick={() => void raiseFraudFlag()} className={dangerButton}><AlertTriangle size={16} />Raise Fraud Flag</button>
            </div>
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-xs text-amber-200">
              Maker-checker control: the transaction creator cannot approve or post the same accounting event. Posting is enabled only for users with explicit posting authority.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function GeneralLedger({ setMessage }: { setMessage: (value: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), account: "", search: "" });

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_general_ledger_v1", {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_account_code: filters.account.trim() || null,
        p_search: filters.search.trim() || null,
        p_limit: 2000,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.code || "Unable to load General Ledger.");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: any) {
      setMessage(error?.message || "Unable to load General Ledger.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-2"><BookOpen size={20} className="text-[#68e8bd]" /><h2 className="font-black">General Ledger</h2></div>
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Field label="Date From"><input type="date" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
        <Field label="Date To"><input type="date" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
        <Field label="Account Code"><input className={inputClass} value={filters.account} onChange={(e) => setFilters({ ...filters, account: e.target.value })} placeholder="e.g. 4000" /></Field>
        <Field label="Journal / Reference"><input className={inputClass} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></Field>
        <div className="flex items-end"><button className={buttonClass} onClick={() => void load()}><RefreshCw size={15} />Apply Filters</button></div>
      </div>
      {loading ? <div className="p-10 text-center text-[#82a5bb]"><Loader2 className="mr-2 inline animate-spin" size={18} />Loading ledger…</div> : (
        <div className="overflow-auto rounded-xl border border-[#183b58]">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="bg-[#071b2c] text-[#88abc1]"><tr><th className="p-3">Date</th><th>Journal</th><th>Account</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="pr-3 text-right">Credit</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.journal_id}-${row.sequence_no}-${index}`} className="border-t border-[#173952]">
                  <td className="p-3">{row.accounting_date}</td><td><b>{row.journal_number}</b></td>
                  <td>{row.account_code} · {row.account_name}</td><td>{row.description || row.journal_description}</td>
                  <td>{row.source_reference || "—"}</td><td className="text-right">{money(row.debit_amount)}</td><td className="pr-3 text-right">{money(row.credit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinancialReports({ setMessage, authority }: { setMessage: (value: string) => void; authority: Row | null }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [audit, setAudit] = useState<any>(null);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_accounting_periodic_report_v2", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.code || "Periodical Finance report unavailable.");
      setReport(data);

      if (authority?.can_audit) {
        const auditRes = await (supabase as any).rpc("be_accounting_audit_report_v2", {
          p_from: from,
          p_to: to,
          p_limit: 1000,
        });
        if (!auditRes.error && auditRes.data?.ok) setAudit(auditRes.data);
      } else {
        setAudit(null);
      }
    } catch (error: any) {
      setMessage(error?.message || "Unable to load periodical Finance reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summaryCard = (label: string, value: unknown, accent = "text-[#eef8ff]") => (
    <div className="rounded-xl border border-[#1d405d] bg-[#071b2c] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[#789ab1]">{label}</div>
      <div className={`mt-1 text-lg font-black ${accent}`}>{money(value)}</div>
    </div>
  );

  function downloadReportWorkbook() {
    if (!report) return;
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: any[]) => {
      const ws = XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : []);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };

    add("P&L", report.profit_and_loss?.rows || []);
    add("Balance Sheet", report.balance_sheet?.rows || []);
    add("Cash Flow", report.cash_flow?.rows || []);
    add("Payment Channels", report.payment_channels?.rows || []);
    add("COD Settlement", report.cod_settlement?.rows || []);
    add("Journal Register", report.journal_register?.rows || []);
    add("Audit Trail", audit?.audit_chain || []);
    add("Fraud Flags", audit?.fraud_flags || []);

    const summary = XLSX.utils.aoa_to_sheet([
      ["Britium Express Periodical Finance & Settlement Report"],
      ["Period From", from],
      ["Period To", to],
      [],
      ["Metric","Amount / Count"],
      ["Revenue", report.profit_and_loss?.revenue || 0],
      ["Net Profit", report.profit_and_loss?.net_profit || 0],
      ["Cash Inflows", report.cash_flow?.inflows || 0],
      ["Cash Outflows", report.cash_flow?.outflows || 0],
      ["Cash Net Movement", report.cash_flow?.net_movement || 0],
      ["COD Expected", report.cod_settlement?.expected_cod || 0],
      ["COD Settled", report.cod_settlement?.settled_amount || 0],
      ["COD Variance", report.cod_settlement?.variance_amount || 0],
      ["AR Closing", report.receivables_payables?.accounts_receivable_closing || 0],
      ["AP Closing", report.receivables_payables?.accounts_payable_closing || 0],
      ["Open Fraud Flags", report.controls?.open_fraud_flags || 0],
    ]);
    XLSX.utils.book_append_sheet(wb, summary, "Executive Summary");
    XLSX.writeFile(wb, `Britium_Express_Finance_Report_${from}_to_${to}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <div className="flex items-center gap-2"><BarChart3 size={20} className="text-[#68e8bd]" /><h2 className="font-black">Periodical Finance & Settlement Reporting</h2></div>
            <div className="mt-1 text-xs text-[#789ab1]">P&L · Cash Flow · Balance Sheet · COD Settlement · Payment Channels · AR/AP · Journal Register · Audit/Fraud Exceptions</div>
          </div>
          <Field label="Date From"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Date To"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button onClick={() => void load()} className={buttonClass}><RefreshCw size={15} />Generate</button>
          <button disabled={!report} onClick={downloadReportWorkbook} className={primaryButton}><Download size={15} />Export Report Pack</button>
        </div>
      </section>

      {loading ? <section className={cardClass}><div className="p-10 text-center text-[#82a5bb]"><Loader2 className="mr-2 inline animate-spin" size={18} />Generating periodical report pack…</div></section> : null}

      {!loading && report ? (
        <>
          <section className={cardClass}>
            <h3 className="mb-3 font-black">Executive Financial Summary</h3>
            <div className="grid gap-3 md:grid-cols-4">
              {summaryCard("Revenue", report.profit_and_loss?.revenue, "text-emerald-300")}
              {summaryCard("Net Profit", report.profit_and_loss?.net_profit, Number(report.profit_and_loss?.net_profit) >= 0 ? "text-emerald-300" : "text-rose-300")}
              {summaryCard("Cash Net Movement", report.cash_flow?.net_movement, "text-sky-300")}
              {summaryCard("Balance Difference", report.balance_sheet?.difference, Math.abs(Number(report.balance_sheet?.difference || 0)) < 0.01 ? "text-emerald-300" : "text-rose-300")}
              {summaryCard("COD Expected", report.cod_settlement?.expected_cod, "text-[#f6b84b]")}
              {summaryCard("COD Settled", report.cod_settlement?.settled_amount, "text-emerald-300")}
              {summaryCard("COD Variance", report.cod_settlement?.variance_amount, Number(report.cod_settlement?.variance_amount || 0) === 0 ? "text-emerald-300" : "text-rose-300")}
              {summaryCard("Open Fraud Flags", report.controls?.open_fraud_flags, Number(report.controls?.open_fraud_flags || 0) === 0 ? "text-emerald-300" : "text-rose-300")}
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 font-black">Cash Flow / Cash & Wallet Movement</h3>
            <div className="mb-3 grid gap-3 md:grid-cols-3">
              {summaryCard("Inflows", report.cash_flow?.inflows, "text-emerald-300")}
              {summaryCard("Outflows", report.cash_flow?.outflows, "text-amber-300")}
              {summaryCard("Net Movement", report.cash_flow?.net_movement, "text-sky-300")}
            </div>
            <div className="overflow-auto rounded-xl border border-[#183b58]">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-[#071b2c] text-[#88abc1]"><tr><th className="p-3">Account</th><th className="text-right">Inflows</th><th className="text-right">Outflows</th><th className="pr-3 text-right">Net Movement</th></tr></thead>
                <tbody>{(report.cash_flow?.rows || []).map((row: Row) => <tr key={row.account_code} className="border-t border-[#173952]"><td className="p-3">{row.account_code} · {row.account_name}</td><td className="text-right">{money(row.inflows)}</td><td className="text-right">{money(row.outflows)}</td><td className="pr-3 text-right">{money(row.net_movement)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 font-black">Payment Channel Reconciliation</h3>
            <div className="overflow-auto rounded-xl border border-[#183b58]">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-[#071b2c] text-[#88abc1]"><tr><th className="p-3">Method</th><th>Mobile Number</th><th className="text-right">Submissions</th><th className="pr-3 text-right">Total Activity</th></tr></thead>
                <tbody>{(report.payment_channels?.rows || []).map((row: Row, i: number) => <tr key={i} className="border-t border-[#173952]"><td className="p-3">{row.payment_method}</td><td>{row.payment_mobile_number || "—"}</td><td className="text-right">{row.submissions}</td><td className="pr-3 text-right">{money(row.total_activity)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 font-black">COD / Financial Settlement Summary</h3>
            <div className="grid gap-3 md:grid-cols-4">
              {summaryCard("Expected COD", report.cod_settlement?.expected_cod)}
              {summaryCard("Reported Collected", report.cod_settlement?.reported_collected)}
              {summaryCard("Rider Remittance", report.cod_settlement?.rider_remittance)}
              {summaryCard("Settled Amount", report.cod_settlement?.settled_amount)}
              {summaryCard("Delivery Fee", report.cod_settlement?.delivery_fee)}
              {summaryCard("Variance", report.cod_settlement?.variance_amount, Number(report.cod_settlement?.variance_amount || 0) === 0 ? "text-emerald-300" : "text-rose-300")}
              {summaryCard("Ways", report.cod_settlement?.ways)}
              {summaryCard("Open / Held", report.cod_settlement?.open_or_held, Number(report.cod_settlement?.open_or_held || 0) === 0 ? "text-emerald-300" : "text-amber-300")}
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 font-black">Receivables / Payables Position</h3>
            <div className="grid gap-3 md:grid-cols-4">
              {summaryCard("Accounts Receivable", report.receivables_payables?.accounts_receivable_closing)}
              {summaryCard("Accounts Payable", report.receivables_payables?.accounts_payable_closing)}
              {summaryCard("Rider Payable", report.receivables_payables?.rider_payable_closing)}
              {summaryCard("COD Pending Remittance", report.receivables_payables?.cod_pending_remittance_closing)}
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 font-black">P&L and Balance Sheet</h3>
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-2 font-bold text-[#9bbbd0]">Profit & Loss</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {summaryCard("Revenue", report.profit_and_loss?.revenue)}
                  {summaryCard("COGS", report.profit_and_loss?.cogs)}
                  {summaryCard("Operating Expenses", report.profit_and_loss?.operating_expenses)}
                  {summaryCard("Net Profit", report.profit_and_loss?.net_profit)}
                </div>
              </div>
              <div>
                <div className="mb-2 font-bold text-[#9bbbd0]">Balance Sheet</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {summaryCard("Assets", report.balance_sheet?.assets)}
                  {summaryCard("Liabilities", report.balance_sheet?.liabilities)}
                  {summaryCard("Equity", report.balance_sheet?.equity)}
                  {summaryCard("Difference", report.balance_sheet?.difference)}
                </div>
              </div>
            </div>
          </section>

          {authority?.can_audit ? (
            <section className={cardClass}>
              <h3 className="mb-3 font-black">Audit & Fraud Control</h3>
              <div className="grid gap-3 md:grid-cols-4">
                {summaryCard("Review Pending", report.controls?.review_pending)}
                {summaryCard("Held", report.controls?.held)}
                {summaryCard("Needs Review", report.controls?.needs_review)}
                {summaryCard("Approved Not Posted", report.controls?.approved_not_posted)}
              </div>
              <div className="mt-3 text-xs text-[#789ab1]">
                Tamper-evident audit events loaded: {Array.isArray(audit?.audit_chain) ? audit.audit_chain.length : 0} · Fraud flags: {Array.isArray(audit?.fraud_flags) ? audit.fraud_flags.length : 0}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
