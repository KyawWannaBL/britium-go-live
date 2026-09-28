// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function RiderPage() {
  const { t } = useLanguage();
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [edit,setEdit]=useState<any>(null);

  async function load(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_supervisor_workforce_master_center_v1",{p_type:"RIDER",p_status:null,p_search:null});
    if(error){setMessage(error.message);setRows([]);setLoading(false);return;}
    if(data?.ok===false){setMessage(data?.code||"Unable to load Rider master.");setRows([]);setLoading(false);return;}
    setRows(Array.isArray(data?.rows)?data.rows:[]);
    setLoading(false);
  }

  async function save(){
    if(!edit?.workforce_code || !edit?.workforce_name) return setMessage("Rider code and name are required.");
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_supervisor_workforce_master_upsert_v1",{p_payload:{
      workforce_type:"RIDER",
      workforce_code:String(edit.workforce_code).toUpperCase(),
      workforce_name:edit.workforce_name,
      phone:edit.phone||"",
      branch_code:edit.branch_code||"YGN",
      assigned_zone:edit.assigned_zone||"",
      employment_type:edit.employment_type||"FULL_TIME",
      status:edit.status||"ACTIVE"
    }});
    if(error || data?.ok===false){setMessage(error?.message||data?.code||"Unable to save Rider.");setLoading(false);return;}
    setMessage(data.workforce_code+" synchronized to Rider master and assignment lists.");
    setEdit(null);
    await load();
  }

  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q) return rows;
    return rows.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q));
  },[rows,search]);

  const active=rows.filter((r:any)=>String(r.status||"").toUpperCase()==="ACTIVE").length;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b border-[#1a3a5c] pb-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h1 className="mb-1 text-[16px] uppercase text-[#f6b84b]">{t("RIDER MANAGEMENT","ပို့ဆောင်ရေးဝန်ထမ်း (Rider) စီမံခန့်ခွဲမှု")}</h1>
        <p className="text-[13px] text-[#4d7a9b]">{t("Live Supabase Rider master synchronized to Supervisor, Wayplan, Rider App and commission workflows.","Supabase Rider Master ကို Supervisor, Wayplan, Rider App နှင့် Commission များသို့ တိုက်ရိုက်ချိတ်ဆက်ထားပါသည်။")}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>void load()} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-2.5 text-[13px] text-[#eef8ff]"><RefreshCw size={14} className={loading?"animate-spin":""}/>{t("Refresh","ပြန်ဖွင့်ရန်")}</button>
        <button onClick={()=>setEdit({workforce_type:"RIDER",workforce_code:"",workforce_name:"",phone:"",branch_code:"YGN",assigned_zone:"",employment_type:"FULL_TIME",status:"ACTIVE"})} className="flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black uppercase text-[#061524]"><Plus size={14}/>{t("Add Rider","Rider အသစ်ထည့်ရန်")}</button>
      </div>
    </div>

    {message && <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 text-sm font-bold text-[#f6b84b]">{message}</div>}

    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-[#4ea8de]">TOTAL RIDERS</div><div className="mt-1 text-[24px] font-black text-white">{rows.length}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-emerald-400">ACTIVE RIDERS</div><div className="mt-1 text-[24px] font-black text-white">{active}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-[#4ea8de]">MASTER SOURCE</div><div className="mt-1 text-[13px] font-black text-white">be_master_riders</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase tracking-widest text-[#f6b84b]">ASSIGNMENT SYNC</div><div className="mt-1 text-[13px] font-black text-emerald-400">LIVE</div></div>
    </div>

    {edit && <div className="rounded-3xl border border-[#f6b84b]/40 bg-[#0b2236] p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-black text-white">{edit.workforce_code?"Edit Rider":"New Rider"}</h2><button onClick={()=>setEdit(null)} className="text-sm text-[#8ab0c9]">Close</button></div>
      <div className="grid gap-3 md:grid-cols-4">
        <input value={edit.workforce_code||""} onChange={e=>setEdit({...edit,workforce_code:e.target.value.toUpperCase()})} placeholder="Rider Code" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.workforce_name||""} onChange={e=>setEdit({...edit,workforce_name:e.target.value})} placeholder="Rider Name" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.phone||""} onChange={e=>setEdit({...edit,phone:e.target.value})} placeholder="Phone" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.assigned_zone||""} onChange={e=>setEdit({...edit,assigned_zone:e.target.value})} placeholder="Assigned Zone" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.branch_code||""} onChange={e=>setEdit({...edit,branch_code:e.target.value.toUpperCase()})} placeholder="Branch" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <select value={edit.employment_type||"FULL_TIME"} onChange={e=>setEdit({...edit,employment_type:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"><option>FULL_TIME</option><option>PART_TIME</option><option>CONTRACT</option></select>
        <select value={edit.status||"ACTIVE"} onChange={e=>setEdit({...edit,status:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select>
        <button onClick={()=>void save()} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl bg-[#22c55e] p-3 font-black text-[#061524] disabled:opacity-50"><Save size={16}/>Save + Sync</button>
      </div>
    </div>}

    <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#1a3a5c] p-4"><Search size={16} className="text-[#4ea8de]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search rider code, name, phone, zone..." className="w-full bg-transparent text-sm text-white outline-none"/></div>
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="sticky top-0 bg-[#061524] text-[11px] uppercase tracking-widest text-[#4d7a9b]"><tr><th className="p-4">Code</th><th className="p-4">Name</th><th className="p-4">Phone</th><th className="p-4">Zone</th><th className="p-4">Branch</th><th className="p-4">Employment</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead>
          <tbody>{filtered.map((r:any)=><tr key={r.workforce_code} className="border-t border-[#1a3a5c]/50 text-white">
            <td className="p-4 font-mono text-[#38bdf8]">{r.workforce_code}</td><td className="p-4 font-bold">{r.workforce_name}</td><td className="p-4">{r.phone||"-"}</td><td className="p-4">{r.assigned_zone||"-"}</td><td className="p-4">{r.branch_code||"-"}</td><td className="p-4">{r.employment_type||"-"}</td><td className="p-4">{r.status||"-"}</td>
            <td className="p-4"><button onClick={()=>setEdit({...r})} className="text-[#f6b84b]">Edit</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </div>;
}
