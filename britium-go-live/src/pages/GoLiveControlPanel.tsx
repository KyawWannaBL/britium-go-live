// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, DatabaseZap, Download, RefreshCw, ShieldAlert } from "lucide-react";

function downloadJson(filename:string,data:any){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

export default function GoLiveControlPanel(){
  const [loading,setLoading]=useState(false);
  const [report,setReport]=useState<any>(null);
  const [history,setHistory]=useState<any[]>([]);
  const [message,setMessage]=useState("");

  async function loadHistory(){
    const {data,error}=await (supabase as any).rpc("be_go_live_readiness_history_v1",{p_limit:20});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Could not load readiness history.");return;}
    setHistory(Array.isArray(data?.rows)?data.rows:[]);
  }

  async function generate(){
    setLoading(true);setMessage("");
    const {data,error}=await (supabase as any).rpc("be_go_live_readiness_report_v1");
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Readiness report failed.");setLoading(false);return;}
    setReport(data);
    setMessage("Go-Live readiness report generated. No production data was deleted or archived.");
    setLoading(false);await loadHistory();
  }

  useEffect(()=>{void loadHistory()},[]);

  return <main className="mx-auto max-w-6xl space-y-6 p-6 text-[#eef8ff]">
    <section className="rounded-3xl border border-amber-500/30 bg-amber-50 p-7 text-[#7f1d1d]">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-amber-100 p-3 text-amber-700"><ShieldAlert size={30}/></div>
        <div className="flex-1">
          <h1 className="text-2xl font-black">Super Admin: Go-Live Readiness Report</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-amber-900">This control performs a production-safe dry run across Master Data, User Accounts, Branch Nodes, operational pickup/delivery records, COD, Warehouse lifecycle, and the report export engine. The unsafe destructive cleanup RPC remains disabled.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={()=>void generate()} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-xl bg-amber-600 px-6 font-black text-white disabled:opacity-50"><DatabaseZap size={18}/>{loading?"Generating...":"Generate Readiness Report"}</button>
            {report&&<button onClick={()=>downloadJson("britium_golive_readiness_"+new Date().toISOString().slice(0,10)+".json",report)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-amber-700 px-5 font-black"><Download size={17}/>Download Evidence</button>}
            <button onClick={()=>void loadHistory()} className="inline-flex h-12 items-center gap-2 rounded-xl border border-amber-700 px-5 font-black"><RefreshCw size={17}/>Refresh History</button>
          </div>
          {message&&<div className="mt-4 rounded-xl bg-white/70 p-3 text-sm font-black">{message}</div>}
        </div>
      </div>
    </section>

    {report&&<section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="flex items-center justify-between"><div><h2 className="font-black">Current Readiness Result</h2><p className="mt-1 text-xs text-[#8fb2c9]">{report.generated_at}</p></div><span className="rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-300">{report.overall_status}</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{(report.checks||[]).map((c:any)=><div key={c.name} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4"><div className="flex items-center justify-between gap-3"><div className="font-black">{c.name}</div><span className={"rounded-full px-2 py-1 text-[10px] font-black "+(c.status==="PASS"?"bg-emerald-500/10 text-emerald-300":c.status==="FAIL"?"bg-rose-500/10 text-rose-300":"bg-amber-500/10 text-amber-300")}>{c.status}</span></div>{c.records!==undefined&&<div className="mt-2 text-2xl font-black text-[#f6b84b]">{Number(c.records||0).toLocaleString()}</div>}{c.detail&&<div className="mt-2 text-xs text-[#8fb2c9]">{c.detail}</div>}</div>)}</div>
    </section>}

    <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
      <div className="border-b border-[#1a3a5c] p-4"><h2 className="font-black">Readiness Evidence History</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f6b84b] text-[#061524]"><tr><th className="p-3">Mode</th><th>Status</th><th>Master Data</th><th>Users</th><th>Branches</th><th>Timestamp</th><th>Evidence</th></tr></thead><tbody>{history.map((h:any)=>{const checks=h.report?.checks||[];const n=(name:string)=>checks.find((x:any)=>x.name===name)?.records??"-";return <tr key={h.id} className="border-t border-[#1a3a5c]"><td className="p-3 font-black">{h.report?.mode||"DRY_RUN_ONLY"}</td><td>{h.report?.overall_status||"-"}</td><td>{n("Master Data")}</td><td>{n("User Accounts")}</td><td>{n("Branch Nodes")}</td><td>{new Date(h.executed_at).toLocaleString()}</td><td><button onClick={()=>downloadJson("britium_golive_readiness_"+h.id+".json",h.report)} className="inline-flex items-center gap-1 rounded-lg border border-[#1a3a5c] px-3 py-2 text-xs font-black"><Download size={13}/>JSON</button></td></tr>})}{!history.length&&<tr><td colSpan={7} className="p-8 text-center text-[#6f91aa]">No readiness reports generated yet.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
