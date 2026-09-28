// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, Plus, RefreshCw, Save, Search, Store, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

export default function MarketingPortalPage(){
  const {t}=useLanguage();
  const [tab,setTab]=useState("overview");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  const [leads,setLeads]=useState<any[]>([]);
  const [leadSearch,setLeadSearch]=useState("");
  const [leadSummary,setLeadSummary]=useState<any>({});
  const [leadForm,setLeadForm]=useState<any>(null);

  const [merchants,setMerchants]=useState<any[]>([]);
  const [merchantSearch,setMerchantSearch]=useState("");
  const [merchantStatus,setMerchantStatus]=useState("");
  const [merchantForm,setMerchantForm]=useState<any>(null);

  async function loadLeads(){
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_marketing_lead_snapshot_v1",{p_search:leadSearch.trim()||null,p_limit:1000});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Marketing lead backend unavailable.");setLoading(false);return;}
    setLeads(Array.isArray(data?.rows)?data.rows:[]);
    setLeadSummary(data||{});setLoading(false);
  }
  async function loadMerchants(){
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_marketing_merchant_master_center_v1",{p_search:merchantSearch.trim()||null,p_status:merchantStatus||null,p_limit:1000});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Merchant master unavailable.");setLoading(false);return;}
    setMerchants(Array.isArray(data?.rows)?data.rows:[]);setLoading(false);
  }
  async function saveLead(){
    if(!leadForm?.entity_name?.trim())return setMessage("Lead name is required.");
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_marketing_lead_upsert_v1",{p_payload:leadForm});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Lead save failed.");setLoading(false);return;}
    setMessage("Lead saved to Supabase Marketing pipeline.");setLeadForm(null);await loadLeads();
  }
  async function saveMerchant(){
    if(!merchantForm?.merchant_name?.trim()||String(merchantForm?.merchant_code||"").length!==3)return setMessage("Merchant name and 3-character code are required.");
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_marketing_merchant_master_upsert_v1",{p_payload:merchantForm});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Merchant save failed.");setLoading(false);return;}
    setMessage(String(data.merchant_code)+" synchronized to the application-wide Merchant Master.");
    setMerchantForm(null);await loadMerchants();
  }

  useEffect(()=>{void loadLeads();void loadMerchants()},[]);

  const stages=useMemo(()=>({
    new:leads.filter((x:any)=>["new","prospect"].includes(String(x.stage||x.status||"").toLowerCase())).length,
    qualified:leads.filter((x:any)=>String(x.stage||"").toLowerCase()==="qualified").length,
    converted:leadSummary.converted||0,
  }),[leads,leadSummary]);

  return <div className="min-h-screen bg-[#061524] p-5 text-[#eef8ff]">
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-[#ff4f86]"><Megaphone size={15}/>Marketing & Growth</div><h1 className="mt-2 text-3xl font-black">{t("Marketing Portal","စျေးကွက်ရှာဖွေရေး စင်တာ")}</h1><p className="mt-2 text-sm text-[#8fb2c9]">Live lead acquisition, merchant onboarding and conversion tracking linked to the same Supabase masters used by Pickup, Finance and Merchant Portal.</p></div>
          <button onClick={()=>{void loadLeads();void loadMerchants()}} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 font-black"><RefreshCw size={16} className={loading?"animate-spin":""}/>Refresh</button>
        </div>
        {message&&<div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Total Leads",leadSummary.count||leads.length,Users,"#38bdf8"],["Merchant Leads",leadSummary.merchant_leads||0,Store,"#f6b84b"],["Customer Leads",leadSummary.customer_leads||0,Users,"#a855f7"],["Converted",leadSummary.converted||0,TrendingUp,"#22c55e"],["Active Merchants",merchants.filter((m:any)=>String(m.status).toUpperCase()==="ACTIVE").length,Store,"#22c55e"]].map(([a,b,I,c]:any)=><div key={a} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="flex justify-between text-[10px] font-black uppercase text-[#8fb2c9]"><span>{a}</span><I size={17} color={c}/></div><div className="mt-2 text-2xl font-black">{b}</div></div>)}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#1a3a5c] pb-3">
        {[["overview","Overview"],["leads","Lead Registry"],["merchants","Merchant Accounts"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={"rounded-xl px-5 py-2.5 text-sm font-black "+(tab===id?"bg-[#f6b84b] text-[#061524]":"border border-[#1a3a5c] bg-[#0b2236]")}>{label}</button>)}
      </div>

      {tab==="overview"&&<div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="font-black">Live Lead Funnel</h2><div className="mt-4 grid grid-cols-3 gap-3">{[["New",stages.new],["Qualified",stages.qualified],["Converted",stages.converted]].map(([a,b])=><div key={a} className="rounded-xl bg-[#061524] p-4"><div className="text-xs text-[#8fb2c9]">{a}</div><div className="mt-1 text-2xl font-black text-[#f6b84b]">{b}</div></div>)}</div></div>
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="font-black">Integration Status</h2><div className="mt-4 space-y-2 text-sm text-[#9cc2d9]"><div className="rounded-xl bg-[#061524] p-3">Lead records → Supabase Marketing pipeline</div><div className="rounded-xl bg-[#061524] p-3">Converted contract → Merchant Master</div><div className="rounded-xl bg-[#061524] p-3">Merchant Master → Pickup / Data Entry / Finance / Merchant Portal</div></div></div>
      </div>}

      {tab==="leads"&&<div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-4 lg:flex-row"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-[#6f91aa]"/><input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void loadLeads()}} placeholder="Search lead, phone, township, stage..." className="h-10 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] pl-9 pr-3"/></div><button onClick={()=>void loadLeads()} className="h-10 rounded-xl border border-[#1a3a5c] px-4 font-black">Search</button><button onClick={()=>setLeadForm({customer_or_merchant:"merchant",entity_name:"",contact_name:"",phone:"",email:"",city:"Yangon",township:"",stage:"new",status:"new",source:"FIELD_VISIT",expected_revenue:"0",expected_volume:"0",notes:""})} className="flex h-10 items-center gap-2 rounded-xl bg-[#ff4f86] px-4 font-black text-white"><Plus size={15}/>Add Lead</button></div>
        {leadForm&&<div className="rounded-3xl border border-[#ff4f86]/40 bg-[#0b2236] p-5"><h3 className="font-black text-[#ff7aa2]">{leadForm.id?"Edit Lead":"New Marketing Lead"}</h3><div className="mt-4 grid gap-3 md:grid-cols-3">
          {[["entity_name","Lead / Company Name"],["contact_name","Contact Person"],["phone","Phone"],["email","Email"],["city","City"],["township","Township"],["source","Source"],["expected_volume","Expected Monthly Parcels"],["expected_revenue","Expected Revenue"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input type={k.startsWith("expected_")?"number":"text"} value={leadForm[k]??""} onChange={e=>setLeadForm({...leadForm,[k]:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>)}
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Type</span><select value={leadForm.customer_or_merchant||"merchant"} onChange={e=>setLeadForm({...leadForm,customer_or_merchant:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="merchant">Merchant</option><option value="customer">Customer</option></select></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Stage</span><select value={leadForm.stage||"new"} onChange={e=>setLeadForm({...leadForm,stage:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="new">New</option><option value="qualified">Qualified</option><option value="follow_up">Follow Up</option><option value="proposal">Proposal</option><option value="converted">Converted</option><option value="lost">Lost</option></select></label>
          <label className="md:col-span-3 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Notes</span><input value={leadForm.notes||""} onChange={e=>setLeadForm({...leadForm,notes:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>
        </div><div className="mt-4 flex gap-2"><button onClick={()=>void saveLead()} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 font-black text-[#061524]"><Save size={16}/>Save + Sync</button><button onClick={()=>setLeadForm(null)} className="h-11 rounded-xl border border-[#1a3a5c] px-5 font-black">Cancel</button></div></div>}
        <div className="space-y-2">{leads.map((r:any)=><button key={r.id} onClick={()=>setLeadForm({...r,entity_name:r.entity_name||r.lead_name||""})} className="w-full rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 text-left hover:border-[#ff4f86]"><div className="flex justify-between"><div><div className="font-mono text-xs font-black text-[#38bdf8]">{r.lead_no||"-"}</div><div className="mt-1 font-black">{r.entity_name||r.lead_name||"-"}</div></div><span className="h-fit rounded-full bg-[#061524] px-3 py-1 text-[10px] font-black uppercase">{r.stage||r.status||"new"}</span></div><div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8fb2c9]"><span>{r.contact_name||"-"} · {r.phone||"-"}</span><span>{r.township||r.city||"-"}</span><span>{r.source||"-"}</span><span>{money(r.expected_revenue)}</span></div></button>)}</div>
      </div>}

      {tab==="merchants"&&<div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex justify-between"><div><h2 className="font-black">Create / Update Merchant Account</h2><p className="mt-1 text-xs text-[#8fb2c9]">Use after contract execution. Save synchronizes to operational merchant masters.</p></div><button onClick={()=>setMerchantForm({merchant_code:"",merchant_name:"",business_type:"",contact_person:"",phone_primary:"",phone_secondary:"",email:"",address_mm:"",address_line_1:"",township:"",city:"Yangon",region_state:"Yangon",customer_tier:"STANDARD",payment_profile:"COD",service_profile:"STANDARD",status:"ACTIVE"})} className="h-10 rounded-xl bg-[#22c55e] px-4 font-black text-[#061524]"><Plus size={15} className="inline mr-1"/>New</button></div>
          {merchantForm&&<><div className="mt-4 grid gap-3 md:grid-cols-2">{[["merchant_code","Merchant Code (3)"],["merchant_name","Merchant Name"],["business_type","Business Type"],["contact_person","Contact Person"],["phone_primary","Primary Phone"],["phone_secondary","Secondary Phone"],["email","Email"],["township","Township"],["city","City"],["region_state","Region / State"],["address_line_1","Pickup Address"],["address_mm","Myanmar Address"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input maxLength={k==="merchant_code"?3:undefined} value={merchantForm[k]??""} onChange={e=>setMerchantForm({...merchantForm,[k]:k==="merchant_code"?e.target.value.toUpperCase():e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/></label>)}
            <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Tier</span><select value={merchantForm.customer_tier||"STANDARD"} onChange={e=>setMerchantForm({...merchantForm,customer_tier:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option></select></label>
            <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Status</span><select value={merchantForm.status||"ACTIVE"} onChange={e=>setMerchantForm({...merchantForm,status:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select></label>
          </div><button onClick={()=>void saveMerchant()} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-[#22c55e] px-5 font-black text-[#061524]"><Save size={16}/>Save + Synchronize Merchant</button></>}
        </div>
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="flex flex-col gap-2 lg:flex-row"><input value={merchantSearch} onChange={e=>setMerchantSearch(e.target.value)} placeholder="Search merchant..." className="h-10 flex-1 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"/><select value={merchantStatus} onChange={e=>setMerchantStatus(e.target.value)} className="h-10 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3"><option value="">All</option><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select><button onClick={()=>void loadMerchants()} className="h-10 rounded-xl border border-[#1a3a5c] px-4 font-black">Refresh</button></div><div className="mt-4 max-h-[720px] space-y-2 overflow-auto">{merchants.map((m:any)=><button key={m.merchant_code} onClick={()=>setMerchantForm({...m,payment_profile:"COD",service_profile:"STANDARD"})} className="w-full rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4 text-left hover:border-[#22c55e]"><div className="flex justify-between"><div><span className="font-mono font-black text-[#22c55e]">{m.merchant_code}</span><span className="ml-2 font-black">{m.merchant_name}</span></div><span className="text-[10px] font-black">{m.status}</span></div><div className="mt-2 text-xs text-[#8fb2c9]">{m.contact_person||"-"} · {m.phone_primary||"-"} · {[m.township,m.city].filter(Boolean).join(", ")}</div></button>)}</div></div>
      </div>}
    </div>
  </div>;
}
