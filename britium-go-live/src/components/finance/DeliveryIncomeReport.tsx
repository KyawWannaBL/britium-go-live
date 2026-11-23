import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {exportFinanceExcel,printFinancePdf,type FinanceReport} from "@/lib/financeReportExports";
import PotentialIncomeGap from "./PotentialIncomeGap";

type Row={
 delivery_way_id:string; merchant_id:string|null; created_at:string|null;
 service_type:string|null; delivery_route_mode:string|null; handoff_station_code:string|null;
 item_price:number|null; cod_amount:number|null; delivery_fee:number|null;
 delivery_charges:number|null; weight_surcharge:number|null; net_system_delivery_charge:number|null;
 financial_validation_status:string|null; finance_status:string|null;
};
type OrderKey="created_at"|"merchant_id"|"delivery_way_id"|"cod_amount"|"item_price"|"delivery_fee"|"weight_surcharge"|"net_system_delivery_charge";
const LIMIT=5000;
const money=(v:number|null|undefined)=>v==null?"Not recorded":Number(v).toLocaleString("en-US",{maximumFractionDigits:2})+" MMK";
const number=(v:unknown)=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
const day=(v:string|null)=>v?String(v).slice(0,10):"";
const provider=(r:Row)=>r.handoff_station_code?"GATE / ဂိတ်ချ":r.delivery_route_mode?.trim()||"UNCONFIRMED";
const eligible=(v:string|null)=>Boolean(v&&/^(VALID|VALIDATED|APPROVED|OK)$/i.test(v));
export default function DeliveryIncomeReport({language="en"}:{language?:"en"|"my"}){
 const my=language==="my";
 const t=(en:string,mm:string)=>my?mm:en;
 const [from,setFrom]=useState("2026-11-01");
 const [to,setTo]=useState("");
 const [merchant,setMerchant]=useState("");
 const [service,setService]=useState("");
 const [providerFilter,setProviderFilter]=useState("");
 const [query,setQuery]=useState("");
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[exportError,setExportError]=useState("");
 const [truncated,setTruncated]=useState(false);
 const [order,setOrder]=useState<OrderKey>("created_at");
 const [desc,setDesc]=useState(true);
 const [reload,setReload]=useState(0);
 const refresh=useCallback(()=>setReload(n=>n+1),[]);
 useEffect(()=>{let cancelled=false;(async()=>{
  setLoading(true);setError("");setRows([]);setTruncated(false);
  try{
   if(from&&to&&from>to)throw Error("Start date must not be later than end date.");
   const output:Row[]=[];let exhausted=false;
   for(let offset=0;offset<LIMIT;offset+=500){
    let request=(supabase as any).from("be_data_entry_parcel_details")
      .select("delivery_way_id,merchant_id,created_at,service_type,delivery_route_mode,handoff_station_code,item_price,cod_amount,delivery_fee,delivery_charges,weight_surcharge,net_system_delivery_charge,financial_validation_status,finance_status")
      .not("delivery_way_id","is",null).order("created_at",{ascending:false}).range(offset,offset+499);
    if(from)request=request.gte("created_at",from+"T00:00:00+06:30");
    if(to)request=request.lt("created_at",new Date(Date.parse(to+"T00:00:00+06:30")+86400000).toISOString());
    const {data,error:loadError}=await request;
    if(loadError)throw loadError;
    if(cancelled)return;
    const batch=(data||[]) as Row[];
    output.push(...batch);
    if(batch.length<500){exhausted=true;break;}
   }
   if(!cancelled){setRows(output);setTruncated(!exhausted);}
  }catch(e:any){if(!cancelled)setError(e?.message||"Income source unavailable.");}
  finally{if(!cancelled)setLoading(false);}
 })();return()=>{cancelled=true};},[from,to,reload]);
 const merchants=useMemo(()=>[...new Set(rows.map(r=>r.merchant_id||"UNASSIGNED"))].sort(),[rows]);
 const services=useMemo(()=>[...new Set(rows.map(r=>r.service_type||"UNCLASSIFIED"))].sort(),[rows]);
 const providers=useMemo(()=>[...new Set(rows.map(provider))].sort(),[rows]);
 const visible=useMemo(()=>rows.filter(r=>
  (!merchant||(r.merchant_id||"UNASSIGNED")===merchant)&&
  (!service||(r.service_type||"UNCLASSIFIED")===service)&&
  (!providerFilter||provider(r)===providerFilter)&&
  (!query||[r.delivery_way_id,r.merchant_id,r.handoff_station_code].some(x=>String(x||"").toLowerCase().includes(query.toLowerCase())))
 ).sort((a,b)=>{
  const aa=a[order],bb=b[order];
  const difference=typeof aa==="number"||typeof bb==="number"?Number(aa??-Infinity)-Number(bb??-Infinity):String(aa||"").localeCompare(String(bb||""));
  return desc?-difference:difference;
 }),[rows,merchant,service,providerFilter,query,order,desc]);
 const total=(key:"cod_amount"|"item_price"|"delivery_fee"|"weight_surcharge"|"net_system_delivery_charge")=>
  visible.reduce((sum,r)=>sum+(number(r[key])||0),0);
 const incomplete=visible.filter(r=>r.net_system_delivery_charge==null||!eligible(r.financial_validation_status)).length;
 const report=useMemo<FinanceReport>(()=>({
  title:"Britium Express | Delivery Income & Third-Party GP Review",
  fileStem:"Britium_Delivery_Income_"+(from||"all")+"_to_"+(to||"latest"),
  generatedAt:new Date(),
  filters:{"Registered date from":from||"All","Registered date through":to||"All","Merchant":merchant||"All","Service type":service||"All","Provider route (provisional)":providerFilter||"All","Way ID search":query||"All","Rows":String(visible.length)},
  note:"READ-ONLY MANAGEMENT REVIEW. All dates refer to Data Entry registration in Myanmar time, not cash settlement. COD and item value are merchant/customer flow, not company revenue. Revenue uses the stored net_system_delivery_charge financial projection and is not proof of recognized or received revenue. No approved provider/gate COGS is available in this report: COGS and GP remain NOT VERIFIED, never zero. Provider routing labels are provisional until custody/provider evidence is reconciled. Filtered results may be capped at 5,000; confirm coverage before audit use.",
  columns:[
   {key:"date",label:"Registration date"},{key:"way",label:"Original Way ID"},{key:"merchant",label:"Merchant"},{key:"service",label:"Service type"},
   {key:"provider",label:"Provider / ဂိတ်ချ (provisional)"},{key:"cod",label:"Total COD (MMK)",kind:"number"},
   {key:"item",label:"Item value (MMK)",kind:"number"},{key:"delivery",label:"Delivery charge (MMK)",kind:"number"},
   {key:"weight",label:"Extra weight surcharge (MMK)",kind:"number"},{key:"revenue",label:"Delivery income projection (MMK)",kind:"number"},
   {key:"cogs",label:"Verified provider/gate COGS"},{key:"gp",label:"Verified GP"},{key:"validation",label:"Financial validation"}
  ],
  rows:visible.map(r=>({date:day(r.created_at),way:r.delivery_way_id,merchant:r.merchant_id||"Unknown",service:r.service_type||"Unclassified",provider:provider(r),
   cod:r.cod_amount??"Not recorded",item:r.item_price??"Not recorded",
   delivery:r.delivery_charges??r.delivery_fee??"Not recorded",weight:r.weight_surcharge??"Not recorded",
   revenue:r.net_system_delivery_charge??"Not recorded",cogs:"Pending verified cost",gp:"Pending verified cost",validation:r.financial_validation_status||"Not validated"}))
 }),[visible,from,to,merchant,service,providerFilter,query]);
 const [busyExport,setBusyExport]=useState(false);
 async function excel(){try{setExportError("");setBusyExport(true);await exportFinanceExcel(report);}catch(e:any){setExportError(e?.message||"Excel export failed");}finally{setBusyExport(false);}}
 function pdf(){try{setExportError("");printFinancePdf(report);}catch(e:any){setExportError(e?.message||"PDF export failed");}}
 const button="rounded-lg border border-slate-500/40 bg-[#123149] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1c4562] disabled:cursor-not-allowed disabled:opacity-40";
 const input="mt-1 w-full min-w-[135px] rounded-lg border border-slate-500 bg-[#071827] p-2 text-sm text-white";
 return <section className="space-y-4 text-white" data-finance-delivery-income="true">
  <div className="rounded-xl border border-teal-400/30 bg-[#0d3040] p-4">
   <h2 className="text-lg font-bold">{t("Delivery Income & Gross Profit","ပို့ဆောင်မှုဝင်ငွေနှင့် အကြမ်းအမြတ်")}</h2>
   <p className="mt-2 text-xs leading-relaxed text-slate-300">{t("Source-backed waybill report. COD and item value are shown separately from Britium delivery revenue. Verified third-party and gate costs are not yet available at waybill level; COGS and GP remain pending rather than shown as misleading zero.","Way ID အလိုက် မူရင်းစာရင်းအခြေပြု အစီရင်ခံစာဖြစ်သည်။ COD နှင့် ပစ္စည်းတန်ဖိုးကို ပို့ဆောင်ခဝင်ငွေနှင့် သီးခြားဖော်ပြပါသည်။ Third-party နှင့် ဂိတ်ချ ကုန်ကျစရိတ် အတည်မပြုရသေးပါက COGS/GP ကို သုညဟု မပြဘဲ စစ်ဆေးဆဲဟု ဖော်ပြသည်။")}</p>
  </div>
  <div className="grid gap-3 rounded-xl border border-slate-700 bg-[#0d253b] p-4 sm:grid-cols-2 lg:grid-cols-6">
   <label className="text-xs">{t("From (registered)","စတင်ရက် (စာရင်းသွင်း)")}<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={input}/></label>
   <label className="text-xs">{t("Through","နောက်ဆုံးရက်")}<input type="date" value={to} onChange={e=>setTo(e.target.value)} className={input}/></label>
   <label className="text-xs">{t("Merchant","ကုန်သည်")}<select value={merchant} onChange={e=>setMerchant(e.target.value)} className={input}><option value="">All</option>{merchants.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label className="text-xs">{t("Service type","ဝန်ဆောင်မှုအမျိုးအစား")}<select value={service} onChange={e=>setService(e.target.value)} className={input}><option value="">All</option>{services.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label className="text-xs">{t("Provider route","ဝန်ဆောင်မှုပေးသူ")}<select value={providerFilter} onChange={e=>setProviderFilter(e.target.value)} className={input}><option value="">All</option>{providers.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label className="text-xs">{t("Way ID / search","Way ID / ရှာဖွေရန်")}<input value={query} onChange={e=>setQuery(e.target.value)} className={input} placeholder="Way ID"/></label>
  </div>
  <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={refresh} disabled={loading}>{loading?"Loading…":t("Refresh","ပြန်တင်ရန်")}</button><button type="button" className={button} onClick={()=>void excel()} disabled={!visible.length||loading||busyExport}>Excel (.xlsx)</button><button type="button" className={button} onClick={pdf} disabled={!visible.length||loading}>PDF / Print</button><span className="self-center text-xs text-slate-400">{visible.length.toLocaleString()} / {rows.length.toLocaleString()} {t("Ways","Way ID")}</span></div>
  {error&&<p role="alert" className="rounded-lg border border-red-400/40 bg-red-950/40 p-3 text-xs text-red-200">{error}</p>}
  {exportError&&<p role="alert" className="text-xs text-red-300">{exportError}</p>}
  {truncated&&<p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">{t("More than 5,000 ways match the period. Narrow the dates before treating this as a complete report.","Way ID ၅,၀၀၀ ထက်ပိုသောကြောင့် အချိန်ကာလကို ကျဉ်းစေပြီးမှ စာရင်းပြည့်စုံမှုကို အတည်ပြုပါ။")}</p>}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   {[
    [t("Total COD","စုစုပေါင်း COD"),money(total("cod_amount"))],
    [t("Item Value","ပစ္စည်းတန်ဖိုး"),money(total("item_price"))],
    [t("Delivery Charges","ပို့ဆောင်ခ"),money(visible.reduce((s,r)=>s+(number(r.delivery_charges??r.delivery_fee)||0),0))],
    [t("Extra Weight Surcharge","အပိုအလေးချိန်ခ"),money(total("weight_surcharge"))],
    [t("Delivery Income Projection","ပို့ဆောင်ခဝင်ငွေ ခန့်မှန်းစာရင်း"),money(total("net_system_delivery_charge"))],
    [t("Third-Party / Gate COGS","Third-party / ဂိတ်ချ ကုန်ကျစရိတ်"),t("Pending verified cost","အတည်ပြုကုန်ကျစရိတ် စောင့်ဆိုင်းဆဲ")],
    [t("Gross Profit (GP)","အကြမ်းအမြတ်"),t("Pending verified cost","ကုန်ကျစရိတ်စစ်ဆေးဆဲ")],
    [t("Incomplete finance evidence","မပြည့်စုံသော ဘဏ္ဍာရေးအထောက်အထား"),String(incomplete)]
   ].map(([name,value])=><div key={name} className="rounded-xl border border-white/10 bg-[#102f49] p-4"><p className="text-xs text-slate-300">{name}</p><p className="mt-2 text-base font-semibold">{value}</p></div>)}
  </div>
  <p className="text-xs text-amber-200">{t("Important: delivery income is a stored financial projection, not a confirmed posted revenue figure. Do not sum COD or item value into revenue. Unknown costs must never be counted as zero.","သတိပြုရန်။ ဖော်ပြထားသော ဝင်ငွေသည် စနစ်တွက်ချက်မှုဖြစ်ပြီး အတည်ပြုစာရင်းသွင်းပြီး ဝင်ငွေ မဟုတ်ပါ။ COD နှင့် ပစ္စည်းတန်ဖိုးကို ဝင်ငွေထဲ မပေါင်းရ။ မသိရသေးသော ကုန်ကျစရိတ်ကို သုညဟု မယူဆရ။")}</p>
  <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-700" tabIndex={0} aria-label="Scrollable delivery income table">
   <table className="min-w-[1600px] w-full text-left text-xs">
    <thead className="sticky top-0 z-10 bg-[#20415b]"><tr>{([
     ["created_at",t("Registered","ရက်စွဲ")],["delivery_way_id","Way ID"],["merchant_id",t("Merchant","ကုန်သည်")],
     [null,t("Service / Provider","ဝန်ဆောင်မှု / ပေးသူ")],["cod_amount","COD"],["item_price",t("Item value","ပစ္စည်းတန်ဖိုး")],
     ["delivery_fee",t("Delivery charge","ပို့ဆောင်ခ")],["weight_surcharge",t("Weight surcharge","အပိုအလေးချိန်ခ")],
     ["net_system_delivery_charge",t("Income projection","ဝင်ငွေခန့်မှန်း")],[null,"COGS"],[null,"GP"],[null,t("Validation","စစ်ဆေးမှု")]
    ] as Array<[OrderKey|null,string]>).map(([key,label],i)=><th key={i} className="whitespace-nowrap px-3 py-3">{key?<button type="button" onClick={()=>{if(order===key)setDesc(!desc);else {setOrder(key);setDesc(true);}}} className="hover:text-teal-200">{label}{order===key?(desc?" ↓":" ↑"):" ↕"}</button>:label}</th>)}</tr></thead>
    <tbody>{visible.slice(0,500).map((r,i)=><tr key={r.delivery_way_id+"-"+i} className="border-t border-white/10 hover:bg-white/5"><td className="px-3 py-2">{day(r.created_at)}</td><td className="px-3 py-2 font-semibold">{r.delivery_way_id}</td><td className="px-3 py-2">{r.merchant_id||"—"}</td><td className="px-3 py-2">{r.service_type||"Unclassified"} / {provider(r)}</td><td className="px-3 py-2">{money(r.cod_amount)}</td><td className="px-3 py-2">{money(r.item_price)}</td><td className="px-3 py-2">{money(r.delivery_charges??r.delivery_fee)}</td><td className="px-3 py-2">{money(r.weight_surcharge)}</td><td className="px-3 py-2">{money(r.net_system_delivery_charge)}</td><td className="px-3 py-2 text-amber-200">Pending</td><td className="px-3 py-2 text-amber-200">Pending</td><td className="px-3 py-2">{r.financial_validation_status||"Not validated"}</td></tr>)}</tbody>
   </table>
   {!loading&&!visible.length&&!error&&<p className="p-4 text-sm text-slate-400">{t("No ways found for selected filters.","ရွေးထားသော စစ်ထုတ်ချက်အတွက် Way ID မတွေ့ပါ။")}</p>}
  </div>
  {visible.length>500&&<p className="text-xs text-slate-400">{t("Showing the first 500 rows in the table; exports include all filtered loaded rows.","ဇယားတွင် ပထမ ၅၀၀ ကို ပြသထားပြီး Export တွင် စစ်ထုတ်ထားသော row အားလုံး ပါဝင်သည်။")}</p>}
  <PotentialIncomeGap registrations={visible} language={language} loading={loading}/>
  <p className="text-xs text-slate-400">{t("Provider category is provisional from route mode / gate station; verify against third-party custody and invoices. Date filter is Data Entry registration date (Myanmar), not Finance settlement date.","Provider အမျိုးအစားသည် route/station မှ ခန့်မှန်းဖော်ပြမှုသာ ဖြစ်သည်။ တရားဝင် အပ်နှံပြေစာနှင့် တိုက်ဆိုင်စစ်ဆေးပါ။ ရက်စွဲမှာ စာရင်းသွင်းရက် ဖြစ်ပြီး ငွေရှင်းရက် မဟုတ်ပါ။")}</p>
 </section>;
}
