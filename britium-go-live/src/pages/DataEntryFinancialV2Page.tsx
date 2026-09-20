import { persistDataEntryDrafts } from "@/lib/persistDataEntryDrafts";
import DeliveryAddressHistory from "@/components/DeliveryAddressHistory";
import BufferedDataEntryInput from "@/components/BufferedDataEntryInput";
import { locationReadiness } from "@/lib/dataEntryLocationReadiness";
import { calculateWithTimeoutRetry } from "@/lib/dataEntryCalculationRetry";
import { consecutivePendingBatches } from "@/lib/dataEntryPendingBatches";
import { searchMasterLocations, type MasterLocationOption } from "@/lib/postalCodeResolver";
import { defaultAmountEntryType } from "@/lib/defaultAmountEntryType";
import { parseLocationReviewWorkbook } from "@/lib/locationReviewWorkbook";
import { memo, useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calculator, Download, FileSpreadsheet, Image as ImageIcon, Loader2, Maximize2, Plus, RefreshCw, Save, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DataEntryLocationEditor, { type DataEntryLocationResolution } from "@/components/workflow/DataEntryLocationEditor";
import { resolveDeliveryLocation, saveDeliveryLocation, validMyanmarCoordinate, type DeliveryLocation } from "@/lib/deliveryLocationService";
import DataEntryOsBulkImport, { BULK_UPLOAD_PICKUP_ID, SAFE_TRANSACTION_ROWS, type OsBulkPickup, type OsImportApplyPayload, type OsImportRow } from "@/components/workflow/DataEntryOsBulkImport";
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
export const DATA_ENTRY_PHONE_HISTORY_PROGRESS_BUILD = "DATA_ENTRY_PHONE_HISTORY_PROGRESS_V81_20260920";
export const DATA_ENTRY_SPLIT_WORKSPACE_BUILD = "DATA_ENTRY_SPLIT_RECYCLED_EDITOR_GRID_V82_20260920";
export const DATA_ENTRY_COMPACT_RECYCLED_FORM_BUILD = "DATA_ENTRY_COMPACT_RECYCLED_FORM_V83_20260920";
export const DATA_ENTRY_PERFORMANCE_V40 = "DATA_ENTRY_PERFORMANCE_V40";
export const DATA_ENTRY_INPUT_LATENCY_V42 = "DATA_ENTRY_INPUT_LATENCY_V42";
export const DATA_ENTRY_INTERACTIVE_LATENCY_V49 = "DATA_ENTRY_INTERACTIVE_LATENCY_V49";
const LOCATION_VALIDATION_BATCH_SIZE = 4;
const TOWNSHIP_SEARCH_DEBOUNCE_MS = 180;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

const AMOUNT_TYPES = [
  "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
  "DELIVERY_CHARGE_ONLY",
  "EXACT_COLLECTION_AMOUNT",
] as const;

const COLLECTION_METHOD_MY: Record<AmountType,string> = {
  ITEM_PRICE_PLUS_DECLARED_DELIVERY:"ပစ္စည်းတန်ဖိုး + သတ်မှတ်ထားသော ပို့ဆောင်ခ",
  DELIVERY_CHARGE_ONLY:"ပို့ဆောင်ခသာ",
  EXACT_COLLECTION_AMOUNT:"အတိအကျ ကောက်ခံရမည့်ငွေပမာဏ",
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
  sourceMerchantName?: string;
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
  photoTemporaryWaiver: boolean;
  photoTemporaryWaiverReason: string;
  isAdditionalRegistration: boolean;
  importedFromOs: boolean;
  sourceFileName: string;
  sourceRowNumber: number | null;
  sourceRowCount: number | null;
  sourceWard: string;
  sourcePostalCode: string;
  photoEvidenceMode: "PICKER_PHOTO" | "OS_SOFTCOPY";
  photoBypassReason: string;
  deliveryRegion: DataEntryRouteRegion;
  deliveryMode: DataEntryDeliveryMode;
  handoffStationCode: string;
  handoffStationName: string;
  locationStatus: DataEntryLocationResolution;
  locationCandidate?: DeliveryLocation | null;
  saved: boolean;
  skipped?: boolean;
  calculationFailed?: boolean;
};

type BulkImportDraft = {
  pickupId: string;
  fileName: string;
  rows: ParcelRow[];
  tierAccess: MerchantTierAccess;
  saved: boolean;
};

type PhoneHistoryMatch = {
  history_rank?: number;
  recipient_name?: string;
  recipient_phone?: string;
  secondary_phone?: string;
  township?: string;
  city?: string;
  region_state?: string;
  recipient_address?: string;
  merchant_id?: string;
  delivery_way_id?: string;
  saved_at?: string;
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
  return Math.max(requestedParcelCount(pickup),positiveInt(pickup.verified_parcels),positiveInt(pickup.registered_parcels),positiveInt(observed));
}
function yangonDateKey(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yangon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part=(type:string)=>parts.find((item)=>item.type===type)?.value||"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function pickupDateKey(pickup: Pickup): string {
  const explicit=text(pickup.pickup_date).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(explicit)) return explicit.slice(0,10);
  const created=text(pickup.created_at).trim();
  if(!created) return "";
  const date=new Date(created);
  return Number.isNaN(date.getTime())?"":yangonDateKey(date);
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
function resolveImportedDestination(value: unknown,address: unknown,itemPrice: unknown,options: TariffOption[],ward?: unknown,postalCode?: unknown) {
  return resolveDataEntryServiceProvider(value,address,options,{fallbackUnknownToRoyal:true,itemPrice,ward,postalCode});
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
  return row.handoffStationName.trim().length>=3 && row.delivery_charges!=="" && Number.isSafeInteger(Number(row.delivery_charges)) && Number(row.delivery_charges)>=0;
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
    source_merchant_name: row.sourceMerchantName || null,
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
    ...(row.deliveryMode==="HIGHWAY_BUS_STATION"?{handoff_delivery_charge:row.delivery_charges===""?null:Number(row.delivery_charges)}:{}),
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
      : defaultAmountEntryType(proof.financial_quote?.source_merchant_name || proof.merchant_id || pickup.merchant_id)) as AmountType;
  const savedTier=text(proof.customer_tier).toUpperCase();
  const customerTier=savedTier||tierAccess.resolved_customer_tier||"STANDARD";
  const legacyAdditional=num(proof.additional_customer_charge);
  const proofReviewStatus=text(proof.proof_check_status||proof.verification_status||"PENDING_REVIEW").toUpperCase();
  const storedPhotoMode=text(proof.photo_evidence_mode||proof.financial_quote?.photo_evidence_mode).toUpperCase();
  const importedFromOs=Boolean(
    proof.source_file_name||proof.os_imported_at||proof.financial_quote?.os_softcopy_import
  );
  const temporaryPhotoWaiver=Boolean(proof.raw_payload?.temporary_photo_waiver);
  const temporaryPhotoWaiverReason=text(proof.raw_payload?.temporary_photo_waiver_reason);
  const photoEvidenceMode:ParcelRow["photoEvidenceMode"]=storedPhotoMode==="OS_SOFTCOPY"?"OS_SOFTCOPY":"PICKER_PHOTO";
  return {
    pickup_id:pickup.pickup_id,
    parcel_sequence:sequence,
    delivery_way_id:text(proof.delivery_way_id)||canonicalWayId(pickup.pickup_id,sequence),
    sourceMerchantName:text(proof.financial_quote?.source_merchant_name || proof.merchant_id),
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
    delivery_charges:proof.financial_quote?.handoff_delivery_charge??proof.delivery_charges??proof.delivery_fee??"",
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
    photoReviewed:temporaryPhotoWaiver||["APPROVED","APPROVED_AFTER_REUPLOAD","PHOTO_APPROVED","VERIFIED","RIDER_VERIFIED"].includes(proofReviewStatus),
    photoUnavailableAcknowledged:photoEvidenceMode==="OS_SOFTCOPY",
    photoReviewStatus:temporaryPhotoWaiver?"TEMPORARY_WAIVER":proofReviewStatus,
    photoRejectionReason:text(proof.rejection_reason),
    photoRejectionNote:text(proof.review_note),
    photoReviewBusy:false,
    photoTemporaryWaiver:temporaryPhotoWaiver,
    photoTemporaryWaiverReason:temporaryPhotoWaiverReason||"No order picker currently available",
    isAdditionalRegistration:sequence>requestedParcelCount(pickup),
    importedFromOs,
    sourceFileName:text(proof.source_file_name||proof.financial_quote?.os_source_file_name),
    sourceRowNumber:positiveInt(proof.source_row_number||proof.financial_quote?.source_row_number)||null,
    sourceRowCount:positiveInt(proof.source_row_count||proof.financial_quote?.source_row_count)||null,
    sourceWard:text(proof.financial_quote?.source_ward),
    sourcePostalCode:text(proof.financial_quote?.source_postal_code),
    photoEvidenceMode,
    photoBypassReason:text(proof.photo_bypass_reason||proof.financial_quote?.photo_bypass_reason),
    deliveryRegion:text(proof.delivery_region||proof.financial_quote?.delivery_region||"UNRESOLVED").toUpperCase() as DataEntryRouteRegion,
    deliveryMode:text(proof.delivery_route_mode||proof.financial_quote?.delivery_route_mode||"UNRESOLVED").toUpperCase() as DataEntryDeliveryMode,
    handoffStationCode:text(proof.handoff_station_code||proof.financial_quote?.handoff_station_code).toUpperCase(),
    handoffStationName:text(proof.handoff_station_name||proof.financial_quote?.handoff_station_name),
    locationStatus:proof.location_required===false||proof.financial_quote?.location_required===false?"NOT_REQUIRED":"PENDING",
    saved:Boolean(proof.saved_at),
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
  const [draftTownship, setDraftTownship] = useState(row.township);
  useEffect(() => { setDraftTownship(row.township); }, [row.township]);
  const [providerFilter, setProviderFilter] = useState(() => row.service_provider_code || "ALL");
  const route = useMemo(()=>resolveDataEntryServiceProvider(row.township,row.delivery_address,tariffOptions,{
    fallbackUnknownToRoyal:true,
    itemPrice:row.item_price,
  }),[row.township,row.delivery_address,row.item_price,tariffOptions]);
  useEffect(()=>{if(!open)setProviderFilter(row.service_provider_code||"ALL");},[row.service_provider_code,open]);
  const query = text(draftTownship).trim().toLowerCase();
  const [debouncedTownshipQuery,setDebouncedTownshipQuery]=useState(query);
  useEffect(()=>{
    const timer=window.setTimeout(()=>setDebouncedTownshipQuery(query),TOWNSHIP_SEARCH_DEBOUNCE_MS);
    return ()=>window.clearTimeout(timer);
  },[query]);
  const masterMatches = useMemo(() => open ? searchMasterLocations(debouncedTownshipQuery) : [], [open, debouncedTownshipQuery]);
  const chooseMaster = (location: MasterLocationOption) => {
    const township = location.townshipMm || location.township;
    const nextRoute = resolveDataEntryServiceProvider(township, row.delivery_address, tariffOptions, { itemPrice: row.item_price });
    updateRow(index, {
      ...routingPatch(nextRoute, {...row, township}),
      sourceWard: location.quarterMm || location.quarter,
      sourcePostalCode: location.postalCode,
      message: `Master location: ${location.regionMm || location.region}. ${providerRoutingMessage(nextRoute)}${nextRoute.option ? "" : " Delivery rate remains subject to the approved tariff."}`,
    });
    setOpen(false);
  };
  const matches = useMemo(()=>(tariffOptions as TariffOption[])
    .filter((option) => providerFilter === "ALL" || option.provider_code === providerFilter)
    .filter((option) => !debouncedTownshipQuery || option.destination_name.toLowerCase().includes(debouncedTownshipQuery) || option.provider_name.toLowerCase().includes(debouncedTownshipQuery))
    .slice(0, 18),[providerFilter,debouncedTownshipQuery,tariffOptions]);
  const selected = useMemo(()=>(tariffOptions as TariffOption[]).find((option) =>
    option.destination_name === row.township && (!row.service_provider_code || option.provider_code === row.service_provider_code)
  ),[row.service_provider_code,row.township,tariffOptions]);
  const choose = (option: TariffOption) => {
    const nextRoute=resolveDataEntryServiceProvider(option.destination_name,row.delivery_address,tariffOptions,{
      fallbackUnknownToRoyal:true,
      itemPrice:row.item_price,
    });
    updateRow(index, {
      ...routingPatch(nextRoute,{...row,township:option.destination_name}),
      message: `${providerRoutingMessage(nextRoute)} Approved tariff ${option.provider_name} · Rack ${option.rack_code || "—"} was applied.`,
    });
    setOpen(false);
  };
  const commitTownship = (township: string) => {
    const nextRoute=resolveDataEntryServiceProvider(township,row.delivery_address,tariffOptions,{
      fallbackUnknownToRoyal:true,
      itemPrice:row.item_price,
    });
    const option=nextRoute.option as TariffOption|null;
    updateRow(index,nextRoute.providerCode?{
      ...routingPatch(nextRoute,{...row,township}),
      township,
      message:providerRoutingMessage(nextRoute),
    }:{...routingPatch(nextRoute,{...row,township}),township,message:providerRoutingMessage(nextRoute)});
    setOpen(false);
  };
  return (
    <Field label="မြို့နယ် / ဝန်ဆောင်မှုပေးသူ">
      <div className="relative">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={row.township==="Unknown"} className={`rounded-full border px-3 py-1 text-xs ${row.township==="Unknown" ? "border-amber-300 bg-amber-400/20 text-amber-100" : "border-[#2a5272] text-[#8db4ce]"}`} onClick={()=>{
            updateRow(index,{township:"Unknown",service_provider_code:"",deliveryRegion:"UNRESOLVED",deliveryMode:"UNRESOLVED",locationStatus:"NOT_REQUIRED",handoffStationCode:"",handoffStationName:"",calculation:{},message:"Pending clarification with customer or merchant. Select a confirmed destination before final calculation and waybill generation."});setOpen(false);
          }}>Unknown / စုံစမ်းရန်</button>
          <button type="button" className="rounded-full border border-cyan-300 px-3 py-1 text-xs text-cyan-100" onClick={()=>{
            updateRow(index,{township:"ဂိတ်ချ",service_provider_code:"H.TERMINAL DROP-OFF",deliveryRegion:"OUTSIDE_CORE",deliveryMode:"HIGHWAY_BUS_STATION",locationStatus:"NOT_REQUIRED",handoffStationCode:"OTHER",handoffStationName:"",delivery_charges:"",calculation:{},message:"Enter the highway terminal name and delivery charge."});setOpen(false);
          }}>Highway terminal drop-off / အဝေးပြေးဂိတ်ချ</button>
          <button type="button" onClick={() => { setProviderFilter("ALL"); setOpen(true); }} className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${providerFilter === "ALL" ? "border-cyan-300 bg-cyan-400/20 text-cyan-100" : "border-[#2a5272] text-[#8db4ce]"}`}>ALL</button>
          {(providerOptions as ProviderOption[]).filter((provider) => ["ROYAL EXPRESS","DK DELIVERY","NPT BRANCH","H.TERMINAL DROP-OFF","GRS"].includes(provider.provider_code)).map((provider) => (
            <button key={provider.provider_code} type="button" onClick={() => { setProviderFilter(provider.provider_code); setOpen(true); }} className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${providerFilter === provider.provider_code ? "border-cyan-300 bg-cyan-400/20 text-cyan-100" : "border-[#2a5272] text-[#8db4ce]"}`}>
              {provider.display_name} · {provider.active_tariff_count}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          value={draftTownship}
          autoComplete="off"
          placeholder="မြို့နယ်၊ ရပ်ကွက်၊ ကျေးရွာအုပ်စု / Township, ward, village tract…"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setDraftTownship(event.target.value); setOpen(true); }}
          onBlur={() => { if(draftTownship!==row.township) commitTownship(draftTownship); else setOpen(false); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open) {
              event.preventDefault();
              // Never choose the first of several same-name geographic results.
              if (masterMatches.length === 1) chooseMaster(masterMatches[0]);
              else if (!masterMatches.length && matches.length === 1) choose(matches[0]);
            }
          }}
        />
        {open && (matches.length || masterMatches.length) ? (
          <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[360px] overflow-auto rounded-xl border border-[#3aa7de]/50 bg-[#071b2b] p-1 shadow-2xl">
            {masterMatches.length > 0 && <div className="px-3 py-2 text-[10px] text-cyan-200">National location master · Select the matching township and region</div>}
            {masterMatches.map(location => (
              <button key={`master:${location.id}`} type="button" onMouseDown={event => event.preventDefault()} onClick={() => chooseMaster(location)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#12314a]">
                <b className="block text-[12px] text-white">{location.quarterMm || location.townshipMm} · {location.quarter || location.township}</b>
                <span className="text-[10px] text-[#8db4ce]">{location.townshipMm} / {location.township} · {location.regionMm} / {location.region} {location.postalCode}</span>
              </button>
            ))}
            {matches.length > 0 && <div className="px-3 py-2 text-[10px] text-amber-200">Approved service and tariff entries</div>}
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

const ParcelEditor = memo(function ParcelEditor({ row, index, updateRow, calculate, save, skip, busy, reviewPhoto, togglePhotoWaiver, lookupPhoneHistory, tariffOptions, providerOptions, tierAccess, locationReloadToken }: any) {
  const c = row.calculation || {};
  const type = row.amount_entry_type as AmountType;
  const route = useMemo(()=>routeForRow(row,tariffOptions),[row.township,row.delivery_address,row.item_price,tariffOptions]);
  const stationReady = handoffStationReady(row,route);
  const tierRule = tierAccess?.tier_rules?.[row.customer_tier] || {};
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoZoom, setPhotoZoom] = useState(1);
  const displayProofUrl = dataEntryProofDisplayUrl(row.proof_url);
  const photoReady = Boolean(row.photoReviewed || row.isAdditionalRegistration || row.photoUnavailableAcknowledged || row.photoTemporaryWaiver);
  const locationReady = Boolean(!route.mapRequired || row.locationStatus==="SYNCED");
  const saveBlocked = busy || row.checking || row.skipped || !photoReady || !routeReady(row,tariffOptions);
  const statusText = row.saved ? "REGISTERED" : row.skipped ? "PENDING" : row.calculating ? "CALCULATING" : "DRAFT";
  const statusClass = row.saved
    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
    : row.skipped
      ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
      : "border-slate-400/30 bg-slate-400/10 text-slate-200";

  return (
    <section
      id={`data-entry-parcel-${row.parcel_sequence}`}
      data-compact-recycled-form-v83="true"
      className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236]"
    >
      <div className="border-b border-[#1a3a5c] bg-[#102741] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">Single Recycled Data Entry Form</div>
            <div className="mt-1 truncate text-[15px] font-black text-white">{row.delivery_way_id || canonicalWayId(row.pickup_id,row.parcel_sequence)}</div>
            <div className="mt-1 text-[10px] text-[#8db4ce]">Parcel {row.parcel_sequence} · {row.sourceMerchantName||"Current pickup merchant"}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusClass}`}>{statusText}</span>
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${photoReady?"border-emerald-400/40 bg-emerald-400/10 text-emerald-200":"border-amber-300/40 bg-amber-400/10 text-amber-200"}`}>PHOTO {photoReady?"READY":"CHECK"}</span>
            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${locationReady?"border-emerald-400/40 bg-emerald-400/10 text-emerald-200":"border-amber-300/40 bg-amber-400/10 text-amber-200"}`}>LOCATION {locationReady?"READY":row.locationStatus.replaceAll("_"," ")}</span>
          </div>
        </div>
      </div>

      <fieldset disabled={busy || row.skipped || row.checking} className="min-w-0">
        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-[#31506a] bg-[#071b2b] p-3">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Receiver & Delivery Details</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="ဖုန်းနံပါတ် / Phone Number (Historical Autofill)">
                  <BufferedDataEntryInput
                    className={inputClass}
                    value={row.recipient_phone}
                    placeholder="Enter recipient phone number"
                    onCommit={(value) => {
                      updateRow(index,{recipient_phone:value});
                      void lookupPhoneHistory(index,value);
                    }}
                  />
                </Field>
                <div className="mt-1 text-[9px] text-[#6f9ab8]">A matching historical phone can fill missing recipient name, address and township without overwriting manual entries.</div>
              </div>

              <Field label="လက်ခံသူအမည် / Recipient Name">
                <BufferedDataEntryInput className={inputClass} value={row.recipient_name} onCommit={(value) => updateRow(index,{recipient_name:value})}/>
              </Field>

              <TownshipTariffField row={row} index={index} updateRow={updateRow} tariffOptions={tariffOptions} providerOptions={providerOptions} />

              <div className="sm:col-span-2">
                <Field label="လက်ခံသူလိပ်စာ / Full Address">
                  <BufferedDataEntryInput
                    multiline
                    rows={2}
                    className={`${inputClass} !bg-white !text-black placeholder:!text-slate-500`}
                    value={row.delivery_address}
                    onCommit={(value)=>{
                      const delivery_address=value;
                      const nextRoute=resolveDataEntryServiceProvider(row.township,delivery_address,tariffOptions,{fallbackUnknownToRoyal:true,itemPrice:row.item_price});
                      updateRow(index,nextRoute.providerCode?{
                        delivery_address,
                        ...routingPatch(nextRoute,{...row,delivery_address}),
                        message:providerRoutingMessage(nextRoute),
                      }:{delivery_address,...routingPatch(nextRoute,{...row,delivery_address}),message:providerRoutingMessage(nextRoute)});
                    }}
                  />
                </Field>
              </div>

              <Field label="အလေးချိန် / Weight (kg)">
                <BufferedDataEntryInput type="number" step="0.01" className={inputClass} value={row.weight_kg} onCommit={(value)=>updateRow(index,{weight_kg:value===""?"":Number(value)})}/>
              </Field>

              <Field label="ဝန်ဆောင်မှု / Service Type">
                <select className={`${inputClass} !bg-white !text-black`} value={row.service_type} onChange={(e)=>updateRow(index,{service_type:e.target.value})}>
                  <option value="STANDARD">STANDARD</option>
                  <option value="EXPRESS">EXPRESS</option>
                  <option value="SAME_DAY">SAME DAY</option>
                  <option value="NEXT_DAY">NEXT DAY</option>
                  <option value="ECONOMY">ECONOMY</option>
                </select>
              </Field>

              <Field label="ကုန်သည်အဆင့် / Merchant Tier">
                <select disabled={!tierAccess?.can_select_tier} className={`${inputClass} !bg-white !text-black disabled:cursor-not-allowed disabled:opacity-60`} value={row.customer_tier} onChange={(e)=>{
                  const customer_tier=e.target.value;
                  const tier_override=Boolean(tierAccess?.registered && tierAccess?.profile_tier && customer_tier!==tierAccess.profile_tier);
                  updateRow(index,{customer_tier,tier_override});
                }}>
                  <option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option>
                </select>
                <span className="mt-1 block text-[9px] leading-4 text-[#8db4ce]">
                  {row.customer_tier === "STANDARD" ? `Standard · ${tierRule.included_kg ?? 3} kg included` : row.customer_tier === "ROYAL" ? `Royal · ${tierRule.included_kg ?? 5} kg included` : `Commitment · ${tierRule.included_kg ?? 5} kg included`}
                </span>
              </Field>

              <Field label="ငွေကောက်ခံပုံ / Collection Method">
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
          </div>

          <div className="rounded-xl border border-[#f6b84b]/30 bg-[#1d2b37] p-3">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">Charges & COD Inputs</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!isExact(type) && type!=="DELIVERY_CHARGE_ONLY" ? <Field label="ပစ္စည်းတန်ဖိုး / Item Price">
                <BufferedDataEntryInput type="number" className={inputClass} value={row.item_price} onCommit={(value)=>{
                  const item_price=value===""?"":Number(value);
                  const nextRow={...row,item_price};
                  const nextRoute=routeForRow(nextRow,tariffOptions);
                  updateRow(index,{item_price,...routingPatch(nextRoute,nextRow),message:providerRoutingMessage(nextRoute)});
                }}/>
              </Field>:null}

              {!isExact(type) ? <Field label="ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ / Deli Fee (OS)">
                <BufferedDataEntryInput type="number" className={inputClass} value={row.delivery_charges} onCommit={(value)=>updateRow(index,{delivery_charges:value===""?"":Number(value)})}/>
              </Field>:null}

              {isExact(type) ? <div className="sm:col-span-2"><Field label="အတိအကျ / Final COD to Collect">
                <BufferedDataEntryInput type="number" className={inputClass} value={row.merchant_stated_total_amount} onCommit={(value)=>updateRow(index,{merchant_stated_total_amount:value===""?"":Number(value)})}/>
              </Field></div>:null}

              <Field label="CBM Surcharge">
                <BufferedDataEntryInput type="number" className={inputClass} value={row.cbm_surcharge} onCommit={(value)=>updateRow(index,{cbm_surcharge:value===""?"":Number(value)})}/>
              </Field>

              <Field label="Other Surcharge">
                <BufferedDataEntryInput type="number" className={inputClass} value={row.other_surcharge} onCommit={(value)=>updateRow(index,{other_surcharge:value===""?"":Number(value)})}/>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Remarks">
                  <BufferedDataEntryInput multiline rows={2} className={inputClass} value={row.remarks} onCommit={(value)=>updateRow(index,{remarks:value})}/>
                </Field>
              </div>
            </div>
          </div>

          {route.stationRequired?<div data-highway-station-selection-v19="true" className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Highway Bus-Station Handoff</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Terminal / Gate Name">
                <BufferedDataEntryInput className={inputClass} value={row.handoffStationName} onCommit={(value)=>updateRow(index,{handoffStationCode:"OTHER",handoffStationName:value,calculation:{}})} placeholder="Type terminal / gate name"/>
              </Field>
              <Field label="Delivery Charge (MMK)">
                <BufferedDataEntryInput className={inputClass} type="number" min="0" step="1" value={row.delivery_charges} onCommit={(value)=>updateRow(index,{delivery_charges:value===""?"":Number(value),calculation:{}})} placeholder="Enter delivery charge"/>
              </Field>
            </div>
            {!stationReady?<div className="mt-2 text-[10px] font-bold text-rose-300">Terminal name and delivery charge are required before Calculate/Save.</div>:null}
          </div>:null}

          <div className="rounded-xl border border-[#f6b84b]/35 bg-[#071b2b] p-3">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6b84b]">Current Calculation Summary</div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-4"><span className="text-[#8db4ce]">Calculated COD</span><b>{money(c.cod_amount)}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[#8db4ce]">Base Delivery Tariff</span><b>{money(c.base_tariff)}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[#8db4ce]">Britium Entitlement</span><b>{money(c.net_system_delivery_charge)}</b></div>
              <div className="mt-2 flex justify-between gap-4 border-t border-[#31506a] pt-2 text-[13px]"><span className="font-black text-[#f6b84b]">Merchant Settlement</span><b className="text-[#f6b84b]">{money(c.merchant_final_settlement_amount)}</b></div>
            </div>
          </div>

          <details open={!photoReady} className="rounded-xl border border-[#31506a] bg-[#071b2b]">
            <summary className="cursor-pointer list-none px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
              Photo Verification & Evidence · {photoReady?"READY":"ACTION REQUIRED"}
            </summary>
            <div className="border-t border-[#31506a] p-3">
              {row.photoUnavailableAcknowledged ? (
                <div className="rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-[11px] text-amber-100">
                  <FileSpreadsheet size={14} className="mr-2 inline"/><b>OS softcopy evidence authorized.</b> Source: {row.sourceFileName||"—"}, row {row.sourceRowNumber||"—"}. Reason: {row.photoBypassReason||"—"}
                </div>
              ) : row.photoTemporaryWaiver ? (
                <div data-temporary-photo-waiver-v54="true" className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 text-[11px] text-amber-100">
                  <div className="font-black">Temporary photo-verification waiver active</div>
                  <div className="mt-1"><b>Reason:</b> {row.photoTemporaryWaiverReason||"Temporary operational waiver"}</div>
                  <button type="button" disabled={busy||row.photoReviewBusy||row.saved} onClick={()=>togglePhotoWaiver(index,false)} className="mt-3 rounded-lg border border-amber-300/50 px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-50">Restore normal photo verification</button>
                </div>
              ) : row.proof_url ? (
                <>
                  <button type="button" onClick={() => { setPhotoZoom(1); setPhotoPreviewOpen(true); }} className="flex w-full items-center gap-3 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-left hover:border-[#f6b84b]" aria-label="Enlarge parcel proof on this screen">
                    <img src={displayProofUrl} alt="Proof" className="h-16 w-24 rounded-lg object-cover" />
                    <div><div className="text-[11px] font-black text-[#68e8bd]"><ImageIcon size={14} className="mr-2 inline" />FIELD PROOF RECEIVED</div><div className="mt-1 text-[10px] text-[#8db4ce]">Click to enlarge</div></div>
                  </button>
                  {photoPreviewOpen ? (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 md:p-6" role="dialog" aria-modal="true" aria-label="Parcel proof preview" onClick={() => setPhotoPreviewOpen(false)}>
                      <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[#2a5272] bg-[#071b2c] shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a3a5c] px-4 py-3">
                          <div><div className="text-[11px] font-black uppercase tracking-widest text-[#f6b84b]">Parcel {row.parcel_sequence} photo verification</div><div className="mt-1 text-[10px] text-[#8db4ce]">{row.delivery_way_id || row.pickup_id}</div></div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setPhotoZoom((v) => Math.max(0.5, v - 0.25))} className="rounded-lg border border-[#2a5272] px-3 py-2 text-sm font-black text-white">−</button>
                            <span className="min-w-14 text-center text-xs font-bold text-[#9cc2d9]">{Math.round(photoZoom * 100)}%</span>
                            <button type="button" onClick={() => setPhotoZoom((v) => Math.min(3, v + 0.25))} className="rounded-lg border border-[#2a5272] px-3 py-2 text-sm font-black text-white">+</button>
                            <button type="button" onClick={() => setPhotoZoom(1)} className="rounded-lg border border-[#2a5272] px-3 py-2 text-[11px] font-bold text-white">Reset</button>
                            <button type="button" onClick={() => setPhotoPreviewOpen(false)} className="rounded-lg bg-[#f6b84b] px-3 py-2 text-[11px] font-black text-[#061524]">Close</button>
                          </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto bg-[#020912] p-3 text-center"><img src={displayProofUrl} alt={"Parcel " + row.parcel_sequence + " full proof"} className="mx-auto max-w-none rounded-lg object-contain transition-transform" style={{ width: String(photoZoom * 100) + "%", maxHeight: photoZoom <= 1 ? "78vh" : "none" }} /></div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : row.isAdditionalRegistration ? (
                <div className="rounded-xl border border-cyan-300/35 bg-cyan-400/10 p-3 text-[11px] text-cyan-100">
                  <Plus size={14} className="mr-2 inline"/>Authorized merchant addition; pickup-level evidence applies.
                </div>
              ) : (
                <div className="rounded-xl border border-[#ff4f86]/40 bg-[#ff4f86]/10 p-3 text-[11px] text-[#ff9abd]">
                  <ImageIcon size={14} className="mr-2 inline" />{row.proof_ref?"Stored proof exists but could not be securely displayed.":"No Rider / Driver parcel photo exists."}
                </div>
              )}

              {!row.isAdditionalRegistration && !row.photoUnavailableAcknowledged && !row.photoTemporaryWaiver?<div data-photo-review="true" className="mt-3 rounded-xl border border-[#f6b84b]/30 bg-[#061524] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#f6b84b]">Photo Review</div>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${row.photoReviewStatus === "APPROVED"?"border-emerald-500/40 bg-emerald-500/10 text-emerald-300":row.photoReviewStatus === "REUPLOAD_REQUIRED"?"border-rose-500/40 bg-rose-500/10 text-rose-300":"border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>{row.photoReviewStatus || "PENDING REVIEW"}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button type="button" disabled={row.photoReviewBusy || !row.proof_url} onClick={() => reviewPhoto(index, "APPROVE")} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-left text-[11px] font-black text-emerald-300 disabled:opacity-50">Approve Photo</button>
                  <select className="w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white" value={row.photoRejectionReason} onChange={(e) => updateRow(index, { photoRejectionReason: e.target.value })}>
                    <option value="">Reject reason…</option>
                    <option value="IMAGE_UNAVAILABLE">Image unavailable</option>
                    <option value="WRONG_PARCEL">Wrong parcel</option>
                    <option value="UNCLEAR_OR_BLURRY">Unclear or blurry</option>
                    <option value="UNRELATED_IMAGE">Unrelated image</option>
                    <option value="PARCEL_NOT_VISIBLE">Parcel not visible</option>
                    <option value="DUPLICATE_IMAGE">Duplicate image</option>
                    <option value="OTHER">Other</option>
                  </select>
                  {row.photoRejectionReason ? <BufferedDataEntryInput multiline rows={2} value={row.photoRejectionNote} onCommit={(value) => updateRow(index, { photoRejectionNote: value })} className="w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white placeholder:text-slate-500" placeholder="Optional detail for the rider…" /> : null}
                  <button type="button" disabled={row.photoReviewBusy || !row.photoRejectionReason} onClick={() => reviewPhoto(index, "REJECT")} className="rounded-lg border border-rose-500/50 bg-rose-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">Reject & Request Re-upload</button>
                </div>
                <div data-photo-waiver-control-v54="true" className="mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3">
                  <input className="w-full rounded-lg border border-amber-300/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white" value={row.photoTemporaryWaiverReason||""} onChange={(e)=>updateRow(index,{photoTemporaryWaiverReason:e.target.value})} placeholder="Temporary waiver reason"/>
                  <button type="button" disabled={row.photoReviewBusy||busy||String(row.photoTemporaryWaiverReason||"").trim().length<10} onClick={()=>togglePhotoWaiver(index,true)} className="mt-2 rounded-lg border border-amber-300/50 bg-amber-400/15 px-3 py-2 text-[10px] font-black text-amber-100 disabled:opacity-50">Temporarily Skip Photo Verification</button>
                </div>
              </div>:null}
            </div>
          </details>

          <details open={route.mapRequired && row.locationStatus!=="SYNCED"} className="rounded-xl border border-[#31506a] bg-[#071b2b]">
            <summary className="cursor-pointer list-none px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
              Location & Address History · {locationReady?"READY":"ACTION REQUIRED"}
            </summary>
            <div className="space-y-3 border-t border-[#31506a] p-3">
              <DeliveryAddressHistory wayId={row.delivery_way_id || canonicalWayId(row.pickup_id,row.parcel_sequence)}/>
              <DataEntryLocationEditor
                pickupId={row.pickup_id}
                parcelSequence={row.parcel_sequence}
                deliveryWayId={row.delivery_way_id}
                address={row.delivery_address}
                township={row.township}
                ward={row.sourceWard}
                postalCode={row.sourcePostalCode}
                autoResolveDelayMs={row.importedFromOs?Math.min(900+index*120,5000):900}
                deferInteractiveMap={row.importedFromOs}
                deferAutomaticResolution={row.importedFromOs}
                externalResolutionStatus={row.locationStatus}
                enabled={route.mapRequired}
                disabledReason={route.stationRequired
                  ?"Google Map is disabled for outside-core highway-terminal handoffs."
                  :"Google Map is disabled for outside-core Royal Express routes."}
                reloadToken={locationReloadToken}
                onResolutionChange={(locationStatus)=>updateRow(index,{locationStatus})}
                onCandidateChange={(locationCandidate)=>updateRow(index,{locationCandidate})}
              />
            </div>
          </details>

          <details className="rounded-xl border border-[#31506a] bg-[#071b2b]">
            <summary className="cursor-pointer list-none px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
              Backend Settlement Details · {text(c.validation_status)||"NOT CALCULATED"}
            </summary>
            <div className="border-t border-[#31506a] p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MoneyBox label="Calculated COD" value={c.cod_amount} highlight />
                <MoneyBox label="Declared Delivery" value={c.delivery_charges ?? row.delivery_charges} />
                <MoneyBox label="Backend Surcharges" value={c.backend_calculated_delivery_surcharges} />
                <MoneyBox label="Base Tariff" value={c.base_tariff} />
                <MoneyBox label="Weight Surcharge" value={c.weight_surcharge} />
                <MoneyBox label="Britium Entitlement" value={c.net_system_delivery_charge} highlight />
                <MoneyBox label="Delivery Difference" value={c.delivery_difference} />
                <MoneyBox label="Merchant Settlement" value={c.merchant_final_settlement_amount} highlight />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className={serverClass}>Settlement direction: <b>{text(c.settlement_direction)||"—"}</b></div>
                <div className={serverClass}>Merchant adjustment: <b>{money(c.merchant_settlement_adjustment)}</b></div>
                <div className={serverClass}>Validation: <b>{text(c.validation_status)||"NOT CALCULATED"}</b></div>
              </div>
            </div>
          </details>
        </div>
      </fieldset>

      {row.message ? <div className="mx-4 mb-3 rounded-lg border border-[#3aa7de]/30 bg-[#061524] p-3 text-[11px] text-[#9fd7f6]">{row.message}</div>:null}

      <div className="sticky bottom-0 z-10 border-t border-[#31506a] bg-[#0b2236]/95 p-3 backdrop-blur">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1.2fr]">
          <button type="button" onClick={() => skip(index)} disabled={busy || row.checking || row.calculating || row.saved} className="rounded-lg border border-amber-300/40 px-3 py-2.5 text-[10px] font-black text-amber-200 disabled:opacity-50">{row.skipped ? "RESUME" : "PENDING / SKIP"}</button>
          <button type="button" onClick={() => calculate(index)} disabled={busy || row.calculating || row.skipped} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3aa7de]/50 bg-[#12314a] px-3 py-2.5 text-[11px] font-black text-[#8fd3ff] disabled:opacity-50">
            {row.calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14}/>} CALCULATE
          </button>
          <button type="button" onClick={() => save(index)} disabled={saveBlocked} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#21c7e8] px-3 py-2.5 text-[11px] font-black text-[#04111d] disabled:opacity-40">
            {row.checking ? <Loader2 size={14} className="animate-spin" /> : <Save size={14}/>} {row.saved?"REGISTERED":"SAVE"}
          </button>
        </div>
        {!photoReady || !locationReady ? <div className="mt-2 text-[9px] text-amber-200">
          {!photoReady?"Photo verification is still required. ":""}{!locationReady?"Location synchronization is still required.":""}
        </div>:null}
      </div>
    </section>
  );
});
function BritiumQuickTools() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [customPickupId, setCustomPickupId] = useState('');
  const [quickToolsOpen,setQuickToolsOpen]=useState(false);
  
  const geocodeInputRef = useRef<HTMLInputElement>(null);
  const convertInputRef = useRef<HTMLInputElement>(null);

  const handleAutoGeocode = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusText('Offline Geocoding... (Instant)');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      // Embedded offline coordinate mapping (No API limits)
      const coordsMap: Record<string, [number, number]> = {
        'ရွှေပြည်သာ': [16.98, 96.09], 'သင်္ဃန်းကျွန်း': [16.82, 96.20], 'မရမ်းကုန်း': [16.86, 96.14],
        'လှိုင်သာယာ': [16.87, 96.06], 'Hlaingtharya (West) Township': [16.87, 96.06],
        'Hlaingtharya(East) Township': [16.87, 96.06], 'ဒဂုံ': [16.79, 96.15], 'လှိုင်': [16.84, 96.12],
        'သာကေတ': [16.80, 96.21], 'တောင်ဥက္ကလာပ': [16.84, 96.19], 'အင်းစိန်': [16.89, 96.10],
        'မင်္ဂလာဒုံ': [17.02, 96.13], 'ရန်ကင်း': [16.83, 96.16], 'အလုံ': [16.78, 96.12],
        'တာမွေ': [16.80, 96.17], 'မြောက်ဥက္ကလာပ': [16.90, 96.16], 'ကျောက်တံတား': [16.77, 96.16],
        'ဗိုလ်တထောင်': [16.77, 96.17], 'လသာ': [16.78, 96.15], 'ဒေါပုံ': [16.78, 96.19],
        'လမ်းမတော်': [16.78, 96.14], 'ပန်းဘဲတန်း': [16.77, 96.15], 'ကမာရွတ်': [16.82, 96.13],
        'ဗဟန်း': [16.81, 96.15], 'စမ်းချောင်း': [16.80, 96.13], 'အောင်မြေသာစံ': [22.0, 96.1],
        'ချမ်းမြသာစည်': [21.94, 96.1], 'ပြည်ကြီးတံခွန်': [21.91, 96.1], 'မဟာအောင်မြေ': [21.96, 96.1],
        'ပုဗ္ဗသီရိ': [19.8, 96.15], 'ဇမ္ဗူသီရိ': [19.74, 96.1], 'ပျဉ်းမနား': [19.74, 96.2]
      };

      let updatedCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row['Action'] === 'APPLY_CORRECTION' && (!row['Corrected Latitude'] || !row['Corrected Longitude'])) {
          const t = row['Township'] ? String(row['Township']).trim() : '';
          
          if (coordsMap[t]) {
            row['Corrected Latitude'] = coordsMap[t][0];
            row['Corrected Longitude'] = coordsMap[t][1];
          } else {
            // Fallback to central Yangon if township is unrecognized
            row['Corrected Latitude'] = 16.8;
            row['Corrected Longitude'] = 96.15;
          }
          updatedCount++;
        }
      }

      setStatusText(`Writing file... (${updatedCount} fixed)`);
      const newWorksheet = XLSX.utils.json_to_sheet(rows);
      workbook.Sheets[sheetName] = newWorksheet;
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      downloadFile(excelBuffer, `Fixed_${file.name}`);
      setStatusText('Success! Instant fix complete.');
    } catch (error) {
      console.error(error);
      setStatusText('Error processing file.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
      if (geocodeInputRef.current) geocodeInputRef.current.value = '';
    }
  };

  const handleTemplateConvert = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const rawId = document.getElementById("customPickupIdInput") ? (document.getElementById("customPickupIdInput") as HTMLInputElement).value : customPickupId;
    if (!rawId.trim()) {
      setStatusText('⚠️ Enter the Target Pickup ID first!');
      setTimeout(() => setStatusText(''), 3000);
      return;
    }

    setIsProcessing(true);
    setStatusText('Applying Option 1: Consolidated Mode...');

    try {
      const XLSX: any = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

      const pickupId = rawId.trim();

      const fuzzyGet = (row: any, keywords: string[]) => {
        const keys = Object.keys(row);
        for (const kw of keywords) {
          const matchedKey = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== "") {
            return String(row[matchedKey]).trim();
          }
        }
        return "";
      };

      const knownTownships = ["ရွှေပြည်သာ", "သင်္ဃန်းကျွန်း", "မရမ်းကုန်း", "လှိုင်သာယာ", "အင်းစိန်", "မင်္ဂလာဒုံ", "မြောက်ဥက္ကလာပ", "တောင်ဥက္ကလာပ", "သာကေတ", "ဒေါပုံ", "ပုဇွန်တောင်", "ဗိုလ်တထောင်", "ကျောက်တံတား", "ပန်းဘဲတန်း", "လသာ", "လမ်းမတော်", "အလုံ", "ကြည့်မြင်တိုင်", "စမ်းချောင်း", "ဗဟန်း", "ဒဂုံ", "ကမာရွတ်", "လှိုင်", "တောင်ဒဂုံ", "မြောက်ဒဂုံ", "အရှေ့ဒဂုံ", "ဒဂုံဆိပ်ကမ်း", "မင်္ဂလာတောင်ညွန့်", "တာမွေ", "ရန်ကင်း", "ပုဗ္ဗသီရိ", "ဇမ္ဗူသီရိ", "အောင်မြေသာစံ", "ချမ်းမြသာစည်"];

      const waybillRows = rows.map((row: any, index: number) => {
        const seq = row["Seq"] || row["No"] || row["Row"] || index + 1;
        const finalWayId = (pickupId.toUpperCase() !== 'AUTO') 
          ? `${pickupId}-${String(seq).padStart(3, '0')}` 
          : fuzzyGet(row, ["way id", "tracking", "pickup id"]);

        let rawTownship = fuzzyGet(row, ["township", "မြို့နယ်", "provider"]);
        const rawAddress = fuzzyGet(row, ["address", "လိပ်စာ", "delivery"]);

        if (!rawTownship || rawTownship === "-" || rawTownship.trim() === "") {
          for (const t of knownTownships) {
            if (rawAddress.includes(t)) {
              rawTownship = t;
              break;
            }
          }
          if (!rawTownship || rawTownship === "-") {
            const match = rawAddress.match(/([^\s၊,]+)(?=\s*မြို့နယ်)/);
            if (match) rawTownship = match[1].trim();
          }
        }

        // OPTION 1 LOGIC: Embed original merchant securely into the Address field for the physical label
        const realMerchant = fuzzyGet(row, ["merchant", "sender", "ကုန်သည်"]);
        const safeAddress = (realMerchant && realMerchant !== "-") 
          ? `[Sender: ${realMerchant}] ${rawAddress}` 
          : rawAddress;

        return {
          "Way ID / Pickup ID": finalWayId,
          "Merchant Name": realMerchant,
          "Receiver Name": fuzzyGet(row, ["receiver", "customer", "အမည်", "name"]),
          "Receiver Phone": fuzzyGet(row, ["phone", "contact", "ဖုန်း"]),
          "City (Dropdown)": fuzzyGet(row, ["city", "region", "တိုင်း", "ပြည်နယ်"]) || "",
          "Township (Dropdown)": rawTownship,
          "Ward / Village Tract (Dropdown)": fuzzyGet(row, ["ward", "ရပ်ကွက်"]),
          "Postal Code (Auto)": fuzzyGet(row, ["postal", "zip", "စာတိုက်"]),
          "Receiver Address": safeAddress, 
          "Actual Weight (KG)": fuzzyGet(row, ["weight", "kg", "အလေးချိန်"]) || "1",
          "Service Type": fuzzyGet(row, ["service", "ဝန်ဆောင်မှု"]) || "STANDARD",
          "Payment Type": fuzzyGet(row, ["payment", "ငွေပေးချေမှု"]) || "ITEM_PRICE_PLUS_DECLARED_DELIVERY",
          "Item Price": fuzzyGet(row, ["item", "cod", "တန်ဖိုး", "price"]),
          "OS Set Price": fuzzyGet(row, ["os set", "delivery charge", "deli", "ပို့ဆောင်ခ"]),
          "Merchant Tier": fuzzyGet(row, ["tier", "အဆင့်"]) || "STANDARD",
          "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)": rawTownship
        };
      });

      const newWorkbook = XLSX.utils.book_new();
      const newWorksheet = XLSX.utils.json_to_sheet(waybillRows);
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Converted Data");
      
      const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
      downloadFile(excelBuffer, `OS_Template_Option1_${file.name}`);
      setStatusText('Option 1 File Ready!');
    } catch (error) {
      console.error(error);
      setStatusText('Error converting template.');
    } finally {
      setTimeout(() => { setIsProcessing(false); setStatusText(''); }, 3000);
    }
  };

  const downloadFile = (buffer: any, filename: string) => {
    const data = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        type="button"
        data-quick-tools-toggle="true"
        aria-expanded={quickToolsOpen}
        onClick={()=>setQuickToolsOpen((open)=>!open)}
        className="fixed bottom-6 right-6 z-[9998] rounded-full border border-[#2b6388] bg-[#0c1e2c] px-4 py-2.5 text-[11px] font-black text-[#f6b84b] shadow-xl hover:bg-[#12314a]"
      >
        {quickToolsOpen ? "CLOSE DATA TOOLS" : "DATA TOOLS"}
      </button>
      {quickToolsOpen?(
      <div className="fixed bottom-20 right-6 z-[9999] flex w-72 flex-col gap-2 rounded-xl border border-[#2b6388] bg-[#0c1e2c] p-4 shadow-2xl">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-[11px] font-black uppercase tracking-widest text-[#f6b84b]">
            Data Processing Tools
          </div>
          <button
            type="button"
            aria-label="Close Data Processing Tools"
            onClick={()=>setQuickToolsOpen(false)}
            className="rounded-md border border-[#2b6388] px-2 py-1 text-xs font-black text-white hover:bg-[#12314a]"
          >
            ×
          </button>
        </div>
      
      <div className="flex flex-col gap-1 mb-2">
        <label className="text-[10px] font-bold text-[#8db4ce]">Remarkable Name (Bulk Container ID)</label>
        <input 
          type="text" 
          defaultValue={customPickupId} id="customPickupIdInput" 
          onChange={e => setCustomPickupId(e.target.value)} 
          placeholder="e.g. INBOUND-0609"
          className="w-full rounded border border-[#1a3a5c] bg-[#061524] px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#f6b84b]"
        />
      </div>
      
      <input type="file" accept=".xlsx, .xls" ref={convertInputRef} onChange={handleTemplateConvert} className="hidden" />
      <button 
        onClick={() => convertInputRef.current?.click()}
        disabled={isProcessing}
        className="rounded bg-[#1a3a53] px-4 py-2 text-xs font-bold text-white hover:bg-[#2b6388] disabled:opacity-50"
      >
        📄 Convert Manifest to Waybill
      </button>

      <input type="file" accept=".xlsx, .xls" ref={geocodeInputRef} onChange={handleAutoGeocode} className="hidden" />
      <button 
        onClick={() => geocodeInputRef.current?.click()}
        disabled={isProcessing}
        className="rounded bg-[#1a3a53] px-4 py-2 text-xs font-bold text-white hover:bg-[#2b6388] disabled:opacity-50"
      >
        🎯 Auto-Geocode Review File
      </button>

      {statusText && (
        <div className="mt-2 text-center text-[10px] font-bold text-[#f6b84b] animate-pulse">
          {statusText}
        </div>
      )}
      </div>
      ):null}
    </>
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
  const [progressDate,setProgressDate]=useState(()=>yangonDateKey());
  const [gridSearch,setGridSearch]=useState("");
  const [gridFilter,setGridFilter]=useState<"ALL"|"REGISTERED"|"PENDING">("ALL");
  // Recycled editor model: render one editable parcel form at a time.
  // All other parcels stay as lightweight state/table rows instead of mounting hundreds of text inputs.
  const PAGE_SIZE=1;
  const [pageIndex,setPageIndex]=useState(0);
  const pageStart=Math.min(pageIndex,Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1))*PAGE_SIZE;
  const locationReviewInputRef=useRef<HTMLInputElement|null>(null);
  const manualLocationCorrectionsRef=useRef(new Map<string,DeliveryLocation>());

  const selectedPickup=useMemo(()=>pickups.find(p=>p.pickup_id===selectedPickupId)||null,[pickups,selectedPickupId]);
  const dailyPickupProgress=useMemo(()=>pickups
    .filter((pickup)=>pickupDateKey(pickup)===progressDate)
    .map((pickup)=>{
      const requested=requestedParcelCount(pickup);
      const authorized=authorizedParcelCount(pickup);
      const registered=positiveInt(pickup.registered_parcels);
      return {...pickup,requested,authorized,registered,remaining:Math.max(authorized-registered,0)};
    })
    .sort((a,b)=>b.remaining-a.remaining||a.pickup_id.localeCompare(b.pickup_id)),[pickups,progressDate]);
  const dailyProgressSummary=useMemo(()=>dailyPickupProgress.reduce((summary,pickup)=>({
    pickups:summary.pickups+1,
    authorized:summary.authorized+pickup.authorized,
    registered:summary.registered+pickup.registered,
    remaining:summary.remaining+pickup.remaining,
  }),{pickups:0,authorized:0,registered:0,remaining:0}),[dailyPickupProgress]);
  const bulkUploadSelected=selectedPickupId===BULK_UPLOAD_PICKUP_ID;
  const sequenceFloorByPickup=useMemo(()=>Object.fromEntries(pickups.map((pickup)=>{
    const draft=bulkImportDrafts[pickup.pickup_id];
    const draftMaximum=draft?.rows.reduce((maximum,row)=>Math.max(maximum,row.parcel_sequence),0)||0;
    return [pickup.pickup_id,Math.max(pickup.registered_parcels,draftMaximum)];
  })),[bulkImportDrafts,pickups]);
  const importedLocationSummary=useMemo(()=>{
    const summary={total:0,synced:0,notRequired:0,resolving:0,review:0,interrupted:0,skipped:0};
    for(const row of rows){
      summary.total+=1;
      summary[locationReadiness(row,routeForRow(row,tariffOptions))]+=1;
    }
    return summary;
  },[rows,tariffOptions]);
  const consolidatedLocationReviewRows=useMemo(()=>{
    const combined=[...Object.values(bulkImportDrafts).flatMap((draft)=>draft.rows),...rows];
    const unique=new Map<string,ParcelRow>();
    for(const row of combined) unique.set(`${row.pickup_id}:${row.parcel_sequence}`,row);
    return [...unique.values()].filter((row)=>
      !row.skipped&&row.locationStatus!=="SYNCED"&&routeForRow(row,tariffOptions).mapRequired
    );
  },[bulkImportDrafts,rows,tariffOptions]);
  const pendingClarificationRows=useMemo(()=>rows.filter((row)=>{
    if(row.saved||row.skipped) return false;
    if(!text(row.recipient_name)||!text(row.recipient_phone)||!text(row.delivery_address)) return true;
    return !routeForRow(row,tariffOptions).providerCode;
  }),[rows,tariffOptions]);
  const registrationGridRows=useMemo(()=>{
    const query=gridSearch.trim().toLowerCase();
    return rows
      .map((row,index)=>({row,index}))
      .filter(({row})=>gridFilter==="REGISTERED"?row.saved:gridFilter==="PENDING"?!row.saved:true)
      .filter(({row})=>{
        if(!query) return true;
        return [
          row.delivery_way_id||canonicalWayId(row.pickup_id,row.parcel_sequence),
          row.sourceMerchantName,
          selectedPickup?.merchant_id,
          selectedPickup?.merchant_name,
          row.recipient_name,
          row.recipient_phone,
          row.township,
          row.delivery_address,
          row.service_provider_code,
          row.saved?"registered":"pending",
        ].some((value)=>text(value).toLowerCase().includes(query));
      })
      .sort((a,b)=>{
        if(a.row.saved!==b.row.saved) return a.row.saved?-1:1;
        return a.row.parcel_sequence-b.row.parcel_sequence;
      });
  },[rows,gridSearch,gridFilter,selectedPickup?.merchant_id,selectedPickup?.merchant_name]);
  const registeredRowCount=useMemo(()=>rows.filter((row)=>row.saved).length,[rows]);

  const updateRow=useCallback((index:number,patch:Partial<ParcelRow>)=>{
    setRows(current=>{
      const row=current[index];
      if(!row) return current;
      const editableKeys: (keyof ParcelRow)[] = ['recipient_name','recipient_phone','township','delivery_address','weight_kg','customer_tier','service_type','amount_entry_type','item_price','delivery_charges','merchant_stated_total_amount','cbm_surcharge','other_surcharge','remarks','handoffStationName','handoffStationCode','sourceWard','sourcePostalCode','service_provider_code'];
      const entryChanged = editableKeys.some(key => patch[key] !== undefined && patch[key] !== row[key]);
      const destinationChanged=(patch.township!==undefined&&patch.township!==row.township)
        ||(patch.delivery_address!==undefined&&patch.delivery_address!==row.delivery_address)
        ||(patch.sourceWard!==undefined&&patch.sourceWard!==row.sourceWard)
        ||(patch.sourcePostalCode!==undefined&&patch.sourcePostalCode!==row.sourcePostalCode)
        ||(patch.service_provider_code!==undefined&&patch.service_provider_code!==row.service_provider_code);
      const next={...patch,message:patch.message??"",...(entryChanged?{saved:false,calculation:{},calculationFailed:false}:{}),...(destinationChanged?{
        saved:false,calculation:{},calculationFailed:false,locationCandidate:null,
        locationStatus:((patch.deliveryMode||row.deliveryMode)==="DOORSTEP_MAP"?"PENDING":"NOT_REQUIRED") as DataEntryLocationResolution
      }:{})};
      if(Object.entries(next).every(([key,value])=>Object.is((row as any)[key],value))) return current;
      const updated=current.slice();
      updated[index]={...row,...next};
      return updated;
    });
  },[]);
  const lookupPhoneHistory=useCallback(async(index:number,phoneValue:string)=>{
    const phone=text(phoneValue).trim();
    const digits=phone.replace(/\D/g,"");
    if(digits.length<6) return;
    try{
      let matches:PhoneHistoryMatch[]=[];
      const response=await (supabase as any).rpc("be_data_entry_phone_history_v81",{p_phone:phone,p_limit:3});
      if(!response.error && Array.isArray(response.data)){
        matches=response.data;
      }else{
        const fallback=await (supabase as any)
          .from("be_data_entry_parcel_details")
          .select("recipient_name,contact_no_1,contact_no_2,township,city,region_state,recipient_address,merchant_id,delivery_way_id,saved_at")
          .or(`contact_no_1.eq.${phone},contact_no_2.eq.${phone}`)
          .order("saved_at",{ascending:false})
          .limit(3);
        if(!fallback.error){
          matches=(fallback.data||[]).map((item:any,index:number)=>({
            history_rank:index+1,
            recipient_name:text(item.recipient_name),
            recipient_phone:text(item.contact_no_1),
            secondary_phone:text(item.contact_no_2),
            township:text(item.township),
            city:text(item.city),
            region_state:text(item.region_state),
            recipient_address:text(item.recipient_address),
            merchant_id:text(item.merchant_id),
            delivery_way_id:text(item.delivery_way_id),
            saved_at:text(item.saved_at),
          }));
        }else if(response.error){
          console.warn("Phone-history lookup unavailable.",response.error.message,fallback.error.message);
        }
      }
      const match=matches[0];
      if(!match) return;
      setRows((current)=>{
        const row=current[index];
        if(!row || text(row.recipient_phone).trim()!==phone) return current;
        const recipient_name=row.recipient_name||text(match.recipient_name);
        const delivery_address=row.delivery_address||text(match.recipient_address);
        const township=row.township||text(match.township);
        const candidate={...row,recipient_name,delivery_address,township};
        const route=resolveDataEntryServiceProvider(township,delivery_address,tariffOptions,{fallbackUnknownToRoyal:true,itemPrice:row.item_price});
        const filled=[
          !row.recipient_name&&Boolean(recipient_name)?"recipient name":"",
          !row.delivery_address&&Boolean(delivery_address)?"address":"",
          !row.township&&Boolean(township)?"township":"",
        ].filter(Boolean);
        if(!filled.length) return current;
        const updated=current.slice();
        updated[index]={
          ...candidate,
          ...(route.providerCode?routingPatch(route,candidate):{}),
          saved:false,
          calculation:{},
          calculationFailed:false,
          message:`Historical contact match autofilled ${filled.join(", ")} from ${text(match.delivery_way_id)||"a previous registration"}${matches.length>1?` · ${matches.length} recent matches found; latest used.`:"."}`,
        };
        return updated;
      });
    }catch(error:any){
      console.warn("Phone-history autofill failed.",error?.message||error);
    }
  },[tariffOptions]);

  const rowActionsRef=useRef({calculateRow,saveRow,reviewPhoto,togglePhotoWaiver,toggleSkip});
  useLayoutEffect(()=>{rowActionsRef.current={calculateRow,saveRow,reviewPhoto,togglePhotoWaiver,toggleSkip};});
  const calculateEditorRow=useCallback((...args:any[])=>rowActionsRef.current.calculateRow(...args),[]);
  const skipEditorRow=useCallback((index:number)=>rowActionsRef.current.toggleSkip(index),[]);
  const saveEditorRow=useCallback((...args:any[])=>rowActionsRef.current.saveRow(...args),[]);
  const reviewEditorPhoto=useCallback((...args:any[])=>rowActionsRef.current.reviewPhoto(...args),[]);
  const toggleEditorPhotoWaiver=useCallback((...args:any[])=>rowActionsRef.current.togglePhotoWaiver(...args),[]);

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

      let p=await (supabase as any).rpc("be_data_entry_pickup_list_web_v16",{p_limit:500});
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
    const count = authorizedParcelCount(pickup,observedCount);
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
      };
    });
    const held=await (supabase as any).from("be_data_entry_pending_drafts").select("parcel_sequence,snapshot,skipped").eq("pickup_id",pickup.pickup_id);
    if(held.error) throw held.error;
    const heldBySequence=new Map<number,any>((held.data||[]).map((d:any)=>[d.parcel_sequence,d]));
    const restoredRows=nextRows.map(row=>{
      const draft=heldBySequence.get(row.parcel_sequence);
      const persisted=(proofResponses.find(r=>r.source==="be_data_entry_parcel_details")?.response.data||[]).some((d:any)=>Number(d.parcel_sequence)===row.parcel_sequence);
      if(!draft || persisted) return row;
      const restored={...row,...draft.snapshot,pickup_id:pickup.pickup_id,parcel_sequence:row.parcel_sequence,
        saved:false,skipped:draft.skipped,checking:false,calculating:false,calculation:{},
        message:draft.skipped?"Pending clarification saved. Resume when details are available.":"Draft restored. Review and save."};
      return {...restored,...routingPatch(routeForRow(restored,tariffOptions),restored)};
    });
    const locations=new Map<string,any>();
    for(let offset=0;offset<restoredRows.length;offset+=100){
      const result=await (supabase as any).rpc("be_delivery_location_batch_v10",{p_delivery_way_ids:restoredRows.slice(offset,offset+100).map(row=>row.delivery_way_id)});
      if(result.error) throw result.error;
      for(const location of result.data||[]) if(location.review_status==="ACCEPTED") locations.set(location.delivery_way_id,location);
    }
    return {tierAccess:nextTierAccess,rows:restoredRows.map(row=>{
      const location=locations.get(row.delivery_way_id);
      if(!location || !validMyanmarCoordinate(Number(location.longitude),Number(location.latitude))) return row;
      // Keep parcel text and finance intact; recover the accepted pin only for the same address/township.
      if(location.address_original!==row.delivery_address || location.township!==row.township) return row;
      return {...row,locationStatus:row.deliveryMode==="DOORSTEP_MAP"?"SYNCED" as const:"NOT_REQUIRED" as const,locationCandidate:{deliveryWayId:row.delivery_way_id,label:location.address_original,originalAddress:location.address_original,englishAddress:location.address_english||location.address_original,township:location.township,latitude:Number(location.latitude),longitude:Number(location.longitude),matchLevel:location.match_level,confidence:Number(location.confidence),coordinateSource:location.coordinate_source,reviewStatus:location.review_status}};
    })};
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

  async function toggleSkip(index:number){
    const row=rows[index];
    if(!row || row.saved || row.checking || bulkSaving || bulkCalculating) return;
    const skipped=!row.skipped;
    updateRow(index,{checking:true});
    try{
      const {data,error}=await supabase.auth.getUser();
      if(error || !data.user) throw error||new Error("Sign in to save a pending clarification.");
      const snapshot={...row,skipped,saved:false,checking:false,calculating:false,calculation:{}};
      const result=await (supabase as any).from("be_data_entry_pending_drafts").upsert({
        owner_id:data.user.id,pickup_id:row.pickup_id,parcel_sequence:row.parcel_sequence,
        snapshot,skipped,updated_at:new Date().toISOString()
      },{onConflict:"owner_id,pickup_id,parcel_sequence"});
      if(result.error) throw result.error;
      setRows(current=>current.map(r=>r.pickup_id===row.pickup_id&&r.parcel_sequence===row.parcel_sequence
        ?{...r,skipped,checking:false,message:skipped?"Pending clarification saved. Calculate All and Save All exclude this row. Resume before final waybill generation.":"Resumed. Review the details, calculate and save."}:r));
    }catch(error:any){
      setRows(current=>current.map(r=>r.pickup_id===row.pickup_id&&r.parcel_sequence===row.parcel_sequence
        ?{...r,checking:false,message:error?.message||"Could not save Skip state. This row has not been skipped."}:r));
    }
  }

  async function skipPendingClarificationAll(){
    if(!pendingClarificationRows.length||bulkSaving||bulkCalculating||locationReviewBusy||waybillBusy) return;
    setBulkSaving(true);
    setBulkMessage("");
    try{
      const {data,error}=await supabase.auth.getUser();
      if(error||!data.user) throw error||new Error("Sign in to preserve pending clarifications.");
      const now=new Date().toISOString();
      const eligibleKeys=new Set(pendingClarificationRows.map((row)=>`${row.pickup_id}:${row.parcel_sequence}`));
      const drafts=pendingClarificationRows.map((row)=>({
        owner_id:data.user!.id,
        pickup_id:row.pickup_id,
        parcel_sequence:row.parcel_sequence,
        skipped:true,
        updated_at:now,
        snapshot:{...row,skipped:true,saved:false,checking:false,calculating:false,calculation:{},message:"Pending clarification saved in bulk. Resume when customer or merchant details are available."},
      }));
      const result=await (supabase as any).from("be_data_entry_pending_drafts").upsert(drafts,{onConflict:"owner_id,pickup_id,parcel_sequence"});
      if(result.error) throw result.error;
      const applySkipped=(row:ParcelRow)=>eligibleKeys.has(`${row.pickup_id}:${row.parcel_sequence}`)
        ?{...row,skipped:true,saved:false,checking:false,calculating:false,calculation:{},message:"Pending clarification saved in bulk. Resume when details are available."}
        :row;
      setRows((current)=>current.map(applySkipped));
      setBulkImportDrafts((current)=>Object.fromEntries(Object.entries(current).map(([pickupId,draft])=>[pickupId,{...draft,rows:draft.rows.map(applySkipped)}])));
      setBulkMessage("Skipped and preserved "+drafts.length+" pending clarification row(s). Calculate All and Save All will continue with the remaining ready parcels.");
    }catch(error:any){
      setBulkMessage(error?.message||"Unable to preserve pending clarification rows.");
    }finally{
      setBulkSaving(false);
    }
  }

  async function calculateRow(index:number):Promise<boolean>{
    if(!selectedPickup) return false;
    const row=rows[index]; if(!row || row.skipped) return false;
    updateRow(index,{calculating:true,calculation:{},message:""});
    try{
      const r=await calculateWithTimeoutRetry<any>(()=>(supabase as any).rpc("be_data_entry_financial_v2_calculate",{p_payload:payload(row,selectedPickup)}));
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
        calculationFailed:!e.ok,
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
      updateRow(index,{calculating:false,calculationFailed:true,message:error?.message||"Backend calculation failed."});
      return false;
    }
  }

  async function togglePhotoWaiver(index:number, enabled:boolean){
    const row=rows[index]; if(!row) return;
    const reason=String(row.photoTemporaryWaiverReason||"").trim();
    if(enabled && reason.length<10){
      updateRow(index,{message:"Enter a clear reason of at least 10 characters before temporarily skipping photo verification."});
      return;
    }
    updateRow(index,{photoReviewBusy:true,message:""});
    try{
      const response=await (supabase as any).rpc("be_data_entry_photo_waiver_v54",{p_payload:{
        action:enabled?"WAIVE":"CLEAR",
        pickup_id:row.pickup_id,
        parcel_sequence:row.parcel_sequence,
        delivery_way_id:row.delivery_way_id||canonicalWayId(row.pickup_id,row.parcel_sequence),
        reason:enabled?reason:null,
      }});
      if(response.error) throw response.error;
      if(response.data?.ok===false) throw new Error(response.data?.error||response.data?.message||"Temporary photo waiver failed.");
      updateRow(index,{
        photoReviewBusy:false,
        photoTemporaryWaiver:enabled,
        photoTemporaryWaiverReason:enabled?reason:"No order picker currently available",
        photoReviewStatus:enabled?"TEMPORARY_WAIVER":"PENDING_REVIEW",
        photoReviewed:enabled,
        photoUnavailableAcknowledged:false,
        message:enabled
          ?"Temporary photo-verification waiver recorded. Save can proceed; restore normal verification when order pickers are available."
          :"Temporary waiver revoked. Normal photo approval is required again before Save."
      });
    }catch(error:any){
      updateRow(index,{photoReviewBusy:false,message:error?.message||"Temporary photo waiver failed."});
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
        photoTemporaryWaiver:false,
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
    const row=rows[index]; if(!row || row.skipped) return;

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
      let completed=0;
      let cursor=0;
      const total=rows.length;
      const sourceRows=[...rows];
      const sourcePickup=selectedPickup!;
      const sourcePayloads=sourceRows.map(row=>JSON.stringify(payload(row,sourcePickup)));
      const failures:string[]=[];
      const results=new Map<number,{ok:boolean;patch:Partial<ParcelRow>}>();
      const worker=async()=>{
        while(cursor<total){
          const index=cursor++;
          const row=sourceRows[index];
          if(row.skipped) continue;
          try{
            const r=await calculateWithTimeoutRetry<any>(()=>(supabase as any).rpc("be_data_entry_financial_v2_calculate",{p_payload:JSON.parse(sourcePayloads[index])}));
            if(r.error) throw r.error;
            const e=envelope(r.data);
            const resolution=e.raw?.server_resolution||{};
            const resolvedTier=text(resolution.resolved_customer_tier||e.data?.customer_tier).toUpperCase();
            const resolvedProvider=text(e.data?.service_provider_code||resolution.service_provider_code).toUpperCase();
            const resolvedRegion=text(e.data?.delivery_region||resolution.delivery_region).toUpperCase() as DataEntryRouteRegion;
            const resolvedMode=text(e.data?.delivery_route_mode||resolution.delivery_route_mode).toUpperCase() as DataEntryDeliveryMode;
            results.set(index,{ok:e.ok,patch:{
              calculating:false,
              calculation:{...e.data,server_resolution:resolution},
        calculationFailed:!e.ok,
              ...(resolvedTier?{customer_tier:resolvedTier}:{}),
              ...(resolvedProvider?{service_provider_code:resolvedProvider}:{}),
              ...(resolvedRegion?{deliveryRegion:resolvedRegion}:{}),
              ...(resolvedMode?{deliveryMode:resolvedMode}:{}),
              message:e.ok?`Calculation completed. Tier source: ${text(resolution.customer_tier_source)||"server"}.`:(envelopeMessage(e)||"Calculation failed."),
            }});
            if(e.ok) calculated+=1;
            else failures.push(`Parcel ${row.parcel_sequence}: ${envelopeMessage(e)||"Calculation failed."}`);
          }catch(error:any){
            failures.push(`Parcel ${row.parcel_sequence}: ${error?.message||"Backend calculation failed."}`);
            results.set(index,{ok:false,patch:{calculating:false,calculationFailed:true,calculation:{},message:error?.message||"Backend calculation failed."}});
          }
          completed+=1;
          if(completed===total||completed%2===0) setBulkMessage(`Calculating parcels: ${completed}/${total} completed · ${calculated} successful.`);
        }
      };
      await Promise.all(Array.from({length:Math.min(2,total)},()=>worker()));
      setRows(current=>current.map((row,index)=>{
        const result=results.get(index);
        if(!result || row.skipped) return row;
        if(row.pickup_id!==sourceRows[index]?.pickup_id || row.parcel_sequence!==sourceRows[index]?.parcel_sequence) return row;
        if(JSON.stringify(payload(row,sourcePickup))!==sourcePayloads[index]) return {...row,calculating:false,calculationFailed:true,calculation:{},message:"This parcel was edited during bulk calculation. Calculate it again to use the updated values."};
        return {...row,...result.patch};
      }));
      setBulkMessage(`Attempted ${completed} row(s): ${calculated} successful; ${failures.length} failed; ${sourceRows.filter(r=>r.skipped).length} skipped pending clarification. ${failures.slice(0,8).join(" | ")}${failures.length>8?" · Additional errors are shown on their parcel rows.":""}`);
    }finally{
      setBulkCalculating(false);
    }
  }

  function rowSaveObstacle(row:ParcelRow):string {
    if(row.skipped) return "Pending clarification";
    if(!text(row.recipient_name)) return "Recipient name needs clarification";
    if(!text(row.recipient_phone)) return "Recipient phone needs clarification";
    if(!text(row.delivery_address)) return "Delivery address needs clarification";
    if(row.calculationFailed || row.calculation?.validation_status==="ERROR") return row.message||"Financial calculation needs correction. Recalculate this parcel.";
    if(!row.isAdditionalRegistration&&!row.photoReviewed&&!row.photoUnavailableAcknowledged) return "Photo approval required";
    if(row.photoUnavailableAcknowledged&&(!row.importedFromOs||!row.sourceFileName||row.photoBypassReason.trim().length<10)) return "OS evidence source or reason is incomplete";
    const route=routeForRow(row,tariffOptions);
    if(!route.providerCode) return "Destination needs clarification";
    if(!handoffStationReady(row,route)) return "Highway terminal name and charge required";
    if(route.mapRequired&&row.locationStatus!=="SYNCED") return "Location needs synchronization or review";
    return "";
  }

  function downloadUnresolvedRows(){
    const unresolved=rows.filter(row=>!row.saved&&Boolean(rowSaveObstacle(row)));
    const content={pickup_id:selectedPickupId,exported_at:new Date().toISOString(),rows:unresolved.map(row=>({
      parcel_sequence:row.parcel_sequence,delivery_way_id:row.delivery_way_id,
      source_file:row.sourceFileName,source_row:row.sourceRowNumber,
      merchant:row.sourceMerchantName,township:row.township,provider:row.service_provider_code,
      customer_tier:row.customer_tier,recipient_name:row.recipient_name,recipient_phone:row.recipient_phone,
      address:row.delivery_address,item_price:row.item_price,delivery_charges:row.delivery_charges,
      amount_entry_type:row.amount_entry_type,exact_collection:row.merchant_stated_total_amount,
      highway_station:row.handoffStationName,location_status:row.locationStatus,
      skipped:Boolean(row.skipped),error:row.message||rowSaveObstacle(row)
    }))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="Britium_Unresolved_Rows_"+selectedPickupId+".json";
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function preserveBlockedDrafts(blocked:ParcelRow[]){
    if(!blocked.length) return;
    const {data,error}=await supabase.auth.getUser();
    if(error||!data.user) throw error||new Error("Sign in to preserve pending parcels.");
    for(let offset=0;offset<blocked.length;offset+=SAFE_TRANSACTION_ROWS){
      const group=blocked.slice(offset,offset+SAFE_TRANSACTION_ROWS);
      const result=await (supabase as any).from("be_data_entry_pending_drafts").upsert(group.map(row=>({
        owner_id:data.user!.id,pickup_id:row.pickup_id,parcel_sequence:row.parcel_sequence,
        skipped:Boolean(row.skipped),updated_at:new Date().toISOString(),
        snapshot:{...row,skipped:Boolean(row.skipped),saved:false,checking:false,calculating:false,calculation:{},message:rowSaveObstacle(row)}
      })),{onConflict:"owner_id,pickup_id,parcel_sequence"});
      if(result.error) throw new Error("Pending parcels could not be preserved: "+result.error.message);
      const keys=new Set(group.map(row=>row.pickup_id+":"+row.parcel_sequence));
      setRows(current=>current.map(row=>keys.has(row.pickup_id+":"+row.parcel_sequence)?{...row,message:"Pending draft saved: "+rowSaveObstacle(row)+". Correct the issue and retry Calculate All / Save All."}:row));
    }
  }

  async function persistAllRows(reason:string){
    if(!selectedPickup||!rows.length) throw new Error("Select a pickup first.");
    if(rows.some(row=>row.checking)) throw new Error("Wait for the current save or Skip action to finish.");
    const blocked=rows.filter(row=>!row.saved&&!row.skipped&&Boolean(rowSaveObstacle(row)));
    await preserveBlockedDrafts(blocked);
    const heldCount=rows.filter(row=>row.skipped).length+blocked.length;
    const pendingRows=rows.filter((row)=>!row.saved&&!rowSaveObstacle(row));
    if(!pendingRows.length) return {ok:true,persisted:true,saved_count:0,rows:[],batch_count:0,held_count:heldCount};
    const batches=consecutivePendingBatches(pendingRows,Math.min(5,SAFE_TRANSACTION_ROWS));
    let batchCount=batches.length;
    let savedCount=0;
    const allSavedResults:any[]=[];
    for(let batchIndex=0;batchIndex<batches.length;batchIndex++){
      const batchRows=batches[batchIndex];
      const batchNumber=batchIndex+1;
      setBulkMessage(`Saving batch ${batchNumber}/${batchCount}: ${savedCount}/${pendingRows.length} row(s) committed.`);
      const response=await (supabase as any).rpc("be_data_entry_financial_v2_save_batch_v22",{p_payload:{
        request_id:requestId(`FINANCIAL_V2_SAVE_ALL_BATCH_${batchNumber}`),
        pickup_id:selectedPickup.pickup_id,
        reason:`${reason} · consecutive batch ${batchNumber}/${batchCount}`,
        rows:batchRows.map((row)=>({
          ...payload(row,selectedPickup),
          destination:selectedPickup.city||null,
        })),
      }});
      // A PostgreSQL statement cancellation rolls back this transaction. Split only
      // this confirmed database timeout; never replay an uncertain network result.
      if((response.error?.code==="57014"||/canceling statement due to statement timeout/i.test(response.error?.message||""))&&batchRows.length>1){
        const middle=Math.ceil(batchRows.length/2);
        batches.splice(batchIndex,1,batchRows.slice(0,middle),batchRows.slice(middle));
        batchCount=batches.length;
        batchIndex-=1;
        setBulkMessage(`Database canceled a slow batch; retrying it as smaller transactions. ${savedCount} row(s) remain committed.`);
        continue;
      }
      if(response.error) throw new Error(`Batch ${batchNumber}/${batchCount} failed after ${savedCount} row(s) were committed: ${response.error.message}. Retry Save All to continue with unsaved rows only.`);
      const result=response.data||{};
      if(!result.ok || result.persisted===false){
        const e=envelope(result);
        throw new Error(`Batch ${batchNumber}/${batchCount} failed after ${savedCount} row(s) were committed: ${envelopeMessage(e)||result?.errors?.[0]?.message||"save was not confirmed"}. Retry Save All to continue with unsaved rows only.`);
      }
      const savedResults=Array.isArray(result.rows)?result.rows:[];
      const savedBySequence=new Map(savedResults.map((item:any,index:number)=>[batchRows[index]?.parcel_sequence,item]));
      const savedSequences=new Set(batchRows.map((row)=>row.parcel_sequence));
      savedCount+=batchRows.length;
      allSavedResults.push(...savedResults);
      setRows((current)=>current.map((row)=>{
        if(row.pickup_id!==selectedPickup.pickup_id || !savedSequences.has(row.parcel_sequence)) return row;
        const savedResult=savedBySequence.get(row.parcel_sequence) as any;
        return {
          ...row,
          saved:true,
          delivery_way_id:text(savedResult?.canonical_way_id||row.delivery_way_id||`${row.pickup_id}-${String(row.parcel_sequence).padStart(3,"0")}`),
          calculation:{...row.calculation,...(savedResult?.data||{})},
          message:`Saved in consecutive batch ${batchNumber}/${batchCount}.`,
        };
      }));
      setBulkImportDrafts((current)=>{
        const draft=current[selectedPickup.pickup_id];
        if(!draft) return current;
        return {...current,[selectedPickup.pickup_id]:{
          ...draft,
          rows:draft.rows.map((row)=>savedSequences.has(row.parcel_sequence)?{...row,saved:true,message:`Saved in consecutive batch ${batchNumber}/${batchCount}.`}:row),
        }};
      });
    }
    const newlySaved=new Set(pendingRows.map(row=>row.parcel_sequence));
    const savedVisibleCount=rows.filter(row=>row.saved||newlySaved.has(row.parcel_sequence)).length;
    setPickups((current)=>current.map((pickup)=>pickup.pickup_id===selectedPickup.pickup_id?{...pickup,registered_parcels:Math.max(pickup.registered_parcels,savedVisibleCount)}:pickup));
    return {ok:true,persisted:true,saved_count:savedCount,rows:allSavedResults,batch_count:batchCount,held_count:heldCount};
  }

  async function saveAll(){
    if(bulkSaving) return;
    setMessage("");
    setBulkSaving(true);
    setBulkMessage("");
    try{
      const result=await persistAllRows("PORTAL_FINANCIAL_V2_SAVE_ALL");
      if(selectedPickup){
        setBulkImportDrafts((current)=>{
          const draft=current[selectedPickup.pickup_id];
          return draft?{...current,[selectedPickup.pickup_id]:{...draft,saved:result.held_count===0}}:current;
        });
      }
      setBulkMessage(result.saved_count
        ? `Saved ${Number(result.saved_count)} row(s) in ${Number(result.batch_count)} consecutive audited batch(es). ${result.held_count} preserved pending clarification. Use Resume on those parcels when ready.`
        : `No additional ready rows to save. ${result.held_count} pending draft(s) remain; use Resume to resolve them.`
      );
    }catch(error:any){
      setBulkMessage(error?.message||"Save All failed. Successfully committed batches remain saved; retry to continue with unsaved rows only.");
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
      if(!sourceRow || existing.saved) return existing;
      const requestedTier=text(sourceRow.merchantTier||"STANDARD").toUpperCase();
      const customerTier=pickupTierAccess.can_select_tier
        ? requestedTier
        : pickupTierAccess.resolved_customer_tier||"STANDARD";
      const amountType=(AMOUNT_TYPES.includes(sourceRow.paymentType as AmountType)
        ?sourceRow.paymentType
        :defaultAmountEntryType(sourceRow.merchantName || pickup.merchant_id)) as AmountType;
      const routedItemPrice=amountType==="ITEM_PRICE_PLUS_DECLARED_DELIVERY"?sourceRow.itemPrice:"";
      const destination=resolveImportedDestination(sourceRow.townshipProvider,sourceRow.deliveryAddress,routedItemPrice,tariffOptions,sourceRow.ward,sourceRow.postalCode);
      const tariffOption=destination.option as TariffOption|null;
      const tariffDelivery:number|""=tariffOption?tariffRate(tariffOption,customerTier):"";
      const declaredDelivery:number|""=sourceRow.osSetPrice;
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
        sourceMerchantName:sourceRow.merchantName,
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
        message:`Imported from spreadsheet row ${sourceRow.sourceRowNumber}. ${postalNote} ${destination.mapRequired?"Queued for controlled background location validation.":destination.stationRequired?"Choose the highway handoff station.":"Google Map is not required for this route."} Then Calculate All and Save All.`,
        photoReviewed:importPayload.skipPhotoReview?false:existing.photoReviewed,
        photoUnavailableAcknowledged:importPayload.skipPhotoReview,
        photoReviewStatus:importPayload.skipPhotoReview?"OS_SOFTCOPY_AUTHORIZED":existing.photoReviewStatus,
        photoTemporaryWaiver:false,
        photoTemporaryWaiverReason:"No order picker currently available",
        isAdditionalRegistration:sequence>requestedParcelCount(pickup),
        importedFromOs:true,
        sourceFileName:importPayload.fileName,
        sourceRowNumber:sourceRow.sourceRowNumber,
        sourceRowCount:importPayload.sourceRowCount,
        sourceWard:sourceRow.ward,
        sourcePostalCode:sourceRow.postalCode,
        photoEvidenceMode:importPayload.skipPhotoReview?"OS_SOFTCOPY":"PICKER_PHOTO",
        photoBypassReason:importPayload.skipPhotoReview?importPayload.photoBypassReason:"",
        locationStatus:(destination.mapRequired?"PENDING":"NOT_REQUIRED") as DataEntryLocationResolution,
        saved:false,
      };
    });
    const staged=importPayload.mode==="BULK_UPLOAD"
      ?filled.filter((row)=>sourceBySequence.has(row.parcel_sequence))
      :filled;
    return staged.sort((a,b)=>a.parcel_sequence-b.parcel_sequence);
  }

  function patchImportedLocation(
    pickupId:string,
    parcelSequence:number,
    patch:Partial<ParcelRow>,
    expectedStatuses?:DataEntryLocationResolution[],
  ){
    patchImportedLocationsBatch([{pickupId,parcelSequence,patch,expectedStatuses}]);
  }

  function patchImportedLocationsBatch(
    updates:Array<{pickupId:string;parcelSequence:number;patch:Partial<ParcelRow>;expectedStatuses?:DataEntryLocationResolution[]}>,
  ){
    if(!updates.length) return;
    const byKey=new Map(updates.map((update)=>[update.pickupId+":"+update.parcelSequence,update]));
    const applyPatch=(row:ParcelRow)=>{
      const update=byKey.get(row.pickup_id+":"+row.parcel_sequence);
      if(!update) return row;
      if(update.expectedStatuses&&!update.expectedStatuses.includes(row.locationStatus)) return row;
      return {...row,...update.patch};
    };
    setBulkImportDrafts((current)=>Object.fromEntries(Object.entries(current).map(([pickupId,draft])=>[pickupId,{...draft,rows:draft.rows.map(applyPatch)}])));
    setRows((current)=>current.map(applyPatch));
  }

  async function validateImportedLocationResult(row:ParcelRow):Promise<{pickupId:string;parcelSequence:number;patch:Partial<ParcelRow>;expectedStatuses?:DataEntryLocationResolution[]}>{
    const base={pickupId:row.pickup_id,parcelSequence:row.parcel_sequence,expectedStatuses:["PENDING","SEARCHING"] as DataEntryLocationResolution[]};
    try{
      const found=await Promise.race([
        resolveDeliveryLocation({deliveryWayId:row.delivery_way_id,address:row.delivery_address,township:row.township,ward:row.sourceWard,postalCode:row.sourcePostalCode,merchantId:row.pickup_id,client:supabase}),
        new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error("Location validation timed out after 20 seconds. Retry this row; only genuinely ambiguous addresses should use Review Excel.")),20000)),
      ]);
      if(!found||!validMyanmarCoordinate(found.longitude,found.latitude)){
        return {...base,patch:{locationStatus:"REVIEW_REQUIRED",locationCandidate:found||null,message:"No reliable Google location was found. This row was added to the consolidated review workbook."}};
      }
      const reviewRequired=found.reviewStatus==="MANUAL_REVIEW"||found.matchLevel==="WARD_APPROXIMATE";
      if(reviewRequired){
        return {...base,patch:{locationStatus:"REVIEW_REQUIRED",locationCandidate:found,message:"The Google result is approximate or needs township/postal confirmation. This row was added to the consolidated review workbook."}};
      }
      const accepted={...found,originalAddress:row.delivery_address};
      if(manualLocationCorrectionsRef.current.has(row.delivery_way_id)){
        return {...base,patch:{locationStatus:"REVIEW_REQUIRED",locationCandidate:accepted,message:"A manual location correction is already pending for this parcel."}};
      }
      await saveDeliveryLocation(supabase,accepted);
      const manualOverride=manualLocationCorrectionsRef.current.get(row.delivery_way_id);
      if(manualOverride){
        await saveDeliveryLocation(supabase,manualOverride);
        return {...base,patch:{locationStatus:"SYNCED",locationCandidate:manualOverride,message:"Manual location correction synchronized with Wayplan."}};
      }
      return {...base,patch:{locationStatus:"SYNCED",locationCandidate:accepted,message:"Google location validated automatically and synchronized with Wayplan."}};
    }catch(error:any){
      return {...base,patch:{locationStatus:"REVIEW_REQUIRED",message:error?.message||"Location validation failed. This row was added to the consolidated review workbook."}};
    }
  }

  async function validateImportedLocations(drafts:Record<string,BulkImportDraft>){
    const jobs=Object.values(drafts).flatMap((draft)=>draft.rows).filter((row)=>
      !row.skipped&&routeForRow(row,tariffOptions).mapRequired&&row.locationStatus==="PENDING"
    );
    for(let offset=0;offset<jobs.length;offset+=LOCATION_VALIDATION_BATCH_SIZE){
      const batch=jobs.slice(offset,offset+LOCATION_VALIDATION_BATCH_SIZE);
      patchImportedLocationsBatch(batch.map((row)=>({
        pickupId:row.pickup_id,parcelSequence:row.parcel_sequence,
        patch:{locationStatus:"SEARCHING",message:"Validating this address in the controlled background queue…"},
        expectedStatuses:["PENDING"],
      })));
      const results=await Promise.all(batch.map((row)=>validateImportedLocationResult({...row,locationStatus:"SEARCHING"})));
      patchImportedLocationsBatch(results);
      setBulkMessage("Location validation: "+Math.min(offset+batch.length,jobs.length)+"/"+jobs.length+" core-region row(s) checked.");
      await yieldToBrowser();
    }
    setBulkMessage("Background location validation completed for "+jobs.length+" core-region row(s). Only unresolved or ambiguous results are included in Download Review Excel.");
  }

  async function retryImportedLocationSync(){
    if(locationReviewBusy) return;
    const retryable=rows.filter((row)=>["resolving","interrupted"].includes(locationReadiness(row,routeForRow(row,tariffOptions))));
    if(!retryable.length){
      setBulkMessage("No interrupted location validations remain. Use Review Excel only for genuinely ambiguous addresses.");
      return;
    }
    setLocationReviewBusy(true);
    setBulkMessage(`Retrying ${retryable.length} interrupted location validation(s)…`);
    for(const row of retryable){
      patchImportedLocation(row.pickup_id,row.parcel_sequence,{locationStatus:"PENDING",message:"Queued for location validation retry."});
    }
    try{
      await validateImportedLocations({retry:{pickupId:"retry",fileName:"",rows:retryable.map((row)=>({...row,locationStatus:"PENDING" as const})),tierAccess,saved:false}});
    }finally{
      setLocationReviewBusy(false);
    }
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
      if (!pickup) throw new Error(`Pickup ${batch.targetPickupId} was not found. Select an existing pickup; mixed merchants require a BLK container.`);
      const merchantKey=(value:unknown)=>text(value).trim().toLowerCase().replace(/[^a-z0-9\u1000-\u109f]+/g,"");
      if (merchantKey(pickup.merchant_id)!=="blk" && batch.rows.some(row=>![merchantKey(pickup.merchant_id),merchantKey(pickup.merchant_name)].includes(merchantKey(row.merchantName)))) {
        throw new Error("Mixed merchants require a Consolidated Bulk (BLK) pickup. Original merchant names must be retained.");
      }
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

    await persistDataEntryDrafts(supabase, Object.values(nextDrafts).flatMap(draft => draft.rows));

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
    void validateImportedLocations(nextDrafts);
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
    if(!selectedPickupId || waybillBusy || bulkSaving || bulkCalculating) return;

    setWaybillBusy(true);
    setWaybillMessage("");
    setWaybillMessageKind("SUCCESS");

    try{
      await persistAllRows("SAVE_ALL_BEFORE_GENERATE_WAYBILL");
      const readySequences=rows.filter(row=>!rowSaveObstacle(row)).map(row=>row.parcel_sequence);
      if(!readySequences.length) throw new Error("No completed parcels are ready yet. Pending drafts are preserved.");

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
        "be_data_entry_financial_v2_create_ready_waybill",
        {
          p_payload: {
            request_id: requestId,
            pickup_id: selectedPickupId,
            parcel_sequences: readySequences,
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

      const expected = readySequences.length;
      const printable = Number(data?.printable_count || 0);
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
        (data?.waybill_no || selectedPickupId) +
        ` · ${rows.length-readySequences.length} incomplete parcel(s) remain pending and can be generated later.`
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
        "Reason":row.locationCandidate?.reviewReason||row.message||(
          row.locationCandidate
            ? "AUTOMATIC_LOCATION_REQUIRES_REVIEW"
            : "NO_RELIABLE_COORDINATE_FOUND"
        ),
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

  async function applyLocationReviewResults(results:any[]){
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
        originalAddress:text(result.delivery_address)||row.delivery_address,
        township:text(result.township)||row.township,
        coordinateSource:text(result.coordinate_source)||"DATA_ENTRY_MANUAL_BULK_CORRECTION",reviewStatus:"ACCEPTED",
      };
      manualLocationCorrectionsRef.current.set(row.delivery_way_id,locationCandidate);
      const corrected={...row,township:text(result.township)||row.township,delivery_address:text(result.delivery_address)||row.delivery_address};
      return {...corrected,...routingPatch(routeForRow(corrected,tariffOptions),corrected),saved:false,calculation:{},calculationFailed:false,locationStatus:"SYNCED" as const,locationCandidate,message:"Location accepted from the consolidated review workbook and synchronized with Wayplan."};
    });
    await persistDataEntryDrafts(supabase, applyToRows(rows).filter(row=>resultById.has(row.delivery_way_id)));
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
      await applyLocationReviewResults(allResults);
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
    if(!file||locationReviewBusy) return;
    let appliedCount=0;
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
      const payloadRows=parseLocationReviewWorkbook(imported,pickups,knownRows,file.name);
      const allResults:any[]=[];
      for(let offset=0;offset<payloadRows.length;offset+=200){
        const batch=payloadRows.slice(offset,offset+200);
        const response=await (supabase as any).rpc("be_delivery_location_review_batch_v23",{p_payload:{
          request_id:requestId("LOCATION_REVIEW_XLSX"),source_file_name:file.name,rows:batch,
        }});
        if(response.error) throw response.error;
        if(!response.data?.ok) throw new Error(response.data?.errors?.[0]?.message||`Location review batch ${Math.floor(offset/200)+1} failed.`);
        const completed=Array.isArray(response.data.rows)?response.data.rows:[];
        allResults.push(...completed);
        appliedCount+=completed.length;
        await applyLocationReviewResults(completed);
        setLocationReloadToken((token)=>token+1);
        setBulkMessage(`Applied ${appliedCount}/${payloadRows.length} reviewed locations. Completed batches are saved on the server.`);
      }
      setLocationReloadToken((token)=>token+1);
      setBulkMessage(`Applied and audited ${allResults.length} reviewed location(s). Corrections are saved on the server. Open the matching pickup to continue. This location-only workbook does not restore unsaved prices or parcel details.`);
    }catch(error:any){
      setBulkMessage(`${appliedCount} correction(s) saved before interruption. ${error?.message||"Unable to apply the location-review workbook."} You can upload the corrected workbook again without repeating the original location review.`);
    }finally{
      setLocationReviewBusy(false);
      if(locationReviewInputRef.current) locationReviewInputRef.current.value="";
    }
  }

  useEffect(()=>{void loadStartup();},[]);
  useEffect(()=>{
    setPageIndex(0);
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
    <div data-data-entry-split-workspace-v82="true">
      {loadingRows?<div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-10 text-center"><Loader2 className="mr-3 inline animate-spin text-[#f6b84b]"/>Loading pickup proof rows…</div>:
      rows.length?
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(430px,36%)_minmax(0,64%)]">
        <aside className="min-w-0 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
          <div className="mb-3 rounded-2xl border border-[#f6b84b]/35 bg-[#0b2236] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">Process Waybill · Recycled Data Entry</div>
                <div className="mt-1 text-[11px] text-[#8db4ce]">One reusable form is kept on screen. Saving a parcel updates the registration grid immediately.</div>
              </div>
              <div className="rounded-lg border border-cyan-300/30 bg-[#061524] px-3 py-2 text-[10px] font-black text-cyan-100">
                {pageStart+1} / {rows.length}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <select
                aria-label="Select parcel to edit"
                className={inputClass}
                value={pageStart}
                onChange={(event)=>setPageIndex(Number(event.target.value)||0)}
              >
                {rows.map((row,index)=><option key={row.pickup_id+":"+row.parcel_sequence} value={index}>
                  {row.delivery_way_id||canonicalWayId(row.pickup_id,row.parcel_sequence)} · {row.saved?"REGISTERED":row.skipped?"PENDING":"DRAFT"}
                </option>)}
              </select>
              <button type="button" disabled={pageStart===0} onClick={()=>setPageIndex(Math.max(0,pageStart-1))} className="rounded-lg border border-[#31506a] bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#bfe8ff] disabled:opacity-40">PREVIOUS</button>
              <button type="button" disabled={pageStart+1>=rows.length} onClick={()=>setPageIndex(pageStart+1)} className="rounded-lg bg-[#21c7e8] px-3 py-2 text-[10px] font-black text-[#04111d] disabled:opacity-40">NEXT</button>
            </div>
          </div>

          {rows.slice(pageStart,pageStart+1).map((row)=><ParcelEditor
            key={row.pickup_id+":"+row.parcel_sequence}
            row={row}
            index={pageStart}
            updateRow={updateRow}
            calculate={calculateEditorRow}
            save={saveEditorRow}
            skip={skipEditorRow}
            busy={bulkSaving||locationReviewBusy||waybillBusy}
            reviewPhoto={reviewEditorPhoto}
            togglePhotoWaiver={toggleEditorPhotoWaiver}
            lookupPhoneHistory={lookupPhoneHistory}
            tariffOptions={tariffOptions}
            providerOptions={providerOptions}
            tierAccess={tierAccess}
            locationReloadToken={locationReloadToken}
          />)}
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236]">
          <div className="border-b border-[#1a3a5c] bg-[#102741] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f6b84b]">Registration Grid</div>
                <div className="mt-1 text-[11px] text-[#8db4ce]">
                  Registered {registeredRowCount} of {rows.length} · Remaining {Math.max(rows.length-registeredRowCount,0)}
                </div>
              </div>
              <div className="text-[9px] italic text-[#7aa7c6]">Grid auto-updates from the recycled form.</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={`${inputClass} min-w-[220px] flex-1`}
                value={gridSearch}
                onChange={(event)=>setGridSearch(event.target.value)}
                placeholder="Search Way ID, recipient, phone, township, address…"
              />
              {(["ALL","REGISTERED","PENDING"] as const).map((filter)=><button
                key={filter}
                type="button"
                onClick={()=>setGridFilter(filter)}
                className={`rounded-lg border px-3 py-2 text-[10px] font-black ${gridFilter===filter?"border-[#f6b84b] bg-[#f6b84b]/15 text-[#ffd36f]":"border-[#31506a] bg-[#071b2b] text-[#9cc2d9]"}`}
              >
                {filter}
                {filter==="REGISTERED"?` (${registeredRowCount})`:filter==="PENDING"?` (${Math.max(rows.length-registeredRowCount,0)})`:""}
              </button>)}
            </div>
          </div>

          <div className="max-h-[calc(100vh-12rem)] min-h-[650px] overflow-auto bg-[#f7f8fa]">
            <table className="w-full min-w-[1450px] border-collapse text-[10px] text-slate-800">
              <thead className="sticky top-0 z-20 bg-[#102741] text-left text-[#ffd34d]">
                <tr>
                  <th className="px-3 py-3">SR.</th>
                  <th className="px-3 py-3">WAY ID</th>
                  <th className="px-3 py-3">MERCHANT</th>
                  <th className="px-3 py-3">RECIPIENT</th>
                  <th className="px-3 py-3">PHONE</th>
                  <th className="px-3 py-3">TOWNSHIP</th>
                  <th className="px-3 py-3">ADDRESS</th>
                  <th className="px-3 py-3 text-right">ITEM PRICE</th>
                  <th className="px-3 py-3 text-right">DELI (OS)</th>
                  <th className="px-3 py-3 text-right">WEIGHT</th>
                  <th className="px-3 py-3 text-right">SURCHARGE</th>
                  <th className="px-3 py-3 text-right">FINAL COD</th>
                  <th className="px-3 py-3">STATUS</th>
                  <th className="px-3 py-3">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {registrationGridRows.map(({row,index})=>{
                  const selected=index===pageStart;
                  const surcharge=num(row.cbm_surcharge)+num(row.other_surcharge)+num(row.calculation?.weight_surcharge);
                  const finalCod=row.calculation?.cod_amount ?? (row.amount_entry_type==="EXACT_COLLECTION_AMOUNT"?row.merchant_stated_total_amount:"");
                  const status=row.saved?"REGISTERED":row.skipped?"PENDING":"DRAFT";
                  return <tr
                    key={row.pickup_id+":"+row.parcel_sequence}
                    onDoubleClick={()=>setPageIndex(index)}
                    className={`border-b border-slate-200 ${selected?"bg-sky-100":row.saved?"bg-emerald-50":"bg-white hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2 font-black text-slate-500">{row.parcel_sequence}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-black text-sky-800">{row.delivery_way_id||canonicalWayId(row.pickup_id,row.parcel_sequence)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">{row.sourceMerchantName||selectedPickup?.merchant_id||selectedPickup?.merchant_name||"—"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-semibold">{row.recipient_name||"—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{row.recipient_phone||"—"}</td>
                    <td className="max-w-[150px] truncate px-3 py-2">{row.township||"—"}</td>
                    <td className="max-w-[280px] truncate px-3 py-2" title={row.delivery_address}>{row.delivery_address||"—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{money(row.item_price)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{money(row.delivery_charges)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{row.weight_kg===""?"—":Number(row.weight_kg).toLocaleString("en-US")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{surcharge?money(surcharge):"—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-black text-slate-900">{money(finalCod)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${row.saved?"border-emerald-300 bg-emerald-100 text-emerald-800":row.skipped?"border-amber-300 bg-amber-100 text-amber-800":"border-slate-300 bg-slate-100 text-slate-700"}`}>{status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={()=>setPageIndex(index)} className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 font-black text-sky-800">
                        {selected?"EDITING":"OPEN"}
                      </button>
                    </td>
                  </tr>;
                })}
                {!registrationGridRows.length?<tr><td colSpan={14} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">No registration rows match the current search/filter.</td></tr>:null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      :<div className="rounded-2xl border border-dashed border-[#31506a] bg-[#0b2236] p-10 text-center text-sm text-[#8db4ce]">Select a pickup request or upload a batch to start Data Entry.</div>}
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
                {pickups.map(p=>{
                  const authorized=authorizedParcelCount(p);
                  const registered=positiveInt(p.registered_parcels);
                  const remaining=Math.max(authorized-registered,0);
                  return <option key={p.pickup_id} value={p.pickup_id}>{p.pickup_id} · {p.merchant_id||p.merchant_name||"Merchant"} · {registered}/{authorized} registered · {remaining} remaining</option>;
                })}
              </select>
            </div>
            <button type="button" onClick={()=>void loadStartup()} className="inline-flex items-center gap-2 rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-4 py-2.5 text-[11px] font-black text-[#8fd3ff]"><RefreshCw size={14}/>ပြန်ဖတ်ရန်</button>
            <button type="button" onClick={()=>void calculateAll()} disabled={!rows.length || bulkCalculating || bulkSaving || waybillBusy} className="inline-flex items-center gap-2 rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2.5 text-[11px] font-black text-[#68e8bd] disabled:opacity-50">{bulkCalculating?<Loader2 size={14} className="animate-spin"/>:<Calculator size={14}/>}CALCULATE ALL</button>
            <button type="button" onClick={downloadUnresolvedRows} disabled={!rows.length||bulkCalculating||bulkSaving} className="rounded-lg border border-amber-300/40 px-3 py-2 text-[11px] font-black text-amber-100 disabled:opacity-50">DOWNLOAD UNRESOLVED ROWS</button>
            <button type="button" onClick={()=>void skipPendingClarificationAll()} disabled={!pendingClarificationRows.length||bulkCalculating||bulkSaving||locationReviewBusy||waybillBusy} className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-[11px] font-black text-amber-100 disabled:opacity-40">SKIP PENDING CLARIFICATION FOR ALL ({pendingClarificationRows.length})</button>
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
              GENERATE COMPLETED WAYBILLS
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

          <div data-data-entry-daily-progress-v81="true" className="mt-4 rounded-xl border border-cyan-300/30 bg-[#071b2b] p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Daily pickup registration progress</div>
                <div className="mt-1 text-[11px] text-[#8db4ce]">All Data Entry staff can see which pickup requests are completed and which still need parcel registration.</div>
              </div>
              <Field label="Pickup date">
                <input type="date" className={inputClass} value={progressDate} onChange={(event)=>setProgressDate(event.target.value)}/>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className={serverClass}>Pickups: <b>{dailyProgressSummary.pickups}</b></div>
              <div className={serverClass}>Authorized parcels: <b>{dailyProgressSummary.authorized}</b></div>
              <div className={serverClass}>Registered: <b>{dailyProgressSummary.registered}</b></div>
              <div className={serverClass}>Still required: <b className={dailyProgressSummary.remaining?"text-amber-200":"text-emerald-200"}>{dailyProgressSummary.remaining}</b></div>
              <div className={serverClass}>Completion: <b>{dailyProgressSummary.authorized?Math.min(100,Math.round(dailyProgressSummary.registered/dailyProgressSummary.authorized*100)):0}%</b></div>
            </div>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-[#1a3a5c]">
              <table className="w-full min-w-[900px] text-[10px]">
                <thead className="sticky top-0 z-10 bg-[#12314a] text-left text-[#8fd3ff]">
                  <tr><th className="px-3 py-2">Pickup</th><th className="px-3 py-2">Merchant</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Authorized</th><th className="px-3 py-2">Registered</th><th className="px-3 py-2">Remaining</th><th className="px-3 py-2">Action</th></tr>
                </thead>
                <tbody>
                  {dailyPickupProgress.map((pickup)=><tr key={pickup.pickup_id} className={`border-t border-[#16344f] ${pickup.remaining?"bg-amber-400/5":"bg-emerald-400/5"}`}>
                    <td className="px-3 py-2 font-black text-sky-200">{pickup.pickup_id}</td>
                    <td className="px-3 py-2">{pickup.merchant_id||pickup.merchant_name||"—"}</td>
                    <td className="px-3 py-2">{pickup.requested}</td>
                    <td className="px-3 py-2">{pickup.authorized}</td>
                    <td className="px-3 py-2 font-black text-emerald-200">{pickup.registered}</td>
                    <td className={`px-3 py-2 font-black ${pickup.remaining?"text-amber-200":"text-emerald-200"}`}>{pickup.remaining}</td>
                    <td className="px-3 py-2"><button type="button" onClick={()=>setSelectedPickupId(pickup.pickup_id)} className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 font-black text-cyan-100">{pickup.remaining?"OPEN & CONTINUE":"OPEN"}</button></td>
                  </tr>)}
                  {!dailyPickupProgress.length?<tr><td colSpan={7} className="px-3 py-5 text-center text-[#8db4ce]">No pickup requests are available for this date in the current operational window.</td></tr>:null}
                </tbody>
              </table>
            </div>
          </div>

          <div data-location-review-recovery="true" className="mt-4 rounded-xl border border-amber-300/40 bg-amber-400/10 p-4">
            <div className="mb-3 text-[11px] leading-5 text-amber-100">Resume location review after a crash or sign-in: upload your corrected review workbook directly. Select the original pickup date range above. Completed corrections stay saved; you do not need to repeat the original location review.</div>
                <label className={`inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-[10px] font-black text-[#04111d] ${locationReviewBusy?"pointer-events-none opacity-40":"cursor-pointer"}`}><Upload size={14}/>RE-UPLOAD CORRECTED EXCEL<input ref={locationReviewInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event)=>void uploadConsolidatedLocationReview(event.target.files?.[0])}/></label>
          </div>

          {importedLocationSummary.total?<div data-bulk-location-readiness-v19="true" className={`mt-4 rounded-xl border p-4 ${importedLocationSummary.synced+importedLocationSummary.notRequired===importedLocationSummary.total?"border-emerald-400/40 bg-emerald-500/10":"border-amber-300/40 bg-amber-400/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Bulk location readiness</div>
                <div className="mt-1 text-[13px] font-black text-white">{importedLocationSummary.synced} synchronized · {importedLocationSummary.notRequired} map not required · {importedLocationSummary.skipped} pending drafts · {importedLocationSummary.total} total</div>
                <div className="mt-1 text-[10px] leading-5 text-[#b8d8ea]">
                  {importedLocationSummary.synced+importedLocationSummary.notRequired===importedLocationSummary.total
                    ?"All rows are location-ready. Core-region pins are synchronized; outside-core routes correctly bypass the current Google/Wayplan coordinate flow."
                    :`${importedLocationSummary.resolving} core-region rows are validating · ${importedLocationSummary.interrupted} interrupted and retryable · ${importedLocationSummary.review} genuinely need review. Google Maps are loaded only when one parcel is opened manually.`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={()=>void retryImportedLocationSync()} disabled={!(importedLocationSummary.resolving+importedLocationSummary.interrupted)||locationReviewBusy} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-4 py-2.5 text-[10px] font-black text-cyan-100 disabled:opacity-40"><RefreshCw size={14}/>RETRY LOCATION SYNC ({importedLocationSummary.resolving+importedLocationSummary.interrupted})</button>
                <button type="button" onClick={()=>void skipAllLocationReviews()} disabled={!consolidatedLocationReviewRows.some((row)=>row.locationCandidate&&validMyanmarCoordinate(row.locationCandidate.longitude,row.locationCandidate.latitude))||locationReviewBusy} className="inline-flex items-center gap-2 rounded-lg border border-rose-300/50 bg-rose-400/10 px-4 py-2.5 text-[10px] font-black text-rose-100 disabled:opacity-40">SKIP ALL REVIEWS</button>
                <button type="button" onClick={()=>void downloadConsolidatedLocationReview()} disabled={!consolidatedLocationReviewRows.length||locationReviewBusy} className="inline-flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-4 py-2.5 text-[10px] font-black text-amber-100 disabled:opacity-40"><Download size={14}/>DOWNLOAD REVIEW EXCEL ({consolidatedLocationReviewRows.length})</button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-amber-300/25 bg-[#061524] px-3 py-2 text-[10px] leading-5 text-amber-100">Download combines every current pickup row requiring location review into one workbook. Correct latitude/longitude and re-upload it here. Files above 200 rows are applied automatically in consecutive audited batches.</div>
          </div>:null}

          {rows.some(row=>row.skipped)?<div className="mt-4 rounded-xl border border-amber-300/40 p-4 text-amber-100">
            <b>{rows.filter(row=>row.skipped).length} pending drafts preserved</b>
            <p className="mt-1 text-xs">Other ready parcels can be saved. Open a parcel, select Resume, and resolve its missing details.</p>
            <div className="mt-2 flex flex-wrap gap-2">{rows.map((row,index)=>({row,index})).filter(({row})=>row.skipped).slice(0,20).map(({row,index})=><button key={row.parcel_sequence} type="button" className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs" onClick={()=>{setPageIndex(index);window.setTimeout(()=>document.getElementById(`data-entry-parcel-${row.parcel_sequence}`)?.scrollIntoView({behavior:"smooth",block:"start"}),0);}}>Open parcel {row.parcel_sequence}</button>)}</div>
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
            <button type="button" onClick={downloadUnresolvedRows} disabled={!rows.length||bulkCalculating||bulkSaving} className="rounded-lg border border-amber-300/40 px-3 py-2 text-[11px] font-black text-amber-100 disabled:opacity-50">DOWNLOAD UNRESOLVED ROWS</button>
            <button type="button" onClick={()=>void skipPendingClarificationAll()} disabled={!pendingClarificationRows.length||bulkCalculating||bulkSaving||locationReviewBusy||waybillBusy} className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-[11px] font-black text-amber-100 disabled:opacity-40">SKIP PENDING CLARIFICATION FOR ALL ({pendingClarificationRows.length})</button>
              <button type="button" onClick={()=>void saveAll()} disabled={bulkSaving || bulkCalculating} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50">{bulkSaving?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>}SAVE ALL</button>
              <button type="button" onClick={()=>setFullRegistration(false)} className="inline-flex items-center gap-2 rounded-lg border border-[#ff6b6b]/40 bg-[#3a1e28] px-4 py-2 text-[11px] font-black text-[#ff9aa2]"><X size={14}/>CLOSE</button>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1900px] p-5">{workspace}</div>
      </div>:null}

      <BritiumQuickTools />
    </div>
  );
}
