// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DriverPage() {
  const { t } = useLanguage();
  const [rows,setRows]=useState<any[]>([]);
  const [tab,setTab]=useState<"DRIVER"|"HELPER">("DRIVER");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [edit,setEdit]=useState<any>(null);

  async function load(){
    setLoading(true); setMessage("");
    const {data,error}=await (supabase as any).rpc("be_supervisor_workforce_master_center_v1",{p_type:null,p_status:null,p_search:null});
    if(error){setMessage(error.message);setRows([]);setLoading(false);return;}
    if(data?.ok===false){setMessage(data?.code||"Unable to load workforce master.");setRows([]);setLoading(false);return;}
    setRows(Array.isArray(data?.rows)?data.rows:[]);
    setLoading(false);
  }

  async function save(){
    if(!edit?.workforce_code || !edit?.workforce_name) return setMessage("Workforce code and name are required.");
    setLoading(true);
    const {data,error}=await (supabase as any).rpc("be_supervisor_workforce_master_upsert_v1",{p_payload:{
      workforce_type:edit.workforce_type||tab,
      workforce_code:String(edit.workforce_code).toUpperCase(),
      workforce_name:edit.workforce_name,
      phone:edit.phone||"",
      branch_code:edit.branch_code||"YGN",
      assigned_zone:edit.assigned_zone||"",
      employment_type:edit.employment_type||"FULL_TIME",
      license_no:edit.license_no||"",
      assigned_fleet_id:edit.assigned_fleet_id||"",
      status:edit.status||"ACTIVE"
    }});
    if(error || data?.ok===false){setMessage(error?.message||data?.code||"Unable to save workforce.");setLoading(false);return;}
    setMessage(data.workforce_code+" synchronized to master and assignment lists.");
    setEdit(null); await load();
  }

  useEffect(()=>{void load();},[]);

  const typeRows=rows.filter((r:any)=>r.workforce_type===tab);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return typeRows;
    return typeRows.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(q));
  },[rows,tab,search]);
  const drivers=rows.filter((r:any)=>r.workforce_type==="DRIVER");
  const helpers=rows.filter((r:any)=>r.workforce_type==="HELPER");

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b border-[#1a3a5c] pb-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h1 className="mb-1 text-[16px] uppercase text-[#f6b84b]">{t("DRIVER / HELPER MANAGEMENT","ယာဉ်မောင်း နှင့် နောက်လိုက် စီမံခန့်ခွဲမှု")}</h1>
        <p className="text-[13px] text-[#4d7a9b]">{t("Live Driver/Helper master synchronized to Supervisor, Dispatch, Wayplan and field apps.","Driver/Helper Master ကို Supervisor, Dispatch, Wayplan နှင့် Field App များသို့ တိုက်ရိုက်ချိတ်ဆက်ထားပါသည်။")}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>void load()} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-2.5 text-[13px] text-[#eef8ff]"><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh</button>
        <button onClick={()=>setEdit({workforce_type:tab,workforce_code:"",workforce_name:"",phone:"",branch_code:"YGN",assigned_zone:"",employment_type:"FULL_TIME",license_no:"",assigned_fleet_id:"",status:"ACTIVE"})} className="flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524]"><Plus size={14}/>Add {tab==="DRIVER"?"Driver":"Helper"}</button>
      </div>
    </div>

    {message && <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 text-sm font-bold text-[#f6b84b]">{message}</div>}

    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase text-[#4ea8de]">TOTAL DRIVERS</div><div className="mt-1 text-2xl font-black text-white">{drivers.length}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase text-[#4ea8de]">TOTAL HELPERS</div><div className="mt-1 text-2xl font-black text-white">{helpers.length}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase text-[#f6b84b]">ACTIVE</div><div className="mt-1 text-2xl font-black text-white">{rows.filter((r:any)=>String(r.status).toUpperCase()==="ACTIVE").length}</div></div>
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="text-[11px] uppercase text-emerald-400">ASSIGNMENT SYNC</div><div className="mt-1 text-sm font-black text-emerald-400">LIVE</div></div>
    </div>

    <div className="flex gap-2 border-b border-[#1a3a5c] pb-3">
      <button onClick={()=>setTab("DRIVER")} className={`rounded-xl px-5 py-2.5 text-[12px] font-black ${tab==="DRIVER"?"bg-[#f6b84b] text-[#061524]":"border border-[#1a3a5c] bg-[#061524] text-white"}`}>Drivers</button>
      <button onClick={()=>setTab("HELPER")} className={`rounded-xl px-5 py-2.5 text-[12px] font-black ${tab==="HELPER"?"bg-[#f6b84b] text-[#061524]":"border border-[#1a3a5c] bg-[#061524] text-white"}`}>Helpers</button>
    </div>

    {edit && <div className="rounded-3xl border border-[#f6b84b]/40 bg-[#0b2236] p-5">
      <div className="mb-4 flex justify-between"><h2 className="font-black text-white">{edit.workforce_code?"Edit ":"New "}{edit.workforce_type||tab}</h2><button onClick={()=>setEdit(null)} className="text-[#8ab0c9]">Close</button></div>
      <div className="grid gap-3 md:grid-cols-4">
        <input value={edit.workforce_code||""} onChange={e=>setEdit({...edit,workforce_code:e.target.value.toUpperCase()})} placeholder="Code" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.workforce_name||""} onChange={e=>setEdit({...edit,workforce_name:e.target.value})} placeholder="Name" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.phone||""} onChange={e=>setEdit({...edit,phone:e.target.value})} placeholder="Phone" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.branch_code||""} onChange={e=>setEdit({...edit,branch_code:e.target.value.toUpperCase()})} placeholder="Branch" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        <input value={edit.assigned_zone||""} onChange={e=>setEdit({...edit,assigned_zone:e.target.value})} placeholder="Zone" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/>
        {(edit.workforce_type||tab)==="DRIVER" && <><input value={edit.license_no||""} onChange={e=>setEdit({...edit,license_no:e.target.value})} placeholder="License No." className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/><input value={edit.assigned_fleet_id||""} onChange={e=>setEdit({...edit,assigned_fleet_id:e.target.value})} placeholder="Fleet ID" className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"/></>}
        <select value={edit.status||"ACTIVE"} onChange={e=>setEdit({...edit,status:e.target.value})} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white"><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select>
        <button onClick={()=>void save()} className="flex items-center justify-center gap-2 rounded-xl bg-[#22c55e] p-3 font-black text-[#061524]"><Save size={16}/>Save + Sync</button>
      </div>
    </div>}

    <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#1a3a5c] p-4"><Search size={16} className="text-[#4ea8de]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="w-full bg-transparent text-white outline-none"/></div>
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="sticky top-0 bg-[#061524] text-[11px] uppercase tracking-widest text-[#4d7a9b]"><tr><th className="p-4">Code</th><th className="p-4">Name</th><th className="p-4">Phone</th><th className="p-4">Branch</th><th className="p-4">Zone / License</th><th className="p-4">Fleet</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead>
          <tbody>{filtered.map((r:any)=><tr key={r.workforce_type+"-"+r.workforce_code} className="border-t border-[#1a3a5c]/50 text-white"><td className="p-4 font-mono text-[#38bdf8]">{r.workforce_code}</td><td className="p-4 font-bold">{r.workforce_name}</td><td className="p-4">{r.phone||"-"}</td><td className="p-4">{r.branch_code||"-"}</td><td className="p-4">{r.assigned_zone||r.license_no||"-"}</td><td className="p-4">{r.assigned_fleet_id||"-"}</td><td className="p-4">{r.status||"-"}</td><td className="p-4"><button onClick={()=>setEdit({...r})} className="text-[#f6b84b]">Edit</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  </div>;
}
