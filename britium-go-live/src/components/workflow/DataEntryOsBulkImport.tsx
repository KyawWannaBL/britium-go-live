import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Upload,
  X,
} from "lucide-react";

export type OsBulkPickup = {
  pickup_id: string;
  merchant_id: string;
  merchant_name: string;
  pickup_date: string;
  created_at: string;
  expected_parcels: number;
  verified_parcels: number;
  registered_parcels: number;
};

export type OsImportRow = {
  targetSequence: number;
  sourceRowNumber: number;
  recipientName: string;
  recipientPhone: string;
  townshipProvider: string;
  actualWeight: number | "";
  deliveryAddress: string;
  serviceType: string;
  paymentType: string;
  itemPrice: number | "";
  osSetPrice: number | "";
  merchantTier: string;
  completionStatus: "COMPLETE" | "PARTIAL";
  issues: string[];
};

export type OsImportApplyPayload = {
  fileName: string;
  targetPickupId: string;
  rows: OsImportRow[];
  sourceRowCount: number;
  skipPhotoReview: boolean;
  photoBypassReason: string;
};

type Props = {
  pickups: OsBulkPickup[];
  selectedPickupId: string;
  busy?: boolean;
  onPickupChange: (pickupId: string) => void;
  onApply: (payload: OsImportApplyPayload) => Promise<void>;
};

type ColumnKey =
  | "recipientName"
  | "recipientPhone"
  | "townshipProvider"
  | "actualWeight"
  | "deliveryAddress"
  | "serviceType"
  | "paymentType"
  | "itemPrice"
  | "osSetPrice"
  | "merchantTier";

const TEMPLATE_HEADERS = [
  "လက်ခံသူအမည်\n(Receiver Name)",
  "လက်ခံသူဖုန်း\n(Receiver Phone)",
  "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)",
  "အမှန်တကယ်အလေးချိန် (KG)\n(Actual Weight)",
  "လက်ခံသူလိပ်စာ\n(Receiver Address)",
  "ဝန်ဆောင်မှုအမျိုးအစား\n(Service Type)",
  "ငွေကောက်ခံမှုပုံစံ\n(Payment Type)",
  "ကုန်ပစ္စည်းတန်ဖိုး\n(Item Price)",
  "ကုန်သည်သတ်မှတ်ပို့ဆောင်ခ\n(OS Set Price)",
  "ကုန်သည်အဆင့်\n(Merchant Tier)",
] as const;

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  recipientName: ["receiver name", "recipient name", "လက်ခံသူအမည်"],
  recipientPhone: ["receiver phone", "recipient phone", "လက်ခံသူဖုန်း"],
  townshipProvider: ["township / service provider", "township service provider", "delivery township", "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ", "မြို့နယ်"],
  actualWeight: ["actual weight", "weight kg", "weight", "အမှန်တကယ်အလေးချိန်"],
  deliveryAddress: ["receiver address", "recipient address", "delivery address", "လက်ခံသူလိပ်စာ"],
  serviceType: ["service type", "ဝန်ဆောင်မှုအမျိုးအစား"],
  paymentType: ["payment type", "collection type", "ငွေကောက်ခံမှုပုံစံ", "ငွေကောက်ခံပုံ"],
  itemPrice: ["item price", "item value", "ကုန်ပစ္စည်းတန်ဖိုး"],
  osSetPrice: ["os set price", "os delivery fee", "merchant delivery fee", "ကုန်သည်သတ်မှတ်ပို့ဆောင်ခ"],
  merchantTier: ["merchant tier", "customer tier", "ကုန်သည်အဆင့်"],
};

const MYANMAR_DIGITS: Record<string, string> = {
  "၀": "0", "၁": "1", "၂": "2", "၃": "3", "၄": "4",
  "၅": "5", "၆": "6", "၇": "7", "၈": "8", "၉": "9",
};

function clean(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").normalize("NFC").trim();
}

function normalized(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[\n\r]+/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/[^a-z0-9\u1000-\u109f/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identifyColumn(value: unknown): ColumnKey | null {
  const header = normalized(value);
  if (!header) return null;
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as Array<[ColumnKey, string[]]>) {
    if (aliases.some((alias) => header.includes(normalized(alias)))) return key;
  }
  return null;
}

function parseAmount(value: unknown): number | "" {
  const raw = clean(value)
    .replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit)
    .replace(/[,\s]/g, "")
    .replace(/(?:mmk|ks|ကျပ်)$/i, "");
  if (!raw) return "";
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : "";
}

function parsePhone(value: unknown) {
  const raw = clean(value)
    .replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit)
    .replace(/\.0+$/, "")
    .replace(/[^0-9+]/g, "");
  if (/^9\d{8,9}$/.test(raw)) return `0${raw}`;
  return raw;
}

function normalizeTier(value: unknown) {
  const tier = normalized(value);
  if (!tier) return "STANDARD";
  if (tier.includes("royal") || tier.includes("ရွိုင်ရယ်")) return "ROYAL";
  if (tier.includes("commitment") || tier.includes("ကတိကဝတ်")) return "COMMITMENT";
  if (tier.includes("standard") || tier.includes("စံ")) return "STANDARD";
  return clean(value).toUpperCase();
}

function normalizeServiceType(value: unknown) {
  const service = normalized(value);
  if (!service || service.includes("standard") || service.includes("normal") || service.includes("ပုံမှန်")) return "STANDARD";
  if (service.includes("same day") || service.includes("နေ့ချင်း") || service.includes("တစ်နေ့တည်း")) return "SAME_DAY";
  if (service.includes("next day") || service.includes("နောက်နေ့")) return "NEXT_DAY";
  if (service.includes("express") || service.includes("အမြန်")) return "EXPRESS";
  if (service.includes("economy") || service.includes("သက်သာ")) return "ECONOMY";
  return clean(value).toUpperCase();
}

function normalizePaymentType(value: unknown, itemPrice: number | "", osSetPrice: number | "") {
  const payment = normalized(value);
  if (payment.includes("exact") || payment.includes("အတိအကျ") || payment.includes("cash on delivery") || /\bcod\b/.test(payment)) return "EXACT_COLLECTION_AMOUNT";
  if (payment.includes("delivery charge only") || payment.includes("delivery fee only") || payment.includes("delivery only") || payment.includes("ပို့ဆောင်ခသာ")) return "DELIVERY_CHARGE_ONLY";
  if (payment.includes("item") || payment.includes("ပစ္စည်း") || payment.includes("ကုန်ပစ္စည်း")) return "ITEM_PRICE_PLUS_DECLARED_DELIVERY";
  if (!payment && itemPrice === "" && osSetPrice !== "") return "DELIVERY_CHARGE_ONLY";
  if (!payment && (itemPrice !== "" || osSetPrice !== "")) return "ITEM_PRICE_PLUS_DECLARED_DELIVERY";
  return clean(value).toUpperCase();
}

function classifyRow(row: Omit<OsImportRow, "completionStatus" | "issues">) {
  const issues: string[] = [];
  if (!row.recipientName) issues.push("Receiver name is missing");
  if (!row.recipientPhone) issues.push("Receiver phone is missing");
  if (!row.townshipProvider) issues.push("Township / provider is missing");
  if (row.actualWeight === "" || row.actualWeight <= 0) issues.push("Actual weight must be greater than zero");
  if (!row.deliveryAddress) issues.push("Receiver address is missing");
  if (!["STANDARD", "EXPRESS", "SAME_DAY", "NEXT_DAY", "ECONOMY"].includes(row.serviceType)) issues.push("Service type is not recognized");
  if (!["ITEM_PRICE_PLUS_DECLARED_DELIVERY", "DELIVERY_CHARGE_ONLY", "EXACT_COLLECTION_AMOUNT"].includes(row.paymentType)) issues.push("Payment type is not recognized");
  if (!["STANDARD", "ROYAL", "COMMITMENT"].includes(row.merchantTier)) issues.push("Merchant tier is not recognized");
  if (row.paymentType === "ITEM_PRICE_PLUS_DECLARED_DELIVERY" && row.itemPrice === "") issues.push("Item price is missing");
  if (["ITEM_PRICE_PLUS_DECLARED_DELIVERY", "DELIVERY_CHARGE_ONLY"].includes(row.paymentType) && row.osSetPrice === "") issues.push("OS set price is missing");
  if (row.paymentType === "EXACT_COLLECTION_AMOUNT" && row.itemPrice === "" && row.osSetPrice === "") issues.push("Exact collection amount is missing");
  return { issues, completionStatus: issues.length ? "PARTIAL" as const : "COMPLETE" as const };
}

export function parseOsImportMatrix(matrix: unknown[][]) {
  let bestIndex = -1;
  let bestColumns = new Map<ColumnKey, number>();
  matrix.slice(0, 25).forEach((values, rowIndex) => {
    const columns = new Map<ColumnKey, number>();
    values.forEach((value, columnIndex) => {
      const key = identifyColumn(value);
      if (key && !columns.has(key)) columns.set(key, columnIndex);
    });
    if (columns.size > bestColumns.size) {
      bestIndex = rowIndex;
      bestColumns = columns;
    }
  });
  if (bestIndex < 0 || bestColumns.size < 6) throw new Error("The 10-column Britium Data Entry header row was not found.");

  const requiredKeys = Object.keys(COLUMN_ALIASES) as ColumnKey[];
  const missingHeaders = requiredKeys
    .filter((key) => !bestColumns.has(key))
    .map((key) => TEMPLATE_HEADERS[requiredKeys.indexOf(key)]);
  const rows: OsImportRow[] = [];
  let targetSequence = 0;
  matrix.slice(bestIndex + 1).forEach((values, offset) => {
    if (!values.some((value) => clean(value))) return;
    targetSequence += 1;
    const value = (key: ColumnKey) => bestColumns.has(key) ? values[bestColumns.get(key)!] : "";
    const itemPrice = parseAmount(value("itemPrice"));
    const osSetPrice = parseAmount(value("osSetPrice"));
    const base = {
      targetSequence,
      sourceRowNumber: bestIndex + offset + 2,
      recipientName: clean(value("recipientName")),
      recipientPhone: parsePhone(value("recipientPhone")),
      townshipProvider: clean(value("townshipProvider")),
      actualWeight: parseAmount(value("actualWeight")),
      deliveryAddress: clean(value("deliveryAddress")),
      serviceType: normalizeServiceType(value("serviceType")),
      paymentType: normalizePaymentType(value("paymentType"), itemPrice, osSetPrice),
      itemPrice,
      osSetPrice,
      merchantTier: normalizeTier(value("merchantTier")),
    };
    const classification = classifyRow(base);
    rows.push({ ...base, ...classification });
  });
  if (!rows.length) throw new Error("No data rows were found below the header.");
  if (rows.length > 200) throw new Error("Import one pickup at a time with no more than 200 rows.");
  return { rows, missingHeaders, headerRowNumber: bestIndex + 1 };
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pickupTimestamp(pickup: OsBulkPickup) {
  const parsed = new Date(pickup.pickup_date || pickup.created_at || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function authorizedCount(pickup: OsBulkPickup) {
  return Math.max(Number(pickup.expected_parcels || 0), Number(pickup.verified_parcels || 0));
}

export default function DataEntryOsBulkImport({ pickups, selectedPickupId, busy = false, onPickupChange, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<OsImportRow[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<"ALL_OS" | "DEDICATED_OS">("DEDICATED_OS");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pickupStatus, setPickupStatus] = useState<"ALL" | "COMPLETE" | "PARTIAL">("ALL");
  const [rowStatus, setRowStatus] = useState<"ALL" | "COMPLETE" | "PARTIAL">("ALL");
  const [targetPickupId, setTargetPickupId] = useState(selectedPickupId);
  const [skipPhotoReview, setSkipPhotoReview] = useState(false);
  const [photoBypassReason, setPhotoBypassReason] = useState("");

  useEffect(() => setTargetPickupId(selectedPickupId), [selectedPickupId]);

  useEffect(() => {
    if (!open || scope !== "DEDICATED_OS" || merchantFilter) return;
    const selected = pickups.find((pickup) => pickup.pickup_id === selectedPickupId);
    if (selected) setMerchantFilter(selected.merchant_id || selected.merchant_name);
  }, [merchantFilter, open, pickups, scope, selectedPickupId]);

  const merchants = useMemo(() => {
    const map = new Map<string, string>();
    for (const pickup of pickups) {
      const id = pickup.merchant_id || pickup.merchant_name;
      if (id) map.set(id, pickup.merchant_name || pickup.merchant_id);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pickups]);

  const eligiblePickups = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return pickups.filter((pickup) => {
      const merchantMatch = scope === "ALL_OS" || Boolean(merchantFilter && (pickup.merchant_id === merchantFilter || pickup.merchant_name === merchantFilter));
      const timestamp = pickupTimestamp(pickup);
      const dateMatch = (!from || (timestamp != null && timestamp >= from)) && (!to || (timestamp != null && timestamp <= to));
      const complete = authorizedCount(pickup) > 0 && pickup.registered_parcels >= authorizedCount(pickup);
      const statusMatch = pickupStatus === "ALL" || (pickupStatus === "COMPLETE" ? complete : !complete);
      return merchantMatch && dateMatch && statusMatch;
    });
  }, [fromDate, merchantFilter, pickupStatus, pickups, scope, toDate]);

  const selectedRows = useMemo(
    () => rows.filter((row) => rowStatus === "ALL" || row.completionStatus === rowStatus),
    [rowStatus, rows],
  );
  const completeCount = rows.filter((row) => row.completionStatus === "COMPLETE").length;
  const partialCount = rows.length - completeCount;
  const targetReady = Boolean(targetPickupId && targetPickupId === selectedPickupId && eligiblePickups.some((pickup) => pickup.pickup_id === targetPickupId) && !busy);

  async function parseFile(file?: File) {
    if (!file) return;
    setFileBusy(true);
    setMessage("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an XLSX, XLS, or CSV file.");
      if (file.size > 15 * 1024 * 1024) throw new Error("The spreadsheet is larger than 15 MB.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("The workbook has no worksheet.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
      const parsed = parseOsImportMatrix(matrix);
      setFilename(file.name);
      setRows(parsed.rows);
      setMissingHeaders(parsed.missingHeaders);
      setOpen(true);
      const incomplete = parsed.rows.filter((row) => row.completionStatus === "PARTIAL").length;
      setMessage(`Loaded ${parsed.rows.length} row(s): ${parsed.rows.length - incomplete} complete, ${incomplete} partial.`);
    } catch (error: any) {
      setFilename("");
      setRows([]);
      setMissingHeaders([]);
      setMessage(error?.message || "The spreadsheet could not be read.");
    } finally {
      setFileBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function downloadCsvTemplate() {
    const matrix = [
      ["BRITIUM VENTURES — DATA ENTRY TEMPLATE", ...Array(9).fill("")],
      ["Myanmar / English parcel registration sheet", ...Array(9).fill("")],
      ["အဖြူရောင်အကွက်များတွင် အချက်အလက်ဖြည့်ပါ။ ငွေပမာဏကို ကျပ်ဖြင့် ထည့်ပါ။  |  Enter data in the white cells; enter monetary values in MMK.", ...Array(9).fill("")],
      [...TEMPLATE_HEADERS],
    ];
    const csv = `\uFEFF${matrix.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadBlob("Britium_Data_Entry_Formregistration_Template.csv", new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  async function downloadXlsxTemplate() {
    setFileBusy(true);
    try {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet([
        ["BRITIUM VENTURES — DATA ENTRY TEMPLATE"],
        ["Myanmar / English parcel registration sheet"],
        ["အဖြူရောင်အကွက်များတွင် အချက်အလက်ဖြည့်ပါ။ ငွေပမာဏကို ကျပ်ဖြင့် ထည့်ပါ။  |  Enter data in the white cells; enter monetary values in MMK."],
        [...TEMPLATE_HEADERS],
      ]);
      worksheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
      ];
      worksheet["!cols"] = TEMPLATE_HEADERS.map((header) => ({ wch: Math.min(34, Math.max(18, header.length / 2)) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Entry");
      XLSX.writeFile(workbook, "Britium_Data_Entry_Formregistration_Template.xlsx", { compression: true });
    } finally {
      setFileBusy(false);
    }
  }

  async function applyRows() {
    if (!targetReady) {
      setMessage("Select the target pickup and wait for its registration rows to finish loading.");
      return;
    }
    if (missingHeaders.length) {
      setMessage("The spreadsheet is missing one or more required columns.");
      return;
    }
    if (!selectedRows.length) {
      setMessage("No spreadsheet rows match the selected data-status filter.");
      return;
    }
    if (skipPhotoReview && photoBypassReason.trim().length < 10) {
      setMessage("Enter a clear reason of at least 10 characters for using OS softcopy instead of picker photos.");
      return;
    }
    setFileBusy(true);
    setMessage("");
    try {
      await onApply({
        fileName: filename,
        targetPickupId,
        rows: selectedRows,
        sourceRowCount: rows.length,
        skipPhotoReview,
        photoBypassReason: photoBypassReason.trim(),
      });
      setOpen(false);
    } catch (error: any) {
      setMessage(error?.message || "OS spreadsheet rows could not be applied.");
    } finally {
      setFileBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/50 bg-cyan-500 px-4 py-2.5 text-[11px] font-black text-[#04111d]">
        <Upload size={14}/>UPLOAD OS DATA
      </button>

      {open ? (
        <div className="fixed inset-0 z-[10020] overflow-auto bg-black/80 p-3 md:p-6" role="dialog" aria-modal="true" aria-label="OS spreadsheet bulk fill">
          <div className="mx-auto max-w-[1500px] overflow-hidden rounded-2xl border border-[#2b6388] bg-[#071b2b] text-[#eef8ff] shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1d4b70] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-cyan-400/15 p-2 text-cyan-300"><FileSpreadsheet size={22}/></span>
                <div><div className="text-sm font-black">OS Softcopy Bulk Data Fill</div><div className="text-[11px] text-[#8db5d1]">Stage spreadsheet rows in the existing textboxes, review every drop point, then use Calculate All and Save All.</div></div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-rose-200" aria-label="Close OS bulk import"><X size={18}/></button>
            </div>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-[#1d4b70] bg-[#0b2236] p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><Filter size={14}/>Data selection</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">OS scope</span><select className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="ALL_OS">All OS</option><option value="DEDICATED_OS">Dedicated OS</option></select></label>
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Dedicated OS</span><select disabled={scope === "ALL_OS"} className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-50" value={merchantFilter} onChange={(event) => setMerchantFilter(event.target.value)}><option value="">Select merchant / OS</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.id} · {merchant.name}</option>)}</select></label>
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Pickup from</span><input type="date" className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={fromDate} onChange={(event) => setFromDate(event.target.value)}/></label>
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Pickup to</span><input type="date" className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={toDate} onChange={(event) => setToDate(event.target.value)}/></label>
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Pickup data</span><select className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={pickupStatus} onChange={(event) => setPickupStatus(event.target.value as typeof pickupStatus)}><option value="ALL">Completed + partial</option><option value="COMPLETE">Completed only</option><option value="PARTIAL">Partial only</option></select></label>
                  <label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Target pickup</span><select className="w-full rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={targetPickupId} onChange={(event) => { setTargetPickupId(event.target.value); onPickupChange(event.target.value); }}><option value="">Select pickup</option>{eligiblePickups.map((pickup) => <option key={pickup.pickup_id} value={pickup.pickup_id}>{pickup.pickup_id} · {pickup.merchant_id || pickup.merchant_name} · {pickup.registered_parcels}/{authorizedCount(pickup)}</option>)}</select></label>
                </div>
                <div className="mt-2 text-[10px] text-[#789db8]">All OS exposes every eligible pickup. Each spreadsheet is still applied to one selected pickup so its map pins can be reviewed before anything is saved.</div>
              </section>

              <section className="rounded-xl border border-[#1d4b70] bg-[#0b2236] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="text-xs font-black">Spreadsheet</div><div className="mt-1 text-[10px] text-[#8db5d1]">The uploaded CSV/XLSX may contain complete or partial rows; partial rows stay editable.</div></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void downloadXlsxTemplate()} disabled={fileBusy} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]"><Download size={13} className="mr-1 inline"/>XLSX TEMPLATE</button>
                    <button type="button" onClick={downloadCsvTemplate} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-3 py-2 text-[10px] font-black text-[#8fd3ff]"><Download size={13} className="mr-1 inline"/>CSV TEMPLATE</button>
                    <label className="cursor-pointer rounded-lg bg-[#f6b84b] px-3 py-2 text-[10px] font-black text-[#071521]"><Upload size={13} className="mr-1 inline"/>ATTACH SPREADSHEET<input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void parseFile(event.target.files?.[0])}/></label>
                  </div>
                </div>

                {filename ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
                  ["File", filename], ["Rows", rows.length], ["Complete", completeCount], ["Partial", partialCount], ["Selected", selectedRows.length],
                ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[#1d4b70] bg-[#061524] p-3"><div className="text-[9px] font-black uppercase text-[#789db8]">{label}</div><div className="mt-1 truncate text-xs font-black">{value}</div></div>)}</div> : null}

                {rows.length ? <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><label><span className="mb-1 block text-[10px] font-black text-[#8db5d1]">Spreadsheet row status</span><select className="rounded-lg border border-[#2b6388] bg-white px-3 py-2 text-xs font-bold text-black" value={rowStatus} onChange={(event) => setRowStatus(event.target.value as typeof rowStatus)}><option value="ALL">Completed + partial rows</option><option value="COMPLETE">Completed rows only</option><option value="PARTIAL">Partial rows only</option></select></label>{missingHeaders.length ? <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-200"><AlertTriangle size={13} className="mr-1 inline"/>Missing columns: {missingHeaders.join("; ")}</div> : <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-200"><CheckCircle2 size={13} className="mr-1 inline"/>All 10 template columns recognized</div>}</div> : null}

                {rows.length ? <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-[#1d4b70]"><table className="min-w-[1200px] text-left text-[10px]"><thead className="sticky top-0 bg-[#12314a]"><tr>{["Seq", "Row", "Receiver", "Phone", "Township / Provider", "Weight", "Address", "Service", "Payment", "Item", "OS Price", "Tier", "Status"].map((header) => <th key={header} className="px-3 py-2 font-black">{header}</th>)}</tr></thead><tbody>{selectedRows.slice(0, 40).map((row) => <tr key={row.sourceRowNumber} className="border-t border-[#1d4b70]"><td className="px-3 py-2">{row.targetSequence}</td><td className="px-3 py-2">{row.sourceRowNumber}</td><td className="max-w-40 truncate px-3 py-2">{row.recipientName || "—"}</td><td className="px-3 py-2">{row.recipientPhone || "—"}</td><td className="max-w-52 truncate px-3 py-2">{row.townshipProvider || "—"}</td><td className="px-3 py-2">{row.actualWeight || "—"}</td><td className="max-w-64 truncate px-3 py-2">{row.deliveryAddress || "—"}</td><td className="px-3 py-2">{row.serviceType}</td><td className="px-3 py-2">{row.paymentType}</td><td className="px-3 py-2">{row.itemPrice === "" ? "—" : row.itemPrice}</td><td className="px-3 py-2">{row.osSetPrice === "" ? "—" : row.osSetPrice}</td><td className="px-3 py-2">{row.merchantTier}</td><td className={`px-3 py-2 font-black ${row.completionStatus === "COMPLETE" ? "text-emerald-300" : "text-amber-300"}`} title={row.issues.join("; ")}>{row.completionStatus}</td></tr>)}</tbody></table></div> : null}
              </section>

              <section className="rounded-xl border border-amber-400/35 bg-amber-400/5 p-4">
                <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={skipPhotoReview} onChange={(event) => setSkipPhotoReview(event.target.checked)}/><span><b className="text-xs text-amber-200">Use OS softcopy as the source evidence and skip mandatory picker photos</b><span className="mt-1 block text-[10px] leading-4 text-[#b8cbd8]">This does not silently disable evidence controls. Upload permission, source filename, operator identity, row number, and reason are recorded by the backend for every saved row.</span></span></label>
                {skipPhotoReview ? <textarea rows={2} className="mt-3 w-full rounded-lg border border-amber-400/35 bg-white px-3 py-2 text-xs font-semibold text-black" value={photoBypassReason} onChange={(event) => setPhotoBypassReason(event.target.value)} placeholder="Reason, e.g. Complete order data received directly from the OS spreadsheet; picker photos are not required."/> : null}
              </section>

              {message ? <div className="rounded-lg border border-[#31506a] bg-[#061524] px-3 py-2 text-xs font-semibold text-[#bfe8ff]">{fileBusy ? <Loader2 size={14} className="mr-2 inline animate-spin"/> : null}{message}</div> : null}

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#31506a] px-4 py-2.5 text-[11px] font-black">CANCEL</button>
                <button type="button" onClick={() => void applyRows()} disabled={fileBusy || busy || !targetReady || !rows.length || !selectedRows.length || Boolean(missingHeaders.length)} className="rounded-lg bg-cyan-400 px-5 py-2.5 text-[11px] font-black text-[#04111d] disabled:opacity-40">{fileBusy ? "PREPARING…" : `FILL ${selectedRows.length || ""} ROW(S)`}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
