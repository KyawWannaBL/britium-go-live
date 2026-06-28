import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, CheckCircle2, Database, RefreshCw, Search } from 'lucide-react';

import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import { rpcJson } from '@/lib/goLivePortalApi';

type Tier = 'STANDARD' | 'ROYAL' | 'COMMITMENT';

type TariffRow = {
  township: string;
  zone: string;
  zoneCode: string;
  customerTier: Tier;
  baseFee: number;
  includedKg: number;
  extraPerKg: number;
  commitmentMinWays: number;
  commitmentRefundPerWay: number;
  status?: string;
  source?: string;
  note?: string;
};

type SourceTariffRow = {
  township: string;
  zone: string;
  zoneCode: string;
  baseFee: number;
  note?: string;
};

const TIER_RULES: Record<Tier, { label: string; includedKg: number; commitmentMinWays: number; commitmentRefundPerWay: number }> = {
  STANDARD: { label: 'Standard - 3kg', includedKg: 3, commitmentMinWays: 0, commitmentRefundPerWay: 0 },
  ROYAL: { label: 'Royal - 5kg', includedKg: 5, commitmentMinWays: 0, commitmentRefundPerWay: 0 },
  COMMITMENT: { label: 'Commitment - 5kg / 1,500+ ways / 500 MMK refund', includedKg: 5, commitmentMinWays: 1500, commitmentRefundPerWay: 500 },
};

const SOURCE_TARIFFS: SourceTariffRow[] = [
  ['ပန်းဘဲတန်း', 'Yangon', 'YGN', 4000],
  ['ကျောက်တံတား', 'Yangon', 'YGN', 4000],
  ['လမ်းမတော်', 'Yangon', 'YGN', 4000],
  ['လသာ', 'Yangon', 'YGN', 4000],
  ['ပုဇွန်တောင်', 'Yangon', 'YGN', 4000],
  ['ဗိုလ်တထောင်', 'Yangon', 'YGN', 4000],
  ['ဒဂုံ', 'Yangon', 'YGN', 4000],
  ['အလုံ', 'Yangon', 'YGN', 4000],
  ['ကြည့်မြင်တိုင်', 'Yangon', 'YGN', 4000],
  ['စမ်းချောင်း', 'Yangon', 'YGN', 4000],
  ['မင်္ဂလာတောင်ညွန့်', 'Yangon', 'YGN', 4000],
  ['တာမွေ', 'Yangon', 'YGN', 4000],
  ['ဗဟန်း', 'Yangon', 'YGN', 4000],
  ['တောင်ဥက္ကလာပ', 'Yangon', 'YGN', 4000],
  ['မြောက်ဒဂုံ', 'Yangon', 'YGN', 4000],
  ['အရှေ့ဒဂုံ', 'Yangon', 'YGN', 4000],
  ['ရန်ကင်း', 'Yangon', 'YGN', 4000],
  ['ကမာရွတ်', 'Yangon', 'YGN', 4000],
  ['သာကေတ', 'Yangon', 'YGN', 4000],
  ['သင်္ဃန်းကျွန်း', 'Yangon', 'YGN', 4000],
  ['မရမ်းကုန်း', 'Yangon', 'YGN', 4000],
  ['တောင်ဒဂုံ', 'Yangon', 'YGN', 4000],
  ['ဒဂုံဆိပ်ကမ်း', 'Yangon', 'YGN', 4000],
  ['ဒေါပုံ', 'Yangon', 'YGN', 4000],
  ['လှိုင်', 'Yangon', 'YGN', 4000],
  ['အင်းစိန်', 'Yangon', 'YGN', 4000],
  ['မြောက်ဥက္ကလာပ', 'Yangon', 'YGN', 4500, 'Extended Yangon'],
  ['မင်္ဂလာဒုံ', 'Yangon', 'YGN', 4500, 'Extended Yangon'],
  ['ရွှေပြည်သာ', 'Yangon', 'YGN', 4500, 'Extended Yangon'],
  ['လှိုင်သာယာ', 'Yangon', 'YGN', 4500, 'Extended Yangon'],
  ['ရွှေပေါက်ကံ', 'Yangon', 'YGN', 4500, 'Extended Yangon'],
  ['အောင်မင်္ဂလာကားဂိတ်', 'Yangon', 'YGN', 3000, 'Aung Mingalar highway drop-off'],
  ['Aung Mingalar Highway Drop Off', 'Yangon', 'YGN', 3000, 'Aung Mingalar highway drop-off'],
  ['ပရမီ ကားဝင်း (ဗန္ဓုလ)', 'Yangon', 'YGN', 3000, 'Highway drop-off'],
  ['အောင်ဆန်းကွင်း', 'Yangon', 'YGN', 3000, 'Drop-off'],
  ['ဂိတ်ချ', 'Yangon', 'YGN', 3000, 'Drop-off'],
  ['အဝေးပြေး ဂိတ်ချ', 'Yangon', 'YGN', 3000, 'Highway drop-off'],
  ['ရန်ကုန်စာတိုက်ကြီး', 'Yangon', 'YGN', 3000, 'Post office drop-off'],
  ['ဘုရင့်နောင် ကားဝင်း', 'Yangon', 'YGN', 4000, 'Bus-station drop-off'],
  ['လှိုင်သာယာအဝေးပြေး (ဒဂုံဧရာ)', 'Yangon', 'YGN', 4000, 'Dagon Ayar / Dagon Thiri highway drop-off'],
  ['Dagon Thiri Highway Drop Off', 'Yangon', 'YGN', 4000, 'Dagon Thiri highway drop-off'],
  ['အောင်မြေသာစံမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ချမ်းအေးသာစံမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['မဟာအောင်မြေမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ချမ်းမြသာစည်မြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ပြည်ကြီးတံခွန်မြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['အမရပူရမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ပုသိမ်ကြီးမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['Mandalay', 'Mandalay', 'MDY', 6000],
  ['ဇမ္ဗူသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ဒက္ခိဏသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ပုဗ္ဗသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ဥတ္တရသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ဇေယျာသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ပျဉ်းမနားမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['Naypyitaw', 'Nay Pyi Taw', 'NPT', 6000],
].map(([township, zone, zoneCode, baseFee, note]) => ({
  township,
  zone,
  zoneCode,
  baseFee,
  note,
}));

const FALLBACK_ROWS = expandTierRows(SOURCE_TARIFFS, 'go-live fallback v13');

function asNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function inferZoneCode(row: Record<string, any>, township: string) {
  const raw = String(row.zone_code || row.branch_code || row.city_code || row.zoneCode || '').trim();
  if (raw) return raw.toUpperCase();

  const city = String(row.city || row.branch_name || row.zone || '').toLowerCase();
  if (city.includes('mandalay')) return 'MDY';
  if (city.includes('nay') || city.includes('npt')) return 'NPT';
  if (township.includes('မန္တလေး')) return 'MDY';
  if (township.includes('နေပြည်')) return 'NPT';
  return 'YGN';
}

function normalizeTier(value: unknown): Tier | null {
  const tier = String(value || '').trim().toUpperCase();
  if (tier.includes('COMMIT')) return 'COMMITMENT';
  if (tier.includes('ROYAL') || tier.includes('LOYAL')) return 'ROYAL';
  if (tier.includes('STANDARD') || tier.includes('NORMAL')) return 'STANDARD';
  return null;
}

function normalizeSourceRow(row: Record<string, any>, source: string): TariffRow[] {
  const township = String(
    row.township ||
      row.township_name ||
      row.destination_township ||
      row.name ||
      row.dropoff_name_en ||
      '',
  ).trim();

  if (!township) return [];

  const baseFee = asNumber(
    row.base_fee,
    row.base_fee_mmk,
    row.base_delivery_charge,
    row.delivery_charge,
    row.deli_charge,
    row.base_rate,
    row.amount_mmk,
    row.price,
  );

  if (!baseFee) return [];

  const explicitTier = normalizeTier(row.customer_tier || row.customer_type || row.service_type || row.profile_code);
  const tiers: Tier[] = explicitTier ? [explicitTier] : ['STANDARD', 'ROYAL', 'COMMITMENT'];
  const zoneCode = inferZoneCode(row, township);
  const zone =
    String(row.city || row.branch_name || row.zone || row.region || row.route_group || '').trim() ||
    (zoneCode === 'MDY' ? 'Mandalay' : zoneCode === 'NPT' ? 'Nay Pyi Taw' : 'Yangon');

  return tiers.map((customerTier) => {
    const rule = TIER_RULES[customerTier];

    return {
      township,
      zone,
      zoneCode,
      customerTier,
      baseFee,
      includedKg:
        asNumber(row.included_kg, row.included_weight_kg, row.standard_allowance_kg, row.allowance_kg) ||
        rule.includedKg,
      extraPerKg:
        asNumber(row.extra_per_kg, row.extra_per_kg_mmk, row.extra_kg_rate, row.extra_weight_charge_per_kg, row.per_kg_rate) ||
        500,
      commitmentMinWays: asNumber(row.commitment_min_ways, row.monthly_min_ways) || rule.commitmentMinWays,
      commitmentRefundPerWay: asNumber(row.commitment_refund_per_way, row.refund_per_way) || rule.commitmentRefundPerWay,
      status: String(row.status || row.record_status || 'active'),
      source,
      note: String(row.note || row.remarks || row.route_type || '').trim(),
    };
  });
}

function expandTierRows(rows: SourceTariffRow[], source: string): TariffRow[] {
  return rows.flatMap((row) =>
    (['STANDARD', 'ROYAL', 'COMMITMENT'] as Tier[]).map((customerTier) => {
      const rule = TIER_RULES[customerTier];

      return {
        ...row,
        customerTier,
        includedKg: rule.includedKg,
        extraPerKg: 500,
        commitmentMinWays: rule.commitmentMinWays,
        commitmentRefundPerWay: rule.commitmentRefundPerWay,
        status: 'active',
        source,
      };
    }),
  );
}

async function loadSupabaseTariffs() {
  try {
    const snapshot = await rpcJson<any>('be_master_data_snapshot', {
      p_master_type: 'tariff_master',
      p_search: null,
      p_start_date: null,
      p_end_date: null,
    });
    const rows = Array.isArray(snapshot?.rows)
      ? snapshot.rows.flatMap((row: Record<string, any>) => normalizeSourceRow({ ...(row.payload || {}), ...row }, 'RPC be_master_data_snapshot'))
      : [];
    if (rows.length) return { rows, source: 'RPC be_master_data_snapshot' };
  } catch {
    // Try table fallbacks below.
  }

  const tableNames = ['be_delivery_tariff_master_v13', 'be_md_tariffs', 'tariff_master', 'townships', 'tariffs'];
  const errors: string[] = [];

  for (const table of tableNames) {
    const { data, error } = await supabase.from(table).select('*').limit(3000);
    if (!error && Array.isArray(data)) {
      const rows = data.flatMap((row) => normalizeSourceRow(row as Record<string, any>, table));
      if (rows.length) return { rows, source: table };
    }

    if (error) errors.push(`${table}: ${error.message}`);
  }

  throw new Error(errors[0] || 'No Supabase tariff rows returned.');
}

function calculateTariff(row: TariffRow, weightKg: number, monthlyWays: number, surcharge: number) {
  const chargeableWeight = Math.ceil(Math.max(0, weightKg || 0));
  const extraKg = Math.max(0, chargeableWeight - row.includedKg);
  const weightSurcharge = extraKg * row.extraPerKg;
  const grossTotal = row.baseFee + weightSurcharge + Math.max(0, surcharge || 0);
  const commitmentQualified = row.customerTier === 'COMMITMENT' && monthlyWays >= row.commitmentMinWays;
  const commitmentRefund = commitmentQualified ? row.commitmentRefundPerWay : 0;
  const total = Math.max(0, grossTotal - commitmentRefund);

  return {
    chargeableWeight,
    extraKg,
    weightSurcharge,
    grossTotal,
    commitmentQualified,
    commitmentRefund,
    total,
  };
}

export default function TariffMasterGoLivePage() {
  const [rows, setRows] = useState<TariffRow[]>(FALLBACK_ROWS);
  const [source, setSource] = useState('go-live fallback v13');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState('');
  const [search, setSearch] = useState('');
  const [township, setTownship] = useState('တာမွေ');
  const [tier, setTier] = useState<Tier>('STANDARD');
  const [weightKg, setWeightKg] = useState(1.5);
  const [monthlyWays, setMonthlyWays] = useState(0);
  const [surcharge, setSurcharge] = useState(0);

  async function load() {
    setLoading(true);
    setMessage('');

    try {
      const result = await loadSupabaseTariffs();
      setRows(result.rows);
      setSource(result.source);
      setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setRows(FALLBACK_ROWS);
      setSource('go-live fallback v13');
      setMessage(err instanceof Error ? `Using fallback tariffs because Supabase did not return rows: ${err.message}` : 'Using fallback tariffs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (rows.length && !rows.some((row) => row.township === township)) {
      setTownship(rows[0].township);
    }
  }, [rows, township]);

  const townshipOptions = useMemo(() => {
    const seen = new Map<string, TariffRow>();
    rows.forEach((row) => {
      if (!seen.has(row.township)) seen.set(row.township, row);
    });
    return Array.from(seen.values());
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const text = `${row.township} ${row.zone} ${row.zoneCode} ${row.customerTier} ${row.status} ${row.note || ''}`.toLowerCase();
      return !q || text.includes(q);
    });
  }, [rows, search]);

  const selected = useMemo(() => {
    return (
      rows.find((row) => row.township === township && row.customerTier === tier) ||
      rows.find((row) => row.customerTier === tier) ||
      rows[0] ||
      FALLBACK_ROWS[0]
    );
  }, [township, tier, rows]);

  const quote = calculateTariff(selected, weightKg, monthlyWays, surcharge);
  const uniqueTownships = new Set(rows.map((row) => row.township)).size;
  const baseFees = rows.map((row) => row.baseFee).filter((value) => Number.isFinite(value));
  const baseRange = baseFees.length ? `${Math.min(...baseFees).toLocaleString()}-${Math.max(...baseFees).toLocaleString()}` : '-';

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                <Database className="h-3.5 w-3.5" />
                Live tariff control v13
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">Tariff Master</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Township delivery pricing with Standard, Royal, and Commitment customer tiers. Highway and bus-station drop-offs are configured as their own base-charge destinations, not as an additional fee.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-500">Connection</p>
                <p className={`mt-2 flex items-center gap-2 text-sm font-black ${isSupabaseConfigured ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isSupabaseConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {isSupabaseConfigured ? 'Supabase ready' : 'Missing env'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-500">Current Source</p>
                <p className="mt-2 truncate text-sm font-black text-slate-800">{source}</p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">Townships</p>
            <p className="mt-2 text-3xl font-black">{uniqueTownships}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">Tariff Rows</p>
            <p className="mt-2 text-3xl font-black">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">Base Range</p>
            <p className="mt-2 text-3xl font-black">{baseRange}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">Commitment Refund</p>
            <p className="mt-2 text-3xl font-black">500</p>
            <p className="text-xs font-bold text-slate-500">MMK / way after 1,500 ways</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">Last Sync</p>
            <p className="mt-2 text-sm font-black text-slate-700">{lastSynced || '-'}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-700" />
              <h2 className="text-xl font-black">Quick Quote Calculator</h2>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700"
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh live tariff
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_260px_140px_160px_150px_230px]">
            <div>
              <label className="text-xs font-black uppercase text-slate-500">Township / Destination</label>
              <select
                value={township}
                onChange={(event) => setTownship(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                {townshipOptions.map((row) => (
                  <option key={`${row.zoneCode}-${row.township}`} value={row.township}>
                    {row.township} - {row.zone} - {row.baseFee.toLocaleString()} MMK
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500">Customer Tier</label>
              <select
                value={tier}
                onChange={(event) => setTier(event.target.value as Tier)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="STANDARD">Standard - 3kg</option>
                <option value="ROYAL">Royal - 5kg</option>
                <option value="COMMITMENT">Commitment - 5kg / refund</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500">Weight KG</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={weightKg}
                onChange={(event) => setWeightKg(Number(event.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500">Monthly Ways</label>
              <input
                type="number"
                min="0"
                step="1"
                value={monthlyWays}
                onChange={(event) => setMonthlyWays(Number(event.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500">Surcharge</label>
              <input
                type="number"
                min="0"
                step="100"
                value={surcharge}
                onChange={(event) => setSurcharge(Number(event.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>

            <div className="rounded-2xl bg-blue-700 p-4 text-white">
              <p className="text-xs font-black uppercase opacity-80">Net Delivery Charge</p>
              <p className="mt-1 text-3xl font-black">{quote.total.toLocaleString()} MMK</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-6">
            <p><b>Base:</b> {selected.baseFee.toLocaleString()} MMK</p>
            <p><b>Allowance:</b> {selected.includedKg} kg</p>
            <p><b>Chargeable:</b> {quote.chargeableWeight} kg</p>
            <p><b>Extra:</b> {quote.extraKg} kg x {selected.extraPerKg.toLocaleString()}</p>
            <p><b>Gross:</b> {quote.grossTotal.toLocaleString()} MMK</p>
            <p><b>Refund:</b> {quote.commitmentRefund.toLocaleString()} MMK</p>
          </div>

          {tier === 'COMMITMENT' && !quote.commitmentQualified && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Commitment refund is applied only when monthly committed way count is 1,500 or above.
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-black">Tariff Master Table</h2>
              <p className="mt-1 text-xs text-slate-500">Default Yangon starts from 4,000 MMK. Hlaing Thar Yar and Shwe Pyi Thar are 4,500 MMK. Mandalay and Naypyitaw are 6,000 MMK.</p>
            </div>

            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search township, zone, tier, drop-off..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Township / Destination</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Base Charge</th>
                  <th className="px-4 py-3 text-right">Included KG</th>
                  <th className="px-4 py-3 text-right">Extra / KG</th>
                  <th className="px-4 py-3 text-right">Commitment</th>
                  <th className="px-4 py-3 text-right">Refund / Way</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={`${row.zoneCode}-${row.township}-${row.customerTier}-${row.source}`} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold">{row.township}</td>
                    <td className="px-4 py-3">{row.zone}</td>
                    <td className="px-4 py-3 font-black">{row.customerTier}</td>
                    <td className="px-4 py-3 text-right font-black">{row.baseFee.toLocaleString()} MMK</td>
                    <td className="px-4 py-3 text-right">{row.includedKg}</td>
                    <td className="px-4 py-3 text-right">{row.extraPerKg.toLocaleString()} MMK</td>
                    <td className="px-4 py-3 text-right">{row.commitmentMinWays ? `${row.commitmentMinWays.toLocaleString()} ways` : '-'}</td>
                    <td className="px-4 py-3 text-right">{row.commitmentRefundPerWay ? `${row.commitmentRefundPerWay.toLocaleString()} MMK` : '-'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500">{row.note || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                        {row.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500">{row.source}</td>
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

