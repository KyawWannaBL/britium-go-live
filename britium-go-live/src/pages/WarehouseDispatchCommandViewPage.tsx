// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Truck, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";

const fmt=(v:any)=>v?new Date(v).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}):"-";
const money=(v:any)=>Number(v||0).toLocaleString("en-US")+" MMK";
const track=(j:any)=>j.tracking_no||j.delivery_way_id||j.id||"";

export default function WarehouseDispatchCommandViewPage(){
  const [loading,setLoading]=useState(true);
  const [snapshot,setSnapshot]=useState<any>({stats:{},jobs:[],wayplans:[],assets:[]});
  const [query,setQuery]=useState("");
  const [selectedWayplan,setSelectedWayplan]=useState("");
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setMessage("");
    try{
      const {data,error}=await (supabase as any).rpc("be_dispatch_command_snapshot_v63");
      if(error) throw error;
      setSnapshot(data||{stats:{},jobs:[],wayplans:[],assets:[]});
      if(!selectedWayplan && data?.wayplans?.length){
        const first=data.wayplans[0];
        setSelectedWayplan(first.wayplan_id||first.wayplan_code||"");
      }
    }catch(e:any){setMessage(e?.message||"Could not load Dispatch Command view.");}
    finally{setLoading(false);}
  },[selectedWayplan]);

  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    const timer=window.setInterval(()=>void load(),15000);
    return ()=>window.clearInterval(timer);
  },[load]);

  const jobs=Array.isArray(snapshot.jobs)?snapshot.jobs:[];
  const wayplans=Array.isArray(snapshot.wayplans)?snapshot.wayplans:[];
  const stats=snapshot.stats||{};

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return jobs.filter((j:any)=>{
      if(selectedWayplan && j.wayplan_code!==selectedWayplan) return false;
      if(!q) return true;
      return [track(j),j.recipient_name,j.delivery_township,j.recipient_phone,j.phone_number,j.asset_name,j.asset_code]
        .some((x:any)=>String(x||"").toLowerCase().includes(q));
    });
  },[jobs,query,selectedWayplan]);

  function printView(){
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Dispatch Command View</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;font-size:11px}th{background:#f3c45b}</style>
    </head><body><h2>Dispatch Command - Warehouse View</h2><table><thead><tr><th>Way ID</th><th>Wayplan</th><th>Recipient</th><th>Township</th><th>Vehicle</th><th>Rider</th><th>Status</th><th>COD</th></tr></thead><tbody>${visible.map((j:any)=>`<tr><td>${track(j)}</td><td>${j.wayplan_code||""}</td><td>${j.recipient_name||""}</td><td>${j.delivery_township||""}</td><td>${j.asset_name||j.asset_code||""}</td><td>${j.rider_name||j.rider_code||""}</td><td>${j.delivery_status||j.dispatch_status||""}</td><td>${money(j.total_collected_amount||j.cod_amount)}</td></tr>`).join("")}</tbody></table></body></html>`;
    guardedBrowserPrint(html,"Dispatch Command - Warehouse View");
  }

  return <main className="min-h-screen bg-[#07111e] p-6 text-slate-100">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        <Truck className="text-[#C09B30]"/>
        <div>
          <div className="font-black tracking-[.16em] text-[#C09B30]">DISPATCH COMMAND</div>
          <div className="text-sm text-slate-400">Warehouse View · Live Dispatch Status</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>void load()} disabled={loading} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold disabled:opacity-50"><RefreshCw className={"mr-1 inline h-4 w-4 "+(loading?"animate-spin":"")}/>Sync Fresh</button>
        <button onClick={printView} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold"><Printer className="mr-1 inline h-4 w-4"/>Print View</button>
      </div>
    </header>

    <div className="mb-4 rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 text-sm text-cyan-100">
      <div className="font-black uppercase tracking-wide">Warehouse View — Read Only</div>
      <div className="mt-1 text-cyan-200/80">Warehouse can view Wayplans, parcel status, dispatch scan progress, rider/driver/helper and vehicle assignment. Publish, delivery-status change, RTO and Close Day actions are not available.</div>
    </div>

    {message&&<div className="mb-4 rounded-lg border border-red-700 bg-red-950/30 p-3 text-red-200">{message}</div>}

    <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {[
        ["WAYPLANS",stats.wayplans],["JOBS",stats.jobs],["PENDING",stats.pending],["OUT",stats.out_for_delivery],
        ["DELIVERED",stats.delivered],["FAILED",stats.failed],["RTO",stats.rto],["COD",money(stats.cod)]
      ].map(([k,v]:any)=><div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3"><div className="text-xl font-black text-[#C09B30]">{v??0}</div><div className="text-xs uppercase text-slate-400">{k}</div></div>)}
    </section>

    <section className="mb-4 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
      <div className="flex flex-wrap gap-3">
        <select value={selectedWayplan} onChange={e=>setSelectedWayplan(e.target.value)} className="min-h-11 rounded-lg border border-slate-700 bg-[#071827] px-3 text-sm">
          <option value="">All active Wayplans</option>
          {wayplans.map((w:any)=>{const code=w.wayplan_id||w.wayplan_code;return <option key={code} value={code}>{code} · {w.parcel_count} parcels · {w.review_status}</option>})}
        </select>
        <div className="relative min-w-[320px] flex-1">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500"/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Way ID, recipient, township, rider, vehicle..." className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 font-semibold text-black placeholder:text-slate-500"/>
        </div>
      </div>
    </section>

    <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
      <div className="overflow-auto">
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead><tr className="bg-[#C09B30] text-left text-slate-950">
            {["Way ID","Wayplan","Recipient","Phone","Township","Vehicle","Driver","Rider","Helper","Review","Dispatch","Delivery","Scanned","COD"].map(h=><th key={h} className="p-2">{h}</th>)}
          </tr></thead>
          <tbody>
            {visible.map((j:any,i:number)=><tr key={track(j)+i} className="border-b border-slate-800">
              <td className="p-2 font-black text-amber-300">{track(j)}</td>
              <td className="p-2">{j.wayplan_code||"-"}</td>
              <td className="p-2">{j.recipient_name||"-"}</td>
              <td className="p-2">{j.recipient_phone||j.phone_number||"-"}</td>
              <td className="p-2">{j.delivery_township||"-"}</td>
              <td className="p-2">{j.asset_name||j.asset_code||"-"}</td>
              <td className="p-2">{j.driver_name||j.driver_code||"-"}</td>
              <td className="p-2">{j.rider_name||j.rider_code||"-"}</td>
              <td className="p-2">{j.helper_name||j.helper_code||"-"}</td>
              <td className="p-2">{j.review_status||"-"}</td>
              <td className="p-2">{j.dispatch_status||"-"}</td>
              <td className="p-2">{j.delivery_status||"-"}</td>
              <td className="p-2">{j.dispatch_scanned?"YES":"NO"}</td>
              <td className="p-2">{money(j.total_collected_amount||j.cod_amount)}</td>
            </tr>)}
            {!visible.length&&<tr><td colSpan={14} className="p-10 text-center text-slate-500">{loading?"Loading...":"No dispatch records match the current filters."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </main>;
}
