import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type Tier = "STANDARD" | "ROYAL" | "COMMITMENT";

type TariffRow = {
  id: string;
  township: string;
  zone: string;
  tier: Tier;
  baseFee: number;
  includedKg: number;
  extraPerKg: number;
  commitmentMinWays: number;
  commitmentRefundPerWay: number;
  active: boolean;
  source: string;
  note: string;
};

const TIER_RULES: Record<Tier, { includedKg: number; minWays: number; refund: number }> = {
  STANDARD: { includedKg: 3, minWays: 0, refund: 0 },
  ROYAL: { includedKg: 5, minWays: 0, refund: 0 },
  COMMITMENT: { includedKg: 5, minWays: 1500, refund: 500 },
};

const FALLBACK_BASE = [
  ["ပန်းဘဲတန်း", "Yangon", 4000],
  ["ကျောက်တံတား", "Yangon", 4000],
  ["တာမွေ", "Yangon", 4000],
  ["ရန်ကင်း", "Yangon", 4000],
  ["လှိုင်", "Yangon", 4000],
  ["လှိုင်သာယာ", "Yangon", 4500],
  ["ရွှေပြည်သာ", "Yangon", 4500],
  ["Mandalay", "Mandalay", 6000],
  ["Naypyitaw", "Nay Pyi Taw", 6000],
] as const;

function asNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function normalizeTier(value: unknown): Tier | null {
  const text = String(value || "").toUpperCase();
  if (text.includes("COMMIT")) return "COMMITMENT";
  if (text.includes("ROYAL") || text.includes("LOYAL")) return "ROYAL";
  if (text.includes("STANDARD") || text.includes("NORMAL")) return "STANDARD";
  return null;
}

function normalizeRow(raw: Record<string, unknown>, source: string): TariffRow[] {
  const township = String(
    raw.township ||
      raw.township_name ||
      raw.destination_township ||
      raw.name ||
      raw.value ||
      "",
  ).trim();

  const baseFee = asNumber(
    raw.base_fee,
    raw.base_fee_mmk,
    raw.base_delivery_charge,
    raw.delivery_charge,
    raw.deli_charge,
    raw.price,
    raw.amount_mmk,
  );

  if (!township || !baseFee) return [];

  const explicitTier = normalizeTier(
    raw.customer_tier || raw.customer_type || raw.service_type || raw.profile_code,
  );
  const tiers: Tier[] = explicitTier ? [explicitTier] : ["STANDARD", "ROYAL", "COMMITMENT"];
  const zone = String(raw.zone || raw.city || raw.branch_name || raw.region || "Yangon");

  return tiers.map((tier) => {
    const rule = TIER_RULES[tier];

    return {
      id: String(raw.id || `${source}-${township}-${tier}`),
      township,
      zone,
      tier,
      baseFee,
      includedKg:
        asNumber(raw.included_kg, raw.included_weight_kg, raw.allowance_kg) ||
        rule.includedKg,
      extraPerKg:
        asNumber(raw.extra_per_kg, raw.extra_per_kg_mmk, raw.per_kg_rate) || 500,
      commitmentMinWays:
        asNumber(raw.commitment_min_ways, raw.monthly_min_ways) || rule.minWays,
      commitmentRefundPerWay:
        asNumber(raw.commitment_refund_per_way, raw.refund_per_way) || rule.refund,
      active: raw.is_active !== false && String(raw.status || "active").toLowerCase() !== "inactive",
      source,
      note: String(raw.note || raw.remarks || raw.route_type || ""),
    };
  });
}

function fallbackRows() {
  return FALLBACK_BASE.flatMap(([township, zone, baseFee]) =>
    (["STANDARD", "ROYAL", "COMMITMENT"] as Tier[]).map((tier) => {
      const rule = TIER_RULES[tier];
      return {
        id: `fallback-${township}-${tier}`,
        township,
        zone,
        tier,
        baseFee,
        includedKg: rule.includedKg,
        extraPerKg: 500,
        commitmentMinWays: rule.minWays,
        commitmentRefundPerWay: rule.refund,
        active: true,
        source: "built-in fallback",
        note: "",
      } satisfies TariffRow;
    }),
  );
}

async function loadTariffs() {
  const errors: string[] = [];

  try {
    const { data, error } = await supabase.rpc("be_tariff_list");
    if (error) throw error;
    const rawRows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
    const rows = rawRows.flatMap((row: Record<string, unknown>) => normalizeRow(row, "RPC be_tariff_list"));
    if (rows.length) return { rows, source: "RPC be_tariff_list" };
  } catch (caught) {
    errors.push(caught instanceof Error ? caught.message : "be_tariff_list failed");
  }

  try {
    const { data, error } = await supabase.rpc("be_master_data_snapshot", {
      p_master_type: "tariff_master",
      p_search: null,
      p_start_date: null,
      p_end_date: null,
    });
    if (error) throw error;
    const rawRows = Array.isArray(data?.rows) ? data.rows : [];
    const rows = rawRows.flatMap((row: Record<string, unknown>) =>
      normalizeRow({ ...(row.payload as Record<string, unknown>), ...row }, "RPC be_master_data_snapshot"),
    );
    if (rows.length) return { rows, source: "RPC be_master_data_snapshot" };
  } catch (caught) {
    errors.push(caught instanceof Error ? caught.message : "be_master_data_snapshot failed");
  }

  for (const table of [
    "be_delivery_tariff_master_v13",
    "be_md_tariffs",
    "tariff_master",
    "tariffs",
    "be_master_data_options",
  ]) {
    const { data, error } = await supabase.from(table).select("*").limit(3000);
    if (!error && Array.isArray(data)) {
      const rows = data.flatMap((row) => normalizeRow(row as Record<string, unknown>, table));
      if (rows.length) return { rows, source: table };
    }
    if (error) errors.push(`${table}: ${error.message}`);
  }

  throw new Error(errors[0] || "No tariff records were returned by Supabase.");
}

export default function TariffPage() {
  const [rows, setRows] = useState<TariffRow[]>(fallbackRows());
  const [source, setSource] = useState("built-in fallback");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [township, setTownship] = useState("တာမွေ");
  const [tier, setTier] = useState<Tier>("STANDARD");
  const [weightKg, setWeightKg] = useState(1.5);
  const [monthlyWays, setMonthlyWays] = useState(0);
  const [surcharge, setSurcharge] = useState(0);

  async function refresh() {
    setLoading(true);
    setMessage("");

    try {
      const result = await loadTariffs();
      setRows(result.rows);
      setSource(result.source);
      setLastSynced(new Date().toLocaleString());
    } catch (caught) {
      setRows(fallbackRows());
      setSource("built-in fallback");
      setMessage(
        caught instanceof Error
          ? `Live tariff sync failed. Showing fallback values. ${caught.message}`
          : "Live tariff sync failed. Showing fallback values.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const townshipRows = useMemo(() => {
    const map = new Map<string, TariffRow>();
    rows.forEach((row) => {
      if (!map.has(row.township)) map.set(row.township, row);
    });
    return [...map.values()];
  }, [rows]);

  useEffect(() => {
    if (townshipRows.length && !townshipRows.some((row) => row.township === township)) {
      setTownship(townshipRows[0].township);
    }
  }, [township, townshipRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.township} ${row.zone} ${row.tier} ${row.note} ${row.source}`
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

  const selected =
    rows.find((row) => row.township === township && row.tier === tier) ||
    rows.find((row) => row.tier === tier) ||
    rows[0];

  const chargeableWeight = Math.ceil(Math.max(0, weightKg));
  const extraKg = Math.max(0, chargeableWeight - (selected?.includedKg || 0));
  const gross =
    (selected?.baseFee || 0) +
    extraKg * (selected?.extraPerKg || 0) +
    Math.max(0, surcharge);
  const refund =
    tier === "COMMITMENT" && monthlyWays >= (selected?.commitmentMinWays || 0)
      ? selected?.commitmentRefundPerWay || 0
      : 0;
  const total = Math.max(0, gross - refund);

  const uniqueTownships = new Set(rows.map((row) => row.township)).size;
  const fees = rows.map((row) => row.baseFee);
  const feeRange = fees.length
    ? `${Math.min(...fees).toLocaleString()}–${Math.max(...fees).toLocaleString()}`
    : "-";

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#061524] px-3 py-4 text-[#eef8ff] sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1720px] min-w-0 flex-col gap-4">
        <section className="rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-2xl sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#254b73] bg-[#061524] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#38bdf8]">
                <Database className="h-3.5 w-3.5" />
                Live Tariff Control
              </div>
              <h1 className="mt-3 flex items-center gap-3 text-2xl font-black sm:text-3xl">
                <Calculator className="text-[#f6b84b]" />
                Tariff Master
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9cc2d9]">
                Backend-synchronized township pricing, customer tiers, weight rules, and commitment refunds.
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto xl:min-w-[520px]">
              <div className="rounded-xl border border-[#254b73] bg-[#061524] p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6fa3c8]">Connection</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-black text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Supabase
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-[#254b73] bg-[#061524] p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6fa3c8]">Source</p>
                <p className="mt-1 truncate text-sm font-black text-white" title={source}>{source}</p>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-[#8a5a00] bg-[#f6b84b] px-4 text-sm font-black text-black transition hover:bg-[#ffd36d] disabled:opacity-60"
              >
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh Live Tariff
              </button>
            </div>
          </div>
        </section>

        {message && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-950/50 p-4 text-sm font-bold text-amber-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="break-words">{message}</span>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Townships", uniqueTownships.toLocaleString()],
            ["Tariff Rows", rows.length.toLocaleString()],
            ["Base Range", `${feeRange} MMK`],
            ["Commitment Refund", "500 MMK / way"],
            ["Last Sync", lastSynced || "Not synced"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#6fa3c8]">{label}</p>
              <p className="mt-2 break-words text-xl font-black text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-2xl sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-[#38bdf8]" />
            <h2 className="text-xl font-black">Quick Quote Calculator</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_130px_150px_130px_220px]">
            <label className="text-xs font-black uppercase tracking-wider text-[#9cc2d9]">
              Township / Destination
              <select
                value={township}
                onChange={(event) => setTownship(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border-2 border-[#254b73] bg-white px-3 text-sm font-bold text-[#061524] outline-none focus:border-[#f6b84b]"
              >
                {townshipRows.map((row) => (
                  <option key={row.township} value={row.township}>
                    {row.township} · {row.zone} · {row.baseFee.toLocaleString()} MMK
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-black uppercase tracking-wider text-[#9cc2d9]">
              Customer Tier
              <select
                value={tier}
                onChange={(event) => setTier(event.target.value as Tier)}
                className="mt-2 h-11 w-full rounded-xl border-2 border-[#254b73] bg-white px-3 text-sm font-bold text-[#061524] outline-none focus:border-[#f6b84b]"
              >
                <option value="STANDARD">Standard · 3 kg</option>
                <option value="ROYAL">Royal · 5 kg</option>
                <option value="COMMITMENT">Commitment · 5 kg</option>
              </select>
            </label>

            {[
              ["Weight KG", weightKg, setWeightKg, "0.1"],
              ["Monthly Ways", monthlyWays, setMonthlyWays, "1"],
              ["Surcharge", surcharge, setSurcharge, "100"],
            ].map(([label, value, setter, step]) => (
              <label key={String(label)} className="text-xs font-black uppercase tracking-wider text-[#9cc2d9]">
                {String(label)}
                <input
                  type="number"
                  min="0"
                  step={String(step)}
                  value={Number(value)}
                  onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))}
                  className="mt-2 h-11 w-full rounded-xl border-2 border-[#254b73] bg-white px-3 text-sm font-bold text-[#061524] outline-none focus:border-[#f6b84b]"
                />
              </label>
            ))}

            <div className="flex min-h-[78px] flex-col justify-center rounded-2xl border-2 border-[#8a5a00] bg-[#f6b84b] p-4 text-black shadow-lg">
              <p className="text-[10px] font-black uppercase tracking-wider">Net Delivery Charge</p>
              <p className="mt-1 text-2xl font-black">{total.toLocaleString()} MMK</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 rounded-2xl border border-[#254b73] bg-[#061524] p-4 text-sm text-[#c8dff0] sm:grid-cols-2 lg:grid-cols-6">
            <p><b className="text-white">Base:</b> {(selected?.baseFee || 0).toLocaleString()} MMK</p>
            <p><b className="text-white">Allowance:</b> {selected?.includedKg || 0} kg</p>
            <p><b className="text-white">Chargeable:</b> {chargeableWeight} kg</p>
            <p><b className="text-white">Extra:</b> {extraKg} kg</p>
            <p><b className="text-white">Gross:</b> {gross.toLocaleString()} MMK</p>
            <p><b className="text-white">Refund:</b> {refund.toLocaleString()} MMK</p>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-[#1a3a5c] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black">Tariff Master Table</h2>
              <p className="mt-1 text-sm text-[#9cc2d9]">Live rows are preferred; fallback rows remain visible only when the backend cannot respond.</p>
            </div>

            <label className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search township, zone, tier, source..."
                className="h-11 w-full rounded-xl border-2 border-[#254b73] bg-white pl-10 pr-3 text-sm font-bold text-[#061524] outline-none placeholder:text-slate-400 focus:border-[#f6b84b]"
              />
            </label>
          </div>

          <div className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-auto bg-white">
            <table className="w-full min-w-[1160px] border-separate border-spacing-0 text-sm text-[#061524]">
              <thead className="sticky top-0 z-20 bg-[#f6b84b] text-black shadow-[0_2px_0_#8a5a00]">
                <tr>
                  {[
                    "Township / Destination",
                    "Zone",
                    "Tier",
                    "Base Charge",
                    "Included KG",
                    "Extra / KG",
                    "Commitment",
                    "Refund / Way",
                    "Status",
                    "Source",
                  ].map((header) => (
                    <th key={header} className="border-b-2 border-r border-[#8a5a00] px-4 py-3 text-left text-xs font-black uppercase tracking-wider last:border-r-0">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={`${row.id}-${row.tier}`} className="odd:bg-white even:bg-slate-50 hover:bg-[#fff7dd]">
                    <td className="border-b border-r border-slate-200 px-4 py-3 font-black">{row.township}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 font-semibold">{row.zone}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 font-black">{row.tier}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 text-right font-black">{row.baseFee.toLocaleString()} MMK</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 text-right font-bold">{row.includedKg}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 text-right font-bold">{row.extraPerKg.toLocaleString()} MMK</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 text-right font-bold">{row.commitmentMinWays ? `${row.commitmentMinWays.toLocaleString()} ways` : "-"}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3 text-right font-bold">{row.commitmentRefundPerWay ? `${row.commitmentRefundPerWay.toLocaleString()} MMK` : "-"}</td>
                    <td className="border-b border-r border-slate-200 px-4 py-3">
                      <span className={row.active ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800" : "rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800"}>
                        {row.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
