// @ts-nocheck
import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, PackageSearch, RefreshCw, Search, FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProviderTerritoryReview from "@/components/parcel/ProviderTerritoryReview";
import {loadTerritoryLookup,territoryProvider,DEFAULT_PROVIDER_CODES} from "@/lib/providerTerritory";
import { downloadParcelXlsx, openParcelPrintWindow, renderParcelPdf, fromMyanmarDay, untilMyanmarDay } from "@/lib/parcelReportExport";

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
  const [providerReviewRow,setProviderReviewRow]=useState<any|null>(null);
  const [providerChoice,setProviderChoice]=useState("");
  const [territories,setTerritories]=useState(new Map<string,string>());
  const [territoryError,setTerritoryError]=useState("");
  const [provisionalByWay,setProvisionalByWay]=useState<Record<string,{provider:string;reason:string}>>({});
  const [availableProviders,setAvailableProviders]=useState<string[]>([...DEFAULT_PROVIDER_CODES]);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [query,setQuery]=useState("");
  const [fromDate,setFromDate]=useState("");
  const [toDate,setToDate]=useState("");
  const [dateBasis,setDateBasis]=useState("inbound");
  const [kind,setKind]=useState("ALL");
  const [merchant,setMerchant]=useState("ALL");
  const [township,setTownship]=useState("ALL");
  const [age,setAge]=useState("ALL");
  const [status,setStatus]=useState("ALL");
  const [exportBusy,setExportBusy]=useState(false);
  const [exportMessage,setExportMessage]=useState("");
  const [sourceCount,setSourceCount]=useState<number|null>(null);
  const [updatedAt,setUpdatedAt]=useState("");


  useEffect(()=>{
    let alive=true;
    void Promise.all([
      loadTerritoryLookup(),
      (supabase.from("be_data_entry_service_providers") as any)
        .select("provider_code").eq("is_active",true).order("provider_code")
    ]).then(([map,catalog])=>{
      if(!alive)return;
      setTerritories(map);setTerritoryError("");
      if(!catalog.error)setAvailableProviders((catalog.data||[]).map((x:any)=>String(x.provider_code)));
    }).catch((e:any)=>{if(alive)setTerritoryError(e?.message||"Township master unavailable");});
    return ()=>{alive=false;};
  },[]);

  const load=useCallback(async(quiet=false)=>{
    if(!quiet) setLoading(true);
    try{
      const {data,error}=await (supabase as any).rpc("be_warehouse_scan_lifecycle_snapshot_v164");
      if(error || data?.ok === false) throw new Error(error?.message || data?.error || data?.message || "Could not load pending Warehouse parcels.");
      const snapshotRows=Array.isArray(data?.rows)?data.rows:[];
      setRows(snapshotRows);
      const ids=[...new Set(snapshotRows.map((x:any)=>txt(x.delivery_way_id||x.waybill_no)).filter(Boolean))];
      if(ids.length){
        const parts:any[]=[];
        for(let i=0;i<ids.length;i+=1900){
          const answer=await (supabase as any).rpc("be_parcel_temp_provider_batch_v1",{p_way_ids:ids.slice(i,i+1900)});
          if(answer.error){console.warn("Provisional provider lookup unavailable",answer.error.message);parts.push({});}
          else parts.push(answer.data?.items||{});
        }
        setProvisionalByWay(Object.assign({},...parts));
      }else setProvisionalByWay({});
      setSourceCount(Number.isFinite(Number(data?.stats?.total_ways))?Number(data.stats.total_ways):null);
      setUpdatedAt(new Date().toISOString());
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
    const territory=territoryProvider(row.delivery_township||row.township,row.delivery_region||row.destination_region,territories);
    const selected=provisionalByWay[txt(row.delivery_way_id||row.waybill_no)]?.provider;
    return {...row,_ageHours:ageHours,_overdue:ageHours>=48,
      _pendingType:failedReturn?"FAILED RETURN / REPLAN":"NEW INBOUND",
      _suggestedProvider:territory.code,_providerRegion:territory.region,
      _providerNeedsReview:territories.size>0&&territory.needsReview,
      _providerEffectiveTemporary:selected||territory.code,
      _providerManual:Boolean(selected),
      _providerReason:territory.reason
    };
  }).sort((a:any,b:any)=>b._ageHours-a._ageHours),[rows,territories,provisionalByWay]);

  const overdue=useMemo(()=>pending.filter((r:any)=>r._overdue),[pending]);
  const inboundPending=useMemo(()=>pending.filter((r:any)=>r._pendingType==="NEW INBOUND"),[pending]);
  const failedPending=useMemo(()=>pending.filter((r:any)=>r._pendingType!=="NEW INBOUND"),[pending]);


  const merchantOptions=useMemo(()=>[...new Set(pending.map(r=>txt(r.merchant_name||r.merchant_code)).filter(Boolean))].sort(),[pending]);
  const townshipOptions=useMemo(()=>[...new Set(pending.map(r=>txt(r.delivery_township)).filter(Boolean))].sort(),[pending]);
  const warehouseStatuses=useMemo(()=>[...new Set(pending.map(r=>txt(r.warehouse_scan_status||r.warehouse_status).toUpperCase()||"UNKNOWN"))].sort(),[pending]);
  const validDates=!fromDate||!toDate||fromDate<=toDate;
  const visible=useMemo(()=>pending.filter((r:any)=>{
    const t=dateBasis==="return"?(r.last_return_scan_at||r.return_scan_3_at||r.return_scan_2_at||r.return_scan_1_at):r.inbound_scan_at;
    const millis=t?new Date(t).getTime():NaN;
    const start=fromMyanmarDay(fromDate),end=untilMyanmarDay(toDate);
    if((start||end)&&(!Number.isFinite(millis)||(start&&millis<new Date(start).getTime())||(end&&millis>=new Date(end).getTime())))return false;
    if(kind!=="ALL"&&r._pendingType!==kind)return false;
    if(merchant!=="ALL"&&txt(r.merchant_name||r.merchant_code)!==merchant)return false;
    if(township!=="ALL"&&txt(r.delivery_township)!==township)return false;
    if(age==="OVERDUE"&&!r._overdue)return false;
    if(age==="RECENT"&&r._overdue)return false;
    if(status!=="ALL"&&(txt(r.warehouse_scan_status||r.warehouse_status).toUpperCase()||"UNKNOWN")!==status)return false;
    const q=query.trim().toLowerCase();
    return !q||[r.delivery_way_id,r.waybill_no,r.pickup_id,r.merchant_name,r.merchant_code,r.recipient_name,r.recipient_phone,r.phone_number,r.delivery_township,r.pending_return_reason_name,r.last_exception_reason].join(" ").toLowerCase().includes(q);
  }),[pending,query,fromDate,toDate,dateBasis,kind,merchant,township,age,status]);
  const incomplete=sourceCount!==null&&sourceCount>rows.length;
  const canExport=validDates&&!loading&&!message&&!exportBusy&&!incomplete&&visible.length>0;
  const criteria=["Date basis: "+(dateBasis==="return"?"last return scan":"inbound scan"),"Dates: "+(fromDate||"All")+" through "+(toDate||"All")+" (Myanmar)","Type: "+kind,"Merchant: "+merchant,"Township: "+township,"Age: "+age,"Warehouse status: "+status,"Search: "+(query||"All")].join("; ");
  const reportFields=[
    {key:"alert",label:"Alert"},{key:"way",label:"Delivery Way ID"},{key:"pickup",label:"Pickup ID"},{key:"type",label:"Type"},
    {key:"merchant",label:"Merchant"},{key:"merchantCode",label:"Merchant Code"},{key:"recipient",label:"Recipient"},{key:"phone",label:"Phone"},
    {key:"township",label:"Township"},{key:"inbound",label:"Inbound Scan (Myanmar)"},{key:"age",label:"Pending Age Hours"},
    {key:"reason",label:"Failed Reason"},{key:"returned",label:"Last Return (Myanmar)"},{key:"attempts",label:"Return Attempts"},
    {key:"wayplan",label:"Wayplan"},{key:"wayplanStatus",label:"Wayplan Status"},
    {key:"suggestedProvider",label:"Territory Default"},{key:"temporaryProvider",label:"Provider (provisional)"},{key:"providerBasis",label:"Provider Basis"}
  ];
  const exportRows=()=>visible.map(r=>({
    alert:r._overdue?"48H+":"",way:txt(r.delivery_way_id||r.waybill_no),pickup:txt(r.pickup_id),type:r._pendingType,
    merchant:txt(r.merchant_name||r.merchant_code),merchantCode:txt(r.merchant_code),
    recipient:txt(r.recipient_name),phone:txt(r.recipient_phone||r.phone_number),township:txt(r.delivery_township),
    inbound:fmt(r.inbound_scan_at),age:Number(r._ageHours||0).toFixed(1),
    reason:txt(r.pending_return_reason_name||r.last_exception_reason),returned:fmt(r.last_return_scan_at),
    attempts:Number(r.return_attempt_count||r.physical_return_scan_count||0),
    wayplan:txt(r.active_wayplan_id)||"NOT IN WAYPLAN",wayplanStatus:txt(r.active_wayplan_status)||"NOT IN WAYPLAN",
    suggestedProvider:r._suggestedProvider,temporaryProvider:r._providerEffectiveTemporary,providerBasis:r._providerManual?"AUDITED_OVERRIDE":r._providerReason
  }));
  function clearFilters(){setQuery("");setFromDate("");setToDate("");setDateBasis("inbound");setKind("ALL");setMerchant("ALL");setTownship("ALL");setAge("ALL");setStatus("ALL");setExportMessage("");}
  async function exportReport(format:"excel"|"pdf"){
    if(!canExport)return;
    const windowForPrint=format==="pdf"?openParcelPrintWindow():null;
    if(format==="pdf"&&!windowForPrint){setExportMessage("Please allow pop-ups to save the PDF.");return;}
    setExportBusy(true);setExportMessage("");
    try{
      const report=exportRows();
      if(format==="pdf"){
        if(report.length>2000)throw new Error("PDF is limited to 2,000 parcels. Apply narrower filters or use Excel.");
        renderParcelPdf(windowForPrint!,report,reportFields,fromDate,toDate,"Britium Express — Warehouse Pending Parcels",criteria);
      }else{
        await downloadParcelXlsx(report,reportFields,fromDate,toDate,"Britium_Warehouse_Pending_"+new Date().toISOString().slice(0,10)+".xlsx","Britium Express — Warehouse Pending Parcels",criteria);
      }
      setExportMessage(format==="pdf"?"Print-ready PDF report opened.":"Excel exported: "+report.length+" matching pending parcels.");
    }catch(e:any){if(windowForPrint&&!windowForPrint.closed)windowForPrint.close();setExportMessage(e?.message||"Export failed.");}
    finally{setExportBusy(false);}
  }

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

      {territoryError && <div role="alert" className="mb-4 rounded-lg bg-amber-950 p-3 text-amber-200">Township master unavailable; provider suggestions may use Royal fallback. Refresh before making changes. {territoryError}</div>}
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

        <section aria-label="Warehouse Pending Report Filters" className="mb-4 rounded-xl border border-slate-700 bg-[#132c41] p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label className="text-xs font-bold text-slate-300">Date basis<select value={dateBasis} onChange={e=>setDateBasis(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="inbound">Inbound scan</option><option value="return">Last return scan</option></select></label>
            <label className="text-xs font-bold text-slate-300">From (Myanmar)<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"/></label>
            <label className="text-xs font-bold text-slate-300">To (Myanmar)<input type="date" min={fromDate||undefined} value={toDate} onChange={e=>setToDate(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"/></label>
            <label className="text-xs font-bold text-slate-300">Pending type<select value={kind} onChange={e=>setKind(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="ALL">All types</option><option value="NEW INBOUND">New inbound</option><option value="FAILED RETURN / REPLAN">Failed return / replan</option></select></label>
            <label className="text-xs font-bold text-slate-300">Merchant<select value={merchant} onChange={e=>setMerchant(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="ALL">All merchants</option>{merchantOptions.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-300">Township<select value={township} onChange={e=>setTownship(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="ALL">All townships</option>{townshipOptions.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-300">Pending age<select value={age} onChange={e=>setAge(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="ALL">All ages</option><option value="OVERDUE">48+ hours overdue</option><option value="RECENT">Under 48 hours</option></select></label>
            <label className="text-xs font-bold text-slate-300">Warehouse status<select value={status} onChange={e=>setStatus(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg bg-white px-2 text-slate-950"><option value="ALL">All warehouse states</option>{warehouseStatuses.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          {!validDates&&<p role="alert" className="mt-2 text-sm font-semibold text-rose-300">From date cannot be after To date.</p>}
          {incomplete&&<p role="alert" className="mt-2 text-sm font-semibold text-rose-300">Snapshot may be incomplete. Exports disabled; refresh or investigate data source.</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
            <div className="text-xs text-slate-300"><strong className="text-amber-300">{visible.length}</strong> matching parcels · <strong className="text-rose-300">{visible.filter(r=>r._overdue).length}</strong> overdue · Last refresh: {updatedAt?fmt(updatedAt):"—"}</div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg border border-slate-500 px-3 text-xs font-bold text-white hover:bg-slate-700">Clear filters</button>
              <button type="button" onClick={()=>void exportReport("excel")} disabled={!canExport} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40"><FileSpreadsheet className="h-4 w-4"/>Download Excel</button>
              <button type="button" onClick={()=>void exportReport("pdf")} disabled={!canExport} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-40"><FileText className="h-4 w-4"/>PDF / Print</button>
            </div>
          </div>
          {exportMessage&&<p role="status" className="mt-2 text-xs font-semibold text-cyan-300">{exportMessage}</p>}
        </section>
        <div className="overflow-auto">
          <table className="w-full min-w-[1700px] border-collapse text-sm">
            <thead><tr className="bg-amber-400 text-left text-slate-950">
              {["Alert","Delivery Way","Pickup","Type","Merchant","Recipient","Township","Provider (auto)","Change provider","Inbound Scan","Pending Age","Failed Reason","Last Return","Wayplan"].map(h=><th key={h} className="p-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {visible.map((r:any,i:number)=><Fragment key={txt(r.delivery_way_id)+i}><tr className={"border-b border-slate-800 "+(r._overdue?"bg-red-950/25":"")}>
                <td className="p-2">{r._overdue?<span className="rounded bg-red-500 px-2 py-1 text-xs font-black text-white">48H+</span>:<span className="text-slate-500">-</span>}</td>
                <td className="p-2 font-black text-amber-300">{txt(r.delivery_way_id || r.waybill_no)}</td>
                <td className="p-2">{txt(r.pickup_id)}</td>
                <td className="p-2"><span className="rounded border border-slate-700 px-2 py-1 text-xs font-bold">{r._pendingType}</span></td>
                <td className="p-2">{txt(r.merchant_name || r.merchant_code)}</td>
                <td className="p-2">{txt(r.recipient_name)}<div className="text-xs text-slate-400">{txt(r.recipient_phone || r.phone_number)}</div></td>
                <td className="p-2">{txt(r.delivery_township)}</td>
                <td className="p-2"><span className="font-bold text-emerald-300">{r._providerEffectiveTemporary}</span>
                  {r._providerManual&&<div className="text-[10px] text-cyan-300">Manual exception · audited</div>}
                  {r._providerNeedsReview&&<div className="text-[10px] text-amber-300">Township not matched — verify destination</div>}
                </td>
                <td className="p-2">
                  <select aria-label={"Provider exception for "+txt(r.delivery_way_id||r.waybill_no)}
                    value={providerReviewRow===r?providerChoice:r._providerEffectiveTemporary}
                    onChange={e=>{
                      if(e.target.value===r._providerEffectiveTemporary){setProviderReviewRow(null);return;}
                      setProviderChoice(e.target.value);setProviderReviewRow(r);
                    }}
                    className="min-h-10 w-[180px] rounded-md border border-slate-400 bg-white p-2 text-xs font-semibold text-slate-900">
                    {availableProviders.map(x=><option key={x} value={x}>{x}</option>)}
                  </select>
                  {providerReviewRow===r&&<button type="button" onClick={()=>setProviderReviewRow(null)} className="mt-1 block text-xs text-cyan-300 underline">Cancel correction</button>}
                </td>
                <td className="p-2">{fmt(r.inbound_scan_at)}</td>
                <td className={"p-2 font-black "+(r._overdue?"text-red-300":"text-cyan-300")}><Clock3 className="mr-1 inline h-4 w-4"/>{Number(r._ageHours||0).toFixed(1)} h</td>
                <td className="max-w-[260px] p-2">{txt(r.pending_return_reason_name || r.last_exception_reason) || "-"}</td>
                <td className="p-2">{fmt(r.last_return_scan_at)}</td>
                <td className="p-2">{txt(r.active_wayplan_id) || <span className="font-black text-red-300">NOT IN WAYPLAN</span>}</td>
              </tr>
              {providerReviewRow===r&&<tr className="border-b border-cyan-500/50 bg-white text-slate-900">
                <td colSpan={14} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <strong>Exceptional provider correction · {txt(r.delivery_way_id||r.waybill_no)}</strong>
                    <button type="button" onClick={()=>setProviderReviewRow(null)} className="text-sm font-semibold text-blue-700 underline">Close</button>
                  </div>
                  <ProviderTerritoryReview key={txt(r.delivery_way_id||r.waybill_no)+"-"+providerChoice}
                    wayId={txt(r.delivery_way_id||r.waybill_no)}
                    township={txt(r.delivery_township)||null} region={txt(r._providerRegion)||null}
                    initialProvider={providerChoice} recordedProvider={txt(r.recorded_provider_code)||null}
                    onChanged={()=>{setProviderReviewRow(null);void load(true);}}/>
                </td>
              </tr>}
              </Fragment>)}
              {!visible.length && <tr><td colSpan={14} className="p-12 text-center text-slate-400">{loading?"Loading...":"No pending Warehouse parcels match the current filter."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  </main>;
}
