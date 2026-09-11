// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const FINANCE_COD_V48_BUILD = "FINANCE_COD_V48_RECONCILIATION_2026-07-30";

type Row = Record<string, any>;

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#34d399",
  red: "#fb7185",
  orange: "#fb923c",
};

function text(value: any, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function amount(value: any) {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number.toLocaleString() : "0"} Ks`;
}

function dateTime(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function toLocalDateTime(value?: any) {
  const d = value ? new Date(value) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function operationId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function unwrap(data: any) {
  return Array.isArray(data) ? data[0] || {} : data || {};
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 42,
    borderRadius: 11,
    border: `1px solid ${C.border}`,
    background: C.bg,
    color: C.text,
    padding: "9px 11px",
    outline: "none",
    fontSize: 12,
  };
}

function buttonStyle(kind: "gold" | "green" | "blue" | "red" | "plain" = "plain"): React.CSSProperties {
  const map: any = {
    gold: { background: C.gold, color: C.bg, border: C.gold },
    green: { background: C.green, color: C.bg, border: C.green },
    blue: { background: C.blue, color: C.bg, border: C.blue },
    red: { background: "rgba(251,113,133,.12)", color: C.red, border: C.red },
    plain: { background: C.panel2, color: C.text, border: C.border },
  };
  const style = map[kind];
  return {
    border: `1px solid ${style.border}`,
    background: style.background,
    color: style.color,
    borderRadius: 11,
    padding: "9px 12px",
    minHeight: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
  };
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background: C.panel,
        borderRadius: 18,
        padding: 15,
        boxShadow: "0 12px 32px rgba(0,0,0,.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  const status = text(value, "UNKNOWN").toUpperCase();
  const color = status === "SETTLED"
    ? C.green
    : status === "READY_TO_SETTLE"
      ? C.blue
      : status === "ON_HOLD"
        ? C.red
        : status === "NOT_REQUIRED"
          ? C.sub
          : C.gold;
  return (
    <span style={{ border: `1px solid ${color}`, background: `${color}20`, color, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 950, whiteSpace: "nowrap" }}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Metric({ label, value, color = C.text }: { label: string; value: any; color?: string }) {
  return (
    <Card style={{ padding: 11 }}>
      <div style={{ color: C.sub, fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
      <div style={{ color, fontSize: 18, fontWeight: 950, marginTop: 4 }}>{value}</div>
    </Card>
  );
}

export default function CODSettlementPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [holdCodes, setHoldCodes] = useState<Row[]>([]);
  const [active, setActive] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [remittedAmount, setRemittedAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [remittanceReference, setRemittanceReference] = useState("");
  const [receiver, setReceiver] = useState("");
  const [receivedAt, setReceivedAt] = useState(toLocalDateTime());
  const [proofReference, setProofReference] = useState("");
  const [financeNote, setFinanceNote] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [holdCode, setHoldCode] = useState("SHORTAGE");
  const [holdNote, setHoldNote] = useState("");

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = text(row.settlement_status).toUpperCase();
      const statusOk = statusFilter === "ALL"
        || (statusFilter === "OPEN" && !["SETTLED", "NOT_REQUIRED", "VOID"].includes(status))
        || (statusFilter === "PENDING" && ["PENDING_REMITTANCE", "PENDING_PROOF"].includes(status))
        || (statusFilter === "READY" && status === "READY_TO_SETTLE")
        || (statusFilter === "HOLD" && status === "ON_HOLD")
        || (statusFilter === "SETTLED" && status === "SETTLED");
      const searchOk = !q || [
        row.delivery_way_id,
        row.wayplan_id,
        row.pickup_id,
        row.batch_waybill_no,
        row.rider_code,
        row.rider_name,
        row.driver_code,
        row.driver_name,
        row.recipient_name,
        row.recipient_phone,
        row.township,
        row.remittance_reference,
        row.settlement_reference,
      ].join(" ").toLowerCase().includes(q);
      return statusOk && searchOk;
    });
  }, [query, rows, statusFilter]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selected[text(row.delivery_way_id)]),
    [rows, selected],
  );
  const selectedReady = selectedRows.filter((row) => text(row.settlement_status).toUpperCase() === "READY_TO_SETTLE");

  async function loadData(showMessage = false) {
    setLoading(true);
    setError("");
    if (!showMessage) setMessage("");
    try {
      const [{ data: userData }, { data, error: rpcError }] = await Promise.all([
        supabase.auth.getUser(),
        (supabase as any).rpc("be_finance_cod_snapshot_v48", { p_status: "ALL", p_limit: 1000 }),
      ]);
      if (rpcError) throw rpcError;
      const payload = unwrap(data);
      if (payload?.ok === false) throw new Error(payload?.error || "Finance COD snapshot failed.");
      const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows(nextRows);
      setSummary(payload?.summary || {});
      setHoldCodes(Array.isArray(payload?.hold_codes) ? payload.hold_codes : []);
      if (!receiver) setReceiver(text(userData?.user?.email, "Finance"));
      if (active) {
        const refreshed = nextRows.find((row: Row) => row.delivery_way_id === active.delivery_way_id);
        setActive(refreshed || nextRows[0] || null);
      } else {
        setActive(nextRows[0] || null);
      }
      if (showMessage) setMessage(`Delivered COD queue synchronized. ${nextRows.length} record(s) loaded.`);
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(false); }, []);

  useEffect(() => {
    if (!active) return;
    setRemittedAmount(String(Number(active.rider_remittance || active.reported_collected || 0)));
    setPaymentMode(text(active.payment_mode, "CASH"));
    setRemittanceReference(text(active.remittance_reference));
    setProofReference(text(active.proof_reference));
    setReceivedAt(toLocalDateTime(active.remitted_at || new Date()));
    setFinanceNote(text(active.settlement_note || active.metadata?.remittance_note));
    setSettlementReference(text(active.settlement_reference));
    setHoldCode(text(active.hold_code, "SHORTAGE"));
    setHoldNote(text(active.hold_note));
  }, [active?.delivery_way_id]);

  function selectRow(row: Row) {
    setActive(row);
  }

  function toggleRow(row: Row) {
    const key = text(row.delivery_way_id);
    setSelected((previous) => ({ ...previous, [key]: !previous[key] }));
    setActive(row);
  }

  function toggleVisibleReady() {
    const ready = visibleRows.filter((row) => text(row.settlement_status).toUpperCase() === "READY_TO_SETTLE");
    const everySelected = ready.length > 0 && ready.every((row) => selected[text(row.delivery_way_id)]);
    const next = { ...selected };
    ready.forEach((row) => { next[text(row.delivery_way_id)] = !everySelected; });
    setSelected(next);
  }

  async function recordRemittance() {
    if (!active?.delivery_way_id) return setError("Select one delivered COD record first.");
    const numericAmount = Number(remittedAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return setError("Enter a valid remittance amount.");
    if (!remittanceReference.trim()) return setError("Remittance reference is required.");
    if (!receiver.trim()) return setError("Finance receiver is required.");

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_finance_cod_record_remittance_v48", {
        p_delivery_way_id: active.delivery_way_id,
        p_remitted_amount: numericAmount,
        p_payment_mode: paymentMode,
        p_reference: remittanceReference.trim(),
        p_receiver: receiver.trim(),
        p_received_at: new Date(receivedAt).toISOString(),
        p_proof_reference: proofReference.trim() || null,
        p_note: financeNote.trim() || null,
        p_operation_id: operationId("finance-remittance"),
      });
      if (rpcError) throw rpcError;
      const result = unwrap(data);
      setMessage(`Remittance recorded for ${active.delivery_way_id}. Status: ${text(result?.row?.settlement_status, "updated").replaceAll("_", " ")}.`);
      await loadData(false);
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function holdCurrent() {
    if (!active?.delivery_way_id) return setError("Select one COD record first.");
    if (!holdCode) return setError("Choose a hold reason.");
    if (!holdNote.trim()) return setError("Hold note is required.");

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { error: rpcError } = await (supabase as any).rpc("be_finance_cod_hold_v48", {
        p_delivery_way_id: active.delivery_way_id,
        p_hold_code: holdCode,
        p_note: holdNote.trim(),
        p_actor: receiver.trim() || null,
      });
      if (rpcError) throw rpcError;
      setMessage(`${active.delivery_way_id} placed on Finance hold.`);
      await loadData(false);
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function settleCurrent() {
    if (!active?.delivery_way_id) return setError("Select one COD record first.");
    if (text(active.settlement_status).toUpperCase() !== "READY_TO_SETTLE") return setError("Record exact remittance and proof before settling this COD record.");
    if (!settlementReference.trim()) return setError("Settlement reference is required.");
    if (!receiver.trim()) return setError("Settlement receiver is required.");

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { error: rpcError } = await (supabase as any).rpc("be_finance_cod_settle_v48", {
        p_delivery_way_id: active.delivery_way_id,
        p_settled_amount: Number(active.rider_remittance || 0),
        p_reference: settlementReference.trim(),
        p_receiver: receiver.trim(),
        p_settled_at: new Date().toISOString(),
        p_note: financeNote.trim() || null,
        p_operation_id: operationId("finance-settle"),
      });
      if (rpcError) throw rpcError;
      setMessage(`${active.delivery_way_id} settled successfully.`);
      await loadData(false);
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function settleBatch() {
    if (!selectedReady.length) return setError("Select at least one READY TO SETTLE row.");
    if (!settlementReference.trim()) return setError("Enter a batch settlement reference.");
    if (!receiver.trim()) return setError("Settlement receiver is required.");

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_finance_cod_settle_batch_v48", {
        p_delivery_way_ids: selectedReady.map((row) => row.delivery_way_id),
        p_batch_reference: settlementReference.trim(),
        p_receiver: receiver.trim(),
        p_note: financeNote.trim() || null,
        p_operation_id: operationId("finance-batch"),
      });
      if (rpcError) throw rpcError;
      const result = unwrap(data);
      setMessage(`Batch settlement completed: ${Number(result?.settled || 0)} settled, ${Number(result?.failed || 0)} failed.`);
      setSelected({});
      await loadData(false);
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const headers = [
      "delivery_way_id", "wayplan_id", "pickup_id", "rider_code", "rider_name",
      "recipient_name", "township", "expected_cod", "reported_collected", "rider_remittance",
      "variance_amount", "payment_mode", "proof_status", "settlement_status",
      "remittance_reference", "settlement_reference", "delivered_at", "remitted_at", "settled_at",
    ];
    const lines = [headers.join(","), ...visibleRows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finance-cod-v48-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 18 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: ".18em" }}>V48 FINANCE COD RECONCILIATION ACTIVE</div>
              <h1 style={{ margin: "7px 0 4px", fontSize: 24 }}>COD Settlement Center</h1>
              <div style={{ color: C.sub, fontSize: 12 }}>
                Delivered Rider V46 stops → remittance and proof review → variance hold or audited settlement.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button disabled={loading} onClick={() => void loadData(true)} style={buttonStyle("plain")}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync Delivered COD
              </button>
              <button disabled={loading || !selectedReady.length} onClick={() => void settleBatch()} style={buttonStyle("green")}>
                <WalletCards size={14} /> Settle Selected ({selectedReady.length})
              </button>
              <button onClick={exportCsv} style={buttonStyle("blue")}><Download size={14} /> Export CSV</button>
            </div>
          </div>
        </Card>

        {error ? <div style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.11)", color: C.red, borderRadius: 12, padding: 11, fontWeight: 850 }}>{error}</div> : null}
        {message ? <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,.11)", color: C.green, borderRadius: 12, padding: 11, fontWeight: 850 }}>{message}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10 }}>
          <Metric label="Delivered COD Rows" value={Number(summary.rows || rows.length).toLocaleString()} color={C.gold} />
          <Metric label="Pending" value={Number(summary.pending || 0).toLocaleString()} color={C.gold} />
          <Metric label="Ready" value={Number(summary.ready || 0).toLocaleString()} color={C.blue} />
          <Metric label="On Hold" value={Number(summary.on_hold || 0).toLocaleString()} color={C.red} />
          <Metric label="Settled" value={Number(summary.settled || 0).toLocaleString()} color={C.green} />
          <Metric label="Expected COD" value={amount(summary.expected_total)} color={C.gold} />
          <Metric label="Rider Remittance" value={amount(summary.remitted_total)} color={C.blue} />
          <Metric label="Settled Amount" value={amount(summary.settled_total)} color={C.green} />
        </div>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "180px minmax(220px,1fr) auto auto", gap: 9, alignItems: "center", marginBottom: 11 }}>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle()}>
              <option value="OPEN">Open Queue</option>
              <option value="PENDING">Pending Remittance / Proof</option>
              <option value="READY">Ready to Settle</option>
              <option value="HOLD">On Hold</option>
              <option value="SETTLED">Settled</option>
              <option value="ALL">All Records</option>
            </select>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: 13, color: C.sub }} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Way ID, Wayplan, Pickup, Rider, recipient or reference" style={{ ...inputStyle(), paddingLeft: 33 }} />
            </div>
            <button onClick={toggleVisibleReady} style={buttonStyle("plain")}>Select Ready Rows</button>
            <div style={{ color: C.sub, fontSize: 11 }}>Showing <b style={{ color: C.text }}>{visibleRows.length}</b> · Selected <b style={{ color: C.gold }}>{selectedRows.length}</b></div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 13 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1450 }}>
              <thead>
                <tr style={{ background: C.gold, color: C.bg, fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  <th style={{ padding: 9, textAlign: "left" }}>Select</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Way ID / Wayplan</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Rider / Driver</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Recipient</th>
                  <th style={{ padding: 9, textAlign: "right" }}>Expected</th>
                  <th style={{ padding: 9, textAlign: "right" }}>Collected</th>
                  <th style={{ padding: 9, textAlign: "right" }}>Remitted</th>
                  <th style={{ padding: 9, textAlign: "right" }}>Variance</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Payment</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Proof</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Status</th>
                  <th style={{ padding: 9, textAlign: "left" }}>Delivered</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length ? visibleRows.map((row) => {
                  const key = text(row.delivery_way_id);
                  const isActive = active?.delivery_way_id === row.delivery_way_id;
                  const variance = Number(row.variance_amount || 0);
                  return (
                    <tr key={key} onClick={() => selectRow(row)} style={{ borderTop: `1px solid ${C.border}`, background: isActive ? "rgba(246,184,75,.08)" : "transparent", cursor: "pointer" }}>
                      <td style={{ padding: 9 }} onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggleRow(row)} />
                      </td>
                      <td style={{ padding: 9 }}>
                        <div style={{ color: C.gold, fontWeight: 950 }}>{key}</div>
                        <div style={{ color: C.sub, fontSize: 10 }}>{text(row.wayplan_id, "-")} · {text(row.pickup_id, "-")}</div>
                      </td>
                      <td style={{ padding: 9 }}>
                        <div>{text(row.rider_code || row.driver_code, "-")}</div>
                        <div style={{ color: C.sub, fontSize: 10 }}>{text(row.rider_name || row.driver_name, "-")}</div>
                      </td>
                      <td style={{ padding: 9 }}>
                        <div>{text(row.recipient_name, "-")}</div>
                        <div style={{ color: C.sub, fontSize: 10 }}>{text(row.township, "-")} · {text(row.recipient_phone, "-")}</div>
                      </td>
                      <td style={{ padding: 9, textAlign: "right", color: C.gold, fontWeight: 900 }}>{amount(row.expected_cod)}</td>
                      <td style={{ padding: 9, textAlign: "right" }}>{amount(row.reported_collected)}</td>
                      <td style={{ padding: 9, textAlign: "right", color: C.blue, fontWeight: 900 }}>{amount(row.rider_remittance)}</td>
                      <td style={{ padding: 9, textAlign: "right", color: Math.abs(variance) > .01 ? C.red : C.green, fontWeight: 900 }}>{amount(variance)}</td>
                      <td style={{ padding: 9 }}>{text(row.payment_mode, "UNSPECIFIED")}</td>
                      <td style={{ padding: 9, color: row.proof_status === "MISSING" ? C.red : C.green }}>{text(row.proof_status, "MISSING")}</td>
                      <td style={{ padding: 9 }}><StatusBadge value={row.settlement_status} /></td>
                      <td style={{ padding: 9, fontSize: 10 }}>{dateTime(row.delivered_at)}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: C.sub }}>No delivered COD records match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(320px,.65fr)", gap: 12, alignItems: "start" }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".12em" }}>ACTIVE COD RECONCILIATION</div>
                <h2 style={{ margin: "5px 0 0", fontSize: 18 }}>{text(active?.delivery_way_id, "Select a delivered COD row")}</h2>
              </div>
              {active ? <StatusBadge value={active.settlement_status} /> : null}
            </div>

            {active ? <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginTop: 11 }}>
                <Info label="Expected COD" value={amount(active.expected_cod)} />
                <Info label="Reported Collected" value={amount(active.reported_collected)} />
                <Info label="Rider Remittance" value={amount(active.rider_remittance)} />
                <Info label="Variance" value={amount(active.variance_amount)} danger={Math.abs(Number(active.variance_amount || 0)) > .01} />
                <Info label="Payment Mode" value={text(active.payment_mode, "UNSPECIFIED")} />
                <Info label="Proof" value={`${text(active.proof_status, "MISSING")} · ${text(active.proof_reference, "No reference")}`} danger={active.proof_status === "MISSING"} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 12 }}>
                <Field label="Rider remittance amount">
                  <input type="number" min="0" value={remittedAmount} onChange={(event) => setRemittedAmount(event.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Payment mode">
                  <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} style={inputStyle()}>
                    <option value="CASH">Cash</option>
                    <option value="KBZPAY">KBZPay</option>
                    <option value="WAVEPAY">WavePay</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Remittance reference">
                  <input value={remittanceReference} onChange={(event) => setRemittanceReference(event.target.value)} placeholder="Cash slip, transfer or handover reference" style={inputStyle()} />
                </Field>
                <Field label="Finance receiver">
                  <input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder="Receiver name or email" style={inputStyle()} />
                </Field>
                <Field label="Received date/time">
                  <input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} style={inputStyle()} />
                </Field>
                <Field label="Delivery/payment proof reference">
                  <input value={proofReference} onChange={(event) => setProofReference(event.target.value)} placeholder="Proof URL, POD ID, OTP or receipt number" style={inputStyle()} />
                </Field>
                <Field label="Settlement reference">
                  <input value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} placeholder="Settlement batch or bank reference" style={inputStyle()} />
                </Field>
                <Field label="Finance note">
                  <input value={financeNote} onChange={(event) => setFinanceNote(event.target.value)} placeholder="Reconciliation note" style={inputStyle()} />
                </Field>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11 }}>
                <button disabled={loading} onClick={() => void recordRemittance()} style={buttonStyle("blue")}><Save size={14} /> Record Remittance</button>
                <button disabled={loading || text(active.settlement_status).toUpperCase() !== "READY_TO_SETTLE"} onClick={() => void settleCurrent()} style={buttonStyle("green")}><CheckCircle2 size={14} /> Post Settlement</button>
              </div>
            </> : <div style={{ color: C.sub, padding: "24px 0" }}>Choose a row from the settlement queue.</div>}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><ShieldAlert size={16} color={C.red} /><h2 style={{ margin: 0, fontSize: 16 }}>Variance Hold</h2></div>
            <div style={{ color: C.sub, fontSize: 11, marginTop: 5 }}>Shortage, overage, missing proof, payment mismatch and duplicate posting must remain open.</div>
            <div style={{ display: "grid", gap: 9, marginTop: 11 }}>
              <Field label="Hold reason">
                <select value={holdCode} onChange={(event) => setHoldCode(event.target.value)} style={inputStyle()}>
                  {(holdCodes.length ? holdCodes : [
                    { code: "SHORTAGE", label: "Shortage" },
                    { code: "OVERAGE", label: "Overage" },
                    { code: "MISSING_PROOF", label: "Missing proof" },
                    { code: "PAYMENT_MISMATCH", label: "Payment mismatch" },
                    { code: "DUPLICATE_POSTING", label: "Duplicate posting" },
                    { code: "OTHER", label: "Other" },
                  ]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Mandatory hold note">
                <textarea value={holdNote} onChange={(event) => setHoldNote(event.target.value)} placeholder="Explain the discrepancy and required next action" style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }} />
              </Field>
              <button disabled={loading || !active || active?.settlement_status === "SETTLED"} onClick={() => void holdCurrent()} style={buttonStyle("red")}><AlertTriangle size={14} /> Put on Finance Hold</button>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12, display: "grid", gap: 7 }}>
              <div style={{ display: "flex", gap: 7, alignItems: "center", color: C.green, fontWeight: 900, fontSize: 11 }}><FileCheck2 size={14} /> Settlement guard</div>
              <div style={{ color: C.sub, fontSize: 10, lineHeight: 1.6 }}>
                Posting is allowed only when expected COD equals Rider remittance, proof is present, the record is READY TO SETTLE, and a traceable reference and receiver are recorded.
              </div>
              <div style={{ color: C.orange, fontSize: 10, fontWeight: 850 }}><Banknote size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Direct unsupported overrides are not accepted.</div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.sub, fontSize: 10, fontWeight: 850 }}>{label}</span>{children}</label>;
}

function Info({ label, value, danger = false }: { label: string; value: any; danger?: boolean }) {
  return <div style={{ border: `1px solid ${danger ? C.red : C.border}`, background: C.panel2, borderRadius: 10, padding: 9 }}>
    <div style={{ color: C.sub, fontSize: 9, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    <div style={{ color: danger ? C.red : C.text, fontWeight: 900, fontSize: 12, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
  </div>;
}
