import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../integrations/supabase/client";
import { BritiumLang, getBritiumLang, translate } from "./LanguageToggle";
import { BRANCHES, DATA_SOURCES, ModuleKey, TEMPLATE_DEFINITIONS, TemplateDefinition, blankRows } from "../lib/templateDefinitions";

type RowObject = Record<string, any>;
type PickupOption = Record<string, any>;
type SelectOption = { id: string; en: string; mm?: string };

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

function csvEscape(value: any) {
  return '"' + safeCell(value).replace(/"/g, '""') + '"';
}

function toCsv(headers: string[], rows: RowObject[]) {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");
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
  ws["!cols"] = template.headers.map((header) => ({ wch: Math.max(14, Math.min(34, header.length + 3)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.sheetName.slice(0, 31));
  const meta = XLSX.utils.aoa_to_sheet([
    ["Template ID", template.id],
    ["Template Name", template.titleEn],
    ["Source Type", template.sourceType],
    ["Instruction", "Keep row 1 headers unchanged. Upload completed XLSX or CSV back into the portal."]
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "Instructions");
  XLSX.writeFile(wb, template.id + ".xlsx");
}

function findHeaderRow(matrix: any[][], expectedHeaders: string[]) {
  let bestIndex = 0;
  let bestScore = -1;
  const expected = expectedHeaders.map((h) => h.toLowerCase().trim());
  matrix.slice(0, 12).forEach((row, index) => {
    const values = row.map((cell) => safeCell(cell).toLowerCase().trim());
    const score = expected.filter((h) => values.indexOf(h) >= 0).length;
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

function displayPickup(p: PickupOption) {
  const id = p.canonical_pickup_id || p.pickup_id || p.id || "";
  const merchant = p.merchant_code || p.merchant_name || "";
  const status = p.status || "";
  return [id, merchant, status].filter(Boolean).join(" - ");
}

function pickupIdOf(p: PickupOption) {
  return safeCell(p.canonical_pickup_id || p.pickup_id || p.id);
}

function updateKnownField(row: RowObject, headers: string[], names: string[], value: string) {
  if (!value) return;
  const lowerNames = names.map((n) => n.toLowerCase());
  headers.forEach((header) => {
    const key = header.toLowerCase().trim();
    if (lowerNames.indexOf(key) >= 0) row[header] = value;
  });
}

function optionFromDropdown(row: any): SelectOption | null {
  const value = safeCell(row.value || row.option_code || row.code || row.id).trim();
  if (!value) return null;
  return {
    id: value,
    en: safeCell(row.label_en || row.option_label_en || row.label || row.name || row.value || value),
    mm: safeCell(row.label_mm || row.option_label_mm || row["Myanmar Label"] || row.mm || "")
  };
}

function uniqueOptions(items: SelectOption[]) {
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  items.forEach((item) => {
    const key = item.id.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  });
  return out;
}

export default function BulkTemplateWorkbench({ module, titleEn, titleMm, subtitleEn, subtitleMm }: Props) {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());
  const [source, setSource] = useState("manual_excel");
  const [branch, setBranch] = useState("HQ");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickupId, setPickupId] = useState("");
  const [wayId, setWayId] = useState("");
  const [merchantCode, setMerchantCode] = useState("");
  const [actionCode, setActionCode] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [pickups, setPickups] = useState<PickupOption[]>([]);
  const [pickupError, setPickupError] = useState("");
  const [dropdownValues, setDropdownValues] = useState<any[]>([]);
  const [branchOptions, setBranchOptions] = useState<SelectOption[]>(BRANCHES.map((b) => ({ id: b, en: b, mm: b })));

  const processType = module === "warehouse" ? "WAREHOUSE" : "PICKUP";
  const templates = useMemo(() => TEMPLATE_DEFINITIONS.filter((t) => t.modules.indexOf(module) >= 0), [module]);
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const template = useMemo(() => templates.find((t) => t.id === templateId) || templates[0], [templateId, templates]);
  const [rows, setRows] = useState<RowObject[]>(() => blankRows(template?.headers || [], 5));
  const [statuses, setStatuses] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sourceOptions = useMemo(() => {
    const fromRules = dropdownValues
      .filter((d) => ["inbound_source", "inbound_data_source", "data_source", "source_channel"].indexOf(String(d.dropdown_name || d.option_group || "").toLowerCase()) >= 0)
      .map(optionFromDropdown)
      .filter(Boolean) as SelectOption[];
    const fallback = DATA_SOURCES.map((s) => ({ id: s.id, en: s.en, mm: s.mm }));
    return uniqueOptions(fromRules.length ? fromRules : fallback);
  }, [dropdownValues]);

  useEffect(() => {
    const handler = (event: any) => setLang(event.detail?.lang === "mm" ? "mm" : "en");
    window.addEventListener("be-language-change", handler as EventListener);
    return () => window.removeEventListener("be-language-change", handler as EventListener);
  }, []);

  useEffect(() => {
    setRows(blankRows(template?.headers || [], 5));
  }, [template?.id]);

  useEffect(() => {
    async function loadRulesAndMasterData() {
      const ruleResult = await (supabase as any).rpc("be_logistics_get_field_rules");
      const data = ruleResult.data || {};
      const list = (data.processStatusMaster || []).filter((s: any) => String(s.process_type).toUpperCase() === processType);
      const actionList = (data.workflowTransitions || []).filter((t: any) => String(t.process_type).toUpperCase() === processType);
      setStatuses(list);
      setActions(actionList);
      setDropdownValues(data.dropdownValues || []);
      if (list.length && !status) setStatus(list[0].status_code);
      if (actionList.length && !actionCode) setActionCode(actionList[0].action_code);

      const branchResult = await (supabase as any).from("be_branch_nodes").select("*").limit(300);
      if (!branchResult.error && Array.isArray(branchResult.data) && branchResult.data.length) {
        const mapped = branchResult.data.map((row: any) => {
          const code = safeCell(row.branch_code || row.code || row.branch_id || row.id).trim();
          const name = safeCell(row.branch_name || row.name || row.label || code).trim();
          return code ? { id: code, en: code + (name && name !== code ? " - " + name : ""), mm: safeCell(row.branch_name_mm || row.name_mm || "") } : null;
        }).filter(Boolean) as SelectOption[];
        if (mapped.length) setBranchOptions(uniqueOptions(mapped));
      }
    }
    loadRulesAndMasterData();
  }, [processType]);

  async function loadPickups() {
    setPickupError("");
    const base = (supabase as any).from("be_portal_pickup_requests");
    let result = await base
      .select("id,canonical_pickup_id,pickup_id,merchant_code,merchant_name,branch_code,status,assigned_rider_code,pickup_date,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (result.error) {
      result = await (supabase as any)
        .from("be_portal_pickup_requests")
        .select("id,pickup_id,merchant_code,merchant_name,branch_code,status,created_at")
        .limit(100);
    }

    if (result.error) {
      setPickupError(result.error.message || "Could not load pickup records.");
      setPickups([]);
      return;
    }

    setPickups(result.data || []);
  }

  useEffect(() => {
    loadPickups();
  }, []);

  function onSelectPickup(value: string) {
    setPickupId(value);
    const selected = pickups.find((p) => pickupIdOf(p) === value);
    if (!selected) return;
    setMerchantCode(safeCell(selected.merchant_code || selected.merchant_name));
    if (selected.branch_code) setBranch(safeCell(selected.branch_code));
    if (selected.status) setStatus(safeCell(selected.status));
  }

  function applyProcessContextToRows() {
    if (!template) return;
    setRows((current) => current.map((original) => {
      const row = { ...original };
      updateKnownField(row, template.headers, ["pickup_id", "pickup id", "Pickup ID"], pickupId);
      updateKnownField(row, template.headers, ["way_id", "way id", "Way ID"], wayId);
      updateKnownField(row, template.headers, ["merchant_id", "merchant_code", "merchant", "Merchant"], merchantCode);
      updateKnownField(row, template.headers, ["status", "inventory status", "Inventory Status"], status);
      updateKnownField(row, template.headers, ["branch", "branch_code", "warehouse code", "Warehouse Code"], branch);
      return row;
    }));
    setMessage(translate(lang, "Selected process context was applied to the webform rows.", "ရွေးထားသော Process Context ကို Row များတွင် ထည့်သွင်းပြီးပါပြီ။"));
  }

  function setCell(rowIndex: number, header: string, value: string) {
    setRows((current) => current.map((row, idx) => idx === rowIndex ? { ...row, [header]: value } : row));
  }

  function addRow() {
    if (!template) return;
    setRows((current) => current.concat([Object.fromEntries(template.headers.map((h) => [h, ""]))]));
  }

  function removeEmptyRows(inputRows: RowObject[]) {
    if (!template) return [];
    return inputRows.filter((row) => template.headers.some((header) => safeCell(row[header]).trim() !== ""));
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !template) return;
    setMessage("");
    setUploadedFileName(file.name);
    const parsed = await parseUpload(file, template);
    setRows(parsed.length ? parsed : blankRows(template.headers, 5));
    setMessage(String(parsed.length) + " " + translate(lang, "rows loaded from file", "rows loaded from file"));
  }

  async function saveBulkLoad() {
    if (!template) return;
    setBusy(true);
    setMessage("");
    try {
      const cleanRows = removeEmptyRows(rows);
      if (!cleanRows.length) throw new Error("No rows to save.");
      const user = await supabase.auth.getUser();
      const selectedPickup = pickups.find((p) => pickupIdOf(p) === pickupId) || null;
      const payload = {
        template_code: template.id,
        inbound_source: source,
        branch_code: branch,
        warehouse_code: module === "warehouse" ? branch : "",
        workflow_status: status,
        process_action: actionCode,
        pickup_id: pickupId,
        way_id: wayId,
        merchant_code: merchantCode,
        source_filename: uploadedFileName || template.id + "-webform.xlsx",
        uploaded_by_email: user.data.user?.email || localStorage.getItem("be_user_email") || "unknown",
        rows: cleanRows,
        metadata: {
          module,
          process_type: processType,
          upload_date: date,
          template_name: template.titleEn,
          headers: template.headers,
          selected_pickup: selectedPickup
        }
      };
      const { data, error } = await (supabase as any).rpc("be_bulk_upload_save_rows", { p_payload: payload });
      if (error) throw error;
      setMessage(translate(lang, "Bulk load saved", "Bulk load သိမ်းပြီးပါပြီ") + ": " + (data?.batch_id || "OK"));
    } catch (err: any) {
      setMessage(err?.message || "Bulk load failed. Run supabase/32_enterprise_bulk_template_upload_wireup.sql first.");
    } finally {
      setBusy(false);
    }
  }

  const sourceObj = sourceOptions.find((s) => s.id === source);
  if (!template) return <div className="be-page"><h1>{translate(lang, titleEn, titleMm)}</h1><p>No template configured.</p></div>;

  return (
    <div className="be-page btw-page">
      <style>{`
        .btw-page .be-panel {
          overflow: visible;
        }

        .btw-filter-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(190px, 1fr));
          align-items: end;
          gap: 16px;
        }

        .btw-context-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1.3fr) minmax(180px, .8fr) minmax(220px, 1fr) minmax(240px, 1.1fr);
          align-items: end;
          gap: 16px;
        }

        .btw-field {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .btw-field-label {
          height: 22px;
          display: flex;
          align-items: center;
          color: #f8fafc;
          font-weight: 900;
          font-size: 13px;
          line-height: 1;
        }

        .btw-control, .btw-button, .btw-upload-button {
          height: 46px;
          min-height: 46px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 850;
          line-height: 1;
        }

        .btw-control {
          width: 100%;
          min-width: 0;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(15, 29, 51, 0.72);
          color: #f8fafc;
          padding: 0 14px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }

        .btw-control:focus {
          border-color: rgba(228, 183, 46, 0.72);
          box-shadow: 0 0 0 3px rgba(228, 183, 46, 0.12);
        }

        .btw-control::placeholder {
          color: rgba(203, 213, 225, 0.45);
        }

        .btw-control option {
          background: #0f1d33;
          color: #f8fafc;
        }

        .btw-button, .btw-upload-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 18px;
          border: 1px solid rgba(228, 183, 46, 0.45);
          cursor: pointer;
          white-space: nowrap;
        }

        .btw-button-primary {
          background: #e4b72e;
          color: #07111f;
        }

        .btw-button-soft, .btw-upload-button {
          background: rgba(228, 183, 46, 0.13);
          color: #facc15;
        }

        .btw-button-muted {
          border-color: rgba(148, 163, 184, 0.24);
          background: rgba(148, 163, 184, 0.10);
          color: #dbeafe;
        }

        .btw-action-row {
          display: flex;
          gap: 10px;
          margin-top: 16px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btw-template-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .btw-row-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .btw-page .be-table input {
          height: 38px;
          min-width: 150px;
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 10px;
          background: rgba(15, 29, 51, 0.72);
          color: #f8fafc;
          padding: 0 10px;
          outline: none;
        }

        @media (max-width: 1250px) {
          .btw-filter-grid, .btw-context-grid {
            grid-template-columns: repeat(2, minmax(220px, 1fr));
          }
        }

        @media (max-width: 700px) {
          .btw-filter-grid, .btw-context-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="be-page-header">
        <p className="be-eyebrow">{translate(lang, "Template Bulk Load", "Template Bulk Load")}</p>
        <h1>{translate(lang, titleEn, titleMm)}</h1>
        <p className="be-muted">{translate(lang, subtitleEn, subtitleMm)}</p>
      </div>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <h2>{translate(lang, "Inbound and Process Filter", "Inbound and Process Filter")}</h2>
        <div className="btw-filter-grid">
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Inbound Data Source", "Inbound Data Source")}</span>
            <select className="btw-control" value={source} onChange={(e) => setSource(e.target.value)}>
              {sourceOptions.map((item) => <option key={item.id} value={item.id}>{translate(lang, item.en, item.mm)}</option>)}
            </select>
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Template Format", "Template Format")}</span>
            <select className="btw-control" value={template.id} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((item) => <option key={item.id} value={item.id}>{translate(lang, item.titleEn, item.titleMm)}</option>)}
            </select>
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Branch / Warehouse", "Branch / Warehouse")}</span>
            <select className="btw-control" value={branch} onChange={(e) => setBranch(e.target.value)}>
              {branchOptions.map((b) => <option key={b.id} value={b.id}>{translate(lang, b.en, b.mm)}</option>)}
            </select>
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Workflow Status", "Workflow Status")}</span>
            <select className="btw-control" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => <option key={s.status_code} value={s.status_code}>{lang === "mm" ? s.status_name_mm || s.status_code : s.status_name_en || s.status_code}</option>)}
            </select>
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Date", "Date")}</span>
            <input className="btw-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <h2>{translate(lang, "Related Pickup / Shipment Context", "Related Pickup / Shipment Context")}</h2>
        <p className="be-muted">{translate(lang, "Select Pickup ID and related process data before editing or uploading rows.", "Select Pickup ID and related process data before editing or uploading rows.")}</p>
        {pickupError && <p className="be-error">{pickupError}</p>}
        <div className="btw-context-grid">
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Pickup ID", "Pickup ID")}</span>
            <select className="btw-control" value={pickupId} onChange={(e) => onSelectPickup(e.target.value)}>
              <option value="">Manual / No pickup selected</option>
              {pickups.map((p) => <option key={pickupIdOf(p)} value={pickupIdOf(p)}>{displayPickup(p)}</option>)}
            </select>
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Way ID", "Way ID")}</span>
            <input className="btw-control" value={wayId} onChange={(e) => setWayId(e.target.value)} placeholder="Way ID" />
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Merchant Code / Name", "Merchant Code / Name")}</span>
            <input className="btw-control" value={merchantCode} onChange={(e) => setMerchantCode(e.target.value)} placeholder="Merchant" />
          </label>
          <label className="btw-field">
            <span className="btw-field-label">{translate(lang, "Process Action", "Process Action")}</span>
            <select className="btw-control" value={actionCode} onChange={(e) => setActionCode(e.target.value)}>
              <option value="">Select action</option>
              {actions.map((a) => <option key={a.action_code} value={a.action_code}>{a.action_code}</option>)}
            </select>
          </label>
        </div>
        <div className="btw-action-row">
          <button className="btw-button btw-button-soft" type="button" onClick={loadPickups}>{translate(lang, "Refresh Pickup List", "Refresh Pickup List")}</button>
          <button className="btw-button btw-button-primary" type="button" onClick={applyProcessContextToRows}>{translate(lang, "Apply Pickup Context to Rows", "Apply Pickup Context to Rows")}</button>
        </div>
      </section>

      <section className="be-panel" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2>{translate(lang, template.titleEn, template.titleMm)}</h2>
            <p className="be-muted">{translate(lang, template.descriptionEn, template.descriptionMm)}</p>
            <p className="be-muted">{translate(lang, "Selected source", "Selected source")}: {translate(lang, sourceObj?.en || source, sourceObj?.mm)}</p>
          </div>
          <div className="btw-template-actions">
            <button className="btw-button btw-button-primary" type="button" onClick={() => buildXlsx(template, blankRows(template.headers, 20))}>{translate(lang, "Download XLSX Template", "Download XLSX Template")}</button>
            <button className="btw-button btw-button-primary" type="button" onClick={() => downloadBlob(template.id + ".csv", toCsv(template.headers, blankRows(template.headers, 20)), "text/csv;charset=utf-8")}>{translate(lang, "Download CSV", "Download CSV")}</button>
            <label className="btw-upload-button">
              {translate(lang, "Upload Excel / CSV", "Upload Excel / CSV")}
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
            <p className="be-muted">{translate(lang, "Headers are locked to the uploaded Excel format.", "Headers are locked to the uploaded Excel format.")}</p>
          </div>
          <div className="btw-row-actions">
            <button className="btw-button btw-button-soft" type="button" onClick={addRow}>{translate(lang, "Add Row", "Add Row")}</button>
            <button className="btw-button btw-button-primary" type="button" disabled={busy} onClick={saveBulkLoad}>{busy ? translate(lang, "Saving...", "Saving...") : translate(lang, "Save Bulk Load", "Save Bulk Load")}</button>
          </div>
        </div>
        <div className="be-table-wrap" style={{ marginTop: 14 }}>
          <table className="be-table">
            <thead><tr><th>#</th>{template.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td>{rowIndex + 1}</td>{template.headers.map((header) => <td key={header}><input value={safeCell(row[header])} onChange={(e) => setCell(rowIndex, header, e.target.value)} placeholder={header} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
