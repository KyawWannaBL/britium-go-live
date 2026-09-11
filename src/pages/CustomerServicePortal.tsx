// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CustomerServicePortal.tsx — Production CS Portal
// API: /api/v1/operations/*   Role: customer_service
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { useTickets, useCreateTicket, useUpdateTicket, useTrackShipment } from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "tickets" | "track" | "new-ticket";

export default function CustomerServicePortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("tickets");
  const [trackInput, setTrackInput] = useState("");
  const [trackAWB, setTrackAWB] = useState("");
  const [ticketForm, setTicketForm] = useState({ subject: "", issue_type: "inquiry", shipment_awb: "", priority: "medium", notes: "" });
  const [statusFilter, setStatusFilter] = useState("open");

  const tickets = useTickets({ status: statusFilter });
  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();
  const trackResult = useTrackShipment(trackAWB);

  const ISSUE_TYPES = ["inquiry", "failed_delivery", "wrong_address", "cod_dispute", "damaged_parcel", "lost_parcel", "reattempt_request", "other"];
  const tabs = [
    { id: "tickets" as Tab, label: "🎫 Tickets" },
    { id: "track" as Tab, label: "🔍 Track Shipment" },
    { id: "new-ticket" as Tab, label: "➕ New Ticket" },
  ];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.headerTitle}>🎧 Customer Service Portal</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>
      <nav style={S.tabBar}>
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>{t.label}</button>)}
      </nav>

      <main style={S.main}>
        {/* TICKETS */}
        {tab === "tickets" && (
          <div>
            <div style={S.filterRow}>
              <h2 style={S.h2}>Support Tickets</h2>
              <select style={S.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {["open", "in_progress", "resolved", "closed", "all"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {updateTicket.isError && <ErrBanner msg={updateTicket.error?.message} />}
            {updateTicket.isSuccess && <SuccBanner msg="Ticket updated ✓" />}
            {tickets.isLoading && <Spin />}
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead><tr>{["ID", "Subject", "Issue Type", "Priority", "Shipment AWB", "Status", "Action"].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
                <tbody>
                  {!(tickets.data as unknown[] ?? []).length
                    ? <tr><td colSpan={7} style={S.empty}>No tickets found.</td></tr>
                    : (tickets.data as Record<string, unknown>[]).map((r, i) => (
                        <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                          <td style={S.td}>{String(r.id ?? "").slice(0, 8)}…</td>
                          <td style={S.td}>{String(r.subject ?? "")}</td>
                          <td style={S.td}>{String(r.issue_type ?? "")}</td>
                          <td style={S.td}><PriBadge p={String(r.priority ?? "")} /></td>
                          <td style={S.td}>{String(r.shipment_awb ?? "—")}</td>
                          <td style={S.td}><StatusBadge s={String(r.status ?? "")} /></td>
                          <td style={S.td}>
                            {r.status !== "closed" && r.status !== "resolved" && (
                              <select style={S.inlineSelect} value={String(r.status ?? "open")}
                                onChange={(e) => updateTicket.mutate({ id: String(r.id), status: e.target.value })}>
                                {["open", "in_progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRACK */}
        {tab === "track" && (
          <div>
            <h2 style={S.h2}>Track Shipment</h2>
            <form style={S.trackForm} onSubmit={(e) => { e.preventDefault(); setTrackAWB(trackInput.trim()); }}>
              <input style={S.trackInput} placeholder="Enter AWB or tracking number…" value={trackInput} onChange={(e) => setTrackInput(e.target.value)} required />
              <button type="submit" style={S.trackBtn}>Track</button>
            </form>
            {trackResult.isLoading && <Spin />}
            {trackResult.isError && <ErrBanner msg="Shipment not found or tracking failed." />}
            {trackResult.data && (
              <div style={S.trackCard}>
                {(() => {
                  const d = trackResult.data as Record<string, unknown>;
                  return (
                    <>
                      <div style={S.trackHdr}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>AWB: {String(d.awb ?? "")}</div>
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{String(d.service_type ?? "")} · {String(d.current_location ?? "")}</div>
                        </div>
                        <StatusBadge s={String(d.status ?? "")} />
                      </div>
                      <div style={S.trackGrid}>
                        {[["Sender", d.sender_name], ["Receiver", d.receiver_name], ["Receiver Phone", d.receiver_phone], ["Address", d.receiver_address], ["COD Amount", `${Number(d.cod_amount ?? 0).toLocaleString()} MMK`], ["Booked", fmtDate(d.booked_at as string)], ["Delivered", fmtDate(d.delivered_at as string)], ["Rider", d.rider_id]].map(([lbl, val]) => (
                          <div key={String(lbl)} style={S.trackField}>
                            <div style={S.trackLabel}>{lbl}</div>
                            <div>{String(val ?? "—")}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* NEW TICKET */}
        {tab === "new-ticket" && (
          <div style={S.formCard}>
            <h2 style={S.h2}>Create Support Ticket</h2>
            {createTicket.isError && <ErrBanner msg={createTicket.error?.message} />}
            {createTicket.isSuccess && <SuccBanner msg="Ticket created ✓" />}
            <form style={S.form} onSubmit={async (e) => {
              e.preventDefault();
              await createTicket.mutateAsync(ticketForm);
              setTicketForm({ subject: "", issue_type: "inquiry", shipment_awb: "", priority: "medium", notes: "" });
            }}>
              <label style={S.label}>Subject *<input required style={S.input} value={ticketForm.subject} onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))} /></label>
              <label style={S.label}>Issue Type<select style={S.input} value={ticketForm.issue_type} onChange={(e) => setTicketForm((f) => ({ ...f, issue_type: e.target.value }))}>{ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label style={S.label}>Shipment AWB<input style={S.input} value={ticketForm.shipment_awb} onChange={(e) => setTicketForm((f) => ({ ...f, shipment_awb: e.target.value }))} /></label>
              <label style={S.label}>Priority<select style={S.input} value={ticketForm.priority} onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))}>{["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
              <label style={{ ...S.label, gridColumn: "1/-1" }}>Notes<textarea style={{ ...S.input, height: 80, resize: "vertical" }} value={ticketForm.notes} onChange={(e) => setTicketForm((f) => ({ ...f, notes: e.target.value }))} /></label>
              <button type="submit" style={{ ...S.submitBtn, gridColumn: "1/-1" }} disabled={createTicket.isPending}>{createTicket.isPending ? "Creating…" : "Create Ticket"}</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const m: Record<string, string> = { open: "#3b82f6", in_progress: "#f59e0b", resolved: "#10b981", closed: "#94a3b8", delivered: "#10b981", failed: "#ef4444" };
  return <span style={{ background: m[s] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{s}</span>;
}
function PriBadge({ p }: { p: string }) {
  const m: Record<string, string> = { low: "#94a3b8", medium: "#f59e0b", high: "#f97316", urgent: "#ef4444" };
  return <span style={{ background: m[p] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{p}</span>;
}
function fmtDate(v?: string) { return v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function Spin() { return <div style={{ color: "#94a3b8", padding: 16 }}>Loading…</div>; }
function ErrBanner({ msg }: { msg?: string }) { return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }}>⚠️ {msg}</div>; }
function SuccBanner({ msg }: { msg: string }) { return <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 }}>{msg}</div>; }

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "linear-gradient(90deg,#0369a1,#0ea5e9)", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: 800, fontSize: 17 }, userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #e2e8f0", display: "flex", gap: 2, padding: "0 24px" },
  tab: { background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500 },
  tabActive: { background: "transparent", border: "none", borderBottom: "3px solid #0ea5e9", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#0369a1", fontWeight: 700 },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  filterRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  select: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "7px 12px", fontSize: 13, outline: "none" },
  inlineSelect: { border: "1px solid #d1d5db", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#0c4a6e", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  trackForm: { display: "flex", gap: 10, marginBottom: 20, maxWidth: 520 },
  trackInput: { flex: 1, border: "1.5px solid #d1d5db", borderRadius: 8, padding: "9px 14px", fontSize: 14, outline: "none" },
  trackBtn: { background: "#0369a1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
  trackCard: { background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,.08)", maxWidth: 700 },
  trackHdr: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  trackGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  trackField: { fontSize: 13 },
  trackLabel: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 },
  formCard: { background: "#fff", borderRadius: 14, padding: 28, maxWidth: 640, boxShadow: "0 2px 8px rgba(0,0,0,.08)" },
  form: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", flexDirection: "column", gap: 5 },
  input: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit" },
  submitBtn: { background: "linear-gradient(90deg,#0369a1,#0ea5e9)", color: "#fff", border: "none", borderRadius: 9, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
