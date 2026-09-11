// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FinancePortal.tsx — Production Finance Portal
// API: /api/v1/finance-portal/*   Role: finance / accountant
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  useFinanceOverview,
  useCodReconciliation,
  useSettlements,
  useApproveSettlement,
  useRiderWallets,
  useVouchers,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "overview" | "cod" | "settlements" | "wallets" | "vouchers";

export default function FinancePortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const overview = useFinanceOverview();
  const cod = useCodReconciliation(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : undefined);
  const settlements = useSettlements();
  const approveSettlement = useApproveSettlement();
  const wallets = useRiderWallets();
  const vouchers = useVouchers();

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "💰 Overview" },
    { id: "cod", label: "🔄 COD Reconciliation" },
    { id: "settlements", label: "📦 Settlements" },
    { id: "wallets", label: "👛 Rider Wallets" },
    { id: "vouchers", label: "🧾 Vouchers" },
  ];

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

        {/* RIDER WALLETS */}
        {tab === "wallets" && (
          <div>
            <h2 style={S.h2}>Rider Wallets</h2>
            <DataTable
              loading={wallets.isLoading}
              error={wallets.error?.message}
              data={wallets.data as unknown[]}
              cols={["Rider", "Balance", "Commission", "Bonus", "Fines"]}
              rowFn={(r: Record<string, unknown>) => [
                r.rider_id,
                fmt(r.current_balance),
                fmt(r.success_commission),
                fmt(r.performance_bonus),
                fmt(r.fines),
              ]}
            />
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
