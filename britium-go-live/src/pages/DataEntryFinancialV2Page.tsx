import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calculator, Download, FileSpreadsheet, Image as ImageIcon, Loader2, Maximize2, Plus, RefreshCw, Save, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DataEntryLocationEditor, { type DataEntryLocationResolution } from "@/components/workflow/DataEntryLocationEditor";
import { validMyanmarCoordinate, type DeliveryLocation } from "@/lib/deliveryLocationService";
import DataEntryOsBulkImport, { BULK_UPLOAD_PICKUP_ID, type OsBulkPickup, type OsImportApplyPayload, type OsImportRow } from "@/components/workflow/DataEntryOsBulkImport";
import { syncWaybillStudioV122 } from "@/lib/britiumCompleteWireupApiV33";
import {
  DATA_ENTRY_HANDOFF_STATIONS,
  providerRoutingMessage,
  resolveDataEntryServiceProvider,
  type DataEntryDeliveryMode,
  type DataEntryProviderRouting,
  type DataEntryRouteRegion,
} from "@/lib/dataEntryServiceProviderRouting";
export const BRITIUM_LOCATION_WORKFLOW_V10 = "DATA_ENTRY_BILINGUAL_LOCATION_V10";

export const DATA_ENTRY_PHOTO_LIGHTBOX_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_LIGHTBOX_PROXY_V1_3_20260823";
export const DATA_ENTRY_FINANCIAL_V2_BUILD = "DATA_ENTRY_FINANCIAL_V2_RESTORED_20260816";
export const DATA_ENTRY_WHITE_CONTROLS_BUILD = "BRITIUM_DATA_ENTRY_WHITE_CONTROLS_V1_20260826";
export const DATA_ENTRY_PHOTO_REVIEW_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_REVIEW_V2_20260825";
export const DATA_ENTRY_PHOTO_URL_REFRESH_BUILD = "BRITIUM_DATA_ENTRY_PHOTO_URL_REFRESH_V1_20260825";
export const DATA_ENTRY_FINANCE_GOVERNANCE_BUILD = "DATA_ENTRY_FINANCE_GOVERNANCE_V4_20260817";
export const PAYMENT_SETTLEMENT_RULE = "DECLARED_DELIVERY_PLUS_BACKEND_SURCHARGES_V61_9_1";
export const DATA_ENTRY_TARIFF_AUTOCOMPLETE_BUILD = "BRITIUM_DATA_ENTRY_TARIFF_AUTOCOMPLETE_V1_20260826";
export const DATA_ENTRY_REGISTRATION_EXPORT_BUILD = "BRITIUM_DATA_ENTRY_REGISTRATION_EXPORT_TIMELINE_V12_9";
export const DATA_ENTRY_FINANCE_RECONCILIATION_BUILD = "DATA_ENTRY_FINANCE_RECONCILIATION_V13_2_20260902";
export const DATA_ENTRY_BULK_ACTIONS_BUILD = "DATA_ENTRY_EXTRA_REGISTRATION_BULK_ACTIONS_V14_20260902";
export const DATA_ENTRY_OS_SOFTCOPY_IMPORT_BUILD = "DATA_ENTRY_OS_MULTI_PICKUP_IMPORT_V16_20260903";
export const DATA_ENTRY_PROVIDER_ROUTING_BUILD = "DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903";

const AMOUNT_TYPES = [
  "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
  "DELIVERY_CHARGE_ONLY",
  "EXACT_COLLECTION_AMOUNT",
] as const;

const COLLECTION_METHOD_MY: Record<AmountType,string> = {
  ITEM_PRICE_PLUS_DECLARED_DELIVERY:"ပစ္စည်းတန်ဖိုး + သတ်မှတ်ထားသော ပို့ဆောင်ခ",
  DELIVERY_CHARGE_ONLY:"ပို့ဆောင်ခသာ",
  EXACT_COLLECTION_AMOUNT:"အတိအကျ ကောက်ခံမည့်ငွေ",
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

type ProviderOption = {
  provider_code: string;
  display_name: string;
  provider_type: string;
  active_tariff_count: number;
};

type MerchantTierAccess = {
  merchant_id: string;
  registered: boolean;
  profile_tier: string;
  resolved_customer_tier: string;
  can_select_tier: boolean;
  can_override_profile_tier: boolean;
  tier_rules: Record<string, any>;
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
  registered_parcels: number;
  pickup_date: string;
  created_at: string;
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
  tier_override: boolean;
  service_provider_code: string;
  service_type: string;
  amount_entry_type: AmountType;
  item_price: number | "";
  delivery_charges: number | "";
  merchant_stated_total_amount: number | "";
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
  isAdditionalRegistration: boolean;
  importedFromOs: boolean;
  sourceFileName: string;
  sourceRowNumber: number | null;
  sourceRowCount: number | null;
  photoEvidenceMode: "PICKER_PHOTO" | "OS_SOFTCOPY";
  photoBypassReason: string;
  deliveryRegion: DataEntryRouteRegion;
  deliveryMode: DataEntryDeliveryMode;
  handoffStationCode: string;
  handoffStationName: string;
  locationStatus: DataEntryLocationResolution;
  locationCandidate?: DeliveryLocation | null;
  saved: boolean;
};

type BulkImportDraft = {
  pickupId: string;
  fileName: string;
  rows: ParcelRow[];
  tierAccess: MerchantTierAccess;
  saved: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-[12px] font-semibold text-black placeholder:text-slate-500 outline-none focus:border-[#f6b84b]";
const labelClass = "mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[#7aa7c6]";
const serverClass = "rounded-lg border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[12px] text-[#8fd3ff]";

function text(value: unknown): string { return value == null ? "" : String(value); }
function num(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function positiveInt(value: unknown): number { const n = Math.trunc(num(value)); return n > 0 ? n : 0; }
function requestedParcelCount(pickup: Pickup): number {
  return Math.max(positiveInt(pickup.expected_parcels),0);
}
function authorizedParcelCount(pickup: Pickup, observed = 0): number {
  return Math.max(requestedParcelCount(pickup),positiveInt(pickup.verified_parcels),positiveInt(observed));
}
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
function canonicalWayId(pickupId: string, sequence: number): string {
  return `${pickupId}-${String(sequence).padStart(3,"0")}`;
}
function resolveImportedDestination(value: unknown,address: unknown,itemPrice: unknown,options: TariffOption[]) {
  return resolveDataEntryServiceProvider(value,address,options,{fallbackUnknownToRoyal:true,itemPrice});
}
function routeForRow(row: ParcelRow, options: TariffOption[]): DataEntryProviderRouting {
  return resolveDataEntryServiceProvider(row.township,row.delivery_address,options,{
    fallbackUnknownToRoyal:true,
    itemPrice:row.item_price,
  });
}
function routingPatch(route: DataEntryProviderRouting,row: ParcelRow): Partial<ParcelRow> {
  return {
    township:route.township||row.township,
    service_provider_code:route.providerCode,
    deliveryRegion:route.routeRegion,
    deliveryMode:route.deliveryMode,
    locationStatus:route.routeRegion==="UNRESOLVED"
      ?"PENDING"
      :route.mapRequired
      ?row.locationStatus==="NOT_REQUIRED"?"PENDING":row.locationStatus
      :"NOT_REQUIRED",
    ...(route.stationRequired
      ?{}
      :{handoffStationCode:"",handoffStationName:""}),
  };
}
function handoffStationReady(row: ParcelRow,route: DataEntryProviderRouting): boolean {
  if(!route.stationRequired) return true;
  if(!DATA_ENTRY_HANDOFF_STATIONS.some((station)=>station.code===row.handoffStationCode)) return false;
  return row.handoffStationCode!=="OTHER"||row.handoffStationName.trim().length>=3;
}
function routeReady(row: ParcelRow, options: TariffOption[]): boolean {
  const route=routeForRow(row,options);
  return Boolean(route.providerCode)
    && handoffStationReady(row,route)
    && (route.mapRequired?row.locationStatus==="SYNCED":row.locationStatus==="NOT_REQUIRED");
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
    registered_parcels: positiveInt(row?.registered_parcels || row?.registered_parcel_count),
    pickup_date: text(row?.pickup_date).trim(),
    created_at: text(row?.created_at).trim(),
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
  return type === "EXACT_COLLECTION_AMOUNT";
}
function envelope(data: any) {
  const object=data&&typeof data==="object"?data:{};
  const nested="data" in object;
  return {
    ok:object.ok!==false,
    data:nested?(object.data||{}):object,
    errors:Array.isArray(object.errors)?object.errors:[],
    warnings:Array.isArray(object.warnings)?object.warnings:[],
    raw:data,
  };
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
    delivery_way_id: row.delivery_way_id || canonicalWayId(row.pickup_id,row.parcel_sequence),
    merchant_id: pickup.merchant_id || null,
    recipient_name: row.recipient_name || null,
    recipient_phone: row.recipient_phone || null,
    township: row.township || null,
    delivery_address: row.delivery_address || null,
    weight_kg: row.weight_kg === "" ? null : Number(row.weight_kg),
    customer_tier: row.customer_tier || "STANDARD",
    customer_tier_override: row.tier_override,
    service_provider_code: row.service_provider_code || null,
    delivery_region: row.deliveryRegion === "UNRESOLVED" ? null : row.deliveryRegion,
    delivery_route_mode: row.deliveryMode === "UNRESOLVED" ? null : row.deliveryMode,
    location_required: row.deliveryMode === "DOORSTEP_MAP",
    handoff_station_code: row.handoffStationCode || null,
    handoff_station_name: row.handoffStationName || null,
    service_type: row.service_type || "STANDARD",
    amount_entry_type: row.amount_entry_type,
    item_price: row.item_price === "" ? null : Number(row.item_price),
    delivery_charges: row.delivery_charges === "" ? null : Number(row.delivery_charges),
    merchant_stated_total_amount: row.merchant_stated_total_amount === "" ? null : Number(row.merchant_stated_total_amount),
    additional_customer_charge: 0,
    cbm_surcharge: row.cbm_surcharge === "" ? 0 : Number(row.cbm_surcharge),
    other_surcharge: row.other_surcharge === "" ? 0 : Number(row.other_surcharge),
    merchant_payable_charges: row.merchant_payable_charges === "" ? 0 : Number(row.merchant_payable_charges),
    other_merchant_credits: row.other_merchant_credits === "" ? 0 : Number(row.other_merchant_credits),
    remarks: row.remarks || null,
    os_softcopy_import: row.importedFromOs,
    os_source_file_name: row.sourceFileName || null,
    source_row_number: row.sourceRowNumber,
    source_row_count: row.sourceRowCount,
    photo_evidence_mode: row.photoEvidenceMode,
    photo_bypass: row.photoUnavailableAcknowledged,
    photo_bypass_reason: row.photoBypassReason || null,
  };
  if (isExact(row.amount_entry_type)) { p.item_price = null; p.delivery_charges = null; }
  else if (row.amount_entry_type === "DELIVERY_CHARGE_ONLY") { p.item_price = null; p.merchant_stated_total_amount = null; }
  else p.merchant_stated_total_amount = null;
  return p;
}

function parcelRowFromProof(
  pickup: Pickup,
  tierAccess: MerchantTierAccess,
  proof: any,
  sequence: number
): ParcelRow {
  const rawAmountType=text(proof.amount_entry_type).toUpperCase();
  const legacyOpaque=rawAmountType==="OPAQUE_COD_COLLECTION";
  const editableAmountType=(legacyOpaque
    ? "EXACT_COLLECTION_AMOUNT"
    : AMOUNT_TYPES.includes(rawAmountType as AmountType)
      ? rawAmountType
      : "ITEM_PRICE_PLUS_DECLARED_DELIVERY") as AmountType;
  const savedTier=text(proof.customer_tier).toUpperCase();
  const customerTier=savedTier||tierAccess.resolved_customer_tier||"STANDARD";
  const legacyAdditional=num(proof.additional_customer_charge);
  const proofReviewStatus=text(proof.proof_check_status||proof.verification_status||"PENDING_REVIEW").toUpperCase();
  const storedPhotoMode=text(proof.photo_evidence_mode||proof.financial_quote?.photo_evidence_mode).toUpperCase();
  const importedFromOs=Boolean(
    proof.source_file_name||proof.os_imported_at||proof.financial_quote?.os_softcopy_import
  );
  const photoEvidenceMode:ParcelRow["photoEvidenceMode"]=storedPhotoMode==="OS_SOFTCOPY"?"OS_SOFTCOPY":"PICKER_PHOTO";
  return {
    pickup_id:pickup.pickup_id,
    parcel_sequence:sequence,
    delivery_way_id:text(proof.delivery_way_id)||canonicalWayId(pickup.pickup_id,sequence),
    proof_url:text(proof.__proof_url),
    proof_ref:text(proof.__proof_ref),
    photo_status:text(proof.review_status||proof.photo_status||proof.status||"PENDING_REVIEW").toUpperCase(),
    recipient_name:text(proof.recipient_name),
    recipient_phone:text(proof.recipient_phone||proof.contact_no_1),
    township:text(proof.township||pickup.township),
    delivery_address:text(proof.delivery_address||proof.recipient_address),
    weight_kg:proof.actual_weight_kg??proof.parcel_weight_kg??proof.weight_kg??"",
    customer_tier:customerTier,
    tier_override:Boolean(tierAccess.registered && tierAccess.profile_tier && customerTier!==tierAccess.profile_tier && tierAccess.can_override_profile_tier),
    service_provider_code:text(proof.service_provider_code||proof.financial_quote?.service_provider_code).toUpperCase(),
    service_type:text(proof.service_type||proof.financial_quote?.service_type||"STANDARD").toUpperCase(),
    amount_entry_type:editableAmountType,
    item_price:proof.item_price??"",
    delivery_charges:proof.delivery_charges??proof.delivery_fee??"",
    merchant_stated_total_amount:proof.merchant_stated_total_amount??"",
    cbm_surcharge:proof.cbm_surcharge??0,
    other_surcharge:proof.other_surcharge??0,
    merchant_payable_charges:proof.merchant_payable_charges??0,
    other_merchant_credits:proof.other_merchant_credits??0,
    remarks:text(proof.remarks||proof.remark),
    calculating:false,
    checking:false,
    calculation:proof.financial_quote&&typeof proof.financial_quote==="object"?proof.financial_quote:{},
    message:[
      legacyOpaque?"Legacy unclassified COD was converted to Exact Collection Amount; the total amount is unchanged.":"",
      legacyAdditional>0?`Legacy additional customer charge ${money(legacyAdditional)} is retired and will be reset to 0 on the next save.`:"",
    ].filter(Boolean).join(" "),
    photoReviewed:["APPROVED","APPROVED_AFTER_REUPLOAD","PHOTO_APPROVED","VERIFIED","RIDER_VERIFIED"].includes(proofReviewStatus),
    photoUnavailableAcknowledged:photoEvidenceMode==="OS_SOFTCOPY",
    photoReviewStatus:proofReviewStatus,
    photoRejectionReason:text(proof.rejection_reason),
    photoRejectionNote:text(proof.review_note),
    photoReviewBusy:false,
    isAdditionalRegistration:sequence>requestedParcelCount(pickup),
    importedFromOs,
    sourceFileName:text(proof.source_file_name||proof.financial_quote?.os_source_file_name),
    sourceRowNumber:positiveInt(proof.source_row_number||proof.financial_quote?.source_row_number)||null,
    sourceRowCount:positiveInt(proof.source_row_count||proof.financial_quote?.source_row_count)||null,
    photoEvidenceMode,
    photoBypassReason:text(proof.photo_bypass_reason||proof.financial_quote?.photo_bypass_reason),
    deliveryRegion:text(proof.delivery_region||proof.financial_quote?.delivery_region||"UNRESOLVED").toUpperCase() as DataEntryRouteRegion,
    deliveryMode:text(proof.delivery_route_mode||proof.financial_quote?.delivery_route_mode||"UNRESOLVED").toUpperCase() as DataEntryDeliveryMode,
    handoffStationCode:text(proof.handoff_station_code||proof.financial_quote?.handoff_station_code).toUpperCase(),
    handoffStationName:text(proof.handoff_station_name||proof.financial_quote?.handoff_station_name),
    locationStatus:proof.location_required===false||proof.financial_quote?.location_required===false?"NOT_REQUIRED":"PENDING",
    saved:Boolean(proof.saved_at||proof.delivery_way_id),
  };
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

function TownshipTariffField({ row, index, updateRow, tariffOptions, providerOptions }: any) {
  const [open, setOpen] = useState(false);
  const [providerFilter, setProviderFilter] = useState("ALL");
  const route = resolveDataEntryServiceProvider(row.township,row.delivery_address,tariffOptions,{
    fallbackUnknownToRoyal:true,
    itemPrice:row.item_price,
  });
  const query = text(row.township).trim().toLowerCase();
  const matches = (tariffOptions as TariffOption[])
    .filter((option) => providerFilter === "ALL" || option.provider_code === providerFilter)
    .filter((option) => !query || option.destination_name.toLowerCase().includes(query) || option.provider_name.toLowerCase().includes(query))
    .slice(0, 18);
  const selected = (tariffOptions as TariffOption[]).find((option) =>
    option.destination_name === row.township && (!row.service_provider_code || option.provider_code === row.service_provider_code)
  );
  const choose = (option: TariffOption) => {
    const nextRoute=resolveDataEntryServiceProvider(option.destination_name,row.delivery_address,tariffOptions,{
      fallbackUnknownToRoyal:true,
      itemPrice:row.item_price,
    });
    updateRow(index, {
      ...routingPatch(nextRoute,{...row,township:option.destination_name}),
      delivery_charges: tariffRate(option, row.customer_tier),
      message: `${providerRoutingMessage(nextRoute)} Approved tariff ${option.provider_name} · Rack ${option.rack_code || "—"} was applied.`,
    });
    setOpen(false);
  };
  const typeTownship = (township: string) => {
    const nextRoute=resolveDataEntryServiceProvider(township,row.delivery_address,tariffOptions,{
      fallbackUnknownToRoyal:true,
      itemPrice:row.item_price,
    });
    const option=nextRoute.option as TariffOption|null;
    updateRow(index,nextRoute.providerCode?{
      ...routingPatch(nextRoute,{...row,township}),
      ...(option
        ?{delivery_charges:tariffRate(option,row.customer_tier)}
        :row.service_provider_code&&row.service_provider_code!==nextRoute.providerCode
          ?{delivery_charges:""}
          :{}),
      message:providerRoutingMessage(nextRoute),
    }:{township,...routingPatch(nextRoute,{...row,township}),message:providerRoutingMessage(nextRoute)});
    setOpen(true);
  };
  return (
    <Field label="မြို့နယ် / ဝန်ဆောင်မှုပေးသူ">
      <div className="relative">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => { setProviderFilter("ALL"); setOpen(true); }} className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${providerFilter === "ALL" ? "border-cyan-300 bg-cyan-400/20 text-cyan-100" : "border-[#2a5272] text-[#8db4ce]"}`}>ALL</button>
          {(providerOptions as ProviderOption[]).filter((provider) => ["ROYAL EXPRESS","DK DELIVERY","NPT BRANCH","H.TERMINAL DROP-OFF","GRS"].includes(provider.provider_code)).map((provider) => (
            <button key={provider.provider_code} type="button" onClick={() => { setProviderFilter(provider.provider_code); setOpen(true); }} className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${providerFilter === provider.provider_code ? "border-cyan-300 bg-cyan-400/20 text-cyan-100" : "border-[#2a5272] text-[#8db4ce]"}`}>
              {provider.display_name} · {provider.active_tariff_count}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          value={row.township}
          autoComplete="off"
          placeholder="မြို့နယ်အမည် စတင်ရိုက်ထည့်ပါ…"
          onFocus={() => setOpen(true)}
          onChange={(event) => typeTownship(event.target.value)}
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
        ) : open && providerFilter !== "ALL" ? (
          <div className="absolute z-50 mt-1 w-full min-w-[360px] rounded-xl border border-amber-400/40 bg-[#071b2b] p-3 text-[11px] text-amber-200 shadow-2xl">
            No active tariff is configured for this provider and destination. Add its approved rate card before saving a provider-specific route.
          </div>
        ) : null}
        {selected ? <div className="mt-1 text-[9px] font-semibold text-[#68e8bd]">{providerRoutingMessage(route)} Tariff: {selected.provider_name} · Rack {selected.rack_code || "—"} · {money(tariffRate(selected, row.customer_tier))}</div> : route.providerCode ? <div className="mt-1 text-[9px] font-semibold text-[#68e8bd]">{providerRoutingMessage(route)}</div> : <div className="mt-1 text-[9px] text-[#f6b84b]">Enter a recognized township. Yangon, Mandalay, and eligible Naypyitaw routes use Maps; outside-core routes use the item-price rule.</div>}
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
          <div className="rounded-lg border border-cyan-300/20 bg-[#061524] px-2 py-1.5 text-cyan-100">Provider: <b>{route.providerCode||"UNRESOLVED"}</b></div>
          <div className="rounded-lg border border-cyan-300/20 bg-[#061524] px-2 py-1.5 text-cyan-100">Region: <b>{route.routeRegion.replaceAll("_"," ")}</b></div>
        </div>
      </div>
    </Field>
  );
}

function ParcelEditor({ row, index, updateRow, calculate, save, reviewPhoto, tariffOptions, providerOptions, tierAccess, locationReloadToken }: any) {
  const c = row.calculation || {};
  const type = row.amount_entry_type as AmountType;
  const route = routeForRow(row,tariffOptions);
  const stationReady = handoffStationReady(row,route);
  const tierRule = tierAccess?.tier_rules?.[row.customer_tier] || {};
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(1);
  const displayProofUrl = dataEntryProofDisplayUrl(row.proof_url);
  return (
    <section id={`data-entry-parcel-${row.parcel_sequence}`} style={{contentVisibility:"auto",containIntrinsicSize:"1100px"}} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[#f6b84b]">Parcel {row.parcel_sequence}</div>
            {row.isAdditionalRegistration?<span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-200">AUTHORIZED MERCHANT ADDITION</span>:null}
            {row.importedFromOs?<span className="rounded-full border border-violet-300/40 bg-violet-400/10 px-2 py-1 text-[9px] font-black text-violet-200">OS SOFTCOPY · ROW {row.sourceRowNumber||"—"}</span>:null}
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${["SYNCED","NOT_REQUIRED"].includes(row.locationStatus)?"border-emerald-400/40 bg-emerald-400/10 text-emerald-200":row.locationStatus==="SEARCHING"?"border-cyan-300/40 bg-cyan-400/10 text-cyan-200":"border-amber-300/40 bg-amber-400/10 text-amber-200"}`}>LOCATION {row.locationStatus.replaceAll("_"," ")}</span>
            {route.routeRegion!=="UNRESOLVED"?<span className="rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-1 text-[9px] font-black text-sky-200">{route.routeRegion} · {route.deliveryMode.replaceAll("_"," ")}</span>:null}
            {row.saved?<span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-200">SAVED</span>:null}
          </div>
          <div className="mt-1 text-[12px] text-[#8db4ce]">{row.delivery_way_id || "Delivery Way ID allocated by backend"}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => calculate(index)} disabled={row.calculating} className="inline-flex items-center gap-2 rounded-lg border border-[#3aa7de]/50 bg-[#12314a] px-3 py-2 text-[11px] font-black text-[#8fd3ff] disabled:opacity-50">
            {row.calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />} တွက်ချက်ရန်
          </button>
          <button type="button" onClick={() => save(index)} disabled={
              row.checking ||
              (!row.photoReviewed && !row.isAdditionalRegistration && !row.photoUnavailableAcknowledged) ||
              !routeReady(row,tariffOptions)
            } className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-3 py-2 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">
            {row.checking ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} သိမ်းဆည်းရန်
          </button>
        </div>
      </div>

      {row.photoUnavailableAcknowledged ? (
        <div className="mb-4 rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-[11px] text-amber-100">
          <FileSpreadsheet size={14} className="mr-2 inline"/><b>OS softcopy evidence authorized.</b> Picker-photo review is bypassed only for this imported row. Source: {row.sourceFileName||"—"}, row {row.sourceRowNumber||"—"}. Reason: {row.photoBypassReason||"—"}
        </div>
      ) : row.proof_url ? (
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
      ) : row.isAdditionalRegistration ? (
        <div className="mb-4 rounded-xl border border-cyan-300/35 bg-cyan-400/10 p-3 text-[11px] text-cyan-100">
          <Plus size={14} className="mr-2 inline"/>This parcel was added by an authorized Data Entry user after the merchant changed the pickup quantity. Pickup-level evidence and the audited addition reason apply.
        </div>
      ) : <div className="mb-4 rounded-xl border border-[#ff4f86]/40 bg-[#ff4f86]/10 p-3 text-[11px] text-[#ff9abd]"><ImageIcon size={14} className="mr-2 inline" />{row.proof_ref?"Stored proof exists but could not be securely displayed.":"No Rider / Driver parcel photo exists for this parcel."} <a href="#/data-entry-photo" className="ml-2 font-black underline">Open Photo Check</a></div>}

      {!row.isAdditionalRegistration && !row.photoUnavailableAcknowledged?<div
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
            Approve the photo before Save. A rejected or unavailable image must be re-uploaded by the rider.
          </div>
        ) : null}
      </div>:null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="လက်ခံသူအမည်"><input className={inputClass} value={row.recipient_name} onChange={(e) => updateRow(index,{recipient_name:e.target.value})}/></Field>
        <Field label="လက်ခံသူဖုန်း"><input className={inputClass} value={row.recipient_phone} onChange={(e) => updateRow(index,{recipient_phone:e.target.value})}/></Field>
        <TownshipTariffField row={row} index={index} updateRow={updateRow} tariffOptions={tariffOptions} providerOptions={providerOptions} />
        <Field label="အမှန်တကယ်အလေးချိန် (kg)"><input type="number" step="0.01" className={inputClass} value={row.weight_kg} onChange={(e)=>updateRow(index,{weight_kg:e.target.value===""?"":Number(e.target.value)})}/></Field>
        <Field label="လက်ခံသူလိပ်စာ"><textarea rows={2} className={`${inputClass} !bg-white !text-black placeholder:!text-slate-500`} value={row.delivery_address} onChange={(e)=>{
          const delivery_address=e.target.value;
          const nextRoute=resolveDataEntryServiceProvider(row.township,delivery_address,tariffOptions,{fallbackUnknownToRoyal:true,itemPrice:row.item_price});
          const option=nextRoute.option as TariffOption|null;
          updateRow(index,nextRoute.providerCode?{
            delivery_address,
            ...routingPatch(nextRoute,{...row,delivery_address}),
            ...(option?{delivery_charges:tariffRate(option,row.customer_tier)}:{}),
            message:providerRoutingMessage(nextRoute),
          }:{delivery_address,...routingPatch(nextRoute,{...row,delivery_address}),message:providerRoutingMessage(nextRoute)});
        }}/></Field>
        <Field label="ကုန်သည်အဆင့်">
          <select disabled={!tierAccess?.can_select_tier} className={`${inputClass} !bg-white !text-black disabled:cursor-not-allowed disabled:opacity-60`} value={row.customer_tier} onChange={(e)=>{
            const customer_tier=e.target.value;
            const option=(tariffOptions as TariffOption[]).find((item)=>item.destination_name===row.township&&(!row.service_provider_code||item.provider_code===row.service_provider_code));
            const tier_override=Boolean(tierAccess?.registered && tierAccess?.profile_tier && customer_tier!==tierAccess.profile_tier);
            updateRow(index,{customer_tier,tier_override,...(option?{delivery_charges:tariffRate(option,customer_tier)}:{})});
          }}>
            <option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option>
          </select>
          <span className="mt-1 block text-[9px] leading-4 text-[#8db4ce]">
            {row.customer_tier === "STANDARD" ? `Standard · ${tierRule.included_kg ?? 3} kg included` : row.customer_tier === "ROYAL" ? `Royal · ${tierRule.included_kg ?? 5} kg included` : `Commitment · ${tierRule.included_kg ?? 5} kg included · ${tierRule.commitment_min_ways ?? 1500} ways target`}
            {tierRule.extra_per_kg != null ? ` · ${money(tierRule.extra_per_kg)} per started extra kg` : ""}
            {row.tier_override ? " · Authorized parcel override" : tierAccess?.registered ? " · Merchant profile" : " · Operator selection"}
          </span>
        </Field>
        <Field label="ဝန်ဆောင်မှုအမျိုးအစား">
          <select className={`${inputClass} !bg-white !text-black`} value={row.service_type} onChange={(e)=>updateRow(index,{service_type:e.target.value})}>
            <option value="STANDARD">STANDARD</option>
            <option value="EXPRESS">EXPRESS</option>
            <option value="SAME_DAY">SAME DAY</option>
            <option value="NEXT_DAY">NEXT DAY</option>
            <option value="ECONOMY">ECONOMY</option>
          </select>
        </Field>
        <Field label="ငွေကောက်ခံပုံ">
          <select className={`${inputClass} !bg-white !text-black`} value={row.amount_entry_type} onChange={(e)=> {
            const next=e.target.value as AmountType;
            const patch:any={amount_entry_type:next};
            if(isExact(next)){patch.item_price="";patch.delivery_charges="";}
            else if(next==="DELIVERY_CHARGE_ONLY"){patch.item_price="";patch.merchant_stated_total_amount="";}
            else patch.merchant_stated_total_amount="";
            const nextRow={...row,...patch};
            const nextRoute=routeForRow(nextRow,tariffOptions);
            updateRow(index,{...patch,...routingPatch(nextRoute,nextRow),message:providerRoutingMessage(nextRoute)});
          }}>
            {AMOUNT_TYPES.map(v=><option key={v} value={v}>{COLLECTION_METHOD_MY[v]}</option>)}
          </select>
        </Field>
      </div>

      {route.stationRequired?<div data-highway-station-selection-v19="true" className="mt-4 rounded-xl border border-amber-300/40 bg-amber-400/10 p-4">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Highway bus-station handoff / အဝေးပြေးဂိတ်ချ</div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <Field label="Handoff station">
            <select className={`${inputClass} !bg-white !text-black`} value={row.handoffStationCode} onChange={(event)=>{
              const handoffStationCode=event.target.value;
              const known=DATA_ENTRY_HANDOFF_STATIONS.find((station)=>station.code===handoffStationCode);
              updateRow(index,{
                handoffStationCode,
                handoffStationName:handoffStationCode==="OTHER"?row.handoffStationName:(known?.name||""),
                message:handoffStationCode?"Highway handoff station selected. Save will retain this audited station assignment.":"Choose the physical highway handoff station before saving.",
              });
            }}>
              <option value="">Choose the physical station…</option>
              {DATA_ENTRY_HANDOFF_STATIONS.map((station)=><option key={station.code} value={station.code}>{station.name}</option>)}
            </select>
          </Field>
          {row.handoffStationCode==="OTHER"?<Field label="Other station name">
            <input className={inputClass} value={row.handoffStationName} onChange={(event)=>updateRow(index,{handoffStationName:event.target.value})} placeholder="Enter the exact station / gate name"/>
          </Field>:<div className="rounded-lg border border-amber-300/25 bg-[#061524] px-3 py-2 text-[11px] text-amber-100">{row.handoffStationName||"A station must be selected because this outside-core parcel has no item price."}</div>}
        </div>
        {!stationReady?<div className="mt-2 text-[10px] font-bold text-rose-300">Select Aung Mingalar, Dagon Ayar/Thiri, or enter another station name before Calculate/Save.</div>:null}
      </div>:null}

      <DataEntryLocationEditor
        pickupId={row.pickup_id}
        parcelSequence={row.parcel_sequence}
        deliveryWayId={row.delivery_way_id}
        address={row.delivery_address}
        township={row.township}
        autoResolveDelayMs={row.importedFromOs?Math.min(900+index*120,5000):900}
        deferInteractiveMap={row.importedFromOs}
        deferAutomaticResolution={row.importedFromOs}
        externalResolutionStatus={row.locationStatus}
        enabled={route.mapRequired}
        disabledReason={route.stationRequired
          ?"Google Map is temporarily disabled for outside-core highway-terminal handoffs. Select the physical bus station instead."
          :"Google Map is temporarily disabled for outside-core Royal Express routes. No Britium Wayplan coordinate is required."}
        reloadToken={locationReloadToken}
        onResolutionChange={(locationStatus)=>updateRow(index,{locationStatus})}
        onCandidateChange={(locationCandidate)=>updateRow(index,{locationCandidate})}
      />

      <div className="mt-4 rounded-xl border border-[#f6b84b]/25 bg-[#1d2b37] p-4">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">ငွေကောက်ခံရန် ညွှန်ကြားချက်</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {!isExact(type) && type!=="DELIVERY_CHARGE_ONLY" ? <Field label="ပစ္စည်းတန်ဖိုး"><input type="number" className={inputClass} value={row.item_price} onChange={(e)=>{
            const item_price=e.target.value===""?"":Number(e.target.value);
            const nextRow={...row,item_price};
            const nextRoute=routeForRow(nextRow,tariffOptions);
            updateRow(index,{item_price,...routingPatch(nextRoute,nextRow),message:providerRoutingMessage(nextRoute)});
          }}/></Field>:null}
          {!isExact(type) ? <Field label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ"><input type="number" className={inputClass} value={row.delivery_charges} onChange={(e)=>updateRow(index,{delivery_charges:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}
          {isExact(type) ? <Field label="အတိအကျ / COD စုစုပေါင်းကောက်ခံငွေ"><input type="number" className={inputClass} value={row.merchant_stated_total_amount} onChange={(e)=>updateRow(index,{merchant_stated_total_amount:e.target.value===""?"":Number(e.target.value)})}/></Field>:null}
          <Field label="CBM ထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.cbm_surcharge} onChange={(e)=>updateRow(index,{cbm_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>
          <Field label="အခြားထပ်ဆောင်းခ"><input type="number" className={inputClass} value={row.other_surcharge} onChange={(e)=>updateRow(index,{other_surcharge:e.target.value===""?"":Number(e.target.value)})}/></Field>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#3aa7de]/25 bg-[#071b2b] p-4">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#64c8ff]">နောက်ခံစနစ် ငွေရှင်းတမ်း</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MoneyBox label="လက်ခံသူထံမှ ကောက်ခံငွေ / COD" value={c.cod_amount} highlight />
          <MoneyBox label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ" value={c.delivery_charges ?? row.delivery_charges} />
          <MoneyBox label="နောက်ခံစနစ် ထပ်ဆောင်းပို့ဆောင်ခ" value={c.backend_calculated_delivery_surcharges} />
          <MoneyBox label="လက်ခံသူ၏ ပို့ဆောင်ခအစိတ်အပိုင်း" value={c.customer_payable_delivery_component ?? c.effective_declared_delivery_charge} highlight />
          <MoneyBox label="အခြေခံပို့ဆောင်ခ" value={c.base_tariff} />
          <MoneyBox label="အလေးချိန်ထပ်ဆောင်းခ" value={c.weight_surcharge} />
          <MoneyBox label="Britium ရပိုင်ခွင့်" value={c.net_system_delivery_charge} highlight />
          <MoneyBox label="ပို့ဆောင်ခကွာခြားချက်" value={c.delivery_difference} />
          <MoneyBox label="ကုန်သည်နောက်ဆုံးရှင်းတမ်း" value={c.merchant_final_settlement_amount} highlight />
        </div>
        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-[10px] leading-5 text-cyan-100">
          {isExact(type)
            ? "Exact collection: customer COD is the entered exact total. Merchant settlement = exact total − Britium entitlement − merchant charges + merchant credits."
            : "Receiver delivery = merchant-declared delivery + weight/CBM/other delivery surcharges. Merchant settlement = item value + (receiver delivery − Britium entitlement) − merchant charges + merchant credits. A negative difference is deducted from the merchant, never added to the receiver."}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={serverClass}>ငွေရှင်းတမ်းဦးတည်ချက်: <b>{text(c.settlement_direction)||"—"}</b></div>
          <div className={serverClass}>ကုန်သည်ပြင်ဆင်ငွေ: <b>{money(c.merchant_settlement_adjustment)}</b></div>
          <div className={serverClass}>စစ်ဆေးမှု: <b>{text(c.validation_status)||"NOT CALCULATED"}</b></div>
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
  const [rowsPickupId,setRowsPickupId]=useState("");
  const [bulkImportDrafts,setBulkImportDrafts]=useState<Record<string,BulkImportDraft>>({});
  const [bulkImportOrder,setBulkImportOrder]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadingRows,setLoadingRows]=useState(false);
  const [message,setMessage]=useState("");
  const [fullRegistration,setFullRegistration]=useState(false);
  const [waybillBusy,setWaybillBusy]=useState(false);
  const [waybillMessage,setWaybillMessage]=useState("");
  const [waybillMessageKind,setWaybillMessageKind]=useState<"SUCCESS"|"ERROR">("SUCCESS");
  const [locationReloadToken,setLocationReloadToken]=useState(0);
  const [tariffOptions,setTariffOptions]=useState<TariffOption[]>([]);
  const [providerOptions,setProviderOptions]=useState<ProviderOption[]>([]);
  const [tierAccess,setTierAccess]=useState<MerchantTierAccess>({
    merchant_id:"",registered:false,profile_tier:"",resolved_customer_tier:"STANDARD",
    can_select_tier:true,can_override_profile_tier:false,tier_rules:{}
  });
  const [downloadFrom,setDownloadFrom]=useState("");
  const [downloadTo,setDownloadTo]=useState("");
  const [downloadScope,setDownloadScope]=useState<"ALL"|"CURRENT_PICKUP">("ALL");
  const [downloadBusy,setDownloadBusy]=useState(false);
  const [downloadMessage,setDownloadMessage]=useState("");
  const [bulkCalculating,setBulkCalculating]=useState(false);
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkMessage,setBulkMessage]=useState("");
  const [additionalCount,setAdditionalCount]=useState(1);
  const [additionalReason,setAdditionalReason]=useState("");
  const [addingRegistration,setAddingRegistration]=useState(false);
  const [locationReviewBusy,setLocationReviewBusy]=useState(false);
  const [visibleRowCount,setVisibleRowCount]=useState(20);
  const locationReviewInputRef=useRef<HTMLInputElement|null>(null);

  const selectedPickup=useMemo(()=>pickups.find(p=>p.pickup_id===selectedPickupId)||null,[pickups,selectedPickupId]);
  const bulkUploadSelected=selectedPickupId===BULK_UPLOAD_PICKUP_ID;
  const sequenceFloorByPickup=useMemo(()=>Object.fromEntries(pickups.map((pickup)=>{
    const draft=bulkImportDrafts[pickup.pickup_id];
    const draftMaximum=draft?.rows.reduce((maximum,row)=>Math.max(maximum,row.parcel_sequence),0)||0;
    return [pickup.pickup_id,Math.max(pickup.registered_parcels,draftMaximum)];
  })),[bulkImportDrafts,pickups]);
  const importedLocationSummary=useMemo(()=>{
    const summary={total:0,synced:0,notRequired:0,resolving:0,review:0};
    for(const row of rows){
      if(!row.importedFromOs) continue;
      summary.total+=1;
      if(row.locationStatus==="SYNCED") summary.synced+=1;
      else if(row.locationStatus==="NOT_REQUIRED") summary.notRequired+=1;
      else if(row.locationStatus==="REVIEW_REQUIRED") summary.review+=1;
      else summary.resolving+=1;
    }
    return summary;
  },[rows]);
  const consolidatedLocationReviewRows=useMemo(()=>{
    const combined=[...Object.values(bulkImportDrafts).flatMap((draft)=>draft.rows),...rows];
    const unique=new Map<string,ParcelRow>();
    for(const row of combined) unique.set(`${row.pickup_id}:${row.parcel_sequence}`,row);
    return [...unique.values()].filter((row)=>
      routeForRow(row,tariffOptions).mapRequired&&row.locationStatus==="REVIEW_REQUIRED"
    );
  },[bulkImportDrafts,rows,tariffOptions]);

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
      let resolvedMutationMode=text(s.raw?.mutation_mode||s.data?.mutation_mode);
      const runtimeResponse=await (supabase as any).rpc("be_data_entry_financial_v2_runtime_state");
      if(!runtimeResponse.error){
        const runtime=envelope(runtimeResponse.data);
        if(runtime.ok) resolvedMutationMode=text(runtime.raw?.mutation_mode||runtime.data?.mutation_mode)||resolvedMutationMode;
      }else{
        console.warn("Financial V2 runtime state RPC unavailable; using the schema response fallback.",runtimeResponse.error.message);
      }
      setMutationMode(resolvedMutationMode||"MUTATION_SHADOW");
      const tariffResponse=await (supabase as any).rpc("be_data_entry_tariff_options");
      if(tariffResponse.error) throw tariffResponse.error;
      setTariffOptions(Array.isArray(tariffResponse.data)?tariffResponse.data:[]);
      const providerResponse=await (supabase as any).rpc("be_data_entry_service_provider_options_v13");
      if(providerResponse.error) throw providerResponse.error;
      setProviderOptions(Array.isArray(providerResponse.data)?providerResponse.data:[]);

      let p=await (supabase as any).rpc("be_data_entry_pickup_list_web_v16",{p_limit:200});
      if(p.error) p=await (supabase as any).rpc("be_data_entry_pickup_list_web_v16");
      if(p.error) throw p.error;
      const source=Array.isArray(p.data)?p.data:(Array.isArray(p.data?.data)?p.data.data:[]);
      const normalized=source.map(normalizePickup).filter(Boolean) as Pickup[];
      const registeredByPickup=new Map<string,Set<number>>();
      for(let offset=0;offset<normalized.length;offset+=50){
        const pickupIds=normalized.slice(offset,offset+50).map((pickup)=>pickup.pickup_id);
        let page=0;
        while(pickupIds.length){
          const registrationResponse=await (supabase as any)
            .from("be_data_entry_parcel_details")
            .select("pickup_id,parcel_sequence")
            .in("pickup_id",pickupIds)
            .order("pickup_id",{ascending:true})
            .order("parcel_sequence",{ascending:true})
            .range(page*1000,page*1000+999);
          if(registrationResponse.error){
            console.warn("Registered Data Entry counts could not be refreshed.",registrationResponse.error.message);
            break;
          }
          const registrations=Array.isArray(registrationResponse.data)?registrationResponse.data:[];
          registrations.forEach((registration:any)=>{
            const pickupId=text(registration.pickup_id);
            const sequence=positiveInt(registration.parcel_sequence);
            if(!pickupId||!sequence) return;
            const values=registeredByPickup.get(pickupId)||new Set<number>();
            values.add(sequence);
            registeredByPickup.set(pickupId,values);
          });
          if(registrations.length<1000) break;
          page+=1;
        }
      }
      const withRegisteredCounts=normalized.map((pickup)=>({
        ...pickup,
        registered_parcels:registeredByPickup.get(pickup.pickup_id)?.size??pickup.registered_parcels,
      }));
      setPickups(withRegisteredCounts);
      setSelectedPickupId(current=>current===BULK_UPLOAD_PICKUP_ID||withRegisteredCounts.some(x=>x.pickup_id===current)?current:(withRegisteredCounts[0]?.pickup_id||""));
    }catch(error:any){setMessage(error?.message||"Unable to load Financial V2.");}
    finally{setLoading(false);}
  }

  async function fetchPickupWorkspace(pickup:Pickup):Promise<{tierAccess:MerchantTierAccess;rows:ParcelRow[]}>{
    const proofSources = [
      "be_data_entry_parcel_details",
      "be_v_data_entry_parcel_proofs",
      "be_v_data_entry_parcel_rows",
      "be_pickup_parcel_verifications",
    ];
    const [tierResponse,proofResponses]=await Promise.all([
      (supabase as any).rpc("be_data_entry_merchant_tier_access_v13",{p_merchant_id:pickup.merchant_id}),
      Promise.all(proofSources.map(async (source)=>({
        source,
        response:await (supabase as any)
          .from(source)
          .select("*")
          .eq("pickup_id",pickup.pickup_id)
          .order("parcel_sequence",{ascending:true}),
      }))),
    ]);
    if(tierResponse.error) throw tierResponse.error;
    if(tierResponse.data?.ok===false) throw new Error(tierResponse.data?.message||"Merchant tier access could not be resolved.");
    const nextTierAccess:MerchantTierAccess={
      merchant_id:text(tierResponse.data?.merchant_id||pickup.merchant_id),
      registered:Boolean(tierResponse.data?.registered),
      profile_tier:text(tierResponse.data?.profile_tier).toUpperCase(),
      resolved_customer_tier:text(tierResponse.data?.resolved_customer_tier||"STANDARD").toUpperCase(),
      can_select_tier:Boolean(tierResponse.data?.can_select_tier),
      can_override_profile_tier:Boolean(tierResponse.data?.can_override_profile_tier),
      tier_rules:tierResponse.data?.tier_rules||{},
    };
    const proofs:any[]=[];
    let lastProofError="";
    for(const {source,response} of proofResponses){
      if(response.error){lastProofError=`${source}: ${response.error.message}`;continue;}
      if(Array.isArray(response.data)&&response.data.length){
        proofs.push(...response.data);
        console.info(`Data Entry evidence: ${response.data.length} row(s) loaded from ${source}`);
      }
    }
    if(!proofs.length&&lastProofError) console.warn("No Data Entry proof rows loaded.",lastProofError);
    const resolvedProofs=await Promise.all(proofs.map(async (proof:any)=>({
      ...proof,
      __proof_ref:proofUrl(proof),
      __proof_url:await displayPhotoUrl(proofUrl(proof)),
    })));
    const observedCount=resolvedProofs.reduce((maximum:number,item:any)=>Math.max(maximum,positiveInt(item.parcel_sequence)),0);
    const count=authorizedParcelCount(pickup,observedCount);
    if(!count) throw new Error(`Pickup ${pickup.pickup_id} has no authoritative parcel count. Registration is blocked.`);
    const nextRows=Array.from({length:count},(_,offset)=>{
      const sequence=offset+1;
      const proof=resolvedProofs
        .filter((item:any)=>positiveInt(item.parcel_sequence)===sequence)
        .reduce((merged:any,item:any)=>{
          for(const [key,value] of Object.entries(item)){
            if(value!==null&&value!==undefined&&value!=="") merged[key]=value;
          }
          return merged;
        },{});
      const row=parcelRowFromProof(pickup,nextTierAccess,proof,sequence);
      const route=resolveDataEntryServiceProvider(row.township,row.delivery_address,tariffOptions,{fallbackUnknownToRoyal:true,itemPrice:row.item_price});
      const option=route.option as TariffOption|null;
      if(!route.providerCode) return row;
      return {
        ...row,
        ...routingPatch(route,row),
        ...(option&&row.delivery_charges===""?{delivery_charges:tariffRate(option,row.customer_tier)}:{}),
      };
    });
    return {tierAccess:nextTierAccess,rows:nextRows};
  }

  async function loadPickupRows(pickup:Pickup){
    setLoadingRows(true); setMessage("");
    try{
      const workspace=await fetchPickupWorkspace(pickup);
      setTierAccess(workspace.tierAccess);
      setRows(workspace.rows);
      setRowsPickupId(pickup.pickup_id);
    }catch(error:any){setRows([]);setRowsPickupId("");setMessage(error?.message||"Unable to load pickup proof rows.");}
    finally{setLoadingRows(false);}
  }

  async function calculateRow(index:number):Promise<boolean>{
    if(!selectedPickup) return false;
    const row=rows[index]; if(!row) return false;
    updateRow(index,{calculating:true,calculation:{},message:""});
    try{
      const r=await (supabase as any).rpc("be_data_entry_financial_v2_calculate",{p_payload:payload(row,selectedPickup)});
      if(r.error) throw r.error;
      const e=envelope(r.data);
      const resolution=e.raw?.server_resolution||{};
      const resolvedTier=text(resolution.resolved_customer_tier||e.data?.customer_tier).toUpperCase();
      const resolvedProvider=text(e.data?.service_provider_code||resolution.service_provider_code).toUpperCase();
      const resolvedRegion=text(e.data?.delivery_region||resolution.delivery_region).toUpperCase() as DataEntryRouteRegion;
      const resolvedMode=text(e.data?.delivery_route_mode||resolution.delivery_route_mode).toUpperCase() as DataEntryDeliveryMode;
      updateRow(index,{
        calculating:false,
        calculation:{...e.data,server_resolution:resolution},
        ...(resolvedTier?{customer_tier:resolvedTier}:{}),
        ...(resolvedProvider?{service_provider_code:resolvedProvider}:{}),
        ...(resolvedRegion?{deliveryRegion:resolvedRegion}:{}),
        ...(resolvedMode?{deliveryMode:resolvedMode}:{}),
        message:e.ok
          ? `Calculation completed. Tier source: ${text(resolution.customer_tier_source)||"server"}.`
          :(envelopeMessage(e)||"Calculation failed.")
      });
      return e.ok;
    }catch(error:any){
      updateRow(index,{calculating:false,message:error?.message||"Backend calculation failed."});
      return false;
    }
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

  async function saveRow(index:number){
    if(!selectedPickup) return;
    const row=rows[index]; if(!row) return;

    if (!row.isAdditionalRegistration && !row.photoUnavailableAcknowledged && !row.proof_ref) {
      updateRow(index,{message:"No stored parcel photo reference exists. Photo capture/re-upload is required before saving."});
      return;
    }
    if (!row.isAdditionalRegistration && !row.photoUnavailableAcknowledged && !row.photoReviewed) {
      updateRow(index, {
        message:
          "Approve the parcel photo before Save. Reject unavailable, wrong, unclear, or unrelated images and request re-upload.",
      });
      return;
    }
    if(row.photoUnavailableAcknowledged && (!row.importedFromOs || !row.sourceFileName || row.photoBypassReason.trim().length<10)){
      updateRow(index,{message:"OS softcopy photo bypass requires an imported source file and a clear reason of at least 10 characters."});
      return;
    }
    const route=routeForRow(row,tariffOptions);
    if(!route.providerCode){
      updateRow(index,{message:"Enter a recognized township before saving so the delivery route can be assigned."});
      return;
    }
    if(!handoffStationReady(row,route)){
      updateRow(index,{message:"Choose the physical highway bus station before saving this no-item-price outside-core parcel."});
      return;
    }
    if(route.mapRequired && row.locationStatus!=="SYNCED"){
      updateRow(index,{message:"This Yangon, Mandalay, or Naypyitaw drop point must be synchronized in Google Location Details before saving."});
      return;
    }

    updateRow(index,{checking:true,message:""});
    try{
      const r=await (supabase as any).rpc("be_data_entry_financial_v2_save",{p_payload:{...payload(row,selectedPickup),request_id:requestId("FINANCIAL_V2_SAVE"),dry_run:false,source_file_name:row.sourceFileName||"PORTAL_FINANCIAL_V2_LIVE",reason:row.photoUnavailableAcknowledged?row.photoBypassReason:row.isAdditionalRegistration?"AUTHORIZED_MERCHANT_ADDITION_SAVE":"PORTAL_FINANCIAL_V2_SAVE",destination:selectedPickup.city||null}});
      if(r.error) throw r.error;
      const e=envelope(r.data);
      if(!e.ok || r.data?.persisted===false) throw new Error(envelopeMessage(e)||"Live save was not confirmed.");
      updateRow(index,{
        checking:false,
        saved:true,
        delivery_way_id:text(r.data?.canonical_way_id||e.data?.canonical_way_id||row.delivery_way_id||`${selectedPickup.pickup_id}-${String(row.parcel_sequence).padStart(3,"0")}`),
        calculation:{...row.calculation,...e.data},
        message:"Saved successfully with backend calculation and audit lineage."
      });
      setPickups((current)=>current.map((pickup)=>pickup.pickup_id===row.pickup_id?{...pickup,registered_parcels:Math.max(pickup.registered_parcels,row.parcel_sequence)}:pickup));
    }catch(error:any){updateRow(index,{checking:false,message:error?.message||"Save failed."});}
  }

  async function calculateAll(){
    if(!rows.length || bulkCalculating) return;
    setBulkCalculating(true);
    setBulkMessage("");
    try{
      let calculated=0;
      for(let i=0;i<rows.length;i+=1){
        if(await calculateRow(i)) calculated+=1;
      }
      setBulkMessage(calculated===rows.length
        ? `Calculated all ${rows.length} authorized registration row(s).`
        : `Calculated ${calculated} of ${rows.length} row(s). Review the failed rows before Save All.`
      );
    }finally{
      setBulkCalculating(false);
    }
  }

  function requireSaveReady(){
    if(!selectedPickup || !rows.length) throw new Error("Select a pickup with authorized registration rows first.");
    const blocked=rows.find((row)=>!row.isAdditionalRegistration && !row.photoReviewed && !row.photoUnavailableAcknowledged);
    if(blocked) throw new Error(`Parcel ${blocked.parcel_sequence}: approve the Rider or Driver photo before saving.`);
    const invalidBypass=rows.find((row)=>row.photoUnavailableAcknowledged&&(!row.importedFromOs||!row.sourceFileName||row.photoBypassReason.trim().length<10));
    if(invalidBypass) throw new Error(`Parcel ${invalidBypass.parcel_sequence}: OS softcopy photo bypass is missing its source file or audited reason.`);
    const unresolvedRoutes=rows.filter((row)=>!routeForRow(row,tariffOptions).providerCode);
    if(unresolvedRoutes.length) throw new Error(`Parcel ${unresolvedRoutes[0].parcel_sequence}: enter a recognized township so the delivery provider can be assigned.`);
    const missingStations=rows.filter((row)=>!handoffStationReady(row,routeForRow(row,tariffOptions)));
    if(missingStations.length){
      const first=missingStations[0];
      const firstIndex=rows.findIndex((item)=>item.pickup_id===first.pickup_id&&item.parcel_sequence===first.parcel_sequence);
      setVisibleRowCount((current)=>Math.max(current,firstIndex+1));
      window.setTimeout(()=>document.getElementById(`data-entry-parcel-${first.parcel_sequence}`)?.scrollIntoView({behavior:"smooth",block:"start"}),0);
      throw new Error(`Parcel ${first.parcel_sequence}: choose Aung Mingalar, Dagon Ayar/Thiri, or enter the other highway station before saving.`);
    }
    const mapLocations=rows.filter((row)=>routeForRow(row,tariffOptions).mapRequired);
    const unresolvedLocations=mapLocations.filter((row)=>row.locationStatus!=="SYNCED");
    if(unresolvedLocations.length){
      const first=unresolvedLocations[0];
      const resolving=unresolvedLocations.filter((row)=>row.locationStatus==="PENDING"||row.locationStatus==="SEARCHING").length;
      const review=unresolvedLocations.filter((row)=>row.locationStatus==="REVIEW_REQUIRED").length;
      const firstIndex=rows.findIndex((item)=>item.pickup_id===first.pickup_id&&item.parcel_sequence===first.parcel_sequence);
      setVisibleRowCount((current)=>Math.max(current,firstIndex+1));
      window.setTimeout(()=>document.getElementById(`data-entry-parcel-${first.parcel_sequence}`)?.scrollIntoView({behavior:"smooth",block:"start"}),0);
      throw new Error(`Core-region location sync incomplete: ${mapLocations.length-unresolvedLocations.length}/${mapLocations.length} synchronized, ${resolving} still resolving, ${review} need review. Parcel ${first.parcel_sequence} is the first unresolved row; use Retry Location Sync or Apply coordinates for a corrected pin.`);
    }
  }

  async function persistAllRows(reason:string){
    requireSaveReady();
    if(!selectedPickup) throw new Error("Select a pickup first.");
    const response=await (supabase as any).rpc("be_data_entry_financial_v2_save_batch_v22",{p_payload:{
      request_id:requestId("FINANCIAL_V2_SAVE_ALL"),
      pickup_id:selectedPickup.pickup_id,
      reason,
      rows:rows.map((row)=>({
        ...payload(row,selectedPickup),
        destination:selectedPickup.city||null,
      })),
    }});
    if(response.error) throw response.error;
    const result=response.data||{};
    if(!result.ok || result.persisted===false){
      const e=envelope(result);
      throw new Error(envelopeMessage(e)||result?.errors?.[0]?.message||"Save All was not confirmed.");
    }
    const savedResults=Array.isArray(result.rows)?result.rows:[];
    setRows((current)=>current.map((row,index)=>({
      ...row,
      saved:true,
      delivery_way_id:text(savedResults[index]?.canonical_way_id||row.delivery_way_id||`${row.pickup_id}-${String(row.parcel_sequence).padStart(3,"0")}`),
      calculation:{...row.calculation,...(savedResults[index]?.data||{})},
      message:"Saved by the atomic Save All operation.",
    })));
    const maximumSavedSequence=rows.reduce((maximum,row)=>Math.max(maximum,row.parcel_sequence),0);
    setPickups((current)=>current.map((pickup)=>pickup.pickup_id===selectedPickup.pickup_id?{...pickup,registered_parcels:Math.max(pickup.registered_parcels,maximumSavedSequence)}:pickup));
    return result;
  }

  async function saveAll(){
    if(bulkSaving) return;
    setBulkSaving(true);
    setBulkMessage("");
    try{
      const result=await persistAllRows("PORTAL_FINANCIAL_V2_SAVE_ALL");
      if(selectedPickup){
        setBulkImportDrafts((current)=>{
          const draft=current[selectedPickup.pickup_id];
          return draft?{...current,[selectedPickup.pickup_id]:{...draft,saved:true}}:current;
        });
      }
      setBulkMessage(`Saved all ${Number(result.saved_count||rows.length)} row(s). The batch was committed atomically.`);
    }catch(error:any){
      setBulkMessage(error?.message||"Save All failed. No partial batch was kept.");
    }finally{
      setBulkSaving(false);
    }
  }

  async function authorizeImportedRows(pickup:Pickup,count:number,fileName:string,observedCount=0):Promise<number>{
    let remaining=count;
    let authorized=authorizedParcelCount(pickup,observedCount);
    while(remaining>0){
      const chunk=Math.min(50,remaining);
      const response=await (supabase as any).rpc("be_data_entry_financial_v2_add_registrations",{p_payload:{
        request_id:requestId("DATA_ENTRY_OS_IMPORT_ADD_REGISTRATIONS"),
        pickup_id:pickup.pickup_id,
        count:chunk,
        reason:`OS softcopy ${fileName}: merchant supplied ${count} additional item(s) beyond the authorized pickup quantity.`,
      }});
      if(response.error) throw response.error;
      const result=response.data||{};
      if(!result.ok||result.persisted===false) throw new Error(result?.errors?.[0]?.message||"OS import could not authorize its additional registration rows.");
      authorized=positiveInt(result.authorized_parcels)||authorized+chunk;
      remaining-=chunk;
    }
    setPickups((current)=>current.map((item)=>item.pickup_id===pickup.pickup_id?{...item,verified_parcels:authorized}:item));
    return authorized;
  }

  function fillImportedPickupRows(
    pickup:Pickup,
    existingRows:ParcelRow[],
    pickupTierAccess:MerchantTierAccess,
    sourceRows:OsImportRow[],
    importPayload:OsImportApplyPayload,
    authorized:number,
  ){
    const maxSequence=Math.max(...sourceRows.map((row)=>positiveInt(row.targetSequence)));
    const sourceBySequence=new Map(sourceRows.map((row)=>[row.targetSequence,row]));
    const existingBySequence=new Map(existingRows.map((row)=>[row.parcel_sequence,row]));
    const targetCount=Math.max(authorized,existingRows.length,maxSequence);
    const filled:ParcelRow[]=Array.from({length:targetCount},(_,offset):ParcelRow=>{
      const sequence=offset+1;
      const existing=existingBySequence.get(sequence)||parcelRowFromProof(pickup,pickupTierAccess,{},sequence);
      const sourceRow=sourceBySequence.get(sequence);
      if(!sourceRow) return existing;
      const requestedTier=text(sourceRow.merchantTier||"STANDARD").toUpperCase();
      const customerTier=pickupTierAccess.can_select_tier
        ? requestedTier
        : pickupTierAccess.resolved_customer_tier||"STANDARD";
      const amountType=(AMOUNT_TYPES.includes(sourceRow.paymentType as AmountType)
        ?sourceRow.paymentType
        :"ITEM_PRICE_PLUS_DECLARED_DELIVERY") as AmountType;
      const routedItemPrice=amountType==="ITEM_PRICE_PLUS_DECLARED_DELIVERY"?sourceRow.itemPrice:"";
      const destination=resolveImportedDestination(sourceRow.townshipProvider,sourceRow.deliveryAddress,routedItemPrice,tariffOptions);
      const tariffOption=destination.option as TariffOption|null;
      const tariffDelivery:number|""=tariffOption?tariffRate(tariffOption,customerTier):"";
      const declaredDelivery:number|""=sourceRow.osSetPrice===""?tariffDelivery:sourceRow.osSetPrice;
      const exactValues=[sourceRow.itemPrice,sourceRow.osSetPrice]
        .filter((value):value is number=>value!==""&&Number.isFinite(Number(value)));
      const exactTotal:number|""=exactValues.length?exactValues.reduce((sum,value)=>sum+Number(value),0):"";
      const postalNote=destination.postal.matchLevel==="UNRESOLVED"
        ?"Township/postal match needs review."
        :`Township normalized from postal data (${destination.postal.matchLevel.replace(/_/g," ")}).`;
      return {
        ...existing,
        pickup_id:pickup.pickup_id,
        parcel_sequence:sequence,
        delivery_way_id:canonicalWayId(pickup.pickup_id,sequence),
        recipient_name:sourceRow.recipientName,
        recipient_phone:sourceRow.recipientPhone,
        township:destination.township,
        delivery_address:sourceRow.deliveryAddress,
        weight_kg:sourceRow.actualWeight,
        customer_tier:customerTier,
        tier_override:Boolean(pickupTierAccess.registered&&pickupTierAccess.profile_tier&&customerTier!==pickupTierAccess.profile_tier&&pickupTierAccess.can_override_profile_tier),
        service_provider_code:destination.providerCode,
        deliveryRegion:destination.routeRegion,
        deliveryMode:destination.deliveryMode,
        handoffStationCode:destination.stationRequired?existing.handoffStationCode:"",
        handoffStationName:destination.stationRequired?existing.handoffStationName:"",
        service_type:sourceRow.serviceType||"STANDARD",
        amount_entry_type:amountType,
        item_price:amountType==="ITEM_PRICE_PLUS_DECLARED_DELIVERY"?sourceRow.itemPrice:"",
        delivery_charges:amountType==="EXACT_COLLECTION_AMOUNT"?"":declaredDelivery,
        merchant_stated_total_amount:amountType==="EXACT_COLLECTION_AMOUNT"?exactTotal:"",
        remarks:[existing.remarks,`OS softcopy ${importPayload.fileName}, source row ${sourceRow.sourceRowNumber}, Way ID ${sourceRow.wayId||pickup.pickup_id}, merchant ${sourceRow.merchantName||pickup.merchant_id||pickup.merchant_name}.`].filter(Boolean).join(" "),
        calculation:{},
        calculating:false,
        checking:false,
        message:`Imported from spreadsheet row ${sourceRow.sourceRowNumber}. ${postalNote} ${destination.mapRequired?"Queued for consolidated Excel location review.":destination.stationRequired?"Choose the highway handoff station.":"Google Map is not required for this route."} Then Calculate All and Save All.`,
        photoReviewed:importPayload.skipPhotoReview?false:existing.photoReviewed,
        photoUnavailableAcknowledged:importPayload.skipPhotoReview,
        photoReviewStatus:importPayload.skipPhotoReview?"OS_SOFTCOPY_AUTHORIZED":existing.photoReviewStatus,
        isAdditionalRegistration:sequence>requestedParcelCount(pickup),
        importedFromOs:true,
        sourceFileName:importPayload.fileName,
        sourceRowNumber:sourceRow.sourceRowNumber,
        sourceRowCount:importPayload.sourceRowCount,
        photoEvidenceMode:importPayload.skipPhotoReview?"OS_SOFTCOPY":"PICKER_PHOTO",
        photoBypassReason:importPayload.skipPhotoReview?importPayload.photoBypassReason:"",
        locationStatus:(destination.mapRequired?"REVIEW_REQUIRED":"NOT_REQUIRED") as DataEntryLocationResolution,
        saved:false,
      };
    });
    const staged=importPayload.mode==="BULK_UPLOAD"
      ?filled.filter((row)=>sourceBySequence.has(row.parcel_sequence))
      :filled;
    return staged.sort((a,b)=>a.parcel_sequence-b.parcel_sequence);
  }

  async function applyOsImport(importPayload:OsImportApplyPayload){
    const batches=importPayload.batches.length
      ?importPayload.batches
      :[{targetPickupId:importPayload.targetPickupId,rows:importPayload.rows}];
    if(!batches.length||!importPayload.rows.length) throw new Error("No spreadsheet rows were selected for import.");
    if(importPayload.mode==="SINGLE_PICKUP"&&(!selectedPickup||importPayload.targetPickupId!==selectedPickup.pickup_id)){
      throw new Error("The target pickup changed while the spreadsheet was loading. Select it again and retry.");
    }

    const nextDrafts:Record<string,BulkImportDraft>={};
    for(const batch of batches){
      const pickup=pickups.find((candidate)=>candidate.pickup_id===batch.targetPickupId);
      if(!pickup) throw new Error(`Pickup ${batch.targetPickupId} is no longer eligible. Refresh and upload the spreadsheet again.`);
      const pendingDraft=bulkImportDrafts[pickup.pickup_id];
      if(importPayload.mode==="BULK_UPLOAD"&&pendingDraft&&!pendingDraft.saved){
        throw new Error(`Pickup ${pickup.pickup_id} still has an unsaved upload batch. Calculate and Save All before uploading its next batch.`);
      }
      const workspace=importPayload.mode==="SINGLE_PICKUP"&&rowsPickupId===pickup.pickup_id
        ?{tierAccess,rows}
        :await fetchPickupWorkspace(pickup);
      const maxSequence=Math.max(...batch.rows.map((row)=>positiveInt(row.targetSequence)));
      let authorized=authorizedParcelCount(pickup,workspace.rows.length);
      if(maxSequence>authorized){
        authorized=await authorizeImportedRows(pickup,maxSequence-authorized,importPayload.fileName,workspace.rows.length);
      }
      const nextPickup={...pickup,verified_parcels:Math.max(pickup.verified_parcels,authorized)};
      nextDrafts[pickup.pickup_id]={
        pickupId:pickup.pickup_id,
        fileName:importPayload.fileName,
        rows:fillImportedPickupRows(nextPickup,workspace.rows,workspace.tierAccess,batch.rows,importPayload,authorized),
        tierAccess:workspace.tierAccess,
        saved:false,
      };
    }

    const pickupOrder=batches.map((batch)=>batch.targetPickupId);
    const firstPickupId=pickupOrder[0];
    if(importPayload.mode==="BULK_UPLOAD"){
      setBulkImportDrafts((current)=>({...current,...nextDrafts}));
      setBulkImportOrder((current)=>[...current.filter((pickupId)=>!pickupOrder.includes(pickupId)),...pickupOrder]);
    }else{
      setBulkImportDrafts({});
      setBulkImportOrder([]);
    }
    const firstDraft=nextDrafts[firstPickupId];
    setSelectedPickupId(firstPickupId);
    setTierAccess(firstDraft.tierAccess);
    setRows(firstDraft.rows);
    setRowsPickupId(firstPickupId);
    setPickups((current)=>current.map((pickup)=>{
      const draft=nextDrafts[pickup.pickup_id];
      return draft?{...pickup,verified_parcels:Math.max(pickup.verified_parcels,draft.rows.length)}:pickup;
    }));
    setBulkMessage(importPayload.mode==="BULK_UPLOAD"
      ?`Bulk upload staged ${importPayload.rows.length} row(s) across ${pickupOrder.length} pickup(s). Review core-region Google pins and choose highway stations where requested; outside-core Royal routes skip Maps. ${importPayload.skipPhotoReview?"The audited OS-softcopy evidence option is active":"Picker-photo approval is still required"}.`
      :`Filled ${importPayload.rows.length} row(s) from ${importPayload.fileName}. Review Yangon/Mandalay/Naypyitaw Google pins and choose any required highway handoff stations; other outside-core routes skip Maps. ${importPayload.skipPhotoReview?"The audited OS-softcopy evidence option is active":"Picker-photo approval is still required"}. Then use Calculate All and Save All.`
    );
  }

  async function addRegistrations(){
    if(!selectedPickup || addingRegistration) return;
    const count=Math.trunc(Number(additionalCount));
    const reason=additionalReason.trim();
    if(!Number.isInteger(count) || count<1 || count>50){
      setBulkMessage("Enter an additional registration count from 1 to 50.");
      return;
    }
    if(!reason){
      setBulkMessage("Enter the merchant's reason for changing the pickup quantity.");
      return;
    }
    setAddingRegistration(true);
    setBulkMessage("");
    try{
      const response=await (supabase as any).rpc("be_data_entry_financial_v2_add_registrations",{p_payload:{
        request_id:requestId("DATA_ENTRY_ADD_REGISTRATIONS"),
        pickup_id:selectedPickup.pickup_id,
        count,
        reason,
      }});
      if(response.error) throw response.error;
      const result=response.data||{};
      if(!result.ok || result.persisted===false) throw new Error(result?.errors?.[0]?.message||"Additional registration authorization failed.");
      const sequences=(Array.isArray(result.sequences)?result.sequences:[]).map(positiveInt).filter(Boolean);
      const newAuthorized=positiveInt(result.authorized_parcels);
      setPickups((current)=>current.map((pickup)=>pickup.pickup_id===selectedPickup.pickup_id?{...pickup,verified_parcels:newAuthorized}:pickup));
      setRows((current)=>{
        const existing=new Set(current.map((row)=>row.parcel_sequence));
        const additions=sequences.filter((sequence:number)=>!existing.has(sequence)).map((sequence:number)=>parcelRowFromProof(
          {...selectedPickup,verified_parcels:newAuthorized},tierAccess,{},sequence
        ));
        return [...current,...additions].sort((a,b)=>a.parcel_sequence-b.parcel_sequence);
      });
      setAdditionalReason("");
      setAdditionalCount(1);
      setBulkMessage(`Authorized ${sequences.length} merchant-added registration(s): parcel ${sequences.join(", ")}.`);
    }catch(error:any){
      setBulkMessage(error?.message||"Unable to add the merchant-requested registrations.");
    }finally{
      setAddingRegistration(false);
    }
  }

  async function createAndGenerateWaybill(){
    if(!selectedPickupId) return;

    setWaybillBusy(true);
    setWaybillMessage("");
    setWaybillMessageKind("SUCCESS");

    try{
      await persistAllRows("SAVE_ALL_BEFORE_GENERATE_WAYBILL");

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
      setWaybillMessageKind("SUCCESS");
      window.setTimeout(()=>{
        window.location.hash=`#/waybill-studio?pickup_id=${encodeURIComponent(selectedPickupId)}&paper=4x6&printer=NIPPON_POS`;
      },350);
    }catch(error:any){
      setWaybillMessageKind("ERROR");
      setWaybillMessage(
        error?.message || "Waybill creation failed."
      );
    }finally{
      setWaybillBusy(false);
    }
  }


  function toDateTimeLocalValue(date:Date):string{
    const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60_000);
    return shifted.toISOString().slice(0,16);
  }

  function applyDownloadRange(range:"ALL"|"TODAY"|"LAST_24_HOURS"|"THIS_WEEK"|"THIS_MONTH"){
    if(range==="ALL"){
      setDownloadFrom("");
      setDownloadTo("");
      return;
    }
    const now=new Date();
    let from=new Date(now);
    if(range==="TODAY"){
      from.setHours(0,0,0,0);
    }else if(range==="LAST_24_HOURS"){
      from=new Date(now.getTime()-24*60*60*1000);
    }else if(range==="THIS_MONTH"){
      from=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
    }else{
      const day=(now.getDay()+6)%7;
      from.setDate(now.getDate()-day);
      from.setHours(0,0,0,0);
    }
    setDownloadFrom(toDateTimeLocalValue(from));
    setDownloadTo(toDateTimeLocalValue(now));
  }

  function exportDateTime(value:unknown):string{
    const raw=text(value).trim();
    if(!raw) return "";
    const date=new Date(raw);
    if(Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString("en-GB",{
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
    });
  }

  function exportCell(value:unknown):string|number|boolean{
    if(value==null) return "";
    if(typeof value==="string" || typeof value==="number" || typeof value==="boolean") return value;
    try{return JSON.stringify(value);}catch{return String(value);}
  }

  async function downloadDataEntryRegistration(){
    setDownloadBusy(true);
    setDownloadMessage("");
    try{
      const fromDate=downloadFrom?new Date(downloadFrom):null;
      const toDate=downloadTo?new Date(downloadTo):null;
      if(fromDate && Number.isNaN(fromDate.getTime())) throw new Error("Invalid From date/time.");
      if(toDate && Number.isNaN(toDate.getTime())) throw new Error("Invalid To date/time.");
      if(fromDate && toDate && fromDate.getTime()>toDate.getTime()) throw new Error("From date/time must be earlier than To date/time.");
      if(downloadScope==="CURRENT_PICKUP" && !selectedPickupId) throw new Error("Select a pickup before using Current pickup only.");

      const pageSize=1000;
      let offset=0;
      const records:any[]=[];
      while(true){
        let query:any=(supabase as any)
          .from("be_data_entry_parcel_details")
          .select("*")
          .order("saved_at",{ascending:true})
          .range(offset,offset+pageSize-1);
        if(fromDate) query=query.gte("saved_at",fromDate.toISOString());
        if(toDate) query=query.lte("saved_at",toDate.toISOString());
        if(downloadScope==="CURRENT_PICKUP") query=query.eq("pickup_id",selectedPickupId);
        const response=await query;
        if(response.error) throw response.error;
        const batch=Array.isArray(response.data)?response.data:[];
        records.push(...batch);
        if(batch.length<pageSize) break;
        offset+=pageSize;
      }

      if(!records.length){
        setDownloadMessage("No Data Entry registration records matched the selected timeline.");
        return;
      }

      const exportRows=records.map((row:any)=>({
        "Registration Saved Time":exportDateTime(row.saved_at),
        "Saved By":text(row.saved_by_email),
        "Pickup ID":text(row.pickup_id),
        "Parcel Sequence":row.parcel_sequence??"",
        "Delivery Way ID":text(row.delivery_way_id),
        "Way ID":text(row.way_id),
        "Merchant ID":text(row.merchant_id),
        "Customer ID":text(row.customer_id),
        "Recipient Name":text(row.recipient_name),
        "Contact 1":text(row.contact_no_1),
        "Contact 2":text(row.contact_no_2),
        "Township":text(row.township),
        "Township Key":text(row.township_key),
        "City":text(row.city),
        "State / Region":text(row.region_state),
        "Recipient Address":text(row.recipient_address),
        "Customer Tier":text(row.customer_tier),
        "Service Provider":text(row.financial_quote?.service_provider_code),
        "Delivery Region":text(row.delivery_region||row.financial_quote?.delivery_region),
        "Delivery Route Mode":text(row.delivery_route_mode||row.financial_quote?.delivery_route_mode),
        "Google Location Required":row.location_required??row.financial_quote?.location_required??"",
        "Highway Handoff Station Code":text(row.handoff_station_code||row.financial_quote?.handoff_station_code),
        "Highway Handoff Station Name":text(row.handoff_station_name||row.financial_quote?.handoff_station_name),
        "Service Type":text(row.service_type||row.financial_quote?.service_type),
        "Weight (kg)":row.weight_kg??"",
        "Chargeable Weight (kg)":row.chargeable_weight_kg??"",
        "Included Weight (kg)":row.included_kg??"",
        "Extra Weight (kg)":row.extra_kg??"",
        "Amount Entry Type":text(row.amount_entry_type),
        "Item Price":row.item_price??"",
        "Delivery Charges":row.delivery_charges??row.delivery_fee??"",
        "COD Amount":row.cod_amount??"",
        "Actual Collect":row.actual_collect??"",
        "CBM Surcharge":row.cbm_surcharge??"",
        "Other Surcharge":row.other_surcharge??"",
        "Merchant Payable Charges":row.merchant_payable_charges??"",
        "Other Merchant Credits":row.other_merchant_credits??"",
        "Base Tariff":row.base_tariff??"",
        "Weight Surcharge":row.weight_surcharge??"",
        "Gross System Delivery Charge":row.gross_system_delivery_charge??"",
        "Commitment Refund":row.commitment_refund??"",
        "Net System Delivery Charge":row.net_system_delivery_charge??"",
        "Effective Declared Delivery Charge":row.effective_declared_delivery_charge??"",
        "Delivery Difference":row.delivery_difference??"",
        "Settlement Direction":text(row.settlement_direction),
        "Merchant Settlement Adjustment":row.merchant_settlement_adjustment??"",
        "Merchant Final Settlement":row.merchant_final_settlement_amount??"",
        "Financial Validation":text(row.financial_validation_status),
        "Financial Validation Message":text(row.financial_validation_message),
        "Financial Calculation Version":text(row.financial_calculation_version),
        "Financial Calculated At":exportDateTime(row.financial_calculated_at),
        "Parcel Status":text(row.parcel_status),
        "Print Status":text(row.print_status),
        "Warehouse Status":text(row.warehouse_status),
        "Way Management Status":text(row.way_management_status),
        "Finance Status":text(row.finance_status),
        "Assigned Rider":text(row.assigned_rider_name),
        "Supervisor Status":text(row.supervisor_status),
        "Remark":text(row.remark),
        "Proof Photo":text(row.proof_photo_path),
        "OS Softcopy Source File":text(row.source_file_name),
        "OS Softcopy Source Row":row.source_row_number??"",
        "Source Row Count":row.source_row_count??"",
        "Photo Evidence Mode":text(row.photo_evidence_mode),
        "Photo Bypass Reason":text(row.photo_bypass_reason),
        "OS Imported At":exportDateTime(row.os_imported_at),
        "OS Imported By":text(row.os_imported_by),
        "Financial Quote JSON":exportCell(row.financial_quote),
        "Created At":exportDateTime(row.created_at),
        "Updated At":exportDateTime(row.updated_at),
      }));

      const XLSX:any=await import("xlsx");
      const workbook=XLSX.utils.book_new();
      const worksheet=XLSX.utils.json_to_sheet(exportRows);
      const keys=Object.keys(exportRows[0]||{});
      worksheet["!cols"]=keys.map((key)=>{
        let width=Math.max(12,key.length+2);
        for(const item of exportRows.slice(0,250)) width=Math.max(width,String(item[key]??"").length+2);
        return {wch:Math.min(width,42)};
      });
      XLSX.utils.book_append_sheet(workbook,worksheet,"Data Entry Registration");

      const allFieldRows=records.map((row:any)=>Object.fromEntries(
        Object.entries(row).map(([key,value])=>[key,exportCell(value)])
      ));
      const allFieldsSheet=XLSX.utils.json_to_sheet(allFieldRows);
      const allFieldKeys=Object.keys(allFieldRows[0]||{});
      allFieldsSheet["!cols"]=allFieldKeys.map((key)=>({wch:Math.min(Math.max(14,key.length+2),42)}));
      XLSX.utils.book_append_sheet(workbook,allFieldsSheet,"All Registered Fields");

      const summaryRows=[
        {Field:"Report",Value:"Data Entry Registration Timeline Export"},
        {Field:"Generated At",Value:exportDateTime(new Date().toISOString())},
        {Field:"From",Value:downloadFrom||"All available history"},
        {Field:"To",Value:downloadTo||"Latest available"},
        {Field:"Scope",Value:downloadScope==="CURRENT_PICKUP"?("Current pickup: "+selectedPickupId):"All accessible Data Entry registrations"},
        {Field:"Timeline Field",Value:"saved_at (Data Entry registration saved time)"},
        {Field:"Workbook Detail",Value:"Friendly operational sheet plus every accessible stored field"},
        {Field:"Record Count",Value:records.length},
      ];
      const summarySheet=XLSX.utils.json_to_sheet(summaryRows);
      summarySheet["!cols"]=[{wch:22},{wch:48}];
      XLSX.utils.book_append_sheet(workbook,summarySheet,"Export Summary");

      const stamp=new Date().toISOString().replace(/[:T]/g,"-").slice(0,16);
      const scopePart=downloadScope==="CURRENT_PICKUP"?("_"+selectedPickupId.replace(/[^a-zA-Z0-9_-]/g,"-")):"";
      XLSX.writeFile(workbook,"Britium_Data_Entry_Registration"+scopePart+"_"+stamp+".xlsx",{compression:true});
      setDownloadMessage("Downloaded "+records.length.toLocaleString("en-US")+" Data Entry registration record(s).");
    }catch(error:any){
      setDownloadMessage(error?.message||"Unable to download Data Entry registration information.");
    }finally{
      setDownloadBusy(false);
    }
  }

  async function downloadConsolidatedLocationReview(){
    if(!consolidatedLocationReviewRows.length){
      setBulkMessage("There are no location-review rows to download.");
      return;
    }
    setLocationReviewBusy(true);
    setBulkMessage("");
    try{
      const XLSX:any=await import("xlsx");
      const exportRows=consolidatedLocationReviewRows.map((row)=>({
        "Delivery Way ID":row.delivery_way_id,
        "Pickup ID":row.pickup_id,
        "Parcel Sequence":row.parcel_sequence,
        "Recipient Name":row.recipient_name,
        "Township":row.township,
        "Delivery Address":row.delivery_address,
        "Suggested Latitude":row.locationCandidate?.latitude??"",
        "Suggested Longitude":row.locationCandidate?.longitude??"",
        "Corrected Latitude":"",
        "Corrected Longitude":"",
        "Action":"APPLY_CORRECTION",
        "Reason":"Location corrected through consolidated review workbook",
      }));
      const worksheet=XLSX.utils.json_to_sheet(exportRows);
      worksheet["!cols"]=[18,18,14,22,24,48,18,18,18,18,20,46].map((wch)=>({wch}));
      worksheet["!autofilter"]={ref:`A1:L${exportRows.length+1}`};
      const instructions=XLSX.utils.aoa_to_sheet([
        ["Britium Location Review Round-trip"],
        ["1", "For each APPLY_CORRECTION row, enter Corrected Latitude and Corrected Longitude."],
        ["2", "To accept the suggested pin without visual review, change Action to SKIP_REVIEW."],
        ["3", "Do not change Delivery Way ID, Pickup ID, or Parcel Sequence."],
        ["4", "Upload the completed workbook from the same Data Entry screen."],
        ["5", "Every change or skip is permission-checked and written to the audit trail."],
      ]);
      instructions["!cols"]=[8,100].map((wch)=>({wch}));
      const workbook=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook,worksheet,"Location Review");
      XLSX.utils.book_append_sheet(workbook,instructions,"Instructions");
      const stamp=new Date().toISOString().replace(/[:T]/g,"-").slice(0,16);
      XLSX.writeFile(workbook,`Britium_Consolidated_Location_Review_${stamp}.xlsx`,{compression:true});
      setBulkMessage(`Downloaded ${exportRows.length} location-review row(s) in one Excel workbook.`);
    }catch(error:any){
      setBulkMessage(error?.message||"Unable to download the consolidated location-review workbook.");
    }finally{
      setLocationReviewBusy(false);
    }
  }

  function applyLocationReviewResults(results:any[]){
    const resultById=new Map(results.map((result)=>[text(result.delivery_way_id),result]));
    const applyToRows=(sourceRows:ParcelRow[])=>sourceRows.map((row)=>{
      const result=resultById.get(row.delivery_way_id);
      if(!result) return row;
      const latitude=Number(result.latitude);
      const longitude=Number(result.longitude);
      const locationCandidate:DeliveryLocation={
        ...(row.locationCandidate||{
          deliveryWayId:row.delivery_way_id,label:row.delivery_address,originalAddress:row.delivery_address,
          englishAddress:row.delivery_address,township:row.township,matchLevel:"MANUAL",confidence:1,
        }),
        deliveryWayId:row.delivery_way_id,latitude,longitude,matchLevel:"MANUAL",confidence:1,
        coordinateSource:text(result.coordinate_source)||"DATA_ENTRY_MANUAL_BULK_CORRECTION",reviewStatus:"ACCEPTED",
      };
      return {...row,locationStatus:"SYNCED" as const,locationCandidate,message:"Location accepted from the consolidated review workbook and synchronized with Wayplan."};
    });
    setRows((current)=>applyToRows(current));
    setBulkImportDrafts((current)=>Object.fromEntries(Object.entries(current).map(([pickupId,draft])=>[
      pickupId,{...draft,rows:applyToRows(draft.rows)},
    ])));
  }

  async function skipAllLocationReviews(){
    const skippable=consolidatedLocationReviewRows.filter((row)=>
      row.locationCandidate&&validMyanmarCoordinate(row.locationCandidate.longitude,row.locationCandidate.latitude)
    );
    if(!skippable.length){
      setBulkMessage("No review row currently has a valid suggested pin to accept. Retry location sync or use the correction workbook.");
      return;
    }
    if(!window.confirm(`Accept ${skippable.length} currently suggested pin(s) without further visual review? Every decision will be recorded in the audit trail.`)) return;
    setLocationReviewBusy(true);
    setBulkMessage("");
    try{
      const allResults:any[]=[];
      for(let offset=0;offset<skippable.length;offset+=200){
        const batch=skippable.slice(offset,offset+200).map((row)=>({
          delivery_way_id:row.delivery_way_id,pickup_id:row.pickup_id,parcel_sequence:row.parcel_sequence,
          township:row.township,delivery_address:row.delivery_address,
          latitude:row.locationCandidate!.latitude,longitude:row.locationCandidate!.longitude,
          action:"SKIP_REVIEW",reason:"Operator bulk-accepted the suggested pin without further visual map review.",
        }));
        const response=await (supabase as any).rpc("be_delivery_location_review_batch_v23",{p_payload:{
          request_id:requestId("LOCATION_REVIEW_SKIP_ALL"),rows:batch,
        }});
        if(response.error) throw response.error;
        if(!response.data?.ok) throw new Error(response.data?.errors?.[0]?.message||"Bulk location-review skip failed.");
        allResults.push(...(Array.isArray(response.data.rows)?response.data.rows:[]));
      }
      applyLocationReviewResults(allResults);
      setLocationReloadToken((token)=>token+1);
      const remaining=consolidatedLocationReviewRows.length-allResults.length;
      setBulkMessage(`Accepted and audited ${allResults.length} suggested pin(s) without further review.${remaining>0?` ${remaining} row(s) still need corrected coordinates.`:" All location-review rows are now ready for way generation."}`);
    }catch(error:any){
      setBulkMessage(error?.message||"Unable to skip the location reviews.");
    }finally{
      setLocationReviewBusy(false);
    }
  }

  async function uploadConsolidatedLocationReview(file?:File){
    if(!file) return;
    setLocationReviewBusy(true);
    setBulkMessage("");
    try{
      if(!/\.xlsx$/i.test(file.name)) throw new Error("Choose the completed Britium location-review XLSX workbook.");
      const XLSX:any=await import("xlsx");
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true,raw:false});
      const sheet=workbook.Sheets["Location Review"]||workbook.Sheets[workbook.SheetNames[0]];
      const imported=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:"",raw:false});
      if(!imported.length) throw new Error("The Location Review sheet contains no rows.");
      const knownRows=new Map([...Object.values(bulkImportDrafts).flatMap((draft)=>draft.rows),...rows].map((row)=>[row.delivery_way_id,row]));
      const payloadRows=imported.map((entry,index)=>{
        const deliveryWayId=text(entry["Delivery Way ID"]).trim();
        const current=knownRows.get(deliveryWayId);
        if(!deliveryWayId||!current) throw new Error(`Excel row ${index+2}: Delivery Way ID is missing or is not in the current authorized review workspace.`);
        const action=text(entry["Action"]||"APPLY_CORRECTION").trim().toUpperCase();
        if(!["APPLY_CORRECTION","SKIP_REVIEW"].includes(action)) throw new Error(`Excel row ${index+2}: Action must be APPLY_CORRECTION or SKIP_REVIEW.`);
        const correctedLat=Number(entry["Corrected Latitude"]);
        const correctedLng=Number(entry["Corrected Longitude"]);
        const suggestedLat=Number(entry["Suggested Latitude"]||current.locationCandidate?.latitude);
        const suggestedLng=Number(entry["Suggested Longitude"]||current.locationCandidate?.longitude);
        const latitude=action==="SKIP_REVIEW"?suggestedLat:correctedLat;
        const longitude=action==="SKIP_REVIEW"?suggestedLng:correctedLng;
        if(!validMyanmarCoordinate(longitude,latitude)) throw new Error(`Excel row ${index+2}: enter valid Myanmar latitude and longitude values for ${deliveryWayId}.`);
        return {
          delivery_way_id:deliveryWayId,
          pickup_id:text(entry["Pickup ID"]),
          parcel_sequence:positiveInt(entry["Parcel Sequence"]),
          township:current.township,
          delivery_address:current.delivery_address,
          latitude,longitude,action,
          reason:text(entry["Reason"]||"Location corrected through consolidated review workbook").trim(),
          source_file_name:file.name,
          source_row_number:index+2,
        };
      });
      const allResults:any[]=[];
      for(let offset=0;offset<payloadRows.length;offset+=200){
        const batch=payloadRows.slice(offset,offset+200);
        const response=await (supabase as any).rpc("be_delivery_location_review_batch_v23",{p_payload:{
          request_id:requestId("LOCATION_REVIEW_XLSX"),source_file_name:file.name,rows:batch,
        }});
        if(response.error) throw response.error;
        if(!response.data?.ok) throw new Error(response.data?.errors?.[0]?.message||`Location review batch ${Math.floor(offset/200)+1} failed.`);
        allResults.push(...(Array.isArray(response.data.rows)?response.data.rows:[]));
      }
      applyLocationReviewResults(allResults);
      setLocationReloadToken((token)=>token+1);
      setBulkMessage(`Applied and audited ${allResults.length} reviewed location(s). These rows are now ready for Calculate All, Save All, and way generation.`);
    }catch(error:any){
      setBulkMessage(error?.message||"Unable to apply the location-review workbook.");
    }finally{
      setLocationReviewBusy(false);
      if(locationReviewInputRef.current) locationReviewInputRef.current.value="";
    }
  }

  useEffect(()=>{void loadStartup();},[]);
  useEffect(()=>{
    setVisibleRowCount(20);
    if(bulkUploadSelected){setRows([]);setRowsPickupId("");return;}
    const draft=bulkImportDrafts[selectedPickupId];
    if(draft){
      setTierAccess(draft.tierAccess);
      setRows(draft.rows);
      setRowsPickupId(draft.pickupId);
      setLoadingRows(false);
      return;
    }
    if(selectedPickup) void loadPickupRows(selectedPickup);
    else {setRows([]);setRowsPickupId("");}
  },[selectedPickupId]);
  useEffect(()=>{
    if(!rowsPickupId||rowsPickupId!==selectedPickupId) return;
    setBulkImportDrafts((current)=>{
      const draft=current[rowsPickupId];
      if(!draft||draft.rows===rows) return current;
      return {...current,[rowsPickupId]:{...draft,rows}};
    });
  },[rows,rowsPickupId,selectedPickupId]);

  if(loading) return <div className="flex min-h-[70vh] items-center justify-center bg-[#061524] text-[#eef8ff]"><Loader2 className="mr-3 animate-spin text-[#f6b84b]"/>Loading Financial V2…</div>;

  const workspace=(
    <div className="space-y-4">
      {loadingRows?<div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-10 text-center"><Loader2 className="mr-3 inline animate-spin text-[#f6b84b]"/>Loading pickup proof rows…</div>:
      <>
        {rows.slice(0,visibleRowCount).map((row,index)=><ParcelEditor key={row.pickup_id+":"+row.parcel_sequence} row={row} index={index} updateRow={updateRow} calculate={calculateRow} save={saveRow} reviewPhoto={reviewPhoto} tariffOptions={tariffOptions} providerOptions={providerOptions} tierAccess={tierAccess} locationReloadToken={locationReloadToken}/>)}
        {rows.length>visibleRowCount?<div className="rounded-xl border border-cyan-300/30 bg-[#071b2b] p-4 text-center"><div className="text-xs font-bold text-cyan-100">Showing {visibleRowCount} of {rows.length} parcels to keep Data Entry responsive.</div><button type="button" onClick={()=>setVisibleRowCount((count)=>Math.min(rows.length,count+20))} className="mt-3 rounded-lg bg-cyan-400 px-5 py-2 text-[11px] font-black text-[#04111d]">SHOW NEXT {Math.min(20,rows.length-visibleRowCount)} PARCELS</button></div>:null}
      </>}
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
              <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#92b7cf]">Backend-authoritative receiver collection, Britium ရပိုင်ခွင့်, delivery difference and merchant final settlement. {mutationMode==="ACTIVE"?"Live saves are active and audited.":"Live financial persistence remains disabled while the backend mutation gate is shadow."}</p>
            </div>
            <div className="rounded-lg border border-[#3aa7de]/30 bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">{mutationMode}</div>
          </div>
        </header>

        {message?<div className="rounded-xl border border-[#ff6b6b]/35 bg-[#3a1e28] p-3 text-[12px] text-[#ff9aa2]"><AlertTriangle size={15} className="mr-2 inline"/>{message}</div>:null}

        {waybillMessage?
          <div role={waybillMessageKind==="ERROR"?"alert":"status"} className={`rounded-xl border p-3 text-[12px] font-semibold ${waybillMessageKind==="ERROR"?"border-rose-300/60 bg-rose-950/70 text-rose-100":"border-emerald-300/60 bg-emerald-950/60 text-emerald-100"}`}>
            {waybillMessageKind==="ERROR"?<AlertTriangle size={15} className="mr-2 inline"/>:null}{waybillMessage}
          </div>
        :null}

        <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[320px] flex-1">
              <div className={labelClass}>စစ်ဆေးပြီး Pickup ကို ရွေးချယ်ရန်</div>
              <select className={inputClass} value={selectedPickupId} onChange={(e)=>setSelectedPickupId(e.target.value)}>
                <option value={BULK_UPLOAD_PICKUP_ID}>Bulk upload · Way ID + Merchant Name</option>
                {pickups.map(p=><option key={p.pickup_id} value={p.pickup_id}>{p.pickup_id} · {p.merchant_id||p.merchant_name||"Merchant"} · {authorizedParcelCount(p)} parcels</option>)}
              </select>
            </div>
            <button type="button" onClick={()=>void loadStartup()} className="inline-flex items-center gap-2 rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-4 py-2.5 text-[11px] font-black text-[#8fd3ff]"><RefreshCw size={14}/>ပြန်ဖတ်ရန်</button>
            <button type="button" onClick={()=>void calculateAll()} disabled={!rows.length || bulkCalculating || bulkSaving || waybillBusy} className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2.5 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">{bulkCalculating?<Loader2 size={14} className="animate-spin"/>:<Calculator size={14}/>}CALCULATE ALL</button>
            <button type="button" onClick={()=>void saveAll()} disabled={!rows.length || bulkSaving || bulkCalculating || waybillBusy} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-600 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-50">{bulkSaving?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>}SAVE ALL</button>
            <button
              type="button"
              onClick={()=>void createAndGenerateWaybill()}
              disabled={!rows.length || waybillBusy || bulkSaving || bulkCalculating}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-50"
            >
              {waybillBusy
                ? <Loader2 size={14} className="animate-spin"/>
                : <Save size={14}/>
              }
              CREATE & GENERATE WAYBILL
            </button>
            <button type="button" onClick={()=>setFullRegistration(true)} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-lg bg-[#f6b84b] px-4 py-2.5 text-[11px] font-black text-[#061524] disabled:opacity-50"><Maximize2 size={14}/>စာရင်းသွင်းမျက်နှာပြင် အပြည့်</button>
            <DataEntryOsBulkImport
              pickups={pickups as OsBulkPickup[]}
              selectedPickupId={selectedPickupId}
              sequenceFloorByPickup={sequenceFloorByPickup}
              busy={loadingRows||bulkCalculating||bulkSaving||waybillBusy||addingRegistration}
              onPickupChange={setSelectedPickupId}
              onApply={applyOsImport}
            />
          </div>
          {bulkUploadSelected?<div className="mt-4 rounded-xl border border-cyan-300/35 bg-cyan-400/5 p-4 text-[11px] leading-5 text-cyan-100"><b>Bulk upload mode:</b> attach the 12-column template. Way ID / Pickup ID assigns each row to its pickup and Merchant Name / Merchant ID is checked before any registrations are authorized. After staging, review the separate pickup batches below.</div>:null}
          {bulkImportOrder.length?<div data-os-bulk-pickup-queue-v16="true" className="mt-4 rounded-xl border border-[#3aa7de]/30 bg-[#071b2b] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64c8ff]">Bulk upload pickup queue</div>
            <div className="mt-1 text-[10px] text-[#8db4ce]">Open each matched pickup, verify its drop points, then run Calculate All and Save All. Saved batches are marked below.</div>
            <div className="mt-3 flex flex-wrap gap-2">{bulkImportOrder.map((pickupId)=>{
              const draft=bulkImportDrafts[pickupId];
              return <button key={pickupId} type="button" onClick={()=>setSelectedPickupId(pickupId)} className={`rounded-lg border px-3 py-2 text-[10px] font-black ${selectedPickupId===pickupId?"border-cyan-300 bg-cyan-400 text-[#04111d]":draft?.saved?"border-emerald-400/50 bg-emerald-500/10 text-emerald-200":"border-[#31506a] bg-[#12314a] text-[#bfe8ff]"}`}>{pickupId} · {draft?.rows.length||0} row(s) · {draft?.saved?"SAVED":"REVIEW"}</button>;
            })}</div>
          </div>:null}
          {selectedPickup?<div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={serverClass}>Pickup: <b>{selectedPickup.pickup_id}</b></div>
            <div className={serverClass}>Merchant: <b>{selectedPickup.merchant_id||selectedPickup.merchant_name||"—"}</b></div>
            <div className={serverClass}>Requested: <b>{requestedParcelCount(selectedPickup)}</b> · Authorized: <b>{authorizedParcelCount(selectedPickup,rows.length)}</b></div>
            <div className={serverClass}>Status: <b>{selectedPickup.pickup_status||"—"}</b></div>
            <div className={serverClass}>Stage: <b>{selectedPickup.workflow_stage||"—"}</b></div>
          </div>:null}

          {importedLocationSummary.total?<div data-bulk-location-readiness-v19="true" className={`mt-4 rounded-xl border p-4 ${importedLocationSummary.synced+importedLocationSummary.notRequired===importedLocationSummary.total?"border-emerald-400/40 bg-emerald-500/10":"border-amber-300/40 bg-amber-400/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Bulk location readiness</div>
                <div className="mt-1 text-[13px] font-black text-white">{importedLocationSummary.synced} synchronized · {importedLocationSummary.notRequired} map not required · {importedLocationSummary.total} total</div>
                <div className="mt-1 text-[10px] leading-5 text-[#b8d8ea]">
                  {importedLocationSummary.synced+importedLocationSummary.notRequired===importedLocationSummary.total
                    ?"All imported rows are location-ready. Core-region pins are synchronized; outside-core routes correctly bypass the current Google/Wayplan coordinate flow."
                    :`${importedLocationSummary.review} core-region rows are queued immediately for consolidated Excel correction · ${importedLocationSummary.resolving} pending. Google Maps are loaded only when one parcel is opened manually.`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={()=>void skipAllLocationReviews()} disabled={!consolidatedLocationReviewRows.some((row)=>row.locationCandidate&&validMyanmarCoordinate(row.locationCandidate.longitude,row.locationCandidate.latitude))||locationReviewBusy} className="inline-flex items-center gap-2 rounded-lg border border-rose-300/50 bg-rose-400/10 px-4 py-2.5 text-[10px] font-black text-rose-100 disabled:opacity-40">SKIP ALL REVIEWS</button>
                <button type="button" onClick={()=>void downloadConsolidatedLocationReview()} disabled={!consolidatedLocationReviewRows.length||locationReviewBusy} className="inline-flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black text-amber-100 disabled:opacity-40"><Download size={14}/>DOWNLOAD REVIEW EXCEL ({consolidatedLocationReviewRows.length})</button>
                <label className={`inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-[10px] font-black text-[#04111d] ${locationReviewBusy?"pointer-events-none opacity-40":"cursor-pointer"}`}><Upload size={14}/>RE-UPLOAD CORRECTED EXCEL<input ref={locationReviewInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event)=>void uploadConsolidatedLocationReview(event.target.files?.[0])}/></label>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-amber-300/25 bg-[#061524] px-3 py-2 text-[10px] leading-5 text-amber-100">Download combines every current pickup row requiring location review into one workbook. Correct latitude/longitude and re-upload it here. Files above 200 rows are applied automatically in consecutive audited batches.</div>
          </div>:null}

          {selectedPickup?<div data-extra-registration-v14="true" className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-400/5 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Merchant changed the pickup quantity</div>
                <div className="mt-1 text-[10px] text-[#8db4ce]">Authorize extra registration rows before saving them. The original requested count is preserved; the verified count and audit trail are updated atomically.</div>
              </div>
              <Field label="Additional items">
                <input type="number" min={1} max={50} className={`${inputClass} w-28`} value={additionalCount} onChange={(e)=>setAdditionalCount(Math.max(1,Math.min(50,Math.trunc(Number(e.target.value)||1))))}/>
              </Field>
              <div className="min-w-[300px] flex-[2]">
                <Field label="Merchant addition reason">
                  <input className={inputClass} value={additionalReason} onChange={(e)=>setAdditionalReason(e.target.value)} placeholder="e.g. Merchant handed over 2 additional parcels"/>
                </Field>
              </div>
              <button type="button" onClick={()=>void addRegistrations()} disabled={addingRegistration} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-[11px] font-black text-[#04111d] disabled:opacity-50">
                {addingRegistration?<Loader2 size={14} className="animate-spin"/>:<Plus size={14}/>}ADD REGISTRATION
              </button>
            </div>
          </div>:null}

          {bulkMessage?<div className="mt-4 rounded-lg border border-[#3aa7de]/35 bg-[#12314a] px-3 py-2 text-[11px] font-semibold text-[#bfe8ff]">{bulkMessage}</div>:null}

          <div data-data-entry-registration-export-v12-9="true" className="mt-4 rounded-xl border border-[#3aa7de]/30 bg-[#071b2b] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#64c8ff]">Data Entry Registration Download</div>
                <div className="mt-1 text-[12px] font-bold text-[#eef8ff]">Download registration records by timeline</div>
                <div className="mt-1 text-[10px] text-[#7aa7c6]">Timeline uses Data Entry Saved Time. Export follows the signed-in account's existing Data Entry permissions.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={()=>applyDownloadRange("TODAY")} className="rounded-lg border border-[#1a3a5c] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">TODAY</button>
                <button type="button" onClick={()=>applyDownloadRange("LAST_24_HOURS")} className="rounded-lg border border-[#1a3a5c] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">LAST 24 HOURS</button>
                <button type="button" onClick={()=>applyDownloadRange("THIS_WEEK")} className="rounded-lg border border-[#1a3a5c] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">THIS WEEK</button>
                <button type="button" onClick={()=>applyDownloadRange("THIS_MONTH")} className="rounded-lg border border-[#1a3a5c] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">THIS MONTH</button>
                <button type="button" onClick={()=>applyDownloadRange("ALL")} className="rounded-lg border border-[#1a3a5c] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]">ALL TIME</button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
              <Field label="From date & time">
                <input type="datetime-local" className={inputClass} value={downloadFrom} onChange={(e)=>setDownloadFrom(e.target.value)}/>
              </Field>
              <Field label="To date & time">
                <input type="datetime-local" className={inputClass} value={downloadTo} onChange={(e)=>setDownloadTo(e.target.value)}/>
              </Field>
              <Field label="Registration scope">
                <select className={inputClass} value={downloadScope} onChange={(e)=>setDownloadScope(e.target.value as "ALL"|"CURRENT_PICKUP")}>
                  <option value="ALL">All accessible registration records</option>
                  <option value="CURRENT_PICKUP">Current pickup only</option>
                </select>
              </Field>
              <div className="flex items-end">
                <button type="button" onClick={()=>void downloadDataEntryRegistration()} disabled={downloadBusy} className="w-full rounded-lg bg-[#21c7e8] px-4 py-2.5 text-[11px] font-black text-[#04111d] disabled:opacity-50 xl:w-auto">
                  {downloadBusy?"PREPARING...":"DOWNLOAD REGISTRATION EXCEL"}
                </button>
              </div>
            </div>
            {downloadMessage?<div className="mt-3 rounded-lg border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[11px] text-[#8fd3ff]">{downloadMessage}</div>:null}
          </div>
        </section>
        {!fullRegistration?workspace:null}
      </div>

      {fullRegistration?<div data-full-review-sheet="true" className="fixed inset-0 z-[9999] overflow-auto bg-[#04111d]">
        <div className="sticky top-0 z-10 border-b border-[#1a3a5c] bg-[#071b2b]/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-3">
            <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f6b84b]">Full Registration</div><div className="mt-1 text-lg font-black">{selectedPickupId} · {rows.length} parcels</div></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={()=>void calculateAll()} disabled={bulkCalculating || bulkSaving} className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">{bulkCalculating?<Loader2 size={14} className="animate-spin"/>:<Calculator size={14}/>}CALCULATE ALL</button>
              <button type="button" onClick={()=>void saveAll()} disabled={bulkSaving || bulkCalculating} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50">{bulkSaving?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>}SAVE ALL</button>
              <button type="button" onClick={()=>setFullRegistration(false)} className="inline-flex items-center gap-2 rounded-lg border border-[#ff6b6b]/40 bg-[#3a1e28] px-4 py-2 text-[11px] font-black text-[#ff9aa2]"><X size={14}/>CLOSE</button>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1900px] p-5">{workspace}</div>
      </div>:null}
    </div>
  );
}
