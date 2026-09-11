import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Megaphone, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const MARKETING_PORTAL_BUILD =
  "MARKETING_PORTAL_REAL_DATA_V54_FRONTEND_V56_2026_07_31";

const TABS = ["Plans", "Activities", "Visits", "Leads", "Campaigns", "Reports"] as const;

export default function MarketingPortalPage() {
  const [data, setData] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Plans");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data: response, error: rpcError } = await (supabase as any).rpc("be_marketing_portal_snapshot_v54", { p_payload: {} });
      if (rpcError) throw rpcError;
      setData(response?.data || response || {});
    } catch (loadError: any) {
      setData({});
      setError(loadError?.message || "Marketing Portal snapshot RPC is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => {
    const key = activeTab.toLowerCase();
    const source = Array.isArray(data[key]) ? data[key] : Array.isArray(data[`${key}_rows`]) ? data[`${key}_rows`] : [];
    const q = search.trim().toLowerCase();
    return q ? source.filter((row:any)=>JSON.stringify(row).toLowerCase().includes(q)) : source;
  }, [data, activeTab, search]);
  const summary = data.summary || {};

  function exportData() {
    const url=URL.createObjectURL(new Blob([JSON.stringify({tab:activeTab,rows},null,2)],{type:"application/json"}));
    const link=document.createElement("a"); link.href=url; link.download=`marketing-portal-${activeTab.toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="space-y-5" data-build={MARKETING_PORTAL_BUILD}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><Megaphone size={15}/>Marketing Team Operations</div><h1 className="mt-2 text-3xl font-black text-[#eef8ff]">Marketing Portal</h1><p className="mt-2 text-[13px] leading-6 text-[#8fb4d0]">Plans, activities, visits, leads, campaigns, evidence, reports, and manager review from <code>be_marketing_portal_snapshot_v54</code>.</p></div><div className="flex gap-2"><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><RefreshCw size={15} className={loading?"animate-spin":""}/>Refresh</button><button type="button" onClick={exportData} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-4 py-2.5 text-[12px] font-black text-[#d8ecfa] disabled:opacity-40"><Download size={15}/>Export</button></div></div>
      </section>

      <section className="rounded-2xl border border-cyan-700 bg-cyan-950/20 p-4 text-[12px] leading-6 text-cyan-100">Mutation controls remain disabled until the secured create, update, activity, visit, lead, follow-up, campaign, report, and manager-review RPCs are exported and verified. This prevents direct-table or unaudited browser writes.</section>
      {error ? <div className="flex items-start gap-2 rounded-2xl border border-rose-700 bg-rose-950/25 p-4 text-[12px] text-rose-100"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span>{error} No static leads, KPIs, or daily-focus tasks are substituted.</span></div> : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6"><Metric label="Plans" value={count(summary,"plans",data.plans)}/><Metric label="Activities" value={count(summary,"activities",data.activities)}/><Metric label="Visits" value={count(summary,"visits",data.visits)}/><Metric label="Leads" value={count(summary,"leads",data.leads)}/><Metric label="Campaigns" value={count(summary,"campaigns",data.campaigns)}/><Metric label="Reports Due" value={count(summary,"reports_due",data.reports_due)}/></section>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a3a5c] p-4"><div className="flex flex-wrap gap-2">{TABS.map(tab=><button key={tab} type="button" onClick={()=>setActiveTab(tab)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider ${activeTab===tab?"bg-[#f6b84b] text-[#061524]":"border border-[#1a3a5c] bg-[#081b2e] text-[#8fb4d0]"}`}>{tab}</button>)}</div><input value={search} onChange={event=>setSearch(event.target.value)} placeholder={`Search ${activeTab.toLowerCase()}...`} className="w-full max-w-sm rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2.5 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]"/></div><Rows rows={rows} loading={loading} error={error} label={activeTab}/></section>
    </main>
  );
}

function Rows({rows,loading,error,label}:{rows:any[];loading:boolean;error:string;label:string}) { const columns=rows.length?Object.keys(rows[0]).slice(0,12):[]; return <div className="max-h-[600px] overflow-auto p-4">{loading?<div className="p-12 text-center text-[#6f98b8]">Loading {label}...</div>:null}{!loading&&!rows.length?<div className="p-12 text-center text-[#6f98b8]">{error?"RPC failed; no demonstration records are displayed.":`The backend returned no ${label.toLowerCase()} records.`}</div>:null}{rows.length?<table className="w-full min-w-[1100px] text-left text-[11px]"><thead className="sticky top-0 bg-[#081b2e] uppercase tracking-wider text-[#6f98b8]"><tr>{columns.map(column=><th key={column} className="p-3">{column.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id||row.plan_id||row.lead_id||index)} className="border-t border-[#12304d] text-[#d8ecfa]">{columns.map(column=><td key={column} className="max-w-[260px] truncate p-3" title={cell(row[column])}>{cell(row[column])}</td>)}</tr>)}</tbody></table>:null}</div>; }
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div><div className="mt-2 text-xl font-black text-[#f6b84b]">{value}</div></div>; }
function count(summary:Record<string,any>,key:string,value:unknown) { if(summary[key]!==undefined&&summary[key]!==null) return String(summary[key]); if(Array.isArray(value)) return value.length.toLocaleString(); return "—"; }
function cell(value:unknown) { if(value===null||value===undefined||value==="") return "—"; return typeof value==="object"?JSON.stringify(value):String(value); }
