// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Download,
  Package2,
  Printer,
  QrCode,
  Save,
  Upload,
  Calculator,
  FileUp,
  Truck,
} from "lucide-react";

type SourceType = "MER" | "CUS" | "OS" | "DEO";
type PayStatus = "PAID" | "UNPAID";

type EvidenceFile = {
  name: string;
  type: string;
  dataUrl: string;
};

type DeliveryRow = {
  id?: string;
  deliveryId: string;
  lineNo: number;
  receiverName: string;
  receiverPhone: string;
  township: string;
  destination: string;
  deliveryAddress: string;
  remarks: string;
  serviceType: string;
  weightKg: string;
  itemPrice: string;
  itemPaymentStatus: PayStatus;
  merchantCustomerDeliveryCharge: string;
  deliveryPaymentStatus: PayStatus;
  baseDeliveryFee: number;
  overweightSurcharge: number;
  osDeliveryCharge: number;
  printedWaybillDeliveryCharge: number;
  osTotalCod: number;
  waybillTotalCod: number;
  receivable: number;
  evidenceFiles: File[];
};

type PickupForm = {
  pickupId: string;
  pickupDate: string;
  sourceType: SourceType;
  merchantName: string;
  merchantCode: string;
  contactName: string;
  contactPhone: string;
  pickupAddress: string;
  pickupTownship: string;
  pickupBy: string;
  totalWayCount: string;
};

const today = new Date().toISOString().slice(0, 10);

function money(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function orgAbbr(input: string, fallback = "GEN") {
  const words = String(input || "")
    .trim()
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

function createEmptyRow(index: number): DeliveryRow {
  return {
    deliveryId: "",
    lineNo: index + 1,
    receiverName: "",
    receiverPhone: "",
    township: "",
    destination: "",
    deliveryAddress: "",
    remarks: "",
    serviceType: "standard",
    weightKg: "0",
    itemPrice: "0",
    itemPaymentStatus: "UNPAID",
    merchantCustomerDeliveryCharge: "0",
    deliveryPaymentStatus: "UNPAID",
    baseDeliveryFee: 0,
    overweightSurcharge: 0,
    osDeliveryCharge: 0,
    printedWaybillDeliveryCharge: 0,
    osTotalCod: 0,
    waybillTotalCod: 0,
    receivable: 0,
    evidenceFiles: [],
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

export default function CreateDelivery() {
  const [searchParams] = useSearchParams();
  const defaultSource = (searchParams.get("source") || "MER").toUpperCase() as SourceType;
  const pickupIdFromQuery = searchParams.get("pickup_id") || "";

  const [activeTab, setActiveTab] = useState<"pickup" | "delivery">("pickup");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [pickup, setPickup] = useState<PickupForm>({
    pickupId: "",
    pickupDate: today,
    sourceType: defaultSource || "MER",
    merchantName: "",
    merchantCode: "",
    contactName: "",
    contactPhone: "",
    pickupAddress: "",
    pickupTownship: "",
    pickupBy: "",
    totalWayCount: "1",
  });

  const [rows, setRows] = useState<DeliveryRow[]>([createEmptyRow(0)]);
  const [toast, setToast] = useState("");

  const previewOrg = useMemo(
    () => orgAbbr(pickup.merchantCode || pickup.merchantName || pickup.sourceType, pickup.sourceType),
    [pickup.merchantCode, pickup.merchantName, pickup.sourceType]
  );

  useEffect(() => {
    if (!pickupIdFromQuery) return;

    async function loadExistingPickup() {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/pickups?pickup_id=${encodeURIComponent(pickupIdFromQuery)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load pickup");

        setPickup({
          pickupId: data.pickup.pickup_id,
          pickupDate: String(data.pickup.pickup_date).slice(0, 10),
          sourceType: data.pickup.source_type,
          merchantName: data.pickup.merchant_name || "",
          merchantCode: data.pickup.merchant_code || "",
          contactName: data.pickup.contact_name || "",
          contactPhone: data.pickup.contact_phone || "",
          pickupAddress: data.pickup.pickup_address || "",
          pickupTownship: data.pickup.pickup_township || "",
          pickupBy: data.pickup.pickup_by || "",
          totalWayCount: String(data.pickup.total_way_count || 1),
        });

        setRows(
          (data.deliveries || []).map((row: any, index: number) => ({
            id: row.id,
            deliveryId: row.delivery_id,
            lineNo: row.line_no || index + 1,
            receiverName: row.receiver_name || "",
            receiverPhone: row.receiver_phone || "",
            township: row.township || "",
            destination: row.destination || "",
            deliveryAddress: row.delivery_address || "",
            remarks: row.remarks || "",
            serviceType: row.service_type || "standard",
            weightKg: String(row.weight_kg ?? 0),
            itemPrice: String(row.item_price ?? 0),
            itemPaymentStatus: row.item_payment_status === "PAID" ? "PAID" : "UNPAID",
            merchantCustomerDeliveryCharge: String(row.merchant_customer_delivery_charge ?? 0),
            deliveryPaymentStatus: row.delivery_payment_status === "PAID" ? "PAID" : "UNPAID",
            baseDeliveryFee: Number(row.base_delivery_fee || 0),
            overweightSurcharge: Number(row.overweight_surcharge || 0),
            osDeliveryCharge: Number(row.os_delivery_charge || 0),
            printedWaybillDeliveryCharge: Number(row.printed_waybill_delivery_charge || 0),
            osTotalCod: Number(row.os_total_cod || 0),
            waybillTotalCod: Number(row.waybill_total_cod || 0),
            receivable: Number(row.receivable || 0),
            evidenceFiles: [],
          }))
        );
      } catch (error: any) {
        setToast(error?.message || "Failed to load pickup");
      } finally {
        setLoading(false);
      }
    }

    void loadExistingPickup();
  }, [pickupIdFromQuery]);

  function syncRowCount(countString: string) {
    const count = Math.max(1, Number(countString || 1));
    setRows((prev) => {
      const next = [...prev];
      if (next.length < count) {
        for (let i = next.length; i < count; i += 1) next.push(createEmptyRow(i));
      }
      if (next.length > count) next.length = count;
      return next.map((row, i) => ({ ...row, lineNo: i + 1 }));
    });
  }

  function setPickupField(key: keyof PickupForm, value: string) {
    setPickup((prev) => ({ ...prev, [key]: value }));
    if (key === "totalWayCount") syncRowCount(value);
  }

  function patchRow(index: number, patch: Partial<DeliveryRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function recalcRow(index: number) {
    const row = rows[index];
    const res = await fetch("/api/v1/deliveries/recalc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        township: row.township,
        serviceType: row.serviceType,
        weightKg: row.weightKg,
        itemPrice: row.itemPrice,
        itemPaymentStatus: row.itemPaymentStatus,
        merchantCustomerDeliveryCharge: row.merchantCustomerDeliveryCharge,
        deliveryPaymentStatus: row.deliveryPaymentStatus,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to recalculate");

    patchRow(index, {
      baseDeliveryFee: data.data.baseDeliveryFee,
      overweightSurcharge: data.data.overweightSurcharge,
      osDeliveryCharge: data.data.osDeliveryCharge,
      printedWaybillDeliveryCharge: data.data.printedWaybillDeliveryCharge,
      osTotalCod: data.data.osTotalCod,
      waybillTotalCod: data.data.waybillTotalCod,
      receivable: data.data.receivable,
    });
  }

  async function recalcAll() {
    setLoading(true);
    try {
      for (let i = 0; i < rows.length; i += 1) {
        await recalcRow(i);
      }
      setToast("Rates recalculated");
    } catch (error: any) {
      setToast(error?.message || "Failed to recalculate");
    } finally {
      setLoading(false);
    }
  }

  async function savePickupAndDeliveries() {
    setSaving(true);
    setToast("");

    try {
      const deliveriesPayload = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          evidenceFiles: await Promise.all(
            (row.evidenceFiles || []).map(async (file) => ({
              name: file.name,
              type: file.type,
              dataUrl: await fileToDataUrl(file),
            }))
          ),
        }))
      );

      const res = await fetch("/api/v1/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: pickup,
          deliveries: deliveriesPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save pickup");

      setPickup((prev) => ({
        ...prev,
        pickupId: data.pickup.pickup_id,
        totalWayCount: String(data.pickup.total_way_count || rows.length),
      }));

      setRows(
        (data.deliveries || []).map((row: any, index: number) => ({
          id: row.id,
          deliveryId: row.delivery_id,
          lineNo: row.line_no || index + 1,
          receiverName: row.receiver_name || "",
          receiverPhone: row.receiver_phone || "",
          township: row.township || "",
          destination: row.destination || "",
          deliveryAddress: row.delivery_address || "",
          remarks: row.remarks || "",
          serviceType: row.service_type || "standard",
          weightKg: String(row.weight_kg ?? 0),
          itemPrice: String(row.item_price ?? 0),
          itemPaymentStatus: row.item_payment_status === "PAID" ? "PAID" : "UNPAID",
          merchantCustomerDeliveryCharge: String(row.merchant_customer_delivery_charge ?? 0),
          deliveryPaymentStatus: row.delivery_payment_status === "PAID" ? "PAID" : "UNPAID",
          baseDeliveryFee: Number(row.base_delivery_fee || 0),
          overweightSurcharge: Number(row.overweight_surcharge || 0),
          osDeliveryCharge: Number(row.os_delivery_charge || 0),
          printedWaybillDeliveryCharge: Number(row.printed_waybill_delivery_charge || 0),
          osTotalCod: Number(row.os_total_cod || 0),
          waybillTotalCod: Number(row.waybill_total_cod || 0),
          receivable: Number(row.receivable || 0),
          evidenceFiles: [],
        }))
      );

      const warnings = Array.isArray(data.warnings) && data.warnings.length
        ? ` Saved with warnings: ${data.warnings.join(" | ")}`
        : "";

      setToast(`Saved ${data.pickup.pickup_id}.${warnings}`);
    } catch (error: any) {
      setToast(error?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const headers = [
      "receiver_name",
      "receiver_phone",
      "township",
      "destination",
      "delivery_address",
      "service_type",
      "weight_kg",
      "item_price",
      "item_payment_status",
      "merchant_customer_delivery_charge",
      "delivery_payment_status",
      "remarks",
    ];

    const rowsCsv = [
      headers.join(","),
      '","09xxxxxxxxx","Lanmadaw","","No. 1 Example Road","standard","3","80000","PAID","2500","PAID",""',
    ];

    const blob = new Blob([rowsCsv.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pickup-template-${pickup.pickupDate || today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function uploadTemplate(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);

    if (!parsed.length) return;

    const nextRows = parsed.map((row: any, index: number) => ({
      ...createEmptyRow(index),
      receiverName: row.receiver_name || "",
      receiverPhone: row.receiver_phone || "",
      township: row.township || "",
      destination: row.destination || "",
      deliveryAddress: row.delivery_address || "",
      serviceType: row.service_type || "standard",
      weightKg: row.weight_kg || "0",
      itemPrice: row.item_price || "0",
      itemPaymentStatus: row.item_payment_status === "PAID" ? "PAID" : "UNPAID",
      merchantCustomerDeliveryCharge: row.merchant_customer_delivery_charge || "0",
      deliveryPaymentStatus: row.delivery_payment_status === "PAID" ? "PAID" : "UNPAID",
      remarks: row.remarks || "",
    }));

    setRows(nextRows);
    setPickup((prev) => ({ ...prev, totalWayCount: String(nextRows.length) }));
    setToast(`Loaded ${nextRows.length} delivery rows from file`);
  }

  async function printWaybills() {
    if (!pickup.pickupId) {
      setToast("Save the pickup first");
      return;
    }

    setPrinting(true);
    try {
      const res = await fetch("/api/v1/labels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup_id: pickup.pickupId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate labels");

      const html = `
        <html>
          <head>
            <title>Waybills - ${pickup.pickupId}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; }
              .sheet { page-break-after: always; border: 1px solid #dbe4ee; border-radius: 16px; padding: 20px; margin-bottom: 18px; }
              .grid { display: grid; grid-template-columns: 1fr 220px; gap: 20px; align-items: start; }
              .title { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
              .row { margin: 6px 0; }
              .label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
              .value { font-weight: 700; font-size: 15px; }
              img { max-width: 220px; }
            </style>
          </head>
          <body>
            ${data.labels
              .map(
                (label: any) => `
                  <div class="sheet">
                    <div class="title">Britium Express Waybill</div>
                    <div class="grid">
                      <div>
                        <div class="row"><div class="label">Pickup ID</div><div class="value">${label.pickup_id}</div></div>
                        <div class="row"><div class="label">Delivery ID</div><div class="value">${label.delivery_id}</div></div>
                        <div class="row"><div class="label">Merchant</div><div class="value">${label.merchant_name || ""}</div></div>
                        <div class="row"><div class="label">Receiver</div><div class="value">${label.receiver_name || ""}</div></div>
                        <div class="row"><div class="label">Phone</div><div class="value">${label.receiver_phone || ""}</div></div>
                        <div class="row"><div class="label">Township</div><div class="value">${label.township || ""}</div></div>
                        <div class="row"><div class="label">Address</div><div class="value">${label.delivery_address || ""}</div></div>
                        <div class="row"><div class="label">Delivery Charge on Waybill</div><div class="value">${label.printed_waybill_delivery_charge}</div></div>
                        <div class="row"><div class="label">Total COD on Waybill</div><div class="value">${label.waybill_total_cod}</div></div>
                      </div>
                      <div>
                        <img src="${label.qr_data_url}" />
                      </div>
                    </div>
                  </div>
                `
              )
              .join("")}
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `;

      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }

      setToast(`Generated ${data.generated_count} labels`);
    } catch (error: any) {
      setToast(error?.message || "Failed to print waybills");
    } finally {
      setPrinting(false);
    }
  }

  const currentRow = rows[selectedRow] || createEmptyRow(0);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              <Truck className="h-4 w-4 text-[#0d2c54]" />
              Pickup and Delivery Workspace
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-[#0d2c54]">
              Enterprise Pickup and Delivery Registration
            </h1>
            <p className="mt-3 max-w-4xl text-sm text-slate-500">
              Shared for Merchant, Customer, Online Store, and Data Entry. Pickup IDs continue by day and organization.
              Existing pickups keep the same ID when edited or saved again.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Pickup ID</div>
            <div className="mt-1 text-lg font-black text-[#0d2c54]">
              {pickup.pickupId || `P${pickup.pickupDate.slice(5, 7)}${pickup.pickupDate.slice(8, 10)}-${previewOrg}-...`}
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab("pickup")}
            className={`rounded-2xl px-4 py-3 text-sm font-bold ${
              activeTab === "pickup" ? "bg-[#0d2c54] text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Pickup Batch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("delivery")}
            className={`rounded-2xl px-4 py-3 text-sm font-bold ${
              activeTab === "delivery" ? "bg-[#0d2c54] text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Delivery Data Entry
          </button>
        </div>
      </div>

      {toast ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          {toast}
        </div>
      ) : null}

      {activeTab === "pickup" ? (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
              <CalendarDays className="h-5 w-5 text-[#0d2c54]" />
              <h2 className="text-xl font-black text-[#0d2c54]">Pickup Form</h2>
            </div>

            <div className="space-y-4">
              <Field label="Pickup Date">
                <input type="date" className="input" value={pickup.pickupDate} onChange={(e) => setPickupField("pickupDate", e.target.value)} />
              </Field>

              <Field label="Source Type">
                <select className="input" value={pickup.sourceType} onChange={(e) => setPickupField("sourceType", e.target.value)}>
                  <option value="MER">Merchant</option>
                  <option value="CUS">Customer</option>
                  <option value="OS">Online Store</option>
                  <option value="DEO">Data Entry</option>
                </select>
              </Field>

              <Field label="Merchant or Account Name">
                <input className="input" value={pickup.merchantName} onChange={(e) => setPickupField("merchantName", e.target.value)} />
              </Field>

              <Field label="Merchant or Account Code">
                <input className="input" value={pickup.merchantCode} onChange={(e) => setPickupField("merchantCode", e.target.value)} />
              </Field>

              <Field label="Contact Name">
                <input className="input" value={pickup.contactName} onChange={(e) => setPickupField("contactName", e.target.value)} />
              </Field>

              <Field label="Contact Phone">
                <input className="input" value={pickup.contactPhone} onChange={(e) => setPickupField("contactPhone", e.target.value)} />
              </Field>

              <Field label="Pickup Address">
                <textarea className="input min-h-[90px]" value={pickup.pickupAddress} onChange={(e) => setPickupField("pickupAddress", e.target.value)} />
              </Field>

              <Field label="Pickup Township">
                <input className="input" value={pickup.pickupTownship} onChange={(e) => setPickupField("pickupTownship", e.target.value)} />
              </Field>

              <Field label="Pickup By">
                <input className="input" value={pickup.pickupBy} onChange={(e) => setPickupField("pickupBy", e.target.value)} />
              </Field>

              <Field label="Total Way Count">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={pickup.totalWayCount}
                  onChange={(e) => setPickupField("totalWayCount", e.target.value)}
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <button type="button" className="btn-secondary" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  Download CSV
                </button>
                <button type="button" className="btn-secondary" onClick={() => uploadRef.current?.click()}>
                  <FileUp className="h-4 w-4" />
                  Upload CSV
                </button>
                <button type="button" className="btn-secondary" onClick={recalcAll} disabled={loading}>
                  <Calculator className="h-4 w-4" />
                  Recalculate
                </button>
                <button type="button" className="btn-primary" onClick={savePickupAndDeliveries} disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : pickup.pickupId ? "Save Pickup" : "Create Pickup"}
                </button>
              </div>

              <button type="button" className="btn-primary w-full" onClick={printWaybills} disabled={printing || !pickup.pickupId}>
                <Printer className="h-4 w-4" />
                {printing ? "Generating..." : "Generate QR and Print Waybills"}
              </button>

              <input
                ref={uploadRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadTemplate(file);
                }}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <Package2 className="h-5 w-5 text-[#0d2c54]" />
                <h2 className="text-xl font-black text-[#0d2c54]">Pickup List</h2>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                {rows.length} ways
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Sr</th>
                    <th className="px-3 py-3">Delivery ID</th>
                    <th className="px-3 py-3">Receiver</th>
                    <th className="px-3 py-3">Township</th>
                    <th className="px-3 py-3">Weight</th>
                    <th className="px-3 py-3">OS Rate</th>
                    <th className="px-3 py-3">Waybill Rate</th>
                    <th className="px-3 py-3">Receivable</th>
                    <th className="px-3 py-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.deliveryId || "new"}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-semibold">{index + 1}</td>
                      <td className="px-3 py-3 font-bold text-[#0d2c54]">{row.deliveryId || "-"}</td>
                      <td className="px-3 py-3">{row.receiverName || "-"}</td>
                      <td className="px-3 py-3">{row.township || "-"}</td>
                      <td className="px-3 py-3">{row.weightKg || "0"}</td>
                      <td className="px-3 py-3">{money(row.osDeliveryCharge)}</td>
                      <td className="px-3 py-3">{money(row.printedWaybillDeliveryCharge)}</td>
                      <td className="px-3 py-3 font-bold text-emerald-700">{money(row.receivable)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRow(index);
                            setActiveTab("delivery");
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-[#0d2c54]" />
              <h2 className="text-xl font-black text-[#0d2c54]">Delivery Data Entry</h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Pickup</div>
              <div className="font-black text-[#0d2c54]">{pickup.pickupId || "Not saved yet"}</div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Delivery ID">
                  <input className="input bg-slate-50 font-bold" value={currentRow.deliveryId} readOnly />
                </Field>
                <Field label="Way Count">
                  <input className="input bg-slate-50" value={`${selectedRow + 1} of ${rows.length}`} readOnly />
                </Field>
                <Field label="Merchant">
                  <input className="input bg-slate-50" value={pickup.merchantName} readOnly />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Receiver Name">
                  <input className="input" value={currentRow.receiverName} onChange={(e) => patchRow(selectedRow, { receiverName: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input className="input" value={currentRow.receiverPhone} onChange={(e) => patchRow(selectedRow, { receiverPhone: e.target.value })} />
                </Field>
                <Field label="Township">
                  <input className="input" value={currentRow.township} onChange={(e) => patchRow(selectedRow, { township: e.target.value })} />
                </Field>
                <Field label="Destination">
                  <input className="input" value={currentRow.destination} onChange={(e) => patchRow(selectedRow, { destination: e.target.value })} />
                </Field>
                <Field label="Service Type">
                  <select className="input" value={currentRow.serviceType} onChange={(e) => patchRow(selectedRow, { serviceType: e.target.value })}>
                    <option value="standard">Standard</option>
                    <option value="same_day">Same Day</option>
                    <option value="next_day">Next Day</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </Field>
                <Field label="Weight (kg)">
                  <input className="input" value={currentRow.weightKg} onChange={(e) => patchRow(selectedRow, { weightKg: e.target.value })} />
                </Field>
              </div>

              <Field label="Address">
                <textarea className="input min-h-[110px]" value={currentRow.deliveryAddress} onChange={(e) => patchRow(selectedRow, { deliveryAddress: e.target.value })} />
              </Field>

              <Field label="Remarks">
                <textarea className="input min-h-[90px]" value={currentRow.remarks} onChange={(e) => patchRow(selectedRow, { remarks: e.target.value })} />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Item Price">
                  <div className="grid grid-cols-[1fr_140px] gap-2">
                    <input className="input" value={currentRow.itemPrice} onChange={(e) => patchRow(selectedRow, { itemPrice: e.target.value })} />
                    <select
                      className="input"
                      value={currentRow.itemPaymentStatus}
                      onChange={(e) => patchRow(selectedRow, { itemPaymentStatus: e.target.value as PayStatus })}
                    >
                      <option value="PAID">Paid</option>
                      <option value="UNPAID">Unpaid</option>
                    </select>
                  </div>
                </Field>

                <Field label="Merchant Delivery Charge">
                  <div className="grid grid-cols-[1fr_140px] gap-2">
                    <input
                      className="input"
                      value={currentRow.merchantCustomerDeliveryCharge}
                      onChange={(e) => patchRow(selectedRow, { merchantCustomerDeliveryCharge: e.target.value })}
                    />
                    <select
                      className="input"
                      value={currentRow.deliveryPaymentStatus}
                      onChange={(e) => patchRow(selectedRow, { deliveryPaymentStatus: e.target.value as PayStatus })}
                    >
                      <option value="PAID">Paid</option>
                      <option value="UNPAID">Unpaid</option>
                    </select>
                  </div>
                </Field>
              </div>

              <Field label="Photo Evidence">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="input file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2"
                  onChange={(e) => patchRow(selectedRow, { evidenceFiles: Array.from(e.target.files || []) })}
                />
              </Field>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-secondary" onClick={() => setSelectedRow((v) => Math.max(0, v - 1))}>
                  Previous
                </button>
                <button type="button" className="btn-secondary" onClick={() => setSelectedRow((v) => Math.min(rows.length - 1, v + 1))}>
                  Next
                </button>
                <button type="button" className="btn-secondary" onClick={() => recalcRow(selectedRow)}>
                  <Calculator className="h-4 w-4" />
                  Recalculate This Row
                </button>
                <button type="button" className="btn-primary" onClick={savePickupAndDeliveries} disabled={saving}>
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                Backend Calculated Values
              </div>

              <Stat label="Standard Fee" value={money(currentRow.baseDeliveryFee)} />
              <Stat label="Overweight Surcharge" value={money(currentRow.overweightSurcharge)} />
              <Stat label="OS Delivery Charge" value={money(currentRow.osDeliveryCharge)} />
              <Stat label="Waybill Delivery Charge" value={money(currentRow.printedWaybillDeliveryCharge)} />
              <Stat label="OS Total COD" value={money(currentRow.osTotalCod)} />
              <Stat label="Waybill Total COD" value={money(currentRow.waybillTotalCod)} />
              <Stat label="Receivable" value={money(currentRow.receivable)} strong />
              <Stat label="Evidence Files" value={String(currentRow.evidenceFiles?.length || 0)} />
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Loading...
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-1 text-lg ${strong ? "font-black text-[#0d2c54]" : "font-bold text-slate-800"}`}>{value}</div>
    </div>
  );
}