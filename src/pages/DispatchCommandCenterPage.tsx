import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, RefreshCw, Send, Truck, Printer, Search } from "lucide-react";

const fmtMoney = (v: any) => `${Number(v || 0).toLocaleString("en-US")} MMK`;
const safe = (v: any) => String(v ?? "").replace(/[&<>"']/g, (s) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"} as any)[s]);
const getTracking = (j: any) => j.tracking_no || j.delivery_way_id || j.id;
const getPhone = (j: any) => j.phone_number || j.recipient_phone || j.contact_no || j.phone || "";
const getRemarks = (j: any) => j.remarks || j.remark || j.special_instruction || j.special_instructions || "";
const getTotal = (j: any) => Number(j.total_collected_amount ?? 0) || (Number(j.cod_amount ?? 0) + Number(j.delivery_charges ?? 0));
const getAssetName = (asset: any, fallback: string) => asset?.asset_name || asset?.asset_code || fallback;

function groupByAsset(jobs: any[], assets: any[] = []) {
  const assetMap = new Map((assets || []).map((a: any) => [a.asset_code, a]));
  const groups: Record<string, { asset: any; jobs: any[] }> = {};
  for (const job of jobs || []) {
    const code = job.asset_code || job.vehicle_code || job.vehicle_id || "UNASSIGNED";
    if (!groups[code]) groups[code] = { asset: assetMap.get(code) || { asset_code: code, asset_name: code }, jobs: [] };
    groups[code].jobs.push(job);
  }
  Object.values(groups).forEach((g) => g.jobs.sort((a, b) => Number(a.parcel_sequence || 0) - Number(b.parcel_sequence || 0)));
  return groups;
}

const TRANSLATIONS = {
  en: {
    title: "Dispatch Command Center",
    subtitle: "Live Supabase Workflow",
    sync: "Sync Fresh",
    publish: "Publish",
    publishAll: "Publish All",
    manifest: "Manifest",
    closeDay: "Close Day Drop Off",
    kpiWayplans: "WAYPLANS",
    kpiJobs: "JOBS",
    kpiPending: "PENDING",
    kpiOut: "OUT",
    kpiDelivered: "DELIVERED",
    kpiFailed: "FAILED",
    kpiRto: "RTO",
    kpiCod: "COD",
    pool: "Parcel Pool",
    search: "Search tracking, township, phone...",
    board: "Fleet Assignment Board",
    boardSub: "Generated from live wayplan + fleet zoning",
    statusBoard: "Status Board",
    outForDelivery: "Out for Delivery",
    deliveredDropOff: "Delivered / Drop Off",
    failedAttempt: "Failed Attempt",
    out: "Out",
    done: "Done",
    fail: "Fail"
  },
  mm: {
    title: "ပို့ဆောင်ရေး ထိန်းချုပ်မှု ဗဟို",
    subtitle: "တိုက်ရိုက် လုပ်ငန်းစဉ်လည်ပတ်မှု",
    sync: "ဆန်းသစ်ရန်",
    publish: "ထုတ်ပြန်မည်",
    publishAll: "အားလုံးထုတ်ပြန်မည်",
    manifest: "စာရင်းထုတ်ရန်",
    closeDay: "နေ့စဉ်စာရင်းပိတ်မည်",
    kpiWayplans: "လမ်းကြောင်းများ",
    kpiJobs: "အလုပ်များ",
    kpiPending: "ဆိုင်းငံ့",
    kpiOut: "ပို့ဆောင်ဆဲ",
    kpiDelivered: "ပို့ဆောင်ပြီး",
    kpiFailed: "မအောင်မြင်ပါ",
    kpiRto: "မူရင်းပြန်ပို့",
    kpiCod: "ကောက်ခံငွေ",
    pool: "ပါဆယ်စာရင်း",
    search: "ရှာဖွေရန်...",
    board: "ယာဉ်တာဝန်ချထားမှု စာရင်း",
    boardSub: "လမ်းကြောင်းနှင့် ဇုန်များမှ ဖန်တီးထားသည်",
    statusBoard: "အခြေအနေ ပြဘုတ်",
    outForDelivery: "ပို့ဆောင်နေဆဲ",
    deliveredDropOff: "ပို့ဆောင်ပြီး / ထားခဲ့ပြီး",
    failedAttempt: "မအောင်မြင်သော ကြိုးပမ်းမှု",
    out: "ထွက်",
    done: "ပြီး",
    fail: "ပျက်"
  }
};

export default function DispatchCommandCenterPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, jobs: [], wayplans: [], assets: [], zones: [] });
  const [query, setQuery] = useState("");
  const [selectedWayplan, setSelectedWayplan] = useState("");
  const [clock, setClock] = useState("");

  const jobs = snapshot.jobs || [];
  const assets = snapshot.assets || [];
  const wayplans = snapshot.wayplans || [];
  const stats = snapshot.stats || {};

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Yangon" })), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("be_enterprise_dispatch_snapshot");
      if (error) throw error;
      setSnapshot(data || {});
      const first = data?.wayplans?.[0]?.wayplan_code || data?.wayplans?.[0]?.wayplan_no || "";
      setSelectedWayplan((prev) => prev || first);
    } catch (e: any) {
      setMessage(e.message || "Failed to load dispatch data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const actor = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "dispatch@britiumexpress.com";
  };

  const publish = async (wayplanCode?: string) => {
    const code = wayplanCode || selectedWayplan;
    if (!code) return setMessage("Select a wayplan first.");
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_publish_wayplan_to_dispatch", { p_wayplan_code: code, p_actor_email: email });
      if (error) throw error;
      setMessage(`Published ${code} to rider/driver app.`);
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  const publishAll = async () => {
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_publish_all_wayplans_to_dispatch", { p_actor_email: email });
      if (error) throw error;
      setMessage("Published all dispatch-ready wayplans.");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Publish all failed.");
    } finally {
      setLoading(false);
    }
  };

  const setJobStatus = async (trackingNo: string, status: string) => {
    let note = "";
    if (status === "ATTEMPTED_FAILED") note = prompt("Failure / return reason note") || "";
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_driver_update_delivery_status", {
        p_tracking_no: trackingNo, p_status: status, p_actor_email: email, p_note: note,
      });
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Status update failed.");
    } finally {
      setLoading(false);
    }
  };

  const closeDayDropoff = async () => {
    if (!confirm("Mark all OUT FOR DELIVERY parcels without return scan as DROP OFF?")) return;
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_close_dispatch_day", { p_wayplan_code: selectedWayplan || null, p_actor_email: email });
      if (error) throw error;
      setMessage("Day closed. Non-returned OUT parcels marked as DROP OFF.");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Close day failed.");
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j: any) =>
      [j.tracking_no, j.delivery_way_id, j.recipient_name, j.delivery_township, getPhone(j), j.asset_name, j.asset_code]
        .some((x) => String(x || "").toLowerCase().includes(q))
    );
  }, [jobs, query]);

  const grouped = useMemo(() => groupByAsset(filteredJobs, assets), [filteredJobs, assets]);
  const pool = filteredJobs.filter((j: any) => !j.asset_code || j.asset_code === "UNASSIGNED");

  const jobCard = (j: any) => (
    <div key={getTracking(j)} className="rounded-xl border border-slate-700 bg-[#071827] p-4 shadow-md border-l-4 border-l-[#C09B30]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-white text-[15px]">{getTracking(j)}</div>
          <div className="text-sm font-semibold text-slate-300 mt-1">{j.recipient_name || "-"}</div>
          <div className="text-xs text-slate-400 mt-0.5">{j.delivery_township || "-"}</div>
        </div>
        <span className="rounded-md bg-[#0f2a42] px-2.5 py-1 text-[11px] font-bold tracking-wider text-[#38bdf8] uppercase border border-[#1a3a5c]">{j.delivery_status || "PENDING"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-400 font-mono">{getPhone(j)}</span>
        <span className="font-bold text-emerald-400 text-sm">{fmtMoney(getTotal(j))}</span>
      </div>
      {getRemarks(j) && <div className="mt-3 rounded-lg bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-300 border border-amber-900/50">{getRemarks(j)}</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setJobStatus(getTracking(j), "OUT_FOR_DELIVERY")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition">{t.out}</button>
        <button onClick={() => setJobStatus(getTracking(j), "DELIVERED")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition">{t.done}</button>
        <button onClick={() => setJobStatus(getTracking(j), "ATTEMPTED_FAILED")} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition">{t.fail}</button>
        <button onClick={() => setJobStatus(getTracking(j), "RTO")} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-600 transition">RTO</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100 font-['Poppins']">
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Truck className="text-[#C09B30]" size={28} />
          <div>
            <div className="font-black tracking-[0.15em] text-[#C09B30] text-lg uppercase">{t.title}</div>
            <div className="text-sm font-semibold text-slate-400 mt-1">{t.subtitle}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[#081b2e] rounded-lg p-1 border border-slate-700 mr-2">
            <button onClick={() => setLang('en')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${lang === 'en' ? 'bg-[#0f2a42] text-white' : 'text-slate-400'}`}>EN</button>
            <button onClick={() => setLang('mm')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${lang === 'mm' ? 'bg-[#0f2a42] text-white' : 'text-slate-400'}`}>မြန်မာ</button>
          </div>
          <span className="font-mono text-xs font-bold text-[#38bdf8] bg-[#0f2a42] px-3 py-2 rounded-lg border border-[#1a3a5c] mr-2">{clock}</span>
          
          <button onClick={loadAll} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-blue-500 transition"><RefreshCw size={16} />{t.sync}</button>
          <select value={selectedWayplan} onChange={(e) => setSelectedWayplan(e.target.value)} className="rounded-lg border border-slate-700 bg-[#071827] px-4 py-2 text-sm font-semibold outline-none focus:border-[#f6b84b]">
            {wayplans.map((w: any) => <option key={w.wayplan_code} value={w.wayplan_code}>{w.wayplan_code} · {w.parcel_count} parcels</option>)}
          </select>
          <button onClick={() => publish()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 transition"><Send size={16} />{t.publish}</button>
          <button onClick={publishAll} className="rounded-lg bg-[#C09B30] px-4 py-2 text-sm font-bold text-black hover:bg-[#d49a36] transition">{t.publishAll}</button>
          <button onClick={closeDayDropoff} className="rounded-lg border border-emerald-700 bg-emerald-900/20 px-4 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-900/40 transition">{t.closeDay}</button>
        </div>
      </div>

      {message && <div className="mb-6 rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm font-bold text-amber-400">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        {[
          [t.kpiWayplans, stats.wayplans],
          [t.kpiJobs, stats.jobs],
          [t.kpiPending, stats.pending],
          [t.kpiOut, stats.out_for_delivery],
          [t.kpiDelivered, stats.delivered],
          [t.kpiFailed, stats.failed],
          [t.kpiRto, stats.rto],
          [t.kpiCod, fmtMoney(stats.cod)],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-2xl border border-slate-800 bg-[#0B2133] p-4 text-center shadow-lg">
            <div className="text-xl font-black text-[#C09B30]">{v ?? 0}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-2 tracking-widest uppercase">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr_320px]">
        {/* PARCEL POOL */}
        <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2"><Package size={18} className="text-[#38bdf8]"/> {t.pool}</h3>
            <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-bold border border-slate-700">{pool.length || filteredJobs.length}</span>
          </div>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="w-full rounded-xl bg-[#071827] border border-slate-700 p-3 pl-10 text-sm outline-none focus:border-[#f6b84b]" />
          </div>
          <div className="max-h-[65vh] space-y-4 overflow-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
            {(pool.length ? pool : filteredJobs.slice(0, 50)).map(jobCard)}
          </div>
        </section>

        {/* FLEET ASSIGNMENT BOARD */}
        <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2"><Truck size={18} className="text-[#38bdf8]"/> {t.board}</h3>
            <span className="text-xs font-semibold text-slate-400">{t.boardSub}</span>
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {Object.entries(grouped).map(([code, g]: any) => (
              <div key={code} className="rounded-2xl border border-slate-700 bg-[#071827] overflow-hidden flex flex-col">
                <div className="border-b border-slate-800 p-4 bg-[#0a1f30]">
                  <div className="font-bold text-[15px] text-white">{getAssetName(g.asset, code)}</div>
                  <div className="text-[11px] font-bold text-[#38bdf8] uppercase tracking-wider mt-1">{code} · {g.asset?.operation_type || g.asset?.asset_type || "fleet"}</div>
                  <div className="text-xs font-semibold text-slate-400 mt-2">{g.jobs.length} jobs · {fmtMoney(g.jobs.reduce((s: number, j: any) => s + getTotal(j), 0))}</div>
                </div>
                <div className="max-h-[500px] space-y-3 overflow-auto p-3 bg-[#061524]/50 scrollbar-thin scrollbar-thumb-slate-700 flex-1">
                  {g.jobs.map(jobCard)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STATUS BOARD */}
        <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
          <h3 className="mb-5 font-bold flex items-center gap-2"><RefreshCw size={18} className="text-[#38bdf8]"/> {t.statusBoard}</h3>
          {[
            [t.outForDelivery, "OUT_FOR_DELIVERY", "border-blue-800", "bg-blue-900/20", "text-blue-400"],
            [t.deliveredDropOff, "DELIVERED", "border-emerald-800", "bg-emerald-900/20", "text-emerald-400"],
            [t.failedAttempt, "ATTEMPTED_FAILED", "border-amber-800", "bg-amber-900/20", "text-amber-400"],
            [t.kpiRto, "RTO", "border-rose-800", "bg-rose-900/20", "text-rose-400"],
          ].map(([label, status, borderColor, bgColor, textColor]) => {
            const list = jobs.filter((j: any) => status === "DELIVERED"
              ? ["DELIVERED", "COMPLETED", "DROP_OFF"].includes(j.delivery_status)
              : j.delivery_status === status || j.dispatch_status === status);
            return (
              <div key={status} className={`mb-4 rounded-xl border ${borderColor} ${bgColor} overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-slate-800/50 p-3 text-sm font-bold">
                  <span className={textColor}>{label}</span>
                  <span className={`rounded-md px-2.5 py-1 text-[11px] border ${borderColor} ${textColor}`}>{list.length}</span>
                </div>
                <div className="max-h-[160px] space-y-2 overflow-auto p-3 scrollbar-thin scrollbar-thumb-slate-700">
                  {list.length ? list.map((j: any) => (
                    <div key={getTracking(j)} className="rounded-lg bg-[#0B2133] border border-slate-700 p-2 text-xs font-semibold text-slate-300 flex justify-between">
                      <span>{getTracking(j)}</span>
                      <span className="text-slate-500">{j.delivery_township}</span>
                    </div>
                  )) : <div className="p-4 text-center text-xs font-semibold text-slate-500">No rows</div>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}