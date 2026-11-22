import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useAuth} from "@/contexts/AuthContext";
import {downloadParcelXlsx,openParcelPrintWindow,renderParcelPdf} from "@/lib/parcelReportExport";

type Way={
 work_date:string;delivery_way_id:string;wayplan_id:string|null;
 listed_in_wayplan:boolean;wayplan_team_assigned:boolean;cashier_worker_is_assigned:boolean|null;
 rider_code:string|null;rider_name:string|null;driver_code:string|null;driver_name:string|null;
 helper_code:string|null;helper_name:string|null;vehicle_code:string|null;
 data_entry_actual_collect:number|null;data_entry_cod_amount:number|null;
 cashier_actual_mmk:number|null;cashier_receipt_work_date:string|null;receipt_id:string|null;
 cashier_worker_role:string|null;cashier_worker_code:string|null;
 payment_method:string|null;evidence_reference:string|null;difference_mmk:number|null;
 finance_settlement_status:string|null;finance_settled_amount:number|null;
 finance_settlement_reference:string|null;wayplan_finance_status:string|null;sync_status:string;
};
const fields=[
 ["work_date","Settlement date"],["delivery_way_id","Waybill ID"],["wayplan_id","Wayplan ID"],
 ["listed_in_wayplan","In Wayplan (Yes/No)"],["wayplan_team_assigned","Assigned team (Yes/No)"],["cashier_worker_is_assigned","Cashier worker assignment match"],
 ["rider_code","Rider"],["driver_code","Driver"],["helper_code","Helper"],
 ["data_entry_cod_amount","Data Entry COD MMK"],["data_entry_actual_collect","Data Entry actual_collect (raw)"],
 ["cashier_actual_mmk","Cashier actual MMK"],["difference_mmk","Cashier less Data Entry MMK"],
 ["cashier_worker_code","Cashier received from"],["cashier_receipt_work_date","Cashier register date"],
 ["payment_method","Payment method"],["evidence_reference","Cash receipt reference"],
 ["finance_settlement_status","Finance COD status"],["finance_settled_amount","Finance settled amount MMK"],
 ["wayplan_finance_status","Field settlement status"],["sync_status","Sync / missing reason"]
].map(([key,label])=>({key,label}));
const money=(n:unknown)=>n===null||n===undefined?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:2})+" MMK";
const day=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Yangon",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const dateOneBack=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Yangon",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-86400000));
const input="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
const statuses=[
 ["ALL","All records / အားလုံး"],
 ["MISSING","Cashier receipt missing / Cashier လက်ခံစာမရှိ"],
 ["FINANCE_SETTLED_CASHIER_UNRECORDED","Finance settled, cashier absent"],
 ["NOT_LISTED_IN_WAYPLAN","Not listed in Wayplan"],
 ["NO_WORKER_ASSIGNED","No team assigned"],
 ["RECEIPT_WORKER_NOT_ASSIGNED","Cashier receipt from unassigned worker"],
 ["AMOUNT_DIFFERENCE","Amount differs"],
 ["CASHIER_RECEIPT_DIFFERENT_DATE","Cashier receipt is for another day"],
 ["CASHIER_RECORDED_FINANCE_PENDING","Cashier recorded, finance pending"],
 ["FINANCE_RECORDED_CHECK_EVIDENCE","Finance settlement review"]
] as const;
export default function DailyCashierSettlementPanel({mode="finance",client}:{mode?:"finance"|"field";client?:{rpc:(...args:any[])=>any}}){
 const api=client||supabase;
 const {profile}=useAuth();
 const role=String(profile?.role||"").toLowerCase().replaceAll("-","_");
 const cashierAllowed=mode==="finance"&&["superadmin","super_admin","finance","accountant"].includes(role);
 const [from,setFrom]=useState(dateOneBack),[to,setTo]=useState(day);
 const [worker,setWorker]=useState(""),[status,setStatus]=useState("ALL"),[search,setSearch]=useState("");
 const [records,setRecords]=useState<Way[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Way|null>(null);
 const [collected,setCollected]=useState(""),[workerRole,setWorkerRole]=useState("RIDER"),[workerCode,setWorkerCode]=useState("");
 const [payment,setPayment]=useState("CASH"),[reference,setReference]=useState(""),[reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  const {data,error:e}=await (api as any).rpc("be_finance_cashier_daily_report_v1",{
   p_from:from,p_to:to,p_worker_code:mode==="finance"&&worker.trim()?worker.trim():null
  });
  setLoading(false);
  if(e||!data?.ok){setRecords([]);setError(e?.message||data?.code||"Daily report is unavailable");return;}
  setRecords((data.rows||[]) as Way[]);
 },[from,to,worker,mode,api]);
 useEffect(()=>{void refresh();},[refresh]);
 const view=useMemo(()=>records.filter(r=>{
  if(status==="MISSING"&&r.receipt_id)return false;
  if(status!=="MISSING"&&status!=="ALL"&&r.sync_status!==status)return false;
  if(search&&!r.delivery_way_id.toLowerCase().includes(search.toLowerCase()))return false;
  return true;
 }),[records,status,search]);
 const countMissing=view.filter(r=>!r.receipt_id).length;
 const sumCash=view.reduce((sum,r)=>sum+Number(r.cashier_actual_mmk||0),0);
 const sumFinance=view.reduce((sum,r)=>sum+Number(r.finance_settled_amount||0),0);
 const mismatch=view.filter(r=>r.sync_status==="AMOUNT_DIFFERENCE").length;
 const teamSummary=useMemo(()=>{
  // First collapse repeated dispatch dates to one physical Way ID. Cashier evidence
  // entered on a different workday must not be counted twice or declared missing.
  const byWay=new Map<string,{team:Set<string>;hasReceipt:boolean;cashier:number;settled:number}>();
  for(const r of view){
   const x=byWay.get(r.delivery_way_id)||{team:new Set<string>(),hasReceipt:false,cashier:0,settled:0};
   for(const [role,code] of [["Rider",r.rider_code],["Driver",r.driver_code],["Helper",r.helper_code]] as [string,string|null][]){
    if(code)x.team.add(role+":"+code);
   }
   if(r.cashier_worker_code&&r.cashier_worker_role&&r.cashier_worker_role!=="UNASSIGNED"){
    x.team.add(r.cashier_worker_role.toLowerCase().replace(/^./,c=>c.toUpperCase())+":"+r.cashier_worker_code);
   }
   x.hasReceipt ||= !!r.receipt_id;
   x.cashier=Math.max(x.cashier,Number(r.cashier_actual_mmk||0));
   x.settled=Math.max(x.settled,Number(r.finance_settled_amount||0));
   byWay.set(r.delivery_way_id,x);
  }
  const people=new Map<string,{role:string;code:string;ways:Set<string>;missing:Set<string>;cashier:number;settled:number}>();
  for(const [way,x] of byWay)for(const id of x.team){
   const split=id.indexOf(":");const role=id.slice(0,split),code=id.slice(split+1);
   const item=people.get(id)||{role,code,ways:new Set<string>(),missing:new Set<string>(),cashier:0,settled:0};
   item.ways.add(way);
   if(!x.hasReceipt)item.missing.add(way);
   item.cashier+=x.cashier;
   item.settled+=x.settled;
   people.set(id,item);
  }
  return Array.from(people.values()).sort((a,b)=>b.missing.size-a.missing.size||a.code.localeCompare(b.code));
 },[view]);
 const workers=useMemo(()=>Array.from(new Set(records.flatMap(r=>[r.rider_code,r.driver_code,r.helper_code,r.cashier_worker_code]).filter((s):s is string=>!!s))).sort(),[records]);
 function choose(r:Way){
  setSelected(r);setCollected("");setReference("");setReason("");setPayment("CASH");
  const options:[string,string|null][]=[["RIDER",r.rider_code],["DRIVER",r.driver_code],["HELPER",r.helper_code]];
  const first=options.find(x=>!!x[1]);setWorkerRole(first?.[0]||"UNASSIGNED");setWorkerCode(first?.[1]||"");
  setError("");setNotice("");
 }
 async function save(){
  if(!cashierAllowed||!selected)return;
  if(collected.trim()===""||!Number.isFinite(Number(collected))||Number(collected)<0||!workerCode.trim()||reference.trim().length<5){
    setError("Actual amount, worker code and a receipt reference of at least five characters are required.");return;
  }
  if(!window.confirm("Record real cashier receipt for "+selected.delivery_way_id+"? This does not finalize or duplicate COD settlement."))return;
  setBusy(true);setError("");setNotice("");
  const {data,error:e}=await (supabase as any).rpc("be_finance_cashier_record_way_v1",{
   p_date:selected.work_date,p_way_id:selected.delivery_way_id,p_worker_role:workerRole,
   p_worker_code:workerCode.trim(),p_actual:Number(collected),p_method:payment,
   p_evidence:reference.trim(),p_exception_note:reason.trim()||null
  });
  setBusy(false);
  if(e){setError(e.message);return;}
  setNotice("Cashier receipt recorded: "+data.receipt_id+". Finance settlement remains independently controlled.");
  setSelected(null);await refresh();
 }
 async function excel(){
  setBusy(true);setError("");
  try{
   if(!view.length)throw Error("No matching ways to export");
   const rows=view.map(r=>({
    ...r,listed_in_wayplan:r.listed_in_wayplan?"Yes":"No",
    wayplan_team_assigned:r.wayplan_team_assigned?"Yes":"No",
    cashier_worker_is_assigned:r.cashier_worker_is_assigned==null?"Not recorded":r.cashier_worker_is_assigned?"Yes":"No"
   }));
   await downloadParcelXlsx(rows as unknown as Record<string,unknown>[],fields,from,to,"Britium_Cashier_Waybill_Reconciliation_"+from+"_to_"+to+".xlsx");
  }catch(e){setError(String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function pdf(){
  const pop=openParcelPrintWindow();setBusy(true);setError("");
  try{
   if(!pop)throw Error("Browser popup blocked");
   const rows=view.map(r=>({
    ...r,listed_in_wayplan:r.listed_in_wayplan?"Yes":"No",
    wayplan_team_assigned:r.wayplan_team_assigned?"Yes":"No"
   }));
   if(!rows.length)throw Error("No matching ways");
   renderParcelPdf(pop,rows as unknown as Record<string,unknown>[],fields,from,to);
  }catch(e){pop?.close();setError(String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900 space-y-4" aria-label="Daily cashier waybill reconciliation">
  <header><h2 className="text-xl font-bold">Daily Cashier & Waybill Reconciliation / နေ့စဉ်ငွေလက်ခံမှုနှင့် Waybill စိစစ်ညှိနှိုင်းရေး</h2>
   <p className="text-xs text-slate-600">Wayplan + Data Entry + Cashier + Finance COD / Rider, Driver, Helper. An absent new cashier record does NOT prove cash loss or non-payment.</p></header>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
   <label className="text-xs font-semibold">From / စတင်ရက်<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={input}/></label>
   <label className="text-xs font-semibold">Through / နောက်ဆုံးရက်<input type="date" value={to} onChange={e=>setTo(e.target.value)} className={input}/></label>
   {mode==="finance"&&<label className="text-xs font-semibold">Worker code / ဝန်ထမ်းကုဒ်
    <select value={worker} onChange={e=>setWorker(e.target.value)} className={input}>
     <option value="">All field workers</option>{workers.map(w=><option key={w}>{w}</option>)}
    </select></label>}
   <label className="text-xs font-semibold">Sync status / စစ်ဆေးရန်
    <select className={input} value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <label className="text-xs font-semibold">Way ID / ရှာဖွေရန်<input className={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Original Way ID"/></label>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <button className="rounded border px-3 py-2 text-sm" disabled={loading} onClick={()=>void refresh()}>{loading?"Loading…":"Refresh / ပြန်စစ်ရန်"}</button>
   <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={busy||loading} onClick={()=>void excel()}>Export Excel</button>
   <button className="rounded border px-3 py-2 text-sm disabled:opacity-40" disabled={busy||loading} onClick={()=>void pdf()}>Print / Save PDF</button>
  </div>
  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
   {([["Matching Ways",view.length],["Cashier missing",countMissing],["Amount differences",mismatch],
     ["Cashier received",money(sumCash)],["Existing Finance settled",money(sumFinance)]] as [string,number|string][]).map(([label,value])=>
    <div key={label} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="text-lg">{value}</strong></div>)}
  </div>
  <details className="rounded-lg border border-slate-200" open={mode==="finance"}>
   <summary className="cursor-pointer bg-slate-100 p-3 text-sm font-semibold">By Rider / Driver / Helper — assigned Ways and missing cashier receipts / ဝန်ထမ်းအလိုက်စာရင်း</summary>
   <div className="max-h-72 overflow-auto"><table className="w-full min-w-[650px] text-left text-xs">
    <thead className="sticky top-0 bg-slate-200"><tr>{["Role","Worker","Assigned Ways","Missing cashier","Cashier MMK","Finance settled MMK"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead>
    <tbody>{teamSummary.map(w=><tr key={w.role+":"+w.code} className="border-t">
     <td className="p-2">{w.role}</td><td className="p-2 font-semibold">{w.code}</td>
     <td className="p-2">{w.ways.size}</td><td className="p-2">{w.missing.size}</td>
     <td className="p-2">{money(w.cashier)}</td><td className="p-2">{money(w.settled)}</td>
    </tr>)}</tbody>
   </table></div>
   <p className="p-2 text-xs text-slate-600">Shared Wayplan Ways appear under each assigned team member; person totals should not be summed to calculate company-wide cash totals.</p>
  </details>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  <div className="max-h-[540px] overflow-auto rounded-lg border">
   <table className="min-w-[1500px] w-full text-left text-xs"><thead className="sticky top-0 bg-slate-200">
    <tr>{["Way ID","Work date","Wayplan?","Assigned?","Wayplan","Rider / Driver / Helper","Registered COD","Cashier actual","Difference","Finance status","Sync result","Action"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
    <tbody>{view.slice(0,300).map(r=><tr key={r.work_date+":"+r.delivery_way_id} className="border-t align-top">
     <td className="p-2 font-semibold">{r.delivery_way_id}</td><td className="p-2">{r.work_date}</td>
     <td className="p-2">{r.listed_in_wayplan?"Yes":"No"}</td>
     <td className="p-2">{r.wayplan_team_assigned?"Yes":"No"}</td>
     <td className="p-2">{r.wayplan_id||"—"}</td>
     <td className="p-2">{[r.rider_code,r.driver_code,r.helper_code].filter(Boolean).join(" / ")||"—"}</td>
     <td className="p-2">{money(Number(r.data_entry_actual_collect||0)>0?r.data_entry_actual_collect:r.data_entry_cod_amount)}</td>
     <td className="p-2">{money(r.cashier_actual_mmk)}</td>
     <td className="p-2">{money(r.difference_mmk)}</td>
     <td className="p-2">{r.finance_settlement_status||"—"}</td>
     <td className="p-2 font-semibold">{r.sync_status}</td>
     <td className="p-2">{cashierAllowed&&!r.receipt_id?<button onClick={()=>choose(r)} className="rounded border border-blue-500 px-2 py-1 text-blue-800">Record receipt</button>:r.receipt_id?"Recorded":"View only"}</td>
    </tr>)}</tbody>
   </table>
  </div>
  {view.length>300&&<p className="text-xs text-slate-500">Table displays first 300 matching rows; exports include all {view.length} filtered rows.</p>}
  {selected&&cashierAllowed&&<section className="space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-4">
   <div className="flex justify-between gap-2"><h3 className="font-semibold">Cashier intake — {selected.delivery_way_id}</h3>
    <button className="rounded border px-2 py-1 text-xs" onClick={()=>setSelected(null)}>Close</button></div>
   <p className="text-sm">Wayplan: {selected.wayplan_id||"Not recorded"} · Assigned: {selected.wayplan_team_assigned?"Yes":"No"} · Registered amount: {money(Number(selected.data_entry_actual_collect||0)>0?selected.data_entry_actual_collect:selected.data_entry_cod_amount)}</p>
   {selected.finance_settlement_status==="SETTLED"&&<p className="rounded bg-amber-100 p-2 text-xs text-amber-900">Finance already marked this Way as SETTLED. Enter an explanatory reference in Exception reason before recording historical cashier evidence; this will not change the existing settlement.</p>}
   <div className="grid gap-3 md:grid-cols-3">
    <label className="text-xs font-semibold">Actual collected MMK / အမှန်လက်ခံငွေ
     <input type="number" min="0" step="0.01" value={collected} onChange={e=>setCollected(e.target.value)} className={input}/></label>
    <label className="text-xs font-semibold">Responsible role / တာဝန်ခံ
     <select className={input} value={workerRole} onChange={e=>{setWorkerRole(e.target.value);const key=e.target.value.toLowerCase()+"_code";setWorkerCode(String((selected as any)[key]||""));}}>
      {["RIDER","DRIVER","HELPER","UNASSIGNED"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-xs font-semibold">Worker code / ဝန်ထမ်းကုဒ်
     <input className={input} value={workerCode} onChange={e=>setWorkerCode(e.target.value)}/></label>
    <label className="text-xs font-semibold">Payment method / ငွေလက်ခံနည်း
     <select value={payment} onChange={e=>setPayment(e.target.value)} className={input}>{["CASH","DIGITAL","MIXED","OTHER"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-xs font-semibold">Receipt / proof reference
     <input value={reference} onChange={e=>setReference(e.target.value)} className={input} placeholder="Bank slip / cash receipt ID"/></label>
    <label className="text-xs font-semibold">Exception reason (if unassigned/mismatch)
     <input value={reason} onChange={e=>setReason(e.target.value)} className={input} placeholder="At least 8 characters"/></label>
   </div>
   <p className="text-sm">Difference (actual minus registered): <strong>{collected.trim()!==""?money(Number(collected)-Number(Number(selected.data_entry_actual_collect||0)>0?selected.data_entry_actual_collect:selected.data_entry_cod_amount||0)):"—"}</strong></p>
   <button disabled={busy} onClick={()=>void save()} className="rounded bg-blue-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Register cashier receipt / ငွေလက်ခံမှတ်တမ်းတင်ရန်</button>
   <p className="text-xs">This creates an immutable intake record. It does not change Finance settlement, waybill delivery status or staff liability.</p>
  </section>}
 </section>;
}
