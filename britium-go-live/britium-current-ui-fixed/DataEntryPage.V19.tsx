import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import * as XLSX from 'xlsx';
import {
  Download,
  UploadCloud,
  Plus,
  Filter,
  Send,
  Layers,
  Camera,
  Image as ImageIcon,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Eye,
  X,
  RotateCcw,
  LayoutGrid,
  Table2,
} from 'lucide-react';

const DATA_ENTRY_BUILD = 'DATA_ENTRY_V19_BULK_UPLOAD_SAFE_2026-07-29';
const BULK_UPLOAD_GUARD = 'BULK_UPLOAD_V19_SAFE_MERGE';
const PICKUP_RPC_V16 = 'be_data_entry_pickup_list_web_v16';

const FALLBACK_TOWNSHIPS = [
  'Ahlone', 'Bahan', 'Botataung', 'Cocokyun', 'Dagon', 'Dagon Myothit East', 'Dagon Myothit North',
  'Dagon Myothit Seikkan', 'Dagon Myothit South', 'Dala', 'Dawbon', 'East Dagon', 'Hlaing',
  'Hlaing Thar Yar', 'Hlaingthaya', 'Insein', 'Kamayut', 'Kyauktada', 'Kyimyindaing',
  'Lanmadaw', 'Latha', 'Mayangon', 'Mingaladon', 'Mingala Taung Nyunt', 'North Dagon',
  'North Okkalapa', 'Pabedan', 'Pazundaung', 'Sanchaung', 'Seikkan', 'Shwe Pyi Thar',
  'Shwepyitha', 'South Dagon', 'South Okkalapa', 'Tamwe', 'Thaketa', 'Thingangyun',
  'Yankin', 'Mandalay', 'Naypyidaw',
];

const PARCEL_TEMPLATE_HEADERS = [
  'စဉ်',
  'Status',
  'Way ID',
  'OS',
  'လက်ခံမည့်သူအမည်',
  'ဖုန်း',
  'မြို့နယ်',
  'လိပ်စာ',
  'ပစ္စည်းတန်ဖိုး',
  'ပို့ဆောင်ခ',
  'ကီလို',
  'ကီလိုအပိုကြေး',
  'ငွေကောက်ရန်',
  'Destination',
  'Remarks',
] as const;

const FALLBACK_STATUSES = ['registered', 'ready_for_waybill', 'waybill_created', 'cancelled'];
const FALLBACK_ENVIRONMENTS = ['production', 'staging', 'development', 'test'];

const SYSTEM_HEADER = 'bg-[#f6b84b] text-[#061524]';
const DROPDOWN_HEADER = 'bg-emerald-300 text-[#061524]';
const MANUAL_HEADER = 'bg-[#8fd3ff] text-[#061524]';
const READONLY_INPUT = 'w-full bg-[#0b2236] text-[#8aa9bf] border border-[#1a3a5c] p-2 rounded outline-none cursor-not-allowed';
const TEXT_INPUT = 'w-full bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b]';
const DROPDOWN_INPUT = 'w-full bg-[#061524] text-emerald-300 border border-[#1a3a5c] p-2 rounded outline-none focus:border-emerald-300';

const normalizeTownship = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_()]+/g, '');

const normalizeHeader = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_().:/]+/g, '');

const toNumber = (value: unknown, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
};

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const toIsoTimestamp = (value?: unknown, fallback = '') => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const isUuid = (value?: string | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

type TownshipOption = {
  township: string;
  township_mm?: string | null;
  city?: string | null;
  region_state?: string | null;
  zone?: string | null;
  branch_code?: string | null;
  is_out_of_reach?: boolean | null;
  service_status?: string | null;
  service_alert_message?: string | null;
  label?: string | null;
  search_text?: string | null;
};

type SelectOption = {
  value: string;
  label: string;
  customer_tier?: string | null;
};

type PickupQueueRow = {
  pickup_id: string;
  pickup_way_id?: string | null;
  merchant_code?: string | null;
  merchant_name?: string | null;
  pickup_date?: string | null;
  pickup_address?: string | null;
  township?: string | null;
  city?: string | null;
  expected_parcels?: number | null;
  verified_parcels?: number | null;
  photo_parcels?: number | null;
  total_weight_kg?: number | null;
  pickup_status?: string | null;
  workflow_stage?: string | null;
  created_at?: string | null;
  source_name?: string | null;
};

type ParcelSourceRow = {
  id?: string | number | null;
  parcel_id?: string | null;
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id?: string | null;
  way_id?: string | null;
  parcel_weight_kg?: number | null;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  verified_at?: string | null;
  photo_taken_at?: string | null;
  merchant_code?: string | null;
  merchant_id?: string | null;
  merchant_name?: string | null;
  customer_id?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  contact_no_1?: string | null;
  township?: string | null;
  delivery_address?: string | null;
  recipient_address?: string | null;
  item_price?: number | null;
  delivery_charges?: number | null;
  delivery_fee?: number | null;
  cod_amount?: number | null;
  weight_kg?: number | null;
  parcel_status?: string | null;
  created_at?: string | null;
  parcel_created_at?: string | null;
  updated_at?: string | null;
  parcel_updated_at?: string | null;
  environment?: string | null;
  customer_tier?: string | null;
  destination?: string | null;
  os?: string | null;
  extra_weight_charge?: number | null;
  collect_amount?: number | null;
  remarks?: string | null;
  remark?: string | null;
};

type ParcelRow = {
  // Exact parcel.xlsx fields.
  parcel_sequence: number;
  status: string;
  way_id: string;
  os: string;
  recipient_name: string;
  recipient_phone: string;
  township: string;
  delivery_address: string;
  item_price: number;
  delivery_charges: number;
  weight_kg: number;
  extra_weight_charge: number;
  collect_amount: number;
  destination: string;
  remarks: string;

  // Internal compatibility fields retained for existing proof, tariff and waybill flows.
  id: string;
  customer_id: string;
  merchant_id: string;
  cod_amount: number;
  created_at: string;
  updated_at: string;
  environment: string;
  customer_tier?: string;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  saved?: boolean;
};

const proofStatus = (row: ParcelSourceRow) => {
  if (row.proof_photo_path && Number(row.parcel_weight_kg || 0) > 0) return 'RIDER_VERIFIED';
  if (row.proof_photo_path) return 'PHOTO_ONLY';
  if (Number(row.parcel_weight_kg || 0) > 0) return 'WEIGHT_ONLY';
  return 'MISSING_PROOF';
};

const proofKey = (row: ParcelSourceRow) =>
  String(row.parcel_id || row.way_id || row.delivery_way_id || `${row.pickup_id}-${row.parcel_sequence}`);

const isParcelRow = (value: unknown): value is ParcelRow =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

const firstPhotoValue = (row: ParcelSourceRow, includeGeneratedUrl = true) => {
  const raw = row as ParcelSourceRow & Record<string, unknown>;
  const values = [
    raw.display_photo,
    raw.proof_photo_url,
    raw.proof_photo_data,
    raw.image_url,
    raw.proof_photo_path,
    includeGeneratedUrl ? raw.photo_url : null,
  ];
  return String(values.find((value) => typeof value === 'string' && value.trim()) || '').trim();
};

const PICKUP_SOURCE_PRIORITY: Record<string, number> = {
  be_v_data_entry_pickup_verification_queue: 0,
  be_v_data_entry_pickup_queue: 1,
  be_v_supervisor_pickup_queue: 2,
  be_v_rider_pickup_queue: 3,
  be_portal_pickup_requests: 4,
  be_pickup_requests: 5,
  be_v_data_entry_rider_proofs: 20,
  be_v_data_entry_parcel_template: 21,
  be_v_data_entry_parcel_proofs: 22,
  be_v_data_entry_parcel_rows: 23,
  be_pickup_parcel_verifications: 24,
  be_data_entry_parcel_details: 25,
  be_data_entry_registration_lines: 26,
  be_data_entry_registration_lines_v5: 27,
};

function pickupRowsFromResponse(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;

  if (typeof input === 'string') {
    try {
      return pickupRowsFromResponse(JSON.parse(input));
    } catch {
      return [];
    }
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const key of ['rows', 'data', 'result', 'items']) {
      const nested = pickupRowsFromResponse(record[key]);
      if (nested.length) return nested;
    }

    const values = Object.values(record);
    if (values.length && values.every((value) => value && typeof value === 'object')) {
      return values;
    }
  }

  return [];
}

function normalizePickupQueue(input: unknown): PickupQueueRow[] {
  const sourceRows = pickupRowsFromResponse(input);
  if (!sourceRows.length) return [];

  const byPickupId = new Map<string, PickupQueueRow>();

  for (const item of sourceRows) {
    const raw = (item || {}) as Record<string, unknown>;
    const pickupId = String(raw.pickup_id || raw.pickup_way_id || '').trim();
    if (!pickupId) continue;

    const incoming: PickupQueueRow = {
      pickup_id: pickupId,
      pickup_way_id: String(raw.pickup_way_id || '').trim() || null,
      merchant_code: String(raw.merchant_code || '').trim() || null,
      merchant_name: String(raw.merchant_name || '').trim() || null,
      pickup_date: String(raw.pickup_date || '').trim() || null,
      pickup_address: String(raw.pickup_address || '').trim() || null,
      township: String(raw.township || '').trim() || null,
      city: String(raw.city || '').trim() || null,
      expected_parcels: toNumber(raw.expected_parcels, 0),
      verified_parcels: toNumber(raw.verified_parcels, 0),
      photo_parcels: toNumber(raw.photo_parcels, 0),
      total_weight_kg: toNumber(raw.total_weight_kg, 0),
      pickup_status: String(raw.pickup_status || '').trim() || null,
      workflow_stage: String(raw.workflow_stage || '').trim() || null,
      created_at: String(raw.created_at || '').trim() || null,
      source_name: String(raw.source_name || '').trim() || null,
    };

    const existing = byPickupId.get(pickupId);
    if (!existing) {
      byPickupId.set(pickupId, incoming);
      continue;
    }

    const existingPriority = PICKUP_SOURCE_PRIORITY[String(existing.source_name || '')] ?? 999;
    const incomingPriority = PICKUP_SOURCE_PRIORITY[String(incoming.source_name || '')] ?? 999;
    const preferred = incomingPriority < existingPriority ? incoming : existing;
    const fallback = preferred === incoming ? existing : incoming;

    // Keep the preferred queue source while filling any missing descriptive fields
    // from duplicate rows returned by the compatibility RPC.
    byPickupId.set(pickupId, {
      ...fallback,
      ...preferred,
      pickup_way_id: preferred.pickup_way_id || fallback.pickup_way_id || null,
      merchant_code: preferred.merchant_code || fallback.merchant_code || null,
      merchant_name: preferred.merchant_name || fallback.merchant_name || null,
      pickup_date: preferred.pickup_date || fallback.pickup_date || null,
      pickup_address: preferred.pickup_address || fallback.pickup_address || null,
      township: preferred.township || fallback.township || null,
      city: preferred.city || fallback.city || null,
      pickup_status: preferred.pickup_status || fallback.pickup_status || null,
      workflow_stage: preferred.workflow_stage || fallback.workflow_stage || null,
      created_at: preferred.created_at || fallback.created_at || null,
      expected_parcels: toNumber(preferred.expected_parcels, 0) > 0
        ? toNumber(preferred.expected_parcels, 0)
        : toNumber(fallback.expected_parcels, 0),
      verified_parcels: Math.max(
        toNumber(preferred.verified_parcels, 0),
        toNumber(fallback.verified_parcels, 0),
      ),
      photo_parcels: Math.max(
        toNumber(preferred.photo_parcels, 0),
        toNumber(fallback.photo_parcels, 0),
      ),
      total_weight_kg: Math.max(
        toNumber(preferred.total_weight_kg, 0),
        toNumber(fallback.total_weight_kg, 0),
      ),
    });
  }

  return Array.from(byPickupId.values()).sort((a, b) => {
    const aTime = Date.parse(String(a.created_at || a.pickup_date || '')) || 0;
    const bTime = Date.parse(String(b.created_at || b.pickup_date || '')) || 0;
    return bTime - aTime || a.pickup_id.localeCompare(b.pickup_id);
  });
}

function normalizeOptions(input: unknown): SelectOption[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();

  return input.flatMap((item): SelectOption[] => {
    const value = typeof item === 'string'
      ? item
      : String((item as any)?.value ?? (item as any)?.id ?? (item as any)?.code ?? '').trim();
    if (!value || seen.has(value)) return [];
    seen.add(value);

    const label = typeof item === 'string'
      ? item
      : String((item as any)?.label ?? (item as any)?.name ?? value).trim();

    return [{
      value,
      label,
      customer_tier: typeof item === 'string' ? null : ((item as any)?.customer_tier ?? (item as any)?.tier ?? null),
    }];
  });
}

export default function DataEntryPage() {
  const { t } = useLanguage();
  const sb = supabase as any;

  const [loading, setLoading] = useState(false);
  const [pickupQueue, setPickupQueue] = useState<PickupQueueRow[]>([]);
  const [pickupLoadSource, setPickupLoadSource] = useState('Waiting for pickup source');
  const [authDiagnostic, setAuthDiagnostic] = useState('Checking session...');
  const [supabaseDiagnostic] = useState(() => {
    try {
      return new URL(String((import.meta as any).env?.VITE_SUPABASE_URL || '')).host || 'VITE_SUPABASE_URL missing';
    } catch {
      return 'VITE_SUPABASE_URL invalid';
    }
  });
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const selectedPickupIdRef = useRef('');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const tableMinWidth = 2580;

  const [parcelProofs, setParcelProofs] = useState<ParcelSourceRow[]>([]);
  const [rows, setRows] = useState<ParcelRow[]>([]);
  const [message, setMessage] = useState('');
  const [reviewedPhotoKeys, setReviewedPhotoKeys] = useState<Set<string>>(new Set<string>());
  const [failedPhotoKeys, setFailedPhotoKeys] = useState<Set<string>>(new Set<string>());
  const [largePhoto, setLargePhoto] = useState<{ proof: ParcelSourceRow; url: string } | null>(null);
  const [registerView, setRegisterView] = useState<'form' | 'sheet'>('form');
  const [townshipOptions, setTownshipOptions] = useState<TownshipOption[]>(
    FALLBACK_TOWNSHIPS.map((township) => ({ township, city: 'Yangon', region_state: 'Yangon Region' })),
  );
  const [customerOptions, setCustomerOptions] = useState<SelectOption[]>([]);
  const [merchantOptions, setMerchantOptions] = useState<SelectOption[]>([]);
  const [statusOptions, setStatusOptions] = useState(FALLBACK_STATUSES);
  const [environmentOptions, setEnvironmentOptions] = useState(FALLBACK_ENVIRONMENTS);

  function selectPickup(pickupId: string) {
    selectedPickupIdRef.current = pickupId;
    setSelectedPickupId(pickupId);
  }

  const selectedPickup = useMemo(
    () => pickupQueue.find((p) => p.pickup_id === selectedPickupId) || null,
    [pickupQueue, selectedPickupId],
  );

  const photoProofKeys = useMemo(
    () => parcelProofs.filter((proof) => Boolean(firstPhotoValue(proof))).map(proofKey),
    [parcelProofs],
  );
  const reviewedPhotoCount = useMemo(
    () => photoProofKeys.filter((key) => reviewedPhotoKeys.has(key)).length,
    [photoProofKeys, reviewedPhotoKeys],
  );
  const allPhotosReviewed = photoProofKeys.length > 0 && reviewedPhotoCount === photoProofKeys.length;

  const townshipDisplayOptions = useMemo(() => {
    const seen = new Set<string>();
    return townshipOptions.filter((option) => {
      const key = normalizeTownship(option.township);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [townshipOptions]);

  function findTownshipOption(input?: string | null) {
    const key = normalizeTownship(input);
    if (!key) return null;

    return townshipDisplayOptions.find((option) => {
      const townshipKey = normalizeTownship(option.township);
      const mmKey = normalizeTownship(option.township_mm);
      const labelKey = normalizeTownship(option.label);
      const searchKey = normalizeTownship(option.search_text);
      return townshipKey === key || mmKey === key || labelKey === key || searchKey.includes(key);
    }) || null;
  }

  function findCustomerTier(customerId: string) {
    const match = customerOptions.find((option) => option.value === customerId);
    return String(match?.customer_tier || 'Standard');
  }

  function calculateLocalAmounts(row: ParcelRow, townshipOption?: TownshipOption | null): ParcelRow {
    const option = townshipOption ?? findTownshipOption(row.township);
    const township = option?.township || row.township || '';
    const destination = row.destination || option?.city || selectedPickup?.city || 'Yangon';
    const branchCode = String(option?.branch_code || '').toUpperCase();
    const regionState = String(option?.region_state || '').toLowerCase();
    const customerKey = row.customer_id || row.os || '';
    const customerTier = row.customer_tier || findCustomerTier(customerKey);
    const normalizedTier = customerTier.trim().toLowerCase();
    const itemPrice = Math.max(0, toNumber(row.item_price, 0));
    const weightKg = Math.max(0, toNumber(row.weight_kg, 0));

    // Existing background tariff behavior retained:
    // Yangon = 4,000 MMK; Mandalay/Naypyitaw = 6,000 MMK.
    // Standard includes 3 kg; Royal includes 5 kg; each rounded-up extra kg = 500 MMK.
    const isUpperMyanmar =
      branchCode === 'MDY' ||
      branchCode === 'NPT' ||
      /mandalay/.test(regionState) ||
      /naypyitaw|nay pyi taw|mandalay/.test(destination.toLowerCase());

    const baseFee = isUpperMyanmar ? 6000 : 4000;
    const includedKg = normalizedTier === 'royal' ? 5 : 3;
    const extraKg = Math.max(0, Math.ceil(weightKg) - includedKg);
    const extraWeightCharge = extraKg * 500;
    const deliveryCharges = baseFee + extraWeightCharge;
    const collectAmount = itemPrice + deliveryCharges;

    return {
      ...row,
      township,
      destination,
      os: row.os || row.merchant_id || '',
      merchant_id: row.os || row.merchant_id || '',
      customer_tier: customerTier,
      item_price: roundMoney(itemPrice),
      weight_kg: roundMoney(weightKg),
      extra_weight_charge: roundMoney(extraWeightCharge),
      delivery_charges: roundMoney(deliveryCharges),
      collect_amount: roundMoney(collectAmount),
      // Kept internally for legacy waybill compatibility.
      cod_amount: roundMoney(itemPrice),
    };
  }

  async function calculateAmounts(row: ParcelRow): Promise<ParcelRow> {
    const option = findTownshipOption(row.township);
    const local = calculateLocalAmounts(row, option);

    try {
      const sheetResponse = await sb.rpc('be_calculate_parcel_sheet_amounts', {
        p_township: local.township,
        p_destination: local.destination || null,
        p_os: local.os || null,
        p_weight_kg: Number(local.weight_kg || 0),
        p_item_price: Number(local.item_price || 0),
      });

      if (!sheetResponse.error && sheetResponse.data) {
        return {
          ...local,
          township: sheetResponse.data.township || local.township,
          destination: sheetResponse.data.destination || local.destination,
          customer_tier: sheetResponse.data.customer_tier || local.customer_tier,
          delivery_charges: roundMoney(sheetResponse.data.delivery_charges ?? local.delivery_charges),
          extra_weight_charge: roundMoney(sheetResponse.data.extra_weight_charge ?? local.extra_weight_charge),
          collect_amount: roundMoney(sheetResponse.data.collect_amount ?? local.collect_amount),
          cod_amount: roundMoney(sheetResponse.data.cod_amount ?? local.cod_amount),
        };
      }

      const parcelResponse = await sb.rpc('be_calculate_parcel_amounts', {
        p_township: local.township,
        p_customer_id: local.customer_id || local.os || null,
        p_weight_kg: Number(local.weight_kg || 0),
        p_item_price: Number(local.item_price || 0),
        p_environment: local.environment || 'production',
      });

      if (!parcelResponse.error && parcelResponse.data) {
        const deliveryCharges = roundMoney(parcelResponse.data.delivery_charges ?? local.delivery_charges);
        const baseFee = /mandalay|naypyitaw|nay pyi taw/i.test(parcelResponse.data.destination || local.destination || '') ? 6000 : 4000;
        return {
          ...local,
          township: parcelResponse.data.township || local.township,
          destination: parcelResponse.data.destination || parcelResponse.data.city || local.destination,
          customer_tier: parcelResponse.data.customer_tier || local.customer_tier,
          delivery_charges: deliveryCharges,
          extra_weight_charge: roundMoney(Math.max(0, deliveryCharges - baseFee)),
          collect_amount: roundMoney(Number(local.item_price || 0) + deliveryCharges),
          cod_amount: roundMoney(parcelResponse.data.cod_amount ?? local.cod_amount),
        };
      }
    } catch (error) {
      console.warn('Parcel tariff RPC unavailable; using the retained local tariff calculation.', error);
    }

    return local;
  }

  function syncTopScroll(source: 'top' | 'table') {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;

    if (source === 'top' && table.scrollLeft !== top.scrollLeft) table.scrollLeft = top.scrollLeft;
    if (source === 'table' && top.scrollLeft !== table.scrollLeft) top.scrollLeft = table.scrollLeft;
  }

  async function loadTownshipOptions() {
    try {
      const { data, error } = await sb
        .from('be_v_township_search_options')
        .select('*')
        .order('township', { ascending: true });

      if (error) throw error;
      if (data?.length) {
        setTownshipOptions(data as TownshipOption[]);
        return;
      }
    } catch (error) {
      console.warn('be_v_township_search_options unavailable; using fallback township data.', error);
    }

    try {
      const { data } = await sb
        .from('v_address_township_options')
        .select('*')
        .order('township', { ascending: true });
      if (data?.length) setTownshipOptions(data as TownshipOption[]);
    } catch (error) {
      console.warn('v_address_township_options unavailable; using fallback township data.', error);
    }
  }

  async function loadParcelDropdowns() {
    try {
      const { data, error } = await sb.rpc('be_data_entry_parcel_dropdown_snapshot');
      if (error) throw error;

      const customers = normalizeOptions(data?.customers);
      const merchants = normalizeOptions(data?.merchants);
      const statuses = normalizeOptions(data?.statuses).map((item) => item.value);
      const environments = normalizeOptions(data?.environments).map((item) => item.value);

      if (customers.length) setCustomerOptions(customers);
      if (merchants.length) setMerchantOptions(merchants);
      if (statuses.length) setStatusOptions(statuses);
      if (environments.length) setEnvironmentOptions(environments);
    } catch (error) {
      console.warn('Parcel dropdown snapshot unavailable; using built-in options.', error);
    }
  }

  function normalizeStorageObjectPath(rawValue: string) {
    let raw = String(rawValue || '').trim();
    if (!raw) return '';

    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        const marker = '/storage/v1/object/';
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex >= 0) {
          const objectPart = url.pathname.slice(markerIndex + marker.length);
          const parts = objectPart.split('/').filter(Boolean);
          if (['sign', 'public', 'authenticated'].includes(parts[0] || '')) parts.shift();
          if (parts[0] === 'pickup-parcel-proofs') parts.shift();
          raw = decodeURIComponent(parts.join('/'));
        } else {
          return raw;
        }
      }
    } catch {
      // Keep the original value and let the storage client try it.
    }

    return raw
      .replace(/^\/+/, '')
      .replace(/^pickup-parcel-proofs\//, '')
      .split('?')[0]
      .split('#')[0];
  }

  async function resolveProofPhotoUrl(proof: ParcelSourceRow, forceRefresh = false) {
    const raw = firstPhotoValue(proof, !forceRefresh);
    if (!raw) return null;
    if (/^data:image\//i.test(raw)) return raw;

    const normalized = normalizeStorageObjectPath(raw);
    const directHttpUrl = /^https?:\/\//i.test(raw) && normalized === raw ? raw : '';

    if (normalized && !/^https?:\/\//i.test(normalized)) {
      try {
        const { data, error } = await supabase.storage
          .from('pickup-parcel-proofs')
          .createSignedUrl(normalized, 60 * 60 * 4);
        if (!error && data?.signedUrl) return data.signedUrl;
      } catch (error) {
        console.warn('Signed Rider proof URL failed.', error);
      }

      try {
        const { data } = supabase.storage
          .from('pickup-parcel-proofs')
          .getPublicUrl(normalized);
        if (data?.publicUrl) return data.publicUrl;
      } catch (error) {
        console.warn('Public Rider proof URL failed.', error);
      }
    }

    return directHttpUrl || (/^https?:\/\//i.test(raw) ? raw : null);
  }

  function setPhotoReviewed(key: string, checked: boolean) {
    setReviewedPhotoKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function openProofPhoto(proof: ParcelSourceRow) {
    const key = proofKey(proof);
    const refreshedUrl = await resolveProofPhotoUrl(proof, failedPhotoKeys.has(key));
    if (!refreshedUrl) {
      setMessage(`No usable Rider photo URL was found for ${proof.way_id || proof.delivery_way_id || key}.`);
      return;
    }

    setParcelProofs((current) => current.map((item) => proofKey(item) === key ? { ...item, photo_url: refreshedUrl } : item));
    setRows((current) => current.map((item) => String(item.way_id || `${selectedPickupId}-${item.parcel_sequence}`) === key || item.way_id === proof.way_id || item.way_id === proof.delivery_way_id ? { ...item, photo_url: refreshedUrl } : item));
    setFailedPhotoKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setPhotoReviewed(key, true);
    setLargePhoto({ proof: { ...proof, photo_url: refreshedUrl }, url: refreshedUrl });
  }

  async function retryProofPhoto(proof: ParcelSourceRow) {
    const key = proofKey(proof);
    const refreshedUrl = await resolveProofPhotoUrl({ ...proof, photo_url: null }, true);
    if (!refreshedUrl) {
      setMessage(`The Rider photo path for ${proof.way_id || proof.delivery_way_id || key} could not be resolved.`);
      return;
    }

    setParcelProofs((current) => current.map((item) => proofKey(item) === key ? { ...item, photo_url: refreshedUrl } : item));
    setRows((current) => current.map((item) => item.way_id === proof.way_id || item.way_id === proof.delivery_way_id ? { ...item, photo_url: refreshedUrl } : item));
    setFailedPhotoKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setMessage(`Refreshed Rider photo link for ${proof.way_id || proof.delivery_way_id || key}.`);
  }

  async function loadPickupQueue() {
    setLoading(true);
    setMessage('');
    setPickupLoadSource('Loading pickup queue...');

    const applyQueue = (queue: PickupQueueRow[], sourceLabel: string) => {
      setPickupQueue(queue);
      setPickupLoadSource(`${sourceLabel} • ${queue.length} pickup${queue.length === 1 ? '' : 's'}`);

      const currentPickupId = selectedPickupIdRef.current;
      const currentStillExists = currentPickupId
        ? queue.some((item) => item.pickup_id === currentPickupId)
        : false;

      if (currentStillExists) return;
      if (!currentPickupId && queue.length > 0) return selectPickup(queue[0].pickup_id);
      if (currentPickupId && !currentStillExists) selectPickup(queue[0]?.pickup_id || '');
    };

    const errorText = (error: any) => {
      if (!error) return '';
      return [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | ');
    };

    try {
      // Read session only for diagnostics. Never block the pickup request and never
      // dereference a nested user identifier because some app-auth implementations provide a
      // partial Supabase session while the page is mounting.
      try {
        const sessionResponse = await supabase.auth.getSession();
        const hasUser = Boolean(sessionResponse?.data?.session?.user);
        setAuthDiagnostic(hasUser ? 'authenticated' : 'anonymous/no Supabase session');
      } catch (sessionError) {
        console.warn('Supabase session diagnostic failed; continuing with pickup RPC.', sessionError);
        setAuthDiagnostic('session check unavailable');
      }

      // Use the installed V16 RPC verified to return 52 authenticated pickup rows.
      let rpcResponse = await sb.rpc(PICKUP_RPC_V16, { p_limit: 200 });
      let rpcLabel = PICKUP_RPC_V16;

      if (rpcResponse.error && /PGRST202|function.*not found|schema cache|parameter/i.test(errorText(rpcResponse.error))) {
        rpcResponse = await sb.rpc('be_data_entry_pickup_list_any', { p_limit: 200 });
        rpcLabel = 'be_data_entry_pickup_list_any';
      }
      if (rpcResponse.error && /PGRST202|function.*not found|schema cache|parameter/i.test(errorText(rpcResponse.error))) {
        rpcResponse = await sb.rpc('be_data_entry_pickup_list_any');
        rpcLabel = 'be_data_entry_pickup_list_any(default)';
      }

      if (!rpcResponse.error) {
        const rpcQueue = normalizePickupQueue(rpcResponse.data);
        if (rpcQueue.length > 0) {
          applyQueue(rpcQueue, rpcLabel);
          return;
        }
        console.warn(`${rpcLabel} returned zero pickup rows.`, rpcResponse.data);
      } else {
        console.warn('Pickup-list RPC failed; trying direct-view fallbacks.', rpcResponse.error);
      }

      // Compatibility fallbacks for environments where the RPC is absent or stale.
      const fallbackSources = [
        'be_v_data_entry_pickup_verification_queue',
        'be_v_data_entry_pickup_queue',
        'be_v_supervisor_pickup_queue',
        'be_v_rider_pickup_queue',
        'be_portal_pickup_requests',
      ];

      const errors: string[] = [];
      if (rpcResponse.error) errors.push(`RPC ${rpcLabel}: ${errorText(rpcResponse.error)}`);
      else errors.push(`RPC ${rpcLabel}: returned 0 rows`);

      for (const source of fallbackSources) {
        const response = await sb.from(source).select('*').limit(500);
        if (response.error) {
          errors.push(`${source}: ${errorText(response.error)}`);
          continue;
        }

        const queue = normalizePickupQueue(
          pickupRowsFromResponse(response.data).map((row) => ({
            ...(row as Record<string, unknown>),
            source_name: source,
          })),
        );
        if (queue.length > 0) {
          applyQueue(queue, source);
          return;
        }
      }

      applyQueue([], 'No accessible pickup source');
      throw new Error(errors.join(' || ') || 'Pickup sources returned no rows. Confirm the frontend Supabase URL matches the project where the RPC was tested.');
    } catch (error: any) {
      console.error('Data Entry pickup queue load failed:', error);
      setPickupLoadSource('Pickup load failed');
      setMessage(error?.message || 'Failed to load the Data Entry pickup queue.');
    } finally {
      setLoading(false);
    }
  }

  async function loadParcelProofs(pickupId: string) {
    if (!pickupId) {
      setParcelProofs([]);
      setRows([]);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await sb.rpc('be_seed_pickup_parcel_verifications', { p_pickup_id: pickupId });

      let response = await sb
        .from('be_v_data_entry_parcel_rows')
        .select('*')
        .eq('pickup_id', pickupId)
        .order('parcel_sequence', { ascending: true });

      if (response.error || !response.data?.length) {
        response = await sb
          .from('be_v_data_entry_parcel_template')
          .select('*')
          .eq('pickup_id', pickupId)
          .order('parcel_sequence', { ascending: true });
      }

      if (response.error || !response.data?.length) {
        response = await sb
          .from('be_v_data_entry_parcel_proofs')
          .select('*')
          .eq('pickup_id', pickupId)
          .order('parcel_sequence', { ascending: true });
      }

      if (response.error) throw response.error;

      const pickup = pickupQueue.find((item) => item.pickup_id === pickupId) || selectedPickup;
      const proofs = await Promise.all(
        ((response.data || []) as ParcelSourceRow[]).map(async (proof) => ({
          ...proof,
          photo_url: await resolveProofPhotoUrl(proof),
        })),
      );

      setReviewedPhotoKeys(new Set());
      setFailedPhotoKeys(new Set());
      setLargePhoto(null);
      setParcelProofs(proofs);
      setRows(proofs.map((proof, index) => calculateLocalAmounts({
        id: String(proof.parcel_id || ''),
        parcel_sequence: proof.parcel_sequence || index + 1,
        status: String(proof.parcel_status || 'registered'),
        way_id: String(proof.way_id || proof.delivery_way_id || `PARCEL-${index + 1}`).trim(),
        os: String(proof.os || proof.merchant_name || proof.merchant_code || proof.merchant_id || pickup?.merchant_name || pickup?.merchant_code || '').trim(),
        recipient_name: String(proof.recipient_name || ''),
        recipient_phone: String(proof.recipient_phone || proof.contact_no_1 || ''),
        township: String(proof.township || pickup?.township || 'North Dagon'),
        delivery_address: String(proof.delivery_address || proof.recipient_address || ''),
        item_price: Number(proof.item_price || 0),
        delivery_charges: Number(proof.delivery_charges || proof.delivery_fee || 0),
        weight_kg: Number(proof.parcel_weight_kg || proof.weight_kg || 0),
        extra_weight_charge: Number(proof.extra_weight_charge || 0),
        collect_amount: Number(proof.collect_amount || 0),
        destination: String(proof.destination || pickup?.city || 'Yangon'),
        remarks: String(proof.remarks || proof.remark || ''),
        customer_id: String(proof.customer_id || ''),
        merchant_id: String(proof.merchant_id || proof.merchant_code || pickup?.merchant_code || ''),
        cod_amount: Number(proof.cod_amount || proof.item_price || 0),
        created_at: toIsoTimestamp(proof.parcel_created_at || proof.created_at, ''),
        updated_at: toIsoTimestamp(proof.parcel_updated_at || proof.updated_at, ''),
        environment: String(proof.environment || 'production'),
        customer_tier: String(proof.customer_tier || 'Standard'),
        proof_photo_path: proof.proof_photo_path,
        photo_url: proof.photo_url,
        saved: Boolean(proof.parcel_id),
      })));
      window.setTimeout(() => {
        if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
        if (topScrollRef.current) topScrollRef.current.scrollLeft = 0;
      }, 0);
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || 'Failed to load rider parcel photos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    console.info(`[${DATA_ENTRY_BUILD}] Data Entry component mounted`, { supabase: supabaseDiagnostic });

    let disposed = false;
    const safeRun = (task: () => void | Promise<void>, label: string) => {
      try {
        const result = task();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((error) => {
            if (!disposed) console.error(`${label} failed:`, error);
          });
        }
      } catch (error) {
        if (!disposed) console.error(`${label} failed:`, error);
      }
    };

    safeRun(loadTownshipOptions, 'Township option load');
    safeRun(loadParcelDropdowns, 'Parcel dropdown load');
    safeRun(loadPickupQueue, 'Pickup queue load');

    // Avoid authentication and realtime subscription setup during initial render. In this app's
    // current Supabase integration those subscriptions can receive partial objects
    // and crash the whole route with "reading id of undefined". Timed refreshes
    // preserve automatic pickup updates without risking a page-level exception.
    const retryOne = window.setTimeout(() => {
      if (!disposed) safeRun(loadPickupQueue, 'Pickup queue retry');
    }, 1500);
    const retryTwo = window.setTimeout(() => {
      if (!disposed) safeRun(loadPickupQueue, 'Pickup queue second retry');
    }, 5000);
    const refreshTimer = window.setInterval(() => {
      if (!disposed) safeRun(loadPickupQueue, 'Pickup queue scheduled refresh');
    }, 60000);

    return () => {
      disposed = true;
      window.clearTimeout(retryOne);
      window.clearTimeout(retryTwo);
      window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    selectedPickupIdRef.current = selectedPickupId;
    if (selectedPickupId) loadParcelProofs(selectedPickupId);
    else {
      setParcelProofs([]);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPickupId]);

  const handleGenerate = () => {
    if (!selectedPickupId) return setMessage('Please select a pickup first.');
    loadParcelProofs(selectedPickupId);
  };

  const handleRegisterNow = async () => {
    if (!selectedPickupId) return setMessage('Please select a pickup first.');
    if (rows.length === 0) await loadParcelProofs(selectedPickupId);
    setMessage('REGISTER NOW enabled with the synchronized 15-column parcel.xlsx schema. Charges and collection amount remain system-calculated.');
  };

  const parcelExportRow = (row: ParcelRow) => ({
    'စဉ်': Number(row.parcel_sequence || 0),
    Status: row.status || 'registered',
    'Way ID': row.way_id || '',
    OS: row.os || row.merchant_id || '',
    'လက်ခံမည့်သူအမည်': row.recipient_name || '',
    'ဖုန်း': row.recipient_phone || '',
    'မြို့နယ်': row.township || '',
    'လိပ်စာ': row.delivery_address || '',
    'ပစ္စည်းတန်ဖိုး': Number(row.item_price || 0),
    'ပို့ဆောင်ခ': Number(row.delivery_charges || 0),
    'ကီလို': Number(row.weight_kg || 0),
    'ကီလိုအပိုကြေး': Number(row.extra_weight_charge || 0),
    'ငွေကောက်ရန်': Number(row.collect_amount || 0),
    Destination: row.destination || '',
    Remarks: row.remarks || '',
  });

  const downloadParcelTemplate = () => {
    const targetCount = Math.max(rows.length, selectedPickup?.expected_parcels || 0, 1);
    const exportRows = rows.length
      ? rows.map(parcelExportRow)
      : Array.from({ length: targetCount }, (_, index) => parcelExportRow(calculateLocalAmounts({
          id: '',
          parcel_sequence: index + 1,
          status: 'registered',
          way_id: '',
          os: selectedPickup?.merchant_name || selectedPickup?.merchant_code || '',
          recipient_name: '',
          recipient_phone: '',
          township: selectedPickup?.township || '',
          delivery_address: '',
          item_price: 0,
          delivery_charges: 0,
          weight_kg: 0,
          extra_weight_charge: 0,
          collect_amount: 0,
          destination: selectedPickup?.city || 'Yangon',
          remarks: '',
          customer_id: '',
          merchant_id: selectedPickup?.merchant_code || '',
          cod_amount: 0,
          created_at: '',
          updated_at: '',
          environment: 'production',
          customer_tier: 'Standard',
          saved: false,
        })));

    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: [...PARCEL_TEMPLATE_HEADERS],
      skipHeader: false,
    });

    // Widths mirror the supplied parcel workbook while keeping long fields usable.
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 28 },
      { wch: 18 }, { wch: 22 }, { wch: 46 }, { wch: 16 }, { wch: 16 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 34 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, 'parcel.xlsx');
  };

  const handleUploadClick = () => uploadInputRef.current?.click();

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setMessage('');

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found in the uploaded file.');

      const matrix = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        blankrows: false,
      });

      const expectedHeaders = PARCEL_TEMPLATE_HEADERS.map(normalizeHeader);
      const headerRowIndex = matrix.findIndex((row) => {
        const normalized = row.map(normalizeHeader);
        return expectedHeaders.every((header) => normalized.includes(header));
      });

      if (headerRowIndex < 0) {
        throw new Error(`parcel.xlsx header row not found. Required columns: ${PARCEL_TEMPLATE_HEADERS.join(', ')}`);
      }

      const headers = matrix[headerRowIndex].map(normalizeHeader);
      const getCell = (row: any[], header: typeof PARCEL_TEMPLATE_HEADERS[number]) => {
        const index = headers.indexOf(normalizeHeader(header));
        return index >= 0 ? row[index] : '';
      };

      const sourceRows = matrix
        .slice(headerRowIndex + 1)
        .filter((row): row is any[] => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''));

      if (!sourceRows.length) throw new Error('No parcel rows found in the uploaded file.');

      const currentRowsSnapshot = rows.filter(isParcelRow);
      const uploadedRows = await mapWithConcurrency(sourceRows, 6, async (sourceRow, index) => {
        const excelRowNumber = headerRowIndex + index + 2;
        try {
          const sourceWayId = String(getCell(sourceRow, 'Way ID') || '').trim();
          const sourceSequence = Math.max(1, Math.trunc(toNumber(getCell(sourceRow, 'စဉ်'), index + 1)));
          const existing = currentRowsSnapshot.find((candidate) =>
            (sourceWayId && candidate.way_id === sourceWayId) ||
            Number(candidate.parcel_sequence) === sourceSequence,
          ) || currentRowsSnapshot[index];

          const sequence = Math.max(1, Math.trunc(toNumber(getCell(sourceRow, 'စဉ်'), existing?.parcel_sequence || index + 1)));
          const townshipValue = String(getCell(sourceRow, 'မြို့နယ်') || existing?.township || selectedPickup?.township || '').trim();
          const townshipOption = findTownshipOption(townshipValue);
          const osValue = String(getCell(sourceRow, 'OS') || existing?.os || selectedPickup?.merchant_name || selectedPickup?.merchant_code || '').trim();
          const wayId = String(sourceWayId || existing?.way_id || `UPLOAD-${sequence}`).trim();

          const row: ParcelRow = {
            id: existing?.id || '',
            parcel_sequence: sequence,
            status: String(getCell(sourceRow, 'Status') || existing?.status || 'registered').trim(),
            way_id: wayId,
            os: osValue,
            recipient_name: String(getCell(sourceRow, 'လက်ခံမည့်သူအမည်') || existing?.recipient_name || ''),
            recipient_phone: String(getCell(sourceRow, 'ဖုန်း') || existing?.recipient_phone || ''),
            township: townshipOption?.township || townshipValue,
            delivery_address: String(getCell(sourceRow, 'လိပ်စာ') || existing?.delivery_address || ''),
            item_price: toNumber(getCell(sourceRow, 'ပစ္စည်းတန်ဖိုး'), existing?.item_price || 0),
            delivery_charges: toNumber(getCell(sourceRow, 'ပို့ဆောင်ခ'), existing?.delivery_charges || 0),
            weight_kg: toNumber(getCell(sourceRow, 'ကီလို'), existing?.weight_kg || 0),
            extra_weight_charge: toNumber(getCell(sourceRow, 'ကီလိုအပိုကြေး'), existing?.extra_weight_charge || 0),
            collect_amount: toNumber(getCell(sourceRow, 'ငွေကောက်ရန်'), existing?.collect_amount || 0),
            destination: String(getCell(sourceRow, 'Destination') || existing?.destination || townshipOption?.city || selectedPickup?.city || 'Yangon').trim(),
            remarks: String(getCell(sourceRow, 'Remarks') || existing?.remarks || ''),
            customer_id: existing?.customer_id || osValue,
            merchant_id: existing?.merchant_id || selectedPickup?.merchant_code || osValue,
            cod_amount: toNumber(getCell(sourceRow, 'ပစ္စည်းတန်ဖိုး'), existing?.cod_amount || 0),
            created_at: existing?.created_at || '',
            updated_at: existing?.updated_at || '',
            environment: existing?.environment || 'production',
            customer_tier: existing?.customer_tier || findCustomerTier(osValue),
            proof_photo_path: existing?.proof_photo_path || null,
            photo_url: existing?.photo_url || null,
            saved: false,
          };

          // Limit parallel tariff RPCs so large workbooks do not overload Supabase.
          const calculated = await calculateAmounts(row);
          if (!isParcelRow(calculated)) throw new Error('tariff calculation returned an empty row');
          return calculated;
        } catch (rowError: any) {
          throw new Error(`Excel row ${excelRowNumber}: ${rowError?.message || 'could not be imported'}`);
        }
      });

      const validUploadedRows = uploadedRows.filter(isParcelRow);
      if (!validUploadedRows.length) throw new Error('No valid parcel rows were produced from the uploaded file.');

      setRows((currentRows) => {
        const nextRows = currentRows.filter(isParcelRow);

        validUploadedRows.forEach((uploadedRow) => {
          const byWayId = uploadedRow.way_id
            ? nextRows.findIndex((candidate) => isParcelRow(candidate) && candidate.way_id === uploadedRow.way_id)
            : -1;
          const bySequence = nextRows.findIndex((candidate) =>
            isParcelRow(candidate) && Number(candidate.parcel_sequence) === Number(uploadedRow.parcel_sequence),
          );
          const targetIndex = byWayId >= 0 ? byWayId : bySequence >= 0 ? bySequence : nextRows.length;
          const existing = isParcelRow(nextRows[targetIndex]) ? nextRows[targetIndex] : undefined;

          nextRows[targetIndex] = {
            ...(existing || uploadedRow),
            ...uploadedRow,
            proof_photo_path: existing?.proof_photo_path || uploadedRow.proof_photo_path || null,
            photo_url: existing?.photo_url || uploadedRow.photo_url || null,
            saved: false,
          };
        });

        return nextRows
          .filter(isParcelRow)
          .sort((a, b) => Number(a.parcel_sequence || 0) - Number(b.parcel_sequence || 0));
      });

      setMessage(`${BULK_UPLOAD_GUARD}: Imported ${validUploadedRows.length} parcel row(s) safely. Delivery charge, extra-kilo charge, and collection amount were recalculated.`);
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || 'Failed to upload parcel.xlsx.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };


  const handleAddRow = () => {
    const newSequence = Math.max(0, ...rows.map((row) => row.parcel_sequence)) + 1;
    const now = new Date().toISOString();
    setRows((current) => [...current, calculateLocalAmounts({
      id: '',
      parcel_sequence: newSequence,
      status: 'registered',
      way_id: `MANUAL-${newSequence}`,
      os: selectedPickup?.merchant_name || selectedPickup?.merchant_code || '',
      recipient_name: '',
      recipient_phone: '',
      township: selectedPickup?.township || 'North Dagon',
      delivery_address: '',
      item_price: 0,
      delivery_charges: 0,
      weight_kg: 1,
      extra_weight_charge: 0,
      collect_amount: 0,
      destination: selectedPickup?.city || 'Yangon',
      remarks: '',
      customer_id: '',
      merchant_id: selectedPickup?.merchant_code || '',
      cod_amount: 0,
      created_at: now,
      updated_at: now,
      environment: 'production',
      customer_tier: 'Standard',
      saved: false,
    })]);
  };

  const handleUpdate = async (index: number, field: keyof ParcelRow, value: any) => {
    const currentRow = rows[index];
    if (!currentRow) return;

    let updatedRow: ParcelRow = { ...currentRow, [field]: field === 'parcel_sequence' ? Math.max(1, Math.trunc(toNumber(value, currentRow.parcel_sequence))) : value, saved: false };

    if (field === 'township') {
      const option = findTownshipOption(String(value));
      if (option) {
        updatedRow.township = option.township;
        updatedRow.destination = option.city || updatedRow.destination || 'Yangon';
      }
    }

    if (field === 'os') {
      updatedRow.customer_id = String(value);
      updatedRow.merchant_id = String(value);
      updatedRow.customer_tier = findCustomerTier(String(value));
    }

    if (['township', 'os', 'item_price', 'weight_kg', 'destination'].includes(field)) {
      updatedRow = await calculateAmounts(updatedRow);
    }

    setRows((currentRows) => {
      const nextRows = [...currentRows];
      nextRows[index] = updatedRow;
      return nextRows;
    });
  };

  const databaseParcelPayload = (row: ParcelRow) => ({
    ...(isUuid(row.id) ? { id: row.id } : {}),
    parcel_sequence: Number(row.parcel_sequence || 0),
    status: row.status || 'registered',
    way_id: row.way_id,
    os: row.os || null,
    recipient_name: row.recipient_name || null,
    recipient_phone: row.recipient_phone || null,
    township: row.township || null,
    delivery_address: row.delivery_address || null,
    item_price: Number(row.item_price || 0),
    delivery_charges: Number(row.delivery_charges || 0),
    weight_kg: Number(row.weight_kg || 0),
    extra_weight_charge: Number(row.extra_weight_charge || 0),
    collect_amount: Number(row.collect_amount || 0),
    destination: row.destination || null,
    remarks: row.remarks || null,
    // Legacy compatibility columns.
    customer_id: row.customer_id || row.os || null,
    merchant_id: row.merchant_id || row.os || null,
    cod_amount: Number(row.item_price || 0),
    ...(row.created_at ? { created_at: row.created_at } : {}),
    updated_at: new Date().toISOString(),
    environment: row.environment || 'production',
  });

  const handleSaveRow = async (index: number) => {
    if (!selectedPickupId) return setMessage('Please select a pickup first.');

    try {
      setLoading(true);
      const calculated = await calculateAmounts(rows[index]);
      const now = new Date().toISOString();

      let response = await sb.rpc('be_save_data_entry_parcel_sheet', {
        p_pickup_id: selectedPickupId,
        p_sequence: Number(calculated.parcel_sequence || index + 1),
        p_status: calculated.status || 'registered',
        p_way_id: calculated.way_id,
        p_os: calculated.os || null,
        p_recipient_name: calculated.recipient_name || null,
        p_recipient_phone: calculated.recipient_phone || null,
        p_township: calculated.township || null,
        p_delivery_address: calculated.delivery_address || null,
        p_item_price: Number(calculated.item_price || 0),
        p_delivery_charges: Number(calculated.delivery_charges || 0),
        p_weight_kg: Number(calculated.weight_kg || 0),
        p_extra_weight_charge: Number(calculated.extra_weight_charge || 0),
        p_collect_amount: Number(calculated.collect_amount || 0),
        p_destination: calculated.destination || null,
        p_remarks: calculated.remarks || null,
        p_actor_email: null,
      });

      if (response.error) {
        response = await sb.rpc('be_save_data_entry_parcel', {
          p_id: calculated.id || null,
          p_way_id: calculated.way_id,
          p_customer_id: calculated.customer_id || calculated.os || null,
          p_merchant_id: calculated.merchant_id || calculated.os || null,
          p_status: calculated.status || 'registered',
          p_recipient_name: calculated.recipient_name || null,
          p_recipient_phone: calculated.recipient_phone || null,
          p_township: calculated.township || null,
          p_delivery_address: calculated.delivery_address || null,
          p_item_price: Number(calculated.item_price || 0),
          p_delivery_charges: Number(calculated.delivery_charges || 0),
          p_cod_amount: Number(calculated.item_price || 0),
          p_weight_kg: Number(calculated.weight_kg || 0),
          p_created_at: calculated.created_at || null,
          p_updated_at: now,
          p_environment: calculated.environment || 'production',
          p_actor_email: null,
        });
      }

      if (response.error) {
        response = await sb
          .from('parcels')
          .upsert(databaseParcelPayload(calculated), { onConflict: 'way_id' })
          .select('*')
          .single();
      }

      if (response.error) throw response.error;
      const savedParcel = response.data?.parcel || response.data || {};

      setRows((currentRows) => {
        const nextRows = [...currentRows];
        nextRows[index] = {
          ...calculated,
          id: String((savedParcel as any)?.id || calculated.id || ''),
          created_at: toIsoTimestamp(savedParcel.created_at, calculated.created_at || now),
          updated_at: toIsoTimestamp(savedParcel.updated_at, now),
          delivery_charges: Number(savedParcel.delivery_charges ?? calculated.delivery_charges),
          extra_weight_charge: Number(savedParcel.extra_weight_charge ?? calculated.extra_weight_charge),
          collect_amount: Number(savedParcel.collect_amount ?? calculated.collect_amount),
          cod_amount: Number(savedParcel.cod_amount ?? calculated.cod_amount),
          saved: true,
        };
        return nextRows;
      });
      setMessage(`Saved parcel ${calculated.way_id}.`);
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || `Failed to save ${rows[index]?.way_id || 'parcel'}.`);
    } finally {
      setLoading(false);
    }
  };

  const legacyWaybillPayload = (parcelRows: ParcelRow[]) => parcelRows.map((row) => ({
    parcel_sequence: row.parcel_sequence,
    delivery_way_id: row.way_id,
    recipient_name: row.recipient_name,
    contact_no_1: row.recipient_phone,
    contact_no_2: null,
    township: row.township,
    recipient_address: row.delivery_address,
    customer_tier: row.customer_tier || 'Standard',
    item_price: Number(row.item_price || 0),
    weight_kg: Number(row.weight_kg || 0),
    surcharge: Number(row.extra_weight_charge || 0),
    delivery_fee: Number(row.delivery_charges || 0),
    cod_amount: Number(row.item_price || 0),
    actual_collect: Number(row.collect_amount || 0),
    destination: row.destination || selectedPickup?.city || 'Yangon',
    pickup_by: 'DATA_ENTRY',
    remark: row.remarks || '',
    os: row.os || '',
    proof_photo_path: row.proof_photo_path || null,
  }));

  const handleSaveAndGenerate = async () => {
    if (!selectedPickupId) return setMessage('Please select a pickup first.');
    if (!rows.length) return setMessage('No parcel rows are available for this pickup.');

    const missingProofs = rows.filter((row) => !row.photo_url && !row.proof_photo_path);
    if (missingProofs.length) {
      return setMessage(`Cannot generate waybill: ${missingProofs.length} parcel(s) still have no rider photo proof.`);
    }

    if (!allPhotosReviewed) {
      return setMessage(`Please open and check every Rider photo first. Checked ${reviewedPhotoCount}/${photoProofKeys.length}.`);
    }

    const missingRequired = rows.filter((row) =>
      !String(row.way_id || '').trim() ||
      !String(row.os || '').trim() ||
      !String(row.recipient_name || '').trim() ||
      !String(row.recipient_phone || '').trim() ||
      !String(row.township || '').trim() ||
      !String(row.delivery_address || '').trim(),
    );

    if (missingRequired.length) {
      return setMessage(`Cannot generate waybill: ${missingRequired.length} row(s) need Way ID, OS, recipient name, phone, township, and address.`);
    }

    try {
      setLoading(true);
      setMessage('Recalculating and saving parcel rows...');

      const calculatedRows = await Promise.all(rows.map((row) => calculateAmounts(row)));
      const { data: userData } = await supabase.auth.getUser();
      const actorEmail = userData?.user?.email || null;
      const exactParcelRows = calculatedRows.map(parcelExportRow);

      let { data, error } = await sb.rpc('be_data_entry_create_waybill_from_parcel_sheet', {
        p_pickup_id: selectedPickupId,
        p_rows: exactParcelRows,
        p_actor_email: actorEmail,
      });

      if (error) {
        const directSave = await sb
          .from('parcels')
          .upsert(calculatedRows.map(databaseParcelPayload), { onConflict: 'way_id' });
        if (directSave.error) throw directSave.error;

        const legacy = await sb.rpc('be_data_entry_create_waybill_from_rows', {
          p_pickup_id: selectedPickupId,
          p_rows: legacyWaybillPayload(calculatedRows),
          p_actor_email: actorEmail,
        });
        data = legacy.data;
        error = legacy.error;
      }

      if (error) throw error;

      const now = new Date().toISOString();
      const waybillNo = data?.waybill_no || data?.waybillNo || data?.legacy_result?.waybill_no || 'created';
      const parcelCount = data?.parcel_count || calculatedRows.length;

      setRows(calculatedRows.map((row) => ({
        ...row,
        status: 'waybill_created',
        updated_at: now,
        saved: true,
      })));
      setMessage(`Waybill ${waybillNo} created successfully. ${parcelCount} parcel row(s) saved in parcel format.`);
      await loadPickupQueue();
      await loadParcelProofs(selectedPickupId);
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || 'Waybill creation failed. Apply the parcel backend SQL patch and try again.');
    } finally {
      setLoading(false);
    }
  };

  const canGenerateWaybill = Boolean(selectedPickupId) && rows.length > 0 && allPhotosReviewed;

  return (
    <div className="space-y-6" data-data-entry-build={DATA_ENTRY_BUILD}>
      <div className="border-b border-[#1a3a5c] pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">
            {t('PARCEL DATA ENTRY REGISTRATION', 'ပါဆယ်စာရင်း သွင်းရန်')}
          </h1>
          <p className="text-[#4d7a9b] text-[13px]">
            {t(
              'Verify rider photos and register parcels using the exact parcel.xlsx schema. Charges calculate automatically.',
              'ရိုင်ဒါ၏ ပစ္စည်းဓာတ်ပုံများကို စစ်ဆေးပြီး parcel.xlsx ပုံစံအတိုင်း စာရင်းသွင်းပါ။ ငွေပမာဏ အလိုအလျောက်တွက်ပေးမည်။',
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-emerald-300">
              {DATA_ENTRY_BUILD}
            </div>
            <div className="inline-flex items-center rounded-md border border-[#f6b84b]/50 bg-[#f6b84b]/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-[#f6b84b]">
              PHOTO REVIEW • FULL REGISTER FORM • RPC V16
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            loadPickupQueue();
            loadParcelDropdowns();
            if (selectedPickupId) loadParcelProofs(selectedPickupId);
          }}
          className="bg-[#1a3a5c] text-[#eef8ff] px-4 py-2 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center gap-2 text-[12px] uppercase tracking-wider"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Proofs
        </button>
      </div>

      {message && (
        <div className="bg-[#061524] border border-[#f6b84b]/50 text-[#f6b84b] p-3 rounded-xl text-[13px] flex items-center gap-2">
          <AlertTriangle size={16} />
          {message}
        </div>
      )}

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-6 items-end">
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              <Filter size={12} className="inline mr-1" /> {t('From Date', 'မှ (ရက်စွဲ)')}
            </label>
            <input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
          </div>
          <div>
            <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
              <Filter size={12} className="inline mr-1" /> {t('To Date', 'ထိ (ရက်စွဲ)')}
            </label>
            <input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
          </div>
        </div>
        <div className="w-full lg:w-auto flex gap-2 flex-wrap justify-end">
          <button className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex justify-center items-center gap-2 text-[12px] uppercase tracking-wider transition-colors cursor-pointer">
            <Download size={14} /> {t('Report', 'အစီရင်ခံစာ')}
          </button>
          <button onClick={downloadParcelTemplate} className="bg-[#061524] text-[#4ea8de] px-6 py-3 rounded-xl border border-[#1a3a5c] hover:border-[#4ea8de] flex justify-center items-center gap-2 text-[12px] uppercase tracking-wider transition-colors cursor-pointer">
            <Download size={14} /> parcel.xlsx
          </button>
          <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTemplateUpload} />
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={loading}
            className="bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl flex justify-center items-center gap-2 hover:bg-[#e5a93a] text-[12px] uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadCloud size={14} /> {loading ? t('Uploading...', 'တင်နေသည်...') : t('Upload parcel.xlsx', 'parcel.xlsx တင်မည်')}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5">
          <h3 className="text-[#eef8ff] text-[13px] uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-[#1a3a5c] pb-3">
            <Camera size={14} className="text-[#4ea8de]" />
            {t('Rider Photo Verification', 'Rider မှတ်တမ်းပုံများ')}
          </h3>

          <div className="mb-3 text-[11px] text-[#4d7a9b]">
            {selectedPickup ? (
              <>
                <div className="text-[#eef8ff] font-semibold">{selectedPickup.pickup_id}</div>
                <div>{selectedPickup.merchant_code || 'No merchant code'}{selectedPickup.merchant_name ? ` - ${selectedPickup.merchant_name}` : ''}</div>
                <div className="mt-1 break-words">
                  <span className="text-[#4ea8de]">Pickup address:</span>{' '}
                  <span className="text-[#eef8ff]">{selectedPickup.pickup_address || 'Not provided'}</span>
                </div>
                <div>
                  Location: {[selectedPickup.township, selectedPickup.city].filter(Boolean).join(', ') || 'Not provided'}
                </div>
                <div>Photo review: <span className="text-[#f6b84b]">{reviewedPhotoCount}</span> / {photoProofKeys.length} checked</div>
              </>
            ) : 'Select pickup to view rider photos.'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {parcelProofs.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-4 bg-[#061524] border border-[#1a3a5c] rounded-xl min-h-36 flex flex-col items-center justify-center text-[#4d7a9b] text-[12px]">
                <ImageIcon size={24} className="mb-2" />
                {t('No rider parcel photos loaded', 'ရိုင်ဒါပုံများ မရှိသေးပါ')}
              </div>
            ) : parcelProofs.map((proof) => {
              const key = proofKey(proof);
              const reviewed = reviewedPhotoKeys.has(key);
              const failed = failedPhotoKeys.has(key);
              const hasPhotoSource = Boolean(firstPhotoValue(proof));

              return (
                <div key={key} className={`bg-[#061524] border rounded-xl overflow-hidden ${reviewed ? 'border-emerald-400/70' : 'border-[#1a3a5c]'}`}>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[#f6b84b] text-[12px] font-semibold truncate">{proof.way_id || proof.delivery_way_id || key}</div>
                      <div className="text-[#4d7a9b] text-[11px]">#{String(proof.parcel_sequence).padStart(3, '0')} • {Number(proof.parcel_weight_kg || proof.weight_kg || 0).toFixed(2)} KG • {proofStatus(proof)}</div>
                    </div>
                    {reviewed ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" /> : <Eye size={18} className="text-[#4ea8de] shrink-0" />}
                  </div>

                  {proof.photo_url && !failed ? (
                    <button type="button" onClick={() => openProofPhoto(proof)} className="block w-full text-left group">
                      <img
                        src={proof.photo_url}
                        alt={proof.way_id || proof.delivery_way_id || 'Parcel proof'}
                        className="w-full h-48 object-contain bg-black/30 border-y border-[#1a3a5c] group-hover:opacity-90"
                        onError={() => setFailedPhotoKeys((current) => new Set(current).add(key))}
                      />
                      <div className="p-2 text-[11px] text-[#4ea8de] flex items-center gap-1"><Eye size={12} /> Open large preview and mark checked</div>
                    </button>
                  ) : (
                    <div className="h-48 border-y border-[#1a3a5c] flex flex-col items-center justify-center gap-3 p-4 text-center text-[#4d7a9b] text-[11px]">
                      <AlertTriangle size={24} className={failed ? 'text-rose-400' : 'text-[#4d7a9b]'} />
                      <div>{failed ? 'The saved image link did not load.' : hasPhotoSource ? 'Preparing secure Rider photo link.' : 'No Rider photo was saved for this parcel.'}</div>
                      {hasPhotoSource && (
                        <button type="button" onClick={() => retryProofPhoto(proof)} className="px-3 py-2 rounded-lg border border-[#4ea8de] text-[#4ea8de] hover:bg-[#4ea8de]/10 flex items-center gap-1">
                          <RotateCcw size={12} /> Retry secure photo link
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-3 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => openProofPhoto(proof)} disabled={!hasPhotoSource} className="px-3 py-2 rounded-lg border border-[#4ea8de] text-[#4ea8de] text-[11px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                      <Eye size={12} /> Check photo
                    </button>
                    <label className={`flex items-center gap-2 text-[11px] ${hasPhotoSource ? 'text-[#eef8ff]' : 'text-[#4d7a9b]'}`}>
                      <input type="checkbox" checked={reviewed} disabled={!hasPhotoSource} onChange={(event) => setPhotoReviewed(key, event.target.checked)} />
                      Photo checked
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#1a3a5c] bg-[#061524] flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-[#4ea8de] text-[11px] uppercase tracking-widest mb-2">
                {t('1. Select Verified Pickup Request', '၁။ အတည်ပြုပြီးသော Pickup ရွေးပါ')}
              </label>
              <select value={selectedPickupId} onChange={(event) => selectPickup(event.target.value)} className="w-full bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]">
                {pickupQueue.length === 0
                  ? <option value="">No rider verified pickups found</option>
                  : pickupQueue.map((pickup) => (
                    <option key={pickup.pickup_id} value={pickup.pickup_id}>
                      {pickup.pickup_id} ({pickup.merchant_code || 'No merchant'} - {pickup.merchant_name || 'Unnamed'} - {pickup.verified_parcels || 0}/{pickup.expected_parcels || 0} Parcels - {pickup.pickup_address || 'No pickup address'})
                    </option>
                  ))}
              </select>
              <div className="mt-2 rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-[10px] leading-5 text-[#8fb6d1] break-all">
                <div><span className="text-[#f6b84b]">Build:</span> {DATA_ENTRY_BUILD}</div>
                <div><span className="text-[#f6b84b]">RPC:</span> {PICKUP_RPC_V16}</div>
                <div><span className="text-[#f6b84b]">Supabase:</span> {supabaseDiagnostic}</div>
                <div><span className="text-[#f6b84b]">Auth:</span> {authDiagnostic}</div>
                <div><span className="text-[#f6b84b]">Pickup source:</span> {pickupLoadSource}</div>
              </div>
            </div>
            <div className="w-full md:w-28">
              <label className="block text-[#4ea8de] text-[11px] uppercase tracking-widest mb-2">{t('PARCELS', 'အရေအတွက်')}</label>
              <input type="number" value={rows.length || selectedPickup?.expected_parcels || 0} readOnly className="w-full bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none text-[13px] text-center" />
            </div>
            <button onClick={handleGenerate} className="w-full md:w-auto bg-[#1a3a5c] text-[#eef8ff] border border-[#1a3a5c] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#4ea8de] flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Layers size={14} /> {t('2. Load Rider Proofs', '၂။ Rider ပုံများယူမည်')}
            </button>
            <button type="button" onClick={handleRegisterNow} disabled={loading || !selectedPickupId} className="w-full md:w-auto bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <CheckCircle2 size={14} /> REGISTER NOW
            </button>
          </div>

          {/* PICKUP_INFORMATION_ADDRESS_V12: always visible, including when the pickup queue is empty. */}
          <div className="px-4 py-4 border-b border-[#1a3a5c] bg-[#0b2236]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-[#4ea8de]">
              <MapPin size={14} /> Pickup Information &amp; Address
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-[12px]">
              <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">Pickup ID / Way ID</div>
                <div className="text-[#eef8ff] break-words">
                  {selectedPickup
                    ? `${selectedPickup.pickup_id}${selectedPickup.pickup_way_id ? ` / ${selectedPickup.pickup_way_id}` : ''}`
                    : 'No verified pickup selected'}
                </div>
              </div>
              <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">Merchant</div>
                <div className="text-[#eef8ff] break-words">
                  {selectedPickup
                    ? `${selectedPickup.merchant_code || 'No merchant code'}${selectedPickup.merchant_name ? ` - ${selectedPickup.merchant_name}` : ''}`
                    : 'No verified pickup selected'}
                </div>
              </div>
              <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">Pickup Date</div>
                <div className="text-[#eef8ff]">
                  {selectedPickup?.pickup_date ? String(selectedPickup.pickup_date).slice(0, 10) : 'Not available'}
                </div>
              </div>
              <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">Status / Workflow</div>
                <div className="text-[#eef8ff] break-words">
                  {selectedPickup
                    ? [selectedPickup.pickup_status, selectedPickup.workflow_stage].filter(Boolean).join(' / ') || 'Not provided'
                    : 'Not available'}
                </div>
              </div>
              <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3 sm:col-span-2 xl:col-span-1">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1">Parcel Verification</div>
                <div className="text-[#eef8ff]">
                  {selectedPickup
                    ? `${selectedPickup.verified_parcels || 0} verified / ${selectedPickup.expected_parcels || 0} expected`
                    : 'Not available'}
                </div>
                <div className="text-[#4d7a9b] mt-1">
                  {selectedPickup
                    ? `${selectedPickup.photo_parcels || 0} photos • ${Number(selectedPickup.total_weight_kg || 0).toFixed(2)} KG`
                    : 'No pickup metrics'}
                </div>
              </div>
              <div className="sm:col-span-2 xl:col-span-3 bg-[#061524] border border-[#1a3a5c] rounded-xl p-3">
                <div className="text-[#4d7a9b] text-[10px] uppercase tracking-widest mb-1 flex items-center gap-1">
                  <MapPin size={12} className="text-[#4ea8de]" /> Pickup Address
                </div>
                <div className="text-[#eef8ff] whitespace-pre-wrap break-words leading-relaxed">
                  {selectedPickup?.pickup_address || (pickupQueue.length === 0
                    ? 'No authenticated verified pickup is currently available. The address will appear here when the pickup queue returns a record.'
                    : 'Pickup address was not provided by the selected source record.')}
                </div>
                <div className="text-[#4d7a9b] mt-2">
                  Township / City: {selectedPickup
                    ? [selectedPickup.township, selectedPickup.city].filter(Boolean).join(', ') || 'Not provided'
                    : 'Not available'}
                </div>
              </div>
            </div>
          </div>

          <datalist id="data-entry-township-options">
            {townshipDisplayOptions.map((option) => (
              <option key={`${option.township}-${option.township_mm || ''}`} value={option.township} label={option.township_mm ? `${option.township_mm} / ${option.city || ''}` : option.city || ''} />
            ))}
          </datalist>
          <datalist id="data-entry-customer-options">
            {customerOptions.map((option) => <option key={option.value} value={option.value} label={option.label} />)}
          </datalist>
          <datalist id="data-entry-merchant-options">
            {merchantOptions.map((option) => <option key={option.value} value={option.value} label={option.label} />)}
          </datalist>

          <div className="px-4 py-3 border-y border-[#1a3a5c] bg-[#061524] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[#eef8ff] text-[12px] font-semibold uppercase tracking-widest">Full Register Screen</div>
              <div className="text-[#4d7a9b] text-[11px]">Form view shows every parcel field without horizontal scrolling. Sheet view preserves the exact Excel column layout.</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRegisterView('form')} className={`px-3 py-2 rounded-lg border text-[11px] flex items-center gap-1 ${registerView === 'form' ? 'bg-[#f6b84b] text-[#061524] border-[#f6b84b]' : 'text-[#4ea8de] border-[#1a3a5c]'}`}>
                <LayoutGrid size={13} /> Full form
              </button>
              <button type="button" onClick={() => { setRegisterView('sheet'); window.setTimeout(() => { if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0; if (topScrollRef.current) topScrollRef.current.scrollLeft = 0; }, 0); }} className={`px-3 py-2 rounded-lg border text-[11px] flex items-center gap-1 ${registerView === 'sheet' ? 'bg-[#f6b84b] text-[#061524] border-[#f6b84b]' : 'text-[#4ea8de] border-[#1a3a5c]'}`}>
                <Table2 size={13} /> Excel sheet
              </button>
            </div>
          </div>

          {registerView === 'form' ? (
            <div className="p-4 space-y-4 bg-[#071a2b]">
              {rows.length === 0 ? (
                <div className="text-center p-12 text-[#4d7a9b] text-[14px]">{t('Select a pickup request and click REGISTER NOW.', 'Pickup ကိုရွေးချယ်ပြီး REGISTER NOW ကိုနှိပ်ပါ။')}</div>
              ) : rows.map((row, index) => (
                <div key={`${row.way_id}-${row.parcel_sequence}`} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#1a3a5c] pb-3">
                    <div>
                      <div className="text-[#f6b84b] text-[13px] font-semibold">Parcel #{row.parcel_sequence} • {row.way_id}</div>
                      <div className="text-[#4d7a9b] text-[11px]">All 15 parcel.xlsx fields are displayed below.</div>
                    </div>
                    <button type="button" onClick={() => handleSaveRow(index)} disabled={loading} className={`px-4 py-2 rounded-lg text-[11px] border transition-colors ${row.saved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[#f6b84b] text-[#061524] border-[#f6b84b] hover:bg-[#e5a93a]'}`}>
                      {row.saved ? 'Saved' : 'Save parcel'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">စဉ်<input type="number" min="1" value={row.parcel_sequence} onChange={(event) => handleUpdate(index, 'parcel_sequence', event.target.value)} className={`${TEXT_INPUT} mt-1 text-center`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">Status<select value={row.status} onChange={(event) => handleUpdate(index, 'status', event.target.value)} className={`${DROPDOWN_INPUT} mt-1`}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">Way ID<input value={row.way_id} onChange={(event) => handleUpdate(index, 'way_id', event.target.value)} className={`${TEXT_INPUT} mt-1`} placeholder="Way ID" /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">OS<input list="data-entry-merchant-options" value={row.os} onChange={(event) => handleUpdate(index, 'os', event.target.value)} className={`${DROPDOWN_INPUT} mt-1`} placeholder="Online Shop / OS" /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">လက်ခံမည့်သူအမည်<input value={row.recipient_name} onChange={(event) => handleUpdate(index, 'recipient_name', event.target.value)} className={`${TEXT_INPUT} mt-1`} placeholder="Recipient name" /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ဖုန်း<input value={row.recipient_phone} onChange={(event) => handleUpdate(index, 'recipient_phone', event.target.value)} className={`${TEXT_INPUT} mt-1`} placeholder="09..." /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">မြို့နယ်<input list="data-entry-township-options" value={row.township} onChange={(event) => handleUpdate(index, 'township', event.target.value)} onBlur={(event) => handleUpdate(index, 'township', event.target.value)} className={`${DROPDOWN_INPUT} mt-1`} placeholder="Township / မြို့နယ်" /></label>
                    <label className="sm:col-span-2 text-[10px] uppercase tracking-wider text-[#4d7a9b]">လိပ်စာ<input value={row.delivery_address} onChange={(event) => handleUpdate(index, 'delivery_address', event.target.value)} className={`${TEXT_INPUT} mt-1`} placeholder="Full delivery address" /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ပစ္စည်းတန်ဖိုး<input type="number" min="0" value={row.item_price} onChange={(event) => handleUpdate(index, 'item_price', event.target.value)} className={`${TEXT_INPUT} mt-1 text-emerald-400`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ပို့ဆောင်ခ<input type="number" value={row.delivery_charges} readOnly className={`${READONLY_INPUT} mt-1 text-[#f6b84b]`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ကီလို<input type="number" min="0" step="0.01" value={row.weight_kg} onChange={(event) => handleUpdate(index, 'weight_kg', event.target.value)} className={`${TEXT_INPUT} mt-1 text-[#f6b84b]`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ကီလိုအပိုကြေး<input type="number" value={row.extra_weight_charge} readOnly className={`${READONLY_INPUT} mt-1 text-[#f6b84b]`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">ငွေကောက်ရန်<input type="number" value={row.collect_amount} readOnly className={`${READONLY_INPUT} mt-1 text-emerald-400`} /></label>
                    <label className="text-[10px] uppercase tracking-wider text-[#4d7a9b]">Destination<input value={row.destination} onChange={(event) => handleUpdate(index, 'destination', event.target.value)} className={`${DROPDOWN_INPUT} mt-1`} placeholder="Yangon / Mandalay / Naypyitaw" /></label>
                    <label className="sm:col-span-2 lg:col-span-3 xl:col-span-2 text-[10px] uppercase tracking-wider text-[#4d7a9b]">Remarks<input value={row.remarks} onChange={(event) => handleUpdate(index, 'remarks', event.target.value)} className={`${TEXT_INPUT} mt-1`} placeholder="Remarks / special instruction" /></label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
          <div ref={topScrollRef} onScroll={() => syncTopScroll('top')} className="overflow-x-auto overflow-y-hidden custom-scrollbar border-y border-[#1a3a5c] bg-[#061524]">
            <div style={{ width: tableMinWidth, height: 12 }} />
          </div>

          <div ref={tableScrollRef} onScroll={() => syncTopScroll('table')} className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-max min-w-full text-left whitespace-nowrap text-[12px] border-collapse" style={{ minWidth: tableMinWidth }}>
              <thead className="sticky top-0 z-10 border-b border-[#1a3a5c]">
                <tr className="tracking-widest">
                  <th className={`p-3 min-w-[80px] ${SYSTEM_HEADER}`}>စဉ်</th>
                  <th className={`p-3 min-w-[170px] ${DROPDOWN_HEADER}`}>Status</th>
                  <th className={`p-3 min-w-[190px] ${SYSTEM_HEADER}`}>Way ID</th>
                  <th className={`p-3 min-w-[190px] ${DROPDOWN_HEADER}`}>OS</th>
                  <th className={`p-3 min-w-[220px] ${MANUAL_HEADER}`}>လက်ခံမည့်သူအမည်</th>
                  <th className={`p-3 min-w-[160px] ${MANUAL_HEADER}`}>ဖုန်း</th>
                  <th className={`p-3 min-w-[190px] ${DROPDOWN_HEADER}`}>မြို့နယ်</th>
                  <th className={`p-3 min-w-[320px] ${MANUAL_HEADER}`}>လိပ်စာ</th>
                  <th className={`p-3 min-w-[145px] ${MANUAL_HEADER}`}>ပစ္စည်းတန်ဖိုး</th>
                  <th className={`p-3 min-w-[135px] ${SYSTEM_HEADER}`}>ပို့ဆောင်ခ</th>
                  <th className={`p-3 min-w-[100px] ${MANUAL_HEADER}`}>ကီလို</th>
                  <th className={`p-3 min-w-[150px] ${SYSTEM_HEADER}`}>ကီလိုအပိုကြေး</th>
                  <th className={`p-3 min-w-[145px] ${SYSTEM_HEADER}`}>ငွေကောက်ရန်</th>
                  <th className={`p-3 min-w-[160px] ${DROPDOWN_HEADER}`}>Destination</th>
                  <th className={`p-3 min-w-[260px] ${MANUAL_HEADER}`}>Remarks</th>
                  <th className={`p-3 min-w-[100px] text-center ${SYSTEM_HEADER}`}>Save</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={16} className="text-center p-12 text-[#4d7a9b] text-[14px]">{t('Select a pickup request and click REGISTER NOW.', 'Pickup ကိုရွေးချယ်ပြီး REGISTER NOW ကိုနှိပ်ပါ။')}</td></tr>
                ) : rows.map((row, index) => (
                  <tr key={`${row.way_id}-${row.parcel_sequence}`} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] transition-colors">
                    <td className="p-2"><input type="number" min="1" value={row.parcel_sequence} onChange={(event) => handleUpdate(index, 'parcel_sequence', event.target.value)} className={`${TEXT_INPUT} text-center`} /></td>
                    <td className="p-2"><select value={row.status} onChange={(event) => handleUpdate(index, 'status', event.target.value)} className={DROPDOWN_INPUT}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                    <td className="p-2"><input value={row.way_id} onChange={(event) => handleUpdate(index, 'way_id', event.target.value)} className={TEXT_INPUT} placeholder="Way ID" /></td>
                    <td className="p-2"><input list="data-entry-merchant-options" value={row.os} onChange={(event) => handleUpdate(index, 'os', event.target.value)} className={DROPDOWN_INPUT} placeholder="Online Shop / OS" /></td>
                    <td className="p-2"><input value={row.recipient_name} onChange={(event) => handleUpdate(index, 'recipient_name', event.target.value)} className={TEXT_INPUT} placeholder="Recipient name" /></td>
                    <td className="p-2"><input value={row.recipient_phone} onChange={(event) => handleUpdate(index, 'recipient_phone', event.target.value)} className={TEXT_INPUT} placeholder="09..." /></td>
                    <td className="p-2"><input list="data-entry-township-options" value={row.township} onChange={(event) => handleUpdate(index, 'township', event.target.value)} onBlur={(event) => handleUpdate(index, 'township', event.target.value)} className={DROPDOWN_INPUT} placeholder="Township / မြို့နယ်" /></td>
                    <td className="p-2"><input value={row.delivery_address} onChange={(event) => handleUpdate(index, 'delivery_address', event.target.value)} className={TEXT_INPUT} placeholder="Full delivery address" /></td>
                    <td className="p-2"><input type="number" min="0" value={row.item_price} onChange={(event) => handleUpdate(index, 'item_price', event.target.value)} className={`${TEXT_INPUT} text-emerald-400`} /></td>
                    <td className="p-2"><input type="number" value={row.delivery_charges} readOnly className={`${READONLY_INPUT} text-[#f6b84b]`} /></td>
                    <td className="p-2"><input type="number" min="0" step="0.01" value={row.weight_kg} onChange={(event) => handleUpdate(index, 'weight_kg', event.target.value)} className={`${TEXT_INPUT} text-[#f6b84b] text-center`} /></td>
                    <td className="p-2"><input type="number" value={row.extra_weight_charge} readOnly className={`${READONLY_INPUT} text-[#f6b84b]`} /></td>
                    <td className="p-2"><input type="number" value={row.collect_amount} readOnly className={`${READONLY_INPUT} text-emerald-400`} /></td>
                    <td className="p-2"><input value={row.destination} onChange={(event) => handleUpdate(index, 'destination', event.target.value)} className={DROPDOWN_INPUT} placeholder="Yangon / Mandalay / Naypyitaw" /></td>
                    <td className="p-2"><input value={row.remarks} onChange={(event) => handleUpdate(index, 'remarks', event.target.value)} className={TEXT_INPUT} placeholder="Remarks / special instruction" /></td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => handleSaveRow(index)} disabled={loading} className={`px-3 py-2 rounded-lg text-[11px] border transition-colors ${row.saved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[#f6b84b] text-[#061524] border-[#f6b84b] hover:bg-[#e5a93a]'}`}>
                        {row.saved ? 'Saved' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

            </>
          )}

          {rows.length > 0 && (
            <div className="p-4 border-t border-[#1a3a5c] flex justify-between items-center bg-[#061524]">
              <button onClick={handleAddRow} className="text-[#4ea8de] hover:text-[#eef8ff] flex items-center gap-1 text-[11px] uppercase tracking-widest transition-colors cursor-pointer">
                <Plus size={14} /> {t('Add Extra Row', 'အကွက် ထပ်ထည့်မည်')}
              </button>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-[#4d7a9b]">{reviewedPhotoCount}/{photoProofKeys.length} rider photos checked</div>
                <button
                  type="button"
                  onClick={handleSaveAndGenerate}
                  disabled={loading || !canGenerateWaybill}
                  title={!canGenerateWaybill ? `Open and check all Rider photos first (${reviewedPhotoCount}/${photoProofKeys.length}).` : 'Save parcel rows and create waybill'}
                  className={`px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider border transition-colors flex items-center gap-2 ${
                    loading || !canGenerateWaybill
                      ? 'bg-[#1a3a5c]/40 text-[#4d7a9b] border-[#1a3a5c] cursor-not-allowed'
                      : 'bg-[#f6b84b] text-[#061524] border-[#f6b84b] hover:bg-[#e5a93a] cursor-pointer'
                  }`}
                >
                  <Send size={14} /> {loading ? t('Creating...', 'ဖန်တီးနေသည်...') : t('Confirm & Create Waybill', 'အတည်ပြု၍ Waybill ဖန်တီးမည်')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {largePhoto && (
        <div className="fixed inset-0 z-[100000] bg-black/85 p-4 flex items-center justify-center" onClick={() => setLargePhoto(null)}>
          <div className="w-full max-w-6xl max-h-[95vh] overflow-auto rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[#f6b84b] text-[14px] font-semibold">{largePhoto.proof.way_id || largePhoto.proof.delivery_way_id || proofKey(largePhoto.proof)}</div>
                <div className="text-[#4d7a9b] text-[11px]">Rider proof photo • marked as checked when opened</div>
              </div>
              <button type="button" onClick={() => setLargePhoto(null)} className="rounded-lg border border-[#1a3a5c] p-2 text-[#eef8ff] hover:border-[#f6b84b]" aria-label="Close photo preview"><X size={18} /></button>
            </div>
            <img src={largePhoto.url} alt="Large Rider parcel proof" className="mx-auto max-h-[75vh] max-w-full object-contain rounded-xl bg-black/30" onError={() => setMessage('The enlarged Rider photo could not be loaded. Use Retry secure photo link on the card.')} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-emerald-400 text-[12px] flex items-center gap-2"><CheckCircle2 size={16} /> Photo checked</div>
              <div className="flex gap-2">
                <a href={largePhoto.url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-[#4ea8de] text-[#4ea8de] text-[11px] flex items-center gap-1"><ExternalLink size={12} /> Open original</a>
                <button type="button" onClick={() => setLargePhoto(null)} className="px-4 py-2 rounded-lg bg-[#f6b84b] text-[#061524] text-[11px]">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
