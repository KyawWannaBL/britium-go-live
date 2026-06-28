import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import * as XLSX from 'xlsx';
import {
  Download, UploadCloud, Plus, Filter, Send, Layers, Camera, ImageIcon, 
  RefreshCw, ExternalLink, CheckCircle2, AlertTriangle, Maximize2, Minimize2
} from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const FALLBACK_TOWNSHIPS = ["Ahlone", "Bahan", "Botataung", "Cocokyun", "Dagon", "Dagon Myothit East", "Dagon Myothit North", "Dagon Myothit Seikkan", "Dagon Myothit South", "Dala", "Dawbon", "East Dagon", "Hlaing", "Hlaing Thar Yar", "Hlaingthaya", "Insein", "Kamayut", "Kyauktada", "Kyimyindaing", "Lanmadaw", "Latha", "Mayangon", "Mingaladon", "Mingala Taung Nyunt", "North Dagon", "North Okkalapa", "Pabedan", "Pazundaung", "Sanchaung", "Seikkan", "Shwe Pyi Thar", "Shwepyitha", "South Dagon", "South Okkalapa", "Tamwe", "Thaketa", "Thingangyun", "Yankin", "Mandalay", "Naypyidaw"];

const MYANMAR_TOWNSHIP_OPTIONS = [
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

const REGISTER_NOW_TEMPLATE_HEADERS = ['Recipient Name', 'Contact No. (1)', 'Contact No. (2)', 'Township', 'Recipient Address', 'Item Price', 'Weight', 'Remark / Special Instruction'];

function normalizeTownship(value?: string | null) { return String(value || "").trim().toLowerCase().replace(/[\u200b\u200c\u200d\s\-_()၊,.]+/g, ""); }
function toDateInput(value?: string | null) { return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10); }

const TRANSLATIONS = {
  en: {
    header: "DATA ENTRY PARCEL REGISTRATION",
    subheader: "Verify rider parcel photos and register waybills dynamically. Prices auto-calculate.",
    refreshBtn: "Refresh Proofs",
    fromDate: "From Date", toDate: "To Date", report: "Report",
    photoTitle: "Rider Photo Verification", selectWbPhoto: "Select pickup to view rider photos.", noPhotos: "No rider parcel photos loaded", openPhoto: "Open rider photo",
    step1: "1. Select Verified Pickup Request",
    lblParcels: "PARCELS", noVerified: "No rider verified pickups found",
    btnLoad: "Load Proofs", btnBulk: "Bulk Upload Excel", btnBlank: "Blank Register", btnFull: "Full Screen", btnExit: "Exit Full Screen",
    thRecvName: "Recipient name", thPhone1: "Contact No. (1)", thPhone2: "Contact No. (2)", thTown: "Township", thAddr: "Recipient address", thPrice: "Item price", thWgt: "Weight", thRem: "Remark / Special Instruction", thSave: "Save",
    emptyTable: "Select a pickup request and Load Proofs, Blank Register, or Upload Excel.",
    btnAddRow: "Add Extra Row", checked: "rider photos checked", processing: "Processing...", btnGenWp: "Save Data & Generate Waybill",
    topScroll: "Data Entry Template Horizontal Scroll — Top", topScrollSub: "Use this bar to move across all template columns.",
    botScroll: "Data Entry Template Horizontal Scroll — Bottom", botScrollSub: "Synced with the top bar and table body."
  },
  mm: {
    header: "ပါဆယ်စာရင်း သွင်းရန်",
    subheader: "ရိုင်ဒါ၏ ပစ္စည်းဓာတ်ပုံများကို စစ်ဆေး၍ Waybill များသွင်းပါ။ ငွေပမာဏ အလိုအလျောက်တွက်ပေးမည်။",
    refreshBtn: "ဓာတ်ပုံများ ဆန်းသစ်ရန်",
    fromDate: "မှ (ရက်စွဲ)", toDate: "ထိ (ရက်စွဲ)", report: "အစီရင်ခံစာ",
    photoTitle: "Rider မှတ်တမ်းပုံများ", selectWbPhoto: "ဓာတ်ပုံကြည့်ရန် Pickup ရွေးပါ။", noPhotos: "ရိုင်ဒါပုံများ မရှိသေးပါ", openPhoto: "ပုံအကြီးကြည့်ရန်",
    step1: "၁။ အတည်ပြုပြီးသော Pickup ရွေးပါ",
    lblParcels: "အရေအတွက်", noVerified: "အတည်ပြုပြီးသော Pickup များ မတွေ့ပါ။",
    btnLoad: "ပုံများယူမည်", btnBulk: "Excel တင်မည်", btnBlank: "အသစ်စသွင်းမည်", btnFull: "မျက်နှာပြင် အပြည့်ကြည့်မည်", btnExit: "မျက်နှာပြင် အသေးပြောင်းမည်",
    thRecvName: "လက်ခံသူအမည်", thPhone1: "ဖုန်း (၁)", thPhone2: "ဖုန်း (၂)", thTown: "မြို့နယ်", thAddr: "လိပ်စာအပြည့်အစုံ", thPrice: "ကုန်ဖိုး", thWgt: "အလေးချိန်", thRem: "မှတ်ချက်", thSave: "သိမ်းမည်",
    emptyTable: "Pickup ကိုရွေးချယ်ပြီး ခလုတ်များကို နှိပ်ပါ။",
    btnAddRow: "အကွက် ထပ်ထည့်မည်", checked: "ဓာတ်ပုံစစ်ဆေးပြီး", processing: "ဆောင်ရွက်နေသည်...", btnGenWp: "ဒေတာသိမ်းဆည်း၍ Waybill ထုတ်မည်",
    topScroll: "ဘယ်ညာရွှေ့ရန် ဘား (အပေါ်)", topScrollSub: "ဇယားကွက်အားလုံးကို ကြည့်ရန် ဤဘားကို ရွှေ့ပါ။",
    botScroll: "ဘယ်ညာရွှေ့ရန် ဘား (အောက်)", botScrollSub: "ဇယားကွက်အားလုံးကို ကြည့်ရန် ဤဘားကို ရွှေ့ပါ။"
  }
};

export default function DataEntryPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;
  const sb = supabase as any;

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickupQueue, setPickupQueue] = useState<any[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const selectedPickupIdRef = useRef('');
  
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const tableMinWidth = 1900;

  const [parcelProofs, setParcelProofs] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState<string>('');
  const [townshipOptions, setTownshipOptions] = useState<any[]>([...MYANMAR_TOWNSHIP_OPTIONS, ...FALLBACK_TOWNSHIPS.map((township) => ({ township, city: "Yangon", region_state: "Yangon Region" }))]);
  const [activeTownshipRow, setActiveTownshipRow] = useState<number | null>(null);

  function selectPickup(pickupId: string) { selectedPickupIdRef.current = pickupId; setSelectedPickupId(pickupId); }
  const selectedPickup = useMemo(() => pickupQueue.find((p) => p.pickup_id === selectedPickupId) || null, [pickupQueue, selectedPickupId]);
  const townshipDisplayOptions = useMemo(() => {
    const seen = new Set<string>();
    return townshipOptions.filter((opt) => { const key = normalizeTownship(opt.township); if (!key || seen.has(key)) return false; seen.add(key); return true; });
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

  function getTownshipSuggestions(input?: string | null) {
    const key = normalizeTownship(input);
    if (!key) return townshipDisplayOptions.slice(0, 8);
    return townshipDisplayOptions.map((opt) => {
      const text = normalizeTownship([opt.township, opt.township_mm, opt.label, opt.city, opt.region_state, opt.search_text].filter(Boolean).join(" "));
      const townshipKey = normalizeTownship(opt.township);
      const mmKey = normalizeTownship(opt.township_mm);
      const labelKey = normalizeTownship(opt.label);
      const score = townshipKey === key || mmKey === key || labelKey === key ? 0 : townshipKey.startsWith(key) || mmKey.startsWith(key) || labelKey.startsWith(key) ? 1 : text.includes(key) ? 2 : 99;
      return { opt, score };
    }).filter((item) => item.score < 99).sort((a, b) => a.score - b.score || String(a.opt.township).localeCompare(String(b.opt.township))).slice(0, 8).map((item) => item.opt);
  }

  function formatTownshipOption(option: any) {
    const alt = option.township_mm && option.township_mm !== option.township ? option.township_mm : option.label;
    return alt ? `${option.township} · ${alt}` : option.township;
  }

  const money = (value: any, fallback = 0) => { const n = Number(String(value ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : fallback; };
  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

  function calculateLocalAmounts(row: any, option?: any | null) {
    const townshipOption = option ?? findTownshipOption(row.town);
    const town = townshipOption?.township || row.town || '';
    const destination = townshipOption?.city || row.destination || selectedPickup?.city || 'Yangon';
    const branchCode = String(townshipOption?.branch_code || '').toUpperCase();
    const regionState = String(townshipOption?.region_state || '').toLowerCase();
    const tier = String(row.tier || 'Standard');
    const itemPrice = money(row.item_price, 0);
    const weight = Math.max(0, money(row.weight, 0));
    const isUpperMyanmar = branchCode === 'MDY' || branchCode === 'NPT' || /mandalay/.test(regionState) || /naypyitaw|nay pyi taw/.test(`${regionState} ${destination}`.toLowerCase());
    const baseFee = isUpperMyanmar ? 6000 : 4000;
    const includedKg = tier.trim().toLowerCase() === 'royal' ? 5 : 3;
    const chargeableExtraKg = Math.max(0, Math.ceil(weight) - includedKg);
    const surcharge = chargeableExtraKg * 500;
    const deliveryFee = baseFee + surcharge;
    return { ...row, town, destination, base_fee: roundMoney(baseFee), surcharge: roundMoney(surcharge), deli_fee: roundMoney(deliveryFee), cod: roundMoney(itemPrice), actual_collect: roundMoney(itemPrice + deliveryFee) };
  }

  async function calculateAmounts(row: any) {
    const townshipOption = findTownshipOption(row.town);
    const local = calculateLocalAmounts(row, townshipOption);
    try {
      let response = await sb.rpc('be_calculate_tariff', { p_township: local.town, p_customer_tier: local.tier || 'Standard', p_weight_kg: Number(local.weight || 0), p_item_price: Number(local.item_price || 0) });
      if (response.error) response = await sb.rpc('be_calculate_tariff', { p_township: local.town, p_tier: local.tier || 'Standard', p_weight: Number(local.weight || 0), p_item_price: Number(local.item_price || 0) });
      if (!response.error && response.data) return { ...local, base_fee: roundMoney(response.data.base_fee ?? local.base_fee), surcharge: roundMoney(response.data.surcharge ?? local.surcharge), deli_fee: roundMoney(response.data.delivery_fee ?? local.deli_fee), cod: roundMoney(response.data.cod_amount ?? response.data.cod ?? local.cod), actual_collect: roundMoney(response.data.actual_collect ?? local.actual_collect), destination: response.data.city || response.data.destination || local.destination };
    } catch (err) {}
    return local;
  }

  function syncTemplateScroll(source: "top" | "table" | "bottom") {
    const els = { top: topScrollRef.current, table: tableScrollRef.current, bottom: bottomScrollRef.current };
    const srcEl = els[source];
    if (!srcEl) return;
    const left = srcEl.scrollLeft;
    if (els.top && els.top.scrollLeft !== left) els.top.scrollLeft = left;
    if (els.table && els.table.scrollLeft !== left) els.table.scrollLeft = left;
    if (els.bottom && els.bottom.scrollLeft !== left) els.bottom.scrollLeft = left;
  }

  async function loadPickupQueue() {
    setLoading(true); setMessage('');
    try {
      const { data, error } = await sb.from('be_v_data_entry_pickup_verification_queue').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const queue = data || [];
      setPickupQueue(queue);
      const current = selectedPickupIdRef.current;
      if (!current && queue.length > 0) selectPickup(queue[0].pickup_id);
      else if (current && !queue.some((item: any) => item.pickup_id === current)) selectPickup(queue[0]?.pickup_id || '');
    } catch (error: any) { setMessage(error.message); } finally { setLoading(false); }
  }

  async function loadParcelProofs(pickupId: string) {
    if (!pickupId) { setParcelProofs([]); setRows([]); return; }
    setLoading(true); setMessage('');
    try {
      await sb.rpc('be_seed_pickup_parcel_verifications', { p_pickup_id: pickupId });
      let { data, error } = await sb.from('be_v_data_entry_parcel_template').select('*').eq('pickup_id', pickupId).order('parcel_sequence', { ascending: true });
      if (error) {
        const fallback = await sb.from('be_v_data_entry_parcel_proofs').select('*').eq('pickup_id', pickupId).order('parcel_sequence', { ascending: true });
        data = fallback.data; error = fallback.error;
      }
      if (error) throw error;
      const proofs = await Promise.all(((data || [])).map(async (proof: any) => {
        let photo_url = null;
        if (proof.proof_photo_path) {
          const p = String(proof.proof_photo_path).replace(/^pickup-parcel-proofs\//, '');
          const { data: su } = await supabase.storage.from('pickup-parcel-proofs').createSignedUrl(p, 3600);
          photo_url = su?.signedUrl || supabase.storage.from('pickup-parcel-proofs').getPublicUrl(p).data?.publicUrl;
        }
        return { ...proof, photo_url };
      }));
      setParcelProofs(proofs);
      setRows(proofs.map((proof, index) => calculateLocalAmounts({
        id: proof.parcel_sequence || index + 1,
        status: proof.proof_photo_path && Number(proof.parcel_weight_kg||0)>0 ? 'RIDER_VERIFIED' : proof.proof_photo_path ? 'PHOTO_ONLY' : Number(proof.parcel_weight_kg||0)>0 ? 'WEIGHT_ONLY' : 'MISSING_PROOF',
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
      })));
    } catch (error: any) { setMessage(error.message); } finally { setLoading(false); }
  }

  useEffect(() => { loadPickupQueue(); }, []);

  useEffect(() => {
    selectedPickupIdRef.current = selectedPickupId;
    if (selectedPickupId) loadParcelProofs(selectedPickupId);
    else { setParcelProofs([]); setRows([]); }
  }, [selectedPickupId]);

  const handleUpdate = async (index: number, field: string, value: any) => {
    const currentRow = rows[index];
    if (!currentRow) return;
    let updatedRow: any = { ...currentRow, [field]: value, saved: false };
    if (field === 'town') {
      const option = findExactTownshipOption(value);
      if (option) updatedRow = { ...updatedRow, town: option.township, destination: option.city || updatedRow.destination || 'Yangon' };
    }
    if (field === 'destination') updatedRow.destination = String(value || '');
    if (['weight', 'tier', 'town', 'item_price', 'destination'].includes(field)) updatedRow = await calculateAmounts(updatedRow);
    setRows((curr) => { const next = [...curr]; next[index] = updatedRow; return next; });
  };

  const handleSaveRow = async (index: number) => {
    if (!selectedPickupId) return setMessage('Select a pickup first.');
    const row = rows[index];
    const option = findExactTownshipOption(row.town);
    if (!option) { setMessage(`Select a valid township for ${row.way_id}.`); setActiveTownshipRow(index); return; }
    try {
      setLoading(true);
      const { error } = await sb.rpc('be_save_data_entry_parcel_detail', { p_pickup_id: selectedPickupId, p_parcel_sequence: row.id, p_delivery_way_id: row.way_id, p_recipient_name: row.recipient_name || null, p_contact_no_1: row.recipient_phone || null, p_contact_no_2: row.recipient_phone_2 || null, p_township: option.township || null, p_recipient_address: row.address || null, p_customer_tier: row.tier || 'Standard', p_item_price: Number(row.item_price || 0), p_weight_kg: Number(row.weight || 0), p_surcharge: Number(row.surcharge || 0), p_delivery_fee: Number(row.deli_fee || 0), p_cod_amount: Number(row.cod || 0), p_actual_collect: Number(row.actual_collect || 0), p_destination: row.destination || option?.city || null, p_pickup_by: row.pickup_by || 'DATA_ENTRY', p_remark: row.remarks || null, p_actor_email: null });
      if (error) throw error;
      setRows((curr) => { const next = [...curr]; next[index] = { ...next[index], town: option.township, destination: option.city || next[index].destination, saved: true }; return next; });
      setMessage(`Saved ${row.way_id}`);
    } catch (e: any) { setMessage(e.message); } finally { setLoading(false); }
  };

  const downloadRegisterNowTemplate = () => {
    const sampleRows = Array.from({ length: Math.max(rows.length, selectedPickup?.expected_parcels || 30) }, () => ({ 'Recipient Name': '', 'Contact No. (1)': '', 'Contact No. (2)': '', Township: selectedPickup?.township || '', 'Recipient Address': '', 'Item Price': '', Weight: '', 'Remark / Special Instruction': '' }));
    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: REGISTER_NOW_TEMPLATE_HEADERS, skipHeader: false });
    worksheet['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 54 }, { wch: 12 }, { wch: 8 }, { wch: 34 }];
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Register Now'); XLSX.writeFile(workbook, 'Britium_DataEntry_Register_Now_Template.xlsx');
  };

  const handleSaveAndGenerate = async () => {
    if (!selectedPickupId) return setMessage('Select a pickup first.');
    const missing = rows.filter((r) => !String(r.recipient_name||'').trim() || !String(r.recipient_phone||'').trim() || !findExactTownshipOption(r.town) || !String(r.address||'').trim());
    if (missing.length > 0) return setMessage(`Cannot generate: ${missing.length} row(s) missing required fields.`);
    try {
      setLoading(true); setMessage('Saving rows & creating waybill...');
      const { data: ud } = await supabase.auth.getUser(); const email = ud?.user?.email || null;
      const payloadRows = rows.map((r) => ({ parcel_sequence: r.id, delivery_way_id: r.way_id, recipient_name: r.recipient_name, contact_no_1: r.recipient_phone, contact_no_2: r.recipient_phone_2, township: r.town, recipient_address: r.address, customer_tier: r.tier || 'Standard', item_price: Number(r.item_price || 0), weight_kg: Number(r.weight || 0), surcharge: Number(r.surcharge || 0), delivery_fee: Number(r.deli_fee || 0), cod_amount: Number(r.cod || 0), actual_collect: Number(r.actual_collect || 0), destination: r.destination || selectedPickup?.city || 'Yangon', pickup_by: r.pickup_by || 'DATA_ENTRY', remark: r.remarks || '', proof_photo_path: r.proof_photo_path || null }));
      
      const directRows = payloadRows.map((r) => ({ pickup_id: selectedPickupId, parcel_sequence: r.parcel_sequence, delivery_way_id: r.delivery_way_id, recipient_name: r.recipient_name, contact_no_1: r.contact_no_1, contact_no_2: r.contact_no_2, township: r.township, recipient_address: r.recipient_address, customer_tier: r.customer_tier, item_price: r.item_price, weight_kg: r.weight_kg, surcharge: r.surcharge, delivery_fee: r.delivery_fee, cod_amount: r.cod_amount, actual_collect: r.actual_collect, destination: r.destination, pickup_by: r.pickup_by, remark: r.remark, saved_by_email: email, saved_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
      await sb.from('be_data_entry_parcel_details').upsert(directRows, { onConflict: 'pickup_id,parcel_sequence' });
      
      let { data, error } = await sb.rpc('be_data_entry_create_waybill_from_rows', { p_pickup_id: selectedPickupId, p_rows: payloadRows, p_actor_email: email });
      if (error) {
        const legacy = await sb.rpc('be_data_entry_create_waybill', { p_pickup_id: selectedPickupId, p_waybill_no: null, p_receiver_name: rows[0]?.recipient_name||'', p_receiver_phone: rows[0]?.recipient_phone||'', p_receiver_address: rows[0]?.address||'', p_destination_city: rows[0]?.destination||'Yangon', p_destination_township: rows[0]?.town||'', p_cod_amount: rows.reduce((s, r) => s + Number(r.cod || 0), 0), p_actor_email: email });
        data = legacy.data; error = legacy.error;
      }
      if (error) throw error;
      setRows((curr) => curr.map((r) => ({ ...r, saved: true, status: 'WAYBILL_CREATED' })));
      setMessage(`Waybill ${data?.waybill_no || 'created'} generated. Synced to warehouse.`);
      await loadPickupQueue();
    } catch (e: any) { setMessage(e.message); } finally { setLoading(false); }
  };

  const inputStyle = { width: '100%', background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: '8px', borderRadius: 8, outline: 'none', fontFamily: FF.body, fontSize: 13 };
  const btnStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: FF.body, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, cursor: 'pointer' };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,textarea:focus{border-color:${C.gold}!important} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}`}</style>

      {!isFullScreen && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 20, marginBottom: 20 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{t.header}</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{t.subheader}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button type="button" onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={() => { loadPickupQueue(); if (selectedPickupId) loadParcelProofs(selectedPickupId); }} style={btnStyle}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> {t.refreshBtn}</button>
          </div>
        </div>
      )}

      {message && !isFullScreen && (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(246,184,75,0.1)', color: C.gold, border: `1px solid ${C.gold}40`, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <AlertTriangle size={16} /> {message}
        </div>
      )}

      {!isFullScreen && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
            <div style={{ width: 200 }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}><Filter size={12} style={{ display: 'inline', marginRight: 4 }}/>{t.fromDate}</div><input type="date" style={inputStyle} /></div>
            <div style={{ width: 200 }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}><Filter size={12} style={{ display: 'inline', marginRight: 4 }}/>{t.toDate}</div><input type="date" style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnStyle}><Download size={14}/> {t.report}</button>
            <button onClick={downloadRegisterNowTemplate} style={{ ...btnStyle, background: C.bg, color: C.info, borderColor: C.info }}><Download size={14}/> Register Template</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isFullScreen ? '1fr' : '300px 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* RIDER PHOTOS */}
        {!isFullScreen && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, position: 'sticky', top: 24, height: 600, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 12, color: C.text, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, margin: '0 0 12px' }}><Camera size={14} color={C.info}/> {t.photoTitle}</h3>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              {selectedPickup ? <><div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{selectedPickup.pickup_id}</div><div style={{ marginTop: 4 }}>{selectedPickup.merchant_code} - {selectedPickup.merchant_name}</div><div style={{ marginTop: 4 }}>Photos: <span style={{ color: C.gold }}>{parcelProofs.filter((p) => p.proof_photo_path).length}</span> / {parcelProofs.length}</div></> : t.selectWbPhoto}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 10, paddingRight: 4 }}>
              {parcelProofs.length === 0 ? (
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, textAlign: 'center', color: C.muted, fontSize: 12 }}><ImageIcon size={24} style={{ margin: '0 auto 8px' }}/> {t.noPhotos}</div>
              ) : parcelProofs.map((proof) => (
                <div key={proof.delivery_way_id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.panel2 }}>
                    <div>
                      <div style={{ color: C.gold, fontSize: 12, fontWeight: 700 }}>{proof.delivery_way_id}</div>
                      <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>#{String(proof.parcel_sequence).padStart(3, '0')} • {Number(proof.parcel_weight_kg || 0).toFixed(2)} KG</div>
                    </div>
                    {proof.proof_photo_path ? <CheckCircle2 size={14} color={C.success} /> : <AlertTriangle size={14} color={C.error} />}
                  </div>
                  {proof.photo_url ? (
                    <a href={proof.photo_url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                      <img src={proof.photo_url} alt="proof" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                      <div style={{ padding: 8, fontSize: 10, color: C.info, display: 'flex', alignItems: 'center', gap: 6, background: C.panelHover }}><ExternalLink size={12}/> {t.openPhoto}</div>
                    </a>
                  ) : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 11 }}>No rider photo</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WORKSPACE */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ background: C.panel2, borderBottom: `1px solid ${C.border}`, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, flex: 1, minWidth: 300 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.info, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>{t.step1}</div>
                <select value={selectedPickupId} onChange={(e) => selectPickup(e.target.value)} style={{ ...inputStyle, background: C.bg }}>
                  {pickupQueue.length === 0 ? <option value="">{t.noVerified}</option> : pickupQueue.map((p) => <option key={p.pickup_id} value={p.pickup_id}>{p.pickup_id} ({p.merchant_code} - {p.verified_parcels || 0}/{p.expected_parcels || 0} Parcels)</option>)}
                </select>
              </div>
              <div style={{ width: 100 }}>
                <div style={{ fontSize: 11, color: C.info, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>{t.lblParcels}</div>
                <input type="number" readOnly value={rows.length || selectedPickup?.expected_parcels || 0} style={{ ...inputStyle, background: C.bg, textAlign: 'center' }} />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => { loadPickupQueue(); if (selectedPickupId) loadParcelProofs(selectedPickupId); }} style={btnStyle}><Layers size={14}/> {t.btnLoad}</button>
              <button onClick={() => uploadInputRef.current?.click()} disabled={loading} style={{ ...btnStyle, background: C.success, color: '#000', borderColor: C.success }}><UploadCloud size={14}/> {t.btnBulk}</button>
              <button onClick={() => { setIsFullScreen(true); setMessage('Register mode enabled.'); }} disabled={loading || !selectedPickupId} style={{ ...btnStyle, background: C.gold, color: '#000', borderColor: C.gold }}><Plus size={14}/> {t.btnBlank}</button>
              <button onClick={() => setIsFullScreen(!isFullScreen)} style={{ ...btnStyle, background: '#fff', color: '#000', borderColor: '#fff' }}>{isFullScreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>} {isFullScreen ? t.btnExit : t.btnFull}</button>
            </div>
          </div>

          <div style={{ background: C.panelHover, borderBottom: `1px solid ${C.border}`, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.gold, fontWeight: 800, textTransform: 'uppercase' }}>{t.topScroll}</span>
            <span style={{ fontSize: 10, color: C.muted }}>{t.topScrollSub}</span>
          </div>
          <div ref={topScrollRef} onScroll={() => syncTemplateScroll("top")} style={{ height: 20, overflowX: 'auto', overflowY: 'hidden', background: C.bg, borderBottom: `1px solid ${C.border}` }}><div style={{ width: tableMinWidth, height: 1 }}></div></div>

          <div ref={tableScrollRef} onScroll={() => syncTemplateScroll("table")} style={{ overflowX: 'auto', paddingBottom: 24 }}>
            <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
              <thead style={{ background: C.panel, position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 160 }}>{t.thRecvName}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 120 }}>{t.thPhone1}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 120 }}>{t.thPhone2}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 210 }}>{t.thTown}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 400 }}>{t.thAddr}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 100 }}>{t.thPrice}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 80 }}>{t.thWgt}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 280 }}>{t.thRem}</th>
                  <th style={{ padding: 12, background: C.gold, color: '#000', border: `1px solid ${C.border}`, minWidth: 80, textAlign: 'center' }}>{t.thSave}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>{t.emptyTable}</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={`${row.way_id}-${row.id}`} style={{ borderBottom: `1px solid ${C.border}66` }}>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><input value={row.recipient_name} onChange={(e) => handleUpdate(i, 'recipient_name', e.target.value)} style={inputStyle} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><input value={row.recipient_phone} onChange={(e) => handleUpdate(i, 'recipient_phone', e.target.value)} style={inputStyle} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><input value={row.recipient_phone_2} onChange={(e) => handleUpdate(i, 'recipient_phone_2', e.target.value)} style={inputStyle} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top', position: 'relative' }}>
                      <input value={row.town} onFocus={() => setActiveTownshipRow(i)} onChange={(e) => handleTownshipInput(i, e.target.value)} onBlur={() => handleTownshipBlur(i)} style={{ ...inputStyle, borderColor: findExactTownshipOption(row.town) ? C.border : C.error }} />
                      {activeTownshipRow === i && (
                        <div style={{ position: 'absolute', top: 48, left: 8, right: 8, background: C.bg, border: `1px solid ${C.gold}`, borderRadius: 8, zIndex: 30, maxHeight: 200, overflowY: 'auto' }}>
                          {getTownshipSuggestions(row.town).length === 0 ? <div style={{ padding: 10, color: C.error, fontSize: 11 }}>No match found.</div> : getTownshipSuggestions(row.town).map(opt => (
                            <div key={opt.township} onMouseDown={(e) => { e.preventDefault(); handleTownshipSelect(i, opt); }} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                              <div style={{ color: C.text, fontSize: 12 }}>{formatTownshipOption(opt)}</div>
                              <div style={{ color: C.info, fontSize: 10 }}>{opt.city}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><textarea value={row.address} onChange={(e) => handleUpdate(i, 'address', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><input type="number" value={row.item_price} onChange={(e) => handleUpdate(i, 'item_price', e.target.value)} style={{ ...inputStyle, color: C.success, fontWeight: 800 }} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><input type="number" value={row.weight} onChange={(e) => handleUpdate(i, 'weight', e.target.value)} style={{ ...inputStyle, color: C.gold, textAlign: 'center', fontWeight: 800 }} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top' }}><textarea value={row.remarks} onChange={(e) => handleUpdate(i, 'remarks', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></td>
                    <td style={{ padding: 8, verticalAlign: 'top', textAlign: 'center' }}>
                      <button onClick={() => handleSaveRow(i)} disabled={loading} style={{ background: row.saved ? 'rgba(34,197,94,0.1)' : C.gold, color: row.saved ? C.success : '#000', border: `1px solid ${row.saved ? C.success : C.gold}`, padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body }}>{row.saved ? 'Saved' : 'Save'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: C.panelHover, borderTop: `1px solid ${C.border}`, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.gold, fontWeight: 800, textTransform: 'uppercase' }}>{t.botScroll}</span>
            <span style={{ fontSize: 10, color: C.muted }}>{t.botScrollSub}</span>
          </div>
          <div ref={bottomScrollRef} onScroll={() => syncTemplateScroll("bottom")} style={{ height: 20, overflowX: 'auto', overflowY: 'hidden', background: C.bg }}><div style={{ width: tableMinWidth, height: 1 }}></div></div>

          {rows.length > 0 && (
            <div style={{ padding: 20, background: C.bg, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <button onClick={handleAddRow} style={{ background: 'transparent', border: 'none', color: C.info, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: FF.body }}><Plus size={14}/> {t.btnAddRow}</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{rows.filter(r => r.photo_url || r.proof_photo_path).length}/{rows.length} {t.checked}</span>
                <button onClick={handleSaveAndGenerate} disabled={loading || !selectedPickupId} style={{ ...btnSty, background: loading || !selectedPickupId ? C.panel2 : C.gold, color: loading || !selectedPickupId ? C.muted : '#000', borderColor: loading || !selectedPickupId ? C.border : C.gold, padding: '12px 24px', fontSize: 14 }}>
                  <Send size={16}/> {loading ? t.processing : t.btnGenWp}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}