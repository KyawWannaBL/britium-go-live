import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Calculator, BookOpen, Search } from "lucide-react";

type Tier = "Standard" | "Royal";

type TariffRow = {
  id?: string;
  township_key: string;
  township: string;
  township_mm?: string | null;
  branch_code?: string | null;
  city?: string | null;
  region_state?: string | null;
  customer_tier: Tier | string;
  base_fee: number;
  included_kg: number;
  extra_kg_fee: number;
  highway_dropoff_fee?: number | null;
  tariff_area_type?: string | null;
  source_label?: string | null;
  is_active?: boolean | null;
  is_out_of_reach?: boolean | null;
  service_status?: string | null;
};

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: number) {
  return `${Math.round(value).toLocaleString()} MMK`;
}

function calculate(row: TariffRow | undefined, weightKg: number, highwayDropoff: boolean) {
  if (!row) {
    return {
      chargeableWeight: 0,
      allowance: 0,
      extraKg: 0,
      surcharge: 0,
      baseFee: 0,
      highwayFee: 0,
      total: 0,
    };
  }

  const chargeableWeight = Math.ceil(Math.max(0, n(weightKg)));
  const allowance = n(row.included_kg);
  const extraKg = Math.max(0, chargeableWeight - allowance);
  const surcharge = extraKg * n(row.extra_kg_fee);
  const baseFee = n(row.base_fee);
  const highwayFee = highwayDropoff ? n(row.highway_dropoff_fee, 3000) : 0;

  return {
    chargeableWeight,
    allowance,
    extraKg,
    surcharge,
    baseFee,
    highwayFee,
    total: baseFee + surcharge + highwayFee,
  };
}

export default function TariffPage() {
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TariffRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTownshipKey, setSelectedTownshipKey] = useState("");
  const [tier, setTier] = useState<Tier>("Standard");
  const [weightKg, setWeightKg] = useState(1);
  const [highwayDropoff, setHighwayDropoff] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function loadData() {
    setLoading(true);
    setErrorText("");

    const { data, error } = await supabase
      .from("be_v_delivery_tariff_master")
      .select("*")
      .eq("is_active", true)
      .order("branch_code", { ascending: true })
      .order("township", { ascending: true })
      .order("customer_tier", { ascending: true });

    if (error) {
      setErrorText(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const nextRows = (data || []) as TariffRow[];
    setRows(nextRows);

    if (!selectedTownshipKey && nextRows.length) {
      const firstStandard = nextRows.find((r) => String(r.customer_tier).toLowerCase() === "standard") || nextRows[0];
      setSelectedTownshipKey(firstStandard.township_key);
      setTier(String(firstStandard.customer_tier).toLowerCase() === "royal" ? "Royal" : "Standard");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const townshipOptions = useMemo(() => {
    const map = new Map<string, TariffRow>();
    rows.forEach((row) => {
      if (!map.has(row.township_key)) map.set(row.township_key, row);
    });
    return Array.from(map.values()).sort((a, b) => {
      return `${a.branch_code || ""}-${a.township}`.localeCompare(`${b.branch_code || ""}-${b.township}`);
    });
  }, [rows]);

  const selectedRow = useMemo(() => {
    return (
      rows.find(
        (row) =>
          row.township_key === selectedTownshipKey &&
          String(row.customer_tier).toLowerCase() === tier.toLowerCase()
      ) ||
      rows.find((row) => row.township_key === selectedTownshipKey) ||
      rows[0]
    );
  }, [rows, selectedTownshipKey, tier]);

  const quote = calculate(selectedRow, weightKg, highwayDropoff);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const text = [
        row.township,
        row.township_mm,
        row.branch_code,
        row.city,
        row.region_state,
        row.customer_tier,
        row.source_label,
        row.tariff_area_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [rows, search]);

  const stats = useMemo(() => {
    const townships = new Set(rows.map((r) => r.township_key)).size;
    const standardRows = rows.filter((r) => String(r.customer_tier).toLowerCase() === "standard").length;
    const royalRows = rows.filter((r) => String(r.customer_tier).toLowerCase() === "royal").length;
    const extraRates = Array.from(new Set(rows.map((r) => n(r.extra_kg_fee)).filter((x) => x > 0)));
    return {
      townships,
      tariffRows: rows.length,
      standardRows,
      royalRows,
      extraRateLabel: extraRates.length === 1 ? money(extraRates[0]) : `${extraRates.length} rates`,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">
            {t("TARIFF MASTER", "ပို့ဆောင်ခ နှုန်းထားများ")}
          </h1>
          <p className="text-[#4d7a9b] text-[13px]">
            {t(
              "Official delivery tariff schedule from backend tariff master.",
              "Backend tariff master မှ ပို့ဆောင်ခ နှုန်းထားများ။"
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} />
          <span className="hidden md:inline">{t("Refresh", "ပြန်လည်စတင်ရန်")}</span>
        </button>
      </div>

      {errorText ? (
        <div className="bg-red-950/40 border border-red-700 text-red-200 p-4 rounded-xl text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl">
        <h3 className="text-[#f6b84b] text-[13px] uppercase tracking-widest mb-4 flex items-center gap-2">
          <BookOpen size={16} /> {t("TARIFF RULES", "ပို့ဆောင်ခ စည်းမျဉ်းများ")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-3 gap-x-6 text-[#4d7a9b] text-[13px]">
          <div>› {t("Standard allowance: 3 kg", "Standard သတ်မှတ်အလေးချိန် - ၃ ကီလို")}</div>
          <div>› {t("Royal allowance: 5 kg", "Royal သတ်မှတ်အလေးချိန် - ၅ ကီလို")}</div>
          <div>› {t("Chargeable: ceil(actual weight)", "ကျသင့်အလေးချိန် - ပကတိအလေးချိန်")}</div>
          <div>› {t("Extra: max(0, chargeable - allowance)", "အပိုအလေးချိန် - သတ်မှတ်အလေးချိန်ထက်ပိုသော ကီလို")}</div>
          <div>› {t("Surcharge: extra x tariff extra/kg", "အပိုကြေး - tariff master အပိုကီလိုနှုန်း")}</div>
          <div>› {t("Highway drop-off uses tariff master fee", "ဂိတ်ချခကို tariff master မှယူသည်")}</div>
          <div className="md:col-span-3 text-[#eef8ff]">
            › {t("Total: base + surcharge + highway", "စုစုပေါင်း - အခြေခံပို့ဆောင်ခ + အပိုကြေး + ဂိတ်ချခ")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-xl">
          <div className="text-[#4d7a9b] uppercase text-[10px] tracking-widest mb-1">{t("TOWNSHIPS", "မြို့နယ်များ")}</div>
          <div className="text-[20px] text-[#f6b84b]">{stats.townships}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-xl">
          <div className="text-[#4d7a9b] uppercase text-[10px] tracking-widest mb-1">{t("TARIFF ROWS", "နှုန်းထား မှတ်တမ်း")}</div>
          <div className="text-[20px] text-[#f6b84b]">{stats.tariffRows}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-xl">
          <div className="text-[#4d7a9b] uppercase text-[10px] tracking-widest mb-1">{t("STANDARD ROWS", "Standard စာရင်း")}</div>
          <div className="text-[20px] text-[#4ea8de]">{stats.standardRows}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-xl">
          <div className="text-[#4d7a9b] uppercase text-[10px] tracking-widest mb-1">{t("ROYAL ROWS", "Royal စာရင်း")}</div>
          <div className="text-[20px] text-[#4ea8de]">{stats.royalRows}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-xl">
          <div className="text-[#4d7a9b] uppercase text-[10px] tracking-widest mb-1">{t("EXTRA RATE/KG", "အပို ၁ ကီလိုနှုန်း")}</div>
          <div className="text-[20px] text-emerald-400">{stats.extraRateLabel}</div>
        </div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6">
        <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-6 flex items-center gap-2">
          <Calculator size={16} className="text-[#4ea8de]" />
          {t("Live Tariff Calculator", "ပို့ဆောင်ခ တွက်ချက်ရန်")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="md:col-span-2">
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t("TOWNSHIP / AREA", "မြို့နယ် / နေရာ")}
            </label>
            <select
              value={selectedTownshipKey}
              onChange={(e) => setSelectedTownshipKey(e.target.value)}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            >
              {townshipOptions.map((row) => (
                <option key={row.township_key} value={row.township_key}>
                  {row.township_mm || row.township} — {row.branch_code || row.city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t("TIER", "အမျိုးအစား")}
            </label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            >
              <option value="Standard">{t("Standard (3 kg allowance)", "Standard (၃ ကီလို ပါဝင်သည်)")}</option>
              <option value="Royal">{t("Royal (5 kg allowance)", "Royal (၅ ကီလို ပါဝင်သည်)")}</option>
            </select>
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t("WEIGHT (KG)", "အလေးချိန် (ကီလို)")}
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            />
          </div>

          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              {t("HIGHWAY DROP-OFF", "အဝေးပြေးဂိတ်ချ")}
            </label>
            <div className="h-[46px] flex items-center gap-2 text-[#eef8ff] text-[13px]">
              <input
                type="checkbox"
                checked={highwayDropoff}
                onChange={(e) => setHighwayDropoff(e.target.checked)}
                className="accent-[#f6b84b] w-4 h-4"
              />
              <span>{money(n(selectedRow?.highway_dropoff_fee, 3000))}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 text-[13px]">
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("CHARGEABLE WEIGHT", "ကျသင့် အလေးချိန်")}</p>
              <p className="text-[#eef8ff] font-medium">{quote.chargeableWeight} kg</p>
            </div>
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("ALLOWANCE", "သတ်မှတ် အလေးချိန်")}</p>
              <p className="text-[#eef8ff] font-medium">{quote.allowance} kg</p>
            </div>
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("EXTRA WEIGHT", "အပို အလေးချိန်")}</p>
              <p className="text-[#eef8ff] font-medium">{quote.extraKg} kg</p>
            </div>
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("WEIGHT SURCHARGE", "အပို ကီလိုကြေး")}</p>
              <p className="text-[#eef8ff] font-medium">{money(quote.surcharge)}</p>
            </div>
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("BASE FEE", "အခြေခံ ပို့ဆောင်ခ")}</p>
              <p className="text-[#eef8ff] font-medium">{money(quote.baseFee)}</p>
            </div>
          </div>

          <div className="border-t border-[#1a3a5c] pt-4 flex justify-between items-center">
            <div>
              <p className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">{t("HIGHWAY FEE", "ဂိတ်ချခ")}</p>
              <p className="text-[#eef8ff] font-medium">{money(quote.highwayFee)}</p>
            </div>
            <div className="text-right">
              <p className="text-[#f6b84b] text-[11px] uppercase tracking-widest mb-1">{t("TOTAL TARIFF", "ကျသင့်ငွေ စုစုပေါင်း")}</p>
              <p className="text-[#f6b84b] text-[24px]">{money(quote.total)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">
            {t("Tariff Master Table", "ပို့ဆောင်ခ နှုန်းထားစာရင်း")}
          </h3>
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-[#4d7a9b]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search township, zone, tier...", "မြို့နယ်၊ ဇုန်၊ အမျိုးအစား ရှာရန်...")}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] py-3 pl-10 pr-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[12px]">
            <thead className="bg-[#061524] text-[#4d7a9b] uppercase tracking-widest">
              <tr>
                <th className="text-left px-4 py-3">Township</th>
                <th className="text-left px-4 py-3">MM</th>
                <th className="text-left px-4 py-3">Branch</th>
                <th className="text-left px-4 py-3">Tier</th>
                <th className="text-right px-4 py-3">Base</th>
                <th className="text-right px-4 py-3">Included KG</th>
                <th className="text-right px-4 py-3">Extra/KG</th>
                <th className="text-right px-4 py-3">Highway</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.township_key}-${row.customer_tier}`} className="border-b border-[#1a3a5c] text-[#eef8ff]">
                  <td className="px-4 py-3 font-semibold">{row.township}</td>
                  <td className="px-4 py-3">{row.township_mm || row.source_label || "-"}</td>
                  <td className="px-4 py-3">{row.branch_code || "-"}</td>
                  <td className="px-4 py-3">{row.customer_tier}</td>
                  <td className="px-4 py-3 text-right font-bold">{money(n(row.base_fee))}</td>
                  <td className="px-4 py-3 text-right">{n(row.included_kg)}</td>
                  <td className="px-4 py-3 text-right">{money(n(row.extra_kg_fee))}</td>
                  <td className="px-4 py-3 text-right">{money(n(row.highway_dropoff_fee, 3000))}</td>
                  <td className="px-4 py-3">
                    {row.is_out_of_reach ? (
                      <span className="rounded-full bg-red-900/40 px-3 py-1 text-xs font-bold text-red-300">
                        Out of reach
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-bold text-emerald-300">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[#4d7a9b]">
                    {loading ? "Loading..." : "No tariff rows found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
