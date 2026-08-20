// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Calculator, Database, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const TARIFF_PAGE_BUILD = "PORTAL_CANONICAL_TARIFF_CATALOG_V61_7_2026_08_03";

type TariffRow = {
  id: string;
  townshipCode: string;
  township: string;
  townshipMm: string;
  zone: string;
  tier: string;
  baseFee: number;
  includedKg: number;
  extraPerKg: number;
  status: string;
  source: string;
  note: string;
};

function num(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function txt(value: unknown) { return String(value ?? "").trim(); }
function extractRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data?.rows)) return value.data.rows;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}
function normalize(row: any, index: number): TariffRow {
  return {
    id: txt(row.id || `${row.township_code || row.township}-${row.customer_tier || index}`),
    townshipCode: txt(row.township_code),
    township: txt(row.township || row.stored_township),
    townshipMm: txt(row.township_name_mm),
    zone: txt(row.zone || row.tariff_zone || row.city || row.region || "-"),
    tier: txt(row.customer_tier || row.tier || "STANDARD").toUpperCase(),
    baseFee: num(row.base_fee ?? row.base_tariff),
    includedKg: num(row.included_kg),
    extraPerKg: num(row.extra_per_kg),
    status: txt(row.status || "ACTIVE").toUpperCase(),
    source: txt(row.source || "be_parcel_tariffs_v2"),
    note: txt(row.note || "-"),
  };
}

export default function TariffPage() {
  const [rows, setRows] = useState<TariffRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.rpc("be_tariff_catalog_v61_7");
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Canonical tariff catalogue did not return OK.");
      const next = extractRows(data).map(normalize);
      if (!next.length) throw new Error("Canonical tariff catalogue returned no active tariff rows.");
      setRows(next);
      setLastSynced(new Date().toLocaleString());
    } catch (error: any) {
      setRows([]);
      setErrorMessage(error?.message || "Could not load the canonical tariff catalogue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => `${row.townshipCode} ${row.township} ${row.townshipMm} ${row.zone} ${row.tier} ${row.status}`.toLowerCase().includes(query));
  }, [rows, search]);
  const uniqueTownships = useMemo(() => new Set(rows.map((row) => row.townshipCode || row.township)).size, [rows]);

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#061524] p-3 text-[#c8dff0] sm:p-4 lg:p-6"
      data-build={TARIFF_PAGE_BUILD}
      data-canonical-tariff-source="be_parcel_tariffs_v2"
      data-tariff-catalog-rpc="be_tariff_catalog_v61_7"
      data-shared-with-data-entry="true">
      <div className="mx-auto w-full max-w-[1800px] space-y-4">
        <header className="flex w-full flex-col gap-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-xl lg:flex-row lg:items-start lg:justify-between lg:p-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#f6b84b]"><Database size={14} /> Canonical Tariff Control</div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-black text-[#c8dff0]"><Calculator className="shrink-0 text-[#38bdf8]" /> Tariff Master Data</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#9cc2d9]">This screen and Data Entry use the same active, effective-dated tariff source.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[440px]">
            <Info label="Backend source" value="be_parcel_tariffs_v2" />
            <Info label="Last refresh" value={lastSynced || "-"} />
          </div>
        </header>
        {errorMessage ? <div className="flex items-start gap-3 rounded-xl border border-amber-500 bg-amber-950/30 px-4 py-3 text-sm font-bold text-amber-200"><AlertCircle className="mt-0.5 shrink-0" size={17} /><span>{errorMessage}</span></div> : null}
        <section className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Info label="Active townships" value={uniqueTownships} large />
          <Info label="Active tariff rows" value={rows.length} large />
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 sm:col-span-2"><div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">Shared calculation status</div><div className="mt-1 text-sm font-black text-[#c8dff0]">{loading ? "Refreshing..." : rows.length ? "Tariff screen and Data Entry are connected to the same canonical catalogue." : "No active tariffs loaded."}</div></div>
        </section>
        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
          <div className="flex w-full flex-col gap-3 border-b border-[#1a3a5c] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="text-lg font-black text-[#c8dff0]">Canonical Active Tariffs</h2></div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative min-w-[230px] flex-1 lg:w-80 lg:flex-none"><Search className="absolute left-3 top-3 h-4 w-4 text-[#475569]" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search township, code, tier..." className="h-10 w-full rounded-xl border-2 border-[#1a3a5c] bg-white pl-9 pr-3 text-sm font-extrabold text-[#061524] outline-none" /></div>
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-[#061524] bg-[#f6b84b] px-4 text-xs font-black uppercase tracking-wider text-[#061524] disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
            </div>
          </div>
          <div className="w-full min-w-0 overflow-x-auto bg-white">
            <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm text-[#061524]">
              <thead className="sticky top-0 z-10 bg-[#f6b84b] text-[11px] font-black uppercase tracking-wider"><tr>{["Code","Township","Myanmar","Zone","Tier","Base Charge","Included KG","Extra / KG","Status"].map((x)=><th key={x} className="whitespace-nowrap border-b-2 border-r border-[#061524] px-4 py-3 last:border-r-0">{x}</th>)}</tr></thead>
              <tbody>{filteredRows.map((row)=><tr key={row.id} className="font-semibold hover:bg-[#fff7dc]"><td className="border-b border-slate-200 px-4 py-3 font-mono font-black">{row.townshipCode || "-"}</td><td className="border-b border-slate-200 px-4 py-3 font-black">{row.township}</td><td className="border-b border-slate-200 px-4 py-3">{row.townshipMm || "-"}</td><td className="border-b border-slate-200 px-4 py-3">{row.zone}</td><td className="border-b border-slate-200 px-4 py-3 font-black">{row.tier}</td><td className="border-b border-slate-200 px-4 py-3 text-right font-black">{row.baseFee.toLocaleString()} MMK</td><td className="border-b border-slate-200 px-4 py-3 text-right">{row.includedKg}</td><td className="border-b border-slate-200 px-4 py-3 text-right">{row.extraPerKg.toLocaleString()} MMK</td><td className="border-b border-slate-200 px-4 py-3"><span className="rounded-full border border-emerald-500 bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-900">{row.status}</span></td></tr>)}{!filteredRows.length?<tr><td colSpan={9} className="px-6 py-12 text-center font-black">{loading?"Refreshing...":"No matching tariffs."}</td></tr>:null}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({label,value,large=false}:{label:string;value:any;large?:boolean}) { return <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label}</div><div className={`mt-1 font-black text-[#f6b84b] ${large?'text-3xl':'break-words text-sm'}`}>{String(value)}</div></div>; }
