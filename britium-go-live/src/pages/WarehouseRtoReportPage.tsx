// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function text(v:any,fallback=""){ const s=String(v??"").trim(); return s||fallback; }
function dt(v:any){ if(!v) return ""; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("en-GB",{timeZone:"Asia/Yangon"}); }
function csvCell(v:any){ return '"' + String(v??"").replace(/"/g,'""') + '"'; }

export default function WarehouseRtoReportPage(){
  const [loading,setLoading]=useState(false);
  const [rows,setRows]=useState<any[]>([]);
  const [merchantOptions,setMerchantOptions]=useState<any[]>([]);
  const [query,setQuery]=useState("");
  const [merchant,setMerchant]=useState("");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [message,setMessage]=useState("");

  async function loadMerchantOptions(){
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
    }catch(e:any){ setMessage(e?.message||"Could not load RTO report data."); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ void loadMerchantOptions(); void load(); },[]);

  const rtoRows=rows;

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
      r.delivery_township,r.merchant_name,r.merchant_code,r.return_reason_1_name,r.return_reason_2_name,
      r.return_reason_3_name,r.last_exception_reason,r.pending_return_reason_name
    ].join(" ").toLowerCase().includes(q);
  }),[rtoRows,merchant,dateFrom,dateTo,query]);

  function failureReason(r:any){
    return [
      text(r.reason_1_name),
      text(r.reason_2_name),
      text(r.reason_3_name),
      text(r.final_failed_reason)
    ].filter(Boolean).filter((v:string,i:number,a:string[])=>a.indexOf(v)===i).join(" | ");
  }

  function exportCsv(){
    const headers=["Merchant","Delivery Way","Waybill","Pickup","Recipient","Phone","Township","COD","Attempt 1 Reason","Attempt 2 Reason","Attempt 3 Reason","Final RTO Reason","RTO Date","Rider","Wayplan","Remarks"];
    const data=[headers,...visible.map((r:any)=>[
      text(r.merchant_name,r.merchant_code),text(r.delivery_way_id),text(r.waybill_no),text(r.pickup_id),
      text(r.recipient_name),text(r.recipient_phone,r.phone_number),text(r.delivery_township,r.township),
      Number(r.cod_amount||0),text(r.reason_1_name),text(r.reason_2_name),
      text(r.reason_3_name),failureReason(r),dt(r.return_scan_3_at||r.last_return_scan_at),
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

  return <main className="min-h-screen bg-[#061524] p-5 text-black">
    <style>{`@media print{aside,button,input,select,.no-print{display:none!important} body{background:white!important;color:black!important}.print-card{border:none!important;background:white!important;color:black!important}.print-card *{color:black!important} table{font-size:10px!important}}`}</style>
    <section className="print-card mb-4 rounded-3xl border border-slate-300 bg-white p-6 text-black">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-black">Merchant Return Report</div>
          <h1 className="mt-2 text-2xl font-black text-black">RTO Report</h1>
          <p className="mt-1 text-sm text-black">Return-to-origin parcels with failed delivery reasons and attempt history, ready to send back to the merchant.</p>
        </div>
        <div className="no-print flex gap-2">
          <button onClick={()=>void load()} className="rounded-xl border border-[#1a3a5c] bg-[#102b45] px-4 py-3 text-sm font-black"><RefreshCw size={16} className={"mr-2 inline "+(loading?"animate-spin":"")}/>Refresh</button>
          <button onClick={exportCsv} className="rounded-xl bg-[#f6b84b] px-4 py-3 text-sm font-black text-[#061524]"><Download size={16} className="mr-2 inline"/>Merchant CSV</button>
          <button onClick={()=>window.print()} className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-[#061524]"><Printer size={16} className="mr-2 inline"/>Print / PDF</button>
        </div>
      </div>
      {message?<div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-rose-200">{message}</div>:null}
    </section>

    <section className="no-print mb-4 grid gap-3 md:grid-cols-4">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-black"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Way ID / recipient / reason..." className="min-h-11 w-full bg-white text-black placeholder:text-slate-500 outline-none"/></div>
      <div className="relative">
        <input
          list="rto-merchant-options"
          value={merchant}
          onChange={e=>setMerchant(e.target.value)}
          placeholder="All Merchants — type name or code"
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-black placeholder:text-slate-500 outline-none"
        />
        <datalist id="rto-merchant-options">
          {merchants.flatMap((m:any)=>[
            <option key={m.value+"-code"} value={m.value}>{m.label}</option>,
            <option key={m.value+"-label"} value={m.label}>{m.value}</option>
          ])}
        </datalist>
      </div>
      <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 text-black"/>
      <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 text-black"/>
    </section>

    <section className="print-card rounded-3xl border border-slate-300 bg-white p-4 text-black">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><b>{visible.length}</b> RTO parcel(s){merchant.trim()?` · Merchant: ${merchant}`:""}</div>
        <div className="text-xs text-black">Generated: {dt(new Date().toISOString())}</div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[1500px] border-collapse text-xs">
          <thead><tr className="border-b border-slate-300 bg-[#f6b84b] text-left uppercase text-black">
            {["Merchant","Delivery Way","Recipient","Township","COD","Attempt 1","Attempt 2","Attempt 3","Final Reason","RTO Date","Rider","Wayplan"].map(h=><th key={h} className="p-2">{h}</th>)}
          </tr></thead>
          <tbody>{visible.map((r:any,i:number)=><tr key={text(r.delivery_way_id)+i} className="border-b border-slate-200 align-top text-black">
            <td className="p-2 font-bold">{text(r.merchant_name,r.merchant_code)}</td>
            <td className="p-2 font-bold">{text(r.delivery_way_id,r.waybill_no)}</td>
            <td className="p-2"><div>{text(r.recipient_name)}</div><div className="text-black">{text(r.recipient_phone,r.phone_number)}</div></td>
            <td className="p-2">{text(r.delivery_township,r.township)}</td>
            <td className="p-2">{Number(r.cod_amount||0).toLocaleString()} MMK</td>
            <td className="max-w-[220px] whitespace-normal p-2">{text(r.reason_1_name,"-")}</td>
            <td className="max-w-[220px] whitespace-normal p-2">{text(r.reason_2_name,"-")}</td>
            <td className="max-w-[220px] whitespace-normal p-2">{text(r.reason_3_name,"-")}</td>
            <td className="max-w-[300px] whitespace-normal p-2 font-bold text-black">{failureReason(r)||"-"}</td>
            <td className="p-2">{dt(r.return_scan_3_at||r.last_return_scan_at)}</td>
            <td className="p-2">{text(r.rider_name,r.rider_code)}</td>
            <td className="p-2">{text(r.wayplan_id)}</td>
          </tr>)}
          {!visible.length?<tr><td colSpan={12} className="p-12 text-center text-black">No RTO parcels match the current filters.</td></tr>:null}</tbody>
        </table>
      </div>
    </section>
  </main>;
}
