import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, RefreshCw, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const BUSINESS_DEVELOPMENT_BUILD =
  "BUSINESS_DEVELOPMENT_COMMAND_V54_FRONTEND_V56_2026_07_31";

const TABS = [
  "Executive Summary",
  "Merchant Growth",
  "Sales Pipeline",
  "Marketing Performance",
  "Customer Service",
  "Daily Operations",
  "Plans & Policies",
] as const;

type Snapshot = Record<string, any>;

export default function BizDevPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc(
        "be_business_development_command_v54",
        { p_payload: {} },
      );
      if (rpcError) throw rpcError;
      setSnapshot(data?.data || data || {});
    } catch (loadError: any) {
      setSnapshot({});
      setError(loadError?.message || "Business Development command RPC is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = snapshot.summary || {};
  const currentData = useMemo(() => tabData(snapshot, activeTab), [snapshot, activeTab]);

  function exportCurrent() {
    const payload = JSON.stringify({ tab: activeTab, data: currentData }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `business-development-${slug(activeTab)}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="space-y-5" data-build={BUSINESS_DEVELOPMENT_BUILD}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">
              <TrendingUp size={15} /> Business Development
            </div>
            <h1 className="mt-2 text-3xl font-black text-[#eef8ff]">Executive Command Centre</h1>
            <p className="mt-2 text-[13px] leading-6 text-[#8fb4d0]">
              Backend-authoritative merchant growth, pipeline, onboarding, service, operations, targets, forecast, and plans from <code>be_business_development_command_v54</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={exportCurrent} disabled={!currentData.length} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-4 py-2.5 text-[12px] font-black text-[#d8ecfa] disabled:opacity-40">
              <Download size={15} /> Export
            </button>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-[#6f98b8]">Build: {snapshot.build || "not returned"} · Generated: {formatDate(snapshot.generated_at)}</div>
      </section>

      {error ? <ErrorState message={error} /> : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric label="Parcel Volume" value={pick(summary, "parcel_volume", "total_parcels", "volume")} />
        <Metric label="New Merchants" value={pick(summary, "new_merchants", "merchant_acquired")} />
        <Metric label="Active Merchants" value={pick(summary, "active_merchants")} />
        <Metric label="Pipeline" value={pick(summary, "pipeline_count", "prospects")} />
        <Metric label="Conversion" value={percent(summary.conversion_rate || summary.conversion_percentage)} />
        <Metric label="Forecast" value={pick(summary, "forecast_volume", "forecast")} />
      </section>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="flex flex-wrap gap-2 border-b border-[#1a3a5c] p-4">
          {TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider ${activeTab === tab ? "bg-[#f6b84b] text-[#061524]" : "border border-[#1a3a5c] bg-[#081b2e] text-[#8fb4d0]"}`}>
              {tab}
            </button>
          ))}
        </div>
        <DataTable title={activeTab} rows={currentData} loading={loading} error={error} />
      </section>
    </main>
  );
}

function tabData(snapshot: Snapshot, tab: string): any[] {
  const keys: Record<string, string[]> = {
    "Executive Summary": ["merchant_ranking", "branches", "townships"],
    "Merchant Growth": ["merchant_growth", "merchant_segments", "merchant_ranking", "volume_series"],
    "Sales Pipeline": ["pipeline", "onboarding"],
    "Marketing Performance": ["marketing_attribution"],
    "Customer Service": ["customer_service", "failed_deliveries"],
    "Daily Operations": ["capacity_warnings", "settlements", "branches", "townships"],
    "Plans & Policies": ["plans_policies", "targets", "forecast"],
  };
  for (const key of keys[tab] || []) {
    if (Array.isArray(snapshot[key])) return snapshot[key];
    if (snapshot[key] && typeof snapshot[key] === "object") return [snapshot[key]];
  }
  return [];
}

function DataTable({ title, rows, loading, error }: { title: string; rows: any[]; loading: boolean; error: string }) {
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 10) : [];
  return (
    <div className="max-h-[600px] overflow-auto p-4">
      {loading ? <div className="p-12 text-center text-[#6f98b8]">Loading {title}...</div> : null}
      {!loading && !rows.length ? <div className="p-12 text-center text-[#6f98b8]">{error ? "RPC failed; no fallback records are displayed." : `The backend returned no records for ${title}.`}</div> : null}
      {rows.length ? (
        <table className="w-full min-w-[1000px] text-left text-[11px]">
          <thead className="sticky top-0 bg-[#081b2e] uppercase tracking-wider text-[#6f98b8]"><tr>{columns.map((column) => <th key={column} className="p-3">{column.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={String(row.id || row.merchant_code || row.employee_id || index)} className="border-t border-[#12304d] text-[#d8ecfa]">{columns.map((column) => <td key={column} className="max-w-[260px] truncate p-3" title={cell(row[column])}>{cell(row[column])}</td>)}</tr>)}</tbody>
        </table>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div><div className="mt-2 text-xl font-black text-[#f6b84b]">{value}</div></div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-2xl border border-rose-700 bg-rose-950/25 p-4 text-[12px] text-rose-100"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{message} No zero-filled KPI cards or synthetic prospects are substituted.</span></div>;
}

function pick(source: Record<string, any>, ...keys: string[]) { for (const key of keys) if (source[key] !== undefined && source[key] !== null) return cell(source[key]); return "—"; }
function percent(value: unknown) { if (value === undefined || value === null || value === "") return "—"; const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString()}%` : cell(value); }
function cell(value: unknown) { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function formatDate(value?: string | null) { if (!value) return "not returned"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
