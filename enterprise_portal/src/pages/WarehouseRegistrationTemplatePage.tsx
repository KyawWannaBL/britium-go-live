// @ts-nocheck
import { useMemo, useRef, useState } from "react";
import { readBulkTemplateRows } from "@/lib/tabularBulkLoad";
import { useEnterpriseMasterData } from "@/hooks/useEnterpriseMasterData";
import {
  Download,
  Filter,
  Plus,
  Printer,
  Route,
  Save,
  Trash2,
  Upload,
  Warehouse,
} from "lucide-react";

const AUTO_FILL = "#FFF2CC";
const USER_FILL = "#D9EAF7";
const DROPDOWN_FILL = "#E2F0D9";

const statusOptions = [
  { key: "all", label: "All inventory" },
  { key: "next_day", label: "Need next-day delivery" },
  { key: "failed", label: "Failed ways" },
  { key: "exception", label: "Exception ways" },
  { key: "ready", label: "Ready / dispatched" },
  { key: "pending", label: "Pending / warehouse" },
  { key: "delivered", label: "Delivered" },
];

const columns = [
  { key: "warehouse_date", label: "Warehouse Date", fill: "auto" },
  { key: "delivery_way_id", label: "DeliverywayID", fill: "dropdown" },
  { key: "way_id", label: "Way ID", fill: "auto" },
  { key: "merchant", label: "Merchant", fill: "auto" },
  { key: "warehouse_status", label: "Warehouse Status", fill: "dropdown" },
  { key: "town", label: "Town", fill: "dropdown" },
  { key: "received_by", label: "Received By", fill: "manual" },
  { key: "warehouse_location", label: "Warehouse Location", fill: "dropdown" },
  { key: "piece_count", label: "Piece Count", fill: "manual-number" },
  { key: "weight", label: "Weight", fill: "manual-number" },
  { key: "delivery_fee_os", label: "Delivery Fee (OS)", fill: "auto-number" },
  { key: "surcharge", label: "Surcharge", fill: "auto-number" },
  { key: "cod", label: "COD", fill: "manual-number" },
  { key: "actual_collect", label: "Actual Collect", fill: "auto-number" },
  { key: "vehicle_no", label: "Vehicle No", fill: "dropdown" },
  { key: "vehicle_type", label: "Vehicle Type", fill: "auto" },
  { key: "remarks", label: "Remarks", fill: "manual" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined" || text === "-") return fallback;
  return text;
}

function num(value: any, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readArray(keys: string[]) {
  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === "object" && Array.isArray(value.rows)) return value.rows;
    } catch {}
  }
  return [];
}

function readMasterSnapshot() {
  try {
    return JSON.parse(localStorage.getItem("britium.master.snapshot") || "{}");
  } catch {
    return {};
  }
}

function normalizeInventoryOption(row: any, index: number) {
  const deliveryWayId = clean(
    row.delivery_way_id ||
      row.deliveryway_id ||
      row.deliveryWayId ||
      row.delivery_id ||
      row.way_id ||
      row.waybill_id ||
      row.tracking_no ||
      row.pickup_id,
    `DW-${index + 1}`
  );

  const wayId = clean(row.way_id || row.waybill_id || row.tracking_no || deliveryWayId);
  const status = clean(row.warehouse_status || row.status || row.delivery_status || row.parcel_status, "Warehouse Received");

  return {
    delivery_way_id: deliveryWayId,
    way_id: wayId,
    merchant: clean(row.merchant || row.merchant_name || row.business_name || row.customer_name),
    warehouse_status: status,
    town: clean(row.town || row.township || row.delivery_township || row.destination),
    warehouse_date: clean(row.warehouse_date || row.pickup_date || row.created_at, today()).slice(0, 10),
    piece_count: clean(row.piece_count || row.parcel_count || row.qty, "1"),
    weight: clean(row.weight || row.weight_kg, "1"),
    delivery_fee_os: clean(row.delivery_fee_os || row.delivery_fee || row.express_price || row.base_fee, "0"),
    surcharge: clean(row.surcharge || row.extra_fee, "0"),
    cod: clean(row.cod || row.cod_amount || row.amount, ""),
    actual_collect: clean(row.actual_collect || row.cod || row.cod_amount || row.amount, ""),
    vehicle_no: clean(row.vehicle_no || row.vehicle_plate || row.plate_no),
    vehicle_type: clean(row.vehicle_type || row.type),
    remarks: clean(row.remarks || row.description || row.item_description),
    raw: row,
  };
}

function readDeliveryWayOptions() {
  const rows = [
    ...readArray(["britium.registration.dataEntryRows"]),
    ...readArray(["britium.registration.latestRows"]),
    ...readArray(["britium.warehouse.filteredInventory"]),
    ...readArray(["britium.cs.pickups", "britium.customerService.pickups", "britium.pickup.requests"]),
  ];

  const seen = new Set();
  return rows.map(normalizeInventoryOption).filter((row) => {
    const key = row.delivery_way_id || row.way_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let runtimeTownships: any[] = [];
let runtimeTariffs: any[] = [];

function findByTown(rows: any[], town: string) {
  const needle = clean(town).toLowerCase();
  return rows.find((row: any) =>
    clean(row.township || row.name || row.destination_name || row.town).toLowerCase() === needle
  );
}

function statusBucket(statusValue: string) {
  const status = clean(statusValue).toLowerCase();

  if (status.includes("drop") || status.includes("delivered")) return "delivered";
  if (status.includes("fail")) return "failed";
  if (status.includes("exception")) return "exception";
  if (status.includes("ready")) return "ready";
  if (status.includes("dispatch")) return "ready";
  if (status.includes("warehouse")) return "pending";
  if (status.includes("sorting")) return "pending";
  if (status.includes("created")) return "pending";

  return "pending";
}

function isDroppedOff(row: any) {
  return statusBucket(row.warehouse_status || row.status || row.delivery_status) === "delivered";
}

function calculateRow(row: any) {
  const tariff = findByTown(runtimeTariffs, row.town);
  const township = findByTown(runtimeTownships, row.town);

  const baseFee = num(
    tariff?.base_fee ||
      tariff?.delivery_fee ||
      township?.base_fee ||
      township?.delivery_fee ||
      row.delivery_fee_os,
    0
  );

  const weight = Math.max(0, num(row.weight, 1));
  const weightLimit = Math.max(1, num(tariff?.weight_limit_kg || tariff?.base_weight_kg, 1));
  const surchargePerKg = num(tariff?.surcharge_per_kg || tariff?.extra_kg_fee || 0);
  const surcharge = Math.max(0, weight - weightLimit) * surchargePerKg;
  const cod = num(row.cod, 0);

  return {
    ...row,
    delivery_fee_os: String(Math.round(baseFee)),
    surcharge: String(Math.round(surcharge)),
    actual_collect: String(Math.round(cod)),
  };
}

function blankRow(sequence = 1) {
  return calculateRow({
    warehouse_date: today(),
    delivery_way_id: "",
    way_id: "",
    merchant: "",
    warehouse_status: "Warehouse Received",
    town: "",
    received_by: "",
    warehouse_location: "Main Warehouse",
    piece_count: "1",
    weight: "1",
    delivery_fee_os: "0",
    surcharge: "0",
    cod: "",
    actual_collect: "",
    vehicle_no: "",
    vehicle_type: "",
    remarks: "",
    sequence,
  });
}

function rowDateValue(row: any) {
  return clean(row.warehouse_date || row.pickup_date || row.created_at || today()).slice(0, 10);
}

function isBetweenDates(row: any, fromDate: string, toDate: string) {
  const value = rowDateValue(row);
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
}

function matchesAnyStatusFilter(row: any, selectedStatuses: string[]) {
  if (!selectedStatuses.length || selectedStatuses.includes("all")) return true;

  const bucket = statusBucket(row.warehouse_status || row.status);

  if (selectedStatuses.includes("next_day") && ["failed", "exception", "ready", "pending"].includes(bucket)) {
    return true;
  }

  return selectedStatuses.includes(bucket);
}

function nextDayDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function makeNextDayWayplanRows(rows: any[]) {
  return rows
    .filter((row) => matchesAnyStatusFilter(row, ["next_day"]))
    .map((row, index) => ({
      wayplan_date: nextDayDate(),
      sequence: index + 1,
      delivery_way_id: row.delivery_way_id || "",
      way_id: row.way_id || "",
      merchant: row.merchant || "",
      town: row.town || "",
      delivery_status: row.warehouse_status || row.status || "Pending",
      vehicle_no: row.vehicle_no || "",
      vehicle_type: row.vehicle_type || "",
      weight: row.weight || "",
      cod: row.cod || "",
      actual_collect: row.actual_collect || "",
      remarks: row.remarks || "",
    }));
}

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows: any[]) {
  const header = columns.map((col) => col.label).join(",");
  const body = rows.map((row) => columns.map((col) => csvEscape(row[col.key])).join(","));
  return [header, ...body].join("\n");
}

function wayplanRowsToCsv(rows: any[]) {
  const headers = [
    "Wayplan Date",
    "Sequence",
    "DeliverywayID",
    "Way ID",
    "Merchant",
    "Town",
    "Delivery Status",
    "Vehicle No",
    "Vehicle Type",
    "Weight",
    "COD",
    "Actual Collect",
    "Remarks",
  ];

  const keys = [
    "wayplan_date",
    "sequence",
    "delivery_way_id",
    "way_id",
    "merchant",
    "town",
    "delivery_status",
    "vehicle_no",
    "vehicle_type",
    "weight",
    "cod",
    "actual_collect",
    "remarks",
  ];

  return [headers.join(","), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","))].join("\n");
}

function downloadFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map((item) => item.trim());
  const labelToKey = Object.fromEntries(columns.map((col) => [col.label, col.key]));

  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    const row: any = blankRow(index + 1);

    headers.forEach((header, valueIndex) => {
      const key = labelToKey[header] || header.toLowerCase().replace(/\s+/g, "_");
      row[key] = values[valueIndex] || "";
    });

    return calculateRow(row);
  });
}

function fillColor(fill: string) {
  if (fill.includes("auto")) return AUTO_FILL;
  if (fill.includes("manual")) return USER_FILL;
  if (fill.includes("dropdown")) return DROPDOWN_FILL;
  return "#FFFFFF";
}

export default function WarehouseRegistrationTemplatePage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const master = useEnterpriseMasterData();

  const townships = useMemo(
    () => (master?.townships?.length ? master.townships : readArray(["britium.production.townshipMaster"])),
    [master]
  );

  const tariffs = useMemo(
    () => (master?.tariffs?.length ? master.tariffs : readArray(["britium.production.tariffMaster"])),
    [master]
  );

  const vehicles = useMemo(
    () => (master?.vehicles?.length ? master.vehicles : readArray(["britium.production.vehicleMaster"])),
    [master]
  );

  const deliveryWayOptions = useMemo(() => readDeliveryWayOptions(), []);

  runtimeTownships = townships;
  runtimeTariffs = tariffs;

  const [rows, setRows] = useState<any[]>([blankRow()]);
  const [message, setMessage] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["all"]);

  const selectedDeliveryWayIds = useMemo(
    () => new Set(rows.map((row) => clean(row.delivery_way_id)).filter(Boolean)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => isBetweenDates(row, fromDate, toDate) && matchesAnyStatusFilter(row, selectedStatuses));
  }, [rows, fromDate, toDate, selectedStatuses]);

  const nextDayRows = useMemo(() => makeNextDayWayplanRows(filteredRows), [filteredRows]);

  function toggleStatusFilter(statusKey: string) {
    setSelectedStatuses((prev) => {
      if (statusKey === "all") return ["all"];

      const withoutAll = prev.filter((item) => item !== "all");
      const next = withoutAll.includes(statusKey)
        ? withoutAll.filter((item) => item !== statusKey)
        : [...withoutAll, statusKey];

      return next.length ? next : ["all"];
    });
  }

  function updateRow(rowIndex: number, key: string, value: string) {
    setRows((prev) =>
      prev.map((row, index) => {
        if (index !== rowIndex) return row;

        const next = { ...row, [key]: value };

        if (key === "delivery_way_id") {
          const option = deliveryWayOptions.find((item) => item.delivery_way_id === value);

          if (option) {
            if (isDroppedOff(option)) {
              setMessage("dropped off");
              return row;
            }

            const duplicate = prev.some((existingRow, existingIndex) =>
              existingIndex !== rowIndex && clean(existingRow.delivery_way_id) === value
            );

            if (duplicate) {
              setMessage("selected");
              return row;
            }

            next.delivery_way_id = option.delivery_way_id;
            next.way_id = option.way_id || option.delivery_way_id;
            next.merchant = option.merchant || next.merchant;
            next.warehouse_status = option.warehouse_status || next.warehouse_status;
            next.town = option.town || next.town;
            next.warehouse_date = option.warehouse_date || next.warehouse_date;
            next.piece_count = option.piece_count || next.piece_count;
            next.weight = option.weight || next.weight;
            next.delivery_fee_os = option.delivery_fee_os || next.delivery_fee_os;
            next.surcharge = option.surcharge || next.surcharge;
            next.cod = option.cod || next.cod;
            next.actual_collect = option.actual_collect || next.actual_collect;
            next.vehicle_no = option.vehicle_no || next.vehicle_no;
            next.vehicle_type = option.vehicle_type || next.vehicle_type;
            next.remarks = option.remarks || next.remarks;
          }
        }

        if (key === "vehicle_no") {
          const vehicle = vehicles.find((item: any) =>
            clean(item.vehicle_no || item.vehicle_plate || item.plate_no) === value
          );
          next.vehicle_type = vehicle?.vehicle_type || vehicle?.type || next.vehicle_type || "";
        }

        return calculateRow(next);
      })
    );
  }

  async function uploadCsv(file: File) {
    const parsed = await readBulkTemplateRows(file, columns, {
      blankRow,
      calculateRow,
      requiredHeaders: [
        "Warehouse Date",
        "DeliverywayID",
        "Way ID",
        "Merchant",
        "Warehouse Status",
        "Town",
      ],
    });

    setRows(parsed.length ? parsed : [blankRow()]);
    setMessage(`Bulk loaded ${parsed.length} warehouse row(s) from ${file.name}.`);
  }

  
  function saveQueue() {
    localStorage.setItem("britium.registration.warehouseRows", JSON.stringify(rows));
    localStorage.setItem("britium.registration.latestRows", JSON.stringify(rows));
    window.dispatchEvent(
      new CustomEvent("britium:registration-template-saved", {
        detail: { source: "warehouse", rows },
      })
    );
    setMessage(`Saved ${rows.length} warehouse registration row(s).`);
  }

  function downloadFilteredInventory() {
    localStorage.setItem("britium.warehouse.filteredInventory", JSON.stringify(filteredRows));
    downloadFile("BE_Warehouse_Filtered_Inventory.csv", rowsToCsv(filteredRows));
    setMessage(`Downloaded ${filteredRows.length} filtered inventory row(s).`);
  }

  function generateNextDayWayplan() {
    localStorage.setItem("britium.wayplan.nextDayQueue", JSON.stringify(nextDayRows));
    localStorage.setItem("britium.wayplan.nextDayGeneratedAt", new Date().toISOString());
    downloadFile("BE_Next_Day_Wayplan_From_Filtered_Inventory.csv", wayplanRowsToCsv(nextDayRows));
    setMessage(`Generated next-day wayplan with ${nextDayRows.length} undelivered / failed / pending row(s).`);
  }

  function saveUploadedWarehouseResult() {
    saveQueue();
    localStorage.setItem("britium.warehouse.filteredInventory", JSON.stringify(filteredRows));
    setMessage(`Saved ${rows.length} uploaded/bulk-loaded warehouse row(s).`);
  }

  function deleteAllWarehouseBulkLoadRows() {
    localStorage.removeItem("britium.registration.warehouseRows");
    localStorage.removeItem("britium.registration.latestRows");
    localStorage.removeItem("britium.warehouse.filteredInventory");
    localStorage.removeItem("britium.wayplan.nextDayQueue");
    localStorage.removeItem("britium.wayplan.nextDayGeneratedAt");

    setRows([blankRow()]);
    window.dispatchEvent(new CustomEvent("britium:registration-template-saved", {
      detail: { source: "warehouse", rows: [] },
    }));

    setMessage("Deleted all uploaded/bulk-loaded warehouse rows. The table has been reset.");
  }


  return (
    <main className="mx-auto w-full max-w-[1800px] px-5 py-6">
      <section className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Britium Express</p>
            <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-slate-950">
              <Warehouse className="h-8 w-8 text-amber-600" />
              Warehouse Data Registration
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Warehouse registration template with multi-status filtering, DeliverywayID selection, duplicate protection, next-day wayplan export, and warehouse queue saving.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadFile("BE_Warehouse_Inventory_Template.csv", rowsToCsv([blankRow()]))} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
              <Download className="mr-2 inline h-4 w-4" />
              Download Template
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">
              <Upload className="mr-2 inline h-4 w-4" />
              Bulk Load
            </button>
            <button type="button" onClick={() => setRows((prev) => [...prev, blankRow(prev.length + 1)])} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
              <Plus className="mr-2 inline h-4 w-4" />
              Add Row
            </button>
            <button type="button" onClick={saveQueue} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              <Save className="mr-2 inline h-4 w-4" />
              Save Queue
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              <Printer className="mr-2 inline h-4 w-4" />
              Print
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadCsv(file);
            event.currentTarget.value = "";
          }}
        />

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold">Color rule:</span>
          <span className="rounded-full px-3 py-1" style={{ background: AUTO_FILL }}>Yellow = auto</span>
          <span className="rounded-full px-3 py-1" style={{ background: USER_FILL }}>Blue = manual</span>
          <span className="rounded-full px-3 py-1" style={{ background: DROPDOWN_FILL }}>Green = dropdown</span>
          <span className="ml-auto rounded-full bg-white px-3 py-1 font-semibold">Rows: {rows.length}</span>
        </div>

        <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Inventory Filter</p>
              <h2 className="text-xl font-semibold text-slate-950">Download inventory / generate next-day wayplan</h2>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[180px_180px_minmax(0,1fr)_220px_220px]">
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-700">From Date</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-semibold text-slate-700">To Date</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
            </label>

            <div className="text-sm">
              <span className="mb-1 block font-semibold text-slate-700">Status Filter</span>
              <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
                {statusOptions.map((status) => (
                  <label key={status.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(status.key)}
                      onChange={() => toggleStatusFilter(status.key)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {status.label}
                  </label>
                ))}
              </div>
            </div>

            <button type="button" onClick={downloadFilteredInventory} className="mt-6 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              <Download className="mr-2 inline h-4 w-4" />
              Download Filtered Inventory
            </button>

            <button type="button" onClick={generateNextDayWayplan} className="mt-6 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              <Route className="mr-2 inline h-4 w-4" />
              Generate Next-Day Wayplan
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Filtered Inventory</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{filteredRows.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Next-Day Candidates</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{nextDayRows.length}</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Next Wayplan Date</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{nextDayDate()}</p>
            </div>
          </div>
        </section>

        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
      </section>

      
      <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Warehouse Bulk Load Result Actions
            </p>
            <h2 className="text-lg font-semibold text-slate-950">
              Save or delete the uploaded warehouse result
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Save after checking the uploaded rows. Use Delete All if the whole warehouse bulk load file is wrong.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveUploadedWarehouseResult}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <Save className="mr-2 inline h-4 w-4" />
              Save Uploaded Warehouse Result
            </button>

            <button
              type="button"
              onClick={deleteAllWarehouseBulkLoadRows}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <Trash2 className="mr-2 inline h-4 w-4" />
              Delete All Uploaded Rows
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-auto" style={{ maxHeight: "72vh" }}>
          <table className="min-w-[2300px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3">Action</th>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-3">{col.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <button type="button" onClick={() => setRows((prev) => prev.filter((_, index) => index !== rowIndex))} className="rounded-lg border border-rose-200 px-2 py-1 text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>

                  {columns.map((col) => (
                    <td key={col.key} className="min-w-[150px] px-3 py-2" style={{ background: fillColor(col.fill) }}>
                      {col.key === "delivery_way_id" ? (
                        <select
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={row.delivery_way_id || ""}
                          onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}
                        >
                          <option value="">Select DeliverywayID</option>
                          {deliveryWayOptions.map((option: any, index: number) => {
                            const dropped = isDroppedOff(option);
                            const alreadySelected = selectedDeliveryWayIds.has(option.delivery_way_id) && option.delivery_way_id !== row.delivery_way_id;
                            const disabled = dropped || alreadySelected;
                            const suffix = dropped ? " - dropped off" : alreadySelected ? " - selected" : "";
                            return (
                              <option
                                key={`${option.delivery_way_id}-${index}`}
                                value={option.delivery_way_id}
                                disabled={disabled}
                                style={disabled ? { color: "#94a3b8", background: "#f1f5f9" } : undefined}
                              >
                                {option.delivery_way_id}{suffix}
                              </option>
                            );
                          })}
                        </select>
                      ) : col.key === "warehouse_status" ? (
                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={row[col.key] || "Warehouse Received"} onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}>
                          <option value="Warehouse Received">Warehouse Received</option>
                          <option value="Sorting">Sorting</option>
                          <option value="Ready for Dispatch">Ready for Dispatch</option>
                          <option value="Dispatched">Dispatched</option>
                          <option value="Failed">Failed</option>
                          <option value="Exception">Exception</option>
                          <option value="Dropped Off">Dropped Off</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      ) : col.key === "town" ? (
                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={row[col.key] || ""} onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}>
                          <option value="">Select town</option>
                          {townships.map((town: any, index: number) => {
                            const value = town.township || town.name || town.destination_name || `Town ${index + 1}`;
                            return <option key={`${value}-${index}`} value={value}>{value}</option>;
                          })}
                        </select>
                      ) : col.key === "vehicle_no" ? (
                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={row[col.key] || ""} onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}>
                          <option value="">Select vehicle</option>
                          {vehicles.map((vehicle: any, index: number) => {
                            const value = vehicle.vehicle_no || vehicle.vehicle_plate || vehicle.plate_no || `Vehicle ${index + 1}`;
                            return <option key={`${value}-${index}`} value={value}>{value}</option>;
                          })}
                        </select>
                      ) : col.key === "warehouse_location" ? (
                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={row[col.key] || "Main Warehouse"} onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}>
                          <option value="Main Warehouse">Main Warehouse</option>
                          <option value="Inbound Dock">Inbound Dock</option>
                          <option value="Sorting Zone">Sorting Zone</option>
                          <option value="Dispatch Bay">Dispatch Bay</option>
                        </select>
                      ) : (
                        <input
                          className={`w-full rounded-xl border border-slate-200 px-3 py-2 ${col.fill.includes("auto") ? "bg-white/50" : "bg-white"}`}
                          value={row[col.key] || ""}
                          readOnly={col.fill.includes("auto")}
                          onChange={(event) => updateRow(rowIndex, col.key, event.target.value)}
                          type={col.fill.includes("number") ? "number" : col.key === "warehouse_date" ? "date" : "text"}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
