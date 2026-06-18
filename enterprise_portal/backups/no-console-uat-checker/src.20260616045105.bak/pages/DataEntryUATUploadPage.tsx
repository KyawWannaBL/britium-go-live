// @ts-nocheck
import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTemplateSchema,
  normalizeUploadPayload,
  parseCsvText,
  validateTemplateRows,
  type TemplateKey,
} from "@/lib/britiumGoLiveTemplateSchemas";

type Props = {
  templateKey?: TemplateKey;
};

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function DataCell({ value }: { value: any }) {
  return <td className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{String(value ?? "") || "-"}</td>;
}

export default function DataEntryUATUploadPage({ templateKey = "data-entry" }: Props) {
  const schema = getTemplateSchema(templateKey);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [message, setMessage] = useState("Upload a real UAT CSV only. Mock/sample/demo rows are blocked before backend submission.");
  const [submitting, setSubmitting] = useState(false);
  const [resultRows, setResultRows] = useState<any[]>([]);

  const validation = useMemo(() => validateTemplateRows(schema, headers, rows), [schema, headers, rows]);

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setResultRows([]);
    try {
      const text = await readFileText(file);
      const parsed = parseCsvText(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMessage(`Loaded ${parsed.rows.length} rows from ${file.name}. Validate before submitting.`);
    } catch (error: any) {
      setHeaders([]);
      setRows([]);
      setMessage(error?.message || "Unable to read file.");
    }
  }

  async function submitRows() {
    if (!rows.length) {
      setMessage("No rows to submit.");
      return;
    }
    if (!validation.isValid) {
      setMessage("Fix validation errors before backend upload.");
      return;
    }

    setSubmitting(true);
    setMessage(`Submitting ${rows.length} rows to ${schema.rpc}...`);
    try {
      const payload = normalizeUploadPayload(schema, rows);
      const { data, error } = await (supabase as any).rpc(schema.rpc, {
        p_rows: payload,
        p_source: "UAT_GO_LIVE_TEMPLATE_UPLOAD",
      });
      if (error) throw error;
      const returnedRows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
      setResultRows(returnedRows);
      setMessage(`Upload completed. Backend returned ${returnedRows.length || rows.length} row result(s).`);
    } catch (error: any) {
      setResultRows([]);
      setMessage(`Backend upload failed or RPC is not deployed yet: ${error?.message || "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setHeaders([]);
    setRows([]);
    setResultRows([]);
    setFileName("");
    setMessage("Upload a real UAT CSV only. Mock/sample/demo rows are blocked before backend submission.");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">UAT Upload</p>
            <h1 className="mt-2 text-4xl font-black">{schema.title}</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">{schema.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={schema.xlsxFile} download className="rounded-2xl bg-blue-700 px-5 py-3 text-xs font-black uppercase text-white">Download XLSX</a>
            <a href={schema.csvFile} download className="rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200">Download CSV</a>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 ring-1 ring-blue-100">{message}</div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:bg-slate-100">
            <span className="text-4xl">⇪</span>
            <span className="mt-3 text-lg font-black">Upload CSV</span>
            <span className="mt-1 text-xs font-bold text-slate-500">{fileName || "Select a header-matched CSV file"}</span>
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Validation</p>
            <p className={`mt-3 text-4xl font-black ${validation.isValid ? "text-emerald-700" : "text-rose-700"}`}>{validation.isValid ? "PASS" : "HOLD"}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">
              Missing headers: {validation.missingHeaders.length}. Row errors: {validation.rowErrors.length}. Rows ready: {rows.length}.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Backend endpoint</p>
            <p className="mt-3 break-all rounded-2xl bg-slate-50 p-3 font-mono text-xs font-bold text-slate-700 ring-1 ring-slate-200">{schema.rpc}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={submitRows} disabled={submitting || !validation.isValid || !rows.length} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit"}
              </button>
              <button type="button" onClick={reset} className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black uppercase text-white">Reset</button>
            </div>
          </div>
        </div>
      </section>

      {validation.missingHeaders.length || validation.rowErrors.length ? (
        <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-black text-rose-700">Validation Errors</h2>
          {validation.missingHeaders.length ? (
            <div className="mt-3 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800 ring-1 ring-rose-100">
              Missing headers: {validation.missingHeaders.join(", ")}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2">
            {validation.rowErrors.slice(0, 50).map((row) => (
              <div key={row.rowNumber} className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                Row {row.rowNumber}: {row.errors.join("; ")}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-black">Preview</h2>
        <p className="mt-1 text-xs font-bold text-slate-500">First 50 rows only. Backend-generated fields must remain blank on upload.</p>
        <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full border-collapse bg-white">
            <thead className="sticky top-0 bg-slate-100">
              <tr>{(headers.length ? headers : schema.headers).slice(0, 20).map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-500">{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length ? rows.slice(0, 50).map((row, index) => (
                <tr key={index}>{(headers.length ? headers : schema.headers).slice(0, 20).map((header) => <DataCell key={header} value={row[header]} />)}</tr>
              )) : (
                <tr><td className="px-4 py-12 text-center text-sm font-bold text-slate-400" colSpan={20}>No uploaded rows.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {resultRows.length ? (
        <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-black">Backend Results</h2>
          <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(resultRows, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
