// ─────────────────────────────────────────────────────────────────────────────
// SupervisorPortal.tsx — Production Supervisor Portal
// API: /api/v1/operations/*   Role: supervisor
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useExceptions, useShipments } from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/apiClient";
import { API_ROUTES } from "../lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type Tab = "exceptions" | "rider-monitoring" | "shipments";

export default function SupervisorPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("exceptions");
  const [statusFilter, setStatusFilter] = useState("failed");
  const qc = useQueryClient();

  const exceptions = useExceptions({ status: statusFilter });
  const shipments = useShipments({ page: "1", limit: "50" });

  const resolveException = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note: string }) =>
      api.patch(API_ROUTES.OPS_SHIPMENT(id), { action, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "exceptions"] }),
  });

  const [resolveState, setResolveState] = useState<Record<string, { action: string; note: string }>>({});

  const tabs = [
    { id: "exceptions" as Tab, label: "❌ Exceptions" },
    { id: "rider-monitoring" as Tab, label: "🛵 Rider Monitoring" },
    { id: "shipments" as Tab, label: "📦 All Shipments" },
  ];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.headerTitle}>🎯 Supervisor Portal</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <nav style={S.tabBar}>
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>{t.label}</button>)}
      </nav>

      <main style={S.main}>
        {tab === "exceptions" && (
          <div>
            <div style={S.filterRow}>
              <h2 style={S.h2}>Exception Management</h2>
              <select style={S.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {["failed", "pending", "reattempt", "return_pending", "all"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {exceptions.isLoading && <Spin />}
            {exceptions.isError && <ErrBanner msg={exceptions.error?.message} />}
            {resolveException.isError && <ErrBanner msg={resolveException.error?.message} />}
            {resolveException.isSuccess && <SuccBanner msg="Exception updated ✓" />}
            {!exceptions.isLoading && (
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["AWB", "Receiver", "Status", "Failure Reason", "Action", "Note", "Submit"].map((c) => <th key={c} style={S.th}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {!(exceptions.data as unknown[] ?? []).length
                      ? <tr><td colSpan={7} style={S.empty}>No exceptions found.</td></tr>
                      : (exceptions.data as Record<string, unknown>[]).map((r, i) => {
                          const rs = resolveState[String(r.id)] ?? { action: "reattempt", note: "" };
                          return (
                            <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                              <td style={S.td}>{String(r.awb ?? "")}</td>
                              <td style={S.td}>{String(r.receiver_name ?? "")}</td>
                              <td style={S.td}><StatusBadge s={String(r.status ?? "")} /></td>
                              <td style={S.td}>{String(r.failure_reason ?? "—")}</td>
                              <td style={S.td}>
                                <select style={S.inlineSelect} value={rs.action}
                                  onChange={(e) => setResolveState((st) => ({ ...st, [String(r.id)]: { ...rs, action: e.target.value } }))}>
                                  {["reattempt", "return_to_merchant", "cs_followup", "cancelled"].map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </td>
                              <td style={S.td}>
                                <input style={S.inlineInput} placeholder="Note…" value={rs.note}
                                  onChange={(e) => setResolveState((st) => ({ ...st, [String(r.id)]: { ...rs, note: e.target.value } }))} />
                              </td>
                              <td style={S.td}>
                                <button style={S.resolveBtn}
                                  disabled={resolveException.isPending}
                                  onClick={() => resolveException.mutate({ id: String(r.id), action: rs.action, note: rs.note })}>
                                  Save
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "rider-monitoring" && (
          <div>
            <h2 style={S.h2}>Rider Monitoring (Out-for-Delivery)</h2>
            {shipments.isLoading && <Spin />}
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead><tr>{["AWB", "Rider", "Receiver", "Status", "Last Updated"].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                <tbody>
                  {((shipments.data as Record<string, unknown>[] | undefined) ?? [])
                    .filter((r) => r.status === "out_for_delivery" || r.status === "failed")
                    .map((r, i) => (
                      <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                        <td style={S.td}>{String(r.awb ?? "")}</td>
                        <td style={S.td}>{String(r.rider_id ?? "—")}</td>
                        <td style={S.td}>{String(r.receiver_name ?? "")}</td>
                        <td style={S.td}><StatusBadge s={String(r.status ?? "")} /></td>
                        <td style={S.td}>{fmtDate(r.updated_at as string)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "shipments" && (
          <div>
            <h2 style={S.h2}>All Shipments</h2>
            {shipments.isLoading && <Spin />}
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead><tr>{["AWB", "Sender", "Receiver", "Status", "COD", "Booked"].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                <tbody>
                  {((shipments.data as Record<string, unknown>[] | undefined) ?? []).map((r, i) => (
                    <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                      <td style={S.td}>{String(r.awb ?? "")}</td>
                      <td style={S.td}>{String(r.sender_name ?? "")}</td>
                      <td style={S.td}>{String(r.receiver_name ?? "")}</td>
                      <td style={S.td}><StatusBadge s={String(r.status ?? "")} /></td>
                      <td style={S.td}>{Number(r.cod_amount ?? 0).toLocaleString()} MMK</td>
                      <td style={S.td}>{fmtDate(r.booked_at as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = { delivered: "#10b981", failed: "#ef4444", out_for_delivery: "#3b82f6", in_transit: "#8b5cf6", pending: "#f59e0b", reattempt: "#f97316", return_pending: "#94a3b8", cancelled: "#1e293b" };
  return <span style={{ background: map[s] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{s}</span>;
}
function fmtDate(v?: string) { return v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function Spin() { return <div style={{ color: "#94a3b8", padding: 16 }}>Loading…</div>; }
function ErrBanner({ msg }: { msg?: string }) { return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }}>⚠️ {msg}</div>; }
function SuccBanner({ msg }: { msg: string }) { return <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 }}>{msg}</div>; }

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "linear-gradient(90deg,#1e40af,#2563eb)", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: 800, fontSize: 17 },
  userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #e2e8f0", display: "flex", gap: 2, padding: "0 24px" },
  tab: { background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500 },
  tabActive: { background: "transparent", border: "none", borderBottom: "3px solid #2563eb", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#1e40af", fontWeight: 700 },
  main: { padding: "24px", maxWidth: 1300, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  filterRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  select: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "7px 12px", fontSize: 13, outline: "none" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#1e3a8a", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  inlineSelect: { border: "1px solid #d1d5db", borderRadius: 5, padding: "4px 6px", fontSize: 12, outline: "none", width: 130 },
  inlineInput: { border: "1px solid #d1d5db", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", width: 120 },
  resolveBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 },
};
