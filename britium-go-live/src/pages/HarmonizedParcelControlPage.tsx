import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GroundEvidenceReviewPanel from "@/components/parcel/GroundEvidenceReviewPanel";

type Parcel = {
  delivery_way_id: string;
  merchant_name: string | null;
  destination_township: string | null;
  recorded_provider_code: string | null;
  physically_recorded_provider: string | null;
  provider_custody_evidence: string | null;
  warehouse_status: string | null;
  dispatch_scanned: boolean | null;
  wayplan_id: string | null;
  physically_handed_over_at: string | null;
  delivered_at: string | null;
  rider_proof_present: boolean | null;
  finance_settlement_status: string | null;
  expected_cod_mmk: number | null;
  settled_cod_mmk: number | null;
  attention_category: string | null;
  last_evidence_at: string | null;
};

const selectColumns = [
  "delivery_way_id","merchant_name","destination_township","recorded_provider_code",
  "physically_recorded_provider","provider_custody_evidence","warehouse_status",
  "dispatch_scanned","wayplan_id","physically_handed_over_at","delivered_at",
  "rider_proof_present","finance_settlement_status","expected_cod_mmk",
  "settled_cod_mmk","attention_category","last_evidence_at"
].join(",");

const views = ["All", "Provider & Branch", "Wayplans", "Warehouse", "Delivery / RTO", "Finance", "Exceptions"] as const;
type ViewTab = typeof views[number];
const providers = ["ALL", "BRITIUM", "DK DELIVERY", "MANDALAY BRANCH", "INSEIN BRANCH", "NPT BRANCH", "ROYAL EXPRESS", "OTHER THIRD PARTY", "H.TERMINAL DROP-OFF"];
const currency = (value: number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("en-US");
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not evidenced";
const display = (value: string | null | undefined) => value?.trim() || "Unverified";
const N = ({ children }: { children: React.ReactNode }) => <span className="text-xs text-slate-500">{children}</span>;

function Attention({ value }: { value: string | null }) {
  const isReview = Boolean(value && value !== "MONITOR");
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isReview ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{value || "REVIEW"}</span>;
}

export default function HarmonizedParcelControlPage() {
  const [rows, setRows] = useState<Parcel[]>([]);
  const [tab, setTab] = useState<ViewTab>("All");
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("ALL");
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    // The view remains closed until its UAT/RLS rollout is approved.
    // No fallback to unrestricted base-table reads is permitted.
    let query = supabase.from("be_v_harmonized_parcel_monitor_v1" as never)
      .select(selectColumns, { count: "exact" });
    if (search.trim()) query = query.ilike("delivery_way_id", `%${search.trim().replace(/[%_,]/g, "")}%`);
    if (provider !== "ALL") query = query.eq("recorded_provider_code", provider);
    if (tab === "Exceptions") query = query.neq("attention_category", "MONITOR");
    if (tab === "Provider & Branch") query = query.is("physically_handed_over_at", null);
    if (tab === "Wayplans") query = query.not("wayplan_id", "is", null);
    if (tab === "Warehouse") query = query.not("warehouse_status", "is", null);
    if (tab === "Delivery / RTO") query = query.not("delivered_at", "is", null);
    if (tab === "Finance") query = query.not("finance_settlement_status", "is", null);
    const { data, count: total, error: queryError } = await query.order("delivery_way_id").range(page * pageSize, (page + 1) * pageSize - 1);
    if (queryError) {
      setRows([]); setCount(null);
      setError("Parcel monitoring has not been enabled for this account. UAT deployment and role-scoped database access must be approved before live records can be displayed. Technical detail: " + queryError.message);
    } else {
      setRows((data || []) as unknown as Parcel[]); setCount(total);
    }
    setLoading(false);
  }, [search, provider, tab, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); setSelected(null); }, [search, provider, tab]);
  const summary = useMemo(() => ({
    received: rows.filter(r => Boolean(r.warehouse_status)).length,
    custody: rows.filter(r => r.provider_custody_evidence === "HANDOVER_EVIDENCED").length,
    alerts: rows.filter(r => r.attention_category !== "MONITOR").length,
    settled: rows.filter(r => Boolean(r.finance_settlement_status) && /settled|completed/i.test(r.finance_settlement_status || "")).length
  }), [rows]);
  const exportCsv = () => {
    const keys: (keyof Parcel)[] = ["delivery_way_id","merchant_name","destination_township","recorded_provider_code","provider_custody_evidence","warehouse_status","wayplan_id","physically_handed_over_at","delivered_at","finance_settlement_status","expected_cod_mmk","settled_cod_mmk","attention_category"];
    const escapeCell = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[\s]*[=+@-]/.test(raw) ? "\'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const csv = [keys.join(","), ...rows.map(row => keys.map(k => escapeCell(row[k])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href=url; link.download="britium-parcel-monitor-page.csv"; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-5 p-4 md:p-6 text-slate-800">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">Harmonized Parcel Control Center</h1>
      <p className="text-sm text-slate-600">Original Way ID · provider & branch custody · warehouse · wayplans · delivery/RTO · COD settlement</p>
      <p className="text-xs text-amber-800">Read-only monitoring. Routing labels are not physical handover evidence; missing records are not automatic parcel-loss findings.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ["Matching waybills", count === null ? "—" : count.toLocaleString(), "Full filtered match count"],
        ["Warehouse status present", summary.received, "Loaded page only"],
        ["Evidenced handovers", summary.custody, "Loaded page only"],
        ["Review flags", summary.alerts, "Loaded page only"],
      ].map(([label,value,detail]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm">
        <N>{label}</N><div className="mt-1 text-2xl font-semibold">{value}</div><N>{detail}</N>
      </div>)}
    </div>
    <nav className="flex gap-2 overflow-x-auto border-b pb-3" aria-label="Parcel monitoring workflows">
      {views.map(v => <button type="button" key={v} onClick={() => setTab(v)}
        className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${tab === v ? "bg-slate-900 text-white" : "border bg-white hover:bg-slate-50"}`}>{v}</button>)}
    </nav>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium">Original Delivery Way ID
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Way ID" className="rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="flex min-w-52 flex-col gap-1 text-xs font-medium">Recorded service provider
        <select value={provider} onChange={e=>setProvider(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          {providers.map(p=><option value={p} key={p}>{p === "ALL" ? "All providers" : p}</option>)}
        </select>
      </label>
      <button onClick={()=>void load()} disabled={loading} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Refresh</button>
      <button onClick={exportCsv} disabled={!rows.length} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Export loaded page ({rows.length})</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-[1250px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide"><tr>
          {["Way ID", "Merchant / destination", "Recorded provider", "Custody evidence", "Warehouse", "Wayplan", "Delivery / proof", "COD (MMK)", "Finance", "Attention"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y">{rows.map(row=><tr key={row.delivery_way_id} className="hover:bg-slate-50">
          <td className="px-3 py-3"><button onClick={()=>setSelected(row)} className="font-semibold text-blue-700 underline">{row.delivery_way_id}</button></td>
          <td className="px-3 py-3">{display(row.merchant_name)}<div><N>{display(row.destination_township)}</N></div></td>
          <td className="px-3 py-3">{display(row.recorded_provider_code)}</td>
          <td className="px-3 py-3">{display(row.provider_custody_evidence)}</td>
          <td className="px-3 py-3">{display(row.warehouse_status)}<div><N>{row.dispatch_scanned ? "Dispatch scanned" : "Dispatch not evidenced"}</N></div></td>
          <td className="px-3 py-3">{display(row.wayplan_id)}</td>
          <td className="px-3 py-3">{row.delivered_at ? when(row.delivered_at) : "Not evidenced"}<div><N>{row.rider_proof_present ? "Proof reference present" : "No rider proof reference"}</N></div></td>
          <td className="px-3 py-3">{currency(row.expected_cod_mmk)}<div><N>Settled: {currency(row.settled_cod_mmk)}</N></div></td>
          <td className="px-3 py-3">{display(row.finance_settlement_status)}</td>
          <td className="px-3 py-3"><Attention value={row.attention_category}/></td>
        </tr>)}</tbody>
      </table>
      {!loading && !error && !rows.length && <p className="p-6 text-sm text-slate-500">No matching parcel evidence found.</p>}
    </div>
    <div className="flex items-center justify-between text-sm">
      <span>Page {page+1} · {rows.length} displayed · {count === null ? "count unavailable" : count+" matching"}</span>
      <div className="flex gap-2">
        <button disabled={!page || loading} onClick={()=>setPage(p=>Math.max(p-1,0))} className="rounded border px-3 py-2 disabled:opacity-50">Previous</button>
        <button disabled={loading || count === null || (page+1)*pageSize >= count} onClick={()=>setPage(p=>p+1)} className="rounded border px-3 py-2 disabled:opacity-50">Next</button>
      </div>
    </div>
    {selected && <section aria-label="Parcel evidence details" className="rounded-xl border bg-white p-5">
      <div className="flex justify-between gap-3"><h2 className="text-lg font-bold">Way ID: {selected.delivery_way_id}</h2><button onClick={()=>setSelected(null)} className="rounded border px-3 py-1">Close</button></div>
      <p className="mt-2 text-sm text-amber-800">Evidence snapshot only — not a complete event timeline until event ingestion is activated.</p>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        {[
          ["Merchant", selected.merchant_name],["Destination township", selected.destination_township],
          ["Assigned provider (recorded)",selected.recorded_provider_code],
          ["Actual provider evidence",selected.physically_recorded_provider],
          ["Custody assessment",selected.provider_custody_evidence],
          ["Physical handover timestamp",when(selected.physically_handed_over_at)],
          ["Wayplan ID",selected.wayplan_id],["Warehouse status",selected.warehouse_status],
          ["Delivered at",when(selected.delivered_at)],["Delivery proof",selected.rider_proof_present?"Reference recorded":"Not evidenced"],
          ["Finance settlement",selected.finance_settlement_status],
          ["Last evidence",when(selected.last_evidence_at)],
        ].map(([key,val])=><div key={String(key)}><dt className="text-xs text-slate-500">{key}</dt><dd className="break-all text-sm font-medium">{display(val)}</dd></div>)}
      </dl>
      <GroundEvidenceReviewPanel wayId={selected.delivery_way_id}/>
    </section>}
  </div>;
}
