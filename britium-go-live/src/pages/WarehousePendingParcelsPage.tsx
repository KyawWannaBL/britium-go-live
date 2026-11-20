// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, PackageSearch, RefreshCw, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const fmt = (v:any) => v ? new Date(v).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}) : "-";
const txt = (v:any) => String(v ?? "").trim();
const excelText=(v:any)=>{
  const value=txt(v);
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? String.fromCharCode(39)+value : value;
};

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
  if(["OUT_FOR_DELIVERY","DISPATCHED_TO_FIELD","SCHEDULED_HOLD","AWAITING_RETURN_SCAN","DISPATCH_SCAN_REQUIRED","DISPATCH_SCANNED","SUPERVISOR_APPROVED_AWAITING_RELEASE","IN_WAYPLAN_AWAITING_SUPERVISOR"].includes(stage)) return false;

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
  const [provider,setProvider]=useState("ALL");
  const [type,setType]=useState("ALL");
  const [age,setAge]=useState("ALL");
  const [dateBasis,setDateBasis]=useState("INBOUND");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [exporting,setExporting]=useState(false);
  const [exportError,setExportError]=useState("");
  const [selectedWays,setSelectedWays]=useState<Record<string,boolean>>({});
  const [handoffBusy,setHandoffBusy]=useState(false);
  const [providerMetadataReady,setProviderMetadataReady]=useState(false);
  const draftTransferFeatureEnabled=import.meta.env.VITE_BE_PROVIDER_TRANSFER_CREATOR_ENABLED==="true";
  const [transferGroup,setTransferGroup]=useState("");
  const [transferSelection,setTransferSelection]=useState<Record<string,boolean>>({});
  const [transferVehicle,setTransferVehicle]=useState("");
  const [transferDriver,setTransferDriver]=useState("");
  const [transferDraftBusy,setTransferDraftBusy]=useState(false);
  const [transferDraftResult,setTransferDraftResult]=useState("");

  const [handoffNotice,setHandoffNotice]=useState("");
  const [handoffErrors,setHandoffErrors]=useState<string[]>([]);

  const load=useCallback(async(quiet=false)=>{
    if(!quiet) setLoading(true);
    try{
      // Enriched provider data is optional during phased UAT rollout. The old
      // authorized Warehouse snapshot remains the read-only fallback.
      let result=await (supabase as any).rpc("be_warehouse_provider_transfer_preview_v1");
      if(["PGRST202","42883","42P01"].includes(String(result.error?.code||""))){
        result=await (supabase as any).rpc("be_warehouse_scan_lifecycle_snapshot_v211");
      }
      const {data,error}=result;
      setProviderMetadataReady(!error && data?.provider_transfer_preview===true);
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
  const providers=useMemo(()=>Array.from(new Set(pending.map((r:any)=>txt(r.service_provider_code)).filter(Boolean))).sort(),[pending]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return pending.filter((r:any)=>{
      if(merchant!=="ALL" && txt(r.merchant_name||r.merchant_code)!==merchant) return false;
      if(provider!=="ALL" && txt(r.service_provider_code)!==provider) return false;
      if(type!=="ALL" && r._pendingType!==type) return false;
      if(age==="OVERDUE" && !r._overdue) return false;
      if(age==="CURRENT" && r._overdue) return false;
      if(from||to){
        const d=new Date(dateBasis==="RETURN" ? (r.last_return_scan_at||r.return_scan_3_at||r.return_scan_2_at||r.return_scan_1_at) : r.inbound_scan_at);
        if(!Number.isFinite(d.getTime()))return false;
        const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Yangon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
        const get=(k:string)=>p.find(x=>x.type===k)?.value||"";
        const date=[get("year"),get("month"),get("day")].join("-");
        if(from && date<from)return false;
        if(to && date>to)return false;
      }
      return !q || [r.delivery_way_id,r.waybill_no,r.pickup_id,r.merchant_name,r.merchant_code,r.recipient_name,r.recipient_phone,r.phone_number,r.delivery_township,r.pending_return_reason_name,r.last_exception_reason].join(" ").toLowerCase().includes(q);
    });
  },[pending,query,merchant,provider,type,age,from,to,dateBasis]);

  // A Warehouse READY handoff is not a dispatch scan: Supervisor release and
  // physical dispatch scanning remain mandatory for every provider.
  const selectableReceived=useMemo(()=>visible.filter((r:any)=>{
    if(!providerMetadataReady)return false;
    const status=txt(r.warehouse_scan_status||r.warehouse_status).toUpperCase();
    const stage=txt(r.dispatch_workflow_stage).toUpperCase();
    const freshInbound=r._pendingType==="NEW INBOUND"
      && ["RECEIVED","WAREHOUSE_READY","WAREHOUSE_RECEIVED"].includes(status);
    // Replan only after a physical return scan; exclude future holds and RTO.
    const returnedForReplan=r._pendingType==="FAILED RETURN / REPLAN"
      && ["RETURN_SCANNED","WAREHOUSE_READY"].includes(status)
      && stage==="RETURNED_WAITING_REPLAN"
      && Number(r.physical_return_scan_count||0)>0
      && Number(r.physical_return_scan_count||0)<3;
    return (freshInbound||returnedForReplan)
      && txt(r.provider_planning_gate)==="REGIONAL_WAYPLAN_REVIEW"
      && !r.active_wayplan_id
      && r.branch_receipt_current!==false;
  }),[visible,providerMetadataReady]);
  const readyIds=useMemo(()=>new Set(selectableReceived.map((r:any)=>txt(r.delivery_way_id||r.waybill_no)).filter(Boolean)),[selectableReceived]);
  const selectedIds=useMemo(()=>Object.keys(selectedWays).filter(id=>selectedWays[id]&&readyIds.has(id)),[selectedWays,readyIds]);

  const handoffReceived=async()=>{
    if(handoffBusy || loading || !selectedIds.length) return;
    const ids=selectedIds.slice(0,100);
    if(!window.confirm("Mark "+ids.length+" received or returned parcel(s) WAREHOUSE_READY and send them to Wayplan Command? This does not dispatch or confirm third-party delivery. Existing authorization and scan gates remain enforced."))return;
    setHandoffBusy(true);
    setHandoffErrors([]);
    setHandoffNotice("");
    const done:string[]=[];
    const failures:string[]=[];
    try {
      for(const id of ids){
        try{
          const {data,error}=await (supabase as any).rpc("be_warehouse_mark_delivery_ready_v150",{p_delivery_way_id:id});
          if(error)throw error;
          if(data?.ok!==true)throw new Error(data?.message||data?.error||"Not eligible");
          done.push(id);
        }catch(e:any){
          failures.push(id+": "+(e?.message||"Readiness confirmation failed"));
        }
      }
      setSelectedWays(previous=>{
        const next={...previous};
        done.forEach(id=>delete next[id]);
        return next;
      });
      if(done.length){
        // The existing Command Center validates that these IDs are actually
        // present in its authorized region queue before preselecting them.
        window.sessionStorage.setItem("be_wayplan_handoff_ids_v150",JSON.stringify(done));
        window.sessionStorage.setItem("be_wayplan_handoff_notice_v150",
          done.length+" received parcel(s) staged for Wayplan review; assign the correct service provider and follow Supervisor/dispatch scan steps.");
      }
      setHandoffErrors(failures);
      setHandoffNotice(done.length+" of "+ids.length+" parcel(s) marked ready. "+(failures.length?"Review rejected IDs before retrying.":"Open Wayplan Command to review the batch alongside pickup ways."));
      await load(false);
    }finally{setHandoffBusy(false);}
  };

  const transferCandidates=useMemo(()=>visible.filter((r:any)=>[
    "NEEDS_PROVIDER_TRANSFER_WAYPLAN","NEEDS_BRANCH_TRANSFER_WAYPLAN",
    "PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN",
    "BRANCH_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN"
  ].includes(txt(r.provider_planning_gate))),[visible]);
  const transferBreakdown=useMemo(()=>{
    const groups=new Map<string,{provider:string;site:string;count:number;verified:boolean}>();
    transferCandidates.forEach((r:any)=>{
      const provider=txt(r.service_provider_code)||"UNSET";
      const site=txt(r.handover_location_name)||"SITE NOT VERIFIED";
      const key=provider+"|"+site;
      const entry=groups.get(key)||{provider,site,count:0,verified:r.handover_location_verified===true};
      entry.count+=1;
      groups.set(key,entry);
    });
    return Array.from(groups.values()).sort((a,b)=>b.count-a.count||a.provider.localeCompare(b.provider));
  },[transferCandidates]);

  const draftTransferCandidates=useMemo(()=>transferCandidates.filter((r:any)=>
    r.handover_location_verified===true
    && ["PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN","BRANCH_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN"].includes(txt(r.provider_planning_gate))
    && txt(r.authoritative_receipt_status)==="WAREHOUSE_READY"
    && !r.active_wayplan_id
  ),[transferCandidates]);
  const transferGroups=useMemo(()=>{
    const m=new Map<string,{key:string;label:string;rows:any[]}>();
    draftTransferCandidates.forEach((r:any)=>{
      const key=[txt(r.service_provider_code),txt(r.handover_origin_branch),txt(r.handover_location_code)].join("|");
      const group=m.get(key)||{key,label:txt(r.service_provider_code)+" / "+txt(r.handover_origin_branch)+" / "+txt(r.handover_location_name),rows:[]};
      group.rows.push(r);
      m.set(key,group);
    });
    return Array.from(m.values());
  },[draftTransferCandidates]);
  const selectedTransferGroup=transferGroups.find(x=>x.key===transferGroup);
  const transferSelectedIds=(selectedTransferGroup?.rows||[])
    .map((r:any)=>txt(r.delivery_way_id||r.waybill_no))
    .filter((id:string)=>Boolean(id&&transferSelection[id]))
    .slice(0,75);
  const createTransferDraft=async()=>{
    if(!draftTransferFeatureEnabled || !providerMetadataReady || !selectedTransferGroup
       || !transferSelectedIds.length || transferDraftBusy || !transferVehicle.trim() || !transferDriver.trim())return;
    const [providerCode,originBranch,siteCode]=selectedTransferGroup.key.split("|");
    if(!window.confirm("Create a DRAFT transfer Wayplan for "+transferSelectedIds.length+" parcel(s) with "+providerCode+" at "+siteCode+"? This does not scan, dispatch or confirm custody."))return;
    setTransferDraftBusy(true);setTransferDraftResult("");
    try{
      const requestId=window.crypto.randomUUID();
      const {data,error}=await (supabase as any).rpc("be_provider_transfer_wayplan_draft_v1",{
        p_request_id:requestId,p_provider_code:providerCode,p_origin_branch_code:originBranch,
        p_handover_location_code:siteCode,p_delivery_way_ids:transferSelectedIds,
        p_vehicle_code:transferVehicle.trim(),p_driver_code:transferDriver.trim()
      });
      if(error||data?.ok!==true)throw new Error(error?.message||data?.error||"Transfer draft was rejected");
      setTransferDraftResult("Draft "+txt(data.wayplan_id)+" created for "+transferSelectedIds.length+" ways. Supervisor approval and actual Warehouse dispatch scans are still required.");
      setTransferSelection({});await load(false);
    }catch(e:any){setTransferDraftResult("Transfer draft not created: "+(e?.message||"Unknown error"));}
    finally{setTransferDraftBusy(false);}
  };

  const exportTransferManifest=async()=>{
    if(!transferCandidates.length || !providerMetadataReady)return;
    setExportError("");
    try{
      const XLSX=await import("xlsx");
      const rows=transferCandidates.map((r:any)=>({
        "Delivery Way ID":excelText(r.delivery_way_id||r.waybill_no),
        "Pickup ID":excelText(r.pickup_id),
        "Original Merchant":excelText(r.merchant_name||r.merchant_code),
        "Merchant Code":excelText(r.merchant_code),
        "Provider":excelText(r.service_provider_code),
        "Destination Region":excelText(r.delivery_region),
        "Original Recipient Township":excelText(r.delivery_township),
        "Warehouse Status":excelText(r.warehouse_scan_status||r.warehouse_status),"Snapshot Warehouse Status":excelText(r.reported_warehouse_status),
        "Approved Handover Site":excelText(r.handover_location_name),
        "Handover Location Code":excelText(r.handover_location_code),
        "Handover Verified":r.handover_location_verified===true?"YES":"NO",
        "Planning Gate":excelText(r.provider_planning_gate),
        "Inbound Scan":fmt(r.inbound_scan_at),
        "Last Return Scan":fmt(r.last_return_scan_at)
      }));
      const book=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),"Transfer Candidates");
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
        ["Report","Third-party handover candidates - planning only"],
        ["Generated in Myanmar time",fmt(new Date())],
        ["Important","NOT a Wayplan, dispatch scan, provider custody receipt or delivery confirmation."],
        ["Service provider",excelText(provider)||"ALL"],["Merchant",excelText(merchant)||"ALL"],
        ["Date from",from||"ALL"],["Date to",to||"ALL"],
        ["Candidate count",rows.length]
      ]),"Manifest Notes");
      XLSX.writeFile(book,"Provider_Transfer_Candidates_"+new Date().toISOString().slice(0,10)+".xlsx");
    }catch(err:any){setExportError(err?.message||"Could not export provider transfer manifest.");}
  };

  const exportExcel=async()=>{
    if(exporting||!visible.length||Boolean(from&&to&&from>to))return;
    setExporting(true);setExportError("");
    try{
      const XLSX=await import("xlsx");
      const events:any[]=[];
      const items=visible.map((r:any)=>{
        const way=excelText(r.delivery_way_id||r.waybill_no);
        const merchantName=excelText(r.merchant_name||r.merchant_code);
        const timestamps:[string,string][]=[
          ["Inbound scan","inbound_scan_at"],["Dispatch scan","dispatch_scan_at"],
          ["Last dispatch","last_dispatch_scan_at"],["Return attempt 1","return_scan_1_at"],
          ["Return attempt 2","return_scan_2_at"],["Return attempt 3","return_scan_3_at"],
          ["Last return","last_return_scan_at"]
        ];
        const seen=new Set<string>();
        timestamps.forEach(([event,key])=>{
          if(!r[key])return;
          const timestamp=txt(r[key]);
          const eventGroup=event.toLowerCase().includes("return")?"return":event.toLowerCase().includes("dispatch")?"dispatch":event;
          const signature=eventGroup+":"+timestamp;
          if(seen.has(signature))return;
          seen.add(signature);
          events.push({"Way ID":way,"Merchant":merchantName,"Event":event,"Myanmar time":fmt(timestamp),"UTC timestamp":excelText(timestamp)});
        });
        return {
          "Way ID":way,"Pickup":excelText(r.pickup_id),"Merchant":merchantName,
          "Merchant code":excelText(r.merchant_code),"Service provider":excelText(r.service_provider_code),"Provider lane":excelText(r.service_lane),"Planning gate":excelText(r.provider_planning_gate),"Handover origin":excelText(r.handover_origin_branch),"Approved handover":excelText(r.handover_location_name),"Handover location code":excelText(r.handover_location_code),"Current Warehouse Status":excelText(r.authoritative_receipt_status),"Handover verified":r.handover_location_verified===true?"YES":"NO","Recipient":excelText(r.recipient_name),
          "Recipient phone":excelText(r.recipient_phone||r.phone_number),
          "Township":excelText(r.delivery_township),"Pending type":r._pendingType,
          "Overdue 48h":r._overdue?"YES":"NO","Age hours":Number(r._ageHours.toFixed(1)),
          "Inbound time":fmt(r.inbound_scan_at),"Last dispatch":fmt(r.last_dispatch_scan_at||r.dispatch_scan_at),
          "Last return":fmt(r.last_return_scan_at),
          "Return attempts":Number(r.return_attempt_count||r.physical_return_scan_count||0),
          "Failure reason":excelText(r.pending_return_reason_name||r.last_exception_reason),
          "Delivery status":excelText(r.delivery_status),
          "Warehouse status":excelText(r.warehouse_scan_status||r.warehouse_status),"Snapshot Warehouse Status":excelText(r.reported_warehouse_status),
          "Wayplan":excelText(r.active_wayplan_id)
        };
      });
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(items),"Pending Parcels");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(events.length?events:[{"Way ID":"","Event":"No timestamp events available"}]),"Parcel Timeline");
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
        ["Report","Warehouse pending parcels"],["Exported (Myanmar time)",fmt(new Date())],
        ["Date basis",dateBasis==="RETURN"?"Last return scan":"Inbound scan"],["Date from",from||"All"],["Date to",to||"All"],
        ["Merchant",excelText(merchant)],["Service provider",excelText(provider)],["Pending category",type],["Age",age],
        ["Search",excelText(query)||"All"],["Number of parcels",items.length],
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

        <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <label className="text-xs text-slate-300">Date field<select aria-label="Date field" value={dateBasis} onChange={e=>setDateBasis(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="INBOUND">Inbound scan</option><option value="RETURN">Last return scan</option></select></label>
          <label className="text-xs text-slate-300">From<input aria-label="Inbound from" type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"/></label>
          <label className="text-xs text-slate-300">To<input aria-label="Inbound to" type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"/></label>
          <label className="text-xs text-slate-300">Merchant<select aria-label="Merchant" value={merchant} onChange={e=>setMerchant(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All merchants</option>{merchants.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          <label className="text-xs text-slate-300">Provider<select aria-label="Service provider" value={provider} onChange={e=>setProvider(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All providers</option>{providers.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
          <label className="text-xs text-slate-300">Pending category<select aria-label="Pending category" value={type} onChange={e=>setType(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All</option><option value="NEW INBOUND">New inbound</option><option value="FAILED RETURN / REPLAN">Failed return / replan</option></select></label>
          <label className="text-xs text-slate-300">Pending age<select aria-label="Pending age" value={age} onChange={e=>setAge(e.target.value)} className="mt-1 w-full rounded bg-white p-2 text-black"><option value="ALL">All</option><option value="OVERDUE">48+ hours</option><option value="CURRENT">Under 48 hours</option></select></label>
          <div className="flex items-end gap-2"><button type="button" className="rounded border border-slate-400 p-2" onClick={()=>{setQuery("");setMerchant("ALL");setProvider("ALL");setType("ALL");setAge("ALL");setDateBasis("INBOUND");setFrom("");setTo("");}}>Clear</button><button type="button" onClick={()=>void exportExcel()} disabled={loading||exporting||!visible.length||Boolean(from&&to&&from>to)} className="flex-1 rounded bg-emerald-600 p-2 font-bold disabled:opacity-50"><Download className="mr-1 inline h-4 w-4"/>{exporting?"Exporting":"Export Excel"}</button></div>
        </div>
        <p className="mb-2 text-xs text-slate-300">Showing {visible.length} of {pending.length} parcels. Dates use Myanmar time. Export reflects current filters and includes only available scan timestamps.</p>
        {from&&to&&from>to&&<p role="alert" className="text-red-300">Start date must be before end date.</p>}
        {exportError&&<p role="alert" className="text-red-300">{exportError}</p>}
        {providerMetadataReady&&<div className="mb-3 rounded-lg border border-slate-700 p-3 text-xs text-slate-300">Provider transfers and branch handovers require a verified physical receiving site and a separate transfer Wayplan. “Not verified” means the handover site is not authorized; it does not mean customer delivery failed. No dispatch, receipt or delivery event is created by this report.</div>}
        {providerMetadataReady&&<div className="mb-3 rounded-lg border border-slate-700 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-amber-300">Third-party transfer planning</strong>
              <div className="text-xs text-slate-300">{transferCandidates.length} transfer candidate(s) in current filters. This is a planning list, not a dispatch or custody event.</div>
            </div>
            <button type="button" onClick={()=>void exportTransferManifest()} disabled={!transferCandidates.length} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Export transfer candidates (Excel)</button>
          </div>
          {transferBreakdown.length>0&&<div className="mt-2 flex flex-wrap gap-2">
            {transferBreakdown.map(g=><span key={g.provider+"|"+g.site} className="rounded border border-slate-600 px-2 py-1 text-xs">{g.provider}: {g.count} · {g.verified?g.site:"Handover site not verified"}</span>)}
          </div>}
        </div>}
        {providerMetadataReady&&<div className="mb-3 rounded-lg border border-slate-600 p-3">
          <strong>Verified-site transfer Wayplan draft</strong>
          <p className="mt-1 text-xs text-slate-300">Draft-only. Only finance-validated, warehouse-ready parcels whose provider and physical handover site match may be grouped. Actual dispatch scan, custody receipt and delivery confirmation must follow separately.</p>
          {!draftTransferFeatureEnabled ? <p className="mt-2 text-sm text-amber-300">Transfer creator is not enabled for this environment until database UAT and approval are complete.</p> : <>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <select aria-label="Verified provider group" value={transferGroup} onChange={e=>{setTransferGroup(e.target.value);setTransferSelection({});}} className="rounded bg-white p-2 text-black">
                <option value="">Select verified provider/site group</option>{transferGroups.map(g=><option key={g.key} value={g.key}>{g.label} ({g.rows.length})</option>)}
              </select>
              <input aria-label="Delivery or transfer vehicle code" value={transferVehicle} onChange={e=>setTransferVehicle(e.target.value)} placeholder="Approved vehicle code" className="rounded bg-white p-2 text-black"/>
              <input aria-label="Authenticated driver code" value={transferDriver} onChange={e=>setTransferDriver(e.target.value)} placeholder="Active driver code" className="rounded bg-white p-2 text-black"/>
            </div>
            {selectedTransferGroup&&<>
              <p className="mt-2 text-xs text-slate-300">Select up to 75 ways. {transferSelectedIds.length} selected.</p>
              <div className="mt-2 max-h-36 overflow-auto rounded border border-slate-700 p-2">
                {selectedTransferGroup.rows.slice(0,200).map((r:any)=>{const id=txt(r.delivery_way_id||r.waybill_no);return <label key={id} className="mr-4 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(transferSelection[id])} disabled={!transferSelection[id]&&transferSelectedIds.length>=75} onChange={e=>setTransferSelection(old=>({...old,[id]:e.target.checked}))}/>{id}</label>})}
              </div>
            </>}
            <button type="button" disabled={transferDraftBusy||!transferSelectedIds.length||!transferVehicle.trim()||!transferDriver.trim()} onClick={()=>void createTransferDraft()} className="mt-3 rounded bg-cyan-700 px-4 py-2 text-sm font-bold disabled:opacity-50">{transferDraftBusy?"Creating draft...":"Create DRAFT Transfer Wayplan"}</button>
          </>}
          {transferDraftResult&&<div role="status" className="mt-2 text-sm text-cyan-200">{transferDraftResult}</div>}
        </div>}
        {!providerMetadataReady&&<div role="alert" className="mb-3 rounded-lg border border-amber-700 p-3 text-sm text-amber-200">Provider classification RPC is not installed. View and export remain available, but Warehouse → Wayplan handoff is disabled until the authorized provider-transfer preview is deployed. No wayplan or scan will be created without a verified service lane.</div>}
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
          <div className="flex-1 text-sm text-slate-200">
            <strong className="text-amber-300">Warehouse → Wayplan handoff</strong>
            <div className="text-xs text-slate-300">Select verified inbound or physically returned replan parcels. Third-party provider and branch handovers require dedicated transfer Wayplans and cannot be forced into standard last-mile routes. Provider pickup or transfer is recorded through the approved Wayplan and a real dispatch scan, not by this action.</div>
            <div className="mt-1 text-xs">{selectedIds.length} selected · {selectableReceived.length} eligible in this filtered view · maximum 100 per batch</div>
          </div>
          <button type="button" onClick={()=>setSelectedWays(prev=>{
            const all=selectableReceived.slice(0,100).every((r:any)=>prev[txt(r.delivery_way_id||r.waybill_no)]);
            const next={...prev};
            selectableReceived.forEach((r:any)=>delete next[txt(r.delivery_way_id||r.waybill_no)]);
            if(!all) selectableReceived.slice(0,100).forEach((r:any)=>{next[txt(r.delivery_way_id||r.waybill_no)]=true});
            return next;
          })} className="rounded border border-slate-500 px-3 py-2 text-xs font-bold">Select / clear eligible</button>
          <button type="button" disabled={handoffBusy||loading||!selectedIds.length} onClick={()=>void handoffReceived()} className="rounded bg-amber-500 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{handoffBusy?"Staging...":"Mark Ready for Wayplan"}</button>
          <button type="button" disabled={handoffBusy} onClick={()=>{window.location.hash="/wayplan-command"}} className="rounded bg-blue-600 px-4 py-2 font-bold text-white">Open Wayplan Command</button>
        </div>
        {handoffNotice&&<p role="status" className="mb-2 text-sm text-amber-200">{handoffNotice}</p>}
        {handoffErrors.length>0&&<div role="alert" className="mb-3 rounded border border-red-700 p-2 text-xs text-red-200">Rejected ({handoffErrors.length}): {handoffErrors.slice(0,8).join("; ")}{handoffErrors.length>8?" …":""}</div>}
        <div className="overflow-auto">
          <table className="w-full min-w-[1450px] border-collapse text-sm">
            <thead><tr className="bg-amber-400 text-left text-slate-950">
              {["Select","Alert","Delivery Way","Pickup","Type","Merchant","Provider","Planning gate","Approved handover","Recipient","Township","Inbound Scan","Pending Age","Failed Reason","Last Return","Wayplan"].map(h=><th key={h} className="p-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {visible.map((r:any,i:number)=><tr key={txt(r.delivery_way_id)+i} className={"border-b border-slate-800 "+(r._overdue?"bg-red-950/25":"")}>
                <td className="p-2"><input aria-label={"Select "+txt(r.delivery_way_id||r.waybill_no)} type="checkbox" disabled={!readyIds.has(txt(r.delivery_way_id||r.waybill_no))||handoffBusy} checked={Boolean(selectedWays[txt(r.delivery_way_id||r.waybill_no)])&&readyIds.has(txt(r.delivery_way_id||r.waybill_no))} onChange={e=>setSelectedWays(prev=>({...prev,[txt(r.delivery_way_id||r.waybill_no)]:e.target.checked}))}/></td>
                <td className="p-2">{r._overdue?<span className="rounded bg-red-500 px-2 py-1 text-xs font-black text-white">48H+</span>:<span className="text-slate-500">-</span>}</td>
                <td className="p-2 font-black text-amber-300">{txt(r.delivery_way_id || r.waybill_no)}</td>
                <td className="p-2">{txt(r.pickup_id)}</td>
                <td className="p-2"><span className="rounded border border-slate-700 px-2 py-1 text-xs font-bold">{r._pendingType}</span></td>
                <td className="p-2">{txt(r.merchant_name || r.merchant_code)}</td>
                <td className="p-2">{txt(r.service_provider_code)||"Not enriched"}</td>
                <td className="max-w-[200px] p-2 text-xs">{txt(r.provider_planning_gate)||"Provider review"}</td>
                <td className="max-w-[200px] p-2 text-xs">{txt(r.handover_location_name)||"Not verified"}</td>
                <td className="p-2">{txt(r.recipient_name)}<div className="text-xs text-slate-400">{txt(r.recipient_phone || r.phone_number)}</div></td>
                <td className="p-2">{txt(r.delivery_township)}</td>
                <td className="p-2">{fmt(r.inbound_scan_at)}</td>
                <td className={"p-2 font-black "+(r._overdue?"text-red-300":"text-cyan-300")}><Clock3 className="mr-1 inline h-4 w-4"/>{Number(r._ageHours||0).toFixed(1)} h</td>
                <td className="max-w-[260px] p-2">{txt(r.pending_return_reason_name || r.last_exception_reason) || "-"}</td>
                <td className="p-2">{fmt(r.last_return_scan_at)}</td>
                <td className="p-2">{txt(r.active_wayplan_id) || <span className="font-black text-red-300">NOT IN WAYPLAN</span>}</td>
              </tr>)}
              {!visible.length && <tr><td colSpan={16} className="p-12 text-center text-slate-400">{loading?"Loading...":"No pending Warehouse parcels match the current filter."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}
