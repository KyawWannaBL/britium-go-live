import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GroundEvidenceReviewPanel from "@/components/parcel/GroundEvidenceReviewPanel";
import ParcelActionComposer from "@/components/parcel/ParcelActionComposer";
import ParcelBulkFollowUpPanel from "@/components/parcel/ParcelBulkFollowUpPanel";
import { parcelNextAction,evidencedStage,parcelWorkflowStages } from "@/lib/parcelOperationalSteps";
import { downloadParcelXlsx,openParcelPrintWindow,renderParcelPdf,fromMyanmarDay,untilMyanmarDay } from "@/lib/parcelReportExport";

type Parcel = {
  delivery_way_id: string;
  warehouse_record_created_at: string | null;
  merchant_name: string | null;
  destination_township: string | null;
  recorded_provider_code: string | null;
  physically_recorded_provider: string | null;
  provider_custody_evidence: string | null;
  warehouse_status: string | null;
  dispatch_scanned: boolean | null;
  wayplan_id: string | null;
  physically_handed_over_at: string | null;
  delivered_at: string | null;
  rider_proof_present: boolean | null;
  finance_settlement_status: string | null;
  expected_cod_mmk: number | null;
  settled_cod_mmk: number | null;
  attention_category: string | null;
  exception_flags: string[] | null;
  return_scan_count: number | null;
  last_evidence_at: string | null;
};

const selectColumns = [
  "delivery_way_id","warehouse_record_created_at","merchant_name","destination_township","recorded_provider_code",
  "physically_recorded_provider","provider_custody_evidence","warehouse_status",
  "dispatch_scanned","wayplan_id","physically_handed_over_at","delivered_at",
  "rider_proof_present","finance_settlement_status","expected_cod_mmk",
  "settled_cod_mmk","attention_category","exception_flags","return_scan_count","last_evidence_at"
].join(",");

const views = ["All", "Provider & Branch", "Wayplans", "Warehouse", "Delivery / RTO", "Finance", "Exceptions"] as const;
type ViewTab = typeof views[number];
const providers = ["ALL", "BRITIUM", "DK DELIVERY", "MDY BRANCH", "NPT BRANCH", "ROYAL EXPRESS", "H.TERMINAL DROP-OFF", "AHL BRANCH", "ARLU POST", "BEE EXPRESS", "GRS", "NINJA VAN", "NOK BRANCH", "SAFE EXPRESS"];
const currency = (value: number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("en-US");
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not evidenced";
const display = (value: string | null | undefined) => value?.trim() || "Unverified";
const N = ({ children }: { children: React.ReactNode }) => <span className="text-xs text-slate-500">{children}</span>;

function Attention({ value }: { value: string | null }) {
  const isReview = Boolean(value && value !== "MONITOR");
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isReview ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{value || "REVIEW"}</span>;
}

export default function HarmonizedParcelControlPage() {
  const [rows, setRows] = useState<Parcel[]>([]);
  const [tab, setTab] = useState<ViewTab>("All");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("ALL");
  const [from,setFrom]=useState("2026-11-01");
  const [to,setTo]=useState(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Yangon"}));
  const [warehouseFilter,setWarehouseFilter]=useState("");
  const [merchant,setMerchant]=useState("");
  const [busyExport,setBusyExport]=useState(false);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [batchSelected,setBatchSelected]=useState<Record<string,Parcel>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 100;

  const makeQuery=useCallback(()=>{
    let query=(supabase.from("be_v_harmonized_parcel_monitor_v1" as never) as any)
       .select(selectColumns,{count:"exact"});
    if(from)query=query.gte("warehouse_record_created_at",fromMyanmarDay(from));
    if(to)query=query.lt("warehouse_record_created_at",untilMyanmarDay(to));
    if(search.trim())query=query.ilike("delivery_way_id","%"+search.trim().replace(/[%_,]/g,"")+"%");
    if(merchant.trim())query=query.ilike("merchant_name","%"+merchant.trim().replace(/[%_,]/g,"")+"%");
    if(provider!=="ALL")query=query.eq("recorded_provider_code",provider);
    if(warehouseFilter)query=query.eq("warehouse_status",warehouseFilter);
    if(tab==="Exceptions")query=query.neq("attention_category","MONITOR");
    if(tab==="Provider & Branch")query=query.is("physically_handed_over_at",null);
    if(tab==="Wayplans")query=query.not("wayplan_id","is",null);
    if(tab==="Warehouse")query=query.not("warehouse_status","is",null);
    if(tab==="Delivery / RTO")query=query.not("delivered_at","is",null);
    if(tab==="Finance")query=query.not("finance_settlement_status","is",null);
    return query;
  },[search,merchant,provider,warehouseFilter,from,to,tab]);
  const load=useCallback(async()=>{
    if(from&&to&&from>to){setError("Start date must not be after end date.");return;}
    setLoading(true);setError("");
    const {data,count:total,error:queryError}=await makeQuery().order("warehouse_record_created_at",{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
    if(queryError){setRows([]);setCount(null);setError(queryError.message);}
    else{setRows((data||[]) as Parcel[]);setCount(total);}
    setLoading(false);
  },[makeQuery,page]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setPage(0);setSelected(null);},[search,merchant,provider,warehouseFilter,from,to,tab]);
  const summary=useMemo(()=>({
    received:rows.filter(r=>Boolean(r.warehouse_status)).length,
    custody:rows.filter(r=>r.provider_custody_evidence==="HANDOVER_EVIDENCED").length,
    alerts:rows.filter(r=>r.attention_category!=="MONITOR").length
  }),[rows]);
  const exportCols=[
    {key:"delivery_way_id",label:"Way ID"},{key:"warehouse_record_created_at",label:"Registration (source)"},
    {key:"merchant_name",label:"Merchant"},{key:"destination_township",label:"Destination township"},
    {key:"recorded_provider_code",label:"Recorded provider"},{key:"provider_custody_evidence",label:"Custody evidence"},
    {key:"warehouse_status",label:"Warehouse status"},{key:"wayplan_id",label:"Wayplan"},
    {key:"physically_handed_over_at",label:"Physical handover"},{key:"delivered_at",label:"Delivery timestamp"},
    {key:"rider_proof_present",label:"Proof reference present"},
    {key:"finance_settlement_status",label:"Finance status"},
    {key:"expected_cod_mmk",label:"Expected COD MMK"},{key:"settled_cod_mmk",label:"Settled MMK"},
    {key:"attention_category",label:"Review workstream"},{key:"exception_flags",label:"Exception flags"},
    {key:"last_evidence_at",label:"Last source evidence"}
  ];
  async function allMatching(){
    if(from&&to&&from>to)throw new Error("Invalid date range.");
    let results:Parcel[]=[];let offset=0;
    do{
      const {data,error:e}=await makeQuery().order("warehouse_record_created_at",{ascending:false}).range(offset,offset+499);
      if(e)throw new Error(e.message);
      const chunk=(data||[]) as Parcel[];
      results=results.concat(chunk);offset+=chunk.length;
      if(chunk.length<500)break;
    }while(offset<10000);
    if(offset>=10000)throw new Error("More than 10,000 rows; narrow the date filter.");
    if(!results.length)throw new Error("No matching parcel records.");
    return results;
  }
  async function exportExcel(){
    setBusyExport(true);setError("");
    try{
      const data=await allMatching();
      await downloadParcelXlsx(data as unknown as Record<string,unknown>[],exportCols,from,to,"Britium_Parcel_Control_"+from+"_to_"+to+".xlsx");
    }catch(e){setError(String(e instanceof Error?e.message:e));}
    finally{setBusyExport(false);}
  }
  async function exportPdf(){
    const pop=openParcelPrintWindow();
    setBusyExport(true);setError("");
    try{
      if(!pop)throw new Error("Browser blocked the print window.");
      const data=await allMatching();
      renderParcelPdf(pop,data as unknown as Record<string,unknown>[],exportCols,from,to);
    }catch(e){pop?.close();setError(String(e instanceof Error?e.message:e));}
    finally{setBusyExport(false);}
  }

  const chosen=Object.values(batchSelected);
  const toggle=(p:Parcel,checked:boolean)=>setBatchSelected(old=>{const next={...old};if(checked)next[p.delivery_way_id]=p;else delete next[p.delivery_way_id];return next;});
  const currentPageSelected=rows.length>0&&rows.every(p=>!!batchSelected[p.delivery_way_id]);
  return <div className="space-y-5 p-4 md:p-6 text-slate-800">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">Harmonized Parcel Control Center</h1>
      <p className="text-sm text-slate-600">Original Way ID · provider & branch custody · warehouse · wayplans · delivery/RTO · COD settlement</p>
      <p className="text-xs text-amber-800">Read-only monitoring. Routing labels are not physical handover evidence; missing records are not automatic parcel-loss findings. Insein and other transfer hubs are custody stages unless specifically registered as service providers.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ["Matching waybills", count === null ? "—" : count.toLocaleString(), "Full filtered match count"],
        ["Warehouse status present", summary.received, "Loaded page only"],
        ["Evidenced handovers", summary.custody, "Loaded page only"],
        ["Review flags", summary.alerts, "Loaded page only"],
      ].map(([label,value,detail]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm">
        <N>{label}</N><div className="mt-1 text-2xl font-semibold">{value}</div><N>{detail}</N>
      </div>)}
    </div>
    <nav className="flex gap-2 overflow-x-auto border-b pb-3" aria-label="Parcel monitoring workflows">
      {views.map(v => <button type="button" key={v} onClick={() => setTab(v)}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${tab === v ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`}>{v}</button>)}
    </nav>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium">Original Delivery Way ID
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Way ID" className="rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="flex min-w-52 flex-col gap-1 text-xs font-medium">Recorded service provider
        <select value={provider} onChange={e=>setProvider(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          {providers.map(p=><option value={p} key={p}>{p === "ALL" ? "All registered providers" : p === "MDY BRANCH" ? "Mandalay Branch (MDY BRANCH)" : p}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">Merchant / ကုန်သည်
        <input value={merchant} onChange={e=>setMerchant(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="All merchants"/>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">Warehouse status / အခြေအနေ
        <select value={warehouseFilter} onChange={e=>setWarehouseFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">All statuses</option>{["READY_FOR_DELIVERY","DELIVERY_FAILED","RETURN_TO_SENDER","SUBMITTED"].map(x=><option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">From / စတင်ရက်
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"/>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">Through / နောက်ဆုံးရက်
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"/>
      </label>
      <button onClick={()=>void load()} disabled={loading} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Refresh / ပြန်လည်ကြည့်ရန်</button>
      <button onClick={()=>void exportExcel()} disabled={busyExport} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Export Excel</button>
      <button onClick={()=>void exportPdf()} disabled={busyExport} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Export PDF</button>
      <button onClick={()=>{setSearch("");setMerchant("");setProvider("ALL");setWarehouseFilter("");setFrom("");setTo("");setTab("All");}} className="rounded-lg border px-4 py-2 text-sm">Clear filters</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    <div className="overflow-x-auto rounded-xl border bg-white">
      <div className="flex flex-wrap gap-2 border-b bg-slate-50 p-3 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" checked={currentPageSelected} onChange={e=>{const add=e.target.checked;setBatchSelected(old=>{const next={...old};rows.forEach(p=>{if(add)next[p.delivery_way_id]=p;else delete next[p.delivery_way_id]});return next;});}}/> Select loaded page / လက်ရှိစာမျက်နှာမှအားလုံး</label>
        <span className="font-semibold">{chosen.length} Ways selected across pages</span>
        <button className="rounded border px-2 py-1" onClick={()=>setBatchSelected({})}>Clear</button>
      </div>
      <table className="min-w-[1250px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide"><tr><th className="px-3 py-3">Select</th>
          {["Way ID", "Merchant / destination", "Recorded provider", "Custody evidence", "Warehouse", "Wayplan", "Delivery / proof", "COD (MMK)", "Finance", "Attention", "Action / တာဝန်ပေး"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y">{rows.map(row=><tr key={row.delivery_way_id} className="hover:bg-slate-50">
          <td className="px-3 py-3"><input type="checkbox" aria-label={"Select "+row.delivery_way_id} checked={!!batchSelected[row.delivery_way_id]} onChange={e=>toggle(row,e.target.checked)}/></td>
          <td className="px-3 py-3"><button onClick={()=>setSelected(row)} className="font-semibold text-blue-700 underline">{row.delivery_way_id}</button></td>
          <td className="px-3 py-3">{display(row.merchant_name)}<div><N>{display(row.destination_township)}</N></div></td>
          <td className="px-3 py-3">{display(row.recorded_provider_code)}</td>
          <td className="px-3 py-3">{display(row.provider_custody_evidence)}</td>
          <td className="px-3 py-3">{display(row.warehouse_status)}<div><N>{row.dispatch_scanned ? "Dispatch scanned" : "Dispatch not evidenced"}</N></div></td>
          <td className="px-3 py-3">{display(row.wayplan_id)}</td>
          <td className="px-3 py-3">{row.delivered_at ? when(row.delivered_at) : "Not evidenced"}<div><N>{row.rider_proof_present ? "Proof reference present" : "No rider proof reference"}</N></div></td>
          <td className="px-3 py-3">{currency(row.expected_cod_mmk)}<div><N>Settled: {currency(row.settled_cod_mmk)}</N></div></td>
          <td className="px-3 py-3">{display(row.finance_settlement_status)}</td>
          <td className="px-3 py-3"><Attention value={row.attention_category}/></td>
          <td className="px-3 py-3"><button className="rounded border border-blue-300 px-3 py-2 text-xs text-blue-700" onClick={()=>setSelected(row)}>Message / Notify</button></td>
        </tr>)}</tbody>
      </table>
      {!loading && !error && !rows.length && <p className="p-6 text-sm text-slate-500">No matching parcel evidence found.</p>}
    </div>
    <div className="flex items-center justify-between text-sm">
      <span>Page {page+1} · {rows.length} displayed · {count === null ? "count unavailable" : count+" matching"}</span>
      <div className="flex gap-2">
        <button disabled={!page || loading} onClick={()=>setPage(p=>Math.max(p-1,0))} className="rounded border px-3 py-2 disabled:opacity-50">Previous</button>
        <button disabled={loading || count === null || (page+1)*pageSize >= count} onClick={()=>setPage(p=>p+1)} className="rounded border px-3 py-2 disabled:opacity-50">Next</button>
      </div>
    </div>
    {chosen.length>0&&<ParcelBulkFollowUpPanel selected={chosen} onClear={()=>setBatchSelected({})}/>}
    {selected && <section aria-label="Parcel evidence details" className="rounded-xl border bg-white p-5">
      <div className="flex justify-between gap-3"><h2 className="text-lg font-bold">Way ID: {selected.delivery_way_id}</h2><button onClick={()=>setSelected(null)} className="rounded border px-3 py-1">Close</button></div>
      <p className="mt-2 text-sm text-amber-800">Evidence snapshot only — not a complete event timeline until event ingestion is activated.</p>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        {[
          ["Merchant", selected.merchant_name],["Destination township", selected.destination_township],
          ["Assigned provider (recorded)",selected.recorded_provider_code],
          ["Actual provider evidence",selected.physically_recorded_provider],
          ["Custody assessment",selected.provider_custody_evidence],
          ["Physical handover timestamp",when(selected.physically_handed_over_at)],
          ["Wayplan ID",selected.wayplan_id],["Warehouse status",selected.warehouse_status],
          ["Delivered at",when(selected.delivered_at)],["Delivery proof",selected.rider_proof_present?"Reference recorded":"Not evidenced"],
          ["Finance settlement",selected.finance_settlement_status],
          ["Return-scan events",String(selected.return_scan_count ?? 0)],
          ["Independent exceptions",(selected.exception_flags || []).join("; ") || "No additional flags"],
          ["Last evidence",when(selected.last_evidence_at)],
        ].map(([key,val])=><div key={String(key)}><dt className="text-xs text-slate-500">{key}</dt><dd className="break-all text-sm font-medium">{display(val)}</dd></div>)}
      </dl>
      <div className="rounded-lg border bg-slate-50 p-3">
       <h3 className="font-semibold">Last evidenced process / နောက်ဆုံးဆောင်ရွက်မှု</h3>
       <p className="text-sm">{parcelNextAction(selected).last}</p>
       <p className="text-sm font-semibold text-amber-900">Next required / ဆက်လက်ဆောင်ရွက်ရန်: {parcelNextAction(selected).next}</p>
       <div className="mt-2 flex flex-wrap gap-1">{parcelWorkflowStages.map((stage,i)=><span key={stage} className={"rounded px-2 py-1 text-xs "+(i<=evidencedStage(selected)?"bg-blue-100 text-blue-900":"bg-white text-slate-500")}>{i+1}. {stage}</span>)}</div>
      </div>
      <ParcelActionComposer wayId={selected.delivery_way_id}/>
      <GroundEvidenceReviewPanel wayId={selected.delivery_way_id}/>
    </section>}
  </div>;
}
