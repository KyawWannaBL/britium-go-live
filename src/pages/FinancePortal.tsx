// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FinancePortal.tsx — Production Finance Portal
// API: /api/v1/finance-portal/*   Role: finance / accountant
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  useFinanceOverview,
  useCodReconciliation,
  useSettlements,
  useApproveSettlement,
  useRiderWallets,
  useVouchers,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "overview" | "field-delivery" | "cod" | "settlements" | "wallets" | "payouts" | "vouchers";

export default function FinancePortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fieldDate, setFieldDate] = useState(() => new Date().toISOString().slice(0,10));
  const [fieldWorker, setFieldWorker] = useState("");
  const [fieldDaily, setFieldDaily] = useState<any>({ summary: {}, rows: [] });
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [partyWallets, setPartyWallets] = useState<any>({ summary: {}, rows: [] });
  const [partyWalletLoading, setPartyWalletLoading] = useState(false);
  const [partyWalletError, setPartyWalletError] = useState("");
  const [partyType, setPartyType] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [payoutQueue, setPayoutQueue] = useState<any>({ summary: {}, rows: [] });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");
  const [payoutPartyType, setPayoutPartyType] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>([]);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [paymentRecipient, setPaymentRecipient] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [payoutConfirming, setPayoutConfirming] = useState(false);

  const overview = useFinanceOverview();
  const cod = useCodReconciliation(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : undefined);
  const settlements = useSettlements();
  const approveSettlement = useApproveSettlement();
  const wallets = useRiderWallets();
  const vouchers = useVouchers();

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "💰 Overview" },
    { id: "field-delivery", label: "🚚 Field Delivery Daily" },
    { id: "cod", label: "🔄 COD Reconciliation" },
    { id: "settlements", label: "📦 Settlements" },
    { id: "wallets", label: "👛 Settlement Wallets" },
    { id: "payouts", label: "💸 Payout Queue" },
    { id: "vouchers", label: "🧾 Vouchers" },
  ];

  async function loadFieldDaily() {
    setFieldLoading(true);
    setFieldError("");
    const { data, error } = await (supabase as any).rpc("be_finance_field_delivery_daily_v172", {
      p_work_date: fieldDate || null,
      p_worker_code: fieldWorker.trim() || null,
    });
    if (error) setFieldError(error.message);
    else if (data?.ok === false) setFieldError(data?.error || "Unable to load field delivery daily reconciliation.");
    else setFieldDaily(data || { summary: {}, rows: [] });
    setFieldLoading(false);
  }

  async function loadPayoutQueue() {
    setPayoutLoading(true);
    setPayoutError("");
    const { data, error } = await (supabase as any).rpc("be_party_wallet_payout_queue_v193", {
      p_party_type: payoutPartyType || null,
      p_limit: 2000,
    });
    if (error) setPayoutError(error.message);
    else if (data?.ok === false) setPayoutError(data?.error || "Unable to load payout queue.");
    else setPayoutQueue(data || { summary: {}, rows: [] });
    setPayoutLoading(false);
  }

  async function confirmPayout() {
    setPayoutError("");
    setPayoutSuccess("");
    const rows = Array.isArray(payoutQueue?.rows) ? payoutQueue.rows : [];
    const selectedRows = rows.filter((r: any) => selectedLedgerIds.includes(String(r.ledger_id)));
    const amount = selectedRows.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    if (!selectedWalletId || selectedLedgerIds.length === 0) {
      setPayoutError("Select at least one eligible payout row.");
      return;
    }
    if (!paymentReference.trim() || !paymentMethod.trim() || !paymentRecipient.trim()) {
      setPayoutError("Payment reference, method and recipient are required.");
      return;
    }

    setPayoutConfirming(true);
    const { data, error } = await (supabase as any).rpc("be_party_wallet_confirm_payout_v193", {
      p_wallet_id: selectedWalletId,
      p_ledger_ids: selectedLedgerIds,
      p_payment_reference: paymentReference.trim(),
      p_payment_method: paymentMethod.trim(),
      p_recipient: paymentRecipient.trim(),
      p_paid_amount: amount,
      p_note: paymentNote.trim() || null,
    });
    if (error) setPayoutError(error.message);
    else if (data?.ok === false) setPayoutError(data?.error || "Payout confirmation failed.");
    else {
      setPayoutSuccess(`Payment confirmed: ${data?.payment_reference || paymentReference} — ${fmt(data?.amount || amount)}`);
      setSelectedWalletId("");
      setSelectedLedgerIds([]);
      setPaymentReference("");
      setPaymentRecipient("");
      setPaymentNote("");
      await Promise.all([loadPayoutQueue(), loadPartyWallets()]);
    }
    setPayoutConfirming(false);
  }

  function togglePayoutRow(row: any) {
    const walletId = String(row.wallet_id || "");
    const ledgerId = String(row.ledger_id || "");
    if (!walletId || !ledgerId) return;
    if (selectedWalletId && selectedWalletId !== walletId) {
      setSelectedWalletId(walletId);
      setSelectedLedgerIds([ledgerId]);
      setPaymentRecipient(String(row.party_name || row.party_key || ""));
      setPayoutSuccess("");
      return;
    }
    const exists = selectedLedgerIds.includes(ledgerId);
    const next = exists ? selectedLedgerIds.filter((id) => id !== ledgerId) : [...selectedLedgerIds, ledgerId];
    setSelectedWalletId(next.length ? walletId : "");
    setSelectedLedgerIds(next);
    if (!paymentRecipient && !exists) setPaymentRecipient(String(row.party_name || row.party_key || ""));
    setPayoutSuccess("");
  }

  async function loadPartyWallets() {
    setPartyWalletLoading(true);
    setPartyWalletError("");
    await (supabase as any).rpc("be_refresh_party_wallets_v1");
    const { data, error } = await (supabase as any).rpc("be_finance_party_wallet_center_v1", {
      p_party_type: partyType || null,
      p_search: partySearch.trim() || null,
      p_limit: 2000,
    });
    if (error) setPartyWalletError(error.message);
    else if (data?.ok === false) setPartyWalletError(data?.code || "Unable to load settlement wallets.");
    else setPartyWallets(data || { summary: {}, rows: [] });
    setPartyWalletLoading(false);
  }

  useEffect(() => {
    if (tab === "field-delivery") void loadFieldDaily();
    if (tab === "wallets") void loadPartyWallets();
    if (tab === "payouts") void loadPayoutQueue();
  }, [tab]);

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={S.headerTitle}>💰 Finance Portal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <nav style={S.tabBar}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {/* OVERVIEW */}
        {tab === "overview" && (
          <OverviewSection data={overview.data as Record<string, unknown>} loading={overview.isLoading} error={overview.error?.message} />
        )}

        {/* FIELD DELIVERY DAILY */}
        {tab === "field-delivery" && (
          <div>
            <h2 style={S.h2}>Field Delivery Daily Reconciliation</h2>
            <div style={S.filterBar}>
              <label style={S.filterLabel}>Work Date
                <input type="date" style={S.filterInput} value={fieldDate} onChange={(e) => setFieldDate(e.target.value)} />
              </label>
              <label style={S.filterLabel}>Rider / Driver Code
                <input type="text" style={S.filterInput} placeholder="All or RID007 / DRV001" value={fieldWorker} onChange={(e) => setFieldWorker(e.target.value)} />
              </label>
              <button onClick={() => void loadFieldDaily()} style={S.approveBtn} disabled={fieldLoading}>
                {fieldLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {fieldError && <ErrBanner msg={fieldError} />}
            <FieldDeliveryDailySection data={fieldDaily} loading={fieldLoading} />
          </div>
        )}

        {/* COD RECONCILIATION */}
        {tab === "cod" && (
          <div>
            <h2 style={S.h2}>COD Reconciliation</h2>
            <div style={S.filterBar}>
              <label style={S.filterLabel}>Date From<input type="date" style={S.filterInput} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
              <label style={S.filterLabel}>Date To<input type="date" style={S.filterInput} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
            </div>
            <DataTable
              loading={cod.isLoading}
              error={cod.error?.message}
              data={cod.data as unknown[]}
              cols={["AWB", "COD Amount", "Collected", "Difference", "Status", "Collected At"]}
              rowFn={(r: Record<string, unknown>) => [
                r.awb,
                fmt(r.cod_amount),
                fmt(r.collected_amount),
                fmt((Number(r.cod_amount ?? 0) - Number(r.collected_amount ?? 0))),
                badge(String(r.status ?? "")),
                fmtDate(r.collected_at as string),
              ]}
            />
          </div>
        )}

        {/* SETTLEMENTS */}
        {tab === "settlements" && (
          <div>
            <h2 style={S.h2}>Settlement Batches</h2>
            {approveSettlement.isError && <ErrBanner msg={approveSettlement.error?.message} />}
            {approveSettlement.isSuccess && <SuccBanner msg="Settlement approved ✓" />}
            <DataTable
              loading={settlements.isLoading}
              error={settlements.error?.message}
              data={settlements.data as unknown[]}
              cols={["Batch No.", "Merchant", "Gross", "Fee", "Net Payable", "Status", "Action"]}
              rowFn={(r: Record<string, unknown>) => [
                r.batch_no,
                r.merchant_id,
                fmt(r.gross_amount),
                fmt(r.fee_amount),
                fmt(r.net_amount),
                badge(String(r.transfer_status ?? "")),
                <button
                  key="approve"
                  style={r.transfer_status === "pending" ? S.approveBtn : S.approvedChip}
                  disabled={r.transfer_status !== "pending" || approveSettlement.isPending}
                  onClick={() => {
                    if (r.transfer_status === "pending") approveSettlement.mutate(String(r.id));
                  }}
                >
                  {r.transfer_status === "pending" ? "Approve" : "✓"}
                </button>,
              ]}
            />
          </div>
        )}

        {/* UNIFIED SETTLEMENT WALLETS */}
        {tab === "wallets" && (
          <div>
            <h2 style={S.h2}>Unified Settlement Wallets</h2>
            <div style={S.filterBar}>
              <label style={S.filterLabel}>Party Type
                <select style={S.filterInput} value={partyType} onChange={(e) => setPartyType(e.target.value)}>
                  <option value="">All</option>
                  {["RIDER","DRIVER","HELPER","MARKETING_EMPLOYEE","MERCHANT","DK","ROYAL","NPT","ALLIED_COMPANY","SERVICE_PROVIDER"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label style={S.filterLabel}>Search
                <input style={S.filterInput} value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder="Name / code / email" />
              </label>
              <button onClick={() => void loadPartyWallets()} style={S.approveBtn} disabled={partyWalletLoading}>
                {partyWalletLoading ? "Refreshing..." : "Refresh Wallets"}
              </button>
            </div>
            {partyWalletError && <ErrBanner msg={partyWalletError} />}
            <div style={{...S.statsGrid,marginBottom:18}}>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{partyWallets?.summary?.wallet_count ?? 0}</div><div style={{fontSize:12,color:"#64748b"}}>Wallet Accounts</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(partyWallets?.summary?.britium_owes ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Britium Owes</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(partyWallets?.summary?.owes_britium ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Owes Britium</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(partyWallets?.summary?.net_position ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Net Settlement Position</div></div>
            </div>
            <DataTable
              loading={partyWalletLoading}
              data={(partyWallets?.rows || []) as unknown[]}
              cols={["Type","Party","Key","Britium Owes","Owes Britium","Net Position","Status"]}
              rowFn={(r: Record<string, unknown>) => [
                r.party_type,
                r.party_name || "—",
                r.party_key,
                fmt(r.britium_owes),
                fmt(r.owes_britium),
                fmt(r.net_position),
                badge(String(r.status || "")),
              ]}
            />
            <div style={{marginTop:12,fontSize:12,color:"#64748b"}}>
              Commission policy: Delivery Rider 300 / Driver 150 / Helper 150 MMK per successful way. Pickup Rider 150 / Driver 75 / Helper 75 MMK per parcel with 7,500 MMK cap per pickup point/merchant/OS. Marketing-supported business: 100 MMK per successfully delivered parcel, accrued monthly while employee and business remain eligible.
            </div>
          </div>
        )}

        {/* PAYOUT QUEUE */}
        {tab === "payouts" && (
          <div>
            <h2 style={S.h2}>Payout Queue</h2>
            <div style={S.filterBar}>
              <label style={S.filterLabel}>Party Type
                <select style={S.filterInput} value={payoutPartyType} onChange={(e) => setPayoutPartyType(e.target.value)}>
                  <option value="">All</option>
                  {["MERCHANT","ROYAL","DK","NPT","ALLIED_COMPANY","SERVICE_PROVIDER","RIDER","DRIVER","HELPER","MARKETING_EMPLOYEE"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <button onClick={() => void loadPayoutQueue()} style={S.approveBtn} disabled={payoutLoading}>
                {payoutLoading ? "Refreshing..." : "Refresh Queue"}
              </button>
            </div>

            {payoutError && <ErrBanner msg={payoutError} />}
            {payoutSuccess && <SuccBanner msg={payoutSuccess} />}

            <div style={{...S.statsGrid,marginBottom:18}}>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{payoutQueue?.summary?.row_count ?? 0}</div><div style={{fontSize:12,color:"#64748b"}}>Eligible Rows</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(payoutQueue?.summary?.merchant_amount ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Merchant</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(payoutQueue?.summary?.provider_amount ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Royal / DK / NPT / Allied</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(payoutQueue?.summary?.workforce_amount ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Workforce</div></div>
              <div style={S.statCard}><div style={{fontSize:20,fontWeight:900}}>{fmt(payoutQueue?.summary?.total_amount ?? 0)}</div><div style={{fontSize:12,color:"#64748b"}}>Total Payable</div></div>
            </div>

            <DataTable
              loading={payoutLoading}
              data={(payoutQueue?.rows || []) as unknown[]}
              cols={["Select","Type","Party","Source","Date","Amount","Status"]}
              rowFn={(r: Record<string, unknown>) => [
                <input
                  key="select"
                  type="checkbox"
                  checked={selectedLedgerIds.includes(String(r.ledger_id || ""))}
                  onChange={() => togglePayoutRow(r)}
                />,
                r.party_type,
                r.party_name || r.party_key,
                `${r.source_type || "—"} / ${r.source_key || "—"}`,
                r.transaction_date || "—",
                fmt(r.amount),
                badge(String(r.status || "")),
              ]}
            />

            <div style={{...S.statCard,marginTop:18}}>
              <div style={{fontWeight:800,marginBottom:12}}>Confirm Payment</div>
              <div style={S.filterBar}>
                <label style={S.filterLabel}>Payment Reference
                  <input style={S.filterInput} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Bank slip / transfer ref" />
                </label>
                <label style={S.filterLabel}>Payment Method
                  <select style={S.filterInput} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                    <option value="MOBILE_BANKING">MOBILE BANKING</option>
                    <option value="CASH">CASH</option>
                    <option value="CHEQUE">CHEQUE</option>
                  </select>
                </label>
                <label style={S.filterLabel}>Recipient
                  <input style={S.filterInput} value={paymentRecipient} onChange={(e) => setPaymentRecipient(e.target.value)} placeholder="Recipient name / account" />
                </label>
                <label style={S.filterLabel}>Proof / Note
                  <input style={S.filterInput} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Proof URL, slip note or remarks" />
                </label>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{fontWeight:800}}>
                  Selected: {selectedLedgerIds.length} row(s) · {fmt((payoutQueue?.rows || []).filter((r:any)=>selectedLedgerIds.includes(String(r.ledger_id))).reduce((s:number,r:any)=>s+Number(r.amount||0),0))}
                </div>
                <button
                  onClick={() => void confirmPayout()}
                  style={S.approveBtn}
                  disabled={payoutConfirming || !payoutQueue?.summary?.can_confirm_payout || selectedLedgerIds.length === 0}
                >
                  {payoutConfirming ? "Confirming..." : "Confirm Payment"}
                </button>
              </div>
              {!payoutQueue?.summary?.can_confirm_payout && (
                <div style={{marginTop:10,fontSize:12,color:"#991b1b"}}>Journal-post authority is required to confirm payout.</div>
              )}
              <div style={{marginTop:10,fontSize:12,color:"#64748b"}}>
                A confirmation settles the selected wallet entries, marks linked commissions PAID, posts the accounting event, refreshes wallet balances, and resolves matching notifications.
              </div>
            </div>
          </div>
        )}

        {/* VOUCHERS */}
        {tab === "vouchers" && (
          <div>
            <h2 style={S.h2}>Vouchers</h2>
            <DataTable
              loading={vouchers.isLoading}
              error={vouchers.error?.message}
              data={vouchers.data as unknown[]}
              cols={["Voucher No.", "Type", "Amount", "Period", "Created"]}
              rowFn={(r: Record<string, unknown>) => [
                r.voucher_no, r.voucher_type, fmt(r.total_amount), r.period_id, fmtDate(r.created_at as string)
              ]}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function FieldDeliveryDailySection({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <Loader />;
  const s = data?.summary || {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const cards: [string, string, string][] = [
    ["Total Ways", String(s.total_ways ?? 0), "#334155"],
    ["Successful", String(s.success_ways ?? 0), "#10b981"],
    ["Failed", String(s.failed_ways ?? 0), "#ef4444"],
    ["Active", String(s.active_ways ?? 0), "#3b82f6"],
    ["Wayplan Expected", fmt(s.wayplan_expected_total ?? 0), "#6366f1"],
    ["Successful Expected", fmt(s.success_expected_total ?? 0), "#0ea5e9"],
    ["Actual Collected", fmt(s.actual_collected_total ?? 0), "#059669"],
    ["Cash", fmt(s.cash_collected ?? 0), "#16a34a"],
    ["Mobile Banking", fmt(s.mobile_banking_collected ?? 0), "#7c3aed"],
    ["Variance", fmt(s.cash_reconciliation_variance ?? 0), s.cash_reconciliation_status === "MATCH" ? "#10b981" : "#ef4444"],
  ];
  return (
    <div>
      <div style={{...S.statsGrid, marginBottom: 18}}>
        {cards.map(([label,val,color]) => (
          <div key={label} style={{...S.statCard,borderTop:`4px solid ${color}`}}>
            <div style={{fontSize:20,fontWeight:900,color}}>{val}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{marginBottom:12,fontWeight:800,color:s.cash_reconciliation_status==="MATCH"?"#166534":"#991b1b"}}>
        Reconciliation: {s.cash_reconciliation_status || "—"}
      </div>
      <DataTable
        loading={false}
        data={rows}
        cols={["Way ID","Worker","Result","Reason","Expected","Actual","Payment","Settlement"]}
        rowFn={(r:any)=>[
          r.delivery_way_id,
          r.worker_code || "-",
          badge(String(r.result_class || "")),
          r.failed_reason || "-",
          fmt(r.expected_collect),
          fmt(r.actual_collected),
          r.payment_mode || "-",
          r.settlement_status || "-",
        ]}
      />
    </div>
  );
}

function OverviewSection({ data, loading, error }: { data: Record<string, unknown>; loading: boolean; error?: string }) {
  if (loading) return <Loader />;
  if (error) return <ErrBanner msg={error} />;
  if (!data) return null;
  const cards: [string, string, string][] = [
    ["Total COD Collected", String(data.total_cod_collected ?? "—"), "#10b981"],
    ["Pending Settlements", String(data.pending_settlements ?? "—"), "#f59e0b"],
    ["Settled This Month", String(data.settled_this_month ?? "—"), "#3b82f6"],
    ["Outstanding Balance", String(data.outstanding_balance ?? "—"), "#ef4444"],
  ];
  return (
    <div>
      <h2 style={S.h2}>Finance Overview</h2>
      <div style={S.statsGrid}>
        {cards.map(([label, val, color]) => (
          <div key={label} style={{ ...S.statCard, borderTop: `4px solid ${color}` }}>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ loading, error, data, cols, rowFn }: {
  loading: boolean; error?: string; data: unknown[];
  cols: string[]; rowFn: (r: Record<string, unknown>) => (string | number | React.ReactNode)[];
}) {
  if (loading) return <Loader />;
  if (error) return <ErrBanner msg={error} />;
  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>
          {!(data ?? []).length
            ? <tr><td colSpan={cols.length} style={S.empty}>No records.</td></tr>
            : (data as Record<string, unknown>[]).map((r, i) => (
                <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                  {rowFn(r).map((v, j) => <td key={j} style={S.td}>{typeof v === "string" || typeof v === "number" ? v : v}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function badge(status: string) {
  const color: Record<string, string> = {
    pending: "#f59e0b", transferred: "#10b981", failed: "#ef4444",
    delivered: "#10b981", matched: "#10b981", mismatch: "#ef4444",
  };
  return <span style={{ background: color[status] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{status}</span>;
}
function fmt(v: unknown) { return v !== null && v !== undefined ? `${Number(v).toLocaleString()} MMK` : "—"; }
function fmtDate(v?: string) { return v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function Loader() { return <div style={{ color: "#94a3b8", padding: 16 }}>Loading…</div>; }
function ErrBanner({ msg }: { msg?: string }) {
  return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }}>⚠️ {msg}</div>;
}
function SuccBanner({ msg }: { msg: string }) {
  return <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 }}>{msg}</div>;
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "linear-gradient(90deg,#92400e,#d97706)", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: 800, fontSize: 17 },
  userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #e2e8f0", display: "flex", gap: 2, padding: "0 24px", overflowX: "auto" },
  tab: { background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" },
  tabActive: { background: "transparent", border: "none", borderBottom: "3px solid #d97706", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#92400e", fontWeight: 700, whiteSpace: "nowrap" },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  filterBar: { display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" },
  filterLabel: { fontSize: 12, fontWeight: 600, color: "#374151", display: "flex", flexDirection: "column", gap: 4 },
  filterInput: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "7px 11px", fontSize: 13, outline: "none" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 },
  statCard: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#1e293b", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  approveBtn: { background: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 },
  approvedChip: { background: "#d1fae5", color: "#065f46", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12 },
};
