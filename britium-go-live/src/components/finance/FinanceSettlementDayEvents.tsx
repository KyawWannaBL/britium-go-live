import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {downloadParcelXlsx,openParcelPrintWindow,renderParcelPdf} from "@/lib/parcelReportExport";

type EventRow={
 settlement_work_date:string;delivery_way_id:string;wayplan_id:string|null;
 rider_code:string|null;driver_code:string|null;helper_code:string|null;
 settled_amount:number|null;expected_cod:number|null;settlement_reference:string|null;
 cashier_actual_mmk:number|null;cashier_receipt_date:string|null;cashier_receipt_id:string|null;
 data_entry_registered_mmk:number|null;cashier_vs_data_entry_mmk:number|null;
 listed_in_wayplan:boolean;team_assigned:boolean;reconciliation_status:string;
};
const columns=[
 ["settlement_work_date","Finance settled date (Myanmar)"],
 ["delivery_way_id","Original Way ID"],
 ["wayplan_id","Wayplan ID"],
 ["listed_in_wayplan","Wayplan listed (Yes/No)"],
 ["team_assigned","Team assigned (Yes/No)"],
 ["rider_code","Rider code"],["driver_code","Driver code"],["helper_code","Helper code"],
 ["settled_amount","Finance settled MMK"],
 ["expected_cod","Finance expected COD MMK"],
 ["data_entry_registered_mmk","Data Entry registered MMK"],
 ["cashier_actual_mmk","Cashier actual MMK"],
 ["cashier_vs_data_entry_mmk","Cashier vs Data Entry MMK"],
 ["cashier_receipt_date","Cashier receipt date"],
 ["settlement_reference","Settlement reference"],
 ["reconciliation_status","Reconciliation exception"]
].map(([key,label])=>({key,label}));
const currentDay=()=>new Date(Date.now()+6.5*3600000).toISOString().slice(0,10);
const input="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const fmt=(v:number|undefined|null)=>v==null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2})+" MMK";

export default function FinanceSettlementDayEvents(){
 const [from,setFrom]=useState(currentDay),[to,setTo]=useState(currentDay);
 const [rows,setRows]=useState<EventRow[]>([]);
 const [summary,setSummary]=useState<Record<string,number>>({});
 const [status,setStatus]=useState("ALL"),[worker,setWorker]=useState("");
 const [way,setWay]=useState("");
 const [loading,setLoading]=useState(false),[error,setError]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  const {data,error:e}=await (supabase as any).rpc("be_finance_daily_settled_events_v1",{p_from:from,p_to:to});
  setLoading(false);
  if(e||!data?.ok){setRows([]);setSummary({});setError(e?.message||"Unable to fetch actual settlement-date events.");return;}
  setRows(data.rows||[]);setSummary(data.summary||{});
 },[from,to]);
 useEffect(()=>{void refresh();},[refresh]);
 const workers=useMemo(()=>Array.from(new Set(rows.flatMap(r=>[r.rider_code,r.driver_code,r.helper_code]).filter((v):v is string=>!!v))).sort(),[rows]);
 const visible=useMemo(()=>rows.filter(r=>
  (status==="ALL"||r.reconciliation_status===status)&&
  (!worker||[r.rider_code,r.driver_code,r.helper_code].some(x=>x?.toUpperCase()===worker.toUpperCase()))&&
  (!way||r.delivery_way_id.toLowerCase().includes(way.toLowerCase()))
 ),[rows,status,worker,way]);
 const uniqueStatuses=useMemo(()=>Array.from(new Set(rows.map(r=>r.reconciliation_status))).sort(),[rows]);
 const totalSettled=visible.reduce((s,r)=>s+Number(r.settled_amount||0),0);
 const missingCashier=visible.filter(r=>!r.cashier_receipt_id).length;
 const exportRows=visible.map(r=>({...r,listed_in_wayplan:r.listed_in_wayplan?"Yes":"No",team_assigned:r.team_assigned?"Yes":"No"})) as Record<string,unknown>[];
 async function excel(){
  try{if(!exportRows.length)throw Error("No records match filters");
   await downloadParcelXlsx(exportRows,columns,from,to,"Britium_Finance_Settled_Events_"+from+"_to_"+to+".xlsx","Britium Express — Finance Settled Events","Finance SETTLED date (Myanmar)");
  }catch(e){setError(String(e instanceof Error?e.message:e));}
 }
 function pdf(){
  const w=openParcelPrintWindow();
  try{if(!w)throw Error("Pop-up window blocked");if(!exportRows.length)throw Error("No matching rows");
   renderParcelPdf(w,exportRows,columns,from,to,"Britium Express — Finance Settled Events","Finance SETTLED date (Myanmar)");
  }catch(e){w?.close();setError(String(e instanceof Error?e.message:e));}
 }
 return <section className="space-y-3 rounded-xl border border-blue-300 bg-white p-4 text-slate-900">
  <header><h2 className="text-lg font-bold">Finance settlement-date audit / ငွေရှင်းပြီးစီးရက်အလိုက် အစီရင်ခံစာ</h2>
   <p className="text-xs text-slate-600">This section uses Finance SETTLED timestamps in Myanmar time, not Wayplan dispatch dates. Historical cash receipts remain separate from final settlement.</p></header>
  <div className="flex flex-wrap items-center gap-2 text-xs">
   <span className="font-semibold text-slate-600">Report period / အစီရင်ခံစာကာလ:</span>
   {(["Today","Yesterday","Last 7 days","This month"] as const).map(label=><button key={label} type="button" onClick={()=>{
    const now=new Date(Date.now()+6.5*3600000);
    const today=now.toISOString().slice(0,10);
    if(label==="Today"){setFrom(today);setTo(today);}
    else if(label==="Yesterday"){const d=new Date(now.getTime()-86400000).toISOString().slice(0,10);setFrom(d);setTo(d);}
    else if(label==="Last 7 days"){setFrom(new Date(now.getTime()-6*86400000).toISOString().slice(0,10));setTo(today);}
    else {setFrom(today.slice(0,7)+"-01");setTo(today);}
   }} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-slate-700 transition-colors hover:border-sky-400 hover:bg-sky-50">{label}</button>)}
  </div>
  <div className="flex flex-wrap gap-3">
   <label className="text-xs font-semibold">From / စတင်ရက်<input className={input+" block"} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="text-xs font-semibold">To / နောက်ဆုံးရက်<input className={input+" block"} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   <label className="text-xs font-semibold">Responsible worker / တာဝန်ခံ<select className={input+" block"} value={worker} onChange={e=>setWorker(e.target.value)}>
    <option value="">All</option>{workers.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs font-semibold">Reconciliation status / စစ်ဆေးချက်<select className={input+" block"} value={status} onChange={e=>setStatus(e.target.value)}>
    <option value="ALL">All</option>{uniqueStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs font-semibold">Way ID / ရှာဖွေရန်<input className={input+" block"} value={way} onChange={e=>setWay(e.target.value)}/></label>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <button className="rounded border px-3 py-2 text-sm" disabled={loading} onClick={()=>void refresh()}>{loading?"Loading…":"Refresh"}</button>
   <button className="rounded bg-blue-900 px-3 py-2 text-sm text-white" onClick={()=>void excel()} disabled={loading||!visible.length}>Excel</button>
   <button className="rounded border px-3 py-2 text-sm" onClick={pdf} disabled={loading||!visible.length}>PDF / Print</button>
  </div>
  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
   <div className="rounded bg-blue-50 p-3"><small>Matching settled Ways</small><p className="text-lg font-semibold">{visible.length}</p></div>
   <div className="rounded bg-blue-50 p-3"><small>Finance settled amount</small><p className="text-lg font-semibold">{fmt(totalSettled)}</p></div>
   <div className="rounded bg-amber-50 p-3"><small>Cashier receipt not registered</small><p className="text-lg font-semibold">{missingCashier}</p></div>
   <div className="rounded bg-slate-100 p-3"><small>Wayplan unlinked</small><p className="text-lg font-semibold">{visible.filter(r=>!r.listed_in_wayplan).length}</p></div>
  </div>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  <div className="max-h-[360px] overflow-auto rounded border">
   <table className="min-w-[1250px] w-full text-left text-xs">
    <thead className="sticky top-0 bg-slate-200"><tr>{["Settled day","Way ID","Wayplan","Assigned team","Finance settled","Cashier actual","Data Entry registered","Exception"].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
    <tbody>{visible.slice(0,250).map(r=><tr className="border-t" key={r.delivery_way_id}>
     <td className="p-2">{r.settlement_work_date}</td><td className="p-2 font-semibold">{r.delivery_way_id}</td>
     <td className="p-2">{r.listed_in_wayplan?"Yes — "+r.wayplan_id:"No"}</td>
     <td className="p-2">{[r.rider_code,r.driver_code,r.helper_code].filter(Boolean).join(" / ")||"Not recorded"}</td>
     <td className="p-2">{fmt(r.settled_amount)}</td><td className="p-2">{fmt(r.cashier_actual_mmk)}</td>
     <td className="p-2">{fmt(r.data_entry_registered_mmk)}</td><td className="p-2">{r.reconciliation_status}</td>
    </tr>)}</tbody>
   </table>
  </div>
  {visible.length>250&&<p className="text-xs text-slate-500">Preview shows 250 rows. Exports contain all {visible.length} matching Ways.</p>}
  <p className="text-xs text-amber-800">Finance SETTLED is the database status, not independent proof of physical delivery or cash custody. A missing new Cashier receipt does not establish theft or missing money. Original transaction approvals are unchanged.</p>
  <p className="text-xs text-slate-500">Period summary: {summary.total_settled_waybills||0} Finance-settled Ways, {summary.finance_settled_total_mmk?.toLocaleString("en-US")||"0"} MMK, {summary.without_cashier_receipt||0} without new cashier register evidence.</p>
 </section>;
}
