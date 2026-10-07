// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function text(v:any,fallback="-"){ const s=String(v??"").trim(); return s||fallback; }
function money(v:any){ return Number(v||0).toLocaleString("en-US")+" MMK"; }
function dt(v:any){ if(!v) return "-"; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("en-GB",{timeZone:"Asia/Yangon"}); }
function stopsOf(w:any){ if(Array.isArray(w?.stops)) return w.stops; if(typeof w?.stops==="string"){try{const p=JSON.parse(w.stops);return Array.isArray(p)?p:[];}catch{return[]}} return []; }

export default function WarehouseWayplanViewPage(){
  const [loading,setLoading]=useState(false);
  const [wayplans,setWayplans]=useState<any[]>([]);
  const [query,setQuery]=useState("");
  const [active,setActive]=useState<any|null>(null);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const {data,error}=await (supabase as any).rpc("be_wayplan_command_center",{p_limit:500});
      if(error) throw error;
      const rows=Array.isArray(data?.wayplans)?data.wayplans:Array.isArray(data?.data)?data.data:[];
      setWayplans(rows);
      setActive((prev:any)=>{
        if(prev?.wayplan_id){
          const fresh=rows.find((x:any)=>x.wayplan_id===prev.wayplan_id);
          if(fresh) return fresh;
        }
        return rows[0]||null;
      });
    }catch(e:any){ setError(e?.message||"Could not load Wayplans."); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ void load(); },[]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return wayplans;
    return wayplans.filter((w:any)=>[
      w.wayplan_id,w.wayplan_status,w.rider_code,w.rider_name,w.driver_code,w.driver_name,
      w.vehicle_code,w.vehicle_name,w.branch_code,
      ...stopsOf(w).flatMap((s:any)=>[s.delivery_way_id,s.waybill_no,s.pickup_id,s.recipient_name,s.recipient_phone,s.township,s.failed_reason])
    ].join(" ").toLowerCase().includes(q));
  },[wayplans,query]);

  const stops=stopsOf(active);

  return <main className="min-h-screen bg-[#061524] p-5 text-[#eef8ff]">
    <section className="mb-4 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"><Eye size={16}/> Warehouse Read Only</div>
          <h1 className="m-0 text-2xl font-black">Wayplan View</h1>
          <p className="mt-2 text-sm text-[#9cc2d9]">Warehouse can view Wayplan, crew, vehicle and stop progress. No create, edit, cancel, approval or dispatch authority is provided here.</p>
        </div>
        <button onClick={()=>void load()} disabled={loading} className="rounded-xl border border-[#1a3a5c] bg-[#102b45] px-4 py-3 text-sm font-black">
          <RefreshCw size={16} className={"mr-2 inline "+(loading?"animate-spin":"")}/>Refresh
        </button>
      </div>
      {error?<div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/20 p-3 text-rose-200">{error}</div>:null}
    </section>

    <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-4">
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3">
          <Search size={15} className="text-[#9cc2d9]"/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Wayplan / Way ID / rider..." className="min-h-11 w-full bg-transparent text-sm outline-none"/>
        </div>
        <div className="max-h-[68vh] space-y-2 overflow-auto">
          {visible.map((w:any)=><button key={w.wayplan_id} onClick={()=>setActive(w)} className={"w-full rounded-2xl border p-3 text-left "+(active?.wayplan_id===w.wayplan_id?"border-cyan-400 bg-cyan-950/30":"border-[#1a3a5c] bg-[#081b2e]")}>
            <div className="font-black text-white">{w.wayplan_id}</div>
            <div className="mt-1 text-xs text-[#9cc2d9]">{text(w.wayplan_status)} · {Number(w.total_stops||stopsOf(w).length)} stop(s)</div>
            <div className="mt-1 text-xs text-[#9cc2d9]">{text(w.rider_name,w.rider_code||"Unassigned")} · {text(w.vehicle_name,w.vehicle_code||"No vehicle")}</div>
          </button>)}
          {!visible.length?<div className="p-8 text-center text-sm text-[#9cc2d9]">No Wayplans found.</div>:null}
        </div>
      </div>

      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-4">
        {!active?<div className="p-10 text-center text-[#9cc2d9]">Select a Wayplan to view details.</div>:<>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Status",text(active.wayplan_status)],
              ["Rider",text(active.rider_name,active.rider_code)],
              ["Driver",text(active.driver_name,active.driver_code)],
              ["Helper",text(active.helper_name,active.helper_code)],
              ["Vehicle",text(active.vehicle_name,active.vehicle_code)],
              ["Stops",String(stops.length)],
              ["Total COD",money(active.total_cod)],
              ["Dispatched",dt(active.dispatched_at)]
            ].map(([k,v])=><div key={k} className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-3"><div className="text-[10px] font-black uppercase tracking-wider text-[#4d7a9b]">{k}</div><div className="mt-1 text-sm font-bold">{v}</div></div>)}
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead><tr className="border-b border-[#1a3a5c] text-left text-[11px] uppercase text-[#4d7a9b]">
                <th className="p-3">Seq</th><th>Delivery Way</th><th>Recipient</th><th>Township</th><th>COD</th><th>Stop Status</th><th>Failed Reason</th><th>Warehouse</th>
              </tr></thead>
              <tbody>{stops.map((s:any,i:number)=><tr key={s.id||s.delivery_way_id||i} className="border-b border-[#1a3a5c]/60">
                <td className="p-3">{s.stop_sequence||s.delivery_sequence||i+1}</td>
                <td className="font-bold">{text(s.delivery_way_id,s.waybill_no)}</td>
                <td><div>{text(s.recipient_name)}</div><div className="text-xs text-[#9cc2d9]">{text(s.recipient_phone,"")}</div></td>
                <td>{text(s.township,s.delivery_township)}</td>
                <td>{money(s.cod_amount)}</td>
                <td>{text(s.stop_status,s.rider_status)}</td>
                <td className="max-w-[240px] whitespace-normal">{text(s.failed_reason,s.warehouse_exception_reason||"")}</td>
                <td>{text(s.warehouse_status,s.warehouse_action)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      </div>
    </section>
  </main>;
}
