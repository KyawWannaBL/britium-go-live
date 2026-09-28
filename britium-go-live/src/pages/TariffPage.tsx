// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Calculator, Database, Edit3, RefreshCw, Save, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type TariffRow = {
  id: string; township: string; zone: string; tier: string; baseFee: number;
  includedKg: number; extraPerKg: number; status: string; source: string; note: string;
};

const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0};
const txt=(...xs:any[])=>{for(const x of xs){const s=String(x??"").trim();if(s)return s}return ""};

function normalize(row:any,source:string,index:number):TariffRow|null{
  const p=row?.payload&&typeof row.payload==="object"?{...row.payload,...row}:row||{};
  const township=txt(p.township,p.township_name,p.destination_township,p.destination,p.value,p.label,p.name);
  const baseFee=num(p.base_fee,p.base_fee_mmk,p.base_delivery_charge,p.delivery_fee,p.delivery_charge,p.deli_charge,p.amount_mmk,p.price);
  if(!township&&!baseFee)return null;
  return {
    id:txt(p.id,p.record_key,p.tariff_id,source+"-"+index),
    township:township||"Unspecified destination",
    zone:txt(p.zone,p.city,p.region_state,p.branch_name,p.branch_code,"-"),
    tier:txt(p.customer_tier,p.customer_type,p.service_type,p.tier,"STANDARD").toUpperCase(),
    baseFee,
    includedKg:num(p.included_kg,p.included_weight_kg,p.allowance_kg,3),
    extraPerKg:num(p.extra_per_kg,p.extra_kg_rate,p.per_kg_rate,500),
    status:txt(p.status,p.record_status,p.is_active===false?"inactive":"active"),
    source,
    note:txt(p.note,p.remarks,p.route_type,p.myanmar_label,p.label_mm,"-"),
  };
}
function rowsFrom(v:any,source:string){
  const a=Array.isArray(v)?v:Array.isArray(v?.rows)?v.rows:Array.isArray(v?.data)?v.data:[];
  return a.map((r:any,i:number)=>normalize(r,source,i)).filter(Boolean) as TariffRow[];
}
async function loadTownshipTariffs(){
  const errors:string[]=[];
  // Canonical operational delivery tariff master comes first because this is
  // the backend used by routing/calculation and is the only township source
  // exposed for direct Superadmin editing from this portal.
  for(const table of ["be_delivery_tariff_master_v13","be_md_tariffs","tariff_master","township_tariffs","tariffs"]){
    try{
      const {data,error}=await (supabase as any).from(table).select("*").limit(3000);
      if(error)throw error;
      const rows=rowsFrom(data,"table "+table);
      if(rows.length)return {rows,source:"table "+table};
    }catch(e:any){errors.push(table+": "+(e?.message||"unavailable"))}
  }
  try{
    const {data,error}=await (supabase as any).rpc("be_master_data_snapshot",{p_master_type:"tariff_master",p_search:null,p_start_date:null,p_end_date:null});
    if(error)throw error;
    const rows=rowsFrom(data,"RPC be_master_data_snapshot");
    if(rows.length)return {rows,source:"RPC be_master_data_snapshot"};
  }catch(e:any){errors.push(e?.message||"master snapshot unavailable")}
  throw new Error(errors[0]||"No live tariff rows returned.");
}

export default function TariffPage(){
  const {profile}=useAuth();
  const role=String(profile?.role||"").toLowerCase().replaceAll("-","_");
  const canEdit=role==="superadmin"||role==="super_admin";
  const [rows,setRows]=useState<TariffRow[]>([]);
  const [tiers,setTiers]=useState<any[]>([]);
  const [edit,setEdit]=useState<any>(null);
  const [editOperational,setEditOperational]=useState<any>(null);
  const [search,setSearch]=useState("");
  const [source,setSource]=useState("Waiting for backend");
  const [lastSynced,setLastSynced]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    setLoading(true);setMessage("");
    const [tierResult,townResult]=await Promise.allSettled([
      (supabase as any).rpc("be_tariff_list"),
      loadTownshipTariffs(),
    ]);
    if(tierResult.status==="fulfilled"&&!tierResult.value.error){
      setTiers(Array.isArray(tierResult.value.data)?tierResult.value.data:[]);
    }else if(tierResult.status==="fulfilled"&&tierResult.value.error){
      setMessage(tierResult.value.error.message);
    }
    if(townResult.status==="fulfilled"){
      setRows(townResult.value.rows);setSource(townResult.value.source);
    }else{
      setRows([]);setSource("No live township tariff source");setMessage(townResult.reason?.message||"Unable to load township tariffs.");
    }
    setLastSynced(new Date().toLocaleString());setLoading(false);
  }

  async function saveOperationalTariff(){
    if(!editOperational||!canEdit)return;
    setSaving(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_delivery_tariff_update_v1",{
      p_id:editOperational.id,
      p_base_fee:Number(editOperational.baseFee||0),
      p_included_kg:Number(editOperational.includedKg||0),
      p_extra_per_kg:Number(editOperational.extraPerKg||0),
      p_status:editOperational.status||"active",
      p_note:editOperational.note||null,
    });
    if(error||data?.ok===false){
      setMessage(error?.message||data?.message||"Operational tariff update failed.");setSaving(false);return;
    }
    setMessage(editOperational.township+" updated directly in the canonical Supabase delivery tariff master and recorded in the audit log.");
    setEditOperational(null);setSaving(false);await load();
  }

  async function saveTier(){
    if(!edit||!canEdit)return;
    setSaving(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_tariff_update",{
      p_tier:edit.tier_name,
      p_base_fee:Number(edit.base_fee_mmk||0),
      p_extra_per_kg:Number(edit.extra_per_kg_mmk||0),
      p_free_kg:Number(edit.free_allowance_kg||0),
      p_highway_fee:Number(edit.highway_fee_mmk||0),
    });
    if(error||data?.ok===false){
      setMessage(error?.message||data?.message||"Tariff update failed.");setSaving(false);return;
    }
    setMessage(edit.tier_name+" updated directly in Supabase and recorded in the audit log.");
    setEdit(null);setSaving(false);await load();
  }

  useEffect(()=>{void load()},[]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();if(!q)return rows;
    return rows.filter(r=>(r.township+" "+r.zone+" "+r.tier+" "+r.status+" "+r.note+" "+r.source).toLowerCase().includes(q));
  },[rows,search]);

  return <main className="min-h-screen bg-[#061524] p-4 text-[#c8dff0]">
    <div className="mx-auto max-w-[1800px] space-y-4">
      <header className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-[#f6b84b]"><Database size={15}/>Live Tariff Control</div>
            <h1 className="mt-2 flex items-center gap-2 text-3xl font-black text-white"><Calculator className="text-[#38bdf8]"/>Tariff Portal</h1>
            <p className="mt-2 text-sm text-[#9cc2d9]">Canonical Supabase tier editor plus operational township/destination tariff catalogue.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={"rounded-full border px-3 py-2 text-xs font-black "+(canEdit?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":"border-slate-500/40 bg-slate-500/10 text-slate-300")}>{canEdit?"SUPERADMIN EDIT ENABLED":"READ ONLY"}</span>
            <button onClick={()=>void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f6b84b] px-4 text-xs font-black text-[#061524] disabled:opacity-50"><RefreshCw size={15} className={loading?"animate-spin":""}/>{loading?"Refreshing...":"Refresh"}</button>
          </div>
        </div>
        <div className="mt-3 text-xs text-[#779bb2]">Township source: {source} · Last sync: {lastSynced||"-"}</div>
        {message&&<div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-bold text-amber-200"><AlertCircle size={17}/>{message}</div>}
      </header>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div><h2 className="text-lg font-black text-white">Core Customer Tier Master</h2><p className="mt-1 text-xs text-[#9cc2d9]">Edits call <b>be_tariff_update</b>. Backend authorization independently rejects every non-Superadmin write.</p></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {tiers.map((t:any)=><div key={t.tier_name} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-black text-[#f6b84b]">{t.tier_name}</div><div className="mt-1 text-[10px] font-black text-emerald-300">{t.is_active===false?"INACTIVE":"ACTIVE"}</div></div>{canEdit&&<button onClick={()=>setEdit({...t})} className="inline-flex items-center gap-1 rounded-lg border border-[#f6b84b]/40 px-3 py-2 text-xs font-black text-[#f6b84b]"><Edit3 size={14}/>Edit</button>}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className="text-[#7fa3ba]">Base Fee</span><div className="font-black text-white">{Number(t.base_fee_mmk||0).toLocaleString()} MMK</div></div><div><span className="text-[#7fa3ba]">Free KG</span><div className="font-black text-white">{t.free_allowance_kg||0} kg</div></div><div><span className="text-[#7fa3ba]">Extra / KG</span><div className="font-black text-white">{Number(t.extra_per_kg_mmk||0).toLocaleString()} MMK</div></div><div><span className="text-[#7fa3ba]">Highway</span><div className="font-black text-white">{Number(t.highway_fee_mmk||0).toLocaleString()} MMK</div></div></div>
          </div>)}
        </div>
        {edit&&canEdit&&<div className="mt-4 rounded-2xl border border-[#f6b84b]/40 bg-[#061524] p-4">
          <div className="flex items-center justify-between"><h3 className="font-black text-[#f6b84b]">Edit {edit.tier_name}</h3><button onClick={()=>setEdit(null)}><X size={18}/></button></div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            {[["base_fee_mmk","Base Fee (MMK)"],["free_allowance_kg","Free Allowance KG"],["extra_per_kg_mmk","Extra / KG (MMK)"],["highway_fee_mmk","Highway Fee (MMK)"]].map(([key,label])=><label key={key} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{label}</span><input type="number" min="0" value={edit[key]??0} onChange={e=>setEdit({...edit,[key]:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-3 text-white outline-none focus:border-[#f6b84b]"/></label>)}
          </div>
          <button onClick={()=>void saveTier()} disabled={saving} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-5 font-black text-[#061524] disabled:opacity-50"><Save size={16}/>{saving?"Saving...":"Save Directly to Supabase"}</button>
        </div>}
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="flex flex-col gap-3 border-b border-[#1a3a5c] p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-black text-white">Operational Township / Destination Tariffs</h2><p className="text-xs text-[#9cc2d9]">{rows.length} live rows · Canonical delivery rows are directly editable by Superadmin only</p></div><div className="relative w-full lg:w-[420px]"><Search size={16} className="absolute left-3 top-3 text-[#64748b]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search township, zone, tier, status..." className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-sm font-bold text-[#061524] outline-none"/></div></div>
        {editOperational&&canEdit&&<div className="border-b border-[#1a3a5c] bg-[#061524] p-4 text-[#c8dff0]">
          <div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-widest text-[#f6b84b]">Edit Operational Tariff</div><h3 className="mt-1 font-black text-white">{editOperational.township} · {editOperational.tier}</h3></div><button onClick={()=>setEditOperational(null)}><X size={18}/></button></div>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            {[["baseFee","Base Charge (MMK)"],["includedKg","Included KG"],["extraPerKg","Extra / KG (MMK)"],["status","Status"],["note","Note"]].map(([key,label])=><label key={key} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{label}</span><input type={key==="note"||key==="status"?"text":"number"} min="0" value={editOperational[key]??""} onChange={e=>setEditOperational({...editOperational,[key]:e.target.value})} className="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-3 text-white outline-none focus:border-[#f6b84b]"/></label>)}
          </div>
          <button onClick={()=>void saveOperationalTariff()} disabled={saving} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-5 font-black text-[#061524] disabled:opacity-50"><Save size={16}/>{saving?"Saving...":"Save Operational Tariff to Supabase"}</button>
        </div>}
        <div className="overflow-x-auto bg-white"><table className="min-w-[1200px] w-full text-left text-sm text-[#061524]"><thead className="bg-[#f6b84b] text-[11px] uppercase"><tr>{["Destination","Zone","Tier","Base Charge","Included KG","Extra / KG","Status","Note","Source","Action"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>
          {filtered.map(r=><tr key={r.id} className="border-t border-slate-200 hover:bg-amber-50"><td className="p-3 font-black">{r.township}</td><td>{r.zone}</td><td className="font-black">{r.tier}</td><td className="text-right font-black">{r.baseFee.toLocaleString()} MMK</td><td className="text-right">{r.includedKg}</td><td className="text-right">{r.extraPerKg.toLocaleString()} MMK</td><td><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">{r.status}</span></td><td className="max-w-[300px] p-3">{r.note}</td><td className="max-w-[240px] text-xs font-bold">{r.source}</td><td className="p-3">{canEdit&&r.source==="table be_delivery_tariff_master_v13"?<button onClick={()=>setEditOperational({...r})} className="inline-flex items-center gap-1 rounded-lg border border-[#061524]/20 px-3 py-2 text-xs font-black"><Edit3 size={14}/>Edit</button>:<span className="text-xs text-slate-400">Read only</span>}</td></tr>)}
          {!filtered.length&&<tr><td colSpan={10} className="p-12 text-center font-black">No tariff rows match the search.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </main>;
}
