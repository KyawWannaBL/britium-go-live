import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SettlementRow = {
  parcel_id: string;
  delivery_way_id: string;
  merchant_id: string;
  merchant_name?: string | null;
  counterparty_type?: string | null;
  recipient_name?: string | null;
  destination_township?: string | null;
  destination?: string | null;
  delivered_date?: string | null;
  delivery_completed_at?: string | null;
  customer_tier?: string | null;
  amount_entry_type?: string | null;
  item_price?: number | null;
  merchant_declared_delivery?: number | null;
  customer_total_collection?: number | null;
  net_system_delivery_charge?: number | null;
  delivery_difference?: number | null;
  other_merchant_credits?: number | null;
  merchant_payable_charges?: number | null;
  merchant_final_settlement_amount?: number | null;
  merchant_receivable?: number | null;
  settlement_direction?: string | null;
  validation_status?: string | null;
  validation_message?: string | null;
  settlement_eligible?: boolean;
  settlement_state?: string | null;
  financial_hold?: boolean;
  financial_hold_reason?: string | null;
  under_dispute?: boolean;
  batch_id?: string | null;
  batch_number?: string | null;
  batch_status?: string | null;
  payment_status?: string | null;
  calculated_at?: string | null;
};

type SettlementBatch = {
  id: string;
  batch_number: string;
  merchant_id: string;
  merchant_name?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  planned_payment_date?: string | null;
  status: string;
  payment_status: string;
  parcel_count?: number;
  customer_collection?: number;
  item_value?: number;
  company_delivery_revenue?: number;
  delivery_excess_credit?: number;
  delivery_shortfall_deduction?: number;
  batch_credits?: number;
  batch_deductions?: number;
  advance_recovery?: number;
  withholding_tax?: number;
  parcel_settlement_total?: number;
  batch_net_payable?: number;
  paid_amount?: number;
  outstanding_amount?: number;
  payment_method?: string | null;
  merchant_bank_account?: string | null;
  finance_remarks?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
};

type PaymentRow = {
  id: string;
  batch_id: string;
  batch_number?: string;
  merchant_id?: string;
  merchant_name?: string;
  amount: number;
  payment_method?: string | null;
  payment_reference?: string | null;
  bank_account?: string | null;
  evidence_url?: string | null;
  status: string;
  payment_date?: string | null;
  entered_by?: string | null;
  confirmed_by?: string | null;
  created_at?: string | null;
};

type DisputeRow = {
  id: string;
  batch_id?: string | null;
  batch_number?: string | null;
  parcel_id?: string | null;
  delivery_way_id?: string | null;
  merchant_id: string;
  dispute_category: string;
  claimed_amount?: number | null;
  merchant_explanation: string;
  status: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
  resolution_note?: string | null;
};

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_email?: string | null;
  actor_role?: string | null;
  reason?: string | null;
  created_at?: string | null;
};

type Snapshot = {
  ok: boolean;
  build?: string;
  scope: { role?: string | null; merchant_id?: string | null; internal: boolean };
  kpis: Record<string, number>;
  rows: SettlementRow[];
  batches: SettlementBatch[];
  payments: PaymentRow[];
  exceptions: SettlementRow[];
  disputes: DisputeRow[];
  audit: AuditRow[];
};

type BatchForm = {
  periodFrom: string;
  periodTo: string;
  plannedPaymentDate: string;
  batchCredits: string;
  batchDeductions: string;
  advanceRecovery: string;
  withholdingTax: string;
  paymentMethod: string;
  bankAccount: string;
  remarks: string;
};

const emptyBatchForm: BatchForm = {
  periodFrom: "",
  periodTo: "",
  plannedPaymentDate: "",
  batchCredits: "0",
  batchDeductions: "0",
  advanceRecovery: "0",
  withholdingTax: "0",
  paymentMethod: "BANK_TRANSFER",
  bankAccount: "",
  remarks: "",
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown) => {
  const amount = numberValue(value);
  const body = `${Math.abs(amount).toLocaleString("en-US")} MMK`;
  return amount < 0 ? `(${body})` : body;
};

const dateText = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
};

const label = (value?: string | null) => String(value || "—").replaceAll("_", " ");

const deliveredDate = (row: SettlementRow) => row.delivered_date || row.delivery_completed_at || row.calculated_at;

const tabsFor = (internal: boolean) =>
  internal
    ? ["OVERVIEW", "PENDING", "BATCHES", "PAYMENTS", "EXCEPTIONS", "DISPUTES", "AUDIT"]
    : ["SUMMARY", "STATEMENTS", "PAYMENTS", "PARCELS", "DISPUTES"];

export default function FinanceMerchantSettlementPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [merchant, setMerchant] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tab, setTab] = useState("OVERVIEW");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedRow, setSelectedRow] = useState<SettlementRow | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<SettlementBatch | null>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");

  const internal = snapshot?.scope?.internal !== false;
  const role = snapshot?.scope?.role || (internal ? "FINANCE" : "MERCHANT");

  async function load() {
    setLoading(true);
    setMessage("");
    const { data, error } = await (supabase as any).rpc("be_finance_settlement_snapshot_v3", {
      p_merchant_id: merchant || null,
      p_search: search || null,
      p_limit: 2000,
    });
    if (error) {
      setMessage(error.message);
    } else {
      const next = (data || null) as Snapshot | null;
      setSnapshot(next);
      const allowedTabs = tabsFor(next?.scope?.internal !== false);
      if (!allowedTabs.includes(tab)) setTab(allowedTabs[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = snapshot?.rows || [];
  const batches = snapshot?.batches || [];
  const payments = snapshot?.payments || [];
  const disputes = snapshot?.disputes || [];
  const audit = snapshot?.audit || [];
  const exceptions = snapshot?.exceptions || [];

  const merchants = useMemo(
    () => [...new Map(rows.map((row) => [row.merchant_id, row.merchant_name || row.merchant_id])).entries()],
    [rows],
  );

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (status && row.settlement_state !== status && row.validation_status !== status) return false;
      const delivered = deliveredDate(row);
      const day = delivered ? String(delivered).slice(0, 10) : "";
      if (dateFrom && day && day < dateFrom) return false;
      if (dateTo && day && day > dateTo) return false;
      return true;
    });
  }, [rows, status, dateFrom, dateTo]);

  const pendingRows = visibleRows.filter((row) => !row.batch_id && row.settlement_state !== "SETTLED");
  const selectedRows = rows.filter((row) => selected[row.parcel_id] && row.settlement_eligible);
  const selectedMerchantCount = new Set(selectedRows.map((row) => row.merchant_id)).size;

  function toggleRow(row: SettlementRow) {
    if (!row.settlement_eligible) return;
    setSelected((previous) => ({ ...previous, [row.parcel_id]: !previous[row.parcel_id] }));
  }

  function selectVisible() {
    const eligible = pendingRows.filter((row) => row.settlement_eligible);
    const allSelected = eligible.length > 0 && eligible.every((row) => selected[row.parcel_id]);
    setSelected((previous) => {
      const next = { ...previous };
      eligible.forEach((row) => {
        if (allSelected) delete next[row.parcel_id];
        else next[row.parcel_id] = true;
      });
      return next;
    });
  }

  async function rpc(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    const { error } = await (supabase as any).rpc(name, args);
    if (error) setMessage(error.message);
    else {
      setMessage(success);
      await load();
    }
    setBusy(false);
    return !error;
  }

  async function createBatch() {
    if (!selectedRows.length) return setMessage("Select at least one eligible parcel.");
    if (selectedMerchantCount !== 1) return setMessage("A batch may contain parcels for one merchant only.");
    const ok = await rpc(
      "be_finance_create_settlement_batch_v3",
      {
        p_parcel_ids: selectedRows.map((row) => row.parcel_id),
        p_period_from: batchForm.periodFrom || null,
        p_period_to: batchForm.periodTo || null,
        p_planned_payment_date: batchForm.plannedPaymentDate || null,
        p_batch_credits: numberValue(batchForm.batchCredits),
        p_batch_deductions: numberValue(batchForm.batchDeductions),
        p_advance_recovery: numberValue(batchForm.advanceRecovery),
        p_withholding_tax: numberValue(batchForm.withholdingTax),
        p_payment_method: batchForm.paymentMethod || null,
        p_merchant_bank_account: batchForm.bankAccount || null,
        p_finance_remarks: batchForm.remarks || null,
      },
      "Draft settlement batch created.",
    );
    if (ok) {
      setSelected({});
      setBatchForm(emptyBatchForm);
      setShowBatchForm(false);
      setTab("BATCHES");
    }
  }

  async function transition(batch: SettlementBatch, action: string) {
    const note = window.prompt(`Optional note for ${label(action)}:`) || "";
    await rpc(
      "be_finance_transition_batch_v3",
      { p_batch_id: batch.id, p_action: action, p_note: note || null },
      `Batch ${label(action).toLowerCase()} completed.`,
    );
  }

  async function recordPayment() {
    if (!selectedBatch) return;
    const amount = numberValue(paymentAmount);
    if (amount <= 0 || !paymentReference.trim()) {
      setMessage("Payment amount and payment reference are required.");
      return;
    }
    const ok = await rpc(
      "be_finance_record_payment_v3",
      {
        p_batch_id: selectedBatch.id,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_payment_reference: paymentReference.trim(),
        p_bank_account: selectedBatch.merchant_bank_account || null,
        p_evidence_url: null,
        p_confirm: true,
      },
      "Payment recorded and settlement balances refreshed.",
    );
    if (ok) {
      setShowPaymentForm(false);
      setPaymentAmount("");
      setPaymentReference("");
      setSelectedBatch(null);
    }
  }

  async function setHold(row: SettlementRow) {
    const nextHold = !row.financial_hold;
    const reason = nextHold ? window.prompt("Financial hold reason:") : "Hold released";
    if (nextHold && !reason) return;
    await rpc(
      "be_finance_set_parcel_hold_v3",
      { p_parcel_id: row.parcel_id, p_hold: nextHold, p_reason: reason || null },
      nextHold ? "Parcel placed on financial hold." : "Financial hold released.",
    );
  }

  async function raiseDispute(row: SettlementRow) {
    const category = window.prompt("Dispute category:", "INCORRECT_DELIVERY_AMOUNT");
    if (!category) return;
    const explanation = window.prompt("Explain the dispute:");
    if (!explanation) return;
    const claimed = window.prompt("Claimed amount (MMK, optional):", "0");
    await rpc(
      "be_finance_raise_dispute_v3",
      {
        p_batch_id: row.batch_id || null,
        p_parcel_id: row.parcel_id,
        p_category: category,
        p_claimed_amount: numberValue(claimed),
        p_explanation: explanation,
        p_attachment_url: null,
      },
      "Dispute submitted.",
    );
  }

  async function resolveDispute(dispute: DisputeRow) {
    const next = window.prompt("New dispute status:", "RESOLVED");
    if (!next) return;
    const note = window.prompt("Resolution note:");
    if (!note) return;
    await rpc(
      "be_finance_resolve_dispute_v3",
      { p_dispute_id: dispute.id, p_status: next, p_resolution_note: note },
      "Dispute updated.",
    );
  }

  async function downloadStatement(batch: SettlementBatch) {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("be_finance_settlement_statement_v3", {
      p_batch_id: batch.id,
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    const statement = data as { batch: SettlementBatch; items: SettlementRow[]; payments: PaymentRow[] };
    const headers = [
      "Batch Number",
      "Way ID",
      "Delivered Date",
      "Receiver",
      "Item Price",
      "Delivery Collected",
      "Company Delivery",
      "Difference",
      "Settlement Amount",
      "Direction",
    ];
    const csvRows = (statement.items || []).map((row) => [
      batch.batch_number,
      row.delivery_way_id,
      dateText(deliveredDate(row)),
      row.recipient_name || "",
      numberValue(row.item_price),
      numberValue(row.merchant_declared_delivery),
      numberValue(row.net_system_delivery_charge),
      numberValue(row.delivery_difference),
      numberValue(row.merchant_final_settlement_amount),
      row.settlement_direction || "",
    ]);
    downloadCsv(`settlement-${batch.batch_number}.csv`, [headers, ...csvRows]);
  }

  function exportRows() {
    const headers = [
      "Way ID",
      "Delivered",
      "Merchant",
      "Merchant Code",
      "Receiver",
      "Item Price",
      "Customer Delivery",
      "Customer Collection",
      "Company Delivery",
      "Difference",
      "Merchant Settlement",
      "Direction",
      "Validation",
      "Eligibility",
    ];
    const lines = visibleRows.map((row) => [
      row.delivery_way_id,
      dateText(deliveredDate(row)),
      row.merchant_name || "",
      row.merchant_id,
      row.recipient_name || "",
      numberValue(row.item_price),
      numberValue(row.merchant_declared_delivery),
      numberValue(row.customer_total_collection),
      numberValue(row.net_system_delivery_charge),
      numberValue(row.delivery_difference),
      numberValue(row.merchant_final_settlement_amount),
      row.settlement_direction || "",
      row.validation_status || "",
      row.settlement_state || "",
    ]);
    downloadCsv("financial-settlement.csv", [headers, ...lines]);
  }

  const kpis = snapshot?.kpis || {};
  const activeRows = tab === "PENDING" || tab === "PARCELS" ? pendingRows : visibleRows;

  return (
    <main className="min-h-screen bg-[#061524] p-4 text-[#eef8ff] md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="rounded-[1.75rem] border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-xl md:p-7">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">
                <ShieldCheck size={15} /> Financial Settlement · {label(role)}
              </div>
              <h1 className="text-2xl font-black md:text-3xl">Financial Settlement</h1>
              <p className="mt-2 max-w-4xl text-sm font-semibold text-[#8fb4d0]">
                Review COD collections, delivery-charge differences, merchant deductions, credits and settlement payments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportRows} className="action secondary"><Download size={16} /> Export</button>
              <button onClick={() => void load()} disabled={loading} className="action secondary">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              {internal && (
                <button
                  onClick={() => setShowBatchForm(true)}
                  disabled={!selectedRows.length || selectedMerchantCount !== 1}
                  className="action primary"
                >
                  <WalletCards size={16} /> Create Settlement Batch
                </button>
              )}
            </div>
          </div>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <Kpi label="Customer Collection" value={money(kpis.customer_collection)} />
            <Kpi label="Company Delivery Revenue" value={money(kpis.company_delivery_revenue)} />
            <Kpi label="Merchant Payable" value={money(kpis.merchant_payable)} emphasis />
            <Kpi label="Credit to Merchants" value={money(kpis.delivery_excess_credit)} tone="success" />
            <Kpi label="Deduct from Merchants" value={money(kpis.delivery_shortfall)} tone="warning" />
            <Kpi label="Requires Review" value={numberValue(kpis.requires_review).toLocaleString()} tone={numberValue(kpis.requires_review) ? "danger" : "normal"} />
            <Kpi label="Approved but Unpaid" value={money(kpis.approved_unpaid)} tone="warning" />
            <Kpi label="Paid Settlements" value={money(kpis.paid_settlements)} tone="success" />
          </section>
        </header>

        <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[#5d87a4]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search waybill, merchant, batch or payment reference..." className="field pl-9" />
            </label>
            {internal && (
              <select value={merchant} onChange={(event) => setMerchant(event.target.value)} className="field">
                <option value="">All merchants</option>
                {merchants.map(([id, name]) => <option key={id} value={id}>{name} · {id}</option>)}
              </select>
            )}
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="field">
              <option value="">All statuses</option>
              <option value="READY_TO_SETTLE">Eligible</option>
              <option value="REVIEW_REQUIRED">Requires review</option>
              <option value="ALREADY_BATCHED">Already batched</option>
              <option value="SETTLED">Settled</option>
              <option value="OK">Validation OK</option>
              <option value="ERROR">Validation error</option>
            </select>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="field" title="Delivery date from" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="field" title="Delivery date to" />
            <button onClick={() => void load()} className="action secondary justify-center">Apply Filters</button>
            <button onClick={() => { setSearch(""); setMerchant(""); setStatus(""); setDateFrom(""); setDateTo(""); }} className="action secondary justify-center">Clear</button>
          </div>
          {message && <div className="mt-3 rounded-xl border border-[#f6b84b]/40 bg-[#f6b84b]/10 p-3 text-xs font-bold text-[#f6b84b]">{message}</div>}
        </section>

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-2">
          {tabsFor(internal).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider ${tab === item ? "bg-[#f6b84b] text-[#061524]" : "text-[#8fb4d0] hover:bg-[#102b45]"}`}>
              {label(item)}
            </button>
          ))}
        </nav>

        {(tab === "OVERVIEW" || tab === "SUMMARY") && (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <ParcelTable rows={visibleRows.slice(0, 20)} selected={selected} internal={internal} loading={loading} onToggle={toggleRow} onView={setSelectedRow} onHold={setHold} onDispute={raiseDispute} compact />
            <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
              <h2 className="text-lg font-black">Settlement Position</h2>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Pending parcels" value={numberValue(kpis.pending_parcels).toLocaleString()} />
                <SummaryLine label="Total parcels" value={numberValue(kpis.total_parcels).toLocaleString()} />
                <SummaryLine label="Outstanding merchant payable" value={money(kpis.approved_unpaid)} />
                <SummaryLine label="Paid amount" value={money(kpis.paid_settlements)} />
                <SummaryLine label="Unresolved exceptions" value={exceptions.length.toLocaleString()} warning={exceptions.length > 0} />
                <SummaryLine label="Open disputes" value={disputes.filter((d) => !["RESOLVED", "REJECTED", "CLOSED"].includes(d.status)).length.toLocaleString()} warning />
              </div>
            </section>
          </div>
        )}

        {(tab === "PENDING" || tab === "PARCELS") && (
          <>
            {internal && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
                <div className="text-sm font-bold"><span className="text-[#f6b84b]">{selectedRows.length}</span> eligible parcel(s) selected</div>
                <button onClick={selectVisible} className="action secondary">Select / Clear Visible</button>
              </div>
            )}
            <ParcelTable rows={activeRows} selected={selected} internal={internal} loading={loading} onToggle={toggleRow} onView={setSelectedRow} onHold={setHold} onDispute={raiseDispute} />
          </>
        )}

        {(tab === "BATCHES" || tab === "STATEMENTS") && (
          <BatchTable
            batches={batches}
            internal={internal}
            busy={busy}
            onSelect={setSelectedBatch}
            onTransition={transition}
            onPayment={(batch) => { setSelectedBatch(batch); setPaymentAmount(String(batch.outstanding_amount || "")); setShowPaymentForm(true); }}
            onStatement={downloadStatement}
          />
        )}

        {tab === "PAYMENTS" && <PaymentTable payments={payments} />}
        {tab === "EXCEPTIONS" && <ExceptionTable rows={exceptions} onView={setSelectedRow} onHold={setHold} />}
        {tab === "DISPUTES" && <DisputeTable disputes={disputes} internal={internal} onResolve={resolveDispute} />}
        {tab === "AUDIT" && <AuditTable rows={audit} />}
      </div>

      {selectedRow && <ParcelDrawer row={selectedRow} internal={internal} onClose={() => setSelectedRow(null)} onHold={setHold} onDispute={raiseDispute} />}
      {selectedBatch && !showPaymentForm && <BatchDrawer batch={selectedBatch} internal={internal} onClose={() => setSelectedBatch(null)} onStatement={downloadStatement} />}
      {showBatchForm && <BatchModal form={batchForm} selectedCount={selectedRows.length} busy={busy} onChange={setBatchForm} onClose={() => setShowBatchForm(false)} onSubmit={createBatch} />}
      {showPaymentForm && selectedBatch && (
        <PaymentModal
          batch={selectedBatch}
          amount={paymentAmount}
          reference={paymentReference}
          method={paymentMethod}
          busy={busy}
          onAmount={setPaymentAmount}
          onReference={setPaymentReference}
          onMethod={setPaymentMethod}
          onClose={() => setShowPaymentForm(false)}
          onSubmit={recordPayment}
        />
      )}

      <style>{`
        .field{height:42px;width:100%;border-radius:12px;border:1px solid #1a3a5c;background:#fff;padding:0 12px;color:#061524;font-size:12px;outline:none}
        .field:focus{border-color:#f6b84b;box-shadow:0 0 0 2px rgba(246,184,75,.12)}
        .action{display:inline-flex;height:42px;align-items:center;gap:8px;border-radius:12px;padding:0 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;transition:.2s}
        .action.primary{background:#f6b84b;color:#061524}.action.primary:hover{background:#e5a93a}.action.primary:disabled{opacity:.4;cursor:not-allowed}
        .action.secondary{border:1px solid #1a3a5c;background:#102b45;color:#eef8ff}.action.secondary:hover{border-color:#38bdf8}
      `}</style>
    </main>
  );
}

function Kpi({ label: title, value, tone = "normal", emphasis = false }: { label: string; value: string; tone?: "normal" | "success" | "warning" | "danger"; emphasis?: boolean }) {
  const toneClass = tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-300" : tone === "danger" ? "text-rose-400" : emphasis ? "text-[#f6b84b]" : "text-white";
  return <div className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-[#6f98b8]">{title}</div><div className={`mt-2 text-lg font-black ${toneClass}`}>{value}</div></div>;
}

function SummaryLine({ label: title, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3"><span className="text-xs font-bold text-[#8fb4d0]">{title}</span><strong className={warning ? "text-amber-300" : "text-white"}>{value}</strong></div>;
}

function StatusBadge({ value, kind = "default" }: { value?: string | null; kind?: "default" | "direction" }) {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  const positive = ["OK", "ELIGIBLE", "PAID", "APPROVED", "CREDIT_TO_MERCHANT", "READY_TO_SETTLE", "CONFIRMED"].includes(normalized);
  const negative = ["ERROR", "REJECTED", "FAILED", "CANCELLED", "BREAKDOWN_REQUIRED"].includes(normalized);
  const warning = ["REVIEW", "UNDER_REVIEW", "PENDING_APPROVAL", "PARTIALLY_PAID", "ON_HOLD", "UNDER_DISPUTE", "REVIEW_REQUIRED"].includes(normalized);
  const classes = positive ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : negative ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : warning ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : kind === "direction" ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-[#355a78] bg-[#102b45] text-[#a9c7da]";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${classes}`}>{label(normalized)}</span>;
}

function ParcelTable({ rows, selected, internal, loading, onToggle, onView, onHold, onDispute, compact = false }: {
  rows: SettlementRow[];
  selected: Record<string, boolean>;
  internal: boolean;
  loading: boolean;
  onToggle: (row: SettlementRow) => void;
  onView: (row: SettlementRow) => void;
  onHold: (row: SettlementRow) => void;
  onDispute: (row: SettlementRow) => void;
  compact?: boolean;
}) {
  return <section className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
    <div className="flex items-center justify-between border-b border-[#1a3a5c] bg-[#081b2e] p-4"><div><h2 className="font-black">Settlement Parcels</h2><p className="mt-1 text-xs text-[#6f98b8]">Backend-calculated Parcel Financial V2 values</p></div><span className="text-xs font-black text-[#f6b84b]">{rows.length.toLocaleString()} rows</span></div>
    <div className="overflow-auto"><table className="w-full min-w-[1500px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[#f6b84b] text-[#061524]"><tr>
      {internal && <th className="p-3">Select</th>}<th className="p-3">Waybill</th><th className="p-3">Delivered</th><th className="p-3">Merchant</th><th className="p-3">Receiver</th><th className="p-3 text-right">Item Price</th><th className="p-3 text-right">Customer Delivery</th><th className="p-3 text-right">Customer Collection</th><th className="p-3 text-right">Company Delivery</th><th className="p-3 text-right">Difference</th><th className="p-3 text-right">Settlement</th><th className="p-3">Direction</th><th className="p-3">Status</th><th className="p-3">Actions</th>
    </tr></thead><tbody>
      {loading && <tr><td colSpan={14} className="p-16 text-center"><Loader2 className="mx-auto animate-spin" /></td></tr>}
      {!loading && rows.slice(0, compact ? 20 : rows.length).map((row) => <tr key={row.parcel_id} className="border-t border-[#1a3a5c] hover:bg-[#102b45]">
        {internal && <td className="p-3"><input type="checkbox" disabled={!row.settlement_eligible} checked={!!selected[row.parcel_id]} onChange={() => onToggle(row)} /></td>}
        <td className="p-3 font-black text-[#f6b84b]">{row.delivery_way_id}</td><td className="p-3">{dateText(deliveredDate(row))}</td><td className="p-3"><div className="font-bold">{row.merchant_name || row.merchant_id}</div><div className="text-[10px] text-[#6f98b8]">{row.merchant_id}</div></td><td className="p-3">{row.recipient_name || "—"}</td>
        <td className="p-3 text-right font-mono">{money(row.item_price)}</td><td className="p-3 text-right font-mono">{money(row.merchant_declared_delivery)}</td><td className="p-3 text-right font-mono font-bold">{money(row.customer_total_collection)}</td><td className="p-3 text-right font-mono">{money(row.net_system_delivery_charge)}</td>
        <td className={`p-3 text-right font-mono font-black ${numberValue(row.delivery_difference) > 0 ? "text-emerald-400" : numberValue(row.delivery_difference) < 0 ? "text-amber-300" : "text-[#8fb4d0]"}`}>{row.delivery_difference == null ? "—" : money(row.delivery_difference)}</td><td className="p-3 text-right font-mono font-black">{row.merchant_final_settlement_amount == null ? "Not available" : money(row.merchant_final_settlement_amount)}</td>
        <td className="p-3"><StatusBadge value={row.settlement_direction} kind="direction" /></td><td className="p-3"><div className="space-y-1"><StatusBadge value={row.settlement_state} />{row.validation_status && <StatusBadge value={row.validation_status} />}</div></td>
        <td className="p-3"><div className="flex gap-1"><button onClick={() => onView(row)} className="rounded-lg border border-[#355a78] p-2 hover:border-[#38bdf8]" title="View details"><Eye size={14} /></button>{internal && <button onClick={() => onHold(row)} className="rounded-lg border border-[#355a78] p-2 hover:border-[#f6b84b]" title={row.financial_hold ? "Release hold" : "Place on hold"}><FileWarning size={14} /></button>}<button onClick={() => onDispute(row)} className="rounded-lg border border-[#355a78] p-2 hover:border-[#f6b84b]" title="Raise dispute"><AlertTriangle size={14} /></button></div></td>
      </tr>)}
      {!loading && rows.length === 0 && <tr><td colSpan={14} className="p-16 text-center text-[#6f98b8]">No settlement parcels found.</td></tr>}
    </tbody></table></div>
  </section>;
}

function BatchTable({ batches, internal, busy, onSelect, onTransition, onPayment, onStatement }: { batches: SettlementBatch[]; internal: boolean; busy: boolean; onSelect: (batch: SettlementBatch) => void; onTransition: (batch: SettlementBatch, action: string) => void; onPayment: (batch: SettlementBatch) => void; onStatement: (batch: SettlementBatch) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236]"><div className="border-b border-[#1a3a5c] bg-[#081b2e] p-4"><h2 className="font-black">Settlement Batches</h2></div><div className="overflow-auto"><table className="w-full min-w-[1450px] text-left text-xs"><thead className="bg-[#f6b84b] text-[#061524]"><tr>{["Batch","Merchant","Period","Parcels","Net Payable","Paid","Outstanding","Batch Status","Payment Status","Created","Actions"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>
    {batches.map((batch) => <tr key={batch.id} className="border-t border-[#1a3a5c] hover:bg-[#102b45]"><td className="p-3 font-black text-[#f6b84b]">{batch.batch_number}</td><td className="p-3"><div className="font-bold">{batch.merchant_name || batch.merchant_id}</div><div className="text-[10px] text-[#6f98b8]">{batch.merchant_id}</div></td><td className="p-3">{dateText(batch.period_from)} – {dateText(batch.period_to)}</td><td className="p-3 font-black">{numberValue(batch.parcel_count).toLocaleString()}</td><td className="p-3 font-mono font-black">{money(batch.batch_net_payable)}</td><td className="p-3 font-mono text-emerald-400">{money(batch.paid_amount)}</td><td className="p-3 font-mono text-amber-300">{money(batch.outstanding_amount)}</td><td className="p-3"><StatusBadge value={batch.status} /></td><td className="p-3"><StatusBadge value={batch.payment_status} /></td><td className="p-3">{dateText(batch.created_at)}</td><td className="p-3"><div className="flex flex-wrap gap-1"><button onClick={() => onSelect(batch)} className="rounded-lg border border-[#355a78] p-2"><Eye size={14} /></button><button onClick={() => onStatement(batch)} className="rounded-lg border border-[#355a78] p-2"><Download size={14} /></button>{internal && batch.status === "DRAFT" && <button disabled={busy} onClick={() => onTransition(batch,"SUBMIT_REVIEW")} className="mini">Submit</button>}{internal && batch.status === "UNDER_REVIEW" && <button disabled={busy} onClick={() => onTransition(batch,"SUBMIT_APPROVAL")} className="mini">Review</button>}{internal && batch.status === "PENDING_APPROVAL" && <button disabled={busy} onClick={() => onTransition(batch,"APPROVE")} className="mini success">Approve</button>}{internal && ["APPROVED","PARTIALLY_PAID","PAYMENT_PROCESSING"].includes(batch.status) && numberValue(batch.outstanding_amount) > 0 && <button disabled={busy} onClick={() => onPayment(batch)} className="mini success"><Banknote size={12}/> Pay</button>}</div></td></tr>)}
    {batches.length === 0 && <tr><td colSpan={11} className="p-16 text-center text-[#6f98b8]">No settlement batches found.</td></tr>}
  </tbody></table></div><style>{`.mini{display:inline-flex;align-items:center;gap:4px;border:1px solid #355a78;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:900;text-transform:uppercase}.mini.success{border-color:rgba(34,197,94,.5);color:#86efac}.mini:disabled{opacity:.4}`}</style></section>;
}

function PaymentTable({ payments }: { payments: PaymentRow[] }) {
  return <SimpleTable headers={["Reference","Batch","Merchant","Amount","Method","Date","Status","Entered By"]} empty="No payment transactions found.">{payments.map((p) => <tr key={p.id} className="border-t border-[#1a3a5c]"><td className="p-3 font-black text-[#f6b84b]">{p.payment_reference || "—"}</td><td className="p-3">{p.batch_number || p.batch_id}</td><td className="p-3">{p.merchant_name || p.merchant_id || "—"}</td><td className="p-3 font-mono font-black">{money(p.amount)}</td><td className="p-3">{label(p.payment_method)}</td><td className="p-3">{dateText(p.payment_date || p.created_at)}</td><td className="p-3"><StatusBadge value={p.status} /></td><td className="p-3">{p.entered_by || "—"}</td></tr>)}</SimpleTable>;
}

function ExceptionTable({ rows, onView, onHold }: { rows: SettlementRow[]; onView: (row: SettlementRow) => void; onHold: (row: SettlementRow) => void }) {
  return <SimpleTable headers={["Exception","Waybill","Merchant","Message","Customer Collection","Company Delivery","Difference","Created","Actions"]} empty="No financial exceptions found.">{rows.map((row) => <tr key={row.parcel_id} className="border-t border-[#1a3a5c]"><td className="p-3"><StatusBadge value={row.financial_hold ? "FINANCIAL_HOLD" : row.settlement_direction === "BREAKDOWN_REQUIRED" ? "BREAKDOWN_REQUIRED" : row.validation_status} /></td><td className="p-3 font-black text-[#f6b84b]">{row.delivery_way_id}</td><td className="p-3">{row.merchant_name || row.merchant_id}</td><td className="max-w-[360px] p-3 text-[#8fb4d0]">{row.financial_hold_reason || row.validation_message || "Review required"}</td><td className="p-3 font-mono">{money(row.customer_total_collection)}</td><td className="p-3 font-mono">{money(row.net_system_delivery_charge)}</td><td className="p-3 font-mono">{money(row.delivery_difference)}</td><td className="p-3">{dateText(row.calculated_at)}</td><td className="p-3"><div className="flex gap-1"><button onClick={() => onView(row)} className="rounded-lg border border-[#355a78] p-2"><Eye size={14}/></button><button onClick={() => onHold(row)} className="rounded-lg border border-[#355a78] p-2"><FileWarning size={14}/></button></div></td></tr>)}</SimpleTable>;
}

function DisputeTable({ disputes, internal, onResolve }: { disputes: DisputeRow[]; internal: boolean; onResolve: (row: DisputeRow) => void }) {
  return <SimpleTable headers={["Submitted","Waybill","Batch","Merchant","Category","Claimed","Explanation","Status","Actions"]} empty="No settlement disputes found.">{disputes.map((d) => <tr key={d.id} className="border-t border-[#1a3a5c]"><td className="p-3">{dateText(d.submitted_at)}</td><td className="p-3 font-black text-[#f6b84b]">{d.delivery_way_id || "—"}</td><td className="p-3">{d.batch_number || "—"}</td><td className="p-3">{d.merchant_id}</td><td className="p-3">{label(d.dispute_category)}</td><td className="p-3 font-mono">{money(d.claimed_amount)}</td><td className="max-w-[360px] p-3 text-[#8fb4d0]">{d.merchant_explanation}</td><td className="p-3"><StatusBadge value={d.status} /></td><td className="p-3">{internal && <button onClick={() => onResolve(d)} className="rounded-lg border border-[#355a78] px-3 py-2 text-[10px] font-black">Resolve</button>}</td></tr>)}</SimpleTable>;
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <SimpleTable headers={["Timestamp","Action","Entity","Entity ID","User","Role","Reason"]} empty="No audit events found.">{rows.map((a) => <tr key={a.id} className="border-t border-[#1a3a5c]"><td className="p-3">{dateText(a.created_at)}</td><td className="p-3"><StatusBadge value={a.action} /></td><td className="p-3">{label(a.entity_type)}</td><td className="p-3 font-mono text-[#f6b84b]">{a.entity_id}</td><td className="p-3">{a.actor_email || "—"}</td><td className="p-3">{label(a.actor_role)}</td><td className="max-w-[400px] p-3 text-[#8fb4d0]">{a.reason || "—"}</td></tr>)}</SimpleTable>;
}

function SimpleTable({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty: string }) {
  const childArray = Array.isArray(children) ? children : [children];
  return <section className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236]"><div className="overflow-auto"><table className="w-full min-w-[1150px] text-left text-xs"><thead className="bg-[#f6b84b] text-[#061524]"><tr>{headers.map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{children}{childArray.length === 0 && <tr><td colSpan={headers.length} className="p-16 text-center text-[#6f98b8]">{empty}</td></tr>}</tbody></table></div></section>;
}

function ParcelDrawer({ row, internal, onClose, onHold, onDispute }: { row: SettlementRow; internal: boolean; onClose: () => void; onHold: (row: SettlementRow) => void; onDispute: (row: SettlementRow) => void }) {
  return <Drawer title="Parcel Financial Detail" onClose={onClose}><div className="space-y-5"><section><div className="text-2xl font-black text-[#f6b84b]">{row.delivery_way_id}</div><div className="mt-1 text-sm text-[#8fb4d0]">{row.merchant_name || row.merchant_id} · {row.recipient_name || "No receiver"}</div></section><DetailGroup title="Parcel Information" rows={[["Delivery date",dateText(deliveredDate(row))],["Destination",row.destination_township || row.destination || "—"],["Customer tier",row.customer_tier || "—"],["Amount-entry type",label(row.amount_entry_type)],["Eligibility",label(row.settlement_state)]]}/><DetailGroup title="Customer Collection" rows={[["Item price",money(row.item_price)],["Merchant delivery",money(row.merchant_declared_delivery)],["Total collected",money(row.customer_total_collection)]]}/><DetailGroup title="Company Tariff" rows={[["Net company delivery",money(row.net_system_delivery_charge)]]}/><DetailGroup title="Merchant Settlement" rows={[["Delivery difference",money(row.delivery_difference)],["Direction",label(row.settlement_direction)],["Other credits",money(row.other_merchant_credits)],["Merchant charges",money(row.merchant_payable_charges)],["Final settlement",row.merchant_final_settlement_amount == null ? "Not available" : money(row.merchant_final_settlement_amount)]]}/><div className="flex flex-wrap gap-2">{internal && <button onClick={() => onHold(row)} className="action secondary"><FileWarning size={15}/>{row.financial_hold ? "Release Hold" : "Place on Hold"}</button>}<button onClick={() => onDispute(row)} className="action secondary"><AlertTriangle size={15}/>Raise Dispute</button></div></div></Drawer>;
}

function BatchDrawer({ batch, internal, onClose, onStatement }: { batch: SettlementBatch; internal: boolean; onClose: () => void; onStatement: (batch: SettlementBatch) => void }) {
  return <Drawer title="Settlement Batch" onClose={onClose}><div className="space-y-5"><section><div className="text-2xl font-black text-[#f6b84b]">{batch.batch_number}</div><div className="mt-2 flex gap-2"><StatusBadge value={batch.status}/><StatusBadge value={batch.payment_status}/></div></section><DetailGroup title="Summary" rows={[["Merchant",batch.merchant_name || batch.merchant_id],["Settlement period",`${dateText(batch.period_from)} – ${dateText(batch.period_to)}`],["Parcel count",numberValue(batch.parcel_count).toLocaleString()],["Created by",batch.created_by || "—"],["Approved by",batch.approved_by || "—"]]}/><DetailGroup title="Totals" rows={[["Customer collection",money(batch.customer_collection)],["Item value",money(batch.item_value)],["Company delivery revenue",money(batch.company_delivery_revenue)],["Excess credited",money(batch.delivery_excess_credit)],["Shortfall deducted",money(batch.delivery_shortfall_deduction)],["Net payable",money(batch.batch_net_payable)],["Paid",money(batch.paid_amount)],["Outstanding",money(batch.outstanding_amount)]]}/><button onClick={() => onStatement(batch)} className="action primary"><Download size={15}/>Download Statement</button>{!internal && <p className="text-xs text-[#6f98b8]">Internal approval controls and Finance notes are hidden from merchant users.</p>}</div></Drawer>;
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] bg-black/60" onMouseDown={onClose}><aside className="ml-auto h-full w-full max-w-[560px] overflow-y-auto border-l border-[#1a3a5c] bg-[#061524] p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="rounded-xl border border-[#1a3a5c] p-2"><X size={18}/></button></div>{children}</aside></div>;
}

function DetailGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-wider text-[#f6b84b]">{title}</h3><div className="space-y-2">{rows.map(([k,v]) => <div key={k} className="flex justify-between gap-4 border-b border-[#1a3a5c]/60 py-2 text-xs last:border-0"><span className="text-[#8fb4d0]">{k}</span><strong className="text-right">{v}</strong></div>)}</div></section>;
}

function BatchModal({ form, selectedCount, busy, onChange, onClose, onSubmit }: { form: BatchForm; selectedCount: number; busy: boolean; onChange: (form: BatchForm) => void; onClose: () => void; onSubmit: () => void }) {
  const field = (key: keyof BatchForm, value: string) => onChange({ ...form, [key]: value });
  return <Modal title="Create Settlement Batch" onClose={onClose}><div className="grid gap-3 md:grid-cols-2"><ReadOnly label="Selected parcels" value={selectedCount.toLocaleString()}/><Input label="Period from" type="date" value={form.periodFrom} onChange={(v) => field("periodFrom",v)}/><Input label="Period to" type="date" value={form.periodTo} onChange={(v) => field("periodTo",v)}/><Input label="Planned payment date" type="date" value={form.plannedPaymentDate} onChange={(v) => field("plannedPaymentDate",v)}/><Input label="Batch credits" type="number" value={form.batchCredits} onChange={(v) => field("batchCredits",v)}/><Input label="Batch deductions" type="number" value={form.batchDeductions} onChange={(v) => field("batchDeductions",v)}/><Input label="Advance recovery" type="number" value={form.advanceRecovery} onChange={(v) => field("advanceRecovery",v)}/><Input label="Withholding tax" type="number" value={form.withholdingTax} onChange={(v) => field("withholdingTax",v)}/><Input label="Payment method" value={form.paymentMethod} onChange={(v) => field("paymentMethod",v)}/><Input label="Merchant bank account" value={form.bankAccount} onChange={(v) => field("bankAccount",v)}/><div className="md:col-span-2"><Input label="Finance remarks" value={form.remarks} onChange={(v) => field("remarks",v)}/></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="action secondary">Cancel</button><button onClick={onSubmit} disabled={busy} className="action primary">{busy?<Loader2 size={15} className="animate-spin"/>:<ChevronRight size={15}/>}Create Draft</button></div></Modal>;
}

function PaymentModal({ batch, amount, reference, method, busy, onAmount, onReference, onMethod, onClose, onSubmit }: { batch: SettlementBatch; amount: string; reference: string; method: string; busy: boolean; onAmount: (v:string)=>void; onReference:(v:string)=>void; onMethod:(v:string)=>void; onClose:()=>void; onSubmit:()=>void }) {
  return <Modal title="Record Settlement Payment" onClose={onClose}><div className="space-y-3"><ReadOnly label="Batch" value={batch.batch_number}/><ReadOnly label="Outstanding" value={money(batch.outstanding_amount)}/><Input label="Payment amount" type="number" value={amount} onChange={onAmount}/><Input label="Payment method" value={method} onChange={onMethod}/><Input label="Payment reference" value={reference} onChange={onReference}/></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="action secondary">Cancel</button><button onClick={onSubmit} disabled={busy} className="action primary">{busy?<Loader2 size={15} className="animate-spin"/>:<CheckCircle2 size={15}/>}Confirm Payment</button></div></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}><div className="w-full max-w-2xl rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-2xl" onMouseDown={(e)=>e.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="rounded-xl border border-[#1a3a5c] p-2"><X size={18}/></button></div>{children}</div></div>;
}

function Input({ label: title, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string)=>void; type?: string }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#8fb4d0]">{title}</span><input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="field"/></label>;
}

function ReadOnly({ label: title, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3"><div className="text-[9px] font-black uppercase tracking-wider text-[#6f98b8]">{title}</div><div className="mt-1 font-black">{value}</div></div>;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
