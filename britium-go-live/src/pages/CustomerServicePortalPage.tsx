import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Headphones,
  History,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  acknowledgeCustomerVoice,
  closeCustomerVoice,
  confirmCustomerVoice,
  createCustomerVoice,
  escalateCustomerVoice,
  loadCustomerServiceParcels,
  loadCustomerVoiceHistory,
  markCustomerVoiceSeen,
  reopenCustomerVoice,
  resolveCustomerVoice,
  superadminOverrideCustomerVoiceRoute,
  updateCustomerVoiceAction,
} from "@/customerService/customerVoiceApi";
import {
  customerVoiceDepartmentLabel,
  customerVoicePriorityLabel,
  customerVoiceStatusLabel,
} from "@/customerService/customerVoiceRouting";
import type {
  CustomerServiceParcelQueue,
  CustomerServiceParcelRow,
  CustomerVoiceDepartment,
  CustomerVoiceHistory,
  CustomerVoiceIssueType,
  CustomerVoicePriority,
  CustomerVoiceSourceChannel,
  CustomerVoiceWorkflowStatus,
} from "@/customerService/customerVoiceTypes";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#0e2a42",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  green: "#34d399",
  red: "#f87171",
  blue: "#60a5fa",
  amber: "#fbbf24",
};

const ISSUE_TYPES: CustomerVoiceIssueType[] = [
  "INQUIRY","REQUEST","COMPLAINT","REDELIVERY","ADDRESS_CORRECTION",
  "LOCATION_CORRECTION","COD_ISSUE","PAYMENT_ISSUE","PARCEL_MISSING",
  "WAREHOUSE_ISSUE","RIDER_ISSUE","PICKUP_ISSUE","OTHER",
];
const CHANNELS: CustomerVoiceSourceChannel[] = ["PHONE","VIBER","MESSENGER","WALK_IN","EMAIL","OTHER"];
const PRIORITIES: CustomerVoicePriority[] = ["low","medium","high","urgent"];
const DEPARTMENTS: CustomerVoiceDepartment[] = ["operations","data_entry","warehouse","finance","pickup_supervisor"];

function safe(v: unknown, fallback = "-") {
  const out = String(v ?? "").trim();
  return out || fallback;
}

function money(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? `${n.toLocaleString()} Ks` : safe(v);
}

function dateText(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

function statusColor(status?: string | null) {
  const value = String(status || "").toUpperCase();
  if (["RESOLVED","CS_CONFIRMED","CLOSED","DELIVERED"].includes(value)) return C.green;
  if (["ESCALATED","URGENT","FAILED","EXCEPTION"].some((x) => value.includes(x))) return C.red;
  if (["ACKNOWLEDGED","IN_PROGRESS","ACTION_TAKEN","ROUTED"].includes(value)) return C.amber;
  return C.blue;
}

export default function CustomerServicePortalPage() {
  const [queue, setQueue] = useState<CustomerServiceParcelQueue>({
    ok: true,
    summary: { total_records: 0, open_voices: 0, escalated: 0, urgent: 0 },
    rows: [],
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedParcel, setSelectedParcel] = useState<CustomerServiceParcelRow | null>(null);
  const [history, setHistory] = useState<CustomerVoiceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [issueType, setIssueType] = useState<CustomerVoiceIssueType>("INQUIRY");
  const [sourceChannel, setSourceChannel] = useState<CustomerVoiceSourceChannel>("PHONE");
  const [priority, setPriority] = useState<CustomerVoicePriority>("medium");
  const [voiceText, setVoiceText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [escalationReason, setEscalationReason] = useState("");
  const [requestedDepartment, setRequestedDepartment] = useState<CustomerVoiceDepartment | "">("");
  const [overrideDepartment, setOverrideDepartment] = useState<CustomerVoiceDepartment>("operations");
  const [overrideReason, setOverrideReason] = useState("");

  async function load(search = query) {
    setLoading(true);
    setError("");
    try {
      const result = await loadCustomerServiceParcels(search);
      setQueue(result);
      if (selectedParcel) {
        const refreshed = result.rows.find((r) => r.delivery_way_id === selectedParcel.delivery_way_id);
        if (refreshed) setSelectedParcel(refreshed);
      }
    } catch (e: any) {
      setError(e?.message || "Could not load Customer Service parcel queue.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(row: CustomerServiceParcelRow) {
    setHistoryLoading(true);
    setError("");
    try {
      const result = await loadCustomerVoiceHistory(row.delivery_way_id);
      setHistory(result);
    } catch (e: any) {
      setError(e?.message || "Could not load Customer Voice history.");
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { void load(""); }, []);

  async function openParcel(row: CustomerServiceParcelRow) {
    setSelectedParcel(row);
    setNotice("");
    setActionNote("");
    setEscalationReason("");
    setOverrideReason("");
    await loadHistory(row);
  }

  async function refreshSelected() {
    if (!selectedParcel) return;
    await Promise.all([load(query), loadHistory(selectedParcel)]);
  }

  const activeVoice = history?.voices?.[0] || null;
  const actionHistory = useMemo(() => {
    const actions = (history?.voices || []).flatMap((voice) =>
      (voice.actions || []).map((action) => ({ ...action, voiceId: voice.id }))
    );
    return actions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [history]);

  async function submitCustomerVoice() {
    if (!selectedParcel || !voiceText.trim()) {
      setError("Enter the customer voice / instruction before submitting.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${selectedParcel.delivery_way_id}-${Date.now()}`;
      const result = await createCustomerVoice({
        deliveryWayId: selectedParcel.delivery_way_id,
        pickupId: selectedParcel.pickup_id,
        customerName: selectedParcel.recipient_name,
        customerPhone: selectedParcel.recipient_phone,
        sourceChannel,
        issueType,
        priority,
        customerVoiceText: voiceText.trim(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        idempotencyKey,
      });
      setVoiceText(""); setDueAt("");
      setNotice(`Customer Voice saved and automatically routed to ${customerVoiceDepartmentLabel(result.route)}.`);
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || "Could not create Customer Voice.");
    } finally { setBusy(false); }
  }

  async function runTransition(label: string, fn: () => Promise<unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      await fn();
      setActionNote("");
      setNotice(`${label} completed.`);
      await refreshSelected();
    } catch (e: any) {
      setError(e?.message || `${label} failed.`);
    } finally { setBusy(false); }
  }

  async function escalate() {
    if (!activeVoice || !escalationReason.trim()) { setError("Enter an escalation reason."); return; }
    await runTransition("Escalation", () => escalateCustomerVoice(activeVoice.id, escalationReason.trim(), requestedDepartment || null));
    setEscalationReason("");
  }

  async function overrideRoute() {
    if (!activeVoice || !overrideReason.trim()) { setError("Superadmin override requires a reason."); return; }
    await runTransition("Superadmin Override", () => superadminOverrideCustomerVoiceRoute(activeVoice.id, overrideDepartment, overrideReason.trim()));
    setOverrideReason("");
  }

  const s = queue.summary;

  return (
    <main data-be-page="cs-portal-v41" style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.2em", fontSize: 12 }}>CUSTOMER SERVICE • PARCEL SUPPORT</div>
        <h1 style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}><Headphones size={22}/> Customer Service Portal</h1>
        <p style={{ color: C.sub, margin: 0 }}>Live parcel lifecycle, customer voices, automatic routing, acknowledgement and resolution tracking.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => void load()} disabled={loading} style={{ background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}><RefreshCw size={15}/> {loading ? "Loading..." : "Refresh"}</button>
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: C.sub }}/>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(query); }} placeholder="Search Way ID, pickup, customer, phone, township, rider..." style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}/>
          </div>
          <button onClick={() => void load(query)} disabled={loading} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text, borderRadius: 12, padding: "10px 16px", cursor: "pointer" }}>Search</button>
        </div>
      </section>

      {error && <div style={{ color: C.red, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: C.green, border: `1px solid ${C.green}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>{notice}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        {[["Total Parcels",s.total_records],["Open Voices",s.open_voices],["Escalated",s.escalated],["Urgent",s.urgent]].map(([label,value]) => (
          <div key={String(label)} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}><div style={{ color: C.sub, fontSize: 12 }}>{label}</div><strong style={{ color: C.gold, fontSize: 22 }}>{value}</strong></div>
        ))}
      </section>

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1450, borderCollapse: "collapse" }}>
          <thead><tr style={{ background: C.gold, color: C.bg }}>
            {["Waybill / Delivery Way ID","Status","Recipient","Phone","Township","Rider / Assignment","Open Voices","Current Owner","Latest Customer Voice","Escalation","Action"].map((h) => <th key={h} style={{ padding: 10, textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>{queue.rows.map((row) => (
            <tr key={row.delivery_way_id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 10, color: C.gold, fontWeight: 900 }}>{safe(row.waybill_no || row.delivery_way_id)}</td>
              <td style={{ padding: 10 }}><strong style={{ color: statusColor(row.parcel_status || row.operation_status) }}>{safe(row.parcel_status || row.operation_status)}</strong><div style={{ color: C.sub, fontSize: 11 }}>WH: {safe(row.warehouse_status)} • FIN: {safe(row.finance_status)}</div></td>
              <td style={{ padding: 10 }}>{safe(row.recipient_name)}</td>
              <td style={{ padding: 10 }}>{safe(row.recipient_phone)}</td>
              <td style={{ padding: 10 }}>{safe(row.township)}</td>
              <td style={{ padding: 10 }}>{safe(row.assigned_rider_code)} / {safe(row.assigned_rider_name)}<div style={{ color: C.sub, fontSize: 11 }}>{safe(row.vehicle_plate)} • {safe(row.wayplan_id)}</div></td>
              <td style={{ padding: 10, fontWeight: 900 }}>{row.open_voice_count || 0}</td>
              <td style={{ padding: 10 }}>{customerVoiceDepartmentLabel(row.current_owner_department)}</td>
              <td style={{ padding: 10, maxWidth: 300 }}>{safe(row.latest_customer_voice)}</td>
              <td style={{ padding: 10, color: row.escalation_flag ? C.red : C.sub }}>{row.escalation_flag ? "ESCALATED" : "-"}</td>
              <td style={{ padding: 10 }}><button onClick={() => void openParcel(row)} style={{ border: `1px solid ${C.blue}`, background: "transparent", color: C.blue, borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>Open Parcel</button></td>
            </tr>
          ))}</tbody>
        </table>
        {!loading && queue.rows.length === 0 && <div style={{ color: C.sub, padding: 24, textAlign: "center" }}>No authorized parcel records found.</div>}
      </section>

      {selectedParcel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => setSelectedParcel(null)}>
          <aside onClick={(e) => e.stopPropagation()} style={{ width: "min(920px,96vw)", height: "100vh", overflowY: "auto", background: C.bg, borderLeft: `1px solid ${C.border}`, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div><div style={{ color: C.gold, fontSize: 12, fontWeight: 900 }}>PARCEL SUPPORT RECORD</div><h2 style={{ margin: "4px 0" }}>{selectedParcel.delivery_way_id}</h2></div>
              <button onClick={() => setSelectedParcel(null)} style={{ background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8 }}><X size={18}/></button>
            </div>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Parcel Summary</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, color: C.sub }}>
                <div><strong style={{ color: C.text }}>Recipient</strong><br/>{safe(selectedParcel.recipient_name)}<br/>{safe(selectedParcel.recipient_phone)}</div>
                <div><strong style={{ color: C.text }}>Location</strong><br/>{safe(selectedParcel.township)} / {safe(selectedParcel.ward)}<br/>{safe(selectedParcel.delivery_address)}</div>
                <div><strong style={{ color: C.text }}>Delivery</strong><br/>{safe(selectedParcel.parcel_status)}<br/>{safe(selectedParcel.operation_status)}</div>
                <div><strong style={{ color: C.text }}>Rider</strong><br/>{safe(selectedParcel.assigned_rider_code)} / {safe(selectedParcel.assigned_rider_name)}<br/>{safe(selectedParcel.vehicle_plate)}</div>
                <div><strong style={{ color: C.text }}>Finance / COD</strong><br/>{safe(selectedParcel.finance_status)}<br/>{money(selectedParcel.cod_amount)}</div>
                <div><strong style={{ color: C.text }}>Current Owner</strong><br/>{customerVoiceDepartmentLabel(selectedParcel.current_owner_department)}<br/>Open Voices: {selectedParcel.open_voice_count || 0}</div>
              </div>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}><History size={17}/> Status Timeline</h3>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ background: C.panel2, borderRadius: 10, padding: 10 }}><strong>Parcel</strong> — {safe(selectedParcel.parcel_status)} <span style={{ color: C.sub }}>{dateText(selectedParcel.updated_at)}</span></div>
                <div style={{ background: C.panel2, borderRadius: 10, padding: 10 }}><strong>Warehouse</strong> — {safe(selectedParcel.latest_warehouse_event || selectedParcel.warehouse_status)} <span style={{ color: C.sub }}>{dateText(selectedParcel.latest_warehouse_event_at)}</span><div style={{ color: C.sub }}>{safe(selectedParcel.latest_warehouse_note)}</div></div>
                <div style={{ background: C.panel2, borderRadius: 10, padding: 10 }}><strong>Operations</strong> — {safe(selectedParcel.latest_operation_event || selectedParcel.operation_status)} <span style={{ color: C.sub }}>{dateText(selectedParcel.latest_operation_event_at)}</span><div style={{ color: C.sub }}>{safe(selectedParcel.latest_operation_note)}</div></div>
                <div style={{ background: C.panel2, borderRadius: 10, padding: 10 }}><strong>Waybill Event</strong> — {safe(selectedParcel.latest_status_event_name || selectedParcel.latest_status_event_code)} <span style={{ color: C.sub }}>{dateText(selectedParcel.latest_status_event_at)}</span></div>
              </div>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0 }}><MessageSquarePlus size={17}/> Add Customer Voice</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
                <select value={issueType} onChange={(e) => setIssueType(e.target.value as CustomerVoiceIssueType)} style={fieldStyle}>{ISSUE_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
                <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value as CustomerVoiceSourceChannel)} style={fieldStyle}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select>
                <select value={priority} onChange={(e) => setPriority(e.target.value as CustomerVoicePriority)} style={fieldStyle}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
                <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={fieldStyle}/>
              </div>
              <textarea rows={4} value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="Customer complaint, request, address correction, redelivery instruction, COD concern..." style={{ ...fieldStyle, width: "100%", marginTop: 8, resize: "vertical" }}/>
              <button disabled={busy || !voiceText.trim()} onClick={() => void submitCustomerVoice()} style={primaryButton}><Send size={15}/> Save & Auto-route</button>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Customer Voices</h3>
              {historyLoading && <div style={{ color: C.sub }}>Loading Customer Voice history...</div>}
              {!historyLoading && (history?.voices || []).length === 0 && <div style={{ color: C.sub }}>No Customer Voice has been recorded for this parcel.</div>}
              <div style={{ display: "grid", gap: 10 }}>{(history?.voices || []).map((voice) => (
                <div key={voice.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>{voice.issue_type}</strong><span style={{ color: statusColor(voice.workflow_status), fontWeight: 900 }}>{customerVoiceStatusLabel(voice.workflow_status)}</span></div>
                  <div style={{ marginTop: 6 }}>{voice.customer_voice_text}</div>
                  <div style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>{dateText(voice.created_at)} • {voice.source_channel} • {customerVoicePriorityLabel(voice.priority)} • Current Owner: {customerVoiceDepartmentLabel(voice.current_department)}</div>
                </div>
              ))}</div>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Internal Action History</h3>
              <div style={{ display: "grid", gap: 8 }}>{actionHistory.map((action) => (
                <div key={`${action.voiceId}-${action.id}`} style={{ borderLeft: `3px solid ${statusColor(action.resulting_status)}`, background: C.panel2, borderRadius: 8, padding: 10 }}><strong>{action.action_type}</strong> <span style={{ color: C.sub }}>{dateText(action.created_at)}</span><div>{safe(action.action_note)}</div><div style={{ color: C.sub, fontSize: 12 }}>{customerVoiceDepartmentLabel(action.department)} • {safe(action.actor_role)}</div></div>
              ))}</div>
            </section>

            {activeVoice && <>
              <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <h3 style={{ marginTop: 0 }}>Formal Process Actions</h3>
                <textarea rows={2} value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Action / resolution note" style={{ ...fieldStyle, width: "100%", resize: "vertical" }}/>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button disabled={busy} onClick={() => void runTransition("Seen", () => markCustomerVoiceSeen(activeVoice.id))} style={secondaryButton}>Seen</button>
                  <button disabled={busy} onClick={() => void runTransition("Acknowledgement", () => acknowledgeCustomerVoice(activeVoice.id, actionNote || undefined))} style={secondaryButton}>Acknowledge</button>
                  <button disabled={busy || !actionNote.trim()} onClick={() => void runTransition("In Progress", () => updateCustomerVoiceAction(activeVoice.id, actionNote.trim(), "IN_PROGRESS"))} style={secondaryButton}>In Progress</button>
                  <button disabled={busy || !actionNote.trim()} onClick={() => void runTransition("Action Taken", () => updateCustomerVoiceAction(activeVoice.id, actionNote.trim(), "ACTION_TAKEN"))} style={secondaryButton}>Action Taken</button>
                  <button disabled={busy || !actionNote.trim()} onClick={() => void runTransition("Resolution", () => resolveCustomerVoice(activeVoice.id, actionNote.trim()))} style={secondaryButton}>Resolve</button>
                  <button disabled={busy} onClick={() => void runTransition("CS Confirmation", () => confirmCustomerVoice(activeVoice.id, actionNote || undefined))} style={secondaryButton}>CS Confirm</button>
                  <button disabled={busy} onClick={() => void runTransition("Closure", () => closeCustomerVoice(activeVoice.id, actionNote || undefined))} style={secondaryButton}>Close</button>
                  <button disabled={busy || !actionNote.trim()} onClick={() => void runTransition("Reopen", () => reopenCustomerVoice(activeVoice.id, actionNote.trim()))} style={secondaryButton}>Reopen</button>
                </div>
              </section>

              <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <h3 style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 0 }}><AlertTriangle size={17}/> Escalate</h3>
                <p style={{ color: C.sub }}>Escalation requests a routing review but does not change the current department.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 8 }}><input value={escalationReason} onChange={(e) => setEscalationReason(e.target.value)} placeholder="Reason for escalation" style={fieldStyle}/><select value={requestedDepartment} onChange={(e) => setRequestedDepartment(e.target.value as CustomerVoiceDepartment | "")} style={fieldStyle}><option value="">No department requested</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{customerVoiceDepartmentLabel(d)}</option>)}</select></div>
                <button disabled={busy || !escalationReason.trim()} onClick={() => void escalate()} style={{ ...secondaryButton, marginTop: 8, borderColor: C.amber, color: C.amber }}>Escalate for Review</button>
              </section>

              <section style={{ background: "rgba(248,113,113,.07)", border: `1px solid ${C.red}`, borderRadius: 16, padding: 14, marginTop: 14 }}>
                <h3 style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 0, color: C.red }}><ShieldAlert size={17}/> Superadmin Override</h3>
                <p style={{ color: C.sub }}>Only Superadmin may override the automatically selected department. A mandatory reason is permanently audited.</p>
                <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8 }}><select value={overrideDepartment} onChange={(e) => setOverrideDepartment(e.target.value as CustomerVoiceDepartment)} style={fieldStyle}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{customerVoiceDepartmentLabel(d)}</option>)}</select><input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Mandatory override reason" style={fieldStyle}/></div>
                <button disabled={busy || !overrideReason.trim()} onClick={() => void overrideRoute()} style={{ ...secondaryButton, marginTop: 8, borderColor: C.red, color: C.red }}>Apply Superadmin Override</button>
              </section>
            </>}
          </aside>
        </div>
      )}
    </main>
  );
}

const fieldStyle: React.CSSProperties = { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 10px" };
const primaryButton: React.CSSProperties = { marginTop: 8, display: "inline-flex", alignItems: "center", gap: 7, background: C.gold, color: C.bg, border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 900, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 9, padding: "8px 10px", fontWeight: 800, cursor: "pointer" };
