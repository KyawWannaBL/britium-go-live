// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// WarehousePortal.tsx — Production Warehouse Operations Portal
// API: /api/v1/warehouse/*   Role: warehouse
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from "react";
import {
  useWarehouseOverview,
  useWarehouseInbound,
  useWarehouseStaging,
  useWarehouseStorage,
  useWarehouseOutbound,
  useWarehouseManifests,
  useQrScan,
  useMoveToStaging,
  useMoveToStorage,
  useDispatchOutbound,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "overview" | "inbound" | "staging" | "storage" | "outbound" | "manifests";

export default function WarehousePortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  // QR scan
  const [qrCode, setQrCode] = useState("");
  const [qrResult, setQrResult] = useState<Record<string, unknown> | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const qrScan = useQrScan();

  // Stage form
  const [stageForm, setStageForm] = useState({ trackingNo: "", zone: "", lane: "", position: "" });
  const moveStage = useMoveToStaging();

  // Storage form
  const [storageForm, setStorageForm] = useState({ trackingNo: "", rack: "", bin: "" });
  const moveStorage = useMoveToStorage();

  // Dispatch form
  const [dispatchForm, setDispatchForm] = useState({ trackingNo: "", manifestNo: "" });
  const dispatch = useDispatchOutbound();

  const overview = useWarehouseOverview();
  const inbound = useWarehouseInbound();
  const staging = useWarehouseStaging();
  const storage = useWarehouseStorage();
  const outbound = useWarehouseOutbound();
  const manifests = useWarehouseManifests();

  const handleQrScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrCode.trim()) return;
    const result = await qrScan.mutateAsync(qrCode.trim());
    setQrResult(result as Record<string, unknown>);
    setQrCode("");
    qrInputRef.current?.focus();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "📊 Overview" },
    { id: "inbound", label: "📥 Inbound" },
    { id: "staging", label: "🔄 Staging" },
    { id: "storage", label: "🗄️ Storage" },
    { id: "outbound", label: "📤 Outbound" },
    { id: "manifests", label: "📋 Manifests" },
  ];

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.dot} />
          <span style={S.headerTitle}>Warehouse Portal</span>
          <span style={S.chip}>LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={S.userBadge}>🏭 {user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      {/* QR Scanner bar (always visible) */}
      <div style={S.qrBar}>
        <span style={S.qrLabel}>🔍 QR / AWB Scanner:</span>
        <form onSubmit={handleQrScan} style={{ display: "flex", gap: 8 }}>
          <input
            ref={qrInputRef}
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            style={S.qrInput}
            placeholder="Scan or type AWB…"
            autoFocus
          />
          <button type="submit" style={S.qrBtn} disabled={qrScan.isPending}>
            {qrScan.isPending ? "…" : "Scan"}
          </button>
        </form>
        {qrResult && (
          <div style={S.qrResult}>
            ✅ <strong>{String(qrResult.awb)}</strong> — {String(qrResult.status)} | {String(qrResult.receiver_name ?? "")}
          </div>
        )}
        {qrScan.isError && (
          <div style={S.qrError}>❌ {qrScan.error?.message}</div>
        )}
      </div>

      {/* Tabs */}
      <nav style={S.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={tab === t.id ? S.tabActive : S.tab}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={S.main}>
        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <h2 style={S.h2}>Warehouse Overview</h2>
            {overview.isLoading && <Loader />}
            {overview.isError && <ErrBanner msg={overview.error?.message} />}
            {overview.data && (
              <div style={S.statsGrid}>
                {(
                  [
                    ["📥 Inbound", (overview.data as Record<string, number>).inbound, "#3b82f6"],
                    ["🔄 Staged", (overview.data as Record<string, number>).staged, "#f59e0b"],
                    ["🗄️ Stored", (overview.data as Record<string, number>).stored, "#8b5cf6"],
                    ["📤 Outbound", (overview.data as Record<string, number>).outbound, "#10b981"],
                  ] as [string, number, string][]
                ).map(([label, val, color]) => (
                  <div key={label} style={{ ...S.statCard, borderTop: `4px solid ${color}` }}>
                    <div style={{ fontSize: 32, fontWeight: 900, color }}>{val ?? 0}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INBOUND */}
        {tab === "inbound" && (
          <TableSection
            title="📥 Inbound Queue"
            loading={inbound.isLoading}
            error={inbound.error?.message}
            data={inbound.data as unknown[]}
            cols={["AWB", "Sender", "Receiver", "Status", "Created"]}
            rowFn={(r: Record<string, unknown>) => [
              r.awb, r.sender_name, r.receiver_name, r.status, fmtDate(r.created_at as string)
            ]}
          />
        )}

        {/* STAGING */}
        {tab === "staging" && (
          <div>
            {/* Move to Staging form */}
            <div style={S.formCard}>
              <h3 style={S.h3}>Move Parcel to Staging</h3>
              <form
                style={S.formRow}
                onSubmit={async (e) => {
                  e.preventDefault();
                  await moveStage.mutateAsync(stageForm);
                  setStageForm({ trackingNo: "", zone: "", lane: "", position: "" });
                }}
              >
                {(["trackingNo", "zone", "lane", "position"] as const).map((f) => (
                  <input
                    key={f}
                    style={S.formInput}
                    placeholder={f === "trackingNo" ? "AWB / Tracking No." : f.charAt(0).toUpperCase() + f.slice(1)}
                    value={stageForm[f]}
                    onChange={(e) => setStageForm((s) => ({ ...s, [f]: e.target.value }))}
                    required={f === "trackingNo"}
                  />
                ))}
                <button type="submit" style={S.submitBtn} disabled={moveStage.isPending}>
                  {moveStage.isPending ? "Moving…" : "Move to Staging"}
                </button>
              </form>
              {moveStage.isError && <ErrBanner msg={moveStage.error?.message} />}
              {moveStage.isSuccess && <SuccBanner msg="Moved to staging ✓" />}
            </div>
            <TableSection
              title="🔄 Staging Area"
              loading={staging.isLoading}
              error={staging.error?.message}
              data={staging.data as unknown[]}
              cols={["AWB", "Receiver", "Location", "Status", "Updated"]}
              rowFn={(r: Record<string, unknown>) => [r.awb, r.receiver_name, r.current_location, r.status, fmtDate(r.updated_at as string)]}
            />
          </div>
        )}

        {/* STORAGE */}
        {tab === "storage" && (
          <div>
            <div style={S.formCard}>
              <h3 style={S.h3}>Assign to Storage Bin</h3>
              <form
                style={S.formRow}
                onSubmit={async (e) => {
                  e.preventDefault();
                  await moveStorage.mutateAsync(storageForm);
                  setStorageForm({ trackingNo: "", rack: "", bin: "" });
                }}
              >
                {(["trackingNo", "rack", "bin"] as const).map((f) => (
                  <input
                    key={f}
                    style={S.formInput}
                    placeholder={f === "trackingNo" ? "AWB / Tracking No." : f === "rack" ? "Rack (e.g. A)" : "Bin (e.g. 01)"}
                    value={storageForm[f]}
                    onChange={(e) => setStorageForm((s) => ({ ...s, [f]: e.target.value }))}
                    required
                  />
                ))}
                <button type="submit" style={S.submitBtn} disabled={moveStorage.isPending}>
                  {moveStorage.isPending ? "Storing…" : "Assign to Storage"}
                </button>
              </form>
              {moveStorage.isError && <ErrBanner msg={moveStorage.error?.message} />}
              {moveStorage.isSuccess && <SuccBanner msg="Stored ✓" />}
            </div>
            <TableSection
              title="🗄️ Storage Locations"
              loading={storage.isLoading}
              error={storage.error?.message}
              data={storage.data as unknown[]}
              cols={["AWB", "Receiver", "Location", "Status", "Updated"]}
              rowFn={(r: Record<string, unknown>) => [r.awb, r.receiver_name, r.current_location, r.status, fmtDate(r.updated_at as string)]}
            />
          </div>
        )}

        {/* OUTBOUND */}
        {tab === "outbound" && (
          <div>
            <div style={S.formCard}>
              <h3 style={S.h3}>Dispatch Parcel</h3>
              <form
                style={S.formRow}
                onSubmit={async (e) => {
                  e.preventDefault();
                  await dispatch.mutateAsync(dispatchForm);
                  setDispatchForm({ trackingNo: "", manifestNo: "" });
                }}
              >
                <input
                  style={S.formInput}
                  placeholder="AWB / Tracking No. *"
                  value={dispatchForm.trackingNo}
                  onChange={(e) => setDispatchForm((s) => ({ ...s, trackingNo: e.target.value }))}
                  required
                />
                <input
                  style={S.formInput}
                  placeholder="Manifest No. (optional)"
                  value={dispatchForm.manifestNo}
                  onChange={(e) => setDispatchForm((s) => ({ ...s, manifestNo: e.target.value }))}
                />
                <button type="submit" style={S.submitBtn} disabled={dispatch.isPending}>
                  {dispatch.isPending ? "Dispatching…" : "Dispatch"}
                </button>
              </form>
              {dispatch.isError && <ErrBanner msg={dispatch.error?.message} />}
              {dispatch.isSuccess && <SuccBanner msg="Dispatched ✓" />}
            </div>
            <TableSection
              title="📤 Outbound Queue"
              loading={outbound.isLoading}
              error={outbound.error?.message}
              data={outbound.data as unknown[]}
              cols={["AWB", "Receiver", "Location", "Status", "Updated"]}
              rowFn={(r: Record<string, unknown>) => [r.awb, r.receiver_name, r.current_location, r.status, fmtDate(r.updated_at as string)]}
            />
          </div>
        )}

        {/* MANIFESTS */}
        {tab === "manifests" && (
          <TableSection
            title="📋 Manifests"
            loading={manifests.isLoading}
            error={manifests.error?.message}
            data={manifests.data as unknown[]}
            cols={["Manifest No.", "Destination", "Total Shipments", "Status", "Created"]}
            rowFn={(r: Record<string, unknown>) => [
              r.manifest_no, r.destination_branch_id, r.total_shipments, r.status, fmtDate(r.created_at as string)
            ]}
          />
        )}
      </main>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function TableSection({
  title, loading, error, data, cols, rowFn,
}: {
  title: string;
  loading: boolean;
  error?: string;
  data: unknown[];
  cols: string[];
  rowFn: (row: Record<string, unknown>) => (string | number | unknown)[];
}) {
  return (
    <div>
      <h2 style={S.h2}>{title}</h2>
      {loading && <Loader />}
      {error && <ErrBanner msg={error} />}
      {!loading && !error && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {cols.map((c) => <th key={c} style={S.th}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).length === 0 ? (
                <tr><td colSpan={cols.length} style={S.empty}>No records found.</td></tr>
              ) : (
                (data as Record<string, unknown>[]).map((row, i) => (
                  <tr key={String(row.id ?? i)} style={i % 2 === 0 ? {} : S.trAlt}>
                    {rowFn(row).map((val, j) => (
                      <td key={j} style={S.td}>{String(val ?? "—")}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Loader() {
  return <div style={S.loader}>Loading…</div>;
}
function ErrBanner({ msg }: { msg?: string }) {
  return <div style={S.errBanner}>⚠️ {msg ?? "An error occurred."}</div>;
}
function SuccBanner({ msg }: { msg: string }) {
  return <div style={S.succBanner}>{msg}</div>;
}
function fmtDate(v?: string) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: {
    background: "linear-gradient(90deg,#78350f,#d97706)",
    color: "#fff",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#fde68a" },
  headerTitle: { fontWeight: 800, fontSize: 17 },
  chip: {
    background: "#fde68a",
    color: "#78350f",
    fontSize: 10,
    fontWeight: 900,
    padding: "2px 8px",
    borderRadius: 20,
    letterSpacing: "0.1em",
  },
  userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: {
    background: "rgba(255,255,255,.15)",
    border: "1px solid rgba(255,255,255,.3)",
    color: "#fff",
    borderRadius: 6,
    padding: "5px 12px",
    cursor: "pointer",
    fontSize: 12,
  },
  qrBar: {
    background: "#1e293b",
    color: "#fff",
    padding: "10px 24px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  qrLabel: { fontSize: 13, fontWeight: 700, color: "#94a3b8" },
  qrInput: {
    background: "#0f172a",
    border: "1px solid #334155",
    color: "#fff",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    width: 240,
    outline: "none",
  },
  qrBtn: {
    background: "#f59e0b",
    border: "none",
    color: "#000",
    borderRadius: 6,
    padding: "7px 16px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
  },
  qrResult: { fontSize: 13, color: "#86efac" },
  qrError: { fontSize: 13, color: "#fca5a5" },
  tabBar: {
    background: "#fff",
    borderBottom: "2px solid #e2e8f0",
    display: "flex",
    gap: 2,
    padding: "0 24px",
    overflowX: "auto",
  },
  tab: {
    background: "transparent",
    border: "none",
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: 13,
    color: "#64748b",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  tabActive: {
    background: "transparent",
    border: "none",
    borderBottom: "3px solid #d97706",
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: 13,
    color: "#92400e",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  h3: { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 },
  statCard: {
    background: "#fff",
    borderRadius: 12,
    padding: "20px",
    boxShadow: "0 1px 4px rgba(0,0,0,.08)",
    textAlign: "center",
  },
  formCard: {
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,.08)",
  },
  formRow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  formInput: {
    border: "1.5px solid #d1d5db",
    borderRadius: 7,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    minWidth: 160,
  },
  submitBtn: {
    background: "#d97706",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 18px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#1e293b", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid #f1f5f9" },
  trAlt: { background: "#f8fafc" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  loader: { color: "#94a3b8", padding: 20 },
  errBanner: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#991b1b",
    marginBottom: 12,
  },
  succBanner: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#166534",
    marginTop: 8,
  },
};
