import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Image as ImageIcon, Loader2, Maximize2, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ActiveScreenBulkImport from "@/components/workflow/ActiveScreenBulkImport";
import DataEntryLocationEditor from "@/components/workflow/DataEntryLocationEditor";
import { syncWaybillStudioV122 } from "@/lib/britiumCompleteWireupApiV33";
export const BRITIUM_LOCATION_WORKFLOW_V10 = "DATA_ENTRY_BILINGUAL_LOCATION_V10";

export const DATA_ENTRY_PHOTO_LIGHTBOX_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_LIGHTBOX_PROXY_V1_3_20260823";
export const DATA_ENTRY_FINANCIAL_V2_BUILD = "DATA_ENTRY_FINANCIAL_V2_RESTORED_20260816";
export const DATA_ENTRY_WHITE_CONTROLS_BUILD = "BRITIUM_DATA_ENTRY_WHITE_CONTROLS_V1_20260826";
export const DATA_ENTRY_PHOTO_REVIEW_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_REVIEW_V2_20260825";
export const DATA_ENTRY_PHOTO_URL_REFRESH_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_URL_REFRESH_V1_20260825";
export const DATA_ENTRY_FINANCE_GOVERNANCE_BUILD = "DATA_ENTRY_FINANCE_GOVERNANCE_V4_20260817";
export const PAYMENT_SETTLEMENT_RULE = "EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM";
export const DATA_ENTRY_TARIFF_AUTOCOMPLETE_BUILD = "BRITIUM_DATA_ENTRY_TARIFF_AUTOCOMPLETE_V1_20260826";

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

type TariffOption = {
  destination_key: string;
  destination_name: string;
  standard_rate_mmk: number;
  special_rate_mmk: number | null;
  rack_code: string | null;
  provider_code: string;
  provider_name: string;
};

function tariffRate(option: TariffOption, tier: string): number {
  const specialTier = ["ROYAL", "COMMITMENT"].includes(String(tier || "").toUpperCase());
  return specialTier && option.special_rate_mmk != null
    ? Number(option.special_rate_mmk)
    : Number(option.standard_rate_mmk);
}

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
  proof_ref: string;
  photo_status: string;
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
  photoReviewStatus: string;
  photoRejectionReason: string;
  photoRejectionNote: string;
  photoReviewBusy: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-[12px] font-semibold text-black placeholder:text-slate-500 outline-none focus:border-[#f6b84b]";
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
  return text(row?.current_photo_url || row?.proof_photo_url || row?.proof_photo_path || row?.photo_url || row?.cargo_photo_url || row?.parcel_photo_url || row?.proof_url || row?.payload?.proof_photo_data_url).trim();
}
function approvedPhoto(row: any): boolean {
  const status=text(row?.review_status || row?.photo_status || row?.status || row?.payload?.photo_check_status).toUpperCase();
  return ["APPROVED","APPROVED_AFTER_REUPLOAD","PHOTO_APPROVED","VERIFIED"].includes(status);
}
async function displayPhotoUrl(rawValue: string): Promise<string> {
  const raw=text(rawValue).trim();
  if (!raw) return "";
  if (/^(data:|blob:)/i.test(raw)) return raw;

  const fallbackBuckets=["pickup-parcel-proofs","rider-proofs","ops-photos"];
  let explicitBucket="";
  let objectPath="";

  try {
    const parsed=new URL(raw, typeof window!=="undefined"?window.location.origin:"https://localhost");
    const storageMatch=parsed.pathname.match(/\/(?:supabase\/)?storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (storageMatch) {
      explicitBucket=decodeURIComponent(storageMatch[1]);
      objectPath=storageMatch[2].split("?")[0].split("#")[0].split("/").map((part)=>decodeURIComponent(part)).join("/");
    } else if (/^https?:/i.test(raw)) {
      return raw;
    }
  } catch {
    objectPath=raw.replace(/^\/+/, "");
  }

  const clean=(objectPath||raw).replace(/^\/+/, "");
  const buckets=explicitBucket?[explicitBucket]:fallbackBuckets;
  for (const bucket of buckets) {
    const normalized=clean.startsWith(bucket+"/")?clean.slice(bucket.length+1):clean;
    if (!normalized) continue;
    const signed=await (supabase as any).storage.from(bucket).createSignedUrl(normalized, 60*60);
    if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;
  }
  return "";
}
function dataEntryProofDisplayUrl(value: unknown): string {
  const raw = text(value).trim();
  if (!raw || typeof window === "undefined") return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.hostname.endsWith(".supabase.co") && /\/storage\/v1\//.test(parsed.pathname)) return window.location.origin + "/supabase" + parsed.pathname + parsed.search;
    return parsed.href;
  } catch { return raw; }
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

function TownshipTariffField({ row, index, updateRow, tariffOptions }: any) {
  const [open, setOpen] = useState(false);
  const query = text(row.township).trim().toLowerCase();
  const matches = (tariffOptions as TariffOption[])
    .filter((option) => !query || option.destination_name.toLowerCase().includes(query) || option.provider_name.toLowerCase().includes(query))
    .slice(0, 18);
  const selected = (tariffOptions as TariffOption[]).find((option) => option.destination_name === row.township);
  const choose = (option: TariffOption) => {
    updateRow(index, {
      township: option.destination_name,
      delivery_charges: tariffRate(option, row.customer_tier),
      message: `Tariff selected: ${option.provider_name} · Rack ${option.rack_code || "—"}. Delivery charge filled automatically.`,
    });
    setOpen(false);
  };
  return (
    <Field label="မြို့နယ် / ဝန်ဆောင်မှုပေးသူ">
      <div className="relative">
        <input
          className={inputClass}
          value={row.township}
          autoComplete="off"
          placeholder="မြို့နယ်အမည် စတင်ရိုက်ထည့်ပါ…"
          onFocus={() => setOpen(true)}
          onChange={(event) => { updateRow(index, { township: event.target.value }); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && matches[0]) { event.preventDefault(); choose(matches[0]); }
          }}
        />
        {open && matches.length ? (
          <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[360px] overflow-auto rounded-xl border border-[#3aa7de]/50 bg-[#071b2b] p-1 shadow-2xl">
            {matches.map((option) => (
              <button key={option.destination_key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#12314a]">
                <span><b className="block text-[12px] text-white">{option.destination_name}</b><span className="text-[10px] text-[#8db4ce]">{option.provider_name} · Rack {option.rack_code || "—"}</span></span>
                <span className="whitespace-nowrap text-right text-[10px] text-[#f6b84b]">Standard {money(option.standard_rate_mmk)}<br/>Special {option.special_rate_mmk == null ? "—" : money(option.special_rate_mmk)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {selected ? <div className="mt-1 text-[9px] font-semibold text-[#68e8bd]">{selected.provider_name} · Rack {selected.rack_code || "—"} · Applied {money(tariffRate(selected, row.customer_tier))}</div> : <div className="mt-1 text-[9px] text-[#f6b84b]">Select a suggestion to apply the authoritative tariff.</div>}
      </div>
    </Field>
  );
}

function ParcelEditor({ row, index, updateRow, calculate, dryRun, reviewPhoto, tariffOptions }: any) {
  const c = row.calculation || {};
  const type = row.amount_entry_type as AmountType;
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(1);
  const displayProofUrl = dataEntryProofDisplayUrl(row.proof_url);
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
              !row.photoReviewed
            } className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-3 py-2 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">
            {row.checking ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} သိမ်းဆည်းမှု စစ်ဆေးရန်
          </button>
        </div>
      </div>

      {row.proof_url ? (
        <>
          <button type="button" onClick={() => { setPhotoZoom(1); setPhotoPreviewOpen(true); }} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-left hover:border-[#f6b84b]" aria-label="Enlarge parcel proof on this screen">
            <img src={displayProofUrl} alt="Proof" className="h-20 w-28 rounded-lg object-cover" />
            <div><div className="text-[11px] font-black text-[#68e8bd]"><ImageIcon size={14} className="mr-2 inline" />FIELD PROOF RECEIVED</div><div className="mt-1 text-[10px] text-[#8db4ce]">Click to enlarge on this screen</div></div>
          </button>
          {photoPreviewOpen ? (
            <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 md:p-6" role="dialog" aria-modal="true" aria-label="Parcel proof preview" onClick={() => setPhotoPreviewOpen(false)}>
              <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[#2a5272] bg-[#071b2c] shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a3a5c] px-4 py-3">
                  <div><div className="text-[11px] font-black uppercase tracking-widest text-[#f6b84b]">Parcel {row.parcel_sequence} photo verification</div><div className="mt-1 text-[10px] text-[#8db4ce]">{row.delivery_way_id || row.pickup_id}</div></div>
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setPhotoZoom((v) => Math.max(0.5, v - 0.25))} className="rounded-lg border border-[#2a5272] px-3 py-2 text-sm font-black text-white">−</button><span className="min-w-14 text-center text-xs font-bold text-[#9cc2d9]">{Math.round(photoZoom * 100)}%</span><button type="button" onClick={() => setPhotoZoom((v) => Math.min(3, v + 0.25))} className="rounded-lg border border-[#2a5272] px-3 py-2 text-sm font-black text-white">+</button><button type="button" onClick={() => setPhotoZoom(1)} className="rounded-lg border border-[#2a5272] px-3 py-2 text-[11px] font-bold text-white">Reset</button><button type="button" onClick={() => setPhotoPreviewOpen(false)} className="rounded-lg bg-[#f6b84b] px-3 py-2 text-[11px] font-black text-[#061524]">Close</button></div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-[#020912] p-3 text-center"><img src={displayProofUrl} alt={"Parcel " + row.parcel_sequence + " full proof"} className="mx-auto max-w-none rounded-lg object-contain transition-transform" style={{ width: String(photoZoom * 100) + "%", maxHeight: photoZoom <= 1 ? "78vh" : "none" }} /></div>
              </div>
            </div>
          ) : null}
        </>
      ) : <div className="mb-4 rounded-xl border border-[#ff4f86]/40 bg-[#ff4f86]/10 p-3 text-[11px] text-[#ff9abd]"><ImageIcon size={14} className="mr-2 inline" />{row.proof_ref?"Stored proof exists but could not be securely displayed.":"No Rider / Driver parcel photo exists for this parcel."} <a href="#/data-entry-photo" className="ml-2 font-black underline">Open Photo Check</a></div>}

      <div
        data-photo-review="true"
        className="mb-4 rounded-xl border border-[#f6b84b]/30 bg-[#061524] p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">
            <ImageIcon size={14} /> Photo Review
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${
            row.photoReviewStatus === "APPROVED"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : row.photoReviewStatus === "REUPLOAD_REQUIRED"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}>
            {row.photoReviewStatus || "PENDING REVIEW"}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <button
            type="button"
            disabled={row.photoReviewBusy || !row.proof_url}
            onClick={() => reviewPhoto(index, "APPROVE")}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-left text-[12px] font-black text-emerald-300 disabled:opacity-50"
          >
            Approve Photo
            <span className="mt-1 block text-[10px] font-normal text-[#8db4ce]">Correct parcel and sufficiently clear.</span>
          </button>

          <label className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-200">
            <b>Reject reason</b>
            <select
              className="mt-2 w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white"
              value={row.photoRejectionReason}
              onChange={(e) => updateRow(index, { photoRejectionReason: e.target.value })}
            >
              <option value="">Select reason…</option>
              <option value="IMAGE_UNAVAILABLE">Image unavailable</option>
              <option value="WRONG_PARCEL">Wrong parcel</option>
              <option value="UNCLEAR_OR_BLURRY">Unclear or blurry</option>
              <option value="UNRELATED_IMAGE">Unrelated image</option>
              <option value="PARCEL_NOT_VISIBLE">Parcel not visible</option>
              <option value="DUPLICATE_IMAGE">Duplicate image</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <button
            type="button"
            disabled={row.photoReviewBusy || !row.photoRejectionReason}
            onClick={() => reviewPhoto(index, "REJECT")}
            className="rounded-lg border border-rose-500/50 bg-rose-600 px-3 py-3 text-[12px] font-black text-white disabled:opacity-50"
          >
            Reject &amp; Request Re-upload
            <span className="mt-1 block text-[10px] font-normal text-rose-100">The rider receives a re-upload requirement.</span>
          </button>
        </div>

        {row.photoRejectionReason ? (
          <textarea
            rows={2}
            className="mt-3 w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white placeholder:text-slate-500"
            placeholder="Optional detail for the rider…"
            value={row.photoRejectionNote}
            onChange={(e) => updateRow(index, { photoRejectionNote: e.target.value })}
          />
        ) : null}

        {!row.photoReviewed ? (
          <div className="mt-3 rounded-lg border border-[#f6b84b]/25 bg-[#f6b84b]/10 px-3 py-2 text-[10px] text-[#ffd98a]">
            Approve the photo before Validate Save. A rejected or unavailable image must be re-uploaded by the rider.
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="လက်ခံသူအမည်"><input className={inputClass} value={row.recipient_name} onChange={(e) => updateRow(index,{recipient_name:e.target.value})}/></Field>
        <Field label="လက်ခံသူဖုန်း"><input className={inputClass} value={row.recipient_phone} onChange={(e) => updateRow(index,{recipient_phone:e.target.value})}/></Field>
        <TownshipTariffField row={row} index={index} updateRow={updateRow} tariffOptions={tariffOptions} />
        <Field label="အမှန်တကယ်အလေးချိန် (kg)"><input type="number" step="0.01" className={inputClass} value={row.weight_kg} onChange={(e)=>updateRow(index,{weight_kg:e.target.value===""?"":Number(e.target.value)})}/></Field>
        <Field label="လက်ခံသူလိပ်စာ"><textarea rows={2} className={`${inputClass} !bg-white !text-black placeholder:!text-slate-500`} value={row.delivery_address} onChange={(e)=>updateRow(index,{delivery_address:e.target.value})}/></Field>
        <DataEntryLocationEditor deliveryWayId={row.delivery_way_id} address={row.delivery_address} township={row.township} />
        <Field label="ကုန်သည်အဆင့်">
          <select className={`${inputClass} !bg-white !text-black`} value={row.customer_tier} onChange={(e)=>{
            const customer_tier=e.target.value;
            const option=(tariffOptions as TariffOption[]).find((item)=>item.destination_name===row.township);
            updateRow(index,{customer_tier,...(option?{delivery_charges:tariffRate(option,customer_tier)}:{})});
          }}>
            <option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option>
          </select>
        </Field>
        <Field label="ငွေကောက်ခံပုံ">
          <select className={`${inputClass} !bg-white !text-black`} value={row.amount_entry_type} onChange={(e)=> {
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
  const [waybillBusy,setWaybillBusy]=useState(false);
  const [waybillMessage,setWaybillMessage]=useState("");
  const [tariffOptions,setTariffOptions]=useState<TariffOption[]>([]);

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
      const tariffResponse=await (supabase as any).rpc("be_data_entry_tariff_options");
      if(tariffResponse.error) throw tariffResponse.error;
      setTariffOptions(Array.isArray(tariffResponse.data)?tariffResponse.data:[]);

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
      const resolvedProofs=await Promise.all(proofs.map(async (proof:any)=>({
        ...proof,
        __proof_ref:proofUrl(proof),
        __proof_url:await displayPhotoUrl(proofUrl(proof)),
      })));
      const count=pickup.expected_parcels||pickup.verified_parcels||resolvedProofs.reduce((m:number,x:any)=>Math.max(m,positiveInt(x.parcel_sequence)),0);
      if(!count) throw new Error("This pickup has no authoritative parcel count. Registration is blocked.");
      setRows(Array.from({length:count},(_,offset)=>{
        const sequence=offset+1;
        const proof=resolvedProofs.find((x:any)=>positiveInt(x.parcel_sequence)===sequence)||{};
        return {
          pickup_id:pickup.pickup_id,
          parcel_sequence:sequence,
          delivery_way_id:text(proof.delivery_way_id),
          proof_url:text(proof.__proof_url),
          proof_ref:text(proof.__proof_ref),
          photo_status:text(proof.review_status||proof.photo_status||proof.status||"PENDING_REVIEW").toUpperCase(),
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
          photoReviewed:["APPROVED","VERIFIED"].includes(text(proof.proof_check_status||proof.verification_status).toUpperCase()),
          photoUnavailableAcknowledged:false,
          photoReviewStatus:text(proof.proof_check_status||proof.verification_status||"PENDING_REVIEW").toUpperCase(),
          photoRejectionReason:text(proof.rejection_reason),
          photoRejectionNote:text(proof.review_note),
          photoReviewBusy:false
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

  async function reviewPhoto(index:number, action:"APPROVE"|"REJECT"){
    const row=rows[index]; if(!row) return;
    if(action==="REJECT" && !row.photoRejectionReason){
      updateRow(index,{message:"Select a rejection reason first."}); return;
    }
    updateRow(index,{photoReviewBusy:true,message:""});
    try{
      const {data:userData}=await supabase.auth.getUser();
      const response=await (supabase as any).rpc("be_review_parcel_photo",{p_payload:{
        action,
        pickup_id:row.pickup_id,
        parcel_sequence:row.parcel_sequence,
        rejection_reason:action==="REJECT"?row.photoRejectionReason:null,
        rejection_note:action==="REJECT"?(row.photoRejectionNote||null):null,
        reviewed_by:userData?.user?.id||null,
        reviewed_by_email:userData?.user?.email||null
      }});
      if(response.error) throw response.error;
      if(response.data?.ok===false) throw new Error(response.data?.error||"Photo review failed.");
      const status=text(response.data?.review_status||(action==="APPROVE"?"APPROVED":"REUPLOAD_REQUIRED")).toUpperCase();
      updateRow(index,{
        photoReviewBusy:false,
        photoReviewStatus:status,
        photoReviewed:status==="APPROVED",
        photoUnavailableAcknowledged:false,
        message:status==="APPROVED"
          ?"Photo approved. Validate Save is now available."
          :"Rejected. Re-upload request sent to the assigned rider."
      });
    }catch(error:any){
      updateRow(index,{photoReviewBusy:false,message:error?.message||"Photo review failed."});
    }
  }

  async function dryRunRow(index:number){
    if(!selectedPickup) return;
    const row=rows[index]; if(!row) return;

    if (!row.proof_ref) {
      updateRow(index,{message:"No stored parcel photo reference exists. Photo capture/re-upload is required before validation."});
      return;
    }
    if (!row.photoReviewed) {
      updateRow(index, {
        message:
          "Approve the parcel photo before Validate Save. Reject unavailable, wrong, unclear, or unrelated images and request re-upload.",
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

  async function createAndGenerateWaybill(){
    if(!selectedPickupId) return;

    setWaybillBusy(true);
    setWaybillMessage("");

    try{
      const requestId =
        "WAYBILL:" +
        selectedPickupId +
        ":" +
        (
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Date.now()
        );

      const { data, error } = await (supabase as any).rpc(
        "be_data_entry_financial_v2_create_waybill",
        {
          p_payload: {
            request_id: requestId,
            pickup_id: selectedPickupId,
            dry_run: false,
          },
        }
      );

      if(error) throw error;

      if(!data?.ok){
        const rpcMessage =
          data?.errors
            ?.map((item:any)=>item?.message)
            .filter(Boolean)
            .join(" ") ||
          data?.message ||
          data?.code ||
          "Waybill creation failed.";

        throw new Error(rpcMessage);
      }

      const sync = await syncWaybillStudioV122({
        pickupId: selectedPickupId,
        merchantCode: selectedPickup?.merchant_id,
        merchantName: selectedPickup?.merchant_name,
      });

      const expected = rows.length;
      const printable = Number(sync?.printable_count || 0);
      if (printable < expected) {
        throw new Error(
          `Waybill creation was not completed: ${printable} of ${expected} parcel(s) reached Waybill Studio.`
        );
      }

      const waybillContext = {
        pickupId: selectedPickupId, pickup_id: selectedPickupId,
        waybillNo: data?.waybill_no || null, waybill_no: data?.waybill_no || null,
        parcelCount: printable, parcel_count: printable, createdAt: new Date().toISOString(),
      };
      try {
        const encoded = JSON.stringify(waybillContext);
        window.sessionStorage.setItem("britium:last-created-waybill", encoded);
        window.localStorage.setItem("britium:last-created-waybill", encoded);
        window.dispatchEvent(new CustomEvent("britium:waybill-created", { detail: waybillContext }));
      } catch {}
      setWaybillMessage(
        `Waybill created, live-synced and verified in Waybill Studio: ${printable} parcel(s) · ` +
        (data?.waybill_no || selectedPickupId)
      );
    }catch(error:any){
      setWaybillMessage(
        error?.message || "Waybill creation failed."
      );
    }finally{
      setWaybillBusy(false);
    }
  }

  useEffect(()=>{void loadStartup();},[]);
  useEffect(()=>{if(selectedPickup) void loadPickupRows(selectedPickup); else setRows([]);},[selectedPickupId]);

  if(loading) return <div className="flex min-h-[70vh] items-center justify-center bg-[#061524] text-[#eef8ff]"><Loader2 className="mr-3 animate-spin text-[#f6b84b]"/>Loading Financial V2…</div>;

  const workspace=(
    <div className="space-y-4">
      {loadingRows?<div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-10 text-center"><Loader2 className="mr-3 inline animate-spin text-[#f6b84b]"/>Loading pickup proof rows…</div>:
      rows.map((row,index)=><ParcelEditor key={row.pickup_id+":"+row.parcel_sequence} row={row} index={index} updateRow={updateRow} calculate={calculateRow} dryRun={dryRunRow} reviewPhoto={reviewPhoto} tariffOptions={tariffOptions}/>)}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#061524] px-4 py-5 text-[#eef8ff]">
        <ActiveScreenBulkImport module="data-entry" />
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

        {waybillMessage?
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[12px] font-semibold text-black">
            {waybillMessage}
          </div>
        :null}

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
            <button
              type="button"
              onClick={()=>void createAndGenerateWaybill()}
              disabled={!rows.length || waybillBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-50"
            >
              {waybillBusy
                ? <Loader2 size={14} className="animate-spin"/>
                : <Save size={14}/>
              }
              CREATE & GENERATE WAYBILL
            </button>
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
