import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type AmountEntryType =
  | "ITEM_PRICE_PLUS_DECLARED_DELIVERY"
  | "TOTAL_AMOUNT_INCLUDING_DELIVERY"
  | "DELIVERY_CHARGE_ONLY"
  | "EXACT_COLLECTION_AMOUNT"
  | "ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT";

export type CustomerTier = "STANDARD" | "ROYAL" | "COMMITMENT";

export type ParcelFinancialInputV2 = {
  customer_tier: CustomerTier;
  amount_entry_type: AmountEntryType;
  item_price: number;
  delivery_charges: number | null;
  merchant_stated_total_amount: number | null;
  additional_customer_charge: number;
  cbm_surcharge: number;
  other_surcharge: number;
  merchant_payable_charges: number;
  other_merchant_credits: number;
};

export type ParcelFinancialQuoteV2 = Record<string, unknown> & {
  validation_status?: "OK" | "REVIEW" | "ERROR";
  validation_message?: string;
  base_tariff?: number;
  included_kg?: number;
  chargeable_weight_kg?: number;
  extra_kg?: number;
  weight_surcharge?: number;
  gross_system_delivery_charge?: number;
  commitment_refund?: number;
  net_system_delivery_charge?: number;
  effective_declared_delivery_charge?: number | null;
  cod_amount?: number;
  delivery_difference?: number | null;
  merchant_settlement_adjustment?: number | null;
  merchant_final_settlement_amount?: number | null;
  settlement_direction?: string;
  resolved_customer_tier?: CustomerTier;
  backend_monthly_ways?: number;
};

type Props = {
  merchantId: string;
  township: string;
  actualWeightKg: number;
  value: ParcelFinancialInputV2;
  quote?: ParcelFinancialQuoteV2 | null;
  disabled?: boolean;
  onChange: (value: ParcelFinancialInputV2) => void;
  onQuote: (quote: ParcelFinancialQuoteV2 | null) => void;
};

const amountTypes: Array<{ value: AmountEntryType; label: string }> = [
  { value: "ITEM_PRICE_PLUS_DECLARED_DELIVERY", label: "Item Price + Declared Delivery" },
  { value: "TOTAL_AMOUNT_INCLUDING_DELIVERY", label: "Total Amount Including Delivery" },
  { value: "DELIVERY_CHARGE_ONLY", label: "Delivery Charge Only" },
  { value: "EXACT_COLLECTION_AMOUNT", label: "Exact Collection Amount" },
  { value: "ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT", label: "Item Price Only — Delivery Paid by Merchant" },
];

const money = (value: unknown) => `${Number(value || 0).toLocaleString("en-US")} MMK`;
const inputClass = "w-full rounded-lg border border-[#1a3a5c] bg-[#061524] px-2 py-2 text-xs text-[#eef8ff] outline-none focus:border-[#f6b84b]";

export default function ParcelFinancialV2Editor({
  merchantId,
  township,
  actualWeightKg,
  value,
  quote,
  disabled,
  onChange,
  onQuote,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const payloadKey = useMemo(
    () => JSON.stringify({ merchantId, township, actualWeightKg, value }),
    [merchantId, township, actualWeightKg, value],
  );

  useEffect(() => {
    if (!township || disabled) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const { data, error: rpcError } = await supabase.rpc("be_data_entry_financial_quote_v2", {
        p_merchant_id: merchantId || null,
        p_township: township,
        p_customer_tier: value.customer_tier,
        p_amount_entry_type: value.amount_entry_type,
        p_item_price: Number(value.item_price || 0),
        p_delivery_charges: value.delivery_charges,
        p_merchant_stated_total_amount: value.merchant_stated_total_amount,
        p_additional_customer_charge: Number(value.additional_customer_charge || 0),
        p_cbm_surcharge: Number(value.cbm_surcharge || 0),
        p_other_surcharge: Number(value.other_surcharge || 0),
        p_merchant_payable_charges: Number(value.merchant_payable_charges || 0),
        p_other_merchant_credits: Number(value.other_merchant_credits || 0),
        p_actual_weight_kg: Number(actualWeightKg || 0),
      });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        onQuote(null);
      } else {
        onQuote((data || null) as ParcelFinancialQuoteV2 | null);
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payloadKey, disabled]);

  const setNumber = (key: keyof ParcelFinancialInputV2, raw: string, nullable = false) => {
    const next = raw === "" && nullable ? null : Math.max(0, Number(raw || 0));
    onChange({ ...value, [key]: next });
  };

  const showDeclared = ["ITEM_PRICE_PLUS_DECLARED_DELIVERY", "DELIVERY_CHARGE_ONLY"].includes(value.amount_entry_type);
  const showTotal = ["TOTAL_AMOUNT_INCLUDING_DELIVERY", "EXACT_COLLECTION_AMOUNT"].includes(value.amount_entry_type);
  const showItem = value.amount_entry_type !== "DELIVERY_CHARGE_ONLY";
  const status = quote?.validation_status;

  return (
    <section className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3 text-[#eef8ff]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-[#f6b84b]">Collection & Settlement</div>
          <div className="text-[10px] text-[#7ea9c6]">Customer collection and company tariff remain separate.</div>
        </div>
        {loading ? <Loader2 className="animate-spin text-[#38bdf8]" size={17} /> : <Calculator size={17} className="text-[#38bdf8]" />}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="text-[10px] text-[#9cc2d9]">Customer Tier
          <select className={inputClass} value={value.customer_tier} disabled={disabled}
            onChange={(e) => onChange({ ...value, customer_tier: e.target.value as CustomerTier })}>
            <option value="STANDARD">STANDARD</option><option value="ROYAL">ROYAL</option><option value="COMMITMENT">COMMITMENT</option>
          </select>
        </label>
        <label className="col-span-2 text-[10px] text-[#9cc2d9]">Amount Entry Type
          <select className={inputClass} value={value.amount_entry_type} disabled={disabled}
            onChange={(e) => onChange({ ...value, amount_entry_type: e.target.value as AmountEntryType })}>
            {amountTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-[#9cc2d9]">Backend Monthly Ways
          <div className={`${inputClass} text-[#38bdf8]`}>{Number(quote?.backend_monthly_ways || 0).toLocaleString("en-US")}</div>
        </label>

        {showItem && <label className="text-[10px] text-[#9cc2d9]">COD Item Price
          <input className={inputClass} type="number" min="0" value={value.item_price} disabled={disabled}
            onChange={(e) => setNumber("item_price", e.target.value)} />
        </label>}
        {showDeclared && <label className="text-[10px] text-[#9cc2d9]">Merchant-Declared Delivery
          <input className={inputClass} type="number" min="0" value={value.delivery_charges ?? ""} disabled={disabled}
            onChange={(e) => setNumber("delivery_charges", e.target.value, true)} />
        </label>}
        {showTotal && <label className="text-[10px] text-[#9cc2d9]">Merchant-Stated Total
          <input className={inputClass} type="number" min="0" value={value.merchant_stated_total_amount ?? ""} disabled={disabled}
            onChange={(e) => setNumber("merchant_stated_total_amount", e.target.value, true)} />
        </label>}
        <label className="text-[10px] text-[#9cc2d9]">Additional Customer Charge
          <input className={inputClass} type="number" min="0" value={value.additional_customer_charge} disabled={disabled}
            onChange={(e) => setNumber("additional_customer_charge", e.target.value)} />
        </label>
        <label className="text-[10px] text-[#9cc2d9]">CBM Surcharge
          <input className={inputClass} type="number" min="0" value={value.cbm_surcharge} disabled={disabled}
            onChange={(e) => setNumber("cbm_surcharge", e.target.value)} />
        </label>
        <label className="text-[10px] text-[#9cc2d9]">Other Company Surcharge
          <input className={inputClass} type="number" min="0" value={value.other_surcharge} disabled={disabled}
            onChange={(e) => setNumber("other_surcharge", e.target.value)} />
        </label>
        <label className="text-[10px] text-[#9cc2d9]">Merchant-Payable Charges
          <input className={inputClass} type="number" min="0" value={value.merchant_payable_charges} disabled={disabled}
            onChange={(e) => setNumber("merchant_payable_charges", e.target.value)} />
        </label>
        <label className="text-[10px] text-[#9cc2d9]">Other Merchant Credits
          <input className={inputClass} type="number" min="0" value={value.other_merchant_credits} disabled={disabled}
            onChange={(e) => setNumber("other_merchant_credits", e.target.value)} />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Base Tariff" value={money(quote?.base_tariff)} />
        <Metric label="Net System Delivery" value={money(quote?.net_system_delivery_charge)} />
        <Metric label="Total to Collect" value={money(quote?.cod_amount)} prominent />
        <Metric label="Merchant Settlement" value={quote?.merchant_final_settlement_amount == null ? "Pending breakdown" : money(quote.merchant_final_settlement_amount)} />
        <Metric label="Chargeable / Extra KG" value={`${Number(quote?.chargeable_weight_kg || 0)} / ${Number(quote?.extra_kg || 0)}`} />
        <Metric label="Weight Surcharge" value={money(quote?.weight_surcharge)} />
        <Metric label="Delivery Difference" value={quote?.delivery_difference == null ? "—" : `${Number(quote.delivery_difference) >= 0 ? "+" : ""}${money(quote.delivery_difference)}`} />
        <Metric label="Direction" value={String(quote?.settlement_direction || "—").replaceAll("_", " ")} />
      </div>

      {(error || quote?.validation_message) && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border p-2 text-xs ${status === "OK" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : status === "REVIEW" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
          {status === "OK" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{error || quote?.validation_message}</span>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return <div className={`rounded-lg border p-2 ${prominent ? "border-[#f6b84b] bg-[#f6b84b]/10" : "border-[#1a3a5c] bg-[#061524]"}`}>
    <div className="text-[9px] uppercase tracking-wider text-[#7ea9c6]">{label}</div>
    <div className={`mt-1 text-xs font-black ${prominent ? "text-[#f6b84b]" : "text-[#eef8ff]"}`}>{value}</div>
  </div>;
}
