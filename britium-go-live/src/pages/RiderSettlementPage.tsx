// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

export default function RiderSettlementPage(){
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");

  async function load(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_finance_field_settlement_center_v1",{p_work_date:date});
    if(error || data?.ok===false){
      setMessage(error?.message||data?.code||"Unable to load field settlement.");
      setRows([]); setLoading(false); return;
    }
    setRows(Array.isArray(data?.rows)?data.rows:[]);
    setLoading(false);
  }

  useEffect(()=>{void load();},[date]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return rows;
    return rows.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q));
  },[rows,search]);

  const stats=filtered.reduce((a:any,r:any)=>({
    routes:a.routes+1,
    totalWays:a.totalWays+Number(r.total_ways||0),
    delivered:a.delivered+Number(r.delivered_ways||0),
    failed:a.failed+Number(r.failed_ways||0),
    remaining:a.remaining+Number(r.remaining_ways||0),
    opening:a.opening+Number(r.opening_cod_amount||0),
    collected:a.collected+Number(r.actual_collected||0),
    variance:a.variance+Number(r.variance_amount||0),
    cleared:a.cleared+(String(r.status).toUpperCase()==="CLEARED"?1:0)
  }),{routes:0,totalWays:0,delivered:0,failed:0,remaining:0,opening:0,collected:0,variance:0,cleared:0});

  return <div className="space-y-6 p-6 text-[#eef8ff]">
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.25em] text-[#f6b84b]">FIELD FINANCIAL SETTLEMENT</p>
          <h1 className="mt-2 text-3xl font-black">Rider / Driver / Helper Settlement</h1>
          <p className="mt-2 text-sm text-[#8ab0c9]">Live end-of-day route settlement from the same Finance clearing workflow used by Rider App and Finance Portal.</p>
        </div>
        <div className="flex gap-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2"/><button onClick={()=>void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[#1a3a5c] px-4 py-2 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button></div>
      </div>
      {message&&<div className="mt-4 rounded-2xl bg-[#061524] p-4 text-sm font-bold text-[#ff7aa2]">{message}</div>}
    </section>

    <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
      {[
        ["Routes",stats.routes],["Total Ways",stats.totalWays],["Delivered",stats.delivered],["Failed",stats.failed],
        ["Still Left",stats.remaining],["Opening COD",money(stats.opening)],["Collected",money(stats.collected)],["Cleared",stats.cleared]
      ].map(([k,v])=><div key={k} className="rounded-2xl border border-[#1a3a5c] bg-[#071827] p-4"><p className="text-[10px] uppercase tracking-widest text-[#8ab0c9]">{k}</p><p className="mt-2 text-xl font-black text-[#f6b84b]">{v}</p></div>)}
    </section>

    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#1a3a5c] p-4"><Search size={16} className="text-[#38bdf8]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Wayplan, vehicle, rider, driver, helper..." className="w-full bg-transparent outline-none"/></div>
      <div className="max-h-[700px] overflow-auto">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="sticky top-0 bg-[#061524] text-[11px] uppercase tracking-wider text-[#8ab0c9]"><tr><th className="p-3">Wayplan</th><th className="p-3">Vehicle</th><th className="p-3">Rider</th><th className="p-3">Driver</th><th className="p-3">Helper</th><th className="p-3">Ways</th><th className="p-3">Opening COD</th><th className="p-3">Collected</th><th className="p-3">Variance</th><th className="p-3">Signatures</th><th className="p-3">Status</th></tr></thead>
          <tbody>{filtered.map((r:any)=><tr key={r.id||r.wayplan_id} className="border-t border-[#1a3a5c]/50">
            <td className="p-3 font-mono text-[#38bdf8]">{r.wayplan_id}</td><td className="p-3">{r.vehicle_code||r.vehicle_name||"-"}</td><td className="p-3">{r.rider_name||r.rider_code||"-"}</td><td className="p-3">{r.driver_name||r.driver_code||"-"}</td><td className="p-3">{r.helper_name||r.helper_code||"-"}</td>
            <td className="p-3">{r.total_ways} · {r.delivered_ways} success · {r.failed_ways} fail · {r.remaining_ways} left</td><td className="p-3">{money(r.opening_cod_amount)}</td><td className="p-3">{money(r.actual_collected)}</td><td className={`p-3 font-black ${Number(r.variance_amount||0)===0?"text-emerald-400":"text-rose-400"}`}>{money(r.variance_amount)}</td>
            <td className="p-3 text-xs">F {r.signature_status?.finance?"✓":"—"} · R {r.signature_status?.rider?"✓":"—"} · D {r.signature_status?.driver?"✓":"—"} · H {r.signature_status?.helper?"✓":"—"}</td>
            <td className="p-3"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${String(r.status).toUpperCase()==="CLEARED"?"bg-emerald-500/10 text-emerald-400":"bg-amber-500/10 text-amber-300"}`}>{String(r.status).toUpperCase()==="CLEARED"?<CheckCircle2 size={14}/>:<ShieldCheck size={14}/>} {r.status}</span></td>
          </tr>)}
          {filtered.length===0&&<tr><td colSpan={11} className="p-16 text-center text-[#8ab0c9]">No settlement rows found.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
