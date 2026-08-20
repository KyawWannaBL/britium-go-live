import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FilePlus2,
  Loader2,
  PackagePlus,
  RefreshCw,
  Save,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  HIGHWAY_STATIONS,
  INTEGRATED_MASTER_BUILD,
  resolveFulfillmentRoute,
  type CustomerTier,
  type HighwayStationCode,
} from "@/lib/integratedMasterSpec";

type AmountEntryType =
  | "ITEM_PRICE_PLUS_DECLARED_DELIVERY"
  | "TOTAL_AMOUNT_INCLUDING_DELIVERY"
  | "DELIVERY_CHARGE_ONLY"
  | "EXACT_COLLECTION_AMOUNT"
  | "ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT";

type FormState = {
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id: string;
  merchant_id: string;
  merchant_code: string;
  recipient_name: string;
  recipient_phone: string;
  township: string;
  zone_code: string;
  delivery_address: string;
  weight_kg: number;
  customer_tier: CustomerTier;
  service_type: "STANDARD_DELIVERY" | "HIGHWAY_STATION_DROP_OFF";
  highway_station_code: HighwayStationCode | "";
  amount_entry_type: AmountEntryType;
  item_price: number;
  delivery_charges: number | null;
  merchant_stated_total_amount: number | null;
  additional_customer_charge: number;
  cbm_surcharge: number;
  other_surcharge: number;
  merchant_payable_charges: number;
  other_merchant_credits: number;
  remarks: string;
};

type Quote = Record<string, unknown> & {
  validation_status?: string;
  validation_message?: string;
  cod_amount?: number;
  net_system_delivery_charge?: number;
  delivery_difference?: number | null;
  merchant_final_settlement_amount?: number | null;
  settlement_direction?: string;
  base_tariff?: number;
  weight_surcharge?: number;
  chargeable_weight_kg?: number;
  extra_kg?: number;
  managing_branch_code?: string;
  fulfillment_mode?: string;
  provider_code?: string;
  routing_reason?: string;
};

const emptyForm: FormState = {
  pickup_id: "",
  parcel_sequence: 1,
  delivery_way_id: "",
  merchant_id: "",
  merchant_code: "",
  recipient_name: "",
  recipient_phone: "",
  township: "",
  zone_code: "YGN",
  delivery_address: "",
  weight_kg: 0,
  customer_tier: "STANDARD",
  service_type: "STANDARD_DELIVERY",
  highway_station_code: "",
  amount_entry_type: "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
  item_price: 0,
  delivery_charges: null,
  merchant_stated_total_amount: null,
  additional_customer_charge: 0,
  cbm_surcharge: 0,
  other_surcharge: 0,
  merchant_payable_charges: 0,
  other_merchant_credits: 0,
  remarks: "",
};

const amountTypes: Array<{ value: AmountEntryType; label: string }> = [
  { value: "ITEM_PRICE_PLUS_DECLARED_DELIVERY", label: "Item Price + Declared Delivery" },
  { value: "TOTAL_AMOUNT_INCLUDING_DELIVERY", label: "Total Amount Including Delivery" },
  { value: "DELIVERY_CHARGE_ONLY", label: "Delivery Charge Only" },
  { value: "EXACT_COLLECTION_AMOUNT", label: "Exact Collection Amount" },
  { value: "ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT", label: "Item Price Only - Merchant Pays Delivery" },
];

const input = "w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2.5 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b] disabled:opacity-55";
const money = (value: unknown) => `${Number(value || 0).toLocaleString("en-US")} MMK`;

export default function DataEntryFinancialV2Page() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const localRoute = useMemo(
    () => resolveFulfillmentRoute({ zoneCode: form.zone_code, destination: form.township, serviceType: form.service_type }),
    [form.zone_code, form.township, form.service_type],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setQuote(null);
    setMessage("");
  };

  const payload = () => ({
    ...form,
    delivery_charges: form.delivery_charges,
    merchant_stated_total_amount: form.merchant_stated_total_amount,
    actual_weight_kg: form.weight_kg,
  });

  async function calculate() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_data_entry_financial_v2_calculate", {
        p_payload: payload(),
      });
      if (rpcError) throw rpcError;
      const result = (data?.data || data || null) as Quote | null;
      setQuote(result);
      if (String(result?.validation_status || "") === "ERROR") {
        setError(String(result?.validation_message || "Financial validation failed."));
      } else {
        setMessage("Backend calculation completed. The server result is the financial source of truth.");
      }
    } catch (cause: any) {
      setError(cause?.message || "Unable to calculate the Financial V2 record. Deploy the V4.1 backend migration first.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!quote) {
      setError("Calculate the parcel before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const requestId = crypto.randomUUID();
      const { data, error: rpcError } = await (supabase as any).rpc("be_data_entry_financial_v2_save", {
        p_payload: payload(),
        p_request_id: requestId,
      });
      if (rpcError) throw rpcError;
      const result = data?.data || data;
      setQuote((result?.quote || result) as Quote);
      setMessage(`Financial V2 parcel saved. Request: ${requestId}`);
    } catch (cause: any) {
      setError(cause?.message || "Unable to save the Financial V2 parcel.");
    } finally {
      setSaving(false);
    }
  }

  async function createWaybill() {
    if (!form.pickup_id || !form.delivery_way_id) {
      setError("Pickup ID and server-issued Way ID are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_data_entry_financial_v2_create_waybill", {
        p_pickup_id: form.pickup_id,
        p_way_ids: [form.delivery_way_id],
        p_request_id: crypto.randomUUID(),
      });
      if (rpcError) throw rpcError;
      setMessage(`Waybill request completed: ${String(data?.waybill_no || data?.data?.waybill_no || "created")}`);
    } catch (cause: any) {
      setError(cause?.message || "Unable to create the waybill.");
    } finally {
      setSaving(false);
    }
  }

  const showDeclared = ["ITEM_PRICE_PLUS_DECLARED_DELIVERY", "DELIVERY_CHARGE_ONLY"].includes(form.amount_entry_type);
  const showTotal = ["TOTAL_AMOUNT_INCLUDING_DELIVERY", "EXACT_COLLECTION_AMOUNT"].includes(form.amount_entry_type);

  return (
    <div className="space-y-6 text-[#eef8ff]" data-build={INTEGRATED_MASTER_BUILD}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a3a5c] pb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#f6b84b]"><PackagePlus size={15}/>Financial V2</div>
          <h1 className="mt-2 text-3xl font-black">Data Entry</h1>
          <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[#8fb4d0]">Backend-authoritative collection, tariff, routing, merchant settlement, highway drop-off and outsourced-fulfillment registration.</p>
        </div>
        <div className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-3 text-[11px] text-[#8fb4d0]">Schema: <strong className="text-[#eef8ff]">FINANCIAL_V2_SCHEMA_2026_07_31</strong></div>
      </header>

      <Notice />

      <Section title="1. Parcel Identity" icon={<FilePlus2 size={15}/>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Pickup ID"><input className={input} value={form.pickup_id} onChange={(e)=>set("pickup_id", e.target.value)}/></Field>
          <Field label="Parcel Sequence"><input className={input} type="number" min={1} value={form.parcel_sequence} onChange={(e)=>set("parcel_sequence", Math.max(1, Number(e.target.value || 1)))}/></Field>
          <Field label="Way ID - Server Issued"><input className={`${input} text-[#38bdf8]`} value={form.delivery_way_id} onChange={(e)=>set("delivery_way_id", e.target.value)} placeholder="Assigned by backend"/></Field>
          <Field label="Merchant ID"><input className={input} value={form.merchant_id} onChange={(e)=>set("merchant_id", e.target.value)}/></Field>
          <Field label="Merchant Code"><input className={input} value={form.merchant_code} onChange={(e)=>set("merchant_code", e.target.value)}/></Field>
        </div>
      </Section>

      <Section title="2. Recipient & Address">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Recipient"><input className={input} value={form.recipient_name} onChange={(e)=>set("recipient_name", e.target.value)}/></Field>
          <Field label="Phone"><input className={input} value={form.recipient_phone} onChange={(e)=>set("recipient_phone", e.target.value)}/></Field>
          <Field label="Township / Destination"><input className={input} value={form.township} onChange={(e)=>set("township", e.target.value)}/></Field>
          <Field label="Zone Code"><select className={input} value={form.zone_code} onChange={(e)=>set("zone_code", e.target.value)}><option>YGN</option><option>MDY</option><option>NPT</option><option>OTHER</option></select></Field>
          <Field label="Complete Address" wide><textarea className={input} rows={2} value={form.delivery_address} onChange={(e)=>set("delivery_address", e.target.value)}/></Field>
        </div>
      </Section>

      <Section title="3. Service, Weight & Routing" icon={<Truck size={15}/>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Service Type"><select className={input} value={form.service_type} onChange={(e)=>set("service_type", e.target.value as FormState["service_type"])}><option value="STANDARD_DELIVERY">Standard Delivery</option><option value="HIGHWAY_STATION_DROP_OFF">Highway Station Drop Off</option></select></Field>
          {form.service_type === "HIGHWAY_STATION_DROP_OFF" ? <Field label="Highway Station"><select className={input} value={form.highway_station_code} onChange={(e)=>set("highway_station_code", e.target.value as HighwayStationCode)}><option value="">Select station</option>{HIGHWAY_STATIONS.map((station)=><option key={station.code} value={station.code}>{station.label} - {money(station.baseRateMmk)}</option>)}</select></Field> : null}
          <Field label="Actual Weight KG"><input className={input} type="number" min={0} step="0.1" value={form.weight_kg} onChange={(e)=>set("weight_kg", Math.max(0, Number(e.target.value || 0)))}/></Field>
          <Field label="Customer Tier"><select className={input} value={form.customer_tier} onChange={(e)=>set("customer_tier", e.target.value as CustomerTier)}><option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option></select></Field>
          <Metric label="Proposed Route" value={`${quote?.fulfillment_mode || localRoute.fulfillmentMode} / ${quote?.provider_code || localRoute.providerCode}`} sub={String(quote?.routing_reason || localRoute.reason)}/>
        </div>
      </Section>

      <Section title="4. Collection Instructions & Merchant Settlement" icon={<Calculator size={15}/>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Amount Entry Type" wide><select className={input} value={form.amount_entry_type} onChange={(e)=>set("amount_entry_type", e.target.value as AmountEntryType)}>{amountTypes.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          {form.amount_entry_type !== "DELIVERY_CHARGE_ONLY" ? <MoneyField label="Item Price" value={form.item_price} onChange={(v)=>set("item_price", v)}/> : null}
          {showDeclared ? <NullableMoneyField label="Merchant-Declared Delivery" value={form.delivery_charges} onChange={(v)=>set("delivery_charges", v)}/> : null}
          {showTotal ? <NullableMoneyField label="Merchant-Stated Total" value={form.merchant_stated_total_amount} onChange={(v)=>set("merchant_stated_total_amount", v)}/> : null}
          <MoneyField label="Additional Customer Charge" value={form.additional_customer_charge} onChange={(v)=>set("additional_customer_charge", v)}/>
          <MoneyField label="CBM Surcharge" value={form.cbm_surcharge} onChange={(v)=>set("cbm_surcharge", v)}/>
          <MoneyField label="Other Company Surcharge" value={form.other_surcharge} onChange={(v)=>set("other_surcharge", v)}/>
          <MoneyField label="Merchant-Payable Charges" value={form.merchant_payable_charges} onChange={(v)=>set("merchant_payable_charges", v)}/>
          <MoneyField label="Other Merchant Credits" value={form.other_merchant_credits} onChange={(v)=>set("other_merchant_credits", v)}/>
          <Field label="Remarks" wide><textarea className={input} rows={2} value={form.remarks} onChange={(e)=>set("remarks", e.target.value)}/></Field>
        </div>
      </Section>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="font-black uppercase tracking-wider text-[#f6b84b]">Backend Calculation Result</div><button type="button" onClick={()=>void calculate()} disabled={loading||saving} className="action primary">{loading?<Loader2 size={15} className="animate-spin"/>:<RefreshCw size={15}/>}Calculate</button></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Metric label="Base Tariff" value={money(quote?.base_tariff)}/><Metric label="Weight Surcharge" value={money(quote?.weight_surcharge)}/><Metric label="Chargeable / Extra KG" value={`${Number(quote?.chargeable_weight_kg||0)} / ${Number(quote?.extra_kg||0)}`}/><Metric label="Company Delivery" value={money(quote?.net_system_delivery_charge)}/><Metric label="Total to Collect" value={money(quote?.cod_amount)} accent/><Metric label="Delivery Difference" value={quote?.delivery_difference==null?"-":money(quote.delivery_difference)}/><Metric label="Direction" value={String(quote?.settlement_direction||"-").replaceAll("_"," ")}/><Metric label="Merchant Settlement" value={quote?.merchant_final_settlement_amount==null?"Pending":money(quote.merchant_final_settlement_amount)}/>
        </div>
        {error ? <Status kind="error" text={error}/> : null}{message ? <Status kind="ok" text={message}/> : null}
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={()=>void save()} disabled={saving||!quote} className="action primary">{saving?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>}Save Financial Record</button><button type="button" onClick={()=>void createWaybill()} disabled={saving||String(quote?.validation_status||"")==="ERROR"} className="action secondary"><FilePlus2 size={15}/>Create Waybill</button><button type="button" onClick={()=>{setForm(emptyForm);setQuote(null);setError("");setMessage("");}} className="action secondary">Clear</button></div>
      </section>

      <style>{`.action{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:10px 16px;font-size:12px;font-weight:900}.action.primary{background:#f6b84b;color:#061524}.action.secondary{border:1px solid #355a78;background:#081b2e;color:#d8ecfa}.action:disabled{opacity:.45;cursor:not-allowed}`}</style>
    </div>
  );
}

function Notice(){return <div className="flex items-start gap-3 rounded-2xl border border-amber-700/60 bg-amber-950/20 p-4 text-[12px] leading-6 text-amber-100"><AlertTriangle size={17} className="mt-1 shrink-0"/><div>The browser submits raw inputs only. COD amount, tariff, routing, delivery difference, settlement direction and merchant settlement are recalculated and stored by the backend. Unknown highway stations and missing partner rates block financial finalization.</div></div>}
function Section({title,icon,children}:{title:string;icon?:ReactNode;children:ReactNode}){return <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><div className="mb-4 flex items-center gap-2 text-[12px] font-black uppercase tracking-widest text-[#f6b84b]">{icon}{title}</div>{children}</section>}
function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){return <label className={`${wide?"md:col-span-2":""} space-y-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7ea9c6]`}>{label}{children}</label>}
function MoneyField({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <Field label={label}><input className={input} type="number" min={0} value={value} onChange={(e)=>onChange(Math.max(0,Number(e.target.value||0)))}/></Field>}
function NullableMoneyField({label,value,onChange}:{label:string;value:number|null;onChange:(v:number|null)=>void}){return <Field label={label}><input className={input} type="number" min={0} value={value??""} onChange={(e)=>onChange(e.target.value===""?null:Math.max(0,Number(e.target.value)))}/></Field>}
function Metric({label,value,sub,accent=false}:{label:string;value:string;sub?:string;accent?:boolean}){return <div className={`rounded-xl border p-3 ${accent?"border-[#f6b84b] bg-[#f6b84b]/10":"border-[#1a3a5c] bg-[#061524]"}`}><div className="text-[9px] font-black uppercase tracking-wider text-[#7ea9c6]">{label}</div><div className={`mt-1 text-[12px] font-black ${accent?"text-[#f6b84b]":"text-[#eef8ff]"}`}>{value}</div>{sub?<div className="mt-1 text-[9px] leading-4 text-[#6f98b8]">{sub}</div>:null}</div>}
function Status({kind,text}:{kind:"ok"|"error";text:string}){return <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-[12px] ${kind==="ok"?"border-emerald-700 bg-emerald-950/25 text-emerald-200":"border-rose-700 bg-rose-950/25 text-rose-200"}`}>{kind==="ok"?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}<span>{text}</span></div>}
