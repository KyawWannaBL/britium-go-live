// @ts-nocheck
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Printer, RefreshCw, Search, Upload } from "lucide-react";

type WayplanRow = {
  manifest_group: string;
  route_type: string;
  highway_drop: string;
  stop_sequence: string;
  pickup_date: string;
  pickup_way_id: string;
  way_id: string;
  merchant: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_town: string;
  recipient_address: string;
  item_price: number;
  deli_fee: number;
  weight: number;
  surcharge: number;
  final_cod: number;
  destination: string;
  driver_rider: string;
  helper: string;
  plate_no: string;
  remarks: string;
  print: string;
};

const TEMPLATE_HEADERS = [
  "Manifest Group",
  "Route Type",
  "Highway Drop",
  "Stop Sequence",
  "Pickup Date",
  "Pickup Way ID",
  "Way ID",
  "Merchant",
  "Recipient Name",
  "Recipient Phone",
  "Recipient Town",
  "Recipient Address",
  "Item Price",
  "Deli Fee",
  "Weight",
  "Surcharge",
  "Final COD",
  "Destination",
  "Driver/Rider",
  "Helper",
  "Plate No.",
  "Remarks",
  "Print?",
];

const emptyRow: WayplanRow = {
  manifest_group: "YGN-NORTH",
  route_type: "Local Delivery",
  highway_drop: "",
  stop_sequence: "1",
  pickup_date: new Date().toISOString().slice(0, 10),
  pickup_way_id: "",
  way_id: "",
  merchant: "",
  recipient_name: "",
  recipient_phone: "",
  recipient_town: "",
  recipient_address: "",
  item_price: 0,
  deli_fee: 0,
  weight: 1,
  surcharge: 0,
  final_cod: 0,
  destination: "",
  driver_rider: "",
  helper: "",
  plate_no: "",
  remarks: "",
  print: "Y",
};

function clean(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return fallback;
  return text;
}

function num(value: any) {
  const parsed = Number(String(value ?? "0").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuote && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      continue;
    }

    if (char === "," && !insideQuote) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): WayplanRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.toLowerCase().replace(/\s+/g, "_").replace(/[?/]/g, ""),
  );

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const raw: any = {};
    headers.forEach((header, index) => {
      raw[header] = cells[index] || "";
    });

    return {
      manifest_group: raw.manifest_group || "",
      route_type: raw.route_type || "Local Delivery",
      highway_drop: raw.highway_drop || "",
      stop_sequence: raw.stop_sequence || "",
      pickup_date: raw.pickup_date || "",
      pickup_way_id: raw.pickup_way_id || "",
      way_id: raw.way_id || "",
      merchant: raw.merchant || "",
      recipient_name: raw.recipient_name || "",
      recipient_phone: raw.recipient_phone || "",
      recipient_town: raw.recipient_town || "",
      recipient_address: raw.recipient_address || "",
      item_price: num(raw.item_price),
      deli_fee: num(raw.deli_fee),
      weight: num(raw.weight),
      surcharge: num(raw.surcharge),
      final_cod: num(raw.final_cod),
      destination: raw.destination || raw.recipient_town || "",
      driver_rider: raw.driver_rider || "",
      helper: raw.helper || "",
      plate_no: raw.plate_no || "",
      remarks: raw.remarks || "",
      print: raw.print || raw.print_ || "Y",
    };
  });
}

function rowsToCsv(rows: WayplanRow[]) {
  return [
    TEMPLATE_HEADERS,
    ...rows.map((row) => [
      row.manifest_group,
      row.route_type,
      row.highway_drop,
      row.stop_sequence,
      row.pickup_date,
      row.pickup_way_id,
      row.way_id,
      row.merchant,
      row.recipient_name,
      row.recipient_phone,
      row.recipient_town,
      row.recipient_address,
      row.item_price,
      row.deli_fee,
      row.weight,
      row.surcharge,
      row.final_cod,
      row.destination,
      row.driver_rider,
      row.helper,
      row.plate_no,
      row.remarks,
      row.print,
    ]),
  ]
    .map((line) => line.map(csvEscape).join(","))
    .join("\n");
}

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function groupRows(rows: WayplanRow[]) {
  const grouped = new Map<string, WayplanRow[]>();

  rows
    .filter((row) => String(row.print || "Y").toUpperCase() !== "N")
    .forEach((row) => {
      const key = clean(row.manifest_group, "UNASSIGNED");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    });

  return grouped;
}

function buildManifestHtml(rows: WayplanRow[]) {
  const grouped = groupRows(rows);
  const generatedAt = new Date().toLocaleString();

  const pages = Array.from(grouped.entries())
    .map(([group, groupRows]) => {
      const first = groupRows[0] || emptyRow;
      const totalCod = groupRows.reduce((sum, row) => sum + num(row.final_cod), 0);
      const totalFee = groupRows.reduce((sum, row) => sum + num(row.deli_fee), 0);
      const totalWeight = groupRows.reduce((sum, row) => sum + num(row.weight), 0);

      const bodyRows = groupRows
        .sort((a, b) => num(a.stop_sequence) - num(b.stop_sequence))
        .map(
          (row, index) => `
            <tr>
              <td>${row.stop_sequence || index + 1}</td>
              <td class="mono">${row.way_id}</td>
              <td>${row.merchant}</td>
              <td>${row.recipient_name}<br><small>${row.recipient_phone}</small></td>
              <td>${row.recipient_town}</td>
              <td>${row.recipient_address}</td>
              <td class="num">${num(row.item_price).toLocaleString()}</td>
              <td class="num">${num(row.deli_fee).toLocaleString()}</td>
              <td class="num">${num(row.weight).toLocaleString()}</td>
              <td class="num">${num(row.surcharge).toLocaleString()}</td>
              <td class="num"><b>${num(row.final_cod).toLocaleString()}</b></td>
              <td>${row.remarks || ""}</td>
            </tr>`,
        )
        .join("");

      return `
        <section class="page">
          <header class="top">
            <div>
              <h1>BRITIUM EXPRESS</h1>
              <p>Wayplan Manifest / Print Ready Route Sheet</p>
            </div>
            <div class="badge">${group}</div>
          </header>

          <table class="meta">
            <tr><td><b>Manifest Group</b></td><td>${group}</td><td><b>Route Type</b></td><td>${first.route_type}</td></tr>
            <tr><td><b>Pickup Date</b></td><td>${first.pickup_date || ""}</td><td><b>Highway Drop</b></td><td>${first.highway_drop || "-"}</td></tr>
            <tr><td><b>Driver/Rider</b></td><td>${first.driver_rider || "-"}</td><td><b>Helper</b></td><td>${first.helper || "-"}</td></tr>
            <tr><td><b>Plate No.</b></td><td>${first.plate_no || "-"}</td><td><b>Generated</b></td><td>${generatedAt}</td></tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th>#</th><th>Way ID</th><th>Merchant</th><th>Recipient</th><th>Town</th><th>Address</th>
                <th>Item</th><th>Fee</th><th>Wgt</th><th>Surch.</th><th>COD</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <th colspan="7">TOTAL</th>
                <th class="num">${totalFee.toLocaleString()}</th>
                <th class="num">${totalWeight.toLocaleString()}</th>
                <th></th>
                <th class="num">${totalCod.toLocaleString()}</th>
                <th>${groupRows.length} pcs</th>
              </tr>
            </tfoot>
          </table>

          <div class="cash">
            <div><b>Total COD Collection</b><span>${totalCod.toLocaleString()} MMK</span></div>
            <div><b>Total Delivery Fee</b><span>${totalFee.toLocaleString()} MMK</span></div>
            <div><b>Total Parcels</b><span>${groupRows.length}</span></div>
          </div>

          <div class="sign">
            <div>Prepared By</div>
            <div>Supervisor</div>
            <div>Driver / Rider</div>
            <div>Warehouse / Cashier</div>
          </div>
        </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Britium Wayplan Manifest</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    body { margin: 0; background: #e5e7eb; font-family: Arial, sans-serif; color: #111827; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; padding: 10px; background: #0f172a; }
    .toolbar button { border: 0; border-radius: 8px; background: #2563eb; color: white; font-weight: 800; padding: 9px 14px; cursor: pointer; }
    .page { width: 281mm; min-height: 194mm; margin: 10mm auto; background: white; padding: 8mm; box-shadow: 0 8px 30px rgba(15,23,42,.18); page-break-after: always; box-sizing: border-box; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f172a; padding-bottom: 8px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: .08em; }
    .top p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
    .badge { background: #0f172a; color: white; border-radius: 10px; padding: 10px 14px; font-weight: 900; }
    table { border-collapse: collapse; width: 100%; }
    .meta { margin: 10px 0; }
    .meta td { border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 11px; }
    .items th, .items td { border: 1px solid #cbd5e1; padding: 4px 5px; font-size: 10px; vertical-align: top; }
    .items th { background: #e2e8f0; text-align: left; }
    .items tfoot th { background: #f8fafc; }
    .mono { font-family: Consolas, monospace; font-weight: 800; }
    .num { text-align: right; font-family: Consolas, monospace; }
    .cash { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .cash div { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; display: flex; justify-content: space-between; font-size: 12px; }
    .cash span { font-family: Consolas, monospace; font-weight: 900; }
    .sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 22px; }
    .sign div { border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-size: 11px; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .page { margin: 0; box-shadow: none; width: auto; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button onclick="downloadHtml()">Download HTML</button>
  </div>
  ${pages || `<section class="page"><h1>BRITIUM EXPRESS</h1><p>No rows loaded.</p></section>`}
  <script>
    function downloadHtml() {
      const html = document.documentElement.outerHTML;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Britium_Wayplan_Manifest.html";
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

export default function WayplanTemplateGeneratorPage() {
  const [rows, setRows] = useState<WayplanRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(clean(row.manifest_group, "UNASSIGNED"), (map.get(clean(row.manifest_group, "UNASSIGNED")) || 0) + 1));
    return Array.from(map.entries()).sort();
  }, [rows]);

  const totalCod = rows.reduce((sum, row) => sum + num(row.final_cod), 0);
  const totalFee = rows.reduce((sum, row) => sum + num(row.deli_fee), 0);

  function downloadTemplateCsv() {
    downloadText("Britium_Wayplan_Generator_Template.csv", rowsToCsv([emptyRow]), "text/csv;charset=utf-8");
  }

  async function handleFile(file?: File | null) {
    if (!file) return;

    setLoading(true);
    setMessage("");

    try {
      const ext = file.name.toLowerCase().split(".").pop();

      if (ext === "csv") {
        const text = await file.text();
        const parsed = parseCsv(text);
        setRows(parsed);
        setMessage(`Loaded ${parsed.length} row(s) from CSV.`);
      } else if (ext === "xlsx" || ext === "xls") {
        setMessage("For XLSX, use the standalone generator in /tools/ or export Excel as CSV and upload the CSV here.");
      } else {
        setMessage("Unsupported file type. Please upload CSV.");
      }
    } catch (error: any) {
      setMessage(error?.message || "Unable to read template file.");
    } finally {
      setLoading(false);
    }
  }

  function addManualRow() {
    setRows((prev) => [
      ...prev,
      {
        ...emptyRow,
        stop_sequence: String(prev.length + 1),
        way_id: `D-MANUAL-${String(prev.length + 1).padStart(3, "0")}`,
      },
    ]);
  }

  function updateRow(index: number, key: keyof WayplanRow, value: any) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function openManifest() {
    const html = buildManifestHtml(rows);
    const win = window.open("", "_blank");

    if (!win) {
      setMessage("Popup blocked. Allow popup to preview manifest.");
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function downloadManifestHtml() {
    downloadText(`Britium_Wayplan_Manifest_${new Date().toISOString().slice(0, 10)}.html`, buildManifestHtml(rows), "text/html;charset=utf-8");
  }

  function downloadCurrentCsv() {
    downloadText(`Britium_Wayplan_Current_Rows_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows), "text/csv;charset=utf-8");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-950">Wayplan Template Generator</h1>
            <p className="text-slate-600">Upload the wayplan template, review groups, generate print-ready manifests, and download CSV/HTML.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/templates/Britium_Wayplan_Generator_Template.xlsx" download className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-800">
              <FileSpreadsheet className="h-4 w-4" />
              Download XLSX Template
            </a>

            <button type="button" onClick={downloadTemplateCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-800">
              <Download className="h-4 w-4" />
              Download CSV Template
            </button>

            <a href="/tools/Britium_Wayplan_Manifest_Generator.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-black text-white">
              <FileText className="h-4 w-4" />
              Open Standalone Generator
            </a>
          </div>
        </header>

        {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div>}

        <section className="grid gap-4 md:grid-cols-5">
          <Metric label="Rows Loaded" value={rows.length} />
          <Metric label="Manifest Groups" value={groups.length} />
          <Metric label="Total COD" value={`${totalCod.toLocaleString()} MMK`} />
          <Metric label="Total Fee" value={`${totalFee.toLocaleString()} MMK`} />
          <Metric label="Printable Rows" value={rows.filter((row) => String(row.print || "Y").toUpperCase() !== "N").length} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Upload Template</h2>
              <p className="mt-1 text-sm text-slate-500">CSV works directly. For XLSX, use standalone generator or export Excel as CSV.</p>

              <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                <Upload className="h-10 w-10 text-slate-400" />
                <span className="mt-3 text-sm font-black text-slate-800">Choose CSV / XLSX template</span>
                <span className="mt-1 text-xs text-slate-500">Recommended: CSV exported from Excel</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
              </label>

              <div className="mt-5 grid gap-2">
                <button type="button" onClick={addManualRow} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-800">
                  <RefreshCw className="h-4 w-4" />
                  Add Manual Row
                </button>

                <button type="button" onClick={openManifest} disabled={rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50">
                  <Printer className="h-4 w-4" />
                  Preview / Print Manifest
                </button>

                <button type="button" onClick={downloadManifestHtml} disabled={rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  Download Manifest HTML
                </button>

                <button type="button" onClick={downloadCurrentCsv} disabled={rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-800 disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  Download Current CSV
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Manifest Groups</h2>
              <div className="mt-4 space-y-3">
                {groups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No groups loaded.</div>
                ) : (
                  groups.map(([group, count]) => (
                    <div key={group} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                      <div>
                        <div className="font-black text-slate-950">{group}</div>
                        <div className="text-xs text-slate-500">{count} row(s)</div>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">PRINT</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search manifest rows..." className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm" />
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Template Rows</h2>
                  <p className="text-sm text-slate-500">Showing {filteredRows.length} of {rows.length} rows.</p>
                </div>
                {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1800px] text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-3">Group</th>
                      <th className="px-3 py-3">Seq</th>
                      <th className="px-3 py-3">Way ID</th>
                      <th className="px-3 py-3">Merchant</th>
                      <th className="px-3 py-3">Recipient</th>
                      <th className="px-3 py-3">Phone</th>
                      <th className="px-3 py-3">Town</th>
                      <th className="px-3 py-3">Address</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3">Fee</th>
                      <th className="px-3 py-3">Weight</th>
                      <th className="px-3 py-3">Surcharge</th>
                      <th className="px-3 py-3">COD</th>
                      <th className="px-3 py-3">Driver/Rider</th>
                      <th className="px-3 py-3">Helper</th>
                      <th className="px-3 py-3">Plate</th>
                      <th className="px-3 py-3">Print</th>
                      <th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={18} className="px-4 py-12 text-center text-slate-500">No rows loaded. Upload a CSV or add a manual row.</td>
                      </tr>
                    ) : (
                      filteredRows.map((row, visibleIndex) => {
                        const realIndex = rows.indexOf(row);

                        return (
                          <tr key={`${row.way_id}-${visibleIndex}`} className="border-t border-slate-100">
                            <Cell value={row.manifest_group} onChange={(v) => updateRow(realIndex, "manifest_group", v)} />
                            <Cell value={row.stop_sequence} onChange={(v) => updateRow(realIndex, "stop_sequence", v)} small />
                            <Cell value={row.way_id} onChange={(v) => updateRow(realIndex, "way_id", v)} mono />
                            <Cell value={row.merchant} onChange={(v) => updateRow(realIndex, "merchant", v)} />
                            <Cell value={row.recipient_name} onChange={(v) => updateRow(realIndex, "recipient_name", v)} />
                            <Cell value={row.recipient_phone} onChange={(v) => updateRow(realIndex, "recipient_phone", v)} />
                            <Cell value={row.recipient_town} onChange={(v) => updateRow(realIndex, "recipient_town", v)} />
                            <Cell value={row.recipient_address} onChange={(v) => updateRow(realIndex, "recipient_address", v)} wide />
                            <Cell value={row.item_price} onChange={(v) => updateRow(realIndex, "item_price", num(v))} number />
                            <Cell value={row.deli_fee} onChange={(v) => updateRow(realIndex, "deli_fee", num(v))} number />
                            <Cell value={row.weight} onChange={(v) => updateRow(realIndex, "weight", num(v))} number />
                            <Cell value={row.surcharge} onChange={(v) => updateRow(realIndex, "surcharge", num(v))} number />
                            <Cell value={row.final_cod} onChange={(v) => updateRow(realIndex, "final_cod", num(v))} number />
                            <Cell value={row.driver_rider} onChange={(v) => updateRow(realIndex, "driver_rider", v)} />
                            <Cell value={row.helper} onChange={(v) => updateRow(realIndex, "helper", v)} />
                            <Cell value={row.plate_no} onChange={(v) => updateRow(realIndex, "plate_no", v)} />
                            <Cell value={row.print} onChange={(v) => updateRow(realIndex, "print", v)} small />
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeRow(realIndex)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{String(value)}</div>
    </div>
  );
}

function Cell({ value, onChange, number = false, mono = false, wide = false, small = false }: any) {
  return (
    <td className="px-3 py-2">
      <input
        type={number ? "number" : "text"}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 rounded-lg border border-slate-200 px-2 text-xs ${wide ? "w-72" : small ? "w-20" : "w-44"} ${mono ? "font-mono font-bold text-blue-700" : ""}`}
      />
    </td>
  );
}
