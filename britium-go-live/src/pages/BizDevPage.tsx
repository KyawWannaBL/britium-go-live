// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Search, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

export default function BizDevPage(){
  const {t}=useLanguage();
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [stage,setStage]=useState("");
  const [edit,setEdit]=useState<any>(null);
  const [summary,setSummary]=useState<any>({});

  async function load(){
    setLoading(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_bd_pipeline_snapshot_v1",{p_search:search.trim()||null,p_limit:1000});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Business Development backend unavailable.");setLoading(false);return;}
    setRows(Array.isArray(data?.rows)?data.rows:[]);
    setSummary(data||{});setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  async function save(){
    if(!edit?.entity_name?.trim())return setMessage("Prospect / partner name is required.");
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_bd_account_upsert_v1",{p_payload:edit});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Unable to save prospect.");setLoading(false);return;}
    setMessage("Business Development account saved to Supabase.");setEdit(null);await load();
  }

  const filtered=useMemo(()=>rows.filter((r:any)=>!stage||String(r.stage||"prospect").toLowerCase()===stage),[rows,stage]);

  return <div className="space-y-6 text-[#eef8ff]">
    <div className="flex flex-col gap-4 border-b border-[#1a3a5c] pb-4 xl:flex-row xl:items-start xl:justify-between">
      <div><h1 className="text-[16px] font-black uppercase text-[#f6b84b]">{t("BUSINESS DEVELOPMENT","စီးပွားရေး တိုးချဲ့မှု")}</h1><p className="mt-1 text-[13px] text-[#4d7a9b]">Live partner acquisition pipeline, expected volumes/revenue, deal stages and merchant conversion.</p></div>
      <div className="flex gap-2"><button onClick={()=>void load()} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-2.5 text-sm"><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh</button><button onClick={()=>setEdit({account_type:"merchant",entity_name:"",contact_name:"",phone:"",email:"",city:"Yangon",township:"",stage:"prospect",expected_monthly_shipments:"0",expected_monthly_revenue:"0",status:"active",notes:""})} className="flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-sm font-black text-[#061524]"><Plus size={14}/>Add Prospect</button></div>
    </div>
    {message&&<div className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-[#4ea8de]">Active Prospects</div><div className="mt-1 text-2xl font-black">{summary.active_prospects||0}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-emerald-400">Deals Closed Won</div><div className="mt-1 text-2xl font-black">{summary.closed_won||0}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-[#f6b84b]">Pipeline Value</div><div className="mt-1 text-2xl font-black">{money(summary.pipeline_value)}</div></div>
    </div>

    {edit&&<div className="rounded-3xl border border-[#f6b84b]/40 bg-[#0b2236] p-5">
      <div className="mb-4 flex justify-between"><h2 className="font-black text-[#f6b84b]">{edit.id?"Edit Prospect":"New Prospect / Partner"}</h2><button onClick={()=>setEdit(null)} className="text-[#8ab0c9]">Close</button></div>
      <div className="grid gap-3 md:grid-cols-3">
        {[["entity_name","Company / Merchant Name"],["contact_name","Contact Person"],["phone","Phone"],["email","Email"],["city","City"],["township","Township"],["expected_monthly_shipments","Expected Monthly Shipments"],["expected_monthly_revenue","Expected Monthly Revenue"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input type={k.includes("expected_")?"number":"text"} value={edit[k]??""} onChange={e=>setEdit({...edit,[k]:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 text-white"/></label>)}
        <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Stage</span><select value={edit.stage||"prospect"} onChange={e=>setEdit({...edit,stage:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="prospect">Prospect</option><option value="qualified">Qualified</option><option value="proposal">Proposal</option><option value="negotiation">Negotiation</option><option value="closed_won">Closed Won</option><option value="closed_lost">Closed Lost</option></select></label>
        <label className="md:col-span-2 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Notes</span><input value={edit.notes||""} onChange={e=>setEdit({...edit,notes:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>
      </div>
      <button onClick={()=>void save()} disabled={loading} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 font-black text-[#061524]"><Save size={16}/>Save + Sync</button>
    </div>}

    <div className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
      <div className="flex flex-col gap-3 border-b border-[#1a3a5c] p-4 lg:flex-row lg:items-center"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-[#4d7a9b]"/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void load()}} placeholder="Search prospect, phone, stage..." className="h-10 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] pl-9 pr-3"/></div><select value={stage} onChange={e=>setStage(e.target.value)} className="h-10 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="">All Stages</option><option value="prospect">Prospect</option><option value="qualified">Qualified</option><option value="proposal">Proposal</option><option value="negotiation">Negotiation</option><option value="closed_won">Closed Won</option><option value="closed_lost">Closed Lost</option></select><button onClick={()=>void load()} className="h-10 rounded-xl border border-[#1a3a5c] px-4 font-black">Search</button></div>
      <div className="max-h-[650px] overflow-auto p-4 space-y-3">{filtered.map((r:any)=><button key={r.id} onClick={()=>setEdit({...r})} className="w-full rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4 text-left hover:border-[#f6b84b]"><div className="flex justify-between gap-3"><div><div className="font-mono text-xs font-black text-[#38bdf8]">{r.account_no||"-"}</div><div className="mt-1 font-black">{r.entity_name}</div></div><span className="h-fit rounded-full bg-[#1a3a5c] px-3 py-1 text-[10px] font-black uppercase">{r.stage||"prospect"}</span></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8ab0c9]"><span>{r.contact_name||"-"} · {r.phone||"-"}</span><span>{r.township||r.city||"-"}</span><span>{Number(r.expected_monthly_shipments||0).toLocaleString()} parcels/mo</span><span>{money(r.expected_monthly_revenue)}</span></div></button>)}{!filtered.length&&<div className="p-10 text-center text-[#4d7a9b]">No prospects found.</div>}</div>
    </div>
  </div>;
}
