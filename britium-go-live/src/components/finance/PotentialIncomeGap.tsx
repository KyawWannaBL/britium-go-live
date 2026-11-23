import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {exportFinanceExcel,printFinancePdf,type FinanceReport} from "@/lib/financeReportExports";

export type RegisteredIncomeWay={
 delivery_way_id:string;merchant_id:string|null;created_at:string|null;cod_amount:number|null;
 item_price:number|null;delivery_fee:number|null;delivery_charges:number|null;
 weight_surcharge:number|null;net_system_delivery_charge:number|null;
 service_type:string|null;finance_status:string|null;
};
type Receipt={delivery_way_id:string;scanned_at:string|null;receiving_scan_skipped:boolean|null;warehouse_entered_at:string|null;warehouse_status:string|null};
type Cod={delivery_way_id:string;settlement_status:string|null;settled_at:string|null;wayplan_id:string|null;delivered_at:string|null};
type Batch={delivery_way_id:string;batch_id:string|null;active:boolean|null};
type Joined=RegisteredIncomeWay&{receipt?:Receipt;cod?:Cod;batch?:Batch;category:string};
const MMK=(v:number|null|undefined)=>v==null?"Not recorded":Number(v).toLocaleString("en-US",{maximumFractionDigits:2})+" MMK";
const categories={
 MISSING_BOTH:"Absent from COD and Merchant settlement",
 MISSING_COD:"Absent from COD settlement queue",
 MISSING_MERCHANT:"Absent from Merchant batch only",
 PRESENT_UNSETTLED:"In settlement queue, not settled",
 PRESENT_SETTLED:"Already settled",
 NO_SCAN:"No verified inbound scan"
};
const chunks=(xs:string[],size=120)=>Array.from({length:Math.ceil(xs.length/size)},(_,i)=>xs.slice(i*size,(i+1)*size));
export default function PotentialIncomeGap({registrations,language="en",loading:parentLoading=false}:{registrations:RegisteredIncomeWay[];language?:"en"|"my";loading?:boolean}){
 const my=language==="my";const t=(en:string,mm:string)=>my?mm:en;
 const [receipts,setReceipts]=useState<Map<string,Receipt>>(new Map());
 const [codRows,setCodRows]=useState<Map<string,Cod>>(new Map());
 const [batchRows,setBatchRows]=useState<Map<string,Batch>>(new Map());
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[exportError,setExportError]=useState("");
 const [refreshKey,setRefreshKey]=useState(0),[mode,setMode]=useState("MISSING_COD");
 const [sort,setSort]=useState<"date"|"way"|"potential">("date"),[reverse,setReverse]=useState(true);
 const [page,setPage]=useState(0);
 const signature=registrations.map(r=>r.delivery_way_id).join("|");
 useEffect(()=>{let cancelled=false;setReceipts(new Map());setCodRows(new Map());setBatchRows(new Map());setError("");if(parentLoading||!signature)return;
 (async()=>{setLoading(true);try{
  const ids=[...new Set(registrations.map(x=>x.delivery_way_id).filter(Boolean))];const parts=chunks(ids);
  const receiptMap=new Map<string,Receipt>(),codMap=new Map<string,Cod>(),batchMap=new Map<string,Batch>();
  // Explicit warehouse receipts, not a nullable/unsynchronized Data Entry inbound timestamp.
  for(const part of parts){
   const [wh,cod,batch]=await Promise.all([
    (supabase as any).from("be_v_warehouse_receipt_v39").select("delivery_way_id,scanned_at,receiving_scan_skipped,warehouse_entered_at,warehouse_status").in("delivery_way_id",part),
    (supabase as any).from("be_finance_cod_settlements_v48").select("delivery_way_id,settlement_status,settled_at,wayplan_id,delivered_at").in("delivery_way_id",part),
    (supabase as any).from("be_finance_settlement_batch_items_v3").select("delivery_way_id,batch_id,active").in("delivery_way_id",part).eq("active",true)
   ]);
   if(wh.error||cod.error||batch.error)throw Error(wh.error?.message||cod.error?.message||batch.error?.message||"One or more settlement sources are unavailable.");
   if(cancelled)return;
   for(const r of wh.data||[])receiptMap.set(r.delivery_way_id,r);
   for(const r of cod.data||[])codMap.set(r.delivery_way_id,r);
   for(const r of batch.data||[])batchMap.set(r.delivery_way_id,r);
  }
  if(!cancelled){setReceipts(receiptMap);setCodRows(codMap);setBatchRows(batchMap);}
 }catch(e:any){if(!cancelled)setError(e?.message||"Reconciliation unavailable.");}finally{if(!cancelled)setLoading(false);}})();
 return()=>{cancelled=true};
 },[signature,refreshKey,parentLoading]);
 const complete=!loading&&!parentLoading&&!error&&registrations.length>0&&receipts.size>0;
 const joined=useMemo<Joined[]>(()=>registrations.map(r=>{
  const receipt=receipts.get(r.delivery_way_id),cod=codRows.get(r.delivery_way_id),batch=batchRows.get(r.delivery_way_id);
  const physicallyScanned=Boolean(receipt?.scanned_at&&!receipt.receiving_scan_skipped);
  const category=!physicallyScanned?"NO_SCAN":!cod&&!batch?"MISSING_BOTH":!cod?"MISSING_COD":!batch?"MISSING_MERCHANT":cod.settled_at||String(cod.settlement_status||"").toUpperCase()==="SETTLED"?"PRESENT_SETTLED":"PRESENT_UNSETTLED";
  return {...r,receipt,cod,batch,category};
 }),[registrations,receipts,codRows,batchRows]);
 const scanned=joined.filter(r=>Boolean(r.receipt?.scanned_at&&!r.receipt?.receiving_scan_skipped));
 const missingCod=scanned.filter(r=>!r.cod);
 const missingBoth=scanned.filter(r=>!r.cod&&!r.batch);
 const pendingValue=(arr:Joined[])=>arr.reduce((s,r)=>s+Number(r.net_system_delivery_charge||0),0);
 const unknownValue=(arr:Joined[])=>arr.filter(r=>r.net_system_delivery_charge===null).length;
 const filtered=useMemo(()=>joined.filter(r=>mode==="ALL"?r.category!=="NO_SCAN":mode==="MISSING_COD"?r.category==="MISSING_COD"||r.category==="MISSING_BOTH":r.category===mode).sort((a,b)=>{
  const d=sort==="potential"?Number(a.net_system_delivery_charge??-1)-Number(b.net_system_delivery_charge??-1):
   sort==="way"?a.delivery_way_id.localeCompare(b.delivery_way_id):String(a.receipt?.scanned_at||a.created_at||"").localeCompare(String(b.receipt?.scanned_at||b.created_at||""));
  return reverse?-d:d;
 }),[joined,mode,sort,reverse]);
 useEffect(()=>setPage(0),[mode,sort,reverse,signature]);
 const report=useMemo<FinanceReport>(()=>({
  title:"Britium Express | Inbound-Scanned Potential Income / Settlement Visibility Gap",
  fileStem:"Britium_Potential_Income_Settlement_Gaps",
  generatedAt:new Date(),
  filters:{"Scope":"Filtered Data Entry registrations in Delivery Income tab","Gap status":mode,"Ways":filtered.length},
  note:"Investigation report only. Explicit warehouse scanned_at is required; skip approvals are excluded. Missing from COD queue is not proof of delivery, collection, loss, fraud, or settlement eligibility. Potential income is stored net_system_delivery_charge, not realized revenue. Unknown projections are not zero. Merchant batch presence is checked separately; neither queue constitutes independent proof of cash custody. No accounting posting is made.",
  columns:[
   {key:"way",label:"Original Way ID"},{key:"registered",label:"Registered date"},{key:"inbound",label:"Inbound scan time"},
   {key:"merchant",label:"Merchant"},{key:"service",label:"Service"},{key:"cod",label:"Expected COD",kind:"number"},
   {key:"item",label:"Item value",kind:"number"},{key:"delivery",label:"Delivery charge",kind:"number"},
   {key:"weight",label:"Weight surcharge",kind:"number"},{key:"potential",label:"Potential delivery income",kind:"number"},
   {key:"warehouse",label:"Warehouse status"},{key:"codStatus",label:"COD settlement queue"},{key:"merchantBatch",label:"Merchant settlement batch"},
   {key:"category",label:"Investigation status"}
  ],
  rows:filtered.map(r=>({way:r.delivery_way_id,registered:r.created_at||"Not recorded",inbound:r.receipt?.scanned_at||"Not recorded",
   merchant:r.merchant_id||"Unassigned",service:r.service_type||"Unclassified",cod:r.cod_amount??"Not recorded",item:r.item_price??"Not recorded",
   delivery:r.delivery_charges??r.delivery_fee??"Not recorded",weight:r.weight_surcharge??"Not recorded",
   potential:r.net_system_delivery_charge??"Not recorded",warehouse:r.receipt?.warehouse_status||"Not recorded",
   codStatus:r.cod?.settlement_status||"Missing from queue",merchantBatch:r.batch?.batch_id||"Missing from active batch",
   category:categories[r.category as keyof typeof categories]||r.category}))
 }),[filtered,mode]);
 const exportDisabled=!complete||!filtered.length;
 const btn="rounded-lg border border-slate-500/50 bg-[#17394e] px-3 py-2 text-xs font-semibold hover:bg-[#23546a] disabled:opacity-40";
 return <section className="mt-5 space-y-4 rounded-xl border border-amber-400/30 bg-[#10293b] p-4" data-potential-income-gap="true">
  <div><h3 className="text-lg font-bold text-amber-100">{t("Potential Income & Settlement Visibility Gaps","ရနိုင်ခြေရှိ ဝင်ငွေနှင့် ငွေရှင်းစာရင်းမပေါ်သော Way များ")}</h3>
  <p className="mt-2 text-xs text-slate-300">{t("Registered + actually inbound-scanned parcels that do not appear in the COD settlement queue. Investigate them before any payment or settlement action.","စာရင်းသွင်းပြီး ဂိုဒေါင် Inbound Scan အမှန်ရှိသော်လည်း COD Settlement စာရင်းတွင် မပေါ်သောပါဆယ်များကို စိစစ်ရန်။ ငွေရှင်းခြင်းကို အလိုအလျောက်မပြုပါ။")}</p></div>
  <div className="flex flex-wrap gap-2">
   <button className={btn} onClick={()=>setRefreshKey(x=>x+1)} type="button" disabled={loading||parentLoading}>{loading?t("Checking…","စစ်ဆေးဆဲ") : t("Reconcile again","ပြန်လည်စာရင်းညှိရန်")}</button>
   <button className={btn} type="button" disabled={exportDisabled} onClick={()=>void exportFinanceExcel(report).catch((e:any)=>setExportError(e?.message||"Excel export error"))}>Excel (.xlsx)</button>
   <button className={btn} type="button" disabled={exportDisabled} onClick={()=>{try{printFinancePdf(report);setExportError("");}catch(e:any){setExportError(e.message);}}}>PDF / Print</button>
   <label className="text-xs text-slate-300">{t("Show","ပြရန်")}<select className="ml-2 rounded-lg border border-slate-600 bg-[#081e2d] p-2" value={mode} onChange={e=>setMode(e.target.value)}>
    <option value="MISSING_COD">Missing COD queue</option><option value="MISSING_BOTH">Missing both queues</option>
    <option value="MISSING_MERCHANT">Missing merchant batch</option><option value="PRESENT_UNSETTLED">Present but unsettled</option><option value="ALL">All scanned</option>
   </select></label>
   <label className="text-xs text-slate-300">{t("Sort","အစဉ်လိုက်")}<select className="ml-2 rounded-lg border border-slate-600 bg-[#081e2d] p-2" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="date">Scan / Registered date</option><option value="way">Way ID</option><option value="potential">Potential income</option></select></label>
   <button type="button" className={btn} onClick={()=>setReverse(x=>!x)} aria-label="Reverse sorting">{reverse?"↓ Desc":"↑ Asc"}</button>
  </div>
  {error&&<p role="alert" className="rounded-lg bg-red-950/60 p-3 text-xs text-red-200">{t("Reconciliation unavailable: ","စာရင်းညှိမရပါ: ")}{error}</p>}
  {exportError&&<p role="alert" className="text-xs text-red-300">{exportError}</p>}
  {loading&&<p role="status" className="text-xs text-slate-300">{t("Comparing warehouse scans, COD queue and merchant settlement batches…","ဂိုဒေါင် Scan နှင့် Finance Settlement စာရင်းများ တိုက်ဆိုင်စစ်ဆေးနေသည်…")}</p>}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   {[
    [t("Confirmed inbound scans","Inbound Scan အမှန်ရှိ"),complete?String(scanned.length):"—"],
    [t("Not in COD settlement queue","COD ငွေရှင်းစာရင်းမရှိ"),complete?String(missingCod.length):"—"],
    [t("Absent from both queues","ငွေရှင်းစာရင်း နှစ်ခုလုံးမရှိ"),complete?String(missingBoth.length):"—"],
    [t("Potential delivery income - missing COD","မပေါ်သေးသော ရနိုင်ခြေဝင်ငွေ"),complete?MMK(pendingValue(missingCod)):"—"]
   ].map(([label,value])=><div key={label} className="rounded-lg border border-slate-600/50 bg-[#173a4d] p-3"><p className="text-xs text-slate-300">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>)}
  </div>
  {complete&&unknownValue(missingCod)>0&&<p className="text-xs text-amber-200">{unknownValue(missingCod)} {t("missing-queue Ways have no income projection; totals exclude unknowns and are not complete.","Way များတွင် ဝင်ငွေခန့်မှန်းစာရင်းမရှိသဖြင့် စုစုပေါင်းထဲ မပါဝင်ပါ။")}</p>}
  <p className="text-xs leading-relaxed text-amber-100">{t("This is a potential / at-risk pipeline, NOT actual revenue or missing cash. Receiving a parcel does not mean it was delivered. Check Dispatch/Wayplan, POD, provider custody, customer payment, and approval eligibility before Finance settlement.","ဤပမာဏသည် ရနိုင်ခြေရှိ ဝင်ငွေဖြစ်ပြီး အမှန်တကယ်ဝင်ငွေ သို့မဟုတ် ပျောက်ဆုံးငွေ မဟုတ်ပါ။ Inbound Scan ရှိသည်ဟု Delivery ပြီးသည် မဆိုလိုပါ။ Wayplan၊ POD၊ Provider လက်ခံမှုနှင့် ငွေလက်ခံအထောက်အထား စစ်ပြီးမှ ငွေရှင်းပါ။")}</p>
  <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-700" tabIndex={0} aria-label="Potential income missing settlement table">
   <table className="min-w-[1580px] w-full text-left text-xs">
    <thead className="sticky top-0 bg-[#21445b]"><tr>{["Way ID","Inbound scan","Merchant","Service","Expected COD","Item value","Delivery charge","Weight","Potential income","Warehouse status","COD queue","Merchant batch","Gap classification"].map(x=><th key={x} className="whitespace-nowrap px-3 py-3">{x}</th>)}</tr></thead>
    <tbody>{complete&&filtered.slice(page*100,page*100+100).map(r=><tr key={r.delivery_way_id} className="border-t border-white/10 hover:bg-white/5">
     <td className="px-3 py-2 font-semibold">{r.delivery_way_id}</td><td className="px-3 py-2">{r.receipt?.scanned_at?.replace("T"," ").slice(0,19)||"—"}</td><td className="px-3 py-2">{r.merchant_id||"—"}</td>
     <td className="px-3 py-2">{r.service_type||"—"}</td><td className="px-3 py-2">{MMK(r.cod_amount)}</td><td className="px-3 py-2">{MMK(r.item_price)}</td><td className="px-3 py-2">{MMK(r.delivery_charges??r.delivery_fee)}</td>
     <td className="px-3 py-2">{MMK(r.weight_surcharge)}</td><td className="px-3 py-2">{MMK(r.net_system_delivery_charge)}</td>
     <td className="px-3 py-2">{r.receipt?.warehouse_status||"—"}</td><td className="px-3 py-2">{r.cod?.settlement_status||"MISSING"}</td><td className="px-3 py-2">{r.batch?.batch_id?"Included":"MISSING"}</td>
     <td className="px-3 py-2 text-amber-200">{categories[r.category as keyof typeof categories]}</td></tr>)}</tbody>
   </table>
   {complete&&!filtered.length&&<p className="p-3 text-xs text-slate-300">{t("No Ways match this gap filter.","ဤစစ်ထုတ်ချက်နှင့် ကိုက်ညီသော Way မရှိပါ။")}</p>}
  </div>
  {complete&&filtered.length>100&&<div className="flex items-center gap-3 text-xs"><button className={btn} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page+1} / {Math.ceil(filtered.length/100)}</span><button className={btn} disabled={(page+1)*100>=filtered.length} onClick={()=>setPage(p=>p+1)}>Next</button><span>{t("All filtered rows are included in exports.","စစ်ထုတ် Row အားလုံးကို Export လုပ်နိုင်သည်။")}</span></div>}
  <div className="rounded-lg border border-slate-600/50 p-3 text-xs text-slate-300">
   <b>{t("Recommended investigation sequence","စစ်ဆေးရန် လုပ်ငန်းစဉ်")}</b>
   <p className="mt-1">Warehouse scan → Wayplan / Dispatch → Rider POD or third-party handover → COD receipt → Finance eligibility → Authorized settlement. Escalate missing links to Operations and Finance; never fabricate a settlement event.</p>
  </div>
 </section>;
}
