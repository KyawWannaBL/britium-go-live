import { useEffect, useState } from "react";
import { AlertTriangle, Download, Megaphone, RefreshCw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const LIVE_MARKETING_BUILD =
  "LIVE_MARKETING_SNAPSHOT_V54_FRONTEND_V56_2026_07_31";

export default function MarketingPage() {
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data: response, error: rpcError } = await (supabase as any).rpc("be_live_marketing_snapshot_v54", { p_payload: {} });
      if (rpcError) throw rpcError;
      setData(response?.data || response || {});
    } catch (loadError: any) {
      setData({});
      setError(loadError?.message || "Live Marketing snapshot RPC is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const summary = data.summary || {};
  const ranking = array(data.merchant_ranking);
  const volume = array(data.volume_series);

  function exportReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `live-marketing-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="space-y-5" data-build={LIVE_MARKETING_BUILD}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><Megaphone size={15}/> Live Marketing</div><h1 className="mt-2 text-3xl font-black text-[#eef8ff]">Merchant Performance Analytics</h1><p className="mt-2 text-[13px] leading-6 text-[#8fb4d0]">Real merchant ranking, volume, target, acquisition, revenue, COD, branch, township, growth, decline, and campaign attribution from <code>be_live_marketing_snapshot_v54</code>.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>Refresh</button><button type="button" onClick={exportReport} disabled={!Object.keys(data).length} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-4 py-2.5 text-[12px] font-black text-[#d8ecfa] disabled:opacity-40"><Download size={15}/>Export</button></div>
        </div>
      </section>

      {error ? <div className="flex items-start gap-2 rounded-2xl border border-rose-700 bg-rose-950/25 p-4 text-[12px] text-rose-100"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span>{error} No generic control-tower or demonstration marketing values are displayed.</span></div> : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric label="Parcel Volume" value={pick(summary, "parcel_volume", "total_parcels")} />
        <Metric label="Active Merchants" value={pick(summary, "active_merchants")} />
        <Metric label="Dormant %" value={percent(summary.dormant_percentage)} />
        <Metric label="Target Achievement" value={percent(summary.achievement_percentage)} />
        <Metric label="Revenue" value={money(summary.revenue)} />
        <Metric label="COD Contribution" value={money(summary.cod_contribution)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="mb-4 font-black text-[#eef8ff]">Daily / Weekly / Monthly Volume</h2>{volume.length ? <div className="h-[360px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={volume}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey={findKey(volume[0], ["date","period","label"])}/><YAxis/><Tooltip/><Line type="monotone" dataKey={findKey(volume[0], ["volume","parcel_count","count","value"])} strokeWidth={2}/></LineChart></ResponsiveContainer></div> : <Empty loading={loading} error={error} label="volume series"/>}</div>
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="mb-4 font-black text-[#eef8ff]">Merchant Ranking</h2><Ranking rows={ranking} loading={loading} error={error}/></div>
      </section>
    </main>
  );
}

function Ranking({ rows, loading, error }: { rows: any[]; loading: boolean; error: string }) { return rows.length ? <div className="max-h-[360px] overflow-auto"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-[#081b2e] uppercase text-[#6f98b8]"><tr><th className="p-3">Rank</th><th className="p-3">Merchant</th><th className="p-3">Volume</th><th className="p-3">Share</th><th className="p-3">Trend</th></tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.merchant_code||row.merchant_id||index)} className="border-t border-[#12304d] text-[#d8ecfa]"><td className="p-3">{row.rank??index+1}</td><td className="p-3 font-black text-[#f6b84b]">{row.merchant_name||row.merchant_code||"—"}</td><td className="p-3">{row.volume??row.parcel_count??"—"}</td><td className="p-3">{percent(row.volume_share??row.share_percentage)}</td><td className="p-3">{row.trend||row.growth_rate||"—"}</td></tr>)}</tbody></table></div> : <Empty loading={loading} error={error} label="merchant ranking"/>; }
function Empty({ loading, error, label }: { loading: boolean; error: string; label: string }) { return <div className="flex h-[300px] items-center justify-center text-[12px] text-[#6f98b8]">{loading ? `Loading ${label}...` : error ? `RPC failed; no fallback ${label} is shown.` : `The backend returned no ${label}.`}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div><div className="mt-2 text-xl font-black text-[#f6b84b]">{value}</div></div>; }
function array(value: unknown) { return Array.isArray(value) ? value : []; }
function pick(source: Record<string,any>, ...keys:string[]) { for(const key of keys) if(source[key]!==undefined&&source[key]!==null) return String(source[key]); return "—"; }
function percent(value: unknown) { if(value===undefined||value===null||value==="") return "—"; const n=Number(value); return Number.isFinite(n)?`${n.toLocaleString()}%`:String(value); }
function money(value: unknown) { if(value===undefined||value===null||value==="") return "—"; const n=Number(value); return Number.isFinite(n)?`${n.toLocaleString()} MMK`:String(value); }
function findKey(row: Record<string,any>|undefined, candidates:string[]) { if(!row) return candidates[0]; return candidates.find((key)=>key in row)||Object.keys(row)[0]||candidates[0]; }
