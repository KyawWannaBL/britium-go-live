// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Calculator, Database, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TariffRow = {
  id: string;
  township: string;
  zone: string;
  tier: string;
  baseFee: number;
  includedKg: number;
  extraPerKg: number;
  status: string;
  source: string;
  note: string;
};

function numberValue(...values: any[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function textValue(...values: any[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeTariffRow(row: any, source: string, index: number): TariffRow | null {
  const payload = row?.payload && typeof row.payload === "object" ? { ...row.payload, ...row } : row || {};
  const township = textValue(
    payload.township,
    payload.township_name,
    payload.destination_township,
    payload.destination,
    payload.value,
    payload.label,
    payload.name,
  );
  const baseFee = numberValue(
    payload.base_fee,
    payload.base_fee_mmk,
    payload.base_delivery_charge,
    payload.delivery_fee,
    payload.delivery_charge,
    payload.deli_charge,
    payload.amount_mmk,
    payload.price,
  );

  if (!township && !baseFee) return null;

  return {
    id: textValue(payload.id, payload.record_key, payload.tariff_id, `${source}-${index}`),
    township: township || "Unspecified destination",
    zone: textValue(payload.zone, payload.city, payload.region_state, payload.branch_name, payload.branch_code, "-"),
    tier: textValue(payload.customer_tier, payload.customer_type, payload.service_type, payload.tier, "STANDARD").toUpperCase(),
    baseFee,
    includedKg: numberValue(payload.included_kg, payload.included_weight_kg, payload.allowance_kg, 3),
    extraPerKg: numberValue(payload.extra_per_kg, payload.extra_kg_rate, payload.per_kg_rate, 500),
    status: textValue(payload.status, payload.record_status, payload.is_active === false ? "inactive" : "active"),
    source,
    note: textValue(payload.note, payload.remarks, payload.route_type, payload.myanmar_label, payload.label_mm, "-"),
  };
}

function rowsFromValue(value: any, source: string) {
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(value?.rows)
      ? value.rows
      : Array.isArray(value?.data)
        ? value.data
        : [];
  return candidates.map((row: any, index: number) => normalizeTariffRow(row, source, index)).filter(Boolean);
}

async function loadLiveTariffs() {
  const errors: string[] = [];

  try {
    const { data, error } = await supabase.rpc("be_master_data_snapshot", {
      p_master_type: "tariff_master",
      p_search: null,
      p_start_date: null,
      p_end_date: null,
    });
    if (error) throw error;
    const rows = rowsFromValue(data, "RPC be_master_data_snapshot");
    if (rows.length) return { rows, source: "RPC be_master_data_snapshot" };
  } catch (error: any) {
    errors.push(`be_master_data_snapshot: ${error?.message || "no rows"}`);
  }

  const sources = [
    { table: "be_delivery_tariff_master_v13" },
    { table: "be_md_tariffs" },
    { table: "tariff_master" },
    { table: "township_tariffs" },
    { table: "tariffs" },
    { table: "be_master_data_options", filter: true },
  ];

  for (const candidate of sources) {
    try {
      let query = supabase.from(candidate.table).select("*").limit(3000);
      if (candidate.filter) {
        query = query.or(
          "option_type.ilike.%tariff%,master_type.ilike.%tariff%,dropdown_name.ilike.%tariff%,value.ilike.%tariff%",
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = rowsFromValue(data, `table ${candidate.table}`);
      if (rows.length) return { rows, source: `table ${candidate.table}` };
    } catch (error: any) {
      errors.push(`${candidate.table}: ${error?.message || "unavailable"}`);
    }
  }

  throw new Error(errors[0] || "No live tariff rows were returned by the backend.");
}

export default function TariffPage() {
  const [rows, setRows] = useState<TariffRow[]>([]);
  const [source, setSource] = useState("Waiting for backend");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await loadLiveTariffs();
      setRows(result.rows);
      setSource(result.source);
      setLastSynced(new Date().toLocaleString());
    } catch (error: any) {
      setRows([]);
      setSource("No live backend source returned");
      setErrorMessage(error?.message || "Could not refresh live tariff data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.township} ${row.zone} ${row.tier} ${row.status} ${row.note} ${row.source}`
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

  const uniqueTownships = useMemo(() => new Set(rows.map((row) => row.township)).size, [rows]);

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#061524] p-3 text-[#c8dff0] sm:p-4 lg:p-6">
      <div className="mx-auto w-full max-w-[1800px] space-y-4">
        <header className="flex w-full flex-col gap-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-xl lg:flex-row lg:items-start lg:justify-between lg:p-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#f6b84b]">
              <Database size={14} /> Live Tariff Control
            </div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-black text-[#c8dff0]">
              <Calculator className="shrink-0 text-[#38bdf8]" /> Tariff Master Data
            </h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#9cc2d9]">
              Live tariff records loaded from the first available Supabase RPC or tariff table.
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[440px]">
            <div className="min-w-0 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#f6b84b]">Backend source</div>
              <div className="mt-1 break-words text-sm font-black text-[#c8dff0]">{source}</div>
            </div>
            <div className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#f6b84b]">Last refresh</div>
              <div className="mt-1 text-sm font-black text-[#c8dff0]">{lastSynced || "-"}</div>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500 bg-amber-950/30 px-4 py-3 text-sm font-bold text-amber-200">
            <AlertCircle className="mt-0.5 shrink-0" size={17} />
            <span className="break-words">{errorMessage}</span>
          </div>
        ) : null}

        <section className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">Townships</div>
            <div className="mt-1 text-3xl font-black text-[#f6b84b]">{uniqueTownships}</div>
          </div>
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">Tariff rows</div>
            <div className="mt-1 text-3xl font-black text-[#f6b84b]">{rows.length}</div>
          </div>
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 sm:col-span-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">Live data status</div>
            <div className="mt-1 break-words text-sm font-black text-[#c8dff0]">
              {loading ? "Refreshing backend tariff data..." : rows.length ? `${rows.length} live rows loaded from ${source}.` : "No live rows loaded."}
            </div>
          </div>
        </section>

        <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
          <div className="flex w-full flex-col gap-3 border-b border-[#1a3a5c] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[#c8dff0]">Tariff Master Table</h2>
              <p className="mt-1 text-xs font-semibold text-[#9cc2d9]">Search and refresh controls remain above the horizontally scrollable table.</p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative min-w-[230px] flex-1 lg:w-80 lg:flex-none">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[#475569]" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search township, zone, tier, status..."
                  className="h-10 w-full rounded-xl border-2 border-[#1a3a5c] bg-white pl-9 pr-3 text-sm font-extrabold text-[#061524] outline-none placeholder:text-[#64748b] focus:border-[#f6b84b]"
                />
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-[#061524] bg-[#f6b84b] px-4 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#ffd77a] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                {loading ? "Refreshing..." : "Refresh live tariff"}
              </button>
            </div>
          </div>

          <div className="w-full min-w-0 overflow-x-auto bg-white">
            <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm text-[#061524]">
              <thead className="sticky top-0 z-10 bg-[#f6b84b] text-[11px] font-black uppercase tracking-wider text-[#061524]">
                <tr>
                  {[
                    "Township / Destination",
                    "Zone",
                    "Tier",
                    "Base Charge",
                    "Included KG",
                    "Extra / KG",
                    "Status",
                    "Note",
                    "Backend Source",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap border-b-2 border-r border-[#061524] px-4 py-3 last:border-r-0">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="font-semibold hover:bg-[#fff7dc]">
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-black">{row.township}</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3">{row.zone}</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-black">{row.tier}</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-right font-black">{row.baseFee.toLocaleString()} MMK</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-right">{row.includedKg}</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-right">{row.extraPerKg.toLocaleString()} MMK</td>
                    <td className="whitespace-nowrap border-b border-slate-200 px-4 py-3">
                      <span className="rounded-full border border-emerald-500 bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-900">{row.status}</span>
                    </td>
                    <td className="max-w-[320px] whitespace-normal break-words border-b border-slate-200 px-4 py-3">{row.note}</td>
                    <td className="max-w-[280px] whitespace-normal break-words border-b border-slate-200 px-4 py-3 text-xs font-black">{row.source}</td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-base font-black text-[#334155]">
                      {loading ? "Refreshing live tariff data..." : "No tariff records match the current search."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
