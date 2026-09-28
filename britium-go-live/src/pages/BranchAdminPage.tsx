// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, RefreshCw, Search, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

export default function BranchAdminPage(){
  const {profile}=useAuth();
  const [data,setData]=useState<any>({summary:{},branches:[],staff:[],shipments:[],amendments:[]});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [branch,setBranch]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    setLoading(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_branch_office_snapshot",{p_branch_code:branch||null,p_limit:500});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Branch Admin backend unavailable.");setLoading(false);return;}
    setData(data||{});setLoading(false);
  }
  useEffect(()=>{void load()},[branch]);

  async function decide(row:any,decision:"APPROVED"|"REJECTED"){
    setBusy(row.id);setMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const {data,error}=await (supabase as any).rpc("be_branch_amendment_decide",{p_payload:{
      amendment_id:row.id,decision,actor_email:user?.email||null,actor_role:profile?.role||"branch_admin",decision_note:"Branch Admin portal decision"
    }});
    if(error||data?.ok===false){setMessage(error?.message||data?.error||"Amendment decision failed.");setBusy("");return;}
    setMessage("Amendment "+decision.toLowerCase()+" and audit trail updated.");setBusy("");await load();
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.22em] text-[#f6b84b]">BRANCH ADMINISTRATION</div><h1 className="mt-2 text-3xl font-black">Branch Admin Control Center</h1><p className="mt-2 text-sm text-[#8fb2c9]">Live branch network, staff, shipments, COD exposure and controlled amendment approvals.</p></div><div className="flex gap-2"><select value={branch} onChange={e=>setBranch(e.target.value)} className="h-11 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="">All Branches</option>{branches.map((b:any)=><option key={b.branch_code} value={b.branch_code}>{b.branch_code} · {b.branch_name||b.name||""}</option>)}</select><button onClick={()=>void load()} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button></div></div>
      {message&&<div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {[["Branches",s.branches||branches.length,Building2],["Active Branches",s.active_branches||0,Building2],["Staff",s.staff||staff.length,Users],["Shipments",s.shipments||shipments.length,Building2],["Pending Shipments",s.pending_shipments||0,Building2],["COD Total",money(s.cod_total),Building2]].map(([l,v,I]:any)=><div key={l} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="flex justify-between text-[10px] font-black uppercase text-[#8fb2c9]"><span>{l}</span><I size={16} className="text-[#38bdf8]"/></div><div className="mt-2 text-xl font-black">{v}</div></div>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex items-center justify-between"><h2 className="font-black">Pending Amendments</h2><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">{s.pending_amendments||0}</span></div><div className="mt-4 max-h-[580px] space-y-3 overflow-auto">
        {amendments.map((a:any)=><div key={a.id} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4"><div className="flex justify-between gap-3"><div><div className="text-xs font-black text-[#38bdf8]">{a.branch_code||"-"} · {a.request_type||"AMENDMENT"}</div><div className="mt-1 font-mono text-xs">{a.target_id||"-"}</div></div><span className="h-fit rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-300">{a.approval_status||"PENDING"}</span></div><div className="mt-2 text-xs text-[#8fb2c9]">{a.remarks||"No remarks"}</div>{String(a.approval_status||"PENDING").toUpperCase()==="PENDING"&&<div className="mt-3 flex gap-2"><button disabled={busy===a.id} onClick={()=>void decide(a,"APPROVED")} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500 font-black text-[#061524]"><CheckCircle2 size={15}/>Approve</button><button disabled={busy===a.id} onClick={()=>void decide(a,"REJECTED")} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-rose-500 font-black text-white"><XCircle size={15}/>Reject</button></div>}</div>)}
        {!amendments.length&&<div className="p-8 text-center text-[#6f91aa]">No amendment requests.</div>}
      </div></div>
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><h2 className="font-black">Branch Shipment Monitor</h2><div className="relative"><Search size={15} className="absolute left-3 top-3 text-[#6f91aa]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Way ID, recipient, status..." className="h-10 min-w-[320px] rounded-xl border border-[#1a3a5c] bg-[#061524] pl-9 pr-3"/></div></div><div className="mt-4 max-h-[580px] overflow-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="sticky top-0 bg-[#061524] text-[#8fb2c9]"><tr><th className="p-3">Branch</th><th>Way ID</th><th>Recipient</th><th>Township</th><th>Status</th><th>COD</th></tr></thead><tbody>{filtered.map((r:any)=><tr key={r.id||r.delivery_way_id||r.waybill_no} className="border-t border-[#1a3a5c]/60"><td className="p-3">{r.branch_code||"-"}</td><td className="font-mono text-[#38bdf8]">{r.delivery_way_id||r.waybill_no||r.tracking_no||"-"}</td><td>{r.recipient_name||"-"}</td><td>{r.township||"-"}</td><td>{r.shipment_status||r.status||"-"}</td><td>{money(r.cod_amount)}</td></tr>)}</tbody></table>{!filtered.length&&<div className="p-10 text-center text-[#6f91aa]">No branch shipments found.</div>}</div></div>
    </section>
  </div>;
}
