import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Headset,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const CUSTOMER_SERVICE_CLOSURE_V49_BUILD =
  "CUSTOMER_SERVICE_CLOSURE_V49_2026-07-30";

type JsonRow = Record<string, any>;
type Notice = { type: "success" | "error"; text: string } | null;

const FILTERS = ["OPEN", "READY", "CONTACTED", "HOLD", "CLOSED", "ALL"];
const CHANNELS = ["PHONE", "SMS", "VIBER", "MESSENGER", "EMAIL", "IN_PERSON", "OTHER"];
const DISPOSITIONS = [
  "DELIVERY_CONFIRMED",
  "RESCHEDULED",
  "RETURN_CONFIRMED",
  "CANCELLED",
  "CUSTOMER_UNREACHABLE",
  "RESOLVED",
  "OTHER",
];
const ESCALATION_OWNERS = ["OPERATIONS", "DISPATCH", "WAREHOUSE", "FINANCE", "SUPERVISOR", "CUSTOMER_SERVICE"];

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function money(value: unknown): string {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString()} MMK` : "0 MMK";
}

function dateTime(value: unknown): string {
  const raw = text(value);
  if (!raw) return "-";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}

function operationId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function actorEmail(): string {
  return (
    localStorage.getItem("be_user_email") ||
    localStorage.getItem("be_actor_email") ||
    "customer-service@britiumexpress.com"
  );
}

function statusClass(status: unknown): string {
  const current = text(status).toUpperCase();
  if (current === "CLOSED") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (current === "CONTACTED" || current === "READY_TO_CONTACT") return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  if (current === "ESCALATED" || current === "FINANCE_HOLD") return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

export default function CustomerClosureV49() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("OPEN");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<JsonRow[]>([]);
  const [summary, setSummary] = useState<JsonRow>({});
  const [selected, setSelected] = useState<JsonRow | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [channel, setChannel] = useState("PHONE");
  const [contactSummary, setContactSummary] = useState("");
  const [customerResponse, setCustomerResponse] = useState("");
  const [disposition, setDisposition] = useState("DELIVERY_CONFIRMED");
  const [resolutionReference, setResolutionReference] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationOwner, setEscalationOwner] = useState("OPERATIONS");

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      [
        row.delivery_way_id,
        row.wayplan_id,
        row.pickup_id,
        row.recipient_name,
        row.recipient_phone,
        row.township,
        row.delivery_status,
        row.finance_status,
        row.workflow_status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, rows]);

  async function loadData(nextFilter = filter, showSpinner = true) {
    if (showSpinner) setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await (supabase as any).rpc("be_cs_closure_snapshot_v49", {
        p_status: nextFilter,
        p_limit: 1000,
      });
      if (error) throw error;
      const response = (data || {}) as JsonRow;
      if (response.ok !== true) throw new Error(response.message || "Customer closure snapshot failed.");
      const nextRows = Array.isArray(response.rows) ? response.rows : [];
      setRows(nextRows);
      setSummary(response.summary || {});
      setSelected((current) => {
        if (!current) return nextRows[0] || null;
        return nextRows.find((row: JsonRow) => row.delivery_way_id === current.delivery_way_id) || nextRows[0] || null;
      });
    } catch (error: any) {
      setNotice({ type: "error", text: error?.message || "Unable to load customer closure queue." });
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (!selected) return;
    setChannel(text(selected.contact_channel) || "PHONE");
    setContactSummary(text(selected.contact_summary));
    setCustomerResponse(text(selected.customer_response));
    setDisposition(
      text(selected.next_disposition) ||
        (text(selected.delivery_status).toUpperCase() === "DELIVERED" ? "DELIVERY_CONFIRMED" : "RESCHEDULED"),
    );
    setResolutionReference(text(selected.operational_resolution_reference));
    setClosureNote(text(selected.closure_note));
    setEscalationReason(text(selected.escalation_reason));
    setEscalationOwner(text(selected.escalation_owner) || "OPERATIONS");
  }, [selected?.delivery_way_id]);

  async function recordContact() {
    if (!selected) return;
    if (!contactSummary.trim()) {
      setNotice({ type: "error", text: "Enter the customer communication summary." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await (supabase as any).rpc("be_cs_record_customer_contact_v49", {
        p_delivery_way_id: selected.delivery_way_id,
        p_channel: channel,
        p_contact_summary: contactSummary.trim(),
        p_customer_response: customerResponse.trim() || null,
        p_next_disposition: disposition || null,
        p_resolution_reference: resolutionReference.trim() || null,
        p_actor: actorEmail(),
        p_operation_id: operationId("cs-contact-v49"),
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(data?.message || "Contact recording failed.");
      setNotice({ type: "success", text: `${selected.delivery_way_id}: customer communication recorded.` });
      await loadData(filter, false);
    } catch (error: any) {
      setNotice({ type: "error", text: error?.message || "Unable to record customer contact." });
    } finally {
      setSaving(false);
    }
  }

  async function closeCommunication() {
    if (!selected) return;
    if (!closureNote.trim()) {
      setNotice({ type: "error", text: "Enter a closure note." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await (supabase as any).rpc("be_cs_close_communication_v49", {
        p_delivery_way_id: selected.delivery_way_id,
        p_closure_note: closureNote.trim(),
        p_actor: actorEmail(),
        p_operation_id: operationId("cs-close-v49"),
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(data?.message || "Communication closure failed.");
      setNotice({ type: "success", text: `${selected.delivery_way_id}: communication closed with audit evidence.` });
      await loadData(filter, false);
    } catch (error: any) {
      setNotice({ type: "error", text: error?.message || "Unable to close communication." });
    } finally {
      setSaving(false);
    }
  }

  async function escalateClosure() {
    if (!selected) return;
    if (!escalationReason.trim()) {
      setNotice({ type: "error", text: "Enter an escalation reason." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await (supabase as any).rpc("be_cs_escalate_closure_v49", {
        p_delivery_way_id: selected.delivery_way_id,
        p_reason: escalationReason.trim(),
        p_owner: escalationOwner,
        p_actor: actorEmail(),
        p_operation_id: operationId("cs-escalate-v49"),
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(data?.message || "Escalation failed.");
      setNotice({ type: "success", text: `${selected.delivery_way_id}: escalated to ${escalationOwner}.` });
      await loadData(filter, false);
    } catch (error: any) {
      setNotice({ type: "error", text: error?.message || "Unable to escalate closure." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-[#1a3a5c] bg-[#071b2c] p-5 shadow-xl" data-build={CUSTOMER_SERVICE_CLOSURE_V49_BUILD}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">
            <Headset size={15} /> Step 12 · Customer communication closure · V49
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">Delivery Outcome → Customer Contact → Closure</h2>
          <p className="mt-1 max-w-4xl text-sm text-[#7ca5c3]">
            Close only after delivery proof and COD settlement are clear. Failed, RTO, or cancelled outcomes require a next disposition and operational resolution reference.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void loadData(filter)}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#123456] px-4 py-3 text-xs font-black text-white disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Sync Outcomes
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {[
          ["Rows", summary.rows || 0],
          ["Ready", summary.ready_to_contact || 0],
          ["Contacted", summary.contacted || 0],
          ["Waiting Finance", summary.waiting_finance || 0],
          ["Finance Hold", summary.finance_hold || 0],
          ["Escalated", summary.escalated || 0],
          ["Closed", summary.closed || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-3">
            <div className="text-[10px] font-bold uppercase text-[#5f86a5]">{label}</div>
            <div className="mt-1 text-xl font-black text-white">{String(value)}</div>
          </div>
        ))}
      </div>

      {notice && (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${notice.type === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
          {notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#061524]">
          <div className="flex flex-col gap-3 border-b border-[#1a3a5c] bg-[#081b2e] p-4 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase ${filter === item ? "border-[#f6b84b] bg-[#f6b84b] text-[#061524]" : "border-[#1a3a5c] bg-[#061524] text-[#7ca5c3]"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-[#4d7a9b]" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Way ID, Wayplan, Pickup, recipient, phone..."
                className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-2.5 pl-10 pr-3 text-sm text-white"
              />
            </div>
          </div>

          <div className="max-h-[620px] overflow-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#081b2e] text-[10px] uppercase text-[#5f86a5]">
                <tr>
                  {["Way ID", "Recipient", "Outcome", "Finance", "Proof", "Workflow", "Updated"].map((heading) => (
                    <th key={heading} className="border-b border-[#1a3a5c] p-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.delivery_way_id}
                    onClick={() => setSelected(row)}
                    className={`cursor-pointer border-b border-[#1a3a5c]/60 ${selected?.delivery_way_id === row.delivery_way_id ? "bg-[#123456]" : "hover:bg-[#0b2236]"}`}
                  >
                    <td className="p-3">
                      <div className="font-mono font-black text-[#f6b84b]">{row.delivery_way_id}</div>
                      <div className="text-[10px] text-[#5f86a5]">{row.wayplan_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-white">{row.recipient_name || "-"}</div>
                      <div className="text-xs text-[#7ca5c3]">{row.recipient_phone || row.township || "-"}</div>
                    </td>
                    <td className="p-3 font-bold text-white">{row.delivery_status}</td>
                    <td className="p-3">
                      <div className="text-[#c8dff0]">{row.finance_status}</div>
                      <div className="text-[10px] text-[#5f86a5]">{money(row.expected_cod)}</div>
                    </td>
                    <td className="p-3 text-[#c8dff0]">{row.proof_status}</td>
                    <td className="p-3">
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${statusClass(row.workflow_status)}`}>
                        {row.workflow_status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-[#7ca5c3]">{dateTime(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filteredRows.length === 0 && (
              <div className="p-10 text-center text-sm text-[#6f96b4]">No final delivery outcomes are ready for this filter.</div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
          {!selected ? (
            <div className="flex min-h-[400px] items-center justify-center text-center text-sm text-[#6f96b4]">Select a delivery outcome.</div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-black text-[#f6b84b]">{selected.delivery_way_id}</div>
                    <div className="mt-1 text-sm font-bold text-white">{selected.recipient_name || "Recipient"}</div>
                    <div className="text-xs text-[#7ca5c3]">{selected.recipient_phone || "-"} · {selected.township || "-"}</div>
                  </div>
                  <span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${statusClass(selected.workflow_status)}`}>{selected.workflow_status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <Info label="Delivery" value={selected.delivery_status} icon={<CheckCircle2 size={14} />} />
                  <Info label="Finance" value={selected.finance_status} icon={<CircleDollarSign size={14} />} />
                  <Info label="Proof" value={selected.proof_status} icon={<ShieldAlert size={14} />} />
                  <Info label="Outcome time" value={dateTime(selected.delivered_at)} icon={<Clock3 size={14} />} />
                </div>
              </div>

              <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
                <h3 className="flex items-center gap-2 font-black text-white"><MessageSquareText size={17} className="text-[#38bdf8]" /> Record Customer Communication</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white">
                    {CHANNELS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select value={disposition} onChange={(event) => setDisposition(event.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white">
                    {DISPOSITIONS.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <textarea value={contactSummary} onChange={(event) => setContactSummary(event.target.value)} rows={3} placeholder="What was communicated to the customer?" className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white" />
                <textarea value={customerResponse} onChange={(event) => setCustomerResponse(event.target.value)} rows={2} placeholder="Customer response" className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white" />
                <input value={resolutionReference} onChange={(event) => setResolutionReference(event.target.value)} placeholder="Operational resolution reference (required for failed/RTO/cancelled)" className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm text-white" />
                <button type="button" disabled={saving || selected.workflow_status === "CLOSED"} onClick={() => void recordContact()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#38bdf8] px-4 py-3 text-sm font-black text-[#061524] disabled:opacity-40">
                  {saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Save Contact
                </button>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <h3 className="flex items-center gap-2 font-black text-emerald-300"><CheckCircle2 size={17} /> Close Communication</h3>
                <textarea value={closureNote} onChange={(event) => setClosureNote(event.target.value)} rows={2} placeholder="Closure note and final customer outcome" className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white" />
                <button type="button" disabled={saving || selected.workflow_status === "CLOSED"} onClick={() => void closeCommunication()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-[#061524] disabled:opacity-40">
                  <CheckCircle2 size={17} /> Close with Evidence
                </button>
              </div>

              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
                <h3 className="flex items-center gap-2 font-black text-rose-300"><XCircle size={17} /> Escalate Unresolved Obligation</h3>
                <select value={escalationOwner} onChange={(event) => setEscalationOwner(event.target.value)} className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white">
                  {ESCALATION_OWNERS.map((item) => <option key={item}>{item}</option>)}
                </select>
                <textarea value={escalationReason} onChange={(event) => setEscalationReason(event.target.value)} rows={2} placeholder="Why can this communication not be closed?" className="mt-3 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm text-white" />
                <button type="button" disabled={saving || selected.workflow_status === "CLOSED"} onClick={() => void escalateClosure()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-400 px-4 py-3 text-sm font-black text-[#061524] disabled:opacity-40">
                  <AlertTriangle size={17} /> Escalate
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-[#5f86a5]">{icon}{label}</div>
      <div className="mt-1 break-words font-bold text-white">{value || "-"}</div>
    </div>
  );
}
