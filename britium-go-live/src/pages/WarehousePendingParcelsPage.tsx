// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, PackageSearch, RefreshCw, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const fmt = (v:any) => v ? new Date(v).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}) : "-";
const txt = (v:any) => String(v ?? "").trim();

function hoursSince(raw:any){
  if(!raw) return 0;
  const ms = Date.now() - new Date(raw).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0;
}

function isTerminal(row:any){
  const values = [
    row.delivery_status,row.current_lifecycle_status,row.dispatch_workflow_stage,
    row.warehouse_scan_status,row.active_wayplan_status
  ].map((v:any)=>txt(v).toUpperCase());
  return values.some((v:string)=>["DELIVERED","RTO","CANCELLED","CANCELED","RETURN_TO_SENDER","COMPLETED"].includes(v));
}

function hasActiveWayplan(row:any){
  if(txt(row.active_wayplan_id)) return true;
  const membership=txt(row.membership_status).toUpperCase();
  const status=txt(row.active_wayplan_status).toUpperCase();
  return ["PLANNED","REVIEWED","APPROVED","READY_FOR_DISPATCH","DISPATCH_READY","DISPATCHED","OUT_FOR_DELIVERY","ACTIVE","IN_PROGRESS"].includes(membership)
    || ["PLANNED","REVIEWED","APPROVED","READY_FOR_DISPATCH","DISPATCH_READY","DISPATCHED","OUT_FOR_DELIVERY","ACTIVE","IN_PROGRESS"].includes(status);
}

function returnedAfterDispatch(row:any){
  const returned = row.last_return_scan_at || row.return_scan_3_at || row.return_scan_2_at || row.return_scan_1_at;
  if(!returned) return false;
  const dispatched = row.last_dispatch_scan_at || row.dispatch_scan_at;
  if(!dispatched) return true;
  return new Date(returned).getTime() >= new Date(dispatched).getTime();
}

function isPendingForWayplan(row:any){
  if(row.branch_receipt_current === false) return false;
  if(!row.inbound_scan_at || isTerminal(row) || hasActiveWayplan(row)) return false;

  const delivery=txt(row.delivery_status).toUpperCase();
  const stage=txt(row.dispatch_workflow_stage).toUpperCase();
  if(["OUT_FOR_DELIVERY","RIDER_ACCEPTED","DELIVERY_ACCEPTED","ACCEPTED_FOR_DELIVERY","ARRIVED_AT_CUSTOMER"].includes(delivery)) return false;
  if(["OUT_FOR_DELIVERY","DISPATCHED_TO_FIELD"].includes(stage)) return false;

  const failedReturn = Boolean(row.next_attempt_priority)
    || Number(row.return_attempt_count || row.physical_return_scan_count || 0) > 0
    || returnedAfterDispatch(row);

  const newInbound = !row.dispatch_scan_at
    && !row.last_dispatch_scan_at
    && ["RECEIVED","WAREHOUSE_RECEIVED","WAREHOUSE_READY","READY_FOR_DELIVERY","READY_FOR_WAYPLAN",""].includes(txt(row.warehouse_scan_status || row.warehouse_status).toUpperCase());

  return failedReturn || newInbound;
}

export default function WarehousePendingParcelsPage(){
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const [merchant,setMerchant]=useState("ALL");
  const [type,setType]=useState("ALL");
  const [age,setAge]=useState("ALL");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState("");

  const load=useCallback(async(quiet=false)=>{
    if(!quiet) setLoading(true);
    try{
      const {data,error}=await (supabase as any).rpc("be_warehouse_scan_lifecycle_snapshot_v164");
      if(error || data?.ok === false) throw new Error(error?.message || data?.error || data?.message || "Could not load pending Warehouse parcels.");
      setRows(Array.isArray(data?.rows)?data.rows:[]);
      setMessage("");
    }catch(e:any){
      setMessage(e?.message || "Could not load pending Warehouse parcels.");
    }finally{
      if(!quiet) setLoading(false);
    }
  },[]);

  useEffect(()=>{
    void load(false);
    const timer=window.setInterval(()=>void load(true),60000);
    return ()=>window.clearInterval(timer);
  },[load]);

  const pending=useMemo(()=>rows.filter(isPendingForWayplan).map((row:any)=>{
    const dwell = row.dwell_hours == null || txt(row.dwell_hours) === "" ? NaN : Number(row.dwell_hours);
    const ageHours = Number.isFinite(dwell) && dwell >= 0 ? dwell : hoursSince(row.inbound_scan_at);
    const failedReturn = Boolean(row.next_attempt_priority)
      || Number(row.return_attempt_count || row.physical_return_scan_count || 0)>0
      || returnedAfterDispatch(row);
    return {...row,_ageHours:ageHours,_overdue:ageHours>=48,_pendingType:failedReturn?"FAILED RETURN / REPLAN":"NEW INBOUND"};
  }).sort((a:any,b:any)=>b._ageHours-a._ageHours),[rows]);

  const overdue=useMemo(()=>pending.filter((r:any)=>r._overdue),[pending]);
  const inboundPending=useMemo(()=>pending.filter((r:any)=>r._pendingType==="NEW INBOUND"),[pending]);
  const failedPending=useMemo(()=>pending.filter((r:any)=>r._pendingType!=="NEW INBOUND"),[pending]);

  const merchants=useMemo(()=>Array.from(new Set(pending.map((r:any)=>txt(r.merchant_name||r.merchant_code)).filter(Boolean))).sort(),[pending]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return pending.filter((r:any)=>{
      if(merchant!=="ALL" && txt(r.merchant_name||r.merchant_code)!==merchant) return false;
      if(type!=="ALL" && r._pendingType!==type) return false;
      if(age==="OVERDUE" && !r._overdue) return false;
      if(age==="CURRENT" && r._overdue) return false;
      if(from||to){
        const d=new Date(r.inbound_scan_at);
        if(!Number.isFinite(d.getTime()))return false;
        const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yangon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
        const get=(k:string)=>p.find(x=>x.type===k)?.value||"";
        const date=[get("year"),get("month"),get("day")].join("-");
        if(from && date<from)return false;
        if(to && date>to)return false;
      }
      return !q || [r.delivery_way_id,r.waybill_no,r.pickup_id,r.merchant_name,r.merchant_code,r.recipient_name,r.recipient_phone,r.phone_number,r.delivery_township,r.pending_return_reason_name,r.last_exception_reason].join(" ").toLowerCase().includes(q);
    });
  },[pending,query,merchant,type,age,from,to]);

  const exportExcel=async()=>{
    if(exporting||!visible.length||Boolean(from&&to&&from>to))return;
    setExporting(true);setExportError("");
    try{
      const XLSX=await import("xlsx");
      const events:any[]=[];
      const items=visible.map((r:any)=>{
        const way=txt(r.delivery_way_id||r.waybill_no);
        const merchantName=txt(r.merchant_name||r.merchant_code);
        const timestamps:[string,string][]=[
          ["Inbound scan","inbound_scan_at"],["Dispatch scan","dispatch_scan_at"],
          ["Last dispatch","last_dispatch_scan_at"],["Return attempt 1","return_scan_1_at"],
          ["Return attempt 2","return_scan_2_at"],["Return attempt 3","return_scan_3_at"],
          ["Last return","last_return_scan_at"]
        ];
        timestamps.forEach(([event,key])=>{if(r[key])events.push({"Way ID":way,"Merchant":merchantName,"Event":event,"Myanmar time":fmt(r[key]),"UTC timestamp":txt(r[key])});});
        return {
          "Way ID":way,"Pickup":txt(r.pickup_id),"Merchant":merchantName,
          "Merchant code":txt(r.merchant_code),"Recipient":txt(r.recipient_name),
          "Recipient phone":txt(r.recipient_phone||r.phone_number),
          "Township":txt(r.delivery_township),"Pending type":r._pendingType,
          "Overdue 48h":r._overdue?"YES":"NO","Age hours":Number(r._ageHours.toFixed(1)),
          "Inbound time":fmt(r.inbound_scan_at),"Last dispatch":fmt(r.last_dispatch_scan_at||r.dispatch_scan_at),
          "Last return":fmt(r.last_return_scan_at),
          "Return attempts":Number(r.return_attempt_count||r.physical_return_scan_count||0),
          "Failure reason":txt(r.pending_return_reason_name||r.last_exception_reason),
          "Delivery status":txt(r.delivery_status),
          "Warehouse status":txt(r.warehouse_scan_status||r.warehouse_status),
          "Wayplan":txt(r.active_wayplan_id)
        };
      });
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(items),"Pending Parcels");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(events.length?events:[{"Way ID":"","Event":"No timestamp events available"}]),"Parcel Timeline");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
        ["Report","Warehouse pending parcels"],["Exported (Myanmar time)",fmt(new Date())],
        ["Inbound from",from||"All"],["Inbound to",to||"All"],
        ["Merchant",merchant],["Pending category",type],["Age",age],
        ["Search",query||"All"],["Number of parcels",items.length],
        ["Timeline scope","Only event timestamps supplied by the warehouse snapshot"]
      ]),"Filters");
      XLSX.writeFile(wb,"Warehouse_Pending_"+new Date().toISOString().slice(0,10)+".xlsx");
    }catch(e:any){setExportError(e?.message||"Could not export Excel");}
    finally{setExporting(false);}
  };

  return <main className="min-h-screen bg-[#07111e] p-6 text-slate-100">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-amber-400"/>
          <div>
            <div className="font-black tracking-[.12em] text-amber-400">WAREHOUSE PENDING PARCELS</div>
            <div className="text-sm text-slate-400">Inbound / returned parcels that are eligible for Wayplan but are not currently included in an active Wayplan.</div>
          </div>
        </div>
        <button onClick={()=>void load(false)} disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 font-bold disabled:opacity-50">
          <RefreshCw className={"mr-2 inline h-4 w-4 "+(loading?"animate-spin":"")}/>Refresh
        </button>
      </header>

      {overdue.length>0 && <div className="sticky top-2 z-20 mb-4 rounded-xl border-2 border-red-500 bg-red-950/95 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-300"/>
          <div>
            <div className="text-lg font-black text-red-200">48+ HOURS OVERDUE — {overdue.length} PENDING PARCEL{overdue.length===1?"":"S"}</div>
            <div className="mt-1 text-sm text-red-100">These parcels have remained pending for more than 48 hours after inbound scan and still have no active Wayplan. This alert stays visible and the page rechecks every minute.</div>
          </div>
        </div>
      </div>}

      {message && <div className="mb-4 rounded-lg border border-red-700 bg-red-950/30 p-3 text-red-200">{message}</div>}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["TOTAL PENDING",pending.length,"text-amber-300"],
          ["NEW INBOUND PENDING",inboundPending.length,"text-cyan-300"],
          ["FAILED RETURN / REPLAN",failedPending.length,"text-violet-300"],
          ["OVER 48 HOURS",overdue.length,overdue.length?"text-red-300":"text-emerald-300"],
        ].map(([label,value,color]:any)=><div key={label} className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
          <div className={"text-2xl font-black "+color}>{value}</div>
          <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
        </div>)}
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Pending Wayplan List</h2>
            <p className="text-xs text-slate-400">Pending = physically received / returned for another attempt, not terminal, and not currently linked to an active Wayplan.</p>
          </div>
          <div className="relative min-w-[320px] flex-1 sm:max-w-xl">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500"/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Way ID, merchant, recipient, township..." className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 font-semibold text-black placeholder:text-slate-500"/>
          </div>
        </div>

        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-slate-300">Inbound from<input aria-label="Inbound from" type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"/></label>
          <label className="text-xs text-slate-300">Inbound to<input aria-label="Inbound to" type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"/></label>
          <label className="text-xs text-slate-300">Merchant<select aria-label="Merchant" value={merchant} onChange={e=>setMerchant(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All merchants</option>{merchants.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          <label className="text-xs text-slate-300">Pending category<select aria-label="Pending category" value={type} onChange={e=>setType(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All</option><option value="NEW INBOUND">New inbound</option><option value="FAILED RETURN / REPLAN">Failed return / replan</option></select></label>
          <label className="text-xs text-slate-300">Pending age<select aria-label="Pending age" value={age} onChange={e=>setAge(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All</option><option value="OVERDUE">48+ hours</option><option value="CURRENT">Under 48 hours</option></select></label>
          <div className="flex items-end gap-2"><button type="button" className="rounded border border-slate-400 p-2" onClick={()=>{setQuery("");setMerchant("ALL");setType("ALL");setAge("ALL");setFrom("");setTo("");}}>Clear</button><button type="button" onClick={()=>void exportExcel()} disabled={loading||exporting||!visible.length||Boolean(from&&to&&from>to)} className="flex-1 rounded bg-emerald-600 p-2 font-bold disabled:opacity-50"><Download className="mr-1 inline h-4 w-4"/>{exporting?"Exporting":"Export Excel"}</button></div>
        </div>
        <p className="mb-2 text-xs text-slate-300">Showing {visible.length} of {pending.length} parcels. Inbound dates use Myanmar time. Export reflects current filters.</p>
        {from&&to&&from>to&&<p role="alert" className="text-red-300">Start date must be before end date.</p>}
        {exportError&&<p role="alert" className="text-red-300">{exportError}</p>}
        <div className="overflow-auto">
          <table className="w-full min-w-[1450px] border-collapse text-sm">
            <thead><tr className="bg-amber-400 text-left text-slate-950">
              {["Alert","Delivery Way","Pickup","Type","Merchant","Recipient","Township","Inbound Scan","Pending Age","Failed Reason","Last Return","Wayplan"].map(h=><th key={h} className="p-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {visible.map((r:any,i:number)=><tr key={txt(r.delivery_way_id)+i} className={"border-b border-slate-800 "+(r._overdue?"bg-red-950/25":"")}>
                <td className="p-2">{r._overdue?<span className="rounded bg-red-500 px-2 py-1 text-xs font-black text-white">48H+</span>:<span className="text-slate-500">-</span>}</td>
                <td className="p-2 font-black text-amber-300">{txt(r.delivery_way_id || r.waybill_no)}</td>
                <td className="p-2">{txt(r.pickup_id)}</td>
                <td className="p-2"><span className="rounded border border-slate-700 px-2 py-1 text-xs font-bold">{r._pendingType}</span></td>
                <td className="p-2">{txt(r.merchant_name || r.merchant_code)}</td>
                <td className="p-2">{txt(r.recipient_name)}<div className="text-xs text-slate-400">{txt(r.recipient_phone || r.phone_number)}</div></td>
                <td className="p-2">{txt(r.delivery_township)}</td>
                <td className="p-2">{fmt(r.inbound_scan_at)}</td>
                <td className={"p-2 font-black "+(r._overdue?"text-red-300":"text-cyan-300")}><Clock3 className="mr-1 inline h-4 w-4"/>{Number(r._ageHours||0).toFixed(1)} h</td>
                <td className="max-w-[260px] p-2">{txt(r.pending_return_reason_name || r.last_exception_reason) || "-"}</td>
                <td className="p-2">{fmt(r.last_return_scan_at)}</td>
                <td className="p-2">{txt(r.active_wayplan_id) || <span className="font-black text-red-300">NOT IN WAYPLAN</span>}</td>
              </tr>)}
              {!visible.length && <tr><td colSpan={12} className="p-12 text-center text-slate-400">{loading?"Loading...":"No pending Warehouse parcels match the current filter."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}
