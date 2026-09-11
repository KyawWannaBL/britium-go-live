// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCreatePickup,
  useCreateShipment,
  usePickups,
  useShipments,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import api from "../lib/apiClient";
import { API_ROUTES } from "../lib/config";
import { calculateDeliveryPricingMath } from "../lib/deliveryPricingMath";

type Tab = "pickup" | "delivery" | "list" | "correct";
type PaymentStatus = "PAID" | "UNPAID";
type SourceType = "DEO" | "MER" | "CUS" | "OS";

type DeliveryLine = {
  lineNo: number;
  deliveryId: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  senderTownship: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  receiverTownship: string;
  serviceType: string;
  itemPrice: string;
  itemPaymentStatus: PaymentStatus;
  merchantCustomerDeliveryCharge: string;
  deliveryPaymentStatus: PaymentStatus;
  weightKg: string;
  remarks: string;
  evidence: File[];
  osCharge: number;
  overweightCharge: number;
  printedCharge: number;
  receivable: number;
};

type PickupForm = {
  existingPickupId: string;
  pickupId: string;
  pickupDate: string;
  sourceType: SourceType;
  merchantName: string;
  merchantCode: string;
  contactName: string;
  contactPhone: string;
  pickupAddress: string;
  pickupCity: string;
  pickupTownship: string;
  pickupBy: string;
  pickupBy2: string;
  totalWayCount: string;
  status: string;
};

const CITY_TOWNSHIPS: Record<string, string[]> = {
  Yangon: [
    "Ahlone",
    "Bahan",
    "Dagon",
    "Hlaing",
    "Kamaryut",
    "Kyauktada",
    "Lanmadaw",
    "Latha",
    "Mayangone",
    "Mingalar Taung Nyunt",
    "North Dagon",
    "Pabedan",
    "Pazundaung",
    "Sanchaung",
    "South Okkalapa",
    "Tamwe",
    "Thingangyun",
    "Yankin",
  ],
  Mandalay: [
    "Aungmyethazan",
    "Chanayethazan",
    "Chanmyathazi",
    "Maha Aungmyay",
    "Pyigyidagun",
    "Amarapura",
  ],
  Bago: ["Bago", "Taungoo", "Pyay"],
  Naypyitaw: ["Zabuthiri", "Tatkon", "Dekkhinathiri"],
  Mon: ["Mawlamyine", "Thaton"],
  Shan: ["Taunggyi", "Lashio"],
};

const CITY_OPTIONS = Object.keys(CITY_TOWNSHIPS);
const SERVICE_OPTIONS = ["standard", "next_day", "same_day", "scheduled"];

const PORTAL_TARIFF_PREVIEW: Record<string, { baseWeightKg: number; baseDeliveryFee: number; overweightPerKg: number }> = {
  standard: { baseWeightKg: 3, baseDeliveryFee: 4000, overweightPerKg: 2500 },
  next_day: { baseWeightKg: 3, baseDeliveryFee: 3500, overweightPerKg: 2000 },
  same_day: { baseWeightKg: 3, baseDeliveryFee: 6000, overweightPerKg: 3000 },
  scheduled: { baseWeightKg: 3, baseDeliveryFee: 4500, overweightPerKg: 2500 },
};

const INITIAL_PICKUP: PickupForm = {
  existingPickupId: "",
  pickupId: "",
  pickupDate: new Date().toISOString().slice(0, 10),
  sourceType: "DEO",
  merchantName: "",
  merchantCode: "",
  contactName: "",
  contactPhone: "",
  pickupAddress: "",
  pickupCity: "Yangon",
  pickupTownship: "Lanmadaw",
  pickupBy: "",
  pickupBy2: "",
  totalWayCount: "1",
  status: "Draft",
};

function fmtDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function money(value: number | string) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function orgAbbr(input: string, fallback = "GEN") {
  const words = cleanText(input)
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) {
    const one = words[0].replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    return one || fallback;
  }
  return words
    .slice(0, 3)
    .map((w) => w.replace(/[^A-Za-z]/g, "").slice(0, 1))
    .join("")
    .toUpperCase()
    .padEnd(3, "X")
    .slice(0, 3);
}

function parsePickupSeqFromId(id: string) {
  const m = /^P\d{4}-[A-Z0-9]{3}-(\d{3})$/i.exec(cleanText(id));
  return m ? Number(m[1]) : 0;
}

function parseDeliverySeqFromId(id: string) {
  const m = /^D\d{4}-[A-Z0-9]{3}-(\d{3})$/i.exec(cleanText(id));
  return m ? Number(m[1]) : 0;
}

function makePickupId(date: string, org: string, seq: number) {
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  return `P${mmdd}-${org}-${String(seq).padStart(3, "0")}`;
}

function makeDeliveryId(date: string, org: string, seq: number) {
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  return `D${mmdd}-${org}-${String(seq).padStart(3, "0")}`;
}

function emptyLine(index: number): DeliveryLine {
  return {
    lineNo: index + 1,
    deliveryId: "",
    senderName: "",
    senderPhone: "",
    senderAddress: "",
    senderCity: "Yangon",
    senderTownship: "Lanmadaw",
    receiverName: "",
    receiverPhone: "",
    receiverAddress: "",
    receiverCity: "Yangon",
    receiverTownship: "Lanmadaw",
    serviceType: "standard",
    itemPrice: "0",
    itemPaymentStatus: "UNPAID",
    merchantCustomerDeliveryCharge: "0",
    deliveryPaymentStatus: "UNPAID",
    weightKg: "0",
    remarks: "",
    evidence: [],
    osCharge: 0,
    overweightCharge: 0,
    printedCharge: 0,
    receivable: 0,
  };
}

function withCount(prev: DeliveryLine[], count: number) {
  const next = [...prev];
  if (next.length < count) {
    for (let i = next.length; i < count; i += 1) next.push(emptyLine(i));
  } else if (next.length > count) {
    next.length = count;
  }
  return next.map((row, index) => ({ ...row, lineNo: index + 1 }));
}

function computeCharges(line: DeliveryLine) {
  const numberOrZero = (value: unknown) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const tariff = PORTAL_TARIFF_PREVIEW[line.serviceType] || PORTAL_TARIFF_PREVIEW.standard;
  const result = calculateDeliveryPricingMath({
    ...tariff,
    weightKg: numberOrZero(line.weightKg),
    itemPrice: numberOrZero(line.itemPrice),
    itemPaymentStatus: line.itemPaymentStatus,
    merchantCustomerDeliveryCharge: numberOrZero(line.merchantCustomerDeliveryCharge),
    deliveryPaymentStatus: line.deliveryPaymentStatus,
  });
  return {
    osCharge: result.osDeliveryCharge,
    overweightCharge: result.overweightSurcharge,
    printedCharge: result.printedWaybillDeliveryCharge,
    receivable: result.receivable,
    osTotalCod: result.osTotalCod,
    waybillTotal: result.waybillTotalCod,
    baseFee: result.baseDeliveryFee,
  };
}

function fileDownload(name: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

function ErrBanner({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={S.errBanner}>⚠ {msg}</div>;
}

function SuccBanner({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={S.succBanner}>✓ {msg}</div>;
}

function StatusChip({ label }: { label: string }) {
  return <span style={S.statusChip}>{label}</span>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{label}</span>
      {children}
      {hint ? <span style={S.fieldHint}>{hint}</span> : null}
    </label>
  );
}

function MetricCard({ title, value, accent }: { title: string; value: React.ReactNode; accent: string }) {
  return (
    <div style={{ ...S.metricCard, borderTop: `4px solid ${accent}` }}>
      <div style={S.metricTitle}>{title}</div>
      <div style={S.metricValue}>{value}</div>
    </div>
  );
}

export default function DataEntryPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("pickup");
  const [pickup, setPickup] = useState<PickupForm>(INITIAL_PICKUP);
  const [rows, setRows] = useState<DeliveryLine[]>([emptyLine(0)]);
  const [activeRow, setActiveRow] = useState(0);
  const [correctAWB, setCorrectAWB] = useState("");
  const [correctField, setCorrectField] = useState("");
  const [correctValue, setCorrectValue] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedExistingPickup, setSelectedExistingPickup] = useState("");

  const qc = useQueryClient();
  const shipments = useShipments({ limit: "200" });
  const pickups = usePickups({ limit: "200" });
  const createShipment = useCreateShipment();
  const createPickup = useCreatePickup();

  const correctRecord = useMutation({
    mutationFn: ({ awb, field, value }: { awb: string; field: string; value: string }) =>
      api.patch(API_ROUTES.OPS_SHIPMENTS + `?awb=${awb}`, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "shipments"] }),
  });

  const shipmentRows = useMemo(() => (Array.isArray(shipments.data) ? shipments.data : []), [shipments.data]);
  const pickupRows = useMemo(() => (Array.isArray(pickups.data) ? pickups.data : []), [pickups.data]);

  const masterMerchants = useMemo(() => {
    const map = new Map<string, any>();
    shipmentRows.forEach((row: any) => {
      const key = cleanText(row.sender_name || row.merchant_name);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          phone: cleanText(row.sender_phone),
          address: cleanText(row.sender_address),
          township: cleanText(row.sender_township || row.pickup_township),
          city: cleanText(row.sender_city || row.pickup_city || "Yangon") || "Yangon",
        });
      }
    });
    pickupRows.forEach((row: any) => {
      const key = cleanText(row.merchant_name);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          phone: cleanText(row.contact_phone),
          address: cleanText(row.pickup_address),
          township: cleanText(row.pickup_township),
          city: cleanText(row.pickup_city || "Yangon") || "Yangon",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [shipmentRows, pickupRows]);

  const masterReceivers = useMemo(() => {
    const map = new Map<string, any>();
    shipmentRows.forEach((row: any) => {
      const key = cleanText(row.receiver_name);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          phone: cleanText(row.receiver_phone),
          address: cleanText(row.receiver_address),
          township: cleanText(row.receiver_township),
          city: cleanText(row.receiver_city || "Yangon") || "Yangon",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [shipmentRows]);

  const currentTownships = useMemo(
    () => CITY_TOWNSHIPS[pickup.pickupCity] || CITY_TOWNSHIPS.Yangon,
    [pickup.pickupCity]
  );

  const nextPickupSequence = useMemo(() => {
    if (pickup.pickupId) return parsePickupSeqFromId(pickup.pickupId) || 1;
    const org = orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType);
    const mmdd = pickup.pickupDate.slice(5, 7) + pickup.pickupDate.slice(8, 10);
    const matches = pickupRows
      .map((row: any) => cleanText(row.pickup_id || row.pickup_reference || row.id))
      .filter((id) => id.startsWith(`P${mmdd}-${org}-`))
      .map(parsePickupSeqFromId);
    return (matches.length ? Math.max(...matches) : 0) + 1;
  }, [pickup.pickupId, pickup.pickupDate, pickup.merchantCode, pickup.merchantName, pickup.sourceType, pickupRows]);

  const previewPickupId = useMemo(() => {
    if (pickup.pickupId) return pickup.pickupId;
    const org = orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType);
    return makePickupId(pickup.pickupDate, org, nextPickupSequence);
  }, [pickup.pickupId, pickup.pickupDate, pickup.merchantCode, pickup.merchantName, pickup.sourceType, nextPickupSequence]);

  const nextDeliveryBaseSeq = useMemo(() => {
    const org = orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType);
    const mmdd = pickup.pickupDate.slice(5, 7) + pickup.pickupDate.slice(8, 10);
    const matches = shipmentRows
      .map((row: any) => cleanText(row.delivery_id || row.tracking_no || row.awb))
      .filter((id) => id.startsWith(`D${mmdd}-${org}-`))
      .map(parseDeliverySeqFromId);
    return (matches.length ? Math.max(...matches) : 0) + 1;
  }, [shipmentRows, pickup.pickupDate, pickup.merchantCode, pickup.merchantName, pickup.sourceType]);

  useEffect(() => {
    setRows((prev) =>
      prev.map((row, index) => {
        const nextId = row.deliveryId || makeDeliveryId(pickup.pickupDate, orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType), nextDeliveryBaseSeq + index);
        return { ...row, deliveryId: nextId };
      })
    );
  }, [pickup.pickupDate, pickup.merchantCode, pickup.merchantName, pickup.sourceType, nextDeliveryBaseSeq]);

  useEffect(() => {
    const target = Math.max(1, Number(pickup.totalWayCount || 1));
    setRows((prev) => withCount(prev, target));
  }, [pickup.totalWayCount]);

  const activeLine = rows[activeRow] || emptyLine(0);

  function patchPickup(key: keyof PickupForm, value: string) {
    setPickup((prev) => ({ ...prev, [key]: value }));
    if (key === "existingPickupId" && !value) {
      setPickup((prev) => ({ ...prev, pickupId: "", status: "Draft" }));
    }
  }

  function applyMerchantSuggestion(name: string) {
    const matched = masterMerchants.find((m) => m.name === name);
    patchPickup("merchantName", name);
    if (!matched) return;
    setPickup((prev) => ({
      ...prev,
      merchantName: matched.name || prev.merchantName,
      contactPhone: matched.phone || prev.contactPhone,
      pickupAddress: matched.address || prev.pickupAddress,
      pickupTownship: matched.township || prev.pickupTownship,
      pickupCity: matched.city || prev.pickupCity,
    }));
    setRows((prev) => prev.map((row) => ({
      ...row,
      senderName: matched.name || row.senderName,
      senderPhone: matched.phone || row.senderPhone,
      senderAddress: matched.address || row.senderAddress,
      senderTownship: matched.township || row.senderTownship,
      senderCity: matched.city || row.senderCity,
    })));
  }

  function applyReceiverSuggestion(index: number, name: string) {
    const matched = masterReceivers.find((m) => m.name === name);
    patchLine(index, { receiverName: name });
    if (!matched) return;
    patchLine(index, {
      receiverName: matched.name || name,
      receiverPhone: matched.phone || "",
      receiverAddress: matched.address || "",
      receiverTownship: matched.township || rows[index]?.receiverTownship || "",
      receiverCity: matched.city || rows[index]?.receiverCity || "Yangon",
    });
  }

  function patchLine(index: number, patch: Partial<DeliveryLine>) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        const calc = computeCharges(next);
        return {
          ...next,
          osCharge: calc.osCharge,
          overweightCharge: calc.overweightCharge,
          printedCharge: calc.printedCharge,
          receivable: calc.receivable,
        };
      })
    );
  }

  async function savePickupBatch() {
    setSuccessMessage("");
    try {
      const payload = {
        pickup_id: pickup.pickupId || previewPickupId,
        scheduled_date: pickup.pickupDate,
        merchant_name: pickup.merchantName,
        merchant_id: pickup.merchantCode || undefined,
        pickup_address: pickup.pickupAddress,
        pickup_city: pickup.pickupCity,
        pickup_township: pickup.pickupTownship,
        parcel_count: Number(pickup.totalWayCount || rows.length || 1),
        time_window: "09:00-18:00",
        source_type: pickup.sourceType,
        contact_name: pickup.contactName,
        contact_phone: pickup.contactPhone,
        pickup_by: pickup.pickupBy,
        pickup_by_2: pickup.pickupBy2,
        notes: JSON.stringify({ status: pickup.status, ui: "enterprise_go_live_v2" }),
        deliveries: rows.map((row) => ({
          delivery_id: row.deliveryId,
          sender_name: row.senderName || pickup.merchantName,
          sender_phone: row.senderPhone || pickup.contactPhone,
          sender_address: row.senderAddress || pickup.pickupAddress,
          sender_city: row.senderCity || pickup.pickupCity,
          sender_township: row.senderTownship || pickup.pickupTownship,
          receiver_name: row.receiverName,
          receiver_phone: row.receiverPhone,
          receiver_address: row.receiverAddress,
          receiver_city: row.receiverCity,
          receiver_township: row.receiverTownship,
          service_type: row.serviceType,
          cod_amount: Number(row.itemPrice || 0),
          notes: row.remarks,
          meta: {
            line_no: row.lineNo,
            item_payment_status: row.itemPaymentStatus,
            delivery_payment_status: row.deliveryPaymentStatus,
            merchant_customer_delivery_charge: Number(row.merchantCustomerDeliveryCharge || 0),
            os_delivery_charge: row.osCharge,
            printed_waybill_delivery_charge: row.printedCharge,
            receivable: row.receivable,
            pickup_reference: pickup.pickupId || previewPickupId,
          },
        })),
      };

      const result = await createPickup.mutateAsync(payload as any);
      const savedPickupId = (result as any)?.pickup_id || (result as any)?.id || payload.pickup_id;
      setPickup((prev) => ({ ...prev, pickupId: savedPickupId, status: "Saved" }));
      setSuccessMessage(`Pickup batch saved as ${savedPickupId}`);
      qc.invalidateQueries({ queryKey: ["ops", "pickups"] });
    } catch (error: any) {
      setSuccessMessage("");
      alert(error?.message || "Failed to save pickup batch");
    }
  }

  async function saveDeliveryRow(index: number) {
    const row = rows[index];
    try {
      const evidenceNames = Array.from(row.evidence || []).map((f) => f.name);
      const shipment = await createShipment.mutateAsync({
        sender_name: row.senderName || pickup.merchantName,
        sender_phone: row.senderPhone || pickup.contactPhone,
        sender_address: row.senderAddress || pickup.pickupAddress,
        sender_city: row.senderCity || pickup.pickupCity,
        sender_township: row.senderTownship || pickup.pickupTownship,
        receiver_name: row.receiverName,
        receiver_phone: row.receiverPhone,
        receiver_address: row.receiverAddress,
        receiver_city: row.receiverCity,
        receiver_township: row.receiverTownship,
        cod_amount: Number(row.itemPrice || 0),
        service_type: row.serviceType,
        notes: JSON.stringify({
          pickup_id: pickup.pickupId || previewPickupId,
          delivery_id: row.deliveryId,
          item_payment_status: row.itemPaymentStatus,
          delivery_payment_status: row.deliveryPaymentStatus,
          merchant_customer_delivery_charge: Number(row.merchantCustomerDeliveryCharge || 0),
          os_delivery_charge: row.osCharge,
          printed_waybill_delivery_charge: row.printedCharge,
          receivable: row.receivable,
          evidence_files: evidenceNames,
        }),
      } as any);
      setSuccessMessage(`Delivery line ${row.deliveryId || index + 1} saved`);
      qc.invalidateQueries({ queryKey: ["ops", "shipments"] });
      return shipment;
    } catch (error: any) {
      alert(error?.message || "Failed to save delivery row");
      throw error;
    }
  }

  async function saveAllDeliveries() {
    for (let i = 0; i < rows.length; i += 1) {
      await saveDeliveryRow(i);
    }
  }

  function downloadTemplate() {
    const headers = [
      "sender_name",
      "sender_phone",
      "sender_address",
      "sender_city",
      "sender_township",
      "receiver_name",
      "receiver_phone",
      "receiver_address",
      "receiver_city",
      "receiver_township",
      "service_type",
      "item_price",
      "item_payment_status",
      "merchant_customer_delivery_charge",
      "delivery_payment_status",
      "weight_kg",
      "remarks",
    ];

    const sample = [
      pickup.merchantName || "Baby Genius",
      pickup.contactPhone || "09xxxxxxxxx",
      pickup.pickupAddress || "No. 1, Example Street",
      pickup.pickupCity || "Yangon",
      pickup.pickupTownship || "Lanmadaw",
      "Receiver Example",
      "09yyyyyyyyy",
      "No. 88, Customer Address",
      "Yangon",
      "Latha",
      "standard",
      "80000",
      "PAID",
      "2500",
      "PAID",
      "8",
      "Urgent item",
    ];

    fileDownload(
      `delivery-template-${previewPickupId}.csv`,
      [headers.join(","), sample.map(csvEscape).join(",")].join("\n")
    );
  }

  async function handleUploadTemplate(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) return;
    const nextRows = parsed.map((row: any, index: number) => {
      const base = createEmptyRow(index);
      const next = {
        ...base,
        lineNo: index + 1,
        deliveryId: makeDeliveryId(
          pickup.pickupDate,
          orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType),
          nextDeliveryBaseSeq + index
        ),
        senderName: row.sender_name || pickup.merchantName,
        senderPhone: row.sender_phone || pickup.contactPhone,
        senderAddress: row.sender_address || pickup.pickupAddress,
        senderCity: row.sender_city || pickup.pickupCity,
        senderTownship: row.sender_township || pickup.pickupTownship,
        receiverName: row.receiver_name || "",
        receiverPhone: row.receiver_phone || "",
        receiverAddress: row.receiver_address || "",
        receiverCity: row.receiver_city || "Yangon",
        receiverTownship: row.receiver_township || "Lanmadaw",
        serviceType: row.service_type || "standard",
        itemPrice: row.item_price || "0",
        itemPaymentStatus: row.item_payment_status === "PAID" ? "PAID" : "UNPAID",
        merchantCustomerDeliveryCharge: row.merchant_customer_delivery_charge || "0",
        deliveryPaymentStatus: row.delivery_payment_status === "PAID" ? "PAID" : "UNPAID",
        weightKg: row.weight_kg || "0",
        remarks: row.remarks || "",
      };
      const calc = computeCharges(next);
      return {
        ...next,
        osCharge: calc.osCharge,
        overweightCharge: calc.overweightCharge,
        printedCharge: calc.printedCharge,
        receivable: calc.receivable,
      };
    });

    setRows(nextRows);
    setPickup((prev) => ({ ...prev, totalWayCount: String(nextRows.length) }));
    setSuccessMessage(`${nextRows.length} rows loaded from template`);
  }

  async function handleEvidenceFiles(index: number, files: FileList | null) {
    const arr = Array.from(files || []);
    patchLine(index, { evidence: arr });
  }

  function loadExistingPickup(value: string) {
    setSelectedExistingPickup(value);
    const row = pickupRows.find((r: any) => cleanText(r.pickup_id || r.id) === value);
    if (!row) return;
    setPickup((prev) => ({
      ...prev,
      existingPickupId: value,
      pickupId: cleanText(row.pickup_id || row.id),
      pickupDate: String(row.scheduled_date || row.pickup_date || prev.pickupDate).slice(0, 10),
      merchantName: cleanText(row.merchant_name || prev.merchantName),
      merchantCode: cleanText(row.merchant_id || row.merchant_code || prev.merchantCode),
      pickupAddress: cleanText(row.pickup_address || prev.pickupAddress),
      pickupTownship: cleanText(row.pickup_township || prev.pickupTownship),
      pickupCity: cleanText(row.pickup_city || prev.pickupCity),
      contactName: cleanText(row.contact_name || prev.contactName),
      contactPhone: cleanText(row.contact_phone || prev.contactPhone),
      pickupBy: cleanText(row.pickup_by || prev.pickupBy),
      status: "Editing",
    }));
    setSuccessMessage(`Editing existing pickup ${value} — ID will be preserved on save.`);
  }

  const tabs = [
    { id: "pickup" as Tab, label: "🚚 Pickup Workspace" },
    { id: "delivery" as Tab, label: "🧾 Delivery Registration" },
    { id: "list" as Tab, label: "📋 Shipment List" },
    { id: "correct" as Tab, label: "✏️ Correct Record" },
  ];

  const EDITABLE_FIELDS = [
    "receiver_name",
    "receiver_phone",
    "receiver_address",
    "receiver_township",
    "receiver_city",
    "cod_amount",
    "notes",
  ];

  const recentExistingPickupIds = pickupRows
    .map((r: any) => cleanText(r.pickup_id || r.id))
    .filter(Boolean)
    .slice(0, 25);

  const currentTownshipsForDelivery = CITY_TOWNSHIPS[activeLine.receiverCity] || CITY_TOWNSHIPS.Yangon;

  return (
    <div style={S.page}>
      <header style={S.heroHeader}>
        <div>
          <div style={S.heroEyebrow}>Enterprise Delivery Registration</div>
          <h1 style={S.heroTitle}>Create Delivery & Pickup Workspace</h1>
          <p style={S.heroText}>
            State-of-the-art data intake for pickup batches and delivery ways with auto-generated IDs, master-data assisted registration,
            pre-defined city and township selectors, backend-ready pricing, and go-live operational controls.
          </p>
        </div>
        <div style={S.heroActions}>
          <div style={S.userChip}>{user?.full_name || user?.email}</div>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <div style={S.metricsGrid}>
        <MetricCard title="Pickup Preview ID" value={previewPickupId} accent="#0f766e" />
        <MetricCard title="Next Delivery ID" value={rows[activeRow]?.deliveryId || makeDeliveryId(pickup.pickupDate, previewOrg, nextDeliveryBaseSeq)} accent="#2563eb" />
        <MetricCard title="Total Ways" value={pickup.totalWayCount} accent="#7c3aed" />
        <MetricCard title="Receivable Preview" value={`${money(rows.reduce((sum, row) => sum + Number(row.receivable || 0), 0))} MMK`} accent="#ea580c" />
      </div>

      {successMessage ? <SuccBanner msg={successMessage} /> : null}
      {createPickup.isError ? <ErrBanner msg={createPickup.error?.message} /> : null}
      {createShipment.isError ? <ErrBanner msg={createShipment.error?.message} /> : null}
      {pickups.isError ? <ErrBanner msg={pickups.error?.message} /> : null}
      {shipments.isError ? <ErrBanner msg={shipments.error?.message} /> : null}

      <nav style={S.tabBar}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {tab === "pickup" && (
          <div style={S.twoColumn}>
            <section style={S.card}>
              <div style={S.cardHeader}>
                <div>
                  <div style={S.cardEyebrow}>Pickup Container</div>
                  <h2 style={S.h2}>Pickup Batch Registration</h2>
                </div>
                <StatusChip label={pickup.status} />
              </div>

              <div style={S.grid2}>
                <Field label="Edit Existing Pickup (optional)" hint="Select an existing pickup to keep the same ID while editing.">
                  <select style={S.input} value={selectedExistingPickup} onChange={(e) => loadExistingPickup(e.target.value)}>
                    <option value="">— New Pickup —</option>
                    {recentExistingPickupIds.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </Field>
                <Field label="Pickup Date">
                  <input type="date" style={S.input} value={pickup.pickupDate} onChange={(e) => patchPickup("pickupDate", e.target.value)} />
                </Field>
                <Field label="Source Type">
                  <select style={S.input} value={pickup.sourceType} onChange={(e) => patchPickup("sourceType", e.target.value)}>
                    <option value="DEO">Data Entry</option>
                    <option value="MER">Merchant</option>
                    <option value="CUS">Customer</option>
                    <option value="OS">Online Store</option>
                  </select>
                </Field>
                <Field label="Pickup ID" hint="Generated automatically. Preserved when editing an existing pickup.">
                  <input style={{ ...S.input, ...S.readOnlyInput }} value={pickup.pickupId || previewPickupId} readOnly />
                </Field>
              </div>

              <div style={S.sectionDivider}>Master Data Assisted Sender Registration</div>
              <div style={S.grid2}>
                <Field label="Merchant / Business Name">
                  <>
                    <input
                      list="merchant-master-list"
                      style={S.input}
                      value={pickup.merchantName}
                      onChange={(e) => patchPickup("merchantName", e.target.value)}
                      onBlur={(e) => applyMerchantSuggestion(e.target.value)}
                      placeholder="Type or select a registered merchant"
                    />
                    <datalist id="merchant-master-list">
                      {masterMerchants.map((m) => <option key={m.name} value={m.name} />)}
                    </datalist>
                  </>
                </Field>
                <Field label="Merchant Code / Abbreviation">
                  <input style={S.input} value={pickup.merchantCode} onChange={(e) => patchPickup("merchantCode", e.target.value)} placeholder="e.g. HMS" />
                </Field>
                <Field label="Contact Name">
                  <input style={S.input} value={pickup.contactName} onChange={(e) => patchPickup("contactName", e.target.value)} />
                </Field>
                <Field label="Contact Phone">
                  <input style={S.input} value={pickup.contactPhone} onChange={(e) => patchPickup("contactPhone", e.target.value)} />
                </Field>
                <Field label="Pickup City">
                  <select style={S.input} value={pickup.pickupCity} onChange={(e) => patchPickup("pickupCity", e.target.value)}>
                    {CITY_OPTIONS.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </Field>
                <Field label="Pickup Township">
                  <select style={S.input} value={pickup.pickupTownship} onChange={(e) => patchPickup("pickupTownship", e.target.value)}>
                    {(CITY_TOWNSHIPS[pickup.pickupCity] || []).map((town) => <option key={town} value={town}>{town}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Pickup Address">
                <textarea style={{ ...S.input, minHeight: 88 }} value={pickup.pickupAddress} onChange={(e) => patchPickup("pickupAddress", e.target.value)} />
              </Field>

              <div style={S.grid3}>
                <Field label="Picker 1">
                  <input style={S.input} value={pickup.pickupBy} onChange={(e) => patchPickup("pickupBy", e.target.value)} />
                </Field>
                <Field label="Picker 2">
                  <input style={S.input} value={pickup.pickupBy2} onChange={(e) => patchPickup("pickupBy2", e.target.value)} />
                </Field>
                <Field label="Total Way Count">
                  <input type="number" min={1} style={S.input} value={pickup.totalWayCount} onChange={(e) => patchPickup("totalWayCount", e.target.value)} />
                </Field>
              </div>

              <div style={S.actionRow}>
                <button style={S.secondaryBtn} onClick={downloadTemplate}>Download CSV Template</button>
                <label style={S.secondaryBtn}>
                  Upload CSV
                  <input type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && handleUploadTemplate(e.target.files[0])} />
                </label>
                <button style={S.primaryBtn} onClick={savePickupBatch} disabled={createPickup.isPending}>
                  {createPickup.isPending ? "Saving…" : pickup.pickupId ? "Save Pickup" : "Create Pickup"}
                </button>
              </div>
            </section>

            <section style={S.card}>
              <div style={S.cardHeader}>
                <div>
                  <div style={S.cardEyebrow}>Delivery Container</div>
                  <h2 style={S.h2}>Auto-Generated Delivery Ways</h2>
                </div>
                <button style={S.secondaryBtn} onClick={() => setTab("delivery")}>Open Delivery Entry</button>
              </div>

              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {['Sr.', 'Delivery ID', 'Receiver', 'Township', 'OS Charge', 'Waybill Charge', 'Receivable', 'Edit'].map((c) => <th key={c} style={S.th}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.deliveryId}-${index}`} style={index === activeRow ? S.tableRowActive : undefined}>
                        <td style={S.td}>{index + 1}</td>
                        <td style={S.tdStrong}>{row.deliveryId || makeDeliveryId(pickup.pickupDate, previewOrg, nextDeliveryBaseSeq + index)}</td>
                        <td style={S.td}>{row.receiverName || '—'}</td>
                        <td style={S.td}>{row.receiverTownship || '—'}</td>
                        <td style={S.td}>{money(row.osCharge)}</td>
                        <td style={S.td}>{money(row.printedCharge)}</td>
                        <td style={S.tdStrong}>{money(row.receivable)}</td>
                        <td style={S.td}>
                          <button style={S.tableActionBtn} onClick={() => { setActiveRow(index); setTab('delivery'); }}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={S.miniNote}>
                Pickup sequence continues automatically for the same date and merchant abbreviation. If today already has 50 pickup ways, the next new pickup starts from 051. Editing an existing pickup keeps the same Pickup ID.
              </div>
            </section>
          </div>
        )}

        {tab === "delivery" && (
          <div style={S.twoColumnWide}>
            <section style={S.card}>
              <div style={S.cardHeader}>
                <div>
                  <div style={S.cardEyebrow}>Delivery Registration Form</div>
                  <h2 style={S.h2}>Enterprise Delivery Data Entry</h2>
                </div>
                <div style={S.badgeGroup}>
                  <StatusChip label={pickup.pickupId || previewPickupId} />
                  <StatusChip label={activeLine.deliveryId || makeDeliveryId(pickup.pickupDate, previewOrg, nextDeliveryBaseSeq + activeRow)} />
                </div>
              </div>

              <div style={S.subHeaderGrid}>
                <InfoBox label="Pickup Way ID" value={pickup.pickupId || previewPickupId} />
                <InfoBox label="Pickup Date" value={fmtDate(pickup.pickupDate)} />
                <InfoBox label="Picker 1" value={pickup.pickupBy || '—'} />
                <InfoBox label="Picker 2" value={pickup.pickupBy2 || '—'} />
                <InfoBox label="Merchant" value={pickup.merchantName || '—'} />
                <InfoBox label="Status" value={pickup.status} accent="#22c55e" />
              </div>

              <div style={S.sectionDivider}>Receiver and Delivery Details</div>
              <div style={S.grid2}>
                <Field label="Delivery Way ID">
                  <input style={{ ...S.input, ...S.readOnlyInput }} value={activeLine.deliveryId} readOnly />
                </Field>
                <Field label="Way Count">
                  <input style={{ ...S.input, ...S.readOnlyInput }} value={`${activeRow + 1} of ${rows.length}`} readOnly />
                </Field>
                <Field label="Receiver Name">
                  <>
                    <input
                      list="receiver-master-list"
                      style={S.input}
                      value={activeLine.receiverName}
                      onChange={(e) => patchLine(activeRow, { receiverName: e.target.value })}
                      onBlur={(e) => applyReceiverSuggestion(activeRow, e.target.value)}
                      placeholder="Search registered customers"
                    />
                    <datalist id="receiver-master-list">
                      {masterReceivers.map((r) => <option key={r.name} value={r.name} />)}
                    </datalist>
                  </>
                </Field>
                <Field label="Phone">
                  <input style={S.input} value={activeLine.receiverPhone} onChange={(e) => patchLine(activeRow, { receiverPhone: e.target.value })} />
                </Field>
                <Field label="City">
                  <select style={S.input} value={activeLine.receiverCity} onChange={(e) => patchLine(activeRow, { receiverCity: e.target.value, receiverTownship: CITY_TOWNSHIPS[e.target.value]?.[0] || '' })}>
                    {CITY_OPTIONS.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </Field>
                <Field label="Township">
                  <select style={S.input} value={activeLine.receiverTownship} onChange={(e) => patchLine(activeRow, { receiverTownship: e.target.value })}>
                    {currentTownshipsForDelivery.map((town) => <option key={town} value={town}>{town}</option>)}
                  </select>
                </Field>
                <Field label="Destination">
                  <input style={S.input} value={activeLine.destination} onChange={(e) => patchLine(activeRow, { destination: e.target.value })} />
                </Field>
                <Field label="Weight (kg)">
                  <input type="number" min={0} step="0.01" style={S.input} value={activeLine.weightKg} onChange={(e) => patchLine(activeRow, { weightKg: e.target.value })} />
                </Field>
              </div>

              <Field label="Address">
                <textarea style={{ ...S.input, minHeight: 110 }} value={activeLine.receiverAddress} onChange={(e) => patchLine(activeRow, { receiverAddress: e.target.value })} />
              </Field>

              <Field label="Remarks">
                <textarea style={{ ...S.input, minHeight: 90 }} value={activeLine.remarks} onChange={(e) => patchLine(activeRow, { remarks: e.target.value })} />
              </Field>

              <div style={S.sectionDivider}>Tariff, COD, and Payment Conditions</div>
              <div style={S.grid2}>
                <Field label="Service Type">
                  <select style={S.input} value={activeLine.serviceType} onChange={(e) => patchLine(activeRow, { serviceType: e.target.value })}>
                    {SERVICE_OPTIONS.map((service) => <option key={service} value={service}>{service}</option>)}
                  </select>
                </Field>
                <Field label="Photo Evidence Upload">
                  <input type="file" multiple accept="image/*" style={S.input} onChange={(e) => handleEvidenceFiles(activeRow, e.target.files)} />
                </Field>
                <Field label="Item Price (OS / Merchant)">
                  <div style={S.inlineInputRow}>
                    <input type="number" min={0} step={1} style={S.input} value={activeLine.itemPrice} onChange={(e) => patchLine(activeRow, { itemPrice: e.target.value })} />
                    <select style={S.inputSmall} value={activeLine.itemPaymentStatus} onChange={(e) => patchLine(activeRow, { itemPaymentStatus: e.target.value as PaymentStatus })}>
                      <option value="PAID">Paid</option>
                      <option value="UNPAID">Unpaid</option>
                    </select>
                  </div>
                </Field>
                <Field label="Delivery Charge agreed with Customer">
                  <div style={S.inlineInputRow}>
                    <input type="number" min={0} step={1} style={S.input} value={activeLine.merchantCustomerDeliveryCharge} onChange={(e) => patchLine(activeRow, { merchantCustomerDeliveryCharge: e.target.value })} />
                    <select style={S.inputSmall} value={activeLine.deliveryPaymentStatus} onChange={(e) => patchLine(activeRow, { deliveryPaymentStatus: e.target.value as PaymentStatus })}>
                      <option value="PAID">Paid</option>
                      <option value="UNPAID">Unpaid</option>
                    </select>
                  </div>
                </Field>
              </div>

              <div style={S.actionRow}>
                <button style={S.secondaryBtn} onClick={() => setActiveRow((v) => Math.max(0, v - 1))}>Previous</button>
                <button style={S.secondaryBtn} onClick={() => setActiveRow((v) => Math.min(rows.length - 1, v + 1))}>Next</button>
                <button style={S.secondaryBtn} onClick={() => patchLine(activeRow, computeCharges(activeLine) as any)}>Recalculate</button>
                <button style={S.primaryBtn} onClick={() => saveDeliveryRow(activeRow)} disabled={createShipment.isPending}>Save This Delivery</button>
                <button style={S.primaryBtn} onClick={saveAllDeliveries} disabled={createShipment.isPending}>Save All Deliveries</button>
              </div>
            </section>

            <aside style={S.sidePanel}>
              <div style={S.sidePanelHeader}>Backend Calculation Preview</div>
              <MetricCard title="OS Delivery Charge" value={`${money(activeLine.osCharge)} MMK`} accent="#2563eb" />
              <MetricCard title="Overweight Surcharge" value={`${money(activeLine.overweightCharge)} MMK`} accent="#f97316" />
              <MetricCard title="Waybill Charge (Higher of OS / Merchant)" value={`${money(activeLine.printedCharge)} MMK`} accent="#8b5cf6" />
              <MetricCard title="Receivable" value={`${money(activeLine.receivable)} MMK`} accent="#16a34a" />
              <div style={S.sidePanelNote}>
                The waybill should print the higher delivery charge between your OS rate and the merchant-agreed customer charge. Internal data entry keeps both values visible for auditing and settlement.
              </div>
            </aside>
          </div>
        )}

        {tab === "list" && (
          <section style={S.card}>
            <div style={S.cardHeader}>
              <div>
                <div style={S.cardEyebrow}>Operations Snapshot</div>
                <h2 style={S.h2}>Recent Shipments</h2>
              </div>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>{["AWB", "Sender", "Receiver", "Township", "COD", "Service", "Status", "Created"].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {shipmentRows.map((r: any, i: number) => (
                    <tr key={String(r.id ?? i)} style={i % 2 === 0 ? undefined : S.tableAlt}>
                      <td style={S.tdStrong}>{String(r.awb ?? r.delivery_id ?? "")}</td>
                      <td style={S.td}>{String(r.sender_name ?? "")}</td>
                      <td style={S.td}>{String(r.receiver_name ?? "")}</td>
                      <td style={S.td}>{String(r.receiver_township ?? "")}</td>
                      <td style={S.td}>{money(r.cod_amount ?? 0)} MMK</td>
                      <td style={S.td}>{String(r.service_type ?? "")}</td>
                      <td style={S.td}><StatusChip label={String(r.status ?? "created")} /></td>
                      <td style={S.td}>{fmtDate(r.created_at as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "correct" && (
          <section style={{ ...S.card, maxWidth: 720 }}>
            <div style={S.cardHeader}>
              <div>
                <div style={S.cardEyebrow}>Audit-safe correction</div>
                <h2 style={S.h2}>Correct Shipment Record</h2>
              </div>
            </div>
            <p style={S.subtleText}>Only non-sensitive fields can be changed. All changes should be reviewed in backend audit logs.</p>
            {correctRecord.isError ? <ErrBanner msg={correctRecord.error?.message} /> : null}
            {correctRecord.isSuccess ? <SuccBanner msg="Record corrected successfully" /> : null}
            <form style={S.form} onSubmit={async (e) => {
              e.preventDefault();
              await correctRecord.mutateAsync({ awb: correctAWB, field: correctField, value: correctValue });
              setCorrectAWB("");
              setCorrectField("");
              setCorrectValue("");
            }}>
              <Field label="AWB / Tracking Number">
                <input required style={S.input} value={correctAWB} onChange={(e) => setCorrectAWB(e.target.value)} />
              </Field>
              <Field label="Field to Correct">
                <select required style={S.input} value={correctField} onChange={(e) => setCorrectField(e.target.value)}>
                  <option value="">— Select field —</option>
                  {EDITABLE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="New Value">
                <input required style={S.input} value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} />
              </Field>
              <button type="submit" style={S.primaryBtn} disabled={correctRecord.isPending}>
                {correctRecord.isPending ? "Saving…" : "Save Correction"}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

function InfoBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...S.infoBox, borderColor: accent || '#d7e3f4' }}>
      <div style={S.infoLabel}>{label}</div>
      <div style={S.infoValue}>{value}</div>
    </div>
  );
}

const S: Record<string, any> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #eef4fb 0%, #f8fbff 48%, #edf5ff 100%)',
    padding: 24,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: '#10233f',
  },
  heroHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    padding: 28,
    borderRadius: 28,
    background: 'linear-gradient(135deg, #ffffff 0%, #f3f9ff 100%)',
    border: '1px solid #dce9f8',
    boxShadow: '0 12px 36px rgba(15, 23, 42, 0.08)',
    marginBottom: 20,
  },
  heroEyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.22em',
    color: '#0f766e',
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 900,
    margin: 0,
    color: '#0d2c54',
  },
  heroText: {
    marginTop: 12,
    maxWidth: 860,
    color: '#5f7187',
    lineHeight: 1.6,
    fontSize: 14,
  },
  heroActions: { display: 'flex', gap: 12, alignItems: 'center' },
  userChip: {
    padding: '10px 14px',
    borderRadius: 14,
    background: '#eff6ff',
    border: '1px solid #d8e9ff',
    fontWeight: 700,
    color: '#1d4ed8',
    fontSize: 12,
  },
  logoutBtn: {
    border: 'none',
    background: '#0d2c54',
    color: '#fff',
    borderRadius: 14,
    padding: '11px 16px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(13, 44, 84, 0.18)',
    transition: 'transform .2s ease, box-shadow .2s ease',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: '#fff',
    borderRadius: 22,
    border: '1px solid #dce9f8',
    padding: 18,
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
    transition: 'transform .2s ease, box-shadow .2s ease',
  },
  metricTitle: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#6b7280' },
  metricValue: { marginTop: 10, fontSize: 24, fontWeight: 900, color: '#0d2c54', lineHeight: 1.2 },
  errBanner: {
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
    padding: '12px 16px',
    borderRadius: 16,
    marginBottom: 12,
    fontWeight: 700,
  },
  succBanner: {
    border: '1px solid #bbf7d0',
    background: '#f0fdf4',
    color: '#166534',
    padding: '12px 16px',
    borderRadius: 16,
    marginBottom: 12,
    fontWeight: 700,
  },
  tabBar: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  tab: {
    border: '1px solid #dce9f8',
    background: '#fff',
    color: '#47617f',
    borderRadius: 16,
    padding: '12px 16px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all .2s ease',
  },
  tabActive: {
    border: '1px solid #0d2c54',
    background: 'linear-gradient(135deg, #0d2c54 0%, #1f4b84 100%)',
    color: '#fff',
    borderRadius: 16,
    padding: '12px 16px',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 10px 22px rgba(13, 44, 84, 0.18)',
  },
  main: { display: 'flex', flexDirection: 'column', gap: 20 },
  twoColumn: { display: 'grid', gridTemplateColumns: 'minmax(380px, 460px) minmax(0, 1fr)', gap: 20 },
  twoColumnWide: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20 },
  card: {
    background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
    borderRadius: 28,
    border: '1px solid #dce9f8',
    padding: 24,
    boxShadow: '0 16px 36px rgba(15, 23, 42, 0.06)',
    transition: 'transform .25s ease, box-shadow .25s ease',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 },
  cardEyebrow: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#64748b', marginBottom: 6 },
  h2: { margin: 0, fontSize: 24, fontWeight: 900, color: '#0d2c54' },
  badgeGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  statusChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 12px',
    borderRadius: 999,
    border: '1px solid #d8e9ff',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 800,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4b5f78' },
  fieldHint: { fontSize: 11, color: '#7c8ea4' },
  input: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    border: '1px solid #d7e3f4',
    background: '#f8fbff',
    padding: '12px 14px',
    fontSize: 14,
    color: '#10233f',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color .2s ease, box-shadow .2s ease, transform .2s ease',
  },
  inputSmall: {
    minHeight: 48,
    borderRadius: 16,
    border: '1px solid #d7e3f4',
    background: '#f8fbff',
    padding: '12px 14px',
    fontSize: 14,
    color: '#10233f',
    outline: 'none',
    minWidth: 132,
  },
  inlineInputRow: { display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 },
  readOnlyInput: { background: '#eef4fb', fontWeight: 800, color: '#0d2c54' },
  sectionDivider: {
    margin: '18px 0 14px',
    paddingTop: 16,
    borderTop: '1px dashed #d7e3f4',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#64748b',
  },
  actionRow: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  primaryBtn: {
    border: 'none',
    background: 'linear-gradient(135deg, #0d2c54 0%, #1f4b84 100%)',
    color: '#fff',
    borderRadius: 16,
    padding: '13px 18px',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 10px 22px rgba(13,44,84,0.16)',
    transition: 'transform .2s ease, box-shadow .2s ease',
  },
  secondaryBtn: {
    border: '1px solid #d7e3f4',
    background: '#fff',
    color: '#26415f',
    borderRadius: 16,
    padding: '13px 18px',
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'all .2s ease',
  },
  tableWrap: {
    overflowX: 'auto' as const,
    border: '1px solid #dce9f8',
    borderRadius: 20,
    background: '#fff',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: {
    textAlign: 'left' as const,
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: '#64748b',
    padding: '14px 16px',
    background: '#f8fbff',
    borderBottom: '1px solid #dce9f8',
    whiteSpace: 'nowrap' as const,
  },
  td: { padding: '14px 16px', borderBottom: '1px solid #eef4fb', fontSize: 14, color: '#243b53' },
  tdStrong: { padding: '14px 16px', borderBottom: '1px solid #eef4fb', fontSize: 14, color: '#0d2c54', fontWeight: 900 },
  tableActionBtn: {
    border: '1px solid #d7e3f4',
    background: '#fff',
    borderRadius: 12,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#1e3a8a',
  },
  tableAlt: { background: '#fbfdff' },
  tableRowActive: { background: '#eff6ff' },
  miniNote: { marginTop: 14, fontSize: 12, lineHeight: 1.6, color: '#61738a' },
  subHeaderGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 20 },
  infoBox: {
    background: '#f8fbff',
    border: '1px solid #d7e3f4',
    borderRadius: 18,
    padding: '12px 14px',
    minHeight: 84,
  },
  infoLabel: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' },
  infoValue: { marginTop: 10, fontSize: 16, fontWeight: 800, color: '#0d2c54' },
  sidePanel: {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
    borderRadius: 28,
    border: '1px solid #dce9f8',
    padding: 20,
    boxShadow: '0 16px 36px rgba(15, 23, 42, 0.06)',
    alignSelf: 'start',
    position: 'sticky' as const,
    top: 20,
  },
  sidePanelHeader: { fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#4b5f78', marginBottom: 14 },
  sidePanelNote: { marginTop: 14, fontSize: 12, lineHeight: 1.7, color: '#61738a' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  subtleText: { color: '#64748b', marginTop: 0, marginBottom: 20, fontSize: 14 },
};
