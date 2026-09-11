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
  Maximize2,
  Minimize2,
} from 'lucide-react';

const FALLBACK_TOWNSHIPS = [
  "Ahlone", "Bahan", "Botataung", "Cocokyun", "Dagon", "Dagon Myothit East", "Dagon Myothit North",
  "Dagon Myothit Seikkan", "Dagon Myothit South", "Dala", "Dawbon", "East Dagon", "Hlaing",
  "Hlaing Thar Yar", "Hlaingthaya", "Insein", "Kamayut", "Kyauktada", "Kyimyindaing",
  "Lanmadaw", "Latha", "Mayangon", "Mingaladon", "Mingala Taung Nyunt", "North Dagon",
  "North Okkalapa", "Pabedan", "Pazundaung", "Sanchaung", "Seikkan", "Shwe Pyi Thar",
  "Shwepyitha", "South Dagon", "South Okkalapa", "Tamwe", "Thaketa", "Thingangyun",
  "Yankin", "Mandalay", "Naypyidaw"
];

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

const MYANMAR_TOWNSHIP_OPTIONS: TownshipOption[] = [
  { township: "အလုံ", township_mm: "အလုံ", city: "Yangon", region_state: "Yangon Region", label: "Ahlone", search_text: "အလုံ Ahlone Alone" },
  { township: "ဗဟန်း", township_mm: "ဗဟန်း", city: "Yangon", region_state: "Yangon Region", label: "Bahan", search_text: "ဗဟန်း Bahan" },
  { township: "ဗိုလ်တထောင်", township_mm: "ဗိုလ်တထောင်", city: "Yangon", region_state: "Yangon Region", label: "Botahtaung", search_text: "ဗိုလ်တထောင် Botataung Botahtaung" },
  { township: "ဒဂုံ", township_mm: "ဒဂုံ", city: "Yangon", region_state: "Yangon Region", label: "Dagon", search_text: "ဒဂုံ Dagon" },
  { township: "ဒဂုံမြို့သစ်မြောက်ပိုင်း", township_mm: "ဒဂုံမြို့သစ်မြောက်ပိုင်း", city: "Yangon", region_state: "Yangon Region", label: "North Dagon", search_text: "ဒဂုံ မြောက် မြောက်ပိုင်း North Dagon Dagon Myothit North" },
  { township: "ဒဂုံမြို့သစ်တောင်ပိုင်း", township_mm: "ဒဂုံမြို့သစ်တောင်ပိုင်း", city: "Yangon", region_state: "Yangon Region", label: "South Dagon", search_text: "ဒဂုံ တောင် တောင်ပိုင်း South Dagon Dagon Myothit South" },
  { township: "ဒဂုံမြို့သစ်အရှေ့ပိုင်း", township_mm: "ဒဂုံမြို့သစ်အရှေ့ပိုင်း", city: "Yangon", region_state: "Yangon Region", label: "East Dagon", search_text: "ဒဂုံ အရှေ့ အရှေ့ပိုင်း East Dagon Dagon Myothit East" },
  { township: "ဒဂုံမြို့သစ်ဆိပ်ကမ်း", township_mm: "ဒဂုံမြို့သစ်ဆိပ်ကမ်း", city: "Yangon", region_state: "Yangon Region", label: "Dagon Seikkan", search_text: "ဒဂုံ ဆိပ်ကမ်း Dagon Seikkan Dagon Myothit Seikkan" },
  { township: "ဒလ", township_mm: "ဒလ", city: "Yangon", region_state: "Yangon Region", label: "Dala", search_text: "ဒလ Dala" },
  { township: "ဒေါပုံ", township_mm: "ဒေါပုံ", city: "Yangon", region_state: "Yangon Region", label: "Dawbon", search_text: "ဒေါပုံ Dawbon" },
  { township: "လှိုင်", township_mm: "လှိုင်", city: "Yangon", region_state: "Yangon Region", label: "Hlaing", search_text: "လှိုင် Hlaing" },
  { township: "လှိုင်သာယာ", township_mm: "လှိုင်သာယာ", city: "Yangon", region_state: "Yangon Region", label: "Hlaing Thar Yar", search_text: "လှိုင်သာယာ လှိုင် Hlaing Thar Yar Hlaingthaya" },
  { township: "အင်းစိန်", township_mm: "အင်းစိန်", city: "Yangon", region_state: "Yangon Region", label: "Insein", search_text: "အင်းစိန် Insein" },
  { township: "ကမာရွတ်", township_mm: "ကမာရွတ်", city: "Yangon", region_state: "Yangon Region", label: "Kamayut", search_text: "ကမာရွတ် Kamayut" },
  { township: "ကျောက်တံတား", township_mm: "ကျောက်တံတား", city: "Yangon", region_state: "Yangon Region", label: "Kyauktada", search_text: "ကျောက်တံတား Kyauktada" },
  { township: "ကြည့်မြင်တိုင်", township_mm: "ကြည့်မြင်တိုင်", city: "Yangon", region_state: "Yangon Region", label: "Kyimyindaing", search_text: "ကြည့်မြင်တိုင် Kyimyindaing" },
  { township: "လမ်းမတော်", township_mm: "လမ်းမတော်", city: "Yangon", region_state: "Yangon Region", label: "Lanmadaw", search_text: "လမ်းမတော် Lanmadaw" },
  { township: "လသာ", township_mm: "လသာ", city: "Yangon", region_state: "Yangon Region", label: "Latha", search_text: "လသာ Latha" },
  { township: "မရမ်းကုန်း", township_mm: "မရမ်းကုန်း", city: "Yangon", region_state: "Yangon Region", label: "Mayangon", search_text: "မရမ်းကုန်း Mayangon" },
  { township: "မင်္ဂလာဒုံ", township_mm: "မင်္ဂလာဒုံ", city: "Yangon", region_state: "Yangon Region", label: "Mingaladon", search_text: "မင်္ဂလာဒုံ Mingaladon" },
  { township: "မင်္ဂလာတောင်ညွန့်", township_mm: "မင်္ဂလာတောင်ညွန့်", city: "Yangon", region_state: "Yangon Region", label: "Mingala Taung Nyunt", search_text: "မင်္ဂလာတောင်ညွန့် တောင် Mingala Taung Nyunt" },
  { township: "မြောက်ဥက္ကလာပ", township_mm: "မြောက်ဥက္ကလာပ", city: "Yangon", region_state: "Yangon Region", label: "North Okkalapa", search_text: "မြောက်ဥက္ကလာပ ဥက္ကလာ North Okkalapa" },
  { township: "တောင်ဥက္ကလာပ", township_mm: "တောင်ဥက္ကလာပ", city: "Yangon", region_state: "Yangon Region", label: "South Okkalapa", search_text: "တောင်ဥက္ကလာပ တောင် ဥက္ကလာ South Okkalapa" },
  { township: "ပန်းဘဲတန်း", township_mm: "ပန်းဘဲတန်း", city: "Yangon", region_state: "Yangon Region", label: "Pabedan", search_text: "ပန်းဘဲတန်း Pabedan" },
  { township: "ပုဇွန်တောင်", township_mm: "ပုဇွန်တောင်", city: "Yangon", region_state: "Yangon Region", label: "Pazundaung", search_text: "ပုဇွန်တောင် တောင် Pazundaung" },
  { township: "စမ်းချောင်း", township_mm: "စမ်းချောင်း", city: "Yangon", region_state: "Yangon Region", label: "Sanchaung", search_text: "စမ်းချောင်း Sanchaung" },
  { township: "ဆိပ်ကမ်း", township_mm: "ဆိပ်ကမ်း", city: "Yangon", region_state: "Yangon Region", label: "Seikkan", search_text: "ဆိပ်ကမ်း Seikkan" },
  { township: "ရွှေပြည်သာ", township_mm: "ရွှေပြည်သာ", city: "Yangon", region_state: "Yangon Region", label: "Shwe Pyi Thar", search_text: "ရွှေပြည်သာ Shwepyitha Shwe Pyi Thar" },
  { township: "တာမွေ", township_mm: "တာမွေ", city: "Yangon", region_state: "Yangon Region", label: "Tamwe", search_text: "တာမွေ Tamwe" },
  { township: "သာကေတ", township_mm: "သာကေတ", city: "Yangon", region_state: "Yangon Region", label: "Thaketa", search_text: "သာကေတ Thaketa" },
  { township: "သင်္ဃန်းကျွန်း", township_mm: "သင်္ဃန်းကျွန်း", city: "Yangon", region_state: "Yangon Region", label: "Thingangyun", search_text: "သင်္ဃန်းကျွန်း Thingangyun" },
  { township: "ရန်ကင်း", township_mm: "ရန်ကင်း", city: "Yangon", region_state: "Yangon Region", label: "Yankin", search_text: "ရန်ကင်း Yankin" },
  { township: "Drop-off Gate", township_mm: "Drop-off Gate", city: "Yangon", region_state: "Yangon Region", label: "Highway / Gate Drop-off", search_text: "Drop-off Gate gate highway highway gate ဂိတ်" },
];

function normalizeTownship(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u200b\u200c\u200d\s\-_()၊,.]+/g, "");
}

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
};

type ParcelProofRow = {
  id?: string | number | null;
  pickup_id: string;
  parcel_sequence: number;
  delivery_way_id: string;
  parcel_weight_kg?: number | null;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  status?: string | null;
  verified_at?: string | null;
  photo_taken_at?: string | null;
  qr_payload?: string | null;
  merchant_code?: string | null;
  merchant_name?: string | null;
  pickup_date?: string | null;
  township?: string | null;
  city?: string | null;
  recipient_name?: string | null;
  contact_no_1?: string | null;
  contact_no_2?: string | null;
  recipient_address?: string | null;
  customer_tier?: string | null;
  item_price?: number | null;
  weight?: number | null;
  surcharge?: number | null;
  delivery_fee?: number | null;
  cod_amount?: number | null;
  actual_collect?: number | null;
  destination?: string | null;
  pickup_by?: string | null;
  data_entry_remark?: string | null;
};

type DataEntryRow = {
  id: number;
  status: string;
  date: string;
  way_id: string;
  merchant: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_phone_2: string;
  town: string;
  tier: string;
  address: string;
  item_price: number;
  weight: number;
  base_fee: number;
  surcharge: number;
  deli_fee: number;
  cod: number;
  actual_collect: number;
  destination: string;
  pickup_by: string;
  remarks: string;
  proof_photo_path?: string | null;
  photo_url?: string | null;
  saved?: boolean;
};

const REGISTER_NOW_TEMPLATE_HEADERS = [
  'Recipient Name',
  'Contact No. (1)',
  'Contact No. (2)',
  'Township',
  'Recipient Address',
  'Item Price',
  'Weight',
  'Remark / Special Instruction',
];

function toDateInput(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function proofStatus(row: ParcelProofRow) {
  if (row.proof_photo_path && Number(row.parcel_weight_kg || 0) > 0) return 'RIDER_VERIFIED';
  if (row.proof_photo_path) return 'PHOTO_ONLY';
  if (Number(row.parcel_weight_kg || 0) > 0) return 'WEIGHT_ONLY';
  return 'MISSING_PROOF';
}

export default function DataEntryPage() {
  const { t } = useLanguage();
  const sb = supabase as any;

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickupQueue, setPickupQueue] = useState<PickupQueueRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const selectedPickupIdRef = useRef('');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const tableMinWidth = 1900;

  const [parcelProofs, setParcelProofs] = useState<ParcelProofRow[]>([]);
  const [rows, setRows] = useState<DataEntryRow[]>([]);
  const [message, setMessage] = useState<string>('');
  const [townshipOptions, setTownshipOptions] = useState<TownshipOption[]>(
    [
      ...MYANMAR_TOWNSHIP_OPTIONS,
      ...FALLBACK_TOWNSHIPS.map((township) => ({ township, city: "Yangon", region_state: "Yangon Region" })),
    ]
  );
  const [activeTownshipRow, setActiveTownshipRow] = useState<number | null>(null);

  function selectPickup(pickupId: string) {
    selectedPickupIdRef.current = pickupId;
    setSelectedPickupId(pickupId);
  }

  const selectedPickup = useMemo(
    () => pickupQueue.find((p) => p.pickup_id === selectedPickupId) || null,
    [pickupQueue, selectedPickupId]
  );

  const townshipDisplayOptions = useMemo(() => {
    const seen = new Set<string>();
    return townshipOptions.filter((opt) => {
      const key = normalizeTownship(opt.township);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [townshipOptions]);

  function findTownshipOption(input?: string | null) {
    const key = normalizeTownship(input);
    if (!key) return null;

    return townshipDisplayOptions.find((opt) => {
      const townshipKey = normalizeTownship(opt.township);
      const mmKey = normalizeTownship(opt.township_mm);
      const labelKey = normalizeTownship(opt.label);
      const searchKey = normalizeTownship(opt.search_text);
      return townshipKey === key || mmKey === key || labelKey === key || searchKey.includes(key) || townshipKey.includes(key) || mmKey.includes(key) || labelKey.includes(key);
    }) || null;
  }

  function findExactTownshipOption(input?: string | null) {
    const key = normalizeTownship(input);
    if (!key) return null;

    return townshipDisplayOptions.find((opt) => {
      const townshipKey = normalizeTownship(opt.township);
      const mmKey = normalizeTownship(opt.township_mm);
      const labelKey = normalizeTownship(opt.label);
      return townshipKey === key || mmKey === key || labelKey === key;
    }) || null;
  }

  function townshipSearchText(option: TownshipOption) {
    return normalizeTownship([
      option.township,
      option.township_mm,
      option.label,
      option.city,
      option.region_state,
      option.search_text,
    ].filter(Boolean).join(" "));
  }

  function getTownshipSuggestions(input?: string | null) {
    const key = normalizeTownship(input);
    const source = townshipDisplayOptions;
    if (!key) return source.slice(0, 8);

    return source
      .map((opt) => {
        const text = townshipSearchText(opt);
        const townshipKey = normalizeTownship(opt.township);
        const mmKey = normalizeTownship(opt.township_mm);
        const labelKey = normalizeTownship(opt.label);
        const score =
          townshipKey === key || mmKey === key || labelKey === key ? 0 :
          townshipKey.startsWith(key) || mmKey.startsWith(key) || labelKey.startsWith(key) ? 1 :
          text.includes(key) ? 2 : 99;
        return { opt, score };
      })
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || String(a.opt.township).localeCompare(String(b.opt.township)))
      .slice(0, 8)
      .map((item) => item.opt);
  }

  function formatTownshipOption(option: TownshipOption) {
    const alt = option.township_mm && option.township_mm !== option.township
      ? option.township_mm
      : option.label;
    return alt ? `${option.township} · ${alt}` : option.township;
  }

  const money = (value: any, fallback = 0) => {
    const n = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

  function calculateLocalAmounts(row: DataEntryRow, option?: TownshipOption | null): DataEntryRow {
    const townshipOption = option ?? findTownshipOption(row.town);
    const town = townshipOption?.township || row.town || '';
    const destination = townshipOption?.city || row.destination || selectedPickup?.city || 'Yangon';
    const branchCode = String(townshipOption?.branch_code || '').toUpperCase();
    const regionState = String(townshipOption?.region_state || '').toLowerCase();

    const tier = String(row.tier || 'Standard');
    const normalizedTier = tier.trim().toLowerCase();
    const itemPrice = money(row.item_price, 0);
    const weight = Math.max(0, money(row.weight, 0));

    // Current go-live tariff rule:
    // Yangon/YGN base = 4,000 MMK. Mandalay/MDY and Naypyitaw/NPT base = 6,000 MMK.
    // Standard includes 3 kg. Royal includes 5 kg. Extra kg surcharge = 500 MMK per rounded-up kg.
    const isUpperMyanmar =
      branchCode === 'MDY' ||
      branchCode === 'NPT' ||
      /mandalay/.test(regionState) ||
      /naypyitaw|nay pyi taw/.test(`${regionState} ${destination}`.toLowerCase());

    const baseFee = isUpperMyanmar ? 6000 : 4000;
    const includedKg = normalizedTier === 'royal' ? 5 : 3;
    const chargeableExtraKg = Math.max(0, Math.ceil(weight) - includedKg);
    const surcharge = chargeableExtraKg * 500;
    const deliveryFee = baseFee + surcharge;
    const cod = itemPrice;
    const actualCollect = itemPrice + deliveryFee;

    return {
      ...row,
      town,
      destination,
      base_fee: roundMoney(baseFee),
      surcharge: roundMoney(surcharge),
      deli_fee: roundMoney(deliveryFee),
      cod: roundMoney(cod),
      actual_collect: roundMoney(actualCollect),
    };
  }

  async function calculateAmounts(row: DataEntryRow): Promise<DataEntryRow> {
    const townshipOption = findTownshipOption(row.town);
    const local = calculateLocalAmounts(row, townshipOption);

    try {
      let response = await sb.rpc('be_calculate_tariff', {
        p_township: local.town,
        p_customer_tier: local.tier || 'Standard',
        p_weight_kg: Number(local.weight || 0),
        p_item_price: Number(local.item_price || 0),
      });

      // Backward-compatible fallback for older SQL deployments.
      if (response.error) {
        response = await sb.rpc('be_calculate_tariff', {
          p_township: local.town,
          p_tier: local.tier || 'Standard',
          p_weight: Number(local.weight || 0),
          p_item_price: Number(local.item_price || 0),
        });
      }

      const { data, error } = response;

      if (!error && data) {
        return {
          ...local,
          base_fee: roundMoney(data.base_fee ?? local.base_fee),
          surcharge: roundMoney(data.surcharge ?? local.surcharge),
          deli_fee: roundMoney(data.delivery_fee ?? local.deli_fee),
          cod: roundMoney(data.cod_amount ?? data.cod ?? local.cod),
          actual_collect: roundMoney(data.actual_collect ?? local.actual_collect),
          destination: data.city || data.destination || local.destination,
        };
      }
    } catch (err) {
      // Local calculation remains the fallback so staff can continue data entry even if RPC is unavailable.
      console.warn('be_calculate_tariff unavailable; using local tariff calculation.', err);
    }

    return local;
  }

  function syncTemplateScroll(source: "top" | "table" | "bottom") {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    const bottom = bottomScrollRef.current;
    const sourceEl = source === "top" ? top : source === "bottom" ? bottom : table;
    if (!sourceEl) return;

    const nextLeft = sourceEl.scrollLeft;

    if (top && top.scrollLeft !== nextLeft) {
      top.scrollLeft = nextLeft;
    }

    if (table && table.scrollLeft !== nextLeft) {
      table.scrollLeft = nextLeft;
    }

    if (bottom && bottom.scrollLeft !== nextLeft) {
      bottom.scrollLeft = nextLeft;
    }
  }

  async function loadTownshipOptions() {
    try {
      const { data, error } = await sb
        .from('be_v_township_search_options')
        .select('township,township_mm,city,region_state,label,search_text')
        .order('township', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setTownshipOptions([...(data as TownshipOption[]), ...MYANMAR_TOWNSHIP_OPTIONS]);
        return;
      }
    } catch (error) {
      console.warn('be_v_township_search_options unavailable, using fallback township list', error);
    }

    try {
      const { data } = await sb
        .from('v_address_township_options')
        .select('township,city,region_state')
        .order('township', { ascending: true });

      if (data && data.length > 0) {
        setTownshipOptions([...(data as TownshipOption[]), ...MYANMAR_TOWNSHIP_OPTIONS]);
      }
    } catch (error) {
      console.warn('v_address_township_options unavailable, using fallback township list', error);
    }
  }

  async function signPhotoUrl(path?: string | null) {
    if (!path) return null;

    const normalized = String(path).replace(/^pickup-parcel-proofs\//, '');

    try {
      const { data, error } = await supabase.storage
        .from('pickup-parcel-proofs')
        .createSignedUrl(normalized, 60 * 60);

      if (!error && data?.signedUrl) return data.signedUrl;
    } catch (error) {
      console.warn('Signed URL failed, trying public URL', error);
    }

    try {
      const { data } = supabase.storage
        .from('pickup-parcel-proofs')
        .getPublicUrl(normalized);

      return data?.publicUrl || null;
    } catch {
      return null;
    }
  }

  async function loadPickupQueue() {
    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await sb
        .from('be_v_data_entry_pickup_verification_queue')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const queue = (data || []) as PickupQueueRow[];
      setPickupQueue(queue);

      const currentPickupId = selectedPickupIdRef.current;
      const currentStillExists = currentPickupId
        ? queue.some((item) => item.pickup_id === currentPickupId)
        : false;

      if (currentStillExists) {
        return;
      }

      if (!currentPickupId && queue.length > 0) {
        selectPickup(queue[0].pickup_id);
        return;
      }

      if (currentPickupId && !currentStillExists) {
        selectPickup(queue[0]?.pickup_id || '');
      }
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || 'Failed to load Data Entry pickup queue.');
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
      await sb.rpc('be_seed_pickup_parcel_verifications', {
        p_pickup_id: pickupId,
      });

      let { data, error } = await sb
        .from('be_v_data_entry_parcel_template')
        .select('*')
        .eq('pickup_id', pickupId)
        .order('parcel_sequence', { ascending: true });

      if (error) {
        const fallback = await sb
          .from('be_v_data_entry_parcel_proofs')
          .select('*')
          .eq('pickup_id', pickupId)
          .order('parcel_sequence', { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      const proofs = await Promise.all(
        ((data || []) as ParcelProofRow[]).map(async (proof) => ({
          ...proof,
          photo_url: await signPhotoUrl(proof.proof_photo_path),
        }))
      );

      setParcelProofs(proofs);
      setRows(
        proofs.map((proof, index) => calculateLocalAmounts({
          id: proof.parcel_sequence || index + 1,
          status: proofStatus(proof),
          date: toDateInput(proof.pickup_date),
          way_id: proof.delivery_way_id || '',
          merchant: `${proof.merchant_code || ''}${proof.merchant_name ? ` - ${proof.merchant_name}` : ''}`.trim(),
          recipient_name: proof.recipient_name || '',
          recipient_phone: proof.contact_no_1 || '',
          recipient_phone_2: proof.contact_no_2 || '',
          town: proof.township || selectedPickup?.township || 'North Dagon',
          tier: proof.customer_tier || 'Standard',
          address: proof.recipient_address || '',
          item_price: Number(proof.item_price || 0),
          weight: Number(proof.parcel_weight_kg || proof.weight || 0),
          base_fee: Number(proof.delivery_fee || 0) > 0 ? Number(proof.delivery_fee || 0) - Number(proof.surcharge || 0) : 0,
          surcharge: Number(proof.surcharge || 0),
          deli_fee: Number(proof.delivery_fee || 0),
          cod: Number(proof.cod_amount || 0),
          actual_collect: Number(proof.actual_collect || 0),
          destination: proof.destination || proof.city || selectedPickup?.city || 'Yangon',
          pickup_by: proof.pickup_by || 'RIDER',
          remarks: proof.data_entry_remark || (proof.proof_photo_path ? 'Rider photo verified' : 'Missing rider photo'),
          proof_photo_path: proof.proof_photo_path,
          photo_url: proof.photo_url,
          saved: Boolean(proof.recipient_name || proof.contact_no_1 || proof.recipient_address || proof.data_entry_remark),
        }))
      );
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || 'Failed to load rider parcel photos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTownshipOptions();
    loadPickupQueue();

    const channel = supabase
      .channel('data-entry-rider-proof-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'be_pickup_parcel_verifications' },
        () => {
          const currentPickupId = selectedPickupIdRef.current;
          loadPickupQueue();
          if (currentPickupId) loadParcelProofs(currentPickupId);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'be_portal_pickup_requests' },
        () => loadPickupQueue()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    selectedPickupIdRef.current = selectedPickupId;

    if (selectedPickupId) {
      loadParcelProofs(selectedPickupId);
    } else {
      setParcelProofs([]);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPickupId]);

  const handleGenerate = () => {
    if (!selectedPickupId) {
      setMessage('Please select a pickup first.');
      return;
    }
    loadParcelProofs(selectedPickupId);
  };

  const handleRegisterNow = async () => {
    if (!selectedPickupId) {
      setMessage('Please select a pickup first.');
      return;
    }
    
    // We do NOT load parcel proofs automatically here so the user can use bulk Excel upload
    // without syncing Rider Photos if they prefer to bypass it.
    setIsFullScreen(true);

    setMessage('REGISTER NOW mode enabled. You can manually Add Extra Row or Upload Excel for Bulk Entry.');
  };

  const downloadRegisterNowTemplate = () => {
    const sampleRows = Array.from({ length: Math.max(rows.length, selectedPickup?.expected_parcels || 30) }, () => ({
      'Recipient Name': '',
      'Contact No. (1)': '',
      'Contact No. (2)': '',
      Township: selectedPickup?.township || '',
      'Recipient Address': '',
      'Item Price': '',
      Weight: '',
      'Remark / Special Instruction': '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
      header: REGISTER_NOW_TEMPLATE_HEADERS,
      skipHeader: false,
    });

    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 54 },
      { wch: 12 },
      { wch: 8 },
      { wch: 34 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Register Now');
    XLSX.writeFile(workbook, 'Britium_DataEntry_Register_Now_Template.xlsx');
  };

  const normalizeHeader = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\-_().:/]+/g, '');

  const firstNonEmpty = (...values: any[]) => {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return '';
  };

  const toNumber = (value: any, fallback = 0) => {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setLoading(true);
      setMessage('');

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('No worksheet found in uploaded file.');
      }

      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      const headerRowIndex = matrix.findIndex((row) => {
        const joined = row.map(normalizeHeader).join('|');
        return (
          joined.includes('deliveryway') ||
          joined.includes('wayid') ||
          joined.includes('recipientname') ||
          joined.includes('contactno') ||
          joined.includes('township')
        );
      });

      if (headerRowIndex < 0) {
        throw new Error('Template header row was not found. Please use the Britium Data Entry template.');
      }

      const headers = matrix[headerRowIndex].map(normalizeHeader);
      const getCell = (row: any[], aliases: string[]) => {
        for (const alias of aliases.map(normalizeHeader)) {
          const idx = headers.findIndex((h) => h === alias || h.includes(alias) || alias.includes(h));
          if (idx >= 0) return row[idx];
        }
        return '';
      };

      const uploadedRows: DataEntryRow[] = matrix
        .slice(headerRowIndex + 1)
        .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
        .map((row, index) => {
          const wayId = String(firstNonEmpty(
            getCell(row, ['deliverywayid', 'deliveryway id', 'wayid', 'way id']),
            rows[index]?.way_id,
            `UPLOAD-${index + 1}`
          )).trim();

          const sequenceFromWayId = Number((wayId.match(/-(\d+)$/)?.[1] || '').replace(/^0+/, ''));
          const sequence = toNumber(firstNonEmpty(
            getCell(row, ['#', 'no', 'parcelno', 'parcelsequence', 'sequence']),
            sequenceFromWayId,
            rows[index]?.id,
            index + 1
          ), index + 1);

          const dateValue = firstNonEmpty(
            getCell(row, ['pickupdate', 'pickup date', 'date']),
            rows[index]?.date,
            selectedPickup?.pickup_date
          );

          const townValue = String(firstNonEmpty(
            getCell(row, ['township', 'townshipenmm', 'township en/mm', 'town']),
            rows[index]?.town,
            selectedPickup?.township,
            ''
          )).trim();

          const townshipOption = findTownshipOption(townValue);
          const canonicalTown = townshipOption?.township || townValue;

          const baseFee = toNumber(firstNonEmpty(
            getCell(row, ['basefee', 'base fee']),
            rows[index]?.base_fee
          ), rows[index]?.base_fee || 0);

          const surcharge = toNumber(firstNonEmpty(
            getCell(row, ['surcharge']),
            rows[index]?.surcharge
          ), rows[index]?.surcharge || 0);

          const deliveryFee = toNumber(firstNonEmpty(
            getCell(row, ['totaldelifee', 'deliveryfee', 'delfee', 'total deli fee']),
            rows[index]?.deli_fee,
            baseFee + surcharge
          ), baseFee + surcharge);

          return calculateLocalAmounts({
            id: sequence || index + 1,
            status: String(firstNonEmpty(getCell(row, ['status']), rows[index]?.status, 'DATA_ENTRY_UPLOADED')),
            date: toDateInput(dateValue),
            way_id: wayId,
            merchant: String(firstNonEmpty(
              getCell(row, ['merchant']),
              rows[index]?.merchant,
              selectedPickup ? `${selectedPickup.merchant_code || ''} - ${selectedPickup.merchant_name || ''}` : ''
            )),
            recipient_name: String(firstNonEmpty(getCell(row, ['recipientname', 'recipient name']), rows[index]?.recipient_name)),
            recipient_phone: String(firstNonEmpty(getCell(row, ['contactno1', 'contact no 1', 'contactno', 'phone']), rows[index]?.recipient_phone)),
            recipient_phone_2: String(firstNonEmpty(getCell(row, ['contactno2', 'contact no 2', 'phone2']), rows[index]?.recipient_phone_2)),
            town: canonicalTown,
            tier: String(firstNonEmpty(getCell(row, ['customertier', 'customer tier', 'tier']), rows[index]?.tier, 'Standard')),
            address: String(firstNonEmpty(getCell(row, ['recipientaddress', 'recipient address', 'address']), rows[index]?.address)),
            item_price: toNumber(firstNonEmpty(getCell(row, ['itemprice', 'item price']), rows[index]?.item_price), rows[index]?.item_price || 0),
            weight: toNumber(firstNonEmpty(getCell(row, ['weight', 'weightkg', 'weight kg']), rows[index]?.weight), rows[index]?.weight || 0),
            base_fee: baseFee,
            surcharge,
            deli_fee: deliveryFee,
            // COD column is intentionally removed from the user-facing template.
            // System keeps cod_amount internally equal to Item Price for downstream finance/waybill sync.
            cod: toNumber(firstNonEmpty(getCell(row, ['itemprice', 'item price']), rows[index]?.item_price), rows[index]?.item_price || 0),
            actual_collect: toNumber(firstNonEmpty(getCell(row, ['actualcollect', 'actual collect']), rows[index]?.actual_collect), rows[index]?.actual_collect || 0),
            destination: String(firstNonEmpty(getCell(row, ['destination', 'city']), townshipOption?.city, rows[index]?.destination, selectedPickup?.city, 'Yangon')),
            pickup_by: String(firstNonEmpty(getCell(row, ['pickupby', 'pickup by']), rows[index]?.pickup_by, 'DATA_ENTRY')),
            remarks: String(firstNonEmpty(getCell(row, ['remark', 'remarks', 'specialinstruction', 'special instruction']), rows[index]?.remarks)),
            proof_photo_path: rows[index]?.proof_photo_path || null,
            photo_url: rows[index]?.photo_url || null,
            saved: false,
          }, townshipOption);
        });

      if (uploadedRows.length === 0) {
        throw new Error('No parcel rows found in uploaded file.');
      }

      setRows((currentRows) => {
        const nextRows = [...currentRows];

        uploadedRows.forEach((uploadedRow, index) => {
          const byWayId = nextRows.findIndex((r) => r.way_id === uploadedRow.way_id);
          const bySequence = nextRows.findIndex((r) => r.id === uploadedRow.id);
          const targetIndex = byWayId >= 0 ? byWayId : bySequence >= 0 ? bySequence : index;

          const existing = nextRows[targetIndex];
          nextRows[targetIndex] = {
            ...(existing || uploadedRow),
            ...uploadedRow,
            proof_photo_path: existing?.proof_photo_path || uploadedRow.proof_photo_path,
            photo_url: existing?.photo_url || uploadedRow.photo_url,
            saved: false,
          };
        });

        return nextRows.filter(Boolean).sort((a, b) => a.id - b.id);
      });

      setMessage(`Uploaded ${uploadedRows.length} parcel row(s). Review and click Save for each parcel.`);
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || 'Failed to upload template.');
    } finally {
      setLoading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleAddRow = () => {
    const newId = rows.length + 1;
    setRows([...rows, calculateLocalAmounts({
      id: newId,
      status: 'MANUAL_EXTRA',
      date: new Date().toISOString().slice(0, 10),
      way_id: `MANUAL-${newId}`,
      merchant: selectedPickup ? `${selectedPickup.merchant_code || ''} - ${selectedPickup.merchant_name || ''}` : '',
      recipient_name: '',
      recipient_phone: '',
      recipient_phone_2: '',
      town: selectedPickup?.township || 'North Dagon',
      tier: 'Standard',
      address: '',
      item_price: 0,
      weight: 1,
      base_fee: 0,
      surcharge: 0,
      deli_fee: 0,
      cod: 0,
      actual_collect: 0,
      destination: selectedPickup?.city || 'Yangon',
      pickup_by: 'DATA_ENTRY',
      remarks: '',
      saved: false,
    })]);
  };

  const handleTownshipInput = (index: number, value: string) => {
    setActiveTownshipRow(index);
    setRows((currentRows) => {
      const nextRows = [...currentRows];
      if (!nextRows[index]) return currentRows;
      nextRows[index] = {
        ...nextRows[index],
        town: value,
        saved: false,
      };
      return nextRows;
    });
  };

  const handleTownshipSelect = async (index: number, option: TownshipOption) => {
    setActiveTownshipRow(null);
    await handleUpdate(index, 'town', option.township);
  };

  const handleTownshipBlur = (index: number) => {
    window.setTimeout(() => {
      const value = rows[index]?.town;
      const exact = findExactTownshipOption(value);
      if (exact) {
        handleUpdate(index, 'town', exact.township);
      }
      setActiveTownshipRow(null);
    }, 160);
  };

  const handleSaveRow = async (index: number) => {
    if (!selectedPickupId) {
      setMessage('Please select a pickup first.');
      return;
    }

    const row = rows[index];
    const option = findExactTownshipOption(row.town);
    if (!option) {
      setMessage(`Please select a valid township from the dropdown for ${row.way_id}.`);
      setActiveTownshipRow(index);
      return;
    }
    const normalizedTownship = option.township;

    try {
      setLoading(true);
      const { error } = await sb.rpc('be_save_data_entry_parcel_detail', {
        p_pickup_id: selectedPickupId,
        p_parcel_sequence: row.id,
        p_delivery_way_id: row.way_id,
        p_recipient_name: row.recipient_name || null,
        p_contact_no_1: row.recipient_phone || null,
        p_contact_no_2: row.recipient_phone_2 || null,
        p_township: normalizedTownship || null,
        p_recipient_address: row.address || null,
        p_customer_tier: row.tier || 'Standard',
        p_item_price: Number(row.item_price || 0),
        p_weight_kg: Number(row.weight || 0),
        p_surcharge: Number(row.surcharge || 0),
        p_delivery_fee: Number(row.deli_fee || 0),
        p_cod_amount: Number(row.cod || 0),
        p_actual_collect: Number(row.actual_collect || 0),
        p_destination: row.destination || option?.city || null,
        p_pickup_by: row.pickup_by || 'DATA_ENTRY',
        p_remark: row.remarks || null,
        p_actor_email: null,
      });

      if (error) throw error;

      const newRows = [...rows];
      newRows[index] = {
        ...newRows[index],
        town: normalizedTownship,
        destination: option?.city || newRows[index].destination,
        saved: true,
      };
      setRows(newRows);
      setMessage(`Saved ${row.way_id}`);
    } catch (error: any) {
      console.error(error);
      setMessage(error.message || `Failed to save ${row.way_id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (index: number, field: string, value: any) => {
    const currentRow = rows[index];

    if (!currentRow) return;

    let updatedRow: DataEntryRow = {
      ...currentRow,
      [field]: value,
      saved: false,
    } as DataEntryRow;

    if (field === 'town') {
      const option = findExactTownshipOption(value);
      if (option) {
        updatedRow = {
          ...updatedRow,
          town: option.township,
          destination: option.city || updatedRow.destination || 'Yangon',
        };
      }
    }

    if (field === 'destination') {
      updatedRow.destination = String(value || '');
    }

    const shouldRecalculate = [
      'weight',
      'tier',
      'town',
      'item_price',
      'destination',
    ].includes(field);

    if (shouldRecalculate) {
      updatedRow = await calculateAmounts(updatedRow);
    }

    setRows((currentRows) => {
      const nextRows = [...currentRows];
      nextRows[index] = updatedRow;
      return nextRows;
    });
  };

  const handleSaveAndGenerate = async () => {
    if (!selectedPickupId) {
      setMessage('Please select a pickup first.');
      return;
    }

    if (!rows.length) {
      setMessage('No parcel rows are available for this pickup. Please add rows or upload an Excel file.');
      return;
    }

    // Photo check requirement removed to allow generating waybills without synchronizing rider uploaded pics.
    // If photos are missing, we just proceed.
    
    const missingRequired = rows.filter((r) =>
      !String(r.recipient_name || '').trim() ||
      !String(r.recipient_phone || '').trim() ||
      !findExactTownshipOption(r.town) ||
      !String(r.address || '').trim()
    );

    if (missingRequired.length > 0) {
      setMessage(`Cannot generate waybill: ${missingRequired.length} parcel row(s) still need recipient name, phone, valid dropdown township, and address.`);
      return;
    }

    try {
      setLoading(true);
      setMessage('Saving all parcel rows and creating waybill...');

      const { data: userData } = await supabase.auth.getUser();
      const actorEmail = userData?.user?.email || null;

      const payloadRows = rows.map((row) => ({
        parcel_sequence: row.id,
        delivery_way_id: row.way_id,
        recipient_name: row.recipient_name,
        contact_no_1: row.recipient_phone,
        contact_no_2: row.recipient_phone_2,
        township: row.town,
        recipient_address: row.address,
        customer_tier: row.tier || 'Standard',
        item_price: Number(row.item_price || 0),
        weight_kg: Number(row.weight || 0),
        surcharge: Number(row.surcharge || 0),
        delivery_fee: Number(row.deli_fee || 0),
        cod_amount: Number(row.cod || 0),
        actual_collect: Number(row.actual_collect || 0),
        destination: row.destination || selectedPickup?.city || 'Yangon',
        pickup_by: row.pickup_by || 'DATA_ENTRY',
        remark: row.remarks || '',
        proof_photo_path: row.proof_photo_path || null,
      }));

      // FIXED5:
      // Save the browser-visible rows directly first, then call the backend waybill RPC.
      // This removes the previous failure mode where the UI showed rows but
      // be_data_entry_parcel_details still stayed at 0.
      const nowIso = new Date().toISOString();
      const directRows = payloadRows.map((row) => ({
        pickup_id: selectedPickupId,
        parcel_sequence: row.parcel_sequence,
        delivery_way_id: row.delivery_way_id,
        recipient_name: row.recipient_name || null,
        contact_no_1: row.contact_no_1 || null,
        contact_no_2: row.contact_no_2 || null,
        township: row.township || null,
        recipient_address: row.recipient_address || null,
        customer_tier: row.customer_tier || 'Standard',
        item_price: Number(row.item_price || 0),
        weight_kg: Number(row.weight_kg || 0),
        surcharge: Number(row.surcharge || 0),
        delivery_fee: Number(row.delivery_fee || 0),
        cod_amount: Number(row.cod_amount || 0),
        actual_collect: Number(row.actual_collect || 0),
        destination: row.destination || null,
        pickup_by: row.pickup_by || 'DATA_ENTRY',
        remark: row.remark || null,
        saved_by_email: actorEmail,
        saved_at: nowIso,
        updated_at: nowIso,
      }));

      const directSave = await sb
        .from('be_data_entry_parcel_details')
        .upsert(directRows, { onConflict: 'pickup_id,parcel_sequence' });

      if (directSave.error) {
        console.warn('Direct Data Entry row save failed, trying RPC fallback.', directSave.error);
        setMessage(`Direct row save failed; trying backend RPC fallback: ${directSave.error.message}`);
      } else {
        const verifySave = await sb
          .from('be_data_entry_parcel_details')
          .select('pickup_id', { count: 'exact', head: true })
          .eq('pickup_id', selectedPickupId);

        if (verifySave.error) {
          console.warn('Saved row verification failed.', verifySave.error);
        } else if ((verifySave.count || 0) <= 0) {
          throw new Error('Data Entry rows are still 0 after direct save. Check RLS/policies on be_data_entry_parcel_details.');
        } else {
          setMessage(`Saved ${verifySave.count} Data Entry rows. Creating waybill...`);
        }
      }

      // Backend call:
      // 1) upsert visible Data Entry rows into be_data_entry_parcel_details
      // 2) create/sync pickup-level waybill
      // 3) push parcel rows to Waybill Studio and Warehouse queue
      let { data, error } = await sb.rpc('be_data_entry_create_waybill_from_rows', {
        p_pickup_id: selectedPickupId,
        p_rows: payloadRows,
        p_actor_email: actorEmail,
      });

      // Compatibility fallback for environments where the fixed3/fixed5 RPC has not reloaded
      // or when the RPC save path fails but the direct upsert above already saved the rows.
      if (error) {
        console.warn('be_data_entry_create_waybill_from_rows failed, trying legacy waybill RPC.', error);

        const firstRow = rows[0];
        const totalCod = rows.reduce((sum, row) => sum + Number(row.cod || row.item_price || 0), 0);
        const legacy = await sb.rpc('be_data_entry_create_waybill', {
          p_pickup_id: selectedPickupId,
          p_waybill_no: null,
          p_receiver_name: firstRow?.recipient_name || 'Receiver',
          p_receiver_phone: firstRow?.recipient_phone || '',
          p_receiver_address: firstRow?.address || '',
          p_destination_city: firstRow?.destination || selectedPickup?.city || 'Yangon',
          p_destination_township: firstRow?.town || selectedPickup?.township || '',
          p_cod_amount: totalCod,
          p_actor_email: actorEmail,
        });

        data = legacy.data;
        error = legacy.error;
      }

      if (error) throw error;

      const waybillNo = data?.waybill_no || data?.waybillNo || 'created';
      const parcelCount = data?.parcel_count || rows.length;

      setRows((currentRows) => currentRows.map((row) => ({ ...row, saved: true, status: 'WAYBILL_CREATED' })));
      setMessage(`Waybill ${waybillNo} created successfully. ${parcelCount} parcel row(s) synced to Waybill Studio and Warehouse queue.`);

      await loadPickupQueue();
    } catch (error: any) {
      console.error(error);
      setMessage(error?.message || 'Waybill creation failed. Please check the backend patch.');
    } finally {
      setLoading(false);
    }
  };

  const canGenerateWaybill = Boolean(selectedPickupId) && rows.length > 0;

  return (
    <div className="space-y-6">
      {/* ALWAYS RENDER FILE INPUT FOR BULK UPLOAD */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleTemplateUpload}
      />

      {!isFullScreen && (
        <div className="border-b border-[#1a3a5c] pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">
              {t('DATA ENTRY PARCEL REGISTRATION', 'ပါဆယ်စာရင်း သွင်းရန်')}
            </h1>
            <p className="text-[#4d7a9b] text-[13px]">
              {t(
                'Verify rider parcel photos and register waybills dynamically. Prices auto-calculate.',
                'ရိုင်ဒါ၏ ပစ္စည်းဓာတ်ပုံများကို စစ်ဆေး၍ Waybill များသွင်းပါ။ ငွေပမာဏ အလိုအလျောက်တွက်ပေးမည်။'
              )}
            </p>
          </div>

          <button
            onClick={() => {
              loadPickupQueue();
              if (selectedPickupId) loadParcelProofs(selectedPickupId);
            }}
            className="bg-[#1a3a5c] text-[#eef8ff] px-4 py-2 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center gap-2 text-[12px] uppercase tracking-wider"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Proofs
          </button>
        </div>
      )}

      {message && !isFullScreen && (
        <div className="bg-[#061524] border border-[#f6b84b]/50 text-[#f6b84b] p-3 rounded-xl text-[13px] flex items-center gap-2">
          <AlertTriangle size={16} />
          {message}
        </div>
      )}

      {/* FILTERS & REPORTS */}
      {!isFullScreen && (
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-6 items-end">
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                <Filter size={12} className="inline mr-1" />
                {t('From Date', 'မှ (ရက်စွဲ)')}
              </label>
              <input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
            </div>
            <div>
              <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                <Filter size={12} className="inline mr-1" />
                {t('To Date', 'ထိ (ရက်စွဲ)')}
              </label>
              <input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" />
            </div>
          </div>
          <div className="w-full lg:w-auto flex gap-2 flex-wrap justify-end">
            <button className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex justify-center items-center gap-2 text-[12px] uppercase tracking-wider transition-colors cursor-pointer">
              <Download size={14} /> {t('Report', 'အစီရင်ခံစာ')}
            </button>
            <button onClick={downloadRegisterNowTemplate} className="bg-[#061524] text-[#4ea8de] px-6 py-3 rounded-xl border border-[#1a3a5c] hover:border-[#4ea8de] flex justify-center items-center gap-2 text-[12px] uppercase tracking-wider transition-colors cursor-pointer">
              <Download size={14} /> Register Template
            </button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isFullScreen ? 'lg:grid-cols-1' : 'lg:grid-cols-4'} gap-6 items-start`}>
        {/* RIDER PHOTOS */}
        {!isFullScreen && (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5 flex flex-col h-[600px] sticky top-6">
            <h3 className="text-[#eef8ff] text-[13px] uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-[#1a3a5c] pb-3">
              <Camera size={14} className="text-[#4ea8de]" />
              {t('Rider Photo Verification', 'Rider မှတ်တမ်းပုံများ')}
            </h3>

            <div className="mb-3 text-[11px] text-[#4d7a9b]">
              {selectedPickup ? (
                <>
                  <div className="text-[#eef8ff] font-semibold">{selectedPickup.pickup_id}</div>
                  <div>{selectedPickup.merchant_code} - {selectedPickup.merchant_name}</div>
                  <div>
                    Photos: <span className="text-[#f6b84b]">{parcelProofs.filter((p) => p.proof_photo_path).length}</span> / {parcelProofs.length}
                  </div>
                </>
              ) : (
                'Select pickup to view rider photos.'
              )}
            </div>

            <div className="flex-1 overflow-auto space-y-3 custom-scrollbar pr-2">
              {parcelProofs.length === 0 ? (
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl h-32 flex flex-col items-center justify-center text-[#4d7a9b] text-[12px]">
                  <ImageIcon size={24} className="mb-2" />
                  {t('No rider parcel photos loaded', 'ရိုင်ဒါပုံများ မရှိသေးပါ')}
                </div>
              ) : (
                parcelProofs.map((proof) => (
                  <div key={`${proof.pickup_id}-${proof.parcel_sequence}`} className="bg-[#061524] border border-[#1a3a5c] rounded-xl overflow-hidden">
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[#f6b84b] text-[12px] font-semibold">{proof.delivery_way_id}</div>
                        <div className="text-[#4d7a9b] text-[11px]">
                          #{String(proof.parcel_sequence).padStart(3, '0')} • {Number(proof.parcel_weight_kg || 0).toFixed(2)} KG
                        </div>
                      </div>
                      {proof.proof_photo_path ? (
                        <CheckCircle2 size={16} className="text-emerald-400" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-400" />
                      )}
                    </div>

                    {proof.photo_url ? (
                      <a href={proof.photo_url} target="_blank" rel="noreferrer" className="block group">
                        <img src={proof.photo_url} alt={proof.delivery_way_id} className="w-full h-32 object-cover border-t border-[#1a3a5c] group-hover:opacity-90" />
                        <div className="p-2 text-[11px] text-[#4ea8de] flex items-center gap-1">
                          <ExternalLink size={12} />
                          Open rider photo
                        </div>
                      </a>
                    ) : (
                      <div className="h-24 flex items-center justify-center text-[#4d7a9b] text-[11px] border-t border-[#1a3a5c]">
                        No rider photo
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* AUTO-CALCULATING GRID */}
        <div className={`${isFullScreen ? '' : 'lg:col-span-3'} bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col overflow-hidden`}>
          <div className="p-4 border-b border-[#1a3a5c] bg-[#061524] flex flex-col lg:flex-row gap-4 lg:items-end justify-between">
            <div className="flex-1 w-full flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full md:w-auto">
                <label className="block text-[#4ea8de] text-[11px] uppercase tracking-widest mb-2">
                  {t('1. Select Verified Pickup Request', '၁။ အတည်ပြုပြီးသော Pickup ရွေးပါ')}
                </label>
                <select
                  value={selectedPickupId}
                  onChange={(e) => selectPickup(e.target.value)}
                  className="w-full bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
                >
                  {pickupQueue.length === 0 ? (
                    <option value="">No rider verified pickups found</option>
                  ) : (
                    pickupQueue.map((pickup) => (
                      <option key={pickup.pickup_id} value={pickup.pickup_id}>
                        {pickup.pickup_id} ({pickup.merchant_code} - {pickup.merchant_name} - {pickup.verified_parcels || 0}/{pickup.expected_parcels || 0} Parcels)
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="w-full md:w-28 shrink-0">
                <label className="block text-[#4ea8de] text-[11px] uppercase tracking-widest mb-2">
                  {t('PARCELS', 'အရေအတွက်')}
                </label>
                <input
                  type="number"
                  value={rows.length || selectedPickup?.expected_parcels || 0}
                  readOnly
                  className="w-full bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none text-[13px] text-center"
                />
              </div>
            </div>

            {/* ACTION TOOLBAR - Visible even in Full Screen mode */}
            <div className="w-full lg:w-auto flex flex-wrap gap-2 items-center justify-start lg:justify-end shrink-0">
              <button onClick={handleGenerate} className="bg-[#1a3a5c] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#4ea8de] flex items-center justify-center gap-2 transition-colors cursor-pointer">
                <Layers size={14} /> {t('Load Proofs', 'ပုံများယူမည်')}
              </button>
              
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={loading}
                className="bg-[#10b981] text-[#061524] px-4 py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-[#059669] text-[12px] uppercase font-bold tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadCloud size={14} /> {t('Bulk Upload Excel', 'Excel တင်မည်')}
              </button>

              <button
                type="button"
                onClick={handleRegisterNow}
                disabled={loading || !selectedPickupId}
                className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase font-bold tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> {t('Blank Register', 'အသစ်စသွင်းမည်')}
              </button>
              
              <button
                type="button"
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="bg-[#eef8ff] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase font-bold tracking-wider hover:bg-white flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
              >
                {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} 
                {isFullScreen ? t("Exit Full Screen", "မျက်နှာပြင် အသေးပြောင်းမည်") : t("Full Screen", "မျက်နှာပြင် အပြည့်ကြည့်မည်")}
              </button>
            </div>
          </div>

          <datalist id="data-entry-township-options">
            {townshipDisplayOptions.map((option) => (
              <option
                key={`${option.township}-${option.township_mm || ''}`}
                value={option.township}
                label={option.township_mm ? `${option.township_mm} / ${option.city || ''}` : option.city || ''}
              />
            ))}
          </datalist>

          {/* HORIZONTAL RIDER PHOTO STRIP */}
          {!isFullScreen && (
            <div className="border-b border-[#1a3a5c] bg-[#071a2b] p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-[#eef8ff] text-[12px] uppercase tracking-widest flex items-center gap-2">
                    <Camera size={14} className="text-[#4ea8de]" />
                    {t('Rider Photo Verification', 'Rider မှတ်တမ်းပုံများ')}
                  </h3>
                  <div className="text-[11px] text-[#4d7a9b] mt-1 truncate">
                    {selectedPickup ? (
                      <>
                        <span className="text-[#eef8ff] font-semibold">{selectedPickup.pickup_id}</span>
                        <span className="mx-2">•</span>
                        <span>{selectedPickup.merchant_code} - {selectedPickup.merchant_name}</span>
                        <span className="mx-2">•</span>
                        Photos: <span className="text-[#f6b84b]">{parcelProofs.filter((p) => p.proof_photo_path).length}</span> / {parcelProofs.length}
                      </>
                    ) : (
                      'Select pickup to view rider photos.'
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-[#4d7a9b]">
                  Scroll horizontally to check proofs before registration.
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div className="flex gap-3 min-w-max">
                  {parcelProofs.length === 0 ? (
                    <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl h-28 w-64 flex flex-col items-center justify-center text-[#4d7a9b] text-[12px]">
                      <ImageIcon size={24} className="mb-2" />
                      {t('No rider parcel photos loaded', 'ရိုင်ဒါပုံများ မရှိသေးပါ')}
                    </div>
                  ) : (
                    parcelProofs.map((proof) => (
                      <div
                        key={`${proof.pickup_id}-${proof.parcel_sequence}`}
                        className="bg-[#061524] border border-[#1a3a5c] rounded-xl overflow-hidden w-52 shrink-0"
                      >
                        <div className="p-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[#f6b84b] text-[11px] font-semibold truncate">{proof.delivery_way_id}</div>
                            <div className="text-[#4d7a9b] text-[10px]">
                              #{String(proof.parcel_sequence).padStart(3, '0')} • {Number(proof.parcel_weight_kg || 0).toFixed(2)} KG
                            </div>
                          </div>
                          {proof.proof_photo_path ? (
                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                          )}
                        </div>

                        {proof.photo_url ? (
                          <a href={proof.photo_url} target="_blank" rel="noreferrer" className="block group">
                            <img src={proof.photo_url} alt={proof.delivery_way_id} className="w-full h-24 object-cover border-t border-[#1a3a5c] group-hover:opacity-90" />
                            <div className="p-2 text-[10px] text-[#4ea8de] flex items-center gap-1">
                              <ExternalLink size={11} />
                              Open rider photo
                            </div>
                          </a>
                        ) : (
                          <div className="h-24 flex items-center justify-center text-[#4d7a9b] text-[11px] border-t border-[#1a3a5c]">
                            No rider photo
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DATA ENTRY TEMPLATE TOP HORIZONTAL SCROLLBAR */}
          <div className="shrink-0 border-y border-[#1a3a5c] bg-[#071a2b] px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-[#f6b84b]">
                Data Entry Template Horizontal Scroll — Top
              </span>
              <span className="text-[10px] text-[#4d7a9b]">
                Use this bar to move across all template columns.
              </span>
            </div>
            <div
              ref={topScrollRef}
              onScroll={() => syncTemplateScroll("top")}
              className="h-5 overflow-x-scroll overflow-y-hidden custom-scrollbar rounded bg-[#061524] border border-[#1a3a5c]"
              aria-label="Top horizontal scrollbar for data entry template"
            >
              <div style={{ width: tableMinWidth, height: 16 }} />
            </div>
          </div>

          <div
            ref={tableScrollRef}
            onScroll={() => syncTemplateScroll("table")}
            className="w-full overflow-x-auto overflow-y-visible custom-scrollbar pb-6"
          >
            <table className="w-max min-w-full text-left whitespace-nowrap text-[11px] border-collapse" style={{ minWidth: tableMinWidth }}>
              <thead className="bg-[#0b2236] sticky top-0 z-10 border-b border-[#1a3a5c]">
                <tr className="text-[#061524] uppercase tracking-widest">
                  <th className="p-2 min-w-[160px] bg-[#f6b84b]">Recipient name</th>
                  <th className="p-2 min-w-[120px] bg-[#f6b84b]">Contact No. (1)</th>
                  <th className="p-2 min-w-[120px] bg-[#f6b84b]">Contact No. (2)</th>
                  <th className="p-2 min-w-[210px] bg-[#f6b84b]">Township</th>
                  <th className="p-2 min-w-[500px] bg-[#f6b84b]">Recipient address</th>
                  <th className="p-2 min-w-[100px] bg-[#f6b84b]">Item price</th>
                  <th className="p-2 min-w-[75px] bg-[#f6b84b]">Weight</th>
                  <th className="p-2 min-w-[280px] bg-[#f6b84b]">Remark / Special Instruction</th>
                  <th className="p-2 min-w-[80px] bg-[#f6b84b] text-center">Save</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-12 text-[#4d7a9b] text-[14px]">
                      {t('Select a pickup request and Load Proofs, Blank Register, or Upload Excel.', 'Pickup ကိုရွေးချယ်ပြီး ခလုတ်များကို နှိပ်ပါ။')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={`${row.way_id}-${row.id}`} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] transition-colors group align-top">
                      <td className="p-1.5"><input placeholder="Name..." value={row.recipient_name} onChange={(e) => handleUpdate(i, 'recipient_name', e.target.value)} className="w-full bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-1.5 rounded outline-none focus:border-[#f6b84b]" /></td>
                      <td className="p-1.5"><input placeholder="09..." value={row.recipient_phone} onChange={(e) => handleUpdate(i, 'recipient_phone', e.target.value)} className="w-full bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-1.5 rounded outline-none focus:border-[#f6b84b]" /></td>
                      <td className="p-1.5"><input placeholder="09..." value={row.recipient_phone_2} onChange={(e) => handleUpdate(i, 'recipient_phone_2', e.target.value)} className="w-full bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-1.5 rounded outline-none focus:border-[#f6b84b]" /></td>
                      <td className="p-1.5 relative">
                        <input
                          placeholder="Type: တောင် / တ / Dagon..."
                          value={row.town}
                          onFocus={() => setActiveTownshipRow(i)}
                          onChange={(e) => handleTownshipInput(i, e.target.value)}
                          onBlur={() => handleTownshipBlur(i)}
                          className={`w-full bg-[#061524] text-[#eef8ff] border p-1.5 rounded outline-none focus:border-[#f6b84b] ${findExactTownshipOption(row.town) ? 'border-[#1a3a5c]' : 'border-[#ff4f86]/50'}`}
                        />
                        {activeTownshipRow === i && (
                          <div className="absolute left-1.5 right-1.5 top-[38px] z-30 max-h-56 overflow-y-auto rounded-lg border border-[#f6b84b]/40 bg-[#061524] shadow-2xl">
                            {getTownshipSuggestions(row.town).length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-[#ff4f86]">No township match. Please check spelling.</div>
                            ) : (
                              getTownshipSuggestions(row.town).map((option) => (
                                <button
                                  key={`${option.township}-${option.township_mm || option.label || ''}`}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleTownshipSelect(i, option);
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-[#102b44] border-b border-[#1a3a5c]/40 last:border-b-0"
                                >
                                  <div className="text-[#eef8ff] text-[12px]">{formatTownshipOption(option)}</div>
                                  <div className="text-[#4ea8de] text-[10px]">{option.city || 'Yangon'}{option.region_state ? ` · ${option.region_state}` : ''}</div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-1.5">
                        <textarea
                          rows={3}
                          placeholder="Full recipient address"
                          value={row.address}
                          onChange={(e) => handleUpdate(i, 'address', e.target.value)}
                          className="w-full min-h-[72px] bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b] resize-y leading-5 whitespace-pre-wrap"
                        />
                      </td>
                      <td className="p-1.5"><input type="number" value={row.item_price} onChange={(e) => handleUpdate(i, 'item_price', e.target.value)} className="w-full bg-[#061524] text-emerald-400 border border-[#1a3a5c] p-1.5 rounded outline-none focus:border-emerald-400" /></td>
                      <td className="p-1.5"><input type="number" value={row.weight} onChange={(e) => handleUpdate(i, 'weight', e.target.value)} className="w-full bg-[#061524] text-[#f6b84b] border border-[#1a3a5c] p-1.5 rounded outline-none text-center focus:border-[#f6b84b]" /></td>
                      <td className="p-1.5">
                        <textarea
                          rows={3}
                          placeholder="Special instruction / delivery note"
                          value={row.remarks}
                          onChange={(e) => handleUpdate(i, 'remarks', e.target.value)}
                          className="w-full min-h-[72px] bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] p-2 rounded outline-none focus:border-[#f6b84b] resize-y leading-5 whitespace-pre-wrap"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleSaveRow(i)}
                          disabled={loading}
                          className={`px-3 py-2 rounded-lg text-[11px] border transition-colors ${row.saved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[#f6b84b] text-[#061524] border-[#f6b84b] hover:bg-[#e5a93a]'}`}
                        >
                          {row.saved ? 'Saved' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* DATA ENTRY TEMPLATE BOTTOM HORIZONTAL SCROLLBAR */}
          <div className="shrink-0 border-t border-[#1a3a5c] bg-[#071a2b] px-3 py-2 shadow-[0_-8px_18px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-[#f6b84b]">
                Data Entry Template Horizontal Scroll — Bottom
              </span>
              <span className="text-[10px] text-[#4d7a9b]">
                Synced with the top bar and table body.
              </span>
            </div>
            <div
              ref={bottomScrollRef}
              onScroll={() => syncTemplateScroll("bottom")}
              className="h-5 overflow-x-scroll overflow-y-hidden custom-scrollbar rounded bg-[#061524] border border-[#1a3a5c]"
              aria-label="Bottom horizontal scrollbar for data entry template"
            >
              <div style={{ width: tableMinWidth, height: 16 }} />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="p-4 border-t border-[#1a3a5c] flex justify-between items-center bg-[#061524]">
              <button onClick={handleAddRow} className="text-[#4ea8de] hover:text-[#eef8ff] flex items-center gap-1 text-[11px] uppercase tracking-widest transition-colors cursor-pointer">
                <Plus size={14} /> {t('Add Extra Row', 'အကွက် ထပ်ထည့်မည်')}
              </button>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-[#4d7a9b] hidden md:block">
                  {rows.filter((r) => r.photo_url || r.proof_photo_path).length}/{rows.length} rider photos checked
                </div>
                <button
                  type="button"
                  onClick={handleSaveAndGenerate}
                  disabled={loading || !canGenerateWaybill}
                  title={!canGenerateWaybill ? 'Select a pickup and ensure at least one row exists.' : 'Save rows and create waybill'}
                  className={`px-6 py-3 rounded-xl text-[12px] uppercase font-bold tracking-wider border transition-colors flex items-center gap-2 ${
                    loading || !canGenerateWaybill
                      ? 'bg-[#1a3a5c]/40 text-[#4d7a9b] border-[#1a3a5c] cursor-not-allowed'
                      : 'bg-[#f6b84b] text-[#061524] border-[#f6b84b] hover:bg-[#e5a93a] cursor-pointer'
                  }`}
                >
                  <Send size={14} /> {loading ? t('Processing...', 'ဆောင်ရွက်နေသည်...') : t('Save Data & Generate Waybill', 'ဒေတာသိမ်းဆည်း၍ Waybill ထုတ်မည်')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}