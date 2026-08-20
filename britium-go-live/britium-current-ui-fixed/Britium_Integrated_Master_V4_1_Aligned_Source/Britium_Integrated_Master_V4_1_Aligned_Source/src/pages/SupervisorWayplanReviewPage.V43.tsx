// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Truck,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";

const BUILD_MARKER = "WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30";

type Row = Record<string, any>;

function text(value: any, fallback = "-") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function money(value: any) {
  return `${Number(value || 0).toLocaleString("en-US")} MMK`;
}

function dateTime(value: any) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", { timeZone: "Asia/Yangon" });
}

function requestedWayplan() {
  if (typeof window === "undefined") return "";
  const query = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(query).get("wayplan") || "";
}

function statusClass(status: string) {
  const normalized = text(status, "DRAFT");
  if (["APPROVED", "DISPATCH_READY", "DISPATCHED"].includes(normalized)) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  if (normalized === "PENDING_REVIEW") return "border-cyan-500/50 bg-cyan-500/10 text-cyan-300";
  if (normalized === "REJECTED") return "border-rose-500/50 bg-rose-500/10 text-rose-300";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

export default function SupervisorWayplanReviewPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [snapshot, setSnapshot] = useState<Row>({ stats: {}, wayplans: [] });
  const [selectedId, setSelectedId] = useState(requestedWayplan());
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const wayplans: Row[] = Array.isArray(snapshot.wayplans) ? snapshot.wayplans : [];
  const stats = snapshot.stats || {};
  const selected = useMemo(
    () => wayplans.find((item) => text(item.wayplan_id, "") === selectedId) || wayplans[0] || null,
    [wayplans, selectedId],
  );
  const stops: Row[] = Array.isArray(selected?.stops) ? selected.stops : [];
  const reviewStatus = text(selected?.review_status, "DRAFT");
  const canReview = Boolean(snapshot.can_review);
  const blockedCount = Number(selected?.blocked_count || 0);
  const codTotal = stops.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0);
  const weightTotal = stops.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setMessage(null);
    try {
      const { data, error } = await supabase.rpc("be_wayplan_supervisor_snapshot_v43", { p_wayplan_id: null });
      if (error) throw error;
      const next = Array.isArray(data) ? data[0] || {} : data || {};
      setSnapshot(next);
      const list = Array.isArray(next.wayplans) ? next.wayplans : [];
      setSelectedId((current) => {
        const requested = current || requestedWayplan();
        if (requested && list.some((item: Row) => text(item.wayplan_id, "") === requested)) return requested;
        return text(list[0]?.wayplan_id, "");
      });
    } catch (caught: any) {
      setMessage({ type: "error", text: caught?.message || "Could not load Supervisor Wayplan review data." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function actorEmail() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "supervisor@britiumexpress.com";
  }

  async function decide(decision: "APPROVE" | "REJECT", sendToDispatch = false) {
    if (!selected) return;
    if (!canReview) {
      setMessage({ type: "error", text: "Supervisor, Branch Admin, Operations Manager, Admin, or Super Admin authority is required." });
      return;
    }
    if (decision === "REJECT" && !notes.trim()) {
      setMessage({ type: "error", text: "Enter the correction reason before returning the Wayplan." });
      return;
    }

    const id = text(selected.wayplan_id, "");
    setBusy(sendToDispatch ? "approve-dispatch" : decision.toLowerCase());
    setMessage(null);
    try {
      const actor = await actorEmail();
      const { data, error } = await supabase.rpc("be_wayplan_supervisor_decide_v43", {
        p_wayplan_id: id,
        p_decision: decision,
        p_notes: notes.trim() || null,
        p_actor_email: actor,
      });
      if (error) throw error;

      if (decision === "APPROVE" && sendToDispatch) {
        const handoff = await supabase.rpc("be_wayplan_prepare_dispatch_v43", {
          p_wayplan_id: id,
          p_actor_email: actor,
        });
        if (handoff.error) throw handoff.error;
        setMessage({ type: "success", text: `${id} approved and sent to mandatory Dispatch scanning.` });
        await loadData(true);
        window.setTimeout(() => {
          window.location.hash = `#/dispatch-command?wayplan=${encodeURIComponent(id)}`;
        }, 500);
        return;
      }

      setMessage({
        type: "success",
        text: decision === "APPROVE" ? `${id} approved. It can now be sent to Dispatch.` : `${id} returned for correction.`,
      });
      setNotes("");
      await loadData(true);
    } catch (caught: any) {
      setMessage({ type: "error", text: caught?.message || "Supervisor decision failed." });
    } finally {
      setBusy("");
    }
  }

  async function prepareDispatch() {
    if (!selected) return;
    const id = text(selected.wayplan_id, "");
    setBusy("dispatch");
    setMessage(null);
    try {
      const actor = await actorEmail();
      const { data, error } = await supabase.rpc("be_wayplan_prepare_dispatch_v43", {
        p_wayplan_id: id,
        p_actor_email: actor,
      });
      if (error) throw error;
      setMessage({ type: "success", text: data?.message || `${id} is ready for mandatory Dispatch scanning.` });
      await loadData(true);
      window.setTimeout(() => {
        window.location.hash = `#/dispatch-command?wayplan=${encodeURIComponent(id)}`;
      }, 500);
    } catch (caught: any) {
      setMessage({ type: "error", text: caught?.message || "Could not send the approved Wayplan to Dispatch." });
    } finally {
      setBusy("");
    }
  }

  function openDispatch() {
    if (!selected) return;
    window.location.hash = `#/dispatch-command?wayplan=${encodeURIComponent(text(selected.wayplan_id, ""))}`;
  }

  if (loading && !wayplans.length) {
    return (
      <div className="min-h-[460px] rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-8 text-[#eef8ff]">
        <Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading Supervisor Wayplan review…
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 text-[#eef8ff]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a3a5c] pb-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">Supervisor Wayplan · {BUILD_MARKER}</div>
          <h1 className="mt-2 text-xl font-black">{t("Wayplan Approval & Dispatch Handoff", "Wayplan အတည်ပြုခြင်းနှင့် Dispatch လွှဲပြောင်းခြင်း")}</h1>
          <p className="mt-1 max-w-4xl text-xs text-[#9cc2d9]">
            Review the one-route-group manifest, Master Data assignments, parcel eligibility, COD exposure, and warehouse holds before mandatory Dispatch scanning.
          </p>
        </div>
        <button onClick={() => void loadData()} disabled={!!busy} className="rounded-xl border border-[#315f81] bg-[#061524] px-4 py-2 text-sm font-bold hover:border-[#f6b84b] disabled:opacity-50">
          <RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#9cc2d9]">
        <PackageCheck className="h-4 w-4 text-emerald-400" /> PLANNED
        <ChevronRight className="h-4 w-4" />
        <ShieldCheck className="h-4 w-4 text-cyan-300" /> PENDING REVIEW
        <ChevronRight className="h-4 w-4" />
        <UserRoundCheck className="h-4 w-4 text-emerald-300" /> APPROVED
        <ChevronRight className="h-4 w-4" />
        <Truck className="h-4 w-4 text-[#f6b84b]" /> MANDATORY DISPATCH SCAN
      </div>

      {message ? (
        <div className={`rounded-xl border p-3 text-sm ${message.type === "error" ? "border-rose-500/50 bg-rose-500/10 text-rose-200" : message.type === "success" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"}`}>
          {message.type === "error" ? <AlertTriangle className="mr-2 inline h-4 w-4" /> : <CheckCircle2 className="mr-2 inline h-4 w-4" />}{message.text}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Wayplans", stats.wayplans || 0, "text-[#f6b84b]"],
          ["Pending", stats.pending_review || 0, "text-cyan-300"],
          ["Approved", stats.approved || 0, "text-emerald-300"],
          ["Rejected", stats.rejected || 0, "text-rose-300"],
          ["Dispatch Ready", stats.dispatch_ready || 0, "text-violet-300"],
          ["Parcels", stats.parcels || 0, "text-white"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#7ea0b8]">{label}</div>
            <div className={`mt-1 text-2xl font-black ${tone}`}>{String(value)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-black">Review Queue</h2>
              <p className="text-xs text-[#7ea0b8]">Pending items are listed first.</p>
            </div>
            <Clock3 className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
            {wayplans.map((item) => {
              const id = text(item.wayplan_id, "");
              const active = id === text(selected?.wayplan_id, "");
              return (
                <button key={id} onClick={() => setSelectedId(id)} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-[#f6b84b] bg-[#102b45]" : "border-[#1a3a5c] bg-[#071827] hover:border-[#315f81]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-sm font-black text-[#f6b84b]">{id}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${statusClass(text(item.review_status, "DRAFT"))}`}>{text(item.review_status, "DRAFT")}</span>
                  </div>
                  <div className="mt-2 text-xs font-bold text-[#eef8ff]">{text(item.route_zone)} · {Number(item.parcel_count || 0)} parcels</div>
                  <div className="mt-1 text-[11px] text-[#7ea0b8]">{text(item.rider_name || item.rider_code)} · {text(item.vehicle_name || item.vehicle_code)}</div>
                  {Number(item.blocked_count || 0) > 0 ? <div className="mt-1 text-[10px] font-bold text-rose-300">Blocked parcels: {Number(item.blocked_count)}</div> : null}
                </button>
              );
            })}
            {!wayplans.length ? <div className="rounded-xl border border-dashed border-[#315f81] p-6 text-center text-sm text-[#7ea0b8]">No Wayplans have been created.</div> : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
          {!selected ? (
            <div className="p-10 text-center text-[#7ea0b8]">Select a Wayplan to review.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1a3a5c] pb-4">
                <div>
                  <div className="font-mono text-lg font-black text-[#f6b84b]">{text(selected.wayplan_id)}</div>
                  <div className="mt-1 text-sm text-[#9cc2d9]">{text(selected.route_zone)} · {Number(selected.parcel_count || 0)} parcels · Pickup {text(selected.pickup_id)}</div>
                  <div className="mt-1 text-[11px] text-[#7ea0b8]">Submitted {dateTime(selected.submitted_at)} by {text(selected.submitted_by)}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(reviewStatus)}`}>{reviewStatus}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCard icon={<Users className="h-4 w-4" />} label="Rider" value={`${text(selected.rider_name)} · ${text(selected.rider_code)}`} />
                <InfoCard icon={<Users className="h-4 w-4" />} label="Driver / Helper" value={`${text(selected.driver_name)} / ${text(selected.helper_name)}`} />
                <InfoCard icon={<Truck className="h-4 w-4" />} label="Vehicle" value={`${text(selected.vehicle_name)} · ${text(selected.vehicle_type)}`} />
                <InfoCard icon={<PackageCheck className="h-4 w-4" />} label="Exposure" value={`${money(codTotal)} · ${weightTotal.toLocaleString("en-US")} kg`} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Planned" value={selected.planned_count || 0} />
                <Metric label="Dispatch Ready" value={selected.ready_count || 0} />
                <Metric label="Dispatched" value={selected.dispatched_count || 0} />
                <Metric label="Blocked" value={selected.blocked_count || 0} danger={blockedCount > 0} />
              </div>

              <div>
                <label className="text-xs font-bold text-[#9cc2d9]">Supervisor notes / correction reason</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Approval notes are optional. A rejection/correction reason is required." className="mt-2 h-24 w-full resize-y rounded-xl border border-[#315f81] bg-[#071827] p-3 text-sm outline-none focus:border-[#f6b84b]" />
              </div>

              <div className="flex flex-wrap gap-2">
                {reviewStatus === "PENDING_REVIEW" ? (
                  <>
                    <button onClick={() => void decide("APPROVE")} disabled={!canReview || !!busy || blockedCount > 0} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black disabled:opacity-40">
                      {busy === "approve" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />}Approve
                    </button>
                    <button onClick={() => void decide("APPROVE", true)} disabled={!canReview || !!busy || blockedCount > 0} className="rounded-xl bg-[#f6b84b] px-4 py-2 text-sm font-black text-[#061524] disabled:opacity-40">
                      {busy === "approve-dispatch" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Send className="mr-2 inline h-4 w-4" />}Approve & Send to Dispatch
                    </button>
                    <button onClick={() => void decide("REJECT")} disabled={!canReview || !!busy} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black disabled:opacity-40">
                      {busy === "reject" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 inline h-4 w-4" />}Return for Correction
                    </button>
                  </>
                ) : null}
                {reviewStatus === "APPROVED" ? (
                  <button onClick={() => void prepareDispatch()} disabled={!!busy || blockedCount > 0} className="rounded-xl bg-[#f6b84b] px-4 py-2 text-sm font-black text-[#061524] disabled:opacity-40">
                    {busy === "dispatch" ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Truck className="mr-2 inline h-4 w-4" />}Send to Mandatory Dispatch Scan
                  </button>
                ) : null}
                {["DISPATCH_READY", "DISPATCHED"].includes(reviewStatus) ? (
                  <button onClick={openDispatch} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black"><Truck className="mr-2 inline h-4 w-4" />Open Dispatch Command</button>
                ) : null}
              </div>

              {!canReview ? <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />Signed-in role: {text(snapshot.actor_role, "unknown")}. Review actions require Supervisor or higher authority.</div> : null}
              {selected.rejection_reason ? <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"><XCircle className="mr-2 inline h-4 w-4" />Correction reason: {text(selected.rejection_reason)}</div> : null}

              <div className="overflow-auto rounded-xl border border-[#1a3a5c]">
                <table className="w-full min-w-[1050px] border-collapse text-xs">
                  <thead className="bg-[#102b45] text-[#9cc2d9]"><tr>{["Seq", "Way ID", "Recipient", "Phone", "Township", "Address", "COD", "Weight", "Warehouse", "Hold"].map((heading) => <th key={heading} className="p-2 text-left">{heading}</th>)}</tr></thead>
                  <tbody>
                    {stops.map((row, index) => (
                      <tr key={`${text(row.delivery_way_id)}-${index}`} className="border-t border-[#1a3a5c]">
                        <td className="p-2">{row.parcel_sequence || index + 1}</td>
                        <td className="p-2 font-mono font-black text-[#f6b84b]">{text(row.delivery_way_id)}</td>
                        <td className="p-2">{text(row.recipient_name)}</td>
                        <td className="p-2">{text(row.recipient_phone)}</td>
                        <td className="p-2">{text(row.township)}</td>
                        <td className="max-w-[280px] p-2 text-[#9cc2d9]"><MapPin className="mr-1 inline h-3 w-3" />{text(row.recipient_address)}</td>
                        <td className="p-2 text-right">{money(row.cod_amount)}</td>
                        <td className="p-2 text-right">{Number(row.weight_kg || 0).toLocaleString("en-US")} kg</td>
                        <td className="p-2">{text(row.warehouse_status)}</td>
                        <td className={`p-2 font-bold ${row.discrepancy_code || row.delivery_attempt_status === "RTO" ? "text-rose-300" : "text-emerald-300"}`}>{text(row.discrepancy_code || (row.delivery_attempt_status === "RTO" ? "RTO" : "CLEAR"))}</td>
                      </tr>
                    ))}
                    {!stops.length ? <tr><td colSpan={10} className="p-8 text-center text-[#7ea0b8]">No parcel membership found for this Wayplan.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: any) {
  return <div className="rounded-xl border border-[#1a3a5c] bg-[#071827] p-3"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#7ea0b8]">{icon}{label}</div><div className="mt-2 text-sm font-bold text-[#eef8ff]">{value}</div></div>;
}

function Metric({ label, value, danger = false }: any) {
  return <div className="rounded-xl border border-[#1a3a5c] bg-[#071827] p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-[#7ea0b8]">{label}</div><div className={`mt-1 text-xl font-black ${danger ? "text-rose-300" : "text-[#eef8ff]"}`}>{Number(value || 0)}</div></div>;
}
