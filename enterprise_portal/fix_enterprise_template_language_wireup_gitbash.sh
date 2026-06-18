#!/usr/bin/env bash
set -euo pipefail

cd /d/britium-go-live/enterprise_portal

mkdir -p backups src/components src/lib supabase

TS="$(date +%Y%m%d-%H%M%S)"
for f in src/App.tsx src/pages/DataEntryPage.tsx src/pages/WarehousePage.tsx src/pages/WarehouseOperationPage.tsx src/pages/WarehouseOperations.tsx src/pages/GenericRolePortalPage.tsx src/pages/DashboardPage.tsx src/pages/BranchOfficePage.tsx; do
  if [ -f "$f" ]; then
    cp "$f" "backups/$(basename "$f").before-template-language-$TS"
  fi
done

npm i xlsx

cat > src/components/LanguageToggle.tsx <<'EOF'
import React, { useEffect, useState } from "react";

export type BritiumLang = "en" | "mm";

export function getBritiumLang(): BritiumLang {
  const stored = localStorage.getItem("be_lang");
  return stored === "mm" ? "mm" : "en";
}

export function translate(lang: BritiumLang, en: string, mm?: string) {
  return lang === "mm" ? mm || en : en;
}

export default function LanguageToggle() {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());

  useEffect(() => {
    localStorage.setItem("be_lang", lang);
    window.dispatchEvent(new CustomEvent("be-language-change", { detail: { lang } }));
  }, [lang]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
      <button type="button" onClick={() => setLang("en")} style={{ padding: "7px 10px", opacity: lang === "en" ? 1 : 0.55 }}>EN</button>
      <button type="button" onClick={() => setLang("mm")} style={{ padding: "7px 10px", opacity: lang === "mm" ? 1 : 0.55 }}>MM</button>
    </div>
  );
}
EOF

cat > src/lib/templateDefinitions.ts <<'EOF'
export type ModuleKey = "data_entry" | "warehouse";

export type TemplateDefinition = {
  id: string;
  modules: ModuleKey[];
  titleEn: string;
  titleMm: string;
  descriptionEn: string;
  descriptionMm: string;
  sheetName: string;
  sourceType: string;
  headers: string[];
};

export const DATA_SOURCES = [
  { id: "customer_service", en: "Customer Service Portal", mm: "Customer Service Portal" },
  { id: "merchant_portal", en: "Merchant Portal", mm: "Merchant Portal" },
  { id: "customer_portal", en: "Customer Portal", mm: "Customer Portal" },
  { id: "manual_excel", en: "Manual Excel / CSV Upload", mm: "Excel / CSV တင်သွင်းခြင်း" },
  { id: "warehouse_scan", en: "Warehouse Scan / Intake", mm: "ဂိုဒေါင် Scan / Intake" },
  { id: "dispatch_manifest", en: "Dispatch Manifest", mm: "Dispatch Manifest" },
  { id: "rider_app", en: "Rider App", mm: "Rider App" },
  { id: "finance", en: "Finance / COD", mm: "Finance / COD" }
];

export const BRANCHES = ["HQ", "YGN", "MDY", "NPT", "YGN-MAIN", "YGN-NORTH", "YGN-EAST", "MDY-MAIN", "NPT-MAIN"];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "manifest",
    modules: ["data_entry"],
    titleEn: "Manifest Import Template",
    titleMm: "Manifest Import Template",
    descriptionEn: "Matches attached manifest.xlsx format exactly.",
    descriptionMm: "ပူးတွဲ manifest.xlsx ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "manifest",
    sourceType: "manifest",
    headers: [
      "id", "way_id", "customer_id", "merchant_id", "status", "recipient_name", "recipient_phone", "township",
      "delivery_address", "item_price", "delivery_charges", "cod_amount", "weight_kg", "created_at", "updated_at", "environment"
    ]
  },
  {
    id: "parcels",
    modules: ["data_entry"],
    titleEn: "Parcel Import Template",
    titleMm: "Parcel Import Template",
    descriptionEn: "Matches attached parcels.xlsx format exactly.",
    descriptionMm: "ပူးတွဲ parcels.xlsx ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "parcels",
    sourceType: "parcel",
    headers: [
      "id", "way_id", "customer_id", "merchant_id", "status", "recipient_name", "recipient_phone", "township",
      "delivery_address", "item_price", "delivery_charges", "cod_amount", "weight_kg", "created_at", "updated_at", "environment"
    ]
  },
  {
    id: "warehouse_inventory_rows",
    modules: ["data_entry", "warehouse"],
    titleEn: "Warehouse Inventory Rows Template",
    titleMm: "Warehouse Inventory Rows Template",
    descriptionEn: "Matches attached be_warehouse_inventory_rows.xlsx row-2 header format exactly.",
    descriptionMm: "ပူးတွဲ be_warehouse_inventory_rows.xlsx Row 2 Header ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "warehouse_inventory_rows",
    sourceType: "warehouse_inventory_rows",
    headers: [
      "Status", "Pickup Date", "Way ID", "Merchant", "Recipient name", "Recipient phone", "Town", "Recipient address",
      "Item price", "Delivery Fee (OS)", "Weight", "Surcharge", "COD", "Actual Collect", "Destination", "Pickup By", "Remarks"
    ]
  },
  {
    id: "warehouse_bird_eye_inventory",
    modules: ["warehouse"],
    titleEn: "Warehouse Inventory Bird Eye Template",
    titleMm: "Warehouse Inventory Bird Eye Template",
    descriptionEn: "Matches attached BE_Warehouse_Inventory_Bird_Eye_Template.xlsx Warehouse Inventory sheet.",
    descriptionMm: "ပူးတွဲ Warehouse Inventory sheet ပုံစံနှင့် ကိုက်ညီသည်။",
    sheetName: "Warehouse Inventory",
    sourceType: "warehouse_inventory",
    headers: [
      "Action", "Warehouse Code", "Warehouse Name", "Zone", "Aisle", "Rack", "Bin", "Pickup ID", "Way ID", "Merchant",
      "Recipient Name", "Recipient Phone", "Township", "Item Description", "SKU", "Qty", "Weight KG", "COD Amount",
      "Delivery Fee", "Inventory Status", "Supervisor Code", "Assigned Staff", "Received At", "Released At", "Remarks"
    ]
  },
  {
    id: "warehouse_bird_eye_summary",
    modules: ["warehouse"],
    titleEn: "Warehouse Bird Eye Summary Template",
    titleMm: "Warehouse Bird Eye Summary Template",
    descriptionEn: "Matches attached Bird Eye View sheet summary columns.",
    descriptionMm: "ပူးတွဲ Bird Eye View sheet summary columns နှင့် ကိုက်ညီသည်။",
    sheetName: "Bird Eye View",
    sourceType: "warehouse_summary",
    headers: [
      "Warehouse Code", "Zone", "Total Parcels", "Total COD", "Total Delivery Fee", "Received", "Assigned", "Hold Exception", "Returned", "Delivered"
    ]
  }
];

export function blankRows(headers: string[], count = 5) {
  return Array.from({ length: count }, () => Object.fromEntries(headers.map((h) => [h, ""])));
}
EOF

cat > src/components/BulkTemplateWorkbench.tsx <<'EOF'
import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../integrations/supabase/client";
import LanguageToggle, { BritiumLang, getBritiumLang, translate } from "./LanguageToggle";
import { BRANCHES, DATA_SOURCES, ModuleKey, TEMPLATE_DEFINITIONS, TemplateDefinition, blankRows } from "../lib/templateDefinitions";

type RowObject = Record<string, any>;

type Props = {
  module: ModuleKey;
  titleEn: string;
  titleMm: string;
  subtitleEn: string;
  subtitleMm: string;
};

function safeCell(value: any) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toCsv(headers: string[], rows: RowObject[]) {
  const esc = (v: any) => `"${safeCell(v).replaceAll('"', '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function downloadBlob(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildXlsx(template: TemplateDefinition, rows: RowObject[]) {
  const aoa = [template.headers, ...rows.map((row) => template.headers.map((header) => row[header] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = template.headers.map((header) => ({ wch: Math.max(14, Math.min(32, header.length + 3)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.sheetName.slice(0, 31));

  const meta = XLSX.utils.aoa_to_sheet([
    ["Template ID", template.id],
    ["Template Name", template.titleEn],
    ["Source Type", template.sourceType],
    ["Instruction", "Keep row 1 headers unchanged. Upload completed XLSX or CSV back into the portal."]
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Instructions");
  XLSX.writeFile(wb, `${template.id}.xlsx`);
}

function findHeaderRow(matrix: any[][], expectedHeaders: string[]) {
  let bestIndex = 0;
  let bestScore = -1;
  const expected = expectedHeaders.map((h) => h.toLowerCase().trim());

  matrix.slice(0, 10).forEach((row, index) => {
    const values = row.map((cell) => safeCell(cell).toLowerCase().trim());
    const score = expected.filter((h) => values.includes(h)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function normalizeRows(matrix: any[][], template: TemplateDefinition): RowObject[] {
  const headerIndex = findHeaderRow(matrix, template.headers);
  const sourceHeaders = (matrix[headerIndex] || []).map((h) => safeCell(h).trim());
  const dataRows = matrix.slice(headerIndex + 1);

  return dataRows
    .filter((row) => row.some((cell) => safeCell(cell).trim() !== ""))
    .map((row) => {
      const obj: RowObject = {};
      template.headers.forEach((header) => {
        const idx = sourceHeaders.findIndex((h) => h.toLowerCase() === header.toLowerCase());
        obj[header] = idx >= 0 ? row[idx] ?? "" : "";
      });
      return obj;
    });
}

async function parseUpload(file: File, template: TemplateDefinition): Promise<RowObject[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    return normalizeRows(matrix, template);
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
  return normalizeRows(matrix, template);
}

export default function BulkTemplateWorkbench({ module, titleEn, titleMm, subtitleEn, subtitleMm }: Props) {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());
  const [source, setSource] = useState("manual_excel");
  const [branch, setBranch] = useState("HQ");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const templates = useMemo(() => TEMPLATE_DEFINITIONS.filter((t) => t.modules.includes(module)), [module]);
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const template = useMemo(() => templates.find((t) => t.id === templateId) || templates[0], [templateId, templates]);
  const [rows, setRows] = useState<RowObject[]>(() => blankRows(template?.headers || [], 5));
  const [statuses, setStatuses] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (event: any) => setLang(event.detail?.lang === "mm" ? "mm" : "en");
    window.addEventListener("be-language-change", handler as EventListener);
    return () => window.removeEventListener("be-language-change", handler as EventListener);
  }, []);

  useEffect(() => {
    setRows(blankRows(template?.headers || [], 5));
  }, [template?.id]);

  useEffect(() => {
    async function loadRules() {
      const { data } = await (supabase as any).rpc("be_logistics_get_field_rules");
      const processType = module === "warehouse" ? "WAREHOUSE" : "PICKUP";
      const list = (data?.processStatusMaster || []).filter((s: any) => String(s.process_type).toUpperCase() === processType);
      setStatuses(list);
      if (list.length && !status) setStatus(list[0].status_code);
    }
    loadRules();
  }, [module]);

  function setCell(rowIndex: number, header: string, value: string) {
    setRows((current) => current.map((row, idx) => idx === rowIndex ? { ...row, [header]: value } : row));
  }

  function addRow() {
    setRows((current) => [...current, Object.fromEntries(template.headers.map((h) => [h, ""]))]);
  }

  function removeEmptyRows(inputRows: RowObject[]) {
    return inputRows.filter((row) => template.headers.some((header) => safeCell(row[header]).trim() !== ""));
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    const parsed = await parseUpload(file, template);
    setRows(parsed.length ? parsed : blankRows(template.headers, 5));
    setMessage(`${parsed.length} ${translate(lang, "rows loaded from file", "rows loaded")}`);
  }

  async function saveBulkLoad() {
    setBusy(true);
    setMessage("");

    try {
      const cleanRows = removeEmptyRows(rows);
      if (!cleanRows.length) throw new Error("No rows to save.");

      const user = await supabase.auth.getUser();
      const payload = {
        module,
        inbound_source: source,
        branch_code: branch,
        process_status: status,
        upload_date: date,
        template_id: template.id,
        template_name: template.titleEn,
        headers: template.headers,
        rows: cleanRows,
        actor_email: user.data.user?.email || localStorage.getItem("be_user_email") || "unknown"
      };

      const { data, error } = await (supabase as any).rpc("be_bulk_upload_save_rows", { p_payload: payload });
      if (error) throw error;
      setMessage(`${translate(lang, "Bulk load saved", "အစုလိုက်သိမ်းပြီး")}: ${data?.batch_id || "OK"}`);
    } catch (err: any) {
      setMessage(err?.message || "Bulk load failed. Run supabase/32_enterprise_bulk_template_upload_wireup.sql first.");
    } finally {
      setBusy(false);
    }
  }

  const sourceObj = DATA_SOURCES.find((s) => s.id === source);

  if (!template) {
    return <div className="be-page"><h1>{translate(lang, titleEn, titleMm)}</h1><p>No template configured.</p></div>;
  }

  return (
    <div className="be-page">
      <div className="be-page-header" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <p className="be-eyebrow">{translate(lang, "Template Bulk Load", "Template အစုလိုက်တင်ခြင်း")}</p>
          <h1>{translate(lang, titleEn, titleMm)}</h1>
          <p className="be-muted">{translate(lang, subtitleEn, subtitleMm)}</p>
        </div>
        <LanguageToggle />
      </div>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <h2>{translate(lang, "Inbound Filter", "အဝင်ဒေတာ Filter")}</h2>
        <div className="be-card-grid">
          <label><b>{translate(lang, "Inbound Data Source", "အဝင်ဒေတာရင်းမြစ်")}</b><select value={source} onChange={(e) => setSource(e.target.value)}>{DATA_SOURCES.map((item) => <option key={item.id} value={item.id}>{translate(lang, item.en, item.mm)}</option>)}</select></label>
          <label><b>{translate(lang, "Template Format", "Template ပုံစံ")}</b><select value={template.id} onChange={(e) => setTemplateId(e.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{translate(lang, item.titleEn, item.titleMm)}</option>)}</select></label>
          <label><b>{translate(lang, "Branch / Warehouse", "ဌာနခွဲ / ဂိုဒေါင်")}</b><select value={branch} onChange={(e) => setBranch(e.target.value)}>{BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          <label><b>{translate(lang, "Workflow Status", "Workflow Status")}</b><select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((s) => <option key={s.status_code} value={s.status_code}>{lang === "mm" ? s.status_name_mm || s.status_code : s.status_name_en || s.status_code}</option>)}</select></label>
          <label><b>{translate(lang, "Date", "ရက်စွဲ")}</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
      </section>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2>{translate(lang, template.titleEn, template.titleMm)}</h2>
            <p className="be-muted">{translate(lang, template.descriptionEn, template.descriptionMm)}</p>
            <p className="be-muted">{translate(lang, "Selected source", "ရွေးထားသောရင်းမြစ်")}: {translate(lang, sourceObj?.en || source, sourceObj?.mm)}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => buildXlsx(template, blankRows(template.headers, 20))}>{translate(lang, "Download XLSX Template", "XLSX Template ဒေါင်းလုဒ်")}</button>
            <button type="button" onClick={() => downloadBlob(`${template.id}.csv`, toCsv(template.headers, blankRows(template.headers, 20)), "text/csv;charset=utf-8")}>{translate(lang, "Download CSV", "CSV ဒေါင်းလုဒ်")}</button>
            <label style={{ display: "inline-flex", alignItems: "center", background: "rgba(228,183,46,.14)", border: "1px solid rgba(228,183,46,.35)", padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontWeight: 900 }}>
              {translate(lang, "Upload Excel / CSV", "Excel / CSV တင်ရန်")}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: "none" }} />
            </label>
          </div>
        </div>
      </section>

      {message && <div className="be-alert" style={{ margin: "0 0 18px" }}>{message}</div>}

      <section className="be-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2>{translate(lang, "Webform Template Rows", "Webform Template Rows")}</h2>
            <p className="be-muted">{translate(lang, "Headers are locked to the uploaded Excel format.", "Header များကို ပူးတွဲ Excel ပုံစံအတိုင်း သတ်မှတ်ထားသည်။")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={addRow}>{translate(lang, "Add Row", "Row ထည့်ရန်")}</button>
            <button type="button" disabled={busy} onClick={saveBulkLoad}>{busy ? translate(lang, "Saving...", "သိမ်းနေသည်...") : translate(lang, "Save Bulk Load", "အစုလိုက် သိမ်းရန်")}</button>
          </div>
        </div>

        <div className="be-table-wrap" style={{ marginTop: 14 }}>
          <table className="be-table">
            <thead><tr><th>#</th>{template.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{template.headers.map((header) => <td key={header}><input value={safeCell(row[header])} onChange={(e) => setCell(rowIndex, header, e.target.value)} placeholder={header} style={{ minWidth: 140, width: "100%" }} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
EOF

cat > src/components/OperationalModuleDashboard.tsx <<'EOF'
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import LanguageToggle, { BritiumLang, getBritiumLang, translate } from "./LanguageToggle";
import { BRANCHES, DATA_SOURCES } from "../lib/templateDefinitions";

type Props = {
  titleEn: string;
  titleMm?: string;
  moduleCode: string;
  processType?: string;
};

export default function OperationalModuleDashboard({ titleEn, titleMm, moduleCode, processType }: Props) {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());
  const [source, setSource] = useState("manual_excel");
  const [branch, setBranch] = useState("HQ");
  const [status, setStatus] = useState("");
  const [rules, setRules] = useState<any>({});
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (event: any) => setLang(event.detail?.lang === "mm" ? "mm" : "en");
    window.addEventListener("be-language-change", handler as EventListener);
    return () => window.removeEventListener("be-language-change", handler as EventListener);
  }, []);

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const ruleResult = await (supabase as any).rpc("be_logistics_get_field_rules");
        if (ruleResult.error) throw ruleResult.error;
        setRules(ruleResult.data || {});

        const eventResult = await (supabase as any)
          .from("be_logistics_workflow_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (eventResult.error) throw eventResult.error;
        setEvents(eventResult.data || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load module data");
      }
    }
    load();
  }, [moduleCode]);

  const statuses = useMemo(() => {
    const list = rules.processStatusMaster || [];
    return processType ? list.filter((s: any) => String(s.process_type).toUpperCase() === processType.toUpperCase()) : list;
  }, [rules, processType]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (processType && String(event.process_type || "").toUpperCase() !== processType.toUpperCase()) return false;
      if (status && String(event.status_code || "").toUpperCase() !== status.toUpperCase()) return false;
      if (branch !== "HQ" && String(event.branch_code || "").toUpperCase() !== branch.toUpperCase()) return false;
      return true;
    });
  }, [events, processType, status, branch]);

  return (
    <div className="be-page">
      <div className="be-page-header" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <p className="be-eyebrow">{translate(lang, "Operational Module", "လုပ်ငန်း Module")}</p>
          <h1>{translate(lang, titleEn, titleMm)}</h1>
          <p className="be-muted">{translate(lang, "Backend workflow, exception, branch, and source filters are connected.", "Backend workflow / exception / branch / source filters ချိတ်ဆက်ပြီး။")}</p>
        </div>
        <LanguageToggle />
      </div>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <h2>{translate(lang, "Module Filters", "Module Filter များ")}</h2>
        <div className="be-card-grid">
          <label><b>{translate(lang, "Inbound Source", "အဝင်ဒေတာရင်းမြစ်")}</b><select value={source} onChange={(e) => setSource(e.target.value)}>{DATA_SOURCES.map((s) => <option key={s.id} value={s.id}>{translate(lang, s.en, s.mm)}</option>)}</select></label>
          <label><b>{translate(lang, "Branch", "ဌာနခွဲ")}</b><select value={branch} onChange={(e) => setBranch(e.target.value)}>{BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          <label><b>{translate(lang, "Status", "Status")}</b><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{translate(lang, "All statuses", "Status အားလုံး")}</option>{statuses.map((s: any) => <option key={s.status_code} value={s.status_code}>{lang === "mm" ? s.status_name_mm || s.status_code : s.status_name_en || s.status_code}</option>)}</select></label>
        </div>
      </section>

      {error && <div className="be-alert" style={{ margin: "0 0 18px" }}>{error}</div>}

      <div className="be-card-grid">
        <section className="be-card"><h3>{translate(lang, "Statuses", "Status များ")}</h3><p>{rules.processStatusMaster?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Exceptions", "Exception များ")}</h3><p>{rules.exceptionMaster?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Dropdowns", "Dropdown များ")}</h3><p>{rules.dropdownValues?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Transitions", "Transition များ")}</h3><p>{rules.workflowTransitions?.length || 0}</p></section>
      </div>

      <section className="be-panel">
        <h2>{translate(lang, "Recent Workflow Events", "နောက်ဆုံး Workflow Event များ")}</h2>
        <div className="be-table-wrap">
          <table className="be-table">
            <thead><tr><th>Time</th><th>Process</th><th>Status</th><th>Exception</th><th>Pickup</th><th>Actor</th></tr></thead>
            <tbody>{filteredEvents.length ? filteredEvents.map((event) => <tr key={event.id}><td>{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</td><td>{event.process_type || "-"}</td><td>{event.status_code || "-"}</td><td>{event.exception_code || "-"}</td><td>{event.pickup_id || "-"}</td><td>{event.actor_email || event.actor_role || "-"}</td></tr>) : <tr><td colSpan={6}>{translate(lang, "No rows for current filters.", "လက်ရှိ Filter အတွက် Row မရှိပါ။")}</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
EOF

cat > src/pages/DataEntryPage.tsx <<'EOF'
import React from "react";
import BulkTemplateWorkbench from "../components/BulkTemplateWorkbench";

export default function DataEntryPage() {
  return (
    <BulkTemplateWorkbench
      module="data_entry"
      titleEn="Data Entry / Bulk Upload"
      titleMm="ဒေတာထည့်သွင်းခြင်း / အစုလိုက်တင်ခြင်း"
      subtitleEn="Select inbound data source, choose the exact Excel template, edit as webform rows, then upload or save bulk load."
      subtitleMm="အဝင်ဒေတာရင်းမြစ် ရွေးပါ၊ Excel Template ပုံစံ ရွေးပါ၊ Webform Row အဖြစ်ပြင်ပါ၊ ထို့နောက် Upload/Save လုပ်ပါ။"
    />
  );
}
EOF

cat > src/pages/WarehousePage.tsx <<'EOF'
import React from "react";
import BulkTemplateWorkbench from "../components/BulkTemplateWorkbench";

export default function WarehousePage() {
  return (
    <BulkTemplateWorkbench
      module="warehouse"
      titleEn="Warehouse Operations / Inventory Bulk Load"
      titleMm="ဂိုဒေါင်လုပ်ငန်း / Inventory အစုလိုက်တင်ခြင်း"
      subtitleEn="Filter inbound source, select warehouse inventory template, download/upload Excel, and stage rows into backend bulk load."
      subtitleMm="အဝင်ရင်းမြစ် Filter လုပ်ပြီး Warehouse Inventory Template ရွေးပါ၊ Excel Download/Upload လုပ်ပြီး Backend ထဲသို့ အစုလိုက်သိမ်းပါ။"
    />
  );
}
EOF

cat > src/pages/WarehouseOperationPage.tsx <<'EOF'
export { default } from "./WarehousePage";
EOF

cat > src/pages/WarehouseOperations.tsx <<'EOF'
export { default } from "./WarehousePage";
EOF

cat > src/pages/GenericRolePortalPage.tsx <<'EOF'
import React from "react";
import OperationalModuleDashboard from "../components/OperationalModuleDashboard";

export default function GenericRolePortalPage({ title, code, titleEn, titleMm, moduleCode, portalName, portalCode }: any) {
  const name = title || titleEn || portalName || "Operational Module";
  const codeValue = code || moduleCode || portalCode || "module";
  return <OperationalModuleDashboard titleEn={name} titleMm={titleMm || name} moduleCode={codeValue} />;
}
EOF

cat > src/pages/DashboardPage.tsx <<'EOF'
import React from "react";
import OperationalModuleDashboard from "../components/OperationalModuleDashboard";

export default function DashboardPage() {
  return <OperationalModuleDashboard titleEn="Operations Dashboard" titleMm="လုပ်ငန်း Dashboard" moduleCode="dashboard" />;
}
EOF

cat > src/pages/BranchOfficePage.tsx <<'EOF'
import React from "react";
import OperationalModuleDashboard from "../components/OperationalModuleDashboard";

export default function BranchOfficePage() {
  return <OperationalModuleDashboard titleEn="Branch Office" titleMm="ဌာနခွဲရုံး" moduleCode="branch_office" />;
}
EOF

cat > supabase/32_enterprise_bulk_template_upload_wireup.sql <<'EOF'
create extension if not exists pgcrypto;

create table if not exists public.be_bulk_upload_batches (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  inbound_source text,
  branch_code text,
  process_status text,
  upload_date date,
  template_id text,
  template_name text,
  header_columns jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  actor_email text,
  upload_status text not null default 'staged',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_bulk_upload_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_bulk_upload_batches(id) on delete cascade,
  module text not null,
  template_id text,
  row_no integer not null,
  row_payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending',
  validation_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists be_bulk_upload_rows_batch_idx on public.be_bulk_upload_rows(batch_id);
create index if not exists be_bulk_upload_batches_module_idx on public.be_bulk_upload_batches(module, template_id, created_at desc);

create or replace function public.be_bulk_upload_save_rows(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_rows jsonb := coalesce(p_payload->'rows', '[]'::jsonb);
  v_headers jsonb := coalesce(p_payload->'headers', '[]'::jsonb);
  v_row jsonb;
  v_index int := 0;
begin
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'rows must be a json array';
  end if;

  insert into public.be_bulk_upload_batches (
    id,
    module,
    inbound_source,
    branch_code,
    process_status,
    upload_date,
    template_id,
    template_name,
    header_columns,
    row_count,
    actor_email,
    upload_status,
    metadata,
    updated_at
  ) values (
    v_batch_id,
    nullif(p_payload->>'module', ''),
    nullif(p_payload->>'inbound_source', ''),
    coalesce(nullif(p_payload->>'branch_code', ''), 'HQ'),
    nullif(p_payload->>'process_status', ''),
    nullif(p_payload->>'upload_date', '')::date,
    nullif(p_payload->>'template_id', ''),
    nullif(p_payload->>'template_name', ''),
    v_headers,
    jsonb_array_length(v_rows),
    nullif(p_payload->>'actor_email', ''),
    'staged',
    jsonb_build_object('source', 'enterprise_portal_template_upload', 'payload_meta', p_payload - 'rows'),
    now()
  );

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_index := v_index + 1;
    insert into public.be_bulk_upload_rows (
      batch_id,
      module,
      template_id,
      row_no,
      row_payload,
      validation_status,
      validation_message,
      updated_at
    ) values (
      v_batch_id,
      nullif(p_payload->>'module', ''),
      nullif(p_payload->>'template_id', ''),
      v_index,
      v_row,
      case when v_row = '{}'::jsonb then 'empty' else 'staged' end,
      null,
      now()
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'row_count', jsonb_array_length(v_rows),
    'template_id', p_payload->>'template_id',
    'module', p_payload->>'module'
  );
end;
$$;

grant execute on function public.be_bulk_upload_save_rows(jsonb) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'be_bulk_upload_batches') then
    alter table public.be_bulk_upload_batches enable row level security;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'be_bulk_upload_rows') then
    alter table public.be_bulk_upload_rows enable row level security;
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='be_bulk_upload_batches' and policyname='be_bulk_upload_batches_authenticated_all') then
    create policy be_bulk_upload_batches_authenticated_all on public.be_bulk_upload_batches for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='be_bulk_upload_rows' and policyname='be_bulk_upload_rows_authenticated_all') then
    create policy be_bulk_upload_rows_authenticated_all on public.be_bulk_upload_rows for all to authenticated using (true) with check (true);
  end if;
exception when others then
  null;
end $$;

notify pgrst, 'reload schema';
EOF

python - <<'PY'
from pathlib import Path
p = Path('src/App.tsx')
text = p.read_text(encoding='utf-8')
if 'LanguageToggle' not in text:
    lines = text.splitlines()
    insert_at = 0
    for i, line in enumerate(lines):
        if line.startswith('import '):
            insert_at = i + 1
    lines.insert(insert_at, 'import LanguageToggle from "./components/LanguageToggle";')
    text = '\n'.join(lines) + '\n'

text = text.replace('<button onClick={signOut}>Sign out</button>', '<LanguageToggle />\n            <button onClick={signOut}>Sign out</button>')
p.write_text(text, encoding='utf-8')
print('Patched App.tsx with LanguageToggle')
PY

cat <<'EOF'

Patch files written.

Next steps:
1) Run this SQL in Supabase SQL Editor:
   enterprise_portal/supabase/32_enterprise_bulk_template_upload_wireup.sql

2) Build:
   npm run build

3) Deploy:
   npx vercel --prod --scope britium-ventures-website

4) Clear browser state and reload.
EOF
