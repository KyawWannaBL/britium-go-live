import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Eye,
  EyeOff,
  Filter,
  Lock,
  Printer,
  Search,
  Send,
  ShieldAlert,
  Square,
  UserCog,
  XCircle,
} from "lucide-react";
import { resolveWaybillId, type AnyWaybillSource } from "@/lib/waybillCoding";

type PrintFormat = "A5_4_UNITS" | "A5_3_UNITS" | "THERMAL_1_UNIT" | "THERMAL_2_UNITS";
type Role = "STAFF" | "SUPER_ADMIN";
type Lang = "EN" | "MM";
type ReprintStatus = "PENDING" | "APPROVE" | "REJECT";

type ReprintRequest = {
  reqId: string;
  requester: string;
  date: string;
  items: { id: string; reason: string }[];
  status: ReprintStatus;
};

type WaybillRow = {
  id: string;
  date: string;
  merchant: string;
  merchantPhone: string;
  recipient: string;
  phone: string;
  address: string;
  itemPrice: string;
  deliFee: string;
  prepaid: string;
  total: string;
  cbmWt: string;
  weight: string;
  deliveryType: string;
  remarks: string;
  pickupId?: string;
  isPrinted: boolean;
  raw?: AnyWaybillSource;
};

const QRCode = ({ value, size }: { value: string; size: number }) => (
  <img
    src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`}
    alt={`QR-${value}`}
    style={{ width: size, height: size, display: "block" }}
    crossOrigin="anonymous"
  />
);

const Barcode = ({ value, height }: { value: string; height: number }) => (
  <img
    src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value)}&includetext=false&scale=2`}
    alt={`Barcode-${value}`}
    style={{ height, maxWidth: "100%", objectFit: "contain", display: "block" }}
    crossOrigin="anonymous"
  />
);

const TRANSLATIONS = {
  EN: {
    studioTitle: "Waybill Print Studio",
    superAdminLogin: "SuperAdmin Login",
    pendingApproval: "Pending Approval",
    formatLabel: "Format",
    dateLabel: "Date",
    searchLabel: "Search",
    searchPlaceholder: "Search Waybill / Merchant...",
    waybillsTitle: "Waybills",
    selectAll: "Select All",
    waybillId: "Waybill ID",
    merchantRecipient: "Merchant / Recipient",
    status: "Status",
    printed: "Printed",
    ready: "Ready",
    noWaybills: "No waybills found for this date.",
    reprintReasonRequired: "Reprint Reason Required",
    reasonPlaceholder: "Type specific reason...",
    batchActions: "Batch Actions",
    selected: "Selected:",
    printPreview: "Print Preview",
    hidePreview: "Hide Preview",
    requestReprint: "Request Reprint",
    mixedSelection: "Mixed Selection",
    printNow: "Print Now",
    reprintWarning: "Selected waybills have already been printed. Submit a request to the Super Admin for a reprint.",
    mixedWarning: "You have selected both new and previously printed waybills. Please select them separately.",
    printAreaPreview: "Print Area Preview",
    superAdminCenter: "SuperAdmin Reprint Approval Center",
    superAdminDesc: "Review and authorize reprint requests to prevent fraud and duplicate documents.",
    switchToStaff: "Switch to Branch Staff View",
    noPendingRequests: "No pending reprint requests at this moment.",
    requestedBy: "Requested by",
    requestedWaybills: "Requested Waybills",
    reason: "Reason",
    approveReprint: "Approve Reprint",
    rejectRequest: "Reject Request",
    deliveryService: "DELIVERY SERVICE",
    merchant: "Merchant",
    recipient: "Recipient",
    remarks: "Remarks",
    itemPrice: "Item Price",
    deliFee: "Deli Fee",
    prepaid: "Prepaid",
    delivery: "Delivery",
    normal: "Normal",
    hotline: "HotLine",
    cbmWt: "CBM/Wt",
    weight: "Weight",
    cod: "COD",
    warningText: "If charged more than the amount below, please contact the Hotline above.",
  },
  MM: {
    studioTitle: "ကုန်အမှတ်အသား ပရင့်စတူဒီယို",
    superAdminLogin: "အက်ဒမင် ဝင်ရောက်ရန်",
    pendingApproval: "ခွင့်ပြုချက် စောင့်ဆိုင်းနေသည်",
    formatLabel: "ပုံစံ",
    dateLabel: "ရက်စွဲ",
    searchLabel: "ရှာဖွေရန်",
    searchPlaceholder: "ဘောက်ချာ / ကုန်သည် ရှာဖွေရန်...",
    waybillsTitle: "ကုန်အမှတ်အသားများ",
    selectAll: "အားလုံးရွေးချယ်မည်",
    waybillId: "ဘောက်ချာ နံပါတ်",
    merchantRecipient: "ကုန်သည် / လက်ခံမည့်သူ",
    status: "အခြေအနေ",
    printed: "ထုတ်ပြီး",
    ready: "အသင့်",
    noWaybills: "ယနေ့အတွက် ဘောက်ချာများ မတွေ့ရှိပါ။",
    reprintReasonRequired: "အကြောင်းရင်း ထည့်သွင်းရန် လိုအပ်သည်",
    reasonPlaceholder: "တိကျသော အကြောင်းရင်းကို ရေးသားပါ...",
    batchActions: "စုပေါင်း လုပ်ဆောင်ချက်များ",
    selected: "ရွေးချယ်ထားသော အရေအတွက်:",
    printPreview: "နမူနာ ကြည့်ရှုမည်",
    hidePreview: "နမူနာ ပိတ်မည်",
    requestReprint: "ပြန်ထုတ်ရန် တောင်းဆိုမည်",
    mixedSelection: "ရောနှော ရွေးချယ်ထားသည်",
    printNow: "ယခု ပရင့်ထုတ်မည်",
    reprintWarning: "ရွေးချယ်ထားသော ဘောက်ချာများကို ပရင့်ထုတ်ပြီးသွားပါပြီ။ ထပ်မံထုတ်ရန် Super Admin ထံသို့ ခွင့်ပြုချက် တောင်းခံပါ။",
    mixedWarning: "ပရင့်ထုတ်ပြီးသော ဘောက်ချာများနှင့် အသစ်များကို ရောနှောရွေးချယ်ထားပါသည်။ သီးခြားစီ ခွဲ၍ ရွေးချယ်ပါ။",
    printAreaPreview: "ပရင့်ထုတ်မည့် နမူနာပုံစံ",
    superAdminCenter: "SuperAdmin ပြန်လည်ထုတ်ဝေခွင့် ပြုလုပ်ရာ နေရာ",
    superAdminDesc: "လိမ်လည်မှုနှင့် ထပ်ထုတ်ခြင်းကို ကာကွယ်ရန် ပြန်လည်ပရင့်ထုတ်ရန် တောင်းဆိုချက်များကို စစ်ဆေး၍ ခွင့်ပြုချက်ပေးပါ။",
    switchToStaff: "ရုံးခွဲ ဝန်ထမ်း အမြင်သို့ ပြောင်းမည်",
    noPendingRequests: "ယခုအချိန်တွင် တောင်းဆိုထားသော စာရင်းမရှိပါ။",
    requestedBy: "တောင်းဆိုသူ",
    requestedWaybills: "တောင်းဆိုထားသော ဘောက်ချာများ",
    reason: "အကြောင်းရင်း",
    approveReprint: "ခွင့်ပြုမည်",
    rejectRequest: "ငြင်းပယ်မည်",
    deliveryService: "DELIVERY SERVICE",
    merchant: "ကုန်သည်",
    recipient: "လက်ခံမည့်သူ",
    remarks: "မှတ်ချက်",
    itemPrice: "ပစ္စည်းတန်ဖိုး",
    deliFee: "ပို့ဆောင်ခ",
    prepaid: "ကြိုရှင်းပြီးငွေ",
    delivery: "ပို့ဆောင်မှု",
    normal: "ပုံမှန်",
    hotline: "Hotline",
    cbmWt: "CBM/Wt",
    weight: "အလေးချိန်",
    cod: "COD",
    warningText: "အောက်ဖော်ပြပါ ငွေပမာဏထက် ပိုမိုတောင်းခံပါက အထက်ပါ Hotline သို့ ဆက်သွယ် တိုင်ကြားနိုင်ပါသည်။",
  },
};

const REASON_OPTIONS = {
  EN: ["Printer Jammed", "Ink Smudged", "Paper Torn", "Barcode Not Scannable", "Other"],
  MM: ["စက္ကူညပ်သွား၍", "မှင်ပွသွား၍", "စက္ကူပြဲသွား၍", "Barcode ဖတ်မရ၍", "အခြား"],
};

const RAW_SAMPLE_ROWS: AnyWaybillSource[] = [
  {
    pickup_id: "P0627-BBG-022",
    delivery_sequence: 1,
    merchant_name: "Baby Genius",
    recipient_name: "Ma Htet Htet",
    recipient_phone: "09794665120",
    delivery_address: "အမှတ် ၁၁၅/ဒုတိယထပ်, မဂ်လာသီရိလမ်း, မြို့သစ်ရပ်ကွက်, ဒေါပုံ",
    item_price: 76000,
    delivery_fee: 3000,
    cod_amount: 79000,
    weight_kg: 5,
    date: "2026-06-27",
    isPrinted: false,
  },
  {
    pickup_id: "P0627-BBG-022",
    delivery_sequence: 2,
    merchant_name: "Baby Genius",
    recipient_name: "Ma Htet Htet",
    recipient_phone: "09794665120",
    delivery_address: "အမှတ် ၁၁၅/ဒုတိယထပ်, မဂ်လာသီရိလမ်း, မြို့သစ်ရပ်ကွက်, ဒေါပုံ",
    item_price: 76000,
    delivery_fee: 3000,
    cod_amount: 79000,
    weight_kg: 5,
    date: "2026-06-27",
    isPrinted: true,
  },
  {
    pickup_id: "P0625-BCA-117",
    delivery_sequence: 100,
    merchant_name: "Beauty Cos",
    recipient_name: "Phyu Thwe",
    recipient_phone: "09794665120",
    delivery_address: "No. 27, Yangon",
    item_price: 56000,
    delivery_fee: 4000,
    cod_amount: 60000,
    weight_kg: 2,
    date: "2026-06-25",
    isPrinted: false,
  },
  {
    pickup_id: "P0625-BCA-117",
    delivery_sequence: 112,
    merchant_name: "Beauty Cos",
    recipient_name: "ချစ်ချစ်အိမ်",
    recipient_phone: "09987654321",
    delivery_address: "Bahan Township, Yangon",
    item_price: 40000,
    delivery_fee: 4000,
    cod_amount: 44000,
    weight_kg: 3,
    date: "2026-06-25",
    isPrinted: false,
  },
  {
    pickup_id: "P0627-BBG-022",
    delivery_sequence: 15,
    merchant_name: "Baby Genius",
    recipient_name: "Ma Htet Htet",
    recipient_phone: "09794665120",
    delivery_address: "အမှတ် ၁၁၅/ဒုတိယထပ်, မဂ်လာသီရိလမ်း, မြို့သစ်ရပ်ကွက်, ဒေါပုံ",
    item_price: 76000,
    delivery_fee: 3000,
    cod_amount: 79000,
    weight_kg: 5,
    date: "2026-06-27",
    isPrinted: false,
  },
];

function money(value: unknown): string {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function clean(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeWaybillRow(raw: AnyWaybillSource, index: number): WaybillRow {
  const id = resolveWaybillId(raw, index);
  const itemPrice = Number(raw.item_price ?? raw.itemPrice ?? 0);
  const deliFee = Number(raw.delivery_fee ?? raw.deliFee ?? raw.shipping_cost ?? 0);
  const total = Number(raw.cod_amount ?? raw.total ?? itemPrice + deliFee);

  return {
    id,
    date: clean(raw.date ?? raw.created_at, "2026-06-27").slice(0, 10),
    merchant: clean(raw.merchant_name ?? raw.merchant ?? raw.sender_name, "Baby Genius"),
    merchantPhone: clean(raw.merchant_phone ?? raw.sender_phone, "09796239153"),
    recipient: clean(raw.recipient_name ?? raw.receiver_name ?? raw.customer_name, "Ma Htet Htet"),
    phone: clean(raw.recipient_phone ?? raw.receiver_phone ?? raw.customer_phone, "09794665120"),
    address: clean(raw.delivery_address ?? raw.recipient_address ?? raw.address ?? raw.pickup_address, "Yangon"),
    itemPrice: money(itemPrice),
    deliFee: money(deliFee),
    prepaid: money(raw.prepaid ?? 0),
    total: money(total),
    cbmWt: clean(raw.cbm_weight ?? raw.cbmWt ?? "1"),
    weight: clean(raw.weight_kg ?? raw.weight ?? "5"),
    deliveryType: clean(raw.delivery_type ?? raw.service_type ?? "Normal"),
    remarks: clean(raw.remarks ?? raw.remark ?? ""),
    pickupId: clean(raw.pickup_id ?? raw.pickup_way_id ?? raw.canonical_pickup_id),
    isPrinted: Boolean(raw.isPrinted ?? raw.is_printed ?? raw.printed_at),
    raw,
  };
}

function formatConfig(format: PrintFormat) {
  switch (format) {
    case "THERMAL_2_UNITS":
      return { page: "w-[4in] h-[6in]", unitsPerPage: 2, unit: "w-full h-1/2 p-2 text-[10px]", qr: 42, barcode: 18, title: "text-[14px]" };
    case "A5_4_UNITS":
      return { page: "w-[148mm] h-[210mm]", unitsPerPage: 4, unit: "w-1/2 h-1/2 p-1.5 text-[8px]", qr: 34, barcode: 14, title: "text-[8px]" };
    case "A5_3_UNITS":
      return { page: "w-[148mm] h-[210mm]", unitsPerPage: 3, unit: "w-full h-1/3 p-2 text-[9px]", qr: 38, barcode: 16, title: "text-[10px]" };
    case "THERMAL_1_UNIT":
    default:
      return { page: "w-[4in] h-[6in]", unitsPerPage: 1, unit: "w-full h-full p-3 text-xs", qr: 82, barcode: 24, title: "text-[20px]" };
  }
}

function chunk<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size));
  return pages;
}

function PrintPage({ children, pageClass }: { children: React.ReactNode; pageClass: string }) {
  return (
    <div
      className={`${pageClass} bg-white mb-6 shadow-xl print:shadow-none print:mb-0 flex flex-wrap overflow-hidden box-border border print:border-none relative mx-auto`}
      style={{ pageBreakAfter: "always" }}
    >
      {children}
    </div>
  );
}

function WaybillUnit({ row, format, lang }: { row: WaybillRow; format: PrintFormat; lang: Lang }) {
  const t = TRANSLATIONS[lang];
  const cfg = formatConfig(format);
  const compact = format !== "THERMAL_1_UNIT";

  return (
    <div key={row.id} className={`${cfg.unit} border border-black flex flex-col box-border text-black bg-white print-exact`}>
      <div className={`flex justify-between border-b border-black ${compact ? "pb-1 mb-1" : "pb-2 mb-2"}`}>
        <div className="flex gap-2 items-center min-w-0">
          <div className={`${compact ? "w-[22px] h-[22px] text-[12px]" : "w-[30px] h-[30px] text-[16px]"} rounded-full bg-[#2c3e50] text-white flex items-center justify-center font-bold print-exact shrink-0`}>
            B
          </div>
          <div className="leading-none min-w-0">
            <div className={`font-bold ${cfg.title} mb-1 truncate`}>BRITIUM EXPRESS</div>
            <div className="text-[9px] mb-1">{t.deliveryService}</div>
            <div className="font-bold text-[9px]">{t.hotline}: 09 - 897 44 77 44</div>
          </div>
        </div>
        <div className="text-right flex flex-col items-end shrink-0">
          {!compact && <div className="text-[10px] mb-1">{new Date().toLocaleString()}</div>}
          <div className="mb-1">
            <QRCode value={row.id} size={cfg.qr} />
          </div>
          <div className="text-[10px] font-bold">{row.id}</div>
        </div>
      </div>

      <div className={`border-b border-black ${compact ? "pb-1 mb-1" : "pb-2 mb-2"}`}>
        <table className="w-full text-inherit leading-relaxed">
          <tbody>
            <tr>
              <td className="w-[70px] align-top">{t.merchant} :</td>
              <td>
                {row.merchant}<br />{row.merchantPhone}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`border-b border-black ${compact ? "pb-1 mb-1" : "pb-2 mb-2"} flex-1 overflow-hidden`}>
        <table className="w-full text-inherit">
          <tbody>
            <tr>
              <td className="w-[70px] align-top">{t.recipient} :</td>
              <td>
                <b className={`${compact ? "text-[10px]" : "text-[14px]"} block mb-1`}>{row.recipient}</b>
                <b className="text-[11px] block mb-1">{row.phone}</b>
                <span className="leading-relaxed block">{row.address}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`flex border-b border-black ${compact ? "pb-1 mb-1" : "pb-2 mb-2"}`}>
        <div className="flex-1 border-r border-black pr-1">
          <div>{t.cbmWt} :<br /><b className="text-[11px]">{row.cbmWt}</b></div>
          <div className="mt-1">{t.weight} :<br /><b className="text-[11px]">{row.weight}</b></div>
          <div className="mt-1">{t.delivery} :<br /><b className="text-[11px]">{row.deliveryType || t.normal}</b></div>
        </div>
        <div className="flex-[1.2] pl-2">
          <div>{t.itemPrice} :<br /><span className="text-[11px]">{row.itemPrice}</span></div>
          <div className="mt-1">{t.deliFee} :<br /><span className="text-[11px]">{row.deliFee}</span></div>
          <div className="mt-1">{t.prepaid} :<br /><span className="text-[11px]">{row.prepaid}</span></div>
        </div>
        <div className="flex-[1.5] pl-2 flex items-center">
          <div className={`${compact ? "text-[12px]" : "text-[16px]"} w-full border border-black rounded p-2 text-right font-bold relative bg-[#d0d0d0] print-exact`}>
            <span className="absolute top-[2px] left-[4px] text-[8px] font-normal">{t.cod}</span><br />
            {row.total}
          </div>
        </div>
      </div>

      <div className={`${compact ? "mb-1" : "mb-2"}`}>{t.remarks} : {row.remarks}</div>
      {!compact && (
        <div className="flex justify-center mb-2">
          <Barcode value={row.id} height={cfg.barcode} />
        </div>
      )}
      <div className="text-center font-bold text-[9px] pt-1 border-t border-dashed border-black leading-relaxed">
        {t.warningText}
      </div>
    </div>
  );
}

export default function WaybillPrintStudioPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const [role, setRole] = useState<Role>("STAFF");
  const [format, setFormat] = useState<PrintFormat>("THERMAL_1_UNIT");
  const [selectedDate, setSelectedDate] = useState("2026-06-27");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedWaybills, setSelectedWaybills] = useState<string[]>([]);
  const [reprintReasons, setReprintReasons] = useState<Record<string, { type: string; detail: string }>>({});
  const [waybillData, setWaybillData] = useState<WaybillRow[]>(() => RAW_SAMPLE_ROWS.map(normalizeWaybillRow));
  const [adminQueue, setAdminQueue] = useState<ReprintRequest[]>([]);

  const t = TRANSLATIONS[lang];
  const currentReasons = REASON_OPTIONS[lang];
  const cfg = formatConfig(format);

  const filteredWaybills = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return waybillData.filter((wb) => {
      const matchDate = wb.date === selectedDate;
      const matchSearch =
        wb.id.toLowerCase().includes(q) ||
        wb.merchant.toLowerCase().includes(q) ||
        wb.recipient.toLowerCase().includes(q) ||
        String(wb.pickupId || "").toLowerCase().includes(q);
      return matchDate && matchSearch;
    });
  }, [waybillData, selectedDate, searchQuery]);

  const selectedRows = useMemo(
    () => selectedWaybills.map((id) => waybillData.find((row) => row.id === id)).filter(Boolean) as WaybillRow[],
    [selectedWaybills, waybillData],
  );

  const printableRows = selectedRows.filter((row) => !row.isPrinted);
  const pendingCount = adminQueue.filter((item) => item.status === "PENDING").length;
  const hasLockedSelection = selectedRows.some((row) => row.isPrinted);
  const hasUnlockedSelection = selectedRows.some((row) => !row.isPrinted);
  const printPages = chunk(printableRows, cfg.unitsPerPage);

  function toggleSelectWaybill(id: string, isPrinted: boolean) {
    if (selectedWaybills.includes(id)) {
      setSelectedWaybills((prev) => prev.filter((wId) => wId !== id));
      if (isPrinted) {
        setReprintReasons((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      return;
    }

    setSelectedWaybills((prev) => [...prev, id]);
    if (isPrinted) {
      setReprintReasons((prev) => ({ ...prev, [id]: { type: currentReasons[0], detail: "" } }));
    }
  }

  function handleSelectAll() {
    if (selectedWaybills.length === filteredWaybills.length) {
      setSelectedWaybills([]);
      setReprintReasons({});
      return;
    }

    setSelectedWaybills(filteredWaybills.map((row) => row.id));
    const nextReasons: Record<string, { type: string; detail: string }> = {};
    filteredWaybills.forEach((row) => {
      if (row.isPrinted) nextReasons[row.id] = { type: currentReasons[0], detail: "" };
    });
    setReprintReasons(nextReasons);
  }

  function updateReason(id: string, field: "type" | "detail", value: string) {
    setReprintReasons((prev) => ({ ...prev, [id]: { ...(prev[id] || { type: currentReasons[0], detail: "" }), [field]: value } }));
  }

  function handlePrint() {
    if (selectedWaybills.length === 0) {
      alert(lang === "EN" ? "Please select waybills to print." : "ကျေးဇူးပြု၍ ပရင့်ထုတ်မည့် ဘောက်ချာများကို ရွေးချယ်ပါ။");
      return;
    }

    if (hasLockedSelection) {
      alert(t.reprintWarning);
      return;
    }

    setShowPreview(true);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        setWaybillData((prev) => prev.map((row) => (selectedWaybills.includes(row.id) ? { ...row, isPrinted: true } : row)));
        setSelectedWaybills([]);
        setShowPreview(false);
      }, 1200);
    }, 350);
  }

  function handleSubmitReprintRequest() {
    const lockedSelected = selectedRows.filter((row) => row.isPrinted);
    if (lockedSelected.length === 0) return;

    const otherType = lang === "EN" ? "Other" : "အခြား";
    const missingReason = lockedSelected.some((row) => reprintReasons[row.id]?.type === otherType && !reprintReasons[row.id]?.detail.trim());
    if (missingReason) {
      alert(lang === "EN" ? "Please provide details for the 'Other' reason." : "ကျေးဇူးပြု၍ အခြား အကြောင်းရင်းအတွက် အသေးစိတ် ရေးသားပါ။");
      return;
    }

    const newRequest: ReprintRequest = {
      reqId: `REQ-${Math.floor(Math.random() * 10000)}`,
      requester: "Branch_User_01",
      date: new Date().toLocaleString(),
      items: lockedSelected.map((row) => ({
        id: row.id,
        reason: reprintReasons[row.id]?.type === otherType ? reprintReasons[row.id]?.detail : reprintReasons[row.id]?.type || currentReasons[0],
      })),
      status: "PENDING",
    };

    setAdminQueue((prev) => [newRequest, ...prev]);
    alert(lang === "EN" ? "Reprint request submitted successfully." : "ထပ်မံထုတ်ရန် တောင်းဆိုချက် အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ။");
    setSelectedWaybills([]);
    setReprintReasons({});
  }

  function handleAdminAction(reqId: string, action: ReprintStatus) {
    const request = adminQueue.find((item) => item.reqId === reqId);
    setAdminQueue((prev) => prev.map((item) => (item.reqId === reqId ? { ...item, status: action } : item)));

    if (action === "APPROVE" && request) {
      const approvedIds = request.items.map((item) => item.id);
      setWaybillData((prev) => prev.map((row) => (approvedIds.includes(row.id) ? { ...row, isPrinted: false } : row)));
    }
  }

  if (role === "SUPER_ADMIN") {
    return (
      <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif] p-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex bg-[#1a3a5c] rounded-lg p-1 border border-[#254b73]">
            <button onClick={() => setLang("EN")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === "EN" ? "bg-[#f6b84b] text-[#061524]" : "text-[#8ab0c9] hover:text-white"}`}>EN</button>
            <button onClick={() => setLang("MM")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === "MM" ? "bg-[#f6b84b] text-[#061524]" : "text-[#8ab0c9] hover:text-white"}`}>MM</button>
          </div>
          <button onClick={() => setRole("STAFF")} className="bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-[#254b73] transition-colors">
            <UserCog size={16} /> {t.switchToStaff}
          </button>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8 border-b border-[#1a3a5c] pb-4">
            <ShieldAlert size={28} className="text-[#f6b84b]" />
            <div>
              <h1 className="text-2xl font-bold text-[#f6b84b] uppercase tracking-widest">{t.superAdminCenter}</h1>
              <p className="text-[#90b4ce] text-sm">{t.superAdminDesc}</p>
            </div>
          </div>

          {adminQueue.length === 0 ? (
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-12 text-center text-[#90b4ce]">
              <CheckCircle2 size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t.noPendingRequests}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {adminQueue.map((req) => (
                <div key={req.reqId} className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden shadow-lg">
                  <div className="p-4 bg-[#071a2b] border-b border-[#1a3a5c] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#4ea8de] text-lg">{req.reqId}</div>
                      <div className="text-[#90b4ce] text-xs">{t.requestedBy}: <span className="text-[#eef8ff]">{req.requester}</span> • {req.date}</div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-bold uppercase rounded-md ${req.status === "PENDING" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : req.status === "APPROVE" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"}`}>
                      {req.status}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-[#90b4ce] mb-3 font-semibold">{t.requestedWaybills} ({req.items.length}):</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                      {req.items.map((item) => (
                        <div key={item.id} className="bg-[#061524] border border-[#1a3a5c] p-3 rounded-lg flex flex-col gap-1">
                          <span className="font-bold text-[#f6b84b] text-sm">{item.id}</span>
                          <span className="text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded inline-block w-max border border-rose-500/20">{t.reason}: {item.reason}</span>
                        </div>
                      ))}
                    </div>

                    {req.status === "PENDING" && (
                      <div className="flex gap-3 pt-4 border-t border-[#1a3a5c]">
                        <button onClick={() => handleAdminAction(req.reqId, "APPROVE")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-widest text-sm">
                          <CheckSquare size={18} /> {t.approveReprint}
                        </button>
                        <button onClick={() => handleAdminAction(req.reqId, "REJECT")} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-widest text-sm">
                          <XCircle size={18} /> {t.rejectRequest}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-black font-['Poppins',sans-serif] flex flex-col items-center pb-8 print:py-0 print:bg-white relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: ${format.includes("A5") ? "148mm 210mm" : "4in 6in"}; margin: 0; }
        @media print {
          html, body, #root { background: white !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
          .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      ` }} />

      <div className="no-print w-full bg-[#0b2236] text-[#eef8ff] p-4 flex justify-between items-center shadow-md z-10 sticky top-0">
        <div className="flex items-center gap-3 ml-4">
          <Printer size={24} className="text-[#f6b84b]" />
          <h1 className="text-xl font-bold uppercase tracking-widest text-[#f6b84b]">{t.studioTitle}</h1>
        </div>
        <div className="flex items-center gap-4 mr-4">
          <div className="flex bg-[#1a3a5c] rounded-lg p-1 border border-[#254b73]">
            <button onClick={() => setLang("EN")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === "EN" ? "bg-[#f6b84b] text-[#061524]" : "text-[#8ab0c9] hover:text-white"}`}>EN</button>
            <button onClick={() => setLang("MM")} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${lang === "MM" ? "bg-[#f6b84b] text-[#061524]" : "text-[#8ab0c9] hover:text-white"}`}>MM</button>
          </div>
          <button onClick={() => setRole("SUPER_ADMIN")} className="flex items-center gap-2 text-sm bg-[#1a3a5c] px-3 py-1.5 rounded-lg hover:bg-[#254b73] transition-colors">
            <ShieldAlert size={16} className={pendingCount > 0 ? "text-amber-400" : ""} />
            {pendingCount > 0 ? `${pendingCount} ${t.pendingApproval}` : t.superAdminLogin}
          </button>
        </div>
      </div>

      <div className="no-print w-full max-w-5xl mt-6 mb-6 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Filter size={14} /> {t.formatLabel}</label>
            <select value={format} onChange={(event) => setFormat(event.target.value as PrintFormat)} className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500">
              <option value="A5_4_UNITS">A5 / A4 (4 Units)</option>
              <option value="A5_3_UNITS">A5 / A4 (3 Units)</option>
              <option value="THERMAL_1_UNIT">Thermal (1 Unit : 4x6)</option>
              <option value="THERMAL_2_UNITS">Thermal (2 Units : 4x3)</option>
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Filter size={14} /> {t.dateLabel}</label>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500" />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Search size={14} /> {t.searchLabel}</label>
            <input type="text" placeholder={t.searchPlaceholder} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-blue-500" />
          </div>
        </div>
      </div>

      <div className="no-print w-full max-w-5xl px-4 flex flex-col md:flex-row gap-6 items-start">
        <div className="flex-[2] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-700 uppercase tracking-wider text-sm">{t.waybillsTitle} ({filteredWaybills.length})</h3>
            <button onClick={handleSelectAll} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              {selectedWaybills.length > 0 && selectedWaybills.length === filteredWaybills.length ? <CheckSquare size={16} /> : <Square size={16} />} {t.selectAll}
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-10 text-center" />
                  <th className="p-3 font-semibold text-gray-600">{t.waybillId}</th>
                  <th className="p-3 font-semibold text-gray-600">{t.merchantRecipient}</th>
                  <th className="p-3 font-semibold text-gray-600 text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWaybills.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-500 italic">{t.noWaybills}</td></tr>
                ) : (
                  filteredWaybills.map((wb) => {
                    const isSelected = selectedWaybills.includes(wb.id);
                    return (
                      <React.Fragment key={wb.id}>
                        <tr className={`${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50"} transition-colors cursor-pointer`} onClick={() => toggleSelectWaybill(wb.id, wb.isPrinted)}>
                          <td className="p-3 text-center align-middle">{isSelected ? <CheckSquare size={18} className="text-blue-600 mx-auto" /> : <Square size={18} className="text-gray-300 mx-auto" />}</td>
                          <td className="p-3 font-bold text-gray-800 align-middle">{wb.id}</td>
                          <td className="p-3 align-middle">
                            <div className="font-semibold text-gray-700">{wb.merchant}</div>
                            <div className="text-xs text-gray-500">{wb.recipient}</div>
                            {wb.pickupId && <div className="text-[11px] text-gray-400">{wb.pickupId}</div>}
                          </td>
                          <td className="p-3 text-center align-middle">
                            {wb.isPrinted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold border border-gray-200"><Lock size={12} /> {t.printed}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-xs font-bold border border-emerald-200"><Printer size={12} /> {t.ready}</span>
                            )}
                          </td>
                        </tr>
                        {isSelected && wb.isPrinted && (
                          <tr className="bg-rose-50/30">
                            <td colSpan={4} className="p-3 border-t border-rose-100">
                              <div className="flex gap-2 max-w-lg mx-auto">
                                <ShieldAlert size={18} className="text-rose-500 shrink-0 mt-2" />
                                <div className="flex-1 space-y-2">
                                  <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">{t.reprintReasonRequired}</div>
                                  <select value={reprintReasons[wb.id]?.type || currentReasons[0]} onChange={(event) => updateReason(wb.id, "type", event.target.value)} className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500" onClick={(event) => event.stopPropagation()}>
                                    {currentReasons.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                  {(reprintReasons[wb.id]?.type === "Other" || reprintReasons[wb.id]?.type === "အခြား") && (
                                    <input type="text" placeholder={t.reasonPlaceholder} value={reprintReasons[wb.id]?.detail || ""} onChange={(event) => updateReason(wb.id, "detail", event.target.value)} className="w-full bg-white border border-rose-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500" onClick={(event) => event.stopPropagation()} />
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex-[1] flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 uppercase tracking-wider text-sm mb-4 border-b border-gray-100 pb-2">{t.batchActions}</h3>
            <div className="flex justify-between items-center text-sm font-semibold text-gray-600 mb-6 bg-gray-50 p-3 rounded-xl border border-gray-200">
              <span>{t.selected}</span>
              <span className="text-lg text-blue-600 font-bold">{selectedWaybills.length}</span>
            </div>
            <div className="space-y-3">
              <button onClick={() => setShowPreview(!showPreview)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-gray-200">
                {showPreview ? <EyeOff size={18} /> : <Eye size={18} />} {showPreview ? t.hidePreview : t.printPreview}
              </button>
              {hasLockedSelection && !hasUnlockedSelection ? (
                <button onClick={handleSubmitReprintRequest} className="w-full bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-colors uppercase tracking-wider">
                  <Send size={18} /> {t.requestReprint}
                </button>
              ) : hasUnlockedSelection && hasLockedSelection ? (
                <button disabled className="w-full bg-gray-300 text-gray-500 px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 uppercase tracking-wider cursor-not-allowed">
                  <AlertCircle size={18} /> {t.mixedSelection}
                </button>
              ) : (
                <button onClick={handlePrint} disabled={selectedWaybills.length === 0} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition-colors uppercase tracking-wider">
                  <Printer size={18} /> {t.printNow}
                </button>
              )}
            </div>

            {hasLockedSelection && !hasUnlockedSelection && <p className="text-xs text-rose-600 mt-3 text-center leading-relaxed bg-rose-50 p-2 rounded-lg border border-rose-100">{t.reprintWarning}</p>}
            {hasUnlockedSelection && hasLockedSelection && <p className="text-xs text-amber-600 mt-3 text-center leading-relaxed bg-amber-50 p-2 rounded-lg border border-amber-100">{t.mixedWarning}</p>}
          </div>
        </div>
      </div>

      <div className={`mt-12 w-full flex flex-col items-center pb-12 ${showPreview ? "block" : "hidden print:block"}`}>
        <div className="no-print w-full text-center border-t border-gray-300 pt-8 opacity-60 mb-8 max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-500">{t.printAreaPreview}</p>
        </div>

        {printPages.map((pageRows, pageIndex) => (
          <PrintPage key={`page-${pageIndex}`} pageClass={cfg.page}>
            {pageRows.map((row) => <WaybillUnit key={row.id} row={row} format={format} lang={lang} />)}
          </PrintPage>
        ))}
      </div>
    </div>
  );
}
