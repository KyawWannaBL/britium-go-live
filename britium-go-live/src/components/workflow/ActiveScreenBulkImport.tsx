import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  getTemplateSchema,
  normalizeUploadPayload,
  validateTemplateRows,
  type TemplateKey,
} from "@/lib/britiumGoLiveTemplateSchemas";

type Props = {
  module: Extract<TemplateKey, "data-entry" | "warehouse">;
  onImported?: () => void | Promise<void>;
};

const clean = (value: unknown) => String(value ?? "").trim();

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ActiveScreenBulkImport({ module, onImported }: Props) {
  const schema = getTemplateSchema(module);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const validation = useMemo(() => validateTemplateRows(schema, headers, rows), [schema, headers, rows]);
  const issueCount = validation.missingHeaders.length + validation.rowErrors.reduce((total, row) => total + row.errors.length, 0);

  function downloadCsvTemplate() {
    const header = schema.headers
      .map((value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value))
      .join(",");
    downloadBlob(
      schema.csvFile.split("/").pop() || `${module}_template.csv`,
      new Blob([`\uFEFF${header}\r\n`], { type: "text/csv;charset=utf-8" }),
    );
  }

  function downloadXlsxTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([schema.headers]);
    worksheet["!cols"] = schema.headers.map((header) => ({ wch: Math.min(34, Math.max(14, header.length + 3)) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, module === "warehouse" ? "Warehouse Upload" : "Data Entry Upload");
    XLSX.writeFile(workbook, schema.xlsxFile.split("/").pop() || `${module}_template.xlsx`, { compression: true });
  }

  async function selectFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setCompleted(false);

    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an XLSX, XLS, or CSV file.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
      if (!workbook.SheetNames[0]) throw new Error("The workbook has no worksheet.");

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
        header: 1,
        defval: "",
        raw: false,
      });
      const nextHeaders = (matrix[0] || []).map(clean);
      const nextRows = matrix
        .slice(1)
        .filter((row) => row.some((value) => clean(value)))
        .map((values, rowIndex) => {
          const row: Record<string, string> = { __rowNumber: String(rowIndex + 2) };
          nextHeaders.forEach((header, index) => {
            if (header) row[header] = clean(values[index]);
          });
          return row;
        });

      setFilename(file.name);
      setHeaders(nextHeaders);
      setRows(nextRows);
      setOpen(true);
      setMessage(`Loaded ${nextRows.length} rows. Review validation before submitting.`);
    } catch (error: any) {
      setFilename("");
      setHeaders([]);
      setRows([]);
      setMessage(error?.message || "Unable to read the file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function downloadErrors() {
    const errorRows: Array<[string, string]> = [
      ["Row", "Errors"],
      ...validation.rowErrors.map((row) => [row.rowNumber, row.errors.join("; ")] as [string, string]),
    ];
    if (validation.missingHeaders.length) errorRows.splice(1, 0, ["HEADER", `Missing: ${validation.missingHeaders.join(", ")}`]);
    const csv = `\uFEFF${errorRows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
    downloadBlob(`${filename || module}_errors.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }

  async function submit() {
    if (!rows.length || !validation.isValid) return;
    setBusy(true);
    setMessage("");
    setCompleted(false);

    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("Your authenticated session is required. Sign in again and retry.");
      const { error } = await supabase.rpc(schema.rpc, {
        p_rows: normalizeUploadPayload(schema, rows),
        p_source: module === "warehouse" ? "ACTIVE_WAREHOUSE_BULK_UPLOAD" : "ACTIVE_DATA_ENTRY_BULK_UPLOAD",
      });
      if (error) throw error;
      setCompleted(true);
      setMessage(`Upload completed for ${rows.length} rows.`);
      await onImported?.();
    } catch (error: any) {
      setMessage(error?.message || "Bulk upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMessage("");
    setCompleted(false);
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-[#1d4b70] bg-[#0a2034] text-[#eef8ff] shadow-xl">
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-[#f6b84b]/15 p-2 text-[#f6b84b]"><FileSpreadsheet size={20} /></span>
          <div>
            <div className="text-sm font-black">{module === "warehouse" ? "Warehouse Bulk Upload" : "Data Entry Bulk Upload"}</div>
            <div className="text-xs text-[#8db5d1]">XLSX/CSV template, validation preview and authenticated submission</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadXlsxTemplate} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-3 py-2 text-xs font-black text-[#8fd3ff]"><Download size={14} className="mr-1 inline" />XLSX Template</button>
          <button type="button" onClick={downloadCsvTemplate} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-3 py-2 text-xs font-black text-[#8fd3ff]"><Download size={14} className="mr-1 inline" />CSV Template</button>
          <label className="cursor-pointer rounded-lg bg-[#f6b84b] px-3 py-2 text-xs font-black text-[#071521]"><Upload size={14} className="mr-1 inline" />Select XLSX / CSV<input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0])} /></label>
          <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg border border-[#31506a] px-3 py-2 text-xs font-black">{open ? "Hide" : "Show"}</button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-[#1d4b70] p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["File", filename || "None"], ["Rows", rows.length], ["Validation", rows.length ? (validation.isValid ? "READY" : "HOLD") : "WAITING"], ["Issues", issueCount]].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-[#061524] p-3"><div className="text-[10px] font-black uppercase text-[#7899b2]">{label}</div><div className="mt-1 truncate text-sm font-black">{value}</div></div>
            ))}
          </div>
          {message ? <div className="mt-3 rounded-xl border border-[#31506a] bg-[#061524] p-3 text-sm font-bold">{busy ? <Loader2 size={15} className="mr-2 inline animate-spin" /> : null}{message}</div> : null}
          {!validation.isValid && rows.length ? <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle size={15} className="mr-2 inline" />Missing: {validation.missingHeaders.join(", ") || "none"}. {validation.rowErrors.slice(0, 5).map((row) => `Row ${row.rowNumber}: ${row.errors.join("; ")}`).join(" | ")}</div> : null}
          {rows.length ? <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-[#1d4b70]"><table className="min-w-max text-left text-xs"><thead className="sticky top-0 bg-[#12314a]"><tr>{headers.slice(0, 12).map((header) => <th key={header} className="px-3 py-2 font-black">{header}</th>)}</tr></thead><tbody>{rows.slice(0, 12).map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[#1d4b70]">{headers.slice(0, 12).map((header) => <td key={header} className="max-w-52 truncate px-3 py-2">{row[header] || "-"}</td>)}</tr>)}</tbody></table></div> : null}
          {completed ? <div className="mt-3 text-xs font-black text-emerald-400"><CheckCircle2 size={15} className="mr-2 inline" />Backend accepted the batch.</div> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {issueCount ? <button type="button" onClick={downloadErrors} className="rounded-lg border border-rose-500/40 px-4 py-2 text-xs font-black text-rose-300">Download Errors</button> : null}
            <button type="button" onClick={clear} className="rounded-lg border border-[#31506a] px-4 py-2 text-xs font-black"><RefreshCw size={14} className="mr-1 inline" />Clear</button>
            <button type="button" onClick={() => void submit()} disabled={busy || !rows.length || !validation.isValid} className="rounded-lg bg-emerald-500 px-5 py-2 text-xs font-black text-[#061524] disabled:opacity-40">Submit Valid Rows</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
