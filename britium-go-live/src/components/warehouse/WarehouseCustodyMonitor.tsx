import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {AlertTriangle,Download,RefreshCw,Search} from "lucide-react";

type Row={
 way_id:string;merchant:string;recipient:string;township:string;
 warehouse_status:string;dispatch_scanned:boolean;dwell_alert:boolean;dwell_hours:number|null;
 cod_status:string;provider:string;provider_outcome:string;thirdparty_finance_status:string;
 custody_events:number;custody_proofs:number;category:string;updated_at:string|null;
};
type ProviderTrace={
 way_id:string;provider_label:string;provider_evidence:string;route_mode:string;region:string;
 station_code:string;station_name:string;wayplan_id:string|null;branch_code:string|null;
 stop_status:string|null;dispatch_status:string|null;rider_status:string|null;
 delivered_at:string|null;delivery_proof_recorded:boolean;handover_manifest_ref:string|null;
 provider_receiver_name:string|null;physically_handed_over_at:string|null;provider_receipt_ref:string|null;
 custody_stage:string;cod_status:string|null;cod_reference:string|null;cod_expected:number|null;
 cod_collected:number|null;provider_finance_status:string|null;actual_settlement_posted:boolean|null;
 merchant_settlement_status:string|null;
};
type Response={as_of:string;total:number;by_category:Record<string,number>;rows:Row[];read_only:boolean;warning:string};
const namedProvider=(provider:string)=>{
 const x=String(provider||"").trim().toUpperCase();
 if(["BRITIUM","BRITIUM EXPRESS"].includes(x))return "Britium Express";
 if(["DK","DK DELIVERY"].includes(x))return "DK Delivery";
 if(["MDY BRANCH","MANDALAY BRANCH"].includes(x))return "Mandalay Branch";
 if(["INSEIN BRANCH","INS BRANCH","INSEIN"].includes(x))return "Insein Branch";
 if(["ROYAL EXPRESS","ROYAL_EXPRESS"].includes(x))return "Royal Express";
 if(["H.TERMINAL DROP-OFF","HIGHWAY_BUS_STATION","ဂိတ်ချ"].includes(x))return "ဂိတ်ချ";
 if(!x||x==="UNASSIGNED / VERIFY")return "Unassigned / Verify";
 return "Other third-party / branch: "+provider;
};
const stage=(x:string|null|undefined)=>x||"Not recorded";
const categories=[
 ["","All warehouse ways"],
 ["PROVIDER_RECEIPT_MISSING","Third-party provider receipt missing"],
 ["RETURN_CUSTODY_REVIEW","Return / RTO custody review"],
 ["DISPATCH_NO_FINANCE_TRACE","Dispatch with no finance trace"],
 ["WAREHOUSE_DWELL","Warehouse dwell alert"],
 ["RECEIPT_OR_REGISTRATION_PENDING","Receipt / registration pending"],
 ["WAREHOUSE_OR_ROUTE_PENDING","Warehouse / route pending"],
 ["COD_COLLECTION_TRACKED","COD collection tracked"],
 ["THIRD_PARTY_TRACKED","Third-party tracked"],
] as const;
const owners:Record<string,string>={
 PROVIDER_RECEIPT_MISSING:"Third-party coordinator + Warehouse",
 RETURN_CUSTODY_REVIEW:"Warehouse + Customer Service",
 DISPATCH_NO_FINANCE_TRACE:"Dispatch supervisor + Finance",
 WAREHOUSE_DWELL:"Warehouse lead",
 RECEIPT_OR_REGISTRATION_PENDING:"Registration + Warehouse",
 WAREHOUSE_OR_ROUTE_PENDING:"Warehouse / Routing",
 COD_COLLECTION_TRACKED:"Finance COD",
 THIRD_PARTY_TRACKED:"Third-party coordinator",
};
const evidence:Record<string,string>={
 PROVIDER_RECEIPT_MISSING:"Provider manifest, receiver signature, custody timestamp and provider receipt",
 RETURN_CUSTODY_REVIEW:"Return scans, failed attempt reasons, bin location and merchant handback",
 DISPATCH_NO_FINANCE_TRACE:"Dispatch scan, assigned wayplan, rider acceptance and delivery proof",
 WAREHOUSE_DWELL:"Re-scan physical bin/rack, check age and next wayplan",
 RECEIPT_OR_REGISTRATION_PENDING:"Warehouse receipt scan or authorized skip audit",
 WAREHOUSE_OR_ROUTE_PENDING:"Inventory scan and wayplan allocation",
 COD_COLLECTION_TRACKED:"COD remittance status and finance verification",
 THIRD_PARTY_TRACKED:"Provider proof and collection reconciliation",
};
const label=(category:string)=>categories.find(c=>c[0]===category)?.[1]||category.replaceAll("_"," ");
function csvCell(v:unknown){return '"'+String(v??"").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';}
export default function WarehouseCustodyMonitor(){
 const [category,setCategory]=useState("");
 const [search,setSearch]=useState("");
 const [committedSearch,setCommittedSearch]=useState("");
 const [page,setPage]=useState(0);
 const [data,setData]=useState<Response|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [providerTraces,setProviderTraces]=useState<Record<string,ProviderTrace>>({});
 const [traceError,setTraceError]=useState("");
 const size=150;
 const load=useCallback(async()=>{
  setBusy(true);setError("");setTraceError("");
  const {data:result,error:failure}=await (supabase as any).rpc("be_warehouse_custody_monitor_v1",{
   p_limit:size,p_offset:page*size,p_category:category||null,p_search:committedSearch.trim()||null
  });
  if(failure){setError(failure.message||"Unable to load monitoring records");setData(null);setProviderTraces({});}
  else{
   setData(result as Response);
   const ids=((result as Response)?.rows||[]).map(r=>r.way_id).filter(Boolean);
   if(ids.length){
    const traced=await (supabase as any).rpc("be_warehouse_provider_trace_v1",{p_way_ids:ids});
    if(traced.error){setTraceError(traced.error.message||"Provider tracing unavailable");setProviderTraces({});}
    else{
     const match:Record<string,ProviderTrace>={};
     for(const r of (traced.data?.rows||[]) as ProviderTrace[])match[r.way_id]=r;
     setProviderTraces(match);setTraceError("");
    }
   }else{setProviderTraces({});setTraceError("");}
  }
  setBusy(false);
 },[page,category,committedSearch]);
 useEffect(()=>{void load();},[load]);
 const rows=data?.rows||[];
 const categoriesSummary=useMemo(()=>Object.entries(data?.by_category||{}).sort((a,b)=>b[1]-a[1]),[data]);
 const downloadPage=()=>{
  if(!rows.length)return;
  const keys=["way_id","category","merchant","recipient","township","warehouse_status","dispatch_scanned","dwell_alert","dwell_hours","cod_status","provider","provider_outcome","thirdparty_finance_status","custody_events","custody_proofs","provider_label","provider_evidence","route_mode","station_name","wayplan_id","branch_code","stop_status","custody_stage","handover_manifest_ref","provider_receipt_ref","delivery_proof_recorded","cod_reference","provider_finance_status","merchant_settlement_status","updated_at"];
  const output=[keys.map(csvCell).join(","),...rows.map(r=>keys.map(key=>csvCell(((r as unknown as Record<string,unknown>)[key]??(providerTraces[r.way_id] as unknown as Record<string,unknown>|undefined)?.[key]))).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob([output],{type:"text/csv;charset=utf-8;"}));
  const link=document.createElement("a");link.href=url;link.download="warehouse-custody-monitor-page-"+(page+1)+".csv";link.click();URL.revokeObjectURL(url);
 };
 return <section data-warehouse-custody-monitor="true" className="rounded-2xl border border-sky-800 bg-[#0b2236] p-4 text-slate-100">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-xl font-black text-amber-300">Way ID Custody & Reconciliation Monitor</h2>
    <p className="mt-1 text-xs text-slate-300">Live warehouse, all-provider routing, wayplans, scans, provider receipts, delivery / RTO, COD and merchant settlement. Routing indications are not physical handover proof.</p></div>
   <div className="flex flex-wrap gap-2">
    <button type="button" className="rounded-lg border border-sky-500 px-3 py-2 text-xs font-bold" onClick={()=>void load()} disabled={busy}><RefreshCw size={14} className="mr-1 inline"/>Refresh</button>
    <button type="button" className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-[#061524] disabled:opacity-40" disabled={!rows.length} onClick={downloadPage}><Download size={14} className="mr-1 inline"/>Export current page CSV</button>
   </div>
  </div>
  {traceError&&<p role="alert" className="mt-2 rounded-lg border border-amber-600 p-3 text-xs text-amber-200">Provider lifecycle evidence temporarily unavailable: {traceError}. Warehouse exceptions are still visible.</p>}
  {error&&<p role="alert" className="mt-3 rounded-lg border border-rose-600 p-3 text-sm text-rose-200">{error}</p>}
  <div className="mt-3 flex flex-wrap gap-2">
   {categoriesSummary.map(([key,count])=><button key={key} type="button" className="rounded-lg border border-slate-600 bg-[#102e48] px-3 py-2 text-xs" onClick={()=>{setCategory(key);setPage(0);}}>{label(key)} · <strong>{count.toLocaleString()}</strong></button>)}
  </div>
  <form onSubmit={e=>{e.preventDefault();setPage(0);setCommittedSearch(search);}} className="mt-4 flex flex-wrap items-end gap-3">
   <label className="flex min-w-[220px] flex-col gap-1 text-xs">Category
    <select value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}} className="h-10 rounded-lg bg-white px-3 text-slate-900">{categories.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
   <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs">Way ID, merchant, recipient or township
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Way ID / merchant..." className="h-10 rounded-lg bg-white px-3 text-slate-900"/></label>
   <button type="submit" className="h-10 rounded-lg bg-amber-400 px-4 text-xs font-bold text-slate-900"><Search size={14} className="mr-1 inline"/>Search</button>
   <button type="button" className="h-10 rounded-lg border border-slate-600 px-3 text-xs" onClick={()=>{setCategory("");setSearch("");setCommittedSearch("");setPage(0);}}>Clear filters</button>
  </form>
  <p className="mt-3 text-xs text-slate-300">Showing {rows.length.toLocaleString()} of {(data?.total??0).toLocaleString()} matching ways · Page {page+1} · Snapshot {data?.as_of?new Date(data.as_of).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}):"—"} Myanmar time</p>
  <div tabIndex={0} aria-label="Warehouse custody monitoring table" className="mt-3 max-h-[65vh] w-full overflow-auto rounded-lg border border-slate-700" style={{scrollbarWidth:"thin"}}>
   <table className="w-full min-w-[2350px] border-collapse text-left text-xs">
    <thead className="sticky top-0 z-10 bg-amber-400 text-[#081527]"><tr>{["Way ID","Merchant / Recipient","Service Provider / Evidence","Route / Station","Wayplan / Branch","Warehouse / Dispatch","Provider Handover","Delivery / RTO","COD / Finance Settlement","Exception / Category","Responsible Team","Next Evidence"].map(x=><th key={x} className="px-3 py-3 font-black">{x}</th>)}</tr></thead>
    <tbody>{rows.map(r=><tr key={r.way_id} className="border-t border-slate-700 align-top">
     <td className="whitespace-nowrap px-3 py-3 font-bold text-sky-200">{r.way_id}</td>
     <td className="min-w-[190px] px-3 py-3">{r.merchant||"—"}<p className="text-slate-400">{r.recipient||"—"}</p></td>
     <td className="min-w-[190px] px-3 py-3"><strong>{namedProvider(providerTraces[r.way_id]?.provider_label||r.provider||"")}</strong><p className="mt-1 text-amber-200">{stage(providerTraces[r.way_id]?.provider_evidence)}</p></td>
     <td className="min-w-[170px] px-3 py-3">{stage(providerTraces[r.way_id]?.route_mode)}<p className="mt-1 text-slate-400">{providerTraces[r.way_id]?.station_name||providerTraces[r.way_id]?.station_code||"No terminal documented"}</p></td>
     <td className="min-w-[175px] px-3 py-3">{stage(providerTraces[r.way_id]?.wayplan_id)}<p className="mt-1 text-slate-400">Branch: {stage(providerTraces[r.way_id]?.branch_code)}</p></td>
     <td className="px-3 py-3">{r.warehouse_status||"—"}<p>{r.dispatch_scanned?"Dispatch scanned":"Dispatch not scanned"}</p>{r.dwell_alert&&<p className="text-amber-300">Dwell alert ({Math.round(Number(r.dwell_hours||0))}h)</p>}</td>
     <td className="min-w-[185px] px-3 py-3">{stage(providerTraces[r.way_id]?.custody_stage)}<p className="mt-1 text-slate-400">Manifest: {stage(providerTraces[r.way_id]?.handover_manifest_ref)}</p><p className="text-slate-400">Receipt: {stage(providerTraces[r.way_id]?.provider_receipt_ref)}</p></td>
     <td className="min-w-[150px] px-3 py-3">{stage(providerTraces[r.way_id]?.stop_status)}<p className="mt-1 text-slate-400">Rider: {stage(providerTraces[r.way_id]?.rider_status)}</p><p>{providerTraces[r.way_id]?.delivery_proof_recorded?"Proof recorded":"Proof not recorded"}</p></td>
     <td className="min-w-[180px] px-3 py-3">COD: {providerTraces[r.way_id]?.cod_status||r.cod_status||"Not recorded"}<p>Third party: {stage(providerTraces[r.way_id]?.provider_finance_status)}</p><p>Merchant: {stage(providerTraces[r.way_id]?.merchant_settlement_status)}</p><p className="text-slate-400">COD ref: {stage(providerTraces[r.way_id]?.cod_reference)}</p></td>
     <td className="min-w-[180px] px-3 py-3 font-semibold text-amber-200">{label(r.category)}</td>
     <td className="min-w-[175px] px-3 py-3">{owners[r.category]||"Operations"}</td>
     <td className="min-w-[280px] px-3 py-3">{evidence[r.category]||"Verify latest physical custody"}</td>
    </tr>)}{!rows.length&&<tr><td colSpan={12} className="p-8 text-center">No matching ways in this monitor.</td></tr>}</tbody>
   </table>
  </div>
  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
   <p className="flex items-center text-xs text-amber-200"><AlertTriangle size={13} className="mr-2"/>Missing evidence is not proof of a missing parcel. Verify physical location and recorded custody before escalation.</p>
   <div className="flex gap-2"><button className="rounded-lg border border-slate-600 px-3 py-2 text-xs disabled:opacity-40" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="rounded-lg border border-slate-600 px-3 py-2 text-xs disabled:opacity-40" disabled={busy||(page+1)*size>=(data?.total||0)} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </div>
 </section>;
}
