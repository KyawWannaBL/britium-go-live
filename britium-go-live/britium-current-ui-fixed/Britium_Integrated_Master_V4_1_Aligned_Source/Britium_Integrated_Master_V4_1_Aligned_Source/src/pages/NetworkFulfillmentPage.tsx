import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Download,
  FileCheck2,
  MapPin,
  PackageSearch,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { INTEGRATED_MASTER_BUILD } from "@/lib/integratedMasterSpec";

type Row = Record<string, any> & {
  delivery_way_id?: string;
  pickup_id?: string;
  merchant_code?: string;
  destination_township?: string;
  fulfillment_mode?: string;
  managing_branch_code?: string;
  provider_code?: string;
  provider_tracking_id?: string;
  normalized_status?: string;
  pod_status?: string;
  cod_custody_status?: string;
  cod_amount?: number;
  partner_payable_mmk?: number;
  fulfillment_margin_mmk?: number;
  sla_status?: string;
  financial_status?: string;
};

type Snapshot = {
  build?: string;
  generated_at?: string;
  summary?: Record<string, any>;
  rows?: Row[];
  exceptions?: Row[];
  partner_batches?: Row[];
  branch_reconciliations?: Row[];
  rate_status?: Row[];
};

const tabs = [
  "Overview",
  "Routing Queue",
  "Branch Handovers",
  "Partner Handovers",
  "In Transit",
  "Delivery Exceptions",
  "Returns",
  "COD Handover",
  "Partner Settlements",
  "Branch Reconciliation",
  "SLA Performance",
  "Coverage & Contracts",
  "Audit Log",
];

const money = (value: unknown) => `${Number(value || 0).toLocaleString("en-US")} MMK`;
const text = (value: unknown, fallback = "-") => String(value ?? "").trim() || fallback;

export default function NetworkFulfillmentPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_network_fulfillment_snapshot_v55", {
        p_payload: { tab, provider: provider === "ALL" ? null : provider },
      });
      if (rpcError) throw rpcError;
      const payload = data?.data || data || {};
      setSnapshot({
        ...payload,
        rows: Array.isArray(payload.rows) ? payload.rows : [],
        exceptions: Array.isArray(payload.exceptions) ? payload.exceptions : [],
        partner_batches: Array.isArray(payload.partner_batches) ? payload.partner_batches : [],
        branch_reconciliations: Array.isArray(payload.branch_reconciliations) ? payload.branch_reconciliations : [],
        rate_status: Array.isArray(payload.rate_status) ? payload.rate_status : [],
      });
    } catch (cause: any) {
      setSnapshot({});
      setError(cause?.message || "Network fulfillment backend is not available.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tab, provider]);

  const rows = useMemo(() => {
    const source = tab === "Delivery Exceptions" ? snapshot.exceptions || [] : snapshot.rows || [];
    const query = search.trim().toLowerCase();
    return source.filter((row) => {
      if (provider !== "ALL" && text(row.provider_code, "") !== provider) return false;
      if (!query) return true;
      return [row.delivery_way_id,row.pickup_id,row.merchant_code,row.destination_township,row.provider_code,row.provider_tracking_id,row.normalized_status]
        .map((value)=>text(value,"").toLowerCase()).join(" ").includes(query);
    });
  }, [snapshot, tab, provider, search]);

  function exportCsv() {
    const headers = ["Way ID","Pickup ID","Merchant","Destination","Mode","Branch","Provider","Partner Tracking","Status","POD","COD Custody","COD","Partner Payable","Margin","SLA","Financial Status"];
    const csvRows = rows.map((row)=>[row.delivery_way_id,row.pickup_id,row.merchant_code,row.destination_township,row.fulfillment_mode,row.managing_branch_code,row.provider_code,row.provider_tracking_id,row.normalized_status,row.pod_status,row.cod_custody_status,row.cod_amount,row.partner_payable_mmk,row.fulfillment_margin_mmk,row.sla_status,row.financial_status]);
    const csv = [headers,...csvRows].map((line)=>line.map((value)=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href=url; anchor.download="network-fulfillment.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  const s = snapshot.summary || {};

  return <div className="space-y-6 text-[#eef8ff]" data-build={INTEGRATED_MASTER_BUILD}>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a3a5c] pb-5">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><Route size={15}/>Network Control</div><h1 className="mt-2 text-3xl font-black">Network Fulfillment & Outsource Control</h1><p className="mt-2 max-w-4xl text-[13px] leading-6 text-[#8fb4d0]">Direct, branch, DK Delivery, Royal Express and authorized fallback-provider monitoring, POD, COD custody, SLA and settlement.</p></div>
      <div className="flex gap-2"><button onClick={exportCsv} disabled={!rows.length} className="action secondary"><Download size={15}/>Export</button><button onClick={()=>void load()} disabled={loading} className="action primary"><RefreshCw size={15} className={loading?"animate-spin":""}/>Refresh</button></div>
    </header>

    {error?<div className="flex items-start gap-3 rounded-2xl border border-rose-700 bg-rose-950/25 p-4 text-[12px] text-rose-200"><AlertTriangle size={17}/><div><div className="font-black uppercase">Backend contract unavailable</div><div className="mt-1">{error}</div><div className="mt-1 text-rose-300/80">Deploy the integrated V4.1 SQL migration. The screen intentionally shows no mock parcel data.</div></div></div>:null}

    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Kpi label="Total Ways" value={text(s.total_ways,"0")} icon={<PackageSearch size={16}/>}/><Kpi label="Britium Direct" value={text(s.britium_direct,"0")} icon={<Truck size={16}/>}/><Kpi label="Branch Managed" value={text(s.branch_managed,"0")} icon={<Building2 size={16}/>}/><Kpi label="Royal Express" value={text(s.royal_express,"0")} icon={<Route size={16}/>}/><Kpi label="DK Delivery" value={text(s.dk_delivery,"0")} icon={<MapPin size={16}/>}/><Kpi label="COD Outstanding" value={money(s.cod_outstanding_mmk)} icon={<Banknote size={16}/>}/><Kpi label="Partner Payable" value={money(s.partner_payable_mmk)} icon={<Banknote size={16}/>}/><Kpi label="Exceptions" value={text(s.exception_count,"0")} icon={<AlertTriangle size={16}/>}/>
    </section>

    <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-2"><div className="flex gap-1 overflow-x-auto">{tabs.map((item)=><button key={item} onClick={()=>setTab(item)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-black ${tab===item?"bg-[#f6b84b] text-[#061524]":"text-[#8fb4d0] hover:bg-[#112b45]"}`}>{item}</button>)}</div></div>

    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1a3a5c] p-4"><div className="relative min-w-[260px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f98b8]"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search Way, Pickup, merchant, destination, provider or status..." className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-2.5 pl-9 pr-3 text-[12px] outline-none focus:border-[#f6b84b]"/></div><select value={provider} onChange={(e)=>setProvider(e.target.value)} className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2.5 text-[12px]"><option value="ALL">All Providers</option><option value="BRITIUM">Britium</option><option value="BRITIUM_NPT_BRANCH">Naypyitaw Branch</option><option value="DK_DELIVERY">DK Delivery</option><option value="ROYAL_EXPRESS">Royal Express</option><option value="ARLU_POST">Arlu Post</option><option value="NINJA_VAN">Ninja Van</option><option value="SAFE_DELIVERY_SERVICES">Safe Delivery Services</option></select><span className="text-[11px] text-[#6f98b8]">{rows.length} records</span></div>
      {tab === "Overview" ? <Overview summary={s} rateStatus={snapshot.rate_status||[]} /> : tab === "Partner Settlements" ? <BatchTable rows={snapshot.partner_batches||[]} kind="partner"/> : tab === "Branch Reconciliation" ? <BatchTable rows={snapshot.branch_reconciliations||[]} kind="branch"/> : <FulfillmentTable rows={rows} loading={loading}/>} 
    </section>

    <div className="flex items-center gap-2 text-[10px] text-[#567d9b]"><ShieldCheck size={13}/>Backend: be_network_fulfillment_snapshot_v55 · Build: {snapshot.build||"not returned"} · Generated: {snapshot.generated_at||"-"}</div>
    <style>{`.action{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:10px 15px;font-size:12px;font-weight:900}.action.primary{background:#f6b84b;color:#061524}.action.secondary{border:1px solid #355a78;background:#081b2e;color:#d8ecfa}.action:disabled{opacity:.4}`}</style>
  </div>;
}

function Kpi({label,value,icon}:{label:string;value:string;icon:ReactNode}){return <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="flex items-center justify-between text-[#6f98b8]"><span className="text-[9px] font-black uppercase tracking-wider">{label}</span>{icon}</div><div className="mt-2 text-lg font-black text-[#eef8ff]">{value}</div></div>}
function Badge({value}:{value:unknown}){const v=text(value,"UNKNOWN").toUpperCase(); const bad=/FAILED|MISSING|BREACH|HOLD|EXCEPTION|REJECTED/.test(v); const good=/DELIVERED|CONFIRMED|APPROVED|SETTLED|VERIFIED|ACTIVE/.test(v); return <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${bad?"border-rose-700 bg-rose-950/30 text-rose-300":good?"border-emerald-700 bg-emerald-950/30 text-emerald-300":"border-[#355a78] bg-[#061524] text-[#8fb4d0]"}`}>{v.replaceAll("_"," ")}</span>}
function FulfillmentTable({rows,loading}:{rows:Row[];loading:boolean}){return <div className="overflow-auto"><table className="w-full min-w-[1700px] text-left text-[11px]"><thead className="bg-[#081b2e] uppercase tracking-wider text-[#6f98b8]"><tr>{["Way ID","Pickup","Merchant","Destination","Mode","Managing Branch","Executing Provider","Partner Tracking","Status","POD","COD Custody","COD","Partner Payable","Margin","SLA","Finance"].map((h)=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{loading?<tr><td colSpan={16} className="p-10 text-center text-[#6f98b8]">Loading...</td></tr>:rows.length===0?<tr><td colSpan={16} className="p-10 text-center text-[#6f98b8]">No backend records for this filter.</td></tr>:rows.map((r,i)=><tr key={text(r.delivery_way_id,String(i))} className="border-t border-[#1a3a5c]"><td className="p-3 font-mono font-black text-[#f6b84b]">{text(r.delivery_way_id)}</td><td className="p-3">{text(r.pickup_id)}</td><td className="p-3">{text(r.merchant_code)}</td><td className="p-3">{text(r.destination_township)}</td><td className="p-3"><Badge value={r.fulfillment_mode}/></td><td className="p-3">{text(r.managing_branch_code)}</td><td className="p-3 font-black">{text(r.provider_code)}</td><td className="p-3 font-mono">{text(r.provider_tracking_id)}</td><td className="p-3"><Badge value={r.normalized_status}/></td><td className="p-3"><Badge value={r.pod_status}/></td><td className="p-3"><Badge value={r.cod_custody_status}/></td><td className="p-3 text-right font-mono">{money(r.cod_amount)}</td><td className="p-3 text-right font-mono">{money(r.partner_payable_mmk)}</td><td className={`p-3 text-right font-mono ${Number(r.fulfillment_margin_mmk||0)<0?"text-rose-300":"text-emerald-300"}`}>{money(r.fulfillment_margin_mmk)}</td><td className="p-3"><Badge value={r.sla_status}/></td><td className="p-3"><Badge value={r.financial_status}/></td></tr>)}</tbody></table></div>}
function Overview({summary,rateStatus}:{summary:Record<string,any>;rateStatus:Row[]}){return <div className="grid gap-4 p-5 lg:grid-cols-2"><div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-5"><div className="mb-3 flex items-center gap-2 font-black uppercase tracking-wider text-[#f6b84b]"><FileCheck2 size={15}/>Financial Separation</div><div className="grid grid-cols-2 gap-3"><Kpi label="Customer Collection" value={money(summary.customer_collection_mmk)} icon={<Banknote size={15}/>}/><Kpi label="Britium Delivery Revenue" value={money(summary.britium_delivery_revenue_mmk)} icon={<Banknote size={15}/>}/><Kpi label="Merchant Settlement" value={money(summary.merchant_settlement_mmk)} icon={<Banknote size={15}/>}/><Kpi label="Outsource Margin" value={money(summary.outsource_margin_mmk)} icon={<Banknote size={15}/>}/></div></div><div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-5"><div className="mb-3 font-black uppercase tracking-wider text-[#f6b84b]">Coverage & Contract Readiness</div><div className="space-y-2">{rateStatus.length?rateStatus.map((r,i)=><div key={i} className="flex items-center justify-between rounded-xl border border-[#1a3a5c] p-3"><div><div className="font-black">{text(r.provider_code||r.contract_code)}</div><div className="text-[10px] text-[#6f98b8]">{text(r.message||r.effective_version)}</div></div><Badge value={r.status}/></div>):<div className="text-[12px] text-[#6f98b8]">No contract-status rows returned.</div>}</div></div></div>}
function BatchTable({rows,kind}:{rows:Row[];kind:"partner"|"branch"}){return <div className="overflow-auto"><table className="w-full min-w-[1000px] text-left text-[11px]"><thead className="bg-[#081b2e] uppercase tracking-wider text-[#6f98b8]"><tr>{["Batch","Counterparty","Period","Ways","Gross COD","Payable / Transfer","Outstanding","Status","Payment"].map((h)=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={text(r.batch_id,String(i))} className="border-t border-[#1a3a5c]"><td className="p-3 font-mono text-[#f6b84b]">{text(r.batch_number||r.batch_id)}</td><td className="p-3">{text(kind==="partner"?r.provider_code:r.branch_code)}</td><td className="p-3">{text(r.period_from)} - {text(r.period_to)}</td><td className="p-3">{text(r.parcel_count,"0")}</td><td className="p-3 font-mono">{money(r.gross_cod_mmk)}</td><td className="p-3 font-mono">{money(r.net_payable_mmk||r.transfer_due_mmk)}</td><td className="p-3 font-mono">{money(r.outstanding_mmk)}</td><td className="p-3"><Badge value={r.status}/></td><td className="p-3"><Badge value={r.payment_status}/></td></tr>):<tr><td colSpan={9} className="p-10 text-center text-[#6f98b8]">No settlement batches returned.</td></tr>}</tbody></table></div>}
