// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw, Search, FileEdit, Package, Users, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

export default function BranchOfficePage(){
  const {profile}=useAuth();
  const fixedBranch=String(profile?.branch_code||"").trim().toUpperCase();
  const [branch,setBranch]=useState(fixedBranch);
  const [data,setData]=useState<any>({summary:{},branches:[],staff:[],shipments:[],amendments:[]});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [request,setRequest]=useState({request_type:"DATA_CORRECTION",target_id:"",remarks:""});

  async function load(){
    setLoading(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_branch_office_snapshot",{p_branch_code:(fixedBranch||branch)||null,p_limit:500});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Branch Office backend unavailable.");setLoading(false);return;}
    setData(data||{});setLoading(false);
  }

  useEffect(()=>{void load()},[fixedBranch,branch]);

  async function submitAmendment(){
    if(!request.target_id.trim()||!request.remarks.trim())return setMessage("Target reference and remarks are required.");
    const {data,error}=await (supabase as any).rpc("be_branch_amendment_request",{p_payload:{
      branch_code:fixedBranch||branch||null,
      request_type:request.request_type,
      target_id:request.target_id.trim(),
      remarks:request.remarks.trim(),
      requested_by_role:profile?.role||"branch_office"
    }});
    if(error||data?.ok===false)return setMessage(error?.message||data?.error||"Amendment request failed.");
    setMessage("Amendment request submitted to Branch Admin / HQ approval workflow.");
    setRequest({request_type:"DATA_CORRECTION",target_id:"",remarks:""});await load();
  }

  const branches=Array.isArray(data?.branches)?data.branches:[];
  const staff=Array.isArray(data?.staff)?data.staff:[];
  const shipments=Array.isArray(data?.shipments)?data.shipments:[];
  const amendments=Array.isArray(data?.amendments)?data.amendments:[];
  const q=search.trim().toLowerCase();
  const filtered=useMemo(()=>!q?shipments:shipments.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q)),[shipments,q]);
  const s=data?.summary||{};

  return <div className="space-y-5 text-[#eef8ff]">
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><div className="text-[11px] font-black uppercase tracking-[.22em] text-[#f6b84b]">BRANCH OFFICE PORTAL</div><h1 className="mt-2 text-3xl font-black">Branch Operations Dashboard</h1><p className="mt-2 text-sm text-[#8fb2c9]">Live branch-scoped shipments, staff, COD exposure and controlled amendment requests from Supabase.</p></div>
        <div className="flex gap-2">{!fixedBranch&&<select value={branch} onChange={e=>setBranch(e.target.value)} className="h-11 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="">All Branches</option>{branches.map((b:any)=><option key={b.branch_code} value={b.branch_code}>{b.branch_code} · {b.branch_name||b.name||""}</option>)}</select>}<button onClick={()=>void load()} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button></div>
      </div>
      {message&&<div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Branch",fixedBranch||branch||"ALL",Building2],
        ["Staff",s.staff||staff.length,Users],
        ["Shipments",s.shipments||shipments.length,Package],
        ["Pending",s.pending_shipments||0,Package],
        ["COD Exposure",money(s.cod_total),WalletCards]
      ].map(([l,v,I]:any)=><div key={l} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="flex justify-between text-[10px] font-black uppercase text-[#8fb2c9]"><span>{l}</span><I size={16} className="text-[#38bdf8]"/></div><div className="mt-2 text-xl font-black">{v}</div></div>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><h2 className="font-black">Live Branch Shipments</h2><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[#6f91aa]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Way ID, recipient, township, status..." className="h-10 min-w-[320px] rounded-xl border border-[#1a3a5c] bg-[#061524] pl-9 pr-3"/></div></div>
        <div className="mt-4 max-h-[640px] overflow-auto"><table className="w-full min-w-[860px] text-left text-xs"><thead className="sticky top-0 bg-[#061524] text-[#8fb2c9]"><tr><th className="p-3">Branch</th><th>Way ID</th><th>Recipient</th><th>Township</th><th>Status</th><th>COD</th></tr></thead><tbody>{filtered.map((r:any)=><tr key={r.id||r.delivery_way_id||r.waybill_no} className="border-t border-[#1a3a5c]/60"><td className="p-3">{r.branch_code||"-"}</td><td className="font-mono text-[#38bdf8]">{r.delivery_way_id||r.waybill_no||r.tracking_no||"-"}</td><td>{r.recipient_name||r.receiver_name||"-"}</td><td>{r.township||r.destination_township||"-"}</td><td>{r.shipment_status||r.status||"-"}</td><td>{money(r.cod_amount)}</td></tr>)}</tbody></table>{!filtered.length&&<div className="p-10 text-center text-[#6f91aa]">No branch shipments found.</div>}</div>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="flex items-center gap-2 font-black"><FileEdit size={17} className="text-[#f6b84b]"/>Request Amendment</h2><div className="mt-4 space-y-3"><select value={request.request_type} onChange={e=>setRequest({...request,request_type:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="DATA_CORRECTION">Data Correction</option><option value="FINANCE_CORRECTION">Finance Correction</option><option value="STATUS_CORRECTION">Status Correction</option><option value="OTHER">Other</option></select><input value={request.target_id} onChange={e=>setRequest({...request,target_id:e.target.value})} placeholder="Way ID / record reference" className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/><textarea value={request.remarks} onChange={e=>setRequest({...request,remarks:e.target.value})} placeholder="Reason / requested change" className="min-h-28 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/><button onClick={()=>void submitAmendment()} className="h-11 w-full rounded-xl bg-[#f6b84b] font-black text-[#061524]">Submit for Approval</button></div></div>
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex items-center justify-between"><h2 className="font-black">My Branch Amendments</h2><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">{s.pending_amendments||0} pending</span></div><div className="mt-4 max-h-[320px] space-y-2 overflow-auto">{amendments.map((a:any)=><div key={a.id} className="rounded-xl bg-[#061524] p-3 text-xs"><div className="font-mono text-[#38bdf8]">{a.target_id||a.request_no||"-"}</div><div className="mt-1 text-[#8fb2c9]">{a.request_type||"AMENDMENT"} · {a.approval_status||a.status||"PENDING"}</div><div className="mt-1">{a.remarks||a.reason||"-"}</div></div>)}{!amendments.length&&<div className="p-5 text-center text-[#6f91aa]">No amendment requests.</div>}</div></div>
      </div>
    </section>
  </div>;
}
