import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Image as ImageIcon, Loader2, Maximize2, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const DATA_ENTRY_FINANCIAL_V2_BUILD = "DATA_ENTRY_FINANCIAL_V2_RESTORED_20260816";
export const DATA_ENTRY_FINANCE_GOVERNANCE_BUILD = "DATA_ENTRY_FINANCE_GOVERNANCE_V4_20260817";
export const PAYMENT_SETTLEMENT_RULE = "EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM";

const AMOUNT_TYPES = [
  "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
  "DELIVERY_CHARGE_ONLY",
  "EXACT_COLLECTION_AMOUNT",
  "OPAQUE_COD_COLLECTION",
] as const;

const COLLECTION_METHOD_MY: Record<AmountType,string> = {
  ITEM_PRICE_PLUS_DECLARED_DELIVERY:"ပစ္စည်းတန်ဖိုး + သတ်မှတ်ထားသော ပို့ဆောင်ခ",
  DELIVERY_CHARGE_ONLY:"ပို့ဆောင်ခသာ",
  EXACT_COLLECTION_AMOUNT:"အတိအကျ ကောက်ခံမည့်ငွေ",
  OPAQUE_COD_COLLECTION:"ခွဲခြမ်းမထားသော COD ကောက်ခံငွေ (ယာယီ)",
};

type AmountType = typeof AMOUNT_TYPES[number];

type Pickup = {
  pickup_id: string;
  merchant_id: string;
  merchant_name: string;
  township: string;
  city: string;
  expected_parcels: number;
  verified_parcels: number;
  pickup_status: string;
  workflow_stage: string;
};

type ParcelRow = {
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id: string;
  proof_url: string;
  recipient_name: string;
  recipient_phone: string;
  township: string;
  delivery_address: string;
  weight_kg: number | "";
  customer_tier: string;
  amount_entry_type: AmountType;
  item_price: number | "";
  delivery_charges: number | "";
  merchant_stated_total_amount: number | "";
  additional_customer_charge: number | "";
  cbm_surcharge: number | "";
  other_surcharge: number | "";
  merchant_payable_charges: number | "";
  other_merchant_credits: number | "";
  remarks: string;
  calculating: boolean;
  checking: boolean;
  calculation: Record<string, any>;
  message: string;
  photoReviewed: boolean;
  photoUnavailableAcknowledged: boolean;
};

const inputClass = "w-full rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]";
const labelClass = "mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[#7aa7c6]";
const serverClass = "rounded-lg border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[12px] text-[#8fd3ff]";

function text(value: unknown): string { return value == null ? "" : String(value); }
function num(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function positiveInt(value: unknown): number { const n = Math.trunc(num(value)); return n > 0 ? n : 0; }
function money(value: unknown): string {
  if (value === "" || value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") + " Ks" : text(value);
}
function requestId(prefix: string): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  return prefix + ":" + id;
}
function normalizePickup(row: any): Pickup | null {
  const pickupId = text(row?.pickup_id || row?.pickup_way_id).trim();
  if (!pickupId) return null;
  return {
    pickup_id: pickupId,
    merchant_id: text(row?.merchant_id || row?.merchant_code).trim().toUpperCase(),
    merchant_name: text(row?.merchant_name).trim(),
    township: text(row?.township).trim(),
    city: text(row?.city).trim(),
    expected_parcels: positiveInt(row?.expected_parcels || row?.parcel_count),
    verified_parcels: positiveInt(row?.verified_parcels || row?.photo_parcels),
    pickup_status: text(row?.pickup_status).trim(),
    workflow_stage: text(row?.workflow_stage).trim(),
  };
}
function proofUrl(row: any): string {
  return text(row?.proof_photo_url || row?.proof_photo_path || row?.photo_url || row?.proof_url).trim();
}
function isExact(type: AmountType) {
  return type === "EXACT_COLLECTION_AMOUNT" || type === "OPAQUE_COD_COLLECTION";
}
function envelope(data: any) {
  if (data && typeof data === "object" && "data" in data) {
    return { ok: data.ok !== false, data: data.data || {}, errors: data.errors || [], warnings: data.warnings || [], raw: data };
  }
  return { ok: true, data: data || {}, errors: [], warnings: [], raw: data };
}
function envelopeMessage(v: any): string {
  const e = Array.isArray(v.errors) ? v.errors.map((x: any) => x?.message).filter(Boolean) : [];
  const w = Array.isArray(v.warnings) ? v.warnings.map((x: any) => x?.message).filter(Boolean) : [];
  return e.join(" ") || w.join(" ") || text(v.data?.validation_message);
}
function payload(row: ParcelRow, pickup: Pickup) {
  const p: Record<string, unknown> = {
    pickup_id: row.pickup_id,
    parcel_sequence: row.parcel_sequence,
    merchant_id: pickup.merchant_id || null,
    recipient_name: row.recipient_name || null,
    recipient_phone: row.recipient_phone || null,
    township: row.township || null,
    delivery_address: row.delivery_address || null,
    weight_kg: row.weight_kg === "" ? null : Number(row.weight_kg),
    customer_tier: row.customer_tier || "STANDARD",
    amount_entry_type: row.amount_entry_type,
    item_price: row.item_price === "" ? null : Number(row.item_price),
    delivery_charges: row.delivery_charges === "" ? null : Number(row.delivery_charges),
    merchant_stated_total_amount: row.merchant_stated_total_amount === "" ? null : Number(row.merchant_stated_total_amount),
    additional_customer_charge: row.additional_customer_charge === "" ? 0 : Number(row.additional_customer_charge),
    cbm_surcharge: row.cbm_surcharge === "" ? 0 : Number(row.cbm_surcharge),
    other_surcharge: row.other_surcharge === "" ? 0 : Number(row.other_surcharge),
    merchant_payable_charges: row.merchant_payable_charges === "" ? 0 : Number(row.merchant_payable_charges),
    other_merchant_credits: row.other_merchant_credits === "" ? 0 : Number(row.other_merchant_credits),
    remarks: row.remarks || null,
  };
  if (isExact(row.amount_entry_type)) { p.item_price = null; p.delivery_charges = null; }
  else if (row.amount_entry_type === "DELIVERY_CHARGE_ONLY") { p.item_price = null; p.merchant_stated_total_amount = null; }
  else if (row.amount_entry_type === "ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT") { p.delivery_charges = null; p.merchant_stated_total_amount = null; }
  else p.merchant_stated_total_amount = null;
  return p;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className={labelClass}>{label}</span>{children}</label>;
}
function MoneyBox({ label, value, highlight = false }: { label: string; value: unknown; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-[#f6b84b]/50 bg-[#f6b84b]/10" : "border-[#1a3a5c] bg-[#061524]"}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[#6f9ab8]">{label}</div>
      <div className={`mt-1 text-[14px] font-black ${highlight ? "text-[#f6b84b]" : "text-[#eef8ff]"}`}>{money(value)}</div>
    </div>
  );
}

function ParcelEditor({ row, index, updateRow, calculate, dryRun }: any) {
  const c = row.calculation || {};
  const type = row.amount_entry_type as AmountType;
  return (
    <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[#f6b84b]">Parcel {row.parcel_sequence}</div>
          <div className="mt-1 text-[12px] text-[#8db4ce]">{row.delivery_way_id || "Delivery Way ID allocated by backend"}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => calculate(index)} disabled={row.calculating} className="inline-flex items-center gap-2 rounded-lg border border-[#3aa7de]/50 bg-[#12314a] px-3 py-2 text-[11px] font-black text-[#8fd3ff] disabled:opacity-50">
            {row.calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />} တွက်ချက်ရန်
          </button>
          <button type="button" onClick={() => dryRun(index)} disabled={
              row.checking ||
              (!row.photoReviewed && !row.photoUnavailableAcknowledged)
            } className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-3 py-2 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">
            {row.checking ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} သိမ်းဆည်းမှု စစ်ဆေးရန်
          </button>
        </div>
      </div>

      {row.proof_url ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3">
          <img src={row.proof_url} alt="Proof" className="h-20 w-28 rounded-lg object-cover" />
          <div className="text-[11px] font-black text-[#68e8bd]"><ImageIcon size={14} className="mr-2 inline" />FIELD PROOF RECEIVED</div>
        </div>
      ) : null}

      <div
        data-photo-review="true"
        className="mb-4 rounded-xl border border-[#f6b84b]/30 bg-[#061524] p-4"
      >
        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">
          <ImageIcon size={14} />
          Photo Review
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#1a3a5c] bg-[#0b2236] p-3 text-[12px] text-[#d8eaf5]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-500"
              checked={row.photoReviewed}
              onChange={(event) =>
                updateRow(index, {
                  photoReviewed: event.target.checked,
                })
              }
            />
            <span>
              <b>ဓာတ်ပုံအထောက်အထား စစ်ဆေးပြီး</b>
              <span className="mt-1 block text-[10px] text-[#789eb9]">
                I checked the Rider / Driver parcel photo against this parcel.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#1a3a5c] bg-[#0b2236] p-3 text-[12px] text-[#d8eaf5]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-amber-500"
              checked={row.photoUnavailableAcknowledged}
              onChange={(event) =>
                updateRow(index, {
                  photoUnavailableAcknowledged: event.target.checked,
                })
              }
            />
            <span>
              <b>Image unavailable — acknowledge proof reference</b>
              <span className="mt-1 block text-[10px] text-[#789eb9]">
                Use only when the stored proof reference exists but the image cannot be displayed.
              </span>
            </span>
          </label>
        </div>

        {!row.photoReviewed && !row.photoUnavailableAcknowledged ? (
          <div className="mt-3 rounded-lg border border-[#f6b84b]/25 bg-[#f6b84b]/10 px-3 py-2 text-[10px] text-[#ffd98a]">
            Photo acknowledgement is required before Validate Save.
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="လက်ခံသူအမည်"><input className={inputClass} value={row.recipient_name} onChange={(e) => updateRow(index,{recipient_name:e.target.value})}/></Field>
        <Field label="လက်ခံသူဖုန်း"><input className={inputClass} value={row.recipient_phone} onChange={(e) => updateRow(index,{recipient_phone:e.target.value})}/></Field>
        <Field label="မြို့နယ်"><input className={inputClass} value={row.township} onChange={(e) => updateRow(index,{township:e.target.value})}/></Field>
        <Field label="အမှန်တကယ်အလေးချိန် (kg)"><input type="number" step="0.01" className={inputClass} value={row.weight_kg} onChange={(e)=>updateRow(index,{weight_kg:e.target.value===""?"":Number(e.target.value)})}/></Field>
        <Field label="လက်ခံသူလိပ်စာ"><textarea rows={2} className={inputClass} value={row.delivery_address} onChange={(e)=>updateRow(index,{delivery_address:e.target.value})}/></Field>
        <Field label="ကုန်သည်အဆင့်">
          <select className={inputClass} value={row.customer_tier} onChange={(e)=>updateRow(index,{customer_tier:e.target.value})}>
            <option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option>
          </select>
        </Field>
        <Field label="ငွေကောက်ခံပုံ">
          <select className={inputClass} value={row.amount_entry_type} onChange={(e)=> {
            const next=e.target.value as AmountType;
            const patch:any={amount_entry_type:next};
            if(isExact(next)){patch.item_price="";patch.delivery_charges="";}
            else if(next==="DELIVERY_CHARGE_ONLY"){patch.item_price="";patch.merchant_stated_total_amount="";}
            else if(next==="ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT"){patch.delivery_charges="";patch.merchant_stated_total_amount="";}
            else patch.merchant_stated_total_amount="";
            updateRow(index,patch);
          }}>
            {AMOUNT_TYPES.map(v=><option key={v} value={v}>{COLLECTION_METHOD_MY[v]}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-[#f6b84b]/25 bg-[#1d2b37] p-4">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">ငွေကောက်ခံရန် ညွှန်ကြားချက်</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {!isExact(type) && type!=="DELIVERY_CHARGE_ONLY" ? <Field label="ပစ္စည်းတန်ဖိုး"><input type="number" className={inputClass} value={row.item_price} onChange={(e)=>updateRow(index,{item_price:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}
          {!isExact(type) && type!=="ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT" ? <Field label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ"><input type="number" className={inputClass} value={row.delivery_charges} onChange={(e)=>updateRow(index,{delivery_charges:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}
          {isExact(type) ? <Field label="အတိအကျ / COD စုစုပေါင်းကောက်ခံငွေ"><input type="number" className={inputClass} value={row.merchant_stated_total_amount} onChange={(e)=>updateRow(index,{merchant_stated_total_amount:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}
          <Field label="ဖောက်သည်ထပ်ဆောင်းကောက်ခံငွေ"><input type="number" className={inputClass} value={row.additional_customer_charge} onChange={(e)=>updateRow(index,{additional_customer_charge:e.target.value===""?"":Number(e.target.value)})}/></Field>
          <Field label="CBM ထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.cbm_surcharge} onChange={(e)=>updateRow(index,{cbm_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>
          <Field label="အခြားထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.other_surcharge} onChange={(e)=>updateRow(index,{other_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#3aa7de]/25 bg-[#071b2b] p-4">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#64c8ff]">နောက်ခံစနစ် ငွေရှင်းတမ်း</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <MoneyBox label="လက်ခံသူထံမှ ကောက်ခံငွေ / COD" value={c.cod_amount} highlight />
          <MoneyBox label="အခြေခံပို့ဆောင်ခ" value={c.base_tariff} />
          <MoneyBox label="အလေးချိန်ထပ်ဆောင်းခ" value={c.weight_surcharge} />
          <MoneyBox label="Britium ရပိုင်ခွင့်" value={c.net_system_delivery_charge} highlight />
          <MoneyBox label="ပို့ဆောင်ခကွာခြားချက်" value={c.delivery_difference} />
          <MoneyBox label="ကုန်သည်နောက်ဆုံးရှင်းတမ်း" value={c.merchant_final_settlement_amount} highlight />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={serverClass}>ငွေရှင်းတမ်းဦးတည်ချက်: <b>{text(c.settlement_direction)||"—"}</b></div>
          <div className={serverClass}>ကုန်သည်ပြင်ဆင်ငွေ: <b>{money(c.merchant_settlement_adjustment)}</b></div>
          <div className={serverClass}>စစ်ဆေးမှု: <b>{text(c.validation_status)||"NOT တွက်ချက်ရန်D"}</b></div>
        </div>
      </div>

      {row.message ? <div className="mt-3 rounded-lg border border-[#3aa7de]/30 bg-[#061524] p-3 text-[11px] text-[#9fd7f6]">{row.message}</div>:null}
    </section>
  );
}

export default function DataEntryFinancialV2Page() {
  const [mutationMode,setMutationMode]=useState("MUTATION_SHADOW");
  const [pickups,setPickups]=useState<Pickup[]>([]);
  const [selectedPickupId,setSelectedPickupId]=useState("");
  const [rows,setRows]=useState<ParcelRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadingRows,setLoadingRows]=useState(false);
  const [message,setMessage]=useState("");
  const [fullRegistration,setFullRegistration]=useState(false);

  const selectedPickup=useMemo(()=>pickups.find(p=>p.pickup_id===selectedPickupId)||null,[pickups,selectedPickupId]);

  function updateRow(index:number,patch:Partial<ParcelRow>){
    setRows(current=>current.map((row,i)=>i===index?{...row,...patch,message:patch.message??""}:row));
  }

  async function loadStartup(){
    setLoading(true); setMessage("");
    try{
      const schemaResponse=await (supabase as any).rpc("be_data_entry_financial_v2_schema");
      if(schemaResponse.error) throw schemaResponse.error;
      const s=envelope(schemaResponse.data);
      if(!s.ok) throw new Error(envelopeMessage(s)||"Financial V2 schema unavailable.");
      setMutationMode(text(s.raw?.mutation_mode||s.data?.mutation_mode)||"MUTATION_SHADOW");

      let p=await (supabase as any).rpc("be_data_entry_pickup_list_web_v16",{p_limit:200});
      if(p.error) p=await (supabase as any).rpc("be_data_entry_pickup_list_web_v16");
      if(p.error) throw p.error;
      const source=Array.isArray(p.data)?p.data:(Array.isArray(p.data?.data)?p.data.data:[]);
      const normalized=source.map(normalizePickup).filter(Boolean) as Pickup[];
      setPickups(normalized);
      setSelectedPickupId(current=>current&&normalized.some(x=>x.pickup_id===current)?current:(normalized[0]?.pickup_id||""));
    }catch(error:any){setMessage(error?.message||"Unable to load Financial V2.");}
    finally{setLoading(false);}
  }

  async function loadPickupRows(pickup:Pickup){
    setLoadingRows(true); setMessage("");
    try{
      const proofSources = [
        "be_v_data_entry_parcel_proofs",
        "be_v_data_entry_parcel_rows",
        "be_pickup_parcel_verifications",
      ];

      let proofs: any[] = [];
      let lastProofError = "";

      for (const source of proofSources) {
        const response = await (supabase as any)
          .from(source)
          .select("*")
          .eq("pickup_id", pickup.pickup_id)
          .order("parcel_sequence", { ascending: true });

        if (response.error) {
          lastProofError = `${source}: ${response.error.message}`;
          continue;
        }

        if (Array.isArray(response.data) && response.data.length) {
          proofs = response.data;
          console.info(
            `Data Entry evidence: ${proofs.length} row(s) loaded from ${source}`
          );
          break;
        }
      }

      if (!proofs.length && lastProofError) {
        console.warn("No Data Entry proof rows loaded.", lastProofError);
      }
      const count=pickup.expected_parcels||pickup.verified_parcels||proofs.reduce((m:number,x:any)=>Math.max(m,positiveInt(x.parcel_sequence)),0);
      if(!count) throw new Error("This pickup has no authoritative parcel count. Registration is blocked.");
      setRows(Array.from({length:count},(_,offset)=>{
        const sequence=offset+1;
        const proof=proofs.find((x:any)=>positiveInt(x.parcel_sequence)===sequence)||{};
        return {
          pickup_id:pickup.pickup_id,
          parcel_sequence:sequence,
          delivery_way_id:text(proof.delivery_way_id),
          proof_url:proofUrl(proof),
          recipient_name:text(proof.recipient_name),
          recipient_phone:text(proof.recipient_phone||proof.contact_no_1),
          township:text(proof.township||pickup.township),
          delivery_address:text(proof.delivery_address||proof.recipient_address),
          weight_kg:proof.actual_weight_kg??proof.parcel_weight_kg??proof.weight_kg??"",
          customer_tier:text(proof.customer_tier||"STANDARD").toUpperCase(),
          amount_entry_type:(text(proof.amount_entry_type) as AmountType)||"ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          item_price:proof.item_price??"",
          delivery_charges:proof.delivery_charges??proof.delivery_fee??"",
          merchant_stated_total_amount:proof.merchant_stated_total_amount??"",
          additional_customer_charge:proof.additional_customer_charge??0,
          cbm_surcharge:proof.cbm_surcharge??0,
          other_surcharge:proof.other_surcharge??0,
          merchant_payable_charges:proof.merchant_payable_charges??0,
          other_merchant_credits:proof.other_merchant_credits??0,
          remarks:text(proof.remarks||proof.remark),
          calculating:false,checking:false,calculation:{},message:"",
          photoReviewed:false,
          photoUnavailableAcknowledged:false
        } as ParcelRow;
      }));
    }catch(error:any){setRows([]);setMessage(error?.message||"Unable to load pickup proof rows.");}
    finally{setLoadingRows(false);}
  }

  async function calculateRow(index:number){
    if(!selectedPickup) return;
    const row=rows[index]; if(!row) return;
    updateRow(index,{calculating:true,calculation:{},message:""});
    try{
      const r=await (supabase as any).rpc("be_data_entry_financial_v2_calculate",{p_payload:payload(row,selectedPickup)});
      if(r.error) throw r.error;
      const e=envelope(r.data);
      updateRow(index,{calculating:false,calculation:e.data,message:e.ok?"Calculation completed.":(envelopeMessage(e)||"Calculation failed.")});
    }catch(error:any){updateRow(index,{calculating:false,message:error?.message||"Backend calculation failed."});}
  }

  async function dryRunRow(index:number){
    if(!selectedPickup) return;
    const row=rows[index]; if(!row) return;

    if (!row.photoReviewed && !row.photoUnavailableAcknowledged) {
      updateRow(index, {
        message:
          "Review the parcel photo or acknowledge that the stored proof image is unavailable before Validate Save.",
      });
      return;
    }

    updateRow(index,{checking:true,message:""});
    try{
      const r=await (supabase as any).rpc("be_data_entry_financial_v2_save",{p_payload:{...payload(row,selectedPickup),request_id:requestId("FINANCIAL_V2_DRY_RUN"),dry_run:true,source_file_name:"PORTAL_FINANCIAL_V2_RESTORED",reason:"PORTAL_FINANCIAL_V2_DRY_RUN",destination:selectedPickup.city||null}});
      if(r.error) throw r.error;
      const e=envelope(r.data);
      updateRow(index,{checking:false,calculation:{...row.calculation,...e.data},message:e.ok?"Save validation / dry-run passed.":(envelopeMessage(e)||"Save validation failed.")});
    }catch(error:any){updateRow(index,{checking:false,message:error?.message||"Save validation failed."});}
  }

  async function calculateAll(){ for(let i=0;i<rows.length;i+=1) await calculateRow(i); }

  useEffect(()=>{void loadStartup();},[]);
  useEffect(()=>{if(selectedPickup) void loadPickupRows(selectedPickup); else setRows([]);},[selectedPickupId]);

  if(loading) return <div className="flex min-h-[70vh] items-center justify-center bg-[#061524] text-[#eef8ff]"><Loader2 className="mr-3 animate-spin text-[#f6b84b]"/>Loading Financial V2…</div>;

  const workspace=(
    <div className="space-y-4">
      {loadingRows?<div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-10 text-center"><Loader2 className="mr-3 inline animate-spin text-[#f6b84b]"/>Loading pickup proof rows…</div>:
      rows.map((row,index)=><ParcelEditor key={row.pickup_id+":"+row.parcel_sequence} row={row} index={index} updateRow={updateRow} calculate={calculateRow} dryRun={dryRunRow}/>)}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#061524] px-4 py-5 text-[#eef8ff]">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">Data Entry · Financial V2</div>
              <h1 className="mt-2 text-2xl font-black">Pickup စာရင်းသွင်းခြင်းနှင့် ကုန်သည်ငွေရှင်းတမ်း</h1>
              <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#92b7cf]">Backend-authoritative receiver collection, Britium ရပိုင်ခွင့်, delivery difference and merchant final settlement. Live financial persistence remains disabled while the backend mutation gate is shadow.</p>
            </div>
            <div className="rounded-lg border border-[#3aa7de]/30 bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">{mutationMode}</div>
          </div>
        </header>

        {message?<div className="rounded-xl border border-[#ff6b6b]/35 bg-[#3a1e28] p-3 text-[12px] text-[#ff9aa2]"><AlertTriangle size={15} className="mr-2 inline"/>{message}</div>:null}

        <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[320px] flex-1">
              <div className={labelClass}>စစ်ဆေးပြီး Pickup ကို ရွေးချယ်ရန်</div>
              <select className={inputClass} value={selectedPickupId} onChange={(e)=>setSelectedPickupId(e.target.value)}>
                {pickups.map(p=><option key={p.pickup_id} value={p.pickup_id}>{p.pickup_id} · {p.merchant_id||p.merchant_name||"Merchant"} · {p.expected_parcels||p.verified_parcels} parcels</option>)}
              </select>
            </div>
            <button type="button" onClick={()=>void loadStartup()} className="inline-flex items-center gap-2 rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-4 py-2.5 text-[11px] font-black text-[#8fd3ff]"><RefreshCw size={14}/>ပြန်ဖတ်ရန်</button>
            <button type="button" onClick={()=>void calculateAll()} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2.5 text-[11px] font-black text-[#68e8bd] disabled:opacity-50"><Calculator size={14}/>အားလုံးတွက်ချက်ရန်</button>
            <button type="button" onClick={()=>setFullRegistration(true)} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-lg bg-[#f6b84b] px-4 py-2.5 text-[11px] font-black text-[#061524] disabled:opacity-50"><Maximize2 size={14}/>စာရင်းသွင်းမျက်နှာပြင် အပြည့်</button>
          </div>
          {selectedPickup?<div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={serverClass}>Pickup: <b>{selectedPickup.pickup_id}</b></div>
            <div className={serverClass}>Merchant: <b>{selectedPickup.merchant_id||selectedPickup.merchant_name||"—"}</b></div>
            <div className={serverClass}>Parcels: <b>{selectedPickup.expected_parcels||selectedPickup.verified_parcels}</b></div>
            <div className={serverClass}>Status: <b>{selectedPickup.pickup_status||"—"}</b></div>
            <div className={serverClass}>Stage: <b>{selectedPickup.workflow_stage||"—"}</b></div>
          </div>:null}
        </section>
        {workspace}
      </div>

      {fullRegistration?<div data-full-review-sheet="true" className="fixed inset-0 z-[9999] overflow-auto bg-[#04111d]">
        <div className="sticky top-0 z-10 border-b border-[#1a3a5c] bg-[#071b2b]/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-3">
            <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f6b84b]">Full Registration</div><div className="mt-1 text-lg font-black">{selectedPickupId} · {rows.length} parcels</div></div>
            <div className="flex gap-2">
              <button type="button" onClick={()=>void calculateAll()} className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2 text-[11px] font-black text-[#68e8bd]"><Calculator size={14}/>အားလုံးတွက်ချက်ရန်</button>
              <button type="button" onClick={()=>setFullRegistration(false)} className="inline-flex items-center gap-2 rounded-lg border border-[#ff6b6b]/40 bg-[#3a1e28] px-4 py-2 text-[11px] font-black text-[#ff9aa2]"><X size={14}/>CLOSE</button>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1900px] p-5">{workspace}</div>
      </div>:null}
    </div>
  );
}
