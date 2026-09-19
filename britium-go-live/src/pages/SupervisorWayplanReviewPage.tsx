import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Send, ShieldCheck, Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

type Wayplan = {
  wayplan_id: string;
  route_zone?: string;
  parcel_count?: number;
  planned_count?: number;
  ready_count?: number;
  dispatched_count?: number;
  blocked_count?: number;
  vehicle_code?: string;
  vehicle_name?: string;
  driver_code?: string;
  driver_name?: string;
  rider_code?: string;
  rider_name?: string;
  helper_code?: string;
  helper_name?: string;
  review_status?: string;
  revision_no?: number;
  review_notes?: string;
  rejection_reason?: string;
  stops?: any[];
};

export default function SupervisorWayplanReviewPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>({ wayplans: [], stats: {} });
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [roster,setRoster]=useState<any>({drivers:[],riders:[],helpers:[]});
  const [crewDraft,setCrewDraft]=useState({driver_code:"",rider_code:"",helper_code:""});

  const wayplans: Wayplan[] = Array.isArray(data?.wayplans) ? data.wayplans : [];
  const selectedSummary = useMemo(
    () => wayplans.find((w) => w.wayplan_id === selectedId) || wayplans[0] || null,
    [wayplans, selectedId],
  );
  const selected = detail?.wayplan?.wayplan_id === selectedId
    ? { ...selectedSummary, ...detail.wayplan }
    : selectedSummary;

  useEffect(() => {
    if (selectedSummary && selectedSummary.wayplan_id !== selectedId) {
      setSelectedId(selectedSummary.wayplan_id);
      setNotes(selectedSummary.review_notes || selectedSummary.rejection_reason || "");
    }
  }, [selectedSummary, selectedId]);

  const loadData = async (keepSelection = true) => {
    setLoading(true);
    setError("");
    try {
      const { data: res, error: rpcError } = await (supabase as any).rpc("be_wayplan_supervisor_list_v62");
      if (rpcError) throw rpcError;
      const next = res || { wayplans: [], stats: {} };
      setData(next);
      const rows = Array.isArray(next?.wayplans) ? next.wayplans : [];
      const target = keepSelection && rows.some((w: any) => w.wayplan_id === selectedId)
        ? selectedId
        : rows[0]?.wayplan_id || "";
      setSelectedId(target);
      const picked = rows.find((w: any) => w.wayplan_id === target) || rows[0];
      setNotes(picked?.review_notes || picked?.rejection_reason || "");
    } catch (err: any) {
      const msg = err?.message || "Failed to load Supervisor Wayplans.";
      setError(msg);
      setData({ wayplans: [], stats: {} });
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(false); }, []);
  useEffect(()=>{
    let alive=true;
    (supabase as any).rpc("be_multi_van_context").then(({data,error}:any)=>{
      if(!alive) return;
      if(error) setError(error.message || "Failed to load workforce roster.");
      else setRoster(data || {drivers:[],riders:[],helpers:[]});
    });
    return ()=>{alive=false;};
  },[]);
  const loadDetail = async (wayplanId: string) => {
    if (!wayplanId) { setDetail(null); return; }
    setDetailLoading(true);
    setError("");
    try {
      const { data: res, error: rpcError } = await (supabase as any).rpc("be_wayplan_supervisor_detail_v62", {
        p_wayplan_id: wayplanId,
      });
      if (rpcError) throw rpcError;
      setDetail(res || null);
    } catch (err: any) {
      setDetail(null);
      setError(err?.message || "Failed to load selected Wayplan details.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId]);

  useEffect(()=>{
    if(!selected) return;
    setCrewDraft({
      driver_code:String(selected.driver_code||""),
      rider_code:String(selected.rider_code||""),
      helper_code:String(selected.helper_code||""),
    });
  },[selected?.wayplan_id,selected?.driver_code,selected?.rider_code,selected?.helper_code]);


  const submitForReview = async () => {
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { data: res, error: rpcError } = await supabase.rpc("be_wayplan_submit_review_v45", {
        p_wayplan_id: selected.wayplan_id,
        p_actor_email: null,
        p_notes: notes || null,
      });
      if (rpcError) throw rpcError;
      if (res?.ok === false) throw new Error(res?.message || "Wayplan review submission failed.");
      setMessage(`${selected.wayplan_id} submitted for Supervisor review.`);
      await loadData();
      await loadDetail(selected.wayplan_id);
    } catch (err: any) {
      setError(err?.message || "Wayplan review submission failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveCrew = async () => {
    if(!selected) return;
    if(!crewDraft.driver_code){setError("Choose a Driver before saving crew.");return;}
    setBusy(true); setError(""); setMessage("");
    try{
      const {data:res,error:rpcError}=await (supabase as any).rpc("be_wayplan_supervisor_assign_crew_v68",{
        p_wayplan_id:selected.wayplan_id,
        p_driver_code:crewDraft.driver_code,
        p_rider_code:crewDraft.rider_code || null,
        p_helper_code:crewDraft.helper_code || null,
      });
      if(rpcError) throw rpcError;
      if(res?.ok===false) throw new Error(res?.message || "Crew update failed.");
      setMessage(`${selected.wayplan_id} crew updated from the approved operational roster.`);
      await loadData();
      await loadDetail(selected.wayplan_id);
    }catch(err:any){
      setError(err?.message || "Crew update failed.");
    }finally{
      setBusy(false);
    }
  };

  const confirmWayplan = async () => {
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      let status = String(selected.review_status || "DRAFT").toUpperCase();

      if (status === "DRAFT" || status === "REJECTED") {
        const { data: submitted, error: submitError } = await supabase.rpc("be_wayplan_submit_review_v45", {
          p_wayplan_id: selected.wayplan_id,
          p_actor_email: null,
          p_notes: notes || null,
        });
        if (submitError) throw submitError;
        if (submitted?.ok === false) throw new Error(submitted?.message || "Submission for Supervisor review failed.");
        status = "PENDING_REVIEW";
      }

      if (status === "PENDING_REVIEW") {
        const { data: approved, error: approveError } = await supabase.rpc("be_wayplan_supervisor_decide_v43", {
          p_wayplan_id: selected.wayplan_id,
          p_decision: "APPROVE",
          p_notes: notes || null,
          p_actor_email: null,
        });
        if (approveError) throw approveError;
        if (approved?.ok === false) throw new Error(approved?.message || "Supervisor approval failed.");
        status = "APPROVED";
      }

      if (status === "APPROVED") {
        const { data: prepared, error: prepareError } = await supabase.rpc("be_wayplan_prepare_dispatch_v43", {
          p_wayplan_id: selected.wayplan_id,
          p_actor_email: null,
        });
        if (prepareError) throw prepareError;
        if (prepared?.ok === false) throw new Error(prepared?.message || "Dispatch handoff failed.");
        status = String(prepared?.review_status || "DISPATCH_READY");
      }

      setMessage(
        status === "DISPATCH_READY"
          ? `${selected.wayplan_id} confirmed and released to mandatory Dispatch scanning.`
          : `${selected.wayplan_id} is now ${status}.`,
      );
      await loadData();
      await loadDetail(selected.wayplan_id);
    } catch (err: any) {
      setError(err?.message || "Wayplan confirmation failed.");
    } finally {
      setBusy(false);
    }
  };

  const stats = data?.stats || {};
  const draftCount = wayplans.filter((w) => !["DISPATCH_READY", "DISPATCHED"].includes(String(w.review_status || "DRAFT").toUpperCase())).length;
  const confirmedCount = wayplans.filter((w) => ["APPROVED", "DISPATCH_READY", "DISPATCHED"].includes(String(w.review_status || "").toUpperCase())).length;
  const rowsInPlan = selected?.parcel_count || 0;
  const included = selected?.ready_count || selected?.planned_count || 0;
  const selectedStatus = String(selected?.review_status || "DRAFT").toUpperCase();
  const stops = Array.isArray(detail?.wayplan?.stops) ? detail.wayplan.stops : [];
  const crewEditable=Boolean(selected) && !["DISPATCH_READY","DISPATCHED"].includes(selectedStatus);
  const branch=String(selected?.branch_code || selected?.metadata?.branch_code || "YGN");
  const drivers=(roster?.drivers||[]).filter((x:any)=>!x.branch_code || x.branch_code===branch);
  const riders=(roster?.riders||[]).filter((x:any)=>!x.branch_code || x.branch_code===branch);
  const helpers=(roster?.helpers||[]).filter((x:any)=>!x.branch_code || x.branch_code===branch);

  return (
    <div data-supervisor-wayplan-v62="true" className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h2 className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t("SUPERVISOR", "ကြီးကြပ်ရေးမှူး")}</h2>
          <h1 className="text-[#eef8ff] text-[20px] font-black">{t("Wayplan Review & Delivery Assignment", "လမ်းကြောင်း စစ်ဆေးခြင်းနှင့် တာဝန်ချထားခြင်း")}</h1>
          <p className="text-[#4d7a9b] text-[13px] mt-2">{t("Review generated Wayplans and release approved plans to mandatory Dispatch scanning.", "ရေးဆွဲထားသော လမ်းကြောင်းများကို စစ်ဆေးပြီး Dispatch သို့ လွှဲပြောင်းပါ။")}</p>
        </div>
        <button onClick={() => void loadData()} disabled={loading || busy} className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2 rounded-xl flex items-center gap-2 hover:border-[#f6b84b] transition-colors text-[13px] cursor-pointer disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {t("Refresh", "ပြန်လည်စတင်ရန်")}
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-[12px] text-red-200 flex gap-2"><AlertTriangle size={16}/><span>{error}</span></div> : null}
      {message ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-[12px] text-emerald-200 flex gap-2"><CheckCircle2 size={16}/><span>{message}</span></div> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat title="DRAFT WAYPLANS" value={draftCount} subtitle="Needs supervisor review" tone="text-[#f6b84b]" />
        <Stat title="CONFIRMED" value={confirmedCount} subtitle="Approved / released" tone="text-emerald-400" />
        <Stat title="ROWS IN PLAN" value={rowsInPlan} subtitle="Selected Wayplan" tone="text-[#4ea8de]" />
        <Stat title="INCLUDED" value={included} subtitle="Planned / dispatch-ready" tone="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[430px]">
          <div className="p-4 border-b border-[#1a3a5c]">
            <h3 className="text-[#eef8ff] text-[14px] font-black">Wayplans</h3>
            <p className="text-[#4d7a9b] text-[12px]">Select a generated plan for Supervisor review.</p>
          </div>
          <div className="p-3 space-y-2 overflow-auto max-h-[520px]">
            {loading ? <div className="p-6 text-[#4d7a9b] text-[12px]">Loading Wayplans…</div> :
              wayplans.length === 0 ? <div className="p-6 text-[#4d7a9b] text-[12px]">No generated Wayplans are currently in the Supervisor queue.</div> :
              wayplans.map((w) => {
                const active = selected?.wayplan_id === w.wayplan_id;
                const status = String(w.review_status || "DRAFT").toUpperCase();
                return (
                  <button key={w.wayplan_id} onClick={() => { setSelectedId(w.wayplan_id); setNotes(w.review_notes || w.rejection_reason || ""); }} className={`w-full text-left rounded-xl border p-3 transition-colors ${active ? "border-[#f6b84b] bg-[#0f243b]" : "border-[#1a3a5c] bg-[#081b2e] hover:border-[#4d7a9b]"}`}>
                    <div className="text-[#f6b84b] font-black text-[12px]">{w.wayplan_id}</div>
                    <div className="mt-1 text-[#eef8ff] text-[11px]">{w.parcel_count || 0} parcels · {w.vehicle_code || "No vehicle"}</div>
                    <div className="mt-1 text-[#4d7a9b] text-[10px]">{status} · Driver: {w.driver_name || w.driver_code || "—"} · Rider: {w.rider_name || w.rider_code || "No rider"}</div>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#061524] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[430px]">
          <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-start gap-4">
            <div>
              <h3 className="text-[#eef8ff] text-[14px] font-black">Review Items</h3>
              <p className="text-[#4d7a9b] text-[12px]">
                {selected ? `${selected.wayplan_id} · ${selectedStatus}` : "Select a Wayplan."}
              </p>
            </div>
            <div className="flex gap-2">
              <button disabled={!selected || busy || ["PENDING_REVIEW","APPROVED","DISPATCH_READY","DISPATCHED"].includes(selectedStatus)} onClick={submitForReview} className="bg-[#0b2236] text-[#eef8ff] px-4 py-2 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center gap-2 text-[12px] disabled:opacity-40">
                <ShieldCheck size={14}/> Submit for Review
              </button>
              <button disabled={!selected || busy || selectedStatus === "DISPATCH_READY" || selectedStatus === "DISPATCHED"} onClick={confirmWayplan} className="bg-[#f6b84b] text-[#061524] px-4 py-2 rounded-xl hover:bg-[#e5a93a] flex items-center gap-2 text-[12px] font-black disabled:opacity-40">
                <Send size={14}/> {busy ? "Processing…" : selectedStatus === "APPROVED" ? "Release to Dispatch" : "Confirm Wayplan"}
              </button>
            </div>
          </div>

          {selected ? (
            <div className="flex-1 p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                <Info label="Vehicle" value={selected.vehicle_name || selected.vehicle_code || "—"} />
                <Info label="Driver" value={selected.driver_name || selected.driver_code || "—"} />
                <Info label="Rider" value={selected.rider_name || selected.rider_code || "No rider"} />
                <Info label="Helper" value={selected.helper_name || selected.helper_code || "No helper"} />
              </div>

              <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black text-[#eef8ff]">Delivery crew roster</div>
                    <div className="text-[10px] text-[#4d7a9b]">Driver required · Rider optional · Helper optional · sourced from approved master spreadsheets.</div>
                  </div>
                  <button disabled={!crewEditable || busy || !crewDraft.driver_code} onClick={saveCrew} className="rounded-lg border border-[#f6b84b] px-3 py-2 text-[11px] font-black text-[#f6b84b] disabled:opacity-40">
                    Save Crew
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="text-[10px] text-[#4d7a9b]">Driver *
                    <select disabled={!crewEditable || busy} value={crewDraft.driver_code} onChange={e=>setCrewDraft(v=>({...v,driver_code:e.target.value}))} className="mt-1 w-full rounded-lg border border-[#1a3a5c] bg-[#061524] p-2 text-[11px] text-[#eef8ff]">
                      <option value="">Choose Driver</option>
                      {drivers.map((x:any)=><option key={x.id} value={x.id}>{x.name}{x.mobile_auth_ready===false ? " · no mobile login" : ""}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-[#4d7a9b]">Rider (optional)
                    <select disabled={!crewEditable || busy} value={crewDraft.rider_code} onChange={e=>setCrewDraft(v=>({...v,rider_code:e.target.value}))} className="mt-1 w-full rounded-lg border border-[#1a3a5c] bg-[#061524] p-2 text-[11px] text-[#eef8ff]">
                      <option value="">No rider — Driver only</option>
                      {riders.map((x:any)=><option key={x.id} value={x.id}>{x.name}{x.mobile_auth_ready===false ? " · no mobile login" : ""}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-[#4d7a9b]">Helper (optional)
                    <select disabled={!crewEditable || busy} value={crewDraft.helper_code} onChange={e=>setCrewDraft(v=>({...v,helper_code:e.target.value}))} className="mt-1 w-full rounded-lg border border-[#1a3a5c] bg-[#061524] p-2 text-[11px] text-[#eef8ff]">
                      <option value="">No helper</option>
                      {helpers.map((x:any)=><option key={x.id} value={x.id}>{x.name}{x.mobile_auth_ready===false ? " · no mobile login" : ""}</option>)}
                    </select>
                  </label>
                </div>
                {!crewEditable ? <div className="mt-2 text-[10px] text-amber-300">Crew editing is locked after the Wayplan is released to Dispatch.</div> : null}
              </div>

              {detailLoading ? <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-4 text-[12px] text-[#4d7a9b]">Loading selected Wayplan details…</div> : null}

              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supervisor notes (optional)" className="w-full min-h-[72px] rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]" />

              {selected.blocked_count ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-[11px] text-red-200">{selected.blocked_count} parcel(s) are blocked by warehouse/discrepancy/RTO validation.</div> : null}

              <div className="border border-[#1a3a5c] rounded-xl overflow-hidden">
                <div className="grid grid-cols-[52px_1fr_160px_120px_110px] gap-2 bg-[#0b2236] px-3 py-2 text-[10px] uppercase tracking-wider text-[#4d7a9b]">
                  <span>Seq</span><span>Way ID / Recipient</span><span>Township</span><span>COD</span><span>Status</span>
                </div>
                <div className="max-h-[300px] overflow-auto">
                  {stops.length ? stops.map((s: any, index: number) => (
                    <div key={s.delivery_way_id || index} className="grid grid-cols-[52px_1fr_160px_120px_110px] gap-2 border-t border-[#1a3a5c] px-3 py-2 text-[11px] text-[#eef8ff]">
                      <span>{index + 1}</span>
                      <span><b>{s.delivery_way_id || "—"}</b><br/><span className="text-[#4d7a9b]">{s.recipient_name || "—"}</span></span>
                      <span>{s.township || "—"}</span>
                      <span>{Number(s.cod_amount || 0).toLocaleString()} Ks</span>
                      <span>{s.membership_status || "—"}</span>
                    </div>
                  )) : <div className="p-6 text-[#4d7a9b] text-[12px]">No parcels found in this Wayplan.</div>}
                </div>
              </div>

              {selectedStatus === "DISPATCH_READY" ? (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-[12px] text-emerald-200 flex items-center gap-2">
                  <Truck size={16}/> Supervisor review complete. Next: Dispatch Command → mandatory parcel scan → Dispatch.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">No Wayplan selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, subtitle, tone }: { title: string; value: number; subtitle: string; tone: string }) {
  return <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{title}</div><div className={`text-[20px] ${tone}`}>{value}</div><div className="text-[#4d7a9b] text-[11px] mt-1">{subtitle}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3"><div className="text-[#4d7a9b] uppercase tracking-wider text-[9px]">{label}</div><div className="mt-1 text-[#eef8ff] font-bold">{value}</div></div>;
}
