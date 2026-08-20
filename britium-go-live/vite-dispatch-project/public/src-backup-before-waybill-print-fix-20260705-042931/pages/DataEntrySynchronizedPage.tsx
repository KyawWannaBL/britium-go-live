import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search } from "lucide-react";
import { generateOperationalIds } from "@/lib/enterpriseWorkflow";
import { loadLiveMasterDataSnapshot } from "@/lib/liveMasterData";
import { useLanguage } from "@/contexts/LanguageContext";

type Row = Record<string, any>;

const QUEUE_KEYS = [
  "britium_go_live_cs_pickups",
  "britium.pickup.requests",
  "britium.registration.dataEntryRows",
  "britium.supervisor.assignmentQueue",
];

function clean(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined" || text === "nan") return fallback;
  return text;
}

function code(value: any) {
  return clean(value, "MAN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X");
}

function normalizePickup(row: Row): Row | null {
  const pickupId = clean(row.pickupId || row.pickup_id || row.pickup_way_id);
  if (!pickupId || pickupId.startsWith("PU-")) return null;

  return {
    ...row, pickupId, pickup_id: pickupId, pickup_way_id: pickupId,
    merchantName: clean(row.merchantName || row.merchant_name || row.customer_merchant || row.merchant, "Unknown merchant"),
    merchantCode: clean(row.merchantCode || row.merchant_code || row.customer_code || row.code, "MAN"),
    phone: clean(row.phone || row.sender_phone || row.contact_phone),
    township: clean(row.township || row.pickup_township || row.sender_township),
    address: clean(row.address || row.pickup_address || row.sender_address),
    parcels: Number(row.parcels || row.parcel_count || 1),
    codAmount: Number(row.codAmount || row.cod_amount || 0),
    status: clean(row.status, "READY FOR DATA ENTRY"),
  };
}

function readQueue(): Row[] {
  if (typeof window === "undefined") return [];
  for (const key of QUEUE_KEYS) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (!Array.isArray(parsed)) continue;
      const valid = parsed.map(normalizePickup).filter(Boolean) as Row[];
      if (valid.length) return valid;
    } catch {}
  }
  return [];
}

function writeQueue(rows: Row[]) {
  if (typeof window === "undefined") return;
  for (const key of QUEUE_KEYS) { window.localStorage.setItem(key, JSON.stringify(rows)); }
  window.dispatchEvent(new CustomEvent("britium-go-live-data-updated"));
}

function fromMerchant(merchant: Row, index: number): Row {
  const merchantCode = code(merchant.code || merchant.merchant_code || merchant.id);
  const ids = generateOperationalIds(new Date().toISOString().slice(0, 10), merchantCode, index + 1);
  return {
    ...ids, pickup_id: ids.pickupId, pickup_way_id: ids.pickupId, delivery_way_id: ids.deliverId, invoice_no: ids.invoiceNo, way_id: ids.waybillNo,
    merchantCode, merchant_code: merchantCode, merchantName: clean(merchant.name || merchant.merchant_name, `Merchant ${index + 1}`), merchant_name: clean(merchant.name || merchant.merchant_name, `Merchant ${index + 1}`),
    phone: clean(merchant.phone || merchant.phone_primary || merchant.sender_phone), sender_phone: clean(merchant.phone || merchant.phone_primary || merchant.sender_phone),
    township: clean(merchant.pickupTownship || merchant.township || merchant.pickup_township), pickup_township: clean(merchant.pickupTownship || merchant.township || merchant.pickup_township),
    address: clean(merchant.pickupAddress || merchant.address_line_1 || merchant.pickup_address), pickup_address: clean(merchant.pickupAddress || merchant.address_line_1 || merchant.pickup_address),
    parcels: index + 1, parcel_count: index + 1, codAmount: 0, cod_amount: 0, status: "READY FOR DATA ENTRY",
  };
}

export default function DataEntrySynchronizedPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function syncQueue() {
    setLoading(true);
    setNotice(t("Loading synchronized Data Entry queue...", "အချက်အလက် စာရင်းသွင်းရန် မှတ်တမ်းများ ရယူနေပါသည်..."));
    const snapshot = await loadLiveMasterDataSnapshot();
    const queued = readQueue();
    const nextRows = queued.length ? queued : snapshot.merchants.slice(0, 50).map(fromMerchant);

    writeQueue(nextRows);
    setRows(nextRows);
    setSelectedId((current) => nextRows.some((row) => row.pickupId === current) ? current : nextRows[0]?.pickupId ?? "");
    setNotice(t(`Data Entry synchronized with ${snapshot.merchants.length} Merchant Master records and ${nextRows.length} valid pickup request(s).`, `အချက်အလက်များ ချိတ်ဆက်ပြီးပါပြီ။ ကုန်သည်မှတ်တမ်း (${snapshot.merchants.length}) ခု နှင့် တောင်းဆိုမှု (${nextRows.length}) ခု ရရှိပါသည်။`));
    setLoading(false);
  }

  useEffect(() => {
    void syncQueue();
    const handler = () => void syncQueue();
    window.addEventListener("britium-go-live-data-updated", handler);
    window.addEventListener("britium-master-data-updated", handler);
    return () => {
      window.removeEventListener("britium-go-live-data-updated", handler);
      window.removeEventListener("britium-master-data-updated", handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  const selected = rows.find((row) => row.pickupId === selectedId) ?? rows[0];

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between bg-[#0b2236] border border-[#1a3a5c] p-8 rounded-3xl shadow-xl">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#f6b84b]"><span>BRITIUM EXPRESS</span></p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white"><span>{t('Data Entry Synchronization', 'အချက်အလက်စာရင်းသွင်းရေး - ချိတ်ဆက်မှုစနစ်')}</span></h1>
            <p className="mt-2 max-w-4xl text-[14px] font-semibold text-[#4d7a9b]">
              <span>{t('Old PU-* records are ignored. Pickup IDs now come from Customer Service and Master Data synchronization.', 'PU-* မှတ်တမ်းဟောင်းများကို ပယ်ဖျက်ထားသည်။ ယခု တောင်းဆိုမှုအမှတ်စဉ်များကို ဖောက်သည်ဝန်ဆောင်မှုဌာနနှင့် အခြေခံအချက်အလက်များမှ ရယူပါသည်။')}</span>
            </p>
          </div>
          <button onClick={syncQueue} disabled={loading} className="inline-flex items-center justify-center gap-3 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 transition-colors px-6 py-3.5 text-[14px] font-bold text-[#38bdf8] cursor-pointer uppercase tracking-wider">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> <span>{t('Refresh Queue', 'စာရင်း ပြန်လည်ရယူမည်')}</span>
          </button>
        </header>

        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl">
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="relative">
              <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search pickup, merchant, phone...", "တောင်းဆိုမှု၊ ကုန်သည်၊ ဖုန်းနံပါတ် ရှာဖွေရန်...")}
                className="h-14 w-full rounded-xl border border-[#1a3a5c] bg-[#081b2e] pl-14 pr-5 text-[14px] font-bold text-white outline-none focus:border-[#f6b84b] transition-colors"
              />
            </div>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-14 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-5 text-[14px] font-bold text-white outline-none cursor-pointer">
              {filtered.map((row) => (
                <option key={row.pickupId} value={row.pickupId}>
                  {row.pickupId} - {row.merchantName || row.merchant_name}
                </option>
              ))}
            </select>
          </div>
          {notice && (
            <div className="mt-6 flex items-center gap-2 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-5 py-4 text-[13px] font-bold text-[#22c55e]">
              <CheckCircle2 className="shrink-0" size={18} /> <span>{notice}</span>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col h-[600px] overflow-hidden">
            <h2 className="text-xl font-black text-white mb-6 border-b border-[#1a3a5c] pb-4"><span>{t('Pickup Order Selection', 'ကုန်ပစ္စည်းသွားယူရန် တောင်းဆိုမှု ရွေးချယ်ခြင်း')}</span></h2>
            <div className="flex-1 overflow-auto rounded-xl border border-[#1a3a5c] bg-[#061524]">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-[#081b2e] sticky top-0">
                  <tr>
                    {['Pickup ID', 'Merchant', 'Code', 'Phone', 'Township', 'Parcels', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] border-b border-[#1a3a5c]">
                        <span>{t(h, h === 'Pickup ID' ? 'တောင်းဆိုမှုအမှတ်' : h === 'Merchant' ? 'ကုန်သည်' : h === 'Code' ? 'သင်္ကေတ' : h === 'Phone' ? 'ဖုန်းနံပါတ်' : h === 'Township' ? 'မြို့နယ်' : h === 'Parcels' ? 'အရေအတွက်' : 'အခြေအနေ')}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.pickupId} onClick={() => setSelectedId(row.pickupId)} className={`cursor-pointer transition-colors border-b border-[#1a3a5c]/50 ${selectedId === row.pickupId ? 'bg-[#1a3a5c]/50' : 'hover:bg-[#1a3a5c]/20'}`}>
                      <td className="px-4 py-3 font-mono font-black text-[#f6b84b] text-[13px]"><span>{row.pickupId}</span></td>
                      <td className="px-4 py-3 font-bold text-white text-[13px]"><span>{row.merchantName || row.merchant_name}</span></td>
                      <td className="px-4 py-3 font-bold text-[#38bdf8] text-[13px]"><span>{row.merchantCode || row.merchant_code}</span></td>
                      <td className="px-4 py-3 font-medium text-[#c8dff0] text-[13px]"><span>{row.phone || row.sender_phone}</span></td>
                      <td className="px-4 py-3 font-medium text-[#c8dff0] text-[13px]"><span>{row.township || row.pickup_township}</span></td>
                      <td className="px-4 py-3 font-bold text-white text-[13px]"><span>{row.parcels || row.parcel_count}</span></td>
                      <td className="px-4 py-3"><span className="text-[10px] uppercase font-bold text-[#4d7a9b] bg-[#061524] border border-[#1a3a5c] px-2 py-1 rounded"><span>{row.status}</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? (
            <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl h-[600px] overflow-auto">
              <h2 className="text-xl font-black text-white mb-6 border-b border-[#1a3a5c] pb-4"><span>{t('Register Data', 'မှတ်တမ်း အချက်အလက်များ')}</span></h2>
              <div className="flex flex-col gap-4">
                <Info label={t("Pickup ID", "တောင်းဆိုမှုအမှတ်")} value={selected.pickupId || "-"} />
                <Info label={t("Deliver ID", "ပေးပို့မှုအမှတ်")} value={selected.deliverId || selected.delivery_way_id || "-"} />
                <Info label={t("Invoice No", "ငွေတောင်းခံလွှာ")} value={selected.invoiceNo || selected.invoice_no || "-"} />
                <Info label={t("Waybill No", "လမ်းညွှန်စာရွက်")} value={selected.waybillNo || selected.way_id || "-"} />
                <Info label={t("Merchant", "ကုန်သည်")} value={`${selected.merchantName || selected.merchant_name || "-"} (${selected.merchantCode || selected.merchant_code || "-"})`} />
                <Info label={t("Pickup Address", "လိပ်စာ")} value={selected.address || selected.pickup_address || "-"} />
              </div>
            </section>
          ) : null}
        </div>

      </div>
    </div>
  );
}

function Info({ label, value }: { label: string | React.ReactNode; value: string }) {
  return (
    <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-1">{label}</div>
      <div className="break-words font-black text-white text-[13px]"><span>{value}</span></div>
    </div>
  );
}