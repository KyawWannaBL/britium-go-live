// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { normalizeRole } from '@/lib/portalRegistry';
import { supabase } from "@/integrations/supabase/client";

function text(v:any,fallback=""){ const s=String(v??"").trim(); return s||fallback; }
function dt(v:any){ if(!v) return ""; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("en-GB",{timeZone:"Asia/Yangon"}); }
function csvCell(v:any){ return '"' + String(v??"").replace(/^[=+@-]/,"'function csvCell(v:any){ return '"' + String(v??"").replace(/"/g,'""') + '"'; }").replace(/"/g,'""') + '"'; }

export default function WarehouseRtoReportPage(){
  const {profile}=useAuth();
  const isBranchManager=normalizeRole(profile?.role)==='branch-manager';
  const [loading,setLoading]=useState(false);
  const [rows,setRows]=useState<any[]>([]);
  const [merchantOptions,setMerchantOptions]=useState<any[]>([]);
  const [query,setQuery]=useState("");
  const [merchant,setMerchant]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [message,setMessage]=useState("");
  const [reasonFilter,setReasonFilter]=useState("");
  const [attemptFilter,setAttemptFilter]=useState("");
  const [generatedAt,setGeneratedAt]=useState("");

  async function loadMerchantOptions(){
    if(isBranchManager) return;
    try{
      const {data,error}=await (supabase as any).rpc("be_get_merchants_dropdown");
      if(error) throw error;
      const options=Array.isArray(data?.options)?data.options:[];
      setMerchantOptions(options);
    }catch(e:any){
      console.warn("Merchant master dropdown unavailable",e);
      setMerchantOptions([]);
    }
  }

  async function load(){
    setLoading(true); setMessage("");
    try{
      const {data,error}=await (supabase as any).rpc("be_warehouse_rto_report_v199",{
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_merchant: merchant.trim() ? merchant.trim() : null,
        p_limit: 5000,
      });
      if(error) throw error;
      if(data?.ok===false) throw new Error(data?.message||data?.error||"RTO report load failed.");
      setRows(Array.isArray(data?.rows)?data.rows:[]);
      setGeneratedAt(new Date().toISOString());
    }catch(e:any){ setMessage(e?.message||"Could not load RTO report data."); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ void loadMerchantOptions(); void load(); },[]);

  const rtoRows=rows;
  const rtoReasons=useMemo(()=>Array.from(new Set(rows.flatMap(r=>[text(r.reason_1_name),text(r.reason_2_name),text(r.reason_3_name),text(r.final_failed_reason)]).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),[rows]);

  const merchants=useMemo(()=>{
    if(merchantOptions.length){
      return merchantOptions.map((option:any)=>({
        value:text(option.value,option.merchant_code),
        label:text(option.label,`${text(option.merchant_name)} (${text(option.merchant_code)})`)
      })).filter((option:any)=>option.value);
    }
    return Array.from(new Map(
      rtoRows
        .map((r:any)=>[text(r.merchant_code,r.merchant_name),text(r.merchant_name,r.merchant_code)])
        .filter(([value])=>Boolean(value))
    ).entries()).map(([value,label])=>({value,label})).sort((a:any,b:any)=>a.label.localeCompare(b.label));
  },[merchantOptions,rtoRows]);

  const visible=useMemo(()=>rtoRows.filter((r:any)=>{
    if(attemptFilter && Number(r.attempt_count||0)<Number(attemptFilter))return false;
    if(reasonFilter && ![r.reason_1_name,r.reason_2_name,r.reason_3_name,r.final_failed_reason].some(x=>text(x).toLowerCase()===reasonFilter.toLowerCase()))return false;
    const merchantCode=text(r.merchant_code).toUpperCase();
    const merchantName=text(r.merchant_name).toUpperCase();
    if(merchant.trim()){
      const selected=merchant.trim().toUpperCase();
      if(merchantCode!==selected && merchantName!==selected) return false;
    }
    const raw=r.return_scan_3_at||r.last_return_scan_at||r.updated_at||r.created_at;
    const d=raw?new Date(raw):null;
    const iso=d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Yangon",year:"numeric",month:"2-digit",day:"2-digit"}).format(d) : "";
    if(dateFrom && (!iso || iso<dateFrom)) return false;
    if(dateTo && (!iso || iso>dateTo)) return false;
    const q=query.trim().toLowerCase();
    if(!q) return true;
    return [
      r.delivery_way_id,r.waybill_no,r.pickup_id,r.recipient_name,r.recipient_phone,
      r.delivery_township,r.township,r.merchant_name,r.merchant_code,r.reason_1_name,r.reason_2_name,
      r.reason_3_name,r.final_failed_reason,r.remark_1,r.remark_2,r.remark_3,r.remarks
    ].join(" ").toLowerCase().includes(q);
  }),[rtoRows,merchant,dateFrom,dateTo,query,attemptFilter,reasonFilter]);

  function failureReason(r:any){
    return [
      text(r.reason_1_name),
      text(r.reason_2_name),
      text(r.reason_3_name),
      text(r.final_failed_reason)
    ].filter(Boolean).filter((v:string,i:number,a:string[])=>a.indexOf(v)===i).join(" | ");
  }

  function exportCsv(){
    const headers=["Merchant","Merchant Code","Delivery Way","Waybill","Pickup","Recipient","Phone","Township","COD","Attempt 1 Timestamp","Attempt 1 Reason","Attempt 1 Remarks","Attempt 2 Timestamp","Attempt 2 Reason","Attempt 2 Remarks","Attempt 3 Timestamp","Attempt 3 Reason","Attempt 3 Remarks","Final RTO Reason","RTO Date","Rider","Wayplan","Remarks"];
    const data=[headers,...visible.map((r:any)=>[
      text(r.merchant_name,r.merchant_code),text(r.merchant_code),text(r.delivery_way_id),text(r.waybill_no),text(r.pickup_id),
      text(r.recipient_name),text(r.recipient_phone,r.phone_number),text(r.delivery_township,r.township),
      Number(r.cod_amount||0),dt(r.return_scan_1_at),text(r.reason_1_name),text(r.remark_1),dt(r.return_scan_2_at),text(r.reason_2_name),text(r.remark_2),dt(r.return_scan_3_at),text(r.reason_3_name),text(r.remark_3),failureReason(r),dt(r.return_scan_3_at||r.last_return_scan_at),
      text(r.rider_name,r.rider_code),text(r.wayplan_id),text(r.remarks)
    ])];
    const csv=data.map(row=>row.map(csvCell).join(",")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url;
    const merchantLabel=!merchant.trim()?"all-merchants":merchant.replace(/[^a-z0-9]+/gi,"-").toLowerCase();
    a.download=`RTO_Report_${merchantLabel}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }


  const printDate=generatedAt||new Date().toISOString();
  const controls="min-h-11 w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500";
  return <main data-rto-report="true" className="min-h-screen min-w-0 bg-[#061524] p-3 text-slate-100 md:p-5">
    <style>{String.raw\`
      .rto-screen-scroll { scrollbar-width: thin; scrollbar-color: #5a8aaf #092037; }
      .rto-print-document {display:none;}
      @media print {
        @page { size: A4 portrait; margin: 12mm 11mm; }
        html, body, #root { overflow:visible!important; height:auto!important; background:#fff!important; }
        body * { visibility:hidden!important; }
        #rto-print-document, #rto-print-document * { visibility:visible!important; }
        #rto-print-document { display:block!important; position:absolute!important; top:0!important; left:0!important; width:100%!important; max-width:none!important; height:auto!important; overflow:visible!important; margin:0!important; padding:0!important; background:white!important; color:#111827!important; font-family:Arial,"Noto Sans Myanmar",sans-serif!important; font-size:10pt!important; }
        #rto-print-document .rto-print-card { break-inside:avoid; page-break-inside:avoid; border:1px solid #cbd5e1; border-radius:6px; margin:0 0 11mm; padding:3.5mm; background:#fff; }
        #rto-print-document table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:9pt; }
        #rto-print-document th, #rto-print-document td { padding:5px 6px; border:1px solid #cbd5e1; text-align:left; overflow-wrap:anywhere; white-space:normal; vertical-align:top; }
        #rto-print-document th { background:#e5edf5!important; font-weight:700; }
        #rto-print-document h1 { font-size:19pt; font-weight:800; margin:0 0 2mm; }
        #rto-print-document h2 { font-size:12pt; margin:0 0 2mm; }
        #rto-print-document .print-meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:5px; margin:0 0 4mm; }
        #rto-print-document .print-attempts td { min-height:20px; }
        #rto-print-document .print-subhead { font-weight:700; margin:4mm 0 2mm; }
      }
    \`}</style>
    <section className="mb-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Merchant Return Report</p>
          <h1 className="mt-2 text-2xl font-black">RTO Report</h1>
          <p className="mt-1 text-sm text-slate-300">Recorded return scans, failed delivery reasons and attempt history for merchant reconciliation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={()=>void load()} className="rounded-xl border border-[#31506a] bg-[#12314a] px-4 py-2.5 text-sm font-bold"><RefreshCw size={15} className={"mr-2 inline "+(loading?"animate-spin":"")}/>Refresh</button>
          <button type="button" disabled={!visible.length} onClick={exportCsv} className="rounded-xl bg-[#f6b84b] px-4 py-2.5 text-sm font-extrabold text-[#061524] disabled:opacity-40"><Download size={15} className="mr-2 inline"/>Merchant CSV</button>
          <button type="button" disabled={!visible.length} onClick={()=>window.print()} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-extrabold text-[#061524] disabled:opacity-40"><Printer size={15} className="mr-2 inline"/>Print full report / PDF</button>
        </div>
      </div>
      {message&&<div role="alert" className="mt-3 rounded-lg border border-rose-500 bg-rose-950/30 p-3 text-sm text-rose-200">{message}</div>}
    </section>
    <section aria-label="RTO report filters" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-xs font-semibold text-slate-300 xl:col-span-2">Search way / recipient / reason
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-white px-3 text-slate-900"><Search size={15}/><input aria-label="Search RTO records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Way ID, name, phone, township..." className="min-h-11 w-full bg-transparent outline-none"/></div>
      </label>
      <label className="text-xs font-semibold text-slate-300 xl:col-span-2">Merchant
        <select aria-label="Filter merchant" value={merchant} onChange={e=>setMerchant(e.target.value)} className={"mt-1 "+controls}>
          <option value="">All merchants</option>{merchants.map((m:any)=><option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-300">RTO from<input aria-label="RTO date from" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className={"mt-1 "+controls}/></label>
      <label className="text-xs font-semibold text-slate-300">RTO to<input aria-label="RTO date to" type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)} className={"mt-1 "+controls}/></label>
      <label className="text-xs font-semibold text-slate-300 xl:col-span-2">Failure reason
        <select aria-label="Filter reason" value={reasonFilter} onChange={e=>setReasonFilter(e.target.value)} className={"mt-1 "+controls}><option value="">All recorded reasons</option>{rtoReasons.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-slate-300 xl:col-span-2">Recorded return attempts
        <select aria-label="Filter attempt count" value={attemptFilter} onChange={e=>setAttemptFilter(e.target.value)} className={"mt-1 "+controls}><option value="">All attempts</option><option value="1">At least 1 attempt</option><option value="2">At least 2 attempts</option><option value="3">At least 3 attempts</option></select>
      </label>
      <div className="flex items-end gap-2 xl:col-span-2"><button type="button" className="min-h-11 rounded-lg border border-slate-600 px-4 text-xs font-bold" onClick={()=>{setQuery("");setMerchant("");setDateFrom("");setDateTo("");setAttemptFilter("");setReasonFilter("");}}>Clear filters</button><span className="pb-3 text-xs text-slate-300">{visible.length} of {rows.length} loaded RTO records</span></div>
    </section>
    <section aria-label="RTO parcel list" className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-3">
      <div className="mb-3 flex items-center justify-between gap-2 text-xs"><strong>{visible.length} RTO parcels</strong><span>Snapshot: {dt(generatedAt)||"Not loaded"} · Yangon Time</span></div>
      <div data-rto-scroll="true" className="rto-screen-scroll max-h-[65vh] min-h-[300px] w-full overflow-auto rounded-xl border border-[#31506a]" style={{overscrollBehavior:"contain"}}>
        <table className="w-full min-w-[1600px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-[#f6b84b] text-[#061524]"><tr>{["Merchant","Delivery Way","Recipient / Phone","Township","COD","Attempt 1 · Date & Reason","Attempt 2 · Date & Reason","Attempt 3 · Date & Reason","Final RTO Reason","RTO Date","Rider","Wayplan"].map(t=><th key={t} className="whitespace-normal px-3 py-3 font-extrabold">{t}</th>)}</tr></thead>
          <tbody>{visible.map((r:any,i:number)=><tr key={text(r.delivery_way_id)+i} className="border-b border-[#31506a] align-top">
            <td className="px-3 py-3 font-bold">{text(r.merchant_name,r.merchant_code)}</td><td className="px-3 py-3 font-mono font-bold text-amber-300">{text(r.delivery_way_id,r.waybill_no)}</td>
            <td className="px-3 py-3">{text(r.recipient_name)}<div className="text-slate-300">{text(r.recipient_phone,r.phone_number)}</div></td>
            <td className="px-3 py-3">{text(r.township)}</td><td className="px-3 py-3">{Number(r.cod_amount||0).toLocaleString()} MMK</td>
            {[1,2,3].map(n=><td key={n} className="min-w-[170px] max-w-[220px] px-3 py-3"><span className="font-semibold">{text(r["reason_"+n+"_name"],"—")}</span><div className="text-slate-300">{dt(r["return_scan_"+n+"_at"])||"—"}</div>{r["remark_"+n]&&<div className="mt-1 text-slate-300">{r["remark_"+n]}</div>}</td>)}
            <td className="max-w-56 px-3 py-3 font-bold">{text(r.final_failed_reason,failureReason(r)||"—")}</td><td className="px-3 py-3">{dt(r.return_scan_3_at||r.last_return_scan_at)}</td><td className="px-3 py-3">{text(r.rider_name,r.rider_code)}</td><td className="max-w-40 break-all px-3 py-3">{text(r.wayplan_id)}</td>
          </tr>)}{!visible.length&&<tr><td colSpan={12} className="px-3 py-10 text-center">No RTO records match these filters.</td></tr>}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-300">Scroll horizontally to see the full attempt and wayplan columns; scroll vertically within the RTO list. The print layout below is separately paginated for A4 paper.</p>
    </section>
    <section id="rto-print-document" className="rto-print-document" aria-label="Printable detailed RTO report">
      <h1>Britium Express | Merchant Return-to-Origin Report</h1>
      <div className="print-meta"><div>Merchant: <strong>{merchant?merchants.find(m=>m.value===merchant)?.label||merchant:"All merchants"}</strong></div><div>Generated: {dt(printDate)} · Myanmar Time</div><div>Report parcels: {visible.length}</div></div>
      <p>Detailed audit of recorded delivery return scans. Missing attempts or remarks are shown as not recorded. Monetary values are source COD amounts, not a confirmed refund.</p>
      {visible.map((r:any,i:number)=><article key={text(r.delivery_way_id)+i} className="rto-print-card">
        <h2>{i+1}. {text(r.delivery_way_id,r.waybill_no)} — {text(r.merchant_name,r.merchant_code)}</h2>
        <table><tbody>
          <tr><th>Recipient / Phone</th><td>{text(r.recipient_name,"—")} / {text(r.recipient_phone,r.phone_number)||"—"}</td><th>Township</th><td>{text(r.township,"—")}</td></tr>
          <tr><th>Pickup / Wayplan</th><td>{text(r.pickup_id,"—")} / {text(r.wayplan_id,"—")}</td><th>COD</th><td>{Number(r.cod_amount||0).toLocaleString()} MMK</td></tr>
          <tr><th>Rider</th><td>{text(r.rider_name,r.rider_code)||"—"}</td><th>RTO Date</th><td>{dt(r.return_scan_3_at||r.last_return_scan_at)||"—"}</td></tr>
        </tbody></table>
        <div className="print-subhead">Recorded return / failed-delivery attempts</div>
        <table className="print-attempts"><thead><tr><th style={{width:"14%"}}>Attempt</th><th style={{width:"23%"}}>Time (Myanmar)</th><th style={{width:"28%"}}>Recorded reason</th><th>Operator remarks</th></tr></thead>
          <tbody>{[1,2,3].map(n=><tr key={n}><td>Attempt {n}</td><td>{dt(r["return_scan_"+n+"_at"])||"Not recorded"}</td><td>{text(r["reason_"+n+"_name"],"Not recorded")}</td><td>{text(r["remark_"+n],"—")}</td></tr>)}</tbody>
        </table>
        <p><strong>Final RTO reason:</strong> {text(r.final_failed_reason,failureReason(r)||"Not recorded")}<br/><strong>Additional remarks:</strong> {text(r.remarks,"—")}</p>
      </article>)}
      {!visible.length&&<p>No records match the selected filters.</p>}
    </section>
  </main>;
}
