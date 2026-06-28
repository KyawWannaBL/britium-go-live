import React, { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Printer, RefreshCw, Search, Upload, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };
const FF = { body:"'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Wayplan Template Generator",
    subtitle: "Upload the wayplan template, review groups, generate print-ready manifests, and download CSV/HTML.",
    btnXlsx: "Download XLSX Template",
    btnCsv: "Download CSV Template",
    btnStandalone: "Open Standalone Generator",
    kpiLoaded: "Rows Loaded", kpiGroups: "Manifest Groups", kpiCod: "Total COD", kpiFee: "Total Fee", kpiPrint: "Printable Rows",
    uploadTitle: "Upload Template",
    uploadSub: "CSV works directly. For XLSX, use standalone generator or export Excel as CSV.",
    chooseFile: "Choose CSV / XLSX template",
    recCsv: "Recommended: CSV exported from Excel",
    btnAddRow: "Add Manual Row", btnPreview: "Preview / Print Manifest", btnDownHtml: "Download Manifest HTML", btnDownCsv: "Download Current CSV",
    groupTitle: "Manifest Groups",
    noGroups: "No groups loaded.",
    searchPh: "Search manifest rows...",
    tmplTitle: "Template Rows",
    showing: (f: number, t: number) => `Showing ${f} of ${t} rows.`,
    thGroup: "Group", thSeq: "Seq", thWayId: "Way ID", thMerch: "Merchant", thRecv: "Recipient", thPhone: "Phone", thTown: "Town", thAddr: "Address", thItem: "Item", thFee: "Fee", thWgt: "Weight", thSurch: "Surcharge", thCod: "COD", thRider: "Driver/Rider", thHelper: "Helper", thPlate: "Plate", thPrint: "Print", thAction: "Action",
    btnRemove: "Remove",
    noRows: "No rows loaded. Upload a CSV or add a manual row.",
    msgXlsx: "For XLSX, use the standalone generator in /tools/ or export Excel as CSV and upload the CSV here.",
    msgUnsupp: "Unsupported file type. Please upload CSV.",
    msgLoaded: (n: number) => `Loaded ${n} row(s) from CSV.`,
    msgPopup: "Popup blocked. Allow popup to preview manifest."
  },
  mm: {
    title: "လမ်းကြောင်း ပုံစံ ဖန်တီးမှု",
    subtitle: "လမ်းကြောင်းပုံစံကို တင်ပါ၊ အုပ်စုများကို စစ်ဆေးပါ၊ ပရင့်ထုတ်ရန် အသင့်ဖြစ်သော စာရင်းများ ဖန်တီးပြီး CSV/HTML ဒေါင်းလုဒ်ဆွဲပါ။",
    btnXlsx: "XLSX ပုံစံ ဒေါင်းလုဒ်ဆွဲရန်",
    btnCsv: "CSV ပုံစံ ဒေါင်းလုဒ်ဆွဲရန်",
    btnStandalone: "သီးခြား ဖန်တီးမှုစနစ် ဖွင့်ရန်",
    kpiLoaded: "စာကြောင်း အရေအတွက်", kpiGroups: "စာရင်း အုပ်စုများ", kpiCod: "စုစုပေါင်း ကောက်ခံငွေ", kpiFee: "စုစုပေါင်း ပို့ဆောင်ခ", kpiPrint: "ပရင့်ထုတ်မည့် စာကြောင်းများ",
    uploadTitle: "ပုံစံ တင်ရန်",
    uploadSub: "CSV ကို တိုက်ရိုက်အသုံးပြုနိုင်ပါသည်။ XLSX အတွက် သီးခြားဖန်တီးမှုစနစ်ကို သုံးပါ သို့မဟုတ် CSV အဖြစ် ပြောင်းလဲတင်ပါ။",
    chooseFile: "CSV / XLSX ပုံစံ ရွေးချယ်ပါ",
    recCsv: "အကြံပြုချက်: Excel မှ CSV အဖြစ် ပြောင်းလဲထားသောဖိုင်",
    btnAddRow: "စာကြောင်း အသစ်ထည့်ရန်", btnPreview: "စာရင်း ကြည့်ရန် / ပရင့်ထုတ်ရန်", btnDownHtml: "HTML စာရင်း ဒေါင်းလုဒ်ဆွဲရန်", btnDownCsv: "လက်ရှိ CSV ဒေါင်းလုဒ်ဆွဲရန်",
    groupTitle: "စာရင်း အုပ်စုများ",
    noGroups: "အုပ်စုများ မရှိပါ။",
    searchPh: "စာရင်းများကို ရှာရန်...",
    tmplTitle: "စာကြောင်းများ",
    showing: (f: number, t: number) => `စုစုပေါင်း ${t} ခုအနက် ${f} ခု ပြသနေသည်။`,
    thGroup: "အုပ်စု", thSeq: "စဉ်", thWayId: "လမ်းညွှန် ID", thMerch: "ကုန်သည်", thRecv: "လက်ခံသူ", thPhone: "ဖုန်း", thTown: "မြို့", thAddr: "လိပ်စာ", thItem: "ပစ္စည်း", thFee: "ပို့ဆောင်ခ", thWgt: "အလေးချိန်", thSurch: "အပိုကြေး", thCod: "ကောက်ခံငွေ", thRider: "ယာဉ်မောင်း/ပို့ဆောင်သူ", thHelper: "ယာဉ်နောက်လိုက်", thPlate: "ယာဉ်အမှတ်", thPrint: "ပရင့်", thAction: "လုပ်ဆောင်ရန်",
    btnRemove: "ဖယ်ရှားမည်",
    noRows: "စာကြောင်းများ မရှိပါ။ CSV ဖိုင်တင်ပါ သို့မဟုတ် အသစ်ထည့်ပါ။",
    msgXlsx: "XLSX အတွက် သီးခြားဖန်တီးမှုစနစ် (/tools/) ကို သုံးပါ သို့မဟုတ် CSV အဖြစ် ပြောင်းလဲတင်ပါ။",
    msgUnsupp: "ဖိုင်အမျိုးအစား မှားယွင်းနေပါသည်။ CSV ဖိုင် တင်ပါ။",
    msgLoaded: (n: number) => `CSV မှ စာကြောင်းရေ ${n} ကြောင်း ဆွဲယူပြီးပါပြီ။`,
    msgPopup: "Popup ပိတ်ထားပါသည်။ စာရင်းကြည့်ရန် Popup ဖွင့်ပေးပါ။"
  }
};

type WayplanRow = {
  manifest_group: string; route_type: string; highway_drop: string; stop_sequence: string; pickup_date: string; pickup_way_id: string; way_id: string; merchant: string; recipient_name: string; recipient_phone: string; recipient_town: string; recipient_address: string; item_price: number; deli_fee: number; weight: number; surcharge: number; final_cod: number; destination: string; driver_rider: string; helper: string; plate_no: string; remarks: string; print: string;
};

const TEMPLATE_HEADERS = [ "Manifest Group", "Route Type", "Highway Drop", "Stop Sequence", "Pickup Date", "Pickup Way ID", "Way ID", "Merchant", "Recipient Name", "Recipient Phone", "Recipient Town", "Recipient Address", "Item Price", "Deli Fee", "Weight", "Surcharge", "Final COD", "Destination", "Driver/Rider", "Helper", "Plate No.", "Remarks", "Print?" ];

const emptyRow: WayplanRow = { manifest_group: "YGN-NORTH", route_type: "Local Delivery", highway_drop: "", stop_sequence: "1", pickup_date: new Date().toISOString().slice(0, 10), pickup_way_id: "", way_id: "", merchant: "", recipient_name: "", recipient_phone: "", recipient_town: "", recipient_address: "", item_price: 0, deli_fee: 0, weight: 1, surcharge: 0, final_cod: 0, destination: "", driver_rider: "", helper: "", plate_no: "", remarks: "", print: "Y" };

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
    const char = line[i]; const next = line[i + 1];
    if (char === '"' && insideQuote && next === '"') { current += '"'; i += 1; continue; }
    if (char === '"') { insideQuote = !insideQuote; continue; }
    if (char === "," && !insideQuote) { cells.push(current.trim()); current = ""; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): WayplanRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, "_").replace(/[?/]/g, ""));
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line); const raw: any = {};
    headers.forEach((header, index) => { raw[header] = cells[index] || ""; });
    return {
      manifest_group: raw.manifest_group || "", route_type: raw.route_type || "Local Delivery", highway_drop: raw.highway_drop || "", stop_sequence: raw.stop_sequence || "", pickup_date: raw.pickup_date || "", pickup_way_id: raw.pickup_way_id || "", way_id: raw.way_id || "", merchant: raw.merchant || "", recipient_name: raw.recipient_name || "", recipient_phone: raw.recipient_phone || "", recipient_town: raw.recipient_town || "", recipient_address: raw.recipient_address || "", item_price: num(raw.item_price), deli_fee: num(raw.deli_fee), weight: num(raw.weight), surcharge: num(raw.surcharge), final_cod: num(raw.final_cod), destination: raw.destination || raw.recipient_town || "", driver_rider: raw.driver_rider || "", helper: raw.helper || "", plate_no: raw.plate_no || "", remarks: raw.remarks || "", print: raw.print || raw.print_ || "Y",
    };
  });
}

function rowsToCsv(rows: WayplanRow[]) {
  return [
    TEMPLATE_HEADERS,
    ...rows.map((row) => [row.manifest_group, row.route_type, row.highway_drop, row.stop_sequence, row.pickup_date, row.pickup_way_id, row.way_id, row.merchant, row.recipient_name, row.recipient_phone, row.recipient_town, row.recipient_address, row.item_price, row.deli_fee, row.weight, row.surcharge, row.final_cod, row.destination, row.driver_rider, row.helper, row.plate_no, row.remarks, row.print]),
  ].map((line) => line.map(csvEscape).join(",")).join("\n");
}

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function groupRows(rows: WayplanRow[]) {
  const grouped = new Map<string, WayplanRow[]>();
  rows.filter((row) => String(row.print || "Y").toUpperCase() !== "N").forEach((row) => {
    const key = clean(row.manifest_group, "UNASSIGNED");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  });
  return grouped;
}

function buildManifestHtml(rows: WayplanRow[]) {
  const grouped = groupRows(rows);
  const generatedAt = new Date().toLocaleString();
  const pages = Array.from(grouped.entries()).map(([group, groupRows]) => {
    const first = groupRows[0] || emptyRow;
    const totalCod = groupRows.reduce((sum, row) => sum + num(row.final_cod), 0);
    const totalFee = groupRows.reduce((sum, row) => sum + num(row.deli_fee), 0);
    const totalWeight = groupRows.reduce((sum, row) => sum + num(row.weight), 0);
    const bodyRows = groupRows.sort((a, b) => num(a.stop_sequence) - num(b.stop_sequence)).map((row, index) => `
      <tr>
        <td>${row.stop_sequence || index + 1}</td><td class="mono">${row.way_id}</td><td>${row.merchant}</td>
        <td>${row.recipient_name}<br><small>${row.recipient_phone}</small></td><td>${row.recipient_town}</td>
        <td>${row.recipient_address}</td><td class="num">${num(row.item_price).toLocaleString()}</td>
        <td class="num">${num(row.deli_fee).toLocaleString()}</td><td class="num">${num(row.weight).toLocaleString()}</td>
        <td class="num">${num(row.surcharge).toLocaleString()}</td><td class="num"><b>${num(row.final_cod).toLocaleString()}</b></td>
        <td>${row.remarks || ""}</td>
      </tr>`).join("");
    return `
      <section class="page">
        <header class="top"><div><h1>BRITIUM EXPRESS</h1><p>Wayplan Manifest / Print Ready Route Sheet</p></div><div class="badge">${group}</div></header>
        <table class="meta">
          <tr><td><b>Manifest Group</b></td><td>${group}</td><td><b>Route Type</b></td><td>${first.route_type}</td></tr>
          <tr><td><b>Pickup Date</b></td><td>${first.pickup_date || ""}</td><td><b>Highway Drop</b></td><td>${first.highway_drop || "-"}</td></tr>
          <tr><td><b>Driver/Rider</b></td><td>${first.driver_rider || "-"}</td><td><b>Helper</b></td><td>${first.helper || "-"}</td></tr>
          <tr><td><b>Plate No.</b></td><td>${first.plate_no || "-"}</td><td><b>Generated</b></td><td>${generatedAt}</td></tr>
        </table>
        <table class="items">
          <thead><tr><th>#</th><th>Way ID</th><th>Merchant</th><th>Recipient</th><th>Town</th><th>Address</th><th>Item</th><th>Fee</th><th>Wgt</th><th>Surch.</th><th>COD</th><th>Remarks</th></tr></thead>
          <tbody>${bodyRows}</tbody>
          <tfoot><tr><th colspan="7">TOTAL</th><th class="num">${totalFee.toLocaleString()}</th><th class="num">${totalWeight.toLocaleString()}</th><th></th><th class="num">${totalCod.toLocaleString()}</th><th>${groupRows.length} pcs</th></tr></tfoot>
        </table>
        <div class="cash">
          <div><b>Total COD Collection</b><span>${totalCod.toLocaleString()} MMK</span></div>
          <div><b>Total Delivery Fee</b><span>${totalFee.toLocaleString()} MMK</span></div>
          <div><b>Total Parcels</b><span>${groupRows.length}</span></div>
        </div>
        <div class="sign"><div>Prepared By</div><div>Supervisor</div><div>Driver / Rider</div><div>Warehouse / Cashier</div></div>
      </section>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Britium Wayplan Manifest</title><style>
    @page { size: A4 landscape; margin: 8mm; }
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Pyidaungsu&display=swap');
    body { margin: 0; background: #e5e7eb; font-family: 'Poppins', 'Pyidaungsu', sans-serif; color: #111827; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; padding: 10px; background: #0f172a; }
    .toolbar button { border: 0; border-radius: 8px; background: #2563eb; color: white; font-weight: 800; padding: 9px 14px; cursor: pointer; font-family: 'Poppins', sans-serif; }
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
    @media print { body { background: white; } .toolbar { display: none; } .page { margin: 0; box-shadow: none; width: auto; min-height: auto; } }
  </style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button><button onclick="downloadHtml()">Download HTML</button></div>${pages || `<section class="page"><h1>BRITIUM EXPRESS</h1><p>No rows loaded.</p></section>`}
  <script>function downloadHtml() { const html = document.documentElement.outerHTML; const blob = new Blob([html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "Britium_Wayplan_Manifest.html"; a.click(); URL.revokeObjectURL(url); }</script></body></html>`;
}

export default function WayplanTemplateGeneratorPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

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

  function downloadTemplateCsv() { downloadText("Britium_Wayplan_Generator_Template.csv", rowsToCsv([emptyRow]), "text/csv;charset=utf-8"); }

  async function handleFile(file?: File | null) {
    if (!file) return;
    setLoading(true); setMessage("");
    try {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "csv") {
        const text = await file.text();
        const parsed = parseCsv(text);
        setRows(parsed);
        setMessage(t.msgLoaded(parsed.length));
      } else if (ext === "xlsx" || ext === "xls") {
        setMessage(t.msgXlsx);
      } else {
        setMessage(t.msgUnsupp);
      }
    } catch (error: any) {
      setMessage(error?.message || "Unable to read template file.");
    } finally {
      setLoading(false);
    }
  }

  function addManualRow() {
    setRows((prev) => [...prev, { ...emptyRow, stop_sequence: String(prev.length + 1), way_id: `D-MANUAL-${String(prev.length + 1).padStart(3, "0")}` }]);
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
    if (!win) { setMessage(t.msgPopup); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }

  function downloadManifestHtml() { downloadText(`Britium_Wayplan_Manifest_${new Date().toISOString().slice(0, 10)}.html`, buildManifestHtml(rows), "text/html;charset=utf-8"); }
  function downloadCurrentCsv() { downloadText(`Britium_Wayplan_Current_Rows_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows), "text/csv;charset=utf-8"); }

  const btnStyle = (primary = false): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: `1px solid ${primary ? C.gold : C.border}`, background: primary ? C.gold : C.panel2, color: primary ? '#082032' : C.text, fontSize: 13, fontWeight: 700, fontFamily: FF.body, cursor: 'pointer', transition: 'all 0.2s', opacity: rows.length === 0 && !primary ? 0.6 : 1 });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <style>{`input:focus{outline:none;border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:${C.panelHover}!important} ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}`}</style>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: C.gold, margin: 0, letterSpacing: '0.05em' }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <a href="/templates/Britium_Wayplan_Generator_Template.xlsx" download style={{ ...btnStyle(), textDecoration: 'none' }}><FileSpreadsheet size={16} />{t.btnXlsx}</a>
            <button onClick={downloadTemplateCsv} style={btnStyle()}><Download size={16} />{t.btnCsv}</button>
            <a href="/tools/Britium_Wayplan_Manifest_Generator.html" target="_blank" rel="noreferrer" style={{ ...btnStyle(true), textDecoration: 'none', background: C.info, borderColor: C.info }}><FileText size={16} />{t.btnStandalone}</a>
          </div>
        </header>

        {message && <div style={{ padding: 16, borderRadius: 12, background: 'rgba(56,189,248,0.1)', color: C.info, border: `1px solid ${C.info}40`, fontSize: 14, fontWeight: 700 }}>{message}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[[t.kpiLoaded, rows.length, C.info], [t.kpiGroups, groups.length, C.success], [t.kpiCod, `${totalCod.toLocaleString()} MMK`, C.gold], [t.kpiFee, `${totalFee.toLocaleString()} MMK`, C.orange], [t.kpiPrint, rows.filter((r) => String(r.print || "Y").toUpperCase() !== "N").length, C.text]].map(([lbl, val, col]: any) => (
            <div key={lbl} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${col}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: col, marginTop: 8 }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 420px) 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 20 }}>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>{t.uploadTitle}</h2>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>{t.uploadSub}</p>

              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, border: `2px dashed ${C.border}`, borderRadius: 16, background: C.panel2, cursor: 'pointer', transition: 'all 0.2s' }}>
                <Upload size={32} color={C.muted} style={{ marginBottom: 12 }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{t.chooseFile}</span>
                <span style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{t.recCsv}</span>
                <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>

              <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
                <button onClick={addManualRow} style={{ ...btnStyle(), width: '100%', justifyContent: 'center' }}><RefreshCw size={16} />{t.btnAddRow}</button>
                <button onClick={openManifest} disabled={rows.length === 0} style={{ ...btnStyle(true), width: '100%', justifyContent: 'center' }}><Printer size={16} />{t.btnPreview}</button>
                <button onClick={downloadManifestHtml} disabled={rows.length === 0} style={{ ...btnStyle(true), background: C.success, borderColor: C.success, width: '100%', justifyContent: 'center' }}><Download size={16} />{t.btnDownHtml}</button>
                <button onClick={downloadCurrentCsv} disabled={rows.length === 0} style={{ ...btnStyle(), width: '100%', justifyContent: 'center' }}><Download size={16} />{t.btnDownCsv}</button>
              </div>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>{t.groupTitle}</h2>
              <div style={{ display: 'grid', gap: 10, maxHeight: 300, overflow: 'auto', paddingRight: 4 }}>
                {groups.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13 }}>{t.noGroups}</div>
                ) : (
                  groups.map(([group, count]) => (
                    <div key={group} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: C.text }}>{group}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{count} row(s)</div>
                      </div>
                      <span style={{ background: 'rgba(56,189,248,0.1)', color: C.info, border: `1px solid ${C.info}40`, padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800 }}>PRINT</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <Search size={18} color={C.muted} style={{ position: 'absolute', left: 16, top: 14 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} style={{ width: '100%', height: 46, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, color: C.text, padding: '0 16px 0 46px', outline: 'none', fontFamily: FF.body, fontSize: 14 }} />
            </div>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{t.tmplTitle}</h2>
                  <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>{t.showing(filteredRows.length, rows.length)}</p>
                </div>
                {loading && <Loader2 size={18} className="animate-spin text-info" />}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 1800, textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: C.bg }}>
                    <tr>
                      {[t.thGroup, t.thSeq, t.thWayId, t.thMerch, t.thRecv, t.thPhone, t.thTown, t.thAddr, t.thItem, t.thFee, t.thWgt, t.thSurch, t.thCod, t.thRider, t.thHelper, t.thPlate, t.thPrint, t.thAction].map((h, i) => (
                        <th key={i} style={{ padding: '12px 14px', color: C.muted, fontWeight: 800, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr><td colSpan={18} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.noRows}</td></tr>
                    ) : (
                      filteredRows.map((row, visibleIndex) => {
                        const realIndex = rows.indexOf(row);
                        return (
                          <tr key={`${row.way_id}-${visibleIndex}`} style={{ borderBottom: `1px solid ${C.border}66` }}>
                            <Cell value={row.manifest_group} onChange={(v: string) => updateRow(realIndex, "manifest_group", v)} />
                            <Cell value={row.stop_sequence} onChange={(v: string) => updateRow(realIndex, "stop_sequence", v)} small />
                            <Cell value={row.way_id} onChange={(v: string) => updateRow(realIndex, "way_id", v)} mono />
                            <Cell value={row.merchant} onChange={(v: string) => updateRow(realIndex, "merchant", v)} />
                            <Cell value={row.recipient_name} onChange={(v: string) => updateRow(realIndex, "recipient_name", v)} />
                            <Cell value={row.recipient_phone} onChange={(v: string) => updateRow(realIndex, "recipient_phone", v)} />
                            <Cell value={row.recipient_town} onChange={(v: string) => updateRow(realIndex, "recipient_town", v)} />
                            <Cell value={row.recipient_address} onChange={(v: string) => updateRow(realIndex, "recipient_address", v)} wide />
                            <Cell value={row.item_price} onChange={(v: string) => updateRow(realIndex, "item_price", num(v))} number />
                            <Cell value={row.deli_fee} onChange={(v: string) => updateRow(realIndex, "deli_fee", num(v))} number />
                            <Cell value={row.weight} onChange={(v: string) => updateRow(realIndex, "weight", num(v))} number />
                            <Cell value={row.surcharge} onChange={(v: string) => updateRow(realIndex, "surcharge", num(v))} number />
                            <Cell value={row.final_cod} onChange={(v: string) => updateRow(realIndex, "final_cod", num(v))} number />
                            <Cell value={row.driver_rider} onChange={(v: string) => updateRow(realIndex, "driver_rider", v)} />
                            <Cell value={row.helper} onChange={(v: string) => updateRow(realIndex, "helper", v)} />
                            <Cell value={row.plate_no} onChange={(v: string) => updateRow(realIndex, "plate_no", v)} />
                            <Cell value={row.print} onChange={(v: string) => updateRow(realIndex, "print", v)} small />
                            <td style={{ padding: '8px 12px' }}>
                              <button onClick={() => removeRow(realIndex)} style={{ background: 'rgba(255,79,134,0.1)', color: C.error, border: `1px solid ${C.error}40`, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body }}>{t.btnRemove}</button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Cell({ value, onChange, number = false, mono = false, wide = false, small = false }: any) {
  return (
    <td style={{ padding: '8px 12px' }}>
      <input
        type={number ? "number" : "text"}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        style={{ height: 36, width: wide ? 280 : small ? 60 : 160, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, color: mono ? C.info : C.text, padding: '0 10px', fontSize: 12, fontFamily: mono ? 'monospace' : FF.body, fontWeight: mono ? 800 : 400, outline: 'none' }}
      />
    </td>
  );
}